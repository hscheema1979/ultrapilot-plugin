# Metrics Collection & Monitoring System

Comprehensive metrics collection and production monitoring for the wshobson agent delegation system.

## Overview

This system provides:

1. **Metrics Collection** (`metrics.ts`) - Prometheus-compatible metrics with counter, gauge, and histogram support
2. **Monitoring Service** (`monitoring.ts`) - Production monitoring with anomaly detection and dashboard data export

## Files

- `/tmp/ultrapilot/src/wshobson/metrics.ts` - Metrics collection implementation
- `/tmp/ultrapilot/src/wshobson/monitoring.ts` - Monitoring service implementation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     WshobsonDelegator                        │
│                  (delegates tasks to agents)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ tracks results
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   MonitoringService                          │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Metrics     │  │   Anomaly    │  │    Dashboard    │  │
│  │   Collector   │  │  Detection   │  │     Data        │  │
│  └───────────────┘  └──────────────┘  └─────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ exports
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Prometheus / OpenTelemetry                      │
│              (Observability Platform)                        │
└─────────────────────────────────────────────────────────────┘
```

## Metrics Collection

### Metric Types

#### 1. Counter
Monotonically increasing values for cumulative tracking.

```typescript
metrics.counter('delegations_total', 1, { agent: 'business-analyst' });
metrics.counter('errors_total', 1, { agent: 'analyst', type: 'timeout' });
```

**Built-in Counters:**
- `delegations_total` - Total number of delegations
- `errors_total` - Total number of errors
- `successes_total` - Total number of successful delegations
- `timeouts_total` - Total number of timeouts
- `retries_total` - Total number of retry attempts

#### 2. Gauge
Point-in-time values that can increase or decrease.

```typescript
metrics.gauge('active_agents', 5);
metrics.gauge('queue_depth', 12, { queue: 'delegation' });
```

**Built-in Gauges:**
- `active_agents` - Number of currently active agents
- `active_delegations` - Number of active delegations
- `queue_depth` - Current queue depth
- `memory_usage_mb` - Memory usage in megabytes
- `cpu_usage_percent` - CPU usage percentage

#### 3. Histogram
Distributions of values (e.g., latency, response sizes).

```typescript
metrics.histogram('delegation_duration_ms', 1234);
metrics.histogram('response_size_bytes', 4096, { agent: 'analyst' });
```

**Built-in Histograms:**
- `delegation_duration_ms` - Delegation execution duration
- `agent_execution_ms` - Agent execution duration
- `response_size_bytes` - Response size in bytes
- `queue_wait_time_ms` - Time spent waiting in queue

### Timer Utility

Convenience method for measuring duration:

```typescript
const endTimer = metrics.time('operation_duration_ms');
await doSomeWork();
endTimer();
```

### Prometheus Export

Export metrics in Prometheus text format:

```typescript
const prometheus = metrics.export();
console.log(prometheus);
```

**Output Format:**
```
# HELP delegations_total Total number of agent delegations
# TYPE delegations_total counter
delegations_total{agent="business-analyst"} 42

# HELP delegation_duration_ms Delegation execution duration in milliseconds
# TYPE delegation_duration_ms histogram
delegation_duration_ms_sum 123456
delegation_duration_ms_count 42
delegation_duration_ms_bucket{le="100"} 5
delegation_duration_ms_bucket{le="500"} 20
delegation_duration_ms_bucket{le="+Inf"} 42
```

## Monitoring Service

### Automatic Tracking

The monitoring service automatically tracks delegation lifecycle:

```typescript
const monitoring = new MonitoringService({
  samplingRate: 1.0,  // Track 100% of delegations
  enableAnomalyDetection: true,
});

// Track delegation result
await monitoring.trackDelegation(delegationResult);
```

### Dashboard Data

Get real-time dashboard data:

```typescript
const dashboard = monitoring.getDashboard();

