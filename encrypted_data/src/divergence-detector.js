/**
 * ===========================================================================
 * ماژول تشخیص واگرایی (Divergence Detector) - نسخه کامل با پشتیبانی RSI و MACD
 * ===========================================================================
 * این ماژول برای استفاده در Web Worker طراحی شده است.
 * وابستگی صفر به UI دارد.
 * 
 * @author Custom Strategy Team
 * @version 2.1.0 (RSI + MACD + Indicator Data Export)
 * ===========================================================================
 */

// ======================== بخش ۱: تنظیمات دستی (بدون نیاز به UI) ========================
// شما می‌توانید این مقادیر را مستقیماً اینجا تغییر دهید تا بهترین پارامترها را پیدا کنید.
const DIVERGENCE_CONFIG = {
    // ----- تنظیمات پیوت (مشترک) -----
    PIVOT_PERIOD: 3,                // دوره نگاه به عقب/جلو برای یافتن قله و دره (پیش‌فرض ۵)

    // ----- تنظیمات واگرایی (مشترک) -----
    MAX_DIVERGENCE_BARS: 100,        // حداکثر فاصله (به تعداد کندل) بین دو نقطه برای بررسی واگرایی
    MIN_SLOPE_DIFFERENCE: 0.01,      // حداقل اختلاف شیب خطوط برای معتبر بودن واگرایی (درصد/واحد)
    PIVOT_ALIGNMENT_TOLERANCE: 4,   // تلورانس فاصله ایندکس بین پیوت قیمت و پیوت اندیکاتور

    // ----- تنظیمات انتخاب «بهترین واگرایی» -----
    // اصلاح: قبلاً فقط جفت پیوت متوالی (p[i], p[i+1]) بررسی می‌شد.
    // الان هر پیوت جدید با تا LOOKBACK_PIVOTS پیوت هم‌نوع قبلی مقایسه می‌شود
    // و از بین کاندیدهای معتبر، طبق این الگوریتم دو مرحله‌ای انتخاب می‌شود:
    //   ۱. فیلتر نزدیک‌ترین‌ها: فقط کاندیدهایی که فاصله‌شان (به کندل) با پیوت جدید
    //      حداکثر NEAREST_WINDOW_RATIO برابر نزدیک‌ترین فاصله‌ی موجود است، نگه داشته می‌شوند.
    //   ۲. از بین آن نزدیک‌ترین‌ها، قوی‌ترین (بیشترین اختلاف قدرمطلق شیب قیمت/اندیکاتور) انتخاب می‌شود.
    LOOKBACK_PIVOTS: 6,              // تعداد پیوت‌های هم‌نوع قبلی که برای هر پیوت جدید بررسی می‌شوند
    NEAREST_WINDOW_RATIO: 1.5,       // پنجره‌ی «نزدیک‌ترین‌ها» = نزدیک‌ترین فاصله × این ضریب

    // ----- تنظیمات اختصاصی RSI -----
    RSI_PERIOD: 14,                 // دوره RSI

    // ----- تنظیمات اختصاصی MACD -----
    MACD_FAST_PERIOD: 12,           // دوره سریع MACD
    MACD_SLOW_PERIOD: 26,           // دوره کند MACD
    MACD_SIGNAL_PERIOD: 9,          // دوره خط سیگنال MACD
    MACD_USE_HISTOGRAM: true,       // استفاده از هیستوگرام برای واگرایی (true) یا خط MACD (false)

    // ----- تنظیمات لاگینگ (بسیار مهم برای دیباگ) -----
    VERBOSE_LOGGING: true,          // فعال بودن لاگ‌های مفصل مرحله به مرحله
    BREAK_ON_ERROR: false           // در صورت خطا، آیا اجرا متوقف شود یا خیر
};

// ======================== بخش ۲: تابع محاسبه RSI (داخلی) ========================
/**
 * محاسبه آرایه RSI برای کل داده‌ها
 * @param {Array} data - آرایه کندل‌ها (هر کندل شامل close)
 * @param {number} period - دوره RSI (پیش‌فرض از تنظیمات)
 * @returns {Array<number|null>} آرایه RSI (برای اولین period-1 مقدار null است)
 */
