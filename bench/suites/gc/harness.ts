import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { BenchmarkVariant } from "../../lib/benchmark.js";
import {
  parseCliOptions,
  readBenchmarkName,
  readNumberOption,
  readStringOption,
} from "../harness-config.js";
import type { GcRunResult } from "./types.js";

const options = parseCliOptions();
const benchmarkName = await readBenchmarkName(options);
const inputSize = readNumberOption(options, ["input-size"], "BENCH_INPUT_SIZE", 10_000);
const durationMs = readNumberOption(
  options,
  ["duration-ms", "duration"],
  "BENCH_DURATION_MS",
  10_000,
);
const batchSize = readNumberOption(options, ["batch-size"], "BENCH_BATCH_SIZE", 1_000);
const report = readStringOption(options, ["report"], "BENCH_REPORT");
const workerPath = fileURLToPath(new URL("./worker.js", import.meta.url));

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMs(value: number): string {
  return `${formatNumber(value)} ms`;
}

function formatBytes(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let scaled = absolute;

  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex++;
  }

  return `${sign}${formatNumber(scaled)} ${units[unitIndex]}`;
}

function formatMultiplier(value: number): string {
  if (!Number.isFinite(value)) {
    return value === Infinity ? "∞x" : "n/a";
  }

  if (value > 0 && value < 0.01) {
    return "<0.01x";
  }

  return `${formatNumber(value)}x`;
}

function higherIsBetterScore(candidate: number, baseline: number): string {
  if (baseline === 0) {
    return candidate === 0 ? "same" : "candidate higher";
  }

  return formatMultiplier(candidate / baseline);
}

function lowerIsBetterScore(candidate: number, baseline: number): string {
  if (candidate === 0) {
    return baseline === 0 ? "same" : "candidate lower";
  }

  return formatMultiplier(baseline / candidate);
}

function memoryPressure(value: number): number {
  return Math.max(value, 0);
}

async function runWorker(variant: BenchmarkVariant): Promise<GcRunResult> {
  const args = [
    ...process.execArgv.filter((arg) => arg !== "--expose-gc"),
    "--expose-gc",
    workerPath,
    "--benchmark",
    benchmarkName,
    "--variant",
    variant,
    "--input-size",
    String(inputSize),
    "--duration-ms",
    String(durationMs),
    "--batch-size",
    String(batchSize),
  ];

  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`GC worker for ${variant} exited with code ${code}.\n${stderr}`));
        return;
      }

      try {
        const jsonLine = stdout
          .trim()
          .split(/\r?\n/)
          .findLast((line) => line.startsWith("{"));

        if (jsonLine === undefined) {
          throw new Error("No JSON result line found.");
        }

        resolve(JSON.parse(jsonLine) as GcRunResult);
      } catch (error) {
        reject(
          new Error(
            `GC worker for ${variant} did not return JSON.\nstdout:\n${stdout}\nstderr:\n${stderr}\n${String(error)}`,
          ),
        );
      }
    });
  });
}

