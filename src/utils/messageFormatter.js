/**
 * Formats market data into the standard format
 * @param {Object} data - Raw market data
 * @returns {Object} Formatted market data
 */
export function formatMarketData(data) {
    return {
        symbol: data.symbol,
        timestamp: data.timestamp || new Date().toISOString(),
        bid: Number(Number(data.bid).toFixed(2)),
        ask: Number(Number(data.ask).toFixed(2))
    };
} 