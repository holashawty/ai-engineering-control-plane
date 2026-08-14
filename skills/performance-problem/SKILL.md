---
name: performance-problem
description: 'Use at the capture-baseline, profile, diagnose-bottleneck, optimize, verify-improvement, and regression-protect states of workflows/performance-problem.sm.yaml. Performance problems are NOT functional bugs — the code produces correct output, just too slowly or with too much memory or under too small a load. The diagnosis is "find the operation whose cost is too high," not "find the line that produces the wrong value." Per ADR-0010, a passing test suite does NOT verify performance — performance verification requires measuring the metric, not running assertions. Novel to AIECP; no upstream equivalent found in docs/research.md. The profiler-commands-per-language reference (Node --prof, Python cProfile, Go pprof, Swift Instruments) is curated from general performance-engineering practice, no single upstream source.'
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Performance Problem

## When to use this skill

At the `capture-baseline`, `profile`, `diagnose-bottleneck`,
`optimize`, `verify-improvement`, and `regression-protect` states
of `workflows/performance-problem.sm.yaml`. Do not apply this
skill to a request where the code produces wrong output — that is
`bug-report`, even if the wrong-output code is also slow. The acid
test for routing: would a faster implementation of the SAME
behavior fix the complaint? If yes, this skill. If the behavior
itself is wrong (and fixing it would also fix the slowness), route
to `bug-report` instead. A `bug-report` mis-routed through this
skill will produce a faster way to produce wrong output — that
is not improvement, it is regression.

**Performance problems are NOT functional bugs.** This skill exists
as a separate skill (rather than a clause of `systematic-debugging`)
precisely because the diagnosis is structurally different. A
functional bug asks "what line produced the wrong value?" — the
answer is a single localized fix, found by walking the debugging
chain backward from the symptom. A performance problem asks "what
operation has the highest cost?" — the answer is a measurement, not
a code-read, and the optimization that addresses it may touch many
files (a cache, an index, a rewrite of a hot loop). The two skills
share the Phase 1 evidence-gathering discipline (profiler output
IS evidence, just like a stack trace is evidence), but the diagnosis
and fix procedures diverge sharply from there.

**Per ADR-0010 ("no exception ≠ success").** A passing test suite
does NOT verify performance. Performance verification requires
*measuring the metric* (latency, throughput, memory, GC pauses —
whatever the performance class demands), not running assertions.
A `Validation` with `result: "match"` after an optimization must
reference the actual measured metrics in `evidence_refs[]`, not
just "the suite passed." This is the same ADR-0010 hazard named
for `bug-report` (a green suite masking unverifiable correctness),
specialized to performance: a green suite masking unverifiable
*improvement*. A 10x speedup that breaks 3 tests is NOT an
improvement — it is a faster way to produce wrong output.

## Procedure

### 1. Capture baseline (state: `capture-baseline`)

Before touching any code, measure the current cost under the
reported load. The baseline is the contract the optimization must
improve on.

1. Identify the reported load. If the user said "the `/items`
   endpoint is slow," the load is "the traffic `/items` sees in
   production" — get the actual RPS, the actual payload sizes, the
   actual concurrency. If the user said "the batch job takes 4
   hours," the load is "the production input size, not the dev
   input size." Do NOT substitute a smaller dev-shaped load for a
   production-shaped load — a baseline measured under a different
   load than reported is not a baseline, it is a guess. If the
   reported load cannot be reproduced locally (production-only
   traffic patterns, no load generator, no production-equivalent
   fixtures), transition to `blocked` with `baseline_uncapturable`
   and a precise gap statement, rather than capturing a misleading
   baseline.
2. Run the code under the reported load and capture timing/memory
   metrics. Emit each measurement as its own `event`
   (`evidence/schema/event.schema.json`) with `kind: "test_result"`
   and `payload.metrics` containing concrete numbers
   (`payload.metrics.p99_latency_ms`, `payload.metrics.throughput_rps`,
   `payload.metrics.peak_rss_mb`, `payload.metrics.gc_pause_count`,
   `payload.metrics.db_query_count` — whatever the performance
   class demands). Group all measurements under a `trace`
   (`evidence/schema/trace.schema.json`) with `source: "test_runner"`
   or `source: "shell_exec"` (whichever adapter ran the load).
