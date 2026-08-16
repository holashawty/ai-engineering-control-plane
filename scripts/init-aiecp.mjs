#!/usr/bin/env node
// init-aiecp.mjs — One-command AIECP setup for any project.
//
// Usage:
//   node init-aiecp.mjs [path] --entegre          # integrate into existing project (default)
//   node init-aiecp.mjs [path] --yarat "fikir"    # create greenfield project from idea
//   node init-aiecp.mjs --help                     # show usage
//
// Modes:
//   --entegre (default): Integrate AIECP into an EXISTING project.
//     1. Copies/symlinks AIECP framework to .aiecp-framework/
//     2. Runs discovery → .aiecp/project-intelligence.json
//     3. Generates entrypoints: AGENTS.md, CLAUDE.md, CHAT-ENTRYPOINT-SANDBOX.md, MCP-ENTRYPOINT.md
//     4. Creates .aiecp/auto-activate.json + appends ADR-0025 hook to AGENTS.md
//
//   --yarat "fikir": Create a NEW greenfield project from the idea.
//     1. Runs project-scaffolding skill inline (creates src/tests/docs/ + README/LICENSE/.gitignore/package.json)
//     2. Runs the full --entegre flow on the new skeleton
//     3. Prints a ready-to-paste prompt for the chat LLM to drive the orchestrator
//        workflow (requirements → planning → architecture → ux → implementation → testing → review → release)
//
// If no mode flag is given, defaults to --entegre (there is NO interactive
// mode — the script does not prompt; it runs to completion).
//
// SECURITY (audit 2026-08-16):
//   - Unknown --flags are ERRORS (exit 1), not silently ignored.
//   - Refuses to run against the AIECP framework repo itself unless --force-self.
//   - --help / -h prints usage and exits 0.

import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, symlinkSync, cpSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Argument parsing — strict mode (audit 2026-08-16 by external LLM).
//
// SECURITY: Previously, unknown flags (like --help) were silently ignored,
// targetPath fell back to process.cwd(), and the script proceeded with the
// default --entegre flow ON THE CURRENT DIRECTORY without confirmation.
// This meant `node init-aiecp.mjs --help` would silently start copying
// framework files into the AIECP repo itself — a destructive default.
//
// Now: --help prints usage and exits. Unknown --flags are ERRORS, not
// silently ignored. The script also refuses to run against its own repo
// (the AIECP framework repo itself) unless --force-self is passed, to
// prevent accidental self-modification.
// ---------------------------------------------------------------------------
const HELP_TEXT = `Usage:
  node init-aiecp.mjs [path] --entegre
    Integrate AIECP into an EXISTING project at [path].
    [path] defaults to current directory if omitted.
    Runs: framework setup → discovery → entrypoints → auto-activate.

  node init-aiecp.mjs [path] --yarat "fikir"
    Create a NEW greenfield project at [path] from the idea.
    Runs: project-scaffolding → integrate flow → prints chat LLM prompt.
    [path] must be empty or non-existent.

  node init-aiecp.mjs --help
    Print this message and exit.

Flags:
  --entegre   Integrate mode (default if no flag given)
  --yarat     Create mode (requires idea text as next argument)
  --help      Show this help
  --force-self  Allow running against the AIECP framework repo itself
                (DANGEROUS — only for framework development/testing)

Exit codes:
  0  success
  1  user error (unknown flag, missing idea, non-empty target for --yarat)
  2  harness error (framework source not found, permission denied)`;

// Parse args: collect positional [path] and recognized flags.
const rawArgs = process.argv.slice(2);
let mode = "entegre"; // default if no --yarat given
let ideaText = null;
let targetPath = null;
let forceSelf = false;

