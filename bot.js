const TelegramBot = require('node-telegram-bot-api');
const axios       = require('axios');
const crypto      = require('crypto');
const zlib        = require('zlib');
const puppeteer   = require('puppeteer');

// Try requiring predictionEngine safely, or use fallback mock if missing
let predictionEngine;
try {
    predictionEngine = require('./predictionEngine');
} catch (e) {
    predictionEngine = {
        predictByLogic: (logicLevel, nums) => ({ prediction: 'SKIP', reason: 'Engine fallback' })
    };
}

// ============================================================
//  CONFIG
// ============================================================
const BOT_TOKEN    = process.env.BOT_TOKEN || "8906099266:AAEwOi1BZqm_HGHTo6aizZD3mw4fwMFhzF8";
const OWNER_ID     = 1865939951;
const OWNER_PASS   = "praveensaran";
const ADMIN_HANDLE = "@lucifer1570";
const REG_LINK     = "https://bdgwinuu.com/#/register?invitationCode=7442815992780";
const WIN_STICKER  = "CAACAgUAAxkBAAFHUGNp4JX1-ohP4uBEWpfNptaz-HmwVgAC4hgAAhboKVbObuGuTcMs2zsE";
const LOSS_STICKER = "CAACAgUAAxkBAAFHUGVp4JX-BE2TRkhIKTwcjkwW-gzdPAACthoAAoG8YVYiydObSa0O8zsE";

const BET_URL     = "https://api.ar-lottery01.com/api/Lottery/WinGoBet";
const LOGIN_URL   = "https://api.bdg88zf.com/api/webapi/Login";
const CAPTCHA_URL = "https://api.bdg88zf.com/api/webapi/GetCaptcha";
const DRAW_URL    = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";

// Martingale multipliers
const MULT = [1, 3, 9, 27, 81, 243, 729, 2187, 6561, 19683];

// ============================================================
//  RENDER KEEP-ALIVE SERVER
// ============================================================
const http = require('http');
const PORT = process.env.PORT || 5000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('SIVA BOT OK');
}).listen(PORT, () => console.log(`âœ… Keep-alive server on port ${PORT}`));

const RENDER_URL = process.env.RENDER_URL || "";
if (RENDER_URL) {
    setInterval(() => {
        axios.get(RENDER_URL).catch(() => {});
        console.log("[PING] Keep-alive ping sent");
    }, 14 * 60 * 1000);
}

// ============================================================
//  STORAGE
// ============================================================
let ownerLoggedIn  = false;
let adminPasswords = {};
let adminLoggedIn  = {};
let usersAccess    = {};
let keyStore       = {};
let stats          = {};
let running        = {};
let sentPeriods    = {};
let ownerState     = null;
let adminState     = {};
let userAction     = {}; 
let userCreds      = {};
let autobetCfg     = {};
let autobetState   = {};
let profitTrack    = {};
let GLOBAL_TOKEN   = "";
let userTokens     = {}; 
let userStates     = {};

// ============================================================
//  TELEGRAM BOT INSTANCE (Polling)
// ============================================================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

async function send(chatId, text, options = {}) {
    try {
        return await bot.sendMessage(chatId, text, options);
    } catch (e) {
        console.error("[SEND ERR]", e.message);
    }
}

async function sendSticker(chatId, stickerId) {
    try {
        return await bot.sendSticker(chatId, stickerId);
    } catch (e) {
        // Ignore sticker errors
    }
}

// ============================================================
//  LOGGING HELPER
// ============================================================
async function logBoth(chatId, msg, isError = false) {
    if (isError) console.error(msg);
    else console.log(msg);
    if (chatId && bot) {
        try {
            await bot.sendMessage(chatId, msg);
        } catch (e) {
            // Ignore loops
        }
    }
}

// ============================================================
//  HELPERS
// ============================================================
async function fetchList() {
    try {
        const response = await axios.get(DRAW_URL, {
            headers: {
                "Accept": "application/json, text/plain, */*",
                "Origin": "https://bdgwin901.com",
                "Referer": "https://bdgwin901.com/",
                "Ar-Origin": "https://bdgwin901.com",
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"
            },
            timeout: 10000
        });
        if (response.data && response.data.data && response.data.data.list) {
            return response.data.data.list;
        }
        return [];
    } catch (error) {
        console.error("[FETCH LIST ERROR]", error.message);
        return null;
    }
}

async function parseBalanceResponse(r) {
    if (r.data && r.data.code === 0 && r.data.data && typeof r.data.data.balance !== 'undefined') {
        return { success: true, balance: r.data.data.balance };
    }
    return {
        success: false,
        message: r.data && r.data.msg ? r.data.msg : "Token expired or invalid"
    };
}

async function getLiveBalance(userId, chatId = null) {
    let token = getToken(userId);
    if (!token && chatId) {
        const ok = await autoLogin(userId, chatId, true);
        if (ok) token = getToken(userId);
    }
    if (!token) return { success: false, message: "No token" };

    const url = "https://api.bdg88zf.com/api/webapi/GetBalance";
    const headers = {
        "Authorization": "Bearer " + token,
        "Ar-Origin": "https://bdgwin901.com",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36"
    };

    try {
        const r = await axios.get(url, { headers, timeout: 5000 });
        return await parseBalanceResponse(r);
    } catch (e) {
        if (e.response && e.response.status === 405) {
            try {
                const r2 = await axios.post(url, {}, { headers, timeout: 5000 });
                return await parseBalanceResponse(r2);
            } catch (e2) {
                const errMsg = e2.response?.data?.msg || e2.message || "API Error";
                return { success: false, message: errMsg };
            }
        }
        const errMsg = e.response?.data?.msg || e.message || "API Error";
        return { success: false, message: errMsg };
    }
}

function initUser(id) {
    if (!stats[id])        stats[id]        = { total:0, win:0, loss:0, lossStreak:0, winStreak:0, maxWinStreak:0, maxLossStreak:0 };
    if (!userStates[id])   userStates[id]   = { resultHistory:[], skipCount:0, currentMode:null, lastPrediction:null };
    if (!sentPeriods[id])  sentPeriods[id]  = new Set();
    if (!autobetCfg[id])   autobetCfg[id]   = { 
        watch: false, 
        watchLoss: 2, 
        baseBet: 1, 
        maxLvl: 10, 
        enabled: false, 
        customBets: [1, 3, 9, 27, 81, 243, 729, 2187, 6561, 19683],
        targetProfit: 1000,
        restartDelay: 1
    };
    if (!autobetState[id]) autobetState[id] = { 
        level: 1, 
        consecutiveLoss: 0,
        watchConsecutiveLoss: 0,
        inMart: false,
        isWaiting: false,
        nextStartTime: null
    };
    if (!profitTrack[id])  profitTrack[id]  = { totalBets: 0, wins: 0, losses: 0, pnl: 0, winStreak: 0, lossStreak: 0, maxW: 0, maxL: 0, totalBetAmount: 0 };
}

function hasAccess(id) {
    if (Number(id) === Number(OWNER_ID)) return true;
    if (running[id] === true) return true;
    const expiry = usersAccess[id];
    return !!(expiry && Date.now() < expiry);
}

function daysLeft(id) {
    if (Number(id) === Number(OWNER_ID)) return "âˆž";
    if (running[id] === true) return "RUN";
    const expiry = usersAccess[id];
    if (!expiry) return "0";
    const left = (expiry - Date.now()) / 86400000;
    return left > 0 ? left.toFixed(1) : "0";
}

