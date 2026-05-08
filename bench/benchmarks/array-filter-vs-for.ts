import { defineBenchmark } from "../lib/benchmark.js";

export type BenchmarkInput = {
  id: number;
  name: string;
  tags: string[];
  score: number;
};

export function makeInput(size = 1_000): BenchmarkInput[] {
  return Array.from({ length: size }, (_, index) => ({
    id: index,
    name: `item-${index}`,
    tags: [`group-${index % 10}`, `bucket-${index % 100}`],
    score: index % 97,
  }));
}

export function candidate(input: BenchmarkInput[]): number {
  let total = 0;

  for (let index = 0; index < input.length; index++) {
    const item = input[index];

    if (item.score % 2 === 0) {
      total += item.id;
    }
  }

  return total;
}

export function baseline(input: BenchmarkInput[]): number {
  return input.filter((item) => item.score % 2 === 0).reduce((total, item) => total + item.id, 0);
}

export const benchmark = defineBenchmark({
  name: "array-filter-vs-for",
  makeInput,
  candidate,
  baseline,
});
