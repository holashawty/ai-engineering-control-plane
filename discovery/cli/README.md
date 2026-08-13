# aiecp-discovery CLI

Detector-driven project discovery per ADR-0009. Produces a
`.aiecp/project-intelligence.json` document conforming to
`../schema/project-intelligence.schema.json` (ADR-0015).

MVP scope (ADR-0016): **Python and TypeScript/JavaScript detectors
only.** Other stacks are future work — add a detector under
`src/detectors/`, register it in `src/discover.ts`'s `REGISTRY`, and
the orchestrator picks it up automatically (it never branches on stack
name itself).

## Usage

```bash
npm install
npm run build

# Run against a real repo — writes .aiecp/project-intelligence.json
node dist/cli.js /path/to/some/repo

# Dry run — validate and print, don't write
node dist/cli.js /path/to/some/repo --dry-run

# Self-test — builds two toy repos (Python + TS) in a temp dir,
# runs discovery against both, validates against the schema, cleans up.
# This is the fastest way to confirm the detectors still work after a change.
npm test
```

## What's verified so far

Manually run against three scenarios during development (2026-08-12):

1. **Toy Python repo** (pyproject.toml + poetry + pytest + tests/ +
   main.py + GitHub Actions workflow) → correctly detected stack,
   build system, test system, CI, entrypoint. Schema-valid.
2. **Toy TypeScript repo** (package.json + tsconfig.json + vitest +
   express + Dockerfile) → correctly detected stack, package manager,
   test runner, containerization, entrypoint. Schema-valid. (Caught and
   fixed a duplicate-entrypoint bug during this test — see git history.)
3. **Toy polyglot repo** (both of the above merged into one directory,
   simulating a monorepo) → both detectors ran, results merged without
   collision. Schema-valid. (Caught and fixed a `dependencies` key
   collision between detectors during this test — see git history.)

**Not yet done:** running against a real, non-toy open-source repo;
`discovery-refresh` (the trigger that flips `stale: true` when repo
structure changes — not implemented, see `STATUS.md`); a `layer:
monorepo` heuristic for the polyglot case (currently reports each
stack's own layer, e.g. `["backend", "frontend"]`, which is defensible
but not explicitly flagged as a monorepo).

## Design notes

- **Detector interface** (`src/types.ts`): `matches()` is a cheap check,
  `detect()` does the real file inspection. This keeps `discover.ts`'s
  orchestration loop simple and stack-agnostic.
- **Schema validation happens in the CLI, not in `discover.ts`** — the
  orchestrator's job is to produce a `ProjectIntelligence` object; the
  CLI's job is to validate it against the actual JSON Schema before
  anything trusts it. Ajv's `2020.js` build is used specifically
  because our schemas declare `$schema: .../2020-12/schema` and the
  default Ajv export only ships 2019-09/draft-07 meta-schemas.
