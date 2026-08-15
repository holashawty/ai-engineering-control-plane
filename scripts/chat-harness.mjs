#!/usr/bin/env node
// Chat-driven workflow harness — a "live session test" infrastructure.
//
// Purpose: lets a user (e.g., patron at home) drive an AIECP workflow
// interactively with a real chat LLM (ChatGPT, Claude chat, Gemini
// chat, GLM chat, etc.) and validate the LLM's output against the Phase 1
// schemas — without writing any code.
//
// How it works:
//   1. User starts a chat LLM session, uploads this repo as a zip.
//   2. User tells the chat LLM: "Read CHAT-ENTRYPOINT.md (or
//      CHAT-ENTRYPOINT-SANDBOX.md) first, then help me with [task]."
//   3. Chat LLM responds with text containing aiecp:* blocks.
//   4. User copies the chat LLM's response, runs this harness:
//        node scripts/chat-harness.mjs <workflow-name> <response.md> [--adapter <id>] [--user-prompt <file>]
//      or pipes it:
//        cat response.md | node scripts/chat-harness.mjs <workflow-name> --adapter chat-sandbox --user-prompt prompt.txt
//   5. This harness:
//      a. Loads the workflow's .sm.yaml.
//      b. Walks every aiecp:advance block in the response, driving
//         the real WorkflowRun state machine.
//      c. Validates every aiecp:evidence block against the schema.
//      d. Validates every aiecp:memory block against the schema.
//      e. Counts aiecp:question blocks, checks the workflow's
//         question_economy.
//      f. Handles aiecp:confirm blocks (per ADR-0023) for safety
//         gate authorization.
//      g. Reports: which states were walked, which evidence was
//         emitted, whether the run reached a terminal state, and
//         any violations.
//
// Safety gate handling (per ADR-0023 — CRITICAL):
//   - chat (pure-text) adapter: auto-confirm safety gates. The pure-text
//     chat LLM cannot actually write files, so the safety gate is moot —
//     the LLM will transition to `blocked: requires_filesystem_write_capability`
//     before reaching any gated state anyway.
//   - chat-sandbox adapter: DO NOT auto-confirm. The chat-sandbox CAN
//     actually write files (per ADR-0020), so the safety gate is a real
//     authorization boundary. The harness checks whether the user's
//     original prompt authorized the gated action (via --user-prompt
//     arg containing authorization keywords like "fix", "düzelt",
//     "apply", "uygula"). If authorized, advance with confirmation.
//     If not, FAIL — the chat-sandbox LLM tried to do something the
//     user didn't authorize.
//   - aiecp:confirm blocks (per ADR-0023): the chat LLM may emit an
//     explicit confirmation block. If present, it serves as the
//     authorization (the LLM is explicitly confirming it wants to
//     proceed through the gate).

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

function parseArgs(argv) {
  const opts = {
    workflowName: null,
    responseFile: null,
    adapter: "chat", // default: pure-text chat (backward compat)
    userPromptFile: null,
  };

  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--adapter") {
      opts.adapter = argv[++i];
    } else if (arg === "--user-prompt") {
      opts.userPromptFile = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else {
      positional.push(arg);
    }
  }

  opts.workflowName = positional[0];
  opts.responseFile = positional[1];
  return opts;
}

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.workflowName) {
  console.log(`Usage: node scripts/chat-harness.mjs <workflow-name> [response-file] [--adapter <id>] [--user-prompt <file>]

Reads a chat LLM's response (from a file or stdin), extracts every
\`aiecp:*\` block, and drives the named workflow through the real
WorkflowRun API to verify the response is well-formed.

Arguments:
  workflow-name    one of: bug-report, feature-request, code-review,
                   refactor, change-request, project-onboarding,
                   regression, performance-problem
  response-file    path to a markdown file containing the chat LLM's
                   response. If omitted, reads from stdin.

Options (per ADR-0023 — safety gate authorization):
  --adapter <id>          Which chat adapter produced the response.
                           - "chat" (default): pure-text chat LLM.
                             Safety gates are auto-confirmed (the LLM
                             can't write files anyway).
                           - "chat-sandbox": chat LLM with code
                             execution (ChatGPT Code Interpreter,
                             Claude code execution). Safety gates
                             REQUIRE explicit authorization — either
                             via --user-prompt or aiecp:confirm blocks.
  --user-prompt <file>     The user's original prompt to the chat LLM.
                           Required for chat-sandbox when the response
                           contains safety-gated transitions. The
                           harness checks if the prompt authorizes the
                           gated action (keywords: fix, düzelt, apply,
                           uygula, implement, refactor, migrate, etc.).

Block types parsed (per ADR-0023):
  aiecp:evidence    Evidence Model entity (validated against schema)
  aiecp:memory      Memory entry (validated against schema)
  aiecp:advance     Workflow state transition (on: <event>)
  aiecp:question    Question to user (subject to question_economy)
  aiecp:confirm     Explicit safety-gate confirmation (per ADR-0023)

Examples:
  node scripts/chat-harness.mjs bug-report chatgpt-response.md
  node scripts/chat-harness.mjs bug-report response.md --adapter chat-sandbox --user-prompt my-task.txt
  cat response.md | node scripts/chat-harness.mjs feature-request --adapter chat-sandbox

Exit codes:
  0  all blocks valid + workflow reached a terminal state
  1  some blocks invalid OR workflow did not reach a terminal state
     OR question economy violated
     OR (chat-sandbox) safety gate not authorized
`);
  process.exit(args.help ? 0 : 1);
}

