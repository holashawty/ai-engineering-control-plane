import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

console.log("=== AIECP Metadata & Assertion Sync Verifier ===");

let passed = 0;
let failed = 0;

function assert(name, condition, detail = "") {
  if (condition) {
    console.log(`  OK   ${name}`);
    passed++;
  } else {
    console.error(`  FAIL ${name} ${detail ? "-> " + detail : ""}`);
    failed++;
  }
}

// 1. Real Filesystem Counts
const decisionsText = readFileSync(join(REPO_ROOT, "DECISIONS.md"), "utf-8");
const actualAdrs = (decisionsText.match(/^## ADR-\d+/gm) || []).length;

const skillsDir = join(REPO_ROOT, "skills");
const actualSkills = readdirSync(skillsDir).filter((d) =>
  existsSync(join(skillsDir, d, "SKILL.md"))
).length;

const workflowsDir = join(REPO_ROOT, "workflows");
const actualWorkflows = readdirSync(workflowsDir).filter((f) => f.endsWith(".sm.yaml")).length;

// 2. Read Metadata Sources
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8"));
const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf-8");
const status = readFileSync(join(REPO_ROOT, "STATUS.md"), "utf-8");
const releaseNotes = readFileSync(join(REPO_ROOT, "RELEASE_NOTES.md"), "utf-8");

// Parse package.json
const pkgAdrMatch = pkg.description.match(/(\d+)\s+ADRs/);
const pkgSkillMatch = pkg.description.match(/(\d+)\s+skills/);
const pkgWfMatch = pkg.description.match(/(\d+)\s+workflows/);
const pkgAssertMatch = pkg.description.match(/(\d+)\s+assertions/);

assert("package.json ADR count matches DECISIONS.md", pkgAdrMatch && parseInt(pkgAdrMatch[1], 10) === actualAdrs, `pkg=${pkgAdrMatch?.[1]}, actual=${actualAdrs}`);
assert("package.json skill count matches skills/", pkgSkillMatch && parseInt(pkgSkillMatch[1], 10) === actualSkills, `pkg=${pkgSkillMatch?.[1]}, actual=${actualSkills}`);
assert("package.json workflow count matches workflows/", pkgWfMatch && parseInt(pkgWfMatch[1], 10) === actualWorkflows, `pkg=${pkgWfMatch?.[1]}, actual=${actualWorkflows}`);

// Parse README badges
const readmeAdrMatch = readme.match(/ADRs-(\d+)-orange/);
const readmeSkillMatch = readme.match(/skills-(\d+)-yellow/);

assert("README.md ADR badge matches actual", readmeAdrMatch && parseInt(readmeAdrMatch[1], 10) === actualAdrs, `readme=${readmeAdrMatch?.[1]}, actual=${actualAdrs}`);
assert("README.md skill badge matches actual", readmeSkillMatch && parseInt(readmeSkillMatch[1], 10) === actualSkills, `readme=${readmeSkillMatch?.[1]}, actual=${actualSkills}`);

// Parse STATUS.md
const statusAdrMatch = status.match(/(\d+)\s+ADRs/);
const statusSkillMatch = status.match(/(\d+)\s+skills/);

assert("STATUS.md ADR count matches actual", statusAdrMatch && parseInt(statusAdrMatch[1], 10) === actualAdrs, `status=${statusAdrMatch?.[1]}, actual=${actualAdrs}`);
assert("STATUS.md skill count matches actual", statusSkillMatch && parseInt(statusSkillMatch[1], 10) === actualSkills, `status=${statusSkillMatch?.[1]}, actual=${actualSkills}`);

// Parse RELEASE_NOTES.md
const relAdrMatch = releaseNotes.match(/\|\s*ADRs\s*\|\s*(\d+)\s*\|/);
const relSkillMatch = releaseNotes.match(/\|\s*Skills\s*\|\s*(\d+)\s*\|/);

assert("RELEASE_NOTES.md ADR table matches actual", relAdrMatch && parseInt(relAdrMatch[1], 10) === actualAdrs, `rel=${relAdrMatch?.[1]}, actual=${actualAdrs}`);
assert("RELEASE_NOTES.md skill table matches actual", relSkillMatch && parseInt(relSkillMatch[1], 10) === actualSkills, `rel=${relSkillMatch?.[1]}, actual=${actualSkills}`);

console.log(`\n=== Verification Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error("METADATA SYNC CHECK FAILED");
  process.exit(1);
}
console.log("METADATA SYNC OK (All sources in 100% harmony)\n");
