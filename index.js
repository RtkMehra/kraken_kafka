import { startKrakenClient } from './src/kraken/client.js';
import { startProducer, disconnect as disconnectProducer } from './src/kafka/producer.js';
import { startConsumer, getConsumer } from './src/kafka/consumer.js';
import { startWebSocketServer, close as closeWebSocketServer } from './src/websocket/server.js';
import logger from './src/utils/logger.js';

// Store service instances for graceful shutdown
const services = {};

async function start() {
  try {
    // First start Kafka producer for receiving data from Kraken
    services.producer = await startProducer();

    // Then start WebSocket server for client connections
    services.wsServer = await startWebSocketServer();

    // Start Kafka consumer to broadcast to WebSocket clients
    services.consumer = await startConsumer();

    // Finally start Kraken client to feed data to Kafka
    services.krakenClient = await startKrakenClient();

    logger.info('Market data pipeline ready (Kraken → Kafka → WebSocket)');
  } catch (error) {
    logger.error('Startup failed:', error);
    await shutdownServices(services);
    process.exit(1);
  }
}

function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);

    await shutdownServices(services);

    logger.info('Shutdown complete');
    process.exit(0);
  };

  // Listen for termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });
}

async function shutdownServices(services) {
  // Shutdown in reverse order of startup with proper error handling
  try {
    if (services.krakenClient) {
      logger.info('Disconnecting Kraken client...');
      await services.krakenClient.disconnect().catch(err =>
        logger.error('Error disconnecting Kraken client:', err)
      );
    }
  } catch (error) {
    logger.error('Error during Kraken client shutdown:', error);
  }

  try {
    if (services.consumer) {
      logger.info('Disconnecting Kafka consumer...');
      await services.consumer.disconnect().catch(err =>
        logger.error('Error disconnecting Kafka consumer:', err)
      );
    }
  } catch (error) {
    logger.error('Error during Kafka consumer shutdown:', error);
  }

  try {
    if (services.wsServer) {
      logger.info('Closing WebSocket server...');
      await closeWebSocketServer().catch(err =>
        logger.error('Error closing WebSocket server:', err)
      );
    }
  } catch (error) {
    logger.error('Error during WebSocket server shutdown:', error);
  }

  try {
    if (services.producer) {
      logger.info('Disconnecting Kafka producer...');
      await disconnectProducer().catch(err =>
        logger.error('Error disconnecting Kafka producer:', err)
      );
    }
  } catch (error) {
    logger.error('Error during Kafka producer shutdown:', error);
  }
}

start();

