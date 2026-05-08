import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const benchmarkName = process.argv[2];

function usage() {
  console.log("Usage: npm run create -- my-benchmark-name");
}

if (benchmarkName === undefined) {
  usage();
} else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(benchmarkName)) {
  console.error(
    `Benchmark name must be kebab-case with letters, numbers, and dashes. Received: ${benchmarkName}`,
  );
  process.exitCode = 1;
} else {
  const benchmarkDirectory = join(process.cwd(), "benchmarks");
  const benchmarkPath = join(benchmarkDirectory, `${benchmarkName}.ts`);

  if (existsSync(benchmarkPath)) {
    console.error(`Benchmark already exists: ${benchmarkPath}`);
    process.exitCode = 1;
  } else {
    const template = `import { defineBenchmark } from "../lib/benchmark.js";

type BenchmarkInput = number[];

function makeInput(size = 1_000): BenchmarkInput {
  return Array.from({ length: size }, (_, index) => index);
}

function candidate(input: BenchmarkInput): number {
  let total = 0;

  for (const value of input) {
    total += value;
  }

  return total;
}

function baseline(input: BenchmarkInput): number {
  return input.reduce((total, value) => total + value, 0);
}

export const benchmark = defineBenchmark({
  name: "${benchmarkName}",
  makeInput,
  candidate,
  baseline,
});
`;

    await mkdir(benchmarkDirectory, { recursive: true });
    await writeFile(benchmarkPath, template, { flag: "wx" });
    console.log(`Created ${basename(benchmarkPath)}`);
  }
}
