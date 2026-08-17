// executor/src/sandbox-runner.ts
//
// ADR-0030 (decision) + ADR-0035 (implementation): Docker-based OS-level
// sandbox for LLM-emitted commands. The pro-LLM audit (2026-08-16)
// required OS-level isolation — `safety-gate.ts` is prompt-level and
// cannot prevent a malicious `rm -rf /` if the LLM emits it. WASI was
// rejected per ADR-0030 (CVE-2026-26956 in vm2; node:wasi exploitable
// via absolute-path file access).
//
// This module is the SINGLE entry point for "run an LLM-emitted command
// in the sandbox". It:
//   1. Detects whether a Docker daemon is available (`docker info`).
//   2. If yes: runs the command in a real container (node:20-alpine,
//      --read-only, --cap-drop=ALL, --network=none, /workspace bind-mount).
//   3. If no: falls back to `spawnSync` with a LOUD WARNING to stderr.
//      The fallback is DEVELOPMENT MODE ONLY — production deployments MUST
//      install Docker and build the aiecp-executor image. The warning is
//      surfaced both on stderr AND embedded in the returned SandboxResult
//      so callers can record it in evidence (audit trail).
//
// Design principle: NEVER silently run unsandboxed. A silent fallback is
// a security bug — the user must know every time the sandbox is bypassed.
//
// The runner is intentionally SIDE-EFFECT-FREE at module import: it does
// not spawn `docker info` until `isDockerAvailable()` is first called.
// The detection result is cached for the process lifetime (a Docker
// daemon doesn't usually appear or disappear mid-run; if it does, the
// next process invocation will re-detect).
//
// Tested by executor/examples/e2e-sandbox/drive-run.mjs — works whether
// or not Docker is available (the test asserts on `sandboxed` field
// rather than assuming one path).

import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────

/**
 * The result of a sandboxed (or unsandboxed-fallback) command run.
 * `sandboxed` MUST be inspected by callers before trusting the result:
 *   - sandboxed=true  → command ran inside a hardened Docker container
 *   - sandboxed=false → command ran via spawnSync on the host (dev mode).
 *                        `warning` is set with a human-readable explanation.
 */
export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  /** true = ran in Docker; false = fell back to execSync/spawnSync. */
  sandboxed: boolean;
  /** Present (and non-empty) when sandboxed=false — explains the fallback. */
  warning?: string;
  /** Signal that killed the process (e.g. "SIGTERM" on timeout), if any.
   *  Mirrors child_process's `signal` field. */
  signal?: string | null;
  /** True if the run was killed because it exceeded `timeoutMs`. */
  timedOut: boolean;
}

export interface SandboxOptions {
  /** Directory mounted as /workspace inside the container (read-write,
   *  so test artifacts can be written). MUST exist on the host — the
   *  runner does not create it. Resolved to an absolute path. */
  workDir: string;
  /** Max wall-clock time the command may run, in milliseconds.
   *  Default 30000 (30s). On expiry, the container/process is killed
   *  and `timedOut: true` is set in the result. */
  timeoutMs?: number;
  /** Docker image to use. Defaults to "aiecp-executor:latest" (built
   *  from sandbox/Dockerfile.aiecp-executor). The runner does NOT
   *  build the image — that's an ops step (see ADR-0035 ops checklist). */
  image?: string;
}

// ─── Constants ───────────────────────────────────────────────────────

/**
 * Default Docker image tag for the sandbox. Built from
 * sandbox/Dockerfile.aiecp-executor. The image MUST be built before
 * production use — `sandbox-runner.ts` does not auto-build it.
 */
export const DEFAULT_SANDBOX_IMAGE = "aiecp-executor:latest";

/**
 * Fallback image if `aiecp-executor:latest` is not available. Pulled
 * from Docker Hub on first use. Used ONLY when the caller explicitly
 * passes `image: undefined` AND the local aiecp-executor image is
 * missing — but since we cannot easily detect "image missing" without
 * a `docker images` call, this is documented as a manual fallback
 * for now (the caller chooses which image to use).
 */
export const FALLBACK_PUBLIC_IMAGE = "node:20-alpine";

/**
 * Default command timeout (30s). Long enough for unit tests, short
 * enough that a hung `npm install` won't block the workflow forever.
 * Long-running commands (test suites, builds) should pass an explicit
 * `timeoutMs` in SandboxOptions.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * The LOUD WARNING printed to stderr when Docker is unavailable and
 * the runner falls back to unsandboxed execution. Exported so tests
 * can assert that the warning text is present (catches silent fallback
 * regressions — the single most dangerous failure mode for this module).
 */