function calculateRSI(data, period = DIVERGENCE_CONFIG.RSI_PERIOD, config = DIVERGENCE_CONFIG) {
    console.log(`[DIVERGENCE] 🧮 [RSI] شروع محاسبه برای ${data.length} کندل با دوره ${period}`);

    if (!data || data.length < period + 1) {
        console.error('[DIVERGENCE] ❌ [RSI] خطا: داده‌ها برای محاسبه RSI کافی نیستند.');
        return [];
    }

    const rsiValues = new Array(data.length).fill(null);
    let gains = 0;
    let losses = 0;

    // محاسبه اولین میانگین
    for (let i = 1; i <= period; i++) {
        const change = data[i].close - data[i - 1].close;
        if (change > 0) gains += change;
        else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    if (avgLoss === 0) {
        rsiValues[period] = 100;
    } else {
        const rs = avgGain / avgLoss;
        rsiValues[period] = 100 - (100 / (1 + rs));
    }

    // محاسبه برای باقی کندل‌ها با روش Smoothing
    for (let i = period + 1; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close;
        let gain = 0, loss = 0;
        if (change > 0) gain = change;
        else loss = -change;

        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;

        if (avgLoss === 0) {
            rsiValues[i] = 100;
        } else {
            const rs = avgGain / avgLoss;
            rsiValues[i] = 100 - (100 / (1 + rs));
        }
    }

    const validCount = rsiValues.filter(v => v !== null).length;
    console.log(`[DIVERGENCE] ✅ [RSI] محاسبه کامل شد. مقادیر معتبر: ${validCount}`);

    if (config.VERBOSE_LOGGING) {
        const sample = rsiValues.slice(period, period + 5).map((v, i) => `[${period + i}]=${v?.toFixed(2) || 'null'}`).join(', ');
        console.log(`[DIVERGENCE] 📋 [RSI] نمونه مقادیر: ${sample}`);
    }

    return rsiValues;
}

// ======================== بخش ۳: تابع محاسبه MACD (داخلی) ========================
/**
 * محاسبه MACD کامل و بازگرداندن آبجکت شامل macdLine، signalLine و histogram
 * @param {Array} data - آرایه کندل‌ها (هر کندل شامل close)
 * @returns {Object|null} آبجکت شامل macdLine، signalLine و histogram (هر کدام آرایه عددی)
 */
function calculateFullMACD(data, config = DIVERGENCE_CONFIG) {
    const fastPeriod = config.MACD_FAST_PERIOD;
    const slowPeriod = config.MACD_SLOW_PERIOD;
    const signalPeriod = config.MACD_SIGNAL_PERIOD;

    console.log(`[DIVERGENCE] 🧮 [MACD] شروع محاسبه کامل (Fast=${fastPeriod}, Slow=${slowPeriod}, Signal=${signalPeriod})`);

    if (!data || data.length < slowPeriod + signalPeriod) {
        console.error('[DIVERGENCE] ❌ [MACD] خطا: داده‌ها برای محاسبه MACD کافی نیستند.');
        return null;
    }

    // محاسبه EMA
    function calculateEMA(values, period) {
        const ema = new Array(values.length).fill(null);
        const multiplier = 2 / (period + 1);

        // اولین مقدار SMA
        let sum = 0;
        for (let i = 0; i < period; i++) sum += values[i];
        ema[period - 1] = sum / period;

        // محاسبه EMA برای بقیه
        for (let i = period; i < values.length; i++) {
            ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1];
        }
        return ema;
    }

    const closePrices = data.map(c => c.close);

    // محاسبه EMA های سریع و کند
    const fastEMA = calculateEMA(closePrices, fastPeriod);
    const slowEMA = calculateEMA(closePrices, slowPeriod);

    // محاسبه خط MACD (تفاوت Fast و Slow)
    const macdLine = new Array(data.length).fill(null);
    for (let i = 0; i < data.length; i++) {
        if (fastEMA[i] !== null && slowEMA[i] !== null) {
            macdLine[i] = fastEMA[i] - slowEMA[i];
        }
    }

    // محاسبه خط سیگنال (EMA از MACD Line)
    const validMacdStart = macdLine.findIndex(v => v !== null);
    if (validMacdStart === -1) {
        console.error('[DIVERGENCE] ❌ [MACD] خطا: مقادیر MACD معتبر یافت نشد.');
        return null;
    }

    const validMacdValues = macdLine.slice(validMacdStart);
    const signalLineValues = calculateEMA(validMacdValues, signalPeriod);

    const signalLine = new Array(data.length).fill(null);
    for (let i = 0; i < signalLineValues.length; i++) {
        if (signalLineValues[i] !== null) {
            signalLine[validMacdStart + i] = signalLineValues[i];
        }
    }

    // محاسبه هیستوگرام (MACD - Signal)
    const histogram = new Array(data.length).fill(null);
    for (let i = 0; i < data.length; i++) {
        if (macdLine[i] !== null && signalLine[i] !== null) {
            histogram[i] = macdLine[i] - signalLine[i];
        }
    }

    const validCount = macdLine.filter(v => v !== null).length;
    console.log(`[DIVERGENCE] ✅ [MACD] محاسبه کامل شد. مقادیر معتبر: ${validCount}`);

    return { macdLine, signalLine, histogram };
}

/**
 * محاسبه آرایه MACD (فقط برای تشخیص واگرایی - بر اساس تنظیمات MACD_USE_HISTOGRAM)
 * @param {Array} data - آرایه کندل‌ها (هر کندل شامل close)
 * @returns {Array<number|null>} آرایه MACD (بر اساس تنظیمات MACD_USE_HISTOGRAM)
 */
function calculateMACD(data, config = DIVERGENCE_CONFIG) {
    const fullMACD = calculateFullMACD(data, config);
    if (!fullMACD) return [];

    const useHistogram = config.MACD_USE_HISTOGRAM;
    const result = useHistogram ? fullMACD.histogram : fullMACD.macdLine;

    if (config.VERBOSE_LOGGING) {
        const startIdx = result.findIndex(v => v !== null);
        const sample = result.slice(startIdx, startIdx + 5).map((v, i) => `[${startIdx + i}]=${v?.toFixed(6) || 'null'}`).join(', ');
        console.log(`[DIVERGENCE] 📋 [MACD] نمونه مقادیر (${useHistogram ? 'Histogram' : 'MACD Line'}): ${sample}`);
    }

    return result;
}

// ======================== بخش ۴: تابع یافتن نقاط پیوت ========================
/**
 * یافتن قله‌ها و دره‌های محلی در یک سری عددی — نسخه‌ی اصلاح‌شده بدون آینده‌نگری.
 *
 * اصلاح مهم: نسخه‌ی قبلی برای هر اندیس i به period کندل «بعد» از i هم نگاه می‌کرد
 * (values[i+1] ... values[i+period])، که یعنی پیوت در کندل i فقط وقتی قابل‌شناسایی
 * بود که period کندل بعدی هم از قبل وجود داشته باشند — این دقیقاً آینده‌نگری است.
 * در بک‌تست زنده (کندل‌به‌کندل)، در لحظه‌ی رسیدن به کندل i هنوز کندل‌های i+1..i+period
 * اتفاق نیفتاده‌اند، پس نمی‌توان از آن‌ها برای تایید پیوت در همان لحظه استفاده کرد.
 *
 * این تابع الان maxIndex می‌گیرد: یک پیوت در اندیس i فقط وقتی به خروجی اضافه می‌شود که
 * i + period <= maxIndex باشد — یعنی تمام کندل‌های سمت راست پیوت از قبل در داده موجود
 * بوده‌اند. اگر maxIndex داده نشود (یا برابر values.length - 1 باشد)، رفتار معادل
 * «تحلیل کامل تاریخی» است (مثلاً برای بک‌تستی که قصد دارد یک‌بار کل تاریخچه را
 * آینده‌نگرانه ببیند نیست، بلکه برای حالتی است که همه‌ی داده از قبل قطعی و گذشته است).
 * برای استفاده‌ی زنده/کندل‌به‌کندل، همیشه maxIndex را برابر همان اندیس کندل جاری بدهید.
 *
 * @param {Array<number>} values - آرایه مقادیر (مثلاً قیمت بسته یا RSI)
 * @param {number|null} maxIndex - بزرگ‌ترین اندیسی که «در لحظه‌ی فعلی» قابل مشاهده است.
 *                                  اگر null باشد، values.length - 1 در نظر گرفته می‌شود.
 * @returns {Array} آرایه پیوت‌ها [{ index, value, type }]
 */
