import { defineBenchmark } from "../lib/benchmark.js";

export type User = {
  id: number;
  name: string;
  active: boolean;
  score: number;
};

type StableUserView = {
  id: number;
  name: string;
  active: boolean;
  score: number;
  bucket: number;
};

type UnstableUserView = Partial<StableUserView>;

export function makeInput(size = 1_000): User[] {
  return Array.from({ length: size }, (_, index) => ({
    id: index,
    name: `user-${index}`,
    active: index % 2 === 0,
    score: index % 97,
  }));
}

export function candidate(input: User[]): number {
  const views = new Array<StableUserView>(input.length);
  let checksum = 0;

  for (let index = 0; index < input.length; index++) {
    const user = input[index];
    const view = {
      id: user.id,
      name: user.name,
      active: user.active,
      score: user.score,
      bucket: user.score % 10,
    };

    views[index] = view;
    checksum += view.id + view.score + view.bucket;
  }

  return checksum;
}

export function baseline(input: User[]): number {
  const views = new Array<UnstableUserView>(input.length);
  let checksum = 0;

  for (let index = 0; index < input.length; index++) {
    const user = input[index];
    const view: UnstableUserView = {};

    if (user.active) {
      view.id = user.id;
      view.name = user.name;
      view.active = user.active;
      view.score = user.score;
      view.bucket = user.score % 10;
    } else {
      view.name = user.name;
      view.score = user.score;
      view.id = user.id;
      view.bucket = user.score % 10;
      view.active = user.active;
    }

    views[index] = view;
    checksum += view.id ?? 0;
    checksum += view.score ?? 0;
    checksum += view.bucket ?? 0;
  }

  return checksum;
}

export const benchmark = defineBenchmark({
  name: "hidden-class-shape-instability",
  makeInput,
  candidate,
  baseline,
});
