---
name: incident
description: Use at the assess-impact, triage, mitigate, verify-mitigation, and postmortem states of workflows/incident.sm.yaml — when a production alert has fired, the on-call has been paged, and the priority is mitigation FIRST, root-cause SECOND, postmortem THIRD. Includes SEV-scoring, proximate-trigger triage, mitigation-vs-fix distinction, SLO-recovery verification, and blameless-postmortem drafting. Novel to AIECP; no upstream equivalent found in docs/research.md.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Incident

## When to use this skill

At the `assess-impact`, `triage`, `mitigate`,
`verify-mitigation`, and `postmortem` states of
`workflows/incident.sm.yaml`. This skill is what stands between
"PagerDuty just paged me: error rate on /orders is 78%" and
"the incident is mitigated, the postmortem is written, the
action items are owned."

The structural distinction that makes this workflow separate
from `bug-report` is **what is at risk**. In `bug-report`, a
defect may or may not be in production; the engineer has time.
In `incident`, the system is *currently failing in production* —
users are being affected right now, the on-call has been paged,
and the priority order is:

1. **Mitigation** (stop the bleeding — rollback, scale-out,
   fail-over, block the triggering traffic, disable the buggy
   feature flag).
2. **Triage** (identify the proximate trigger — the most
   recent change that correlates with the incident's start
   time).
3. **Root cause** (the underlying defect or configuration that
   the proximate trigger exposed).
4. **Postmortem** (root cause + contributing factors + action
   items, blameless).

`bug-report` runs in roughly the opposite order (root cause
first, then fix). Reordering under pressure is the entire
reason `incident` is a separate workflow.

**Anti-patterns that mean: stop and return to `triage` or
`assess-impact`.**

- Investigating the root cause before mitigating. The root
  cause is for the postmortem; the user impact is for now. A
  10-minute root-cause investigation that delays a 2-minute
  rollback by 10 minutes is 10 minutes of avoidable user
  impact. Mitigate first; root-cause after the SLO recovers.
- Triageing from memory. "Last deploy was probably X" is not
  triage — it's a hypothesis. Read the actual deploy logs and
  the actual metrics; let the data name the trigger.
- Applying a "fix" instead of a "mitigation." A fix addresses
  the root cause (which may require a deploy and won't help
  right now); a mitigation stops the bleeding. The postmortem
  addresses the root cause; this state addresses the user
  impact.
- Skipping the postmortem because "we already know what
  happened." The postmortem is for the *project*, not the
  *responder* — it's the document the next on-call reads when
  the same symptom recurs at 3am. A skipped postmortem is a
  regression waiting to happen.
- Writing a blameful postmortem. The postmortem identifies
  systemic gaps (missing alerting, insufficient rollback
  automation, a deploy process that bypassed canary), not
  individual mistakes. A blameful postmortem suppresses future
  honest reporting; a blameless one builds the institutional
  memory the next incident depends on.
- Declaring incident-resolved before SLO recovery is verified.
  The verify-mitigation state exists because a mitigation can
  *appear* to work (the alert stopped firing) while the SLO is
  still burning budget (latency is elevated but not crossing
  the alert threshold). Confirm SLO recovery, not just alert
  silence.

## Procedure

### 1. Assess impact (state: `assess-impact`)

Score the incident's impact on production users, under time
pressure. Emit a `Decision` recording five fields:

1. **Severity** (SEV1: total outage / SEV2: partial outage or
   data loss / SEV3: degraded / SEV4: cosmetic). SEV1 and SEV2
   typically trigger the full incident workflow; SEV4 is rerouted
   to `bug-report`.
2. **Blast radius** — which endpoints, which user segments, which
   regions. Cite the alert's tags and the dashboard's filter.
3. **Affected-user estimate** — current error rate × current
   QPS × time-since-start. A 78% error rate at 1000 QPS for 12
   minutes = ~560,000 failed requests; the number matters for
   the postmortem's "customer impact" section.
