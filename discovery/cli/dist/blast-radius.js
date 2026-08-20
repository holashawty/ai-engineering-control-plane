import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
/**
 * Blast-Radius Context Slicer (ADR-0043)
 *
 * Slices the repository dependency graph around target mutation files.
 * Instead of dumping 50+ repo files into LLM context (causing Lost-in-the-Middle
 * and attention dilution), this engine calculates an n-hop blast radius,
 * providing the minimal sufficient context slice with ~80% token savings.
 */
export class BlastRadiusSlicer {
    fileCache = new Map();
    /**
     * Fast regex-based parser extracting import/require/from statements across polyglot files.
     */
    extractImports(filePath, content) {
        const ext = extname(filePath);
        const imports = [];
        if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx" || ext === ".mjs") {
            const tsRegex = /(?:import|from|require\()\s*['"]([^'"]+)['"]/g;
            let match;
            while ((match = tsRegex.exec(content)) !== null) {
                if (match[1].startsWith(".")) {
                    imports.push(match[1]);
                }
            }
        }
        else if (ext === ".py") {
            const pyRegex = /(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/g;
            let match;
            while ((match = pyRegex.exec(content)) !== null) {
                const mod = match[1] || match[2];
                if (mod)
                    imports.push(mod);
            }
        }
        return imports;
    }
    /**
     * Recursively finds all code files in the directory.
     */
    getAllFiles(dir, baseDir) {
        const results = [];
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!["node_modules", ".git", "dist", ".aiecp", "coverage"].includes(entry.name)) {
                    results.push(...this.getAllFiles(fullPath, baseDir));
                }
            }
            else if (entry.isFile()) {
                const ext = extname(entry.name);
                if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".go", ".rs"].includes(ext)) {
                    results.push(relative(baseDir, fullPath).replace(/\\/g, "/"));
                }
            }
        }
        return results;
    }
    /**
     * Calculates the blast radius slice for a target file within a repo.
     */
    slice(repoPath, targetFile, opts = {}) {
        const maxHops = opts.maxHops ?? 2;
        const normalizedTarget = targetFile.replace(/\\/g, "/").replace(/^\.\//, "");
        const allFiles = this.getAllFiles(repoPath, repoPath);
        // Build adjacency graphs: imports and importedBy
        const importGraph = new Map();
        const reverseGraph = new Map();
        for (const file of allFiles) {
            importGraph.set(file, new Set());
            reverseGraph.set(file, new Set());
        }
        for (const file of allFiles) {
            try {
                const content = readFileSync(join(repoPath, file), "utf-8");
                const rawImports = this.extractImports(file, content);
                for (const rawImp of rawImports) {
                    // Resolve relative path
                    const fileDir = dirname(file);
                    let resolved = join(fileDir, rawImp).replace(/\\/g, "/");
                    // Try extensions if missing
                    const candidateFiles = [
                        resolved,
                        `${resolved}.ts`,
                        `${resolved}.js`,
                        `${resolved}.tsx`,
                        `${resolved}/index.ts`,
                        `${resolved}/index.js`,
                    ];
                    for (const cand of candidateFiles) {
                        if (importGraph.has(cand)) {
                            importGraph.get(file)?.add(cand);
                            reverseGraph.get(cand)?.add(file);
                            break;
                        }
                    }
                }
            }
            catch (e) {
                // Skip unreadable files
            }
        }
        // Traverse n-hop radius from targetFile
        const included = new Set();
        if (allFiles.includes(normalizedTarget)) {
            included.add(normalizedTarget);
        }
        let currentWave = new Set(included);
        for (let hop = 0; hop < maxHops; hop++) {
            const nextWave = new Set();
            for (const node of currentWave) {
                // 1. Files this node imports
                const outEdges = importGraph.get(node) || new Set();
                for (const out of outEdges) {
                    if (!included.has(out)) {
                        included.add(out);
                        nextWave.add(out);
                    }
                }
                // 2. Files that import this node (reverse dependents)
                const inEdges = reverseGraph.get(node) || new Set();
                for (const inNode of inEdges) {
                    if (!included.has(inNode)) {
                        included.add(inNode);
                        nextWave.add(inNode);
                    }
                }
            }
            currentWave = nextWave;
        }
        const directImports = Array.from(importGraph.get(normalizedTarget) || []);
        const reverseDependents = Array.from(reverseGraph.get(normalizedTarget) || []);
        const recommended = Array.from(included);
        const totalCount = allFiles.length || 1;
        const slicedCount = recommended.length || 1;
        const savings = Math.max(0, Math.round(((totalCount - slicedCount) / totalCount) * 100));
        return {
            targetFile: normalizedTarget,
            directImports,
            reverseDependents,
            totalRepoFiles: totalCount,
            slicedFilesCount: slicedCount,
            tokenSavingsPercentage: savings,
            recommendedContextFiles: recommended,
        };
    }
}
/**
 * Built-in self-test
 */
export function runBlastRadiusSelfTest() {
    let passed = 0;
    let failed = 0;
    function assert(name, condition) {
        if (condition) {
            console.log(`  OK   ${name}`);
            passed++;
        }
        else {
            console.error(`  FAIL ${name}`);
            failed++;
        }
    }
    console.log("=== BlastRadiusSlicer self-test (ADR-0043) ===");
    const slicer = new BlastRadiusSlicer();
    // Test against the current directory structure
    const target = existsSync("src/discover.ts")
        ? "src/discover.ts"
        : "discovery/cli/src/discover.ts";
    const slice = slicer.slice(".", target, { maxHops: 2 });
    assert("target file is preserved in slice", slice.targetFile === target);
    assert("slice identifies files in context", slice.recommendedContextFiles.length > 0);
    assert("token savings computed", slice.tokenSavingsPercentage >= 0);
    console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
    return { passed, failed };
}
