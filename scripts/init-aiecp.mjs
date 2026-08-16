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

import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
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
const essentialDirs = ["workflows", "skills", "constitution", "evidence", "memory", "discovery", "executor", "adapters", "specs", "scripts"];
const essentialFiles = [
  "AGENTS.md", "CHAT-ENTRYPOINT.md", "CHAT-ENTRYPOINT-SANDBOX.md",
  "NOTICE", "DECISIONS.md", "STATUS.md", "TASKS.md", "DELIVERABLES.md",
  "package.json", ".gitattributes", "SECURITY.md", "LICENSE",
  "docs/evidence-model.md", "docs/architecture.md", "docs/workflow-model.md",
  "docs/memory-model.md", "docs/portability.md", "docs/security-model.md",
  "docs/evaluation-strategy.md", "docs/evaluations/evaluation-strategy.md",
  "docs/research-upstream-integration.md", "docs/vision-and-roadmap.md",
  "docs/quality-audit.md", "docs/controller-audit-and-roadmap-2026.md",
];

mkdirSync(frameworkDir, { recursive: true });

// Create symlinks for directories (more efficient than copying)
for (const dir of essentialDirs) {
  const src = join(frameworkSource, dir);
  const dst = join(frameworkDir, dir);
  if (existsSync(src)) {
    try {
      execSync(`ln -sf "${src}" "${dst}"`, { stdio: "pipe" });
      console.log(`  Linked: ${dir}/`);
    } catch {
      // Symlink failed (Windows?), try copy
      execSync(`cp -r "${src}" "${dst}"`, { stdio: "pipe" });
      console.log(`  Copied: ${dir}/`);
    }
  }
}

// Copy essential files
for (const file of essentialFiles) {
  const src = join(frameworkSource, file);
  const dst = join(frameworkDir, file);
  if (existsSync(src)) {
    try { mkdirSync(dirname(dst), { recursive: true }); } catch {}
    try { copyFileSync(src, dst); } catch {}
  }
}

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
    console.log("  Entrypoint generation failed (non-critical): " + e.message);
    console.log("  Run manually: node .aiecp-framework/adapters/agents/dist/bin/write-entrypoints.js .aiecp-framework .");
  }
} else {
  console.log("  write-entrypoints.js not found. Skipping.");
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
