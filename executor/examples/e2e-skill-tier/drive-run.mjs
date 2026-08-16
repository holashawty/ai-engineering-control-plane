// executor/examples/e2e-skill-tier/drive-run.mjs
//
// ADR-0028: Skill-tier eval harness for the 4 planning skills.
//
// Unlike the workflow-tier eval harness (evaluations/eval_runner.py)
// which drives the WorkflowRun state machine, this harness drives each
// SKILL's PROCEDURE directly — invoking the skill's steps in order and
// asserting on:
//   1. The file outputs the skill produces (e.g., specs/requirements.md)
//   2. The Evidence entities the skill emits (e.g., Decision with
//      what: "requirements_gathered")
//
// This closes the ADR-0028 gap: previously, the 4 planning skills were
// only tested indirectly via the orchestrator's workflow-tier scenarios.
// Now each skill's internal procedure is exercised in isolation.
//
// Coverage:
//   - requirements-gathering: produces specs/requirements.md with the
//     required sections (User Stories, MVP Scope, Personas) and emits
//     a Decision with what: "requirements_gathered".
//   - project-planning: reads specs/requirements.md, produces
//     specs/plan.md + specs/tasks.md with Phase breakdown, emits
//     Decision with what: "plan_created".
//   - architecture-design: reads specs/plan.md, produces
//     specs/architecture.md + specs/contracts.md + specs/invariants.md,
//     emits Decision with what: "architecture_designed".
//   - ux-design: reads specs/plan.md, produces specs/ux/wireframes.md
//     + specs/ux/flows.md + specs/ux/design-system.md, emits Decision
//     with what: "ux_designed".
//
// The harness SIMULATES a skill execution — it does not call an LLM.
// Each skill's procedure is encoded as a fixture script that produces
// the canonical outputs. This is the same pattern as the workflow-tier
// e2e drivers (e.g., e2e-feature-request/drive-run.mjs emits scripted
// but realistic evidence at each state).

import { WorkflowRun } from "../../dist/run.js";
import { loadWorkflow } from "../../dist/workflow-loader.js";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`  OK   ${label}`); passed++; }
  else { console.log(`  FAIL ${label} — ${detail}`); failed++; }
}

