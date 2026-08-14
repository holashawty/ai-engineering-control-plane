---
name: systematic-debugging
description: Use when diagnosing a reported bug or unexpected behavior — locates evidence, reproduces deterministically, and walks the debugging chain to a validated root cause before any fix is proposed. Adapted from obra/superpowers' systematic-debugging skill (MIT, see NOTICE) with the addition of the AIECP Evidence Model; deepened with concrete shell-level evidence-gathering techniques, call-stack backward tracing, and multi-layer defense patterns adapted from the same upstream skill.
license: MIT
allowed-tools: [filesystem_read, shell_exec, test_runner]
---

# Systematic Debugging

## When to use this skill

Any time a workflow reaches `locate-evidence`, `reproduce`, or
`diagnose` in `workflows/bug-report.sm.yaml`. Do not skip straight to
"propose-fix" — a fix proposed without walking this procedure is a
guess, and guesses are exactly what `docs/evidence-model.md` and
`constitution/engineering-principles.md` ("Evidence before explanation")
prohibit.

**Especially when under pressure.** The temptation to skip the procedure
is highest exactly when following it matters most: production incidents,
manager-visible outages, "just one quick fix before lunch," or a fix
that has already been tried once and didn't work. Those situations are
not exceptions to this skill — they are the reason the skill exists. A
five-minute systematic pass is almost always faster than the
guess-and-revert cycle it replaces. If you catch yourself reasoning
"it's probably X, let me just patch that," treat it as a red flag: you
have not yet completed Phase 1, and `propose-fix` is not reachable
without evidence.

**Anti-patterns that mean: stop and return to Phase 1.** Each of these
internal moves is a signal that the procedure is being shortcut, not
that it is unnecessary:

- Skipping the reproduction step because the symptom "seems obvious."
- Bundling two or three fixes into one commit to "save a round trip."
- Adding a speculative `sleep`, retry, or guard without a confirmed
  root-cause `Decision` to anchor it to.
- Proposing a fix before emitting at least one `Event`/`Trace` that
  cites real evidence (logs, a stack trace, a test failure, a recent
  commit).
- After two failed fixes, reaching for a third hypothesis of the same
  shape ("maybe it's also Y") instead of questioning whether the
  diagnosed root cause was the real one.

## Procedure

### 1. Locate evidence (state: `locate-evidence`)

Before reading a single line of source code to form a theory, search
for evidence that already exists:

1. Check `known-failure` memory
   (`memory/schemas/known-failure.schema.json`) for a matching symptom.
   If found, the root cause and fix may already be known — skip to
   verifying it still applies rather than re-diagnosing from scratch.
2. Search recent commits touching the area implicated by the report.
3. Search logs / CI output / test failures for anything matching the
   symptom.
4. Read Project Intelligence (`.aiecp/project-intelligence.json`) to
   know which test runner and entrypoints are relevant — never assume
   a toolchain the project doesn't use.

Emit an `event` (`evidence/schema/event.schema.json`, `kind:
"log_line"` or similar) for each piece of evidence found, referencing
its source.

**Concrete evidence-gathering commands.** The goal of this step is to
produce citable evidence, not theories. Prefer commands that emit
text you can attach as an `Event.payload`:

```bash
# What changed recently in the suspect area?
git log --oneline -20 -- <path-or-file>
git log -p --since='2 weeks ago' -- <path-or-file>

# What does the diff between the last known-good and now look like?
git diff <known-good-sha>..HEAD -- <path-or-file>

# What does the CI run that failed actually say?
gh run view <run-id> --log-failed | tail -200

# What is the state of the working tree right now?
git status --porcelain
git stash list
```

When the evidence is a stack trace or log line, record the file path
and line number verbatim in the `Event.payload` — do not paraphrase it
into prose. A future `Replay` step needs to be able to find the same
line.

**Multi-component evidence.** When the symptom crosses a component
boundary (API → service → database, CI → build → signing, request →
cache → origin), do not pick a layer to investigate and start
reading. Instrument every boundary first, run once, then read the
captured state to see *which* layer actually diverged. For each
boundary, capture: what data entered, what data exited, and what
environment the component saw at that moment. A typical
instrumentation pass looks like:

```bash
# Layer 1: at the workflow / orchestrator — did the secret even arrive?
if [ -n "$SECRET_NAME" ]; then echo 'layer1:secret=present'; \
  else echo 'layer1:secret=MISSING'; fi

# Layer 2: at the build step — is it still visible in this process's env?
printenv SECRET_NAME >/dev/null 2>&1 && echo 'layer2:secret=visible' \
  || echo 'layer2:secret=not_in_env'

# Layer 3: at the consumer of the artifact — is the artifact itself sane?
[ -f "$ARTIFACT" ] && /usr/bin/file "$ARTIFACT" || echo "layer3:artifact=absent"

# Layer 4: the actual failing operation — run it loud.
<command> --verbose 2>&1 | tee /tmp/layer4.log
```

