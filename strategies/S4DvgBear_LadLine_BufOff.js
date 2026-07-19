/**
 * @filename S4DvgBear_LadLine_BufOff.js
 * @description فروش فقط بر اساس سیگنال واگرایی نزولی (Regular یا Hidden) روی RSI/MACD — بدون هیچ شرط دیگری | حد سود ممنوع (حذف شد)، خروج فقط با حد ضرر پلکانی = خطی پویا (Dynamic-Linear)، بافر غیرفعال (enableSmartContinuation: false)
 */

const stopLossInitial = 0.4;

const ANALYSIS_CONFIG = {
  entryType: "nextCandle",
  breakTolerance: 0.02,
  enableSmartContinuation: false
};

const stopLossStages = [
  { movePercent: 0.4, stopLossPercent: -0.3 },
  { movePercent: 2.4, stopLossPercent: -2.0 },
  { movePercent: 4.4, stopLossPercent: -3.7 },
  { movePercent: 6.4, stopLossPercent: -5.3 },
  { movePercent: 8.4, stopLossPercent: -7.0 },
  { movePercent: 10.4, stopLossPercent: -8.7 },
  { movePercent: 12.4, stopLossPercent: -10.3 },
  { movePercent: 14.4, stopLossPercent: -12.0 },
  { movePercent: 16.4, stopLossPercent: -13.7 },
  { movePercent: 18.4, stopLossPercent: -15.3 },
  { movePercent: 20.4, stopLossPercent: -17.0 },
  { movePercent: 22.4, stopLossPercent: -18.7 },
  { movePercent: 24.4, stopLossPercent: -20.3 },
  { movePercent: 26.4, stopLossPercent: -22.0 },
  { movePercent: 28.4, stopLossPercent: -23.7 },
  { movePercent: 30.4, stopLossPercent: -25.3 },
  { movePercent: 32.4, stopLossPercent: -27.0 },
  { movePercent: 34.4, stopLossPercent: -28.7 },
  { movePercent: 36.4, stopLossPercent: -30.3 },
  { movePercent: 38.4, stopLossPercent: -32.0 },
  { movePercent: 40.4, stopLossPercent: -33.7 },
  { movePercent: 42.4, stopLossPercent: -35.3 },
  { movePercent: 44.4, stopLossPercent: -37.0 },
  { movePercent: 46.4, stopLossPercent: -38.7 },
  { movePercent: 48.4, stopLossPercent: -40.3 },
];

function customStrategy(data, index, breakPointsParam, _ichimokuUnused, trendLinesParam, refineEntryPrice) {
  if (index < 61) return null;

  const divSignals = getDivergenceSignals();
  if (!divSignals || divSignals.length === 0) return null;

  const hasBearishDivergence = divSignals.some(sig =>
    (sig.type === 'RegularBearish' || sig.type === 'HiddenBearish') && sig.endIndex === index
  );
  if (!hasBearishDivergence) return null;

  const entryPrice = data[index].open;
  const stopLoss = entryPrice * (1 + 0.004);

  return {
    signal: 'SELL',
    price: entryPrice,
    stopLoss: stopLoss,
    useStagedStopLoss: true,
    stopLossStages: stopLossStages
  };
}
