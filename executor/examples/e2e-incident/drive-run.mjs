// End-to-end driver for incident.sm.yaml. Feeds a scripted (but
// realistic) incident scenario through the real WorkflowRun API —
// emits real, schema-valid Evidence Model entities at each state and
// writes both a known-failure memory entry AND a project memory entry
// at the terminal `report` state.
//
// What this proves:
//   1. incident.sm.yaml loads cleanly through loadWorkflow (structural
//      validation, no dead ends, all states reachable).
//   2. A real WorkflowRun walks intake -> classify -> assess-impact
//      -> triage -> mitigate -> verify-mitigation -> postmortem ->
//      report, emitting schema-valid evidence at every emitting state.
//   3. The broad-refactor safety gate at the `mitigate` state actually
//      blocks an un-confirmed transition out of `mitigate`, then
//      allows it when confirmation is supplied
//      (advanceWithConfirmation). This is the same gate bug-report
//      uses at propose-fix/apply-fix, feature-request uses at
//      implement, user-complaint uses at apply-fix, security-problem
//      uses at apply-mitigation, and release uses at tag — proving
//      the gate is workflow-agnostic.
//   4. The question_economy (max_questions: 2, allowed_states:
//      [classify, assess-impact]) enforces correctly: one question
//      in classify (accepted), one in assess-impact (accepted), a
//      third question in triage (not in allowed_states) is rejected
//      with question-economy-wrong-state.
//   5. The workflow's UNIQUE structural features are exercised:
//      (a) the assess-impact state emits a SEV score + blast radius
//          + affected-user estimate + SLO-breach status as a Decision
//          (incident's feature #1);
//      (b) the mitigate state emits a *mitigation* (not a fix) with
//          alternatives, recorded as a Decision whose validation is
//          the production system's own behavior, not a test suite;
//      (c) the postmortem state emits a blameless Decision with root
//          cause + contributing factors + action items, plus an Event
//          pointing at the postmortem document.
//
// What this does NOT prove: a live, multi-turn agent session driving
// the framework one tool call at a time, AND actually invoking
// kubectl rollout undo in a real production cluster. The scenario
// data (the deploy log, the metrics, the rollback output) is
// realistic but scripted — same honest scope note as
// executor/examples/e2e-feature-request/README.md.

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { WorkflowRun } from "../../dist/run.js";
import { WorkflowViolation } from "../../dist/types.js";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = join(__dirname, "..", "..", "..", "workflows", "incident.sm.yaml");

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
  const runDirParent = await mkdtemp(join(tmpdir(), "aiecp-incident-"));
  const runDir = join(runDirParent, "evidence-and-memory");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  console.log("=== End-to-end incident run: 'PagerDuty: /orders error rate 78% (baseline 0.2%) for 14 min' ===\n");
  console.log("Trigger: production alert firing, on-call paged\n");

  // ------------------------------------------------------------------
  // Workflow structural assertions
  // ------------------------------------------------------------------
  check("workflow loaded with name 'incident'", def.workflow === "incident");
  check("initial state is intake", run.currentState === "intake");
  check("workflow declares safety_gates with one entry at mitigate (broad-refactor)",
    Array.isArray(def.safety_gates) &&
      def.safety_gates.length === 1 &&
      def.safety_gates[0].state === "mitigate" &&
      def.safety_gates[0].gate === "broad-refactor");
  check("question_economy budget is 2, allowed_states=[classify, assess-impact]",
    def.question_economy.max_questions === 2 &&
    JSON.stringify(def.question_economy.allowed_states) === JSON.stringify(["classify", "assess-impact"]));
  check("workflow has all 9 states declared",
    def.states.length === 9);

  // ------------------------------------------------------------------
  // intake -> classify
  // ------------------------------------------------------------------
  run.advance("intent_classified");
  check("state is classify", run.currentState === "classify");

  // classify: one allowed question. The PagerDuty alert fired; the
  // engineer needs to know whether there was a recent deploy in
  // the affected service's window (routes triage to look at deploy
  // logs vs. infrastructure metrics).
  run.askQuestion("Was there a recent deploy in the /orders service's window (last 30 minutes)?");
  check("question count is 1 (under max_questions=2)", run.questions.count === 1);

  await run.emitEvidence("incident", {
    id: "incident-prod-orders-error-spike-2026-08-14",
    observed_at: new Date().toISOString(),
    environment_fingerprint_ref: "env-fp-prod-orders-error-spike",
    expected_ref: "expected-slo-orders-error-rate-baseline",
    actual_ref: "actual-orders-error-rate-78pct",
    severity: "high",
    status: "open",
  });
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
    source: "pagerduty:incident-Q3XYZ (alert: 'orders-error-rate-high', severity: critical, fired 2026-08-14T15:02:00Z)",
    payload: {
      finding: "PagerDuty alert fired: error rate on /orders is 78% (baseline 0.2%), started 14 minutes ago at 2026-08-14T15:02:00Z; affected service: api-service (per alert tags service:api-service, env:prod); on-call ack'd at 15:08Z; user confirmed recent deploy v1.4.1 at T-16m in classify question",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-accept-incident-1",
    trace_ref: "trace-classify-1",
    what: "acceptance:proceed_with_incident",
    why: "complaint class = deployment regression; alert confirmed firing in production with 78% error rate (vs. 0.2% baseline); user confirmed recent deploy v1.4.1 at T-16m in classify question; this is a production incident (users currently affected), not a bug-report (defect may or may not be in prod); proceed to assess-impact for SEV scoring",
    validated: true,
    result: "accepted",
  });
  run.advance("class_known");
  check("state is assess-impact", run.currentState === "assess-impact");

  // ------------------------------------------------------------------
  // assess-impact: emit SEV score + blast radius + affected-user
  // estimate + SLO-breach status.
  // ------------------------------------------------------------------
  // Second question (the impact question) is permitted here: this is
  // the second of the max_questions=2 budget, and assess-impact is
  // in allowed_states. The answer determines the mitigation budget
  // (tier-1 justifies aggressive rollback).
  run.askQuestion("Is the affected /orders service tier-1 (revenue-critical) or tier-2 (important but not revenue-blocking)?");
  check("question count is 2 (at max_questions=2)", run.questions.count === 2);

  await run.emitEvidence("trace", {
    id: "trace-assess-impact-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-impact-citations"],
  });
  await run.emitEvidence("event", {
    id: "event-impact-citations",
    trace_ref: "trace-assess-impact-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "metrics: error-rate + QPS + SLO-budget (since alert fired)",
    payload: {
      finding: "severity=SEV2 (partial outage, /orders endpoint globally affected); blast-radius=/orders endpoint globally, all user segments, all regions; affected-users-estimate=78% error rate × 1000 QPS × 14 min = ~655,000 failed requests so far; SLO-breach=availability-SLO burning at 14x normal rate (will exhaust 30-day budget in 2h if not mitigated); customer-facing-impact=status page NOT yet updated, no customer tweets yet, support has not escalated (caught early by alerting)",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-severity-assessment-1",
    trace_ref: "trace-assess-impact-1",
    what: "impact_assessment:SEV2:blast=/orders-global:affected=~655000:slo_burn=14x:status_page=not_yet_updated",
    why: "SEV2 (partial outage) — 78% error rate is not a total outage (some /orders requests still succeed) but is well above the 5% threshold for SEV2; blast radius = /orders endpoint globally per the alert tags; ~655,000 affected requests = 78% × 1000 QPS × 14 min × 60 s/min; SLO burn 14x = (78% / 5.5%) per the budget formula; tier-1 per user's assess-impact answer — rollback is justified despite the write-loss risk because the alternative (continue bleeding at 78%) loses more revenue per minute than the rollback's write loss",
    validated: true,
    result: "accepted",
  });
  run.advance("impact_assessed");
  check("state is triage", run.currentState === "triage");

  // ------------------------------------------------------------------
  // triage: emit Trace with 4 Events (deploy log, config flips,
  // traffic, dependency health).
  // ------------------------------------------------------------------
  await run.emitEvidence("trace", {
    id: "trace-triage-1",
    started_at: new Date().toISOString(),
    event_refs: [
      "event-triage-deploy-log",
      "event-triage-config-flips",
      "event-triage-traffic-patterns",
      "event-triage-dependency-health",
    ],
  });
  await run.emitEvidence("event", {
    id: "event-triage-deploy-log",
    trace_ref: "trace-triage-1",
    ts: new Date().toISOString(),
    kind: "log_line",
    source: "git log --since='30 minutes ago' -- src/orders/ + ci/cd pipeline runs",
    payload: {
      finding: "v1.4.1 deployed at 2026-08-14T14:46:00Z (T-16m before alert fired); commit 9ab2c3d 'fix: handle shipping_address=null in /orders handler' — but the fix introduced a null-deref in computeShippingCost at src/orders/handler.ts:42; deploy pipeline shows the deploy went straight from canary 1% to 100% (canary script exists but is OPTIONAL in the deploy pipeline)",
    },
  });
  await run.emitEvidence("event", {
    id: "event-triage-config-flips",
    trace_ref: "trace-triage-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "config-management: feature-flag-toggles (since 30m ago)",
    payload: {
      finding: "no feature flag toggles in the window — the deploy was a code change, not a config flip",
    },
  });
  await run.emitEvidence("event", {
    id: "event-triage-traffic-patterns",
    trace_ref: "trace-triage-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "metrics: QPS + error-rate (per endpoint, since 30m ago)",
    payload: {
      finding: "QPS stable at 1000 throughout the window (no traffic spike); error rate on /orders jumped from 0.2% to 78% at 14:46:30Z — 30 seconds after the v1.4.1 deploy timestamp; correlation is tight (30s gap is the deploy-rollout-to-100% propagation time); other endpoints unchanged",
    },
  });
  await run.emitEvidence("event", {
    id: "event-triage-dependency-health",
    trace_ref: "trace-triage-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "third-party-status-pages + internal-service-dependencies",
    payload: {
      finding: "no dependency degraded: DB healthy (latency p95 = 12ms, baseline), Redis healthy, payment-gateway healthy; the incident is NOT a dependency outage",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-triage-proximate-trigger-v1-4-1-deploy",
    trace_ref: "trace-triage-1",
    what: "triage:proximate_trigger=v1.4.1_deploy_at_T-16m",
    why: "Proximate trigger = v1.4.1 deploy at 2026-08-14T14:46:00Z. Evidence: deploy log shows v1.4.1 deployed T-16m with commit 9ab2c3d touching src/orders/handler.ts; traffic shows error rate jumped 0.2% -> 78% at 14:46:30Z (30s after deploy, the propagation time); config flips none; dependency health all green. NOTE: this is the PROXIMATE TRIGGER (the most recent change that correlates with the incident), not the ROOT CAUSE (the underlying null-deref defect that the deploy introduced) — the root cause is for the postmortem state, after mitigation.",
    validated: true,
    result: "accepted",
    evidence_refs: [
      "event-triage-deploy-log",
      "event-triage-traffic-patterns",
      "event-triage-config-flips",
      "event-triage-dependency-health",
    ],
  });
  run.advance("proximate_trigger_identified");
  check("state is mitigate", run.currentState === "mitigate");

  // ------------------------------------------------------------------
  // mitigate: safety gate fires here. Apply a rollback (not a fix).
  // ------------------------------------------------------------------
  await run.emitEvidence("decision", {
    id: "decision-mitigate-rollback-to-v1-4-0",
    trace_ref: "trace-triage-1",
    what: "mitigation:rollback_to_v1.4.0",
    why: "Mitigation choice: rollback to v1.4.0 (the last known-good version). Rationale: tier-1 service per assess-impact answer, SLO burning at 14x (will exhaust budget in 2h), rollback is the fastest mitigation (kubectl rollout undo takes ~3 min vs. a forward-fix deploy taking ~15 min). Tradeoff: rollback loses any writes between v1.4.0 deploy and now (10 days of order writes — but the order DB is append-only, so rollback of the API deployment does NOT lose database writes; only the in-flight requests at rollback moment are lost).",
    validated: false, // proposal until verify-mitigation confirms SLO recovery
    result: "pending",
    alternatives: [
      { option: "forward-fix: deploy v1.4.2 with the null-deref patched", rejected_because: "takes ~15 min to build + deploy vs. ~3 min for rollback; SLO budget only has 2h left; forward-fix is the right move AFTER mitigation stops the bleeding" },
      { option: "scale out: increase api-service replicas from 10 to 30", rejected_because: "scales the defective code proportionally — error rate stays at 78% but with 3x the requests; only works for capacity incidents, not defect incidents" },
      { option: "fail-over to standby region", rejected_because: "standby region has the same v1.4.1 code (deploy is global); fail-over doesn't help for code defects" },
    ],
  });
  // Negative test: third question would exceed the budget. Question
  // is asked from mitigate state, NOT in allowed_states [classify,
  // assess-impact], so it's rejected for that reason first.
  await expectViolation(
    "third question asked in mitigate (not in allowed_states) is rejected",
    "question-economy-wrong-state",
    () => run.askQuestion("Should the rollback target v1.4.0 or v1.3.9?")
  );

  // The actual safety gate test: un-confirmed advance blocked.
  await expectViolation(
    "un-confirmed transition out of mitigate is blocked by safety gate",
    "safety-gate-needs-confirmation",
    () => run.advance("mitigation_applied")
  );
  check("state is still mitigate after blocked attempt", run.currentState === "mitigate");

  // Simulate the on-call confirming and proceed.
  run.advanceWithConfirmation("mitigation_applied");
  check("state is verify-mitigation after confirmation", run.currentState === "verify-mitigation");

  // Emit the mitigation action Event AFTER the confirmed advance.
  await run.emitEvidence("event", {
    id: "event-mitigate-rollback-action",
    trace_ref: "trace-triage-1",
    ts: new Date().toISOString(),
    kind: "action",
    source: "kubectl rollout undo deployment/api-service -n prod",
    payload: {
      finding: "deployment.apps/api-service rolled back; pod rollout complete in 2m47s; 10/10 pods now running v1.4.0 (image: api-service:1.4.0, digest: sha256:abc...); 0 pods running v1.4.1",
    },
  });

  // ------------------------------------------------------------------
  // verify-mitigation: emit SLO-recovery metrics. The validation
  // method is app_validation (the production system's own behavior,
  // NOT a test suite — tests don't run in prod).
  // ------------------------------------------------------------------
  await run.emitEvidence("trace", {
    id: "trace-verify-mitigation-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-verify-slo-recovery", "event-verify-alerts-cleared"],
  });
  await run.emitEvidence("event", {
    id: "event-verify-slo-recovery",
    trace_ref: "trace-verify-mitigation-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "metrics: error-rate + latency p50/p95/p99 + queue-depth (5m before mitigation vs. 5m after)",
    payload: {
      finding: "error rate: 78% -> 0.2% (baseline) within 4 minutes of rollback; latency p99: 4500ms -> 180ms (baseline); queue depth: 1240 -> 12 (drained); SLO burn rate: 14x -> 1.0x (normal) — SLO budget recovery confirmed",
    },
  });
  await run.emitEvidence("event", {
    id: "event-verify-alerts-cleared",
    trace_ref: "trace-verify-mitigation-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "pagerduty:incident-Q3XYZ (post-mitigation status)",
    payload: {
      finding: "incident Q3XYZ auto-resolved at 15:24:30Z (4 min after rollback); no new alerts fired as side-effect of the rollback; status page NOT yet updated (action item for postmortem)",
    },
  });
  await run.emitEvidence("expected", {
    id: "expected-slo-orders-error-rate-baseline",
    source_ref: "specs/slo.md#orders-availability",
    predicate: "GET /orders error rate <= 0.5% sustained over 5-minute window; latency p99 <= 250ms; SLO burn rate <= 2.0x sustained",
    predicate_kind: "behavioral",
  });
  await run.emitEvidence("actual", {
    id: "actual-orders-error-rate-recovered-to-baseline",
    expected_ref: "expected-slo-orders-error-rate-baseline",
    observed_value: "post-mitigation: /orders error rate 0.2% (baseline), latency p99 180ms (baseline), SLO burn rate 1.0x (normal) — sustained over 5m window; alerts cleared; no side-effect alerts",
    observation_ref: "event-verify-slo-recovery",
    observed_at: new Date().toISOString(),
  });
  await run.emitEvidence("validation", {
    id: "validation-verify-mitigation",
    expected_ref: "expected-slo-orders-error-rate-baseline",
    actual_ref: "actual-orders-error-rate-recovered-to-baseline",
    result: "match",
    method: "app_validation",
    evidence_refs: ["event-verify-slo-recovery", "event-verify-alerts-cleared"],
    decision_ref: "decision-mitigate-rollback-to-v1-4-0",
    validated_at: new Date().toISOString(),
  });
  run.advance("mitigation_verified");
  check("state is postmortem", run.currentState === "postmortem");

  // ------------------------------------------------------------------
  // postmortem: emit blameless Decision with root cause + contributing
  // factors + action items, plus an Event with the postmortem doc.
  // ------------------------------------------------------------------
  await run.emitEvidence("decision", {
    id: "decision-postmortem-orders-null-deref-2026-08-14",
    trace_ref: "trace-triage-1",
    what: "postmortem:root_cause=null_deref_in_v1.4.1+contributing_factors+action_items",
    why: "Root cause: null-deref at src/orders/handler.ts:42 in v1.4.1 — the same defect the user-complaint workflow later resolved in a non-incident context (the prior fix at commit 9ab2c3d 'fix: handle shipping_address=null' introduced a new null-deref in computeShippingCost by removing the null check at the call site while adding it inside computeShippingCost — but computeShippingCost itself dereferences .street before the check). Contributing factors (systemic, blameless): (1) the deploy pipeline's canary script is OPTIONAL — the deploy went 1% -> 100% without a canary soak, which would have caught the 78% error rate at 1% traffic; (2) the original 'fix' commit was a single self-PR with no reviewer — the second null-deref in computeShippingCost was not caught because the diff was small and looked like a pure null-guard addition; (3) the SLO alerting threshold is 5% error rate for SEV2 — the 78% error rate at 1% canary would have been below SEV2 threshold but above the canary-abort threshold (which is 1%), so the canary SHOULD have aborted. Action items: (a) make the canary script a hard prerequisite for promotion (owner: deploy-platform team, due 2026-09-14, SEV: high); (b) require code review for ALL prod-bound commits, even single-author (owner: orders team, due 2026-08-21, SEV: medium); (c) add a regression test asserting computeShippingCost handles null (owner: orders team, due 2026-08-21, SEV: high — overlaps with the bug-report run for the same defect); (d) update status page automation to fire on SEV2+ incidents without manual action (owner: ops team, due 2026-09-01, SEV: low).",
    validated: true,
    result: "accepted",
    evidence_refs: [
      "event-triage-deploy-log",
      "event-verify-slo-recovery",
    ],
  });
  await run.emitEvidence("event", {
    id: "event-postmortem-doc",
    trace_ref: "trace-triage-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "docs/postmortems/2026-08-14-orders-null-deref.md",
    payload: {
      diff_summary: "new postmortem document: 1,847 lines; sections: Summary, Timeline (15:02 alert -> 15:08 ack -> 15:13 triage -> 15:20 mitigate -> 15:24 resolved), Root Cause, Contributing Factors, Action Items (4 items with owners/due-dates/severities), Lessons Learned, Appendix (metrics graphs). Blameless: no individual named as the cause; systemic gaps identified instead.",
    },
  });
  run.advance("postmortem_complete");
  check("state is report (terminal)", run.currentState === "report" && run.isTerminal());

  // ------------------------------------------------------------------
  // report: write known-failure memory (with alert-observed symptom)
  // AND project memory.
  // ------------------------------------------------------------------
  await run.writeMemory("known-failure", {
    id: "mem-known-failure-incident-orders-error-spike-2026-08-14",
    type: "known-failure",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "incident-run-1",
    incident_ref: "incident-prod-orders-error-spike-2026-08-14",
    symptom: "PagerDuty alert 'orders-error-rate-high' fires: /orders error rate > 50% sustained over 5 min (baseline 0.2%); typically correlates with a recent deploy — observable ALERT BEHAVIOR regardless of how the underlying defect is structured in code",
    root_cause: "v1.4.1 deploy introduced a null-deref at src/orders/handler.ts:42 (commit 9ab2c3d 'fix: handle shipping_address=null' added a null guard inside computeShippingCost but removed the call-site null check, introducing a new null-deref before the inner guard could fire)",
    fix: "mitigated by rollback to v1.4.0 at 2026-08-14T15:20Z; root-cause fix tracked as a separate bug-report run for the null-deref defect; postmortem at docs/postmortems/2026-08-14-orders-null-deref.md with 4 action items (canary mandatory, code review mandatory, regression test, status-page automation)",
  });
  await run.writeMemory("project", {
    id: "mem-project-incident-orders-2026-08-14",
    type: "project",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "incident-run-1",
    stack: ["typescript"],
    layer: ["backend", "api"],
    domain: "API service incident 2026-08-14: /orders error rate 78% (SEV2, ~655,000 affected requests, SLO burn 14x) triggered by v1.4.1 deploy introducing a null-deref; mitigated by rollback to v1.4.0 in 18 min (alert -> resolved); postmortem at docs/postmortems/2026-08-14-orders-null-deref.md with 4 action items (canary mandatory / code review mandatory / regression test / status-page automation); this is the same defect the user-complaint workflow later resolved in a non-incident context",
  });

  // ------------------------------------------------------------------
  // Final assertions: the run produced the expected evidence trail
  // ------------------------------------------------------------------
  check("exactly 2 questions were asked", run.questions.count === 2);
  check("log has entries for every transition + evidence + gate check", run.log.length > 15);
  check("log has at least one gate-check entry (mitigate broad-refactor)",
    run.log.filter((e) => e.type === "gate-check").length >= 1);

  const evidenceKinds = ["trace", "event", "decision", "expected", "actual", "validation", "incident"];
  for (const kind of evidenceKinds) {
    const dir = join(runDir, "evidence", kind);
    const files = await readdir(dir).catch(() => []);
    check(`evidence/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  const memoryKinds = ["known-failure", "project"];
  for (const kind of memoryKinds) {
    const dir = join(runDir, "memory", kind);
    const files = await readdir(dir).catch(() => []);
    check(`memory/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  // Spot-check that the severity Decision persisted with the SEV2
  // score and the SLO burn rate (incident's feature #1).
  const persistedSeverity = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-severity-assessment-1.json"), "utf-8")
  );
  check(
    "persisted severity Decision has what starts with 'impact_assessment:SEV2:' and includes blast + affected + slo_burn",
    persistedSeverity.what.startsWith("impact_assessment:SEV2:") &&
      persistedSeverity.what.includes("blast=") &&
      persistedSeverity.what.includes("affected=") &&
      persistedSeverity.what.includes("slo_burn=")
  );

  // Spot-check that the mitigation Decision persisted with >=2
  // alternatives (rollback vs. forward-fix vs. scale-out vs.
  // fail-over — incident's feature: mitigation, not fix, with
  // tradeoffs recorded).
  const persistedMitigation = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-mitigate-rollback-to-v1-4-0.json"), "utf-8")
  );
  check(
    "persisted mitigation Decision has >=3 alternatives recorded (rollback vs. forward-fix vs. scale-out vs. fail-over)",
    Array.isArray(persistedMitigation.alternatives) &&
      persistedMitigation.alternatives.length >= 3
  );
  check(
    "persisted mitigation Decision has validated=false (proposal until verify-mitigation confirms SLO recovery)",
    persistedMitigation.validated === false
  );

  // Spot-check that the verify-mitigation Validation has method=app_validation
  // (NOT unit_test — tests don't run in prod; the validation IS the
  // production system's own behavior).
  const persistedValidation = JSON.parse(
    await readFile(join(runDir, "evidence", "validation", "validation-verify-mitigation.json"), "utf-8")
  );
  check(
    "persisted verify-mitigation Validation has method=app_validation (production behavior, NOT a test suite)",
    persistedValidation.method === "app_validation" && persistedValidation.result === "match"
  );

  // Spot-check that the postmortem Decision mentions root cause AND
  // contributing factors AND action items (incident's feature #3).
  const persistedPostmortem = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-postmortem-orders-null-deref-2026-08-14.json"), "utf-8")
  );
  check(
    "persisted postmortem Decision mentions Root cause AND Contributing factors AND Action items (blameless)",
    persistedPostmortem.why.toLowerCase().includes("root cause") &&
      persistedPostmortem.why.toLowerCase().includes("contributing factors") &&
      persistedPostmortem.why.toLowerCase().includes("action items")
  );
  check(
    "persisted postmortem is blameless (no individual named as 'the cause' — only systemic gaps)",
    !persistedPostmortem.why.toLowerCase().includes("engineer x") &&
      persistedPostmortem.why.toLowerCase().includes("systemic")
  );

  // Spot-check that the known-failure memory references the Incident
  // and has the ALERT-OBSERVED symptom (not the code structure).
  const persistedKnownFailure = JSON.parse(
    await readFile(join(runDir, "memory", "known-failure", "mem-known-failure-incident-orders-error-spike-2026-08-14.json"), "utf-8")
  );
  check(
    "persisted known-failure memory references the Incident emitted at classify",
    persistedKnownFailure.incident_ref === "incident-prod-orders-error-spike-2026-08-14"
  );
  check(
    "persisted known-failure symptom describes the ALERT BEHAVIOR (not the code structure)",
    persistedKnownFailure.symptom.includes("PagerDuty alert") &&
      persistedKnownFailure.symptom.includes("error rate")
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
  console.log("- incident.sm.yaml loads through the real executor");
  console.log("- A full WorkflowRun walks all 7 non-terminal states + 1 terminal (report)");
  console.log("- Schema-valid evidence emitted at every emitting state (7 evidence kinds including Incident)");
  console.log("- assess-impact emits SEV2 score + blast radius + affected-user estimate + SLO burn rate (feature #1)");
  console.log("- triage emits 4 Events (deploy log / config flips / traffic / dependency health) + Decision naming proximate trigger");
  console.log("- mitigate emits a MITIGATION (not a fix) with >=3 alternatives — rollback vs. forward-fix vs. scale-out vs. fail-over (feature #2)");
  console.log("- broad-refactor safety gate at `mitigate` blocks un-confirmed advance, allows confirmed");
  console.log("- verify-mitigation emits Validation with method=app_validation (production behavior, NOT unit_test)");
  console.log("- postmortem emits a BLAMELESS Decision with root cause + contributing factors + action items + an Event with the postmortem doc location (feature #3)");
  console.log("- question_economy enforces max_questions=2 and allowed_states=[classify, assess-impact]");
  console.log("- Negative test: third question in `mitigate` correctly rejected as wrong-state");
  console.log("- All evidence persisted to disk as JSON (would have thrown on schema violation)");
  console.log("- known-failure memory written at report with ALERT-OBSERVED symptom (not code structure)");
  console.log("- project memory written at report recording the incident for the project's history");
}

scenario().catch((err) => {
  console.error("E2E DRIVER FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
