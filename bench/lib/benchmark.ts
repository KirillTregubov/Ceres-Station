import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type BenchmarkVariant = "candidate" | "baseline";

export type BenchmarkDefinition<Input = unknown> = {
  name: string;
  makeInput: (size: number) => Input;
  candidate: (input: Input) => number;
  baseline: (input: Input) => number;
};

type BenchmarkModule = {
  benchmark?: BenchmarkDefinition<any>;
  default?: BenchmarkDefinition<any>;
};

let benchmarksPromise: Promise<Readonly<Record<string, BenchmarkDefinition<any>>>> | undefined;

export function defineBenchmark<Input>(
  definition: BenchmarkDefinition<Input>,
): BenchmarkDefinition<Input> {
  return definition;
}

function isBenchmarkDefinition(value: unknown): value is BenchmarkDefinition<any> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<BenchmarkDefinition<any>>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.makeInput === "function" &&
    typeof candidate.candidate === "function" &&
    typeof candidate.baseline === "function"
  );
}

async function loadBenchmarks(): Promise<Readonly<Record<string, BenchmarkDefinition<any>>>> {
  const benchmarksDirectory = fileURLToPath(new URL("../benchmarks", import.meta.url));
  const entries = await readdir(benchmarksDirectory);
  const loadedBenchmarks: Record<string, BenchmarkDefinition<any>> = {};

  for (const entry of entries.toSorted()) {
    if (entry === "index.js" || extname(entry) !== ".js") {
      continue;
    }

    const moduleUrl = pathToFileURL(join(benchmarksDirectory, entry)).href;
    const module = (await import(moduleUrl)) as BenchmarkModule;
    const benchmark = module.benchmark ?? module.default;

    if (!isBenchmarkDefinition(benchmark)) {
      throw new Error(
        `Benchmark module "${entry}" must export a benchmark definition as "benchmark" or default.`,
      );
    }

    if (loadedBenchmarks[benchmark.name] !== undefined) {
      throw new Error(`Duplicate benchmark name "${benchmark.name}".`);
    }

    loadedBenchmarks[benchmark.name] = benchmark;
  }

  if (Object.keys(loadedBenchmarks).length === 0) {
    throw new Error(`No benchmarks found in ${benchmarksDirectory}.`);
  }

  return loadedBenchmarks;
}

export async function getBenchmarks(): Promise<Readonly<Record<string, BenchmarkDefinition<any>>>> {
  benchmarksPromise ??= loadBenchmarks();

  return await benchmarksPromise;
}

export async function getBenchmarkNames(): Promise<string[]> {
  return Object.keys(await getBenchmarks());
}

export async function getBenchmark(name: string): Promise<BenchmarkDefinition<any>> {
  const benchmarks = await getBenchmarks();
  const benchmark = benchmarks[name];

  if (benchmark === undefined) {
    const benchmarkNames = Object.keys(benchmarks);

    throw new Error(
      `Unknown benchmark "${name}". Available benchmarks: ${benchmarkNames.join(", ")}`,
    );
  }

  return benchmark;
}

export function getBenchmarkVariant(
  benchmark: BenchmarkDefinition<any>,
  variant: BenchmarkVariant,
): (input: any) => number {
  return benchmark[variant];
}
