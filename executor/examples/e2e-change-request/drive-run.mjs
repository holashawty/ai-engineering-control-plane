// End-to-end driver for change-request.sm.yaml. Feeds a scripted (but
// realistic) change-request scenario through the real WorkflowRun API —
// emits real, schema-valid Evidence Model entities at each state and
// writes a real known-failure memory entry at the terminal `report`
// state.
//
// What this proves:
//   1. change-request.sm.yaml loads cleanly through loadWorkflow
//      (structural validation, no dead ends, all states reachable).
//   2. A real WorkflowRun walks intake -> classify -> understand-current-
//      behavior -> design-change -> migrate -> verify -> document ->
//      report, emitting schema-valid evidence at every emitting state.
//   3. The broad-refactor safety gate at the `migrate` state actually
//      blocks an un-confirmed transition out of `migrate`, then
//      allows it when confirmation is supplied (advanceWithConfirmation).
//      This is the same gate bug-report uses at propose-fix/apply-fix
//      and feature-request uses at implement — proving the gate is
//      workflow-agnostic, not specific to any one workflow.
//   4. The question_economy (max_questions: 2, allowed_states:
//      [classify, design-change]) enforces correctly: one question in
//      classify and one in design-change are accepted, a third question
//      (attempted in verify, not in allowed_states) is rejected with
//      question-economy-wrong-state.
//   5. The workflow's UNIQUE structural feature — emitting TWO Expected
//      entities in one run (OLD behavior in understand-current-behavior,
//      NEW behavior in design-change) — is exercised and both persist
//      to disk with their predicates intact.
//   6. A known-failure memory entry is written at `report` documenting
//      the regression risk to users who relied on the OLD behavior
//      (change-request is the workflow most likely to introduce such
//      regressions, so this practice is most important here).
//
// What this does NOT prove: a live, multi-turn agent session driving
// the framework one tool call at a time. Same honest scope note as
// executor/examples/e2e-feature-request/README.md.

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { WorkflowRun } from "../../dist/run.js";
import { WorkflowViolation } from "../../dist/types.js";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = join(__dirname, "..", "..", "..", "workflows", "change-request.sm.yaml");

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

