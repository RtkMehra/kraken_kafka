import WebSocket from 'ws';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { sendToKafka } from '../kafka/producer.js';
import { perfMonitor } from '../utils/performance.js';

class KrakenClient {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 30;  // Increased from 10 to 30
    this.reconnectDelay = 5000;      // Increased initial delay to 5 seconds
    this.maxReconnectDelay = 60000;  // Increased max delay to 1 minute
    this.reconnectTimer = null;
    this.isConnected = false;
    this.isShuttingDown = false;
    this.messageCount = 0;
    this.lastMessageTime = 0;
    this.healthCheckInterval = null;
    this.pingInterval = null;        // Added ping interval
  }

  async connect() {
    if (this.isShuttingDown) return this;

    logger.startOperation('kraken-connect');

    try {
      this.ws = new WebSocket(config.KRAKEN_WS_URL, {
        handshakeTimeout: 10000, // 10 seconds timeout for initial connection
        maxPayload: 5 * 1024 * 1024, // 5MB max payload
      });

      this.setupEventHandlers();

      // Set up health check to detect stalled connections
      this.setupHealthCheck();

      return this;
    } catch (error) {
      logger.failOperation('kraken-connect', error);
      this.scheduleReconnect();
      return this;
    }
  }

  setupEventHandlers() {
    if (!this.ws) return;

    this.ws.on('open', () => {
      this.onOpen();
    });

    this.ws.on('message', (data) => {
      this.onMessage(data);
    });

    this.ws.on('error', (error) => {
      this.onError(error);
    });

    this.ws.on('close', (code, reason) => {
      this.onClose(code, reason);
    });

    // Add ping to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000); // Send ping every 30 seconds
  }

  onOpen() {
    logger.endOperation('kraken-connect');
    this.reconnectAttempts = 0;
    this.isConnected = true;
    this.lastMessageTime = Date.now();

    // Fix subscription message format
    const subscription = {
      event: 'subscribe',  // Changed from 'name' to 'event'
      pair: config.KRAKEN_PAIRS,
      subscription: {
        name: 'ticker'
      }
    };

    logger.info(`Subscribing to ticker data for: ${config.KRAKEN_PAIRS.join(', ')}`);

    try {
      const subscriptionMsg = JSON.stringify(subscription);
      this.ws.send(subscriptionMsg);
      logger.debug('Sent subscription message:', subscriptionMsg);
    } catch (error) {
      logger.error('Failed to send subscription message:', error);
    }
  }

  onMessage(data) {
    try {
      const startTime = Date.now();
      const message = JSON.parse(data.toString());

      // Handle subscription messages
      if (!Array.isArray(message)) {
        if (message.event === 'subscriptionStatus') {
          if (message.status === 'subscribed') {
            logger.info(`Subscribed to ${message.pair}`);
          }
        }
        return;
      }

      // Process ticker data and send only to Kafka
      const marketData = this.parseTickerData(message);
      if (marketData) {
        // Send to Kafka only
        sendToKafka(config.KAFKA_TOPIC, marketData)
          .catch(error => logger.error('Kafka send failed:', error));

        perfMonitor.trackMessage(startTime);
      }
    } catch (error) {
      logger.error('Message processing error:', error);
    }
  }

  onError(error) {
    logger.error('Kraken WebSocket error:', error);
  }

  onClose(code, reason) {
    this.isConnected = false;

    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.isShuttingDown) {
      logger.info('Kraken WebSocket connection closed (shutdown)');
      return;
    }

    const reasonStr = reason ? reason.toString() : 'Unknown reason';
    // Add more context for code 1006
    const contextMsg = code === 1006 ?
      ' (Abnormal Closure: The connection was closed abnormally)' : '';
    logger.warn(`Kraken WebSocket connection closed with code ${code}${contextMsg}: ${reasonStr}`);

    // Immediate reconnect for specific error codes
    if (code === 1006 || code === 1001) {
      this.reconnect();
    } else {
      this.scheduleReconnect();
    }
  }

  parseTickerData(message) {
    try {
      const [, data, channelName, pair] = message;

      // Fast validation
      if (channelName !== 'ticker' || !data?.a?.[0] || !data?.b?.[0]) return null;

      // Use faster Number() instead of parseFloat()
      const bid = Number(data.b[0]);
      const ask = Number(data.a[0]);

      if (!bid || !ask) return null;

      return {
        symbol: pair.replace('XBT/', 'BTC/').replace('/', ''),
        timestamp: new Date().toISOString(),
        bid,
        ask
      };
    } catch {
      return null;
    }
  }

  setupHealthCheck() {
    // Clear any existing interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check connection health every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      if (!this.isConnected) return;

      const now = Date.now();
      const messageAge = now - this.lastMessageTime;

      // If no messages for 2 minutes, consider connection stalled
      if (messageAge > 120000) {
        logger.warn(`No messages received for ${messageAge}ms, reconnecting...`);
        this.reconnect();
      }
    }, 30000);
  }

  reconnect() {
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch (error) {
        logger.error('Error terminating WebSocket:', error);
      }
      this.ws = null;
    }

    this.connect();
  }

  scheduleReconnect() {
    if (this.isShuttingDown) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      logger.error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts. Giving up.`);
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 1000,
      this.maxReconnectDelay
    );

    logger.info(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  async disconnect() {
    this.isShuttingDown = true;

    // Clear intervals and timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.ws) {
      try {
        // Only try to close if the connection is open
        if (this.ws.readyState === WebSocket.OPEN) {
          logger.info('Closing Kraken WebSocket connection...');
          this.ws.close(1000, 'Shutdown requested');
        } else {
          this.ws.terminate();
        }
      } catch (error) {
        logger.error('Error closing Kraken WebSocket:', error);
      }
      this.ws = null;
    }

    return Promise.resolve();
  }
}

// Singleton instance
let clientInstance;

export async function startKrakenClient() {
  if (!clientInstance) {
    clientInstance = new KrakenClient();
    await clientInstance.connect();
  }
  return clientInstance;
}