4. **SLO breach status** — which SLOs are currently burning
   budget, and how much budget remains. The SLO burn rate
   determines whether this is a "minor" SEV2 (burning 2x
   normal) or a "major" SEV2 (burning 14x normal, will exhaust
   the budget in 2 hours if not mitigated).
5. **Customer-facing impact** — is the status page already
   updated? Are customers tweeting? Has support escalated?
   This is the difference between a "technical" incident (SLO
   burning, no users yet) and a "visible" incident (status page
   is up, social media is reacting).

May ask at most ONE necessary, specific, decision-changing
question — typically "is the affected service tier-1
(revenue-critical) or tier-2 (important but not revenue-
blocking)?" The answer determines the mitigation budget: tier-1
incidents justify aggressive rollback (lose the last 30 minutes
of writes to stop the bleeding); tier-2 may tolerate a slower
but safer mitigation path (gradual rollout of the fix).

**Failure handling:** if the impact is below the project's
declared sev-threshold (e.g., SEV4 cosmetic issues don't
trigger the full incident workflow), transition to `blocked`
with `on: impact_below_sev_threshold` and a recommendation to
reroute to `bug-report` — the workflow doesn't invest triage/
mitigate effort in sub-threshold issues.

### 2. Triage (state: `triage`)

Identify the proximate trigger — the most recent change that
correlates with the incident's start time. Emit a `Trace` of
`Event`s:

1. **Deploy logs in the affected service's window** — `Event`
   with `kind: "log_line"`, `source: "git log --since='2 hours
   ago' -- <service-path>"` (or the CI/CD pipeline's API), each
   commit's `payload.finding` quoting the commit message + deploy
   timestamp.
2. **Config flips** — `Event` with `kind: "observation"`,
   `source: "config-management: feature-flag-toggles (since 2h
   ago)"`, listing flag toggles in the window.
3. **Traffic patterns** — `Event` with `kind: "observation"`,
   `source: "metrics: QPS + error-rate (per endpoint, since
   2h ago)"`, showing the change point that correlates with
   the alert firing.
4. **Dependency health** — `Event` with `kind: "observation"`,
   `source: "third-party-status-pages + internal-service-
   dependencies"`, showing whether a dependency is also
   degraded (which would re-route the incident from "our
   defect" to "dependency outage, wait it out or fail over").

The triage conclusion is a `Decision` naming the proximate
trigger with `evidence_refs` pointing at the specific `Event`s
that justify the attribution. The proximate trigger is NOT
the root cause — it's the most recent change that exposed the
underlying defect. The root cause is for the postmortem.

Per `systematic-debugging` Phase 1 and `tool-use-discipline`,
the triage is tool-driven — read the actual deploy logs and
metrics, do not assert from memory. "Last deploy was probably
X" is a hypothesis, not a triage conclusion.

**Failure handling:** if the trigger cannot be identified within
a reasonable window (the incident's blast radius is too noisy to
attribute to a single change), transition to `blocked` with
`on: trigger_unidentifiable` and a precise gap. NOTE: `blocked`
here does NOT mean the incident is over — it means the workflow
cannot mitigate automatically, and the on-call must intervene
manually. The blocked state's report explicitly says this
("the workflow cannot identify the proximate trigger; the
on-call should declare a major incident and convene a bridge").

### 3. Mitigate (state: `mitigate`)

Apply a mitigation — NOT a fix. The distinction is structural:

- A *fix* addresses the root cause (which may require a deploy
  and won't help right now).
- A *mitigation* stops the bleeding (rollback the deploy, scale
  out, fail-over, block the triggering traffic, disable the
  buggy feature flag).

The postmortem (next state) addresses the root cause; this
state addresses the user impact.

Emit a `Decision` recording the chosen mitigation and the
alternatives considered. Each alternative has a tradeoff the
on-call must weigh under time pressure:

- **Rollback** — fastest, but loses any writes since the rolled-
  back version. Acceptable for stateless services; risky for
  stateful services (database rollbacks can corrupt data).
- **Scale out** — increases capacity to absorb the load. Works
  for capacity incidents (traffic spike) but not for defect
  incidents (the defect will still trigger at the higher
  capacity).
- **Fail-over** — switches traffic to a standby. Works for
  infrastructure failures (a node is bad); doesn't work for
  code defects (the standby has the same code).
- **Block the triggering traffic** — drops requests from the
  specific source causing the incident. Works for abuse / DDoS;
  doesn't work for legitimate traffic that the service should
  handle.
- **Disable the buggy feature flag** — turns off the specific
  code path that's failing. Works for feature-flag-gated
  rollouts; doesn't work for code that's not behind a flag.

The `broad-refactor` safety gate fires here (production
changes are sensitive — a wrong rollback can lose committed
data, a wrong fail-over can split-brain a stateful service).
The executor throws `safety-gate-needs-confirmation` on
`advance()` without confirmation; `advanceWithConfirmation()`
proceeds. Per the AI-output validation pattern, the mitigation
`Decision.validated` stays `false` until `verify-mitigation`
confirms SLO recovery.

Emit an `Event` (`kind: "action"`) capturing the mitigation
command (e.g., `"kubectl rollout undo deployment/api-service
-n prod"`, `"config-management: set feature-flag
'use-new-orders-flow' to false in prod"`, `"aws autoscaling
set-desired-capacity --group api-asg --desired-capacity 20"`).

For chat-LLM agents without `shell_exec` + `filesystem_write`,
transition to `blocked` with `on:
requires_production_write_capability` — the prepared mitigation
plan is handed back to the on-call, who can drive the remaining
steps via a tool-using agent or directly via the production
console. Honest fallback, not a fabricated "mitigated" — in
incident work a fabricated mitigation is the most dangerous
failure mode, because it suppresses the on-call intervention
that would otherwise stop the bleeding.

### 4. Verify mitigation (state: `verify-mitigation`)

Behavioral verification per ADR-0010 — but here, a green test
suite is *irrelevant* (tests don't run in prod). The
verification is:

1. Did SLOs recover? Error rate dropped to baseline, latency
   p50/p95/p99 returned to normal, queue depth drained.
2. Did alerts clear? The original alert stopped firing, AND no
   new alerts fired as a side effect of the mitigation.
3. Did the user-facing impact end? Customer reports stopped,
   status page updated to "resolved."

Emit a `Trace` with `Event`s capturing the SLO-recovery metrics
(`kind: "observation"`, `source: "metrics: error-rate +
latency + queue-depth (5m before mitigation vs. 5m after)"`).
Emit an `Actual` (the post-mitigation production behavior) and
a `Validation` with `method: "app_validation"` (the validation
is the production system's own behavior, not a test suite).

**Failure handling:** if the mitigation didn't recover the
SLOs (or only partially recovered — error rate dropped from
78% to 12% but didn't return to baseline), transition back to
`triage` with `on: mitigation_insufficient` rather than
proceeding to `postmortem` — the postmortem is for RESOLVED
incidents, not for incidents still bleeding. A second triage
pass with the new information (the first mitigation's partial
effect) often identifies a more precise trigger.

### 5. Postmortem (state: `postmortem`)

Write the postmortem. The postmortem is a *blameless* document
that identifies systemic gaps, not individual mistakes.

Emit a `Decision` recording the root cause and contributing
factors:

- **Root cause** — the underlying defect or configuration that
  the proximate trigger exposed. Cite the triage `Trace` and
  the verify-mitigation `Trace` via `evidence_refs`.
- **Contributing factors** — the systemic conditions that made
  the trigger possible: missing alerting (the alert that should
  have caught this earlier didn't exist), insufficient rollback
  automation (rollback required manual kubectl commands instead
  of a one-button operation), a deploy process that bypassed
  canary (the deploy went straight to 100% instead of 1% → 10%
  → 100%).
- **Timeline** — alert fired → ack → triage → mitigate →
  recovered, with timestamps. The timeline is for the next
  on-call's pattern-matching: "this looks like the 2026-08-14
  incident, where the rollback took 12 minutes; let me try the
  same mitigation."
- **Action items** — each with an owner, a due date, and a
  severity. The action items are what prevents the next
  incident; without them, the postmortem is just narrative.

Emit an `Event` (`kind: "file_change"`) recording the
postmortem document's location (per the project's postmortem
convention — typically `docs/postmortems/YYYY-MM-DD-<slug>.md`).
The document itself is the artifact; the `Event` is the
pointer to it.

The postmortem is **blameless**. Replace:

> "Engineer X deployed v1.4.1 without running the canary
>  script first."

with:

> "The deploy process did not require the canary script to be
>  run before promoting to 100%; the canary script exists but
>  is optional. Action item: make the canary script a hard
>  prerequisite for promotion (owner: deploy-platform team,
>  due: 2026-09-14)."

The first version identifies a person; the second identifies a
systemic gap. The first suppresses future honest reporting
(why report if you'll be blamed?); the second builds the
institutional memory the next incident depends on.

## Tool integration

- **`shell_exec`**: query the production deploy log (`git log`,
  `gh run list`, CI/CD API), query the metrics system
  (`curl '<metrics-api>?query=error_rate...'`), invoke the
  mitigation (`kubectl rollout undo`, `aws autoscaling
  set-desired-capacity`, `config-management: set-flag`), query
  the SLO-recovery metrics post-mitigation. Each command's
  output becomes an `Event.payload.finding` — verbatim, not
  paraphrased.
- **`filesystem_read`**: read the postmortem template (per the
  project's convention), read the known-failure memory to
  check for a prior regression of the same symptom, read
  Project Intelligence for the production environment
  fingerprint (region, service mesh, deploy pipeline).
- **`filesystem_write`**: write the postmortem document to
  `docs/postmortems/`. Write the `known-failure` memory entry
  at `report` (per the workflow's `writes_memory` declaration).
- **`test_runner`**: typically NOT used in incident (tests
  don't run in prod). May be used in `postmortem` to add a
  regression test against the root cause, but that's a future
  `bug-report` run's job, not incident's. Incident's job is to
  mitigate and document, not to fix.

## Validation (of this skill itself)

An `assess-impact` / `triage` / `mitigate` / `verify-mitigation`
/ `postmortem` step using this skill is done correctly only if:

- The `assess-impact` `Decision.what` includes a SEV level
  (SEV1/SEV2/SEV3/SEV4), a blast radius, an affected-user
  estimate, an SLO-breach status, and a customer-facing-impact
  note. Each field cited with evidence in `why`.
- The `triage` state emitted at least one `Event` per evidence
  source (deploy log / config flips / traffic patterns /
  dependency health), each `kind: "log_line"` or `"observation"`
  with a verbatim `source` citation.
- The `mitigate` `Decision` records the chosen mitigation AND
  at least one alternative with a rejection reason. The
  `broad-refactor` safety gate fired (the run log has a
  `gate-check` entry for the `mitigate` state).
- The `mitigate` `Event` is `kind: "action"` with the
  mitigation command verbatim.
- The `verify-mitigation` `Validation` has `method:
  "app_validation"` (the validation is the production system's
  own behavior, NOT a test suite — `unit_test` is wrong for
  incident verification because tests don't run in prod).
- The `postmortem` `Decision.why` identifies the **root cause**
  (not just the proximate trigger) and at least one
  **contributing factor** (a systemic gap, not an individual
  mistake). The postmortem `Event` records the document's
  location.
- The postmortem is **blameless** — no individual is named as
  the cause; systemic gaps are identified instead.
- No question was asked during `triage`, `mitigate`,
  `verify-mitigation`, or `postmortem` — these states are not
  in `incident.sm.yaml`'s `question_economy.allowed_states`
  (only `classify` and `assess-impact` are).

## Examples

**Happy path (deploy regression, SEV2):** PagerDuty fires:
error rate on /orders is 78% (baseline 0.2%), starting 14
minutes ago. → `classify` reads the alert; one question ("was
there a recent deploy in the affected service's window?") →
user answers "yes, v1.4.1 deployed 16 minutes ago" →
`assess-impact` scores SEV2 (partial outage), blast radius =
/orders endpoint globally, ~560,000 affected requests so far,
SLO burn rate 14x (will exhaust budget in 2h), status page
not yet updated → asks one question ("is /orders tier-1 or
tier-2?") → user answers "tier-1 (revenue-critical)" →
`triage` emits 4 `Event`s: deploy log shows v1.4.1 deployed at
T-16m (commit 9ab... introduces a null-deref in the orders
handler), config flips none, traffic shows error rate spike
correlates with deploy timestamp, dependency health all green
→ `Decision`: proximate trigger = v1.4.1 deploy at T-16m,
`evidence_refs` to the deploy-log Event → `mitigate` chooses
rollback (roll back to v1.4.0), the broad-refactor gate fires
(tier-1 prod change requires confirmation), confirmed via
`advanceWithConfirmation`, emits `Event` with `kubectl rollout
undo deployment/api-service -n prod` → `verify-mitigation`
emits `Trace` with metrics: error rate dropped from 78% to
0.2% in 4 minutes, latency p99 back to baseline, alerts
cleared; `Validation` with `method: "app_validation"`, `result:
"match"` → `postmortem` emits `Decision` with root cause (null-
deref at src/orders/handler.ts:42 — the same defect the
user-complaint workflow later resolved in a non-incident
context), contributing factors (canary script exists but is
optional in the deploy pipeline; the canary would have caught
the null-deref at 1% traffic), action items (make canary
mandatory, owner: deploy-platform team, due 2026-09-14; add
regression test, owner: orders team, due 2026-08-21), and an
`Event` with the postmortem at `docs/postmortems/2026-08-14-
orders-null-deref.md` → `report` writes a `known-failure`
memory entry whose `symptom` is the *alert-observed symptom*
("error rate on /orders > 50% after a deploy") so a future
regression is detected by alert, not by code structure.

**Failure mode (trigger unidentifiable):** PagerDuty fires:
latency on /search is elevated to 3.5s p95 (baseline 200ms).
→ `classify` reads the alert; one question ("any recent
deploys?") → user answers "no, no deploys in 24h" →
`assess-impact` scores SEV3 (degraded), asks one question
("tier-1 or tier-2?") → tier-2 → `triage` emits 4 `Event`s:
no deploys in window, no config flips, traffic shows 1.4x
normal QPS (no spike, just elevated baseline), dependency
health shows the search-backend service is also at 3s p95 →
but the search-backend is owned by a different team and
their dashboard shows they're also triaging; the triage
cannot attribute the incident to a single change because the
blast radius is too noisy (the search-backend's degradation
is itself a symptom, not a trigger) → transition to `blocked`
with `on: trigger_unidentifiable` and a precise gap: "the
workflow cannot identify the proximate trigger; the /search
degradation appears to be downstream of the search-backend
service's own degradation (3s p95 on the backend); recommend
declaring a major incident and convening a bridge with the
search-backend team." The blocked state's report explicitly
notes the incident is NOT over and the on-call must intervene
manually.

**Failure mode (chat LLM without production write capability):**
A chat-driven agent (per `CHAT-ENTRYPOINT.md`, pure-text
adapter) reaches `mitigate` after triaging the deploy regression
to v1.4.1, but has no `shell_exec` and no `filesystem_write`
capability. → The transition `mitigate → blocked on:
requires_production_write_capability` fires → the `blocked`
state's report includes: the triage conclusion (proximate
trigger = v1.4.1 deploy at T-16m), the prepared mitigation
(`kubectl rollout undo deployment/api-service -n prod`), the
expected SLO-recovery metrics to verify after the rollback,
and a precise instruction: "the chat LLM cannot run the
rollback itself; the on-call should run the mitigation command
manually and then resume this run at `verify-mitigation`."
Honest fallback, not a fabricated "mitigated" — in incident
work a fabricated mitigation is the most dangerous failure
mode, because it suppresses the on-call intervention that
would otherwise stop the bleeding.