function findPivots(values, maxIndex = null, config = DIVERGENCE_CONFIG) {
    const period = config.PIVOT_PERIOD;
    const effectiveMaxIndex = (maxIndex !== null && maxIndex < values.length)
        ? maxIndex
        : values.length - 1;

    if (values.length < period * 2 + 1) {
        console.warn(`[DIVERGENCE] ⚠️ طول آرایه (${values.length}) برای دوره پیوت ${period} کافی نیست.`);
        return [];
    }

    const pivots = [];
    console.log(`[DIVERGENCE] 🔍 شروع جستجوی پیوت‌ها در ${values.length} نقطه با دوره ${period} (maxIndex=${effectiveMaxIndex})...`);

    // اصلاح آینده‌نگری: حلقه فقط تا جایی پیش می‌رود که i + period از effectiveMaxIndex
    // عبور نکند — یعنی پیوت i فقط وقتی بررسی می‌شود که کندل i+period قبلاً اتفاق افتاده باشد.
    const loopEnd = Math.min(values.length - period - 1, effectiveMaxIndex - period);

    for (let i = period; i <= loopEnd; i++) {
        const current = values[i];
        if (current === null || current === undefined) continue;

        let isHigh = true;
        let isLow = true;

        for (let j = 1; j <= period; j++) {
            const leftVal = values[i - j];
            const rightVal = values[i + j];

            if (leftVal === null || rightVal === null) {
                isHigh = isLow = false;
                break;
            }

            if (leftVal >= current || rightVal >= current) isHigh = false;
            if (leftVal <= current || rightVal <= current) isLow = false;
        }

        if (isHigh) {
            pivots.push({ index: i, value: current, type: 'high' });
        }
        if (isLow) {
            pivots.push({ index: i, value: current, type: 'low' });
        }
    }

    const highCount = pivots.filter(p => p.type === 'high').length;
    const lowCount = pivots.filter(p => p.type === 'low').length;
    console.log(`[DIVERGENCE] ✅ ${pivots.length} پیوت یافت شد. (High: ${highCount}, Low: ${lowCount})`);

    if (config.VERBOSE_LOGGING && pivots.length > 0) {
        console.log('[DIVERGENCE] 📋 نمونه پیوت‌ها:', pivots.slice(0, 5).map(p =>
            `[${p.index}] ${p.type}=${p.value.toFixed(4)}`
        ));
    }

    return pivots;
}

// ======================== بخش ۵: تابع اصلی تشخیص واگرایی ========================
/**
 * تشخیص واگرایی بین سری قیمت و سری اندیکاتور — نسخه‌ی اصلاح‌شده.
 *
 * دو اصلاح اصلی نسبت به نسخه‌ی قبلی:
 *
 * ۱) رفع آینده‌نگری: maxIndex (آخرین کندلی که در لحظه‌ی فعلی واقعاً دیده شده) به
 *    findPivots پاس داده می‌شود تا هیچ پیوتی که به کندل‌های آینده نیاز دارد ساخته نشود.
 *
 * ۲) انتخاب «بهترین واگرایی»: نسخه‌ی قبلی فقط هر پیوت را با دقیقاً پیوت هم‌نوع
 *    بلافاصله‌ی قبلی مقایسه می‌کرد (p[i] با p[i+1])، که می‌توانست واگرایی‌های قوی‌تر
 *    و معتبرتر با پیوت‌های کمی دورتر را از قلم بیندازد. الان برای هر پیوت جدید (p2)،
 *    تا LOOKBACK_PIVOTS پیوت هم‌نوع قبلی به‌عنوان کاندیدای p1 بررسی می‌شوند و از بین
 *    کاندیدهای معتبر، انتخاب نهایی با یک الگوریتم دو مرحله‌ای انجام می‌شود:
 *      مرحله‌ی الف) فیلتر نزدیک‌ترین‌ها — فقط کاندیدهایی که فاصله‌شان از p2 حداکثر
 *        (نزدیک‌ترین فاصله‌ی موجود × NEAREST_WINDOW_RATIO) است نگه داشته می‌شوند.
 *      مرحله‌ی ب) از بین آن‌ها، کاندیدی با بیشترین اختلاف قدرمطلق شیب قیمت/اندیکاتور
 *        (یعنی قوی‌ترین واگرایی) انتخاب می‌شود.
 *
 * @param {Array} priceData - آرایه کندل‌ها (هر کندل شامل close)
 * @param {Array<number>} indicatorValues - آرایه مقادیر اندیکاتور (باید هم‌طول priceData باشد)
 * @param {string} indicatorType - نوع اندیکاتور ('RSI' یا 'MACD') برای لاگینگ
 * @param {number|null} maxIndex - آخرین اندیس قابل‌مشاهده در لحظه‌ی فعلی (برای جلوگیری از آینده‌نگری).
 *                                  اگر null باشد، کل آرایه به‌عنوان داده‌ی قطعی تاریخی در نظر گرفته می‌شود.
 * @returns {Array} سیگنال‌های واگرایی یافت شده (یک سیگنال نهایی برای هر پیوت جدید، نه برای هر جفت ممکن)
 */
