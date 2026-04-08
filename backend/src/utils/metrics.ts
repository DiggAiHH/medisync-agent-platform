/**
 * Metrics Collector
 * 
 * Funktionen:
 * - Prometheus-ähnliche Metrics
 * - Jobs Processed Counter
 * - Processing Time Histogram
 * - Error Rate Tracking
 * - Custom Event Tracking
 */

import { RedisClient } from '../ai/tokenTracker';

// Metric Types
type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

// Base Metric Interface
interface BaseMetric {
  name: string;
  help: string;
  type: MetricType;
  labels?: string[];
}

// Counter Metric
interface CounterMetric extends BaseMetric {
  type: 'counter';
  value: number;
  labelValues?: Record<string, string>;
}

// Gauge Metric
interface GaugeMetric extends BaseMetric {
  type: 'gauge';
  value: number;
  labelValues?: Record<string, string>;
}

// Histogram Bucket
interface HistogramBucket {
  le: number; // less than or equal
  count: number;
}

// Histogram Metric
interface HistogramMetric extends BaseMetric {
  type: 'histogram';
  buckets: HistogramBucket[];
  sum: number;
  count: number;
  labelValues?: Record<string, string>;
}

// Summary Metric
interface SummaryMetric extends BaseMetric {
  type: 'summary';
  quantiles: Record<string, number>;
  sum: number;
  count: number;
}

// Job Processing Metric
interface JobMetric {
  jobId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  model?: string;
  tokens?: number;
}

// Error Metric
interface ErrorMetric {
  timestamp: number;
  type: string;
  message: string;
  endpoint?: string;
  userId?: string;
}

// Metrics Registry
interface MetricsRegistry {
  counters: Map<string, CounterMetric>;
  gauges: Map<string, GaugeMetric>;
  histograms: Map<string, HistogramMetric>;
  summaries: Map<string, SummaryMetric>;
}

// Default Histogram Buckets (in milliseconds)
const DEFAULT_BUCKETS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000];

// Redis Keys
const METRICS_KEYS = {
  jobsCounter: 'metrics:jobs:total',
  jobsHistogram: 'metrics:jobs:histogram',
  errorsCounter: 'metrics:errors:total',
  processingTime: 'metrics:processing:time',
  customMetrics: 'metrics:custom',
};

/**
 * Metrics Collector Klasse
 */
export class MetricsCollector {
  private redis: RedisClient;
  private registry: MetricsRegistry;
  private defaultBuckets: number[];
  private jobMetrics: Map<string, JobMetric>;
  private recentErrors: ErrorMetric[];
  private maxErrors: number;

  constructor(
    redis: RedisClient,
    options: {
      defaultBuckets?: number[];
      maxErrors?: number;
    } = {}
  ) {
    this.redis = redis;
    this.defaultBuckets = options.defaultBuckets || DEFAULT_BUCKETS;
    this.maxErrors = options.maxErrors || 100;

    this.registry = {
      counters: new Map(),
      gauges: new Map(),
      histograms: new Map(),
      summaries: new Map(),
    };

    this.jobMetrics = new Map();
    this.recentErrors = [];

    // Initialize default metrics
    this.initializeDefaultMetrics();
  }

