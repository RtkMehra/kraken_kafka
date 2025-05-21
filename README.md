# Market Data Pipeline

A real-time data pipeline that ingests live trading data from Kraken, processes it through Kafka, and delivers it to connected users via WebSocket.

## Project Overview

This system:

1. Connects to the Kraken WebSocket API and receives real-time ticker updates for BTC/USD and ETH/USD
2. Forwards each update into a Kafka topic running locally
3. Consumes the data from Kafka in real time
4. Streams the data to all connected clients using a WebSocket server

## Prerequisites

- Node.js (v14 or higher)
- Apache Kafka (running locally)

## Kafka Setup

1. Start ZooKeeper:

   ```
   bin/zookeeper-server-start.sh config/zookeeper.properties
   ```

2. Start Kafka broker:

   ```
   bin/kafka-server-start.sh config/server.properties
   ```

3. Create the topic:
   ```
   bin/kafka-topics.sh --create --topic quotes.crypto --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1
   ```

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file (or use the default configuration)

## Configuration

The application can be configured using environment variables or a `.env` file:

```
# Server configuration
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
```

## Running the Application

Start the application:

```
npm start
```

For development with auto-restart:

```
npm run dev
```

## Testing with Postman

1. Open Postman and create a new WebSocket request
2. Enter the URL: `ws://localhost:8080`
3. Click "Connect"
4. Send a subscription message (optional):
   ```json
   {
     "action": "subscribe",
     "symbols": ["BTCUSD", "ETHUSD"]
   }
   ```
5. You will receive market data messages in this format:
   ```json
   {
     "symbol": "BTCUSD",
     "timestamp": "2023-05-16T12:00:01.123Z",
     "bid": 64350.55,
     "ask": 64360.1
   }
   ```

## Project Structure

```
├── src/
│   ├── config/         # Configuration files
│   ├── kraken/         # Kraken exchange client
│   ├── kafka/          # Kafka producer and consumer
│   ├── websocket/      # WebSocket server implementation
│   └── utils/          # Utility functions and logger
├── .env                # Environment variables
└── index.js            # Application entry point
```