function detectDivergence(priceData, indicatorValues, indicatorType = 'UNKNOWN', maxIndex = null, config = DIVERGENCE_CONFIG, recentPivotsWindow = null) {
    console.log(`[DIVERGENCE] 🚀 [${indicatorType}] شروع فرآیند تشخیص واگرایی...`);
    console.log(`[DIVERGENCE] 📊 [${indicatorType}] طول داده قیمت: ${priceData.length}, طول داده اندیکاتور: ${indicatorValues.length}`);

    // ----- اعتبارسنجی اولیه -----
    if (!priceData || !indicatorValues) {
        console.error(`[DIVERGENCE] ❌ [${indicatorType}] داده‌های ورودی نامعتبر هستند.`);
        return [];
    }

    if (priceData.length !== indicatorValues.length) {
        console.error(`[DIVERGENCE] ❌ [${indicatorType}] عدم تطابق طول داده‌ها: قیمت ${priceData.length}, اندیکاتور ${indicatorValues.length}`);
        return [];
    }

    // ----- استخراج قیمت‌های بسته -----
    const closePrices = priceData.map(c => c.close);

    // ----- یافتن پیوت‌ها (بدون آینده‌نگری) -----
    const pricePivots = findPivots(closePrices, maxIndex, config);
    const indicatorPivots = findPivots(indicatorValues, maxIndex, config);

    if (pricePivots.length < 2 || indicatorPivots.length < 2) {
        console.warn(`[DIVERGENCE] ⚠️ [${indicatorType}] تعداد پیوت‌ها برای تحلیل واگرایی کافی نیست.`);
        return [];
    }

    const signals = [];
    const maxBars = config.MAX_DIVERGENCE_BARS;
    const tolerance = config.PIVOT_ALIGNMENT_TOLERANCE;
    const lookback = config.LOOKBACK_PIVOTS;
    const nearestWindowRatio = config.NEAREST_WINDOW_RATIO;
    const minDiff = config.MIN_SLOPE_DIFFERENCE;

    console.log(`[DIVERGENCE] 🔗 [${indicatorType}] شروع تطبیق پیوت‌ها (lookback=${lookback}, تلورانس=${tolerance}, حداکثر فاصله=${maxBars})...`);

    // تابع کمکی: تشخیص نوع واگرایی بر اساس نوع پیوت و دو شیب
    function classifyDivergence(pivotType, priceSlope, indSlope) {
        const priceRising = priceSlope > minDiff;
        const priceFalling = priceSlope < -minDiff;
        const indRising = indSlope > minDiff;
        const indFalling = indSlope < -minDiff;

        if (pivotType === 'low') {
            if (priceFalling && indRising) return 'RegularBullish';
            if (priceRising && indFalling) return 'HiddenBullish';
        } else if (pivotType === 'high') {
            if (priceRising && indFalling) return 'RegularBearish';
            if (priceFalling && indRising) return 'HiddenBearish';
        }
        return null;
    }

    // ----- برای هر پیوت جدید (p2)، تمام کاندیدهای معتبر p1 را جمع کن، سپس بهترین را انتخاب کن -----
    //
    // بهینه‌سازی مهم (اصلاح دومِ مشکل کارایی، مکمل precomputeIndicator بالا):
    // قبلاً این حلقه از idx2=1 تا انتهای pricePivots اجرا می‌شد — یعنی هر بار که این تابع
    // برای یک کندل جدید صدا زده می‌شود (که در حلقه‌ی بک‌تست یعنی برای هر کندل)، سیگنال تمام
    // پیوت‌های تاریخی (نه فقط پیوت تازه) از نو محاسبه می‌شد. چون pricePivots.length هم با
    // بزرگ‌تر شدن دیتاست رشد می‌کند، هزینه‌ی کل این حلقه در طول کل بک‌تست O(n) اضافه به ازای
    // هر کندل، یعنی مجموعاً O(n²) فقط برای همین بخش (روی O(n) بازمحاسبه‌ی findPivots که خودش
    // O(n) است) می‌شود — که در عمل به O(n³) کلی منتهی می‌شد و باعث می‌شد حتی بعد از حذف
    // بازمحاسبه‌ی RSI/MACD، دیتاست‌های چند-ده-هزار-کندلی (مثلاً چند ماه داده‌ی ۱ دقیقه‌ای)
    // عملاً هرگز تمام نشوند.
    //
    // پیوت‌های قدیمی هیچ‌وقت با اضافه‌شدن کندل‌های جدید تغییر نمی‌کنند (غیر آینده‌نگرند) و
    // سیگنال‌شان از فراخوانی‌های قبلی (با maxIndex کوچک‌تر) قبلاً به استراتژی رسیده است؛ تنها
    // پیوت(های) *تازه* (نزدیک انتهای pricePivots) می‌توانند برای کندل جاری معنادار باشند. پس
    // وقتی recentPivotsWindow داده شود، فقط همان تعداد پیوت آخر پردازش می‌شود (پیش‌فرض null =
    // پردازش کامل تاریخچه، دقیقاً رفتار قبلی — برای فراخوانی‌های one-shot/تاریخی کامل که
    // recentPivotsWindow نمی‌دهند، هیچ تغییری در خروجی رخ نمی‌دهد).
    const idx2Start = (Number.isInteger(recentPivotsWindow) && recentPivotsWindow > 0)
        ? Math.max(1, pricePivots.length - recentPivotsWindow)
        : 1;

    for (let idx2 = idx2Start; idx2 < pricePivots.length; idx2++) {
        const p2 = pricePivots[idx2];

        // پیوت متناظر p2 در اندیکاتور (لازم برای همه‌ی کاندیدها یکسان است)
        const i2 = indicatorPivots.find(p =>
            p.type === p2.type && Math.abs(p.index - p2.index) <= tolerance
        );
        if (!i2) {
            if (config.VERBOSE_LOGGING) {
                console.log(`[DIVERGENCE] ⏭️ [${indicatorType}] رد پیوت ${p2.index}: پیوت متناظر در اندیکاتور یافت نشد.`);
            }
            continue;
        }

        // جمع‌آوری کاندیدهای p1 از بین تا lookback پیوت هم‌نوع قبلی
        const candidates = [];
        let sameTypeSeen = 0;
        for (let idx1 = idx2 - 1; idx1 >= 0 && sameTypeSeen < lookback; idx1--) {
            const p1 = pricePivots[idx1];
            if (p1.type !== p2.type) continue;
            sameTypeSeen++;

            const distance = p2.index - p1.index;
            if (distance > maxBars) continue; // فاصله بیش از حد مجاز

            const i1 = indicatorPivots.find(p =>
                p.type === p1.type && Math.abs(p.index - p1.index) <= tolerance
            );
            if (!i1) continue;

            const priceSlope = (p2.value - p1.value) / (p2.index - p1.index);
            const indSlope = (i2.value - i1.value) / (i2.index - i1.index);

            const divergenceType = classifyDivergence(p1.type, priceSlope, indSlope);
            if (!divergenceType) continue;

            candidates.push({
                p1, i1, distance,
                priceSlope, indSlope,
                divergenceType,
                // قدرت واگرایی: اختلاف قدرمطلق دو شیب (هرچه بیشتر، واگرایی واضح‌تر)
                strength: Math.abs(priceSlope - indSlope)
            });
        }

        if (candidates.length === 0) {
            if (config.VERBOSE_LOGGING) {
                console.log(`[DIVERGENCE] ⏭️ [${indicatorType}] هیچ کاندیدای معتبری برای پیوت ${p2.index} یافت نشد.`);
            }
            continue;
        }

        // مرحله‌ی الف: فیلتر نزدیک‌ترین‌ها
        const minDistance = Math.min(...candidates.map(c => c.distance));
        const nearestWindow = minDistance * nearestWindowRatio;
        const nearestCandidates = candidates.filter(c => c.distance <= nearestWindow);

        // مرحله‌ی ب: از بین نزدیک‌ترین‌ها، قوی‌ترین (بیشترین اختلاف شیب) را انتخاب کن
        const best = nearestCandidates.reduce((a, b) => (b.strength > a.strength ? b : a));

        if (config.VERBOSE_LOGGING) {
            console.log(`[DIVERGENCE] 🔎 [${indicatorType}] پیوت ${p2.index}: ${candidates.length} کاندید، ${nearestCandidates.length} نزدیک‌ترین، انتخاب نهایی p1=${best.p1.index} (قدرت=${best.strength.toFixed(6)})`);
        }

        const signal = {
            type: best.divergenceType,
            signal: best.divergenceType.includes('Bullish') ? 'BUY' : 'SELL',
            pricePoints: [best.p1, p2],
            indicatorPoints: [best.i1, i2],
            startIndex: best.p1.index,
            endIndex: p2.index,
            priceSlope: best.priceSlope,
            indicatorSlope: best.indSlope,
            strength: best.strength,
            candidatesConsidered: candidates.length,
            indicatorType: indicatorType
        };
        signals.push(signal);

        const emoji = signal.signal === 'BUY' ? '🟢' : '🔴';
        console.log(`[DIVERGENCE] ${emoji} [${indicatorType}] ${signal.type} یافت شد و ثبت شد. شروع: ${signal.startIndex}, پایان: ${signal.endIndex}, قدرت: ${best.strength.toFixed(6)}`);
    }

    console.log(`[DIVERGENCE] 🏁 [${indicatorType}] تشخیص واگرایی به پایان رسید. ${signals.length} سیگنال یافت شد.`);
    return signals;
}

