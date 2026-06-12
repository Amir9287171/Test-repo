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
    const ta = global.__wickra;
    if (!ta) {
        console.log(`❌ Wickra not available at index ${index}`);
        return null;
    }

    const closes = data.slice(0, index + 1).map(c => c.close);
    if (closes.length < 14) return null;

    let rsiValue = null;
    try {
        const rsi = new ta.RSI(14);
        const rsiArray = rsi.batch(closes);
        rsiValue = rsiArray[rsiArray.length - 1];
        if (rsiValue === undefined || rsiValue === null || isNaN(rsiValue)) return null;
        console.log(`✅ RSI at ${index}: ${rsiValue.toFixed(2)}`);
    } catch (err) {
        console.log(`❌ RSI error: ${err.message}`);
        return null;
    }

    // سیگنال اجباری BUY
    const currentPrice = data[index].close;
    return {
        signal: 'BUY',
        price: currentPrice,
        stopLoss: currentPrice * 0.99,
        useStagedStopLoss: false,
        reason: `Wickra OK, RSI=${rsiValue.toFixed(2)}`,
        lineId: `test_${index}`,
        breakoutDetails: { candleIndex: index, timestamp: data[index].timestamp }
    };
}
