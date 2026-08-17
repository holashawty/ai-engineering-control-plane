#!/usr/bin/env node
// sandbox/run-in-sandbox.mjs
//
// ADR-0030 / ADR-0035: CLI wrapper for the Docker sandbox runner.
//
// Usage:
//   node sandbox/run-in-sandbox.mjs <workDir> -- <command...>
//
// Examples:
//   node sandbox/run-in-sandbox.mjs /tmp/work -- echo hello
//   node sandbox/run-in-sandbox.mjs /tmp/work --timeout=5000 -- npm test
//   node sandbox/run-in-sandbox.mjs /tmp/work --image=node:20-alpine -- python3 -c 'print(1+1)'
//
// The script:
//   1. Resolves the executor's compiled sandbox-runner.ts (must run
//      `npm run build --workspace=executor` first).
//   2. Parses argv: workDir is the first positional arg, `--` separates
//      AIECP args from the command-to-run.
//   3. Calls runInSandbox() with the parsed options.
//   4. Prints a structured summary (exit code, stdout, stderr, sandboxed
//      flag, warning if any) and exits with the sandboxed command's exit
//      code (so it composes with shells and CI).
//
// Exit codes:
//   - The command's exit code (when it ran, sandboxed or not).
//   - 2 = CLI usage error (bad args, executor not built).
//
// This wrapper is intended for MANUAL testing and for use in shell
// scripts. Workflow code calls `runInSandbox()` from TypeScript
// directly — this CLI is a convenience, not the canonical entry point.

import { runInSandbox, isDockerAvailable, DOCKER_UNAVAILABLE_WARNING } from "../executor/dist/sandbox-runner.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function printUsage() {
  process.stderr.write(
    `Usage: node sandbox/run-in-sandbox.mjs <workDir> [--timeout=MS] [--image=IMG] -- <command...>

  workDir            Directory mounted as /workspace (must exist on host).
  --timeout=MS       Optional. Command timeout in ms (default 30000).
  --image=IMG        Optional. Docker image (default aiecp-executor:latest).
  --                 Separates AIECP args from the command-to-run.
  command...         Argv passed to the sandbox (e.g. "echo hello").

Examples:
  node sandbox/run-in-sandbox.mjs /tmp/work -- echo hello
  node sandbox/run-in-sandbox.mjs /tmp/work --timeout=5000 -- npm test
  node sandbox/run-in-sandbox.mjs /tmp/work --image=node:20-alpine -- python3 -c 'print(2+2)'
`);
}

function parseArgs(argv) {
  const opts = { timeoutMs: undefined, image: undefined, workDir: undefined, command: [] };
  let i = 0;
  // First positional = workDir (must come before --)
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--") {
      i++;
      opts.command = argv.slice(i);
      break;
    }
    if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (arg.startsWith("--timeout=")) {
      opts.timeoutMs = parseInt(arg.slice("--timeout=".length), 10);
      i++;
      continue;
    }
    if (arg.startsWith("--image=")) {
      opts.image = arg.slice("--image=".length);
      i++;
      continue;
    }
    // First non-flag positional = workDir
    if (opts.workDir === undefined) {
      opts.workDir = arg;
      i++;
      continue;
    }
    process.stderr.write(`Unexpected argument: ${arg}\n`);
    printUsage();
    process.exit(2);
  }
  if (!opts.workDir) {
    process.stderr.write("Error: <workDir> is required.\n\n");
    printUsage();
    process.exit(2);
  }
  if (opts.command.length === 0) {
    process.stderr.write("Error: command is required after `--`.\n\n");
    printUsage();
    process.exit(2);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const workDir = resolve(opts.workDir);
  if (!existsSync(workDir)) {
    process.stderr.write(`Error: workDir "${workDir}" does not exist.\n`);
    process.exit(2);
  }

  const dockerAvailable = isDockerAvailable();
  process.stderr.write(`[sandbox-cli] Docker available: ${dockerAvailable}\n`);
  if (!dockerAvailable) {
    process.stderr.write(DOCKER_UNAVAILABLE_WARNING + "\n");
  }

  const result = runInSandbox(opts.command, {
    workDir,
    timeoutMs: opts.timeoutMs,
    image: opts.image,
  });

  // Print a structured summary to stderr (so stdout stays clean for
  // the command's actual output — important when piping).
  process.stderr.write(
    `\n[sandbox-cli] result:\n` +
    `  exitCode:   ${result.exitCode}\n` +
    `  sandboxed:  ${result.sandboxed}\n` +
    `  timedOut:   ${result.timedOut}\n` +
    `  durationMs: ${result.durationMs}\n` +
    `  signal:     ${result.signal ?? "(none)"}\n` +
    (result.warning ? `  warning:    ${result.warning}\n` : ""),
  );

  // Forward the command's stdout/stderr verbatim so this CLI composes
  // with shells (e.g. `node run-in-sandbox.mjs /tmp/w -- cat foo | grep bar`).
  process.stdout.write(result.stdout);
  if (result.stderr && !result.warning) {
    // Only forward stderr if there's no warning prefix collision risk.
    // When warning is set, the runner already wrote the warning to
    // stderr; we don't want to duplicate it.
    process.stderr.write(result.stderr);
  } else if (result.stderr && result.warning) {
    // Strip our own warning from the captured stderr before forwarding.
    const cleaned = result.stderr.replace(DOCKER_UNAVAILABLE_WARNING, "").trim();
    if (cleaned) process.stderr.write(cleaned + "\n");
  }

  // Exit with the command's exit code (compose with shells).
  // -1 means the process didn't start or was killed by signal.
  const exit = result.exitCode >= 0 ? result.exitCode : 1;
  process.exit(exit);
}

main();
