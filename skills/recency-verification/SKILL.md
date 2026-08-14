---
name: recency-verification
description: Use whenever the agent is about to assert a fact that could be time-sensitive — library versions, API behaviors, framework syntax, current best practices, security advisories, current dates. Forces a web search (or, for chat LLMs without web search, an honest transition to `blocked` tagged `no_recency_verification_available`) BEFORE the assertion is made. Operationalizes constitution §7 ('Every claim about the current state of things must be checked'). Distinct from `tool-use-discipline` (which is about tool use generally); this skill is specifically about the recency dimension.
license: MIT
allowed-tools: [shell_exec, filesystem_read]
---

# Recency Verification

## When to use this skill

Use whenever the agent is about to assert a fact whose truth could
have changed since the agent's training data was collected. This is
a meta-skill: it applies across all workflow states, not to a
specific one. The trigger is the agent noticing (or being told to
notice) that a claim is time-sensitive — see step 1's taxonomy.

**Especially when:**

- The agent is about to write "the latest version of X" or "the
  current best practice is Y" in user-facing output, code comments,
  or documentation.
- The agent is about to write code that calls an API whose shape may
  have changed (e.g. `passport.authenticate()` syntax that changed
  between versions; React's `useEffect` cleanup semantics).
- The agent is about to state today's date or compute "days since X"
  from a date it remembers.
- The agent is about to recommend a library, framework, or pattern
  based on training-data familiarity rather than a current check.
- The agent is about to cite a security advisory ("X has a known
  CVE") — advisories are filed continuously; yesterday's "no known
  CVE" can be today's "CVE-2026-NNNNN filed."

**Don't use for static facts:** the Pythagorean theorem, the syntax
of `for` loops, the definition of "binary search" — these do not
decay. Invoking this skill on them wastes a tool call. The taxonomy
in step 1 is what distinguishes "needs verification" from "safe from
memory."

**Don't use as a substitute for `tool-use-discipline`:** that skill
is the general discipline (invoke tools before asserting from
memory). This skill is the *specific* instance for the recency
dimension: it provides the three-class taxonomy (static /
slowly-evolving / time-sensitive) and the per-source verification
procedure (`web_search` vs `shell_exec` vs `blocked`). Use both —
`tool-use-discipline` decides *whether* to invoke a tool;
`recency-verification` decides *which* tool and *how*.

## Procedure

### 1. Identify time-sensitive claims

Before asserting any fact, classify it:

- **(a) Static** — math theorems, language keywords that haven't
  changed in 10+ years (`for`, `if`, `class`), data structures
  (binary tree, hash map), algorithms (quicksort). These do not
  decay. Skip this skill.
- **(b) Slowly-evolving** — language-level constructs whose
  semantics occasionally shift across major versions (e.g.
  async/await error handling, default parameter behavior). These
  change rarely, but when a major version lands they can shift.
  Use judgment — verify if the claim is specific to a particular
  version or recent behavior.
- **(c) Time-sensitive** — library versions, API endpoints,
  framework syntax, security advisories, current dates, "current
  best practices," upstream documentation URLs (which can move).
  These decay on the order of months. Always verify.

Only class (c) triggers the rest of this skill's procedure. Class
(b) is a judgment call; class (a) is safe from memory.

Record the classification as an `Event` of `kind: "observation"`
with `payload.claim: "<the claim>"`, `payload.class: "static" |
"slowly-evolving" | "time-sensitive"`, and `payload.why` briefly
justifying the classification. This `Event` is the audit trail for
why the skill did or did not fire its verification step — a future
reviewer (or the workflow's `report` state) can consult it to
confirm the agent applied the taxonomy rather than skipping it.

### 2. For each time-sensitive claim, attempt verification

The verification path depends on what the agent has available (per
the inventory produced by `tool-use-discipline` step 1):

- **If the agent has `web_search` available** (chat LLMs with
  browsing, CLI agents with MCP web-search): invoke it with a query
  shaped like `"<claim> current <year>"` and read the top result.
  Emit the result as an `Event` of `kind: "action"`,
  `source: "<adapter_id>:web_search"`, with `payload.query` and
  `payload.result_summary` (a one-sentence paraphrase of what the
  top result said, plus `payload.result_url` if available).
- **If the agent has `shell_exec`** (CLI agents): for version
  claims, run `npm view <package> version` (Node), `pip index
  versions <package>` or `pip show <package>` (Python), `go list -m
  -versions <module>` (Go), `cargo search <crate>` (Rust), or the
  language-appropriate equivalent. For current-date claims, run
  `date`. For "when did this code change" claims, run `git log
  --oneline -5 -- <path>`. Emit each as an `Event` of `kind:
  "action"`, `source: "<adapter_id>:shell_exec:<subtool>"`, with
  the raw command and stdout in the payload (redacted per
  `evidence-engineering` step 4).
- **If the agent has neither `web_search` nor `shell_exec`:** emit
  a `Decision` with `what: "recency_unverifiable"`, `validated:
  false`, `why: "no tool available to verify time-sensitive claim;
  asserting from memory would be hallucination"`, and transition
  the workflow to `blocked` with `on: no_recency_verification_available`.
  Do NOT assert the claim from memory — that is exactly the failure
  mode this skill exists to prevent.

### 3. Compare the verified result to the claimed fact

Emit a `Validation` (`evidence/schema/validation.schema.json`)
referencing the claim's `Expected` (the pre-verification belief)
and the verification `Event` (the post-verification reality):

- **`result: "match"`** — the verified result confirms the claim.
  `method: "manual_review"` (since this is fact-checking against
  external sources, not behavioral verification — `app_validation`
  and `contract_validation` are for behavior, not for facts).
- **`result: "mismatch"`** — the verified result contradicts the
  claim. Revise the claim to the verified version; the revised
  claim is the one that goes into the final `report`. The original
  (wrong) claim is preserved in the `Decision.alternatives` for
  audit — never silently overwrite it, the difference is what makes
  the verification meaningful.
- **`result: "inconclusive"`** — the search/snippet result was
  ambiguous (e.g. the top result was a forum post from 2023
  contradicting a 2025 blog post, no authoritative source). Treat
  as a `mismatch` for safety: revise the claim to "unverified"
  and either find a better source or transition to `blocked` with
  `on: no_recency_verification_available`.

### 4. Honest fallback for chat LLMs without web search

A chat LLM following `CHAT-ENTRYPOINT.md` may not have web search
(the chat adapter declares `mcp: false`, `browser: false`, and
there is no `web_search` capability in `AgentCapabilities` at
`adapters/agents/src/types.ts`). In that case, the skill's
procedure is:

1. **Explicitly state to the user** (in the response text, not in
   an evidence artifact) — "I cannot verify this claim's recency.
   My training data has a cutoff and this fact may be stale."
2. **Emit the `recency_unverifiable` `Decision`** per step 2's
   third bullet, with `why` explaining the chat host has no web
   search capability.
3. **Ask the user to paste the current documentation page**, the
   package's current `package.json` entry, or the security
   advisory text — whichever is appropriate to the claim. If
   recency matters for the task, the user is the source of
   recency.
4. **If the user provides the current source:** treat it as a
   `kind: "user_message"` `Event`, then proceed to step 3's
   comparison with that `Event` as the verification `actual_ref`.
5. **If the user cannot provide it:** leave the workflow in
   `blocked` with `on: no_recency_verification_available` and a
   precise gap statement. Do NOT proceed to assert the claim from
   memory.

This is honest work, not failure. Pretending to know is the
failure. A chat LLM that says "I don't know the current version of
passport.js, please paste its current docs" is following this
framework correctly; a chat LLM that writes code against
passport.js 0.5 from memory while passport.js 0.7+ is current is
not.

## Tool integration

- **`shell_exec`**: for `npm view`, `pip index` / `pip show`,
  `go list -m -versions`, `cargo search`, `git log` (for "when did
  this code change"), `date` (for current date). One-shot commands
  whose stdout is structured enough to attach as `Event.payload`.
- **`filesystem_read`**: for reading the project's own
  `package.json` / `requirements.txt` / `pyproject.toml` / `go.mod`
  / `Cargo.toml` to learn what versions are *pinned locally*. The
  project's own pinned versions are local truth — no recency check
  is needed for "what version does this project use." A recency
  check may still be needed for "is this version current, or
  should we upgrade?" — that is a different claim about external
  state, not about the project's own pin.

**Note on `web_search`:** it is not in this skill's `allowed-tools`
because the AIECP capability model (`adapters/agents/src/types.ts`
`AgentCapabilities`) does not yet have a `web_search` capability
declared. Chat LLMs may have web search as a chat-host feature
(ChatGPT browsing, Claude web search, Gemini Google Search); CLI
agents may have it via `mcp` (MCP web-search servers). This skill
documents the *procedure*; the adapter (and the chat host) declare
whether the tool is available in the current run. The forthcoming
`web_search` capability (see `STATUS.md` open questions) will make
this explicit; until then, treat `web_search` availability as
adapter-declared per the inventory in `tool-use-discipline` step 1.

## Validation

This skill is considered successful for a given run only if:

- Every time-sensitive claim (class (c) per step 1) in the run has
  either a `web_search` `Event` (or `shell_exec` `Event` for
  `npm view` / `date` / `git log` / etc.) proving verification, OR
  a `recency_unverifiable` `Decision` with the workflow in
  `blocked` state with `on: no_recency_verification_available`.
- No time-sensitive claim appears in the final `report` without
  one of these two pieces of evidence. A `report` that states "the
  latest version of X is Y" without a verification `Event` for that
  claim is a process violation of this skill, regardless of whether
  the claim happens to be correct.
- The `Validation.method` for any recency-related `Validation` is
  `"manual_review"` (since fact-checking external sources is
  manual), not `"app_validation"` or `"contract_validation"` (which
  are for behavior, not for facts).
- For class (b) (slowly-evolving) claims where the agent chose to
  skip verification by judgment call, the classification `Event`
  from step 1 records `payload.why` justifying the skip. A
  judgment-call skip with no recorded rationale is the same
  process violation as skipping the skill entirely.

## Examples

**Happy path:** User says "use the latest Next.js App Router" →
claim is time-sensitive (Next.js evolves; App Router vs Pages
Router has been the recommended pattern in different versions) →
step 1 classifies as (c) time-sensitive → step 2: invoke
`web_search` with query `"Next.js App Router current 2026"` →
result confirms App Router is still the recommended pattern in
Next.js 15+ → step 3: emit `Validation` with `result: "match"`,
`method: "manual_review"`, `expected_ref` pointing at the claim
Expected, `actual_ref` pointing at the `web_search` `Event` →
proceed to write code against App Router. Without this skill, the
agent might have recommended Pages Router from older training data,
producing code that follows a pattern the framework has deprecated.

**Failure mode:** User says "add passport.js for auth" → claim is
time-sensitive (passport.js had a major version change in 2024 that
reworked the `authenticate` callback signature) → step 1 classifies
as (c) time-sensitive → step 2: no `web_search` available (chat LLM
without browsing) and no `shell_exec` → emit `Decision` with
`what: "recency_unverifiable"`, `validated: false`,
`why: "chat adapter has no web_search or shell_exec; passport.js
had a 2024 major version change"` → transition to `blocked` with
`on: no_recency_verification_available` → step 4: ask user to paste
current passport.js docs → user pastes docs showing the new
`passport.authenticate(name, { session: false })` callback
signature → write code against the new signature. Without this
skill, the agent would have written code against passport.js 0.5's
callback signature while passport.js 0.7+ uses a different one,
producing broken code that fails on first run with a misleading
"type error" the user has to debug.
