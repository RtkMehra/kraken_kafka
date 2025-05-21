import { Kafka } from 'kafkajs';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { broadcastToClients } from '../websocket/server.js';

class KafkaConsumer {
  constructor() {
    this.kafka = new Kafka({
      brokers: [config.KAFKA_BROKER],
      clientId: `${config.KAFKA_CLIENT_ID}-consumer`,
      connectionTimeout: 3000,
      requestTimeout: 5000,
    });

    this.consumer = this.kafka.consumer({
      groupId: config.KAFKA_CONSUMER_GROUP,
      sessionTimeout: 10000,
      heartbeatInterval: 1000,
      maxBytes: 1024 * 1024, // 1MB
      maxWaitTimeInMs: 50, // Low latency polling
      // Start from latest offset for real-time data
      readUncommitted: true,
    });

    // Track processed message IDs to prevent duplicates
    this.processedMessages = new Set();
    this.cleanupInterval = setInterval(() => {
      this.processedMessages.clear();
    }, 60000); // Clear every minute
  }

  async connect() {
    try {
      await this.consumer.connect();
      logger.info(`Kafka consumer connected to ${config.KAFKA_BROKER}`);

      // Parse topics string into array
      const topics = config.KAFKA_TOPICS.split(',').map(topic => topic.trim());

      // Subscribe to all topics
      await this.consumer.subscribe({
        topics,
        fromBeginning: false
      });

      logger.info(`Subscribed to Kafka topics: ${topics.join(', ')}`);

      await this.consumer.run({
        autoCommit: false,
        eachBatchAutoResolve: true,
        eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
          for (const message of batch.messages) {
            try {
              const data = JSON.parse(message.value.toString());
              // Always broadcast to WebSocket clients
              await broadcastToClients(data);
              await resolveOffset(message.offset);
              await heartbeat();
            } catch (error) {
              logger.error('Message processing error:', error);
            }
          }
        }
      });

      logger.info('Kafka consumer started');
      return this;
    } catch (error) {
      logger.error('Kafka consumer error:', error);
      throw error;
    }
  }

  async disconnect() {
    clearInterval(this.cleanupInterval);
    try {
      await this.consumer.disconnect();
      logger.info('Kafka consumer disconnected');
    } catch (error) {
      logger.error('Error disconnecting Kafka consumer:', error);
    }
  }
}

// Singleton instance
let consumerInstance;

export async function startConsumer() {
  if (!consumerInstance) {
    consumerInstance = new KafkaConsumer();
    await consumerInstance.connect();
  }
  return consumerInstance;
}

export function getConsumer() {
  return consumerInstance;
}

