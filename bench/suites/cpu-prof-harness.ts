import { getBenchmarkVariant } from "../lib/benchmark.js";
import {
  parseCliOptions,
  readBenchmark,
  readBenchmarkVariant,
  readNumberOption,
} from "./harness-config.js";

const options = parseCliOptions();
const { benchmarkName, benchmark } = await readBenchmark(options);
const variant = readBenchmarkVariant(options);
const durationMs = readNumberOption(
  options,
  ["duration-ms", "duration"],
  "BENCH_DURATION_MS",
  45_000,
);
const inputSize = readNumberOption(options, ["input-size"], "BENCH_INPUT_SIZE", 10_000);

const input = benchmark.makeInput(inputSize);
const end = Date.now() + durationMs;
let iterations = 0;
let sink = 0;

const run = getBenchmarkVariant(benchmark, variant);

while (Date.now() < end) {
  sink ^= run(input);
  iterations++;
}

console.log(
  JSON.stringify({
    benchmark: benchmarkName,
    variant,
    durationMs,
    inputSize,
    iterations,
    sink,
  }),
);
