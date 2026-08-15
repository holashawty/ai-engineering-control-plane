// End-to-end driver for security-problem.sm.yaml. Feeds a scripted
// (but realistic) security-problem scenario through the real
// WorkflowRun API — emits real, schema-valid Evidence Model entities
// at each state and writes a real known-failure memory entry at
// regression-protect, plus a project memory entry at the terminal
// `report` state.
//
// What this proves:
//   1. security-problem.sm.yaml loads cleanly through loadWorkflow
//      (structural validation, no dead ends, all states reachable).
//   2. A real WorkflowRun walks intake -> classify -> assess-severity
//      -> investigate -> diagnose -> propose-mitigation -> apply-
//      mitigation -> verify-mitigation -> regression-protect ->
//      report, emitting schema-valid evidence at every emitting state.
//   3. The broad-refactor safety gate at the `apply-mitigation`
//      state actually blocks an un-confirmed transition out of
//      `apply-mitigation`, then allows it when confirmation is
//      supplied (advanceWithConfirmation). This is the same gate
//      bug-report uses at propose-fix/apply-fix and feature-request
//      uses at implement — proving the gate is workflow-agnostic,
//      not bug-report-specific.
//   4. The question_economy (max_questions: 2, allowed_states:
//      [classify, assess-severity]) enforces correctly: one question
//      in classify (accepted), one in assess-severity (accepted), a
//      third question in investigate (not in allowed_states) is
//      rejected with question-economy-wrong-state.
//   5. The workflow's UNIQUE structural features are exercised:
//      (a) the CVSS severity score is emitted as a Decision with
//          `what: "severity_assessment:CVSS:..."` and per-component
//          justifications in `why`;
//      (b) the propose-mitigation state emits THREE Decisions
//          (immediate patch + defense-in-depth guard + audit-trail
//          improvement), per the layered-mitigation pattern.
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
const WORKFLOW_PATH = join(__dirname, "..", "..", "..", "workflows", "security-problem.sm.yaml");

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
  const runDirParent = await mkdtemp(join(tmpdir(), "aiecp-security-problem-"));
  const runDir = join(runDirParent, "evidence-and-memory");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  console.log("=== End-to-end security-problem run: 'auth bypass on GET /admin/users — unauthenticated PII dump' ===\n");
  console.log("Vulnerability report (filed by external security researcher)\n");

  // ------------------------------------------------------------------
  // Workflow structural assertions
  // ------------------------------------------------------------------
  check("workflow loaded with name 'security-problem'", def.workflow === "security-problem");
  check("initial state is intake", run.currentState === "intake");
  check("workflow declares safety_gates with one entry at apply-mitigation (broad-refactor)",
    Array.isArray(def.safety_gates) &&
      def.safety_gates.length === 1 &&
      def.safety_gates[0].state === "apply-mitigation" &&
      def.safety_gates[0].gate === "broad-refactor");
  check("question_economy budget is 2, allowed_states=[classify, assess-severity]",
    def.question_economy.max_questions === 2 &&
    JSON.stringify(def.question_economy.allowed_states) === JSON.stringify(["classify", "assess-severity"]));
  check("workflow has all 11 states declared",
    def.states.length === 11);

  // ------------------------------------------------------------------
  // intake -> classify
  // ------------------------------------------------------------------
  run.advance("intent_classified");
  check("state is classify", run.currentState === "classify");

  // classify: one allowed question. The researcher reported an
  // unauthenticated PII dump on /admin/users; the engineer needs
  // to know whether /admin is exposed via the public ingress
  // (affects whether this is also a publicly-reachable finding
  // or only internal-reachable).
  run.askQuestion("Is /admin exposed via the public ingress, or only via the internal VPC?");
  check("question count is 1 (under max_questions=2)", run.questions.count === 1);

  await run.emitEvidence("incident", {
    id: "incident-security-admin-auth-bypass-2026-08-14",
    observed_at: new Date().toISOString(),
    environment_fingerprint_ref: "env-fp-admin-auth-bypass",
    expected_ref: "expected-security-invariant-admin-routes-require-auth",
    actual_ref: "actual-admin-endpoint-returns-200-without-auth",
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
    source: "security-researcher-report (submitted via security@example.com, encrypted email)",
    payload: {
      finding: "researcher reports: 'GET https://api.example.com/admin/users returns the full user PII dump (name, email, phone, hashed_password) with no Authorization header. Reproduction: curl -sS https://api.example.com/admin/users. Reporter requests coordinated disclosure, 90-day window from filing date 2026-08-12.'",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-accept-security-problem-1",
    trace_ref: "trace-classify-1",
    what: "acceptance:proceed_with_security_problem",
    why: "complaint class = authentication bypass; reporter named a surface the engineer owns (/admin/users); per user's classify answer, /admin is exposed via the public ingress, so Attack Vector = Network; severity likely High or Critical pending assess-severity",
    validated: true,
    result: "accepted",
  });
  run.advance("class_known");
  check("state is assess-severity", run.currentState === "assess-severity");

  // ------------------------------------------------------------------
  // assess-severity: emit CVSS vector as a Decision.
  // ------------------------------------------------------------------
  // Second question (the severity question) is permitted here:
  // this is the second of the max_questions=2 budget, and
  // assess-severity is in allowed_states. The question affects the
  // CVSS Attack Vector component (Network vs. Adjacent).
  run.askQuestion("Does the exploit require any specific configuration on the target, or does it work on a default install?");
  check("question count is 2 (at max_questions=2)", run.questions.count === 2);

  await run.emitEvidence("trace", {
    id: "trace-assess-severity-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-severity-citations"],
  });
  await run.emitEvidence("event", {
    id: "event-severity-citations",
    trace_ref: "trace-assess-severity-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "filesystem_read: specs/invariants.md + src/app.ts + curl reproduction",
    payload: {
      finding: "AV:N — /admin is exposed via the public ingress (per user's classify answer + src/app.ts:42 `app.use('/admin', adminRouter)` with no auth middleware); AC:L — exploit works on first request, no race condition or special config (per user's assess-severity answer); PR:N — endpoint accepts no auth header (curl with no Authorization header returned 200); UI:N — no user interaction required; S:U — vuln affects only admin-svc, no cross-component escape; C:H — response includes full user PII (name, email, phone, hashed_password); I:H — POST /admin/users allows unauthorized admin data modification (same vuln class); A:N — does not affect availability",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-severity-assessment-1",
    trace_ref: "trace-assess-severity-1",
    what: "severity_assessment:CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
    why: "AV:N — public ingress per classify answer + src/app.ts:42; AC:L — works on default install per assess-severity answer; PR:N — unauthenticated (curl with no Authorization header returned 200); UI:N — no victim interaction needed; S:U — affects only admin-svc; C:H — PII dump (name/email/phone/hashed_password); I:H — POST also affected (unauthorized admin writes); A:N — no availability impact. Base Score: 9.1 Critical.",
    validated: true,
    result: "accepted",
  });
  run.advance("severity_assessed");
  check("state is investigate", run.currentState === "investigate");

  // ------------------------------------------------------------------
  // investigate: confirm reachable + capture exploit evidence.
  // ------------------------------------------------------------------
  await run.emitEvidence("trace", {
    id: "trace-investigate-1",
    started_at: new Date().toISOString(),
    event_refs: [
      "event-curl-no-auth",
      "event-curl-response-redacted",
      "event-handler-source",
      "event-route-registration",
    ],
  });
  await run.emitEvidence("event", {
    id: "event-curl-no-auth",
    trace_ref: "trace-investigate-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "curl -sS -o /tmp/response.json -w '%{http_code}' https://api.example.com/admin/users",
    payload: {
      finding: "HTTP 200 — no Authorization header sent; response Content-Type: application/json; Content-Length: 47821 bytes",
    },
  });
  await run.emitEvidence("event", {
    id: "event-curl-response-redacted",
    trace_ref: "trace-investigate-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "filesystem_read: /tmp/response.json (first 200 bytes, secrets redacted)",
    payload: {
      finding: "[{\"id\":\"usr_001\",\"name\":\"<redacted>\",\"email\":\"<redacted>@example.com\",\"phone\":\"<redacted>\",\"hashed_password\":\"<redacted-hash>\"},...] — full PII dump returned to unauthenticated caller",
      note: "PII fields redacted in this evidence entry per evidence-engineering step 4; the test for the regression will use benign placeholder values, not real user data",
    },
  });
  await run.emitEvidence("event", {
    id: "event-handler-source",
    trace_ref: "trace-investigate-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "filesystem_read: src/admin/index.ts:18",
    payload: {
      finding: "src/admin/index.ts:18: `router.get('/users', async (req, res) => { const users = await db.query('SELECT * FROM users'); res.json(users); });` — handler reads req.user.role on line 24 (downstream), but the data-return path on line 20 fires before the role check, leaking the user list to unauthenticated callers",
    },
  });
  await run.emitEvidence("event", {
    id: "event-route-registration",
    trace_ref: "trace-investigate-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "filesystem_read: src/app.ts:42",
    payload: {
      finding: "src/app.ts:42: `app.use('/admin', adminRouter);` — adminRouter registered WITHOUT authMiddleware; compare to src/app.ts:38 `app.use('/api', authMiddleware, apiRouter);` which DOES wrap apiRouter in authMiddleware",
    },
  });
  run.advance("vulnerability_confirmed");
  check("state is diagnose", run.currentState === "diagnose");

  // ------------------------------------------------------------------
  // diagnose: root cause = missing control (auth middleware on route).
  // ------------------------------------------------------------------
  await run.emitEvidence("expected", {
    id: "expected-security-invariant-admin-routes-require-auth",
    source_ref: "specs/invariants.md#admin-auth",
    predicate: "all routes under /admin require authentication via authMiddleware; no unauthenticated request to /admin/* may return 200 with user data",
    predicate_kind: "invariant",
  });
  await run.emitEvidence("actual", {
    id: "actual-admin-endpoint-returns-200-without-auth",
    expected_ref: "expected-security-invariant-admin-routes-require-auth",
    observed_value: "GET /admin/users with no Authorization header returns 200 with full user PII dump — invariant violated",
    observation_ref: "event-curl-no-auth",
    observed_at: new Date().toISOString(),
  });
  await run.emitEvidence("decision", {
    id: "decision-root-cause-missing-auth-middleware",
    trace_ref: "trace-investigate-1",
    what: "root_cause_candidate:missing_authMiddleware_on_admin_route_registration",
    why: "Root cause: MISSING CONTROL — authMiddleware is not registered on the /admin route. src/app.ts:42 `app.use('/admin', adminRouter)` omits the middleware that src/app.ts:38 correctly applies to /api. The handler at src/admin/index.ts:18 then runs for unauthenticated requests, returning the user list before the role check on line 24 can reject it. This is a missing-control defect (no auth check at the boundary), not a wrong-computation defect (which would be bug-report's typical shape).",
    validated: false,
    root_cause: false,
    result: "pending",
  });
  await run.emitEvidence("validation", {
    id: "validation-diagnose-auth-invariant-violated",
    expected_ref: "expected-security-invariant-admin-routes-require-auth",
    actual_ref: "actual-admin-endpoint-returns-200-without-auth",
    result: "mismatch",
    method: "contract_validation",
    evidence_refs: ["event-curl-no-auth", "event-handler-source", "event-route-registration"],
    decision_ref: "decision-root-cause-missing-auth-middleware",
    validated_at: new Date().toISOString(),
  });
  run.advance("root_cause_found");
  check("state is propose-mitigation", run.currentState === "propose-mitigation");

  // ------------------------------------------------------------------
  // propose-mitigation: emit THREE Decisions (layered mitigation).
  // ------------------------------------------------------------------
  // Layer 1: immediate patch — add authMiddleware to /admin route.
  await run.emitEvidence("decision", {
    id: "decision-mitigation-layer-1-immediate-patch",
    trace_ref: "trace-investigate-1",
    what: "ai_proposal:mitigation_layer_1_add_authMiddleware_to_admin_route",
    why: "Immediate patch: register authMiddleware on the /admin route at src/app.ts:42. Change `app.use('/admin', adminRouter)` to `app.use('/admin', authMiddleware, adminRouter)`. Closes the specific vuln (this route, this missing middleware).",
    validated: false,
    result: "pending",
    alternatives: [
      { option: "add an auth check inside the handler at src/admin/index.ts:18", rejected_because: "puts the auth check at the handler level, where a future handler author can forget it; the middleware-level check is structurally harder to forget because omitting it changes the route registration line" },
    ],
  });
  // Layer 2: defense-in-depth guard — startup-time check that every
  // /admin/* route is wrapped in authMiddleware.
  await run.emitEvidence("decision", {
    id: "decision-mitigation-layer-2-defense-in-depth-guard",
    trace_ref: "trace-investigate-1",
    what: "ai_proposal:mitigation_layer_2_startup_route_registration_guard",
    why: "Defense-in-depth: add a route-registration guard that throws at startup if any route under /admin/* is registered without authMiddleware. Closes the CLASS of vuln (any future admin route added without the middleware). Implementation: a wrapper around app.use('/admin', ...) that asserts the middleware is present, throwing `RouteRegistrationError: /admin/* routes require authMiddleware` at boot if not.",
    validated: false,
    result: "pending",
    alternatives: [
      { option: "add an ESLint rule that flags `app.use('/admin'` calls without authMiddleware in the args", rejected_because: "lint rules are advisory; a startup throw is enforced every boot and cannot be silenced with a comment" },
    ],
  });
  // Layer 3: audit-trail improvement — structured-log rejected
  // unauthenticated /admin/* requests.
  await run.emitEvidence("decision", {
    id: "decision-mitigation-layer-3-audit-trail",
    trace_ref: "trace-investigate-1",
    what: "ai_proposal:mitigation_layer_3_log_rejected_unauthenticated_admin_requests",
    why: "Audit-trail: add a structured-log line on every rejected unauthenticated /admin/* request (401 response), with the source IP, the route, and the timestamp, feeding into the security alerting pipeline. Makes future exploitation attempts visible to the on-call rotation.",
    validated: false,
    result: "pending",
    alternatives: [
      { option: "skip layer 3 — the project has no structured-logging pipeline", rejected_because: "kept in this scenario because the project does have one (per discovery/cli:logging-integration); if it didn't, this layer would be optional" },
    ],
  });
  run.advance("mitigation_approved");
  check("state is apply-mitigation", run.currentState === "apply-mitigation");

  // ------------------------------------------------------------------
  // apply-mitigation: safety gate fires here.
  // ------------------------------------------------------------------
  await expectViolation(
    "un-confirmed transition out of apply-mitigation is blocked by safety gate",
    "safety-gate-needs-confirmation",
    () => run.advance("mitigation_applied")
  );
  check("state is still apply-mitigation after blocked attempt", run.currentState === "apply-mitigation");

  run.advanceWithConfirmation("mitigation_applied");
  check("state is verify-mitigation after confirmation", run.currentState === "verify-mitigation");

  // Emit the implementation Decision (applied) + 3 file_change Events.
  await run.emitEvidence("decision", {
    id: "decision-impl-mitigation-applied",
    trace_ref: "trace-investigate-1",
    what: "ai_proposal:applied_three_layer_mitigation",
    why: "applied layer 1 (authMiddleware on /admin route), layer 2 (startup route-registration guard), layer 3 (structured-log on rejected unauthenticated /admin/* requests)",
    validated: false,
    result: "pending",
  });
  await run.emitEvidence("event", {
    id: "event-impl-layer1-file-change",
    trace_ref: "trace-investigate-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "src/app.ts",
    payload: {
      diff_summary: "line 42: changed `app.use('/admin', adminRouter);` to `app.use('/admin', authMiddleware, adminRouter);` — closes the specific auth bypass",
    },
  });
  await run.emitEvidence("event", {
    id: "event-impl-layer2-file-change",
    trace_ref: "trace-investigate-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "src/app.ts + src/admin/guard.ts (new)",
    payload: {
      diff_summary: "added src/admin/guard.ts exporting assertAdminAuth(route, middleware) that throws RouteRegistrationError if middleware !== authMiddleware; wrapped the existing `app.use('/admin', authMiddleware, adminRouter)` in assertAdminAuth() at src/app.ts:42 — startup guard closes the class",
    },
  });
  await run.emitEvidence("event", {
    id: "event-impl-layer3-file-change",
    trace_ref: "trace-investigate-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "adapters/agents/src/middleware/log-rejected.ts (new)",
    payload: {
      diff_summary: "added middleware that logs structured JSON {event:'admin_auth_rejected', ip, route, ts} on every 401 from /admin/*; wired into the authMiddleware chain at src/app.ts:38",
    },
  });

  // Negative test: third question would exceed the budget.
  // Question is asked from verify-mitigation state, which is NOT
  // in allowed_states [classify, assess-severity], so it's rejected
  // for that reason first.
  await expectViolation(
    "third question asked in verify-mitigation (not in allowed_states) is rejected",
    "question-economy-wrong-state",
    () => run.askQuestion("Should the structured-log include the user-agent?")
  );

  // ------------------------------------------------------------------
  // verify-mitigation: TWO axes — vuln closed AND no regression.
  // ------------------------------------------------------------------
  await run.emitEvidence("trace", {
    id: "trace-verify-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-verify-curl-after-fix", "event-verify-auth-suite-green"],
  });
  await run.emitEvidence("event", {
    id: "event-verify-curl-after-fix",
    trace_ref: "trace-verify-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "curl -sS -o /dev/null -w '%{http_code}' https://api.example.com/admin/users (after mitigation applied)",
    payload: {
      finding: "HTTP 401 — unauthenticated request now rejected with `{\"error\":\"unauthorized\"}` (no PII in response body); structured log line emitted: `{\"event\":\"admin_auth_rejected\",\"ip\":\"<redacted>\",\"route\":\"/admin/users\",\"ts\":\"2026-08-14T15:42:11Z\"}`",
    },
  });
  await run.emitEvidence("event", {
    id: "event-verify-auth-suite-green",
    trace_ref: "trace-verify-1",
    ts: new Date().toISOString(),
    kind: "test_result",
    source: "npm test --silent (auth + admin suites after mitigation)",
    payload: {
      result: "31 passed (30 existing + 1 new regression test for unauthenticated /admin/users returning 401)",
      note: "no regression in legitimate flows — authenticated admin requests still return 200 with the user list (verified by tests/admin/authenticated.test.ts)",
    },
  });
  await run.emitEvidence("actual", {
    id: "actual-admin-endpoint-returns-401-after-mitigation",
    expected_ref: "expected-security-invariant-admin-routes-require-auth",
    observed_value: "GET /admin/users with no Authorization header now returns 401 with `{error: 'unauthorized'}` (no PII); authenticated admin requests still return 200 (no regression); structured-log line emitted on the rejection",
    observation_ref: "event-verify-curl-after-fix",
    observed_at: new Date().toISOString(),
  });
  await run.emitEvidence("validation", {
    id: "validation-verify-mitigation",
    expected_ref: "expected-security-invariant-admin-routes-require-auth",
    actual_ref: "actual-admin-endpoint-returns-401-after-mitigation",
    result: "match",
    method: "app_validation",
    evidence_refs: ["event-verify-curl-after-fix", "event-verify-auth-suite-green"],
    decision_ref: "decision-impl-mitigation-applied",
    validated_at: new Date().toISOString(),
  });
  run.advance("mitigation_verified");
  check("state is regression-protect", run.currentState === "regression-protect");

  // ------------------------------------------------------------------
  // regression-protect: known-failure memory with exploit symptom
  // (not root-cause description), per the skill.
  // ------------------------------------------------------------------
  await run.writeMemory("known-failure", {
    id: "mem-known-failure-admin-auth-bypass-2026-08-14",
    type: "known-failure",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "security-problem-run-1",
    incident_ref: "incident-security-admin-auth-bypass-2026-08-14",
    symptom: "GET /admin/users with no Authorization header returns 200 with full user PII dump (name, email, phone, hashed_password) — observable behavior of the auth bypass, regardless of how a future regression is structured in code",
    root_cause: "missing authMiddleware on the /admin route registration at src/app.ts:42; handler at src/admin/index.ts:18 returned data before the role check at line 24 could reject the unauthenticated request",
    fix: "layer 1: register authMiddleware on /admin route (src/app.ts:42); layer 2: add startup route-registration guard (src/admin/guard.ts) throwing if any /admin/* route lacks authMiddleware; layer 3: structured-log rejected unauthenticated /admin/* requests; regression test tests/admin/unauthenticated-rejected.test.ts asserts 401 on no-Auth-header request",
  });
  run.advance("regression_added");
  check("state is report (terminal)", run.currentState === "report" && run.isTerminal());

  // ------------------------------------------------------------------
  // report: project memory with CVSS vector + disclosure plan.
  // ------------------------------------------------------------------
  await run.writeMemory("project", {
    id: "mem-project-admin-auth-bypass-resolved-2026-08-14",
    type: "project",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "security-problem-run-1",
    stack: ["typescript"],
    // "security" is intentionally NOT in layer[] here: the project schema's
    // layer enum is constrained to backend/frontend/mobile/desktop/cli/api/
    // database/monorepo (memory/schemas/project.schema.json). "security" is
    // a concern, not a layer — the disclosure plan + CVSS vector live in
    // `domain` instead, where they're retrievable by future security audits.
    layer: ["backend", "api"],
    domain: "Admin API service (security-relevant: auth boundary); resolved security-problem: auth bypass on GET /admin/users (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N, 9.1 Critical); layered mitigation applied (auth middleware + startup guard + audit-log); CVE filing recommended; coordinated 90-day disclosure window starting 2026-08-12 (reporter's filing date); advisory publication scheduled for 2026-11-10",
  });

  // ------------------------------------------------------------------
  // Final assertions: the run produced the expected evidence trail
  // ------------------------------------------------------------------
  check("exactly 2 questions were asked", run.questions.count === 2);
  check("log has entries for every transition + evidence + gate check", run.log.length > 15);
  check("log has at least one gate-check entry (apply-mitigation broad-refactor)",
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

  // Spot-check that the severity Decision persisted with the CVSS
  // vector — security-problem's unique structural feature.
  const persistedSeverityDecision = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-severity-assessment-1.json"), "utf-8")
  );
  check(
    "persisted severity Decision has what starts with 'severity_assessment:CVSS:' and includes all 8 components",
    persistedSeverityDecision.what.startsWith("severity_assessment:CVSS:") &&
      persistedSeverityDecision.what.includes("AV:") &&
      persistedSeverityDecision.what.includes("AC:") &&
      persistedSeverityDecision.what.includes("PR:") &&
      persistedSeverityDecision.what.includes("UI:") &&
      persistedSeverityDecision.what.includes("S:") &&
      persistedSeverityDecision.what.includes("C:") &&
      persistedSeverityDecision.what.includes("I:") &&
      persistedSeverityDecision.what.includes("A:")
  );

  // Spot-check that the THREE mitigation Decisions all persisted.
  for (const id of [
    "decision-mitigation-layer-1-immediate-patch",
    "decision-mitigation-layer-2-defense-in-depth-guard",
    "decision-mitigation-layer-3-audit-trail",
  ]) {
    const d = JSON.parse(
      await readFile(join(runDir, "evidence", "decision", `${id}.json`), "utf-8")
    );
    check(`persisted ${id} has validated=false (AI proposal)`, d.validated === false);
  }

  // Spot-check that the known-failure memory references the Incident.
  const persistedKnownFailure = JSON.parse(
    await readFile(join(runDir, "memory", "known-failure", "mem-known-failure-admin-auth-bypass-2026-08-14.json"), "utf-8")
  );
  check(
    "persisted known-failure memory references the Incident emitted at classify",
    persistedKnownFailure.incident_ref === "incident-security-admin-auth-bypass-2026-08-14"
  );
  check(
    "persisted known-failure symptom describes the EXPLOIT BEHAVIOR (not the code structure)",
    persistedKnownFailure.symptom.includes("returns 200") &&
      persistedKnownFailure.symptom.includes("no Authorization header")
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
  console.log("- security-problem.sm.yaml loads through the real executor");
  console.log("- A full WorkflowRun walks all 10 non-terminal states + 1 terminal (report)");
  console.log("- Schema-valid evidence emitted at every emitting state (7 evidence kinds including Incident)");
  console.log("- CVSS severity assessment emitted as a Decision with all 8 vector components (security-problem's unique feature #1)");
  console.log("- THREE mitigation Decisions emitted in propose-mitigation (layered: patch + guard + audit-trail) (feature #2)");
  console.log("- broad-refactor safety gate at `apply-mitigation` blocks un-confirmed advance, allows confirmed");
  console.log("- question_economy enforces max_questions=2 and allowed_states=[classify, assess-severity]");
  console.log("- Negative test: third question in `verify-mitigation` correctly rejected as wrong-state");
  console.log("- All evidence persisted to disk as JSON (would have thrown on schema violation)");
  console.log("- known-failure memory written at regression-protect with EXPLOIT BEHAVIOR in symptom field (not code structure)");
  console.log("- project memory written at report containing the CVSS vector + disclosure plan in domain");
}

scenario().catch((err) => {
  console.error("E2E DRIVER FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