const KNOWN_FLAGS = new Set(["--entegre", "--yarat", "--help", "--force-self"]);

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];

  if (arg === "--help" || arg === "-h") {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (arg === "--force-self") {
    forceSelf = true;
    continue;
  }

  if (arg === "--yarat") {
    mode = "yarat";
    const next = rawArgs[i + 1];
    if (next && !next.startsWith("--")) {
      ideaText = next;
      i++; // consume the idea text
    }
    // If no idea provided, we'll prompt the user later (not an error here)
    continue;
  }

  if (arg === "--entegre") {
    mode = "entegre";
    continue;
  }

  // Unknown --flag → ERROR, not silent ignore (audit finding)
  if (arg.startsWith("--")) {
    process.stderr.write(`ERROR: unknown flag "${arg}".\n`);
    process.stderr.write(`Known flags: ${[...KNOWN_FLAGS].join(", ")}\n`);
    process.stderr.write(`Run "node init-aiecp.mjs --help" for usage.\n`);
    process.exit(1);
  }

  // Positional argument → treat as target path
  if (!targetPath) {
    targetPath = resolve(arg);
  } else {
    process.stderr.write(`ERROR: unexpected extra argument "${arg}".\n`);
    process.stderr.write(`Only one positional [path] argument is accepted.\n`);
    process.stderr.write(`Run "node init-aiecp.mjs --help" for usage.\n`);
    process.exit(1);
  }
}

// Default target: current working directory (only if not --yarat without path)
if (!targetPath) {
  targetPath = process.cwd();
}

// SECURITY: refuse to run against the AIECP framework repo itself unless
// --force-self is passed. This prevents accidental self-modification when
// a developer runs `npm run init` from within the AIECP repo (the npm
// script shadows npm's built-in `npm init`).
const isFrameworkRepoSelf = existsSync(join(targetPath, "workflows", "bug-report.sm.yaml"))
  && existsSync(join(targetPath, "skills", "systematic-debugging", "SKILL.md"))
  && existsSync(join(targetPath, "adapters", "agents", "src", "sync-entrypoints.ts"));

if (isFrameworkRepoSelf && !forceSelf) {
  process.stderr.write("ERROR: refusing to run against the AIECP framework repo itself.\n");
  process.stderr.write(`Target ${targetPath} appears to be the AIECP framework repository.\n`);
  process.stderr.write("Running init here would symlink the framework to itself, which is\n");
  process.stderr.write("almost certainly not what you want.\n\n");
  process.stderr.write("If you are testing init-aiecp.mjs and understand the risk, pass --force-self:\n");
  process.stderr.write(`  node scripts/init-aiecp.mjs ${targetPath} --entegre --force-self\n`);
  process.stderr.write("\nOtherwise, specify a different target path:\n");
  process.stderr.write("  node scripts/init-aiecp.mjs /path/to/your/project --entegre\n");
  process.exit(1);
}

console.log("=== AIECP Init ===");
console.log(`Target: ${targetPath}`);
console.log(`Mode:   ${mode}${ideaText ? ` ("${ideaText}")` : ""}`);
if (forceSelf) console.log("NOTE:    --force-self is set — running against framework repo (testing only)");
console.log("");

// Step 1: Check if AIECP is already fully installed (only short-circuits
// in entegre mode AND all critical components are present).
// Previously this check only looked for project-intelligence.json, which
// meant a partially-initialized install (entrypoints missing, framework
// broken) would be reported as "already initialized" — audit finding 2.5.
// Now: check ALL critical components before claiming "already initialized".
//
// NOTE: aiecpDir and frameworkDir are declared with `let` (not `const`)
// because --yarat mode reassigns targetPath below (to projectDir), and
// these paths must follow. Declaring them as const here would freeze them
// at the pre-yarat targetPath, causing .aiecp-framework to be written to
// the wrong directory (audit 2026-08-16: --yarat mode was writing framework
// to parent dir instead of project dir).
let aiecpDir = join(targetPath, ".aiecp");
let frameworkDir = join(targetPath, ".aiecp-framework");

