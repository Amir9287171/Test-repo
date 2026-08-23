/**
 * @filename S4DvgBear_PP12Rsi10Lb2Tol12_HiddenOnly.js
 * @description SELL با تایید واگرایی نزولی خالص (بدون خط روند/ایچیموکو).
 *   اندیکاتور(ها): RSI | نوع سیگنال پذیرفته‌شده: فقط Hidden
 *   مثل باین اصلی ولی فقط واگرایی‌های Hidden (ادامه‌دهنده‌ی روند) قبول می‌شوند، نه Regular. مقایسه‌اش با باین اصلی نشان می‌دهد آیا فیلتر کردن نوع سیگنال کیفیت را بالا می‌برد یا فقط تعداد معاملات را کم می‌کند.
 *   حد ضرر ثابت اولیه: ۰.۴٪ | حد ضرر پلکانی: مجموعه‌ی «فیبوناچی تعدیل‌شده» (بخش ۶.۲.۰ راهنما)
 */

const ANALYSIS_CONFIG = {
  entryType: "nextCandle",
  breakTolerance: 0.001,           // اجباری طبق راهنما، ولی در این استراتژی مصرف نمی‌شود (بدون خط روند)
  enableSmartContinuation: true,
  divergence: {
    indicators: ["RSI"],
    config: {
      PIVOT_PERIOD: 12,
      RSI_PERIOD: 10,
      LOOKBACK_PIVOTS: 2,
      PIVOT_ALIGNMENT_TOLERANCE: 12
    }
  }
};

const stopLossInitial = 0.4; // درصد

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

// باید دقیقاً برابر با ANALYSIS_CONFIG.divergence.config.PIVOT_PERIOD بالا باشد (یا پیش‌فرض
// سیستم اگر PIVOT_PERIOD override نشده). این فاصله‌ی واقعی تأییدِ بدون‌آینده‌نگریِ هر پیوت
// است (نگاه کنید به findPivots در divergence-detector.js) — نه یک عدد دلخواه.
const PIVOT_CONFIRM_LAG = 12;

function customStrategy(data, index) {
  if (index < 120) return null; // مهلت کافی برای warm-up اندیکاتور + پیوت‌ها با هر PIVOT_PERIOD تا ۲۰

  // سیگنال فقط بر اساس آخرین کندل کاملاً بسته‌شده بررسی می‌شود (جلوگیری از آینده‌نگری/ریپینت —
  // طبق الگوی اسنپ‌شات/تاخیر یک‌کندلیِ بخش ۴.۴.۲ راهنما)
  const sigIndex = index - 1;

  const divSignals = getDivergenceSignals();
  if (!divSignals || divSignals.length === 0) return null;

  // فیلتر اجباری روی endIndex (بخش ۴.۴.۲/۴.۴.۳ راهنما): بدون این فاصله‌ی دقیق، یا سیگنال هرگز
  // true نمی‌شود (اگر فاصله را ۱ بگیرید — چون حداقل فاصله‌ی واقعی برابر PIVOT_PERIOD است، نه ۱)،
  // یا اگر بدون هیچ فاصله‌ای فیلتر کنید، یک واگرایی قدیمی برای همیشه true می‌ماند.
  const hasSellDivergence = divSignals.some(sig =>
    sig.type === 'HiddenBearish' &&
    (sigIndex - sig.endIndex === PIVOT_CONFIRM_LAG)
  );
  if (!hasSellDivergence) return null;

  const entryPrice = data[index].open;
  const stopLoss = entryPrice * (1 + stopLossInitial / 100);

  return {
    signal: 'SELL',
    price: entryPrice,
    stopLoss: stopLoss,
    useStagedStopLoss: true,
    stopLossStages: stopLossStages
  };
}
