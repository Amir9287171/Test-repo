/**
 * @filename B4Ic14-30-57Rsi14.js
 * @description خرید + RSI(14) > 50 (تشخیص دستی شکست، بدون آینده‌نگری)
 */

const stopLossInitial = 0.4;

const ANALYSIS_CONFIG = {
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

// محاسبه RSI با wickra — طبق مستندات رسمی (docs.wickra.org/Quickstart-Node):
// الگوی صحیح: کلاس با حرف بزرگ (RSI) + new + متد .batch() روی آرایه closes.
// - از global.__wickra استفاده می‌شود، نه require('wickra')، چون این کد داخل
//   new Function اجرا می‌شود و require آنجا در دسترس نیست (module-scoped است).
// - .batch() در دوره‌ی warm-up مقدار NaN برمی‌گرداند، نه null؛ به همین دلیل
//   از Number.isFinite() برای تشخیص مقدار معتبر استفاده می‌کنیم.
// - برای جلوگیری از آینده‌نگری، فقط close تا index - 1 پاس داده می‌شود.
function calculateRSI(data, index, period = 14) {
  const closes = data.slice(0, index).map(d => d.close);
  if (closes.length < period + 1) return null;

  const wickra = global.__wickra;
  if (!wickra || typeof wickra.RSI !== 'function') return null;

  try {
    const rsi = new wickra.RSI(period);
    const values = rsi.batch(closes);
    const last = values[values.length - 1];
    return Number.isFinite(last) ? last : null;
  } catch (e) {
    return null;
  }
}

function customStrategy(data, index, breakPointsParam, ichimokuParam) {
  if (index < 61) return null;

  // ─── ایچیموکو ──────────────────────────────────────────
  if (!ichimokuParam || ichimokuParam.kumoTop === null || ichimokuParam.kumoTop === undefined) {
    return null;
  }
  if (!ichimokuParam.isPriceAboveCloud || !ichimokuParam.isTenkanAboveKijun) {
    return null;
  }

  // ─── خطوط نزولی ──────────────────────────────────────────
  const trendLines = getTrendLines();
  const downLines = trendLines.filter(line =>
    (line.type === 'primaryDown' || line.type === 'manualDown') && line.slope < 0
  );
  if (downLines.length === 0) return null;

  // ─── تشخیص شکست ──────────────────────────────────────────
  const MIN_DIST = 0.09;
  const MAX_DIST = 0.15;
  const TARGET = 0.12;

  const prevCandle = data[index - 1];
  const entryPrice = data[index].open;

  let selectedLine = null;
  let closestToTarget = Infinity;

  for (const line of downLines) {
    if (line.endIndex > index - 1) continue;
    if (brokenLines.has(line.id)) continue;

    const slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
    const intercept = line.startPrice - slope * line.startIndex;
    const lineValue = slope * (index - 1) + intercept;

    const distanceLow = ((prevCandle.low - lineValue) / lineValue) * 100;
    const distanceHigh = ((prevCandle.high - lineValue) / lineValue) * 100;

    const isBreak = (distanceLow <= MAX_DIST && distanceHigh >= MIN_DIST);
    if (!isBreak) continue;

    const diffFromTarget = Math.abs(distanceHigh - TARGET);
    if (diffFromTarget < closestToTarget) {
      closestToTarget = diffFromTarget;
      selectedLine = line;
    }
  }

  if (!selectedLine) return null;
  brokenLines.add(selectedLine.id);

  // ─── RSI ──────────────────────────────────────────────────
  const rsiValue = calculateRSI(data, index, 14);
  if (rsiValue === null || rsiValue <= 50) return null;

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
