/**
 * @filename 
 * @description خرید + RSI(14) > 50
 */

const stopLossInitial = 0.4;

const ANALYSIS_CONFIG = {
  trendLines: {
    pivotPeriod: 5,
    minTouchPoints: 3,
    minCandleDistance: 3,
    precision: 0.000001
  },
  ichimoku: {
    enabled: true,
    tenkanPeriod: 14,
    kijunPeriod: 30,
    senkouBPeriod: 57,
    useCloudFilter: true,
    useTKCross: true,
    useChikou: false
  }
};

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

const brokenLines = new Set();

function calculateRSI(data, index, period = 14) {
  const closes = data.slice(0, index).map(d => d.close);
  if (closes.length < period + 1) return null;
  try {
    const wickra = require('wickra');
    const rsiArray = wickra.rsi(closes, period);
    return rsiArray[rsiArray.length - 1];
  } catch (e) {
    return null;
  }
}

function customStrategy(data, index, breakPointsParam, ichimokuParam) {
  // اعتبارسنجی ایچیموکو
  if (!ichimokuParam || ichimokuParam.kumoTop === null || ichimokuParam.kumoTop === undefined) {
    return null;
  }
  if (!ichimokuParam.isPriceAboveCloud || !ichimokuParam.isTenkanAboveKijun) {
    return null;
  }

  // خطوط نزولی
  const trendLines = getTrendLines();
  const downLines = trendLines.filter(line =>
    (line.type === 'primaryDown' || line.type === 'manualDown') && line.slope < 0
  );
  if (downLines.length === 0) return null;

  // شکست‌ها
  const breaks = getBreakPointsAtCandle(index);
  if (!breaks || breaks.length === 0) return null;
  const upBreaks = breaks.filter(b => b.direction === 'up');
  if (upBreaks.length === 0) return null;

  // انتخاب خط
  let selectedLine = null;
  let bestDiff = Infinity;
  for (const breakInfo of upBreaks) {
    const line = downLines.find(l => l.id === breakInfo.lineId);
    if (!line) continue;
    if (brokenLines.has(line.id)) continue;
    const lineValue = calculateTrendLineValue(line, index);
    if (lineValue === null) continue;
    const high = data[index].high;
    const low = data[index].low;
    if (high < lineValue * 1.0009 || low > lineValue * 1.0015) continue;
    const diffPercent = ((high - lineValue) / lineValue) * 100;
    if (Math.abs(diffPercent - 0.12) < Math.abs(bestDiff - 0.12)) {
      bestDiff = diffPercent;
      selectedLine = line;
    }
  }
  if (!selectedLine) return null;
  brokenLines.add(selectedLine.id);

  // شرط RSI
  const rsiValue = calculateRSI(data, index, 14);
  if (rsiValue === null || rsiValue <= 50) return null;

  // صدور سیگنال
  const entryPrice = data[index].open;
  const stopLoss = entryPrice * (1 - 0.004);
  return {
    signal: 'BUY',
    price: entryPrice,
    stopLoss: stopLoss,
    trailingStop: true,
    useStagedStopLoss: true,
    stopLossStages: stopLossStages
  };
}
