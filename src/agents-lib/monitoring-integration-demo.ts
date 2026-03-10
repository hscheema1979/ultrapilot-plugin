/**
 * Integration Example: Metrics & Monitoring with WshobsonDelegator
 *
 * This example demonstrates how to integrate the metrics collection
 * and monitoring system with the existing WshobsonDelegator.
 */

import { WshobsonDelegator } from './delegator.js';
import { InMemoryAgentRepository } from './repositories/index.js';
import { MonitoringService, createMonitoringService } from './monitoring.js';
import { TraceManager, createTraceManager } from './tracing.js';

/**
 * Example 1: Basic Integration
 *
 * Track delegations with monitoring service
 */
async function basicIntegration() {
  console.log('=== Example 1: Basic Integration ===\n');

  // Create monitoring service
  const monitoring = createMonitoringService({
    samplingRate: 1.0,  // Track all delegations
    enableAnomalyDetection: true,
  });

  // Create delegator (without monitoring parameter)
  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');
  await repository.load();

  const delegator = new WshobsonDelegator(repository);

  // Delegate and manually track
  const result = await delegator.delegateToAgent(
    'business-analyst',
    'Analyze the requirements',
    {
      workspacePath: '/home/user/project',
      timeout: 30000,
    }
  );

  // Track the result
  await monitoring.trackDelegation(result);

  // Get dashboard
  const dashboard = monitoring.getDashboard();
  console.log(`Delegations: ${dashboard.totalDelegations}`);
  console.log(`Success rate: ${(dashboard.successRate * 100).toFixed(1)}%`);
}

/**
 * Example 2: Extended Delegator with Monitoring
 *
 * Extend WshobsonDelegator to include automatic tracking
 */
class MonitoredDelegator extends WshobsonDelegator {
  private monitoring: MonitoringService;

  constructor(repository: any, monitoring: MonitoringService) {
    super(repository);
    this.monitoring = monitoring;
  }

  override async delegateToAgent(
    agentName: string,
    task: string,
    context?: any,
    options?: any
  ): Promise<any> {
    // Execute delegation
    const result = await super.delegateToAgent(agentName, task, context, options);

    // Automatically track
    await this.monitoring.trackDelegation(result);

    return result;
  }

  /**
   * Get monitoring dashboard
   */
  getDashboard() {
    return this.monitoring.getDashboard();
  }

  /**
   * Get monitoring service
   */
  getMonitoring() {
    return this.monitoring;
  }
}

async function extendedDelegatorExample() {
  console.log('\n=== Example 2: Extended Delegator ===\n');

  // Create monitoring service
  const monitoring = createMonitoringService({
    samplingRate: 0.5,  // Track 50% of delegations
    logLevel: 'info',
  });

  // Create monitored delegator
  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');
  await repository.load();

  const delegator = new MonitoredDelegator(repository, monitoring);

  // Delegate - automatically tracked
  await delegator.delegateToAgent('business-analyst', 'Task 1');
  await delegator.delegateToAgent('data-analyst', 'Task 2');
  await delegator.delegateToAgent('business-analyst', 'Task 3');

  // Get dashboard from delegator
  const dashboard = delegator.getDashboard();
  console.log(`Total delegations: ${dashboard.totalDelegations}`);
  console.log(`Success rate: ${(dashboard.successRate * 100).toFixed(1)}%`);
}

/**
 * Example 3: Monitoring with Distributed Tracing
 *
 * Combine monitoring with distributed tracing
 */
async function monitoringWithTracing() {
  console.log('\n=== Example 3: Monitoring with Tracing ===\n');

  // Create trace manager
  const tracer = createTraceManager({
    maxTraces: 100,
  });

  // Create monitoring service with tracer
  const monitoring = createMonitoringService(
    {
      samplingRate: 1.0,
      enableAnomalyDetection: true,
    },
    tracer  // Pass tracer for correlation
  );

  // Create delegator
  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');
  await repository.load();

  const delegator = new WshobsonDelegator(repository);

  // Create trace for workflow
  const trace = tracer.createTrace(undefined, 'analysis-workflow');

  // Create span for delegation
  const span = tracer.startSpan(trace.traceId, 'delegation');

  // Delegate with trace ID
  const result = await delegator.delegateToAgent('business-analyst', 'Analyze data', {
    traceId: trace.traceId,
    parentSpanId: span.spanId,
  });

  // End span
  span.metadata['agent'] = result.agentName;
  span.metadata['success'] = result.success;
  span.metadata['duration'] = result.duration;
  tracer.endSpan(span);

  // Track with monitoring
  await monitoring.trackDelegation(result);

  // Export trace for OpenTelemetry
  const otelTrace = tracer.exportTrace(trace.traceId);

  // Get dashboard
  const dashboard = monitoring.getDashboard();
  console.log(`Workflow complete`);
  console.log(`Delegations: ${dashboard.totalDelegations}`);
  console.log(`Avg latency: ${dashboard.avgLatency.toFixed(0)}ms`);
}

