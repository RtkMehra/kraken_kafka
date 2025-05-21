import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env file
dotenv.config();

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// Create a default .env file if it doesn't exist
const envPath = path.join(rootDir, '.env');
if (!fs.existsSync(envPath)) {
    const defaultEnv = `# Server configuration
WS_PORT=8080
KAFKA_BROKER=localhost:9092
KAFKA_TOPICS=quotes.crypto
KAFKA_CLIENT_ID=market-data-service
KAFKA_CONSUMER_GROUP=ws-consumers

# Kraken configuration
KRAKEN_PAIRS=BTC/USD,ETH/USD
KRAKEN_WS_URL=wss://ws.kraken.com

# Logging level (debug, info, warn, error)
LOG_LEVEL=info
`;
    fs.writeFileSync(envPath, defaultEnv);
    console.log(`Created default .env file at ${envPath}`);
}

/**
 * Validates that a value is present and returns it or a default
 * @param {string} value - The value to check
 * @param {string} defaultValue - Default value if not present
 * @param {string} name - Name for error reporting
 * @returns {string} The validated value
 */
function validateString(value, defaultValue, name) {
    if (!value && !defaultValue) {
        throw new Error(`Missing required configuration: ${name}`);
    }
    return value || defaultValue;
}

/**
 * Validates a port number
 * @param {string|number} port - The port to validate
 * @param {number} defaultPort - Default port if not valid
 * @returns {number} The validated port
 */
function validatePort(port, defaultPort) {
    const parsedPort = parseInt(port, 10);
    if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        return defaultPort;
    }
    return parsedPort;
}

/**
 * Validates and parses a comma-separated list
 * @param {string} value - Comma-separated string
 * @param {string} defaultValue - Default if not present
 * @param {string} name - Name for error reporting
 * @returns {string[]} Array of values
 */
function validateList(value, defaultValue, name) {
    const list = (value || defaultValue || '').split(',').filter(Boolean);
    if (list.length === 0) {
        throw new Error(`Missing required configuration: ${name}`);
    }
    return list;
}

function validateTopics(value, defaultValue, name) {
    const topics = (value || defaultValue || '').split(',')
        .map(topic => topic.trim())
        .filter(Boolean);

    if (topics.length === 0) {
        throw new Error(`Missing required configuration: ${name}`);
    }

    // Validate topic names
    topics.forEach(topic => {
        if (!/^[a-zA-Z0-9._-]+$/.test(topic)) {
            throw new Error(`Invalid topic name: ${topic}`);
        }
    });

    return topics.join(',');
}

// Define configuration with validation
const config = {
    KAFKA_BROKER: validateString(process.env.KAFKA_BROKER, 'localhost:9092', 'KAFKA_BROKER'),
    KAFKA_TOPICS: validateTopics(process.env.KAFKA_TOPICS, 'quotes.crypto', 'KAFKA_TOPICS'),
    KAFKA_CLIENT_ID: validateString(process.env.KAFKA_CLIENT_ID, 'market-data-service', 'KAFKA_CLIENT_ID'),
    KAFKA_CONSUMER_GROUP: validateString(process.env.KAFKA_CONSUMER_GROUP, 'ws-consumers', 'KAFKA_CONSUMER_GROUP'),
    WS_PORT: validatePort(process.env.WS_PORT, 8080),
    KRAKEN_WS_URL: validateString(process.env.KRAKEN_WS_URL, 'wss://ws.kraken.com', 'KRAKEN_WS_URL'),
    KRAKEN_PAIRS: validateList(process.env.KRAKEN_PAIRS, 'BTC/USD,ETH/USD', 'KRAKEN_PAIRS'),
    LOG_LEVEL: validateString(process.env.LOG_LEVEL, 'info', 'LOG_LEVEL'),
};

export default config;