// ======================== کش محاسبات واگرایی (رفع اصلی مشکل O(n²)/OOM) ========================
//
// ریشه‌ی مشکل OOM در بک‌تست‌های واگرایی‌دار: backtest-core.js به‌ازای *هر کندل* (i=0..n)
// این تابع را دوباره صدا می‌زد، و هر بار RSI/MACD را از صفر روی کل marketData محاسبه
// می‌کرد، findPivots را دوباره روی کل آرایه اجرا می‌کرد، و حلقه‌ی تطبیق پیوت‌ها را هم
// از نو روی *همه‌ی* پیوت‌های تاریخی طی می‌کرد. این می‌شود O(n) کار در هر کندل، برای n
// کندل، یعنی O(n²) کل — و چون هر بار آرایه‌های جدید (RSI، MACD، پیوت‌ها) هم تخصیص داده
// می‌شوند، فشار GC به‌سرعت به heap limit می‌رسد (دقیقاً همان خطای FATAL ERROR که در لاگ‌ها
// دیده شد).
//
// راه‌حل: RSI/MACD «کاملاً causal» هستند — مقدار هر اندیس فقط به کندل‌های 0..آن اندیس
// وابسته است، نه به آینده. پیوت‌ها هم فقط به PIVOT_PERIOD کندل قبل/بعدشان وابسته‌اند
// (نگاه کنید به findPivots) و هرگز با اضافه‌شدن داده‌ی جدید عقب‌گرد نمی‌کنند. و در حلقه‌ی
// تطبیق سیگنال (detectDivergence)، انتخاب بهترین p1 برای هر p2 فقط به پیوت‌های *قبل* از
// p2 نگاه می‌کند، نه بعدش — یعنی سیگنال هر p2 با اضافه‌شدن پیوت‌های جدیدتر هرگز تغییر
// نمی‌کند. پس می‌شود کل زنجیره (RSI/MACD → پیوت‌ها → سیگنال‌ها) را فقط *یک‌بار* با
// maxIndex=null (یعنی «همه‌چی به‌عنوان گذشته‌ی قطعی») محاسبه کرد، و برای هر maxIndex
// درخواستی در طول بک‌تست، فقط سیگنال‌هایی را که واقعاً تا آن لحظه در دسترس بوده‌اند
// (بدون آینده‌نگری) فیلتر کرد. این معادل ریاضی دقیق رفتار قبلی است (چون شرط دید‌پذیری هر
// پیوت/سیگنال محلی و یک‌طرفه است)، اما هزینه را از O(n²) به O(n) (یک‌بار محاسبه) + O(k)
// فیلتر به‌ازای هر کندل (k = تعداد سیگنال‌ها، خیلی کوچک‌تر از n) کاهش می‌دهد.
//
// کش با WeakMap روی خودِ آرایه‌ی marketData کلید می‌خورد — یعنی وقتی بک‌تست یک فایل/نماد
// تمام شد و رفرنس marketData آن از بین رفت، ورودی کش هم به‌طور خودکار توسط GC آزاد
// می‌شود (نشتی حافظه‌ای بین اجراهای مختلف ایجاد نمی‌کند).
const __divergenceFullCache = new WeakMap();

