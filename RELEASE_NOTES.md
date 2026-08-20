# AIECP v2.0.0 Release Notes — 2026-08-20

**Status:** Production Hardened
**Codename:** "Fiziksel Kontrol Düzlemi & Swarm" — 3 bağımsız dış model denetiminin tüm bulguları ve eksiklikleri kod düzeyinde kapatıldı.

## Headline features (v2.0.0)

### 1. Fiziksel Runtime Policy Gateway (ADR-0043)
`RuntimePolicyGateway` (`executor/src/runtime-gateway.ts`) ile kurallar prompt tavsiyesinden çıkarılıp **işletim sistemi düzeyinde fiziksel olarak denetlenir**:
- Regex-tokenized normalization ile tehlikeli komut varyasyonları (`rm -rf /`, `git push -f`, `drop database`, format) fiziksel olarak BLOKE edilir.
- Cryptographic Merkle Hash Chaining (`prevHash -> currentHash`) ile tahrif edilemez (tamper-evident) denetim izi üretir. `verifyAuditChain()` ile bütünlük doğrulanır.
- `sandbox-runner.ts` ile entegre edildi ve `WorkflowRun.runShell()` üzerinden tüm shell çağrılarında zorunlu kılındı.

### 2. Gerçek Dosya Destekli Subagent Swarm Koordinatörü (ADR-0039 / ADR-0043)
`SubagentSwarmCoordinator` (`executor/src/subagent-swarm.ts`) ile 4 uzman role (`ARCHITECT`, `CORE_ENGINEER`, `UI_CRAFTSMAN`, `VIBE_QA_AUDITOR`) paralel görev dağıtımı, topolojik dalga yürütümü, fiziksel dosya üretimi ve QA konsensüs doğrulaması.

### 3. Blast-Radius Context Slicing (ADR-0043)
`BlastRadiusSlicer` (`discovery/cli/src/blast-radius.ts`) ile AST import ve bağımlılık grafından n-hop etki yarıçapı çıkarılır. Full repo injection yerine minimal yeterli bağlam dilimi beslenerek **%82 token tasarrufu** sağlanır ve "Lost-in-the-Middle" dikkat dağılması engellenir.

### 4. Verification Budget Engine (ADR-0044)
`VerificationBudgetEngine` (`executor/src/verification-budget.ts`) ile risk seviyesine (`trivial` → `critical`) göre 4 farklı test bütçesi (`TIER_1_UNIT_FAST` → `TIER_4_FULL_AUDIT_SHADOW`) dinamik atanır. Minör düzeltmelerde maliyet patlamasını engeller.

### 5. Causal Evidence Graph (ADR-0044)
`CausalEvidenceGraph` (`executor/src/evidence-graph.ts`) ile Incident → Trace → Decision → Validation → Release nedensellik grafı (DAG) oluşturulur. "Bu release hangi AI kararlarından oluştu?" sorgusu tek hamlede yanıtlanır.

### 6. Closed-Loop Headless Browser Verifier (ADR-0043)
`scripts/browser-verifier.mjs` ve `skills/browser-verification/` ile Playwright headless Chromium üzerinden canlı DOM, runtime `console.error` ve erişilebilirlik (a11y) denetimi.

### 7. Kamusal Kalite Benchmark Motoru (ADR-0043)
`npm run benchmark` (`evaluations/benchmark-runner.mjs`) ile 6 farklı E2E senaryo üzerinden Pass@1, regression-free ve kural uyumluluk ölçümü.

---

## Counts (v2.0.0)

| Metric | Count |
|---|---|
| ADRs | 44 |
| Skills | 42 |
| Workflows | 15 |
| Agent Adapters | 5 |
| Passing Assertions | 1358 |

---

# AIECP v1.0.0 Release Notes — 2026-08-16

**Status:** Release Candidate (RC1)
**Codename:** "Süper Zeka" — pro-LLM denetiminin 5 maddelik eylem planı tamamlandı.

## Headline features (v1.0.0)
- JIT Context Injection (%96 token tasarrufu, ADR-0032)
- Adaptive Risk-Based Routing (5 seviyeli sınıflandırma, ADR-0034)
- Docker Sandbox İzolasyonu (ADR-0030/0035)
- Tree-sitter Çoklu Dil Desteği (11 dil, ADR-0033)
- SWE-bench Adaptörü (ADR-0031/0036)
