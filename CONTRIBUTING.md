# Contributing

This project is in Phase 0 (research + architecture proposal). Implementation
has not started. See `docs/implementation-roadmap.md` for the phased plan and
`DECISIONS.md` for the architecture decision log.

## Before contributing code

1. Read `docs/architecture.md` and `DECISIONS.md` to understand the
   layering and the SPEC/IMPL/OBS/DIAG/VERIFY separation — this separation
   is enforced and testable, not a suggestion.
2. Any new skill must follow the Agent Skills format (see `skills/README.md`
   once populated) and ship with a procedure, tool integration, validation,
   examples, and failure handling — not just a description.
3. Any change to the framework's own governance (`constitution/`) must be
   recorded as a new ADR in `DECISIONS.md`. Silent changes to constitution
   files will be rejected.
4. Any reused or adapted code from an upstream project must be recorded in
   `NOTICE` with its license.

## Reporting issues

Use GitHub Issues for bugs and proposals. For security issues, see
`SECURITY.md`.
