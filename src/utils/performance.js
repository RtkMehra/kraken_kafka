import logger from './logger.js';

class PerformanceMonitor {
    constructor() {
        this.messageCount = 0;
        this.lastLogTime = Date.now();
        this.latencies = new Float64Array(5000); // Pre-allocate fixed buffer
        this.latencyIndex = 0;
    }

    trackMessage(startTime) {
        const latency = Date.now() - startTime;
        this.latencies[this.latencyIndex] = latency;
        this.latencyIndex = (this.latencyIndex + 1) % 5000;
        this.messageCount++;

        if (this.messageCount >= 5000) {
            this.logStats();
        }
    }

    logStats() {
        const now = Date.now();
        const elapsed = now - this.lastLogTime;
        const throughput = (this.messageCount / elapsed) * 1000;

        // Only calculate stats for filled positions
        const usedLatencies = this.latencies.slice(0, this.latencyIndex);
        const avgLatency = usedLatencies.reduce((a, b) => a + b, 0) / usedLatencies.length;
        const maxLatency = Math.max(...usedLatencies);

        logger.info(
            `Perf: ${throughput.toFixed(1)} msg/s | ` +
            `Latency avg: ${avgLatency.toFixed(1)}ms max: ${maxLatency}ms`
        );

        this.messageCount = 0;
        this.latencyIndex = 0;
        this.lastLogTime = now;
    }
}

export const perfMonitor = new PerformanceMonitor(); 