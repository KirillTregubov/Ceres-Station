import { type BenchmarkVariant, getBenchmark, getBenchmarkNames } from "../lib/benchmark.js";

const variants = ["candidate", "baseline"] as const;

type CliOptions = {
  flags: Readonly<Record<string, string>>;
  positional: readonly string[];
};

function normalizeFlagName(name: string): string {
  return name.replace(/^-+/, "").replaceAll("_", "-");
}

export function parseCliOptions(args = process.argv.slice(2)): CliOptions {
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (!arg.startsWith("-")) {
      positional.push(arg);
      continue;
    }

    const flagPrefixLength = arg.startsWith("--") ? 2 : 1;
    const [rawName, inlineValue] = arg.slice(flagPrefixLength).split("=", 2);
    const name = normalizeFlagName(rawName);

    if (inlineValue !== undefined) {
      flags[name] = inlineValue;
      continue;
    }

    const next = args[index + 1];

    if (next !== undefined && !next.startsWith("-")) {
      flags[name] = next;
      index++;
    } else {
      flags[name] = "true";
    }
  }

  return { flags, positional };
}

function readFlag(options: CliOptions, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = options.flags[normalizeFlagName(name)];

    if (value !== undefined) {
      return value;
    }
  }

  for (const name of names) {
    const npmConfigName = `npm_config_${normalizeFlagName(name).replaceAll("-", "_")}`;
    const value = process.env[npmConfigName];

    if (value !== undefined && value !== "true") {
      return value;
    }
  }

  return undefined;
}

function readNumber(name: string, value: string, source: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${source} ${name} must be a finite number, received "${value}"`);
  }

  return parsed;
}

export function readNumberEnv(name: string, defaultValue: number): number {
  const value = process.env[name];

  if (value === undefined) {
    return defaultValue;
  }

  return readNumber(name, value, "Env var");
}

export function readNumberOption(
  options: CliOptions,
  flagNames: readonly string[],
  envName: string,
  defaultValue: number,
): number {
  const value = readFlag(options, flagNames);

  if (value !== undefined) {
    return readNumber(`--${flagNames[0]}`, value, "Option");
  }

  return readNumberEnv(envName, defaultValue);
}

export function readBooleanOption(
  options: CliOptions,
  flagNames: readonly string[],
  envName: string,
): boolean {
  const value = readFlag(options, flagNames) ?? process.env[envName];

  if (value === undefined) {
    return false;
  }

  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

export function readStringOption(
  options: CliOptions,
  flagNames: readonly string[],
  envName: string,
): string | undefined {
  return readFlag(options, flagNames) ?? process.env[envName];
}

export async function readBenchmarkName(options = parseCliOptions()): Promise<string> {
  return (
    readFlag(options, ["benchmark", "b"]) ??
    process.env.BENCHMARK ??
    options.positional[0] ??
    (await getBenchmarkNames())[0]
  );
}

export async function readBenchmark(options = parseCliOptions()) {
  const benchmarkName = await readBenchmarkName(options);

  return {
    benchmarkName,
    benchmark: await getBenchmark(benchmarkName),
  };
}

export function readBenchmarkVariant(options = parseCliOptions()): BenchmarkVariant {
  const variant =
    readFlag(options, ["variant"]) ??
    process.env.BENCH_VARIANT ??
    options.positional[1] ??
    "candidate";

  if (!variants.includes(variant as BenchmarkVariant)) {
    throw new Error(
      `Unknown benchmark variant "${variant}". Available variants: ${variants.join(", ")}`,
    );
  }

  return variant as BenchmarkVariant;
}