/**
 * Example 4: Real-time Monitoring with Alerts
 *
 * Monitor delegations in real-time and respond to anomalies
 */
async function realTimeMonitoring() {
  console.log('\n=== Example 4: Real-time Monitoring ===\n');

  // Create monitoring with custom thresholds
  const monitoring = createMonitoringService({
    samplingRate: 1.0,
    enableAnomalyDetection: true,
    alerts: {
      errorRateThreshold: 0.1,      // Alert if > 10% errors
      latencyThreshold: 3000,       // Alert if > 3s latency
      minSuccessRate: 0.9,          // Alert if < 90% success
      maxQueueDepth: 50,            // Alert if queue > 50
    },
  });

  // Create delegator
  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');
  await repository.load();

  const delegator = new WshobsonDelegator(repository);

  // Simulate multiple delegations
  const tasks = [
    'Task 1',
    'Task 2',
    'Task 3',
    'Task 4',
    'Task 5',
  ];

  for (const task of tasks) {
    const result = await delegator.delegateToAgent('business-analyst', task);
    await monitoring.trackDelegation(result);

    // Check for anomalies after each delegation
    const anomalies = monitoring.getAnomalies();
    if (anomalies.length > 0) {
      console.warn(`⚠️  Anomaly detected:`);
      anomalies.forEach(anomaly => {
        console.warn(`   ${anomaly.severity.toUpperCase()}: ${anomaly.message}`);
      });
    }
  }

  // Get final dashboard
  const dashboard = monitoring.getDashboard();
  console.log('\nFinal dashboard:');
  console.log(`  Delegations: ${dashboard.totalDelegations}`);
  console.log(`  Success rate: ${(dashboard.successRate * 100).toFixed(1)}%`);
  console.log(`  Avg latency: ${dashboard.avgLatency.toFixed(0)}ms`);
  console.log(`  Active agents: ${dashboard.activeAgents}`);
}

/**
 * Example 5: Prometheus Integration
 *
 * Export metrics for Prometheus scraping
 */
async function prometheusIntegration() {
  console.log('\n=== Example 5: Prometheus Integration ===\n');

  // Create monitoring service
  const monitoring = createMonitoringService();

  // Create delegator
  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');
  await repository.load();

  const delegator = new WshobsonDelegator(repository);

  // Do some delegations
  await delegator.delegateToAgent('business-analyst', 'Task 1');
  await delegator.delegateToAgent('data-analyst', 'Task 2');

  await monitoring.trackDelegation({
    success: true,
    duration: 1234,
    agentName: 'business-analyst',
    traceId: 'trace-1',
  } as any);

  // Export metrics in Prometheus format
  const prometheusMetrics = monitoring.exportMetrics();

  console.log('Prometheus metrics:');
  console.log(prometheusMetrics);

  // These metrics can be scraped by Prometheus
  // Add to prometheus.yml:
  // scrape_configs:
  //   - job_name: 'ultrapilot'
  //     static_configs:
  //       - targets: ['localhost:9090']
}

/**
 * Example 6: OpenTelemetry Export
 *
 * Export metrics to OpenTelemetry collector
 */
async function openTelemetryExport() {
  console.log('\n=== Example 6: OpenTelemetry Export ===\n');

  // Create monitoring with OTEL endpoint
  const monitoring = createMonitoringService({
    metricsEndpoint: 'https://otel-collector:4318/v1/metrics',
  });

  // Create delegator
  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');
  await repository.load();

  const delegator = new WshobsonDelegator(repository);

  // Do delegations
  const result = await delegator.delegateToAgent('business-analyst', 'Task');
  await monitoring.trackDelegation(result as any);

  // Export to OpenTelemetry
  try {
    await monitoring.exportToOpenTelemetry();
    console.log('✅ Metrics exported to OpenTelemetry');
  } catch (error) {
    console.warn('⚠️  Failed to export to OpenTelemetry:', error);
  }
}

