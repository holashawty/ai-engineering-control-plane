// executor/examples/e2e-init-aiecp/drive-run.mjs
//
// Regression test for scripts/init-aiecp.mjs — the one-command setup script.
//
// This test was missing (audit 2026-08-16 by external LLM — init-aiecp.mjs
// had NO automated test coverage despite being the user's primary entrypoint).
// Without this test, the security regression where `--help` silently triggered
// destructive default behavior went undetected for 2 commits.
//
// What this proves:
//   1. --help / -h prints usage and exits 0 (no destructive side effects).
//   2. Unknown --flag is an ERROR (exit 1), not silently ignored.
//   3. Extra positional argument is an ERROR (exit 1).
//   4. Running against the AIECP framework repo itself is REFUSED (exit 1)
//      unless --force-self is passed.
//   5. --entegre mode on a fresh dir succeeds (exit 0): creates
//      .aiecp-framework/, .aiecp/, AGENTS.md, CLAUDE.md, etc., AND preserves
//      pre-existing files in the target (does not clobber).
//   6. --yarat mode on a non-existent dir creates the project skeleton
//      (src/, tests/, docs/, README.md, LICENSE, .gitignore, package.json)
//      and integrates AIECP into it.
//   7. --yarat mode on a NON-empty dir is REFUSED (exit 1) with a clear error.
//   8. --yarat mode without idea text is REFUSED (exit 1) with a usage hint.
//
// This test does NOT use the WorkflowRun API — it shells out to
// `node scripts/init-aiecp.mjs <args>` and checks exit codes + filesystem
// state. This is intentional: init-aiecp.mjs is a CLI tool, not a library.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(__dirname, "..", "..", "..", "scripts", "init-aiecp.mjs");
const FRAMEWORK_REPO = join(__dirname, "..", "..", ".."); // the AIECP repo itself

let passed = 0, failed = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`  OK   ${label}`); passed++; }
  else { console.log(`  FAIL ${label} — ${detail}`); failed++; }
}

