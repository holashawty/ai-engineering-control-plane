---
name: security-problem
description: Use at the assess-severity, investigate, diagnose, and propose-mitigation states of workflows/security-problem.sm.yaml — when a vulnerability report, suspicious access pattern, or security-audit finding has been filed against the system. Includes CVSS-style severity scoring, reachability confirmation (so theoretical findings against unreachable code paths don't waste mitigation effort), and a layered-mitigation pattern (immediate patch + defense-in-depth guard + audit-trail improvement). Novel to AIECP; no upstream equivalent found in docs/research.md.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Security Problem

## When to use this skill

At the `assess-severity`, `investigate`, `diagnose`, and
`propose-mitigation` states of
`workflows/security-problem.sm.yaml`. This skill is what stands
between "a security researcher reported an auth bypass on
/admin" and "the team has shipped a layered mitigation, filed a
CVE if warranted, and coordinated disclosure with downstream
consumers."

The structural distinction that makes this workflow separate from
`bug-report` is **what is at risk**. In `bug-report`, the system
misbehaves (wrong output, crash, slowness). In
`security-problem`, the system "works" — it returns the right
status codes, the right shapes, the right latency — but it does
so in a way that exposes data, escalates privilege, or fails
closed when it should fail open (or vice versa). The defect is
in the *security property* (confidentiality, integrity,
availability) the system should have upheld, not in the
functional behavior the system was specified to deliver.

**Anti-patterns that mean: stop and return to `assess-severity`
or `investigate`.**

- Treating a security finding as a "bug we'll fix later." Security
  findings have a disclosure clock that starts the moment the
  reporter files the report, not the moment the engineer opens
  the ticket. A finding shelved for "next sprint" may become a
  public 0-day before the sprint starts.
- Skipping the reachability check. A theoretical finding against
  an unreachable code path does not justify a mitigation — but
  confirming unreachability requires evidence (a dead-code
  analysis, a runtime trace showing the path isn't executed),
  not an assertion. "Probably unreachable" is not "unreachable."
- Applying only the immediate patch without the defense-in-depth
  guard. The immediate patch closes the *specific* vuln; the
  defense-in-depth guard closes the *class* of vuln. A patch
  without a guard leaves the next instance of the same class to
  be discovered (by the same researcher, or a different one).
- Committing the exploit payload in a test without redaction. A
  regression test that contains a working exploit is itself a
  security artifact; the test should exercise the *class* (a
  benign payload of the same shape) not the original exploit
  string.
- Publishing the fix publicly before the disclosure window closes.
  Even a "we fixed it" commit message can leak the vulnerability
  to anyone watching the repo. The `report` state's deliverable
  includes a disclosure-and-timeline plan; the public commit
  should follow the timeline, not precede it.

## Procedure

### 1. Assess severity (state: `assess-severity`)

Score the vulnerability's severity using an explicit CVSS-style
vector, even if approximate. The point of the score is not the
number — it's the discipline of justifying each component with
evidence.

The CVSS v3.1 vector has eight components:

- **Attack Vector (AV)**: Network (N) / Adjacent (A) / Local (L) /
  Physical (P). *Network* = reachable from the public internet;
  *Adjacent* = reachable from inside the VPC / LAN / Bluetooth
  range; *Local* = requires local access to the host; *Physical*
  = requires physical access to the device.
- **Attack Complexity (AC)**: Low (L) / High (H). *Low* = no
  special conditions; *High* = requires a race condition, a
  specific configuration, or a one-time preparation.
- **Privileges Required (PR)**: None (N) / Low (L) / High (H).
  *None* = unauthenticated; *Low* = any authenticated user;
  *High* = admin.
- **User Interaction (UI)**: None (N) / Required (R). *Required*
  = the victim must take an action (click a link, visit a page).
- **Scope (S)**: Changed (C) / Unchanged (U). *Changed* = the
  vuln affects a component beyond the vulnerable one (e.g., an
  SSRF that escapes the sandbox and hits an admin service).
- **Confidentiality Impact (C)**: None (N) / Low (L) / High (H).
- **Integrity Impact (I)**: None (N) / Low (L) / High (H).
- **Availability Impact (A)**: None (N) / Low (L) / High (H).

For each component, record a one-line citation: the evidence
(`Event` / `Trace` from `classify` or prior states) that
justifies the choice. Emit the score as a `Decision`:

```json
{
  "id": "decision-severity-assessment-1",
  "what": "severity_assessment:CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
  "why": "AV:N — vulnerable endpoint /admin is exposed via the public ingress (event-classify-1: 'ingress route /admin -> service admin-svc, no auth proxy in front'); AC:L — no special conditions, the bypass works on first request; PR:N — endpoint accepts no auth header (event-curl-no-auth: 'curl /admin returns 200 with no Authorization header'); UI:N — no user interaction required; S:U — vuln affects only admin-svc, does not escape to other components; C:H — response includes full user PII (event-curl-response); I:H — writable via POST, allowing unauthorized admin data modification; A:N — does not affect availability",
  "validated": true,
  "result": "accepted"
}
```

The `validated: true` here is unusual for an AI proposal, but
severity assessment is not a code change — it is a reasoning
output whose validation comes from the evidence cited in `why`.
Per the AI-output validation pattern, the eventual *mitigation*
Decision will be `validated: false` until verify-mitigation
confirms it.

May ask at most ONE necessary, specific, decision-changing
question — typically "is the vulnerable endpoint reachable from
the public internet, or only from inside the VPC?" The answer
flips AV between Network and Adjacent, which can change the
CVSS Base Score by 0.5–1.5 points and may cross the project's
fix-threshold.

**Failure handling:** if the severity is below the project's
declared fix-threshold (e.g., CVSS < 4.0 = "informational"), do
NOT proceed to `investigate` — confirm the threshold with
evidence (cite the project's security policy), transition to
`blocked` with `on: severity_below_threshold`, and structure
the blocked report as an audit-finding record (CVSS vector,
affected endpoint, recommendation to revisit at the next
security audit cycle). Sub-threshold findings are still
findings; they just don't justify the full investigate→mitigate
investment right now.

### 2. Investigate (state: `investigate`)

Confirm the vulnerability is real AND reachable. A theoretical
finding against an unreachable code path does not justify a
mitigation — confirming unreachability is itself a valid
`investigate` outcome.

Emit `Event`s capturing:

1. **The affected code path** — `kind: "observation"`,
   `source: "filesystem_read: <file:line>"`, `payload.finding`
   quoting the vulnerable code verbatim with the line citation.
2. **The triggering request/input** — `kind: "observation"`,
   `source: "curl -sS ..."` (or equivalent), `payload.finding`
   with the request and response. **REDACT any secrets** in the
   request or response before emitting, per
   `evidence-engineering` step 4. A token used to demonstrate
   an auth bypass should be replaced with `<redacted-token>` —
   the test is the request shape, not the token value.
3. **The exploit's observable effect** — `kind: "observation"`,
   describing what the attacker gains (PII dump, admin access,
   server-side request forged to internal service, etc.).
4. **Corroborating log evidence** (if available) — `kind:
   "log_line"`, with the log line quoted verbatim and the
   source file path.

Per `skills/recency-verification/SKILL.md`, if the vuln involves
a dependency CVE:

- Invoke `web_search` (or the project's advisory-tracking tool,
  e.g., `npm audit --json`, `pip-audit`, `safety check`) to
  confirm the CVE is current and not already patched in the
  installed version.
- Record the CVE id, the advisory URL, and the installed version
  in a dedicated `Event` (`source: "advisory-lookup:NVD-CVE-
  XXXX-YYYY"`).
- A CVE that was patched in a version newer than the lockfile is
  a real finding; a CVE that was patched in the version the
  lockfile already pins is a false positive — record it as
  resolved and transition to `blocked` with `on:
  vulnerability_not_reachable` (the vuln is not reachable because
  the patched version is installed).

**Three possible conclusions from `investigate`:**

1. **Confirmed and reachable** — the vuln is real and the
   exploit works as described. Transition to `diagnose` with
   `on: vulnerability_confirmed`.
2. **Not reachable** — the affected code path is dead, the
   vulnerable dependency is locked but not loaded, or the
   exploit cannot be triggered given the actual runtime
   configuration. Transition to `blocked` with `on:
   vulnerability_not_reachable` and a precise gap citing the
   dead-code analysis. This is NOT a failure — it saves the
   team from patching a non-issue.
3. **No evidence either way** — neither confirmed nor refuted.
   Transition to `blocked` with `on: no_evidence_found` and
   a precise gap (what additional reproduction is needed).

### 3. Diagnose (state: `diagnose`)

Walk the debugging chain per `skills/systematic-debugging/
SKILL.md` Phase 3 — but with a security-specific twist: the
root cause is typically a *missing control* (no auth check, no
input validation, no rate-limit, no output encoding) rather than
a *wrong computation* (which is `bug-report`'s typical shape).
The `Decision.why` field should name the missing control
explicitly:

> "Root cause: missing authentication check on the /admin route.
> The route handler at src/admin/index.ts:18 reads
> `req.user.role` without first verifying that `req.user` is
> set, assuming an upstream auth middleware has populated it.
> The route was registered without the auth middleware in
> `src/app.ts:42` (`app.use('/admin', adminRouter)` instead
> of `app.use('/admin', authMiddleware, adminRouter)`).
> Result: any unauthenticated request reaches the handler with
> `req.user === undefined`, and the handler's `req.user.role`
> access returns undefined, which the `=== 'admin'` check
> rejects — but a separate code path at line 24 returns the
> admin data before the role check fires, leaking it to
> unauthenticated callers."

Emit a `Validation` comparing the `Actual` (the vulnerable
behavior) against an `Expected` describing the security
property that should have held:

- `method: "contract_validation"` if the system has a security
  contract / invariant / policy that was violated (e.g., a
  `specs/invariants.md` entry "all admin routes require
  authentication").
- `method: "manual_review"` if no explicit contract exists and
  the diagnosis is by security-engineering reasoning. This is
  legitimate — many security properties are not yet captured
  as named contracts, and the `report` state can recommend
  adding the contract as a follow-up.

### 4. Propose mitigation (state: `propose-mitigation`)

Propose a *mitigation*, not just a "fix." Security work
typically involves **layered defenses**:

1. **Immediate patch** — close the specific vuln at the
   affected code path. The smallest change that closes the
   exploit. For the auth-bypass example above: register
   `authMiddleware` on the `/admin` route at `src/app.ts:42`.
2. **Defense-in-depth guard** — close the *class* of vuln at a
   boundary upstream of the specific path, so a future instance
   of the same class (a new admin route added without the
   middleware) is still caught. For the example: add a route-
   registration guard that requires every route starting with
   `/admin` to be wrapped in `authMiddleware`, throwing at
   startup if any admin route is registered without it.
3. **Audit-trail improvement** — log the rejected attempts so
   future exploitation attempts are visible. For the example:
   add a structured-log line on every rejected unauthenticated
   `/admin/*` request, with the source IP, the route, and the
   timestamp, feeding into the security alerting pipeline.

Each layer is a **separate `Decision`** (per
`systematic-debugging`'s defense-in-depth guidance). Each
layer's `alternatives` array records what was considered and
rejected — the alternatives matter for the eventual `report`'s
decision trace, and they matter for the next security audit
(which can confirm the layer is still in place).

Per the AI-output validation pattern, all three Decisions are
`validated: false` until `verify-mitigation` confirms behavior.
The `broad-refactor` safety gate is NOT evaluated here — it is
evaluated at `apply-mitigation`, when the actual refactor
surface becomes knowable (the defense-in-depth guard at the
framework boundary may trip the threshold).

## Tool integration

- **`filesystem_read`**: read the vulnerable code path, the
  auth middleware, the route registration, the framework
  boundary where a defense-in-depth guard would be added, the
  security policy / invariants / specs. Also used to read prior
  `Trace`/`Event` artifacts when building the reference chain.
- **`filesystem_write`**: write the CVSS severity-assessment
  `Decision`, the corroborating-evidence `Trace`/`Event`s (with
  secrets redacted per `evidence-engineering` step 4), the
  layered-mitigation `Decision`s, the regression test/invariant
  added in `regression-protect`, and the `known-failure` memory
  entry whose `symptom` is the exploit behavior. The skill
  procedure stops short of writing the actual code patch — that
  is `apply-mitigation`'s job, gated by the workflow's
  `broad-refactor` safety gate (which is intentionally stricter
  for security fixes: a wrong fix can silently reopen the vuln or
  break authentication broadly). But the evidence trail itself is
  a write obligation: a `security-problem` run that does not
  persist its evidence files has not produced an auditable
  Decision Trace, and per constitution §2 the trace is the
  artifact, not the chat log. Per constitution §8, honest
  fallback to `blocked` with `on:
  requires_filesystem_write_capability` is mandatory for chat
  LLMs that lack the tool — in security work this is especially
  dangerous: a fabricated "fix applied" claim that leaves the
  vuln open while claiming it's closed suppresses the disclosure
  that would otherwise prompt human intervention.
- **`shell_exec`**: run the exploit reproduction (curl, a
  scripted client, a fuzzer); run the post-mitigation
  verification (same curl, expecting a different response); run
  advisory-lookup commands (`npm audit`, `pip-audit`, `safety
  check`). Each command's output becomes an `Event.payload.
  finding` — verbatim, with secrets redacted per
  `evidence-engineering` step 4.
- **`test_runner`**: structured access to test results when
  `investigate` runs the existing auth/authorization suite
  (to confirm no regression in legitimate flows during
  verify-mitigation) and when adding the regression test for
  the closed vuln class. Per `behavioral-verification`,
  `test_runner`'s pass/fail signal is necessary-but-not-
  sufficient — the direct exploit-rejection check is required
  for `verify-mitigation`.

## Validation (of this skill itself)

An `assess-severity` / `investigate` / `diagnose` /
`propose-mitigation` step using this skill is done correctly
only if:

- The `assess-severity` `Decision.what` starts with
  `"severity_assessment:CVSS:"` and includes all 8 CVSS v3.1
  components (AV/AC/PR/UI/S/C/I/A), each justified by a
  citation in `why`. The score is not just a number — it's a
  vector with evidence per component.
- The `investigate` state emitted at least one `Event` per
  piece of corroborating evidence, with secrets redacted (per
  `evidence-engineering` step 4). The exploit payload in a
  test should be a benign payload of the same shape, not the
  original exploit string.
- If `investigate` concludes `vulnerability_not_reachable`,
  the `blocked` transition cites the dead-code analysis or the
  advisory-lookup showing the patched version is installed —
  not a vague "probably not reachable."
- The `diagnose` `Decision.why` names the *missing control*
  explicitly (no auth check / no input validation / no rate-
  limit / no output encoding), not just "there's a bug."
- The `propose-mitigation` state emits at least TWO `Decision`s
  when feasible: one for the immediate patch and one for the
  defense-in-depth guard. (The audit-trail improvement is
  optional if the project has no structured-logging pipeline.)
- No question was asked during `investigate`, `diagnose`, or
  `propose-mitigation` — these states are not in
  `security-problem.sm.yaml`'s `question_economy.allowed_states`
  (only `classify` and `assess-severity` are). Asking a
  question here is a constitution violation, not a stylistic
  choice (per `constitution/constitution.md` §4).
- Each evidence file actually persisted to disk via
  `filesystem_write` to the run's evidence directory (per
  `evidence-engineering` step 4). A `security-problem` step that
  emitted its CVSS `Decision` / `Trace` / `Event`s / layered
  mitigation `Decision`s only to chat output, without a real
  `filesystem_write`, did not produce auditable evidence. Per
  constitution §8, honest fallback to `blocked` with `on:
  requires_filesystem_write_capability` is mandatory for chat
  LLMs that lack the tool — in security work this is especially
  dangerous: a fabricated "fix applied" claim that leaves the
  vuln open while claiming it's closed suppresses the disclosure
  that would otherwise prompt human intervention.

## Examples

**Happy path (auth bypass, high severity):** A security
researcher reports that GET /admin/users returns the full user
PII dump without authentication. → `classify` reads the report
and the repo; the class is "authentication bypass"; one question
("is /admin exposed via the public ingress, or only via the
internal VPC?") → user answers "public ingress" →
`assess-severity` scores CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
(7.6 High), each component justified by an evidence citation →
`investigate` runs `curl -sS https://api.example.com/admin/users`
(no Authorization header), captures the 200 response with the
PII dump, reads `src/admin/index.ts:18` showing the missing
auth middleware, reads `src/app.ts:42` showing the route
registration without `authMiddleware` → `diagnose` emits the
missing-control root cause and a `Validation` with `method:
"contract_validation"` against the security invariant "all
admin routes require authentication" (cited from
`specs/invariants.md#auth`) → `propose-mitigation` emits three
`Decision`s: (1) add `authMiddleware` to the `/admin` route
registration, (2) add a route-registration guard throwing at
startup if any `/admin/*` route is registered without
`authMiddleware`, (3) add a structured-log line on rejected
unauthenticated `/admin/*` requests → `apply-mitigation`
applies all three (the broad-refactor gate fires for layer 2,
the route-registration guard touches every route registration
site — confirmed via `advanceWithConfirmation`) →
`verify-mitigation` re-runs the curl (now returns 401 with a
redacted error), re-runs the auth/authorization suite (no
regression in legitimate flows), emits a `Validation` with
`method: "app_validation"` → `regression-protect` writes a
`known-failure` entry whose `symptom` is "GET /admin/users
without Authorization header returns 200 with PII dump"
(observed behavior, not code structure — so a future regression
is detected by behavior even if the refactor obscures the
code shape) → `report` summarizes the CVSS vector, the layered
mitigation, the CVE filing recommendation, and the
disclosure-and-timeline plan (90-day coordinated disclosure
window starting from the reporter's filing date).

**Failure mode (vulnerability not reachable):** A SAST tool
reports a dependency CVE (CVE-2024-XXXX) in `lodash@4.17.20`,
rated CVSS 9.8 Critical. → `classify` reads the report →
`assess-severity` scores it at face value (CVSS 9.8,
Network/low-complexity/none-privileges/none-UI/changed-scope/
high-C/high-I/high-A) → `investigate` runs `npm ls lodash`
(showing `lodash@4.17.20` is in the lockfile), then runs `rg -n
"require\\(['\"]lodash['\"]\\)|from ['\"]lodash['\"]"` across
the codebase (showing zero imports — `lodash` is a transitive
dependency pulled in by a dev-only tool that isn't loaded in
production) → transition to `blocked` with `on:
vulnerability_not_reachable` and a precise gap: "CVE-2024-XXXX
affects `lodash@4.17.20` which is in the lockfile as a
transitive dependency of `webpack-dev-server` (devDependency,
not loaded in production). Verified via `rg` zero imports of
`lodash` across `src/` and `tests/`. Recommendation: run `npm
dedupe` and `npm audit fix` at the next dependency-update cycle
to clear the lockfile, but no production mitigation needed."
The blocked state's report is structured as an audit-finding
record so the next security audit can skip the same finding
once the lockfile is updated.

**Failure mode (chat LLM without filesystem_write):** A
chat-driven agent (per `CHAT-ENTRYPOINT.md`) reaches
`apply-mitigation` for a confirmed auth bypass but has no
`filesystem_write` capability (per the `chat` adapter, all
capabilities false). → The transition `apply-mitigation →
blocked on: requires_filesystem_write_capability` fires → the
`blocked` state's report includes: the full mitigation
proposal (the three `Decision`s from `propose-mitigation`),
the diff sketches for each layer, and a precise instruction:
"the chat LLM cannot apply this mitigation itself; a tool-
using agent (per `chat-sandbox` adapter or a CLI agent) must
pick up this run and apply the three Decisions before the
disclosure window closes." Honest fallback, not a fabricated
"fixed" — the alternative (a chat LLM claiming to apply a fix
it cannot apply) is exactly the failure mode the constitution
§3 / §8 mandate exists to prevent, and in security work it's
especially dangerous because it suppresses the human
intervention that would otherwise prompt a real fix.