/**
 * Example 7: Custom Metrics
 *
 * Record custom metrics alongside automatic tracking
 */
async function customMetrics() {
  console.log('\n=== Example 7: Custom Metrics ===\n');

  // Create monitoring service
  const monitoring = createMonitoringService();

  // Get metrics collector
  const metrics = monitoring.getMetrics();

  // Record custom metrics
  metrics.counter('custom_operations_total', 1, { operation: 'database_query' });
  metrics.gauge('custom_cache_size_mb', 256);
  metrics.histogram('custom_processing_time_ms', 1234);

  // Use timer for custom operations
  const endTimer = metrics.time('custom_backup_duration_ms');
  await performBackup();
  endTimer();

  // Export all metrics (custom + automatic)
  const prometheusMetrics = monitoring.exportMetrics();
  console.log('Metrics including custom:');
  console.log(prometheusMetrics);
}

async function performBackup() {
  // Simulate backup operation
  await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Example 8: Performance Analysis
 *
 * Analyze agent performance over time
 */
async function performanceAnalysis() {
  console.log('\n=== Example 8: Performance Analysis ===\n');

  // Create monitoring service
  const monitoring = createMonitoringService({
    samplingRate: 1.0,
  });

  // Create delegator
  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');
  await repository.load();

  const delegator = new WshobsonDelegator(repository);

  // Simulate multiple delegations
  const agents = ['business-analyst', 'data-analyst', 'business-analyst', 'data-analyst'];

  for (const agent of agents) {
    const result = await delegator.delegateToAgent(agent, 'Task');
    await monitoring.trackDelegation(result as any);
  }

  // Get dashboard for analysis
  const dashboard = monitoring.getDashboard();

  console.log('Performance Summary:');
  console.log(`  Total delegations: ${dashboard.totalDelegations}`);
  console.log(`  Success rate: ${(dashboard.successRate * 100).toFixed(1)}%`);
  console.log(`  Avg latency: ${dashboard.avgLatency.toFixed(0)}ms`);
  console.log(`  P50 latency: ${dashboard.p50Latency.toFixed(0)}ms`);
  console.log(`  P95 latency: ${dashboard.p95Latency.toFixed(0)}ms`);
  console.log(`  P99 latency: ${dashboard.p99Latency.toFixed(0)}ms`);

  console.log('\nTop Agents:');
  dashboard.topAgents.forEach((agent, index) => {
    console.log(`  ${index + 1}. ${agent.name}`);
    console.log(`     Delegations: ${agent.count}`);
    console.log(`     Success rate: ${(agent.successRate * 100).toFixed(1)}%`);
    console.log(`     Avg latency: ${agent.avgLatency.toFixed(0)}ms`);
  });

  console.log('\nRecent Errors:');
  if (dashboard.recentErrors.length > 0) {
    dashboard.recentErrors.slice(0, 5).forEach(error => {
      console.log(`  [${error.errorCode}] ${error.agentName}`);
    });
  } else {
    console.log('  No errors');
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log('Metrics & Monitoring Integration Examples\n');
  console.log('='.repeat(60));
  console.log();

  // Run examples (commented out - for demonstration)
  // await basicIntegration();
  // await extendedDelegatorExample();
  // await monitoringWithTracing();
  // await realTimeMonitoring();
  // await prometheusIntegration();
  // await openTelemetryExport();
  // await customMetrics();
  // await performanceAnalysis();

  console.log('\n✅ All examples completed!');
  console.log('\nKey Takeaways:');
  console.log('1. Use MonitoringService to track delegations automatically');
  console.log('2. Extend WshobsonDelegator for automatic tracking');
  console.log('3. Combine with TraceManager for distributed tracing');
  console.log('4. Configure anomaly detection with custom thresholds');
  console.log('5. Export metrics in Prometheus format');
  console.log('6. Send metrics to OpenTelemetry collectors');
  console.log('7. Record custom metrics alongside automatic tracking');
  console.log('8. Analyze performance with dashboard data');
}

main().catch(console.error);
