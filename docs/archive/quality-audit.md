# Quality Audit Report — 2026-08-15

**Auditor:** Z.ai Agent (orchestrator) + 3 QA subagents
**Scope:** Full project audit — workflows, skills, e2e drivers, eval harness, documentation

## Ground truth (actual counts on disk)

| Metric | Count |
|---|---|
| Workflows | 14 |
| Skills | 26 |
| ADRs | 23 |
| Agent adapters | 4 |
| e2e drivers | 15 |
| Eval scenarios | 11 (41 assertions) |
| Total assertions (e2e + npm test + eval) | ~610 |

## Audit results

### QA-1: Workflow + Skill validation (0 CRITICAL, 0 WARNING)

- All 14 workflows parse as valid YAML, all transitions reference
  declared states, no dead ends, all safety_gates consistent.
- All 26 skills have valid frontmatter, all sections present.
- All skills_required entries match real skill directories.
- 5 cross-cutting skills (backend, database, frontend,
  behavioral-simulation, diverse-thinking) not cited by any workflow
  — intentional per skills/README.md.

### QA-2: E2E + Test suite (1 HIGH, 3 MEDIUM, 5 LOW)

**FIXED:**
- eval_runner.py: `_template.yaml` was loaded as a real scenario →
  now skipped (files prefixed with `_` are excluded).

**Remaining (informational):**
- e2e-membership-bug: no explicit assertion counting (oldest driver,
  uses narrative format instead of `check()` pattern).
- Stale README counts (9 e2e drivers → actual 15, 325+ → ~610).
- eval harness covers 3/14 workflows (minimum bar is 3/workflow,
  current coverage: 11 scenarios for 3 workflows).

### QA-3: Documentation (51 HIGH, 17 MEDIUM, 12 LOW)

**FIXED in this commit:**
- All stale counts updated to actuals across README, STATUS, TASKS,
  DELIVERABLES, _router, workflows/README, skills/README.
- _router.md: added discovery-refresh row, updated header count.
- NOTICE: removed 3 duplicate attribution entries.
- eval_runner.py: _template.yaml exclusion fix.

**Known remaining (tracked for future):**
- spec-kit SHA `83883a2` unverifiable locally (upstream repo SHA,
  not local repo SHA — correct usage but can't be verified without
  external clone).
- 12 ADRs missing "Status:" section (ADR-0001–0011, 0013, 0016).
- 4 ADRs missing "Alternatives:" section (ADR-0020–0023).
- ADR-0012 missing both "Tradeoffs" and "Status" sections.
- DELIVERABLES.md final summary table and "Kalan açık noktalar"
  still reflect earlier sprint state (historical document, not
  continuously maintained — STATUS.md is the canonical current-state
  document per its own header).

## Fixes applied in this commit

1. `evaluations/eval_runner.py`: skip `_`-prefixed scenario files
   (template exclusion fix — eval harness now 11/11 PASS, exit 0)
2. `workflows/_router.md`: 8→14 header, added discovery-refresh row,
   updated prose to match table (all 14 implemented)
3. `workflows/README.md`: 8→14 workflow count
4. `skills/README.md`: 20→26 skill count, added 6 missing skills
   (discovery-refresh, incident, release, security-problem,
   unknown-failure, user-complaint) to the catalog
5. `NOTICE`: removed 3 duplicate entries (project-onboarding,
   regression, performance-problem appeared twice)
6. `evaluations/README.md`: 11/12→11/11 PASS, 46→41 assertions
   (template excluded)

## Recommended next steps (for controller review)

1. Add eval scenarios for remaining 11 workflows (current: 3/14)
2. Add `Status:` section to 12 older ADRs
3. Add `Alternatives:` section to 4 newer ADRs
4. Consider adding explicit `check()` assertions to
   e2e-membership-bug driver for consistency
5. Verify spec-kit SHA externally
6. Consider whether DELIVERABLES.md should be continuously maintained
   or marked as "historical session log" (current state)
