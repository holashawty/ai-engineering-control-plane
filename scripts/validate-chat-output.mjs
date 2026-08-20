// Validates evidence emitted by a chat LLM (per CHAT-ENTRYPOINT.md
// protocol) against the Phase 1 schemas. Takes a chat LLM's text
// response (either as a file path argument or via stdin) and parses
// out every fenced ```aiecp:* code block, then validates each:
//
//   - ```aiecp:evidence blocks → validate against evidence/schema/<kind>.schema.json
//   - ```aiecp:memory blocks → validate against memory/schemas/<type>.schema.json
//   - ```aiecp:advance blocks → check transition event syntax (string under "on:")
//   - ```aiecp:question blocks → check question text syntax (string under "text:")
//
// Exits non-zero if any block fails validation or if no AIECP blocks
// are found at all. Designed to be run by a user who pastes a chat
// LLM's response into a file and runs:
//
//   node scripts/validate-chat-output.mjs path/to/chat-response.md
//   cat path/to/chat-response.md | node scripts/validate-chat-output.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import * as jsYaml from "js-yaml";
const yaml = jsYaml.default || jsYaml;

// ajv's ESM exports are awkward at runtime — coerce to plain values
// without TypeScript syntax (this file is plain .mjs, not .ts).
const AjvCtor = /** @type {any} */ (Ajv2020);
const addFormatsFn = /** @type {any} */ (addFormats);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const EVIDENCE_SCHEMA_DIR = join(REPO_ROOT, "evidence", "schema");
const MEMORY_SCHEMA_DIR = join(REPO_ROOT, "memory", "schemas");

const VALID_EVIDENCE_KINDS = new Set([
  "incident", "trace", "event", "decision",
  "expected", "actual", "validation", "replay",
]);
const VALID_MEMORY_TYPES = new Set([
  "project", "decision", "known-failure", "environment",
]);

// Regex: matches ```lang\n<body>\n``` where lang starts with "aiecp:".
// Body is non-greedy [\s\S]*? and stops at the first closing fence.
const AIECP_BLOCK = /```aiecp:([a-z]+)\n([\s\S]*?)```/g;

function readInput() {
  const arg = process.argv[2];
  if (arg) {
    return readFileSync(arg, "utf-8");
  }
  // stdin fallback
  return readFileSync(0, "utf-8");
}

function makeValidator() {
  const ajv = new AjvCtor({ strict: false, allErrors: true });
  addFormatsFn(ajv);
  const cache = new Map();

  function getValidator(schemaDir, filename, key) {
    let v = cache.get(key);
    if (!v) {
      const schema = JSON.parse(readFileSync(join(schemaDir, filename), "utf-8"));
      v = ajv.compile(schema);
      cache.set(key, v);
    }
    return v;
  }

  return {
    validateEvidence(kind, data) {
      if (!VALID_EVIDENCE_KINDS.has(kind)) {
        return { ok: false, errors: `unknown evidence kind "${kind}"; valid: ${[...VALID_EVIDENCE_KINDS].join(", ")}` };
      }
      const filename = `${kind}.schema.json`;
      const v = getValidator(EVIDENCE_SCHEMA_DIR, filename, `evidence:${kind}`);
      const ok = v(data) === true;
      return { ok, errors: ok ? undefined : JSON.stringify(v.errors, null, 2) };
    },
    validateMemory(type, data) {
      if (!VALID_MEMORY_TYPES.has(type)) {
        return { ok: false, errors: `unknown memory type "${type}"; valid: ${[...VALID_MEMORY_TYPES].join(", ")}` };
      }
      const filename = `${type}.schema.json`;
      const v = getValidator(MEMORY_SCHEMA_DIR, filename, `memory:${type}`);
      const ok = v(data) === true;
      return { ok, errors: ok ? undefined : JSON.stringify(v.errors, null, 2) };
    },
  };
}

function parseYaml(body) {
  // js-yaml auto-converts ISO 8601 date strings into Date objects,
  // which then fail JSON Schema's "type: string" check. Use the
  // JSON schema (which is a strict subset of YAML that does not
  // perform date coercion) to keep date-time fields as strings.
  return yaml.load(body, { schema: yaml.JSON_SCHEMA });
}