3. **CRITICAL: set `environment_fingerprint_ref` on the `Trace`.**
   This is the ONLY workflow state in the catalog that REQUIRES
   this field. Per `evidence/schema/trace.schema.json`,
   `environment_fingerprint_ref` is a non-required string field
   (the schema doesn't enforce it, but this skill's procedure does)
   — performance is environment-sensitive in a way functional
   behavior is not. Same code, different hardware (CPU, disk,
   memory bandwidth), different result. A baseline captured on a
   developer's M2 MacBook is not comparable to a baseline captured
   in a memory-constrained container; without the fingerprint
   anchoring the baseline to the environment it was measured in,
   the eventual `verify-improvement` comparison is unverifiable
   (a 2x speedup observed on different hardware than the baseline
   may be a 2x hardware difference, not a 2x optimization). The
   fingerprint should at minimum record the runtime version
   (`node --version`, `python --version`, `go version`), the OS
   and architecture, the available memory, and (for disk-bound
   workloads) the disk type; redact any secret-shaped env vars per
   `evidence-engineering` step 4 before writing.
4. Author an `expected` (`evidence/schema/expected.schema.json`)
   recording the performance contract being violated — what the
   system SHOULD produce, per spec/SLA/contract. For "it's slow,"
   the `Expected` is "endpoint responds in <200ms at p99 under 100
   RPS" (not "endpoint responds eventually"). The `predicate_kind`
   is `"behavioral"` (performance is behavior over time, not a
   state property or exact value). If no explicit contract exists,
   author one from the user's complaint ("user reports >5s latency
   at /items under normal load — inferred contract: p99 < 1s under
   reported load") and mark the `source_ref` as
   `"inferred-from-user-complaint"` so the inference is auditable.

### 2. Profile (state: `profile`)

Run a profiler against the code path the baseline identified as
the hot path. The profiler output IS the evidence that
`diagnose-bottleneck` reasons from — without it, the bottleneck
identification is a guess, and a guess at the bottleneck produces
a guess at the optimization.

**Profiler commands per language** (this is the curated reference
the workflow description cites; choose the one matching the
project's stack via Project Intelligence
`.aiecp/project-intelligence.json`):

- **Node.js / JavaScript / TypeScript:** `node --prof <script>`
  produces an `isolate-*-v8.log` file in the CWD; then
  `node --prof-process isolate-*-v8.log > profile.txt` produces
  the human-readable report. For CPU profiling in a long-running
  process, use the `--cpu-prof` flag (writes a `CPU.*.cpuprofile`
  file openable in Chrome DevTools). For memory profiling, use
  `--heap-prof` (heap snapshot). For HTTP services, the
  `clinic.js` suite (`clinic doctor`, `clinic flame`) gives a
  friendlier view but is a third-party dependency — only use it if
  the project already depends on it.
- **Python:** `python -m cProfile -o profile.out <script>` writes
  a binary profile, then `python -c "import pstats; pstats.Stats('profile.out').sort_stats('cumulative').print_stats(30)"`
  prints the top 30 by cumulative time. For memory profiling,
  `memory_profiler` (`pip install memory_profiler`; `python -m
  memory_profiler <script>`). For line-by-line CPU, `line_profiler`
  (`@profile` decorator + `kernprof -l -v`).
- **Go:** `go test -cpuprofile cpu.prof -bench .` writes a CPU
  profile; then `go tool pprof cpu.prof` opens the interactive
  viewer (or `go tool pprof -top cpu.prof` for a top-listing
  directly to stdout). For memory, `-memprofile mem.prof` + `go
  tool pprof mem.prof`. For a long-running server, `net/http/pprof`
  exposes `/debug/pprof/` endpoints live.
- **Swift / iOS:** `xcrun xctrace record --template 'Time Profiler'
  --launch <binary>` (CLI), or Xcode → Product → Profile → Time
  Profiler (GUI). For memory, the Allocations template. For
  network, the Network template. The output is a `.trace` bundle
  openable in Instruments.
