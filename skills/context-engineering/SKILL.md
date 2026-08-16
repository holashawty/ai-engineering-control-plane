---
name: context-engineering
description: Use when a workflow run is approaching the LLM's context window limit — summarizes evidence chains, compresses redundant traces, and preserves the audit trail without losing decision-relevant information. Operationalizes "context engineering" (2026 trend) for AIECP's evidence-driven model. Distinct from testing (which runs tests) and behavioral-verification (which checks behavior); this skill manages the agent's own memory budget.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec]
---

# Context Engineering

## When to use this skill

Use when ANY of these signals fire during a workflow run:

1. **Token budget warning:** the agent's context window is approaching
   its limit (typically when evidence + memory + skill text exceeds
   ~60% of the context window).
2. **Long workflow chains:** the orchestrator workflow has looped
   3+ times through `evaluate-result -> route`, accumulating evidence
   from multiple sub-workflow runs.
3. **Evidence bloat:** a single `Trace` has more than 20 `Event`s,
   most of which are low-value (log lines, status checks) and could
   be summarized.
4. **Memory accumulation:** more than 10 `known-failure` memory
   entries exist for the current project, and the agent is re-reading
   all of them on every `locate-evidence` state.
5. **Human signal:** the user says "this is getting too long" or
   "can you summarize what we've done so far."

## Procedure

### 1. Audit current context usage

Emit a `Trace` of `kind: "observation"` with `source:
"context-engineering:audit"` containing total evidence entities,
total Events in largest Trace, total memory entries loaded, and
estimated token count.

### 2. Identify compressable content

Can compress: completed sub-workflow Traces, redundant Events,
verbose payloads, non-matching known-failure memory entries.
Must NOT compress: root-cause Decisions, Validation results,
safety gate logs, current-state evidence.

### 3. Create summary evidence

For each completed sub-workflow, create a single `Event` of `kind:
"observation"` with `source: "context-engineering:summary"` and
payload containing workflow name, terminal state, root cause,
fix applied, validation result, and compression ratio.

### 4. Truncate verbose payloads

For Event payloads > 500 chars: keep first 200 + last 200 chars,
replace middle with truncation note. Emit a Decision recording
the truncation.

### 5. Prune irrelevant memory

For known-failure entries that don't match current symptom: skip
loading. Emit a Decision recording the prune.

### 6. Persist snapshot

Write `.aiecp/context-snapshot.json` with list of summarized entity
IDs, truncated entity IDs, pruned memory entries, compression
ratio, and timestamp.

## Tool integration

- `filesystem_read`: read evidence JSON files to measure size.
- `filesystem_write`: write `.aiecp/context-snapshot.json`.
- `shell_exec`: run `wc -c` to measure file sizes.

## Validation

Successful when: at least one summary Event emitted, token count
reduced by 30%+, `.aiecp/context-snapshot.json` written, no
root-cause Decision/Validation/safety gate log removed.

## Examples

**Happy path:** Orchestrator looped 3x, 45 entities, 80K tokens.
Compress: 15 historical -> 3 summaries + 5 truncated. Result: 18
entities, 35K tokens, 56% reduction.

**Failure mode:** Nothing to compress (all evidence active). Emit
Decision `context_compression:nothing_to_compress`, transition to
`blocked` with `on: context_budget_exhausted`.
