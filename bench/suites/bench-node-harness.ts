import { chartReport, Suite } from "bench-node";

import { getBenchmarks, type BenchmarkDefinition } from "../lib/benchmark.js";
import {
  parseCliOptions,
  readBenchmark,
  readBooleanOption,
  readNumberOption,
} from "./harness-config.js";

type BenchmarkEntry = {
  name: string;
  benchmark: BenchmarkDefinition<any>;
  input: any;
};

const options = parseCliOptions();
const runAll = readBooleanOption(options, ["all"], "BENCH_ALL");
const inputSize = readNumberOption(options, ["input-size"], "BENCH_INPUT_SIZE", 10_000);
const minSamples = readNumberOption(
  options,
  ["min-samples", "samples"],
  "BENCH_MIN_SAMPLES",
  1_000,
);
let sink = 0;

function printSection(title: string, values: Record<string, string | number>): void {
  const entries = Object.entries(values);
  const labelWidth = Math.max(...entries.map(([label]) => label.length));

  console.log(title);

  for (const [label, value] of entries) {
    console.log(`  ${label.padEnd(labelWidth)}  ${value}`);
  }

  console.log();
}

async function readBenchmarkEntries(): Promise<BenchmarkEntry[]> {
  if (!runAll) {
    const { benchmarkName, benchmark } = await readBenchmark(options);

    return [
      {
        name: benchmarkName,
        benchmark,
        input: benchmark.makeInput(inputSize),
      },
    ];
  }

  const benchmarks = await getBenchmarks();

  return Object.entries(benchmarks).map(([name, benchmark]) => ({
    name,
    benchmark,
    input: benchmark.makeInput(inputSize),
  }));
}

const benchmarkEntries = await readBenchmarkEntries();

printSection("Benchmark Parameters", {
  benchmark: runAll ? "all" : benchmarkEntries[0].name,
  suites: benchmarkEntries.length,
  inputSize,
  minSamples,
});

for (let index = 0; index < benchmarkEntries.length; index++) {
  const entry = benchmarkEntries[index];
  const suite = new Suite({
    minSamples,
    reporter: chartReport,
    reporterOptions: {
      printHeader: index === 0,
    },
  });

  suite
    .add(`${entry.name}:candidate`, () => {
      sink ^= entry.benchmark.candidate(entry.input);
    })
    .add(`${entry.name}:baseline`, () => {
      sink ^= entry.benchmark.baseline(entry.input);
    });

  await suite.run();

  if (index < benchmarkEntries.length - 1) {
    console.log();
  }
}

console.log();
