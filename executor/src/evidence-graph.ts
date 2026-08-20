import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface EvidenceNode {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  parents: string[];
  children: string[];
}

export interface CausalChainReport {
  rootIncidentId?: string;
  decisions: string[];
  traces: string[];
  validations: string[];
  isFullyJustified: boolean;
  danglingReferences: string[];
}

/**
 * Causal Evidence Graph (ADR-0044)
 *
 * Models and queries the causal provenance graph:
 * Incident -> Expected/Actual -> Trace -> Decision -> Validation -> Memory/Release
 * Allows enterprise auditors to answer: "Which AI decisions led to this release?" in a single query.
 */
export class CausalEvidenceGraph {
  private nodes = new Map<string, EvidenceNode>();

  /**
   * Adds an evidence entity node into the graph, parsing references.
   */
  addEntity(kind: string, data: Record<string, unknown>): EvidenceNode {
    const id = (data.id as string) || `anon-${Math.random().toString(36).slice(2, 8)}`;
    const parents: string[] = [];

    // Extract reference fields (_ref, _refs)
    for (const [key, value] of Object.entries(data)) {
      if (key.endsWith("_ref") && typeof value === "string") {
        parents.push(value);
      } else if (key.endsWith("_refs") && Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") parents.push(item);
        }
      }
    }

    const node: EvidenceNode = {
      id,
      kind,
      data,
      parents,
      children: [],
    };

    this.nodes.set(id, node);

    // Update forward children links
    for (const parentId of parents) {
      const parentNode = this.nodes.get(parentId);
      if (parentNode && !parentNode.children.includes(id)) {
        parentNode.children.push(id);
      }
    }

    return node;
  }

  /**
   * Loads all evidence JSONs from a run directory (.aiecp/evidence).
   */
  loadFromDir(evidenceRootDir: string): void {
    if (!existsSync(evidenceRootDir)) return;

    const subdirs = ["incident", "expected", "actual", "trace", "event", "decision", "validation"];
    for (const sub of subdirs) {
      const dirPath = join(evidenceRootDir, sub);
      if (!existsSync(dirPath)) continue;

      const files = readdirSync(dirPath).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        try {
          const content = JSON.parse(readFileSync(join(dirPath, file), "utf-8"));
          this.addEntity(sub, content);
        } catch (e) {
          // ignore corrupted files
        }
      }
    }
  }

  /**
   * Traces full causal lineage backwards from a terminal release or validation.
   */
  traceCausalChain(targetNodeId: string): CausalChainReport {
    const visited = new Set<string>();
    const decisions: string[] = [];
    const traces: string[] = [];
    const validations: string[] = [];
    const dangling: string[] = [];
    let rootIncidentId: string | undefined;

    const queue = [targetNodeId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const node = this.nodes.get(currentId);
      if (!node) {
        dangling.push(currentId);
        continue;
      }

      if (node.kind === "decision") decisions.push(node.id);
      if (node.kind === "trace") traces.push(node.id);
      if (node.kind === "validation") validations.push(node.id);
      if (node.kind === "incident") rootIncidentId = node.id;

      for (const parent of node.parents) {
        if (!visited.has(parent)) {
          queue.push(parent);
        }
      }
    }

    return {
      rootIncidentId,
      decisions,
      traces,
      validations,
      isFullyJustified: decisions.length > 0 && dangling.length === 0,
      danglingReferences: dangling,
    };
  }
}

/**
 * Built-in self-test
 */
export function runEvidenceGraphSelfTest(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean) {
    if (condition) {
      console.log(`  OK   ${name}`);
      passed++;
    } else {
      console.error(`  FAIL ${name}`);
      failed++;
    }
  }

  console.log("=== CausalEvidenceGraph self-test (ADR-0044) ===");
  const graph = new CausalEvidenceGraph();

  // 1. Build a causal chain: Incident -> Trace -> Decision -> Validation
  graph.addEntity("incident", { id: "inc-1", summary: "Login button fails" });
  graph.addEntity("trace", { id: "tr-1", incident_ref: "inc-1", events: [] });
  graph.addEntity("decision", { id: "dec-1", trace_ref: "tr-1", what: "fix:add_debounce" });
  graph.addEntity("validation", { id: "val-1", decision_ref: "dec-1", passed: true });

  // 2. Query provenance from validation back to root incident
  const report = graph.traceCausalChain("val-1");
  assert("chain connects to root incident", report.rootIncidentId === "inc-1");
  assert("decision is present in provenance", report.decisions.includes("dec-1"));
  assert("trace is present in provenance", report.traces.includes("tr-1"));
  assert("isFullyJustified is true", report.isFullyJustified === true);

  console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
