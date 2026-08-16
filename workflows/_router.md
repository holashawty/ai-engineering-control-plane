# Workflow Router

**Status: Phase 2 — fifteen runnable workflows, all proven end-to-end.**

Deterministic mapping from (intent classification, repository state) to a
workflow. Per docs/workflow-model.md, the user never selects a workflow
directly; they supply intent in natural language.

## MVP routing table

All 15 workflows are implemented as runnable workflows and proven
end-to-end against the real executor (`WorkflowRun` API):

- `bug-report.sm.yaml` — reactive (something broken). Proof:
  `executor/examples/e2e-membership-bug/`.
- `feature-request.sm.yaml` — constructive (new capability added).
  Proof: `executor/examples/e2e-feature-request/`.
- `code-review.sm.yaml` — gatekeeping (read-only change assessment).
  Proof: `executor/examples/e2e-code-review/`.
- `refactor.sm.yaml` — behavior-preserving. Proof:
  `executor/examples/e2e-refactor/`.
- `change-request.sm.yaml` — behavior-modifying. Proof:
  `executor/examples/e2e-change-request/`.
- `project-onboarding.sm.yaml` — entry point for any new repo;
  runs `discovery/cli` and writes the initial memory entries.
  Proof: `executor/examples/e2e-project-onboarding/`.
- `regression.sm.yaml` — prior-context-aware (a known-failure
  symptom recurs). Proof: `executor/examples/e2e-regression/`.
- `performance-problem.sm.yaml` — cost-shaped ("it's slow").
  Proof: `executor/examples/e2e-performance-problem/`.

Together these cover the primary shapes of engineering work:
reactive, constructive, behavior-preserving, behavior-modifying,
gatekeeping, onboarding, regression, and performance — driven by
the same workflow-agnostic executor.

| Intent signal (heuristic, not exhaustive) | Workflow | Status |
|---|---|---|
| "X doesn't work", "X sometimes fails", "error when I...", stack trace pasted | `bug-report` | **MVP — implemented** |
| No `.aiecp/project-intelligence.json` present in repo | `project-onboarding` | **MVP — implemented** |
| "add a feature", "I want users to be able to...", new capability request | `feature-request` | **MVP — implemented** |
| "change how X works", modify existing behavior without it being broken | `change-request` | **MVP — implemented** |
| User reports a UI/API bug filed by someone else against them | `user-complaint` | **MVP — implemented** |
| A `known-failure` memory entry's symptom recurs | `regression` | **MVP — implemented** |
| "clean up", "refactor", "simplify", no behavior change intended | `refactor` | **MVP — implemented** |
| "review this PR/diff" | `code-review` | **MVP — implemented** |
| "it's slow", latency/throughput complaint | `performance-problem` | **MVP — implemented** |
| Vulnerability report, suspicious access pattern | `security-problem` | **MVP — implemented** |
| "ship this", "cut a release" | `release` | **MVP — implemented** |
| Production alert, on-call page | `incident` | **MVP — implemented** |
| `.aiecp/project-intelligence.json` exists but is `stale: true` | `discovery-refresh` | **MVP — implemented** |
| Intent doesn't match any row above with confidence | `unknown-failure` | **MVP — implemented** (fallback) — must triage into another workflow or refuse safely |
| Multi-intent request: "fix X AND add Y", "release this AND clean up Z", multi-step goal spanning 2+ workflows above | `orchestrator` | **MVP — implemented** — "loop engineering" (LangChain, June 2026): chains workflows in a loop (bug-report → feature-request → …) until the goal is met or blocked; the agent prompts ITSELF between iterations rather than returning to the user. Distinct from `unknown-failure` (which triages a single ambiguous intent into one target); the orchestrator drives multi-workflow autonomous execution. Safety-gated at `execute-workflow` (broad-refactor) on every spawn — delegation is gated just as application is gated. Proof: `executor/examples/e2e-orchestrator/`. |

## Classification method (MVP)

1. Check whether `.aiecp/project-intelligence.json` exists and is not
   `stale: true`. If missing/stale → route to `project-onboarding` first
   (once implemented; until then, surface a `blocked` state explaining
   discovery hasn't run).
2. Otherwise, match intent signal against the table above using the
   project's own Discovery output (error logs, recent commits, test
   failures) as corroborating evidence, not just message text.
3. If no confident match → `unknown-failure` (fallback), never silently
   guess a workflow.

## Fast-Path (Risk-Based Adaptive Routing)

**Status: Phase 2+ — Implemented in `executor/src/risk-classifier.ts`
(ADR-0034). The MVP routing table above is unchanged; the Fast-Path
sits on TOP of it as an outer router.**

### Motivation

A 1-line typo fix in a `.md` file runs the full 8-state `bug-report`
FSM. That's wasteful — the constitution's safety apparatus (question
economy, safety gates, evidence emission at every state) is sized
for "real" changes, not 3-LOC doc tweaks. Pro-LLM's audit
(roadmap-2026-pro.md Item 5):

> "Basit tip düzeltmelerinde hızlı-yol (Fast-Path), mimari
> değişikliklerde ise tam anayasal FSM devreye girmelidir."
> (*For simple typo fixes, Fast-Path; for architectural changes,
> the full constitutional FSM.*)

### The 5 risk levels and their default workflow paths

The risk classifier (`classifyRisk` in
`executor/src/risk-classifier.ts`) is a PURE function — no I/O, no
LLM, no side effects. The caller (typically the orchestrator's
`classify-goal` state) constructs `RiskSignals` from git output:

- `git diff --stat` → `diff_loc` (additions + deletions) and
  `files_changed` (file count)
