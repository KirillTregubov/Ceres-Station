import { defineBenchmark } from "../lib/benchmark.js";

export type User = {
  id: number;
  name: string;
  email: string;
  score: number;
};

export type ProjectedUser = {
  id: number;
  name: string;
};

export type BenchmarkInput = {
  users: User[];
  reusableResult: ProjectedUser[];
};

export function makeInput(size = 1_000): BenchmarkInput {
  return {
    users: Array.from({ length: size }, (_, index) => ({
      id: index,
      name: `user-${index}`,
      email: `user-${index}@example.com`,
      score: index % 97,
    })),
    reusableResult: Array.from({ length: size }, () => ({
      id: 0,
      name: "",
    })),
  };
}

export function candidate(input: BenchmarkInput): number {
  const { users, reusableResult } = input;
  let checksum = 0;

  for (let index = 0; index < users.length; index++) {
    const user = users[index];
    const result = reusableResult[index];

    result.id = user.id;
    result.name = user.name;
    checksum += result.id + result.name.length;
  }

  return checksum;
}

export function baseline(input: BenchmarkInput): number {
  const result = input.users.map((user) => ({
    id: user.id,
    name: user.name,
  }));
  let checksum = 0;

  for (let index = 0; index < result.length; index++) {
    const user = result[index];

    checksum += user.id + user.name.length;
  }

  return checksum;
}

export const benchmark = defineBenchmark({
  name: "constant-object-reallocation",
  makeInput,
  candidate,
  baseline,
});