function isAdmin(id)   { return adminPasswords[id] !== undefined; }
function isAdminIn(id) { return adminLoggedIn[id] === true; }
function sleep(ms)     { return new Promise(r => setTimeout(r, ms)); }
function getToken(id)  { return userTokens[id] || GLOBAL_TOKEN || ""; }

function generateKey(days, by) {
    const k = "EARN WITH ME-" + crypto.randomBytes(3).toString('hex').toUpperCase() + "-" + crypto.randomBytes(2).toString('hex').toUpperCase();
    keyStore[k] = { days, used: false, usedBy: null, by: by || OWNER_ID };
    return k;
}

function activateKey(userId, code) {
    const k = code.toUpperCase().trim();
    if (!keyStore[k])     return { ok: false, msg: "âŒ Invalid key!" };
    if (keyStore[k].used) return { ok: false, msg: "âŒ Key already used!" };

    const days = Number(keyStore[k].days) || 1;
    const currentExpiry = usersAccess[userId];
    const base = (currentExpiry && currentExpiry > Date.now()) ? currentExpiry : Date.now();
    const newExpiry = base + days * 86400000;

    keyStore[k].used = true;
    keyStore[k].usedBy = userId;
    usersAccess[userId] = newExpiry;
    return { ok: true, days, expiry: new Date(newExpiry).toLocaleString() };
}

function activeUsersList() {
    const now = Date.now();
    const ids = new Set(Object.keys(usersAccess));
    Object.keys(running).forEach(id => { if (running[id]) ids.add(id); });

    const list = [...ids].filter(id => Number(id) === Number(OWNER_ID) || running[id] || Number(usersAccess[id]) > now);
    if (!list.length) return "No active users.";

    return list.map(id => {
        if (Number(id) === Number(OWNER_ID)) return "ðŸŸ¢ " + id + " | â™¾ï¸ Unlimited";
        if (running[id]) return "ðŸŸ¢ " + id + " | âš¡ Running";
        const expiry = Number(usersAccess[id]) || 0;
        return "ðŸŸ¢ " + id + " | " + ((expiry - now) / 86400000).toFixed(1) + "d";
    }).join("\n");
}

function adminList() {
    const ids = Object.keys(adminPasswords);
    return ids.length ? ids.map(id => "ðŸ‘¤ " + id + " | " + (adminLoggedIn[id] ? "ðŸŸ¢ Online" : "ðŸ”´ Offline")).join("\n") : "No admins.";
}

function allKeysList() {
    const keys = Object.entries(keyStore);
    return keys.length ? keys.map(([k, v]) => k + " â†’ " + (v.used ? "âœ… Used" : "ðŸŸ¢ " + v.days + "d")).join("\n") : "No keys.";
}

// ============================================================
//  SIGNATURES
// ============================================================
function makeBetSign(params) {
    const p = {...params};
    delete p.signature; delete p.timestamp;
    const keys = Object.keys(p).filter(k => p[k] !== null && p[k] !== "").sort();
    const sorted = {};
    keys.forEach(k => { sorted[k] = p[k] === 0 ? 0 : p[k]; });
    return crypto.createHash('md5').update(JSON.stringify(sorted)).digest('hex').toUpperCase().slice(0, 32);
}

// ============================================================
//  AUTO LOGIN (PUPPETEER)
// ============================================================
async function autoLogin(userId, chatId, silent = false) {
    const creds = userCreds[userId] || {};
    const { phone, pass } = creds;

    if (!phone || !pass) {
        await logBoth(chatId, `[AUTO LOGIN] User ${userId} has no phone or password set.`);
        return false;
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process', '--disable-gpu']
        });
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(90000); 
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        let capturedToken = null;
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.url().includes('GetBalance') && req.headers()['authorization']) {
                capturedToken = req.headers()['authorization'].replace(/^Bearer\s+/i, "");
            }
            req.continue();
        });

        await page.goto('https://bdgwin901.com/#/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForSelector('input', { timeout: 30000 });
        const inputs = await page.$$('input');
        if (inputs.length < 2) throw new Error("Login inputs not found");

        await inputs[0].type(phone, { delay: 50 });
        await inputs[1].type(pass, { delay: 50 });
        
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const loginBtn = btns.find(b => b.innerText.includes('Log in') || b.innerText.includes('Login'));
            if (loginBtn) loginBtn.click();
            else document.querySelector('form')?.submit();
        });

        try {
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 5000));

        await page.evaluate(() => {
            const closeBtn = document.querySelector('.van-icon-cross') || document.querySelector('.close-icon');
            if (closeBtn) closeBtn.click();
        });
        await new Promise(r => setTimeout(r, 1000));

        await page.evaluate(() => {
            const navItems = Array.from(document.querySelectorAll('div, span'));
            const lotteryBtn = navItems.find(el => el.innerText.trim() === 'Lottery');
            if (lotteryBtn) lotteryBtn.click();
        });
        await new Promise(r => setTimeout(r, 2000));

        await page.evaluate(() => {
            const navItems = Array.from(document.querySelectorAll('div, span'));
            const winGoBtn = navItems.find(el => el.innerText.trim() === 'Win Go');
            if (winGoBtn) winGoBtn.click();
        });

        for (let i = 0; i < 50; i++) {
            if (capturedToken) break;
            await new Promise(r => setTimeout(r, 1000));
        }

        if (capturedToken) {
            userTokens[userId] = capturedToken;
            await logBoth(chatId, `âœ… [SUCCESS] Token captured successfully for user ${userId}!`);
            return true;
        } else {
            throw new Error("Token not found in requests after login sequence.");
        }

    } catch (err) {
        await logBoth(chatId, `âŒ Login Error for user ${userId}: ${err.message}`, true);
        return false;
    } finally {
        if (browser) await browser.close();
    }
}