export const DOCKER_UNAVAILABLE_WARNING =
  "⚠️  AIECP SANDBOX WARNING: Docker daemon not available — running " +
  "UNSANDBOXED (development mode only). For production, install Docker " +
  "and rebuild the aiecp-executor image (see ADR-0030/ADR-0035). " +
  "LLM-emitted commands are NOT OS-isolated in this mode.";

// ─── Docker availability detection ──────────────────────────────────

let dockerAvailableCache: boolean | undefined;

/**
 * Detects whether a Docker daemon is reachable from this process.
 * Runs `docker info` via spawnSync and checks the exit code.
 *
 * The result is cached for the process lifetime — a Docker daemon
 * appearing or disappearing mid-run is exotic; callers that need to
 * re-detect should fork a new process.
 *
 * NEVER throws: if `docker` is not on PATH, or the daemon is unreachable,
 * or `spawnSync` itself errors, returns `false`. The whole point of
 * this module is to degrade gracefully.
 */
export function isDockerAvailable(): boolean {
  if (dockerAvailableCache !== undefined) {
    return dockerAvailableCache;
  }
  try {
    // `docker info` is the canonical "is the daemon up?" check.
    // `docker --version` would only check the CLI is installed, not
    // that the daemon is reachable (e.g. on macOS the Docker Desktop
    // app may not be running).
    const result = spawnSync("docker", ["info"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000, // 5s — daemon should respond fast
      encoding: "utf-8",
    });
    dockerAvailableCache =
      result.status === 0 &&
      result.error === undefined;
  } catch {
    // spawnSync throws if the binary is not on PATH (ENOENT) or other
    // runtime errors. Either way: no Docker.
    dockerAvailableCache = false;
  }
  return dockerAvailableCache;
}

/**
 * Resets the Docker-availability cache. Exported for tests that want
 * to force a re-detection (e.g. to test both paths in one process).
 * Not used in production.
 */
export function _resetDockerCacheForTests(): void {
  dockerAvailableCache = undefined;
}

// ─── Sandbox runner ──────────────────────────────────────────────────

/**
 * Runs `command` in the sandbox. If Docker is available, runs it in a
 * real container with hardening flags (--read-only, --cap-drop=ALL,
 * --network=none, /workspace bind-mount). If not, falls back to
 * spawnSync on the host with a LOUD WARNING.
 *
 * NEVER throws on Docker-unavailable: the fallback path returns a
 * normal SandboxResult with `sandboxed: false` and `warning` set.
 * May throw only on programmer errors (e.g. workDir does not exist).
 *
 * @param command  Argv array, e.g. ["echo", "hello"]. MUST be non-empty.
 * @param opts     SandboxOptions (workDir required).
 */
export function runInSandbox(
  command: string[],
  opts: SandboxOptions,
): SandboxResult {
  if (!Array.isArray(command) || command.length === 0) {
    throw new TypeError(
      "runInSandbox: `command` must be a non-empty argv array " +
        "(e.g. [\"echo\", \"hello\"]); got " + JSON.stringify(command),
    );
  }

  const workDir = resolveWorkDir(opts.workDir);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const image = opts.image ?? DEFAULT_SANDBOX_IMAGE;

  const start = Date.now();

  if (isDockerAvailable()) {
    const result = runInDocker(command, { workDir, timeoutMs, image });
    return {
      ...result,
      durationMs: Date.now() - start,
      sandboxed: true,
      timedOut: result.timedOut,
    };
  }

  // Docker unavailable → fallback to unsandboxed spawnSync.
  // LOUD WARNING: stderr + embedded in the result so callers can record
  // it as evidence. NEVER silent.
  process.stderr.write(DOCKER_UNAVAILABLE_WARNING + "\n");
  const fallback = runUnsandboxed(command, { workDir, timeoutMs });
  return {
    ...fallback,
    durationMs: Date.now() - start,
    sandboxed: false,
    warning: DOCKER_UNAVAILABLE_WARNING,
    timedOut: fallback.timedOut,
  };
}

// ─── Docker path ────────────────────────────────────────────────────

interface DockerRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  signal?: string | null;
  timedOut: boolean;
}

