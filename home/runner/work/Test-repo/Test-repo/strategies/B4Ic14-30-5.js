/*
 * @filename B4Ic14-30-57.js
 * @description خرید با تایید ایچیموکو (۱۴,۳۰,۵۷) و شکست خط روند نزولی (فقط ۰.۱۲%)
 * @version 8.0 - حذف batch محلی و باگ‌های ناشی از آن؛ استفاده مستقیم از trendLinesParam
 *
 * تغییر نسبت به v7.0:
 * موتور (backtest-core2.js) وقتی USE_BATCH_TRENDLINES=true باشد، خودش یک‌بار
 * برای کل دیتاست precomputeTrendLinesBatch را صدا می‌زند و به ازای هر کندل فقط
 * خطوط فعال همان کندل را (با cursor سریع) در trendLinesParam پاس می‌دهد. پس
 * دیگر نیازی نیست customStrategy خودش batch/cursor محلی بسازد — آن نسخه چون
 * داخل بدنه‌ی strategyFn تزریق و هر کندل از نو اجرا می‌شد، batchTrendLines هر
 * بار null می‌شد و precomputeTrendLinesBatch روی کل دیتاست به ازای هر کندل
 * (نه یک‌بار) اجرا می‌شد؛ همان علت کند بودن و رفتار «افزایشی».
 */

const stopLossInitial = 0.4;

const ANALYSIS_CONFIG = {
  entryType: "nextCandle",
  breakTolerance: 0.001,

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

// نکته: چون بدنه‌ی این فایل به ازای هر کندل از نو اجرا می‌شود (تزریق داخل
// strategyFn)، هر state ای که باید بین کندل‌ها دوام بیاورد (مثل brokenLines)
// را باید روی globalThis نگه داشت، نه با let/const ساده در سطح فایل.

function customStrategy(data, index, breakPointsParam, ichimokuParam, trendLinesParam, refineEntryPrice) {
  if (index < 61) return null;

  // ریست brokenLines فقط وقتی دیتاست عوض شده (فایل جدید)
  if (!globalThis.__b4ic_state || globalThis.__b4ic_state.dataRef !== data) {
    globalThis.__b4ic_state = { dataRef: data, brokenLines: new Set() };
  }
  const brokenLines = globalThis.__b4ic_state.brokenLines;

  // ── خطوط فعال در کندل جاری: مستقیماً از موتور (batch، از قبل فیلترشده) ──
  // نکته: فراخوانی getTrendLines() این‌جا هم fallback واقعی است (اگر بنا به
  // هر دلیلی trendLinesParam خالی بود) و هم علامتی است که run-backtest.js با
  // regex آن را تشخیص می‌دهد و trendLineSettings را از ANALYSIS_CONFIG به
  // موتور پاس می‌دهد؛ بدون این خط، trendLineSettings هیچ‌وقت ست نمی‌شود و
  // processedTrendLines همیشه خالی می‌ماند (صفر معامله، بدون هیچ خطایی).
  const activeLines = trendLinesParam || getTrendLines();
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