async function scenario() {
  const runDirParent = await mkdtemp(join(tmpdir(), "aiecp-change-request-"));
  const runDir = join(runDirParent, "evidence-and-memory");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  console.log("=== End-to-end change-request run: 'change password reset email from-address support@ -> noreply@' ===\n");
  console.log("User request: 'change the password reset email to come from noreply@ instead of support@'\n");
  console.log("(Nothing is broken — current behavior is by design, just no longer desired.)\n");

  // ------------------------------------------------------------------
  // intake -> classify
  // ------------------------------------------------------------------
  run.advance("intent_classified");
  check("state is classify", run.currentState === "classify");

  // classify: one allowed question. We model asking the user "should
  // the change take effect immediately, or behind a feature flag for
  // staged rollout?" — a decision-changing question that genuinely
  // cannot be answered by repo inspection, because it depends on the
  // user's rollout policy, not on the code.
  run.askQuestion("Should the from-address change take effect immediately, or behind a feature flag for staged rollout?");
  check("question count is 1 (under max_questions=2)", run.questions.count === 1);

  // Emit the acceptance Decision — "proceed, scope = immediate cutover"
  // (modeled per user answer: immediate, no feature flag).
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
    source: "project-intelligence.json",
    payload: {
      finding: "password reset email sending logic exists in src/email/password-reset.ts; current from-address is configured as a constant; no feature-flag infra is in use elsewhere in the project — immediate cutover is consistent with existing conventions",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-accept-change-1",
    trace_ref: "trace-classify-1",
    what: "acceptance:proceed_with_change_request",
    why: "change is to an existing behavior that was by-design (not a bug); scope = immediate cutover per user answer; classify as behavioral-contract-change (not config-only, because the documented from-address is part of the email contract with users)",
    validated: true,
    result: "accepted",
  });
  run.advance("class_known");
  check("state is understand-current-behavior", run.currentState === "understand-current-behavior");

  // ------------------------------------------------------------------
  // understand-current-behavior -> design-change
  // ------------------------------------------------------------------
  // This is the FIRST unique structural feature of change-request:
  // emit the OLD Expected — the baseline contract being superseded.
  // In feature-request, understand-existing-behavior also emits an
  // Expected, but it describes a baseline the new feature must NOT
  // break (a constraint to preserve). Here, the Expected describes
  // the OLD behavior that IS being replaced.
  await run.emitEvidence("trace", {
    id: "trace-understand-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-current-from-address-const", "event-current-test-suite-green"],
  });
  await run.emitEvidence("event", {
    id: "event-current-from-address-const",
    trace_ref: "trace-understand-1",
    ts: new Date().toISOString(),
    kind: "log_line",
    source: "grep -n 'FROM_ADDRESS' src/email/password-reset.ts",
    payload: {
      finding: "src/email/password-reset.ts:7: const FROM_ADDRESS = 'support@example.com'; — used at line 22 as the From: header when sending the reset email",
    },
  });
  await run.emitEvidence("event", {
    id: "event-current-test-suite-green",
    trace_ref: "trace-understand-1",
    ts: new Date().toISOString(),
    kind: "test_result",
    source: "npm test --silent (before any change)",
    payload: {
      result: "8 passed",
      note: "existing suite covers the reset-email send path; one test asserts the From: header equals 'support@example.com' — this assertion will need to flip after the change, since it currently encodes the OLD behavior as the contract",
    },
  });
  // OLD Expected — the baseline being superseded. predicate_kind is
  // "behavioral" (it describes what the system currently does), and
  // source_ref points at the spec section that *currently* documents
  // this OLD behavior. After the change-request completes, this spec
  // section will be updated to describe the NEW behavior, but this
  // OLD Expected persists as the historical record of what was
  // superseded.
  await run.emitEvidence("expected", {
    id: "expected-old-from-address-support",
    source_ref: "specs/spec.md#password-reset-from-address",
    predicate: "password reset email From: header is support@example.com (the OLD behavior; this Expected records the baseline being superseded by the change-request)",
    predicate_kind: "behavioral",
  });
  run.advance("current_behavior_mapped");
  check("state is design-change", run.currentState === "design-change");

  // ------------------------------------------------------------------
  // design-change -> migrate
  // ------------------------------------------------------------------
  // The design Decision: change FROM_ADDRESS constant from support@
  // to noreply@. Alternatives recorded (keep support@ as alias,
  // feature-flag rollout) with rejection reasons — for the decision
  // trace at report time.
  //
  // Second question (the design question) is permitted here: this is
  // the second of the max_questions=2 budget, and design-change is in
  // allowed_states.
  run.askQuestion("Should we keep support@example.com as an alias that forwards to noreply@ during the transition, or cut over hard (bounce/ignore replies to support@)?");
  check("question count is 2 (at max_questions=2)", run.questions.count === 2);

  await run.emitEvidence("trace", {
    id: "trace-design-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-design-choice"],
  });
  await run.emitEvidence("event", {
    id: "event-design-choice",
    trace_ref: "trace-design-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "design-decision",
    payload: {
      choice: "hard cutover — FROM_ADDRESS constant changes from 'support@example.com' to 'noreply@example.com'; no alias is kept (per user's second answer: replies to old address will bounce, accepted as the cost of clean cutover)",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-design-change-from-address",
    trace_ref: "trace-design-1",
    what: "design:change_password_reset_from_address_support_to_noreply_hard_cutover",
    why: "matches user's stated intent ('change the from-address to noreply@'); hard cutover per user's second answer (no alias, replies to support@ will bounce); consistent with the immediate-cutover decision from classify",
    validated: false, // proposal until verify confirms
    result: "pending",
    alternatives: [
      { option: "keep support@example.com as an alias that forwards to noreply@ during a transition window", rejected_because: "user answered 'hard cutover' in the design-change question; an alias adds ongoing maintenance surface with no caller asking for it" },
      { option: "feature-flag the new from-address for staged rollout", rejected_because: "user answered 'immediate' in the classify question; project has no existing feature-flag infra, so introducing one for this single change would be scope creep" },
      { option: "deprecate support@ rather than replace it (warn in logs but keep sending from support@ for one release)", rejected_because: "the user's intent is to change the behavior now, not to announce a future change; deprecation would leave the undesired behavior in place longer" },
    ],
  });
  // NEW Expected — the replacement contract. predicate_kind is
  // "behavioral" (same as the OLD Expected), and source_ref points
  // at the same spec section (which will be updated by the document
  // state to reflect the new contract). The OLD Expected and the NEW
  // Expected share a source_ref because they are two versions of the
  // same contract; they differ in predicate.
  await run.emitEvidence("expected", {
    id: "expected-new-from-address-noreply",
    source_ref: "specs/spec.md#password-reset-from-address",
    predicate: "password reset email From: header is noreply@example.com (the NEW behavior; this Expected records the replacement contract after the change-request)",
    predicate_kind: "behavioral",
  });
  run.advance("change_design_approved");
  check("state is migrate", run.currentState === "migrate");

  // ------------------------------------------------------------------
  // migrate: safety gate fires here (broad-refactor -> edit_source,
  // default policy = "ask"). Confirm an un-confirmed advance is blocked
  // BEFORE we proceed via advanceWithConfirmation.
  // ------------------------------------------------------------------
  await expectViolation(
    "un-confirmed transition out of migrate is blocked by safety gate",
    "safety-gate-needs-confirmation",
    () => run.advance("migration_complete")
  );
  check("state is still migrate after blocked attempt", run.currentState === "migrate");

  // Now simulate the human confirming and proceed.
  run.advanceWithConfirmation("migration_complete");
  check("state is verify after confirmation", run.currentState === "verify");

  // Emit the migration Decision (AI proposal, validated=false) and
  // the file_change Event. In a real run these would be emitted
  // during the migrate state, before the gate-checked advance; here
  // we emit them after the confirmed advance for narrative simplicity
  // (same pattern as e2e-feature-request/drive-run.mjs). The schema
  // permits this — Decision only requires trace_ref + what + why +
  // validated.
  await run.emitEvidence("decision", {
    id: "decision-migrate-from-address-constant",
    trace_ref: "trace-design-1",
    what: "ai_proposal:apply_patch_to_password_reset_constants",
    why: "change FROM_ADDRESS constant in src/email/password-reset.ts from 'support@example.com' to 'noreply@example.com'; update the one test that asserts the old value; no other lines touched (minimal-change principle per constitution/engineering-principles.md)",
    validated: false, // AI proposal — flipped to true only after verify
    result: "pending",
    evidence_refs: ["decision-design-change-from-address"],
  });
  await run.emitEvidence("event", {
    id: "event-migrate-file-change-code",
    trace_ref: "trace-design-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "src/email/password-reset.ts",
    payload: {
      diff_summary: "line 7: FROM_ADDRESS constant changed from 'support@example.com' to 'noreply@example.com'; no other source lines touched",
    },
  });
  await run.emitEvidence("event", {
    id: "event-migrate-file-change-test",
    trace_ref: "trace-design-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "tests/email/password-reset.test.ts",
    payload: {
      diff_summary: "updated the one assertion that encoded the OLD from-address (expected 'support@example.com') to expect 'noreply@example.com' instead; this is a flip of an existing assertion, not a new test — the NEW behavior is exercised by the same code path the OLD behavior was",
    },
  });

  // Negative test: a third question would exceed the budget. Question
  // is asked from `verify` state, which is NOT in allowed_states
  // [classify, design-change], so it is rejected for that reason
  // first (question-economy-wrong-state is the more specific
  // violation; question-economy-exceeded would also apply since we
  // are already at max_questions=2, but the wrong-state check fires
  // first in the QuestionBudget.request implementation).
  await expectViolation(
    "third question asked in verify state (not in allowed_states) is rejected",
    "question-economy-wrong-state",
    () => run.askQuestion("Should the bounce message for replies to support@ be a custom message or the default?")
  );

  // ------------------------------------------------------------------
  // verify -> document
  // ------------------------------------------------------------------
  // The direct behavioral check: actually send a password reset email
  // (or run the email-sending code path with a stubbed transport) and
  // confirm the From: header is noreply@example.com. Modeled as an
  // Actual (what the system produced) compared against the NEW
  // Expected from design-change via a Validation with
  // method=app_validation (per behavioral-verification — unit_test
  // alone would be insufficient per ADR-0010, because the suite
  // passing only confirms the assertion we just flipped; the direct
  // behavioral check on the actually-emitted email is what makes the
  // validation meaningful).
  await run.emitEvidence("trace", {
    id: "trace-verify-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-verify-send-email-result"],
  });
  await run.emitEvidence("event", {
    id: "event-verify-send-email-result",
    trace_ref: "trace-verify-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "node -e \"require('./src/email/password-reset').sendReset('user@example.com')\" (stubbed transport, captured From: header)",
    payload: {
      from_header: "noreply@example.com",
      to_header: "user@example.com",
      note: "direct behavioral check: actually invoked the send path with a stubbed transport and inspected the resulting MIME message's From: header — this is method=app_validation per behavioral-verification, NOT just 'the test suite passed'",
    },
  });
  await run.emitEvidence("actual", {
    id: "actual-from-address-noreply-post-migration",
    expected_ref: "expected-new-from-address-noreply",
    observed_value: "From: header on sent password reset email is noreply@example.com (stubbed transport captured the MIME message and read the From: header directly)",
    observation_ref: "event-verify-send-email-result",
    observed_at: new Date().toISOString(),
  });
  await run.emitEvidence("validation", {
    id: "validation-verify-from-address-change",
    expected_ref: "expected-new-from-address-noreply",
    actual_ref: "actual-from-address-noreply-post-migration",
    result: "match",
    method: "app_validation",
    evidence_refs: ["event-verify-send-email-result"],
    decision_ref: "decision-migrate-from-address-constant",
    validated_at: new Date().toISOString(),
  });
  run.advance("behavior_verified");
  check("state is document", run.currentState === "document");

  // ------------------------------------------------------------------
  // document -> report
  // ------------------------------------------------------------------
  await run.emitEvidence("event", {
    id: "event-doc-update-api",
    trace_ref: "trace-design-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "docs/api/email.md",
    payload: {
      diff_summary: "updated #password-reset-from-address section: replaced support@example.com with noreply@example.com in the documented From: header; added deprecation note ('prior to this release, password reset emails were sent from support@example.com; this was changed to noreply@example.com to clarify that the address does not accept replies')",
    },
  });
  await run.emitEvidence("event", {
    id: "event-doc-update-spec",
    trace_ref: "trace-design-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "specs/spec.md",
    payload: {
      diff_summary: "updated #password-reset-from-address section: the spec section that documented 'From: support@example.com' now documents 'From: noreply@example.com'; the OLD Expected's source_ref pointed here, and the NEW Expected's source_ref points at the same anchor (the spec evolved in place rather than spawning a new section)",
    },
  });
  run.advance("documentation_complete");
  check("state is report (terminal)", run.currentState === "report" && run.isTerminal());

  // ------------------------------------------------------------------
  // report: write known-failure memory entry documenting the
  // regression risk to users who relied on the OLD behavior.
  // ------------------------------------------------------------------
  // This is the SECOND unique structural feature of change-request:
  // it writes a known-failure memory at `report`, not because
  // anything broke, but because the change itself is the failure
  // mode for downstream users who relied on the OLD behavior. The
  // `symptom` documents what a downstream user might experience
  // (their code or workflow assuming the OLD from-address); the
  // `fix` documents how to migrate.
  //
  // Schema note: known-failure.schema.json requires `incident_ref`
  // referencing an evidence/Incident. change-request has no Incident
  // entity (only bug-report emits one). We reference the design-change
  // Decision's id here — semantically, "the change described in this
  // Decision is what makes the OLD behavior unavailable to downstream
  // users." This is a known semantic stretch: the schema was authored
  // with bug-report in mind, and a future schema revision should
  // generalize `incident_ref` to "source-of-failure-knowledge_ref"
  // or similar so it can reference a Decision (not just an Incident)
  // for non-bug-report workflows. For now, the reference is to a real
  // Evidence entity that captures the root cause.
  await run.writeMemory("known-failure", {
    id: "mem-known-failure-password-reset-from-address-change-2026-08-14",
    type: "known-failure",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "change-request-run-1",
    incident_ref: "decision-design-change-from-address",
    symptom: "downstream code or workflows that hard-coded 'support@example.com' as the password reset email's From: header (e.g. allow-list filters, reply-automation, sender reputation monitoring) will see the From: header change to 'noreply@example.com' and may misclassify, filter, or fail to match the new address",
    root_cause: "change-request changed the password reset email From: header from support@example.com to noreply@example.com (hard cutover, no alias kept) — the OLD behavior was by-design and was the shipped contract; downstream users may have built on it",
    fix: "downstream users relying on the OLD from-address should update their allow-lists/filters/automation to noreply@example.com; reply-automation that assumed a monitored inbox should be removed (noreply@ does not accept replies); see specs/spec.md#password-reset-from-address for the new contract",
  });

  // ------------------------------------------------------------------
  // Final assertions: the run produced the expected evidence trail
  // ------------------------------------------------------------------
  check("exactly 2 questions were asked", run.questions.count === 2);
  check("log has entries for every transition + evidence + gate check", run.log.length > 15);

  // Confirm the run wrote real evidence files to disk (not just logged
  // them in memory) — the EvidenceStore validates and persists each one.
  const evidenceKinds = ["trace", "event", "decision", "expected", "actual", "validation"];
  for (const kind of evidenceKinds) {
    const dir = join(runDir, "evidence", kind);
    const files = await readdir(dir).catch(() => []);
    check(`evidence/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  const memoryKinds = ["known-failure"];
  for (const kind of memoryKinds) {
    const dir = join(runDir, "memory", kind);
    const files = await readdir(dir).catch(() => []);
    check(`memory/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  // Spot-check that the TWO Expected entities — the unique structural
  // feature of change-request — both persisted with their predicates
  // intact, and that they describe DIFFERENT behaviors (the OLD
  // support@ baseline vs the NEW noreply@ contract).
  const persistedOldExpected = JSON.parse(
    await readFile(join(runDir, "evidence", "expected", "expected-old-from-address-support.json"), "utf-8")
  );
  check(
    "OLD Expected persisted (predicate mentions support@, baseline being superseded)",
    persistedOldExpected.predicate.includes("support@example.com") &&
      persistedOldExpected.predicate.toLowerCase().includes("old")
  );

  const persistedNewExpected = JSON.parse(
    await readFile(join(runDir, "evidence", "expected", "expected-new-from-address-noreply.json"), "utf-8")
  );
  check(
    "NEW Expected persisted (predicate mentions noreply@, replacement contract)",
    persistedNewExpected.predicate.includes("noreply@example.com") &&
      persistedNewExpected.predicate.toLowerCase().includes("new")
  );

  check(
    "OLD and NEW Expected have the SAME source_ref (same spec section, evolved in place)",
    persistedOldExpected.source_ref === persistedNewExpected.source_ref
  );

  check(
    "OLD and NEW Expected have DIFFERENT predicates (baseline vs replacement)",
    persistedOldExpected.predicate !== persistedNewExpected.predicate
  );

  // Spot-check that the migrate Decision (AI proposal) persisted with
  // validated=false — the AI-output validation pattern. verify would
  // flip it only if we re-emitted it after the Validation; we did not,
  // so it stays false (the Validation references it via decision_ref,
  // but does not mutate the Decision itself).
  const persistedMigrateDecision = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-migrate-from-address-constant.json"), "utf-8")
  );
  check(
    "persisted migrate Decision has validated=false (AI proposal, awaiting verify to flip)",
    persistedMigrateDecision.validated === false && persistedMigrateDecision.what.startsWith("ai_proposal:")
  );

  // Spot-check that the design-change Decision persisted with its
  // alternatives array intact — the decision trace at report time
  // depends on it.
  const persistedDesignDecision = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-design-change-from-address.json"), "utf-8")
  );
  check(
    "persisted design-change Decision has >=3 alternatives recorded (for decision trace)",
    Array.isArray(persistedDesignDecision.alternatives) &&
      persistedDesignDecision.alternatives.length >= 3
  );

  // Spot-check that the known-failure memory entry persisted with
  // the right shape — incident_ref references the design-change
  // Decision (see comment above on the semantic stretch).
  const persistedKnownFailure = JSON.parse(
    await readFile(join(runDir, "memory", "known-failure", "mem-known-failure-password-reset-from-address-change-2026-08-14.json"), "utf-8")
  );
  check(
    "persisted known-failure memory references the design-change Decision (incident_ref stretch)",
    persistedKnownFailure.incident_ref === "decision-design-change-from-address" &&
      persistedKnownFailure.symptom.includes("support@example.com") &&
      persistedKnownFailure.fix.includes("noreply@example.com")
  );

  // Cleanup
  await rm(runDirParent, { recursive: true, force: true });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.error("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
  console.log("");
  console.log("Proof summary:");
  console.log("- change-request.sm.yaml loads through the real executor");
  console.log("- A full WorkflowRun walks all 8 non-terminal states + 1 terminal (report)");
  console.log("- Schema-valid evidence emitted at every emitting state (8 of 9 states)");
  console.log("- TWO Expected entities emitted (OLD support@ + NEW noreply@) — change-request's unique structural feature");
  console.log("- broad-refactor safety gate at `migrate` blocks un-confirmed advance, allows confirmed");
  console.log("- question_economy enforces max_questions=2 and allowed_states=[classify,design-change]");
  console.log("- Negative test: third question in `verify` state correctly rejected as wrong-state");
  console.log("- All evidence persisted to disk as JSON (would have thrown on schema violation)");
  console.log("- known-failure memory entry written at `report` documenting regression risk to users of OLD behavior");
}

scenario().catch((err) => {
  console.error("E2E DRIVER FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