Each of those outputs becomes its own `Event` with a distinct
`source`. The resulting `Trace` will read like a probe: "secret was
set at layer 1, missing at layer 2 — propagation lost between workflow
and build script." That is a citable root cause. "Something is wrong
with secrets" is not.

**Failure handling:** if no evidence can be located at all, transition
to `blocked` with `on: no_evidence_found` — do not proceed to guess.

### 2. Reproduce (state: `reproduce`)

1. Using the project's own test runner (per Project Intelligence
   `project.test_system`), attempt to write or run a minimal
   reproduction that deterministically triggers the reported symptom.
2. Capture an `environment_fingerprint` alongside the reproduction —
   version, OS, git commit — so the reproduction is replayable later
   (`replay` state, `evidence/schema/replay.schema.json`). Redact any
   secret-shaped env var before writing it; `environment_fingerprint.
   env_vars` exists for reproducibility, never for secret capture.
3. Emit a `trace` (`evidence/schema/trace.schema.json`) covering the
   reproduction run, with ordered `event` entries.

**Deterministic, not probabilistic.** A reproduction that fails "most
of the time" or "in CI but not locally" is not yet a reproduction —
it is a hint. Keep going until the same input produces the same
output every run, or until you have proven that the symptom is
genuinely timing-dependent (in which case document the timing
dependency explicitly as the gap, rather than papering over it with a
`sleep`). The goal is a `Trace` that a future `Replay` can re-run
bit-for-bit.

**Condition-based waiting, not arbitrary sleeps.** When the
reproduction must wait for an asynchronous state to settle (an event
emitter, a database row appearing, a service becoming ready), wait
for the *condition* you actually care about, not for a fixed number of
milliseconds you guessed would be enough. A `waitFor(predicate)`
loop with a bounded timeout produces a reproduction that passes on
both fast and slow machines; a `sleep(500)` produces one that passes
on the developer's machine and flakes in CI. If a fixed delay is
genuinely required (for example, to verify behavior across two known
tick boundaries), record in the test why that specific delay is
correct, not just that it works.

**Failure handling:** if the symptom cannot be reproduced after a
reasonable, evidence-guided effort (not infinite retries), transition
to `blocked` with `on: cannot_reproduce`, reporting exactly what was
tried. Do not fabricate a reproduction that "should" trigger it.

### 3. Diagnose (state: `diagnose`)

This is the hypothesis → test → minimal fix discipline, applied against
the Evidence Model rather than free-form reasoning:

1. From the trace, identify the *first* point where a `Decision` or
   state diverges from what `Expected` (`evidence/schema/expected.
   schema.json`) says should have happened.
2. State that divergence as a root-cause **candidate** — emit it as a
   `decision` with `validated: false`, `root_cause: false` initially.
3. Test the candidate: does forcing the opposite of that decision
   eliminate the symptom in a controlled way (e.g. a targeted unit
   test, a debugger breakpoint, a log statement)? This is the "test the
   hypothesis" step — do not accept a candidate on plausibility alone.
4. Only after the candidate is confirmed against evidence, emit a
   `validation` (`evidence/schema/validation.schema.json`, `method:
   "manual_review"` or stronger) and flip the `decision`'s
   `root_cause: true`.

