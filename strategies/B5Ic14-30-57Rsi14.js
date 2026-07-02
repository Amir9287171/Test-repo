/**
 * @filename B5Ic14-30-57Rsi14.js
 * @description خرید با تایید ایچیموکو (14,30,57)، شکست خط روند نزولی، و RSI بالای ۵۰
 * @version 1.0
 */

// ============================================================
//  وارد کردن کتابخانه wickra برای محاسبه اندیکاتورها
// ============================================================
const wickra = require('wickra');

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
const STOP_LOSS_PERCENT = 0.5;        // حد ضرر اولیه ۰.۵٪
const stopLossInitial = 0.5;          // برای aggregate-results.js

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
    // ۲. محاسبه RSI با wickra (فقط تا index-1 برای جلوگیری از آینده‌نگری)
    // ------------------------------------------------------------
    // طبق بخش ۴.۳ راهنما: داده‌ها را تا index-1 بدهید (نه index)
    const closes = data.slice(0, index).map(c => c.close);
    if (closes.length < 15) return null; // داده کافی برای RSI ۱۴ دوره‌ای نیست

    const rsiArray = wickra.rsi(closes, 14);
    const currentRSI = rsiArray[rsiArray.length - 1];

    // شرط RSI: باید بالای ۵۰ باشد (تأیید روند صعودی)
    if (currentRSI <= 50) return null;

    // ------------------------------------------------------------
    // ۳. دریافت خطوط روند و فیلتر خطوط نزولی
    // ------------------------------------------------------------
    const allLines = getTrendLines();
    if (!allLines || allLines.length === 0) return null;

    const descendingLines = allLines.filter(line => {
        const slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
        return slope < 0;
    });
    if (descendingLines.length === 0) return null;

    // ------------------------------------------------------------
    // ۴. بررسی شکست خطوط با شرایط دقیق
    // ------------------------------------------------------------
    let bestLine = null;
    let bestDiff = Infinity;

    for (const line of descendingLines) {
        const lineValueCurrent = calculateTrendLineValue(line, index);
        const lineValuePrev = calculateTrendLineValue(line, index - 1);

        const high = data[index].high;
        const low = data[index].low;
        const lowPrev = data[index - 1].low;

        const isHighAbove = high >= lineValueCurrent * (1 + 0.0009);
        const isLowBelow = low <= lineValueCurrent * (1 + 0.0015);
        const isLowAboveLine = low > lineValueCurrent;
        const isPrevBelow = lowPrev < lineValuePrev;

        if (!isHighAbove || !isLowBelow || !isLowAboveLine || !isPrevBelow) continue;

        const diffPercent = ((high - lineValueCurrent) / high) * 100;
        const diffFromTarget = Math.abs(diffPercent - 0.12);

        if (diffFromTarget < bestDiff) {
            bestDiff = diffFromTarget;
            bestLine = line;
        }
    }

    if (!bestLine) return null;

    // ------------------------------------------------------------
    // ۵. جلوگیری از تکرار شکست در همان خط
    // ------------------------------------------------------------
    const lineId = bestLine.lineId;
    if (brokenLines.has(lineId)) return null;

    // ------------------------------------------------------------
    // ۶. صدور سیگنال خرید با مدیریت ریسک کامل
    // ------------------------------------------------------------
    const entryPrice = data[index].open;
    const closePrice = data[index].close;
    const stopLossPrice = closePrice * (1 - STOP_LOSS_PERCENT / 100);

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
