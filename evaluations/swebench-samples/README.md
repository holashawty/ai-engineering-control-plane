# SWE-bench sample instances

**Status: Phase 3 — 1 synthetic sample committed (format reference only).**

This directory contains sample SWE-bench instance JSON files used by
`evaluations/swebench-adapter.py` (ADR-0031 / ADR-0036).

## What's here

| File | Origin | Purpose |
|---|---|---|
| `sympy-13031.json` | **SYNTHETIC** — fabricated for ADR-0031 | Format reference: proves the adapter can convert a SWE-bench-shaped instance to an AIECP scenario YAML. |

**This is NOT a real SWE-bench instance.** It is a small (~30-line) JSON
file that mimics the shape of a real SWE-bench instance so the adapter's
conversion logic can be exercised without downloading GBs of repo data.

The instance describes a (fictional) simplify() sign-handling bug in
sympy, with one FAIL_TO_PASS test (`test_simplify_edge_case`) and one
PASS_TO_PASS test (`test_simplify_basic`). The `base_commit` is a fake
40-char SHA. The `test_patch` is a tiny diff that adds the new test.

## How to use

```bash
# List all committed samples:
python3 evaluations/swebench-adapter.py --list-samples

# Convert a sample to an AIECP scenario YAML:
python3 evaluations/swebench-adapter.py evaluations/swebench-samples/sympy-13031.json --output /tmp/scenario.yaml

# Verify the generated scenario runs through the eval harness:
python3 -c "
import sys, yaml; sys.path.insert(0, '.')
from evaluations.eval_runner import StrictLoader, run_workflow_scenario
data = yaml.load(open('/tmp/scenario.yaml'), Loader=StrictLoader)
result = run_workflow_scenario(data[0])
print('passed:', result.passed, 'assertions:', result.assertions_passed, '/', result.assertions_passed + result.assertions_failed)
"
```

The regression e2e driver that proves all of the above is
`executor/examples/e2e-swebench-adapter/drive-run.mjs` — run with
`npm run e2e:swebench-adapter`.

## Downloading real SWE-bench instances

The adapter does NOT download real SWE-bench instances automatically.
Real instances live in the `princeton-nlp/SWE-bench_Verified` HuggingFace
dataset and require cloning the source repo (sympy, django, flask, etc.)
at a specific commit — that's GBs of data per instance, and executing
the FAIL_TO_PASS test suite requires Docker (ADR-0030 sandbox runtime).

The `--download <instance-id>` flag is a **stub**: it prints the manual
download instructions and exits 0 without performing any network I/O.
This is intentional — the AIECP project does not silently clone
third-party repos at runtime.

```bash
python3 evaluations/swebench-adapter.py --download sympy-13031
# Prints: HuggingFace dataset URL, pip install swebench, etc.
# Does NOT actually download anything.
```

## Real eval runs need Docker (ADR-0030 dependency)

The adapter only converts JSON → YAML. Running the eval requires:

1. **A real SWE-bench instance** (downloaded via the `--download` stub
   instructions, NOT the synthetic sample here).
2. **The source repo cloned at `base_commit`** (e.g. sympy.git checked
   out at the instance's base_commit, with the test_patch applied).
3. **Docker** (ADR-0030) — the FAIL_TO_PASS test suite is executed
   inside a container to ensure a reproducible environment.

Without Docker, the eval harness can only run the synthetic
`sympy-13031.json` sample through the `bug-report` workflow (proving the
adapter conversion works end-to-end), but it cannot measure real
Pass@1 numbers. The real 10-instance Pass@1 run is deferred to Phase 3.5
(see ADR-0036).

## License

SWE-bench itself is MIT-licensed. The synthetic sample here is original
AIECP content (no third-party code) and inherits the AIECP project's MIT
license.
