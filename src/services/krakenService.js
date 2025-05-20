const WebSocket = require('ws');
const { producer } = require('../kafka/producer');

class KrakenService {
    constructor() {
        this.ws = new WebSocket('wss://ws.kraken.com');
        this.setupWebSocket();
    }

    setupWebSocket() {
        this.ws.on('open', () => {
            console.log('Connected to Kraken WebSocket');
            this.subscribe();
        });

        this.ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data);
                await this.forwardToKafka(message);
            } catch (error) {
                console.error('Error processing Kraken message:', error);
            }
        });
    }

    async forwardToKafka(message) {
        await producer.send({
            topic: 'kraken-updates',
            messages: [{ value: JSON.stringify(message) }]
        });
    }
} 