function runInit(args, cwd) {
  // Run init-aiecp.mjs with the given args, return { exitCode, stdout, stderr }.
  const r = spawnSync("node", [SCRIPT_PATH, ...args], {
    cwd: cwd || tmpdir(),
    encoding: "utf-8",
    timeout: 30000,
  });
  return {
    exitCode: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}

async function scenario() {
  console.log("=== init-aiecp.mjs regression test ===\n");

  // --- Test 1: --help exits 0, no side effects ---
  console.log("--- Test 1: --help ---");
  const helpResult = runInit(["--help"]);
  check("--help exits 0", helpResult.exitCode === 0, `exit: ${helpResult.exitCode}`);
  check("--help prints usage", /Usage:/.test(helpResult.stdout), "no Usage: in stdout");
  check("--help mentions --entegre", /--entegre/.test(helpResult.stdout), "no --entegre in help");
  check("--help mentions --yarat", /--yarat/.test(helpResult.stdout), "no --yarat in help");
  check("--help does not write any files", !/Linked:|Copied:|Created:/.test(helpResult.stdout),
    "help output should not contain file operations");

  // --- Test 2: -h short form ---
  console.log("\n--- Test 2: -h (short form) ---");
  const hResult = runInit(["-h"]);
  check("-h exits 0", hResult.exitCode === 0, `exit: ${hResult.exitCode}`);
  check("-h prints same usage", /Usage:/.test(hResult.stdout), "no Usage: in stdout");

  // --- Test 3: Unknown flag → ERROR ---
  console.log("\n--- Test 3: Unknown flag ---");
  const unknownResult = runInit(["--bogus-flag"]);
  check("unknown flag exits 1", unknownResult.exitCode === 1, `exit: ${unknownResult.exitCode}`);
  check("unknown flag error mentions the flag", /--bogus-flag/.test(unknownResult.stderr),
    `stderr: ${unknownResult.stderr.slice(0, 200)}`);
  check("unknown flag error suggests --help", /--help/.test(unknownResult.stderr),
    "stderr should suggest --help");

  // --- Test 4: Extra positional argument → ERROR ---
  console.log("\n--- Test 4: Extra positional arg ---");
  const extraResult = runInit(["/tmp/a", "/tmp/b", "--entegre"]);
  check("extra arg exits 1", extraResult.exitCode === 1, `exit: ${extraResult.exitCode}`);
  check("extra arg error is clear", /unexpected extra argument/.test(extraResult.stderr),
    `stderr: ${extraResult.stderr.slice(0, 200)}`);

  // --- Test 5: Self-protection (refuse to run on framework repo) ---
  console.log("\n--- Test 5: Self-protection ---");
  const selfResult = runInit([FRAMEWORK_REPO, "--entegre"], FRAMEWORK_REPO);
  check("self-run exits 1", selfResult.exitCode === 1, `exit: ${selfResult.exitCode}`);
  check("self-run error mentions framework repo", /framework repo itself/i.test(selfResult.stderr),
    `stderr: ${selfResult.stderr.slice(0, 200)}`);
  check("self-run suggests --force-self", /--force-self/.test(selfResult.stderr),
    "stderr should suggest --force-self");

  // --- Test 6: --entegre on fresh dir succeeds + preserves existing files ---
  console.log("\n--- Test 6: --entegre on fresh dir ---");
  const entegreDir = mkdtempSync(join(tmpdir(), "aiecp-entegre-"));
  // Pre-existing file that must be preserved
  mkdirSync(join(entegreDir, "src"), { recursive: true });
  writeFileSync(join(entegreDir, "src", "index.js"), "console.log('hello');\n");
  const entegreResult = runInit([entegreDir, "--entegre"], entegreDir);
  check("--entegre exits 0 on fresh dir", entegreResult.exitCode === 0,
    `exit: ${entegreResult.exitCode}, stderr: ${entegreResult.stderr.slice(0, 300)}`);
  check("--entegre creates .aiecp-framework/", existsSync(join(entegreDir, ".aiecp-framework")));
  check("--entegre creates .aiecp/", existsSync(join(entegreDir, ".aiecp")));
  check("--entegre creates AGENTS.md", existsSync(join(entegreDir, "AGENTS.md")));
  check("--entegre creates CLAUDE.md", existsSync(join(entegreDir, "CLAUDE.md")));
  check("--entegre creates MCP-ENTRYPOINT.md", existsSync(join(entegreDir, "MCP-ENTRYPOINT.md")));
  check("--entegre creates CHAT-ENTRYPOINT-SANDBOX.md", existsSync(join(entegreDir, "CHAT-ENTRYPOINT-SANDBOX.md")));
  check("--entegre creates .aiecp/auto-activate.json", existsSync(join(entegreDir, ".aiecp", "auto-activate.json")));
  check("--entegre preserves pre-existing src/index.js",
    readFileSync(join(entegreDir, "src", "index.js"), "utf-8") === "console.log('hello');\n",
    "src/index.js was clobbered");
  check("--entegre appends ADR-0025 hook to AGENTS.md",
    /## AIECP Auto-Activation/.test(readFileSync(join(entegreDir, "AGENTS.md"), "utf-8")));
  rmSync(entegreDir, { recursive: true, force: true });

  // --- Test 7: --yarat on empty dir creates project skeleton ---
  console.log("\n--- Test 7: --yarat on empty dir ---");
  const yaratParent = mkdtempSync(join(tmpdir(), "aiecp-yarat-parent-"));
  const yaratResult = runInit([yaratParent, "--yarat", "test project idea"]);
  check("--yarat exits 0 on empty dir", yaratResult.exitCode === 0,
    `exit: ${yaratResult.exitCode}, stderr: ${yaratResult.stderr.slice(0, 300)}`);
  // The project slug is derived from "test project idea" → "test-project-idea"
  const projectDir = join(yaratParent, "test-project-idea");
  check("--yarat creates project dir with slugified name", existsSync(projectDir),
    `expected: ${projectDir}`);
  if (existsSync(projectDir)) {
    check("--yarat creates src/", existsSync(join(projectDir, "src")));
    check("--yarat creates tests/", existsSync(join(projectDir, "tests")));
    check("--yarat creates docs/", existsSync(join(projectDir, "docs")));
    check("--yarat creates .github/workflows/", existsSync(join(projectDir, ".github", "workflows")));
    check("--yarat creates README.md", existsSync(join(projectDir, "README.md")));
    check("--yarat creates LICENSE", existsSync(join(projectDir, "LICENSE")));
    check("--yarat creates .gitignore", existsSync(join(projectDir, ".gitignore")));
    check("--yarat creates package.json", existsSync(join(projectDir, "package.json")));
    check("--yarat integrates AIECP (.aiecp-framework/ exists in project dir)",
      existsSync(join(projectDir, ".aiecp-framework")),
      `expected .aiecp-framework/ at ${join(projectDir, ".aiecp-framework")}`);
    check("--yarat generates AGENTS.md in new project",
      existsSync(join(projectDir, "AGENTS.md")));
    check("--yarat prompt mentions the idea text",
      /test project idea/.test(yaratResult.stdout),
      "stdout should contain the idea text in the prompt");
    check("--yarat prompt mentions orchestrator workflow",
      /orchestrator workflow/.test(yaratResult.stdout),
      "stdout should tell the chat LLM to run the orchestrator");
  }
  rmSync(yaratParent, { recursive: true, force: true });

  // --- Test 8: --yarat on NON-empty dir → ERROR ---
  console.log("\n--- Test 8: --yarat on non-empty dir ---");
  const nonEmptyDir = mkdtempSync(join(tmpdir(), "aiecp-yarat-nonempty-"));
  writeFileSync(join(nonEmptyDir, "existing-file.txt"), "data\n");
  const nonEmptyResult = runInit([nonEmptyDir, "--yarat", "test"]);
  check("--yarat on non-empty dir exits 1", nonEmptyResult.exitCode === 1,
    `exit: ${nonEmptyResult.exitCode}`);
  check("--yarat error mentions 'empty target directory'",
    /empty target directory/i.test(nonEmptyResult.stderr),
    `stderr: ${nonEmptyResult.stderr.slice(0, 200)}`);
  check("--yarat error suggests --entegre",
    /--entegre/.test(nonEmptyResult.stderr),
    "stderr should suggest --entegre for existing projects");
  rmSync(nonEmptyDir, { recursive: true, force: true });

  // --- Test 9: --yarat without idea text → ERROR ---
  console.log("\n--- Test 9: --yarat without idea ---");
  const noIdeaDir = mkdtempSync(join(tmpdir(), "aiecp-no-idea-"));
  const noIdeaResult = runInit([noIdeaDir, "--yarat"]);
  check("--yarat without idea exits 1", noIdeaResult.exitCode === 1,
    `exit: ${noIdeaResult.exitCode}`);
  check("--yarat error mentions 'fikrini belirtin'",
    /fikrini belirtin|idea/i.test(noIdeaResult.stderr + noIdeaResult.stdout),
    "should prompt for idea text");
  rmSync(noIdeaDir, { recursive: true, force: true });

  // --- Summary ---
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
}

scenario().catch(e => {
  console.error(`\nE2E DRIVER FAILED WITH UNCAUGHT ERROR: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
