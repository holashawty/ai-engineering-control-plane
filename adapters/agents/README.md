# Agent Adapters (`adapters/agents/`)

Implements the "Adapter contract" from `docs/portability.md`: one
adapter per agent, each declaring its own capabilities rather than the
framework assuming uniform support. MVP scope (ADR-0016): **Claude Code
and Codex only.**

## What exists

- `src/types.ts` — the `AgentAdapter` interface: `capabilities()`,
  `renderEntrypoint()`, `translateObservation()`.
- `src/claude-code/adapter.ts` — generates `CLAUDE.md` from the
  canonical `agents/AGENTS.md` + `skills/*/SKILL.md`, declares full
  native Agent Skills support.
- `src/codex/adapter.ts` — generates `AGENTS.md` (Codex's own native
  entrypoint filename — this is near-identity with the canonical
  source, since Codex reads `AGENTS.md` directly), declares *partial*
  native Agent Skills support per `docs/portability.md`'s matrix.
- `src/sync-entrypoints.ts` — reads the canonical sources
  (`agents/AGENTS.md` + all `skills/*/SKILL.md` frontmatter) and runs
  every registered adapter's `renderEntrypoint()` against them.
- `src/redact.ts` — shared secret-key redaction used by both adapters'
  `translateObservation()`, per `docs/security-model.md`.

## What this does NOT do yet

This package produces *file contents in memory* (`RenderedFile[]`). It
does not yet write them to disk in a host project, and no CLI flag
exists for "generate CLAUDE.md into repo X" — that's a thin remaining
wrapper around `syncAll()`, intentionally left for whoever wires up an
actual installation flow (not yet designed, see `STATUS.md`).

Neither adapter has been exercised by an actual running Claude Code or
Codex session — `translateObservation()` is verified against realistic
*shapes* of tool-call output (see below), not against a live session's
real output, which isn't obtainable in this development environment.

## Verified (2026-08-16)

`npm test` runs scenarios covering all adapters, 58/58 assertions
pass (per STATUS.md auto-gen table):

1. **Load canonical sources** — reads this repo's own
   `agents/AGENTS.md` and all 35 `skills/*/SKILL.md` files, confirms all
   35 skills are discovered with correct names.
2. **Render + idempotency (ADR-0006)** — adapters render their
   entrypoint twice from the same input and produce byte-identical
   output (the requirement ADR-0006 exists to enforce: generated files
   are deterministic, never hand-edited). Confirms `CLAUDE.md` embeds
   the canonical `AGENTS.md` content verbatim and lists all 35 skills by
   name; confirms Codex's adapter writes to `AGENTS.md` (its own native
   filename) rather than `CLAUDE.md`.
3. **Capabilities genuinely differ between adapters** — Claude Code
   declares full native skill support and browser access; Codex
   declares partial native skill support and no browser access;
   chat-sandbox declares `sandboxed_code_execution: true` —
   matching `docs/portability.md`'s matrix in code, not just prose.
4. **`translateObservation` produces schema-valid Events** — a raw,
   agent-shaped observation (including a fake `api_key` field) is
   translated by adapters into an `evidence/schema/event.schema.json`
   -valid `Event`, and the `api_key` is confirmed redacted in the
   output while an unrelated field (`command`) passes through
   untouched.

**One real inconsistency was found and fixed while building this:**
the canonical `agents/AGENTS.md` still said `sync-entrypoints (not yet
implemented)` even after this package made that no longer true —
caught by actually reading the generated `CLAUDE.md` output rather than
trusting the self-test's boolean assertions alone. Fixed in
`agents/AGENTS.md` directly (see git history).

## Not yet done

- No disk-writing CLI wrapper around `syncAll()`.
- `.cursor/rules/*.mdc`, `.windsurfrules`,
  `.github/copilot-instructions.md`, `GEMINI.md` adapters — post-MVP
  per `docs/archive/implementation-roadmap.md` Phase 7.
- No live Claude Code / Codex session has exercised these adapters —
  only realistic shapes have been tested.
