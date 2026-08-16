# AIECP v1.0.0 Release Notes — 2026-08-16

**Status:** Release Candidate (RC1)
**Codename:** "Süper Zeka" — pro-LLM denetiminin 5 maddelik eylem planı tamamlandı.

## Headline features (pro-LLM audit driven)

### 1. JIT Bağlam Yönlendirme (ADR-0032)
State başına 76 satırlık mikro-paket — 5000 satırlık upfront load yerine
sadece o state için gereken context'i yükler. **%96 token tasarrufu.**

### 2. Adaptif Risk Yönlendirme (ADR-0034)
`classifyRisk()` her görevü 5 seviyede sınıflar:
- **trivial** → fast-path (FSM atlanır, direkt apply + verify)
- **low/medium** → tam FSM
- **high** → tam FSM + mandatory code-review
- **critical** → `human-approval-required` gate (sadece `advanceWithHumanApproval()` bypass eder)

### 3. Docker Sandbox İzolasyonu (ADR-0035)
`runInSandbox()` komutları Docker container'da çalıştırır:
`--read-only --cap-drop=ALL --network=none` — çekirdek seviyesinde izolasyon.
Docker yoksa graceful fallback + LOUD WARNING (asla sessizce unsafe).

### 4. Tree-sitter Çoklu Dil Desteği (ADR-0033)
11 dil için universal AST parser: Go, Rust, Java, C++, C, Kotlin, Swift,
Ruby, PHP, Scala, Clojure. ADR-0022 zero-runtime-deps korundu — WASM
binary'leri vendored. WASM-missing durumunda regex fallback.

### 5. SWE-bench Adaptörü (ADR-0036)
SWE-bench instance JSON → AIECP scenario YAML adapter'ı. Endüstri
standardı benchmark ile doğrudan karşılaştırılabilirlik. 1 synthetic
sample + `--download` stub (gerçek instance'lar Phase 3.5).

## Architecture decisions (ADR-0030–0036)

| ADR | Title | Status |
|-----|-------|--------|
| 0030 | OS-level sandbox via Docker (not WASI — 2026 CVEs) | Decided, impl ADR-0035 |
| 0031 | SWE-bench adapter design (not a fork) | Decided, impl ADR-0036 |
| 0032 | JIT Context Injection (state → micro-bundle) | Implemented |
| 0033 | Tree-sitter universal AST (vendored WASM) | Implemented |
| 0034 | Adaptive risk-based workflow routing (5-level) | Implemented |
| 0035 | Docker sandbox runner (graceful fallback) | Implemented |
| 0036 | SWE-bench adapter implementation | Implemented |

## Counts (v1.0.0)

| Metric | Count |
|---|---|
| ADRs | 36 |
| Skills | 35 |
| Workflows | 15 |
| Agent adapters | 5 |
| e2e drivers | 26 (25 with assertions + 1 narrative-only) |
| Eval scenarios | 25 |
| **Assertions** | **1356 pass / 5 known-fail** |

## CLI distribution

```bash
# Global install (makes `aiecp` + `init-aiecp` available as commands)
npm install -g .

# Or use via npx
npx aiecp --help
npx init-aiecp /path/to/project --entegre
npx init-aiecp /path/to/project --yarat "e-commerce API with Stripe"
```

## Docker sandbox setup

```bash
docker build -t aiecp-executor:latest -f sandbox/Dockerfile.aiecp-executor sandbox/
```

## CI/CD

- `.github/workflows/assertion-table-check.yml` — STATUS.md drift detection
- `.github/workflows/sandbox-ci.yml` — Docker daemon'lı sandbox test job

## Honest scope (NOT in v1.0.0)

- **Real SWE-bench Pass@1 run**: Docker daemon + gerçek SWE-bench Verified
  instances (HuggingFace) + gerçek repo clone'ları gerekir. Phase 3.5.
- **Per-skill sandbox wiring**: her skill'in `execSync` çağrıları
  `runInSandbox` üzerinden geçmiyor henüz. Phase 3.5.
- **`skills/mobile/`**: ADR-0016 long-term scope, hâlâ yazılmadı (kabul
  edilmiş future-scope).

## Migration from 0.1.0

Breaking change yok. Tüm `.sm.yaml`, schema, skill dosyaları backwards-
compatible. Yeni opsiyonel `WorkflowRunOptions.sandbox?: boolean` ve
`bin` field eklendi.

## Tag

```
git tag -a v1.0.0 -m "AIECP v1.0.0 Release Candidate — pro-LLM audit 5-item action plan complete"
git push origin v1.0.0
```
