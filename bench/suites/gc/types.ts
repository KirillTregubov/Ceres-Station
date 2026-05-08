import type { BenchmarkVariant } from "../../lib/benchmark.js";

export type GcKind = "major" | "minor" | "incremental" | "weakCallback" | "unknown";

export type GcRunResult = {
  variant: BenchmarkVariant;
  iterations: number;
  iterationsPerSecond: number;
  sink: number;
  gcExposed: boolean;
  gc: {
    count: number;
    totalMs: number;
    totalMsPer100kIterations: number;
    maxMs: number;
    avgMs: number;
    byKind: Record<GcKind, number>;
  };
  eventLoop: {
    utilization: number;
    activeMs: number;
    idleMs: number;
    delayMinMs: number;
    delayMeanMs: number;
    delayP50Ms: number;
    delayP95Ms: number;
    delayP99Ms: number;
    delayMaxMs: number;
  };
  memory: {
    beforeGc: NodeJS.MemoryUsage;
    start: NodeJS.MemoryUsage;
    peak: NodeJS.MemoryUsage;
    end: NodeJS.MemoryUsage;
    afterGc: NodeJS.MemoryUsage;
    retained: NodeJS.MemoryUsage;
  };
};
