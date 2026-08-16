# AI Engineering Control Plane (AIECP)

**AI kodlama ajanlarına senior/principal mühendis disiplinini dayatan**, ajan-
bağımsız, taşınabilir bir kontrol düzlemi: kanıt odaklı (evidence-driven),
test edilebilir, kendi kendini düzelten ve bağlam-farkında — dil, framework
ve stack fark etmeksizin. AIECP bir prompt koleksiyonu, bir ajan runtime'ı veya
bir benchmark değildir; bir **kontrol düzlemidir**: yönetişim (governance) +
bağlam (context) + spesifikasyon (specification) + skill'ler + workflow'lar +
kanıt (evidence) + bellek (memory) + adapter'lar + değerlendirme (evaluation)
bir arada, tek bir anayasaya (constitution) bağlı.

> **Bu dosyayı 5 dakikada okuyan bir AI ajanı (chat veya IDE), projenin ne
> olduğunu, nasıl çalıştığını ve hangi durumda olduğunu anlamalıdır.** Detaylı
> durum için [`STATUS.md`](STATUS.md), kararlar için [`DECISIONS.md`](DECISIONS.md)
> ve güncel görev listesi için [`TASKS.md`](TASKS.md) tek doğruluk kaynağıdır.

---

## v1.0.0 Yenilikleri (Release Candidate)

> Bu sürüm, 2026-08-16'daki harici pro-LLM denetiminin 5 maddelik eylem
> planını ([`docs/roadmap-2026-pro.md`](docs/roadmap-2026-pro.md)) tamamlar.
> Her madde ayrı bir ADR ile kayıt altına alınmıştır; hiçbiri sessiz mutasyon
> değildir (ADR-0008 — anayasal self-improvement).

### 1. JIT Bağlam Yönetimi (ADR-0032)

[`executor/src/context-router.ts`](executor/src/context-router.ts) her state
geçişinde yalnızca o state için gereken minimal bağlam paketini üretir:
state purpose + emits-evidence alanları + ilgili skill'lerin 500-karakterlik
özeti. State başına ortalama **76 satırlık mikro-paket** — upfront ~5000 satır
yüklemeye göre **%96 token tasarrufu**. "Lost in the Middle" etkisi yapısal
olarak azaltıldı. Kanıt:
[`executor/examples/e2e-context-router/`](executor/examples/e2e-context-router/)
(119 assertion, 12 `bug-report` state).

### 2. Adaptif Risk Yönlendirme (ADR-0034)