function __buildConfigCacheKey(config) {
    // فقط کلیدهایی که واقعاً روی خروجی محاسبات اثر می‌گذارند (نه VERBOSE_LOGGING و مشابه)
    return JSON.stringify({
        RSI_PERIOD: config.RSI_PERIOD,
        MACD_FAST_PERIOD: config.MACD_FAST_PERIOD,
        MACD_SLOW_PERIOD: config.MACD_SLOW_PERIOD,
        MACD_SIGNAL_PERIOD: config.MACD_SIGNAL_PERIOD,
        MACD_USE_HISTOGRAM: config.MACD_USE_HISTOGRAM,
        PIVOT_PERIOD: config.PIVOT_PERIOD,
        MAX_DIVERGENCE_BARS: config.MAX_DIVERGENCE_BARS,
        PIVOT_ALIGNMENT_TOLERANCE: config.PIVOT_ALIGNMENT_TOLERANCE,
        LOOKBACK_PIVOTS: config.LOOKBACK_PIVOTS,
        NEAREST_WINDOW_RATIO: config.NEAREST_WINDOW_RATIO,
        MIN_SLOPE_DIFFERENCE: config.MIN_SLOPE_DIFFERENCE
    });
}

/**
 * محاسبه‌ی کامل (RSI/MACD + پیوت‌ها + سیگنال‌های واگرایی) برای یک (marketData, indicator,
 * config) مشخص — فقط یک‌بار انجام می‌شود؛ فراخوانی‌های بعدی همان marketData را مستقیماً
 * از کش برمی‌گردانند (بدون هیچ محاسبه‌ی مجددی).
 */
function getOrComputeFullDivergence(marketData, indicator, config) {
    let perDatasetCache = __divergenceFullCache.get(marketData);
    if (!perDatasetCache) {
        perDatasetCache = new Map();
        __divergenceFullCache.set(marketData, perDatasetCache);
    }

    const cacheKey = indicator + '::' + __buildConfigCacheKey(config);
    if (perDatasetCache.has(cacheKey)) {
        return perDatasetCache.get(cacheKey);
    }

    console.log(`[DIVERGENCE] 🧮 [${indicator}] محاسبه‌ی کامل (یک‌بار برای این دیتاست) — طول: ${marketData.length}`);

    let indicatorValues, indicatorData;
    if (indicator === 'RSI') {
        indicatorValues = calculateRSI(marketData, config.RSI_PERIOD, config);
        indicatorData = indicatorValues;
    } else if (indicator === 'MACD') {
        const fullMACD = calculateFullMACD(marketData, config);
        if (!fullMACD) throw new Error('محاسبه MACD با شکست مواجه شد.');
        indicatorValues = config.MACD_USE_HISTOGRAM ? fullMACD.histogram : fullMACD.macdLine;
        indicatorData = { macdLine: fullMACD.macdLine, signalLine: fullMACD.signalLine, histogram: fullMACD.histogram };
    } else {
        throw new Error(`اندیکاتور "${indicator}" پشتیبانی نمی‌شود. لطفاً از RSI یا MACD استفاده کنید.`);
    }

    // maxIndex=null یعنی «کل داده به‌عنوان گذشته‌ی قطعی» — دقیقاً همان محاسبه‌ای که قبلاً
    // در انتهای بک‌تست (برای گزارش نهایی) هم یک‌بار انجام می‌شد؛ فقط الان همین یک محاسبه
    // برای *تمام* کندل‌های بک‌تست هم استفاده می‌شود، نه اینکه هزاران بار تکرار شود.
    const allSignals = detectDivergence(marketData, indicatorValues, indicator, null, config);

    const period = config.PIVOT_PERIOD;
    for (const sig of allSignals) {
        // اولین اندیسی که این سیگنال بدون آینده‌نگری واقعاً در دسترس می‌شود: باید هر ۴ نقطه
        // (p1, i1, p2, i2) تأیید شده باشند. معمولاً p2/i2 جدیدتر از p1/i1 هستند، اما برای
        // ایمنی کامل max هر ۴ اندیس در نظر گرفته می‌شود (نه فقط endIndex).
        const allPointIndices = [
            sig.startIndex,
            sig.endIndex,
            sig.indicatorPoints?.[0]?.index,
            sig.indicatorPoints?.[1]?.index
        ].filter(v => typeof v === 'number');
        sig.availableFromIndex = Math.max(...allPointIndices) + period;
    }

    const result = { indicatorValues, indicatorData, allSignals };
    perDatasetCache.set(cacheKey, result);
    return result;
}


