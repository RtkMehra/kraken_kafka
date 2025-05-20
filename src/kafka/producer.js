import { Kafka, Partitioners } from 'kafkajs';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { formatMarketData } from '../utils/messageFormatter.js';

// Kafka configuration
const kafka = new Kafka({
  brokers: [config.KAFKA_BROKER],
  clientId: config.KAFKA_CLIENT_ID,
  // Optimize for low latency
  connectionTimeout: 3000,
  requestTimeout: 5000,
});

const producer = kafka.producer({
  allowAutoTopicCreation: false,
  transactionTimeout: 5000,
  maxInFlightRequests: 1,
  idempotent: true,
  acks: 1,
  compression: 'none',
  createPartitioner: Partitioners.LegacyPartitioner,
  // Add performance settings
  batchSize: 0,           // Disable batching
  linger: 0,              // Send immediately
  bufferSize: 1024 * 1024 // 1MB buffer
});

// Track connection state
let isConnected = false;
let isShuttingDown = false;
let messageCount = 0;
let lastLogTime = 0;

// Track recent messages to prevent duplicates
const recentMessages = new Set();
const MESSAGE_RETENTION = 1000; // 1 second retention

// Connection monitoring
producer.on('producer.connect', () => {
  isConnected = true;
});

producer.on('producer.disconnect', () => {
  isConnected = false;
  if (!isShuttingDown) {
    logger.warn('Kafka connection lost');
  }
});

producer.on('producer.network.request_timeout', (payload) => {
  logger.warn('Kafka producer request timeout:', payload);
});

/**
 * Starts the Kafka producer.
 * @returns {Promise} A promise that resolves to the producer instance.
 */
export async function startProducer() {
  try {
    await producer.connect();
    logger.info(`Kafka producer connected to ${config.KAFKA_BROKER}`);
    return producer;
  } catch (error) {
    logger.error('Failed to start Kafka producer:', error);
    throw error;
  }
}

/**
 * Sends a message to a Kafka topic.
 * @param {string} topic - The Kafka topic to send the message to.
 * @param {string|object} message - The message to send. Can be a string or an object.
 * @returns {Promise<boolean>} A promise that resolves to true if the message was sent successfully, false otherwise.
 */
export async function sendToKafka(topic, message) {
  if (!isConnected) return false;

  try {
    const messageId = `${message.symbol}-${message.timestamp}`;

    // Skip if duplicate within retention period
    if (recentMessages.has(messageId)) {
      return true;
    }

    recentMessages.add(messageId);
    setTimeout(() => recentMessages.delete(messageId), MESSAGE_RETENTION);

    await producer.send({
      topic,
      messages: [{
        key: message.symbol,
        value: JSON.stringify(message),
        timestamp: Date.now()
      }],
      timeout: 1000
    });
    return true;
  } catch (error) {
    logger.error('Kafka send failed:', error);
    return false;
  }
}

/**
 * Disconnects the Kafka producer.
 * @returns {Promise} A promise that resolves when the producer is disconnected.
 */
export async function disconnect() {
  try {
    await producer.disconnect();
    logger.info('Kafka producer disconnected');
  } catch (error) {
    logger.error('Error disconnecting Kafka producer:', error);
  }
}

export { producer };