// ============================================================
//  PLACE BET
// ============================================================
async function placeBet(userId, chatId, period, prediction, predType, level) {
    let token = getToken(userId);
    if (!token || token.length < 20) {
        console.log("[PLACE BET] Token missing or invalid, attempting autoLogin...");
        const ok = await autoLogin(userId, chatId, true);
        if (!ok) { 
            await send(chatId, "âŒ Token à®‡à®²à¯à®²à¯ˆ! Auto-login à®¤à¯‹à®²à¯à®µà®¿à®¯à®Ÿà¯ˆà®¨à¯à®¤à®¤à¯."); 
            return false; 
        }
        token = getToken(userId);
    }

    const cfg       = autobetCfg[userId];
    const betMult   = cfg.customBets[level-1] || (cfg.baseBet * MULT[level-1]);
    let bc = "";

    const maxRetries = 3; 
    const retryDelayMs = 2000; 

    if (predType === "SIZE")  bc = prediction === "BIG" ? "BigSmall_Big" : "BigSmall_Small";
    if (predType === "COLOR") bc = prediction === "RED" ? "Color_Red"    : "Color_Green";

    console.log(`[BET] ${bc} â‚¹${betMult} L${level} for Period: ${period}`);

    for (let i = 0; i < maxRetries; i++) {
        try {
            const params = {
                amount:      1,
                betContent:  bc,
                betMultiple: betMult,
                gameCode:    "WinGo_30S", 
                issueNumber: String(period),
                language:    "en",
                random:      Math.floor(Math.random() * 1e12)
            };
            const signature = makeBetSign(params);
            const timestamp = Math.floor(Date.now() / 1000);
            const payload   = {...params, signature, timestamp};

            const r = await axios.post(BET_URL, payload, {
                headers: {
                    "authorization":    "Bearer " + token,
                    "content-type":     "application/json",
                    "Accept":           "application/json, text/plain, */*",
                    "Origin":           "https://bdgwin8.vip",
                    "Referer":          "https://bdgwin8.vip/",
                    "Ar-Origin":        "https://bdgwin901.com",
                    "User-Agent":       "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"
                },
                timeout: 10000
            });

            const d = r.data;
            console.log(`[BET RESP] code:${d.code} msg:${d.msg}`);

            const newTokenFromResponseHeader = r.headers['authorization'] || r.headers['x-auth-token'];
            if (newTokenFromResponseHeader) {
                const cleanNewToken = newTokenFromResponseHeader.replace(/^Bearer\s+/i, "");
                if (cleanNewToken !== token) {
                    userTokens[userId] = cleanNewToken;
                    token = cleanNewToken;
                    console.log("[TOKEN UPDATE] New token captured from bet response headers!");
                }
            }

            if (d.code === 0 || d.msg === "Succeed" || d.msgCode === 0) {
                return { ok: true, amt: betMult, bc };
            }

            if (d.code === 401 || d.code === 40100 || (d.msg && (d.msg.toLowerCase().includes("token") || d.msg.toLowerCase().includes("expired")))) {
                console.log("[AUTO RELOGIN] Token expired during bet. Trying autoLogin...");
                const loginSuccess = await autoLogin(userId, chatId, true);
                if (loginSuccess) {
                    token = getToken(userId);
                    console.log("[AUTO RELOGIN] Success! Retrying the bet with new token...");
                    continue; 
                } else {
                    await send(chatId, "âŒ Auto-login failed during token expiry.");
                    return false;
                }
            }

            const retryableErrors = ["param is invalid", "the issue number does not exist", "period current settled"];
            const lowerMsg = (d.msg || "").toLowerCase();
            
            if (retryableErrors.some(errStr => lowerMsg.includes(errStr))) {
                console.log(`[BET RETRY] Retryable error: ${d.msg}. Retrying in ${retryDelayMs / 1000}s... (Attempt ${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                continue; 
            }

            await send(chatId, "âŒ Bet fail: " + (d.msg || JSON.stringify(d).substr(0, 60)));
            return false;

        } catch (err) {
            console.error("[BET ERR]", err.message);

            if (err.response && (err.response.status === 401 || (err.response.data && err.response.data.msg && (err.response.data.msg.toLowerCase().includes("token") || err.response.data.msg.toLowerCase().includes("expired"))))) {
                console.log("[AUTO RELOGIN] Token error caught via exception. Trying autoLogin...");
                const loginSuccess = await autoLogin(userId, chatId, true);
                if (loginSuccess) {
                    token = getToken(userId);
                    continue; 
                } else {
                    await send(chatId, "âŒ Auto-login failed during token error.");
                    return false;
                }
            }

            if (i < maxRetries - 1) {
                console.log(`[BET RETRY] Network error. Retrying in ${retryDelayMs / 1000}s... (Attempt ${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                continue;
            }

            await send(chatId, "âŒ Network error during bet: " + err.message);
            return false;
        }
    }

    console.log("[BET FAIL] All retries exhausted.");
    return false;
}

// ============================================================
//  ANALYSIS & PREDICTION ENGINE
// ============================================================
function buildBSFromList(list, count) {
    const recent = list.slice(0, Math.min(count, list.length));
    const seq = [];
    for (const item of recent) {
        const n = parseInt(item.number || item.winNumber || 0);
        if (!isNaN(n)) {
            seq.push(n >= 5 ? "B" : "S");
        }
    }
    return seq.reverse();
}

function buildNumberList(list, count) {
    const recent = list.slice(0, Math.min(count, list.length));
    const nums = [];
    for (const item of recent) {
        const n = parseInt(item.number || item.winNumber || 0);
        if (!isNaN(n)) nums.push(n);
    }
    return nums;
}

function classifyNumber(number) {
    if (number >= 0 && number <= 4) return 'Small';
    if (number >= 5 && number <= 9) return 'Big';
    return 'Invalid';
}

class ResultAnalyzer {
    constructor() {
        this.results = [];
        this.analysis = null;
        this.prediction = null;
    }

    setResults(results) {
        if (!Array.isArray(results) || results.length < 10) {
            console.error('âŒ Need at least 10 results');
            return false;
        }
        this.results = results.slice(0, 10);
        this.analyze();
        this.predict();
        return true;
    }

    getCategoryDetails(number) {
        const category = this.classifyNumber(number);
        const icon = category === 'Small' ? 'â¬‡ï¸' : 'â¬†ï¸';
        const range = category === 'Small' ? '0-4' : '5-9';
        const color = category === 'Small' ? '#4ECDC4' : '#FF6B6B';
        return { category, icon, range, color };
    }

    classifyNumber(number) {
        return classifyNumber(number);
    }

    appearsInArray(value, array) {
        return array.includes(value);
    }

    detectDoubleViolet(sequence) {
        const positions = [];
        for (let i = 0; i < sequence.length - 1; i++) {
            if ((sequence[i] === 0 && sequence[i + 1] === 0) ||
                (sequence[i] === 5 && sequence[i + 1] === 5)) {
                positions.push({
                    number: sequence[i],
                    position: i,
                    next: sequence[i + 1]
                });
            }
        }
        return {
            found: positions.length > 0,
            positions,
            count: positions.length
        };
    }

    analyze() {
        if (!this.results || this.results.length === 0) return;
        const current = this.results[0];
        const previous9 = this.results.slice(1);
        const appearedBefore = this.appearsInArray(current, previous9);
        const doubleViolet = this.detectDoubleViolet(this.results);

        const frequency = {};
        const categories = {};
        let bigCount = 0;
        let smallCount = 0;

        this.results.forEach((num) => {
            frequency[num] = (frequency[num] || 0) + 1;
            const category = this.classifyNumber(num);
            categories[num] = category;
            if (category === 'Big') bigCount++;
            else if (category === 'Small') smallCount++;
        });

        const patterns = this.detectPatterns(this.results);

        this.analysis = {
            current: {
                value: current,
                category: this.classifyNumber(current),
                details: this.getCategoryDetails(current),
                appearedBefore: appearedBefore,
                timesAppeared: frequency[current] || 0
            },
            previous9,
            doubleViolet,
            frequency,
            categories,
            statistics: {
                total: this.results.length,
                big: bigCount,
                small: smallCount,
                bigPercentage: ((bigCount / this.results.length) * 100).toFixed(1),
                smallPercentage: ((smallCount / this.results.length) * 100).toFixed(1)
            },
            patterns,
            allResults: this.results
        };
    }

    detectPatterns(sequence) {
        const patterns = {
            consecutive: [],
            repeating: [],
            alternating: false,
            increasing: false,
            decreasing: false
        };

        for (let i = 0; i < sequence.length - 1; i++) {
            if (Math.abs(sequence[i] - sequence[i + 1]) === 1) {
                patterns.consecutive.push({
                    pair: [sequence[i], sequence[i + 1]],
                    position: i
                });
            }
        }

        for (let i = 0; i < sequence.length - 2; i++) {
            if (sequence[i] === sequence[i + 1] && sequence[i] === sequence[i + 2]) {
                patterns.repeating.push({
                    number: sequence[i],
                    position: i,
                    count: 3
                });
            }
        }

        let alternatingCount = 0;
        for (let i = 0; i < sequence.length - 1; i++) {
            const cat1 = this.classifyNumber(sequence[i]);
            const cat2 = this.classifyNumber(sequence[i + 1]);
            if (cat1 !== cat2) alternatingCount++;
        }
        patterns.alternating = alternatingCount >= sequence.length - 2;

        let increasing = true;
        let decreasing = true;
        for (let i = 0; i < sequence.length - 1; i++) {
            if (sequence[i] >= sequence[i + 1]) decreasing = false;
            if (sequence[i] <= sequence[i + 1]) increasing = false;
        }
        patterns.increasing = increasing;
        patterns.decreasing = decreasing;

        return patterns;
    }

    predict() {
        if (!this.analysis) return;
        const current = this.analysis.current;
        const appearedBefore = current.appearedBefore;
        const doubleViolet = this.analysis.doubleViolet;
        const stats = this.analysis.statistics;
        const patterns = this.analysis.patterns;

        const oppositeCategory = current.category === 'Big' ? 'Small' : 'Big';

        let prediction = {
            strategy: '',
            confidence: 0,
            recommendedNumbers: [],
            reasoning: []
        };

        if (appearedBefore) {
            prediction.strategy = 'Current appeared before - predicting opposite';
            prediction.reasoning.push(`Number ${current.value} appeared ${current.timesAppeared} times in last 10 results`);
            prediction.confidence = 65;
        } else {
            prediction.strategy = 'New number - predicting opposite for diversification';
            prediction.reasoning.push(`Number ${current.value} is new in recent history`);
            prediction.confidence = 60;
        }

        if (doubleViolet.found) {
            prediction.reasoning.push(`âš ï¸ DOUBLE VIOLET DETECTED! ${doubleViolet.count} occurrence(s)`);
            prediction.confidence += 10;
        }

        if (patterns.alternating) {
            prediction.reasoning.push('ðŸ”„ Alternating pattern detected');
            prediction.confidence += 5;
        }

        const dominantCategory = stats.big > stats.small ? 'Big' : 'Small';
        if (dominantCategory === oppositeCategory) {
            prediction.reasoning.push(`ðŸ“Š ${oppositeCategory} is currently dominant in history`);
            prediction.confidence += 5;
        }

        const numberScores = {};
        for (let i = 0; i <= 9; i++) {
            const category = this.classifyNumber(i);
            const frequency = this.analysis.frequency[i] || 0;
            const isOpposite = category === oppositeCategory;
            let score = isOpposite ? 10 : 0;
            score += (10 - frequency * 2);
            score += Math.random() * 2;
            numberScores[i] = score;
        }

        const sortedNumbers = Object.entries(numberScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(entry => parseInt(entry[0]));

        prediction.recommendedNumbers = sortedNumbers;
        prediction.confidence = Math.min(100, Math.round(prediction.confidence));
        this.prediction = prediction;
    }
}

function decidePrediction(list) {
    if (!list || list.length < 10) return null;
    const numbers = buildNumberList(list, 10);
    if (numbers.length < 10) return null;

    const analyzer = new ResultAnalyzer();
    if (!analyzer.setResults(numbers)) return null;

    const currentCategory = analyzer.analysis.current.category;
    const predictionValue = currentCategory === 'Big' ? 'SMALL' : 'BIG';
    const history = numbers.slice(0, 4).map(n => n >= 5 ? 'B' : 'S').join('');

    return {
        type: 'SIZE',
        val: predictionValue,
        mode: currentCategory,
        history: history,
        analysis: analyzer.analysis,
        predictionDetails: analyzer.prediction
    };
}

// ============================================================
//  UPDATE & RESULT HANDLERS
// ============================================================
function updateAfterResult(userId, wasWin, actualSize, betPlaced, skipOnly = false) {
    initUser(userId);
    const state = userStates[userId];
    const st = autobetState[userId];
    const cfg = autobetCfg[userId];

    const bs = (actualSize === "BIG" || actualSize === "B") ? "B" : "S";
    state.resultHistory.push(bs);
    if (state.resultHistory.length > 20) state.resultHistory.shift();

    if (!betPlaced) {
        if (skipOnly) return;
        if (cfg.watch) {
            if (wasWin) {
                st.watchConsecutiveLoss = 0;
                st.level = 1;
            } else {
                st.watchConsecutiveLoss++;
                if (st.watchConsecutiveLoss >= cfg.watchLoss) {
                    st.inMart = true;
                    st.level = 1;
                    st.consecutiveLoss = 0;
                }
            }
        }
        return;
    }

    if (wasWin) {
        st.consecutiveLoss = 0;
        st.level = 1;
        st.inMart = false;
        st.watchConsecutiveLoss = 0;
    } else {
        st.consecutiveLoss++;
        st.inMart = true;
        st.level++;

        if (st.level > cfg.maxLvl) {
            st.level = 1;
            st.consecutiveLoss = 0;
            st.inMart = false;
        }

        if (st.consecutiveLoss === 3 || st.consecutiveLoss === 5 || st.consecutiveLoss === 7) {
            state.skipCount = Math.max(state.skipCount, st.consecutiveLoss);
        }
    }
}

async function handleWin(userId, chatId, actual, num, betLevel) {
    initUser(userId);
    const pt = profitTrack[userId];
    const cfg = autobetCfg[userId];
    const amt = cfg.customBets[betLevel-1] || (cfg.baseBet * MULT[betLevel-1]);
    const profit = amt * 0.98;
    
    pt.totalBets++; pt.wins++; pt.pnl += profit; 
    pt.totalBetAmount = (pt.totalBetAmount || 0) + amt;
    pt.winStreak++; pt.lossStreak = 0;
    if(pt.winStreak > pt.maxW) pt.maxW = pt.winStreak;

    await send(chatId,
"â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n"+
"â•‘  âœ… WIN! ðŸŽ‰              â•‘\n"+
"â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£\n"+
"â•‘ Number : "+num+"\n"+
"â•‘ Result : "+actual+"\n"+
"â•‘ Profit : +â‚¹"+profit.toFixed(2)+"\n"+
"â•‘ P&L    : "+(pt.pnl>=0?"+":"")+pt.pnl.toFixed(2)+"\n"+
"â•‘ Streak : "+pt.winStreak+" wins\n"+
"â•‘ Total  : "+pt.wins+"W/"+pt.losses+"L\n"+
"â•‘ Reset  : L1 | Watch 0/"+cfg.watchLoss+"\n"+
"â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•"
    );
    await sendSticker(chatId, WIN_STICKER);
}

async function handleLoss(userId, chatId, actual, num, betLevel) {
    initUser(userId);
    const st = autobetState[userId];
    const pt = profitTrack[userId];
    const cfg = autobetCfg[userId];
    const amt = cfg.customBets[betLevel-1] || (cfg.baseBet * MULT[betLevel-1]);
    
    pt.totalBets++; pt.losses++; pt.pnl -= amt; 
    pt.totalBetAmount = (pt.totalBetAmount || 0) + amt;
    pt.lossStreak++; pt.winStreak = 0;
    if(pt.lossStreak > pt.maxL) pt.maxL = pt.lossStreak;

    if(betLevel < cfg.maxLvl){
        const next = cfg.customBets[st.level-1] || (cfg.baseBet * MULT[st.level-1]);
        await send(chatId,
"â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n"+
"â•‘  âŒ LOSS                 â•‘\n"+
"â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£\n"+
"â•‘ Number : "+num+"\n"+
"â•‘ Result : "+actual+"\n"+
"â•‘ Loss   : -â‚¹"+amt+"\n"+
"â•‘ P&L    : "+(pt.pnl>=0?"+":"")+pt.pnl.toFixed(2)+"\n"+
"â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£\n"+
"â•‘ Next L"+st.level+" : â‚¹"+next+"\n"+
"â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•"
        );
    } else {
        await send(chatId,
"â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n"+
"â•‘  ðŸ’€ MAX LEVEL LOSS       â•‘\n"+
"â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£\n"+
"â•‘ Loss   : -â‚¹"+amt+"\n"+
"â•‘ P&L    : "+(pt.pnl>=0?"+":"")+pt.pnl.toFixed(2)+"\n"+
"â•‘ Reset  : L1 | Watch 0/"+cfg.watchLoss+"\n"+
"â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•"
        );
    }
    await sendSticker(chatId, LOSS_STICKER);
}

// ============================================================
//  PREDICT LOOP
// ============================================================
async function runPredict(userId, chatId) {
    if(!running[userId]) return;
    initUser(userId);
    const state = userStates[userId];
    const st = autobetState[userId];
    const cfg = autobetCfg[userId];

    if (st.isWaiting) {
        if (Date.now() >= st.nextStartTime) {
            st.isWaiting = false;
            profitTrack[userId].pnl = 0; 
            await send(chatId, "ðŸ”„ Timed Restart! Starting new section...");
        } else {
            return setTimeout(() => runPredict(userId, chatId), 30000);
        }
    }

    const list = await fetchList();
    if(!list || list.length === 0) return setTimeout(() => runPredict(userId, chatId), 15000);

    const next = (BigInt(list[0].issueNumber) + 1n).toString();
    if(sentPeriods[userId].has(next)) return setTimeout(() => runPredict(userId, chatId), 2000);
    sentPeriods[userId].add(next);

    const signal = decidePrediction(list);
    if(!signal) return setTimeout(() => runPredict(userId, chatId), 5000);

    let loseStreakSkip = false;
    try {
        const numbers = buildNumberList(list, 10);
        if (numbers && numbers.length === 10 && signal.type === 'SIZE') {
            const numsOldestFirst = numbers.slice().reverse();
            const logicLevel = (st.consecutiveLoss % 10) + 1;
            const lsRes = predictionEngine.predictByLogic(logicLevel, numsOldestFirst);
            signal.loseStreak = { logicLevel, prediction: lsRes.prediction, reason: lsRes.reason };
            if (lsRes.prediction === 'SKIP') {
                loseStreakSkip = true;
            } else {
                signal.val = lsRes.prediction;
            }
        }
    } catch (e) {}

    let abLine = "ðŸ¤– AutoBet: OFF";
    let canBet = false;
    let skippedCycle = false;

    if (!cfg.enabled) {
        abLine = "ðŸ¤– AutoBet: OFF";
        canBet = false;
    } else if (state.skipCount > 0) {
        abLine = `â­ï¸ SKIP BET (${state.skipCount} left)`;
        skippedCycle = true;
        state.skipCount--;
        canBet = false;
    } else if (cfg.watch && st.watchConsecutiveLoss < cfg.watchLoss) {
        abLine = `ðŸ‘€ WATCHING: ${st.watchConsecutiveLoss}/${cfg.watchLoss}`;
        canBet = false;
    } else {
        canBet = true;
        const curBet = cfg.customBets[st.level-1] || (cfg.baseBet * MULT[st.level-1]);
        abLine = (st.level > 1 ? "ðŸ“ˆ MART " : "ðŸ’° BET ") + "L" + st.level + ": â‚¹" + curBet;
    }

    if (loseStreakSkip) {
        canBet = false;
        skippedCycle = true;
        const ll = signal.loseStreak && signal.loseStreak.logicLevel ? signal.loseStreak.logicLevel : '?';
        abLine = `â­ï¸ LOSE-STREAK SKIP (L${ll})`;
    }

    await send(chatId,
"â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n"+
"â•‘   ðŸ‘‘ EARN WITH ME AI    â•‘\n"+
"â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£\n"+
"â•‘ Period  : "+next.slice(-6)+"\n"+
"â•‘ Signal  : "+(signal.val==="BIG"?"ðŸ”µ BIG":"ðŸŸ  SMALL")+"\n"+
"â•‘ Pattern : "+(signal.history || "N/A")+"\n"+
"â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£\n"+
"â•‘ "+abLine+"\n"+
"â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•",
        {reply_markup:{inline_keyboard:[[{text:"ðŸ’° CHECK NOW",url:REG_LINK}]]}}
    );

    let betPlaced = false;
    if (canBet) { 
        const result = await placeBet(userId, chatId, next, signal.val, signal.type, st.level);
        if (result && result.ok) {
            betPlaced = true;
            await send(chatId, "âœ… Bet Success! â‚¹" + result.amt + " L" + st.level + "\nâ³ Checking result...");
        } else if (result && !result.ok) {
            await send(chatId, "âŒ Bet Failed: " + (result.msg || "Unknown error"));
        }
    }

    checkResult(userId, chatId, next, signal.val, signal.type, betPlaced, skippedCycle);
}

// ============================================================
//  RESULT CHECKER
// ============================================================
async function checkResult(userId, chatId, target, predicted, predType, betPlaced, skipOnly = false) {
    let tries = 0;
    const cfg = autobetCfg[userId];
    const st = autobetState[userId];
    const pt = profitTrack[userId];
    
    const iv = setInterval(async () => {
        if (!running[userId]) return clearInterval(iv);
        if (++tries > 25) {
            clearInterval(iv);
            await logBoth(chatId, "â± Timeout â€” checking next period...");
            setTimeout(() => { if (running[userId]) runPredict(userId, chatId); }, 3000);
            return;
        }
        const list = await fetchList(); if (!list) return;
        if (BigInt(list[0].issueNumber) < BigInt(target)) return;
        clearInterval(iv);

        const res = list.find(i => i.issueNumber === target) || list[0];
        const num = parseInt(res.number || res.winNumber || 0);
        let actual;
        if (predType === "SIZE") actual = num >= 5 ? "BIG" : "SMALL";
        else actual = num === 0 ? "RED" : num === 5 ? "GREEN" : num % 2 === 0 ? "RED" : "GREEN";
        
        const win = predicted === actual;
        const betLevel = st.level;

        updateAfterResult(userId, win, actual, betPlaced, skipOnly);

        const s = stats[userId];
        s.total++;
        if (win) {
            s.win++; s.winStreak++; s.lossStreak = 0;
            if (s.winStreak > s.maxWinStreak) s.maxWinStreak = s.winStreak;
        } else {
            s.loss++; s.lossStreak++; s.winStreak = 0;
            if (s.lossStreak > s.maxLossStreak) s.maxLossStreak = s.lossStreak;
        }

        if (betPlaced) {
            if (win) await handleWin(userId, chatId, actual, num, betLevel);
            else await handleLoss(userId, chatId, actual, num, betLevel);

            const targetProfit = Number(cfg.targetProfit) || 1000;
            if (pt.pnl >= targetProfit) {
                st.isWaiting = true;
                st.nextStartTime = Date.now() + (Number(cfg.restartDelay) || 1) * 60 * 1000;
                await send(chatId, "ðŸŽ¯ TARGET REACHED! Bot Paused.");
            }
        } else {
            if (win) {
                await send(chatId, 
                    "â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n"+
                    "â•‘  ðŸ‘€ WATCH RESULT: WIN! âœ… â•‘\n"+
                    "â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£\n"+
                    "â•‘ Number : "+num+"\n"+
                    "â•‘ Result : "+actual+"\n"+
                    "â•‘ Status : Correct Prediction\n"+
                    "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•"
                );
                await sendSticker(chatId, WIN_STICKER);
            } else {
                await send(chatId, 
                    "â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n"+
                    "â•‘  ðŸ‘€ WATCH RESULT: LOSS âŒ â•‘\n"+
                    "â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£\n"+
                    "â•‘ Number : "+num+"\n"+
                    "â•‘ Result : "+actual+"\n"+
                    "â•‘ Status : Incorrect Prediction\n"+
                    "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•"
                );
                await sendSticker(chatId, LOSS_STICKER);
            }
        }

        setTimeout(() => { if (running[userId]) runPredict(userId, chatId); }, 8000);
    }, 10000);
}

// ============================================================
//  STATS & REPORTS
// ============================================================
function showStats(chatId, userId) {
    initUser(userId);
    const d = stats[userId], rate = d.total ? ((d.win / d.total) * 100).toFixed(1) : "0.0";
    const bar = "ðŸŸ¦".repeat(d.total ? Math.round(d.win / d.total * 10) : 0) + "â¬œ".repeat(d.total ? 10 - Math.round(d.win / d.total * 10) : 10);
    send(chatId, "ðŸ“Š STATS\n\nTotal: " + d.total + "\nWins: " + d.win + "\nLosses: " + d.loss + "\nAcc: " + rate + "%\n" + bar + "\n\nBest Win: " + d.maxWinStreak + " streak\nWorst Loss: " + d.maxLossStreak + " streak");
}

async function profitReport(chatId, userId) {
    initUser(userId);
    const pt = profitTrack[userId], cfg = autobetCfg[userId];
    const rate = pt.totalBets ? ((pt.wins / pt.totalBets) * 100).toFixed(1) : "0.0";
    const amounts = cfg.customBets.slice(0, cfg.maxLvl);
    let balance = "âŒ No token";
    const balResult = await getLiveBalance(userId);
    if(balResult.success) {
        balance = "â‚¹" + balResult.balance;
    } else if (balResult.message) {
        balance = "âš ï¸ " + balResult.message;
    }
    send(chatId,
"ðŸ’° PROFIT REPORT\n\n"+
"Balance: "+balance+"\n"+
"Bets   : "+pt.totalBets+"\nWins   : "+pt.wins+"\nLoss   : "+pt.losses+"\nRate   : "+rate+"%\n"+
"P&L    : "+(pt.pnl>=0?"+":"")+pt.pnl.toFixed(2)+"\n"+
"Best W : "+pt.maxW+" | Worst L: "+pt.maxL+"\n\n"+
"Mart: â‚¹"+amounts.join("â†’â‚¹")
    );
}

async function autobetStatus(chatId, userId) {
    initUser(userId);
    const cfg = autobetCfg[userId], st = autobetState[userId], pt = profitTrack[userId];
    const amounts = cfg.customBets.slice(0, cfg.maxLvl);
    const creds = userCreds[userId] || {};

    let liveBal = "âŒ No token";
    let token = getToken(userId);
    const hasToken = token && token.length > 20;
    if (hasToken) {
        const result = await getLiveBalance(userId);
        if (result.success) {
            liveBal = "â‚¹" + result.balance;
        } else {
            liveBal = "âš ï¸ " + result.message;
        }
    } else if (creds.phone) {
        liveBal = "âŒ Login Required";
    }

    let waitLine = "";
    if (st.isWaiting) {
        const diff = Math.round((st.nextStartTime - Date.now()) / 60000);
        waitLine = "\nâ³ Waiting: " + diff + " mins to restart";
    }

    send(chatId,
"ðŸ¤– AUTOBET STATUS\n\n"+
"ðŸ’° Live Balance: "+liveBal+"\n"+
"Enabled  : "+(cfg.enabled?"âœ… ON":"âŒ OFF")+"\n"+
"Token    : "+(token.length>20?"âœ…":"âŒ")+"\n"+
"AutoLogin: "+(creds.phone?"âœ… "+creds.phone.slice(0,6)+"***":"âŒ")+"\n"+
"Watch    : "+(cfg.watch?"ON":"OFF")+"\n"+
"WatchLoss: "+st.watchConsecutiveLoss+"/"+cfg.watchLoss+"\n"+
"Base Bet : â‚¹"+cfg.baseBet+"\n"+
"Max Level: "+cfg.maxLvl+"\n"+
"Target Profit: â‚¹"+cfg.targetProfit+"\n"+
"Section Delay: "+cfg.restartDelay+" mins"+
waitLine+"\n"+
"In Mart  : "+(st.inMart?"YES":"NO")+"\n"+
"P&L      : "+(pt.pnl>=0?"+":"")+pt.pnl.toFixed(2)+"\n\n"+
"Mart: â‚¹"+amounts.join("â†’â‚¹")
    );
}

// ============================================================
//  KEYBOARDS & MENUS
// ============================================================
function userMenu(id) {
    const rows = [["â–¶ï¸ Start Prediction", "ðŸ›‘ Stop"], ["ðŸ“Š Stats", "ðŸ’° Profit", "ðŸ“© Contact"], ["ðŸ¤– AutoBet Setup", "ðŸ”‘ My Token"]];
    if (isAdmin(id)) rows.push(["ðŸ‘‘ Admin Panel"]);
    return { keyboard: rows, resize_keyboard: true };
}

const ownerMenu     = { keyboard: [["ðŸ‘¥ All Users", "ðŸ‘® All Admins"], ["ðŸ‘¤ Add Admin", "ðŸ—‘ Remove Admin"], ["ðŸ”‘ Generate Key", "ðŸ“‹ All Keys"], ["ðŸŸ¢ Add User", "ðŸ”´ Remove User"], ["ðŸ” Set Token", "ðŸ“Š All Status"], ["ðŸšª Owner Logout"]], resize_keyboard: true };
const adminMenu     = { keyboard: [["ðŸ‘¥ Active Users", "ðŸ”‘ Generate Key"], ["ðŸŸ¢ Add User", "ðŸ”´ Remove User"], ["ðŸ“‹ All Keys", "ðŸšª Admin Logout"]], resize_keyboard: true };
const autobetMenu   = { keyboard: [
    ["âœ… Enable AutoBet", "âŒ Disable AutoBet"],
    ["ðŸ‘€ Watch Mode ON", "ðŸ‘€ Watch Mode OFF"],
    ["ðŸ’° Set Base Bet", "ðŸ“ˆ Set Max Level"],
    ["ðŸŽ¯ Set Profit Target", "â³ Set Section Delay"],
    ["ðŸ”¢ Set Watch Losses", "ðŸ“Š AutoBet Status"],
    ["ðŸ“ Set Custom Bets", "ðŸ”™ Back"]
], resize_keyboard: true };

// ============================================================
//  BOT MESSAGE HANDLER
// ============================================================
bot.on('message', async (msg) => {
    if (!msg.text) return;
    const chatId = msg.chat.id;
    const id = msg.from.id;
    const text = msg.text.trim();

    initUser(id);

    // /start command
    if (text === "/start" || text === "ðŸ”™ Back") {
        return send(id, "ðŸ‘‹ Welcome to Earn With Me AI Bot!", { reply_markup: userMenu(id) });
    }

    // Owner Login
    if (text.startsWith("/ownerlogin")) {
        const pass = text.split(" ")[1];
        if (pass === OWNER_PASS || Number(id) === Number(OWNER_ID)) {
            ownerLoggedIn = true;
            return send(id, "ðŸ‘‘ Welcome Owner!", { reply_markup: ownerMenu });
        }
        return send(id, "âŒ Incorrect password!");
    }

    // Admin Login
    if (text.startsWith("/adminlogin")) {
        const pass = text.split(" ")[1];
        if (adminPasswords[id] && adminPasswords[id] === pass) {
            adminLoggedIn[id] = true;
            return send(id, "ðŸ‘® Admin logged in successfully!", { reply_markup: adminMenu });
        }
        return send(id, "âŒ Incorrect admin password!");
    }

    // Set Credentials (/setcreds phone password)
    if (text.startsWith("/setcreds")) {
        const parts = text.split(/\s+/);
        if (parts.length < 3) return send(id, "âŒ Format: /setcreds PHONE PASSWORD");
        userCreds[id] = { phone: parts[1], pass: parts[2] };
        return send(id, "âœ… Credentials saved successfully! You can now use AutoBet.");
    }

    // Set Token (/setmytoken token)
    if (text.startsWith("/setmytoken")) {
        const parts = text.split(/\s+/);
        if (parts.length < 2) return send(id, "âŒ Format: /setmytoken TOKEN");
        userTokens[id] = parts[1].trim();
        return send(id, "âœ… Token saved successfully!");
    }

    // Activate Key (/activate KEY)
    if (text.startsWith("/activate")) {
        const parts = text.split(/\s+/);
        if (parts.length < 2) return send(id, "âŒ Format: /activate KEY");
        const res = activateKey(id, parts[1]);
        if (res.ok) {
            return send(id, `ðŸŽ‰ Key activated successfully! Added ${res.days} days.\nExpiry: ${res.expiry}`, { reply_markup: userMenu(id) });
        }
        return send(id, res.msg);
    }

    // Test Login (/login)
    if (text === "/login") {
        send(id, "ðŸ”„ Testing auto-login...");
        const ok = await autoLogin(id, chatId, false);
        if (ok) send(id, "âœ… Login & Token capture successful!");
        else send(id, "âŒ Login failed. Check your phone & password with /setcreds.");
        return;
    }

    // Owner Panel Handlers
    if (Number(id) === Number(OWNER_ID) && ownerLoggedIn) {
        if (text === "ðŸ‘¥ All Users") return send(OWNER_ID, "ðŸ‘¥ All Users:\n\n" + activeUsersList());
        if (text === "ðŸ”‘ Generate Key") {
            ownerState = "genkey";
            return send(OWNER_ID, "Enter days for key (e.g. 30):");
        }
        if (ownerState === "genkey") {
            const days = parseInt(text);
            if (isNaN(days) || days < 1) return send(OWNER_ID, "âŒ Invalid days!");
            const k = generateKey(days, OWNER_ID);
            ownerState = null;
            return send(OWNER_ID, `ðŸ”‘ Generated Key:\n\n${k}\n\nDays: ${days}`, { reply_markup: ownerMenu });
        }
        if (text === "ðŸšª Owner Logout") {
            ownerLoggedIn = false;
            return send(OWNER_ID, "ðŸ”’ Logged out.", { reply_markup: userMenu(id) });
        }
    }

    // Admin Panel Handlers
    if (isAdmin(id) && isAdminIn(id) && adminState[id]) {
        const s = adminState[id];
        if (text === "ðŸ”™ Back") { delete adminState[id]; return send(id, "Admin Menu", { reply_markup: adminMenu }); }
        else if (s.action === "genkey") {
            const d = parseInt(text);
            if (isNaN(d) || d < 1) return send(id, "âŒ Days?");
            const k = generateKey(d, id);
            delete adminState[id];
            return send(id, "ðŸ”‘ Key:\n\n" + k + "\n\n" + d + "d", { reply_markup: adminMenu });
        }
        else if (s.action === "adduser") {
            if (!s.step2) {
                const t = parseInt(text);
                if (isNaN(t)) return send(id, "âŒ Invalid User ID");
                adminState[id] = { action: "adduser", step2: true, tid: t };
                return send(id, "ID: " + t + "\nEnter access days:");
            } else {
                const d = parseInt(text);
                if (isNaN(d) || d < 1) return send(id, "âŒ Invalid days");
                usersAccess[s.tid] = Date.now() + d * 86400000;
                delete adminState[id];
                send(id, `âœ… Added ${s.tid} for ${d}d`, { reply_markup: adminMenu });
                send(s.tid, `ðŸŽŠ ACCESS GRANTED! ${d} days added.`);
                return;
            }
        }
        else if (s.action === "removeuser") {
            const t = parseInt(text);
            if (isNaN(t)) return;
            if (Number(t) === Number(OWNER_ID)) return send(id, "âŒ Owner access cannot be removed.", { reply_markup: adminMenu });
            const was = hasAccess(t);
            delete usersAccess[t];
            running[t] = false;
            delete adminState[id];
            send(id, was ? "ðŸš« Removed" : "âš ï¸ Not active", { reply_markup: adminMenu });
            if (was) send(t, "ðŸ”´ Your access has been removed.");
            return;
        }
    }

    // User Settings Action Handler
    if (hasAccess(id) && userAction[id]) {
        const s = userAction[id];
        if (text === "ðŸ”™ Back") { 
            delete userAction[id]; 
            return send(id, "AutoBet Setup", { reply_markup: autobetMenu }); 
        }
        else if (s.action === "setbase") {
            const v = parseInt(text);
            if (isNaN(v) || v < 1) return send(id, "âŒ Invalid Amount! Min â‚¹1.");
            autobetCfg[id].baseBet = v;
            delete userAction[id];
            const a = MULT.slice(0, autobetCfg[id].maxLvl).map(m => v * m);
            return send(id, "âœ… Base Bet Updated: â‚¹" + v + "\nMartingale: â‚¹" + a.join("â†’â‚¹"), { reply_markup: autobetMenu });
        }
        else if (s.action === "setlvl") {
            const v = parseInt(text);
            if (isNaN(v) || v < 1 || v > 10) return send(id, "âŒ Invalid Level! Enter 1-10.");
            autobetCfg[id].maxLvl = v;
            delete userAction[id];
            const a = MULT.slice(0, v).map(m => autobetCfg[id].baseBet * m);
            return send(id, "âœ… Max Level Updated: L" + v + "\nMartingale: â‚¹" + a.join("â†’â‚¹"), { reply_markup: autobetMenu });
        }
        else if (s.action === "setwloss") {
            const v = parseInt(text);
            if (isNaN(v) || v < 0) return send(id, "âŒ Invalid Number!");
            autobetCfg[id].watchLoss = v;
            delete userAction[id];
            return send(id, "âœ… Watch Loss Updated: " + v, { reply_markup: autobetMenu });
        }
        else if (s.action === "settarget") {
            const v = Number(text);
            if (!Number.isFinite(v) || v < 10) return send(id, "âŒ Min â‚¹10 kudunga!");
            autobetCfg[id].targetProfit = v;
            delete userAction[id];
            return send(id, "âœ… Profit target set to â‚¹" + v, { reply_markup: autobetMenu });
        }
        else if (s.action === "setdelay") {
            const v = parseInt(text);
            if (isNaN(v) || v < 1) return send(id, "âŒ Invalid minutes!");
            autobetCfg[id].restartDelay = v;
            delete userAction[id];
            return send(id, "âœ… Section delay set to " + v + " minutes", { reply_markup: autobetMenu });
        }
        else if (s.action === "setcustom") {
            const vals = text.split(/[, ]+/).map(v => parseInt(v.trim())).filter(v => !isNaN(v) && v > 0);
            if (vals.length === 0) return send(id, "âŒ Format error! Use: 1,4,7,9");
            autobetCfg[id].customBets = vals;
            autobetCfg[id].maxLvl = vals.length;
            delete userAction[id];
            return send(id, "âœ… Custom Bets Updated!\nLevels: " + vals.length + "\nSequence: â‚¹" + vals.join(" â†’ â‚¹"), { reply_markup: autobetMenu });
        }
    }

    // Admin Quick Menu Triggers
    if (isAdmin(id) && isAdminIn(id)) {
        if (text === "ðŸ‘¥ Active Users") return send(id, "ðŸ‘¥ Active Users:\n\n" + activeUsersList());
        if (text === "ðŸ”‘ Generate Key") { adminState[id] = { action: "genkey" }; return send(id, "Days?"); }
        if (text === "ðŸŸ¢ Add User")     { adminState[id] = { action: "adduser" }; return send(id, "User ID?"); }
        if (text === "ðŸ”´ Remove User")  { adminState[id] = { action: "removeuser" }; return send(id, "User ID?"); }
        if (text === "ðŸ“‹ All Keys")     return send(id, "ðŸ“‹ Keys:\n\n" + allKeysList());
        if (text === "ðŸšª Admin Logout") { adminLoggedIn[id] = false; return send(id, "ðŸ”’ Logged out.", { reply_markup: userMenu(id) }); }
    }

    if (text === "ðŸ‘‘ Admin Panel" && isAdmin(id)) {
        if (!isAdminIn(id)) return send(id, "Login:\n/adminlogin YOUR_PASS");
        return send(id, "ðŸ‘‘ Admin Panel", { reply_markup: adminMenu });
    }

    // User Panel & AutoBet Menu Commands
    if (text === "ðŸ¤– AutoBet Setup") {
        if (!hasAccess(id)) return send(id, "âŒ No access.");
        const cfg = autobetCfg[id], creds = userCreds[id] || {};
        const amounts = MULT.slice(0, cfg.maxLvl).map(m => cfg.baseBet * m);
        const targetProfit = Number(cfg.targetProfit) || 1000;
        return send(id,
"ðŸ¤– AUTOBET SETTINGS\n\n"+
"Status   : "+(cfg.enabled?"âœ… ON":"âŒ OFF")+"\n"+
"Token    : "+(getToken(id).length>20?"âœ… SET":"âŒ MISSING")+"\n"+
"AutoLogin: "+(creds.phone?"âœ… "+creds.phone.slice(0,6)+"***":"âŒ /setcreds")+"\n"+
"Watch    : "+(cfg.watch?"ON":"OFF")+"\n"+
"WatchLoss: "+cfg.watchLoss+" consecutive\n"+
"Base Bet : â‚¹"+cfg.baseBet+"\n"+
"Max Level: "+cfg.maxLvl+"\n"+
"Target   : â‚¹"+targetProfit+"\n\n"+
"Mart: â‚¹"+amounts.join("â†’â‚¹")+"\n\n"+
"/setcreds PHONE PASSWORD\n"+
"/setmytoken TOKEN",
        { reply_markup: autobetMenu });
    }

    if (text === "âœ… Enable AutoBet") {
        const creds = userCreds[id] || {};
        if (!getToken(id) && !creds.phone) return send(id, "âŒ /setcreds PHONE PASSWORD\nor /setmytoken TOKEN");
        autobetCfg[id].enabled = true;
        if (!getToken(id) && creds.phone) {
            send(id, "ðŸ”„ Auto login...");
            const ok = await autoLogin(id, chatId, true);
            if (ok) send(id, "âœ… AutoBet ON!\nâ‚¹" + autobetCfg[id].baseBet, { reply_markup: userMenu(id) });
            else send(id, "âš ï¸ Login fail. /setcreds check pannunga.", { reply_markup: autobetMenu });
        } else {
            send(id, "âœ… AutoBet ON!\nâ‚¹" + autobetCfg[id].baseBet, { reply_markup: userMenu(id) });
        }
        return;
    }

    if (text === "âŒ Disable AutoBet") { autobetCfg[id].enabled = false; return send(id, "âŒ AutoBet OFF", { reply_markup: userMenu(id) }); }
    if (text === "ðŸ‘€ Watch Mode ON")  { autobetCfg[id].watch = true; return send(id, "ðŸ‘€ Watch ON â€” " + autobetCfg[id].watchLoss + " losses â†’ bet", { reply_markup: autobetMenu }); }
    if (text === "ðŸ‘€ Watch Mode OFF") { autobetCfg[id].watch = false; return send(id, "ðŸ‘€ Watch OFF â€” Direct bet!", { reply_markup: autobetMenu }); }
    
    if (text === "ðŸ’° Set Base Bet")      { userAction[id] = { action: "setbase" }; return send(id, "Enter base bet amount (e.g. 1):"); }
    if (text === "ðŸ“ˆ Set Max Level")     { userAction[id] = { action: "setlvl" }; return send(id, "Enter max level (1-10):"); }
    if (text === "ðŸŽ¯ Set Profit Target") { userAction[id] = { action: "settarget" }; return send(id, "Enter target profit (Min â‚¹10):"); }
    if (text === "â³ Set Section Delay") { userAction[id] = { action: "setdelay" }; return send(id, "Enter restart delay in MINUTES (e.g. 30):"); }
    if (text === "ðŸ”¢ Set Watch Losses")  { userAction[id] = { action: "setwloss" }; return send(id, "Enter watch loss count (e.g. 3):"); }
    if (text === "ðŸ“ Set Custom Bets")   { userAction[id] = { action: "setcustom" }; return send(id, "ðŸ“ Enter Custom Bet Sequence (e.g. 1,4,7,9):"); }

    if (text === "ðŸ“Š AutoBet Status")    return await autobetStatus(chatId, id);
    if (text === "ðŸ”™ Back")              return await send(id, "Main Menu", { reply_markup: userMenu(id) });

    if (text === "ðŸ”‘ My Token") {
        const tok = getToken(id), creds = userCreds[id] || {};
        return send(id, "Token: " + (tok.length > 20 ? "âœ… ... " + tok.slice(-12) : "âŒ") + "\nLogin: " + (creds.phone ? "âœ… " + creds.phone.slice(0, 6) + "***" : "âŒ") + "\n\n/setcreds PHONE PASSWORD\n/setmytoken TOKEN\n/login â€” Test");
    }

    if (text === "â–¶ï¸ Start Prediction") {
        if (!hasAccess(id)) return send(chatId, "âŒ No access!\nðŸ“© " + ADMIN_HANDLE + "\nID: " + id);
        if (running[id]) return send(chatId, "âš ï¸ Already running!");

        running[id] = true; 
        sentPeriods[id] = new Set();
        autobetState[id] = { level: 1, consecutiveLoss: 0, inMart: false };

        const prevList = await fetchList();
        initState(id);

        if (prevList && prevList.length >= 4) {
            userStates[id].resultHistory = buildBSFromList(prevList, 15);
            await send(chatId, "ðŸ“‹ Loaded history: " + (userStates[id].resultHistory || []).join(''));
        }

        const cfg = autobetCfg[id];
        await send(chatId,
"ðŸš€ ENGINE ON!\n\nAutoBet: "+(cfg.enabled?"âœ… ON":"âŒ OFF")+"\nWatch  : "+(cfg.watch?"ON ("+cfg.watchLoss+"L)":"OFF")+"\nBase   : â‚¹"+cfg.baseBet+" | MaxLvl: "+cfg.maxLvl
        );
        runPredict(id, chatId);
    }

    if (text === "ðŸ›‘ Stop")   { running[id] = false; return send(chatId, "ðŸ›‘ Stopped."); }
    if (text === "ðŸ“Š Stats")  { return showStats(chatId, id); }
    if (text === "ðŸ’° Profit") { return profitReport(chatId, id); }
    if (text === "ðŸ“© Contact") { return send(chatId, "ðŸ“© " + ADMIN_HANDLE + "\nID: " + id); }
});

console.log("ðŸ¤– Telegram Bot script loaded successfully and waiting for messages...");