/**
 * تابع اصلی که باید در Worker صدا زده شود.
 * این تابع هم محاسبات را انجام می‌دهد و هم نتایج را به صورت خودکار به Main Thread ارسال می‌کند.
 *
 * نکته‌ی مهم درباره‌ی آینده‌نگری: خود calculateRSI و calculateFullMACD از قبل برای هر
 * اندیس i فقط از کندل‌های 0..i استفاده می‌کنند (آینده‌نگر نیستند). مشکل فقط در یافتن
 * پیوت‌ها (findPivots/detectDivergence) بود که حالا با پارامتر maxIndex رفع شده است.
 *
 * برای استفاده‌ی صحیح و کاملاً زنده (کندل‌به‌کندل، بدون آینده‌نگری) در بک‌تست:
 *   - این تابع را برای هر کندل i به‌صورت جدا صدا نزنید (پرهزینه و غیرضروری)، بلکه
 *     marketData را تا همان کندل جاری (data.slice(0, i + 1)) بدهید و params.maxIndex
 *     را برابر آخرین اندیس آن برش (یعنی i) قرار دهید.
 *   - اگر marketData کامل (تا انتهای فایل) را می‌دهید ولی هنوز در حال شبیه‌سازی
 *     کندل‌به‌کندل هستید، حتماً params.maxIndex را برابر اندیس کندل «فعلی» ست کنید
 *     تا هیچ پیوتی که به کندل‌های جلوتر از آن نیاز دارد ساخته نشود.
 *   - اگر این تابع را یک‌بار، بعد از پایان کامل بازه‌ی داده (مثلاً برای گزارش تاریخی
 *     نهایی، نه برای تغذیه‌ی customStrategy در حین بک‌تست) صدا می‌زنید، maxIndex را
 *     خالی بگذارید — در آن حالت کل داده «گذشته‌ی قطعی» است و آینده‌نگری معنا ندارد.
 *
 * @param {Object} params - پارامترهای ورودی
 * @param {Array} params.marketData - آرایه کندل‌های بازار
 * @param {string} params.indicator - نوع اندیکاتور ('RSI' یا 'MACD')
 * @param {number|null} [params.maxIndex] - آخرین اندیس قابل‌مشاهده در لحظه‌ی فعلی
 *        (برای استفاده‌ی زنده/کندل‌به‌کندل اجباری است؛ در غیر این صورت null/حذف بگذارید)
 * @param {Function} params.sendMessage - تابع ارسال پیام به Main Thread (مثلاً self.postMessage)
 */
function runDivergenceDetection(params) {
    console.log('[DIVERGENCE] 📬 درخواست اجرای واگرایی دریافت شد.');
    console.log('[DIVERGENCE] 📋 پارامترها:', {
        dataLength: params.marketData?.length,
        indicator: params.indicator,
        maxIndex: params.maxIndex ?? '(null - حالت تاریخی کامل)',
        configOverride: params.config ?? '(هیچ - از DIVERGENCE_CONFIG پیش‌فرض استفاده می‌شود)',
        // اضافه شد: اگر مقادیر اندیکاتور از قبل (یک‌بار، پیش از حلقه) محاسبه و پاس داده شده
        // باشند، این فراخوانی از محاسبه‌ی دوباره‌ی RSI/MACD صرف‌نظر می‌کند (رجوع کنید به
        // توضیح O(n) در پایین). این دقیقاً همان اصلاحی است که مشکل OOM را برای بک‌تست‌های
        // واگرایی روی دیتاست‌های بزرگ/بلندمدت حل می‌کند.
        precomputed: !!(params.precomputedIndicatorValues || params.precomputedIndicatorData)
    });

    try {
        const {
            marketData, indicator, maxIndex = null, config: configOverride = null,
            // اگر داده شوند، از محاسبه‌ی دوباره‌ی RSI/MACD صرف‌نظر می‌شود (بهینه‌سازی O(n²)→O(n))
            precomputedIndicatorValues = null,
            precomputedIndicatorData = null
        } = params;

        // اضافه شد: دقیقاً مثل trendLineSettings/ichimokuSettings در backtest-core.js،
        // حالا می‌شود بدون دست‌زدن به این فایل، یک آبجکت جزئی (فقط همان کلیدهایی که
        // می‌خواهید عوض شود) در params.config پاس داد و برای همین یک فراخوانی، مقادیر
        // DIVERGENCE_CONFIG (مثلاً PIVOT_PERIOD، RSI_PERIOD، LOOKBACK_PIVOTS، ...) را
        // بازنویسی کرد. این یک کپی محلی است، نه تغییر متغیر سراسری DIVERGENCE_CONFIG —
        // یعنی فراخوانی‌های دیگر (یا استراتژی‌هایی که config پاس نمی‌دهند) کاملاً
        // دست‌نخورده و با همان رفتار قبلی می‌مانند.
        const effectiveConfig = configOverride
            ? Object.assign({}, DIVERGENCE_CONFIG, configOverride)
            : DIVERGENCE_CONFIG;

        if (configOverride) {
            console.log('[DIVERGENCE] ⚙️ config سفارشی برای این فراخوانی اعمال شد:', effectiveConfig);
        }

        if (!marketData || marketData.length === 0) {
            throw new Error('marketData خالی یا نامعتبر است.');
        }

        // ===== رفع اصلی مشکل OOM =====
        // به‌جای محاسبه‌ی RSI/MACD + پیوت‌ها + سیگنال‌ها از صفر در *هر* فراخوانی (که در حلقه‌ی
        // بک‌تست یعنی به‌ازای هر کندل)، این‌جا فقط یک‌بار برای هر (marketData, indicator,
        // effectiveConfig) محاسبه می‌شود و در فراخوانی‌های بعدی مستقیماً از کش خوانده می‌شود.
        // (params.precomputedIndicatorValues/precomputedIndicatorData دیگر لازم نیست چون کش
        // داخلی خودش این کار را انجام می‌دهد؛ اگر داده شوند هم نادیده گرفته نمی‌شوند بلکه صرفاً
        // زائد هستند — برای سازگاری با کدهای قدیمی‌تر که آن‌ها را پاس می‌دادند حذفشان نکردیم.)
        const { indicatorValues, indicatorData, allSignals } = getOrComputeFullDivergence(marketData, indicator, effectiveConfig);

        // فیلتر بر اساس maxIndex: فقط سیگنال‌هایی که واقعاً تا این لحظه (بدون آینده‌نگری)
        // در دسترس بوده‌اند. maxIndex=null یعنی «کل تاریخچه‌ی قطعی» → همه‌ی سیگنال‌ها.
        const signals = (maxIndex === null || maxIndex === undefined)
            ? allSignals
            : allSignals.filter(s => s.availableFromIndex <= maxIndex);

        // ۳. آماده‌سازی سیگنال‌ها برای ارسال
        const serializableSignals = signals.map(s => ({
            type: s.type,
            signal: s.signal,
            startIndex: s.startIndex,
            endIndex: s.endIndex,
            priceStart: s.pricePoints[0].value,
            priceEnd: s.pricePoints[1].value,
            indStart: s.indicatorPoints[0].value,
            indEnd: s.indicatorPoints[1].value,
            startTime: marketData[s.startIndex].timestamp,
            endTime: marketData[s.endIndex].timestamp,
            indicatorType: s.indicatorType
        }));

        console.log(`[DIVERGENCE] ✅ عملیات موفق. ارسال ${serializableSignals.length} سیگنال و داده‌های اندیکاتور به Main Thread.`);

        // ۴. ارسال پیام موفقیت
        if (params.sendMessage) {
            params.sendMessage({
                type: 'DIVERGENCE_RESULT',
                payload: {
                    success: true,
                    signals: serializableSignals,
                    indicatorData: indicatorData,
                    indicatorUsed: indicator,
                    config: effectiveConfig,
                    stats: {
                        totalSignals: signals.length,
                        bullish: signals.filter(s => s.signal === 'BUY').length,
                        bearish: signals.filter(s => s.signal === 'SELL').length,
                        regularBullish: signals.filter(s => s.type === 'RegularBullish').length,
                        hiddenBullish: signals.filter(s => s.type === 'HiddenBullish').length,
                        regularBearish: signals.filter(s => s.type === 'RegularBearish').length,
                        hiddenBearish: signals.filter(s => s.type === 'HiddenBearish').length
                    }
                }
            });
        }

        // ✅ فقط در صورت خطا پیام DIVERGENCE_ERROR ارسال می‌شود
        return signals;

    } catch (error) {
        console.error('[DIVERGENCE] 💥 خطای بحرانی در اجرای واگرایی:', error);

        // ارسال خطا به Main Thread فقط در صورت بروز خطا
        if (params.sendMessage) {
            params.sendMessage({
                type: 'DIVERGENCE_ERROR',
                payload: {
                    success: false,
                    error: error.message,
                    stack: error.stack
                }
            });
        }

        return [];
    }
}

