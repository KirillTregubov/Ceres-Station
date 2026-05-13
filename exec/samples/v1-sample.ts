import { exec } from "../v1.ts";

async function main() {
  const childScript = [
    "let tick = 0;",
    "const timer = setInterval(() => {",
    "    tick += 1;",
    "    const seconds = tick;",
    "    console.log(`[child stdout] ${seconds}s`);",
    "    console.error(`[child stderr] ${seconds}s`);",
    "    if (tick === 6) clearInterval(timer);",
    "}, 1_000);",
  ].join("\n");

  const startedAt = Date.now();
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

  const subprocess = exec("node", ["--eval", childScript]);

  subprocess.stdout?.setEncoding("utf8");
  subprocess.stderr?.setEncoding("utf8");

  subprocess.stdout?.on("data", (chunk: string) => {
    process.stdout.write(`[parent +${elapsed()} stdout] ${chunk}`);
  });

  subprocess.stderr?.on("data", (chunk: string) => {
    process.stdout.write(`[parent +${elapsed()} stderr] ${chunk}`);
  });

  const result = await subprocess;

  console.log("\ncompleted", {
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout.split("\n"),
    stderr: result.stderr.split("\n"),
    all: result.all.split("\n"),
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
