/**
 * @filename B4Ic14-30-57.js
 * @description خرید با تایید ایچیموکو (۱۴,۳۰,۵۷) و شکست خط روند نزولی (Batch + سیستمی، فقط ۰.۱۲%)
 * @version 7.0 - Batch Mode + تشخیص شکست سیستمی
 */

const stopLossInitial = 0.5;

const ANALYSIS_CONFIG = {
  entryType: "nextCandle",
  breakTolerance: 0.02,

  trendLines: {
    pivotPeriod: 5,
    minTouchPoints: 3,
    minCandleDistance: 3,
    precision: 0.02
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

const brokenLines = new Set();

// ─── متغیرهای Batch ───────────────────────────────────────
let batchTrendLines = null;
let batchCursor = { pos: 0, activeLines: [] };

function getActiveLinesAtCandle(candleIndex) {
  if (!batchTrendLines || batchTrendLines.length === 0) return [];

  while (
    batchCursor.pos < batchTrendLines.length &&
    batchTrendLines[batchCursor.pos].activationCandle <= candleIndex
  ) {
    batchCursor.activeLines.push(batchTrendLines[batchCursor.pos]);
    batchCursor.pos++;
  }

  return batchCursor.activeLines;
}

// ─── تابع اصلی ────────────────────────────────────────────
function customStrategy(data, index, breakPointsParam, ichimokuParam, trendLinesParam, refineEntryPrice) {
  if (index < 61) return null;

  // ── محاسبه یکجای خطوط روند (فقط یک بار) ──────────────
  if (batchTrendLines === null) {
    try {
      console.log('🔄 [BATCH] محاسبه یکجای خطوط روند روی کل دیتاست...');
      if (typeof precomputeTrendLinesBatch === 'function') {
        batchTrendLines = precomputeTrendLinesBatch(data, ANALYSIS_CONFIG.trendLines);
        console.log(`✅ [BATCH] ${batchTrendLines.length} خط روند یکجا محاسبه شد.`);
      } else {
        const rawLines = trendLinesParam || getTrendLines();
        batchTrendLines = Array.isArray(rawLines) ? rawLines : [];
        console.log(`✅ [BATCH] ${batchTrendLines.length} خط روند از سیستم دریافت شد.`);
      }
    } catch (e) {
      console.error('❌ [BATCH] خطا:', e.message);
      batchTrendLines = [];
    }
  }

  // ── خطوط فعال در کندل جاری ────────────────────────────
  const activeLines = getActiveLinesAtCandle(index);
  if (activeLines.length === 0) return null;

  // ── ایچیموکو ────────────────────────────────────────────
  if (!ichimokuParam || ichimokuParam.kumoTop === null || ichimokuParam.kumoTop === undefined) {
    return null;
  }
  if (!ichimokuParam.tenkan || !ichimokuParam.kijun) return null;
  if (!ichimokuParam.isPriceAboveCloud || !ichimokuParam.isTenkanAboveKijun) return null;

  // ── فیلتر خطوط نزولی ────────────────────────────────────
  const downLines = activeLines.filter(line => {
    const isDown = line.type === 'primaryDown' || line.type === 'manualDown';
    const slope = line.slope || ((line.endPrice - line.startPrice) / (line.endIndex - line.startIndex));
    return isDown && slope < 0;
  });

  if (downLines.length === 0) return null;

  // ── دریافت شکست‌های کندل جاری از سیستم ──────────────
  const breaks = getBreakPointsAtCandle(index);
  if (!breaks || breaks.length === 0) return null;

  const upBreaks = breaks.filter(b => b.direction === 'up');
  if (upBreaks.length === 0) return null;

  // ── انتخاب نزدیک‌ترین شکست به ۰.۱۲% (بدون بازه) ──────
  const TARGET = 0.12;
  let selectedLine = null;
  let bestDiff = Infinity;

  for (const breakInfo of upBreaks) {
    const line = downLines.find(l => l.id === breakInfo.lineId);
    if (!line) continue;
    if (brokenLines.has(line.id)) continue;

    const breakPrice = breakInfo.breakPrice;
    const lineValue = breakInfo.lineValueAtBreak;
    const diffPercent = ((breakPrice - lineValue) / lineValue) * 100;

    if (Math.abs(diffPercent - TARGET) < Math.abs(bestDiff - TARGET)) {
      bestDiff = diffPercent;
      selectedLine = line;
    }
  }

  if (!selectedLine) return null;
  brokenLines.add(selectedLine.id);

  // ── صدور سیگنال ────────────────────────────────────────
  const entryPrice = data[index].open;
  const stopLoss = entryPrice * (1 - 0.005);
  const takeProfit = entryPrice * (1 + 0.02);

  return {
    signal: 'BUY',
    price: entryPrice,
    stopLoss: stopLoss,
    takeProfit: takeProfit,
    trailingStop: true,
    useStagedStopLoss: true,
    stopLossStages: stopLossStages
  };
}