if (mode === "entegre") {
  const piExists = existsSync(join(aiecpDir, "project-intelligence.json"));
  const frameworkExists = existsSync(join(frameworkDir, "workflows", "bug-report.sm.yaml"));
  const agentsMdExists = existsSync(join(targetPath, "AGENTS.md"));
  const autoActivateExists = existsSync(join(aiecpDir, "auto-activate.json"));

  if (piExists && frameworkExists && agentsMdExists && autoActivateExists) {
    console.log("AIECP is fully initialized (project-intelligence + framework + entrypoints + auto-activate).");
    console.log("To re-run discovery: node .aiecp-framework/discovery/cli/dist/cli.js .");
    console.log("To force full re-initialization: rm -rf .aiecp .aiecp-framework AGENTS.md CLAUDE.md");
    process.exit(0);
  }

  if (piExists && !frameworkExists) {
    console.log("WARNING: .aiecp/project-intelligence.json exists but .aiecp-framework/ is missing.");
    console.log("This is a partially-initialized install — continuing to complete the setup...");
    // Don't exit; fall through to the integration flow
  } else if (piExists && !agentsMdExists) {
    console.log("WARNING: project-intelligence exists but AGENTS.md is missing.");
    console.log("This is a partially-initialized install — continuing to complete the setup...");
    // Don't exit; fall through to regenerate entrypoints
  } else if (piExists && !autoActivateExists) {
    console.log("NOTE: project-intelligence exists but .aiecp/auto-activate.json is missing.");
    console.log("Continuing to complete the setup (will re-add auto-activate marker)...");
    // Don't exit
  }
}

if (mode === "yarat") {
  // --yarat mode: greenfield project creation
  // 1. If the target directory doesn't exist, create it (mkdir -p).
  //    If it exists but has files (other than .git, README, LICENSE),
  //    refuse — --yarat is for empty / non-existent dirs only.
  if (!existsSync(targetPath)) {
    mkdirSync(targetPath, { recursive: true });
  }
  const existingFiles = readdirSync(targetPath).filter(f =>
    !f.startsWith(".") && !["README.md", "LICENSE", "package.json"].includes(f)
  );
  if (existingFiles.length > 0) {
    console.error(`ERROR: --yarat mode requires an empty target directory.`);
    console.error(`Found existing files: ${existingFiles.slice(0, 5).join(", ")}${existingFiles.length > 5 ? ` (+${existingFiles.length - 5} more)` : ""}`);
    console.error(`Use --entegre for existing projects: node init-aiecp.mjs ${targetPath} --entegre`);
    process.exit(1);
  }

  // 2. If no idea provided, prompt interactively
  if (!ideaText) {
    console.log("Yarat modu: lütfen proje fikrini belirtin.");
    console.log("Örnek: --yarat \"e-ticaret API'si, Stripe ile ödeme alacak\"");
    console.log("");
    console.log("Komutu yeniden çalıştırın: node init-aiecp.mjs " + targetPath + " --yarat \"fikriniz\"");
    process.exit(1);
  }

  // 3. Run the project-scaffolding skill logic (inline, since we can't spawn an LLM)
  //    This creates the repo skeleton per skills/project-scaffolding/SKILL.md:
  //    - src/, tests/, docs/, .github/workflows/ directories
  //    - README.md, LICENSE (MIT), .gitignore, package.json (or requirements.txt)
  //    - .aiecp-framework/ (the AIECP framework itself, via the normal integrate flow below)
  console.log("Step 1/5: Creating project skeleton (project-scaffolding skill)...");
  const projectSlug = ideaText.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join("-");
  const projectDir = join(targetPath, projectSlug);
  mkdirSync(projectDir, { recursive: true });
  for (const d of ["src", "tests", "docs", ".github/workflows"]) {
    mkdirSync(join(projectDir, d), { recursive: true });
  }
  writeFileSync(join(projectDir, "README.md"), `# ${ideaText}\n\nProject initialized via AIECP --yarat mode on ${new Date().toISOString()}.\nSee .aiecp-framework/ for the AIECP framework.\n`);
  writeFileSync(join(projectDir, "LICENSE"), "MIT License\n\nCopyright (c) 2026\n");
  writeFileSync(join(projectDir, ".gitignore"), "node_modules/\ndist/\n*.log\n.aiecp/\n");
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({
    name: projectSlug,
    version: "0.1.0",
    description: ideaText,
    license: "MIT",
    scripts: { test: "echo 'no tests yet'" },
  }, null, 2) + "\n");
  console.log(`  Created: ${projectSlug}/`);
  console.log(`    src/, tests/, docs/, .github/workflows/`);
  console.log(`    README.md, LICENSE, .gitignore, package.json`);

  // 4. Re-target the integrate flow to the new project dir
  targetPath = projectDir;
  // CRITICAL: re-derive aiecpDir and frameworkDir from the NEW targetPath.
  // Previously these were computed once at the top (line 178-179) from the
  // ORIGINAL targetPath (the parent dir), so .aiecp-framework/ was written
  // to the parent instead of the project dir. This bug was caught by the
  // e2e-init-aiecp regression test (audit 2026-08-16).
  aiecpDir = join(targetPath, ".aiecp");
  frameworkDir = join(targetPath, ".aiecp-framework");
  console.log("");
  console.log(`Step 2/5: Integrating AIECP into ${projectSlug}/...`);
  // Continue with the normal integrate flow below (no early exit)
}