  /**
   * Initialisiert Standard-Metrics
   */
  private initializeDefaultMetrics(): void {
    // Jobs processed counter
    this.createCounter('jobs_processed_total', 'Total number of jobs processed', [
      'status',
      'model',
    ]);

    // Jobs duration histogram
    this.createHistogram(
      'jobs_duration_seconds',
      'Job processing duration in seconds',
      ['status', 'model'],
      this.defaultBuckets.map(b => b / 1000) // Convert to seconds
    );

    // Error counter
    this.createCounter('errors_total', 'Total number of errors', ['type', 'endpoint']);

    // Active jobs gauge
    this.createGauge('jobs_active', 'Number of currently active jobs');

    // Request duration histogram
    this.createHistogram(
      'request_duration_seconds',
      'HTTP request duration in seconds',
      ['method', 'endpoint', 'status_code'],
      [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    );

    // Token usage counter
    this.createCounter('tokens_used_total', 'Total tokens used', ['model', 'type']);

    // Cost counter
    this.createCounter('cost_total', 'Total cost in USD', ['model']);
  }

  /**
   * Erstellt einen Counter
   */
  public createCounter(
    name: string,
    help: string,
    labels: string[] = []
  ): CounterMetric {
    const counter: CounterMetric = {
      name,
      help,
      type: 'counter',
      value: 0,
      labels,
    };
    this.registry.counters.set(name, counter);
    return counter;
  }

  /**
   * Erstellt einen Gauge
   */
  public createGauge(name: string, help: string, labels: string[] = []): GaugeMetric {
    const gauge: GaugeMetric = {
      name,
      help,
      type: 'gauge',
      value: 0,
      labels,
    };
    this.registry.gauges.set(name, gauge);
    return gauge;
  }

  /**
   * Erstellt ein Histogram
   */
  public createHistogram(
    name: string,
    help: string,
    labels: string[] = [],
    buckets: number[] = this.defaultBuckets.map(b => b / 1000)
  ): HistogramMetric {
    const histogram: HistogramMetric = {
      name,
      help,
      type: 'histogram',
      buckets: buckets.map(b => ({ le: b, count: 0 })),
      sum: 0,
      count: 0,
      labels,
    };
    this.registry.histograms.set(name, histogram);
    return histogram;
  }

  /**
   * Erstellt ein Summary
   */
  public createSummary(
    name: string,
    help: string,
    labels: string[] = [],
    quantiles: number[] = [0.5, 0.9, 0.99]
  ): SummaryMetric {
    const summary: SummaryMetric = {
      name,
      help,
      type: 'summary',
      quantiles: quantiles.reduce((acc, q) => ({ ...acc, [q.toString()]: 0 }), {}),
      sum: 0,
      count: 0,
    };
    this.registry.summaries.set(name, summary);
    return summary;
  }

  /**
   * Inkrementiert einen Counter
   */
  public incrementCounter(
    name: string,
    value: number = 1,
    labelValues: Record<string, string> = {}
  ): void {
    const counter = this.registry.counters.get(name);
    if (!counter) {
      console.warn(`Counter ${name} not found`);
      return;
    }

    const labelKey = this.getLabelKey(labelValues);
    const key = `${name}${labelKey}`;

    // Store in Redis
    this.redis.hincrby(METRICS_KEYS.customMetrics, key, value);

    // Update local registry
    counter.value += value;
  }

  /**
   * Setzt einen Gauge
   */
  public setGauge(
    name: string,
    value: number,
    labelValues: Record<string, string> = {}
  ): void {
    const gauge = this.registry.gauges.get(name);
    if (!gauge) {
      console.warn(`Gauge ${name} not found`);
      return;
    }

    const labelKey = this.getLabelKey(labelValues);
    const key = `${name}${labelKey}`;

    // Store in Redis
    this.redis.hset(METRICS_KEYS.customMetrics, key, value.toString());

    // Update local registry
    gauge.value = value;
  }

  /**
   * Beobachtet ein Histogram
   */
  public observeHistogram(
    name: string,
    value: number,
    labelValues: Record<string, string> = {}
  ): void {
    const histogram = this.registry.histograms.get(name);
    if (!histogram) {
      console.warn(`Histogram ${name} not found`);
      return;
    }

    const labelKey = this.getLabelKey(labelValues);
    const key = `${name}${labelKey}`;

    // Update buckets
    for (const bucket of histogram.buckets) {
      if (value <= bucket.le) {
        bucket.count++;
      }
    }
    histogram.sum += value;
    histogram.count++;

    // Store in Redis
    const now = Date.now();
    this.redis.zadd(`${METRICS_KEYS.processingTime}:${key}`, now, JSON.stringify({
      value,
      timestamp: now,
      labels: labelValues,
    }));

    // Trim old entries (keep last 10000)
    this.redis.zremrangebyrank(`${METRICS_KEYS.processingTime}:${key}`, 0, -10001);
  }

  /**
   * Trackt einen Job Start
   */
  public trackJobStart(jobId: string, model?: string): void {
    const metric: JobMetric = {
      jobId,
      startTime: Date.now(),
      status: 'processing',
      model,
    };

    this.jobMetrics.set(jobId, metric);

    // Increment active jobs gauge
    const activeGauge = this.registry.gauges.get('jobs_active');
    if (activeGauge) {
      activeGauge.value++;
    }

    // Store in Redis
    this.redis.hset(METRICS_KEYS.jobsCounter, `active:${jobId}`, JSON.stringify(metric));
  }

  /**
   * Trackt einen Job Abschluss
   */
  public trackJobEnd(
    jobId: string,
    status: 'completed' | 'failed',
    tokens?: number,
    error?: string
  ): void {
    const metric = this.jobMetrics.get(jobId);
    if (!metric) return;

    const endTime = Date.now();
    const duration = (endTime - metric.startTime) / 1000; // in seconds

    metric.endTime = endTime;
    metric.duration = duration;
    metric.status = status;
    metric.tokens = tokens;
    metric.error = error;

    // Update job metrics
    this.jobMetrics.set(jobId, metric);

    // Decrement active jobs gauge
    const activeGauge = this.registry.gauges.get('jobs_active');
    if (activeGauge) {
      activeGauge.value = Math.max(0, activeGauge.value - 1);
    }

    // Increment processed counter
    this.incrementCounter('jobs_processed_total', 1, {
      status,
      model: metric.model || 'unknown',
    });

    // Observe duration histogram
    this.observeHistogram('jobs_duration_seconds', duration, {
      status,
      model: metric.model || 'unknown',
    });

    // Track tokens if available
    if (tokens) {
      this.incrementCounter('tokens_used_total', tokens, {
        model: metric.model || 'unknown',
        type: 'total',
      });
    }

    // Store completed job metric
    const key = `completed:${Date.now()}:${jobId}`;
    this.redis.hset(METRICS_KEYS.jobsCounter, key, JSON.stringify(metric));

    // Clean up active job
    this.redis.hdel(METRICS_KEYS.jobsCounter, `active:${jobId}`);

    // Trim old completed jobs (keep last 1000)
    this.redis.zadd(
      `${METRICS_KEYS.jobsCounter}:timeline`,
      Date.now(),
      JSON.stringify(metric)
    );
    this.redis.zremrangebyrank(`${METRICS_KEYS.jobsCounter}:timeline`, 0, -1001);
  }

  /**
   * Trackt einen Fehler
   */
  public trackError(
    type: string,
    message: string,
    context?: {
      endpoint?: string;
      userId?: string;
      jobId?: string;
    }
  ): void {
    const error: ErrorMetric = {
      timestamp: Date.now(),
      type,
      message,
      endpoint: context?.endpoint,
      userId: context?.userId,
    };

    // Add to recent errors
    this.recentErrors.push(error);
    if (this.recentErrors.length > this.maxErrors) {
      this.recentErrors.shift();
    }

    // Increment error counter
    this.incrementCounter('errors_total', 1, {
      type,
      endpoint: context?.endpoint || 'unknown',
    });

    // Store in Redis
    const errorKey = `${METRICS_KEYS.errorsCounter}:${Date.now()}`;
    this.redis.set(errorKey, JSON.stringify(error), { ex: 86400 * 7 }); // 7 days TTL

    // Increment daily error counter
    const today = new Date().toISOString().split('T')[0];
    this.redis.hincrby(`${METRICS_KEYS.errorsCounter}:daily:${today}`, type, 1);
  }

  /**
   * Trackt Request Duration
   */
  public trackRequestDuration(
    method: string,
    endpoint: string,
    statusCode: number,
    durationMs: number
  ): void {
    const durationSeconds = durationMs / 1000;

    this.observeHistogram('request_duration_seconds', durationSeconds, {
      method,
      endpoint,
      status_code: statusCode.toString(),
    });
  }

  /**
   * Trackt Token Usage
   */
  public trackTokenUsage(
    model: string,
    promptTokens: number,
    completionTokens: number,
    cost: number
  ): void {
    this.incrementCounter('tokens_used_total', promptTokens, {
      model,
      type: 'prompt',
    });
    this.incrementCounter('tokens_used_total', completionTokens, {
      model,
      type: 'completion',
    });
    this.incrementCounter('cost_total', cost, { model });
  }

  /**
   * Holt aktive Job-Metriken
   */
  public getActiveJobs(): JobMetric[] {
    return Array.from(this.jobMetrics.values()).filter(j => j.status === 'processing');
  }

  /**
   * Holt durchschnittliche Processing Time
   */
  public getAverageProcessingTime(status?: 'completed' | 'failed'): number {
    const jobs = Array.from(this.jobMetrics.values()).filter(
      j => j.duration && (!status || j.status === status)
    );

    if (jobs.length === 0) return 0;

    const total = jobs.reduce((sum, j) => sum + (j.duration || 0), 0);
    return total / jobs.length;
  }

  /**
   * Holt Fehler-Statistiken
   */
  public getErrorStats(): {
    total: number;
    recent: ErrorMetric[];
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    for (const error of this.recentErrors) {
      byType[error.type] = (byType[error.type] || 0) + 1;
    }

    return {
      total: this.recentErrors.length,
      recent: this.recentErrors.slice(-20),
      byType,
    };
  }

  /**
   * Holt alle Metriken
   */
  public getAllMetrics(): {
    counters: CounterMetric[];
    gauges: GaugeMetric[];
    histograms: HistogramMetric[];
    summaries: SummaryMetric[];
  } {
    return {
      counters: Array.from(this.registry.counters.values()),
      gauges: Array.from(this.registry.gauges.values()),
      histograms: Array.from(this.registry.histograms.values()),
      summaries: Array.from(this.registry.summaries.values()),
    };
  }

  /**
   * Exportiert Metriken im Prometheus Format
   */
  public async exportPrometheusMetrics(): Promise<string[]> {
    const lines: string[] = [];

    // Counters
    for (const counter of this.registry.counters.values()) {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);
      lines.push(`${counter.name} ${counter.value}`);
    }

    // Gauges
    for (const gauge of this.registry.gauges.values()) {
      lines.push(`# HELP ${gauge.name} ${gauge.help}`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      lines.push(`${gauge.name} ${gauge.value}`);
    }

    // Histograms
    for (const histogram of this.registry.histograms.values()) {
      lines.push(`# HELP ${histogram.name} ${histogram.help}`);
      lines.push(`# TYPE ${histogram.name} histogram`);

      for (const bucket of histogram.buckets) {
        lines.push(`${histogram.name}_bucket{le="${bucket.le}"} ${bucket.count}`);
      }
      lines.push(`${histogram.name}_bucket{le="+Inf"} ${histogram.count}`);
      lines.push(`${histogram.name}_sum ${histogram.sum}`);
      lines.push(`${histogram.name}_count ${histogram.count}`);
    }

    return lines;
  }

  /**
   * Exportiert Metriken als JSON
   */
  public exportJSON(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, { buckets: HistogramBucket[]; sum: number; count: number }>;
    activeJobs: number;
    avgProcessingTime: number;
    errorStats: {
      total: number;
      recent: ErrorMetric[];
      byType: Record<string, number>;
    };
  } {
    const counters: Record<string, number> = {};
    const gauges: Record<string, number> = {};
    const histograms: Record<string, { buckets: HistogramBucket[]; sum: number; count: number }> = {};

    for (const [name, counter] of this.registry.counters) {
      counters[name] = counter.value;
    }

    for (const [name, gauge] of this.registry.gauges) {
      gauges[name] = gauge.value;
    }

    for (const [name, histogram] of this.registry.histograms) {
      histograms[name] = {
        buckets: histogram.buckets,
        sum: histogram.sum,
        count: histogram.count,
      };
    }

    return {
      counters,
      gauges,
      histograms,
      activeJobs: this.getActiveJobs().length,
      avgProcessingTime: this.getAverageProcessingTime(),
      errorStats: this.getErrorStats(),
    };
  }

  /**
   * Reset aller Metriken
   */
  public reset(): void {
    this.registry.counters.clear();
    this.registry.gauges.clear();
    this.registry.histograms.clear();
    this.registry.summaries.clear();
    this.jobMetrics.clear();
    this.recentErrors = [];

    this.initializeDefaultMetrics();
  }

  /**
   * Hilfsmethode für Label Keys
   */
  private getLabelKey(labelValues: Record<string, string>): string {
    const entries = Object.entries(labelValues);
    if (entries.length === 0) return '';

    const labelStr = entries.map(([k, v]) => `${k}="${v}"`).join(',');
    return `{${labelStr}}`;
  }
}

/**
 * Factory Funktion
 */
export function createMetricsCollector(
  redis: RedisClient,
  options?: {
    defaultBuckets?: number[];
    maxErrors?: number;
  }
): MetricsCollector {
  return new MetricsCollector(redis, options);
}

export {
  METRICS_KEYS,
  DEFAULT_BUCKETS,
};
export type {
  MetricType,
  BaseMetric,
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  SummaryMetric,
  HistogramBucket,
  JobMetric,
  ErrorMetric,
  MetricsRegistry,
};
