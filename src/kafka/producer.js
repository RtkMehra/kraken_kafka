import { Kafka, Partitioners } from 'kafkajs';
import config from '../config/env.js';
import logger from '../utils/logger.js';

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
 * Ensures all required topics exist
 * @param {string[]} topics - List of topics to check/create
 */
async function ensureTopicsExist(topics) {
  try {
    const admin = kafka.admin();
    await admin.connect();

    // Get list of existing topics
    const existingTopics = await admin.listTopics();

    // Filter out topics that don't exist
    const missingTopics = topics.filter(topic => !existingTopics.includes(topic));

    if (missingTopics.length > 0) {
      logger.info(`Creating missing topics: ${missingTopics.join(', ')}`);

      await admin.createTopics({
        topics: missingTopics.map(topic => ({
          topic,
          numPartitions: 1,
          replicationFactor: 1
        }))
      });
    }

    await admin.disconnect();
  } catch (error) {
    logger.error('Failed to ensure topics exist:', error);
    throw error;
  }
}

/**
 * Starts the Kafka producer.
 * @returns {Promise} A promise that resolves to the producer instance.
 */
export async function startProducer() {
  try {
    // Ensure topics exist before connecting producer
    const topics = config.KAFKA_TOPICS.split(',').map(topic => topic.trim());
    await ensureTopicsExist(topics);

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
 * @param {string} topics - Comma-separated list of Kafka topics
 * @param {Object} message - The message to send
 * @returns {Promise<boolean>} Success status
 */
export async function sendToKafka(topics, message) {
  if (!isConnected) return false;

  try {
    const messageId = `${message.symbol}-${message.timestamp}`;

    // Skip if duplicate within retention period
    if (recentMessages.has(messageId)) {
      return true;
    }

    recentMessages.add(messageId);
    setTimeout(() => recentMessages.delete(messageId), MESSAGE_RETENTION);

    // Send to all configured topics
    const topicList = topics.split(',').map(topic => topic.trim());

    await Promise.all(topicList.map(topic =>
      producer.send({
        topic,
        messages: [{
          key: message.symbol,
          value: JSON.stringify(message),
          timestamp: Date.now()
        }],
        timeout: 1000
      })
    ));

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





