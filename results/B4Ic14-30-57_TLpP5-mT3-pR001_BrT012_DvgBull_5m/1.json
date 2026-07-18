/**
 * @filename B4Ic14-30-57_TLpP5-mT3-pR001_BrT012_DvgBull.js
 * @description خرید با تایید ایچیموکو (14,30,57)، حد ضرر 0.4%، خط روند با pivotPeriod=5، minTouchPoints=3، precision=0.001، انتخاب شکست نزدیک به 0.12%، و تایید واگرایی صعودی (Bullish Divergence)
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

  if (!globalThis.__state_B4Ic14_30_57_TLpP5_mT3_pR001_BrT012_DvgBull || globalThis.__state_B4Ic14_30_57_TLpP5_mT3_pR001_BrT012_DvgBull.dataRef !== data) {
    globalThis.__state_B4Ic14_30_57_TLpP5_mT3_pR001_BrT012_DvgBull = { dataRef: data, brokenLines: new Set() };
  }
  const brokenLines = globalThis.__state_B4Ic14_30_57_TLpP5_mT3_pR001_BrT012_DvgBull.brokenLines;

  const activeLines = trendLinesParam || getTrendLines();
  if (activeLines.length === 0) return null;

  if (!ichimokuParam || ichimokuParam.kumoTop === null || ichimokuParam.kumoTop === undefined) return null;
  if (!ichimokuParam.tenkan || !ichimokuParam.kijun) return null;
  if (!ichimokuParam.isPriceAboveCloud || !ichimokuParam.isTenkanAboveKijun) return null;

  // ── شرط واگرایی صعودی (Bullish) ──
  const divSignals = getDivergenceSignals();
  if (!divSignals || divSignals.length === 0) return null;
  const hasBullishDivergence = divSignals.some(sig => 
    sig.type === 'RegularBullish' || sig.type === 'HiddenBullish'
  );
  if (!hasBullishDivergence) return null;

  const downLines = activeLines.filter(line => {
    const isDown = line.type === 'primaryDown' || line.type === 'manualDown';
    const slope = line.slope || ((line.endPrice - line.startPrice) / (line.endIndex - line.startIndex));
    return isDown && slope < 0;
  });
  if (downLines.length === 0) return null;

  const breaks = getBreakPointsAtCandle(index);
  if (!breaks || breaks.length === 0) return null;

  const upBreaks = breaks.filter(b => b.direction === 'up');
  if (upBreaks.length === 0) return null;

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

  const entryPrice = data[index].open;
  const stopLoss = entryPrice * (1 - 0.004);
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