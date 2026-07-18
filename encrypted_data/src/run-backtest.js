console.log('✅ نسخه نهایی – با پشتیبانی از ادامه‌دهی بین فایل‌ها');

// ==================== حالت batch خطوط روند ====================
// این مسیر قبلاً با VERIFY_BATCH_EQUIVALENCE=true روی داده‌ی واقعی تایید شده
// (خروجی batch و incremental دقیقاً یکسان بود)، پس از این به بعد همیشه batch
// روشن است و verify (که هر دو روش را موازی اجرا می‌کند و کند است) خاموش.
process.env.USE_BATCH_TRENDLINES = 'true';
process.env.VERIFY_BATCH_EQUIVALENCE = 'false';

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

const aggregatedRepoDir = getArg('--aggregated-repo-dir') || process.env.AGGREGATED_REPO_DIR || process.cwd();



log(`شروع run-backtest.js با آرگومان‌ها: strategyFile=${strategyFile}, startIndex=${startIndex}, chunkSize=${chunkSize}, dataDir=${dataDir}, maxContinuation=${maxContinuationFiles}, aggregatedRepoDir=${aggregatedRepoDir}`);



if (!strategyFile || !fs.existsSync(strategyFile)) {

    log('فایل استراتژی وجود ندارد.', 'ERROR');

    process.exit(0);

}



const strategyName = path.basename(strategyFile, '.js');

const strategyCode = fs.readFileSync(strategyFile, 'utf8');

log(`استراتژی ${strategyName} با طول ${strategyCode.length} کاراکتر خوانده شد.`);



// ====================== تشخیص استراتژی معکوس (_INVERSE) ======================

// اگر نام فایل استراتژی با _INVERSE تمام شود، به‌جای بکتست معمولی روی کل داده‌ها،

// باید یک بکتست معکوس هدفمند (فقط روی زمان‌های ورود معاملات نسخه‌ی اصلی) اجرا شود.

const isInverseStrategy = /_INVERSE$/.test(strategyName);

const baseStrategyName = isInverseStrategy ? strategyName.replace(/_INVERSE$/, '') : null;

if (isInverseStrategy) {

    log(`🔁 استراتژی معکوس شناسایی شد: ${strategyName} (نسخه‌ی اصلی: ${baseStrategyName})`);

}



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

const needsDivergence = /getDivergenceSignals/.test(strategyCode);

log(`نیازمندی‌ها: trendLines=${needsTrendLines}, ichimoku=${needsIchimoku}, divergence=${needsDivergence}`);



if (needsTrendLines && !analysisConfig.trendLines) {

    log('❌ استراتژی به خطوط روند نیاز دارد اما ANALYSIS_CONFIG.trendLines تنظیم نشده است.', 'ERROR');

    process.exit(1);

}

if (needsIchimoku && !analysisConfig.ichimoku) {

    log('❌ استراتژی به ایچیموکو نیاز دارد اما ANALYSIS_CONFIG.ichimoku تنظیم نشده است.', 'ERROR');

    process.exit(1);

}

if (needsDivergence && !divergenceDetector) {

    log('❌ استراتژی از getDivergenceSignals() استفاده می‌کند اما divergence-detector.js یافت نشد.', 'ERROR');

    process.exit(1);

}



// ====================== اعتبارسنجی پارامترهای اجباری حالت ورود ======================

// entryType و breakTolerance اجباری‌اند و هیچ مقدار پیش‌فرضی برای آن‌ها در نظر گرفته نمی‌شود.

const VALID_ENTRY_TYPES = ['nextCandle', 'openBreak'];

const entryType = analysisConfig.entryType;

const breakTolerance = analysisConfig.breakTolerance;



if (!VALID_ENTRY_TYPES.includes(entryType)) {

    log(`❌ ANALYSIS_CONFIG.entryType نامعتبر یا تعریف‌نشده است: ${JSON.stringify(entryType)}. مقادیر مجاز: ${VALID_ENTRY_TYPES.join(' یا ')}.`, 'ERROR');

    process.exit(1);

}



if (typeof breakTolerance !== 'number' || !isFinite(breakTolerance) || breakTolerance <= 0) {

    log(`❌ ANALYSIS_CONFIG.breakTolerance نامعتبر یا تعریف‌نشده است: ${JSON.stringify(breakTolerance)}. باید یک عدد اعشاری مثبت باشد (مثلاً 0.001).`, 'ERROR');

    process.exit(1);

}



log(`✅ حالت ورود: entryType=${entryType}, breakTolerance=${breakTolerance}`);



