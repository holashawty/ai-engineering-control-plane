# End-to-end run: security-problem workflow (auth bypass on /admin/users)

**This is the eleventh e2e proof point** in the repo, alongside the
ten existing proofs. The first proved `bug-report.sm.yaml` works
end-to-end against a real (non-scripted) bug. The second through
tenth proved the executor is **workflow-agnostic** — structurally
different workflows run through the same `WorkflowRun` engine with
zero code changes to the executor. This one proves the same
workflow-agnosticism for the **security-problem** shape — the only
workflow in the catalog whose triggering condition is "the system
works correctly, but it exposes data, escalates privilege, or fails
closed when it should fail open."

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state of
`security-problem.sm.yaml`. Every `emitEvidence` call writes a JSON
file to disk that the executor's `EvidenceStore` validates against
the actual `evidence/schema/*.schema.json` files. Every transition
goes through the real `StateMachine.advance` and `WorkflowRun.advance`
(with safety gate enforcement). Secrets in the request/response
evidence are redacted in the `Event.payload.finding` per the
`evidence-engineering` step 4 rule.

**Isn't:** a recording of a live multi-turn agent session, and isn't
a real exploit run against a real production service — the curl
output, the stack trace, and the PII dump are realistic but
scripted. The same honest scope note as
`executor/examples/e2e-feature-request/README.md` applies: a driver
script assembling realistic data is not yet a live agent session.

## What makes security-problem structurally different

`security-problem` is triggered by a vulnerability report, suspicious
access pattern, or security-audit finding. This is distinct from:

- `bug-report` — functional failure (system returns the wrong output,
  crashes, or is slow).
- `incident` — production outage (system is down or degraded).
- `user-complaint` — third-party report of an externally-observed
  functional bug.

The structural distinction that makes `security-problem` a separate
workflow is **what is at risk**. In the other workflows, the
system's *functional behavior* is the defect. In
`security-problem`, the system "works" — it returns the right
status codes, the right shapes, the right latency — but it does so
in a way that violates a *security property* (confidentiality,
integrity, availability). The defect is in the missing or broken
*control* (no auth check, no input validation, no rate-limit, no
output encoding), not in the *computation*.

Four structural consequences follow from this distinction:

1. **CVSS-style severity assessment is a dedicated state.**
   `assess-severity` produces a `Decision` whose `what` starts with
   `"severity_assessment:CVSS:"` and includes all 8 CVSS v3.1
   vector components (AV/AC/PR/UI/S/C/I/A), each justified by a
   citation in `why`. The point is not the score — it's the
   discipline of justifying each component with evidence, so the
   eventual disclosure-and-timeline plan (in `report`) can cite
   the vector and the affected users can self-assess their exposure.
2. **The `investigate` state confirms reachability, not just
   presence.** A theoretical finding against an unreachable code
   path (a dependency CVE in a library locked-but-not-loaded, an
   auth check that the runtime bypasses via a different code path)
   does not justify a mitigation. `investigate`'s third valid
   outcome — `vulnerability_not_reachable` — is NOT a failure: it
   saves the team from patching a non-issue, and the blocked state's
   report records the dead-code analysis so the next security audit
   can skip the same finding.
3. **The `propose-mitigation` state emits a *layered* mitigation.**
   Per `systematic-debugging`'s defense-in-depth guidance, the
   mitigation is typically three separate `Decision`s:
   (a) the immediate patch (close the specific vuln at the affected
   code path),
   (b) the defense-in-depth guard (close the *class* of vuln at a
   boundary upstream, so a future instance is caught),
   (c) the audit-trail improvement (log rejected attempts so future
   exploitation is visible).
   Each layer is its own `Decision` with its own `alternatives` —
   the eventual `report` can cite all three for the decision trace.
