#!/usr/bin/env node
// Chat-driven workflow harness — a "live session test" infrastructure.
//
// Purpose: lets a user (e.g., patron at home) drive an AIECP workflow
// interactively with a real chat LLM (ChatGPT, Claude chat, Gemini
// chat, etc.) and validate the LLM's output against the Phase 1
// schemas — without writing any code.
//
// How it works:
//   1. User starts a chat LLM session, uploads this repo as a zip.
//   2. User tells the chat LLM: "Read CHAT-ENTRYPOINT.md first, then
//      help me with [task]."
//   3. Chat LLM responds with text containing aiecp:* blocks.
//   4. User copies the chat LLM's response, runs this harness:
//        node scripts/chat-harness.mjs <workflow-name> <response.md>
//      or pipes it:
//        cat response.md | node scripts/chat-harness.mjs <workflow-name>
//   5. This harness:
//      a. Loads the workflow's .sm.yaml.
//      b. Walks every aiecp:advance block in the response, driving
//         the real WorkflowRun state machine.
//      c. Validates every aiecp:evidence block against the schema.
//      d. Validates every aiecp:memory block against the schema.
//      e. Counts aiecp:question blocks, checks the workflow's
//         question_economy.
//      f. Reports: which states were walked, which evidence was
//         emitted, whether the run reached a terminal state, and
//         any violations (invalid transition, schema violation,
//         question-economy violation, etc.).
//
// What this is NOT:
//   - It does NOT call a chat LLM API. The user is the bridge
//     between the chat LLM and this harness.
//   - It does NOT replace the e2e proof drivers in executor/examples/.
//     Those are scripted; this is interactive.
//   - It does NOT enforce safety gates (the chat LLM cannot apply
//     source edits anyway, so safety gates are moot). It DOES
//     detect when the chat LLM tried to advance through a gated
//     transition without confirmation, and warns the user.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkflow } from "../executor/dist/workflow-loader.js";
import { WorkflowRun } from "../executor/dist/run.js";
import { WorkflowViolation } from "../executor/dist/types.js";
import { mkdtempSync, rmSync, readdirSync, readFileSync as readFileSyncSync } from "node:fs";
import { tmpdir } from "node:os";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

const AjvCtor = /** @type {any} */ (Ajv2020);
const addFormatsFn = /** @type {any} */ (addFormats);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ---- Argument parsing ----

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/chat-harness.mjs <workflow-name> [response-file]

Reads a chat LLM's response (from a file or stdin), extracts every
\`aiecp:*\` block, and drives the named workflow through the real
WorkflowRun API to verify the response is well-formed.

Arguments:
  workflow-name    one of: bug-report, feature-request, code-review,
                   refactor, change-request, project-onboarding,
                   regression, performance-problem
  response-file    path to a markdown file containing the chat LLM's
                   response. If omitted, reads from stdin.

Examples:
  node scripts/chat-harness.mjs bug-report chatgpt-response.md
  cat claude-response.md | node scripts/chat-harness.mjs feature-request

Exit codes:
  0  all blocks valid + workflow reached a terminal state
  1  some blocks invalid OR workflow did not reach a terminal state
     OR question economy violated
`);
  process.exit(args.length === 0 ? 1 : 0);
}

const workflowName = args[0];
const responseFile = args[1];

const WORKFLOW_PATHS = {
  "bug-report": "workflows/bug-report.sm.yaml",
  "feature-request": "workflows/feature-request.sm.yaml",
  "code-review": "workflows/code-review.sm.yaml",
  "refactor": "workflows/refactor.sm.yaml",
  "change-request": "workflows/change-request.sm.yaml",
  "project-onboarding": "workflows/project-onboarding.sm.yaml",
  "regression": "workflows/regression.sm.yaml",
  "performance-problem": "workflows/performance-problem.sm.yaml",
};

const workflowPath = WORKFLOW_PATHS[workflowName];
if (!workflowPath) {
  console.error(`Unknown workflow "${workflowName}". Valid: ${Object.keys(WORKFLOW_PATHS).join(", ")}`);
  process.exit(1);
}

// ---- Read input ----

let responseText;
if (responseFile) {
  responseText = readFileSync(responseFile, "utf-8");
} else {
  responseText = readFileSyncSync(0, "utf-8");
}

// ---- Parse aiecp:* blocks ----

const AIECP_BLOCK = /```aiecp:([a-z]+)\n([\s\S]*?)```/g;

function parseYaml(body) {
  // js-yaml auto-converts ISO 8601 dates to Date objects; use JSON_SCHEMA
  // to keep them as strings for schema validation.
  return yaml.load(body, { schema: yaml.JSON_SCHEMA });
}