// Step 2: Find AIECP framework source (this repo or a parent)
let frameworkSource = __dirname;
// If running from within the AIECP repo itself, the framework IS the repo
if (!existsSync(join(frameworkSource, "workflows", "bug-report.sm.yaml"))) {
  // Try parent directories
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    dir = dirname(dir);
    if (existsSync(join(dir, "workflows", "bug-report.sm.yaml"))) {
      frameworkSource = dir;
      break;
    }
  }
  if (!existsSync(join(frameworkSource, "workflows", "bug-report.sm.yaml"))) {
    console.error("ERROR: Could not find AIECP framework source.");
    console.error("Run this script from within the AIECP repository, or specify the path:");
    console.error("  node /path/to/ai-engineering-control-plane/scripts/init-aiecp.mjs /path/to/your/project");
    process.exit(1);
  }
}

console.log(`Framework source: ${frameworkSource}`);

// Step 3: Create .aiecp-framework/ with symlinks or copies
console.log("");
console.log("Step 1/4: Setting up framework...");

// Instead of copying everything, create a marker + reference
// The key files that need to be in the target repo:
// NOTE: "agents" is included because write-entrypoints.js (via
// loadCanonicalSources in sync-entrypoints.ts) looks for
// <frameworkDir>/agents/AGENTS.md as the canonical source.
// Without it, init-aiecp.mjs fails at "Step 3: Generating agent
// entrypoints" with "canonical entrypoint not found" — see audit
// finding by end-user onboarding subagent (2026-08-16).
const essentialDirs = ["workflows", "skills", "constitution", "evidence", "memory", "discovery", "executor", "adapters", "agents", "specs", "scripts"];
const essentialFiles = [
  "AGENTS.md", "CHAT-ENTRYPOINT.md", "CHAT-ENTRYPOINT-SANDBOX.md",
  "MCP-ENTRYPOINT.md", "NOTICE", "DECISIONS.md", "STATUS.md", "TASKS.md", "DELIVERABLES.md",
  "package.json", ".gitattributes", "SECURITY.md", "LICENSE", "CONTRIBUTING.md",
  "docs/evidence-model.md", "docs/architecture.md", "docs/workflow-model.md",
  "docs/memory-model.md", "docs/portability.md", "docs/security-model.md",
  "docs/evaluation-strategy.md", "docs/evaluations/evaluation-strategy.md",
  "docs/research-upstream-integration.md",
  "docs/archive/vision-and-roadmap.md",
  "docs/archive/quality-audit.md",
  "docs/archive/controller-audit-and-roadmap-2026.md",
  "docs/archive/implementation-roadmap.md",
];

mkdirSync(frameworkDir, { recursive: true });

