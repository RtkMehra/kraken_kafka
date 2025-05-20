import logger from './utils/logger.js';
import { shutdownProducer } from './kafka/producer.js';
import { stopConsumer } from './kafka/consumer.js';

// Add graceful shutdown handler for the entire application
export function setupGracefulShutdown(services = {}) {
    let isShuttingDown = false;

    async function shutdown(signal) {
        if (isShuttingDown) return;
        isShuttingDown = true;

        logger.info(`Received ${signal}. Starting graceful shutdown...`);

        // Set a timeout for the entire shutdown process
        const shutdownTimeout = setTimeout(() => {
            logger.error('Graceful shutdown timed out after 30s, forcing exit');
            process.exit(1);
        }, 30000);

        try {
            // Shutdown components in reverse order of initialization

            // First, stop the Kraken client
            if (services.krakenClient) {
                logger.info('Stopping Kraken client...');
                if (typeof services.krakenClient.cleanup === 'function') {
                    services.krakenClient.cleanup();
                }
            }

            // Then stop the Kafka consumer
            logger.info('Stopping Kafka consumer...');
            await stopConsumer();

            // Then stop the WebSocket server
            if (services.wsServer) {
                logger.info('Stopping WebSocket server...');
                if (typeof services.wsServer.shutdown === 'function') {
                    await services.wsServer.shutdown();
                }
            }

            // Finally, stop the Kafka producer
            logger.info('Stopping Kafka producer...');
            await shutdownProducer();

            clearTimeout(shutdownTimeout);
            logger.info('Graceful shutdown completed successfully');

            // Allow logs to be flushed before exiting
            setTimeout(() => {
                process.exit(0);
            }, 500);
        } catch (error) {
            logger.error('Error during graceful shutdown:', error);
            clearTimeout(shutdownTimeout);
            process.exit(1);
        }
    }

    // Register signal handlers
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
