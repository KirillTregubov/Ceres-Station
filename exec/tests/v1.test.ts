import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";

import { exec, ExecError, type ExecOptions } from "../v1.ts";

const node = process.execPath;
const fixtureDir = resolve(".tmp-v1-tests");

const normalizeNewlines = (value: string) => value.replaceAll("\r\n", "\n");
const normalizePath = (value: string) => resolve(value).toLowerCase();

const runNode = (script: string, options?: ExecOptions) =>
  exec(node, ["--eval", script], options);

const waitForOutput = async (
  stream: Readable | null,
  expected: string,
): Promise<string> => {
  expect(stream).toBeInstanceOf(Readable);

  stream?.setEncoding("utf8");

  let output = "";

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const cleanup = () => {
      stream?.off("data", onData);
      stream?.off("end", onEnd);
      stream?.off("error", onError);
    };

    const onData = (chunk: string) => {
      output += chunk;

      if (output.includes(expected)) {
        cleanup();
        resolvePromise();
      }
    };

    const onEnd = () => {
      cleanup();
      rejectPromise(new Error(`Stream ended before ${expected} was emitted`));
    };

    const onError = (error: Error) => {
      cleanup();
      rejectPromise(error);
    };

    stream?.on("data", onData);
    stream?.once("end", onEnd);
    stream?.once("error", onError);
  });

  return output;
};

beforeAll(async () => {
  await mkdir(fixtureDir, { recursive: true });
});

afterAll(async () => {
  await rm(fixtureDir, { force: true, recursive: true });
});

