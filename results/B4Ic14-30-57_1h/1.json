/**
 * @filename B4Ic14-30-57.js
 * @description خرید با تایید ایچیموکو (۱۴,۳۰,۵۷) و شکست خط روند نزولی (تشخیص دستی، بدون آینده‌نگری) - کپی از Best.js
 * @version 3.0 - منطق Best.js با رعایت قوانین جدید
 */

const stopLossInitial = 0.5;

// ─── پیکربندی تحلیل ──────────────────────────────────────────
const ANALYSIS_CONFIG = {
  entryType: "nextCandle",        // اجازه استفاده از High/Low کندل جاری
  breakTolerance: 0.001,          // اجباری

  trendLines: {
    pivotPeriod: 5,
    minTouchPoints: 3,
    minCandleDistance: 3,
    precision: 0.001
  },

  ichimoku: {
    enabled: true,
    tenkanPeriod: 14,
    kijunPeriod: 30,
    senkouBPeriod: 57,
    useCloudFilter: true,
    useTKCross: true,
    useChikou: false
  },

  enableSmartContinuation: false
};

// ─── حد ضرر پلکانی ۱۵ مرحله‌ای (مثل Best.js) ─────────────────
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

// ─── تابع اصلی (دقیقا مثل Best.js) ──────────────────────────
function customStrategy(data, index, breakPointsParam, ichimokuParam, trendLinesParam, refineEntryPrice) {
  // ── گاردهای اولیه ──────────────────────────────────────
  if (index < 61) return null;

  if (!ichimokuParam || ichimokuParam.kumoTop === null || ichimokuParam.kumoTop === undefined) {
    return null;
  }
  if (!ichimokuParam.tenkan || !ichimokuParam.kijun) return null;

  // ── دریافت خطوط نزولی (مثل Best.js) ──────────────────
  const trendLines = trendLinesParam || getTrendLines();
  
  // سعی میکنیم مثل Best.js از primaryDown استفاده کنیم
  let downTrendLines = [];
  if (trendLines.primaryDown && Array.isArray(trendLines.primaryDown)) {
    downTrendLines = trendLines.primaryDown;
  } else {
    // fallback: فیلتر کردن آرایه‌ی فلت
    downTrendLines = trendLines.filter(line =>
      (line.type === 'primaryDown' || line.type === 'manualDown') && line.slope < 0
    );
  }
  
  if (downTrendLines.length === 0) return null;

  // ── پارامترهای استراتژی (دقیقا مثل Best.js) ──────────
  const MIN_DIST = 0.09;
  const MAX_DIST = 0.15;
  const TARGET = 0.12;

  const prevCandle = data[index - 1];
  const entryPrice = data[index].open;

  let bestSignal = null;
  let closestToTarget = Infinity;

  // ── حلقه روی خطوط نزولی (دقیقا مثل Best.js) ──────────
  for (let i = 0; i < downTrendLines.length; i++) {
    const line = downTrendLines[i];

    // شرط ۱: خط باید به کندل قبلی رسیده باشد (جلوگیری از آینده‌نگری)
    if (line.endIndex > index - 1) continue;

    // شرط ۲: شیب منفی
    if (line.startPrice <= line.endPrice) continue;

    // محاسبه مقدار خط در کندل قبلی (دستی، مثل Best.js)
    const slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
    const intercept = line.startPrice - slope * line.startIndex;
    const lineValue = slope * (index - 1) + intercept;

    // محاسبه فاصله‌ی High و Low کندل قبلی از خط (دقیقا مثل Best.js)
    const distanceLow = ((prevCandle.low - lineValue) / lineValue) * 100;
    const distanceHigh = ((prevCandle.high - lineValue) / lineValue) * 100;

    // شرط ۳: شکست در بازه‌ی ۰.۰۹% تا ۰.۱۵% (مثل Best.js)
    const isBreak = (distanceLow <= MAX_DIST && distanceHigh >= MIN_DIST);
    if (!isBreak) continue;

    // شرط ۴: ایچیموکو (مثل Best.js)
    const isIchimokuValid = (
      ichimokuParam.isPriceAboveCloud &&
      ichimokuParam.isTenkanAboveKijun
    );
    if (!isIchimokuValid) continue;

    // شرط ۵: جلوگیری از شکست تکراری (مثل Best.js)
    let hasPreviousBreak = false;
    for (let j = line.endIndex + 1; j < index; j++) {
      const pastCandle = data[j];
      const pastLineValue = slope * j + intercept;
      const pastDistLow = ((pastCandle.low - pastLineValue) / pastLineValue) * 100;
      const pastDistHigh = ((pastCandle.high - pastLineValue) / pastLineValue) * 100;
      if (pastDistLow <= MAX_DIST && pastDistHigh >= MIN_DIST) {
        hasPreviousBreak = true;
        break;
      }
    }
    if (hasPreviousBreak) continue;

    // شرط ۶: انتخاب بهترین (نزدیکترین به ۰.۱۲%) – مثل Best.js
    const diffFromTarget = Math.abs(distanceHigh - TARGET);
    if (diffFromTarget < closestToTarget) {
      closestToTarget = diffFromTarget;

      // محاسبه‌ی stopLoss (مثل Best.js با ۰.۵%)
      const stopLoss = entryPrice * (1 - 0.005); // ۰.۵% پایینتر
      const takeProfit = entryPrice * (1 + 0.02); // ۲% بالاتر

      bestSignal = {
        signal: 'BUY',
        price: entryPrice,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
        trailingStop: true,
        useStagedStopLoss: true,
        stopLossStages: stopLossStages
      };
    }
  }

  return bestSignal;
}
