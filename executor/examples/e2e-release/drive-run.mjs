// End-to-end driver for release.sm.yaml. Feeds a scripted (but
// realistic) release scenario through the real WorkflowRun API —
// emits real, schema-valid Evidence Model entities at each state and
// writes a real project memory entry at the terminal `report` state.
//
// What this proves:
//   1. release.sm.yaml loads cleanly through loadWorkflow (structural
//      validation, no dead ends, all states reachable).
//   2. A real WorkflowRun walks intake -> classify -> check-readiness
//      -> run-tests -> update-changelog -> tag -> publish ->
//      verify-release -> report, emitting schema-valid evidence at
//      every emitting state.
//   3. The broad-refactor safety gate at the `tag` state actually
//      blocks an un-confirmed transition out of `tag`, then allows
//      it when confirmation is supplied (advanceWithConfirmation).
//      This is the same gate bug-report uses at propose-fix/apply-fix
//      and feature-request uses at implement — proving the gate is
//      workflow-agnostic. The gate is positioned at `tag` (not
//      `publish`) because tagging is the irreversible-ish step:
//      moving a published tag leaves a fingerprint in consumers'
//      lockfiles.
//   4. The question_economy (max_questions: 1, allowed_states:
//      [classify]) enforces correctly: one question in classify is
//      accepted, a question in run-tests (not in allowed_states) is
//      rejected with question-economy-wrong-state.
//   5. The workflow's UNIQUE structural feature — the clean-env
//      install verification at `verify-release` (distinct from the
//      dev-tree test suite at `run-tests`) — is exercised and emits
//      TWO Events (install + import) plus an Actual + Validation
//      with method=app_validation.
//
// What this does NOT prove: a live, multi-turn agent session driving
// the framework one tool call at a time, AND actually invoking
// npm publish against a real registry. The scenario data (test
// counts, advisory-lookup output, the clean-env install log) is
// realistic but scripted — same honest scope note as
// executor/examples/e2e-feature-request/README.md. A live release
// integration test (real npm publish against a sandbox registry in
// a temp dir) is tracked as future work in STATUS.md.

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { WorkflowRun } from "../../dist/run.js";
import { WorkflowViolation } from "../../dist/types.js";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = join(__dirname, "..", "..", "..", "workflows", "release.sm.yaml");

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  OK   ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}`);
    failed++;
  }
}

async function expectViolation(label, kind, fn) {
  try {
    await fn();
    check(`${label} (expected WorkflowViolation kind="${kind}")`, false);
  } catch (e) {
    if (e instanceof WorkflowViolation && e.kind === kind) {
      check(label, true);
    } else {
      console.log(`  FAIL ${label} — wrong error: ${e}`);
      failed++;
    }
  }
}

async function scenario() {
  const runDirParent = await mkdtemp(join(tmpdir(), "aiecp-release-"));
  const runDir = join(runDirParent, "evidence-and-memory");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  console.log("=== End-to-end release run: 'ship v1.4.0 (minor release, npm registry, signed tag)' ===\n");
  console.log("User request: 'ship v1.4.0'\n");

  // ------------------------------------------------------------------
  // Workflow structural assertions
  // ------------------------------------------------------------------
  check("workflow loaded with name 'release'", def.workflow === "release");
  check("initial state is intake", run.currentState === "intake");
  check("workflow declares safety_gates with one entry at tag (broad-refactor)",
    Array.isArray(def.safety_gates) &&
      def.safety_gates.length === 1 &&
      def.safety_gates[0].state === "tag" &&
      def.safety_gates[0].gate === "broad-refactor");
  check("question_economy budget is 1, allowed_states=[classify]",
    def.question_economy.max_questions === 1 &&
    JSON.stringify(def.question_economy.allowed_states) === JSON.stringify(["classify"]));
  check("workflow has all 10 states declared",
    def.states.length === 10);

  // ------------------------------------------------------------------
  // intake -> classify
  // ------------------------------------------------------------------
  run.advance("intent_classified");
  check("state is classify", run.currentState === "classify");

  // classify: one allowed question. The user said "v1.4.0" but
  // we need to confirm whether this is a regular cut (off main) or
  // a hotfix (off the last release branch) — the answer changes
  // the branch the tag is created on and the readiness bar.
  run.askQuestion("Is this a regular cut off main, or a hotfix off the v1.3.x release branch?");
  check("question count is 1 (at max_questions=1)", run.questions.count === 1);

  await run.emitEvidence("trace", {
    id: "trace-classify-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-classify-1"],
  });
  await run.emitEvidence("event", {
    id: "event-classify-1",
    trace_ref: "trace-classify-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "git log --oneline v1.3.0..HEAD + project-intelligence.json:release",
    payload: {
      finding: "diff since v1.3.0: 47 commits, +1,832 / -412 lines; new features: tag-based filtering on /items endpoint, /health endpoint; no breaking changes detected; semver minor bump is correct; Project Intelligence declares: release.version_policy=semver, release.registry=npm, release.signing=gpg-signed-tags, release.channels=[stable,next]",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-accept-release-1",
    trace_ref: "trace-classify-1",
    what: "acceptance:proceed_with_release",
    why: "release shape = minor (v1.4.0); per user's classify answer, this is a regular cut off main (not a hotfix); semver bump minor is correct because new features were added without breaking changes; channel = stable per user request",
    validated: true,
    result: "accepted",
  });
  run.advance("class_known");
  check("state is check-readiness", run.currentState === "check-readiness");

  // ------------------------------------------------------------------
  // check-readiness: emit 5 readiness check Events.
  // ------------------------------------------------------------------
  const readinessEvents = [
    { id: "event-readiness-clean-tree", source: "git status --porcelain", finding: "(empty output — working tree clean)" },
    { id: "event-readiness-branch-up-to-date", source: "git fetch && git status -sb", finding: "## main...origin/main (no 'behind' indicator — branch is up to date with remote)" },
    { id: "event-readiness-advisories", source: "npm audit --json", finding: "0 vulnerabilities above project threshold (CVSS >= 7.0); 1 advisory below threshold (CVE-2024-XXXX in devDependency 'lodash@4.17.20', CVSS 5.3 — recorded for the release report, not blocking)" },
    { id: "event-readiness-deps-frozen", source: "filesystem_read: package-lock.json", finding: "no SNAPSHOT / dev / latest tags in package-lock.json; all dependencies pinned to specific versions" },
    { id: "event-readiness-test-runner", source: "project-intelligence.json:test_system", finding: "test_system = ['vitest']; release-bar phases configured: unit, integration, contract, e2e (per .vitest.config.ts:projects)" },
  ];
  await run.emitEvidence("trace", {
    id: "trace-readiness-1",
    started_at: new Date().toISOString(),
    event_refs: readinessEvents.map((e) => e.id),
  });
  for (const e of readinessEvents) {
    await run.emitEvidence("event", {
      id: e.id,
      trace_ref: "trace-readiness-1",
      ts: new Date().toISOString(),
      kind: "observation",
      source: e.source,
      payload: { finding: e.finding },
    });
  }
  check("emitted 5 readiness Events (one per check)", readinessEvents.length === 5);
  run.advance("readiness_ok");
  check("state is run-tests", run.currentState === "run-tests");

  // ------------------------------------------------------------------
  // run-tests: emit 4 test phase Events (release bar).
  // ------------------------------------------------------------------
  const testPhases = [
    { id: "event-test-unit", phase: "unit", source: "npm test --silent (unit phase)", result: "42 passed, 0 failed in 2.1s" },
    { id: "event-test-integration", phase: "integration", source: "npm run test:integration --silent", result: "18 passed, 0 failed in 4.8s" },
    { id: "event-test-contract", phase: "contract", source: "npm run test:contract --silent", result: "7 passed, 0 failed in 1.2s" },
    { id: "event-test-e2e", phase: "e2e", source: "npm run test:e2e --silent", result: "5 passed, 0 failed in 12.4s" },
  ];
  await run.emitEvidence("trace", {
    id: "trace-tests-1",
    started_at: new Date().toISOString(),
    event_refs: testPhases.map((e) => e.id),
  });
  for (const e of testPhases) {
    await run.emitEvidence("event", {
      id: e.id,
      trace_ref: "trace-tests-1",
      ts: new Date().toISOString(),
      kind: "test_result",
      source: e.source,
      payload: { phase: e.phase, result: "passed", note: e.result },
    });
  }
  check("emitted 4 test phase Events (release bar)", testPhases.length === 4);
  run.advance("tests_pass");
  check("state is update-changelog", run.currentState === "update-changelog");

  // ------------------------------------------------------------------
  // update-changelog: emit structure Decision + file_change Event.
  // ------------------------------------------------------------------
  await run.emitEvidence("decision", {
    id: "decision-changelog-structure-keep-a-changelog",
    trace_ref: "trace-classify-1",
    what: "changelog_structure:keep-a-changelog",
    why: "project's CHANGELOG.md already follows the Keep-a-Changelog convention (grouped by Added / Changed / Deprecated / Removed / Fixed / Security); preserving the convention so the v1.4.0 section reads consistently with v1.3.x and earlier",
    validated: true,
    result: "accepted",
  });
  await run.emitEvidence("event", {
    id: "event-changelog-diff",
    trace_ref: "trace-classify-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "CHANGELOG.md",
    payload: {
      diff_summary: "added section '## [1.4.0] - 2026-08-14' with: Added: tag-based filtering on /items endpoint (?tag= repeated query param); /health endpoint for liveness probes. Changed: (none). Deprecated: (none). Removed: (none). Fixed: (none). Security: (none — see release report for the deferred CVE-2024-XXXX advisory below project threshold).",
    },
  });
  run.advance("changelog_updated");
  check("state is tag", run.currentState === "tag");

  // ------------------------------------------------------------------
  // tag: safety gate fires here (broad-refactor -> edit_source,
  // default policy = "ask"). Tagging is irreversible-ish — published
  // tags can be moved but leave fingerprints in consumers' lockfiles.
  // ------------------------------------------------------------------
  await expectViolation(
    "un-confirmed transition out of tag is blocked by safety gate",
    "safety-gate-needs-confirmation",
    () => run.advance("tag_created")
  );
  check("state is still tag after blocked attempt", run.currentState === "tag");

  // Now simulate the human confirming and proceed.
  run.advanceWithConfirmation("tag_created");
  check("state is publish after confirmation", run.currentState === "publish");

  // Emit the tag action Event AFTER the confirmed advance (same
  // narrative-simplicity pattern as e2e-feature-request).
  await run.emitEvidence("event", {
    id: "event-tag-created",
    trace_ref: "trace-classify-1",
    ts: new Date().toISOString(),
    kind: "action",
    source: "git tag -s v1.4.0 -m 'Release v1.4.0'",
    payload: {
      tag_name: "v1.4.0",
      tag_commit: "370db3c1f8e9a7c4b2d6e5f0a1b2c3d4e5f6a7b8",
      signed: true,
      signing_key_fingerprint: "ABCD1234EFGH5678 (recorded for audit; key not persisted in evidence)",
      output: "Created tag 'v1.4.0' (signed with GPG key ABCD1234EFGH5678)",
    },
  });

  // Negative test: a question in publish (not in allowed_states
  // [classify]) is rejected.
  await expectViolation(
    "question asked in publish (not in allowed_states) is rejected",
    "question-economy-wrong-state",
    () => run.askQuestion("Should the publish use --provenance or skip it?")
  );

  // ------------------------------------------------------------------
  // publish -> verify-release
  // ------------------------------------------------------------------
  await run.emitEvidence("event", {
    id: "event-publish-npm",
    trace_ref: "trace-classify-1",
    ts: new Date().toISOString(),
    kind: "action",
    source: "npm publish --access public --provenance",
    payload: {
      registry: "https://registry.npmjs.org/",
      package: "@example/api-service@1.4.0",
      output: "+ @example/api-service@1.4.0\nnpm notice provenance: https://registry.npmjs.org/-/npm/v1/integrity/...",
      tarball_size: "47.3 kB",
    },
  });
  run.advance("artifact_published");
  check("state is verify-release", run.currentState === "verify-release");

  // ------------------------------------------------------------------
  // verify-release: UNIQUE structural feature — clean-env install +
  // import verification. The dev-tree tests passed but the published
  // tarball may be missing files (a packaging defect that the dev
  // tree's local node_modules masks).
  // ------------------------------------------------------------------
  await run.emitEvidence("trace", {
    id: "trace-verify-release-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-verify-clean-install", "event-verify-clean-import"],
  });
  await run.emitEvidence("event", {
    id: "event-verify-clean-install",
    trace_ref: "trace-verify-release-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "mktemp -d /tmp/release-verify-XXXX && cd /tmp/release-verify-XXXX && npm install @example/api-service@1.4.0",
    payload: {
      finding: "added 47 packages in 2.1s; npm notice created a lockfile; 0 vulnerabilities found in clean install (the deferred devDependency advisory from check-readiness doesn't apply here because lodash is a devDependency, not shipped to consumers)",
    },
  });
  await run.emitEvidence("event", {
    id: "event-verify-clean-import",
    trace_ref: "trace-verify-release-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "node -e \"const { createRouter } = require('@example/api-service'); const r = createRouter(); console.log('import OK, router is', typeof r);\"",
    payload: {
      finding: "import OK, router is object — the public API (createRouter) is callable from a clean install; the published tarball includes all declared exports",
    },
  });
  await run.emitEvidence("actual", {
    id: "actual-release-artifact-clean-installable",
    expected_ref: "expected-release-artifact-clean-installable",
    observed_value: "clean-env install of @example/api-service@1.4.0 succeeded (47 packages, 0 vulns); clean-env import of createRouter() succeeded — the public API is callable",
    observation_ref: "event-verify-clean-import",
    observed_at: new Date().toISOString(),
  });
  await run.emitEvidence("expected", {
    id: "expected-release-artifact-clean-installable",
    source_ref: "specs/spec.md#release-verification",
    predicate: "the published artifact is installable in a clean environment (no devDependencies, no local caches) and its declared public API is importable and callable",
    predicate_kind: "behavioral",
  });
  await run.emitEvidence("validation", {
    id: "validation-verify-release",
    expected_ref: "expected-release-artifact-clean-installable",
    actual_ref: "actual-release-artifact-clean-installable",
    result: "match",
    method: "app_validation",
    evidence_refs: ["event-verify-clean-install", "event-verify-clean-import"],
    validated_at: new Date().toISOString(),
  });
  run.advance("release_verified");
  check("state is report (terminal)", run.currentState === "report" && run.isTerminal());

  // ------------------------------------------------------------------
  // report: write project memory with version + tag + registry URL
  // + deferred advisory note.
  // ------------------------------------------------------------------
  await run.writeMemory("project", {
    id: "mem-project-release-v1-4-0-2026-08-14",
    type: "project",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "release-run-1",
    stack: ["typescript"],
    layer: ["backend", "api"],
    domain: "API service released as v1.4.0 on 2026-08-14; tag v1.4.0 (GPG-signed, commit 370db3c); published to https://registry.npmjs.org/@example/api-service@1.4.0 (47.3 kB tarball, with --provenance supply-chain attestation); clean-env install + import verified; deferred advisory: CVE-2024-XXXX in devDependency lodash@4.17.20 (CVSS 5.3, below project threshold, not shipped to consumers); channels: stable",
  });

  // ------------------------------------------------------------------
  // Final assertions: the run produced the expected evidence trail
  // ------------------------------------------------------------------
  check("exactly 1 question was asked", run.questions.count === 1);
  check("log has entries for every transition + evidence + gate check", run.log.length > 15);
  check("log has at least one gate-check entry (tag broad-refactor)",
    run.log.filter((e) => e.type === "gate-check").length >= 1);

  // Confirm the run wrote real evidence files to disk.
  const evidenceKinds = ["trace", "event", "decision", "expected", "actual", "validation"];
  for (const kind of evidenceKinds) {
    const dir = join(runDir, "evidence", kind);
    const files = await readdir(dir).catch(() => []);
    check(`evidence/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  const memoryKinds = ["project"];
  for (const kind of memoryKinds) {
    const dir = join(runDir, "memory", kind);
    const files = await readdir(dir).catch(() => []);
    check(`memory/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  // Spot-check that the changelog structure Decision persisted
  // (release's feature: structure choice is recorded for audit).
  const persistedChangelogDecision = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-changelog-structure-keep-a-changelog.json"), "utf-8")
  );
  check(
    "persisted changelog Decision has what starts with 'changelog_structure:'",
    persistedChangelogDecision.what.startsWith("changelog_structure:")
  );

  // Spot-check that the tag Event persisted with signed=true (release's
  // feature: tag signature recorded for audit).
  const persistedTagEvent = JSON.parse(
    await readFile(join(runDir, "evidence", "event", "event-tag-created.json"), "utf-8")
  );
  check(
    "persisted tag Event has kind=action, signed=true, tag_name=v1.4.0",
    persistedTagEvent.kind === "action" &&
      persistedTagEvent.payload.signed === true &&
      persistedTagEvent.payload.tag_name === "v1.4.0"
  );

  // Spot-check that the verify-release Validation has method=app_validation
  // (NOT unit_test — the clean-env install is the direct behavioral check,
  // the dev-tree test suite alone would be insufficient per ADR-0010).
  const persistedValidation = JSON.parse(
    await readFile(join(runDir, "evidence", "validation", "validation-verify-release.json"), "utf-8")
  );
  check(
    "persisted verify-release Validation has method=app_validation (clean-env install is the behavioral check)",
    persistedValidation.method === "app_validation" && persistedValidation.result === "match"
  );

  // Spot-check that the project memory entry has the registry URL and
  // the deferred advisory note in domain (for the next security audit).
  const persistedProject = JSON.parse(
    await readFile(join(runDir, "memory", "project", "mem-project-release-v1-4-0-2026-08-14.json"), "utf-8")
  );
  check(
    "persisted project memory has registry URL + deferred advisory note in domain",
    persistedProject.domain.includes("registry.npmjs.org") &&
      persistedProject.domain.includes("CVE-2024-XXXX") &&
      persistedProject.domain.includes("below project threshold")
  );

  // Cleanup
  await rm(runDirParent, { recursive: true, force: true });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.error("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
  console.log("");
  console.log("Proof summary:");
  console.log("- release.sm.yaml loads through the real executor");
  console.log("- A full WorkflowRun walks all 8 non-terminal states + 1 terminal (report)");
  console.log("- Schema-valid evidence emitted at every emitting state (6 evidence kinds)");
  console.log("- 5 readiness Events emitted (clean tree / branch / advisories / deps / test runner)");
  console.log("- 4 test phase Events emitted (unit / integration / contract / e2e — release bar)");
  console.log("- changelog structure Decision emitted (keep-a-changelog) + CHANGELOG.md file_change Event");
  console.log("- broad-refactor safety gate at `tag` blocks un-confirmed advance, allows confirmed");
  console.log("- question_economy enforces max_questions=1 and allowed_states=[classify]");
  console.log("- Negative test: question in `publish` correctly rejected as wrong-state");
  console.log("- verify-release emits TWO clean-env Events (install + import) + Validation with method=app_validation");
  console.log("- All evidence persisted to disk as JSON (would have thrown on schema violation)");
  console.log("- project memory written at report with registry URL + deferred advisory note");
}

scenario().catch((err) => {
  console.error("E2E DRIVER FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
