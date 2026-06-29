console.log('✅ نسخه نهایی – با پشتیبانی از ادامه‌دهی بین فایل‌ها');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Papa = require('papaparse');

// ====================== تنظیمات لاگ ======================
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, 'backtest.log');

function log(msg, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${msg}`;
    console.log(line);
    try {
        fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
    } catch (e) {
        console.error('❌ نمی‌توان در فایل لاگ نوشت:', e.message);
    }
}

// ====================== آرگومان‌های ورودی ======================
const argv = process.argv.slice(2);
const getArg = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : null;
};

const strategyFile = getArg('--strategy-file');
const startIndex = parseInt(getArg('--start-index') || '0');
const chunkSize  = parseInt(getArg('--chunk-size') || '50');
const dataDir    = getArg('--data-dir') || path.join(process.cwd(), 'data');
const maxContinuationFiles = parseInt(getArg('--max-continuation') || '3');

log(`شروع run-backtest.js با آرگومان‌ها: strategyFile=${strategyFile}, startIndex=${startIndex}, chunkSize=${chunkSize}, dataDir=${dataDir}, maxContinuation=${maxContinuationFiles}`);

if (!strategyFile || !fs.existsSync(strategyFile)) {
    log('فایل استراتژی وجود ندارد.', 'ERROR');
    process.exit(0);
}

const strategyName = path.basename(strategyFile, '.js');
const strategyCode = fs.readFileSync(strategyFile, 'utf8');
log(`استراتژی ${strategyName} با طول ${strategyCode.length} کاراکتر خوانده شد.`);

// ====================== بارگذاری ماژول‌های اصلی ======================
const corePath = path.join(__dirname, 'backtest-core.js');
const divPath = path.join(__dirname, 'divergence-detector.js');
if (!fs.existsSync(corePath)) {
    log('backtest-core.js پیدا نشد.', 'ERROR');
    process.exit(1);
}
const backtestCore = require(corePath);
let divergenceDetector = null;
if (fs.existsSync(divPath)) divergenceDetector = require(divPath);
else log('divergence-detector.js یافت نشد.', 'WARN');

// ====================== استخراج ANALYSIS_CONFIG ======================
log('در حال استخراج ANALYSIS_CONFIG از استراتژی...');
function extractAnalysisConfig(code) {
    try {
        const fn = new Function(`
            ${code}
            if (typeof ANALYSIS_CONFIG === 'undefined') {
                throw new Error('ANALYSIS_CONFIG not found');
            }
            return ANALYSIS_CONFIG;
        `);
        const config = fn();
        if (!config || typeof config !== 'object') {
            throw new Error('ANALYSIS_CONFIG is not an object');
        }
        return config;
    } catch (err) {
        log('❌ خطا در استخراج ANALYSIS_CONFIG: ' + err.message, 'ERROR');
        throw err;
    }
}

let analysisConfig;
try {
    analysisConfig = extractAnalysisConfig(strategyCode);
    log('✅ ANALYSIS_CONFIG با موفقیت بارگذاری شد:\n' + JSON.stringify(analysisConfig, null, 2));
} catch (err) {
    log('❌ استخراج ANALYSIS_CONFIG ناموفق بود. برنامه متوقف می‌شود.', 'CRITICAL');
    process.exit(1);
}

// ====================== تشخیص نیازمندی‌ها ======================
const needsTrendLines = /getTrendLines/.test(strategyCode);
const needsIchimoku = /ichimokuParam/.test(strategyCode);
log(`نیازمندی‌ها: trendLines=${needsTrendLines}, ichimoku=${needsIchimoku}`);

if (needsTrendLines && !analysisConfig.trendLines) {
    log('❌ استراتژی به خطوط روند نیاز دارد اما ANALYSIS_CONFIG.trendLines تنظیم نشده است.', 'ERROR');
    process.exit(1);
}
if (needsIchimoku && !analysisConfig.ichimoku) {
    log('❌ استراتژی به ایچیموکو نیاز دارد اما ANALYSIS_CONFIG.ichimoku تنظیم نشده است.', 'ERROR');
    process.exit(1);
}

// ====================== انتخاب فایل‌ها بر اساس رنج ======================
function getFileNamesByRange(dataDir, startIndex, count) {
    const allFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv'));
    const dated = allFiles.map(f => {
        const m = f.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.csv$/);
        return { file: f, date: m ? m[1] : null };
    }).filter(x => x.date !== null);
    dated.sort((a, b) => a.date.localeCompare(b.date));
    if (startIndex >= dated.length) {
        log(`ایندکس ${startIndex} خارج از محدوده است. تعداد فایل‌ها: ${dated.length}`);
        return [];
    }
    return dated.slice(startIndex, startIndex + count).map(x => x.file);
}

const fileNames = getFileNamesByRange(dataDir, startIndex, chunkSize);
if (fileNames.length === 0) {
    log('هیچ فایلی برای پردازش یافت نشد. خروج.');
    process.exit(0);
}
log(`این چانک شامل ${fileNames.length} فایل است: ${fileNames.join(', ')}`);

// ====================== خواندن فایل CSV ======================
function loadSingleFile(dataDir, fileName) {
    const filePath = path.join(dataDir, fileName);
    if (!fs.existsSync(filePath)) {
        log(`❌ فایل ${fileName} یافت نشد.`, 'ERROR');
        process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = Papa.parse(content, { header: true, dynamicTyping: true, skipEmptyLines: true });
    const allData = [];
    for (const row of parsed.data) {
        if (row.timestamp && row.open && row.high && row.low && row.close) {
            allData.push({
                timestamp: new Date(row.timestamp),
                open: +row.open, high: +row.high, low: +row.low, close: +row.close,
                volume: row.volume ? +row.volume : 0
            });
        }
    }
    log(`فایل ${fileName} با ${allData.length} کندل بارگذاری شد.`);
    return allData;
}

// ====================== تابع رمزنگاری نتایج ======================
function encryptResults(outputDir, password) {
    const tarPath = outputDir + '.tar.gz';
    const encPath = path.join(outputDir, 'results.enc');
    const { execSync } = require('child_process');
    execSync(`tar -czf "${tarPath}" -C "${path.dirname(outputDir)}" "${path.basename(outputDir)}"`);
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const input = fs.readFileSync(tarPath);
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
    fs.writeFileSync(encPath, Buffer.concat([iv, encrypted]));
    fs.unlinkSync(tarPath);
    const files = fs.readdirSync(outputDir);
    for (const file of files) {
        if (file !== 'results.enc') {
            const fp = path.join(outputDir, file);
            fs.statSync(fp).isDirectory() ? fs.rmSync(fp, { recursive: true, force: true }) : fs.unlinkSync(fp);
        }
    }
}

// ====================== تابع ریسمپل OHLC ======================
function resampleOHLC(candles, targetMinutes) {
    if (!candles || candles.length === 0) return candles;
    if (targetMinutes === 5) return candles;

    const bucketMs = targetMinutes * 60 * 1000;
    const buckets = new Map();

    for (const c of candles) {
        const ts = c.timestamp instanceof Date ? c.timestamp.getTime() : c.timestamp;
        const bucketKey = Math.floor(ts / bucketMs) * bucketMs;

        if (!buckets.has(bucketKey)) {
            buckets.set(bucketKey, {
                timestamp: new Date(bucketKey),
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close
            });
        } else {
            const b = buckets.get(bucketKey);
            b.high = Math.max(b.high, c.high);
            b.low = Math.min(b.low, c.low);
            b.close = c.close;
        }
    }

    return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}

const safeToFixed = (v, d=2) => {
    try { const n = Number(v); return isNaN(n)||!isFinite(n) ? '0'.padStart(d+1,'0') : n.toFixed(d); }
    catch { return '0'.padStart(d+1,'0'); }
};
const safeParse = (v, def=0) => {
    try { const n = parseFloat(v); return isNaN(n) ? def : n; } catch { return def; }
};

// ====================== اجرای اصلی ======================
(async () => {
    const resultsPassword = process.env.RESULTS_PASSWORD || 'Amir1362Amir';
    log('شروع فاز تحلیل و بک‌تست...');

    // ذخیره strategyCode در 1.json برای هر تایم‌فریم
    const tfLabels = ['5m', '15m', '30m', '1h'];
    for (const tfLabel of tfLabels) {
        const stratDir = path.join(process.cwd(), 'results', `${strategyName}_${tfLabel}`);
        fs.mkdirSync(stratDir, { recursive: true });
        fs.writeFileSync(path.join(stratDir, '1.json'), strategyCode, 'utf8');
    }

    for (let fileIdx = 0; fileIdx < fileNames.length; fileIdx++) {
        const fileName = fileNames[fileIdx];
        log(`شروع پردازش فایل ${fileIdx + 1} از ${fileNames.length}: ${fileName}`);

        try {
            const marketData = loadSingleFile(dataDir, fileName);
            if (marketData.length === 0) {
                log(`⚠️ فایل ${fileName} خالی است. رد شد.`, 'WARN');
                continue;
            }

            // ---- بارگذاری فایل‌های بعدی برای سیستم ادامه‌دهی ----
            const nextFiles = {};
            const nextFileNames = fileNames.slice(fileIdx + 1, fileIdx + 1 + maxContinuationFiles);
            for (const nextName of nextFileNames) {
                log(`📂 بارگذاری فایل بعدی برای ادامه: ${nextName}`);
                const nextData = loadSingleFile(dataDir, nextName);
                if (nextData.length > 0) {
                    nextFiles[nextName] = {
                        fileName: nextName,
                        data: nextData
                    };
                }
            }
            log(`✅ ${Object.keys(nextFiles).length} فایل بعدی برای ادامه‌دهی آماده شد.`);

            // ---- خطوط روند ----
            // اصلاح باگ: قبلاً اینجا یک‌بار با marketData خام (۵ دقیقه‌ای) محاسبه می‌شد
            // و همان نتیجه (با startIndex/endIndex بر اساس کندل‌های ۵ دقیقه‌ای) برای تمام
            // تایم‌فریم‌های ۱۵m/۳۰m/۱h هم استفاده می‌شد. چون tfData ریسمپل‌شده اندیس‌های کاملاً
            // متفاوتی دارد، این باعث می‌شد خطوط روند روی تایم‌فریم‌های بالاتر به کندل‌های
            // نامرتبط اشاره کنند. الان محاسبه به داخل حلقه‌ی تایم‌فریم منتقل شده و برای هر
            // tfData به‌صورت مجزا انجام می‌شود.
            if (!needsTrendLines) {
                log('خطوط روند مورد نیاز نیست.');
            }

            // ---- واگرایی ----
            let divergenceSignals = [];
            if (divergenceDetector) {
                log('🟡 در حال تشخیص واگرایی (RSI و MACD)...');
                const rsi = divergenceDetector.runDivergenceDetection({ marketData, indicator: 'RSI', sendMessage: ()=>{} });
                const macd = divergenceDetector.runDivergenceDetection({ marketData, indicator: 'MACD', sendMessage: ()=>{} });
                divergenceSignals = [...rsi, ...macd];
                log(`✅ ${divergenceSignals.length} سیگنال واگرایی یافت شد.`);
            }

            // ---- تنظیمات ایچیموکو ----
            const ichimokuSettings = needsIchimoku ? analysisConfig.ichimoku : null;
            log(`تنظیمات ایچیموکو: ${JSON.stringify(ichimokuSettings)}`);

            // ---- حلقه روی تایم‌فریم‌ها ----
            const timeframes = [
                { label: '5m',  minutes: 5  },
                { label: '15m', minutes: 15 },
                { label: '30m', minutes: 30 },
                { label: '1h',  minutes: 60 }
            ];

            for (const tf of timeframes) {
                const tfLabel = tf.label;
                const outputDir = path.join(process.cwd(), 'results', `${strategyName}_${tfLabel}`, fileName);

                if (fs.existsSync(path.join(outputDir, 'results.enc'))) {
                    log(`⏩ فایل ${fileName} برای تایم‌فریم ${tfLabel} قبلاً انجام شده است.`);
                    continue;
                }

                const tfData = tf.minutes === 5 ? marketData : resampleOHLC(marketData, tf.minutes);
                log(`🚀 فراخوانی runBacktest برای تایم‌فریم ${tfLabel} (${tfData.length} کندل)...`);

                // ---- تشخیص خطوط روند مخصوص همین تایم‌فریم ----
                // اصلاح باگ: محاسبه روی tfData (داده‌ی همین تایم‌فریم) انجام می‌شود،
                // نه روی marketData خام ۵ دقیقه‌ای، تا اندیس‌های خط روند با اندیس کندل‌های
                // واقعی این بک‌تست مطابقت داشته باشند.
                let trendLines = { primaryUp: [], primaryDown: [] };
                if (needsTrendLines) {
                    log(`🟡 در حال تشخیص خطوط روند برای تایم‌فریم ${tfLabel}...`);
                    try {
                        const trendRes = await backtestCore.detectTrendLinesAdvanced(tfData, analysisConfig.trendLines);
                        if (trendRes.error) {
                            log(`❌ خطا در تشخیص خطوط روند (${tfLabel}): ` + trendRes.error, 'ERROR');
                            process.exit(1);
                        }
                        trendLines = trendRes.trendLines;
                        log(`✅ ${trendRes.statistics.totalLines} خط روند برای ${tfLabel} یافت شد.`);
                    } catch (err) {
                        log(`❌ استثناء در تشخیص خطوط روند (${tfLabel}): ` + err.message, 'ERROR');
                        process.exit(1);
                    }
                }

                const result = await backtestCore.runBacktest(tfData, {
                    code: strategyCode,
                    initialCapital: 10000,
                    riskPerTrade: 2,
                    maxDailyLoss: 5,
                    commission: 0.05,
                    ichimoku: ichimokuSettings,
                    trendLines,
                    breakPoints: {},
                    divergenceSignals,
                    uploadedFiles: tf.minutes === 5 ? nextFiles : {},
                    combinedFiles: {},
                    fileName: fileName,
                    enableContinuation: tf.minutes === 5,
                    maxContinuationFiles: maxContinuationFiles,
                    handleGaps: true,
                    useStagedStopLoss: true,
                    timezoneOffset: 0,
                    fiveMinData: tf.minutes !== 5 ? marketData : null
                });

                log(`بک‌تست ${tfLabel} پایان یافت. تعداد معاملات: ${result.trades ? result.trades.length : 0}`);
                log(`سرمایه نهایی: ${safeToFixed(result.finalCapital, 2)}`);


                // ---- ذخیره نتایج ----
                fs.mkdirSync(outputDir, { recursive: true });

                const trades = result.trades || [];
                const finalCapital = safeParse(result.finalCapital, 0);
                const initialCapital = 10000;
                const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
                const profitable = trades.filter(t => t.profit > 0);
                const losing = trades.filter(t => t.profit < 0);
                const winRate = trades.length ? (profitable.length / trades.length) * 100 : 0;
                let best = null, worst = null;
                if (trades.length) {
                    const sorted = [...trades].sort((a,b) => (b.profitPercent||0) - (a.profitPercent||0));
                    best = sorted[0]; worst = sorted[sorted.length-1];
                }
                const avgProfitLoss = trades.length ? trades.reduce((s,t) => s + safeParse(t.profitPercent), 0) / trades.length : 0;
                const distMap = {};
                trades.forEach(t => { const p = safeParse(t.profitPercent); const k = p>=0 ? `+${p.toFixed(4)}%` : `${p.toFixed(4)}%`; distMap[k] = (distMap[k]||0)+1; });
                const distribution = Object.entries(distMap).map(([k,v]) => ({ "درصد_دقیق": k, "تعداد_معاملات": v })).sort((a,b) => b.تعداد_معاملات - a.تعداد_معاملات);
                const tpTrades = trades.filter(t => t.exitReason?.includes('Take Profit'));
                const trailTrades = trades.filter(t => t.exitReason?.includes('Trailing') || t.isTrailingStop);
                const slTrades = trades.filter(t => t.exitReason?.includes('Stop Loss') && !t.isTrailingStop);
                const eobTrades = trades.filter(t => t.exitReason?.includes('End of backtest'));
                const avgTP = tpTrades.length ? tpTrades.reduce((s,t) => s + safeParse(t.profitPercent), 0) / tpTrades.length : 0;
                const totalTP = tpTrades.reduce((s,t) => s + safeParse(t.profitPercent), 0);
                const profTrail = trailTrades.filter(t => t.profit > 0);
                const avgTrail = profTrail.length ? profTrail.reduce((s,t) => s + safeParse(t.profitPercent), 0) / profTrail.length : 0;
                const totalTrail = trailTrades.reduce((s,t) => s + safeParse(t.profitPercent), 0);
                const losingSl = slTrades.filter(t => t.profit < 0);
                const avgSl = losingSl.length ? losingSl.reduce((s,t) => s + Math.abs(safeParse(t.profitPercent)), 0) / losingSl.length : 0;
                const totalSl = slTrades.reduce((s,t) => s + safeParse(t.profitPercent), 0);
                let maxDrawdown = 0;
                if (result.equityData?.length) {
                    let peak = result.equityData[0].equity;
                    for (const d of result.equityData) {
                        if (d.equity > peak) peak = d.equity;
                        const dd = ((peak - d.equity) / peak) * 100;
                        if (dd > maxDrawdown) maxDrawdown = dd;
                    }
                }
                let maxConsec=0, cur=0;
                trades.forEach(t => { if (t.profit < 0) { cur++; if (cur>maxConsec) maxConsec=cur; } else cur=0; });
                const totalProfit = profitable.reduce((s,t) => s + t.profit, 0);
                const totalLoss = Math.abs(losing.reduce((s,t) => s + t.profit, 0));
                const profitFactor = totalLoss ? totalProfit / totalLoss : 0;
                const avgWin = profitable.length ? profitable.reduce((s,t) => s + Math.abs(safeParse(t.profitPercent)), 0) / profitable.length : 0;
                const avgLoss = losing.length ? losing.reduce((s,t) => s + Math.abs(safeParse(t.profitPercent)), 0) / losing.length : 0;
                const riskReward = avgLoss ? avgWin / avgLoss : 0;
                const returnsArr = trades.map(t => safeParse(t.profitPercent));
                const mean = returnsArr.reduce((a,b)=>a+b,0)/returnsArr.length;
                const variance = returnsArr.reduce((a,b)=>a+Math.pow(b-mean,2),0)/returnsArr.length;
                const stdDev = Math.sqrt(variance);
                const sharpe = stdDev ? mean / stdDev : 0;
                const fibTrades = trades.filter(t => t.useFibonacci);
                const regTrades = trades.filter(t => !t.useFibonacci);
                const fibWins = fibTrades.filter(t => t.profit > 0);
                const fibLoss = fibTrades.filter(t => t.profit < 0);
                const fibWinRate = fibTrades.length ? (fibWins.length / fibTrades.length) * 100 : 0;
                const fibAvgProfit = fibWins.length ? fibWins.reduce((s,t) => s + safeParse(t.profitPercent), 0) / fibWins.length : 0;
                const fibTotal = fibTrades.reduce((s,t) => s + safeParse(t.profitPercent), 0);
                const regWins = regTrades.filter(t => t.profit > 0);
                const regLoss = regTrades.filter(t => t.profit < 0);
                const regWinRate = regTrades.length ? (regWins.length / regTrades.length) * 100 : 0;
                const regAvgProfit = regWins.length ? regWins.reduce((s,t) => s + safeParse(t.profitPercent), 0) / regWins.length : 0;
                const regTotal = regTrades.reduce((s,t) => s + safeParse(t.profitPercent), 0);

                const detailed = {
                    "اطلاعات_فایل": {
                        "نام_فایل": fileName,
                        "نماد": "BTCUSDT",
                        "تایم_فریم": tfLabel,
                        "تاریخ_پردازش": new Date().toLocaleString('fa-IR'),
                        "تعداد_کندل": tfData.length,
                        "سرمایه_اولیه": initialCapital,
                        "سرمایه_نهایی": finalCapital,
                        "بازدهی_کل": safeToFixed(totalReturn, 2) + "%"
                    },
                    "آمار_کلی_معاملات": {
                        "تعداد_کل_معاملات": trades.length,
                        "معاملات_سودده": profitable.length,
                        "معاملات_زیانده": losing.length,
                        "نرخ_برد": safeToFixed(winRate, 2) + "%",
                        "بیشترین_سود": best ? safeToFixed(best.profitPercent, 4) + "%" : "0%",
                        "بیشترین_ضرر": worst ? safeToFixed(worst.profitPercent, 4) + "%" : "0%",
                        "میانگین_سود_ضرر": safeToFixed(avgProfitLoss, 4) + "%"
                    },
                    "توزیع_دقیق_سود_ضرر": distribution,
                    "توزیع_نوع_خروج": {
                        "حد_سود": { "تعداد": tpTrades.length, "درصد": trades.length ? safeToFixed((tpTrades.length/trades.length)*100,2)+"%" : "0%", "میانگین_سود": safeToFixed(avgTP,4)+"%", "مجموع_سود": safeToFixed(totalTP,4)+"%" },
                        "تریلینگ_استاپ": { "تعداد": trailTrades.length, "درصد": trades.length ? safeToFixed((trailTrades.length/trades.length)*100,2)+"%" : "0%", "سودده": profTrail.length, "ضررده": trailTrades.length - profTrail.length, "میانگین_سود": safeToFixed(avgTrail,4)+"%", "مجموع_سود": safeToFixed(totalTrail,4)+"%" },
                        "استاپ_لاس": { "تعداد": slTrades.length, "درصد": trades.length ? safeToFixed((slTrades.length/trades.length)*100,2)+"%" : "0%", "میانگین_ضرر": safeToFixed(avgSl,4)+"%", "مجموع_ضرر": safeToFixed(totalSl,4)+"%" },
                        "پایان_بکتست": { "تعداد": eobTrades.length, "درصد": trades.length ? safeToFixed((eobTrades.length/trades.length)*100,2)+"%" : "0%" }
                    },
                    "آنالیز_ریسک": {
                        "حداکثر_افت_سرمایه": safeToFixed(maxDrawdown,2)+"%",
                        "بیشترین_ضرر_متوالی": maxConsec,
                        "ریسک_به_بازده": safeToFixed(riskReward,2),
                        "نسبت_سود_به_ضرر": safeToFixed(profitFactor,2),
                        "نسبت_شارپ": safeToFixed(sharpe,2)
                    },
                    "مقایسه_استراتژی‌ها": {
                        "معاملات_فیبوناچی": { "تعداد": fibTrades.length, "سودده": fibWins.length, "ضررده": fibLoss.length, "نرخ_برد": safeToFixed(fibWinRate,2)+"%", "میانگین_سود": safeToFixed(fibAvgProfit,4)+"%", "مجموع_سود": safeToFixed(fibTotal,4)+"%" },
                        "معاملات_معمولی": { "تعداد": regTrades.length, "سودده": regWins.length, "ضررده": regLoss.length, "نرخ_برد": safeToFixed(regWinRate,2)+"%", "میانگین_سود": safeToFixed(regAvgProfit,4)+"%", "مجموع_سود": safeToFixed(regTotal,4)+"%" },
                        "تفاوت_عملکرد": { "اختلاف_نرخ_برد": safeToFixed(fibWinRate - regWinRate,2)+"%", "اختلاف_میانگین_سود": safeToFixed(fibAvgProfit - regAvgProfit,4)+"%" }
                    },
                    "خلاصه": [
                        `تعداد ${trades.length} معامله با نرخ برد ${safeToFixed(winRate,2)}%`,
                        `بازدهی کل: ${totalReturn >= 0 ? '+' : ''}${safeToFixed(totalReturn,2)}%`,
                        `سود خالص: ${trades.reduce((s,t) => s + t.profit, 0).toFixed(2)}`
                    ]
                };

                fs.writeFileSync(path.join(outputDir, 'detailed_results.json'), JSON.stringify(detailed, null, 2));
                log(`گزارش detailed_results.json برای ${tfLabel} ذخیره شد.`);

                const summary = {
                    fileInfo: { name: fileName, symbol: "BTCUSDT", timeframe: tfLabel, processedAt: new Date().toISOString() },
                    trades: trades.map(t => ({ type: t.type, entryTime: t.entryTime, exitTime: t.exitTime, profitPercent: t.profitPercent }))
                };
                fs.writeFileSync(path.join(outputDir, 'trades_summary.json'), JSON.stringify(summary, null, 2));
                log(`گزارش trades_summary.json برای ${tfLabel} ذخیره شد.`);

                encryptResults(outputDir, resultsPassword);
                log(`✅ results.enc برای ${fileName} / ${tfLabel} ذخیره شد.`);
            } // پایان حلقه تایم‌فریم‌ها

        } catch (err) {
            log(`💥 خطا در پردازش فایل ${fileName}: ${err.stack}`, 'ERROR');
            // ادامه به فایل بعدی
        }
    }

    log('✅ پردازش تمام فایل‌های این چانک به پایان رسید.');
})().catch(err => {
    log('💥 خطای بحرانی در اجرا: ' + err.stack, 'CRITICAL');
    process.exit(1);
});
