const ANALYSIS_CONFIG = {
    trendLines: {
        pivotPeriod: 3,
        minTouchPoints: 3,
        minCandleDistance: 3,
        maxDeviation: 0.001
    },
    ichimoku: {
        enabled: true,
        useCloudFilter: true,
        useTKCross: true,
        useChikou: true,
        tenkanPeriod: 14,
        kijunPeriod: 30,
        senkouBPeriod: 57
    }
};

function customStrategy(data, index, breakPointsParam, ichimokuParam) {
    // ========== 1. خطوط روند صعودی ==========
    const trendLines = getTrendLines();
    const upTrendLines = trendLines.primaryUp || [];
    if (upTrendLines.length === 0) return null;

    // ========== 2. محاسبه میانگین متحرک ساده 50 ==========
    if (index < 50) return null;
    let sum = 0;
    for (let i = index - 50; i < index; i++) {
        sum += data[i].close;
    }
    const sma50 = sum / 50;
    const currentCandle = data[index];
    const { close, high, low, timestamp } = currentCandle;

    // ========== 3. بررسی برخورد قیمت با خط روند صعودی ==========
    let bestSignal = null;
    let closestToTarget = Infinity;
    const minDistance = 0.05;
    const maxDistance = 0.20;

    for (let i = 0; i < upTrendLines.length; i++) {
        const line = upTrendLines[i];
        if (line.endIndex > index) continue;
        if (line.startPrice >= line.endPrice) continue; // فقط صعودی

        const slope = (line.endIndex !== line.startIndex)
            ? (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex)
            : 0;
        const intercept = line.startPrice - slope * line.startIndex;
        const lineValue = slope * index + intercept;

        // فاصله High و Low از خط
        const distHigh = ((high - lineValue) / lineValue) * 100;
        const distLow = ((low - lineValue) / lineValue) * 100;

        // شرط برخورد (قیمت بالای خط باشد و فاصله در محدوده مجاز)
        if (!(distLow >= minDistance && distHigh <= maxDistance)) continue;

        // ========== 4. فیلتر ایچیموکو (در صورت فعال بودن) ==========
        if (ichimokuParam && typeof ichimokuParam === 'object') {
            const { isPriceBelowCloud, isTenkanBelowKijun } = ichimokuParam;
            if (!isPriceBelowCloud || !isTenkanBelowKijun) continue;
        }

        // ========== 5. فیلتر SMA50 (قیمت باید بالای SMA50 باشد) ==========
        if (close < sma50) continue;

        // ========== 6. بررسی عدم تکرار برخورد در گذشته ==========
        let hasPreviousTouch = false;
        for (let j = line.endIndex + 1; j < index; j++) {
            const pastCandle = data[j];
            const checkLineValue = slope * j + intercept;
            const dHigh = ((pastCandle.high - checkLineValue) / checkLineValue) * 100;
            const dLow = ((pastCandle.low - checkLineValue) / checkLineValue) * 100;
            if (dLow >= minDistance && dHigh <= maxDistance) {
                hasPreviousTouch = true;
                break;
            }
        }
        if (hasPreviousTouch) continue;

        // ========== 7. انتخاب بهترین سیگنال ==========
        const targetMiddle = (minDistance + maxDistance) / 2;
        const diff = Math.abs(distHigh - targetMiddle);
        if (diff < closestToTarget) {
            closestToTarget = diff;
            bestSignal = {
                signal: 'SELL',
                price: close,
                stopLoss: close * 1.005, // 0.5% بالاتر
                useStagedStopLoss: true,
                stopLossStages: [
                    { movePercent: 0.4, stopLossPercent: 0.4 },
                    { movePercent: 0.8, stopLossPercent: 0.7 },
                    { movePercent: 1.1, stopLossPercent: 0.9 },
                    { movePercent: 1.3, stopLossPercent: 1.1 },
                    { movePercent: 1.5, stopLossPercent: 1.3 },
                    { movePercent: 1.7, stopLossPercent: 1.5 },
                    { movePercent: 2, stopLossPercent: 1.7 },
                    { movePercent: 2.3, stopLossPercent: 2 },
                    { movePercent: 2.5, stopLossPercent: 2.3 },
                    { movePercent: 3, stopLossPercent: 2.8 },
                    { movePercent: 4, stopLossPercent: 3.5 },
                    { movePercent: 5, stopLossPercent: 4.5 },
                    { movePercent: 6, stopLossPercent: 5.5 },
                    { movePercent: 7, stopLossPercent: 6.5 },
                    { movePercent: 8, stopLossPercent: 7.5 }
                ],
                reason: `برخورد با خط روند صعودی + SMA50`,
                lineId: `trendline_${line.startIndex}_${line.endIndex}_${i}`,
                breakoutDetails: {
                    lineValue,
                    distHigh,
                    distLow,
                    candleIndex: index,
                    timestamp,
                    candleLow: low,
                    candleHigh: high,
                    candleClose: close
                }
            };
        }
    }

    if (bestSignal) {
        const date = new Date(bestSignal.breakoutDetails.timestamp).toLocaleString('fa-IR');
        console.log(`📉 سیگنال فروش | تاریخ: ${date} | کندل: ${index} | فاصله High=${bestSignal.breakoutDetails.distHigh.toFixed(2)}% | Low=${bestSignal.breakoutDetails.distLow.toFixed(2)}% | قیمت ورود (close): ${bestSignal.price.toFixed(4)}`);
    }

    return bestSignal;
}