function parseBlocks(text) {
  // Check for bare ```aiecp blocks (common LLM mistake — missing colon:type)
  const bareAiecpCount = (text.match(/```aiecp\n/g) || []).length;
  if (bareAiecpCount > 0) {
    console.error(`WARNING: Found ${bareAiecpCount} block(s) with \`\`\`aiecp (no colon:type).`);
    console.error(`These will NOT be parsed. Use \`\`\`aiecp:evidence, \`\`\`aiecp:memory,`);
    console.error(`\`\`\`aiecp:advance, \`\`\`aiecp:question, or \`\`\`aiecp:confirm instead.`);
    console.error(`See CHAT-ENTRYPOINT.md "Protocol reference" for correct format.\n`);
  }

  const blocks = [];
  let match;
  let idx = 0;
  AIECP_BLOCK.lastIndex = 0;
  while ((match = AIECP_BLOCK.exec(text)) !== null) {
    const kind = match[1];
    const body = match[2];
    const block = { kind, body, index: idx++ };

    if (kind === "evidence" || kind === "memory") {
      let parsed;
      try {
        parsed = parseYaml(body);
      } catch (e) {
        console.error(`  Block #${block.index} (aiecp:${kind}): YAML parse failed: ${e.message}`);
        continue;
      }
      if (!parsed || typeof parsed !== "object") {
        console.error(`  Block #${block.index} (aiecp:${kind}): body is not a YAML mapping`);
        continue;
      }
      const kindOrType = parsed.kind ?? parsed.type;
      if (!kindOrType) {
        console.error(`  Block #${block.index} (aiecp:${kind}): missing "kind:" (for evidence) or "type:" (for memory) field`);
        continue;
      }
      if (!parsed.data || typeof parsed.data !== "object") {
        console.error(`  Block #${block.index} (aiecp:${kind}): missing or non-mapping "data:" field`);
        continue;
      }
      block.parsed = { kindOrType, data: parsed.data };
    } else if (kind === "advance") {
      let parsed;
      try {
        parsed = parseYaml(body);
      } catch (e) {
        console.error(`  Block #${block.index} (aiecp:advance): YAML parse failed: ${e.message}`);
        continue;
      }
      if (!parsed.on || typeof parsed.on !== "string") {
        console.error(`  Block #${block.index} (aiecp:advance): missing "on:" string field`);
        continue;
      }
      block.onEvent = parsed.on;
    } else if (kind === "question") {
      let parsed;
      try {
        parsed = parseYaml(body);
      } catch (e) {
        console.error(`  Block #${block.index} (aiecp:question): YAML parse failed: ${e.message}`);
        continue;
      }
      if (!parsed.text || typeof parsed.text !== "string") {
        console.error(`  Block #${block.index} (aiecp:question): missing "text:" string field`);
        continue;
      }
      block.questionText = parsed.text;
    } else if (kind === "confirm") {
      // ADR-0023: chat-sandbox / MCP adapters emit `aiecp:confirm` blocks
      // to authorize safety gates (e.g. broad-refactor). The block has
      // a `gate:` field naming the gate to authorize.
      let parsed;
      try {
        parsed = parseYaml(body);
      } catch (e) {
        console.error(`  Block #${block.index} (aiecp:confirm): YAML parse failed: ${e.message}`);
        continue;
      }
      if (!parsed.gate || typeof parsed.gate !== "string") {
        console.error(`  Block #${block.index} (aiecp:confirm): missing "gate:" string field`);
        continue;
      }
      block.gate = parsed.gate;
    } else {
      console.error(`  Block #${block.index}: unknown aiecp: block kind "${kind}" (valid: evidence, memory, advance, question, confirm)`);
      continue;
    }
    blocks.push(block);
  }
  return blocks;
}