- `git diff --name-only` → `file_extensions` (parsed from each
  filename's suffix)
- the user's request tokens → `request_keywords`
- `.aiecp/memory/known-failures.json` lookup → `known_failure_match`

The classifier then maps the signals to one of 5 levels, each with
a default workflow path:

| Risk level | Default path | When it applies (deterministic rules) |
|---|---|---|
| `trivial` | **`fast-path`** | `diff_loc ≤ 5` AND `files_changed ≤ 2` AND no `.ts`/`.py`/`.go`/`.rs`/`.java` extensions (only `.md`, `.txt`, `.json` config) AND no security keywords |
| `low` | `full-fsm` | `diff_loc ≤ 50` AND `files_changed ≤ 5` AND no security keywords AND no `known_failure_match` |
| `medium` | `full-fsm` | `diff_loc ≤ 500` AND `files_changed ≤ 20` AND no security keywords (default for real changes with no escalators) |
| `high` | **`full-fsm-plus-review`** | `diff_loc > 500` OR `files_changed > 20` (mandatory `code-review` workflow runs AFTER the primary workflow) |
| `critical` | **`full-fsm-plus-human-approval`** | ANY of: security keyword present in request (`security`, `auth`, `password`, `payment`, `token`, `secret`, `credential`, `vulnerability`, `CVE`) OR `known_failure_match=true` with `diff_loc > 50` |

**Edge case — empty signals:** when no `diff_loc`, `files_changed`,
`file_extensions`, or `request_keywords` are provided (e.g., the
caller couldn't compute a diff for some reason), the classifier
returns `medium` as a safe default — refusing to fast-path without
positive evidence the change is trivial.

### What `trivial` does (the fast-path)

When the classifier returns `level === "trivial"` (and thus
`fast_path_eligible === true`), the outer router SKIPS the FSM
entirely. Instead of entering `bug-report.sm.yaml`'s `triage` →
`reproduce` → `localize` → ... → `verify` → `report` chain, the
router:

1. Emits a single `Decision` entity with
   `what: "fast_path_applied"` — recording that the fast-path was
   taken (so future replays/audits can see it).
2. Applies the change directly (the agent applies the trivial diff
   — typically a 1-3 LOC `.md`/`.txt`/`.json` tweak).
3. Verifies the change (build/test/`validate` — same `verify`
   semantics as the FSM's terminal `verify` state, just without
   the preceding states).
4. Emits a final `Validation` entity recording whether the
   post-apply verification passed.

The fast-path is **gate-free** but **not evidence-free**: every
fast-path application still emits the same `Decision` and
`Validation` entities the FSM would emit, so the audit trail is
preserved. A future investigator reading `.aiecp/evidence/` cannot
tell from the evidence alone whether the FSM or the fast-path
produced the artifacts — only the `Decision.what: "fast_path_applied"`
marker distinguishes them.

### What `critical` does (the new gate)

When the classifier returns `level === "critical"`, the router
takes the `full-fsm-plus-human-approval` path. This is the full FSM
with one additional gate inserted before the terminal `apply` state:

- **`human-approval-required` gate** — a new safety gate type that
  blocks the workflow until an out-of-band human confirmation is
  received (via `aiecp:confirm gate: human`). This is distinct from
  the existing `broad-refactor` and `safety-gate` types: those
  gate *autonomy within the agent's normal flow*; this gate
  *requires a human in the loop* before the change can land.

The gate applies to:
- Any change touching security-sensitive code paths (auth, payment,
  credential handling) — detected via security keywords in the
  request.
- Any change with `known_failure_match=true` AND `diff_loc > 50` —
  a regression-risk change that's large enough to plausibly
  re-introduce the known failure.

Small regression-risk changes (`known_failure_match=true` with
`diff_loc ≤ 50`) do NOT trigger the human-approval gate — they
go through the standard FSM at `medium` risk (since `low` excludes
`known_failure_match`). The human-approval gate is reserved for
changes that are BOTH regression-risk AND large.

### This is an OUTER router — the FSM definitions are unchanged

The `.sm.yaml` files in `workflows/` are NOT modified by ADR-0034.
Every workflow still has the same states, transitions, safety
gates, and question budgets. The risk classifier sits on TOP of
the router table:

```
user intent → MVP routing table (above) → workflow .sm.yaml → FSM execution
                    │
                    └─→ risk classifier (this section)
                          │
                          ├─ trivial  → skip FSM, fast-path
                          ├─ low      → enter FSM (default)
                          ├─ medium   → enter FSM (default)
                          ├─ high     → enter FSM + schedule code-review after
                          └─ critical → enter FSM + insert human-approval gate
```

This keeps the FSM purity (every workflow still has the same
states and can be executed end-to-end without the risk classifier)
while adding a practical escape hatch for trivial work and a
practical safety escalation for critical work.

### Implementation reference

- **Classifier**: `executor/src/risk-classifier.ts` —
  `classifyRisk(signals: RiskSignals): RiskAssessment`. Exports
  `SECURITY_KEYWORDS`, `CODE_EXTENSIONS`, `TRIVIAL_ALLOWED_EXTENSIONS`,
  and `RISK_THRESHOLDS` for introspection (mirrors `SCALE_RANGES`
  in `project-scale-classifier.ts`).
- **Regression test**: `executor/examples/e2e-risk-classifier/drive-run.mjs`
  (run via `npm run e2e:risk-classifier`) — 45 assertions covering
  all 5 risk levels, the empty-signals safe default, all 4 boundary
  inclusivity cases (diff_loc = 5/6/50/51), and defensive empty-input
  handling.
- **Decision record**: `DECISIONS.md` ADR-0034.

## Non-goals

None for the current scope. Multi-intent routing is handled by
`orchestrator.sm.yaml` (see routing table above).
