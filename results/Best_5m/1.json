// ============================================================
// بخش ۱: پیکربندی تحلیل (ANALYSIS_CONFIG)
// ============================================================
const ANALYSIS_CONFIG = {
    trendLines: {
        pivotPeriod: 5,          // دوره تشخیص پیوت (قله/دره)
        minTouchPoints: 3,       // حداقل برخورد با خط برای اعتبار
        minCandleDistance: 3,    // حداقل فاصله کندلی بین برخوردها
        maxDeviation: 0.001      // حداکثر انحراف مجاز (۰٫۱٪)
    },
    ichimoku: {
        enabled: true,
        tenkanPeriod: 14,        // دوره تنکان‌سن
        kijunPeriod: 30,         // دوره کیجون‌سن
        senkouBPeriod: 57,       // دوره سنکو اسپن B
        useCloudFilter: true,    // فیلتر ابر کومو
        useTKCross: true,        // فیلتر تقاطع تنکان/کیجون
        useChikou: false         // فیلتر چیکو (غیرفعال)
    }
};

// ============================================================
// بخش ۲: منطق معاملاتی (customStrategy)
// ============================================================
function customStrategy(data, index, breakPointsParam, ichimokuParam) {

    // ── گارد ۱: حداقل داده لازم برای محاسبه ────────────────
    if (index < 60) return null;

    // ── گارد ۲: اعتبارسنجی ایچیموکو ──────────────────────
    if (!ichimokuParam) return null;
    if (ichimokuParam.kumoTop === null || ichimokuParam.kumoTop === undefined) return null;
    if (!ichimokuParam.tenkan || !ichimokuParam.kijun) return null;

    // ── دریافت خطوط روند ──────────────────────────────────
    const trendLines = getTrendLines();
    const downTrendLines = trendLines.primaryDown || [];
    if (downTrendLines.length === 0) return null;

    // ── پارامترهای استراتژی ──────────────────────────────
    const MIN_DIST = 0.09;   // حداقل فاصله (درصد)
    const MAX_DIST = 0.15;   // حداکثر فاصله (درصد)
    const TARGET = 0.12;     // وسط بازه
    const STOP_LOSS_PERCENT = 0.5;  // حد ضرر اولیه (درصد)
    const TAKE_PROFIT_PERCENT = 2.0; // حد سود (درصد)

    const currentCandle = data[index];
    const entryPrice = currentCandle.open;  // ← قانون طلایی: قیمت ورود از open

    let bestSignal = null;
    let closestToTarget = Infinity;

    // ── حلقه روی خطوط روند نزولی ──────────────────────────
    for (let i = 0; i < downTrendLines.length; i++) {
        const line = downTrendLines[i];

        // شرط ۱: خط باید به کندل فعلی رسیده باشد
        if (line.endIndex > index) continue;

        // شرط ۲: شیب خط باید منفی باشد (نزولی واقعی)
        if (line.startPrice <= line.endPrice) continue;

        // محاسبه مقدار خط در کندل فعلی
        const slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
        const intercept = line.startPrice - slope * line.startIndex;
        const lineValue = slope * index + intercept;

        // محاسبه فاصله قیمت‌های High و Low از خط (به درصد)
        const distanceLow = ((currentCandle.low - lineValue) / lineValue) * 100;
        const distanceHigh = ((currentCandle.high - lineValue) / lineValue) * 100;

        // شرط ۳: کندل باید خط را بشکند
        const isBreak = (distanceLow <= MAX_DIST && distanceHigh >= MIN_DIST);
        if (!isBreak) continue;

        // شرط ۴: فیلتر ایچیموکو
        const isIchimokuValid = (
            ichimokuParam.isPriceAboveCloud &&   // قیمت بالای ابر
            ichimokuParam.isTenkanAboveKijun     // تنکان بالای کیجون
        );
        if (!isIchimokuValid) continue;

        // شرط ۵: جلوگیری از شکست تکراری
        let hasPreviousBreak = false;
        for (let j = line.endIndex + 1; j < index; j++) {
            const pastCandle = data[j];
            const pastLineValue = slope * j + intercept;
            const pastDistLow = ((pastCandle.low - pastLineValue) / pastLineValue) * 100;
            const pastDistHigh = ((pastCandle.high - pastLineValue) / pastLineValue) * 100;
            if (pastDistLow <= MAX_DIST && pastDistHigh >= MIN_DIST) {
                hasPreviousBreak = true;
                break;
            }
        }
        if (hasPreviousBreak) continue;

        // شرط ۶: انتخاب بهترین سیگنال (نزدیک‌ترین به ۰.۱۲٪)
        const diffFromTarget = Math.abs(distanceHigh - TARGET);
        if (diffFromTarget < closestToTarget) {
            closestToTarget = diffFromTarget;

            // محاسبه حد ضرر اولیه
            const stopLoss = entryPrice * (1 - STOP_LOSS_PERCENT / 100);

            // محاسبه حد سود
            const takeProfit = entryPrice * (1 + TAKE_PROFIT_PERCENT / 100);

            // ============================================================
            // حد ضرر پلکانی (۱۵ مرحله‌ای) — مطابق با جدول شرح استراتژی
            // ============================================================
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

            // ── ساخت سیگنال ──────────────────────────────────────
            bestSignal = {
                signal: 'BUY',
                price: entryPrice,
                stopLoss: stopLoss,
                takeProfit: takeProfit,
                useStagedStopLoss: true,
                stopLossStages: stopLossStages,
                reason: `شکست خط نزولی (Low=${distanceLow.toFixed(2)}%, High=${distanceHigh.toFixed(2)}%)`,
                lineId: `trendline_${line.startIndex}_${line.endIndex}_${i}`,
                breakoutDetails: {
                    lineValue: lineValue,
                    distanceLow: distanceLow,
                    distanceHigh: distanceHigh,
                    candleIndex: index,
                    timestamp: currentCandle.timestamp,
                    candleLow: currentCandle.low,
                    candleHigh: currentCandle.high,
                    candleClose: currentCandle.close
                }
            };
        }
    }

    // ── لاگ سیگنال ──────────────────────────────────────────
    if (bestSignal) {
        const date = new Date(bestSignal.breakoutDetails.timestamp).toLocaleString('fa-IR');
        console.log(`🎯 سیگنال خرید | تاریخ: ${date} | کندل: ${index} | فاصله High=${bestSignal.breakoutDetails.distanceHigh.toFixed(3)}% | قیمت ورود: ${bestSignal.price.toFixed(4)}`);
    }

    return bestSignal;  // اگر سیگنال نبود، null برمی‌گرداند
}
