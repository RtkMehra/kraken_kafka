import logger from '../utils/logger.js';
import { formatMarketData } from '../utils/messageFormatter.js';

export function parseTickerData(message) {
  try {
    // Kraken message format: [channelID, data, "ticker", pair]
    // Example: [0,{"a":["39485.40000","1","1.000"],"b":["39485.30000","1","1.000"]},ticker","XBT/USD"]
    const [channelId, data, channelName, pair] = message;

    if (!data || !pair || channelName !== 'ticker') {
      return null;
    }

    // Extract and validate prices
    const bid = parseFloat(data.b?.[0]);
    const ask = parseFloat(data.a?.[0]);

    if (isNaN(bid) || isNaN(ask)) {
      logger.debug('Invalid price data', { pair, bid, ask });
      return null;
    }

    // Convert pair format (e.g., "XBT/USD" to "BTCUSD")
    const symbol = pair
      .replace('XBT/', 'BTC/')  // Kraken uses XBT instead of BTC
      .replace('/', '');        // Remove the slash

    // Format in the standardized format
    return formatMarketData({
      symbol,
      timestamp: new Date().toISOString(),
      bid,
      ask
    });

    /* 
    FUTURE SCOPE: Full ticker data
    return {
      symbol,
      timestamp: new Date().toISOString(),
      // Best ask: price, whole lot volume, lot volume
      ask: parseFloat(data.a[0]),
      askVolume: parseFloat(data.a[2]),
      // Best bid: price, whole lot volume, lot volume
      bid: parseFloat(data.b[0]),
      bidVolume: parseFloat(data.b[2]),
      // Last trade closed: price, lot volume
      close: parseFloat(data.c[0]),
      closeVolume: parseFloat(data.c[1]),
      // Volume: today, last 24 hours
      volume: {
        today: parseFloat(data.v[0]),
        last24h: parseFloat(data.v[1])
      },
      // Volume weighted average price: today, last 24 hours
      vwap: {
        today: parseFloat(data.p[0]),
        last24h: parseFloat(data.p[1])
      },
      // Number of trades: today, last 24 hours
      trades: {
        today: parseInt(data.t[0]),
        last24h: parseInt(data.t[1])
      },
      // Low price: today, last 24 hours
      low: {
        today: parseFloat(data.l[0]),
        last24h: parseFloat(data.l[1])
      },
      // High price: today, last 24 hours
      high: {
        today: parseFloat(data.h[0]),
        last24h: parseFloat(data.h[1])
      },
      // Today's opening price
      open: parseFloat(data.o[0])
    };*/
  } catch (error) {
    logger.error('Failed to parse ticker data:', error);
    return null;
  }
}