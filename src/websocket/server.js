import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { formatMarketData } from '../utils/messageFormatter.js';

let wss;
let server;

// Pre-allocate subscription sets for faster lookups
const subscriptionsBySymbol = new Map();

// Pre-format welcome message
const WELCOME_MESSAGE = JSON.stringify({
  type: 'info',
  message: 'Connected to Market Data Pipeline',
  timestamp: new Date().toISOString()
});

// Track recent messages to prevent duplicates
const recentMessages = new Map(); // messageId -> timestamp
const MESSAGE_RETENTION = 1000; // 1 second retention

// Cleanup old messages periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, timestamp] of recentMessages) {
    if (now - timestamp > MESSAGE_RETENTION) {
      recentMessages.delete(id);
    }
  }
}, 5000);

export function startWebSocketServer() {
  return new Promise((resolve) => {
    server = http.createServer();
    wss = new WebSocketServer({ server });

    wss.on('connection', handleNewConnection);

    server.listen(config.WS_PORT, () => {
      logger.info(`WebSocket server started on port ${config.WS_PORT}`);
      resolve(wss);
    });
  });
}

function handleNewConnection(ws) {
  const clientCount = wss.clients.size;
  if (clientCount % 10 === 0) {
    logger.info(`Active WebSocket clients: ${clientCount}`);
  }

  ws.subscriptions = new Set();
  ws.send(WELCOME_MESSAGE);

  ws.on('message', (message) => handleClientMessage(ws, message));
  ws.on('close', () => handleClientDisconnect(ws));
  ws.on('error', (error) => logger.error('WebSocket error:', error));
}

function handleClientMessage(ws, message) {
  try {
    const data = JSON.parse(message);
    const symbols = Array.isArray(data.symbols) ? data.symbols : [data.symbols];

    if (data.action === 'subscribe') {
      symbols.forEach(symbol => {
        // Normalize symbol format
        const normalizedSymbol = symbol.toUpperCase();

        // Add to client's subscriptions
        ws.subscriptions.add(normalizedSymbol);

        // Add to symbol's subscriber list
        let subscribers = subscriptionsBySymbol.get(normalizedSymbol);
        if (!subscribers) {
          subscribers = new Set();
          subscriptionsBySymbol.set(normalizedSymbol, subscribers);
        }
        subscribers.add(ws);
      });

      logger.debug(`Client subscribed to: ${Array.from(ws.subscriptions).join(', ')}`);
    } else if (data.action === 'unsubscribe') {
      symbols.forEach(symbol => {
        const normalizedSymbol = symbol.toUpperCase();
        ws.subscriptions.delete(normalizedSymbol);

        const subscribers = subscriptionsBySymbol.get(normalizedSymbol);
        if (subscribers) {
          subscribers.delete(ws);
          if (subscribers.size === 0) {
            subscriptionsBySymbol.delete(normalizedSymbol);
          }
        }
      });

      logger.debug(`Client unsubscribed from: ${symbols.join(', ')}`);
    }

    // Send confirmation
    ws.send(JSON.stringify({
      type: 'subscription',
      status: 'success',
      symbols: Array.from(ws.subscriptions)
    }));
  } catch (error) {
    logger.error('Subscription error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid subscription request'
    }));
  }
}

function handleClientDisconnect(ws) {
  // Clean up all subscriptions for this client
  ws.subscriptions.forEach(symbol => {
    const subscribers = subscriptionsBySymbol.get(symbol);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        subscriptionsBySymbol.delete(symbol);
      }
    }
  });
}

/**
 * Broadcasts data to subscribed WebSocket clients
 * @param {Object} data - The market data to broadcast
 * @returns {Promise<number>} Number of clients the message was sent to
 */
export function broadcastToClients(data) {
  return new Promise((resolve) => {
    if (!wss?.clients || !data?.symbol) {
      resolve(0);
      return;
    }

    // Check for duplicate message
    const messageId = `${data.symbol}-${data.timestamp}`;
    if (recentMessages.has(messageId)) {
      resolve(0);
      return;
    }
    recentMessages.set(messageId, Date.now());

    const message = JSON.stringify({
      symbol: data.symbol,
      timestamp: data.timestamp,
      bid: Number(data.bid),
      ask: Number(data.ask)
    });

    // Get subscribers for this symbol
    const subscribers = subscriptionsBySymbol.get(data.symbol);
    if (!subscribers || subscribers.size === 0) {
      resolve(0);
      return; // No subscribers for this symbol
    }

    let sentCount = 0;

    // Only send to subscribed clients
    for (const client of subscribers) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
          sentCount++;
        } catch (error) {
          logger.error('Send failed:', error);
          subscribers.delete(client); // Remove failed client
        }
      } else {
        subscribers.delete(client); // Clean up stale clients
      }
    }

    // Clean up empty subscription sets
    if (subscribers.size === 0) {
      subscriptionsBySymbol.delete(data.symbol);
    }

    resolve(sentCount);
  });
}

export async function close() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        logger.info('WebSocket server closed');
        resolve();
      });
    } else {
      resolve();
    }
  });
}


