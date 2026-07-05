/**
 * @filename B4Ic14-30-57.js
 * @description خرید با تایید ایچیموکو (۱۴,۳۰,۵۷) و شکست خط روند نزولی (یکجا - BATCH)
 * @version 4.0 - کاملاً یکجا (Batch Mode)
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
    precision: 0.002
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

// ─── محاسبه یکجای خطوط روند ──────────────────────────────
// این تابع رو بیرون customStrategy تعریف میکنیم تا فقط یک بار اجرا بشه
function calculateAllTrendLines(marketData, options) {
  try {
    // سعی میکنیم از precomputeTrendLinesBatch موجود در سیستم استفاده کنیم
    // اگه این تابع وجود نداره، خودمون با روش مشابه محاسبه میکنیم
    if (typeof precomputeTrendLinesBatch === 'function') {
      return precomputeTrendLinesBatch(marketData, options);
    }
    
    // fallback: استفاده از getTrendLines() که سیستم میده
    // اینجا فقط یکبار و با کل دیتاست صدا زده میشه
    return getTrendLines();
  } catch (e) {
    console.error('❌ خطا در محاسبه یکجای خطوط روند:', e.message);
    return [];
  }
}

// ─── ذخیره خطوط یکجا ──────────────────────────────────────
// این متغیر رو بیرون customStrategy تعریف میکنیم
let batchTrendLines = null;
let batchCursor = { pos: 0, activeLines: [] };

// ─── تابع کمکی برای دریافت خطوط فعال در کندل جاری ──────
function getActiveLinesAtCandle(candleIndex) {
  if (!batchTrendLines || batchTrendLines.length === 0) {
    return [];
  }

  // اگر cursor هنوز مقداردهی نشده، از اول شروع کن
  if (!batchCursor) {
    batchCursor = { pos: 0, activeLines: [] };
  }

  // خطوط جدیدی که activationCandle <= candleIndex هستن رو اضافه کن
  while (
    batchCursor.pos < batchTrendLines.length &&
    batchTrendLines[batchCursor.pos].activationCandle <= candleIndex
  ) {
    batchCursor.activeLines.push(batchTrendLines[batchCursor.pos]);
    batchCursor.pos++;
  }

  return batchCursor.activeLines;
}

// ─── تابع اصلی (یکجا) ─────────────────────────────────────
function customStrategy(data, index, breakPointsParam, ichimokuParam, trendLinesParam, refineEntryPrice) {
  // ── گاردهای اولیه ──────────────────────────────────────
  if (index < 61) return null;

  // ── مقداردهی اولیه خطوط (فقط یک بار) ──────────────────
  if (batchTrendLines === null) {
    try {
      console.log('🔄 [BATCH] محاسبه یکجای خطوط روند روی کل دیتاست...');
      // اول سعی میکنیم از تابع سیستمی استفاده کنیم
      if (typeof precomputeTrendLinesBatch === 'function') {
        batchTrendLines = precomputeTrendLinesBatch(data, ANALYSIS_CONFIG.trendLines);
        console.log(`✅ [BATCH] ${batchTrendLines.length} خط روند یکجا محاسبه شد.`);
      } else {
        // اگه تابع وجود نداره، از trendLinesParam استفاده کن
        const rawLines = trendLinesParam || getTrendLines();
        if (rawLines.length > 0) {
          batchTrendLines = rawLines;
          console.log(`✅ [BATCH] ${batchTrendLines.length} خط روند از سیستم دریافت شد.`);
        } else {
          console.warn('⚠️ [BATCH] هیچ خط روندی پیدا نشد!');
          batchTrendLines = [];
        }
      }
    } catch (e) {
      console.error('❌ [BATCH] خطا:', e.message);
      batchTrendLines = [];
    }
  }

  // ── دریافت خطوط فعال در کندل جاری ──────────────────────
  const activeLines = getActiveLinesAtCandle(index);
  if (activeLines.length === 0) return null;

  // ── ایچیموکو ──────────────────────────────────────────────
  if (!ichimokuParam || ichimokuParam.kumoTop === null || ichimokuParam.kumoTop === undefined) {
    return null;
  }
  if (!ichimokuParam.tenkan || !ichimokuParam.kijun) return null;
  if (!ichimokuParam.isPriceAboveCloud || !ichimokuParam.isTenkanAboveKijun) return null;

  // ── فیلتر خطوط نزولی ──────────────────────────────────────
  const downLines = activeLines.filter(line => {
    const isDown = line.type === 'primaryDown' || line.type === 'manualDown';
    const slope = line.slope || ((line.endPrice - line.startPrice) / (line.endIndex - line.startIndex));
    return isDown && slope < 0;
  });

  if (downLines.length === 0) return null;

  // ── پارامترهای شکست ──────────────────────────────────────
  const MIN_DIST = 0.09;
  const MAX_DIST = 0.15;
  const TARGET = 0.12;

  const prevCandle = data[index - 1];
  const entryPrice = data[index].open;

  let bestSignal = null;
  let closestToTarget = Infinity;

  // ── حلقه روی خطوط نزولی ──────────────────────────────────
  for (const line of downLines) {
    // محاسبه مقدار خط در کندل قبلی
    const slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
    const intercept = line.startPrice - slope * line.startIndex;
    const lineValue = slope * (index - 1) + intercept;

    // محاسبه فاصله High و Low کندل قبلی از خط
    const distanceLow = ((prevCandle.low - lineValue) / lineValue) * 100;
    const distanceHigh = ((prevCandle.high - lineValue) / lineValue) * 100;

    // شرط شکست در بازه ۰.۰۹٪ تا ۰.۱۵٪
    const isBreak = (distanceLow <= MAX_DIST && distanceHigh >= MIN_DIST);
    if (!isBreak) continue;

    // انتخاب بهترین (نزدیک‌ترین به ۰.۱۲%)
    const diffFromTarget = Math.abs(distanceHigh - TARGET);
    if (diffFromTarget < closestToTarget) {
      closestToTarget = diffFromTarget;

      const stopLoss = entryPrice * (1 - 0.005);
      const takeProfit = entryPrice * (1 + 0.02);

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