function printComparison(results: [GcRunResult, GcRunResult]): void {
  const [candidateResult, baselineResult] = results;
  const candidateGcPer100k = (candidateResult.gc.count / candidateResult.iterations) * 100_000;
  const baselineGcPer100k = (baselineResult.gc.count / baselineResult.iterations) * 100_000;
  const candidateHeapRetained = memoryPressure(candidateResult.memory.retained.heapUsed);
  const baselineHeapRetained = memoryPressure(baselineResult.memory.retained.heapUsed);
  const candidateRssRetained = memoryPressure(candidateResult.memory.retained.rss);
  const baselineRssRetained = memoryPressure(baselineResult.memory.retained.rss);
  const rows = [
    {
      metric: "iterations",
      candidate: formatNumber(candidateResult.iterations),
      baseline: formatNumber(baselineResult.iterations),
      score: higherIsBetterScore(candidateResult.iterations, baselineResult.iterations),
    },
    {
      metric: "iterations/sec",
      candidate: formatNumber(candidateResult.iterationsPerSecond),
      baseline: formatNumber(baselineResult.iterationsPerSecond),
      score: higherIsBetterScore(
        candidateResult.iterationsPerSecond,
        baselineResult.iterationsPerSecond,
      ),
    },
    {
      metric: "gc count",
      candidate: formatNumber(candidateResult.gc.count),
      baseline: formatNumber(baselineResult.gc.count),
      score: lowerIsBetterScore(candidateResult.gc.count, baselineResult.gc.count),
    },
    {
      metric: "gc / 100k iters",
      candidate: formatNumber(candidateGcPer100k),
      baseline: formatNumber(baselineGcPer100k),
      score: lowerIsBetterScore(candidateGcPer100k, baselineGcPer100k),
    },
    {
      metric: "gc total / 100k",
      candidate: formatMs(candidateResult.gc.totalMsPer100kIterations),
      baseline: formatMs(baselineResult.gc.totalMsPer100kIterations),
      score: lowerIsBetterScore(
        candidateResult.gc.totalMsPer100kIterations,
        baselineResult.gc.totalMsPer100kIterations,
      ),
    },
    {
      metric: "gc total",
      candidate: formatMs(candidateResult.gc.totalMs),
      baseline: formatMs(baselineResult.gc.totalMs),
      score: lowerIsBetterScore(candidateResult.gc.totalMs, baselineResult.gc.totalMs),
    },
    {
      metric: "gc avg",
      candidate: formatMs(candidateResult.gc.avgMs),
      baseline: formatMs(baselineResult.gc.avgMs),
      score: lowerIsBetterScore(candidateResult.gc.avgMs, baselineResult.gc.avgMs),
    },
    {
      metric: "gc max",
      candidate: formatMs(candidateResult.gc.maxMs),
      baseline: formatMs(baselineResult.gc.maxMs),
      score: lowerIsBetterScore(candidateResult.gc.maxMs, baselineResult.gc.maxMs),
    },
    ...(["minor", "major", "incremental", "weakCallback"] as const).map((kind) => ({
      metric: `${kind} gc`,
      candidate: formatNumber(candidateResult.gc.byKind[kind]),
      baseline: formatNumber(baselineResult.gc.byKind[kind]),
      score: lowerIsBetterScore(candidateResult.gc.byKind[kind], baselineResult.gc.byKind[kind]),
    })),
    {
      metric: "event loop p95",
      candidate: formatMs(candidateResult.eventLoop.delayP95Ms),
      baseline: formatMs(baselineResult.eventLoop.delayP95Ms),
      score: lowerIsBetterScore(
        candidateResult.eventLoop.delayP95Ms,
        baselineResult.eventLoop.delayP95Ms,
      ),
    },
    {
      metric: "event loop max",
      candidate: formatMs(candidateResult.eventLoop.delayMaxMs),
      baseline: formatMs(baselineResult.eventLoop.delayMaxMs),
      score: lowerIsBetterScore(
        candidateResult.eventLoop.delayMaxMs,
        baselineResult.eventLoop.delayMaxMs,
      ),
    },
    {
      metric: "peak heap used",
      candidate: formatBytes(candidateResult.memory.peak.heapUsed),
      baseline: formatBytes(baselineResult.memory.peak.heapUsed),
      score: lowerIsBetterScore(
        candidateResult.memory.peak.heapUsed,
        baselineResult.memory.peak.heapUsed,
      ),
    },
    {
      metric: "peak rss",
      candidate: formatBytes(candidateResult.memory.peak.rss),
      baseline: formatBytes(baselineResult.memory.peak.rss),
      score: lowerIsBetterScore(candidateResult.memory.peak.rss, baselineResult.memory.peak.rss),
    },
    {
      metric: "retained heap",
      candidate: formatBytes(candidateResult.memory.retained.heapUsed),
      baseline: formatBytes(baselineResult.memory.retained.heapUsed),
      score: lowerIsBetterScore(candidateHeapRetained, baselineHeapRetained),
    },
    {
      metric: "retained rss",
      candidate: formatBytes(candidateResult.memory.retained.rss),
      baseline: formatBytes(baselineResult.memory.retained.rss),
      score: lowerIsBetterScore(candidateRssRetained, baselineRssRetained),
    },
    {
      metric: "sink",
      candidate: formatNumber(candidateResult.sink),
      baseline: formatNumber(baselineResult.sink),
      score: "",
    },
  ];
  const widths = {
    metric: Math.max("metric".length, ...rows.map((row) => row.metric.length)),
    candidate: Math.max("candidate".length, ...rows.map((row) => row.candidate.length)),
    baseline: Math.max("baseline".length, ...rows.map((row) => row.baseline.length)),
    score: Math.max("candidate edge".length, ...rows.map((row) => row.score.length)),
  };
  const pad = (value: string, width: number) => value.padEnd(width);
  const header = [
    pad("metric", widths.metric),
    pad("candidate", widths.candidate),
    pad("baseline", widths.baseline),
    pad("candidate edge", widths.score),
  ].join("  ");
  const separator = [
    "-".repeat(widths.metric),
    "-".repeat(widths.candidate),
    "-".repeat(widths.baseline),
    "-".repeat(widths.score),
  ].join("  ");

  console.log(`GC benchmark: ${benchmarkName}`);
  console.log(
    `duration: ${formatMs(durationMs)} | input: ${formatNumber(inputSize)} | batch: ${formatNumber(batchSize)} | isolated processes: yes | forced GC: ${candidateResult.gcExposed && baselineResult.gcExposed ? "yes" : "no"}`,
  );
  console.log("");
  console.log(header);
  console.log(separator);

  for (const row of rows) {
    console.log(
      [
        pad(row.metric, widths.metric),
        pad(row.candidate, widths.candidate),
        pad(row.baseline, widths.baseline),
        pad(row.score, widths.score),
      ].join("  "),
    );
  }
}

const results: [GcRunResult, GcRunResult] = [
  await runWorker("candidate"),
  await runWorker("baseline"),
];

if (report === "json") {
  console.log(
    JSON.stringify(
      {
        benchmark: benchmarkName,
        durationMs,
        inputSize,
        batchSize,
        isolatedProcesses: true,
        results,
      },
      null,
      2,
    ),
  );
} else {
  printComparison(results);
}