- **Rust:** `cargo build --release` then run under `valgrind
  --tool=callgrind <binary>` (Linux; produces `callgrind.out.*`
  viewable with `kcachegrind` or `callgrind_annotate`). For memory,
  `valgrind --tool=massif`. For a native Rust profiler, `cargo
  flamegraph` (wraps `perf` on Linux, `dtrace` on macOS).
- **Java / JVM:** `async-profiler` (`./profiler.sh -d 30 -f
  profile.html <pid>`) produces a flamegraph; or, built-in,
  `jstack <pid>` for thread snapshots, `jcmd <pid> GC.heap_info`
  for memory state.

Emit each profiler-identified hot function as its own `event`
(`evidence/schema/event.schema.json`) with `kind: "observation"`
and `payload.finding` describing the contribution: `payload.function
= "listItems"`, `payload.call_count = 100`, `payload.total_time_ms
= 1180`, `payload.percent_of_wall_time = 98.3` — verbatim from the
profiler output, not paraphrased. Group all profiler observations
under a `trace` with `source: "shell_exec:<profiler>"` (e.g.
`source: "shell_exec:node --prof"`). Record the exact profiler
command (including flags) as the `Trace.source` or as a separate
`kind: "observation"` `Event` so the run is replayable.

**Failure handling:** if the profiler shows no clear hot path (cost
distributed across many functions, no single one dominating),
transition to `blocked` with `bottleneck_unidentifiable` — the
problem is architectural, not local, and pressing through with a
speculative optimization against no clear target is the failure
mode this state exists to prevent. If the profiler reveals the
baseline was captured under the wrong load (hot path at 10 RPS is
different from hot path at 1000 RPS, and the user's complaint was
about 1000 RPS), transition back to `capture-baseline` with
`profile_needs_different_load` rather than diagnosing against the
wrong load.

### 3. Diagnose bottleneck (state: `diagnose-bottleneck`)

From the profiler output, identify the specific operation whose
cost dominates the baseline — not "the code is slow" (that is
the complaint, not the diagnosis), but "function X called N times,
total T ms, accounting for P% of wall time, and P is large enough
that fixing X is worth the optimization effort."

1. From the profiler `event`s, find the function (or system call,
   or query) whose `percent_of_wall_time` is the largest AND whose
   `call_count` suggests it could be reduced. A function called
   once and taking 90% of wall time is a different optimization
   target than a function called 10000 times and taking 90% of
   wall time — the first wants algorithmic rework, the second
   wants batching or caching.