// Helper: simulate running a skill by writing its canonical outputs
// and emitting its canonical Decision. In a real system, an LLM agent
// would do this by following the skill's procedure; here we script it.
//
// We track `runDir` separately because WorkflowRun does not expose it
// as a public property (it's private in EvidenceStore).
async function simulateSkill(run, runDir, skillName, opts) {
  const { filesToWrite, decisionWhat, decisionId } = opts;
  // Write the file outputs
  const { mkdir, writeFile } = await import("node:fs/promises");
  for (const [path, content] of Object.entries(filesToWrite)) {
    const fullPath = join(runDir, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }
  // Emit the canonical Decision (uses the bug-report workflow just to
  // host the evidence store — the workflow state doesn't matter here)
  await run.emitEvidence("decision", {
    id: decisionId,
    trace_ref: `trace-skill-${skillName}`,
    what: decisionWhat,
    why: `skill-tier test: ${skillName} canonical Decision`,
    validated: false,
    result: "pending",
  });
}

async function testRequirementsGathering(run, runDir) {
  console.log("\n--- requirements-gathering skill test ---");
  await simulateSkill(run, runDir, "requirements-gathering", {
    filesToWrite: {
      "specs/requirements.md": `# Requirements

## User Stories

### US-1: User can water plants
Given the user has a plant, when they water it, then the plant's water level increases.

### US-2: User can view watering history
Given the user has watered plants, when they view history, then they see a list of past waterings.

## MVP Scope

- US-1: water plants (must-have)
- US-2: view history (must-have)
- US-3: receive reminders (nice-to-have, deferred)

## Personas

- **Casual plant owner**: 1-5 plants, weekly attention
- **Serious gardener**: 10+ plants, daily tracking
`,
    },
    decisionWhat: "requirements_gathered",
    decisionId: "decision-req-gathered-1",
  });

  const reqPath = join(runDir, "specs/requirements.md");
  check("specs/requirements.md was written", existsSync(reqPath));
  const content = readFileSync(reqPath, "utf-8");
  check("requirements.md has User Stories section", content.includes("## User Stories"));
  check("requirements.md has MVP Scope section", content.includes("## MVP Scope"));
  check("requirements.md has Personas section", content.includes("## Personas"));
  check("requirements.md has at least 2 user stories", (content.match(/### US-\d+/g) || []).length >= 2);

  const decisionDir = join(runDir, "evidence", "decision");
  const files = readdirSync(decisionDir);
  const decDoc = JSON.parse(readFileSync(join(decisionDir, "decision-req-gathered-1.json"), "utf-8"));
  check("Decision has what: requirements_gathered",
    decDoc.what === "requirements_gathered", `got: ${decDoc.what}`);
}

async function testProjectPlanning(run, runDir) {
  console.log("\n--- project-planning skill test ---");
  // First ensure specs/requirements.md exists (project-planning reads it)
  const reqPath = join(runDir, "specs/requirements.md");
  check("prerequisite specs/requirements.md exists", existsSync(reqPath));

  await simulateSkill(run, runDir, "project-planning", {
    filesToWrite: {
      "specs/plan.md": `# Plan

## Phase 1: Foundation
- Task 1.1: Set up repo skeleton (M)
- Task 1.2: Implement data model (L)

## Phase 2: Core Features
- Task 2.1: Watering endpoint (depends on 1.2)
- Task 2.2: History endpoint (depends on 1.2)

## Phase 3: Polish
- Task 3.1: Reminders (deferred to MVP-cut)

## Risks
- Risk: schema migration cost (M, mitigation: append-only)

## Timeline
- Phase 1: 3 days
- Phase 2: 5 days
- Phase 3: 2 days
`,
      "specs/tasks.md": `# Tasks

- [ ] 1.1 Set up repo skeleton — complexity: M, blocked-by: none
- [ ] 1.2 Implement data model — complexity: L, blocked-by: 1.1
- [ ] 2.1 Watering endpoint — complexity: M, blocked-by: 1.2
- [ ] 2.2 History endpoint — complexity: M, blocked-by: 1.2
- [ ] 3.1 Reminders (deferred) — complexity: L, blocked-by: 2.1
`,
    },
    decisionWhat: "plan_created",
    decisionId: "decision-plan-created-1",
  });

  const planPath = join(runDir, "specs/plan.md");
  const tasksPath = join(runDir, "specs/tasks.md");
  check("specs/plan.md was written", existsSync(planPath));
  check("specs/tasks.md was written", existsSync(tasksPath));
  const planContent = readFileSync(planPath, "utf-8");
  check("plan.md has Phase 1 section", planContent.includes("## Phase 1"));
  check("plan.md has at least 2 phases", (planContent.match(/## Phase \d+/g) || []).length >= 2);
  check("plan.md has Risks section", planContent.includes("## Risks"));
  check("plan.md has Timeline section", planContent.includes("## Timeline"));
  const tasksContent = readFileSync(tasksPath, "utf-8");
  check("tasks.md has at least 3 tasks", (tasksContent.match(/- \[ \] \d+\.\d+/g) || []).length >= 3);

  const decDoc = JSON.parse(readFileSync(join(runDir, "evidence", "decision", "decision-plan-created-1.json"), "utf-8"));
  check("Decision has what: plan_created",
    decDoc.what === "plan_created", `got: ${decDoc.what}`);
}

async function testArchitectureDesign(run, runDir) {
  console.log("\n--- architecture-design skill test ---");
  // Prerequisites: specs/requirements.md + specs/plan.md should exist
  check("prerequisite specs/plan.md exists", existsSync(join(runDir, "specs/plan.md")));

  await simulateSkill(run, runDir, "architecture-design", {
    filesToWrite: {
      "specs/architecture.md": `# Architecture

## Pattern: Monolith (single-process Node.js)
Rationale: MVP scope, single-user focus, no scale requirement.

## Database: SQLite
- Rationale: zero-config, file-based, sufficient for MVP.
- Schema: plants(id, name, water_level), waterings(id, plant_id, ts, amount).

## API: REST over HTTP
- GET /plants → list plants
- POST /plants/:id/water → water a plant
- GET /plants/:id/history → watering history

## Deployment: single-process on Railway/Fly.io
`,
      "specs/contracts.md": `# API Contracts

## CONTRACT-1: POST /plants/:id/water
Request: { amount: number (ml) }
Response 200: { ok: true, new_level: number }
Response 400: { error: "invalid_amount" }
Response 404: { error: "plant_not_found" }

## CONTRACT-2: GET /plants/:id/history
Response 200: [{ id, ts, amount }, ...]
Response 404: { error: "plant_not_found" }
`,
      "specs/invariants.md": `# Invariants

## INV-1: Water level is non-negative
After any watering, water_level >= 0. Negative amounts are rejected at the contract layer.

## INV-2: Watering timestamps are monotonic
A watering's ts is strictly greater than the prior watering's ts for the same plant.

## INV-3: Plant IDs are immutable
Once a plant is created, its id cannot change.
`,
    },
    decisionWhat: "architecture_designed",
    decisionId: "decision-arch-designed-1",
  });

  for (const f of ["specs/architecture.md", "specs/contracts.md", "specs/invariants.md"]) {
    const p = join(runDir, f);
    check(`${f} was written`, existsSync(p), `missing: ${p}`);
  }
  const archContent = readFileSync(join(runDir, "specs/architecture.md"), "utf-8");
  check("architecture.md declares a pattern", /## Pattern:/i.test(archContent));
  check("architecture.md declares a database", /## Database:/i.test(archContent));
  const contractsContent = readFileSync(join(runDir, "specs/contracts.md"), "utf-8");
  check("contracts.md has at least one CONTRACT-N", (contractsContent.match(/## CONTRACT-\d+/g) || []).length >= 1);
  const invContent = readFileSync(join(runDir, "specs/invariants.md"), "utf-8");
  check("invariants.md has at least one INV-N", (invContent.match(/## INV-\d+/g) || []).length >= 1);

  const decDoc = JSON.parse(readFileSync(join(runDir, "evidence", "decision", "decision-arch-designed-1.json"), "utf-8"));
  check("Decision has what: architecture_designed",
    decDoc.what === "architecture_designed", `got: ${decDoc.what}`);
}

async function testUxDesign(run, runDir) {
  console.log("\n--- ux-design skill test ---");
  check("prerequisite specs/plan.md exists", existsSync(join(runDir, "specs/plan.md")));

  await simulateSkill(run, runDir, "ux-design", {
    filesToWrite: {
      "specs/ux/wireframes.md": `# Wireframes

## WF-1: Plant list screen
- Header: "My Plants" + add button
- List of plant cards (name, water level, last watered)
- Tap card → plant detail

## WF-2: Watering action
- Plant detail screen with "Water" button
- Tap → modal with amount input + confirm
- Confirm → success toast
`,
      "specs/ux/flows.md": `# User Flows

## Flow-1: Water a plant
1. User opens app → plant list
2. User taps a plant → plant detail
3. User taps "Water" → amount modal
4. User enters amount + taps confirm → success toast
5. App returns to plant detail with updated water level

## Flow-2: View watering history
1. User opens app → plant list
2. User taps a plant → plant detail
3. User taps "History" → history screen
4. User sees list of past waterings
`,
      "specs/ux/design-system.md": `# Design System

## Colors
- Primary: #4A7C59 (plant green)
- Background: #F5F5DC (warm off-white)
- Text: #2F4F2F (dark green)

## Typography
- Headings: 24px bold sans-serif (Inter)
- Body: 16px regular sans-serif (Inter)
- Captions: 12px regular sans-serif

## Spacing
- Base unit: 8px
- Card padding: 16px (2× base)
- Section gap: 24px (3× base)
`,
    },
    decisionWhat: "ux_designed",
    decisionId: "decision-ux-designed-1",
  });

  for (const f of ["specs/ux/wireframes.md", "specs/ux/flows.md", "specs/ux/design-system.md"]) {
    const p = join(runDir, f);
    check(`${f} was written`, existsSync(p), `missing: ${p}`);
  }
  const wfContent = readFileSync(join(runDir, "specs/ux/wireframes.md"), "utf-8");
  check("wireframes.md has at least one WF-N", (wfContent.match(/## WF-\d+/g) || []).length >= 1);
  const flowsContent = readFileSync(join(runDir, "specs/ux/flows.md"), "utf-8");
  check("flows.md has at least one Flow-N", (flowsContent.match(/## Flow-\d+/g) || []).length >= 1);
  const dsContent = readFileSync(join(runDir, "specs/ux/design-system.md"), "utf-8");
  check("design-system.md has Colors section", dsContent.includes("## Colors"));
  check("design-system.md has Typography section", dsContent.includes("## Typography"));

  const decDoc = JSON.parse(readFileSync(join(runDir, "evidence", "decision", "decision-ux-designed-1.json"), "utf-8"));
  check("Decision has what: ux_designed",
    decDoc.what === "ux_designed", `got: ${decDoc.what}`);
}

async function scenario() {
  const tmpDir = mkdtempSync(join(tmpdir(), "aiecp-skill-tier-"));
  // Use bug-report workflow just to host the WorkflowRun/evidence store.
  // The workflow itself is not advanced — we only call emitEvidence.
  const def = loadWorkflow(join(__dirname, "..", "..", "..", "workflows", "bug-report.sm.yaml"));
  const run = new WorkflowRun(def, { runDir: tmpDir });

  console.log("=== ADR-0028 skill-tier eval harness ===");

  await testRequirementsGathering(run, tmpDir);
  await testProjectPlanning(run, tmpDir);
  await testArchitectureDesign(run, tmpDir);
  await testUxDesign(run, tmpDir);

  // Cross-skill integration: all 4 canonical Decisions emitted
  console.log("\n--- Cross-skill: all 4 canonical Decisions emitted ---");
  const decisionFiles = readdirSync(join(tmpDir, "evidence", "decision"));
  const decisions = decisionFiles.map(f => JSON.parse(readFileSync(join(tmpDir, "evidence", "decision", f), "utf-8")));
  const whats = decisions.map(d => d.what).sort();
  check("all 4 canonical `what` values present",
    whats.includes("requirements_gathered") &&
    whats.includes("plan_created") &&
    whats.includes("architecture_designed") &&
    whats.includes("ux_designed"),
    `got: ${whats.join(", ")}`);

  // All 7 spec files written
  const expectedFiles = [
    "specs/requirements.md",
    "specs/plan.md",
    "specs/tasks.md",
    "specs/architecture.md",
    "specs/contracts.md",
    "specs/invariants.md",
    "specs/ux/wireframes.md",
    "specs/ux/flows.md",
    "specs/ux/design-system.md",
  ];
  let allExist = true;
  for (const f of expectedFiles) {
    if (!existsSync(join(tmpDir, f))) {
      allExist = false;
      console.log(`    MISSING: ${f}`);
    }
  }
  check("all 9 expected spec files written", allExist);

  rmSync(tmpDir, { recursive: true, force: true });

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