// Create symlinks for directories using Node-native fs API (Windows-portable).
// Falls back to recursive copy if symlink fails (Windows without admin perms,
// or filesystem that doesn't support symlinks).
for (const dir of essentialDirs) {
  const src = join(frameworkSource, dir);
  const dst = join(frameworkDir, dir);
  if (existsSync(src)) {
    let linked = false;
    try {
      symlinkSync(src, dst, "dir");
      console.log(`  Linked: ${dir}/`);
      linked = true;
    } catch (e) {
      // Symlink failed (Windows without admin, or FS doesn't support).
      // Fall back to recursive copy via Node native API (cross-platform).
    }
    if (!linked) {
      try {
        cpSync(src, dst, { recursive: true });
        console.log(`  Copied: ${dir}/`);
      } catch (e) {
        process.stderr.write(`  WARNING: could not link OR copy ${dir}/: ${e.message}\n`);
      }
    }
  }
}

// Copy essential files (with error reporting — previously silent)
let filesCopied = 0, filesFailed = 0;
for (const file of essentialFiles) {
  const src = join(frameworkSource, file);
  const dst = join(frameworkDir, file);
  if (existsSync(src)) {
    try {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
      filesCopied++;
    } catch (e) {
      process.stderr.write(`  WARNING: could not copy ${file}: ${e.message}\n`);
      filesFailed++;
    }
  }
}
console.log(`  Framework files: ${filesCopied} copied, ${filesFailed} failed.`);

console.log("  Framework ready.");

// Step 4: Run discovery
console.log("");
console.log("Step 2/4: Running project discovery...");
const discoveryPath = join(frameworkDir, "discovery", "cli", "dist", "cli.js");
if (existsSync(discoveryPath)) {
  try {
    execSync(`node "${discoveryPath}" "${targetPath}"`, { stdio: "inherit", cwd: targetPath });
    console.log("  Discovery complete: .aiecp/project-intelligence.json written.");
  } catch (e) {
    console.log("  Discovery failed (non-critical): " + e.message);
    console.log("  You can run it manually: node .aiecp-framework/discovery/cli/dist/cli.js .");
  }
} else {
  console.log("  Discovery CLI not found at expected path. Skipping.");
  console.log("  Run manually: node .aiecp-framework/discovery/cli/dist/cli.js .");
}

// Step 5: Generate entrypoints
console.log("");
console.log("Step 3/4: Generating agent entrypoints...");
const writeEntrypointsPath = join(frameworkDir, "adapters", "agents", "dist", "bin", "write-entrypoints.js");
if (existsSync(writeEntrypointsPath)) {
  try {
    execSync(`node "${writeEntrypointsPath}" "${frameworkDir}" "${targetPath}"`, { stdio: "inherit", cwd: targetPath });
    console.log("  Entrypoints generated: AGENTS.md, CLAUDE.md");
  } catch (e) {
    // This IS critical — without entrypoints, ADR-0025 auto-activation hook
    // cannot be appended (because the hook targets AGENTS.md which is
    // generated by this step). Surface as ERROR, not "non-critical".
    process.stderr.write(`  ERROR: entrypoint generation failed: ${e.message}\n`);
    process.stderr.write(`  Run manually: node .aiecp-framework/adapters/agents/dist/bin/write-entrypoints.js .aiecp-framework .\n`);
    process.stderr.write(`  Without entrypoints, the ADR-0025 auto-activation hook will NOT be appended to AGENTS.md.\n`);
  }
} else {
  process.stderr.write(`  WARNING: write-entrypoints.js not found at ${writeEntrypointsPath}\n`);
  process.stderr.write(`  Run: cd .aiecp-framework/adapters/agents && npm install && npm run build\n`);
}