const { workflowName, responseFile, adapter, userPromptFile } = args;

const VALID_ADAPTERS = ["chat", "chat-sandbox"];
if (!VALID_ADAPTERS.includes(adapter)) {
  console.error(`Unknown adapter "${adapter}". Valid: ${VALID_ADAPTERS.join(", ")}`);
  console.error(`Use --adapter chat (pure-text, default) or --adapter chat-sandbox (code execution).`);
  process.exit(1);
}

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

// Read user prompt (for chat-sandbox authorization check)
let userPromptText = "";
if (userPromptFile) {
  userPromptText = readFileSync(userPromptFile, "utf-8");
} else if (adapter === "chat-sandbox") {
  console.warn("WARNING: --adapter chat-sandbox without --user-prompt.");
  console.warn("Safety-gated transitions will FAIL unless the response contains aiecp:confirm blocks.");
  console.warn("");
}

// ---- Parse aiecp:* blocks ----

const AIECP_BLOCK = /```aiecp:([a-z]+)\n([\s\S]*?)```/g;

function parseYaml(body) {
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
  } else if (kind === "confirm") {
    // aiecp:confirm block (per ADR-0023) — explicit safety-gate
    // confirmation from the chat LLM. The LLM is saying "yes, I
    // want to proceed through the gate." Optional fields: `gate`
    // (which gate, e.g., "broad-refactor"), `reason` (why).
    block.confirmGate = block.parsed.gate ?? null;
    block.confirmReason = block.parsed.reason ?? null;
  } else {
    block.error = `unknown aiecp block kind "${kind}"`;
  }
  blocks.push(block);
}

// ---- Safety gate authorization (per ADR-0023) ----

// Authorization keywords (case-insensitive) — if the user's prompt
// OR the response text contains any of these, the safety gate is
// considered authorized for chat-sandbox.
const AUTH_KEYWORDS = [
  // English
  "fix", "apply", "implement", "refactor", "migrate", "optimize",
  "change", "modify", "update", "patch", "edit", "write",
  "diagnose and fix", "find and fix",
  // Turkish
  "düzelt", "uygula", "düzenle", "değiştir", "güncelle", "yaz",
  "tamir et", "çöz",
];

function isAuthorized(prompts) {
  const combined = prompts.join("\n").toLowerCase();
  return AUTH_KEYWORDS.some((kw) => combined.includes(kw.toLowerCase()));
}

// Collect all aiecp:confirm blocks — these are explicit authorizations
const confirmBlocks = blocks.filter((b) => b.kind === "confirm");
const hasExplicitConfirm = confirmBlocks.length > 0;