console.log(`Total delegations: ${dashboard.totalDelegations}`);
console.log(`Success rate: ${(dashboard.successRate * 100).toFixed(1)}%`);
console.log(`Average latency: ${dashboard.avgLatency.toFixed(0)}ms`);
console.log(`P95 latency: ${dashboard.p95Latency.toFixed(0)}ms`);
console.log(`Error rate: ${(dashboard.errorRate * 100).toFixed(1)}%`);
console.log(`Throughput: ${dashboard.throughput.toFixed(2)} delegations/sec`);
```

**Dashboard Data Structure:**

```typescript
interface DashboardData {
  totalDelegations: number;
  successfulDelegations: number;
  failedDelegations: number;
  successRate: number;          // 0-1
  avgLatency: number;           // milliseconds
  p50Latency: number;           // milliseconds
  p95Latency: number;           // milliseconds
  p99Latency: number;           // milliseconds
  activeAgents: number;
  errorRate: number;            // 0-1
  queueDepth: number;
  throughput: number;           // delegations per second
  anomalies: Anomaly[];
  topAgents: Array<{
    name: string;
    count: number;
    successRate: number;
    avgLatency: number;
  }>;
  recentErrors: Array<{
    errorCode: string;
    agentName: string;
    message: string;
    timestamp: number;
  }>;
}
```

### Anomaly Detection

Automatic detection of system anomalies:

```typescript
interface Anomaly {
  type: 'error_spike' | 'latency_increase' | 'success_drop' | 'queue_overflow';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  currentValue: number;
  threshold: number;
  timestamp: number;
  context?: Record<string, any>;
}
```

**Configurable Thresholds:**

```typescript
const monitoring = new MonitoringService({
  alerts: {
    errorRateThreshold: 0.1,      // Alert if error rate > 10%
    latencyThreshold: 5000,       // Alert if avg latency > 5s
    minSuccessRate: 0.9,          // Alert if success rate < 90%
    maxQueueDepth: 100,           // Alert if queue depth > 100
  },
});
```

## Integration with WshobsonDelegator

### Option 1: Automatic Integration

Modify `WshobsonDelegator` to track all delegations:

```typescript
import { MonitoringService } from './monitoring.js';

class WshobsonDelegator {
  private monitoring?: MonitoringService;

  constructor(
    repository: IAgentRepository,
    monitoring?: MonitoringService
  ) {
    this.monitoring = monitoring;
  }

  async delegateToAgent(
    agentName: string,
    task: string,
    context?: DelegationContext,
    options?: DelegationOptions
  ): Promise<DelegationResult> {
    const result = await this.executeAgent(/* ... */);

    // Track delegation
    if (this.monitoring) {
      await this.monitoring.trackDelegation(result);
    }

    return result;
  }
}
```

### Option 2: Manual Tracking

Track delegations manually:

```typescript
const monitoring = new MonitoringService();

const result = await delegator.delegateToAgent('analyst', task, context);

await monitoring.trackDelegation(result);

// Check for anomalies
const anomalies = monitoring.getAnomalies();
if (anomalies.length > 0) {
  console.warn('Anomalies detected:', anomalies);
}
```

## OpenTelemetry Integration

### Export to OpenTelemetry Collector

```typescript
const monitoring = new MonitoringService({
  metricsEndpoint: 'https://otel-collector:4318/v1/metrics',
});

// Export metrics
await monitoring.exportToOpenTelemetry();
```

### Integration with TraceManager

Combine metrics with distributed tracing:

```typescript
import { TraceManager } from './tracing.js';
import { MonitoringService } from './monitoring.js';

const tracer = new TraceManager();
const monitoring = new MonitoringService({}, tracer);

// Create trace
const trace = tracer.createTrace(undefined, 'agent-workflow');

// Delegate with trace ID
const result = await delegator.delegateToAgent('analyst', task, {
  traceId: trace.traceId,
});

// Track with trace context
await monitoring.trackDelegation(result);
```

## Prometheus Scraping

### Configure Prometheus

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'ultrapilot'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
```

### Expose Metrics Endpoint

Create an HTTP endpoint for Prometheus scraping:

```typescript
import { createServer } from 'http';
import { MonitoringService } from './monitoring.js';

const monitoring = new MonitoringService();

const server = createServer((req, res) => {
  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(monitoring.exportMetrics());
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(9090, () => {
  console.log('Metrics server listening on port 9090');
});
```

## Sampling

Reduce overhead by sampling a subset of delegations:

```typescript
const monitoring = new MonitoringService({
  samplingRate: 0.1,  // Track 10% of delegations
});
```

## Use Cases

### 1. Performance Monitoring

Track agent performance over time:

```typescript
const dashboard = monitoring.getDashboard();

dashboard.topAgents.forEach(agent => {
  console.log(`${agent.name}:`);
  console.log(`  Delegations: ${agent.count}`);
  console.log(`  Success rate: ${(agent.successRate * 100).toFixed(1)}%`);
  console.log(`  Avg latency: ${agent.avgLatency.toFixed(0)}ms`);
});
```

### 2. Error Tracking

Monitor error rates and patterns:

```typescript
const dashboard = monitoring.getDashboard();

console.log(`Error rate: ${(dashboard.errorRate * 100).toFixed(1)}%`);

dashboard.recentErrors.slice(0, 10).forEach(error => {
  console.log(`[${error.errorCode}] ${error.agentName}: ${error.message}`);
});
```

### 3. Capacity Planning

Track resource utilization:

```typescript
const metrics = monitoring.getMetrics();

const activeAgents = metrics.getGauge('active_agents');
const queueDepth = metrics.getGauge('queue_depth');

console.log(`Active agents: ${activeAgents}`);
console.log(`Queue depth: ${queueDepth}`);

if (queueDepth > 50) {
  console.warn('Queue depth high - consider scaling');
}
```

### 4. SLA Monitoring

Verify service level agreements:

```typescript
const dashboard = monitoring.getDashboard();

const slaSuccessRate = 0.95;  // 95% success rate SLA
const slaLatency = 3000;       // 3 second latency SLA

if (dashboard.successRate < slaSuccessRate) {
  console.error('SLA violation: Success rate below threshold');
}

if (dashboard.p95Latency > slaLatency) {
  console.error('SLA violation: P95 latency above threshold');
}
```

## API Reference

### MetricsCollector

```typescript
class MetricsCollector {
  // Record metrics
  counter(name: string, value: number, labels?: Record<string, string>): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  time(name: string, labels?: Record<string, string>): () => void;

  // Convenience methods
  increment(name: string, labels?: Record<string, string>): void;
  decrement(name: string, labels?: Record<string, string>): void;
  set(name: string, value: number, labels?: Record<string, string>): void;

  // Query metrics
  getCounter(name: string): number;
  getGauge(name: string): number;
  getHistogram(name: string): HistogramStats | null;
  getByName(name: string): Metric[];
  getByLabel(labelName: string, labelValue: string): Metric[];

  // Export
  export(): string;  // Prometheus format
  toJSON(): Metric[];

  // Management
  clearAll(): Promise<void>;
  getStats(): Promise<MetricsStats>;
}
```

### MonitoringService

```typescript
class MonitoringService {
  // Track delegations
  trackDelegation(result: DelegationResult): Promise<void>;
  trackAgentPerformance(agentName: string, success: boolean, duration: number): void;

  // Dashboard
  getDashboard(): DashboardData;

  // Metrics
  exportMetrics(): string;  // Prometheus format
  getMetrics(): MetricsCollector;

  // Anomalies
  getAnomalies(): Anomaly[];
  clearAnomalies(): void;

  // Configuration
  updateConfig(updates: Partial<MonitoringConfig>): void;

  // Statistics
  getStats(): Promise<MonitoringStats>;
  clearAll(): Promise<void>;

  // OpenTelemetry
  exportToOpenTelemetry(): Promise<void>;
}
```

## Testing

Run the test suite:

```bash
npx tsx test-metrics-monitoring.ts
```

## Best Practices

1. **Enable Sampling in Production**
   ```typescript
   samplingRate: 0.1  // Track 10% to reduce overhead
   ```

2. **Set Appropriate Thresholds**
   ```typescript
   alerts: {
     errorRateThreshold: 0.05,  // 5% error rate
     latencyThreshold: 3000,    // 3 second latency
   }
   ```

3. **Export Metrics Regularly**
   ```typescript
   setInterval(() => {
     await monitoring.exportToOpenTelemetry();
   }, 60000);  // Every minute
   ```

4. **Monitor Anomalies**
   ```typescript
   setInterval(() => {
     const anomalies = monitoring.getAnomalies();
     if (anomalies.length > 0) {
       sendAlert(anomalies);
     }
   }, 30000);  // Every 30 seconds
   ```

5. **Use Dashboards**
   - Grafana for visualization
   - Prometheus for metrics storage
   - Jaeger for distributed tracing

## Performance Considerations

- **Memory Usage**: Configurable via `retention` parameter (default: 10,000 metrics)
- **CPU Overhead**: Minimal with sampling enabled (e.g., `samplingRate: 0.1`)
- **Network**: Export metrics on interval (default: 60 seconds)
- **Disk**: No persistent storage - all metrics in memory

## Troubleshooting

**Metrics not showing up?**
- Check `enabled: true` in MetricsConfig
- Verify `samplingRate` is not too low
- Check log level for errors

**High memory usage?**
- Reduce `retention` parameter
- Enable sampling with `samplingRate: 0.1`
- Clear metrics periodically with `clearAll()`

**Anomalies not detected?**
- Verify `enableAnomalyDetection: true`
- Check alert thresholds are appropriate
- Ensure minimum window size (100 samples)

## License

MIT
