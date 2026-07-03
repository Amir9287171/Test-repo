/**
 * @filename 
 * @description خرید با تایید ایچیموکو (14,30,57)، شکست خط روند نزولی، فیلتر روند صعودی (قیمت بالای EMA50)، حد ضرر اولیه ۰.۴٪، و حد ضرر پلکانی ۳۵ مرحله‌ای تا ۵۰٪
 * @version 3.0
 */

// ============================================================
//  وارد کردن کتابخانه wickra
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
//  پارامترهای مدیریت ریسک
// ============================================================
const STOP_LOSS_PERCENT = 0.4;
const stopLossInitial = 0.4;

// ============================================================
//  State برای ذخیره‌ی خطوط شکسته‌شده
// ============================================================
const brokenLines = new Set();

// ============================================================
//  تابع اصلی استراتژی
// ============================================================
function customStrategy(data, index, breakPointsParam, ichimokuParam) {
    // ------------------------------------------------------------
    // ۱. اعتبارسنجی ایچیموکو (صعودی)
    // ------------------------------------------------------------
    if (!ichimokuParam) return null;
    if (ichimokuParam.kumoTop === null || ichimokuParam.kumoBottom === null) return null;
    if (ichimokuParam.tenkan === 0 || ichimokuParam.kijun === 0) return null;

    if (!ichimokuParam.isPriceAboveCloud) return null;
    if (!ichimokuParam.isTenkanAboveKijun) return null;

    // ------------------------------------------------------------
    // ۲. فیلتر روند صعودی با EMA 50 (فقط تا index-1)
    // ------------------------------------------------------------
    const closes = data.slice(0, index).map(c => c.close);
    if (closes.length < 50) return null;

    const emaValues = wickra.ema(closes, 50);
    const lastEma = emaValues[emaValues.length - 1];

    // شرط: قیمت ورود (open) باید بالای EMA50 باشد
    if (data[index].open <= lastEma) return null;

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
    // ۴. بررسی شکست خطوط نزولی
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
    // ۵. جلوگیری از تکرار شکست
    // ------------------------------------------------------------
    const lineId = bestLine.lineId;
    if (brokenLines.has(lineId)) return null;

    // ------------------------------------------------------------
    // ۶. صدور سیگنال خرید
    // ------------------------------------------------------------
    const entryPrice = data[index].open;
    const closePrice = data[index].close;
    const stopLossPrice = closePrice * (1 - STOP_LOSS_PERCENT / 100);

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