// For chat-sandbox: check if the user's prompt authorizes the gated action
const promptAuthorized = userPromptText ? isAuthorized([userPromptText]) : false;

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
console.log(`Adapter: ${adapter}`);
console.log(`Loaded workflow: ${def.workflow} (${def.states.length} states, ${def.transitions.length} transitions)`);
console.log(`Initial state: ${def.initial_state}`);
console.log(`Found ${blocks.length} aiecp:* blocks in response`);
if (adapter === "chat-sandbox") {
  console.log(`Safety gate mode: ${promptAuthorized ? "prompt-authorized" : (hasExplicitConfirm ? "explicit-confirm" : "REQUIRES-AUTHORIZATION")}`);
  if (userPromptFile) {
    console.log(`User prompt: ${userPromptFile} (${userPromptText.length} chars)`);
  }
}
console.log("");

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

  // Skip confirm blocks in the main loop — they're handled when
  // a safety-gated advance is encountered.
  if (block.kind === "confirm") {
    console.log(`  OK   ${label} — explicit confirmation recorded (gate: ${block.confirmGate ?? "any"}, reason: ${block.confirmReason ?? "(none)"})`);
    passCount++;
    continue;
  }

  try {
    if (block.kind === "evidence") {
      const result = validateEvidenceAgainstSchema(block.kindOrType, block.data);
      if (!result.ok) {
        console.log(`  FAIL ${label} — schema: ${result.errors}`);
        failCount++;
        violations.push({ block: block.index, kind: block.kind, error: `schema: ${result.errors}` });
        continue;
      }
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
        console.log(`  OK   ${label} — advance on "${block.onEvent}" → ${run.currentState}`);
        passCount++;
      } catch (e) {
        if (e instanceof WorkflowViolation && e.kind === "safety-gate-needs-confirmation") {
          // Safety gate handling (per ADR-0023):
          if (adapter === "chat") {
            // Pure-text chat: auto-confirm. The LLM can't actually
            // write files, so the gate is moot — the LLM will hit
            // `blocked: requires_filesystem_write_capability` before
            // reaching any real gated state anyway.
            run.advanceWithConfirmation(block.onEvent);
            console.log(`  OK   ${label} — advance on "${block.onEvent}" → ${run.currentState} (auto-confirmed: pure-text chat, gate moot)`);
            passCount++;
          } else if (adapter === "chat-sandbox") {
            // Chat-sandbox: the LLM CAN actually write files (per
            // ADR-0020). The safety gate is a REAL authorization
            // boundary. Check authorization.
            if (hasExplicitConfirm) {
              // Explicit aiecp:confirm block present — authorized.
              run.advanceWithConfirmation(block.onEvent);
              console.log(`  OK   ${label} — advance on "${block.onEvent}" → ${run.currentState} (authorized: explicit aiecp:confirm block)`);
              passCount++;
            } else if (promptAuthorized) {
              // User's prompt contains authorization keywords.
              run.advanceWithConfirmation(block.onEvent);
              console.log(`  OK   ${label} — advance on "${block.onEvent}" → ${run.currentState} (authorized: user prompt contains authorization keyword)`);
              passCount++;
            } else {
              // NOT authorized. The chat-sandbox LLM tried to do
              // something the user didn't authorize. FAIL.
              console.log(`  FAIL ${label} — safety gate NOT authorized for chat-sandbox`);
              console.log(`       The chat-sandbox adapter can actually write files (per ADR-0020).`);
              console.log(`       The safety gate is a real authorization boundary.`);
              console.log(`       To authorize: (a) add aiecp:confirm block before this advance, OR`);
              console.log(`       (b) pass --user-prompt <file> with the user's original prompt`);
              console.log(`       containing authorization keywords (fix, düzelt, apply, uygula, etc.).`);
              failCount++;
              violations.push({
                block: block.index,
                kind: block.kind,
                error: `safety-gate-not-authorized: chat-sandbox adapter requires explicit authorization (aiecp:confirm or --user-prompt with authorization keyword)`,
              });
            }
          }
        } else if (e instanceof WorkflowViolation && e.kind === "already-terminal") {
          // Chat LLM tried to advance past the terminal state —
          // this is the "extra block" bug found in the 4th ChatGPT test.
          console.log(`  FAIL ${label} — already-terminal: workflow is in "${run.currentState}" (terminal), cannot advance further`);
          failCount++;
          violations.push({
            block: block.index,
            kind: block.kind,
            error: `already-terminal: workflow reached "${run.currentState}" and cannot advance on "${block.onEvent}"`,
          });
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
console.log(`Adapter:   ${adapter}`);
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
}
if (!noViolations) {
  console.log(`  Reason: ${violations.length} violation(s) — see above.`);
}
if (verdict) {
  console.log(`  The chat LLM's response drove the ${workflowName} workflow from`);
  console.log(`  ${def.initial_state} to ${run.currentState}, emitting ${passCount} valid`);
  console.log(`  aiecp:* blocks, all schema-valid, with no question-economy violations.`);
  if (adapter === "chat-sandbox") {
    console.log(`  Safety gate authorization: ${hasExplicitConfirm ? "explicit aiecp:confirm" : (promptAuthorized ? "user-prompt keyword" : "N/A (no gated transitions)")}.`);
  }
}

process.exit(verdict ? 0 : 1);
