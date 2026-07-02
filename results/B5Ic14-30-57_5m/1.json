/**
 * @filename B5Ic14-30-57.js
 * @description خرید با تایید ایچیموکو (14,30,57)، شکست خط روند نزولی با شرایط دقیق، و حد ضرر پلکانی ۱۵ مرحله‌ای
 * @version 1.0
 */

// ============================================================
//  بخش تنظیمات (ANALYSIS_CONFIG)
// ============================================================
const ANALYSIS_CONFIG = {
    ichimoku: {
        enabled: true,
        tenkanPeriod: 14,
        kijunPeriod: 30,
        senkouBPeriod: 57,
        useCloudFilter: true,    // بررسی قیمت بالای ابر
        useTKCross: true,        // بررسی تنکان بالای کیجون
        useChikou: false         // نیازی به چیکو نداریم
    },
    trendLines: {
        pivotPeriod: 5,          // دوره تشخیص پیوت (۵ کندل قبل و بعد)
        minTouchPoints: 3,       // حداقل برخورد با خط برای اعتبار
        minCandleDistance: 3,    // حداقل فاصله کندلی بین برخوردها
        precision: 0.001         // حداکثر انحراف مجاز (۰.۱٪)
    }
};

// ============================================================
//  پارامترهای مدیریت ریسک (طبق بخش ۹ راهنما)
// ============================================================
const STOP_LOSS_PERCENT = 0.5;        // حد ضرر اولیه ۰.۵٪ برای استفاده در کد
const stopLossInitial = 0.5;          // برای اسکریپت aggregate-results.js

// ============================================================
//  State برای ذخیره‌ی خطوط شکسته‌شده (جلوگیری از تکرار)
// ============================================================
const brokenLines = new Set();

// ============================================================
//  تابع اصلی استراتژی
// ============================================================
function customStrategy(data, index, breakPointsParam, ichimokuParam) {
    // ------------------------------------------------------------
    // ۱. اعتبارسنجی داده‌های ایچیموکو
    // ------------------------------------------------------------
    if (!ichimokuParam) return null;
    if (ichimokuParam.kumoTop === null || ichimokuParam.kumoBottom === null) return null;
    if (ichimokuParam.tenkan === 0 || ichimokuParam.kijun === 0) return null;

    // شرط ایچیموکو: قیمت بالای ابر باشد
    if (!ichimokuParam.isPriceAboveCloud) return null;

    // شرط ایچیموکو: تنکان بالای کیجون باشد
    if (!ichimokuParam.isTenkanAboveKijun) return null;

    // ------------------------------------------------------------
    // ۲. دریافت خطوط روند و فیلتر خطوط نزولی
    // ------------------------------------------------------------
    const allLines = getTrendLines(); // تابع تزریق‌شده توسط سیستم
    if (!allLines || allLines.length === 0) return null;

    // فقط خطوط نزولی (شیب منفی)
    const descendingLines = allLines.filter(line => {
        const slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
        return slope < 0;
    });
    if (descendingLines.length === 0) return null;

    // ------------------------------------------------------------
    // ۳. بررسی شکست خطوط با شرایط دقیق
    // ------------------------------------------------------------
    let bestLine = null;
    let bestDiff = Infinity;

    for (const line of descendingLines) {
        // محاسبه مقدار خط در کندل جاری و قبلی
        const lineValueCurrent = calculateTrendLineValue(line, index);
        const lineValuePrev = calculateTrendLineValue(line, index - 1);

        const high = data[index].high;
        const low = data[index].low;
        const lowPrev = data[index - 1].low;

        // شرایط شکست:
        // - بالاترین قیمت کندل حداقل ۰.۰۹٪ بالای خط باشد
        const isHighAbove = high >= lineValueCurrent * (1 + 0.0009);
        // - پایین‌ترین قیمت کندل حداکثر ۰.۱۵٪ بالای خط باشد
        const isLowBelow = low <= lineValueCurrent * (1 + 0.0015);
        // - کندل جاری بالای خط بسته شود
        const isLowAboveLine = low > lineValueCurrent;
        // - کندل قبلی زیر خط بوده باشد (شکست از پایین به بالا)
        const isPrevBelow = lowPrev < lineValuePrev;

        if (!isHighAbove || !isLowBelow || !isLowAboveLine || !isPrevBelow) continue;

        // محاسبه درصد فاصله high از خط (برای انتخاب بهترین خط)
        const diffPercent = ((high - lineValueCurrent) / high) * 100;
        const diffFromTarget = Math.abs(diffPercent - 0.12); // نزدیک‌ترین به ۰.۱۲٪

        if (diffFromTarget < bestDiff) {
            bestDiff = diffFromTarget;
            bestLine = line;
        }
    }

    if (!bestLine) return null;

    // ------------------------------------------------------------
    // ۴. جلوگیری از تکرار شکست در همان خط
    // ------------------------------------------------------------
    const lineId = bestLine.lineId;
    if (brokenLines.has(lineId)) return null;

    // ------------------------------------------------------------
    // ۵. صدور سیگنال خرید با مدیریت ریسک کامل
    // ------------------------------------------------------------
    // قیمت ورود: طبق بخش ۴.۱ راهنما، باید از open کندل جاری باشد
    const entryPrice = data[index].open;
    
    // محاسبه حد ضرر اولیه بر اساس close (طبق درخواست شما)
    // نکته: راهنما فقط برای price محدودیت open دارد، stopLoss می‌تواند هر عددی باشد
    const closePrice = data[index].close;
    const stopLossPrice = closePrice * (1 - STOP_LOSS_PERCENT / 100); // ۰.۵٪ پایین‌تر از close

    // تعریف ۱۵ مرحله حد ضرر پلکانی
    const stopLossStages = [
        { movePercent: 0.4, stopLossPercent: 0.4 },
        { movePercent: 0.8, stopLossPercent: 0.7 },
        { movePercent: 1.1, stopLossPercent: 0.9 },
        { movePercent: 1.3, stopLossPercent: 1.1 },
        { movePercent: 1.5, stopLossPercent: 1.3 },
        { movePercent: 1.7, stopLossPercent: 1.5 },
        { movePercent: 2.0, stopLossPercent: 1.7 },
        { movePercent: 2.3, stopLossPercent: 2.0 },
        { movePercent: 2.5, stopLossPercent: 2.3 },
        { movePercent: 3.0, stopLossPercent: 2.8 },
        { movePercent: 4.0, stopLossPercent: 3.5 },
        { movePercent: 5.0, stopLossPercent: 4.5 },
        { movePercent: 6.0, stopLossPercent: 5.5 },
        { movePercent: 7.0, stopLossPercent: 6.5 },
        { movePercent: 8.0, stopLossPercent: 7.5 }
    ];

    // ثبت خط به عنوان شکسته‌شده
    brokenLines.add(lineId);

    // برگرداندن سیگنال مطابق بخش ۵.۱ و ۶ راهنما
    return {
        signal: 'BUY',                                 // سیگنال خرید
        price: entryPrice,                            // قیمت ورود از open (اجباری)
        stopLoss: stopLossPrice,                      // حد ضرر اولیه
        useStagedStopLoss: true,                      // فعال‌سازی حد ضرر پلکانی
        stopLossStages: stopLossStages,               // مراحل ۱۵‌گانه
        trailingStop: true                            // طبق چک‌لیست بخش ۱۱
    };
}
