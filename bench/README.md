# Node Benchmarking

## Table of Contents

- [Adding a Benchmark](#adding-a-benchmark)
- [Running Benchmarks](#running-benchmarks)
  - [Node Timing Suite](#node-timing-suite)
  - [GC Suite](#gc-suite)
  - [CPU Profile Suite](#cpu-profile-suite)

## Adding a Benchmark

Scaffold a new benchmark:

```bash
npm run create -- my-benchmark-name
```

This creates `benchmarks/my-benchmark-name.ts`. Export a `benchmark` definition with `makeInput`, `candidate`, and `baseline`:

```ts
import { defineBenchmark } from "../lib/benchmark.js";

export const benchmark = defineBenchmark({
  name: "my-benchmark-name",
  makeInput(size = 1_000) {
    return Array.from({ length: size }, (_, index) => index);
  },
  candidate(input) {
    return input.length;
  },
  baseline(input) {
    return input.length;
  },
});
```

Benchmark files are discovered automatically after build. No manual registry import is needed.

## Running Benchmarks

When passing flags through `npm run`, use the extra separator `-- --`.

```bash
npm run bench -- -- -b array-filter-vs-for
```

Run every benchmark in the Node timing suite:

```bash
npm run bench -- --all
```

Or use the shortcut:

```bash
npm run bench:all
```

### Node Timing Suite

```bash
npm run bench -- -- -b array-filter-vs-for --input-size 10000 --min-samples 50
```

Options:

- `--benchmark`, `-b`: benchmark name
- `--all`: run all benchmarks
- `--input-size`: input size passed to `makeInput`
- `--min-samples`: `bench-node` minimum sample count

Environment fallbacks:

- `BENCHMARK`
- `BENCH_ALL`
- `BENCH_INPUT_SIZE`
- `BENCH_MIN_SAMPLES`

### GC Suite

```bash
npm run bench:gc -- -- -b array-filter-vs-for --duration-ms 5000 --input-size 10000 --batch-size 500
```

JSON output:

```bash
npm run bench:gc -- -- -b array-filter-vs-for --duration-ms 5000 --input-size 10000 --batch-size 500 --report json
```

Options:

- `--benchmark`, `-b`: benchmark name
- `--duration-ms`: run duration per variant
- `--input-size`: input size passed to `makeInput`
- `--batch-size`: number of benchmark iterations before yielding back to the event loop
- `--report json`: print structured JSON instead of the comparison table

Environment fallbacks:

- `BENCHMARK`
- `BENCH_DURATION_MS`
- `BENCH_INPUT_SIZE`
- `BENCH_BATCH_SIZE`
- `BENCH_REPORT`

### CPU Profile Suite

```bash
npm run bench:cpu -- -- -b array-filter-vs-for --variant candidate --duration-ms 45000 --input-size 10000
```

Options:

- `--benchmark`, `-b`: benchmark name
- `--variant`: `candidate` or `baseline`
- `--duration-ms`: profile duration
- `--input-size`: input size passed to `makeInput`

Environment fallbacks:

- `BENCHMARK`
- `BENCH_VARIANT`
- `BENCH_DURATION_MS`
- `BENCH_INPUT_SIZE`
