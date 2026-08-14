# Design Decisions

The authoritative, ADR-style decision log lives at the repository root:
**[`DECISIONS.md`](../DECISIONS.md)**.

This file exists only to summarize *why* the decision log is structured
the way it is.

## Why ADRs instead of prose design notes

Per ADR-0008 (Constitutional self-improvement only), any change to the
framework's own governance must be reviewable and version-controlled.
Prose design notes are easy to silently edit; a numbered, append-oriented
ADR log is not. Every ADR records:

- **decision** — what was decided
- **alternatives** — what else was considered
- **reason** — why this option won
- **tradeoffs** — what we knowingly gave up

## How to propose a new decision

1. Open a PR adding a new `ADR-NNNN` entry to `DECISIONS.md` (never edit
   or delete a prior ADR's decision — supersede it with a new ADR that
   references the old one).
2. If the decision changes `constitution/` content, the PR must update
   both files together.
3. Decisions affecting portability (`docs/portability.md`) or security
   (`docs/security-model.md`) must update those docs in the same PR.
