# Safety Rules

**Status: Phase 1 — machine-checkable schema complete, enforceable prose pending Phase 2.**

The destructive-operation classes and required authorization gates are
described in `docs/security-model.md` (safety gate policy table). The
machine-checkable side of this — the autonomy level (L0-L5) and the
per-capability `allow`/`ask`/`deny`/`scoped` matrix a project declares —
is now formalized in `autonomy-policy.schema.json` (ADR-0014).

**Not yet implemented:** the enforceable prose version of this file
(the actual rule text a workflow executor checks against before
allowing a `propose-fix` or `apply-fix` transition to proceed — see
`workflows/bug-report.sm.yaml` `safety_gate` annotations) and the
executor logic that reads `autonomy-policy.schema.json`-shaped policy
files and blocks/asks/denies accordingly. Phase 2.

This directory is part of the proposed repository structure in
`docs/architecture.md`. Implementation begins in the phase noted in
`docs/implementation-roadmap.md` and requires an approved ADR in
`DECISIONS.md` for any structural change.
