#!/usr/bin/env python3
"""SWE-bench → AIECP scenario adapter (ADR-0031 Phase 3).

Converts a SWE-bench instance JSON to an AIECP eval scenario YAML.
The adapter does NOT run the eval — it only converts. Running the
eval requires Docker (ADR-0030) for test execution in the SWE-bench
repo's environment.

What this proves:
  - A SWE-bench instance (the standard `{instance_id, repo, base_commit,
    problem_statement, test_patch, FAIL_TO_PASS, PASS_TO_PASS}` shape) is
    mechanically convertible to an AIECP eval scenario YAML that the
    existing `evaluations/eval_runner.py` harness can load.
  - The conversion is a *thin adapter*: no SWE-bench fork, no Docker, no
    real repo download. Just JSON → YAML.
  - The generated scenario drives the `bug-report` workflow end-to-end
    (intake → report) with SWE-bench metadata attached so each emitted
    evidence artifact is traceable back to the source instance.

What this does NOT prove:
  - Real Pass@1 numbers. That requires downloading real GitHub repos
    (sympy, django, etc.) at specific commits and running their test
    suites inside Docker — see ADR-0030 (sandbox) + ADR-0036 (Phase 3.5).
  - That an LLM can actually solve the SWE-bench problem. That's an LLM
    quality question, not a framework question. The adapter only proves
    that *if* an LLM produces a patch, the framework can drive the
    verification workflow.

Usage:
  python3 evaluations/swebench-adapter.py <instance.json> [--output <scenario.yaml>]
  python3 evaluations/swebench-adapter.py --download <instance-id>  # stub: prints instructions
  python3 evaluations/swebench-adapter.py --list-samples

Exit codes:
  0  conversion succeeded (or list/download-stub ran cleanly)
  1  conversion failed (bad instance, bad output path, etc.)
  2  usage error (bad args, missing file, etc.)
"""

import argparse
import copy
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import yaml

# ---- Configuration ------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
SAMPLES_DIR = SCRIPT_DIR / "swebench-samples"
SCENARIOS_DIR = SCRIPT_DIR / "scenarios"

# Required SWE-bench instance fields (per SWE-bench data format).
REQUIRED_INSTANCE_FIELDS = (
    "instance_id",
    "repo",
    "base_commit",
    "problem_statement",
    "test_patch",
    "FAIL_TO_PASS",
    "PASS_TO_PASS",
)


# ---- Custom YAML dumper -------------------------------------------------
# PyYAML's default SafeDumper mangles dict ordering and uses Python
# tags for some scalar types. We want a stable, human-readable YAML
# output that matches the existing scenarios/*.yaml style.

class _StableDumper(yaml.SafeDumper):
    """SafeDumper that preserves dict insertion order.

    PyYAML's default SafeDumper sorts dict keys alphabetically unless we
    disable it with `sort_keys=False`. We also widen the line width and
    enable unicode so the output matches the existing scenarios/*.yaml
    style. YAML anchors/aliases (e.g. `&id001` / `*id001`) are avoided
    by deep-copying the scenario data before dumping (see
    `dump_scenario_yaml`).
    """


# ---- Instance validation ------------------------------------------------

def validate_instance(instance: dict) -> list[str]:
    """Return a list of human-readable validation errors (empty = valid)."""
    errors: list[str] = []
    if not isinstance(instance, dict):
        return ["instance is not a JSON object"]

    for field in REQUIRED_INSTANCE_FIELDS:
        if field not in instance:
            errors.append(f"missing required field: {field!r}")

    if errors:
        return errors

    iid = instance["instance_id"]
    if not isinstance(iid, str) or not iid:
        errors.append("instance_id must be a non-empty string")

    f2p = instance["FAIL_TO_PASS"]
    if not isinstance(f2p, list) or not all(isinstance(t, str) for t in f2p):
        errors.append("FAIL_TO_PASS must be a list of test-id strings")

    p2p = instance["PASS_TO_PASS"]
    if not isinstance(p2p, list) or not all(isinstance(t, str) for t in p2p):
        errors.append("PASS_TO_PASS must be a list of test-id strings")

    return errors


# ---- Scenario generation ------------------------------------------------

def _truncate(text: str, max_len: int = 200) -> str:
    """Truncate text to max_len chars, appending '…' if cut."""
    if not isinstance(text, str):
        text = str(text)
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"


