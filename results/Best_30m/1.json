/**
 * @filename B4Ic14-30-57+Chk_LadFib_BufOn.js
 * @description خرید با تاییدیه‌ی سه‌گانه‌ی کامل ایچیموکو (14,30,57): قیمت بالای ابر + تنکان بالای کیجون + چیکو صعودی
 * — تشخیص هم‌راستایی روی close کندل i انجام می‌شود، اما ورود واقعی روی open کندل i+1 اجرا می‌شود
 * (دقیقاً همان الگوی nextCandle که backtest-core.js برای خطوط روند استفاده می‌کند: detectTrendLineFirstBreak
 * با high/low کندل i تشخیص می‌دهد ولی breakPointsMap[i+1] پر می‌شود تا ورود یک کندل بعد باشد).
 * دلیل اصلاح: نسخه‌ی قبلی از close همان کندل i برای تایید سیگنال استفاده می‌کرد ولی entryPrice را هم
 * data[index].open همان کندل i می‌گذاشت — یعنی در لحظه‌ی open، از close‌ای استفاده می‌شد که هنوز شکل
 * نگرفته بود (آینده‌نگری). حالا سیگنال روی i تایید و «معلق» می‌شود و ورود فقط در فراخوانی بعدی
 * (index === i+1) با open همان کندل i+1 انجام می‌شود.
 * خروج: حد سود ممنوع (حذف شد)، خروج فقط با حد ضرر پلکانی = فیبوناچی تعدیل‌شده (Adjusted-Fibonacci).
 * دقت درون‌کندلی TP/SL از قبل و به‌صورت خودکار توسط backtest-core.js (getExitPriceAndReason /
 * detectFirstHitFrom5m، با enableIntrabarPrecision:true و fiveMinData=دیتای خام ۱ دقیقه‌ای که در
 * run-backtest.js پاس داده می‌شود) روی همه‌ی پوزیشن‌ها اعمال می‌شود — چیزی در این فایل لازم نیست
 * برای آن اضافه شود.
 * بافر فعال (enableSmartContinuation: true)
 */

const stopLossInitial = 0.4;

const ANALYSIS_CONFIG = {
  entryType: "nextCandle",
  breakTolerance: 0.02,
  ichimoku: {
    enabled: true,
    tenkanPeriod: 14,
    kijunPeriod: 30,
    senkouBPeriod: 57,
    useCloudFilter: true,
    useTKCross: true,
    useChikou: true
  },
  enableSmartContinuation: true
};

const stopLossStages = [
  { movePercent: 0.4, stopLossPercent: 0.2 },
  { movePercent: 2.4, stopLossPercent: 1.9 },
  { movePercent: 4.2, stopLossPercent: 3.5 },
  { movePercent: 6.1, stopLossPercent: 5.0 },
  { movePercent: 8.0, stopLossPercent: 6.6 },
  { movePercent: 9.9, stopLossPercent: 8.2 },
  { movePercent: 11.8, stopLossPercent: 9.9 },
  { movePercent: 13.7, stopLossPercent: 11.6 },
  { movePercent: 15.6, stopLossPercent: 13.4 },
  { movePercent: 17.6, stopLossPercent: 15.3 },
  { movePercent: 19.6, stopLossPercent: 17.2 },
  { movePercent: 21.6, stopLossPercent: 19.1 },
  { movePercent: 23.7, stopLossPercent: 21.1 },
  { movePercent: 25.8, stopLossPercent: 23.1 },
  { movePercent: 27.9, stopLossPercent: 25.1 },
  { movePercent: 30.0, stopLossPercent: 27.2 },
  { movePercent: 32.2, stopLossPercent: 29.3 },
  { movePercent: 34.4, stopLossPercent: 31.4 },
  { movePercent: 36.6, stopLossPercent: 33.5 },
  { movePercent: 38.8, stopLossPercent: 35.6 },
  { movePercent: 41.0, stopLossPercent: 37.7 },
  { movePercent: 43.3, stopLossPercent: 39.8 },
  { movePercent: 45.6, stopLossPercent: 41.9 },
  { movePercent: 47.9, stopLossPercent: 44.1 },
  { movePercent: 50.2, stopLossPercent: 46.2 },
];

function customStrategy(data, index, breakPointsParam, ichimokuParam, trendLinesParam, refineEntryPrice) {
  if (index < 61) return null;

  if (!globalThis.__state_B4Ic14_30_57_Chk_LadFib_BufOn || globalThis.__state_B4Ic14_30_57_Chk_LadFib_BufOn.dataRef !== data) {
    globalThis.__state_B4Ic14_30_57_Chk_LadFib_BufOn = { dataRef: data, wasBullish: false, pendingEntryIndex: null };
  }
  const st = globalThis.__state_B4Ic14_30_57_Chk_LadFib_BufOn;

  // ==================== مرحله‌ی ورود (کندل بعد از تایید) ====================
  // اگر کندل قبلی (index-1) تازه هم‌راستا شده بود، ورود همین‌جا روی open همین کندل (index) انجام می‌شود.
  if (st.pendingEntryIndex === index) {
    st.pendingEntryIndex = null;

    const entryPrice = data[index].open;
    const stopLoss = entryPrice * (1 - 0.004);

    return {
      signal: 'BUY',
      price: entryPrice,
      stopLoss: stopLoss,
      useStagedStopLoss: true,
      stopLossStages: stopLossStages
    };
  }

  // ==================== مرحله‌ی تشخیص (بر اساس close همین کندل) ====================
  if (!ichimokuParam || ichimokuParam.kumoTop === null || ichimokuParam.kumoTop === undefined ||
      !ichimokuParam.tenkan || !ichimokuParam.kijun) {
    st.wasBullish = false;
    return null;
  }

  const isBullishNow = ichimokuParam.isPriceAboveCloud &&
                        ichimokuParam.isTenkanAboveKijun &&
                        ichimokuParam.isChikouBullish === true;

  // فقط در همان کندلی که هر سه تاییدیه‌ی ایچیموکو تازه هم‌راستا شده‌اند سیگنال بده (نه هر کندلی که شرط برقرار است)
  const justAligned = isBullishNow && !st.wasBullish;
  st.wasBullish = isBullishNow;

  if (justAligned) {
    // سیگنال روی close همین کندل (index) تایید شد. در لحظه‌ی open همین کندل، close‌اش هنوز معلوم
    // نبود؛ پس ورود واقعی موکول به open کندل بعدی می‌شود (همان الگوی nextCandle خطوط روند).
    st.pendingEntryIndex = index + 1;
  }

  return null;
}