describe("exec", () => {
  test("returns an awaitable subprocess with process handles immediately", async () => {
    const subprocess = runNode("setTimeout(() => {}, 25)");

    expect(subprocess).toEqual(
      expect.objectContaining({
        pid: expect.any(Number),
        stdout: expect.any(Readable),
        stderr: expect.any(Readable),
        all: expect.any(Readable),
        kill: expect.any(Function),
      }),
    );
    expect(subprocess).toHaveProperty("then", expect.any(Function));

    await expect(subprocess).resolves.toMatchObject({
      command: node,
      exitCode: 0,
      signal: null,
      stdout: "",
      stderr: "",
      all: "",
    });
  });

  test("resolves with command metadata and untrimmed stdout on success", async () => {
    const script = "console.log(process.argv.slice(1).join('|'))";
    const args = ["--eval", script, "alpha", "two words", "symbols-!@#$"];

    const result = await exec(node, args);

    expect(result).toStrictEqual({
      command: node,
      args,
      exitCode: 0,
      signal: null,
      stdout: "alpha|two words|symbols-!@#$\n",
      stderr: "",
      all: "alpha|two words|symbols-!@#$\n",
    });
  });

  test("captures stdout and stderr independently while also collecting all output", async () => {
    const result = await runNode(
      [
        "process.stdout.write('out-1\\n');",
        "process.stderr.write('err-1\\n');",
        "process.stdout.write('out-2\\n');",
        "process.stderr.write('err-2\\n');",
      ].join(""),
    );

    expect(normalizeNewlines(result.stdout)).toBe("out-1\nout-2\n");
    expect(normalizeNewlines(result.stderr)).toBe("err-1\nerr-2\n");
    expect(result.all).toHaveLength(
      result.stdout.length + result.stderr.length,
    );
    expect(normalizeNewlines(result.all)).toEqual(
      expect.stringContaining("out-1\n"),
    );
    expect(normalizeNewlines(result.all)).toEqual(
      expect.stringContaining("err-1\n"),
    );
  });

  test("exposes all as a readable stream that mirrors the buffered result", async () => {
    const subprocess = runNode(
      [
        "setTimeout(() => process.stdout.write('stream-out\\n'), 10);",
        "setTimeout(() => process.stderr.write('stream-err\\n'), 20);",
      ].join(""),
    );
    const streamedAll = text(subprocess.all ?? Readable.from([]));

    const [result, all] = await Promise.all([subprocess, streamedAll]);

    expect(normalizeNewlines(all)).toBe(normalizeNewlines(result.all));
    expect(normalizeNewlines(all)).toContain("stream-out\n");
    expect(normalizeNewlines(all)).toContain("stream-err\n");
  });

  test("captures string chunks when consumers set stream encoding", async () => {
    const subprocess = runNode(
      [
        "setTimeout(() => {",
        "process.stdout.write(Buffer.from([0xe2, 0x98, 0x83]));",
        "process.stderr.write(' encoded-stderr');",
        "}, 10);",
      ].join(""),
    );

    subprocess.stdout?.setEncoding("utf8");
    subprocess.stderr?.setEncoding("utf8");

    await expect(subprocess).resolves.toMatchObject({
      stdout: "\u2603",
      stderr: " encoded-stderr",
      all: "\u2603 encoded-stderr",
    });
  });

  test("buffers large stdout and stderr output across multiple chunks", async () => {
    const byteCount = 128 * 1024;
    const result = await runNode(
      [
        `process.stdout.write('x'.repeat(${byteCount}));`,
        `process.stderr.write('y'.repeat(${byteCount}));`,
      ].join(""),
    );

    expect(result.stdout).toHaveLength(byteCount);
    expect(result.stderr).toHaveLength(byteCount);
    expect(result.all).toHaveLength(byteCount * 2);
    expect(result.stdout).toMatch(/^x+$/);
    expect(result.stderr).toMatch(/^y+$/);
  });

  describe("reject option", () => {
    test("rejects non-zero exits with an ExecError by default", async () => {
      try {
        await runNode(
          [
            "process.stdout.write('before-fail');",
            "process.stderr.write('failure-details');",
            "process.exit(7);",
          ].join(""),
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ExecError);
        expect(error).toMatchObject({
          name: "ExecError",
          message: `Command failed with exit code 7: ${node}`,
        });

        const execError = error as ExecError;

        expect(execError.result).toMatchObject({
          command: node,
          exitCode: 7,
          signal: null,
          stdout: "before-fail",
          stderr: "failure-details",
          all: "before-failfailure-details",
        });
        expect(execError.result.args).toHaveLength(2);
        expect(execError.stack).toContain("ExecError");
        return;
      }

      expect.unreachable("Expected command to reject with ExecError");
    });

    test("resolves non-zero exits when reject is false", async () => {
      await expect(
        runNode("process.stderr.write('soft failure'); process.exit(5);", {
          reject: false,
        }),
      ).resolves.toMatchObject({
        exitCode: 5,
        signal: null,
        stdout: "",
        stderr: "soft failure",
        all: "soft failure",
      });
    });

    test("still rejects spawn errors when reject is false", async () => {
      await expect(
        exec("definitely-not-a-real-command-ceres-station", [], {
          reject: false,
        }),
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  describe("spawn options", () => {
    test("runs in the provided cwd", async () => {
      const result = await runNode("console.log(process.cwd())", {
        cwd: fixtureDir,
      });

      expect(normalizePath(result.stdout.trim())).toBe(
        normalizePath(fixtureDir),
      );
    });

    test("passes the provided env through to the child process", async () => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        CERES_EXEC_VALUE: "visible",
        CERES_EXEC_EMPTY: "",
      };

      delete env.CERES_EXEC_MISSING;

      const result = await runNode(
        [
          "console.log([",
          "process.env.CERES_EXEC_VALUE,",
          "Object.hasOwn(process.env, 'CERES_EXEC_EMPTY'),",
          "process.env.CERES_EXEC_MISSING ?? 'missing',",
          "].join('|'));",
        ].join(""),
        { env },
      );

      expect(result.stdout).toBe("visible|true|missing\n");
    });

    test("supports shell execution for a single command string", async () => {
      const command = [
        JSON.stringify(node),
        "--eval",
        JSON.stringify("console.log('from shell')"),
      ].join(" ");

      const result = await exec(command, [], { shell: true });

      expect(result.command).toBe(command);
      expect(normalizeNewlines(result.stdout)).toBe("from shell\n");
      expect(result.exitCode).toBe(0);
    });

    test("rejects spawn option errors such as a missing cwd", async () => {
      await expect(
        exec(node, ["--version"], {
          cwd: join(fixtureDir, "missing-directory"),
        }),
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  describe("stdio option", () => {
    test("ignore drops output and exposes no readable streams", async () => {
      const subprocess = runNode(
        [
          "process.stdout.write('hidden stdout');",
          "process.stderr.write('hidden stderr');",
        ].join(""),
        { stdio: "ignore" },
      );

      expect(subprocess.stdout).toBeNull();
      expect(subprocess.stderr).toBeNull();
      expect(subprocess.all).toBeNull();

      await expect(subprocess).resolves.toMatchObject({
        stdout: "",
        stderr: "",
        all: "",
      });
    });

    test("inherit exposes no readable streams and leaves buffering empty", async () => {
      const subprocess = runNode("process.exit(0)", { stdio: "inherit" });

      expect(subprocess.stdout).toBeNull();
      expect(subprocess.stderr).toBeNull();
      expect(subprocess.all).toBeNull();

      await expect(subprocess).resolves.toMatchObject({
        stdout: "",
        stderr: "",
        all: "",
      });
    });
  });

  describe("process lifecycle", () => {
    test("kill terminates a running process and reports the termination", async () => {
      const subprocess = runNode(
        "console.log('ready'); setInterval(() => {}, 1_000);",
        {
          reject: false,
        },
      );

      await waitForOutput(subprocess.stdout, "ready");

      expect(subprocess.kill()).toBe(true);

      const result = await subprocess;

      expect(result.exitCode === null || result.exitCode > 0).toBe(true);
      expect(result.signal === null || result.signal === "SIGTERM").toBe(true);
      expect(result.stdout).toContain("ready");
    });

    test("kill(0) checks liveness without terminating the process", async () => {
      const subprocess = runNode(
        [
          "console.log('ready');",
          "setTimeout(() => process.exit(0), 25);",
        ].join(""),
        { reject: false },
      );

      await waitForOutput(subprocess.stdout, "ready");

      expect(subprocess.kill(0)).toBe(true);

      await expect(subprocess).resolves.toMatchObject({
        exitCode: 0,
        signal: null,
      });
    });

    test("returns false when kill is called after the process exits", async () => {
      const subprocess = runNode("process.exit(0)", { reject: false });

      await subprocess;

      expect(subprocess.kill()).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("throws synchronously for an empty command", () => {
      expect(() => exec("")).toThrow();
    });

    test("rejects unknown commands with the native spawn error", async () => {
      await expect(
        exec("definitely-not-a-real-command-ceres-station"),
      ).rejects.toMatchObject({
        code: "ENOENT",
        path: "definitely-not-a-real-command-ceres-station",
      });
    });

    test("ends the all stream when a piped process emits no output", async () => {
      const subprocess = runNode("");
      const streamedAll = text(subprocess.all ?? Readable.from([]));

      await expect(subprocess).resolves.toMatchObject({
        stdout: "",
        stderr: "",
        all: "",
      });
      await expect(streamedAll).resolves.toBe("");
    });
  });
});
