/**
 * @filename S4Ic14-30-57+Vol20-12+Cnd_TLpP5-mT4-pR001_LadFib_BufOn.js
 * @description [+فیلتر حجم Vol20-12 و تایید کندل Cnd] فروش با تایید ایچیموکو (14,30,57)، حد ضرر 0.4%، خط روند با pivotPeriod=5، minTouchPoints=4، precision=0.001 | اصلاح‌شده: حد سود حذف شد، حد ضرر پلکانی = فیبوناچی تعدیل‌شده (Adjusted-Fibonacci)، بافر فعال (enableSmartContinuation: true)
 */

const stopLossInitial = 0.4;

const ANALYSIS_CONFIG = {
  entryType: "nextCandle",
  breakTolerance: 0.02,
  trendLines: {
    pivotPeriod: 5,
    minTouchPoints: 4,
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
  enableSmartContinuation: true
};

const stopLossStages = [
  { movePercent: 0.4, stopLossPercent: -0.2 },
  { movePercent: 2.4, stopLossPercent: -1.9 },
  { movePercent: 4.2, stopLossPercent: -3.5 },
  { movePercent: 6.1, stopLossPercent: -5.0 },
  { movePercent: 8.0, stopLossPercent: -6.6 },
  { movePercent: 9.9, stopLossPercent: -8.2 },
  { movePercent: 11.8, stopLossPercent: -9.9 },
  { movePercent: 13.7, stopLossPercent: -11.6 },
  { movePercent: 15.6, stopLossPercent: -13.4 },
  { movePercent: 17.6, stopLossPercent: -15.3 },
  { movePercent: 19.6, stopLossPercent: -17.2 },
  { movePercent: 21.6, stopLossPercent: -19.1 },
  { movePercent: 23.7, stopLossPercent: -21.1 },
  { movePercent: 25.8, stopLossPercent: -23.1 },
  { movePercent: 27.9, stopLossPercent: -25.1 },
  { movePercent: 30.0, stopLossPercent: -27.2 },
  { movePercent: 32.2, stopLossPercent: -29.3 },
  { movePercent: 34.4, stopLossPercent: -31.4 },
  { movePercent: 36.6, stopLossPercent: -33.5 },
  { movePercent: 38.8, stopLossPercent: -35.6 },
  { movePercent: 41.0, stopLossPercent: -37.7 },
  { movePercent: 43.3, stopLossPercent: -39.8 },
  { movePercent: 45.6, stopLossPercent: -41.9 },
  { movePercent: 47.9, stopLossPercent: -44.1 },
  { movePercent: 50.2, stopLossPercent: -46.2 },
];

// ══════════════════════════════════════════════════════════════
// فیلتر(های) تاییدی اضافه‌شده — فقط روی کندل بسته‌شده‌ی sigIdx = index - 1 (صفر آینده‌نگری؛ ورود همچنان data[index].open)
//   Vol20-12 : حجم کندل سیگنال ≥ ۱.۲ × میانگین حجم ۲۰ کندل قبل از آن (خودِ کندل سیگنال در میانگین نیست)
//   Cnd      : کندل سیگنال هم‌جهت با معامله باشد (BUY: close>open | SELL: close<open)
//              و بدنه‌اش حداقل ۵۰٪ دامنه‌ی (high-low) کندل باشد
// اگر volume نامعتبر/صفر باشد، فیلتر «رد» می‌کند (معامله‌ای باز نمی‌شود).
// ══════════════════════════════════════════════════════════════
const VOL_PERIOD = 20;
const VOL_MULT = 1.2;
const CND_MIN_BODY_RATIO = 0.5;
const FILTER_SIDE = 'SELL';

function passVolumeFilter(data, sigIdx) {
  if (sigIdx - VOL_PERIOD < 0) return false;
  let sum = 0;
  for (let i = sigIdx - VOL_PERIOD; i < sigIdx; i++) {
    const v = Number(data[i].volume);
    if (!isFinite(v)) return false;
    sum += v;
  }
  const avg = sum / VOL_PERIOD;
  const cur = Number(data[sigIdx].volume);
  if (!isFinite(cur) || !(avg > 0)) return false;
  return cur >= VOL_MULT * avg;
}

function passCandleConfirm(data, sigIdx) {
  const c = data[sigIdx];
  const range = c.high - c.low;
  if (!(range > 0)) return false;
  const body = Math.abs(c.close - c.open);
  if (body / range < CND_MIN_BODY_RATIO) return false;
  return FILTER_SIDE === 'BUY' ? c.close > c.open : c.close < c.open;
}

function customStrategy(data, index, breakPointsParam, ichimokuParam, trendLinesParam, refineEntryPrice) {
  if (index < 61) return null;

  if (!globalThis.__state_S4Ic14_30_57_Vol20_12_Cnd_TLpP5_mT4_pR001_LadFib_BufOn || globalThis.__state_S4Ic14_30_57_Vol20_12_Cnd_TLpP5_mT4_pR001_LadFib_BufOn.dataRef !== data) {
    globalThis.__state_S4Ic14_30_57_Vol20_12_Cnd_TLpP5_mT4_pR001_LadFib_BufOn = { dataRef: data, brokenLines: new Set() };
  }

  // اسنپ‌شات ایچیموکوی کندل قبلی برای جلوگیری از آینده‌نگری (lookahead bias)
  const __prevIchimoku = globalThis.__state_S4Ic14_30_57_Vol20_12_Cnd_TLpP5_mT4_pR001_LadFib_BufOn.__lastIchimokuIndex === index - 1 ? globalThis.__state_S4Ic14_30_57_Vol20_12_Cnd_TLpP5_mT4_pR001_LadFib_BufOn.__lastIchimoku : null;
  globalThis.__state_S4Ic14_30_57_Vol20_12_Cnd_TLpP5_mT4_pR001_LadFib_BufOn.__lastIchimoku = ichimokuParam ? { ...ichimokuParam } : null;
  globalThis.__state_S4Ic14_30_57_Vol20_12_Cnd_TLpP5_mT4_pR001_LadFib_BufOn.__lastIchimokuIndex = index;
  const brokenLines = globalThis.__state_S4Ic14_30_57_Vol20_12_Cnd_TLpP5_mT4_pR001_LadFib_BufOn.brokenLines;

  const activeLines = trendLinesParam || getTrendLines();
  if (activeLines.length === 0) return null;

  if (!__prevIchimoku || __prevIchimoku.kumoTop === null || __prevIchimoku.kumoTop === undefined) return null;
  if (!__prevIchimoku.tenkan || !__prevIchimoku.kijun) return null;
  if (!__prevIchimoku.isPriceBelowCloud || __prevIchimoku.isTenkanAboveKijun) return null;

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

  // ── فیلتر(های) تاییدی: قبل از ورود، فقط روی کندل بسته‌شده‌ی index - 1 ──
  if (!passVolumeFilter(data, index - 1)) return null;
  if (!passCandleConfirm(data, index - 1)) return null;

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