**Backward tracing through the call chain.** Bugs usually surface deep
in a stack (`git init failed`, `database opened with wrong path`,
`null dereference in handler`) but the *cause* lives earlier — the
function that called into the failing routine with bad input. Resist
the instinct to patch the line where the exception was thrown. Walk
backward instead: at the failing call, capture `new Error().stack`
(or the language's equivalent), identify the immediate caller, then
ask what value was passed and where *that* value came from. Keep
walking up the chain until you reach the point where the bad value
originated — that origin is the root cause, and that is where the fix
belongs. A small instrumentation snippet that helps when the chain
isn't obvious from a stack trace:

```typescript
// Snapshot the call chain right before the suspect operation,
// not after it has already thrown. Write to stderr directly so the
// output reaches the captured Trace even when the project's logger
// is buffered or silenced in test mode.
const probe = new Error().stack ?? '(no stack captured)';
process.stderr.write(
  `[probe] op=<op> arg=${JSON.stringify(<theBadArg>)} ` +
    `cwd=${process.cwd()} node_env=${process.env.NODE_ENV ?? '<unset>'}\n` +
    `${probe}\n`,
);
```

Run once and filter the captured stderr for `[probe] op=<op>`: the
full caller chain (including whichever test or entrypoint is the
real trigger) will be visible, without relying on the project's own
logger to surface it.

**Finding the polluting test.** When a symptom appears during a full
test run but disappears when tests are run individually, a prior test
has left global state behind. Bisect to find it: run tests in order,
checking after each one whether the pollution is present. A minimal
loop is usually enough — `for f in $(find tests -name '*.test.*' |
sort); do <runner> "$f" > /dev/null 2>&1; [ -e "$POLLUTION_MARKER" ]
&& { echo "POLLUTED AFTER: $f"; break; }; done`. Whichever test left
the marker is the one to fix, not the test that surfaced the
symptom. Capture the result as an `Event` referencing both the
polluting test file and the polluted-state observation.

**The three-failure rule.** If a single root-cause candidate has been
tested and rejected, that is normal — go back to step 1 of this
phase with the new information, do not pile a second speculative fix
on top of the first. If *three* candidates have been tested and
rejected, stop adding candidates of the same shape. Three failures
in a row is the empirical signal that the problem is architectural,
not local: shared state you haven't surfaced, a coupling you haven't
mapped, an assumption baked into the design that no single-file fix
can address. At that point the right move is to step out of this
skill and question the structure — emit a `Decision` recording that
the working theory has been invalidated three times and that an
architectural conversation is needed before another candidate is
proposed. Continuing to guess past three failures is the failure
mode this rule exists to prevent.

**Failure handling:** if the root-cause candidate doesn't survive
testing, the workflow transitions back to `locate-evidence`
(`on: root_cause_invalid`) — this is expected and not a failure of the
skill, it's the skill working correctly. Do not force a candidate
through just because a first attempt was made.

## Tool integration

- `shell_exec`: run the project's own test runner and any reproduction
  scripts. Also used for evidence-gathering commands (`git log`,
  `git diff`, `gh run view`, instrumentation probes) whose stdout is
  captured as `Event.payload`s. Prefer one-shot, scriptable commands
  over interactive tools — the output must be replayable by a future
  `Replay` step.
- `filesystem_read`: read source, logs, and test files. Also used to
  read prior `Trace`/`Event`/`Decision` artifacts when building a
  reference chain.
- `test_runner`: structured access to test results (pass/fail, output)
  rather than parsing raw shell output where the adapter supports it.
  For bisecting test pollution, fall back to `shell_exec` with a
  `for` loop — `test_runner` is per-invocation and does not naturally
  express "run each file individually and inspect side effects."

## Validation

This skill is considered successful for a given run only if:
- At least one `event`/`trace` was emitted before any `decision` was
  proposed (evidence-before-explanation, enforced structurally).
- The final root-cause `decision` has `validated: true` and a
  `validation` entity referencing it.
- No question was asked during this skill's execution — `locate-
  evidence`/`reproduce`/`diagnose` are not in
  `bug-report.sm.yaml`'s `question_economy.allowed_states` (only
  `classify` is).

**Defense in depth, not single-point fix.** Once a root cause is
confirmed, the minimal-fix discipline in
`constitution/engineering-principles.md` still applies — but where the
root cause was *invalid data* (an empty string propagated as a
directory, a null dereferenced three layers down), a fix at only the
originating layer is fragile. Refactoring, a new code path, or a
future mock can quietly reintroduce the same bad value. Add a
guard at each layer the value passes through: validate at the entry
point (reject obviously invalid input at the API boundary), validate
at the business-logic layer (assert the precondition the operation
actually needs), and where the operation is dangerous enough to
deserve it (e.g. writing to disk, mutating a repo, executing a
subprocess), add an environment guard that refuses the operation
outside expected contexts. Each layer is a separate guard with its
own justification; together they make the bug structurally
impossible rather than merely patched. Record each added guard as
its own `Decision` so the regression test in `regression-protect`
can assert the deepest layer refuses the bad input, not just that
the original symptom went away.

## Examples

**Happy path:** "login sometimes fails" → known-failure memory has no
match → recent commits show an auth middleware change 2 days ago →
reproduction written using project's pytest suite → trace shows a
race condition between token refresh and request retry → decision
candidate: "token refresh Decision assumed synchronous completion" →
tested by forcing sequential execution, symptom eliminated → validated,
root_cause: true.

**Failure mode handled correctly:** "app is slow sometimes" → evidence
located (slow query logs) → reproduction attempted with the project's
load-testing tool → cannot reliably reproduce within a reasonable
number of attempts → workflow transitions to `blocked` with a precise
gap ("cannot reproduce timing-dependent slowdown without production
traffic patterns") rather than shipping a speculative fix.

**Three-failure architectural case:** "session token occasionally
issued for the wrong user" → candidate 1 (session store key collision)
tested and rejected; candidate 2 (cookie serialization race) tested
and rejected; candidate 3 (load-balancer affinity drift) tested and
rejected. After the third rejection the skill stops emitting new
candidates of the same shape and instead emits a `Decision` recording
that three local root-cause hypotheses have failed, that the working
theory is therefore likely architectural (shared session store across
two previously-merged services that no longer agree on token
semantics), and that an architectural conversation is required before
another fix is attempted. Without the three-failure rule, the typical
outcome would be a fourth speculative patch layered on top of three
already-failed ones — the failure mode this skill is designed to
prevent.
