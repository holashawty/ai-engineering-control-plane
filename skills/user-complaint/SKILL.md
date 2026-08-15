---
name: user-complaint
description: Use at the understand-complaint, investigate, and diagnose states of workflows/user-complaint.sm.yaml — when a third party (another team, a customer, a QA engineer, a security reviewer) has filed a bug report against the engineer's system and the engineer must triage the complaint, determine whether it is well-founded, and respond. Novel to AIECP; no upstream equivalent found in docs/research.md.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# User Complaint

## When to use this skill

At the `understand-complaint`, `investigate`, and `diagnose` states
of `workflows/user-complaint.sm.yaml`. This skill is what stands
between "a third party filed a ticket saying the login page is
broken" and "the engineer has produced a fix AND a reply to the
reporter that explains what happened."

The structural distinction that makes this workflow separate from
`bug-report` is **who first observed the symptom**. In `bug-report`,
the user (the engineer driving the workflow) noticed their own
system misbehaving and drives the diagnosis themselves with full
context. In `user-complaint`, the symptom was first observed by a
third party — another team, a customer, a QA engineer, a security
reviewer — whose report may be incomplete, may be mis-stated, may
apply to a different version, or may describe expected behavior the
reporter simply didn't expect. The engineer's first job is not to
locate a root cause; it is to *understand what the reporter is
claiming*, *triage whether the claim is well-founded*, and *only
then* investigate the codebase.

**Anti-patterns that mean: stop and return to `understand-complaint`.**

- Reading the codebase before capturing the reporter's words as
  evidence. The temptation is high because reading code feels
  productive and reading a complaint feels like busywork, but a
  diagnosis built against a paraphrased complaint is built against
  the engineer's mental model of the reporter's words, not the
  reporter's actual words — and the gap between those two is
  exactly where misunderstandings about user-complaint root causes
  live.
- Treating "the reporter is wrong" as the same thing as "the
  complaint is invalid." A reporter may be wrong about the cause,
  wrong about the expected behavior, and right about the symptom
  all at once. The fix is to record the symptom as the
  corroborated observation and reject the (incorrect) cause, not
  to dismiss the entire complaint.
- Skipping the paired-Expected step because "the spec is obvious."
  The spec is obvious only to the engineer who wrote it. The
  reporter's reading of the spec is the data point that determines
  whether this is a defect or a documentation issue.
- Replying to the reporter before `verify` confirms behavior. The
  `report` state's deliverable includes a draft reply, but the reply
  should cite the validation evidence — a reply that promises a fix
  the validation hasn't confirmed is a reply that will be retracted.

## Procedure

### 1. Understand the complaint (state: `understand-complaint`)

Translate the third-party complaint into structured evidence
BEFORE reading the codebase. The complaint itself is the primary
evidence — it is the artifact the engineer is responding to, and
its wording matters for both the diagnosis and the eventual reply.

Emit three evidence artifacts in this order:

1. **`Event`** (`evidence/schema/event.schema.json`) capturing the
   complaint text verbatim, with:
   - `kind: "observation"` — the engineer did not produce this; it
     was observed externally.
   - `source`: the ticket URL, channel name, or email subject line
     the complaint came in through. If the complaint was forwarded
     through a chain (reporter → triage team → engineer), each hop
     is recorded in `payload.forwarded_by`.
   - `payload.finding`: the reporter's reproduction steps, stated
     expected behavior, stated actual behavior, and any attached
     artifacts (screenshots, request/response pairs, log snippets)
     — quoted, not paraphrased. A future `Replay` step may need to
     reproduce the reporter's exact reproduction.
   - `ts`: the timestamp the complaint was *filed*, not when the
     engineer read it (these may differ by days; the gap matters
     for `investigate`'s evidence-gathering, because the relevant
     git history window starts at the complaint's `ts`, not at the
     engineer's read time).

2. **`Expected`** (reporter-stated) — the contract the reporter
   *believed* applied, drawn from their own words. If the reporter
   wrote "I expected a 200 response with the user object," the
   predicate is exactly that sentence (with whatever qualification
   the reporter attached). `source_ref` is
   `"reporter-stated-expectation: <ticket-id>"` — explicitly
   labeled as the reporter's belief, not as the documented
   contract. `predicate_kind: "behavioral"`. The point of emitting
   this as an `Expected` (rather than just including it in the
   complaint Event's payload) is that it can then be compared
   against the *documented-contract* `Expected` in `diagnose`'s
   `Validation` — making the disagreement between the reporter's
   mental model and the system's actual contract a first-class
   artifact in the evidence chain.

3. **`Expected`** (documented-contract) — what the system's own
   specs / docs / API contracts actually say should happen in the
   scenario the reporter described. This requires reading the
   repo's specs (`specs/spec.md`), API docs (`docs/api/`), or
   contract tests (`tests/contract/`). `source_ref` points at the
   spec section / API doc anchor / contract test file. If no
   documented contract exists for the scenario the reporter
   described, that is itself a finding: emit this `Expected` with
   `predicate: "no documented contract found for <scenario>"` and
   `predicate_kind: "behavioral"` — and note in the `Decision`
   emitted at `classify`'s next state that the system has a
   contract gap, which may itself be the root cause.

Wrap the complaint Event in a `Trace` so the complaint is citable
as a unit by `investigate` and `diagnose`.

**Failure handling:** if the complaint is unintelligible —
self-contradictory, missing the actual reproduction steps, or
applies to a system the engineer doesn't recognize as their own —
transition to `blocked` with `on: complaint_unintelligible` and a
precise gap statement (what specifically could not be parsed, and
what one piece of information would unblock the parse). Do NOT
proceed to `investigate` against a paraphrased complaint — the
gap between the paraphrase and the reporter's words is exactly
where mis-diagnoses start.

### 2. Investigate (state: `investigate`)

Locate evidence in the codebase that corroborates or refutes the
complaint. The structural distinction from `bug-report`'s
`locate-evidence` is **triage vs. confirmation**: `bug-report`
assumes the symptom is real because the engineer observed it;
`investigate` here treats the complaint's claim as a hypothesis to
be tested.

For each piece of evidence found, emit an `Event`:

- `kind: "log_line"` for log output, with `source: <log-file-path>`
  and `payload.finding` quoting the line(s) verbatim.
- `kind: "test_result"` for test outcomes, with `source: <test-
  runner-invocation>` and `payload.result: "passed" | "failed"` +
  `payload.note` describing what the test asserted.
- `kind: "observation"` for any other observation (an API response
  captured via curl, a UI screenshot annotated with the relevant
  state, a database row content), with `source` describing how the
  observation was obtained.

**Concrete evidence-gathering commands.** Adapt the same shell
arsenal `systematic-debugging` Phase 1 uses, but point them at the
complaint's claimed symptom rather than an engineer-observed one:

```bash
# What does the codebase say about the surface the reporter named?
rg -n '<route-or-endpoint-name>' --type=ts --type=py
git log --oneline -20 -- '<path-the-reporter-named>'

# Can we reproduce the reporter's stated reproduction?
git stash  # if needed to test against a clean tree
<test-runner> <test-file-matching-the-reporter-scenario>
git stash pop  # if a stash was created

# Does the documented contract the reporter cited actually exist?
rg -n '#<spec-anchor-reported>' specs/ docs/api/
```

Each command's stdout becomes its own `Event.payload.finding` —
verbatim, not paraphrased.

**Two possible conclusions from `investigate`:**

1. **Corroborated** — the reported behavior actually occurs. The
   `Event`s captured here form the trace that `diagnose` will walk.
   Transition to `diagnose` with `on: evidence_located`.

2. **Refuted** — the reported behavior does not occur under the
   engineer's reproduction. This is not a failure of the workflow;
   it is the workflow working correctly: the engineer has saved
   themselves from fixing a non-defect. Transition to `blocked`
   with `on: complaint_invalid_per_contract`, surfacing:
   - The reproduction the engineer actually ran (cite the
     `Event`s).
   - The actual observed behavior (with the spec/contract citation
     that defines it).
   - A pointer to the reply the engineer can send to the reporter
     ("we ran the reproduction in version X and observed Y, which
     matches the documented contract at Z; the behavior you
     described does not occur in the current version — can you
     confirm the version you were testing against?").

**A third, rare but legitimate outcome:** `no_evidence_found` —
neither corroborated nor refuted. The engineer cannot reproduce
the symptom, and cannot prove it doesn't occur either (e.g., it
is timing-dependent, or only happens under load the engineer
cannot generate locally). Transition to `blocked` with `on:
no_evidence_found` and a precise gap ("the symptom is reported as
intermittent; we could not reproduce it in 10 attempts; the
reporter should provide an environment fingerprint or a
production trace before this can be diagnosed"). Do not proceed
to `diagnose` against an unconfirmed symptom — a diagnosis built
on an unconfirmed symptom is a guess.

### 3. Diagnose (state: `diagnose`)

Walk the debugging chain per `skills/systematic-debugging/SKILL.md`
Phase 3 (hypothesis → test → minimal fix), against the
*corroborated* symptom from `investigate` — not the original
complaint text.

The paired-Expected from `understand-complaint` matters here:

- If the reporter-stated `Expected` matches the documented-contract
  `Expected` (the reporter was correct about the contract), the
  `Validation` emitted here compares the `Actual` (what
  `investigate` observed) against EITHER Expected — they're the
  same. The diagnosis is the usual root-cause walk.
- If the reporter-stated `Expected` does NOT match the
  documented-contract `Expected` (the reporter was wrong about the
  contract, but the symptom is real), the `Validation` MUST
  reference the documented-contract `Expected` — the system
  violated its actual contract, not the one the reporter imagined.
  The reporter's misreading is a separate finding (a documentation
  issue or a contract-clarification follow-up), not a substitute
  for the actual root cause.

Emit a `Decision` (root-cause candidate, `validated: false` until
`verify` confirms) and an `Actual` (what the system actually does,
drawn from `investigate`'s trace) compared against the
documented-contract `Expected` via a `Validation`. Use
`method: "contract_validation"` for spec/contract divergence,
`method: "app_validation"` for behavioral observation, or
`method: "replay_comparison"` if `investigate` produced a
reproduction trace that can be replayed.

Per `skills/tool-use-discipline/SKILL.md`, no diagnosis is asserted
from memory — read the actual code, run the actual reproduction,
let the tools produce the findings.

## Tool integration

- **`filesystem_read`**: read the reporter's complaint (if filed
  as a file in the repo, e.g., a `BUGS/` directory or an issue
  template), read the repo's own specs/contracts/docs to emit the
  documented-contract `Expected`, read source code in `investigate`
  to find corroborating or refuting evidence. Also used to read
  prior `Trace`/`Event` artifacts when building the reference
  chain.
- **`filesystem_write`**: write the paired-Expected evidence
  files, the corroborated-symptom `Trace`, and the regression
  test/invariant added in `regression-protect`. (The skill
  procedure stops short of writing the actual code patch — that
  is `apply-fix`'s job, gated by the workflow's `broad-refactor`
  safety gate. But the evidence trail itself is a write
  obligation: a `user-complaint` run that does not persist its
  evidence files has not produced an auditable Decision Trace, and
  per constitution §2 the trace is the artifact, not the chat
  log.) A chat LLM without `filesystem_write` cannot complete
  `understand-complaint` honestly — per constitution §8 honest
  fallback to `blocked` is mandatory, never a fabricated "I wrote
  the evidence" claim.
- **`shell_exec`**: run evidence-gathering commands (`git log`,
  `git diff`, `rg`, language-specific test runners, `curl` against
  a running service, log-grep across production log exports). The
  output of each becomes an `Event.payload.finding` — verbatim,
  not paraphrased.
- **`test_runner`**: structured access to test results when
  `investigate` runs the existing test suite (to corroborate or
  refute the reported symptom) and when `diagnose` runs a targeted
  reproduction. Per `behavioral-verification`, `test_runner`'s
  pass/fail signal is necessary-but-not-sufficient for the eventual
  `verify` state — but it is the right tool for `investigate`'s
  triage step.

## Validation (of this skill itself)

A `understand-complaint` / `investigate` / `diagnose` step using
this skill is done correctly only if:

- At least one `Event` of `kind: "observation"` was emitted in
  `understand-complaint` capturing the complaint text verbatim
  (not paraphrased into prose).
- TWO `Expected` entities were emitted in `understand-complaint`:
  one reporter-stated (source_ref starting with
  `"reporter-stated-expectation:"`) and one documented-contract
  (source_ref pointing at a spec / docs / contract-test artifact
  in the repo). The paired-Expected is the structural feature
  unique to this workflow; skipping it collapses `user-complaint`
  into `bug-report`.
- The `investigate` state emitted at least one `Event` per piece
  of corroborating OR refuting evidence found (per
  `tool-use-discipline`, no evidence is asserted from memory).
- If `investigate` concludes `complaint_invalid_per_contract`, the
  `blocked` transition cites the documented contract (the
  documented-contract `Expected`'s `source_ref`) and the
  reproduction the engineer actually ran — not a vague "complaint
  is wrong."
- The `diagnose` `Validation` references the *documented-contract*
  `Expected` (not the reporter-stated one) when the two disagree.
- No question was asked during `understand-complaint`,
  `investigate`, or `diagnose` — these states are not in
  `user-complaint.sm.yaml`'s `question_economy.allowed_states`
  (only `classify` is). Asking a question here is a constitution
  violation, not a stylistic choice (per
  `constitution/constitution.md` §4).
- Each evidence file actually persisted to disk via
  `filesystem_write` to the run's evidence directory (per
  `evidence-engineering` step 4). A `user-complaint` step that
  emitted its `Event`/`Expected`/`Trace` only to chat output,
  without a real `filesystem_write`, did not produce auditable
  evidence. Per constitution §8, honest fallback to `blocked`
  with `on: requires_filesystem_write_capability` is mandatory for
  chat LLMs that lack the tool — never a fabricated "I wrote the
  file" claim.

## Examples

**Happy path (complaint well-founded):** A customer files a ticket
saying "the /orders endpoint returns 500 when I POST a payload with
a `null` shipping_address." → `classify` reads the ticket, the
repo's `/orders` route, and the documented API contract; the class
is "API contract dispute" and one question is needed ("is the
`null` shipping_address documented as allowed, or is it an invalid
input?") → user answers "documented as allowed" →
`understand-complaint` emits the verbatim complaint Event, a
reporter-stated Expected ("POST /orders with `null`
shipping_address returns 201 with the created order") and a
documented-contract Expected ("POST /orders with `null`
shipping_address returns 201 per specs/spec.md#orders-create,
which lists shipping_address as nullable") → the two Expecteds
*agree*, so the complaint is well-founded → `investigate` runs the
reporter's reproduction (`curl -X POST /orders -d '{"shipping_address": null}'`)
and captures a 500 response with a stack trace in the log →
`diagnose` walks the chain: the handler dereferences
`shipping_address.street` without a null check; root-cause
candidate: "handler assumes non-null shipping_address despite the
spec documenting it as nullable"; `validated: false` until verify.
The `Validation` references the documented-contract Expected (same
as the reporter-stated, since they agreed) with `method:
"app_validation"`. Fix proceeds; the eventual `report` includes
a draft reply to the customer citing the validation evidence.

**Failure mode (complaint invalid per contract):** An internal
team files a ticket saying "your /health endpoint should return
503 when the DB is unreachable, but ours returns 200." → `classify`
reads the ticket and the repo; one question ("is the DB-down case
documented as returning 503, or is /health designed to be a
liveness check only?") — the spec says /health is a liveness
check (process alive), not a readiness check (DB reachable) →
`understand-complaint` emits the verbatim complaint, a
reporter-stated Expected ("GET /health returns 503 when DB is
unreachable") and a documented-contract Expected ("GET /health
returns 200 if the process is alive, per specs/spec.md#health —
readiness is checked via GET /ready, not GET /health") → the two
Expecteds *disagree*, so `investigate` runs both reproductions:
GET /health returns 200 (matches documented contract), GET /ready
returns 503 when DB is down (matches documented contract) → the
complaint's claim that "your endpoint should return 503" is
invalid per the documented contract, but the underlying symptom
(DB-down detection) IS handled — just by a different endpoint →
transition to `blocked` with `on: complaint_invalid_per_contract`
and a precise gap: "the documented contract at
specs/spec.md#health defines /health as a liveness check; the
DB-unreachable readiness signal is on /ready (specs/spec.md#ready);
we reproduced both behaviors successfully; the reporter may have
been hitting /health expecting /ready's semantics — a reply is
drafted in the blocked state's report." The reporter gets a
response that explains the contract architecture, the fix (if any
is needed) is a documentation improvement to make the
liveness-vs-readiness distinction more discoverable, and no code
change is applied for the original complaint because no defect
exists.
