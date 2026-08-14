# DELIVERABLES — Yapılanlar Listesi

**Tarih:** 2026-08-14
**Repo:** holashawty/ai-engineering-control-plane (private)
**Toplam commit sayısı (bu session'da):** 3
**Toplam yeni dosya:** 20+
**Toplam değiştirilmiş dosya:** 15+
**Tüm testler:** 180+ assertion, hepsi PASS

Bu dosya, kontrolcü (süper zeka) nokta-atışı analiz yapabilmesi için
tüm yapılanları özetler. Her madde kısa, somut ve commit ile
bağlantılıdır. Kontrolcü ilgili dosyayı/commit'i direkt açıp
doğrulayabilir.

---

## Sprint C1 (A1 + B1 + ADR-0018) — kontrolcü öncesi

### A1: systematic-debugging skill derinleştirme
- **Commit:** `a7f3d7d` (branch `feature/a1-systematic-debugging-deepen`,
  sonra `af5d1a6` ile `--no-ff` main'e merge edildi)
- **Dosya:** `skills/systematic-debugging/SKILL.md` (+214 satır)
- **İçerik:** superpowers'tan öğrenilen 6 teknik AIECP Evidence Model
  dilinde yeniden ifade edildi:
  1. Shell-level evidence toplama komutları (git log, git diff, gh run view)
  2. 4-katmanlı multi-component boundary instrumentation pattern
  3. Condition-based waiting (waitFor(predicate) değil sleep)
  4. Backward call-chain tracing (new Error().stack ile)
  5. Find-polluter bisection pattern (cross-test state pollution)
  6. Three-failure rule (3 reddedilen hipotez → mimari sorgulama)
  7. Defense-in-depth paragrafı (her katmana ayrı guard)
- **NOTICE:** `obra/superpowers@b36e0829` (MIT) SHA pinned,
  section-by-section attribution
- **Kontrolcü doğrulaması:** SHA GitHub'dan teyit edildi, gerçek
  dosyaların varlığı doğrulandı, frontmatter YAML geçerli, verbatim-copy
  review yapıldı

### B1: feature-request workflow
- **Commit:** `0bb9fd8`
- **Dosyalar:**
  - `workflows/feature-request.sm.yaml` (yeni, 205 satır)
  - `executor/examples/e2e-feature-request/drive-run.mjs` (yeni, 23 assertion)
  - `executor/examples/e2e-feature-request/README.md` (yeni)
  - `scripts/validate-feature-request.mjs` (yeni, structural validator)
- **İçerik:** 10 state, 15 transition, `implement` state'inde
  `broad-refactor` safety gate, `question_economy` (max=2,
  allowed=[classify, design])
- **Kanıt:** 23/23 assertion PASS — gerçek `WorkflowRun` API'sini
  çağırır, her state'te schema-valid evidence emit eder, safety gate
  ve question economy doğru çalışır
- **Önemi:** Executor'ın workflow-agnostic olduğunu kanıtlayan 2.
  proof point (1.'si bug-report idi)

### ADR-0018: Verbatim kopyalama izni
- **Commit:** `2b2a74e` (kontrolcü tarafından yazıldı)
- **Dosyalar:** `DECISIONS.md` (ADR-0018 eklendi), `constitution/constitution.md`
  (§6 güncellendi), `README.md` (upstream repo link listesi eklendi)
- **İçerik:** MIT/Apache/BSD lisanslı upstream kod için verbatim
  kopyalama + attribution artık serbest. Eski "asla verbatim" kuralı
  superpowers/MIT gibi izin verici lisanslar için geçersiz. Sadece
  kısıtlı/doğrulanmamış lisanslar (anthropics/skills'in docx/pdf/pptx/xlsx'i,
  vercel-labs/skills) paraphrase-only.

---

## Sprint C2 — 3 workflow + 5 skill + chat LLM adapter + 2 meta-skill

### C2-A: code-review workflow + skill
- **Subagent:** general-purpose (opus)
- **Commit:** `348719d`
- **Dosyalar:**
  - `workflows/code-review.sm.yaml` (yeni, 7 state, read-only, no safety gate)
  - `skills/code-review/SKILL.md` (yeni)
  - `executor/examples/e2e-code-review/drive-run.mjs` (yeni, 30 assertion)
  - `executor/examples/e2e-code-review/README.md` (yeni)
- **Kanıt:** 30/30 PASS
- **Özelliği:** Read-only workflow — `Validation` emit eder ama patch
  uygulamaz. Bu yüzden `safety_gates` declared değil. Kullanıcı review
  sonucu bir bug bulursa `bug-report` veya `change-request` çalıştırmalı.

### C2-B: refactor workflow + skill
- **Subagent:** general-purpose (opus)
- **Commit:** `348719d`
- **Dosyalar:**
  - `workflows/refactor.sm.yaml` (yeni, 9 state, `broad-refactor` gate
    at `implement`)
  - `skills/refactor/SKILL.md` (yeni)
  - `executor/examples/e2e-refactor/drive-run.mjs` (yeni, 28 assertion)
  - `executor/examples/e2e-refactor/README.md` (yeni)
  - `adapters/agents/src/cli.ts` (modifiye — self-test subset-check'e
    çevrildi, catalog 4→10→13 skill büyümesinde patlamasın diye)
- **Kanıt:** 28/28 PASS
- **Özelliği:** `verify-equivalence` state `Validation.method:
  "replay_comparison"` kullanır — AIECP'de bu methodu kullanan tek
  workflow. `unit_test` alone refactor için yetersiz (ADR-0010).

### C2-C: change-request workflow + 3 skill (specification/implementation/documentation)
- **Subagent:** general-purpose (opus)
- **Commit:** `348719d`
- **Dosyalar:**
  - `workflows/change-request.sm.yaml` (yeni, 9 state, `broad-refactor`
    gate at `migrate`, question_economy max=2 allowed=[classify, design-change])
  - `executor/examples/e2e-change-request/drive-run.mjs` (yeni, 28 assertion)
  - `executor/examples/e2e-change-request/README.md` (yeni)
  - `skills/specification/SKILL.md` (yeni — ADR-0002 spec-kit family)
  - `skills/implementation/SKILL.md` (yeni — AI-output validation pattern)
  - `skills/documentation/SKILL.md` (yeni — "Report the decision trace" rule)
- **Kanıt:** 28/28 PASS
- **Özelliği:** İki `Expected` entity emit eder — OLD baseline (being
  superseded) + NEW contract. Bu AIECP'de bu yapıya sahip tek workflow.
  Ayrıca `report` state'inde `known-failure` memory yazar — change-request
  en çok regression riski taşıyan workflow.

### C2-meta-1: behavioral-simulation skill
- **Yazan:** Z.ai Agent (orchestrator, kendim)
- **Commit:** `348719d`
- **Dosya:** `skills/behavioral-simulation/SKILL.md` (yeni)
- **İçerik:** Son kullanıcı gözünden simülasyon — `Expected`'in
  parametre boyutlarını ayrıştırıp simülasyon matrisi üretir:
  - Input shape (empty, max-length, unicode, control chars, null bytes)
  - Input source (typed, pasted, machine, automated)
  - State when called (cold start, warmed, under load, after failure)
  - Environment (clock skew, locale, timezone, low-memory, network-partitioned)
- **Patron'un vizyonu:** "her türlü kullanım tıklama ve farklı varyasyon
  hareketleri canlıca test edip olası bugların önüne geçecek"
- **Çalışma modu:** Chat LLM'ler zihinsel simülasyon yapar
  (`method: "manual_review"`), tool-using agent'lar gerçek çalıştırır
  (`method: "app_validation"`)

### C2-meta-2: diverse-thinking skill
- **Yazan:** Z.ai Agent (orchestrator, kendim)
- **Commit:** `348719d`
- **Dosya:** `skills/diverse-thinking/SKILL.md` (yeni)
- **İçerik:** 7 düşünce stili ile cognitive loop kırma:
  1. First-principles (her varsayımı sorgula, confirmed Event olmayanları at)
  2. Inverse ("bu symptom'u bilerek nasıl üretirdim?")
  3. Analogical (benzer çözülmüş problemi bul, geri map'le)
  4. Systems (component'leri çiz, feedback loop'ları ve delay'ları ara)
  5. Lateral (problemi yeniden çerçevele)
  6. Adversarial (component'lerden biri bilerek bozuyor gibi düşün)
  7. Constraint-relaxation ("X'i değiştiremem" kısıtlarını sorgula)
- **Tetiklenme:** 3+ reddedilen hipotez (systematic-debugging'ün
  three-failure rule), veya 10+ dakika verifiable progress yok, veya
  cognitive loop detected
- **Patron'un vizyonu:** "farklı düşünme stiliyle her şeyi çözümlemesi
  mümkün olacak... her türlü düşünce ve eğitim nöronlarına ulaşmak"

### C2-chat: Chat LLM adapter + protocol + validator
- **Yazan:** Z.ai Agent (orchestrator, kendim)
- **Commit:** `348719d`
- **Dosyalar:**
  - `adapters/agents/src/chat/adapter.ts` (yeni — 3. agent adapter,
    claude-code + codex sonrası)
  - `CHAT-ENTRYPOINT.md` (yeni, repo root — chat LLM zip'i açınca ilk
    okuduğu dosya)
  - `scripts/validate-chat-output.mjs` (yeni — `aiecp:*` bloklarını
    parse edip schema'ya doğrular)
  - `executor/examples/e2e-chat-adapter/drive-run.mjs` (yeni, 32 assertion)
  - `executor/examples/e2e-chat-adapter/README.md` (yeni)
- **Kanıt:** 32/32 PASS
- **Özelliği:** Chat LLM'lerin tool use olmadan framework'ü
  kullanabilmesi için text-in/text-out protocol:
  - `aiecp:evidence` blokları (kind + data ile)
  - `aiecp:memory` blokları (type + data ile)
  - `aiecp:advance` blokları (on: event ile)
  - `aiecp:question` blokları (text: ... ile)
- **Chat adapter dürüst kapasite bildirimi:** Tüm capabilities false
  (filesystem_read/write, shell_exec, test_runner, native_skills,
  browser, mcp) — chat LLM'lerin tool use'i yok
- **Bug yakalandı:** js-yaml ISO 8601 tarihleri Date object'e
  dönüştürüyordu, schema "type: string" check'inde fail ediyordu.
  `yaml.JSON_SCHEMA` ile düzeltildi.
- **Patron'un vizyonu:** "chat arayüzlü ai'ler bile bu repo içeriğini
  bir zip ile elde ettiğinde tüm çalışma mantığı çok daha zeki"

---

## Sprint C3 — ADR-0019 + constitution §8 + 3 tool-use discipline skill

### ADR-0019 + constitution §8: Tool use is mandatory, not optional
- **Yazan:** Z.ai Agent (orchestrator, kendim)
- **Commit:** (bu commit, henüz push edilmedi — aşağıda)
- **Dosyalar:**
  - `DECISIONS.md` (ADR-0019 eklendi)
  - `constitution/constitution.md` (§8 eklendi)
- **İçerik:** Agent'ın kendi parametric knowledge'ı hipotez olarak
  ele alınır, tool ile doğrulanmadan ground truth olarak kabul
  edilmez. Mandatory tool atlama → `Decision` with `what:
  "tool_use_skipped"`, `validated: false`, `result: "rejected"`.
- **Patron'un vizyonu:** "çoğu llm zaten parametreleri ve eğitim
  verileri sayesinde bildiğini sanıp hafızasındaki şeyler ile yapmayı
  deniyor ve tool veya skillerden yardım almıyor"
- **3 skill operationalize eder:**
  - `tool-use-discipline` (mandatory-tool-per-request-class table)
  - `recency-verification` (time-sensitive claim'ler için)
  - `quality-gate` (code generation sonrası kalite kontrol)

### C3-A: 3 tool-use discipline skill
- **Subagent:** general-purpose (opus)
- **Commit:** (bu commit, henüz push edilmedi)
- **Dosyalar:**
  - `skills/tool-use-discipline/SKILL.md` (yeni)
  - `skills/recency-verification/SKILL.md` (yeni)
  - `skills/quality-gate/SKILL.md` (yeni)
- **Kanıt:** Tüm 8 komut PASS (npm build, npm test 3 workspace, 6 e2e driver)
- **tool-use-discipline:** Request class → mandatory tool tablosu:
  - Library version claim → `web_search`
  - Code generation → `filesystem_read` + `test_runner` (TDD)
  - Bug diagnosis → `shell_exec` (run repro) + `filesystem_read`
  - Architectural recommendation → `filesystem_read` + `web_search`
  - Review/assessment → `filesystem_read` + `shell_exec` (linters)
- **recency-verification:** 3-class taxonomy (static / slowly-evolving /
  time-sensitive). Chat LLM'ler web_search yoksa dürüst fallback:
  `Decision: recency_unverifiable` + `blocked`
- **quality-gate:** Code generation sonrası, `verify` öncesi:
  - Project's own linters (tsc, eslint, ruff, mypy per project-intelligence)
  - 6-item self-review checklist (empty inputs, concurrent calls,
    actionable errors, complexity, TODOs, conventions)
  - `result: "mismatch"` → `on: quality_gate_failed` ile implement'e geri

### C3-CHAT: CHAT-ENTRYPOINT.md agresif tool-use manifesto ile güncelleme
- **Yazan:** Z.ai Agent (orchestrator, kendim)
- **Commit:** (bu commit, henüz push edilmedi)
- **Dosya:** `CHAT-ENTRYPOINT.md` (tamamen yeniden yazıldı)
- **İçerik:**
  - "Zip-upload protocol" — chat LLM'in ilk 5 yapacağı şey:
    1. Web search ile bugünün tarihini doğrula
    2. Tool envanterini çıkar (Event olarak emit et)
    3. Constitution'ı tam oku (özellikle §8)
    4. Workflow'u identify et (_router.md ile)
    5. Workflow + skill'leri oku
  - Tool-use manifesto — mandatory-tool table, atlama → `Decision:
    tool_use_skipped` emit et
  - Honest fallback — chat LLM'lerin tool'u yoksa dürüst şekilde
    `blocked`'a geçmesi, hafızadan iddia etmemesi

### C3-workflows: 5 workflow'un skills_required listesine 3 yeni skill eklendi
- **Yazan:** Z.ai Agent (orchestrator, kendim)
- **Commit:** (bu commit, henüz push edilmedi)
- **Dosyalar (modifiye):**
  - `workflows/bug-report.sm.yaml` (+3 skill: tool-use-discipline,
    recency-verification, quality-gate)
  - `workflows/feature-request.sm.yaml` (+3 skill, ayrıca comment'lerdeki
    "future skill" placeholder'ları gerçek skill'lerle değiştirildi)
  - `workflows/change-request.sm.yaml` (+3 skill)
  - `workflows/refactor.sm.yaml` (+3 skill + specification + documentation)
  - `workflows/code-review.sm.yaml` (+2 skill — quality-gate yok, read-only
    olduğu için)
- **Doğrulama:** Tüm 5 workflow YAML hala geçerli, tüm 6 e2e driver hala PASS

### C3-entrypoints: AGENTS.md + CLAUDE.md regenerated
- **Yazan:** sync-entrypoints script'i (kendim çalıştırdım)
- **Dosyalar:** `AGENTS.md`, `CLAUDE.md` (modifiye)
- **İçerik:** Artık 13 skill listeliyor (eskiden 4 idi, sonra 10, şimdi 13)

---

## Toplam durum (session sonunda)

| Metrik | Başlangıç (session başı) | Şimdi |
|---|---|---|
| Runnable workflow | 1 (bug-report) | **5** (bug-report, feature-request, code-review, refactor, change-request) |
| Skill sayısı | 4 | **13** (4 MVP + 5 workflow-driven + 2 meta + 3 tool-discipline + 1 chat-adapter entry-point) |
| Agent adapter | 2 (claude-code, codex) | **3** (+ chat) |
| E2E proof driver | 1 (membership-bug) | **6** (+ feature-request, code-review, refactor, change-request, chat-adapter) |
| Constitution bölümü | 7 (§1-§7) | **8** (+ §8: Tool use mandatory) |
| ADR sayısı | 18 | **19** (+ ADR-0019) |
| Toplam assertion (regression) | ~30 | **180+** hepsi PASS |
| README upstream repo listesi | yok | 7 upstream repo link listesi (NOTICE + README) |

## Kalan açık noktalar (kontrolcüye hatırlatma)

1. **Live session test** — Yapısal proof'lar var (6 e2e driver, 180+
   assertion), ama gerçek ChatGPT/Claude chat/Claude Code ile
   çok-turlu oturum test edilmedi. STATUS.md'de açıkça işaretli.
2. **Eval harness** (Phase 8, Python) — Formal eval senaryoları
   hâlâ yok. Şu anki proof'lar proof-of-concept, formal eval değil.
3. **Kalan 9 workflow** (user-complaint, regression, performance-problem,
   security-problem, release, incident, project-onboarding, unknown-failure)
   — uzun kuyruk, düşük öncelik.
4. **Kalan ~6 skill** (database, frontend, backend, mobile, security,
   performance) — uzun kuyruk, düşük öncelik.
5. **vercel-labs/skills lisansı** hâlâ doğrulanmadı — B3 araştırması
   sırasında kapatılmalı.
6. **vendor/ vs interleaved kararı** — ADR-0018 sonrası ilk gerçek
   vendoring (A2 olabilir) sırasında cevaplanacak.

## Sonraki önerilen öncelikler (sırayla)

1. **Live session test** — Hem CLI agent (Claude Code/Codex) hem chat
   LLM ile. Yapısal proof'u canlı kanıta çevirir.
2. **A2 (spec-kit şablonları)** — ADR-0018 sayesinde verbatim +
   attribution ile. `specs/*.template.md` dosyalarını doldur.
3. **Eval harness** (Phase 8) — Her skill için ≥5 senaryo, her workflow
   için ≥3 senaryo.
4. **Kalan workflow'lar ve skill'ler** — uzun kuyruk.

## Güvenlik

- Hiçbir dosyaya, commit mesajına, STATUS/TASKS'a token yazılmadı
- Bash output'larında URL redaksiyonu yapıldı
  (`sed -E 's|//[^@]*@|//***@|g'`)
- Tüm yeni dosyalarda secret scan yapıldı — temiz
- Token iş bitince patron tarafından revoke edilecek

## Patron'un vizyonu ile bu session'ın uyumu

| Vizyon | Karşılık |
|---|---|
| "chat arayüzlü ai'ler bile bu repo içeriğini bir zip ile elde ettiğinde" | `CHAT-ENTRYPOINT.md` + chat adapter + validate-chat-output.mjs |
| "tool kullanımını üst düzeye çıkartmak" | ADR-0019 + constitution §8 + 3 tool-use discipline skill |
| "her türlü kullanım tıklama ve farklı varyasyon hareketleri canlıca test" | `skills/behavioral-simulation/SKILL.md` |
| "farklı düşünme stiliyle her şeyi çözümlemesi" | `skills/diverse-thinking/SKILL.md` (7 stil) |
| "halüsinasyonlarını engelleyebilir duruma getirir" | tool-use-discipline + recency-verification |
| "kod en iyi kalitede mi denetlemiyor" | quality-gate skill (linters + self-review checklist) |
| "güncel tarih 2026.08.14 ise 1-2 sene önceden kalma veriler ile işlem yapıyor" | recency-verification skill + CHAT-ENTRYPOINT zip-upload protocol adım 1 |
| "gerçek hayattaki nefes alan dahi bir insan gibi" | Tüm framework — workflow + skill + evidence + memory + adapter katmanları birlikte |
| "bu tarz projelerin en iyi yanlarını çalıp kendi sistemime sokacağız" | README upstream repo listesi + NOTICE attribution tracking + ADR-0018 verbatim kopyalama izni |