/**
 * mergeDivergenceConfig: یک config مؤثر (effective) از ترکیب DIVERGENCE_CONFIG پیش‌فرض
 * و یک آبجکت جزئی override می‌سازد — بدون تغییر DIVERGENCE_CONFIG سراسری.
 * دقیقاً همان منطق merge داخل runDivergenceDetection، برای استفاده‌ی خارجی (مثلاً در
 * backtest-core.js پیش از حلقه‌ی اصلی، برای پیش‌محاسبه‌ی batch اندیکاتورها).
 */
function mergeDivergenceConfig(overrides) {
    return overrides ? Object.assign({}, DIVERGENCE_CONFIG, overrides) : DIVERGENCE_CONFIG;
}

/**
 * precomputeIndicator: RSI یا MACD را یک‌بار برای کل marketData محاسبه می‌کند.
 *
 * چرا این تابع لازم بود: قبلاً runDivergenceDetection در هر فراخوانی (یعنی برای هر
 * کندل در حلقه‌ی بک‌تست، چون divergenceRecomputeInterval پیش‌فرض ۱ است) کل RSI/MACD را
 * از صفر روی تمام marketData دوباره محاسبه می‌کرد؛ برای n کندل این یعنی O(n²) کار و
 * تخصیص مکرر آرایه‌های بزرگ موقتی — دقیقاً همان چیزی که باعث «JavaScript heap out of
 * memory» در بک‌تست‌های طولانی/چندفایلی می‌شد (بر خلاف خطوط روند که با
 * precomputeTrendLinesBatch از قبل یک‌بار محاسبه می‌شوند).
 *
 * RSI و MACD هر دو اندیکاتور کاملاً causal هستند (مقدار هر ایندکس فقط از کندل‌های
 * تا همان ایندکس به دست می‌آید، نه از کندل‌های بعدی)، پس محاسبه‌ی یک‌باره‌ی کل آرایه و
 * سپس خواندن مقدار هر ایندکس در ادامه‌ی حلقه، دقیقاً همان مقادیری را می‌دهد که قبلاً با
 * محاسبه‌ی جداگانه به‌ازای هر maxIndex به دست می‌آمد — هیچ آینده‌نگری‌ای اضافه نمی‌شود و
 * خروجی (سیگنال‌های واگرایی) بیت‌به‌بیت یکسان می‌ماند؛ فقط کار تکراری حذف می‌شود.
 *
 * خروجی را در `precomputedIndicatorValues` (برای RSI) یا `precomputedIndicatorData`
 * (برای MACD) به runDivergenceDetection پاس بدهید تا از محاسبه‌ی دوباره صرف‌نظر شود.
 */
function precomputeIndicator(marketData, indicator, config = DIVERGENCE_CONFIG) {
    if (indicator === 'RSI') {
        return calculateRSI(marketData, config.RSI_PERIOD, config);
    } else if (indicator === 'MACD') {
        const fullMACD = calculateFullMACD(marketData, config);
        if (!fullMACD) {
            throw new Error('محاسبه MACD با شکست مواجه شد.');
        }
        return fullMACD; // { macdLine, signalLine, histogram }
    }
    throw new Error(`اندیکاتور "${indicator}" پشتیبانی نمی‌شود. لطفاً از RSI یا MACD استفاده کنید.`);
}

// ======================== بخش ۷: اکسپورت برای محیط Worker ========================
if (typeof self !== 'undefined') {
    self.DivergenceDetector = {
        run: runDivergenceDetection,
        config: DIVERGENCE_CONFIG,
        utils: {
            calculateRSI,
            calculateMACD,
            calculateFullMACD,
            findPivots
        }
    };
    console.log('[DIVERGENCE] 📦 ماژول در self (Worker) بارگذاری شد. (پشتیبانی از RSI و MACD)');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runDivergenceDetection,
        calculateRSI,
        calculateMACD,
        calculateFullMACD,
        findPivots,
        DIVERGENCE_CONFIG,
        // اضافه شد: برای بهینه‌سازی batch (رجوع کنید به توضیح بالای precomputeIndicator)
        precomputeIndicator,
        mergeDivergenceConfig
    };
    console.log('[DIVERGENCE] 📦 ماژول در module.exports (Node.js) بارگذاری شد. (پشتیبانی از RSI و MACD)');
}
