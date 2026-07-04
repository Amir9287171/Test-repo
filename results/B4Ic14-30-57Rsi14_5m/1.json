/**
 * @filename B4Ic14-30-57Rsi14.js
 * @description خرید با تایید ایچیموکو (۱۴,۳۰,۵۷) و RSI(14) > 50
 * @version 2.0 (بروزرسانی بر اساس راهنمای نسخه ۱۵)
 */

const stopLossInitial = 0.4;

// ─── پیکربندی تحلیل (ANALYSIS_CONFIG) ────────────────────────
const ANALYSIS_CONFIG = {
  // پارامترهای اجباری ورود (بخش ۲.۰ و ۱۲)
  entryType: "nextCandle",        // ورود در کندل بعد از شکست (استفاده از High/Low کندل جاری مجاز است)
  breakTolerance: 0.001,          // ۰.۱٪ (در nextCandle استفاده نمی‌شود ولی اجباری است)

  // تنظیمات خطوط روند (بخش ۲.۱)
  trendLines: {
    pivotPeriod: 5,
    minTouchPoints: 3,
    minCandleDistance: 3,
    precision: 0.002               // ۰.۲٪ (مقدار پیشنهادی بین ۰.۰۰۱ تا ۰.۰۰۵)
  },

  // تنظیمات ایچیموکو (بخش ۲.۲)
  ichimoku: {
    enabled: true,
    tenkanPeriod: 14,
    kijunPeriod: 30,
    senkouBPeriod: 57,
    useCloudFilter: true,
    useTKCross: true,
    useChikou: false
  },

  // بافر خودکار (اختیاری، بخش ۱۴)
  enableSmartContinuation: false
};

// ─── حد ضرر پلکانی ۳۵ مرحله‌ای ─────────────────────────────
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

// ─── محاسبه‌ی RSI با wickra (طبق بخش ۴.۳.۴ و ۴.۳.۲) ──────
function calculateRSI(data, index, period = 14) {
  // ⚠️ قانون طلایی: داده‌ها را فقط تا کندل قبلی (index-1) می‌دهیم
  const closes = data.slice(0, index).map(d => d.close);
  if (closes.length < period + 1) return null;

  // ✅ استفاده از global.__wickra به جای require (بخش ۴.۳.۳)
  const wickra = global.__wickra;
  if (!wickra || typeof wickra.RSI !== 'function') return null;

  try {
    // ✅ الگوی صحیح: new ClassName(...).batch(...) (بخش ۴.۳.۲)
    const rsi = new wickra.RSI(period);
    const values = rsi.batch(closes);
    const last = values[values.length - 1];
    // ✅ بررسی با Number.isFinite برای جلوگیری از NaN در warm-up
    return Number.isFinite(last) ? last : null;
  } catch (e) {
    return null;
  }
}

// ─── تابع اصلی استراتژی (بروزرسانی شده با ۶ پارامتر) ────────
// پارامترهای ۵ و ۶ (trendLinesParam و refineEntryPrice) اختیاری هستند (بخش ۳.۲)
function customStrategy(
  data,
  index,
  breakPointsParam,
  ichimokuParam,
  trendLinesParam,    // اختیاری - همان خروجی getTrendLines()
  refineEntryPrice    // اختیاری - فقط برای openBreak کاربرد دارد (بخش ۱۵.۵)
) {
  // ─── گاردهای اولیه ──────────────────────────────────────
  if (index < 61) return null; // حداقل برای ایچیموکو و warm-up RSI

  // ─── ۱. اعتبارسنجی ایچیموکو (بخش ۷.۱) ────────────────────
  if (!ichimokuParam || ichimokuParam.kumoTop === null || ichimokuParam.kumoTop === undefined) {
    return null;
  }
  if (!ichimokuParam.isPriceAboveCloud || !ichimokuParam.isTenkanAboveKijun) {
    return null;
  }

  // ─── ۲. دریافت شکست‌های کندل جاری از سیستم (بخش ۷.۲) ──
  // در حالت nextCandle، breakPointsParam[index] شامل شکست‌های تشخیص‌داده‌شده روی کندل index-1 است
  const breaks = getBreakPointsAtCandle(index);
  if (!breaks || breaks.length === 0) return null;

  // فقط شکست‌های رو به بالا (خرید) را نگه می‌داریم
  const upBreaks = breaks.filter(b => b.direction === 'up');
  if (upBreaks.length === 0) return null;

  // ─── ۳. دریافت خطوط روند نزولی ──────────────────────────
  // استفاده از trendLinesParam (ارسال شده توسط موتور) یا fallback به getTrendLines()
  const trendLines = trendLinesParam || getTrendLines();
  const downLines = trendLines.filter(line =>
    (line.type === 'primaryDown' || line.type === 'manualDown') && line.slope < 0
  );
  if (downLines.length === 0) return null;

  // ─── ۴. انتخاب بهترین شکست (نزدیک‌ترین به ۰.۱۲٪) ──────
  let selectedLine = null;
  let bestDiff = Infinity;
  const TARGET = 0.12;

  for (const breakInfo of upBreaks) {
    // 🔴 توجه: breakInfo دارای lineId است، در حالی که خود خط دارای id است (بخش ۳.۲)
    const line = downLines.find(l => l.id === breakInfo.lineId);
    if (!line) continue;
    if (brokenLines.has(line.id)) continue;

    // محاسبه مقدار خط در کندل جاری
    const lineValue = calculateTrendLineValue(line, index);
    if (lineValue === null) continue;

    // ✅ در حالت nextCandle، استفاده از High کندل جاری برای سیگنال‌دهی مجاز است (بخش ۴.۱ و ۱۲.۲)
    const high = data[index].high;
    const diffPercent = ((high - lineValue) / lineValue) * 100;

    // فیلتر بازه‌ی ۰.۰۹% تا ۰.۱۵%
    if (diffPercent < 0.09 || diffPercent > 0.15) continue;

    // انتخاب نزدیک‌ترین به ۰.۱۲%
    if (Math.abs(diffPercent - TARGET) < Math.abs(bestDiff - TARGET)) {
      bestDiff = diffPercent;
      selectedLine = line;
    }
  }

  if (!selectedLine) return null;
  brokenLines.add(selectedLine.id);

  // ─── ۵. شرط RSI (طبق بخش ۴.۳) ──────────────────────────
  const rsiValue = calculateRSI(data, index, 14);
  if (rsiValue === null || rsiValue <= 50) return null;

  // ─── ۶. صدور سیگنال (بخش ۵.۱) ────────────────────────────
  const entryPrice = data[index].open; // ✅ قانون طلایی: قیمت ورود از open
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