// Step 6: Create auto-activate marker
console.log("");
console.log("Step 4/4: Creating auto-activate marker...");
mkdirSync(aiecpDir, { recursive: true });
const autoActivate = {
  activated_at: new Date().toISOString(),
  framework_path: ".aiecp-framework",
  version: "1.0.0",
  entrypoints: ["AGENTS.md", "CLAUDE.md"],
  message: "AIECP is active. Any AI agent reading AGENTS.md or CLAUDE.md will follow AIECP discipline."
};
writeFileSync(join(aiecpDir, "auto-activate.json"), JSON.stringify(autoActivate, null, 2));

// Also add auto-activation hook to AGENTS.md if it exists
const agentsMdPath = join(targetPath, "AGENTS.md");
if (existsSync(agentsMdPath)) {
  let agentsContent = readFileSync(agentsMdPath, "utf-8");
  if (!agentsContent.includes("## AIECP Auto-Activation")) {
    const hook = `

## AIECP Auto-Activation

This project has AIECP installed (see \`.aiecp/auto-activate.json\`).
If you are an AI agent reading this file, you are operating under AIECP discipline:
1. Follow the workflows in \`.aiecp-framework/workflows/\` for structured task execution.
2. Emit evidence per \`.aiecp-framework/evidence/schema/\` for every decision.
3. Respect safety gates (broad-refactor requires confirmation).
4. Use tools before memory (constitution §8).
5. When stuck, use \`skills/diverse-thinking/SKILL.md\`.

Read \`.aiecp-framework/CHAT-ENTRYPOINT-SANDBOX.md\` (if you have code execution)
or \`.aiecp-framework/CHAT-ENTRYPOINT.md\` (if you don't) for the full protocol.
`;
    agentsContent += hook;
    writeFileSync(agentsMdPath, agentsContent);
    console.log("  Auto-activation hook added to AGENTS.md");
  }
}

console.log("");
console.log("=== AIECP is ready ===");
console.log("");

if (mode === "yarat") {
  console.log("Next steps (--yarat mode):");
  const relPath = targetPath.replace(process.cwd(), ".") || targetPath;
  console.log(`  1. cd ${relPath}`);
  console.log("  2. git init && git add -A && git commit -m 'initial scaffold'");
  console.log("  3. Zip the project folder and give it to a chat LLM (ChatGPT / Claude / GLM)");
  console.log("  4. Use this prompt:");
  console.log("");
  console.log("     ───────────────────────────────────────────────────────────────────");
  console.log("     Read CHAT-ENTRYPOINT-SANDBOX.md first.");
  console.log("");
  console.log(`     Project idea: ${ideaText}`);
  console.log("");
  console.log("     This is a --yarat (greenfield) project. Run the orchestrator workflow");
  console.log("     with project_scale: large. The full planning chain is required:");
  console.log("     requirements-gathering → project-planning → architecture-design →");
  console.log("     ux-design → feature-request → testing → code-review → release.");
  console.log("");
  console.log("     Emit evidence per evidence/schema/ at each state. Respect safety");
  console.log("     gates (broad-refactor requires aiecp:confirm). When stuck, use");
  console.log("     skills/diverse-thinking/SKILL.md.");
  console.log("     ───────────────────────────────────────────────────────────────────");
  console.log("");
  console.log("  5. The chat LLM will drive the orchestrator and produce the project");
  console.log("     from your idea, following AIECP engineering discipline.");
} else {
  console.log("Next steps (--entegre mode):");
  console.log("  1. Commit the new files: git add .aiecp .aiecp-framework AGENTS.md CLAUDE.md");
  console.log("  2. Any AI agent opening this repo will now follow AIECP discipline.");
  console.log("  3. For chat LLMs: zip the repo and tell them 'Read CHAT-ENTRYPOINT-SANDBOX.md first'");
}
console.log("");
console.log("For CLI/IDE agents:");
console.log("  - AGENTS.md and CLAUDE.md are auto-generated entrypoints");
console.log("  - They contain the full AIECP protocol + skill catalog");
console.log("");
console.log("For chat LLMs:");
console.log("  - Upload the repo as a zip");
console.log("  - Say: 'Read CHAT-ENTRYPOINT-SANDBOX.md first, then [your task]'");
console.log("");