def _short_description(problem_statement: str, instance_id: str) -> str:
    """One-line description for the scenario's `description` field."""
    # Take the first sentence (or first 120 chars) of the problem statement.
    first_line = problem_statement.strip().splitlines()[0] if problem_statement else ""
    return _truncate(f"SWE-bench instance {instance_id}: {first_line}", 120)


def _utc_now_iso() -> str:
    """ISO-8601 UTC timestamp with Z suffix (matches evidence-schema dates)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_scenario(instance: dict, run_timestamp: Optional[str] = None) -> dict:
    """
    Convert a validated SWE-bench instance to an AIECP eval scenario dict.

    The scenario drives the `bug-report` workflow end-to-end:
      intake → classify → locate-evidence → reproduce → diagnose →
      propose-fix → apply-fix → verify → regression-protect → replay → report

    Every emitted evidence artifact references the SWE-bench instance_id so
    that a downstream observer can trace each artifact back to the source
    problem. The SWE-bench metadata block is preserved verbatim under
    `swebench_metadata` so the scenario YAML is self-describing.
    """
    instance_id = instance["instance_id"]
    repo = instance["repo"]
    base_commit = instance["base_commit"]
    problem_statement = instance["problem_statement"]
    fail_to_pass = list(instance["FAIL_TO_PASS"])
    pass_to_pass = list(instance["PASS_TO_PASS"])
    test_patch = instance["test_patch"]

    ts = run_timestamp or _utc_now_iso()

    # Evidence IDs must match each schema's id pattern:
    #   ^<kind>-[a-zA-Z0-9_-]+$
    # (see evidence/schema/*.schema.json). So the kind must come FIRST.
    # We then suffix with `swebench-<instance_id>` and a per-occurrence
    # label, so multiple SWE-bench scenarios don't collide with each
    # other or with the synthetic eval scenarios.
    def eid(kind: str, suffix: str = "") -> str:
        s = f"{kind}-swebench-{instance_id}"
        if suffix:
            s += f"-{suffix}"
        return s

    steps: list[dict] = []

    # --- intake → classify ---
    steps.append({"action": "advance", "on": "intent_classified"})

    # --- classify: emit Incident (the SWE-bench problem IS the incident) ---
    steps.append({
        "action": "emitEvidence",
        "kind": "incident",
        "data": {
            "id": eid("incident", ""),
            "observed_at": ts,
            "environment_fingerprint_ref": eid("env", "fp"),
            "expected_ref": eid("expected", ""),
            "actual_ref": eid("actual", "before-fix"),
            "severity": "medium",
            "status": "open",
        },
    })
    steps.append({"action": "advance", "on": "class_known"})

    # --- locate-evidence: trace + event (grep for the failing test) ---
    steps.append({
        "action": "emitEvidence",
        "kind": "trace",
        "data": {
            "id": eid("trace", "locate"),
            "started_at": ts,
            "event_refs": [eid("event", "grep")],
        },
    })
    steps.append({
        "action": "emitEvidence",
        "kind": "event",
        "data": {
            "id": eid("event", "grep"),
            "trace_ref": eid("trace", "locate"),
            "ts": ts,
            "kind": "observation",
            "source": "grep",
            "payload": {
                "finding": f"located FAIL_TO_PASS test(s): {fail_to_pass}",
            },
        },
    })
    steps.append({"action": "advance", "on": "evidence_located"})

    # --- reproduce: trace + event (run FAIL_TO_PASS test → it fails) ---
    steps.append({
        "action": "emitEvidence",
        "kind": "trace",
        "data": {
            "id": eid("trace", "repro"),
            "started_at": ts,
            "event_refs": [eid("event", "pytest-before")],
        },
    })
    steps.append({
        "action": "emitEvidence",
        "kind": "event",
        "data": {
            "id": eid("event", "pytest-before"),
            "trace_ref": eid("trace", "repro"),
            "ts": ts,
            "kind": "test_result",
            "source": "pytest",
            "payload": {
                "result": f"FAILED: {fail_to_pass}",
                # Fresh list (not the same Python object as swebench_metadata.pass_to_pass)
                # so PyYAML doesn't emit a `&id001` / `*id001` anchor/alias pair.
                "pass_to_pass": list(pass_to_pass),
                "repo": repo,
                "base_commit": base_commit,
            },
        },
    })
    steps.append({"action": "advance", "on": "reproduction_ready"})

    # --- diagnose: decision (root cause) + expected + actual + validation ---
    steps.append({
        "action": "emitEvidence",
        "kind": "decision",
        "data": {
            "id": eid("decision", "root-cause"),
            "trace_ref": eid("trace", "repro"),
            "what": f"root_cause_candidate:swebench_{instance_id}",
            "why": _truncate(problem_statement, 200),
            "validated": True,
            "root_cause": True,
            "result": "accepted",
        },
    })
    steps.append({
        "action": "emitEvidence",
        "kind": "expected",
        "data": {
            "id": eid("expected", ""),
            "source_ref": f"swebench:{instance_id}",
            "predicate": f"After applying the fix patch, {fail_to_pass} must PASS and {pass_to_pass} must remain PASS.",
        },
    })
    steps.append({
        "action": "emitEvidence",
        "kind": "actual",
        "data": {
            "id": eid("actual", "before-fix"),
            "expected_ref": eid("expected", ""),
            "observed_value": f"Before patch: {fail_to_pass} FAIL, {pass_to_pass} PASS.",
            "observation_ref": eid("event", "pytest-before"),
        },
    })
    steps.append({
        "action": "emitEvidence",
        "kind": "validation",
        "data": {
            "id": eid("validation", "diag"),
            "expected_ref": eid("expected", ""),
            "actual_ref": eid("actual", "before-fix"),
            "result": "mismatch",
            "method": "app_validation",
        },
    })
    steps.append({"action": "advance", "on": "root_cause_found"})

    # --- propose-fix: decision (the proposed patch) ---
    steps.append({
        "action": "emitEvidence",
        "kind": "decision",
        "data": {
            "id": eid("decision", "propose"),
            "trace_ref": eid("trace", "repro"),
            "what": f"ai_proposal:patch_for_{instance_id}",
            "why": "Proposed fix derived from the SWE-bench problem statement.",
            "validated": False,
            "result": "pending",
        },
    })
    steps.append({"action": "advance", "on": "fix_approved"})

    # --- apply-fix: decision (apply patch) + event (file_change) ---
    steps.append({
        "action": "emitEvidence",
        "kind": "decision",
        "data": {
            "id": eid("decision", "apply"),
            "trace_ref": eid("trace", "repro"),
            "what": "ai_proposal:apply_patch",
            "why": f"Applied patch against {repo}@{base_commit[:12]}.",
            "validated": False,
            "result": "pending",
        },
    })
    steps.append({
        "action": "emitEvidence",
        "kind": "event",
        "data": {
            "id": eid("event", "file-change"),
            "trace_ref": eid("trace", "repro"),
            "ts": ts,
            "kind": "file_change",
            "source": repo,
            "payload": {
                "patch_first_line": test_patch.splitlines()[0] if test_patch else "",
                "patch_loc": len(test_patch.splitlines()) if test_patch else 0,
            },
        },
    })
    steps.append({"action": "advance", "on": "fix_applied"})

    # --- verify: actual (after fix) + validation (tests pass) ---
    steps.append({
        "action": "emitEvidence",
        "kind": "actual",
        "data": {
            "id": eid("actual", "after-fix"),
            "expected_ref": eid("expected", ""),
            "observed_value": f"After patch: {fail_to_pass} PASS, {pass_to_pass} PASS.",
            "observation_ref": eid("event", "pytest-before"),
        },
    })
    steps.append({
        "action": "emitEvidence",
        "kind": "validation",
        "data": {
            "id": eid("validation", "verify"),
            "expected_ref": eid("expected", ""),
            "actual_ref": eid("actual", "after-fix"),
            "result": "match",
            "method": "app_validation",
        },
    })
    steps.append({"action": "advance", "on": "behavior_verified"})

    # --- regression-protect: write known-failure memory ---
    steps.append({
        "action": "writeMemory",
        "type": "known-failure",
        "data": {
            # Memory IDs are not schema-validated to a kind-prefix pattern
            # (unlike evidence IDs), but we prefix with `mem-known-failure-`
            # to match the existing bug-report.yaml convention.
            "id": f"mem-known-failure-swebench-{instance_id}",
            "type": "known-failure",
            "schema_version": "1.0.0",
            "created_at": ts,
            "source": f"swebench-{instance_id}",
            "incident_ref": eid("incident", ""),
            "symptom": _truncate(problem_statement, 100),
            "root_cause": f"See SWE-bench instance {instance_id}.",
            "fix": "Patch applied; FAIL_TO_PASS tests now pass.",
        },
    })
    steps.append({"action": "advance", "on": "regression_added"})

    # --- replay: emit replay evidence ---
    steps.append({
        "action": "emitEvidence",
        "kind": "replay",
        "data": {
            "id": eid("replay", ""),
            "original_trace_ref": eid("trace", "repro"),
            "result": "matches_expected",
            "environment_fingerprint_ref": eid("env", "fp"),
        },
    })
    steps.append({"action": "advance", "on": "replay_matches"})

    # --- Assemble the scenario ---
    scenario = {
        "id": f"swebench-{instance_id}",
        "workflow": "bug-report",
        "tier": "workflow",
        "description": _short_description(problem_statement, instance_id),
        "swebench_metadata": {
            "instance_id": instance_id,
            "repo": repo,
            "base_commit": base_commit,
            "fail_to_pass": fail_to_pass,
            "pass_to_pass": pass_to_pass,
        },
        "steps": steps,
        "expected": {
            "terminal_state": "report",
            "is_terminal": True,
            "max_questions": 1,
            "no_errors": True,
            "evidence_kinds": [
                "incident",
                "decision",
                "trace",
                "event",
                "expected",
                "actual",
                "validation",
                "replay",
            ],
            "memory_types": ["known-failure"],
            "evidence_on_disk": True,
            "min_log_entries": 8,
        },
    }
    return scenario


# ---- YAML serialization -------------------------------------------------

def dump_scenario_yaml(scenario: dict) -> str:
    """
    Serialize a scenario dict to YAML, preserving key order and matching
    the existing scenarios/*.yaml style.

    We use a custom SafeDumper subclass to:
      - Preserve dict insertion order (Python dicts since 3.7, but PyYAML's
        default SafeDumper sorts keys alphabetically unless we disable it).
      - Avoid YAML anchors/aliases for repeated nested dicts.
      - Block-style for human readability.

    We deep-copy the scenario data before dumping so that repeated
    structures (e.g. `fail_to_pass` appears in both `swebench_metadata`
    and inside an event payload) are emitted as fully-expanded YAML
    rather than `&id001` / `*id001` aliases. This keeps the YAML
    human-readable and avoids surprising downstream consumers that
    don't handle anchors.
    """
    # Deep-copy so repeated sub-structures are distinct objects → no anchors.
    scenario_copy = copy.deepcopy([scenario])
    return yaml.dump(
        scenario_copy,  # scenarios are wrapped in a list (matches _template.yaml)
        Dumper=_StableDumper,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=100,
    )


# ---- CLI commands -------------------------------------------------------

def cmd_convert(instance_path: Path, output_path: Optional[Path]) -> int:
    """Convert a SWE-bench instance JSON to an AIECP scenario YAML."""
    if not instance_path.exists():
        print(f"error: instance file not found: {instance_path}", file=sys.stderr)
        return 2
    try:
        with open(instance_path) as f:
            instance = json.load(f)
    except json.JSONDecodeError as e:
        print(f"error: instance file is not valid JSON: {e}", file=sys.stderr)
        return 2

    errors = validate_instance(instance)
    if errors:
        print("error: instance failed validation:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    scenario = build_scenario(instance)
    yaml_text = dump_scenario_yaml(scenario)

    if output_path is None:
        # Default: write next to the instance file, with .yaml extension
        output_path = instance_path.with_suffix(".scenario.yaml")

    try:
        with open(output_path, "w") as f:
            f.write(yaml_text)
    except OSError as e:
        print(f"error: could not write output file {output_path}: {e}", file=sys.stderr)
        return 1

    print(f"OK  converted {instance['instance_id']} → {output_path}")
    print(f"    scenario id:    {scenario['id']}")
    print(f"    workflow:       {scenario['workflow']}")
    print(f"    steps:          {len(scenario['steps'])}")
    print(f"    evidence kinds: {len(scenario['expected']['evidence_kinds'])}")
    print(f"    memory types:   {scenario['expected']['memory_types']}")
    return 0


def cmd_list_samples() -> int:
    """List the SWE-bench sample instances committed in swebench-samples/."""
    if not SAMPLES_DIR.exists():
        print(f"error: samples directory not found: {SAMPLES_DIR}", file=sys.stderr)
        return 2

    samples = sorted(SAMPLES_DIR.glob("*.json"))
    if not samples:
        print(f"No SWE-bench samples found in {SAMPLES_DIR}")
        return 0

    print(f"Found {len(samples)} SWE-bench sample(s) in {SAMPLES_DIR}:\n")
    for path in samples:
        try:
            with open(path) as f:
                instance = json.load(f)
            iid = instance.get("instance_id", "?")
            repo = instance.get("repo", "?")
            f2p = instance.get("FAIL_TO_PASS", [])
            print(f"  {path.name:40s}  id={iid:25s}  repo={repo}")
            print(f"  {'':40s}  FAIL_TO_PASS={f2p}")
        except (json.JSONDecodeError, OSError) as e:
            print(f"  {path.name:40s}  ERROR: {e}")
    print(f"\nConvert one with:")
    print(f"  python3 {SCRIPT_DIR.name}/swebench-adapter.py {SAMPLES_DIR.name}/<sample>.json --output /tmp/scenario.yaml")
    return 0


def cmd_download_stub(instance_id: str) -> int:
    """
    STUB — does NOT actually download real SWE-bench instances.

    Real SWE-bench instances live in the `princeton-nlp/SWE-bench` HuggingFace
    dataset and require cloning the source repo (sympy, django, flask, etc.)
    at a specific commit. That's GBs of data and needs Docker (ADR-0030) to
    execute the test suite. This stub prints the manual instructions instead.

    See ADR-0036 (Phase 3.5) for the deferred real-download plan.
    """
    print("=" * 72)
    print(f"  SWE-bench instance download — STUB (instance_id={instance_id!r})")
    print("=" * 72)
    print()
    print("  This is a STUB. The adapter does NOT download real SWE-bench")
    print("  instances automatically, because:")
    print("    1. Real instances require downloading the source repo (sympy,")
    print("       django, flask, etc.) at a specific commit — GBs of data.")
    print("    2. Executing the FAIL_TO_PASS test suite requires Docker")
    print("       (ADR-0030 sandbox runtime), which is not available in")
    print("       this environment.")
    print()
    print("  To download a real instance manually:")
    print()
    print("    # 1. Install the SWE-bench Python package (one-time):")
    print("    pip install swebench")
    print()
    print("    # 2. Download the instance JSON from the HuggingFace dataset:")
    print("    python -c \"\\")
    print("      from datasets import load_dataset;\\")
    print(f"      ds = load_dataset('princeton-nlp/SWE-bench_Verified', split='test');\\")
    print(f"      import json;\\")
    print(f"      for row in ds:\\")
    print(f"          if row['instance_id'] == '{instance_id}':\\")
    print(f"              json.dump(row, open('{instance_id}.json','w')); break\\")
    print("    \"")
    print()
    print("    # 3. Clone the source repo at the base_commit:")
    print(f"      # (the instance's `repo` and `base_commit` fields tell you which)")
    print()
    print("    # 4. Convert the downloaded instance to an AIECP scenario:")
    print(f"    python3 evaluations/swebench-adapter.py {instance_id}.json --output /tmp/scenario.yaml")
    print()
    print("    # 5. Run the eval (requires Docker for real test execution):")
    print("    python3 evaluations/eval_runner.py  # once Docker sandbox lands (ADR-0030)")
    print()
    print("  See ADR-0036 (Phase 3.5) for the deferred 10-instance Pass@1 plan.")
    print()
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="swebench-adapter",
        description="SWE-bench → AIECP scenario adapter (ADR-0031 Phase 3).",
        usage=(
            "python3 evaluations/swebench-adapter.py <instance.json> [--output <scenario.yaml>]\n"
            "       python3 evaluations/swebench-adapter.py --download <instance-id>\n"
            "       python3 evaluations/swebench-adapter.py --list-samples"
        ),
    )
    parser.add_argument(
        "instance",
        nargs="?",
        help="Path to a SWE-bench instance JSON file.",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output scenario YAML path (default: <instance>.scenario.yaml).",
    )
    parser.add_argument(
        "--download",
        metavar="INSTANCE_ID",
        help="STUB: print instructions for downloading a real SWE-bench instance.",
    )
    parser.add_argument(
        "--list-samples",
        action="store_true",
        help="List the SWE-bench sample instances in swebench-samples/.",
    )
    args = parser.parse_args(argv)

    if args.list_samples:
        return cmd_list_samples()

    if args.download is not None:
        return cmd_download_stub(args.download)

    if args.instance is None:
        parser.print_help(sys.stderr)
        return 2

    instance_path = Path(args.instance).resolve()
    output_path = Path(args.output).resolve() if args.output else None
    return cmd_convert(instance_path, output_path)


if __name__ == "__main__":
    sys.exit(main())
