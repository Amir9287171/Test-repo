/**
 * @filename B4Ic14-30-57.js
 * @description خرید با تایید ایچیموکو (14,30,57)، شکست خط روند نزولی با شرایط دقیق، حد ضرر اولیه ۰.۴٪، و حد ضرر پلکانی ۳۵ مرحله‌ای تا ۵۰٪ (حداکثر اختلاف ۲٪)
 * @version 2.0
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
        useCloudFilter: true,
        useTKCross: true,
        useChikou: false
    },
    trendLines: {
        pivotPeriod: 5,
        minTouchPoints: 3,
        minCandleDistance: 3,
        precision: 0.001
    }
};

// ============================================================
//  پارامترهای مدیریت ریسک (طبق بخش ۹ راهنما)
// ============================================================
const STOP_LOSS_PERCENT = 0.4;        // حد ضرر اولیه ۰.۴٪
const stopLossInitial = 0.4;          // برای اسکریپت aggregate-results.js

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

    // شرایط ایچیموکو: قیمت بالای ابر و تنکان بالای کیجون
    if (!ichimokuParam.isPriceAboveCloud) return null;
    if (!ichimokuParam.isTenkanAboveKijun) return null;

    // ------------------------------------------------------------
    // ۲. دریافت خطوط روند و فیلتر خطوط نزولی
    // ------------------------------------------------------------
    const allLines = getTrendLines();
    if (!allLines || allLines.length === 0) return null;

    const descendingLines = allLines.filter(line => {
        const slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
        return slope < 0;
    });
    if (descendingLines.length === 0) return null;

    // ------------------------------------------------------------
    // ۳. بررسی شکست خطوط با شرایط دقیق و انتخاب بهترین خط
    // ------------------------------------------------------------
    let bestLine = null;
    let bestDiff = Infinity;

    for (const line of descendingLines) {
        const lineValueCurrent = calculateTrendLineValue(line, index);
        const lineValuePrev = calculateTrendLineValue(line, index - 1);

        const high = data[index].high;
        const low = data[index].low;
        const lowPrev = data[index - 1].low;

        // شرایط شکست:
        // - high حداقل ۰.۰۹٪ بالای خط
        // - low حداکثر ۰.۱۵٪ بالای خط (و بالای خود خط)
        // - کندل قبلی زیر خط (تأیید شکست از پایین به بالا)
        const isHighAbove = high >= lineValueCurrent * (1 + 0.0009);
        const isLowBelow = low <= lineValueCurrent * (1 + 0.0015);
        const isLowAboveLine = low > lineValueCurrent;
        const isPrevBelow = lowPrev < lineValuePrev;

        if (!isHighAbove || !isLowBelow || !isLowAboveLine || !isPrevBelow) continue;

        // نزدیک‌ترین به ۰.۱۲٪
        const diffPercent = ((high - lineValueCurrent) / high) * 100;
        const diffFromTarget = Math.abs(diffPercent - 0.12);

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
    const entryPrice = data[index].open;
    const closePrice = data[index].close;
    const stopLossPrice = closePrice * (1 - STOP_LOSS_PERCENT / 100);

    // ۳۵ مرحله حد ضرر پلکانی با اختلاف ≤ ۲٪ (تا ۵۰٪ حرکت)
    const stopLossStages = [
        { movePercent: 0.5, stopLossPercent: 0.4 },
        { movePercent: 1.0, stopLossPercent: 0.8 },
        { movePercent: 1.5, stopLossPercent: 1.2 },
        { movePercent: 2.0, stopLossPercent: 1.6 },
        { movePercent: 2.5, stopLossPercent: 2.0 },
        { movePercent: 3.0, stopLossPercent: 2.4 },
        { movePercent: 3.5, stopLossPercent: 2.8 },
        { movePercent: 4.0, stopLossPercent: 3.2 },
        { movePercent: 4.5, stopLossPercent: 3.6 },
        { movePercent: 5.0, stopLossPercent: 4.0 },
        { movePercent: 6.0, stopLossPercent: 4.8 },
        { movePercent: 7.0, stopLossPercent: 5.6 },
        { movePercent: 8.0, stopLossPercent: 6.4 },
        { movePercent: 9.0, stopLossPercent: 7.2 },
        { movePercent: 10.0, stopLossPercent: 8.0 },
        { movePercent: 12.0, stopLossPercent: 10.0 },
        { movePercent: 14.0, stopLossPercent: 12.0 },
        { movePercent: 16.0, stopLossPercent: 14.0 },
        { movePercent: 18.0, stopLossPercent: 16.0 },
        { movePercent: 20.0, stopLossPercent: 18.0 },
        { movePercent: 22.0, stopLossPercent: 20.0 },
        { movePercent: 24.0, stopLossPercent: 22.0 },
        { movePercent: 26.0, stopLossPercent: 24.0 },
        { movePercent: 28.0, stopLossPercent: 26.0 },
        { movePercent: 30.0, stopLossPercent: 28.0 },
        { movePercent: 32.0, stopLossPercent: 30.0 },
        { movePercent: 34.0, stopLossPercent: 32.0 },
        { movePercent: 36.0, stopLossPercent: 34.0 },
        { movePercent: 38.0, stopLossPercent: 36.0 },
        { movePercent: 40.0, stopLossPercent: 38.0 },
        { movePercent: 42.0, stopLossPercent: 40.0 },
        { movePercent: 44.0, stopLossPercent: 42.0 },
        { movePercent: 46.0, stopLossPercent: 44.0 },
        { movePercent: 48.0, stopLossPercent: 46.0 },
        { movePercent: 50.0, stopLossPercent: 48.0 }
    ];

    // ثبت خط به عنوان شکسته‌شده
    brokenLines.add(lineId);

    return {
        signal: 'BUY',
        price: entryPrice,
        stopLoss: stopLossPrice,
        useStagedStopLoss: true,
        stopLossStages: stopLossStages,
        trailingStop: true
    };
}