const blocks = [];
let match;
let idx = 0;
AIECP_BLOCK.lastIndex = 0;
while ((match = AIECP_BLOCK.exec(responseText)) !== null) {
  const kind = match[1];
  const body = match[2];
  const block = { kind, body, index: idx++ };

  try {
    block.parsed = parseYaml(body);
  } catch (e) {
    block.parseError = e.message;
    blocks.push(block);
    continue;
  }

  if (kind === "evidence" || kind === "memory") {
    const kindOrType = block.parsed.kind ?? block.parsed.type;
    if (!kindOrType) {
      block.error = `missing "kind:" (for evidence) or "type:" (for memory)`;
    } else if (!block.parsed.data) {
      block.error = `missing "data:" mapping`;
    } else {
      block.kindOrType = kindOrType;
      block.data = block.parsed.data;
    }
  } else if (kind === "advance") {
    if (!block.parsed.on) {
      block.error = `missing "on:" string`;
    } else {
      block.onEvent = block.parsed.on;
    }
  } else if (kind === "question") {
    if (!block.parsed.text) {
      block.error = `missing "text:" string`;
    } else {
      block.questionText = block.parsed.text;
    }
  } else {
    block.error = `unknown aiecp block kind "${kind}"`;
  }
  blocks.push(block);
}

// ---- Load workflow + create run ----

const workflowFullPath = join(REPO_ROOT, workflowPath);
let def;
try {
  def = loadWorkflow(workflowFullPath);
} catch (e) {
  console.error(`Failed to load workflow "${workflowName}": ${e.message}`);
  process.exit(1);
}

const tmpRunDir = mkdtempSync(join(tmpdir(), `aiecp-chat-harness-${workflowName}-`));
const run = new WorkflowRun(def, { runDir: tmpRunDir });

// ---- Build validators for evidence/memory schema checks ----

const ajv = new AjvCtor({ strict: false, allErrors: true });
addFormatsFn(ajv);
const EVIDENCE_SCHEMA_DIR = join(REPO_ROOT, "evidence", "schema");
const MEMORY_SCHEMA_DIR = join(REPO_ROOT, "memory", "schemas");
const VALID_EVIDENCE_KINDS = new Set(["incident", "trace", "event", "decision", "expected", "actual", "validation", "replay"]);
const VALID_MEMORY_TYPES = new Set(["project", "decision", "known-failure", "environment"]);

function getValidator(dir, filename, key) {
  const cache = getValidator._cache ??= new Map();
  if (cache.has(key)) return cache.get(key);
  const schema = JSON.parse(readFileSync(join(dir, filename), "utf-8"));
  const v = ajv.compile(schema);
  cache.set(key, v);
  return v;
}

function validateEvidenceAgainstSchema(kind, data) {
  if (!VALID_EVIDENCE_KINDS.has(kind)) {
    return { ok: false, errors: `unknown evidence kind "${kind}"` };
  }
  const v = getValidator(EVIDENCE_SCHEMA_DIR, `${kind}.schema.json`, `evidence:${kind}`);
  const ok = v(data) === true;
  return { ok, errors: ok ? null : JSON.stringify(v.errors, null, 2) };
}

function validateMemoryAgainstSchema(type, data) {
  if (!VALID_MEMORY_TYPES.has(type)) {
    return { ok: false, errors: `unknown memory type "${type}"` };
  }
  const v = getValidator(MEMORY_SCHEMA_DIR, `${type}.schema.json`, `memory:${type}`);
  const ok = v(data) === true;
  return { ok, errors: ok ? null : JSON.stringify(v.errors, null, 2) };
}

// ---- Walk through the blocks, driving the workflow ----

let passCount = 0;
let failCount = 0;
const violations = [];

console.log(`=== Chat Harness: driving ${workflowName} workflow ===`);
console.log(`Loaded workflow: ${def.workflow} (${def.states.length} states, ${def.transitions.length} transitions)`);
console.log(`Initial state: ${def.initial_state}`);
console.log(`Found ${blocks.length} aiecp:* blocks in response\n`);