4. **The `report` state's deliverable includes a disclosure-and-
   timeline plan.** In `bug-report`, the report is for the engineer.
   In `security-problem`, the report is for the engineer AND the
   security researcher who filed the report AND the downstream
   consumers who may need to patch. The plan includes: is a CVE
   filing recommended? What's the coordinated-disclosure window
   (typically 90 days from the reporter's filing date)? Is an
   advisory publication needed? These considerations are recorded
   in the `project` memory entry's `domain` field for future
   security audits to retrieve.

## What the run proves

Run `node executor/examples/e2e-security-problem/drive-run.mjs` and
observe the assertions passing. The interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every
   transition's `from`/`to` is in `states[]`, no non-terminal state
   is a dead end, all states are reachable from `intake`.
2. **End-to-end walk.** A single `WorkflowRun` walks `intake →
   classify → assess-severity → investigate → diagnose → propose-
   mitigation → apply-mitigation → verify-mitigation → regression-
   protect → report`, emitting schema-valid evidence at every
   emitting state (7 evidence kinds including `Incident`).
3. **Safety gate is workflow-agnostic.** The `broad-refactor` gate
   at the `apply-mitigation` state blocks an un-confirmed advance
   out of `apply-mitigation` (the executor throws
   `safety-gate-needs-confirmation`), then allows the same advance
   once `advanceWithConfirmation` is called. This is the same gate
   code `bug-report` exercises at `propose-fix`/`apply-fix`,
   `feature-request` exercises at `implement`, `refactor` exercises
   at `implement`, `change-request` exercises at `migrate`, and
   `regression` exercises at `re-fix` — proving the gate logic is
   keyed off the workflow's `safety_gates` declaration, not
   hardcoded to any one workflow's specific states.
4. **Question economy with 2 allowed states.** The budget is
   `max_questions: 2, allowed_states: [classify, assess-severity]`.
   The driver asks one question in `classify` (is /admin exposed via
   the public ingress?) and one in `assess-severity` (does the
   exploit require a special config?) — both accepted. A third
   question, attempted in `verify-mitigation` (not in
   `allowed_states`), is rejected with `question-economy-wrong-state`.
5. **CVSS severity assessment — unique structural feature #1.**
   The `assess-severity` state emits a `Decision` whose `what` is
   `severity_assessment:CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`,
   with each of the 8 vector components justified by a citation in
   `why`. The driver spot-checks that the persisted `Decision.what`
   starts with `"severity_assessment:CVSS:"` and includes all 8
   component abbreviations (AV/AC/PR/UI/S/C/I/A).
6. **Layered mitigation — unique structural feature #2.** The
   `propose-mitigation` state emits THREE `Decision`s: an immediate
   patch (register `authMiddleware` on `/admin`), a defense-in-
   depth guard (startup-time route-registration check), and an
   audit-trail improvement (structured-log rejected unauthenticated
   `/admin/*` requests). Each is a separate `Decision` with its own
   `alternatives` array recording what was considered and rejected.
7. **AI-output validation pattern holds.** All three mitigation
   `Decision`s are emitted with `validated: false, result:
   "pending"` — AI proposals, not self-confirmed claims. They only
   become trustworthy after `verify-mitigation` emits a `Validation`
   with `method: "app_validation"`.
8. **Secret redaction.** The exploit-response `Event.payload.finding`
   redacts the PII values (name, email, phone, hashed_password)
   rather than persisting them as evidence — per
   `evidence-engineering` step 4. The regression test in the
   `known-failure` memory entry uses benign placeholder values, not
   the original exploit string.
9. **Memory updates at terminal and pre-terminal.** The
   `regression-protect` state writes a `known-failure` memory entry
   whose `symptom` field records the *exploit behavior* ("GET
   /admin/users with no Authorization header returns 200 with full
   user PII dump") rather than the *code structure* (so a future
   regression is detected by behavior, not by code shape — which a
   refactor could obscure). The `report` state writes a `project`
   memory entry containing the CVSS vector and the disclosure-and-
   timeline plan in its `domain` field.
10. **Disk persistence.** Evidence files actually land on disk
    under `evidence/<kind>/*.json` and `memory/<kind>/*.json` —
    the driver spot-checks several (the severity `Decision`, the
    three mitigation `Decision`s, the `known-failure` memory entry)
    to confirm they round-tripped through `JSON.stringify` without
    mutation.

## The scenario

A realistic security-problem: *"an external security researcher
reports that GET /admin/users returns the full user PII dump
without authentication, with a 90-day coordinated-disclosure
window."* The driver models:

- **classify:** asks one decision-changing question ("is /admin
  exposed via the public ingress, or only via the internal VPC?")
  — the answer determines the CVSS Attack Vector component.
  Emit the `Incident` + acceptance `Decision`.
- **assess-severity:** asks one more question ("does the exploit
  require a special config, or does it work on a default install?")
  — the answer determines the Attack Complexity component. Emits
  the CVSS vector as a `Decision` with per-component justifications.
- **investigate:** runs the exploit reproduction via curl (no
  Authorization header, captures the 200 + PII dump — redacted),
  reads the vulnerable code at `src/admin/index.ts:18` and the
  route registration at `src/app.ts:42` showing the missing
  `authMiddleware`. The vuln is confirmed and reachable.
- **diagnose:** root cause is the *missing control*
  (`authMiddleware` not registered on the `/admin` route), not a
  wrong computation. `Validation` with `method:
  "contract_validation"` against the security invariant "all admin
  routes require authentication."
- **propose-mitigation:** emits THREE `Decision`s (immediate patch +
  defense-in-depth guard + audit-trail improvement), each with its
  own `alternatives` array.
- **apply-mitigation:** blocked by safety gate until confirmed;
  emits the implementation `Decision` and three `file_change`
  `Event`s after the confirmed advance.
- **verify-mitigation:** re-runs the curl (now returns 401 with a
  redacted error), re-runs the auth/authorization suite (31 passed,
  +1 new regression test, no regression in legitimate flows).
  `Validation` with `method: "app_validation"`, `result: "match"`.
- **regression-protect:** writes the `known-failure` memory entry
  whose `symptom` is the *exploit behavior* (not the code
  structure), so a future regression is detected by behavior.
- **report:** writes the `project` memory entry containing the
  CVSS vector and the disclosure-and-timeline plan (90-day window,
  advisory publication date). Terminal.

## Why this matters (beyond "another test passes")

Before this run, the repo's ten e2e proofs covered workflows whose
defect class was always functional (the system didn't do what it
was supposed to do). `security-problem` covers the case where the
defect class is *missing control* — the system does what it was
written to do, but what it was written to do is *unsafe*. This is
a meaningfully different problem shape that requires:

- a dedicated severity-assessment state (CVSS-style scoring with
  per-component evidence),
- a reachability check in `investigate` (theoretical findings
  against unreachable code paths don't justify mitigation effort),
- a layered-mitigation pattern (immediate patch + defense-in-depth
  guard + audit-trail, three separate `Decision`s),
- a disclosure-and-timeline plan in the `report` (CVE filing,
  coordinated disclosure, advisory publication — none of which
  `bug-report` or `incident` require).

The fact that the same executor runs all eleven workflows without
code changes is the empirical proof that the Evidence Model's
`Decision` entity is flexible enough to represent (a) a root-cause
hypothesis (`bug-report`), (b) a design choice with rejected
alternatives (`feature-request`), (c) a CVSS severity assessment
(`security-problem`'s `assess-severity`), and (d) a layered
mitigation (`security-problem`'s `propose-mitigation`) — four
semantically distinct uses of the same schema, across structurally
distinct workflows.
