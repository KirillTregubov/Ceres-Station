import { spawn as nodeSpawn, type SpawnOptions } from "node:child_process";
import { PassThrough, type Readable } from "node:stream";

type OutputName = "stdout" | "stderr";

export type ExecOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean | string;
  stdio?: "pipe" | "ignore" | "inherit";
  reject?: boolean;
};

export type ExecResult = {
  command: string;
  args: string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  all: string;
};

export type ExecSubprocess = Promise<ExecResult> & {
  pid: number | undefined;
  stdout: Readable | null;
  stderr: Readable | null;
  all: Readable | null;
  kill: (signal?: NodeJS.Signals | number) => boolean;
};

export class ExecError extends Error {
  result: ExecResult;

  constructor(result: ExecResult) {
    super(`Command failed with exit code ${result.exitCode}: ${result.command}`);
    this.name = "ExecError";
    this.result = result;
  }
}

export function exec(
  command: string,
  args: string[] = [],
  options: ExecOptions = {},
): ExecSubprocess {
  const stdio = options.stdio ?? "pipe";
  const spawnOptions: SpawnOptions = { stdio };

  if (options.cwd !== undefined) {
    spawnOptions.cwd = options.cwd;
  }

  if (options.env !== undefined) {
    spawnOptions.env = options.env;
  }

  if (options.shell !== undefined) {
    spawnOptions.shell = options.shell;
  }

  const child = nodeSpawn(command, args, spawnOptions);

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const allChunks: Buffer[] = [];
  const all = stdio === "pipe" ? new PassThrough() : null;

  const capture = (name: OutputName, chunk: Buffer | string) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    if (name === "stdout") {
      stdoutChunks.push(buffer);
    } else {
      stderrChunks.push(buffer);
    }

    allChunks.push(buffer);
    all?.write(buffer);
  };

  child.stdout?.on("data", (chunk: Buffer | string) => capture("stdout", chunk));
  child.stderr?.on("data", (chunk: Buffer | string) => capture("stderr", chunk));

  let pendingStreams = Number(Boolean(child.stdout)) + Number(Boolean(child.stderr));
  const endAllWhenReady = () => {
    pendingStreams -= 1;
    if (pendingStreams === 0) {
      all?.end();
    }
  };

  child.stdout?.on("end", endAllWhenReady);
  child.stderr?.on("end", endAllWhenReady);

  if (pendingStreams === 0) {
    all?.end();
  }

  const promise = new Promise<ExecResult>((resolve, reject) => {
    child.once("error", reject);

    child.once("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      const result: ExecResult = {
        command,
        args,
        exitCode,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString(),
        all: Buffer.concat(allChunks).toString(),
      };

      if ((options.reject ?? true) && exitCode !== 0) {
        reject(new ExecError(result));
        return;
      }

      resolve(result);
    });
  }) as ExecSubprocess;

  promise.pid = child.pid;
  promise.stdout = child.stdout ?? null;
  promise.stderr = child.stderr ?? null;
  promise.all = all;
  promise.kill = child.kill.bind(child);

  return promise;
}