// ====================== بافر خودکار ادامه‌دهی بین فایل‌ها ======================

// اگر true باشد، بین پردازش فایل‌های متوالی (برای هر تایم‌فریم)، ۲۵٪ انتهای فایل قبلی

// به‌صورت خودکار (بدون نیاز به پارامتر جدید در استراتژی) به ابتدای فایل بعدی الحاق

// می‌شود تا اندیکاتورهای دوره‌بلند در ابتدای فایل جدید دچار نقص نشوند.

const enableSmartContinuation = analysisConfig.enableSmartContinuation === true;

log(`✅ بافر خودکار ادامه‌دهی (enableSmartContinuation): ${enableSmartContinuation}`);



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

    // اعتبارسنجی پیوستگی داده‌ی خام: اندیکاتورهای دوره‌بلند (SMA200، سنکو ۵۲) به تعداد
    // کندل حساسند نه به بازه‌ی زمانی. اگر داخل داده‌ی ۱ دقیقه‌ای gap بزرگ (مثلاً قطعی
    // صرافی) وجود داشته باشد، بعد از resample به تایم‌فریم‌های بالاتر این gap به‌صورت یک
    // کندل غایب دیده می‌شود و باعث محاسبه‌ی اشتباه اندیکاتور روی بازه‌ی زمانی غلط می‌شود.
    // این فقط هشدار می‌دهد، داده را تغییر نمی‌دهد.
    if (allData.length >= 3) {
        const t1 = allData[0].timestamp.getTime();
        const t2 = allData[1].timestamp.getTime();
        const expectedIntervalMs = t2 > t1 ? t2 - t1 : 60 * 1000;
        const gapToleranceMs = expectedIntervalMs * 1.5;
        let gapCount = 0;
        const gapSamples = [];
        for (let i = 1; i < allData.length; i++) {
            const gap = allData[i].timestamp.getTime() - allData[i - 1].timestamp.getTime();
            if (gap > gapToleranceMs) {
                gapCount++;
                if (gapSamples.length < 5) {
                    gapSamples.push(`${allData[i - 1].timestamp.toISOString()} → ${allData[i].timestamp.toISOString()} (${Math.round(gap / 60000)} دقیقه)`);
                }
            }
        }
        if (gapCount > 0) {
            log(`⚠️ فایل ${fileName}: ${gapCount} gap در داده‌ی خام شناسایی شد (فاصله‌ی موردانتظار ~${Math.round(expectedIntervalMs / 60000)} دقیقه). نمونه: ${gapSamples.join(' | ')}`, 'WARN');
        }
    }

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



// ====================== توابع بکتست معکوس (_INVERSE) ======================

// رمزگشایی AES-256-CBC مطابق دقیقاً همان روشی که در backtest.yml/سایر فایل‌های .enc

// این پروژه استفاده می‌شود: کلید = scrypt(password, 'salt', 32)، ۱۶ بایت اول = IV.

function decryptAes256Cbc(encPath, password) {

    const data = fs.readFileSync(encPath);

    const key = crypto.scryptSync(password, 'salt', 32);

    const iv = data.slice(0, 16);

    const enc = data.slice(16);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    return Buffer.concat([decipher.update(enc), decipher.final()]);

}



// از یک فایل معاملات یکپارچه‌ی رمزگشایی‌شده (که می‌تواند خودش tar.gz یک یا چند فایل

// JSON باشد، یا مستقیماً یک JSON خام)، لیست entryTime تمام معاملات را استخراج می‌کند.