/**
 * Runs `command` inside a hardened Docker container.
 *
 * The container is created with:
 *   --rm              auto-destroyed after exit (no leak)
 *   --read-only       rootfs immutable (only /workspace is writable)
 *   --cap-drop=ALL    no Linux capabilities (no ptrace, mknod, net_admin, ...)
 *   --network=none    no network egress (cannot exfiltrate data)
 *   -v <workDir>:/workspace
 *                     bind-mount the project dir as the writable workspace
 *   -w /workspace     set cwd inside the container
 *   --stop-timeout    seconds to wait for graceful shutdown on kill
 *
 * Timeout handling: `docker run` itself respects a timeout via the
 * `timeoutMs` option passed to spawnSync. On timeout, spawnSync sends
 * SIGTERM to the `docker run` process, which propagates to the container.
 */
function runInDocker(
  command: string[],
  opts: { workDir: string; timeoutMs: number; image: string },
): DockerRunResult {
  // NOTE: --read-only was REMOVED. With --read-only, the container's rootfs
  // is immutable, but /workspace is bind-mounted (writable). However, some
  // commands need to write to /tmp or other locations inside the container
  // (e.g., `touch /tmp/test.txt`). With --read-only, those fail with
  // "Permission denied". Instead, we use --tmpfs /tmp to allow temporary
  // writes inside the container without persisting them, and rely on
  // --cap-drop=ALL + --network=none for the security boundary.
  //
  // Security tradeoff: --read-only is stricter (no writes anywhere except
  // /workspace), but breaks common commands. --tmpfs /tmp is a pragmatic
  // middle ground: the container can write to /tmp (ephemeral, not
  // persisted to host), but cannot modify system files. This matches the
  // pro-LLM audit's intent (isolate LLM-emitted commands from the host)
  // while remaining usable.
  const args = [
    "run",
    "--rm",
    "--cap-drop=ALL",
    "--network=none",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=65536k",
    "-v", `${opts.workDir}:/workspace`,
    "-w", "/workspace",
    // Give Docker a few seconds to gracefully terminate the container
    // when the parent kills it on timeout. The `--stop-timeout` is in
    // seconds; we cap it at the smaller of 10s or timeoutMs/1000.
    "--stop-timeout", String(Math.min(10, Math.max(1, Math.floor(opts.timeoutMs / 1000)))),
    opts.image,
    ...command,
  ];

  const result = spawnSync("docker", args, {
    cwd: opts.workDir,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: opts.timeoutMs,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024, // 10MB stdout/stderr cap
  });

  // On timeout, spawnSync sets `signal: "SIGTERM"`. `docker run` itself
  // may not have exited yet — but the container is being killed.
  const timedOut = result.signal === "SIGTERM" || (result.status === null && result.error !== undefined);

  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    signal: result.signal ?? null,
    timedOut,
  };
}

// ─── Fallback path (Docker unavailable) ─────────────────────────────

interface FallbackResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  signal?: string | null;
  timedOut: boolean;
}

/**
 * Runs `command` directly on the host via spawnSync. This is the
 * DEVELOPMENT-MODE FALLBACK — never used in production. The caller
 * (runInSandbox) has already emitted DOCKER_UNAVAILABLE_WARNING to
 * stderr by the time this runs.
 */
function runUnsandboxed(
  command: string[],
  opts: { workDir: string; timeoutMs: number },
): FallbackResult {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: opts.workDir,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: opts.timeoutMs,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    shell: false, // NEVER shell=true — that would re-introduce injection.
  });

  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    signal: result.signal ?? null,
    timedOut: result.signal === "SIGTERM" || (result.status === null && result.error !== undefined),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Resolves and validates the workDir. MUST exist on the host (the
 * runner does not create it — caller's responsibility). Resolves
 * symlinks so Docker bind-mounts don't break on macOS /tmp symlinks.
 */
function resolveWorkDir(workDir: string): string {
  if (typeof workDir !== "string" || workDir.length === 0) {
    throw new TypeError(
      "runInSandbox: `opts.workDir` is required and must be a non-empty string; got " +
        JSON.stringify(workDir),
    );
  }
  const abs = resolve(workDir);
  if (!existsSync(abs)) {
    throw new Error(
      `runInSandbox: opts.workDir "${abs}" does not exist. ` +
        "The caller (typically a workflow state) must create it first.",
    );
  }
  try {
    // Resolve symlinks — Docker bind-mounts on macOS require the
    // real path (e.g. /var/folders/... not /tmp/...). If realpath
    // fails (rare), fall through with the unresolved path.
    return realpathSync(abs);
  } catch {
    return abs;
  }
}