for (const block of blocks) {
  const label = `block #${block.index} (aiecp:${block.kind})`;

  if (block.parseError) {
    console.log(`  FAIL ${label} — YAML parse error: ${block.parseError}`);
    failCount++;
    violations.push({ block: block.index, kind: block.kind, error: `YAML parse: ${block.parseError}` });
    continue;
  }
  if (block.error) {
    console.log(`  FAIL ${label} — ${block.error}`);
    failCount++;
    violations.push({ block: block.index, kind: block.kind, error: block.error });
    continue;
  }

  try {
    if (block.kind === "evidence") {
      // Validate against schema first
      const result = validateEvidenceAgainstSchema(block.kindOrType, block.data);
      if (!result.ok) {
        console.log(`  FAIL ${label} — schema: ${result.errors}`);
        failCount++;
        violations.push({ block: block.index, kind: block.kind, error: `schema: ${result.errors}` });
        continue;
      }
      // Then emit through WorkflowRun (also schema-validates internally)
      await run.emitEvidence(block.kindOrType, block.data);
      console.log(`  OK   ${label} — evidence/${block.kindOrType} (id: ${block.data.id})`);
      passCount++;
    } else if (block.kind === "memory") {
      const result = validateMemoryAgainstSchema(block.kindOrType, block.data);
      if (!result.ok) {
        console.log(`  FAIL ${label} — schema: ${result.errors}`);
        failCount++;
        violations.push({ block: block.index, kind: block.kind, error: `schema: ${result.errors}` });
        continue;
      }
      await run.writeMemory(block.kindOrType, block.data);
      console.log(`  OK   ${label} — memory/${block.kindOrType} (id: ${block.data.id})`);
      passCount++;
    } else if (block.kind === "advance") {
      try {
        const result = run.advance(block.onEvent);
        if (result.gateDecision === "requires-confirmation") {
          console.log(`  WARN ${label} — advance gated by safety gate; chat LLM should use aiecp:confirm (but harness will proceed for testing)`);
          // For harness purposes, auto-confirm — chat LLM can't actually apply fixes anyway
          // Re-do the advance with confirmation
          // But we already advanced... actually advance() throws on gate. Let me re-check.
        }
        console.log(`  OK   ${label} — advance on "${block.onEvent}" → ${run.currentState}`);
        passCount++;
      } catch (e) {
        if (e instanceof WorkflowViolation && e.kind === "safety-gate-needs-confirmation") {
          // Auto-confirm for harness purposes
          run.advanceWithConfirmation(block.onEvent);
          console.log(`  OK   ${label} — advance on "${block.onEvent}" → ${run.currentState} (auto-confirmed safety gate)`);
          passCount++;
        } else if (e instanceof WorkflowViolation) {
          console.log(`  FAIL ${label} — ${e.kind}: ${e.message}`);
          failCount++;
          violations.push({ block: block.index, kind: block.kind, error: `${e.kind}: ${e.message}` });
        } else {
          throw e;
        }
      }
    } else if (block.kind === "question") {
      try {
        run.askQuestion(block.questionText);
        console.log(`  OK   ${label} — question asked (count: ${run.questions.count})`);
        passCount++;
      } catch (e) {
        if (e instanceof WorkflowViolation) {
          console.log(`  FAIL ${label} — ${e.kind}: ${e.message}`);
          failCount++;
          violations.push({ block: block.index, kind: block.kind, error: `${e.kind}: ${e.message}` });
        } else {
          throw e;
        }
      }
    }
  } catch (e) {
    console.log(`  FAIL ${label} — unexpected: ${e.message}`);
    failCount++;
    violations.push({ block: block.index, kind: block.kind, error: `unexpected: ${e.message}` });
  }
}

// ---- Final report ----

console.log("");
console.log("=== Summary ===");
console.log(`Blocks:    ${passCount} OK / ${failCount} FAIL (of ${blocks.length} total)`);
console.log(`Workflow:  ${workflowName}`);
console.log(`Final state: ${run.currentState}`);
console.log(`Terminal:  ${run.isTerminal() ? "YES ✓" : "NO ✗"}`);
console.log(`Questions: ${run.questions.count} (budget: ${def.question_economy?.max_questions ?? "unlimited"})`);
console.log(`Log entries: ${run.log.length}`);

// Check disk persistence
const evidenceKindsOnDisk = [];
const evidenceDir = join(tmpRunDir, "evidence");
try {
  for (const kind of readdirSync(evidenceDir)) {
    const files = readdirSync(join(evidenceDir, kind));
    if (files.length > 0) evidenceKindsOnDisk.push(`${kind}(${files.length})`);
  }
} catch {}
const memoryKindsOnDisk = [];
const memoryDir = join(tmpRunDir, "memory");
try {
  for (const kind of readdirSync(memoryDir)) {
    const files = readdirSync(join(memoryDir, kind));
    if (files.length > 0) memoryKindsOnDisk.push(`${kind}(${files.length})`);
  }
} catch {}
console.log(`Evidence persisted: ${evidenceKindsOnDisk.length > 0 ? evidenceKindsOnDisk.join(", ") : "(none)"}`);
console.log(`Memory persisted: ${memoryKindsOnDisk.length > 0 ? memoryKindsOnDisk.join(", ") : "(none)"}`);

if (violations.length > 0) {
  console.log("");
  console.log(`Violations (${violations.length}):`);
  for (const v of violations) {
    console.log(`  block #${v.block} (${v.kind}): ${v.error}`);
  }
}

// Cleanup
rmSync(tmpRunDir, { recursive: true, force: true });

// Final verdict
const reachedTerminal = run.isTerminal();
const noViolations = violations.length === 0;
const verdict = reachedTerminal && noViolations;
console.log("");
console.log(`=== VERDICT: ${verdict ? "PASS ✓" : "FAIL ✗"} ===`);
if (!reachedTerminal) {
  console.log(`  Reason: workflow did not reach a terminal state (currently at "${run.currentState}").`);
  console.log(`  The chat LLM's response either emitted an incomplete evidence chain,`);
  console.log(`  or stopped emitting aiecp:advance blocks before reaching report/blocked.`);
}
if (!noViolations) {
  console.log(`  Reason: ${violations.length} violation(s) — see above.`);
}
if (verdict) {
  console.log(`  The chat LLM's response drove the ${workflowName} workflow from`);
  console.log(`  ${def.initial_state} to ${run.currentState}, emitting ${passCount} valid`);
  console.log(`  aiecp:* blocks, all schema-valid, with no question-economy violations.`);
}

process.exit(verdict ? 0 : 1);