function main() {
  const strictHint = process.argv.includes("--strict-hint");
  const text = readInput();
  const validator = makeValidator();

  console.log("=== AIECP chat-output validator ===\n");

  const blocks = parseBlocks(text);
  if (blocks.length === 0) {
    console.error("FAIL: no ```aiecp:* blocks found in input.");
    console.error("Expected at least one of: aiecp:evidence, aiecp:memory, aiecp:advance, aiecp:question");
    console.error("Per CHAT-ENTRYPOINT.md, chat LLMs emit evidence as fenced code blocks.");
    process.exit(1);
  }

  console.log(`Found ${blocks.length} aiecp block(s):\n`);

  // Map of evidence kind / memory type → CHAT-ENTRYPOINT.md anchor
  const TEMPLATE_HINTS = {
    incident: "CHAT-ENTRYPOINT.md#incident-template",
    trace: "CHAT-ENTRYPOINT.md#trace-template",
    event: "CHAT-ENTRYPOINT.md#event-template",
    decision: "CHAT-ENTRYPOINT.md#decision-template",
    expected: "CHAT-ENTRYPOINT.md#expected-template",
    actual: "CHAT-ENTRYPOINT.md#actual-template",
    validation: "CHAT-ENTRYPOINT.md#validation-template",
    replay: "CHAT-ENTRYPOINT.md#replay-template",
    "known-failure": "CHAT-ENTRYPOINT.md#known-failure-template",
    project: "CHAT-ENTRYPOINT.md#project-template",
    environment: "CHAT-ENTRYPOINT.md#environment-template",
  };

  let pass = 0;
  let fail = 0;
  for (const b of blocks) {
    let label;
    if (b.kind === "evidence") {
      label = `evidence/${b.parsed.kindOrType} (id: ${b.parsed.data.id ?? "?"})`;
    } else if (b.kind === "memory") {
      label = `memory/${b.parsed.kindOrType} (id: ${b.parsed.data.id ?? "?"})`;
    } else if (b.kind === "advance") {
      label = `advance (on: ${b.onEvent})`;
    } else if (b.kind === "question") {
      const truncated = b.questionText.length > 60 ? b.questionText.slice(0, 60) + "..." : b.questionText;
      label = `question (text: "${truncated}")`;
    } else if (b.kind === "confirm") {
      label = `confirm (gate: ${b.gate})`;
    } else {
      label = `unknown-kind`;
    }

    if (b.kind === "evidence") {
      const result = validator.validateEvidence(b.parsed.kindOrType, b.parsed.data);
      if (result.ok) {
        console.log(`  OK   #${b.index}  ${label}`);
        pass++;
      } else {
        console.log(`  FAIL #${b.index}  ${label}`);
        console.log(`       ${result.errors}`);
        if (strictHint && TEMPLATE_HINTS[b.parsed.kindOrType]) {
          console.log(`       HINT: See ${TEMPLATE_HINTS[b.parsed.kindOrType]} for the correct template with all required fields.`);
        }
        fail++;
      }
    } else if (b.kind === "memory") {
      const result = validator.validateMemory(b.parsed.kindOrType, b.parsed.data);
      if (result.ok) {
        console.log(`  OK   #${b.index}  ${label}`);
        pass++;
      } else {
        console.log(`  FAIL #${b.index}  ${label}`);
        console.log(`       ${result.errors}`);
        if (strictHint && TEMPLATE_HINTS[b.parsed.kindOrType]) {
          console.log(`       HINT: See ${TEMPLATE_HINTS[b.parsed.kindOrType]} for the correct template with all required fields.`);
        }
        fail++;
      }
    } else {
      // advance + question + confirm: syntax already validated during parsing
      console.log(`  OK   #${b.index}  ${label}`);
      pass++;
    }
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed (of ${blocks.length} total) ===`);
  if (fail > 0) {
    console.error("VALIDATION FAILED");
    if (strictHint) {
      console.error("Use --strict-hint to see template references for each failed block (already shown above).");
    } else {
      console.error("Tip: run with --strict-hint to see template references for each failed block.");
    }
    process.exit(1);
  }
  console.log("VALIDATION PASSED");
}

main();