[`executor/src/risk-classifier.ts`](executor/src/risk-classifier.ts) her isteği
5 seviyeden birine sınıflandırır (`trivial | low | medium | high | critical`),
saf fonksiyon (LLM değil, `git diff`'ten):

- **trivial** → **fast-path**: FSM atlanır, tek `Decision(what: "fast_path_applied")` + apply + verify
- **medium** → tam FSM (mevcut davranış)
- **critical** (auth/payment/credential/security anahtar kelimeleri) → tam FSM + yeni `human-approval-required` gate

`trivial` fast-path'i evidence-free değildir — `Decision` + `Validation`
üretir, sadece per-state apparatus'ı atlar. Kanıt:
[`executor/examples/e2e-risk-classifier/`](executor/examples/e2e-risk-classifier/)
(53 assertion).

### 3. Docker Sandbox İzolasyonu (ADR-0035)

[`executor/src/sandbox-runner.ts`](executor/src/sandbox-runner.ts) LLM-emirli
komutları Docker container içinde çalıştırır:
`docker run --rm --read-only --cap-drop=ALL --network=none`. 2026 vm2/WASI
CVE'leri nedeniyle WASI reddedildi (ADR-0030). Docker daemon yoksa
`execSync`'e düşer ama **asla sessizce unsafe moduna geçmez** — stderr +
`SandboxResult.warning`'e loud uyarı yazar. Üretim için Docker kurulumu
zorunlu (bkz. [Üretim Dağıtımı](#üretim-dağıtımı-v100)). Kanıt:
[`executor/examples/e2e-sandbox/`](executor/examples/e2e-sandbox/) (25 assertion,
runtime-agnostic).

### 4. Tree-sitter Çoklu Dil Desteği (ADR-0033)

[`discovery/cli/src/detectors/universal-ast.ts`](discovery/cli/src/detectors/universal-ast.ts)
tek bir Tree-sitter powered detector ile **11 dili** (Go, Rust, Java, C++, C,
Kotlin, Swift, Ruby, PHP, Scala, Clojure) universal AST'ye parse eder —
`symbols`, `call_graph`, `imports`, `complexity_hotspots`. WASM binary'leri
`discovery/cli/vendor/`'a vendored edildi (ADR-0022 zero-runtime-deps
invariant'ı intact). Yeni dil eklemek manifest edit + WASM download, kod
değişikliği değil. Kanıt:
[`executor/examples/e2e-universal-ast/`](executor/examples/e2e-universal-ast/)
(47 assertion).

### 5. SWE-bench Adaptörü (ADR-0036)

[`evaluations/swebench-adapter.py`](evaluations/swebench-adapter.py) bir
SWE-bench instance JSON'ı → AIECP `bug-report` scenario YAML'ye çevirir
(~640 satır Python). Endüstri standardı benchmark ile doğrudan
karşılaştırılabilir Pass@1 ölçümü için zemin hazırlar. Gerçek 10-instance
Pass@1 run Phase 3.5'e (Docker bağımlılığı) ertelendi; bu fazda sentetik
1 örnek + adapter doğrulaması var
([`evaluations/swebench-samples/sympy-13031.json`](evaluations/swebench-samples/sympy-13031.json)).
Kanıt:
[`executor/examples/e2e-swebench-adapter/`](executor/examples/e2e-swebench-adapter/)
(66 assertion).

> **Dürüst kapsam notu:** 5 maddenin tümü ADR + e2e driver ile kayıt altına
> alındı, ama gerçek üretim ajan koşusuna (canlı LLM + gerçek GitHub repo +
> gerçek SWE-bench Verified kümesi) karşı doğrulanmadı — bkz.
> [`docs/roadmap-2026-pro.md`](docs/roadmap-2026-pro.md) Phase 3.5 ve her
> ADR'nin "Status" bölümü. Bu not bir bug değil, kasıtlı bir disiplindir
> (constitution kuralı §5: "self-improvement tekliftir, sessiz mutasyon değil").

---

## İçindekiler

1. [v1.0.0 Yenilikleri (Release Candidate)](#v100-yenilikleri-release-candidate)
2. [Durum](#durum)
3. [Kurulum](#kurulum)
4. [Hızlı başlangıç](#hızlı-başlangıç)
5. [Mimari özet](#mimari-özet)
6. [Workflow kataloğu](#workflow-kataloğu)
7. [Skill kataloğu](#skill-kataloğu)
8. [Agent adapter'ları](#agent-adapterları)
9. [Chat LLM desteği](#chat-llm-desteği)
10. [Anayasa (Constitution)](#anayasa-constitution)
11. [ADR özeti](#adr-özeti)
12. [Upstream kaynaklar](#upstream-kaynaklar)
13. [Üretim Dağıtımı (v1.0.0)](#üretim-dağıtımı-v100)
14. [Lisans](#lisans)
15. [Güvenlik](#güvenlik)

---

## Durum

**Faz:** **v1.0.0 Release Candidate** — pro-LLM denetiminin (2026-08-16)
5 maddelik eylem planı tamamlandı (bkz. [v1.0.0 Yenilikleri](#v100-yenilikleri-release-candidate)
ve [`docs/roadmap-2026-pro.md`](docs/roadmap-2026-pro.md)). Phase 0
(Araştırma + Mimari), Phase 1 (Şemalar) ve Phase 2 (Core MVP dikey dilim)
tamamlandı; Phase 3 (Docker sandbox + SWE-bench adapter) implement edildi;
Phase 3.5 (gerçek 10-instance SWE-bench Pass@1 + sandbox'ın her skill
shell-out'una bağlanması) bekliyor. Tüm aşama kırılımı için
[`docs/archive/implementation-roadmap.md`](docs/archive/implementation-roadmap.md).

| Alan | Tamamlandı | Hedef | Not |
|---|---|---|---|
| ADR (karar kayıtları) | **36 / 36** | 23 | [`DECISIONS.md`](DECISIONS.md); ADR-0030–0036 pro-LLM denetimi ürünü |
| Workflow (runnable `.sm.yaml`) | **15 / 15** | 14 | tamamı implement edildi |
| Skill (`SKILL.md`) | **35** | ~19–23 | long-term scope ADR-0016 |
| Agent adapter | **5** | 9 long-term | `claude-code`, `codex`, `chat`, `chat-sandbox`, `mcp` |
| Stack adapter | 1 (`discovery/cli`) | 11 long-term | placeholder `adapters/stacks/`; universal-ast detector 11 dili destekler (ADR-0033) |
| e2e driver | **26** (25 runnable + 1 narrative-only) | — | 1356 pass + 5 known-fail across 5 components (see `STATUS.md`, auto-generated via `npm run count-assertions`) |
| Anayasa kuralları | **8** | 8 | [`constitution/constitution.md`](constitution/constitution.md) |

**Tamamlanan önemli kilometre taşları** (detaylı liste [`STATUS.md`](STATUS.md)
ve [`DELIVERABLES.md`](DELIVERABLES.md)):

- Phase 0 araştırma + mimari + 16 ADR → commit `cc2d2db`; sonrasında canlı
  lisans doğrulama (6 gerçek hata düzeltildi).
- Phase 1 JSON Schema'ları: 8 Evidence entity, 4 Memory tipi, Project
  Intelligence (ADR-0015), Autonomy Policy (ADR-0014), `bug-report.sm.yaml`.
- Yönetişim katmanı: [`constitution/`](constitution/) gerçek içerikle yazıldı,
  kök [`agents/AGENTS.md`](agents/AGENTS.md) canonical entrypoint.
- `discovery/cli/` — gerçek Node.js/TypeScript CLI, 3 senaryoya karşı doğrulandı.
- 4 MVP skill + 3 tool-discipline skill + 5 workflow-driven skill + 2 meta
  skill + 3 yeni-workflow skill.
- `executor/` — gerçek Node.js/TypeScript motoru: state machine + question
  economy + safety gate + schema-validating evidence/memory store.
- 4 agent adapter (`claude-code`, `codex`, `chat`, `chat-sandbox`, `mcp`) ve
  `sync-entrypoints.ts` (ADR-0006, idempotent render).
- **Gerçek (scripted olmayan) e2e koşu**: `executor/examples/e2e-membership-bug/`
  içinde gerçek off-by-one hatası gerçek kodda teşhis edilip düzeltildi.
- **Chat LLM desteği** (ADR-0020/ADR-0023): pure-text chat + sandbox chat
  adapter'ları, `chat-harness.mjs` + `validate-chat-output.mjs` ile canlı
  çok-turlu oturum test altyapısı. Subagent-simülasyonlu koşu: 25/25 blok
  geçerli, terminal duruma ulaştı, karar PASS.

**Açık kalan iş** (üst üste öncelik sırasıyla, detay [`STATUS.md`](STATUS.md)):

- Gerçek (simülasyon olmayan) çok-turlu canlı chat LLM oturumu — altyapı hazır,
  sadece patron'un evinden bir ChatGPT/Claude/GLM oturumu gerekiyor.
- 0 kalan workflow (15/15 tamam): `discovery-refresh`, `user-complaint`, `security-problem`,
  `release`, `incident`, `unknown-failure` (fallback).
- Tüm çekirdek skill'ler yazıldı. Domain-özel (mobile, game-dev) ihtiyaç oldukça eklenebilir.
- Formal eval harness (Phase 8, Python, ADR-0017): mevcut e2e driver'lar
  proof-of-concept; `docs/evaluations/evaluation-strategy.md`'in ≥5-senaryo/
  skill ve ≥3-senaryo/workflow çıtası değil.

> **Yeni bir session'da projeye devam etmek için:** [`STATUS.md`](STATUS.md)
> baştan sona oku → [`DECISIONS.md`](DECISIONS.md) "neden"lerini anla →
> "Sequencing decision" sırasındaki bir sonraki işi al.

---

## Kurulum

AIECP, **npm workspaces** üzerinden 3 alt-paketi (`discovery/cli`, `executor`,
`adapters/agents`) tek komutla kurar, derler ve test eder:

```bash
npm run bootstrap   # npm install + build + test (3 paketin tamamı)
```

Bu komut şunları yapar:

1. `npm install` — kök `package.json`'daki 3 workspace'i kurar (ajv, ajv-formats
   dahil; `executor/`'un `evidence-store.ts`'i için gerekli).
2. `npm run build` — 3 paketi de TypeScript'ten derler:
   - `discovery/cli/dist/` (not: ADR-0021/ADR-0022 sonrası repoya commit
     edildi, böylece chat-sandbox ajanları offline olarak
     `node discovery/cli/dist/cli.js` çalıştırabilir; runtime npm bağımlılığı
     yok — ADR-0022).
   - `executor/dist/` (workflow motoru + evidence-store).
   - `adapters/agents/dist/` (4 adapter + `write-entrypoints` CLI).
3. `npm test` — 3 paketin self-test'ini çalıştırır (toplam 1356 assertion, 5 known-fail dahil — bkz. [`STATUS.md`](STATUS.md)).

Diğer kök script'leri ([`package.json`](package.json) içinde tam liste):

```bash
npm run build                 # 3 paketi derle, test etme
npm test                     # 3 self-test paketini çalıştır
npm run sync-entrypoints     # kök AGENTS.md + CLAUDE.md'yi canonical
                             # agents/AGENTS.md + skills/*/SKILL.md'den
                             # yeniden üret (ADR-0006, idempotent)

npm run e2e:membership-demo        # birinci e2e kanıt noktası (bug-report)
npm run e2e:feature-request-demo  # ikinci e2e (feature-request)
npm run e2e:code-review-demo       # gatekeeping workflow
npm run e2e:refactor-demo          # behavior-preserving (replay_comparison)
npm run e2e:change-request-demo    # behavior-modifying (iki Expected)
npm run e2e:project-onboarding-demo # discovery → memory yazımı
npm run e2e:regression-demo        # known-failure'a öncelikli bağlam
npm run e2e:performance-problem-demo # cost-shaped, baseline+profil
npm run e2e:chat-adapter-demo      # chat + chat-sandbox adapter kanıtı (58/58)

npm run validate:feature-request  # feature-request.sm.yaml yapısal doğrulayıcı
npm run validate:chat-output      # chat LLM metnindeki aiecp:* bloklarını şema-doğrula
npm run chat-harness -- <workflow> <response.md>
                                  # canlı chat LLM oturumunu gerçek
                                  # WorkflowRun API'sinde yürütür
```

---

## Hızlı başlangıç

### 1. Repo'yu kur

```bash
git clone <repo-url>
cd ai-engineering-control-plane
npm run bootstrap   # ~30sn, internet bağlantısı gerekli
```

### 2. Mevcut bir e2e driver'ı tekrarla (kanıt)

Her workflow için gerçek `WorkflowRun` API'sini yürüten bir driver script
vardır. Bir tanesini seç:

```bash
npm run e2e:membership-demo
# → gerçek toy Python repo, gerçek off-by-one hatası, gerçek fix,
#   8 evidence entity + 1 memory tipi üretilir, hepsi şema-geçerli,
#   safety gate gerçek bir onaysız apply-fix denemesini engeller,
#   terminal durum 'report' ulaşır.
```

Beklenen çıktı: `X/X assertions pass. VERDICT: PASS.`

### 3. Chat LLM desteğini test et (chat-harness)

Bir chat LLM'in (ChatGPT, Claude chat, GLM chat) metin yanıtını, AIECP
workflow'u boyunca yürütüp doğrula:

```bash
# Dosyadan:
npm run chat-harness -- bug-report scripts/test-responses/chat-llm-simulated-bug-report.md

# Stdin'den:
cat response.md | npm run chat-harness -- bug-report

# chat-sandbox adapter'ı için (gerçek dosya yazımı yapabilen LLM):
npm run chat-harness -- bug-report response.md --adapter chat-sandbox \
  --user-prompt "shipping.py'deki bug'ı düzelt"
```

`chat-harness.mjs` her `aiecp:*` bloğunu Phase 1 şemalarına karşı doğrular,
`WorkflowRun` state machine'i yürütür ve terminal duruma ulaşılıp
ulaşmadığını raporlar. Ayrıntı: [`scripts/chat-harness.mjs`](scripts/chat-harness.mjs)
ve [Chat LLM desteği](#chat-llm-desteği) bölümü.

### 4. Chat LLM yanıt formatını bağımsız doğrula

Bir chat LLM'in ürettiği metindeki `aiecp:evidence` / `aiecp:memory` /
`aiecp:advance` / `aiecp:question` / `aiecp:confirm` bloklarını şema-doğrula
(workflow yürütmeden, sadece format denetimi):

```bash
npm run validate:chat-output path/to/response.md
# veya:
cat response.md | npm run validate:chat-output
```

### 5. Kök AGENTS.md / CLAUDE.md'yi yeniden üret

[`agents/AGENTS.md`](agents/AGENTS.md) canonical kaynaktır. Kök düzeydeki
`AGENTS.md` ve `CLAUDE.md` **üretim çıktısıdır, elle düzenlenmez** (ADR-0006):

```bash
npm run sync-entrypoints   # idempotent — tekrar tekrar aynı byte-çıktı
```

---

## Mimari özet

AIECP, [`docs/architecture.md`](docs/architecture.md)'de tanımlanan 7 katmanlı
modeli şu **6 mantıksal gruba** sıkıştırır (governance en üstte, adapter'lar
en altta; her şey governance'a bağlıdır):

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Governance (Yönetişim)                                           │
│    constitution/ · anayasa 8 kural · autonomy-policy · ADR'ler     │
├─────────────────────────────────────────────────────────────────────┤
│ 2. Specification (Spesifikasyon) + Context                          │
│    specs/ (spec-kit ailesi + AIECP genişletmeleri) · context/      │
│    Project Intelligence (discovery çıktısı, kalıcı)                 │
├─────────────────────────────────────────────────────────────────────┤
│ 3. Skills + Workflows                                               │
│    skills/*/SKILL.md (Agent Skills standard, ADR-0001)             │
│    workflows/*.sm.yaml (state machine + question_economy + gates)   │
│    workflows/_router.md (intent → workflow deterministic eşleme)    │
├─────────────────────────────────────────────────────────────────────┤
│ 4. Evidence + Memory                                               │
│    evidence/schema/ (8 entity, ADR-0004) — JSON Schema sözleşmesi   │
│    memory/schemas/ (8 tip, ADR-0007) — yazılı, doğrulanmış, küçük   │
│    executor/src/evidence-store.ts — her yazımı şemaya karşı doğrular│
├─────────────────────────────────────────────────────────────────────┤
│ 5. Adapters                                                         │
│    adapters/agents/ (claude-code, codex, chat, chat-sandbox)       │
│    discovery/cli/ (Python+TypeScript dedektörleri)                  │
│    adapters/stacks/ (placeholder, 11 stack hedefi)                  │
├─────────────────────────────────────────────────────────────────────┤
│ + Evaluation (Phase 8) — Python eval harness (planlandı, ADR-0017) │
└─────────────────────────────────────────────────────────────────────┘
```

**5 soru bu framework'un varoluş sebebidir** — her workflow koşusu bu 5
soruya geri izlenebilir olmalıdır ([`constitution/constitution.md`](constitution/constitution.md) §1):

1. Ne olmalı? → **Specification**
2. Proje nedir? → **Context / Project Intelligence**
3. Gerçekte ne oldu? → **Evidence**
4. Ajan bir sonraki ne yapmalı? → **Workflows + Skills**
5. Doğru olduğunu nereden biliyoruz? → **Behavioral Verification** (ADR-0010)

**Mimari invariantlar** (tam liste [`docs/architecture.md`](docs/architecture.md)):

1. SPECIFICATION ⇏ IMPLEMENTATION ⇏ OBSERVATION ⇏ DIAGNOSIS ⇏ VERIFICATION
   **ayrı artefaktlardır** — aynı dosyada yaşayamaz, aynı prompt bölümünü
   paylaşamaz.
2. Kontrol düzlemi **ajan-bağımsızdır** — ajan-native kavramlar adapter'da yaşar.
3. Native entrypoint'ler **üretilir, elle düzenlenmez** (ADR-0006).
4. Skill'ler **Agent Skills standardında** olur (ADR-0001).
5. Evidence **anlamsal bir sözleşmedir**, dosya biçimi değil (ADR-0012).
6. Memory **türlü ve doğrulanmış** olur — serbest özet yasak (ADR-0007).
7. Self-improvement **anayasaldır** — framework değişikliği ADR gerektirir
   (ADR-0008).

---

## Workflow kataloğu

Aşağıdaki tablo, [`docs/workflow-model.md`](docs/workflow-model.md) ve
[`workflows/_router.md`](workflows/_router.md) kaynaklı **15 workflow'un** tamamı runnable `.sm.yaml` olarak yazıldı ve gerçek `WorkflowRun` API'sine karşı kanıtlandı (1356 assertion). Kullanıcı asla workflow seçmez; intent'i doğal dilde verir, router deterministic eşleme yapar.

| # | Workflow | Tetikleyici (intent sinyali) | Tip | Durum |
|---|---|---|---|---|
| 1 | [`bug-report`](workflows/bug-report.sm.yaml) | "X çalışmıyor", stack trace, hata | reactive | ✅ MVP |
| 2 | [`project-onboarding`](workflows/project-onboarding.sm.yaml) | `.aiecp/project-intelligence.json` yok | onboarding | ✅ MVP |
| 3 | [`feature-request`](workflows/feature-request.sm.yaml) | "şu özelliği ekle", yeni yetenek | constructive | ✅ MVP |
| 4 | [`change-request`](workflows/change-request.sm.yaml) | "X'in çalışma şeklini değiştir" | behavior-modifying | ✅ MVP |
| 5 | [`refactor`](workflows/refactor.sm.yaml) | "temizle", davranış değişikliği yok | behavior-preserving | ✅ MVP |
| 6 | [`code-review`](workflows/code-review.sm.yaml) | "bu PR'ı review et" | gatekeeping | ✅ MVP |
| 7 | [`regression`](workflows/regression.sm.yaml) | Bir `known-failure` semptomu tekrarladı | prior-context-aware | ✅ MVP |
| 8 | [`performance-problem`](workflows/performance-problem.sm.yaml) | "yavaş", gecikme/throughput şikayeti | cost-shaped | ✅ MVP |
| 9 | [`discovery-refresh`](workflows/discovery-refresh.sm.yaml) | yeşil alan projesi başlatma | constructive | ✅ MVP |
| 10 | [`user-complaint`](workflows/user-complaint.sm.yaml) | kullanıcı bir başkasına kayıtlı bug bildirdi | reactive | ✅ MVP |
| 11 | [`security-problem`](workflows/security-problem.sm.yaml) | güvenlik açığı, şüpheli erişim | security | ✅ MVP |
| 12 | [`release`](workflows/release.sm.yaml) | "bunu ship et", release kes | release engineering | ✅ MVP |
| 13 | [`incident`](workflows/incident.sm.yaml) | üretim alarmı, on-call page | incident response | ✅ MVP |
| 14 | [`unknown-failure`](workflows/unknown-failure.sm.yaml) | intent yukarıdakilerden hiçbiriyle güvenle eşleşmiyor | fallback (triage) | ✅ MVP |
| 15 | [`orchestrator`](workflows/orchestrator.sm.yaml) | çok-intentli istek: "X'i fix ET ve Y ekle" | multi-workflow chaining | ✅ MVP |

**Sınıflandırma yöntemi** (MVP): önce `.aiecp/project-intelligence.json` var mı
ve `stale: true` mi diye kontrol et → yoksa/te eskidse `project-onboarding`
önce. Sonra intent sinyalini yukarıdaki tabloya eşle, Project Intelligence'ı
corroborating kanıt olarak kullan. Güvenli eşleşme yoksa `unknown-failure`
(fallback) — asla sessizce tahmin etme.

Her MVP workflow'unun bir e2e driver kanıtı vardır:

| Workflow | Driver | Assertion |
|---|---|---|
| `bug-report` | `executor/examples/e2e-membership-bug/` | 20/20 |
| `feature-request` | `executor/examples/e2e-feature-request/` | 23/23 |
| `code-review` | `executor/examples/e2e-code-review/` | 30/30 |
| `refactor` | `executor/examples/e2e-refactor/` | 28/28 |
| `change-request` | `executor/examples/e2e-change-request/` | 28/28 |
| `project-onboarding` | `executor/examples/e2e-project-onboarding/` | 36/36 |
| `regression` | `executor/examples/e2e-regression/` | 43/43 |
| `performance-problem` | `executor/examples/e2e-performance-problem/` | 41/41 |
| chat adapter'ları | `executor/examples/e2e-chat-adapter/` | 58/58 |

---

## Skill kataloğu

Toplam **35 skill** gerçek `SKILL.md` + YAML frontmatter olarak yazıldı
(ADR-0001 Agent Skills standardı). Her skill somut prosedür, araç entegrasyonu,
doğrulama kriterleri ve hem happy-path hem failure-mode örneği içerir
([`CONTRIBUTING.md`](CONTRIBUTING.md) ve [`docs/evaluations/evaluation-strategy.md`](docs/evaluations/evaluation-strategy.md)
kalite çıtası).

### MVP skill'leri (ADR-0016, dikey dilim)

| Skill | İşlev |
|---|---|
| [`systematic-debugging`](skills/systematic-debugging/SKILL.md) | kanıt bul, üret, validated root cause'a teşhis et. `obra/superpowers` (MIT) uyarlaması; shell-level evidence, find-polluter, three-failure rule |
| [`evidence-engineering`](skills/evidence-engineering/SKILL.md) | Evidence Model entity'lerini doğru referans zinciriyle üret. AIECP-özgün |
| [`behavioral-verification`](skills/behavioral-verification/SKILL.md) | ADR-0010 ("no exception ≠ success")'ı `verify` durumunda operasyonelleştir |
| [`testing`](skills/testing/SKILL.md) | stack-native test disiplini → `behavioral-verification`'a girdi |

### Workflow-driven skill'ler (post-MVP)

| Skill | Sürdüğü workflow durumları |
|---|---|
| [`code-review`](skills/code-review/SKILL.md) | `understand-change` / `assess` / `review` |
| [`refactor`](skills/refactor/SKILL.md) | `capture-baseline` / `design-refactor` / `implement` / `verify-equivalence` (`Validation.method: "replay_comparison"`) |
| [`specification`](skills/specification/SKILL.md) | ADR-0002 (spec-kit ailesi); `design` / `design-change` durumları |
| [`implementation`](skills/implementation/SKILL.md) | AI-output validation pattern; her kod değişikliği `validated: false` `Decision`'dan başlar |
| [`documentation`](skills/documentation/SKILL.md) | `document` durumunda "decision trace raporla" kuralı |

### Meta skill'ler (çapraz-kesit, tek workflow'a bağlı değil)

| Skill | İşlev |
|---|---|
| [`behavioral-simulation`](skills/behavioral-simulation/SKILL.md) | plausibl kullanıcı etkileşim dizilerini simüle et; unit test'in kaçırdığı davranışsal bug'ları yakala. Chat LLM (`manual_review`) ve tool-using ajan (`app_validation`) için çalışır |
| [`diverse-thinking`](skills/diverse-thinking/SKILL.md) | takılında düşünce stili değiştir (first-principles, inverse, analogical, systems, lateral, adversarial, constraint-relaxation). 3+ reddedilen hipotez veya 10+ dk ilerlemesizlik sonrası tetiklenir |

### Tool-discipline skill'leri (ADR-0019 / constitution §8)

Anayasa §8'i operasyonelleştiren üç skill — araç kullanımı zorunlu, opsiyonel değil.

| Skill | İşlev |
|---|---|
| [`tool-use-discipline`](skills/tool-use-discipline/SKILL.md) | request-class → zorunlu-tool tablosu. Atlanan her araç için `Decision: tool_use_skipped, validated: false, result: rejected` üretilir |
| [`recency-verification`](skills/recency-verification/SKILL.md) | zaman-sensitif iddialar için 3-sınıflı taksonomi (static / slowly-evolving / time-sensitive). `web_search`'süz chat LLM'ler için `blocked`'e honest fallback |
| [`quality-gate`](skills/quality-gate/SKILL.md) | `implement` ↔ `verify` arası kod kalite kontrol noktası; 6-maddelik self-review + projenin kendi linter'ları |

### Domain/yeni-workflow skill'leri (D-sprint)

| Skill | Sürdüğü workflow |
|---|---|
| [`project-onboarding`](skills/project-onboarding/SKILL.md) | `run-discovery` / `validate-discovery` / `write-project-memory` / `write-environment-memory`. Tek başına `.aiecp/` artefaktlarını yazan workflow. Offline sandbox için `discovery-fallback.md` prosedürü içerir (ADR-0021) |
| [`regression`](skills/regression/SKILL.md) | `match-known-failure` / `identify-reintroduction` / `re-diagnose` / `re-fix` / `verify` / `update-known-failure`. `re-diagnose`'un `Decision.why` alanı önceki fix'in kör noktasını cite etmek zorunda |
| [`performance-problem`](skills/performance-problem/SKILL.md) | `capture-baseline` / `profile` / `diagnose-bottleneck` / `optimize` / `verify-improvement` / `regression-protect`. Dile göre profiler referansı (Node `--prof`, Python `cProfile`, Go `pprof`, Swift Instruments, Rust `cargo-flamegraph`) |

> **Dürüst kapsam notu:** bu skill'ler henüz gerçek ajan koşusuna karşı
> doğrulanmadı — eval senaryosu yok (Phase 8). Tasarım ve çapraz-referans
> yoluyla Phase 1 şemaları ve workflow `.sm.yaml` ile tutarlıdır, ama
> "doğru okunuyor" ile "ajan takip edince iddia edilen davranışı üretiyor"
> aynı şey değildir.

### Planlama skill'leri (SDLC gap closure)

`requirements-gathering → project-planning → architecture-design → ux-design`
sırasıyla çalışır — `orchestrator`'ın `classify-goal` state'i proje ölçeğine
(small/medium/large) göre bu zincirin ne kadarının çalışacağına karar verir.
Dosya sözleşmesi: her skill kendi `specs/*.md` dosyasını YAZAR, diğerleri
sadece OKUR (çakışma yok). `architecture-design` requirements ile çelişen bir
mimari kısıt bulursa `plan_revision_needed` ile `project-planning`'e geri
döner — max 3 tur, sonrasında `blocked` (ADR-0026, ADR-0027, ADR-0029'daki
Q1/Q2 takip notlarına bakın).

| Skill | İşlev |
|---|---|
| [`requirements-gathering`](skills/requirements-gathering/SKILL.md) | Kullanıcının fikrini netleştirici sorularla user stories (Given/When/Then) + MVP scope + persona + monetizasyon önerisine çevirir. `project-onboarding`'den farkı: o TEKNİK stack'i keşfeder, bu İNSAN niyetini. Yazar: `specs/requirements.md` |
| [`project-planning`](skills/project-planning/SKILL.md) | Requirements'ı fazlı plana çevirir: task breakdown, dependency graph, risk assessment. `specification`'dan farkı: o şablon SAĞLAR, bu şablonu İÇERİKLE doldurur. Yazar: `specs/plan.md` + `specs/tasks.md` |
| [`architecture-design`](skills/architecture-design/SKILL.md) | Tech stack seçer, sistem mimarisi/DB şema/API tasarlar. Requirements ile çelişirse `plan_revision_needed` tetikler. Yazar: `specs/contracts.md` + `specs/invariants.md` + `specs/architecture.md` |
| [`ux-design`](skills/ux-design/SKILL.md) | Wireframe, user flow, journey map, design system. `frontend`'den farkı: o KOD yazma disiplini, bu TASARIM kararı. Yazar: `specs/ux/` |

> Bu 4 skill de yukarıdaki dürüst-kapsam notuna tabidir: eval senaryosu
> henüz sadece `orchestrator` üzerinden dolaylı (bkz. `evaluations/scenarios/orchestrator.yaml`),
> kendi skill-tier senaryoları yok (ADR-0028, deferred).

Kalan ~2–6 skill (database, frontend, backend, mobile, security, release,
incident-response — projenin gerçek ihtiyacına göre seçilecek) uzun vadeli
kapsamdadır (ADR-0016), henüz başlanmadı.

---

## Agent adapter'ları

[`adapters/agents/`](adapters/agents/) — [`docs/portability.md`](docs/portability.md)'deki
adapter sözleşmesini uygular: her adapter kendi yeteneklerini (`capabilities()`)
beyan eder, framework tek-tip destek varsaymaz. **4 adapter** mevcut:

| Adapter | Yetenekler | Entrypoint | `translateObservation` | Not |
|---|---|---|---|---|
| [`claude-code`](adapters/agents/src/claude-code/adapter.ts) | `filesystem_read/write`, `shell_exec`, `test_runner`, tarayıcı, **tam** native Agent Skills | `CLAUDE.md` | gerçek (raw tool observation → şema-geçerli `Event`, secret redaction ile) | ADR-0006 idempotent render |
| [`codex`](adapters/agents/src/codex/adapter.ts) | `filesystem_read/write`, `shell_exec`, `test_runner`, **kısmi** native Agent Skills, tarayıcı yok | `AGENTS.md` (Codex native dosya adı) | gerçek (claude-code ile paylaşımlı `redact.ts`) | [`docs/portability.md`](docs/portability.md) matrix'i |
| [`chat`](adapters/agents/src/chat/adapter.ts) | hepsi `false` (pure-text LLM) | `CHAT-ENTRYPOINT.md` | no-op (throw) — chat LLM `Event`'leri doğrudan metin olarak üretir | ADR-0020; `requires_filesystem_write_capability`'de `blocked`'e geçer |
| [`chat-sandbox`](adapters/agents/src/chat-sandbox/adapter.ts) | `filesystem_read/write`, `shell_exec`, `test_runner`, `sandboxed_code_execution: true` (sandbox içinde) | `CHAT-ENTRYPOINT-SANDBOX.md` | **gerçek** (sandbox raw observation üretebilir) | ADR-0020; ChatGPT Code Interpreter / Claude code execution / Gemini code execution |

**Adatper seçimi (chat LLM'ler için):** [`CHAT-ENTRYPOINT.md`](CHAT-ENTRYPOINT.md)
"Step 0" self-identification checklist'i — chat LLM, kod çalıştırma aracı var mı
yok mu kendine dürüstçe sorar. Varsa `chat-sandbox`, yoksa `chat`. Emin
değilse `chat`'e düş (under-declare etmek, over-declare edip fix uydurmaktan
daha güvenli).

**Entrypoint üretimi:** kök [`AGENTS.md`](AGENTS.md) ve [`CLAUDE.md`](CLAUDE.md)
**üretilmiş dosyalardır, elle düzenlenmez** (ADR-0006). Canonical kaynak
[`agents/AGENTS.md`](agents/AGENTS.md) + tüm `skills/*/SKILL.md` frontmatter'ıdır.
`npm run sync-entrypoints` (veya `adapters/agents/dist/bin/write-entrypoints.ts`)
bunları tekrar üretir; idempotent kanıtlanmıştır (aynı girdiden byte-aynı çıktı).
Disk-yazan CLI wrapper'ı `adapters/agents/src/bin/write-entrypoints.ts`
`chat` ve `chat-sandbox` adapter'larını da destekler (opt-in; default
`claude-code` + `codex`).

Self-test: 27/27 assertion PASS (canonical source yükleme, render idempotency,
adapter başına gerçekten farklı capability beyanı, şema-geçerli `Event` üretimi,
`api_key` redaction doğrulaması).

---

## Chat LLM desteği

AIECP başlangıçta sadece CLI araç kullanan ajanlar (Claude Code, Codex) için
tasarlanmıştı. ADR-0020 + ADR-0023 sonrası **chat LLM'ler (ChatGPT, Claude
chat, Gemini chat, GLM chat) de birinci sınıf desteklenir** — iki kategoriye
ayrılmış: pure-text ve sandboxed-code-execution.

### 1. Orientation dosyaları (chat LLM'in okuduğu ilk dosyalar)

| Dosya | Hedef | Üreten adapter |
|---|---|---|
| [`CHAT-ENTRYPOINT.md`](CHAT-ENTRYPOINT.md) | pure-text chat LLM'ler | `chat` adapter'ının `renderEntrypoint()`'i |
| [`CHAT-ENTRYPOINT-SANDBOX.md`](CHAT-ENTRYPOINT-SANDBOX.md) | kod çalıştırabilen chat LLM'ler (ChatGPT Code Interpreter vb.) | `chat-sandbox` adapter'ının `renderEntrypoint()`'i |

[`CHAT-ENTRYPOINT.md`](CHAT-ENTRYPOINT.md) chat LLM'e şunları söyler:

- **30-saniyelik versiyon:** kod üreteci değil, senior principal mühendissin;
  fix önermeden önce kanıt bul; workflow'u yürü; araç kullanımı zorunlu (constitution §8);
  düştüğünde düşünce stili değiştir.
- **Step 0:** adapter'ını self-identify et (pure-text mi sandbox mı?).
- **Step 0.5:** `.aiecp/project-intelligence.json` var mı kontrol et — yoksa
  `project-onboarding` workflow'unu çalıştır (router'ın ilk kuralı).
- **İlk 5 eylem (zip-upload protokolü):** tarihi web tool'la doğrula →
  araç envanterini çıkar → constitution'ı oku → router'dan workflow seç →
  workflow durumlarını sırayla yürüt.
- **Metin tabanlı evidence protokolü:** chat LLM disk'e JSON yazamaz, ama
  yanıtında fenced `aiecp:*` blokları üretebilir. Her blok bir evidence entity.
  `aiecp:evidence`, `aiecp:memory`, `aiecp:advance`, `aiecp:question`,
  `aiecp:confirm`.

### 2. `validate-chat-output.mjs` — format doğrulayıcı

```bash
npm run validate:chat-output path/to/response.md
# veya:
cat response.md | npm run validate:chat-output
```

[`scripts/validate-chat-output.mjs`](scripts/validate-chat-output.mjs) bir chat
LLM'in metin yanıtındaki tüm `aiecp:*` bloklarını parse eder, her birini
Phase 1 JSON Schema'larına karşı doğrular. 5 ayrı hata sınıfını reddeder
(eksik required alan, yanlış enum değeri, bozuk JSON, bilinmeyen blok türü,
iç içe geçmiş hata). E2e driver: 32/32 assertion PASS (11 bloklu iyi-formed
yanıt kabul, 5 hata sınıfı reddet, stdin desteği).

### 3. `chat-harness.mjs` — canlı çok-turlu oturum testi

[`scripts/chat-harness.mjs`](scripts/chat-harness.mjs), bir chat LLM'in tüm
metin yanıtını gerçek `WorkflowRun` state machine'i üzerinden yürütür:

```bash
npm run chat-harness -- <workflow-name> <response-file>
# veya:
cat response.md | npm run chat-harness -- <workflow-name>

# chat-sandbox için (safety gate gerçek yetki sınırı, ADR-0023):
npm run chat-harness -- bug-report response.md \
  --adapter chat-sandbox \
  --user-prompt "shipping.py'deki bug'ı düzelt"
```

**Adapter-farklı safety gate davranışı (ADR-0023):**

- `chat` (pure-text): safety gate'leri **otomatik onayla** — pure-text LLM
  zaten dosya yazamadığı için `requires_filesystem_write_capability`'de
  `blocked`'e düşecek, gate moot.
- `chat-sandbox`: **otomatik onaylama** — chat-sandbox gerçekten dosya
  yazabiliyor (ADR-0020), bu yüzden safety gate gerçek bir yetki sınırı.
  Yetki iki mekanizmadan biriyle gelir:
  1. **`aiecp:confirm` bloğu** (yeni, ADR-0023): chat LLM yanıtında açık
     onay bloğu yayar. `gate` ve `reason` alanları opsiyonel.
  2. **`--user-prompt` argümanı**: harness kullanıcının chat LLM'e verdiği
     orijinal prompt'u okur, yetki anahtar kelimeleri arar (`fix`, `düzelt`,
     `apply`, `uygula`, `implement`, `refactor`, `migrate`, `optimize`,
     `change`, `modify`, `update`, `patch`, `edit`, `write`, vb.).
  Hiçbiri yoksa, safety-gated advance açık "nasıl yetki verilir" mesajıyla
  reddedilir.

**İlk kanıt (subagent-simülasyonlu):** temiz-başlangıç opus subagent'a AIECP
repo'su + bug-report task'ı verildi (`chat-harness.mjs` veya
`validate-chat-output.mjs`'i okuması açıkça yasaklandı). Subagent
[`CHAT-ENTRYPOINT.md`](CHAT-ENTRYPOINT.md)'in zip-upload protokolünü takip
etti: tarihi dürüstçe `recency_unverifiable` fallback'le doğruladı, araçları
envantere çıkardı, constitution §8'i okudu, workflow'u baştan sona yürüttü,
25 `aiecp:*` bloğu üretti. `chat-harness.mjs` sonucu: **25/25 blok OK,
terminal durum `blocked` (chat LLM `requires_filesystem_write_capability`
üzerinden doğru karar verdi), VERDICT: PASS.**

Bu test sırasında iki gerçek bug bulundu ve düzeltildi: (1) 6 kod-değiştiren
workflow'da `apply-fix → blocked on: requires_filesystem_write_capability`
geçişi eksikti — eklendi; (2) bootstrap tarih-doğrulama sorusu yanlışlıkla
`aiecp:question` bloğu olarak üretiliyordu, `question_economy.allowed_states`
ihlal ediyordu — [`CHAT-ENTRYPOINT.md`](CHAT-ENTRYPOINT.md) düzeltildi.

**Honest açık kalan iş:** gerçek (simülasyon olmayan) çok-turlu canlı chat LLM
oturumu — patron'un evinden ChatGPT/Claude/GLM ile bir test. Altyapı hazır,
sadece insan-döngü-içi bir test koşusu gerekiyor.

### 4. Toy test fixture'ı

[`executor/examples/toy-shipping-bug/`](executor/examples/toy-shipping-bug/) —
bilerek bug'lı `shipping.py` (`>` yerine `>=`) + 7 test'li `test_shipping.py`
(2'si bug düzelene dek fail eder). Bu fixture, chat-sandbox LLM'lerin gerçek
bir kaynak dosyada tam `bug-report` workflow'unu (`apply-fix` → `verify` →
`regression-protect` → `replay` → `report`) test edebilmesi için var. Lokal
doğrulama: `python3 -m pytest test_shipping.py -v` → fix öncesi 2 fail,
sonrası 7 pass.

---

## Anayasa (Constitution)

[`constitution/constitution.md`](constitution/constitution.md) framework'ün
yöneten belgesidir. Mimarinin 1. katmanı (Governance); skill'ler, workflow'lar,
evidence, memory — hepsi bu 8 kural altında çalışır. Değişiklik yeni ADR
gerektirir (ADR-0008) — hiçbir ajan (framework'ün kendi ajanları dahil) bu
dosyayı sessizce düzenleyemez.

| # | Kural | Öz |
|---|---|---|
| 1 | **5 soru** | Her workflow koşusu 5 soruya geri izlenebilir olmalı (Specification, Context, Evidence, Workflows+Skills, Behavioral Verification). Ajan her sorunun repository'de nerede cevaplandığını gösteremezse anayasayı izlemiyor demektir — kod tesadüfen çalışsa bile. |
| 2 | **Ayrılamaz ayrılıklar** | SPECIFICATION, IMPLEMENTATION, OBSERVATION, DIAGNOSIS, VERIFICATION ayrı artefaktlardır — aynı dosyada yaşayamaz. "No exception" asla "success" ile eşdeğer tutulmaz (ADR-0010). AI-önerisi bir değişiklik `validated: false` `Decision`'dır, bir `Validation` kabul edene dek. |
| 3 | **Otonomi sınırlı, implicit değil** | "Minimum kullanıcı müdahalesi" bir UX hedefidir, "ajan kendi kendine ne kadar yapabileceğine karar verir" demek değildir. Her proje `constitution/autonomy-policy.schema.json`'a (ADR-0014) uygun explicit otonomi politikası beyan eder. Yıkıcı işlem sınıfları (`docs/security-model.md`) her zaman kendi safety gate'ini gerektirir, en yüksek otonomi seviyesinde bile. |
| 4 | **Soru ekonomisi** | Ajan repository'yi inceleyerek cevaplayabileceği soruyu sormaz. Gerçekten kaçınılmazsa: gerekli, spesifik ve karar-değiştirici olmalı. Bir workflow'un `question_economy.max_questions` bütçesini aşmak anayasa ihlalidir. |
| 5 | **Self-improvement tekliftir, sessiz mutasyon değil** | Ajan bir skill/test/contract/schema'da eksiklik görürse *teklif* edebilir. Ama `constitution/`, `DECISIONS.md` veya şema dizinlerindeki hiçbir değişikliği ADR olmadan uygulayamaz. |
| 6 | **Yeniden icattan önce reuse** | Mevcut production-grade açık kaynak çözüm varsa, yeniden kod yazmadan önce adopt/integrate/adapt et (Phase 0 mandate). ADR-0018: izinli-lisanslı (MIT/Apache/BSD) kod attribution ile verbatim kopyalanabilir; kısıtlı/teyitsiz lisanslı kaynaklar paraphrase-only. |
| 7 | **Her "şu anki durum" iddiası doğrulanmalı** | Eğitim verisindeki bilgi lisanslar, dış proje durumları, "current" iddiaları için çürür. Ajan dış, değişebilir gerçekler hakkındaki önbilgilerini provisional olarak ele alıp search/fetch tool'larıyla doğrular. |
| 8 | **Araç kullanımı zorunludur, opsiyonel değil** | (ADR-0019) Ajan zaman-sensitif bir iddia öne sürmeden, kod üretmeden veya fix teklif etmeden önce mevcut araçlarını **çağırmak zorundadır**. Ajan'ın parametrik bilgisi doğrulanacak bir hipotezdir, asla ground truth değil. Üç skill operasyonelleştirir: `tool-use-discipline` (zorunlu-tool tablosu), `recency-verification` (zaman-sensitif iddialar), `quality-gate` (kod kalite checkpoint). Chat LLM'ler için honest fallback: `Decision: recency_unverifiable` üret ve `blocked`'e geç; bildiğini varsaymak bu kuralın önlediği failure mode'un ta kendisi. |

İlgili belgeler: [`constitution/engineering-principles.md`](constitution/engineering-principles.md)
(günlük mühendislik disiplini), [`constitution/safety-rules.md`](constitution/safety-rules.md)
(yıkıcı işlem sınıfları ve zorunlu gate'ler), [`constitution/change-policy.md`](constitution/change-policy.md)
(anayasanın kendisi nasıl değişir), [`constitution/autonomy-policy.schema.json`](constitution/autonomy-policy.schema.json)
(makine-check edilebilir otonomi konfigürasyonu).

---

## ADR özeti

[`DECISIONS.md`](DECISIONS.md) — her framework-seviyesi karar (özellikle
`constitution/`'ı etkileyenler) ADR olarak kaydedilir. Sessiz değişiklik
yasaktır (ADR-0008). Aşağıdaki tablo 36 ADR'nin kısa özetidir; tam gerekçe
için ilgili ADR başlığına bakın. ADR-0030–0036 pro-LLM denetiminin (2026-08-16)
5 maddelik eylem planı ürünüdür — bkz. [v1.0.0 Yenilikleri](#v100-yenilikleri-release-candidate).

| ADR | Başlık | Öz |
|---|---|---|
| 0001 | Agent Skills standardı | Skill'ler `SKILL.md` + frontmatter olarak yazılır; custom format yok |
| 0002 | spec-kit ailesi | `spec`/`plan`/`tasks`/`constitution` + AIECP genişletmeleri (`contracts`, `invariants`, `state-machines`) |
| 0003 | Runtime değil, kontrol düzlemi | AIECP runtime değil; OpenHands/Cline runtime. Ajan-taşınabilirlik için tarafsız |
| 0004 | Evidence Model sıfırdan | Upstream'de anlamsal evidence modeli yok; AIECP-özgün inşa edildi |
| 0005 | Tek ajan + workflow state machine | Multi-agent swarm değil; öngörülebilir + token-verimli |
| 0006 | Native entrypoint'ler üretilir | AGENTS/CLAUDE/.cursor/.windsurfrules/GEMINI/copilot-instructions `sync-entrypoints` ile üretilir, elle düzenlenmez |
| 0007 | Memory türlü + doğrulanmış + küçük | 8 memory tipi; serbest özet yasak |
| 0008 | Anayasal self-improvement | Framework değişiklikleri ADR olmadan uygulanamaz |
| 0009 | Dedektör-driven discovery | Dil/framework/build/test dedektörleri stable interface arkasında; if/else enumeration değil |
| 0010 | Behavioral Verification ≠ unit test | Geçen test suite = teknik success; verified success için davranışsal kontrat doğrulaması gerek |
| 0011 | Yıkıcı işlemlerde safety gate | Prod mutation, irreversible migration, credential access, broad refactor, security-sensitive change — her biri explicit onay veya ön-onaylı politika ister |
| 0012 | JSON default serialization, ama sözleşme şema | JSON Schema sözleşmedir; JSON default serileştirme; YAML/protobuf/msgpack adapter olabilir |
| 0013 | Lisans: MIT + NOTICE | MIT; `NOTICE` reuse edilen bileşenleri attribute eder |
| 0014 | Otonomi seviyeli + explicit politika | L0 Gözlem → L5 Otonom mühendislik (safety gate'lerle); per-project `autonomy` politikası |
| 0015 | Project Intelligence birinci sınıf artefakt | Discovery çıktısı kalıcı, versiyonlanmış proje modeli; her task'ta yeniden türetilmez |
| 0016 | MVP tek dikey dilim | 19-skill/14-workflow/11-stack/9-agent hedefinden önce tek dikey dilim (onboarding → bug-report → evidence → fix → verify → memory → report) uçtan uca kanıtlanacak |
| 0017 | Araç dili: Node/TS CLI, Python eval | `sync-entrypoints` + workflow executor + discovery orchestration Node.js/TypeScript (npm/npx üzerinden); eval harness (Phase 8) Python (SWE-bench/OpenHands Eval geleneği) |
| 0018 | İzinli-lisanslı kod verbatim reuse | MIT/Apache/BSD kaynaklar `NOTICE` attribution'ı ile verbatim kopyalanabilir; paraphrase zorunlu değil |
| 0019 | Araç kullanımı zorunlu | Ajan zaman-sensitif iddia/kod/fix öncesi mevcut araçlarını çağırmalı; parametrik bilgi hipotezdir ground truth değil. Constitution §8 |
| 0020 | Chat LLM iki kategori | `chat` (pure-text, tüm capability false) vs `chat-sandbox` (Code Interpreter'lı, sandbox içinde filesystem/shell/test_runner true). `AgentCapabilities`'e `sandboxed_code_execution` eklendi |
| 0021 | Discovery bir prosedür, bir tool değil | `discovery/cli/dist/` repoya commit edildi (chat-sandbox offline çalışsın); `skills/project-onboarding/discovery-fallback.md` metin prosedürü (Node.js runtime'ı olmayan ajanlar için) |
| 0022 | discovery/cli'da sıfır runtime npm bağımlılığı | `ajv`/`ajv-formats` runtime'dan çıkarıldı; yapısal kontrol yeterli. Tam şema doğrulaması `validate-discovery` durumunda (executor üzerinden). `check-discovery-freshness.mjs` executability check ekler |
| 0023 | chat-sandbox için safety gate yetkisi | `chat-harness.mjs` artık koşulsuz auto-confirm yapmaz. `chat` adapter auto-confirm (gate moot); `chat-sandbox` `aiecp:confirm` bloğu veya `--user-prompt` yetki anahtar kelimeleriyle yetki ister. `already-terminal` violation handling eklendi |
| 0024 | Memory/evidence `.aiecp/`'e kalıcı yazılır | `EvidenceStore` ve `MemoryStore` `mkdtempSync` yerine `.aiecp/evidence/` ve `.aiecp/memory/`'e yazar — önceki oturumların `known-failure` / `project` / `environment` kayıtları sonraki oturumda okunabilir (ADR-0007) |
| 0025 | AGENTS.md'de AIECP auto-activation hook | `scripts/init-aiecp.mjs`, `AGENTS.md`'ye "AIECP Auto-Activation" bölümü ekler; ajan `AGENTS.md`'yi okuyunca AIECP'yi otomatik devralır. `.aiecp/auto-activate.json` marker |
| 0026 | `Decision.what` kelime dağarcığı linter'i | `decision.schema.json`'a enum koymak yerine `evidence/vocabulary/decision-what.json` registry + `scripts/validate-what-vocabulary.mjs` linter (62/62). Tanınmayan `what` değeri için stderr WARNING — backwards-compatible |
| 0027 | `classify-goal` için misclassification detector | Orchestrator `report` durumunda gerçek iteration sayısı ile sınıflandırılan scale'i karşılaştırır; uyumsuzlukta `Validation: mismatch` yazar (small + 4 iterasyon → under_classified → inferred large). `executor/src/project-scale-classifier.ts` |
| 0028 | Skill-tier eval harness | 4 planlama skill'inin (`requirements-gathering`, `project-planning`, `architecture-design`, `ux-design`) dahili prosedürlerini workflow dışında direkt test eden harness. `executor/examples/e2e-skill-tier/` (35/35) |
| 0029 | STATUS.md assertion tablosu auto-generated | `npm run count-assertions -- --write` tabloyu `<!-- AUTO-GENERATED -->` marker'ları arasında yeniden üretir; `--check` CI'da stale tabloyu reddeder. 4 döngüde tekrarlayan el-drift'ini yapısal olarak önler |
| 0030 | OS-level sandbox: Docker kararı (impl Phase 3) | 2026 vm2/WASI CVE'leri nedeniyle WASI reddedildi; Docker `--read-only --cap-drop=ALL --network=none` ile çekirdek seviyesinde izolasyon. ADR-0035'te implement edildi |
| 0031 | SWE-bench adapter tasarımı (impl Phase 3) | SWE-bench'i reimplement etmek değil ADAPT etmek: instance JSON → AIECP scenario YAML. ADR-0036'da implement edildi |
| 0032 | JIT Context Injection | `executor/src/context-router.ts` her state için minimal bağlam paketi (~76 satır/state, %96 token tasarrufu). 119 assertion, 12 state |
| 0033 | Tree-sitter universal AST detector | 11 dil (Go, Rust, Java, C++, C, Kotlin, Swift, Ruby, PHP, Scala, Clojure) için vendored WASM; ADR-0022 zero-runtime-deps intact. 47 assertion |
| 0034 | Adaptif risk-based workflow routing | 5 seviyeli classifier (`trivial \| low \| medium \| high \| critical`); trivial → fast-path (FSM atlanır), critical → `human-approval-required` gate. FSM tanımları değişmedi. 53 assertion |
| 0035 | Phase 3 Docker sandbox implementation | `sandbox-runner.ts` Docker daemon varsa container, yoksa `execSync` (loud WARNING ile, asla sessizce unsafe'a düşmez). `WorkflowRunOptions.sandbox: true`. 25 assertion |
| 0036 | Phase 3 SWE-bench adapter implementation | `evaluations/swebench-adapter.py` instance JSON → scenario YAML; 1 sentetik örnek (`sympy-13031.json`). Gerçek 10-instance Pass@1 Phase 3.5'e ertelendi. 66 assertion |

---

## Upstream kaynaklar

Bu proje, aşağıdaki upstream projelerden desenleri uyarlar ve bazı durumlarda
(ADR-0018 sonrası, izinli-lisanslı kaynaklar için) attribution ile verbatim
kod/prose kopyalar. [`NOTICE`](NOTICE) her birinden tam olarak neyin, hangi
lisans altında reuse edildiğini listeler. Aşağıdaki liste, proje bir gün
kamuya açıldığında yan yana karşılaştırmanın bir sürpriz olmaması için burada
tutulur:

- https://github.com/obra/superpowers (MIT)
- https://github.com/github/spec-kit (MIT)
- https://github.com/bmad-code-org/BMAD-METHOD (MIT)
- https://github.com/OpenHands/OpenHands (MIT)
- https://github.com/anthropics/skills (mixed license — see [`NOTICE`](NOTICE))
- https://github.com/agentskills/agentskills (Apache-2.0 code / CC-BY-4.0 docs)
- https://github.com/vercel-labs/skills (license unverified — see [`NOTICE`](NOTICE))

`obra/superpowers@b36e0829` (MIT) için SHA pin'lenmiştir (A1 sprint, `systematic-debugging`
skill derinleştirmesi); bu, gelecekteki vendoring için kurulmuş desendir.
Diğer upstream repo'lar için tam commit SHA'ları henüz yakalanmadı ( verification
pass'ında `git clone`/`gh api` erişimi yoktu — bkz. [`STATUS.md`](STATUS.md)
"Known open questions"). `vercel-labs/skills` lisansı teyit edilmemiş; herhangi
bir reuse öncesi doğrulanmalı.

---



## Hızlı Başlatma (--yarat / --entegre)

### `--yarat [fikir]` — Sıfırdan proje oluştur

```
[repo linki veya zip] --yarat e-commerce API with Stripe
```

Sistem otomatik:
1. `project-scaffolding` → dizin, config, git
2. `project-onboarding` → discovery, memory
3. `orchestrator` → specification → implementation → testing → code-review → release

### `--entegre` — Mevcut projeye AIECP ekle

```
[repo linki veya zip] --entegre
```

Sistem: `init-aiecp.mjs` → discovery → kullanıcı devam eder.

### Komut yoksa

Agent kontrol eder: `.aiecp/project-intelligence.json` var mı?
- Var → AIECP kurulu, devam et
- Yok → sorar: "--yarat mı --entegre mi?"

## Yeni Eklenen Özellikler (2026 Entegrasyonu)

- **MCP adapter** — Model Context Protocol (Linux Foundation standardı, 10K+ server)
- **Orchestrator workflow** — Loop engineering (workflow zincirleme, otonom döngü)
- **Context engineering skill** — Uzun oturumlarda context sıkıştırma
- **Visual regression skill** — Playwright ekran görüntüsü karşılaştırma (Phaser/Electron için)
- **Self-healing skill** — Kırık selector otomatik onarımı (Playwright Healer)
- **Project scaffolding skill** — Sıfırdan proje dizin/config oluşturma
- **Memory persistence** — Evidence ve memory artık kalıcı (.aiecp/)
- **Auto-activation** — AGENTS.md'de otomatik AIECP hook
- **init-aiecp.mjs** — Tek komut kurulum: `npm run init`

---

## Üretim Dağıtımı (v1.0.0)

### 1. Global CLI kurulumu

```bash
npm install -g .
# → `aiecp` ve `init-aiecp` komutları PATH'e eklenir
aiecp --help                       # executor CLI (WorkflowRun, evidence-store, safety gate)
init-aiecp /path/to/project        # mevcut projeye AIECP bootstrapper (ADR-0025)
```

`init-aiecp` çalıştıktan sonra `.aiecp/` dizini oluşur; `AGENTS.md`'ye "AIECP
Auto-Activation" bölümü eklenir (ADR-0025) — ajan bir sonraki `AGENTS.md`
okumasında AIECP'yi otomatik devralır.

### 2. Docker sandbox imajı (ADR-0035)

LLM-emirli komutların OS seviyesinde izole çalışması için executor imajını
bir kez derleyin:

```bash
docker build -t aiecp-executor:latest -f sandbox/Dockerfile.aiecp-executor sandbox/
docker images | grep aiecp-executor   # imaj hazır mı doğrula
```

İmaj `node:20-alpine` + `python3` + `git` içerir; tüm hardening
(`--read-only --cap-drop=ALL --network=none`) `docker run` zamanında
`sandbox-runner.ts` tarafından zorlanır. Docker daemon yoksa runner
`execSync`'e düşer ve stderr + `SandboxResult.warning`'e loud uyarı yazar
(asla sessizce unsafe moda geçmez — ADR-0035).

### 3. CI/CD entegrasyonu

```bash
# .github/workflows/sandbox-ci.yml — Docker daemon'lı test job'u
#   (assertion-table-check.yml'den AYRI; sandbox/ yoluna path-filtered)
#   ubuntu-latest runner'ları Docker'ı built-in sunar — ek setup gerekmez.
```

`sandbox-ci.yml` iş akışı: 3 workspace'i build → `aiecp-executor` imajını
build → `e2e-sandbox` driver'ını çalıştır (gerçek Docker yolunu exerciser,
`sandboxed=true`) → `e2e-swebench-adapter` (regresyon kontrolü) → executor
self-test. Path filtreleri yalnızca `sandbox/**`,
`executor/src/sandbox-runner.ts`, `executor/examples/e2e-sandbox/**` ve
`.github/workflows/sandbox-ci.yml` dokunuşlarında tetikler.

### 4. SWE-bench adaptörü (ADR-0036)

Bir SWE-bench instance JSON'ını AIECP scenario YAML'ye çevir:

```bash
python3 evaluations/swebench-adapter.py evaluations/swebench-samples/sympy-13031.json
# → stdout: bug-report workflow'ünü drove eden scenario YAML

# Veya dosyaya yaz + eval_runner ile çalıştır:
python3 evaluations/swebench-adapter.py evaluations/swebench-samples/sympy-13031.json \
  --output scenario.yaml
python3 evaluations/eval_runner.py scenario.yaml
```

Gerçek 10-instance Pass@1 run için Docker + gerçek GitHub repo download'ları
gerekir — bkz. [`docs/roadmap-2026-pro.md`](docs/roadmap-2026-pro.md) Phase 3.5.

---

## Lisans

**MIT.** Bkz. [`LICENSE`](LICENSE). Upstream attributions için [`NOTICE`](NOTICE)
(ADR-0013).

---

## Güvenlik

- **Asla kimlik bilgisi (API anahtarı, token, parola, private key) commit
  etmeyin veya prompt'a/koda/dokümana yapıştırmayın.**
- Bir secret yanlışlıkla exposure olduysa (commit history, issue, chat log, CI
  log) kaynakta **hemen rotate/revoke** edin ve history'den temizleyin.
- `.aiecp/policy.local.yaml` (kullanılıyorsa) default olarak git-ignore edilidir
  çünkü lokal ön-onaylı, potansiyel olarak hassas otomasyon kapsamları içerebilir.

Tehdit modeli, yıkıcı işlem safety gate'leri, AI output doğrulaması, supply-chain
ve memory-poisoning mitigasyonları için [`SECURITY.md`](SECURITY.md) ve
[`docs/security-model.md`](docs/security-model.md). Safety gate politikasının
makine-check edilebilir kısmı [`constitution/autonomy-policy.schema.json`](constitution/autonomy-policy.schema.json)
(ADR-0011 + ADR-0014), yıkıcı işlem sınıfları [`constitution/safety-rules.md`](constitution/safety-rules.md).
