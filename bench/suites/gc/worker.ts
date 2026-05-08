import {
  PerformanceObserver,
  constants,
  monitorEventLoopDelay,
  performance,
} from "node:perf_hooks";

import { getBenchmarkVariant, type BenchmarkVariant } from "../../lib/benchmark.js";
import {
  parseCliOptions,
  readBenchmark,
  readBenchmarkVariant,
  readNumberOption,
} from "../harness-config.js";
import type { GcKind, GcRunResult } from "./types.js";

type GcEntry = PerformanceEntry & {
  detail?: {
    kind?: number;
    flags?: number;
  };
  kind?: number;
  flags?: number;
};

const options = parseCliOptions();
const { benchmark } = await readBenchmark(options);
const variant = readBenchmarkVariant(options);
const inputSize = readNumberOption(options, ["input-size"], "BENCH_INPUT_SIZE", 10_000);
const durationMs = readNumberOption(
  options,
  ["duration-ms", "duration"],
  "BENCH_DURATION_MS",
  10_000,
);
const batchSize = readNumberOption(options, ["batch-size"], "BENCH_BATCH_SIZE", 1_000);

function gcKindName(kind: number | undefined): GcKind {
  switch (kind) {
    case constants.NODE_PERFORMANCE_GC_MAJOR:
      return "major";
    case constants.NODE_PERFORMANCE_GC_MINOR:
      return "minor";
    case constants.NODE_PERFORMANCE_GC_INCREMENTAL:
      return "incremental";
    case constants.NODE_PERFORMANCE_GC_WEAKCB:
      return "weakCallback";
    default:
      return "unknown";
  }
}

function forceGc(): void {
  globalThis.gc?.();
}

function memoryDelta(after: NodeJS.MemoryUsage, before: NodeJS.MemoryUsage): NodeJS.MemoryUsage {
  return {
    rss: after.rss - before.rss,
    heapTotal: after.heapTotal - before.heapTotal,
    heapUsed: after.heapUsed - before.heapUsed,
    external: after.external - before.external,
    arrayBuffers: after.arrayBuffers - before.arrayBuffers,
  };
}

function maxMemory(left: NodeJS.MemoryUsage, right: NodeJS.MemoryUsage): NodeJS.MemoryUsage {
  return {
    rss: Math.max(left.rss, right.rss),
    heapTotal: Math.max(left.heapTotal, right.heapTotal),
    heapUsed: Math.max(left.heapUsed, right.heapUsed),
    external: Math.max(left.external, right.external),
    arrayBuffers: Math.max(left.arrayBuffers, right.arrayBuffers),
  };
}

async function flushGcEntries(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

async function runVariant(variantName: BenchmarkVariant): Promise<GcRunResult> {
  forceGc();
  await flushGcEntries();

  const input = benchmark.makeInput(inputSize);
  forceGc();
  await flushGcEntries();

  const run = getBenchmarkVariant(benchmark, variantName);
  const beforeGcMemory = process.memoryUsage();
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 10 });
  const startMemory = process.memoryUsage();
  let peakMemory = startMemory;
  const startElu = performance.eventLoopUtilization();
  const gc = {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    byKind: {
      major: 0,
      minor: 0,
      incremental: 0,
      weakCallback: 0,
      unknown: 0,
    } satisfies Record<GcKind, number>,
  };

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as GcEntry[]) {
      const kind = gcKindName(entry.detail?.kind ?? entry.kind);

      gc.count++;
      gc.totalMs += entry.duration;
      gc.maxMs = Math.max(gc.maxMs, entry.duration);
      gc.byKind[kind]++;
    }
  });

  observer.observe({ entryTypes: ["gc"] });
  eventLoopDelay.enable();

  const end = performance.now() + durationMs;
  let iterations = 0;
  let sink = 0;

  while (performance.now() < end) {
    for (let index = 0; index < batchSize && performance.now() < end; index++) {
      sink ^= run(input);
      iterations++;
    }

    peakMemory = maxMemory(peakMemory, process.memoryUsage());

    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }

  await flushGcEntries();

  eventLoopDelay.disable();
  observer.disconnect();

  const endMemory = process.memoryUsage();
  const elu = performance.eventLoopUtilization(startElu);

  forceGc();
  await flushGcEntries();

  const afterGcMemory = process.memoryUsage();

  return {
    variant: variantName,
    iterations,
    iterationsPerSecond: iterations / (durationMs / 1000),
    sink,
    gcExposed: typeof globalThis.gc === "function",
    gc: {
      ...gc,
      avgMs: gc.count === 0 ? 0 : gc.totalMs / gc.count,
      totalMsPer100kIterations: (gc.totalMs / iterations) * 100_000,
    },
    eventLoop: {
      utilization: elu.utilization,
      activeMs: elu.active,
      idleMs: elu.idle,
      delayMinMs: eventLoopDelay.min / 1e6,
      delayMeanMs: eventLoopDelay.mean / 1e6,
      delayP50Ms: eventLoopDelay.percentile(50) / 1e6,
      delayP95Ms: eventLoopDelay.percentile(95) / 1e6,
      delayP99Ms: eventLoopDelay.percentile(99) / 1e6,
      delayMaxMs: eventLoopDelay.max / 1e6,
    },
    memory: {
      beforeGc: beforeGcMemory,
      start: startMemory,
      peak: peakMemory,
      end: endMemory,
      afterGc: afterGcMemory,
      retained: memoryDelta(afterGcMemory, beforeGcMemory),
    },
  };
}

console.log(JSON.stringify(await runVariant(variant)));
