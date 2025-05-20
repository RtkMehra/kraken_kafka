import { startKrakenClient } from './kraken/client.js';
import { startProducer } from './kafka/producer.js';
import { startConsumer } from './kafka/consumer.js';
import { startWebSocketServer } from './websocket/server.js';
import logger from './utils/logger.js';

// Store service instances for graceful shutdown
const services = {};

async function start() {
  try {
    // First start Kafka producer
    await startProducer();
    logger.info('Kafka producer started successfully');

    // Then start WebSocket server
    services.wsServer = await startWebSocketServer();
    logger.info('WebSocket server started successfully');

    // Then start Kafka consumer
    services.kafkaConsumer = await startConsumer();
    logger.info('Kafka consumer started successfully');

    // Finally start Kraken client
    services.krakenClient = await startKrakenClient();
    logger.info('Kraken client started successfully');

    logger.info('Market data pipeline started successfully');
    logger.info('Streaming data from Kraken → Kafka → WebSocket');

    // Handle graceful shutdown
    setupGracefulShutdown(services);
  } catch (error) {
    logger.error('Failed to start market data pipeline:', error);
    process.exit(1);
  }
}

function setupGracefulShutdown(services) {
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    
    // Shutdown Kraken client first
    if (services.krakenClient) {
      logger.info('Stopping Kraken client...');
      await services.krakenClient.disconnect();
    }
    
    // Then Kafka consumer
    if (services.kafkaConsumer) {
      logger.info('Stopping Kafka consumer...');
      await services.kafkaConsumer.disconnect();
    }
    
    // Then WebSocket server
    if (services.wsServer) {
      logger.info('Stopping WebSocket server...');
      await services.wsServer.close();
    }
    
    // Finally Kafka producer
    if (services.producer) {
      logger.info('Stopping Kafka producer...');
      await services.producer.disconnect();
    }
    
    logger.info('Shutdown complete');
    process.exit(0);
  };

  // Listen for termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();