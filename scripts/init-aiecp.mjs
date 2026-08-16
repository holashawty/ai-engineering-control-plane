#!/usr/bin/env node
// init-aiecp.mjs — One-command AIECP setup for any project.
//
// Usage:
//   npx aiecp-init                    # auto-detect: current dir
//   node init-aiecp.mjs /path/to/repo # explicit path
//
// What it does:
//   1. Copies AIECP framework files to .aiecp-framework/ in the target repo
//   2. Runs discovery: node .aiecp-framework/discovery/cli/dist/cli.js .
//   3. Generates entrypoints: AGENTS.md, CLAUDE.md, CHAT-ENTRYPOINT*.md
//   4. Creates .aiecp/auto-activate marker file
//   5. Prints "AIECP is ready" with next steps

import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, symlinkSync, cpSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const targetPath = process.argv[2] ? resolve(process.argv[2]) : process.cwd();

console.log("=== AIECP Init ===");
console.log(`Target: ${targetPath}`);
console.log("");

// Step 1: Check if AIECP is already installed
const aiecpDir = join(targetPath, ".aiecp");
const frameworkDir = join(targetPath, ".aiecp-framework");

if (existsSync(join(aiecpDir, "project-intelligence.json"))) {
  console.log("AIECP is already initialized (found .aiecp/project-intelligence.json).");
  console.log("To re-run discovery: node .aiecp-framework/discovery/cli/dist/cli.js .");
  process.exit(0);
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
  "docs/research-upstream-integration.md", "docs/vision-and-roadmap.md",
  "docs/quality-audit.md", "docs/controller-audit-and-roadmap-2026.md",
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
console.log("Next steps:");
console.log("  1. Commit the new files: git add .aiecp .aiecp-framework AGENTS.md CLAUDE.md");
console.log("  2. Any AI agent opening this repo will now follow AIECP discipline.");
console.log("  3. For chat LLMs: zip the repo and tell them 'Read CHAT-ENTRYPOINT-SANDBOX.md first'");
console.log("");
console.log("For CLI/IDE agents:");
console.log("  - AGENTS.md and CLAUDE.md are auto-generated entrypoints");
console.log("  - They contain the full AIECP protocol + skill catalog");
console.log("");
console.log("For chat LLMs:");
console.log("  - Upload the repo as a zip");
console.log("  - Say: 'Read CHAT-ENTRYPOINT-SANDBOX.md first, then [your task]'");
console.log("");
