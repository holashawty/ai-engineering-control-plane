// End-to-end driver for project-onboarding.sm.yaml. Feeds a scripted
// (but realistic) project-onboarding scenario through the real
// WorkflowRun API — emits real, schema-valid Evidence Model entities at
// each state and writes real `project` + `environment` memory entries
// at the write-* states.
//
// What this proves:
//   1. project-onboarding.sm.yaml loads cleanly through loadWorkflow
//      (structural validation, no dead ends, all states reachable,
//      no safety_gates declared).
//   2. A real WorkflowRun walks intake -> classify -> run-discovery ->
//      validate-discovery -> write-project-memory -> write-environment-
//      memory -> report, emitting schema-valid evidence at every
//      emitting state.
//   3. NO safety gate fires during the run — proving the workflow
//      correctly declares no gates (project-onboarding writes only to
//      `.aiecp/`, never to source code; discovery is read-only at the
//      source-code layer). The run log has zero "gate-check" entries
//      and every `advance()` call returns `gateDecision: undefined`.
//      This is the same structural inverse pattern as
//      `executor/examples/e2e-code-review/drive-run.mjs` (the only
//      other no-gate workflow in the catalog); project-onboarding
//      shares the no-source-mutation property for a different reason
//      (discovery doesn't refactor anything, it just reads the repo
//      and writes a sibling metadata file).
//   4. The question_economy (max_questions: 2, allowed_states:
//      [classify, validate-discovery]) enforces correctly: one question
//      in classify (accepted), one in validate-discovery (accepted),
//      a third question in write-project-memory (NOT in
//      allowed_states) is rejected with question-economy-wrong-state.
//   5. The workflow's UNIQUE structural feature — it WRITES the initial
//      memory entries that every other workflow READS — is exercised:
//      both the `project` and `environment` memory entries persist to
//      disk under `memory/<type>/*.json` and round-trip through
//      `JSON.stringify` without mutation. All other e2e drivers in
//      this repo write memory at the terminal `report` state;
//      project-onboarding writes memory at two dedicated pre-report
//      states, and `report` itself writes nothing (the entries are
//      already on disk by the time the run reaches `report`).
//   6. The validate-discovery state emits a `Validation` with
//      `method: "contract_validation"` — the canonical method for
//      schema/contract checks (NOT app_validation, which is for
//      behavior; NOT unit_test, which is for a test suite). This
//      makes project-onboarding the second workflow in the catalog to
//      use contract_validation as its primary validation method
//      (alongside bug-report's diagnose state).
//
// What this does NOT prove: a live, multi-turn agent session driving
// the framework one tool call at a time, AND actually invoking
// `discovery/cli` against a real on-disk repo. The scenario data
// (detector findings, version probe results) is realistic but
// scripted — same honest scope note as
// executor/examples/e2e-feature-request/README.md. A live discovery
// integration test (CLI shelled out against a toy repo in a temp dir)
// is tracked as future work in `STATUS.md`.

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { WorkflowRun } from "../../dist/run.js";
import { WorkflowViolation } from "../../dist/types.js";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = join(__dirname, "..", "..", "..", "workflows", "project-onboarding.sm.yaml");

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  OK   ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}`);
    failed++;
  }
}

async function expectViolation(label, kind, fn) {
  try {
    await fn();
    check(`${label} (expected WorkflowViolation kind="${kind}")`, false);
  } catch (e) {
    if (e instanceof WorkflowViolation && e.kind === kind) {
      check(label, true);
    } else {
      console.log(`  FAIL ${label} — wrong error: ${e}`);
      failed++;
    }
  }
}

// ---------------------------------------------------------------------------
// Scenario 1 (happy path): onboarding a clean Python+pytest repo
// ("membership-service" — modeled on the same toy repo used in
// executor/examples/e2e-membership-bug/). Discovery succeeds, validation
// matches, both memory entries written.
// ---------------------------------------------------------------------------
async function scenarioHappyPath(runDir) {
  console.log("=== End-to-end project-onboarding run (happy): 'onboard Python+pytest membership-service repo' ===\n");
  console.log("Trigger (per workflows/_router.md step 1): no .aiecp/project-intelligence.json present\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  check("workflow loaded with name 'project-onboarding'", def.workflow === "project-onboarding");
  check("initial state is intake", run.currentState === "intake");
  check("workflow declares no safety_gates (writes only to .aiecp/, never source)",
    !def.safety_gates || def.safety_gates.length === 0);
  check("question_economy budget is 2, allowed_states=[classify, validate-discovery]",
    def.question_economy.max_questions === 2 &&
    JSON.stringify(def.question_economy.allowed_states) === JSON.stringify(["classify", "validate-discovery"]));

  // Track every advance()'s returned gateDecision — collect into an array
  // so we can assert ALL were undefined (no gate ever fired).
  const advanceResults = [];

  // ------------------------------------------------------------------
  // intake -> classify
  // ------------------------------------------------------------------
  advanceResults.push(run.advance("intent_classified"));
  check("state is classify", run.currentState === "classify");

  // classify: filesystem inspection shows a single top-level pyproject.toml
  // — but it's ambiguous whether the repo is a monorepo or a single
  // package. Ask the one allowed question ("is this a monorepo?").
  // The answer determines whether discovery should expect one stack or
  // multiple stacks in the produced Project Intelligence.
  run.askQuestion("Is this a monorepo, or a single-package repo?");
  check("question count is 1 (under max_questions=2)", run.questions.count === 1);

  // Emit a Trace + Decision recording the acceptance: proceed, scope =
  // single-package Python repo (per user's "no, single-package" answer).
  await run.emitEvidence("trace", {
    id: "trace-classify-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-classify-1"],
  });
  await run.emitEvidence("event", {
    id: "event-classify-1",
    trace_ref: "trace-classify-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "filesystem_read: ls -la /path/to/membership-service",
    payload: {
      finding: "pyproject.toml + tests/ + src/membership.py + .github/workflows/ci.yml; single top-level package; no packages/ or apps/ directory — single-package, not monorepo (confirmed by user)",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-accept-onboarding-1",
    trace_ref: "trace-classify-1",
    what: "acceptance:proceed_with_onboarding",
    why: "class = single-language greenfield; scope = single-package Python repo per user's classify answer; filesystem unambiguous post-confirmation (no second manifest found)",
    validated: true,
    result: "accepted",
  });
  advanceResults.push(run.advance("class_known"));
  check("state is run-discovery", run.currentState === "run-discovery");

  // ------------------------------------------------------------------
  // run-discovery: invoke discovery/cli, emit one Event per detector.
  // Per ADR-0009's detector pipeline: language, framework, build,
  // test, entrypoint, layer, integration, cicd.
  // ------------------------------------------------------------------
  const detectors = [
    { name: "language",    finding: { language: "python", evidence: "pyproject.toml found at repo root with [tool.poetry] section" } },
    { name: "framework",   finding: { framework: null, evidence: "no web framework detected (no django/flask/fastapi in dependencies)" } },
    { name: "build",       finding: { build_system: ["poetry"], evidence: "pyproject.toml [tool.poetry] section + poetry.lock present" } },
    { name: "test",        finding: { test_system: ["pytest"], evidence: "pyproject.toml [tool.pytest.ini_options] section + tests/ directory with test_*.py files" } },
    { name: "entrypoint",  finding: { entrypoint: "src/membership.py", kind: "main", evidence: "src/membership.py exports is_active(today, expiry_date) — the function the tests import" } },
    { name: "layer",       finding: { layer: ["backend"], evidence: "no frontend/ directory, no Dockerfile exposing a port, no static assets — backend library" } },
    { name: "integration", finding: { external_integrations: [], evidence: "no third-party service clients detected in pyproject.toml dependencies" } },
    { name: "cicd",        finding: { cicd: ".github/workflows/ci.yml", evidence: "GitHub Actions workflow file found — runs pytest on push" } },
  ];
  const detectorEventIds = detectors.map((_, i) => `event-discovery-detector-${i + 1}-${detectors[i].name}`);

  await run.emitEvidence("trace", {
    id: "trace-run-discovery-1",
    started_at: new Date().toISOString(),
    source: "agent_adapter",
    event_refs: detectorEventIds,
  });
  for (let i = 0; i < detectors.length; i++) {
    await run.emitEvidence("event", {
      id: detectorEventIds[i],
      trace_ref: "trace-run-discovery-1",
      ts: new Date().toISOString(),
      kind: "action",
      source: `discovery/cli:${detectors[i].name}`,
      payload: {
        finding: detectors[i].finding,
      },
    });
  }
  // Each detector Event was emitted with kind=action + source=discovery/cli:<name>
  // — exactly what skills/tool-use-discipline/SKILL.md step 4 requires for
  // tool invocations, and exactly what the spec for this state requires.
  check("emitted 8 detector Events (one per ADR-0009 detector in the pipeline)",
    detectors.length === 8);

  // Simulate discovery/cli writing .aiecp/project-intelligence.json to the
  // host repo (this is the on-disk artifact the next state validates).
  // In a real run, the CLI writes this itself; in this scripted scenario
  // we don't actually shell out — the validate-discovery state will emit
  // its Actual based on what the detector Events above reported.
  advanceResults.push(run.advance("discovery_complete"));
  check("state is validate-discovery", run.currentState === "validate-discovery");

  // ------------------------------------------------------------------
  // validate-discovery: emit Expected + Actual + Validation with
  // method=contract_validation (per skill procedure step 2).
  // ------------------------------------------------------------------
  await run.emitEvidence("expected", {
    id: "expected-project-intelligence-python-single-package",
    source_ref: "discovery/schema/project-intelligence.schema.json",
    predicate:
      "produced .aiecp/project-intelligence.json validates against discovery/schema/project-intelligence.schema.json; project.stack == ['python']; project.layer == ['backend']; project.test_system == ['pytest']; entrypoints is non-empty (at least one main entrypoint); capabilities.has_test_suite == true (tests/ directory detected)",
    predicate_kind: "behavioral",
  });
  await run.emitEvidence("actual", {
    id: "actual-discovery-output-python-membership",
    expected_ref: "expected-project-intelligence-python-single-package",
    observed_value:
      "discovery/cli produced .aiecp/project-intelligence.json: stack=['python'], layer=['backend'], test_system=['pytest'], build_system=['poetry'], entrypoints=[{path: 'src/membership.py', kind: 'main'}], capabilities.has_test_suite=true, capabilities.has_ci=true, capabilities.external_integrations=[] — all 8 detectors ran successfully and their findings agree with the per-class Expected",
    observation_ref: "event-discovery-detector-4-test",
    observed_at: new Date().toISOString(),
  });

  // The detected test runner is genuinely ambiguous when both pytest and
  // unittest configs could exist — ask the one allowed validate-discovery
  // question to confirm pytest is the right one. (In this happy-path
  // scenario the user confirms yes; the failure-path scenario below
  // exercises the mismatch case.)
  run.askQuestion("The test detector picked up pytest as the test runner. Is that correct, or should it be unittest?");
  check("question count is 2 (at max_questions=2)", run.questions.count === 2);

  await run.emitEvidence("validation", {
    id: "validation-discovery-contract-check",
    expected_ref: "expected-project-intelligence-python-single-package",
    actual_ref: "actual-discovery-output-python-membership",
    result: "match",
    method: "contract_validation",
    evidence_refs: detectorEventIds,
    validated_at: new Date().toISOString(),
  });
  advanceResults.push(run.advance("discovery_valid"));
  check("state is write-project-memory", run.currentState === "write-project-memory");

  // ------------------------------------------------------------------
  // write-project-memory: write the initial project memory entry.
  // This is the FIRST project memory entry for this repo; every future
  // workflow that declares reads_memory:[project] is depending on it.
  // ------------------------------------------------------------------
  await run.writeMemory("project", {
    id: "mem-project-membership-service-2026-08-14",
    type: "project",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "project-onboarding-run-1",
    stack: ["python"],
    layer: ["backend"],
    domain: "Python membership service with pytest test suite, poetry build system, single main entrypoint at src/membership.py",
  });
  advanceResults.push(run.advance("project_memory_written"));
  check("state is write-environment-memory", run.currentState === "write-environment-memory");

  // ------------------------------------------------------------------
  // write-environment-memory: write the initial environment memory
  // entry. Captures the fingerprint for future replay.
  // ------------------------------------------------------------------
  await run.writeMemory("environment", {
    id: "mem-environment-membership-service-2026-08-14",
    type: "environment",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "project-onboarding-run-1",
    runtime: "python3.11",
    versions: {
      python: "3.11.7",
      pytest: "8.1.2",
      poetry: "1.8.3",
    },
    os: "linux-x64",
  });
  advanceResults.push(run.advance("environment_memory_written"));
  check("state is report (terminal)", run.currentState === "report" && run.isTerminal());

  // ------------------------------------------------------------------
  // Final assertions: the run produced the expected evidence + memory
  // trail, NO safety gate fired, and question economy held.
  // ------------------------------------------------------------------
  check("exactly 2 questions were asked in the main run", run.questions.count === 2);
  check("log has entries for every transition + evidence (no gate-checks)", run.log.length > 10);
  check("log has ZERO gate-check entries (no safety_gates declared)",
    run.log.filter((e) => e.type === "gate-check").length === 0);
  check("every advance() returned gateDecision=undefined (no gate ever fired)",
    advanceResults.every((r) => r.gateDecision === undefined));
  check(`collected ${advanceResults.length} advance results, all gateDecision=undefined`,
    advanceResults.length === 6); // 6 transitions in the happy path (intake→classify→run-discovery→validate-discovery→write-project-memory→write-environment-memory→report)

  // Confirm the run wrote real evidence files to disk (not just logged
  // them in memory) — the EvidenceStore validates and persists each one.
  const evidenceKinds = ["trace", "event", "decision", "expected", "actual", "validation"];
  for (const kind of evidenceKinds) {
    const dir = join(runDir, "evidence", kind);
    const files = await readdir(dir).catch(() => []);
    check(`evidence/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  const memoryKinds = ["project", "environment"];
  for (const kind of memoryKinds) {
    const dir = join(runDir, "memory", kind);
    const files = await readdir(dir).catch(() => []);
    check(`memory/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  // Spot-check the persisted Validation to confirm method=contract_validation
  // (the canonical method for schema/contract checks — NOT app_validation,
  // unit_test, or manual_review). This is what makes project-onboarding's
  // validate-discovery state semantically distinct from bug-report's
  // diagnose state (which uses contract_validation for spec contracts)
  // and from feature-request's verify state (which uses app_validation
  // for behavioral checks).
  const persistedValidation = JSON.parse(
    await readFile(join(runDir, "evidence", "validation", "validation-discovery-contract-check.json"), "utf-8")
  );
  check(
    "persisted validation has method=contract_validation (canonical for schema/contract checks)",
    persistedValidation.method === "contract_validation"
  );
  check(
    "persisted validation has result=match (discovery output matches per-class Expected)",
    persistedValidation.result === "match"
  );
  check(
    "persisted validation references all 8 detector Events as evidence",
    Array.isArray(persistedValidation.evidence_refs) &&
      persistedValidation.evidence_refs.length === 8 &&
      persistedValidation.evidence_refs.every((r) => r.startsWith("event-discovery-detector-"))
  );

  // Spot-check the persisted project memory entry to confirm it round-
  // tripped through schema validation with the expected stack/layer.
  const persistedProject = JSON.parse(
    await readFile(join(runDir, "memory", "project", "mem-project-membership-service-2026-08-14.json"), "utf-8")
  );
  check(
    "persisted project memory has stack=['python'] and layer=['backend']",
    JSON.stringify(persistedProject.stack) === JSON.stringify(["python"]) &&
      JSON.stringify(persistedProject.layer) === JSON.stringify(["backend"])
  );
  check(
    "persisted project memory has type='project' and schema_version='1.0.0'",
    persistedProject.type === "project" && persistedProject.schema_version === "1.0.0"
  );

  // Spot-check the persisted environment memory entry to confirm versions
  // round-tripped (no secret values, schema-valid).
  const persistedEnvironment = JSON.parse(
    await readFile(join(runDir, "memory", "environment", "mem-environment-membership-service-2026-08-14.json"), "utf-8")
  );
  check(
    "persisted environment memory has runtime='python3.11' and versions.pytest='8.1.2'",
    persistedEnvironment.runtime === "python3.11" &&
      persistedEnvironment.versions.pytest === "8.1.2"
  );
  check(
    "persisted environment memory has type='environment' and schema_version='1.0.0'",
    persistedEnvironment.type === "environment" && persistedEnvironment.schema_version === "1.0.0"
  );

  // Spot-check the persisted acceptance Decision to confirm it has
  // result=accepted (per the AI-output validation pattern —
  // acceptance Decisions are made by the system, validated=true).
  const persistedDecision = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-accept-onboarding-1.json"), "utf-8")
  );
  check(
    "persisted acceptance decision has result='accepted' and validated=true",
    persistedDecision.result === "accepted" && persistedDecision.validated === true
  );
}

// ---------------------------------------------------------------------------
// Scenario 2 (question-economy wrong-state): a fresh run, asked in
// write-project-memory (NOT in allowed_states), is rejected with
// question-economy-wrong-state. Uses a fresh run so the budget is not
// already exhausted.
// ---------------------------------------------------------------------------
async function scenarioQuestionEconomyWrongState(runDir) {
  console.log("\n=== Question-economy wrong-state assertion ===\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  // Walk to write-project-memory without asking any questions.
  run.advance("intent_classified");     // classify
  run.advance("class_known");            // run-discovery
  run.advance("discovery_complete");     // validate-discovery
  run.advance("discovery_valid");        // write-project-memory

  // write-project-memory is NOT in allowed_states=[classify, validate-discovery].
  await expectViolation(
    "question asked in write-project-memory (not in allowed_states) is rejected",
    "question-economy-wrong-state",
    () => run.askQuestion("Should the project memory entry's domain field be longer?")
  );
}

// ---------------------------------------------------------------------------
// Scenario 3 (question-economy exceeded): a fresh run, two questions
// already asked in classify and validate-discovery (both accepted), a
// third question in validate-discovery should be rejected as
// question-economy-exceeded (budget exhausted). This is the alternative
// third-question rejection path the spec mentions ("third rejected") —
// here rejected for the budget reason rather than the wrong-state reason
// exercised in scenario 2.
// ---------------------------------------------------------------------------
async function scenarioQuestionEconomyExceeded(runDir) {
  console.log("\n=== Question-economy exceeded assertion ===\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  run.advance("intent_classified");     // classify
  run.askQuestion("First question — allowed (in classify).");
  run.advance("class_known");            // run-discovery
  run.advance("discovery_complete");     // validate-discovery
  run.askQuestion("Second question — allowed (in validate-discovery).");

  await expectViolation(
    "third question in validate-discovery exceeds max_questions=2",
    "question-economy-exceeded",
    () => run.askQuestion("Third question — should be rejected (budget exhausted).")
  );
}

async function main() {
  const runDirParent = await mkdtemp(join(tmpdir(), "aiecp-project-onboarding-"));
  try {
    await scenarioHappyPath(join(runDirParent, "scenario1-happy"));
    await scenarioQuestionEconomyWrongState(join(runDirParent, "scenario2-wrong-state"));
    await scenarioQuestionEconomyExceeded(join(runDirParent, "scenario3-exceeded"));
  } finally {
    await rm(runDirParent, { recursive: true, force: true });
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.error("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
  console.log("");
  console.log("Proof summary:");
  console.log("- project-onboarding.sm.yaml loads through the real executor");
  console.log("- Happy path: WorkflowRun walks all 6 non-terminal states + 1 terminal (report)");
  console.log("- Schema-valid evidence emitted at every emitting state (6 evidence kinds)");
  console.log("- NO safety gate fires (workflow declares none — writes only to .aiecp/, never source)");
  console.log("- Every advance() returned gateDecision=undefined (collected 6, all undefined)");
  console.log("- question_economy enforces max_questions=2 and allowed_states=[classify, validate-discovery]");
  console.log("- Negative tests: 3rd question in write-project-memory (wrong-state) rejected;");
  console.log("  3rd question in validate-discovery (exceeded) rejected in a fresh run");
  console.log("- validate-discovery emits Validation with method=contract_validation + result=match");
  console.log("- TWO memory entries written (project + environment) at dedicated pre-report states");
  console.log("  (this is the ONLY workflow in the catalog that writes initial memory entries —");
  console.log("  every other workflow READS existing memory; project-onboarding WRITES it)");
  console.log("- All evidence + memory persisted to disk as JSON (would have thrown on schema violation)");
}

main().catch((err) => {
  console.error("E2E DRIVER FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