function extractEntryTimesFromTradesEnc(encPath, password) {

    const decrypted = decryptAes256Cbc(encPath, password);

    const entryTimesMs = new Set();



    function collectFromValue(val) {

        if (!val) return;

        if (Array.isArray(val)) {

            for (const item of val) collectFromValue(item);

            return;

        }

        if (typeof val === 'object') {

            if (val.entryTime !== undefined && val.entryTime !== null) {

                const t = new Date(val.entryTime).getTime();

                if (!isNaN(t)) entryTimesMs.add(t);

            }

            if (Array.isArray(val.trades)) collectFromValue(val.trades);

        }

    }



    const os = require('os');

    const { execSync } = require('child_process');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-trades-'));

    const tarPath = path.join(tmpDir, 'trades.tar.gz');

    let usedArchive = false;

    try {

        fs.writeFileSync(tarPath, decrypted);

        // اعتبارسنجی این که فایل رمزگشایی‌شده واقعاً tar.gz است (مشابه results.enc)

        execSync(`tar -tzf "${tarPath}"`, { stdio: 'ignore' });

        const extractDir = path.join(tmpDir, 'extracted');

        fs.mkdirSync(extractDir, { recursive: true });

        execSync(`tar -xzf "${tarPath}" -C "${extractDir}"`);

        usedArchive = true;



        function walk(dir) {

            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {

                const fp = path.join(dir, entry.name);

                if (entry.isDirectory()) { walk(fp); continue; }

                if (!entry.name.endsWith('.json')) continue;

                try {

                    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));

                    collectFromValue(parsed);

                } catch (e) {

                    log(`⚠️ خطا در خواندن ${fp} از آرشیو معاملات پایه: ${e.message}`, 'WARN');

                }

            }

        }

        walk(extractDir);

    } catch (e) {

        // فایل رمزگشایی‌شده tar.gz نبود؛ تلاش دوم: مستقیماً به‌عنوان JSON خام پارس شود.

    } finally {

        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* بی‌اهمیت */ }

    }



    if (!usedArchive) {

        try {

            const parsed = JSON.parse(decrypted.toString('utf8'));

            collectFromValue(parsed);

        } catch (e) {

            log(`❌ فایل ${encPath} نه یک tar.gz معتبر بود و نه JSON قابل‌پارس (بعد از رمزگشایی): ${e.message}`, 'ERROR');

        }

    }



    return entryTimesMs;

}



// ====================== تابع ریسمپل OHLC ======================

