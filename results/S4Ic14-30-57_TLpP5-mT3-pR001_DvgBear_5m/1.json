/**
 * @filename S4Ic14-30-57_TLpP5-mT3-pR001_DvgBear.js
 * @description فروش با تایید ایچیموکو (14,30,57)، حد ضرر 0.4%، خط روند با pivotPeriod=5، minTouchPoints=3، precision=0.001، و تایید واگرایی نزولی (Bearish Divergence)
 */

const stopLossInitial = 0.4;

const ANALYSIS_CONFIG = {
  entryType: "nextCandle",
  breakTolerance: 0.02,
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

function customStrategy(data, index, breakPointsParam, ichimokuParam, trendLinesParam, refineEntryPrice) {
  if (index < 61) return null;

  if (!globalThis.__state_S4Ic14_30_57_TLpP5_mT3_pR001_DvgBear || globalThis.__state_S4Ic14_30_57_TLpP5_mT3_pR001_DvgBear.dataRef !== data) {
    globalThis.__state_S4Ic14_30_57_TLpP5_mT3_pR001_DvgBear = { dataRef: data, brokenLines: new Set() };
  }
  const brokenLines = globalThis.__state_S4Ic14_30_57_TLpP5_mT3_pR001_DvgBear.brokenLines;

  const activeLines = trendLinesParam || getTrendLines();
  if (activeLines.length === 0) return null;

  if (!ichimokuParam || ichimokuParam.kumoTop === null || ichimokuParam.kumoTop === undefined) return null;
  if (!ichimokuParam.tenkan || !ichimokuParam.kijun) return null;
  if (!ichimokuParam.isPriceBelowCloud || ichimokuParam.isTenkanAboveKijun) return null;

  // ── شرط واگرایی نزولی (Bearish) ──
  const divSignals = getDivergenceSignals();
  if (!divSignals || divSignals.length === 0) return null;
  const hasBearishDivergence = divSignals.some(sig => 
    sig.type === 'RegularBearish' || sig.type === 'HiddenBearish'
  );
  if (!hasBearishDivergence) return null;

  const upLines = activeLines.filter(line => {
    const isUp = line.type === 'primaryUp' || line.type === 'manualUp';
    const slope = line.slope || ((line.endPrice - line.startPrice) / (line.endIndex - line.startIndex));
    return isUp && slope > 0;
  });
  if (upLines.length === 0) return null;

  const breaks = getBreakPointsAtCandle(index);
  if (!breaks || breaks.length === 0) return null;

  const downBreaks = breaks.filter(b => b.direction === 'down');
  if (downBreaks.length === 0) return null;

  const TARGET = 0.12;
  let selectedLine = null;
  let bestDiff = Infinity;

  for (const breakInfo of downBreaks) {
    const line = upLines.find(l => l.id === breakInfo.lineId);
    if (!line) continue;
    if (brokenLines.has(line.id)) continue;

    const breakPrice = breakInfo.breakPrice;
    const lineValue = breakInfo.lineValueAtBreak;
    const diffPercent = ((lineValue - breakPrice) / lineValue) * 100;

    if (Math.abs(diffPercent - TARGET) < Math.abs(bestDiff - TARGET)) {
      bestDiff = diffPercent;
      selectedLine = line;
    }
  }

  if (!selectedLine) return null;
  brokenLines.add(selectedLine.id);

  const entryPrice = data[index].open;
  const stopLoss = entryPrice * (1 + 0.004);
  const takeProfit = entryPrice * (1 - 0.02);

  return {
    signal: 'SELL',
    price: entryPrice,
    stopLoss: stopLoss,
    takeProfit: takeProfit,
    trailingStop: true,
    useStagedStopLoss: true,
    stopLossStages: stopLossStages
  };
}