2. Emit the identified bottleneck as a `decision`
   (`evidence/schema/decision.schema.json`) with `validated: false`
   initially (it is a candidate until `verify-improvement` confirms
   the optimization actually addressed it), `what:
   "bottleneck_candidate:<function-or-operation>"`, `why` citing
   the profiler evidence ("function X accounts for P% of wall time
   per profiler trace-profile-1, called N times per baseline run"),
   and `evidence_refs[]` pointing at the profiler `event`s from
   `profile`. This is the candidate — it is not yet confirmed, and
   the `validated: false` reflects that.
3. Author an `expected` describing the post-optimization target:
   what the bottleneck's cost SHOULD drop to after the optimization.
   "Function X total time should drop below T_target ms" or "DB
   query count should drop from N to ≤ 1 per request." The target
   must be a measurable quantity, not "should be faster" — without
   a measurable target, `verify-improvement` has nothing to compare
   against. If the target cannot be inferred from the project's
   existing contracts or the user's complaint, ASK — this is the
   ONE allowed question in this state per `question_economy`. The
   question must be decision-changing: "what is the acceptable
   target latency at p99 under 1000 RPS?" is decision-changing
   (without a target, "improvement" is unmeasurable); "what data
   structure should I use?" is not decision-changing at the
   workflow level (it is an implementation detail).
4. If the profiler shows cost is distributed across many functions
   (no single function accounts for a meaningful fraction of wall
   time), transition to `blocked` with
   `bottleneck_unidentifiable` and a recommendation for
   architectural review — the problem is not local, no single
   optimization will address it, and pressing through with a
   speculative patch is the failure mode this state exists to
   prevent. The three-failure rule from `systematic-debugging`
   applies: if three bottleneck candidates have been proposed and
   rejected (each tested via `optimize` → `verify-improvement` →
   `improvement_insufficient`), stop adding candidates of the
   same shape — the problem is architectural.

### 4. Optimize (state: `optimize`)

Apply the optimization targeting the identified bottleneck. Per
the AI-output validation pattern (`docs/evidence-model.md`), every
code change is a `Decision` with `validated: false` until
`verify-improvement` confirms the improvement was real AND did not
introduce a functional regression.

1. Pick the optimization that most directly targets the bottleneck
   identified in `diagnose-bottleneck`. If the bottleneck is an
   N+1 query, the optimization is "replace the N+1 with a JOIN" —
   not "add a cache" (a cache addresses the symptom, not the cause;
   the per-item query still runs, it just hits the cache the
   second time, and the first call is still O(N) DB roundtrips).
   If the bottleneck is an O(n²) loop, the optimization is "reduce
   to O(n log n) via a different algorithm or data structure" —
   not "make the inner loop faster" (a constant-factor speedup of
   a quadratic algorithm is still quadratic). The optimization
   choice should follow from the bottleneck, not from "what
   optimization do I know how to write."
2. The `broad-refactor` safety gate fires here, not at
   `diagnose-bottleneck`, because the actual optimization surface
   is only knowable once implementation begins. Performance
   optimizations are structurally invasive by nature:
   - Introduce a cache → touch every callsite that reads the
     cached value (the cache invalidation contract must be
     honored at every write site too).
   - Add a database index → touch the schema and every query
     plan (the index may help some queries and hurt others,
     depending on selectivity).
   - Rewrite a hot loop → may touch the function's signature
     (parameter shape, return type) and therefore every caller.
   - Replace a per-item DB call with a batch call → the new
     function shape is different, every caller must change.

   If the gate trips (the refactor exceeds
   `broad_refactor_threshold`), do NOT press through with
   `advanceWithConfirmation` reflexively — the gate is tripping
   because the optimization is broader than a single-file change,
   which is the signal that the bottleneck diagnosis was
   incomplete (the optimization should be smaller if it is targeted
   at a single identified bottleneck, not at "the whole codebase").
   Transition back to `diagnose-bottleneck` with
   `optimization_needs_redesign` to either narrow the target
   (is the bottleneck really a single function, or a whole
   subsystem?) or to re-route (if the cost is genuinely
   architectural, the right workflow may be `change-request`
   rather than `performance-problem`).

3. Emit the optimization `Decision` with `what:
   "ai_proposal:apply_optimization:<description>"`, `validated:
   false` (AI proposal — flipped to true only after
   `verify-improvement` confirms the improvement AND the absence
   of functional regression), `result: "pending"`, and an `event`
   with `kind: "file_change"` and `payload.diff_summary` describing
   what changed structurally. Do NOT claim "10x speedup" in this
   `event` — that is what `verify-improvement` is for; the
   `file_change` `Event` records the structural diff, not the
   performance claim.

### 5. Verify improvement (state: `verify-improvement`)

Re-run the baseline (the SAME load, the SAME
`environment_fingerprint_ref` as `capture-baseline`) against the
optimized code and confirm BOTH (1) the performance metric improved
AND (2) the existing test suite still passes (no functional
regression). This is the state that operationalizes ADR-0010 for
performance: a green suite alone is insufficient (no performance
measurement); a performance improvement alone is insufficient (no
functional regression check); BOTH are required for `result:
"match"`.

1. Re-run the captured baseline load against the optimized code,
   using the SAME `environment_fingerprint_ref` (same runtime
   version, same OS/arch, same available memory). If the
   environment has drifted since `capture-baseline` (different
   machine, different runtime version, different available memory),
   the comparison is invalid — transition to `blocked` with
   `improvement_unverifiable` rather than reporting a misleading
   delta.
2. Capture each post-optimization measurement as its own `event`
   with `kind: "test_result"` and `payload.metrics` (same shape as
   the baseline `event`s). Group them under a new `trace` with
   the SAME `environment_fingerprint_ref` as the baseline `trace`.
3. Emit an `actual` (`evidence/schema/actual.schema.json`) recording
   the post-optimization metrics, `expected_ref` pointing at the
   `expected` from `diagnose-bottleneck` (the post-optimization
   target), and `observation_ref` pointing at the post-optimization
   `event` (or the first one if there are multiple).
4. Emit a `validation` (`evidence/schema/validation.schema.json`)
   with:
   - `result: "match"` only if BOTH (a) the measured metric meets
     the target `Expected` from `diagnose-bottleneck` AND (b) the
     existing test suite passes against the optimized code. A
     10x speedup that breaks 3 tests is `result: "mismatch"`, not
     `result: "match"` — faster wrong output is not improvement.
   - `result: "mismatch"` if (a) the metric did not improve (the
     optimization did not address the diagnosed bottleneck —
     transition back to `optimize` with
     `improvement_insufficient`, then back to `diagnose-bottleneck`
     if the second optimization also fails), OR (b) the suite
     broke (the optimization is wrong even if it is fast —
     transition back to `optimize` with `improvement_insufficient`
     to fix the regression before re-verifying).
   - `method: "app_validation"` if the performance check was an
     application-level measurement (replayed load against the
     optimized endpoint, observed concrete latency numbers).
   - `method: "replay_comparison"` if the comparison was
     specifically against the captured baseline (re-run the SAME
     load against the SAME hardware, observe the timing delta).
     This is the canonical method for performance-problem when the
     baseline is replayable bit-for-bit — same as `refactor`'s
     `verify-equivalence` uses it for behavioral equivalence, here
     used for performance-equivalence (the new code is observationally
     equivalent except in the measured metric).
   - `evidence_refs[]` MUST include both the baseline `event`s
     from `capture-baseline` AND the post-optimization `event`s
     from this state's re-run — a `Validation` with only
     post-optimization evidence has no baseline to compare against
     and is unverifiable.
5. **Run the existing test suite** as a separate axis from the
   performance check. The suite must pass — if it does not, the
   optimization introduced a functional regression, and
   `result: "mismatch"` regardless of how much faster the code is.
   This is the ADR-0010 specialization for performance: a green
   suite is not sufficient for performance verification (the
   metric must also improve), but it IS necessary (a fast broken
   system is not an improvement).

### 6. Regression protect (state: `regression-protect`)

Write a `known-failure` memory entry
(`memory/schemas/known-failure.schema.json`) recording the
performance regression of the optimized function. This is the
ONLY workflow state in the catalog that writes a `known-failure`
memory entry for a PERFORMANCE regression rather than a functional
one — the regression-of-knowledge being recorded is "if you
reintroduce the slow pattern, the system will be slow again."

1. The `symptom` field describes the performance symptom, not a
   functional one: "endpoint `/items` p99 latency > 1s under 100
   RPS load" (not "endpoint returns wrong result").
2. The `root_cause` field names the bottleneck identified in
   `diagnose-bottleneck`: "listItems handler issued an N+1 query
   — one DB roundtrip per item in the list, 100 roundtrips for 100
   items, 1180ms total" (not "the code has a bug").
3. The `fix` field records the optimization applied in `optimize`:
   "replaced the per-item query with a single JOIN, reducing DB
   roundtrips from 100 to 1 and total time from 1180ms to 50ms"
   (not "added a workaround").
4. The `incident_ref` references the design-trace `Decision`
   (the `diagnose-bottleneck` `Decision` that recorded the
   bottleneck candidate) — same semantic stretch as
   `change-request`'s `report` state memory write
   (`performance-problem` emits no `Incident` entity, so the
   `incident_ref` required by `known-failure.schema.json` is
   populated with the closest-analog Evidence entity). Future
   schema revision should generalize `incident_ref` to
   "source-of-failure-knowledge_ref" so non-bug-report workflows
   can reference Decisions cleanly.

The purpose of this memory entry is regression detection: future
code that accidentally reintroduces the slow pattern (the same
N+1 query, the same O(n²) loop, the same synchronous call where
an async batch would do) should fire the `regression` workflow
(per `workflows/_router.md` — "a `known-failure` memory entry's
symptom recurs"). Without this memory entry, a future developer
who refactors the optimized function back into the slow shape has
no warning that the slowness is a known regression, not a new
discovery.

## Tool integration

- `filesystem_read`: read the code being optimized (to design the
  optimization against the actual structure, not a guessed one);
  read prior `Trace`/`Event`/`Decision`/`Expected` artifacts when
  building the reference chain in `verify-improvement` (the
  Validation references both baseline and post-optimization
  evidence, so both must be readable).
- `filesystem_write`: write the optimized code; write any new test
  fixtures or load generators needed to capture/replay the
  baseline.
- `shell_exec`: run the profiler (`node --prof`, `cProfile`,
  `pprof`, `Instruments`, etc.); run the load generator for the
  baseline AND the post-optimization re-measurement; run the
  project's test runner as the functional-regression check in
  `verify-improvement`. Prefer one-shot, scriptable commands over
  interactive profilers — the output must be replayable by a
  future `Replay` step (and the same `environment_fingerprint_ref`
  must be settable on the re-run).
- `test_runner`: structured access to test results for the
  functional regression check in `verify-improvement`. NOT a
  substitute for the performance measurement — the test runner
  confirms the suite still passes, but the performance metric
  requires a separate measurement (load generation + timing).

## Validation

A `performance-problem` run using this skill is done correctly
only if:

1. A `Trace` of `test_result` `Event`s with `payload.metrics`
   (concrete timing/memory numbers) was captured in
   `capture-baseline` BEFORE any code was modified —
   evidence-before-explanation, enforced structurally.
2. The `capture-baseline` `Trace` has `environment_fingerprint_ref`
   set to a non-empty string — this is the field that anchors the
   baseline to the environment it was measured in, and without it
   the `verify-improvement` comparison is unverifiable. The schema
   does not enforce this (the field is not in `required`), but
   this skill's procedure does.
3. The `profile` state emitted a `Trace` of `observation` `Event`s
   with profiler output (function name, call count, total time,
   percent of wall time) — not just "we ran the profiler and it
   showed something." The profiler output IS the evidence
   `diagnose-bottleneck` reasons from.
4. The `diagnose-bottleneck` `Decision` has `validated: false`
   initially (a candidate, not a confirmed root cause) and
   `evidence_refs[]` pointing at the profiler `Event`s from
   `profile`. A bottleneck diagnosis with no `evidence_refs` is
   hollow — schema-valid but unverifiable.
5. The `diagnose-bottleneck` `Expected` describes a measurable
   post-optimization target (a quantity, not "should be faster").
6. The `optimize` `Decision` has `validated: false` and `result:
   "pending"` (AI proposal, awaiting `verify-improvement`).
7. The `verify-improvement` `Validation` has `result: "match"`
   only if BOTH the performance metric improved AND the test suite
   still passes. A `match` with a broken suite or no measured
   improvement is a process violation of this skill, even if the
   JSON Schema doesn't forbid it.
8. The `verify-improvement` `Validation.evidence_refs[]` references
   events from BOTH the baseline run (`capture-baseline`) AND the
   post-optimization run — a `Validation` with only
   post-optimization evidence has no baseline to compare against
   and is unverifiable.
9. The `regression-protect` `known-failure` memory entry has a
   `symptom` describing the PERFORMANCE symptom (not a functional
   one), a `root_cause` naming the bottleneck, and a `fix`
   describing the optimization — so future code that
   reintroduces the slow pattern can be detected as a regression.
10. No question was asked outside `classify` and
    `diagnose-bottleneck` (per the workflow's
    `question_economy.allowed_states`), and at most two questions
    total were asked across the whole run.

**The non-negotiable check:** if any of (1)–(10) is missing, the
performance-problem run is not done — it is incomplete, regardless
of how much faster the code is. A 10x speedup with no
`environment_fingerprint_ref` on the baseline, or with a
`Validation` that doesn't reference the baseline `event`s, is the
same hazard ADR-0010 names for `bug-report`: technical success
masking unverifiable correctness (here: unverifiable improvement).

## Examples

**Happy path:** User reports "`/items` endpoint is slow under
load" → `classify` asks one question ("is this a latency problem
at the endpoint, or a throughput ceiling on the whole service?")
— user answers "latency at `/items`, throughput is fine" →
`capture-baseline` runs `wrk -t4 -c100 -d30s http://localhost:3000/items`
under the reported load (100 RPS, 100 concurrent connections),
captures a `Trace` of `test_result` `Event`s with
`payload.metrics.p99_latency_ms = 1180` and
`payload.metrics.db_query_count_per_request = 100`, sets
`environment_fingerprint_ref = "env-fp-node-20-macos-m2-16gb"`
on the Trace, authors `Expected` "p99 latency < 200ms under 100
RPS" → `profile` runs `node --prof ./load-items.js` then
`node --prof-process`, captures profiler output as a `Trace` of
`observation` `Event`s, the hottest function is `listItems`
called 100 times per request, total 1180ms, 98.3% of wall time →
`diagnose-bottleneck` emits a `Decision`
`what: "bottleneck_candidate:listItems_N+1_query"`,
`validated: false`, `evidence_refs: [event-profile-listItems]`,
plus `Expected` "listItems total time per request should drop
below 50ms" (target T = 50ms — under the 200ms p99 budget; asks
the user "is 50ms target acceptable at p99 under 100 RPS?" —
user confirms; this is the ONE allowed question in this state) →
`optimize` gate trips on `broad-refactor` (the optimization touches
the items repository, the items service, and the items controller
— 3 files; confirmation granted), applies the optimization
(replaces per-item DB query with a single JOIN), emits
`Decision` `what: "ai_proposal:replace_N+1_with_join"`,
`validated: false`, + `file_change` `Event` → `verify-improvement`
re-runs `wrk` against the optimized code, same
`environment_fingerprint_ref`, observes `p99_latency_ms = 50`
(24x improvement) AND runs the existing test suite (12 tests,
all pass — no functional regression), emits `Actual` +
`Validation` with `method: "replay_comparison"`,
`result: "match"`, `evidence_refs: [...baseline_events,
...post_opt_events]` → `regression-protect` writes
`known-failure` memory: `symptom: "/items p99 latency > 1s under
100 RPS"`, `root_cause: "listItems issued N+1 query — 100 DB
roundtrips for 100 items"`, `fix: "replaced N+1 query with a
JOIN, reducing roundtrips from 100 to 1"`,
`incident_ref: "decision-bottleneck-listItems-N+1"` → `report`
writes `project` memory recording the new performance contract.
24x speedup, no functional regression, performance contract
recorded for future regressions. Without this skill, the agent
might have shipped a cache that masked the N+1 query (still
O(N) DB roundtrips on cache miss) or skipped the functional
regression check (24x speedup that breaks 3 tests would have
shipped as "improvement").

**Failure mode handled correctly:** User reports "the batch job
takes 4 hours" → `classify` asks one question, user says
"latency, not throughput" → `capture-baseline` runs the job,
captures `p99_job_duration = 4h12m`, sets
`environment_fingerprint_ref` → `profile` runs `cProfile`, but
the top 30 functions by cumulative time are all <5% of wall time
each (no single function dominates; cost is distributed across
~50 functions) → `diagnose-bottleneck` transitions to `blocked`
with `bottleneck_unidentifiable` and a recommendation for
architectural review ("profiler shows distributed cost across ~50
functions, no clear hot path; the 4h runtime is likely
architectural — the job does too many things sequentially that
could be parallelized, or pulls too much data that could be
filtered at the source; recommend a `change-request` to
redesign the job's structure rather than a local optimization
against no clear target"). Without the
`bottleneck_unidentifiable` escape hatch, the typical outcome
would be a speculative optimization against whatever function
happened to be #1 in the profile (5% of wall time, fixing it
saves 12 minutes on a 4-hour job — not nothing, but a 5%
improvement framed as "we fixed the performance problem" is the
failure mode this state exists to prevent).