function resampleOHLC(candles, targetMinutes, boundaryData) {

    if (!candles || candles.length === 0) return candles;

    // اصلاح باگ مهاجرت ۵→۱ دقیقه: قبلاً اینجا فرض می‌شد "targetMinutes===5 یعنی داده‌ی خام،
    // پس نیازی به ریسمپل نیست". با داده‌ی منبع ۱ دقیقه‌ای این فرض دیگر درست نیست: ورودی الان
    // همیشه ۱ دقیقه‌ای است و ۵ دقیقه هم باید مثل ۱۵/۳۰/۶۰ واقعاً ریسمپل شود. شورت‌کات حذف شد.



    const bucketMs = targetMinutes * 60 * 1000;

    // اصلاح باگ مرز فایل‌ها: قبلاً هر فایل کاملاً مستقل ریسمپل می‌شد. اگر مرز بین دو فایل
    // ۱ دقیقه‌ای دقیقاً روی مرز targetMinutes نمی‌افتاد، آخرین باکت این فایل ناقص می‌ماند و
    // به‌جای یک کندل کامل، دو کندل ناقص ساخته می‌شد. اگر boundaryData (چند کندل خام از
    // ابتدای فایل بعدی) داده شده باشد، فقط برای تکمیل همین یک باکت مرزی استفاده می‌شود؛
    // هیچ باکت کامل متعلق به فایل بعدی از boundaryData ساخته نمی‌شود.
    const lastOwnTs = candles[candles.length - 1].timestamp instanceof Date
        ? candles[candles.length - 1].timestamp.getTime()
        : candles[candles.length - 1].timestamp;
    const lastOwnBucketStart = Math.floor(lastOwnTs / bucketMs) * bucketMs;

    const combined = (boundaryData && boundaryData.length > 0)
        ? candles.concat(boundaryData)
        : candles;

    const buckets = new Map();



    for (const c of combined) {

        const ts = c.timestamp instanceof Date ? c.timestamp.getTime() : c.timestamp;

        const bucketKey = Math.floor(ts / bucketMs) * bucketMs;

        // از باکت مرزی آخر (متعلق به این فایل) که گذشتیم، یعنی boundaryData فقط برای
        // تکمیل همان باکت لازم بود؛ باکت‌های بعدی کاملاً متعلق به فایل بعدی‌اند.
        if (bucketKey > lastOwnBucketStart) break;



        if (!buckets.has(bucketKey)) {

            buckets.set(bucketKey, {

                timestamp: new Date(bucketKey),

                open: c.open,

                high: c.high,

                low: c.low,

                close: c.close,

                // اصلاح باگ حذف بی‌سروصدای volume: قبلاً این فیلد اصلاً کپی نمی‌شد و
                // volume تمام تایم‌فریم‌های بالاتر همیشه صفر/undefined بود.
                volume: c.volume || 0

            });

        } else {

            const b = buckets.get(bucketKey);

            b.high = Math.max(b.high, c.high);

            b.low = Math.min(b.low, c.low);

            b.close = c.close;

            b.volume += (c.volume || 0);

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



    // ====================== بارگذاری زمان‌های ورود برای بکتست معکوس (_INVERSE) ======================

    // مسیر فایل یکپارچه‌ی معاملات per-تایم‌فریم است (مطابق ساختار واقعی aggregated/):
    //   aggregated/{BASE_STRAT}_{TF}/{BASE_STRAT}_{TF}_trades.enc
    // یعنی برای هر یک از ۴ تایم‌فریم (5m/15m/30m/1h) یک فایل جداگانه وجود دارد. این‌جا فقط
    // تابع/کش تعریف می‌شود؛ بارگذاری واقعی هر تایم‌فریم فقط یک‌بار و در همان لحظه‌ی نیاز
    // (اولین باری که آن تایم‌فریم پردازش می‌شود) انجام می‌گیرد.

    const inverseEntryTimesByTf = {};

    function getInverseEntryTimesForTf(tfLabel) {

        if (inverseEntryTimesByTf[tfLabel]) return inverseEntryTimesByTf[tfLabel];

        const aggDirName = `${baseStrategyName}_${tfLabel}`;

        const aggTradesPath = path.join(aggregatedRepoDir, 'aggregated', aggDirName, `${aggDirName}_trades.enc`);

        log(`📥 بارگذاری زمان‌های ورود نسخه‌ی اصلی (تایم‌فریم ${tfLabel}) از: ${aggTradesPath}`);

        if (!fs.existsSync(aggTradesPath)) {

            log(`❌ فایل یکپارچه‌ی معاملات نسخه‌ی اصلی برای تایم‌فریم ${tfLabel} یافت نشد: ${aggTradesPath}`, 'CRITICAL');

            process.exit(1);

        }

        let set;

        try {

            set = extractEntryTimesFromTradesEnc(aggTradesPath, resultsPassword);

        } catch (err) {

            log(`❌ خطا در رمزگشایی/استخراج ${aggTradesPath}: ${err.message}`, 'CRITICAL');

            process.exit(1);

        }

        if (!set || set.size === 0) {

            log(`❌ هیچ entryTime معتبری از ${aggTradesPath} استخراج نشد.`, 'CRITICAL');

            process.exit(1);

        }

        log(`✅ ${set.size} زمان ورود منحصربه‌فرد (تایم‌فریم ${tfLabel}) از معاملات ${aggDirName} بارگذاری شد.`);

        inverseEntryTimesByTf[tfLabel] = set;

        return set;

    }



    // ذخیره strategyCode در 1.json برای هر تایم‌فریم

    const tfLabels = ['5m', '15m', '30m', '1h'];

    for (const tfLabel of tfLabels) {

        const stratDir = path.join(process.cwd(), 'results', `${strategyName}_${tfLabel}`);

        fs.mkdirSync(stratDir, { recursive: true });

        fs.writeFileSync(path.join(stratDir, '1.json'), strategyCode, 'utf8');

    }



    // نگهداری تاریخچه‌ی tfData پردازش‌شده (از جدیدترین به قدیمی‌ترین) به ازای هر تایم‌فریم،

    // برای ساخت بافر خودکار پویا بر اساس تایم‌فریم در ابتدای فایل بعدی (وقتی

    // enableSmartContinuation فعال است). حداکثر ۲ فایل قبلی نگه داشته می‌شود چون بیشترین

    // بافر مورد نیاز (تایم‌فریم ۱ ساعته، ۲۰۰٪) به دو فایل کامل قبلی نیاز دارد.

    const previousTfDataMap = {};

    const MAX_PREV_TF_HISTORY = 2;



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

            // اصلاح باگ آینده‌نگری + عدم تطابق تایم‌فریم: قبلاً اینجا یک‌بار روی کل

            // marketData خام ۵ دقیقه‌ای (بدون maxIndex) محاسبه می‌شد و همان نتیجه‌ی ثابت

            // برای تمام تایم‌فریم‌ها استفاده می‌شد (دقیقاً همان دو باگی که برای خطوط روند

            // داشتیم). الان فقط ماژول را (در صورت وجود) به backtest-core.js می‌دهیم تا

            // خودش داخل حلقه، برای هر tfData به‌صورت جداگانه و کندل‌به‌کندل (با maxIndex

            // برابر همان کندل جاری) محاسبه کند.

            //

            // اصلاح باگ دوم (تشخیص نیاز): قبلاً divergenceSettings هر بار که ماژول

            // divergence-detector.js پیدا می‌شد ساخته می‌شد — حتی اگر استراتژی اصلاً

            // getDivergenceSignals() را صدا نمی‌زد. برخلاف trendLines/ichimoku که با

            // needsTrendLines/needsIchimoku فقط در صورت نیاز واقعی فعال می‌شدند، واگرایی

            // برای همه‌ی استراتژی‌ها بی‌قید و شرط محاسبه می‌شد (هزینه‌ی محاسباتی اضافه در

            // هر کندل، بدون این‌که خروجی‌اش جایی استفاده شود). الان مثل آن دو، از

            // needsDivergence استفاده می‌کنیم.

            if (!needsDivergence) {

                log('واگرایی مورد نیاز نیست (getDivergenceSignals در کد استراتژی صدا زده نشده).');

            } else if (!divergenceDetector) {

                log('ماژول تشخیص واگرایی یافت نشد؛ واگرایی محاسبه نمی‌شود.');

            }

            const divergenceSettings = (needsDivergence && divergenceDetector) ? { indicators: ['RSI', 'MACD'] } : null;



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



                // تفکیک از خط قبل: tfData باید همیشه محاسبه شود (حتی اگر این فایل قبلاً پردازش

                // شده) تا زنجیره‌ی previousTfDataMap برای بافر خودکار فایل بعدی قطع نشود.

                // اصلاح باگ مهاجرت ۵→۱ دقیقه: قبلاً فقط 15m/30m/1h واقعاً ریسمپل می‌شدند و 5m
                // همان داده‌ی خام (۵ دقیقه‌ای قدیمی) بود. چون منبع الان ۱ دقیقه‌ای است، 5m هم
                // باید مثل بقیه واقعاً از resampleOHLC عبور کند، وگرنه «5m» در واقع ۱ دقیقه
                // خام می‌ماند. boundaryData (چند کندل خام ابتدای فایل بعدی) برای تکمیل درست
                // آخرین باکت این فایل، در صورت عدم انطباق مرز فایل با مرز تایم‌فریم، پاس داده
                // می‌شود (نگاه کنید به resampleOHLC).
                const firstNextFileData = nextFileNames.length > 0 && nextFiles[nextFileNames[0]]
                    ? nextFiles[nextFileNames[0]].data
                    : [];
                const boundaryData = firstNextFileData.slice(0, tf.minutes * 2);
                const tfData = resampleOHLC(marketData, tf.minutes, boundaryData);

                // تاریخچه‌ی فایل‌های قبلی این تایم‌فریم (جدیدترین اول) — برای بافرهای بیش از

                // ۱۰۰٪ (۳۰m→۱۲۵٪، 1h→۲۰۰٪) که به بیش از یک فایل قبلی نیاز دارند.

                const previousTfDataListForBuffer = previousTfDataMap[tfLabel] || [];



                if (fs.existsSync(path.join(outputDir, 'results.enc'))) {

                    log(`⏩ فایل ${fileName} برای تایم‌فریم ${tfLabel} قبلاً انجام شده است.`);

                    previousTfDataMap[tfLabel] = [tfData, ...previousTfDataListForBuffer].slice(0, MAX_PREV_TF_HISTORY);

                    continue;

                }



                log(`🚀 فراخوانی runBacktest برای تایم‌فریم ${tfLabel} (${tfData.length} کندل)...`);

                if (enableSmartContinuation && previousTfDataListForBuffer.length > 0) {

                    const bufferPctLabel = { '15m': '75%', '30m': '125%', '1h': '200%' }[tfLabel] || '25%';

                    log(`🧩 بافر خودکار پویا (${bufferPctLabel} بر اساس تایم‌فریم ${tfLabel}) از ${previousTfDataListForBuffer.length} فایل قبلی به ابتدای این فایل الحاق خواهد شد.`);

                }



                // ---- تشخیص خطوط روند مخصوص همین تایم‌فریم ----

                // اصلاح باگ آینده‌نگری: قبلاً اینجا detectTrendLinesAdvanced یک‌بار روی کل

                // tfData صدا زده می‌شد و لیست خطوط ثابت به تمام کندل‌های بک‌تست داده می‌شد؛

                // یعنی در کندل ۸۶ می‌شد خطی دید که تاییدش (touch point) مال کندل ۲۵۰۰ بود.

                // الان فقط تنظیمات pivot را می‌دهیم و backtest-core.js خودش داخل حلقه،

                // کندل‌به‌کندل و فقط با داده‌ی تا همان کندل، خطوط را محاسبه می‌کند.

                const trendLineSettings = needsTrendLines ? analysisConfig.trendLines : null;

                if (needsTrendLines) {

                    log(`🟡 خطوط روند به‌صورت افزایشی (بدون آینده‌نگری) برای تایم‌فریم ${tfLabel} محاسبه خواهند شد.`);

                }



                const result = await backtestCore.runBacktest(tfData, {

                    code: strategyCode,

                    initialCapital: 10000,

                    riskPerTrade: 2,

                    maxDailyLoss: 5,

                    commission: 0.05,

                    ichimoku: ichimokuSettings,

                    trendLineSettings,

                    entryType,

                    breakTolerance,

                    breakPoints: {},

                    divergenceDetector,

                    divergenceSettings,

                    // اصلاح باگ مهاجرت ۵→۱ دقیقه: nextFiles با loadSingleFile خام ۱ دقیقه‌ای
                    // بارگذاری شده، اما فقط برای تایم‌فریم 5m به‌عنوان uploadedFiles پاس داده
                    // می‌شود (رفتار enableContinuation بدون تغییر، فقط برای 5m). چون marketData
                    // برای 5m الان resample‌شده به ۵ دقیقه است، nextFiles هم باید قبل از پاس
                    // دادن به همان ۵ دقیقه resample شود؛ وگرنه دو گرانولاریتی متفاوت
                    // (۵ دقیقه‌ی resample‌شده در برابر ۱ دقیقه‌ی خام) در findNextFileByDate،
                    // buildCombinedData و continueOpenTradesWithNextFile با هم قاطی می‌شوند.
                    uploadedFiles: tf.minutes === 5
                        ? Object.fromEntries(Object.entries(nextFiles).map(([n, info]) => [
                            n,
                            { fileName: info.fileName, data: resampleOHLC(info.data, 5) }
                        ]))
                        : {},

                    combinedFiles: {},

                    fileName: fileName,

                    enableContinuation: tf.minutes === 5,

                    maxContinuationFiles: maxContinuationFiles,

                    handleGaps: true,

                    useStagedStopLoss: true,

                    timezoneOffset: 0,

                    // اصلاح باگ مهاجرت ۵→۱ دقیقه: قبلاً فقط برای تایم‌فریم‌های >۵ دقیقه
                    // داده‌ی ریزتر پاس داده می‌شد (چون 5m خودش «خام» بود). الان که پایه‌ی
                    // واقعی ۱ دقیقه است، هر چهار تایم‌فریم (از جمله 5m) باید همان marketData
                    // خام ۱ دقیقه‌ای را به‌عنوان لایه‌ی دقت ریزتر دریافت کنند. نام گزینه برای
                    // سازگاری با backtest-core.js فعلاً fiveMinData باقی می‌ماند، اما محتوایش
                    // همیشه داده‌ی پایه (۱ دقیقه‌ای) است.
                    fiveMinData: marketData,

                    // سوییچ روشن/خاموش برای دقت درون‌کندلی (TP/SL، گپ). با false می‌توان رفتار
                    // قدیمی (بدون لایه‌ی ۱ دقیقه‌ای) را برای دیباگ رگرسیون بازتولید کرد.
                    enableIntrabarPrecision: true,

                    enableSmartContinuation: enableSmartContinuation,

                    timeframeLabel: tfLabel,

                    previousFullDataList: previousTfDataListForBuffer,



                    // ---- حالت بکتست معکوس (_INVERSE) ----

                    // در صورت شناسایی استراتژی معکوس: باز کردن پوزیشن فقط در زمان‌های ورود

                    // معاملات نسخه‌ی اصلی مجاز است و محدودیت ۰.۵٪ (canOpenNewPosition)

                    // در backtest-core.js غیرفعال می‌شود.

                    inverseMode: isInverseStrategy,

                    inverseEntryTimes: isInverseStrategy ? Array.from(getInverseEntryTimesForTf(tfLabel)) : undefined,

                    // اگر ANALYSIS_CONFIG.stopLossStages در فایل استراتژی (از جمله _INVERSE.js)

                    // تعریف شده باشد، به‌جای مقدار پیش‌فرض هاردکد به‌عنوان fallback استفاده می‌شود.

                    stopLossStages: Array.isArray(analysisConfig.stopLossStages) ? analysisConfig.stopLossStages : undefined

                });



                previousTfDataMap[tfLabel] = [tfData, ...previousTfDataListForBuffer].slice(0, MAX_PREV_TF_HISTORY);



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

