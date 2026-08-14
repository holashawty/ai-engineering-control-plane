# AIECP — Sıradaki Faz Görev Listesi
**Oluşturulma tarihi:** 2026-08-14
**Repo:** holashawty/ai-engineering-control-plane (private)
**Son commit:** 587f16c

Bu liste, kullanıcının Z.ai'yi yönlendirmesi ve Claude'un (bu asistan)
sonuçları denetlemesi için hazırlanmıştır. Her görev şunları içerir:
**Kim yapmalı, Neden, Ön koşul, Kabul kriteri, Z.ai'ye verilecek prompt taslağı.**

---

## ⚠️ ÖNCE OKU: İş bölümü kuralı

Z.ai'nin GitHub API/repo klonlama erişimi **yok** (sadece web arama var:
Search / Advanced Search). Bu yüzden:

| İş türü | Kim yapar | Neden |
|---|---|---|
| Gerçek repo klonlama, kaynak kod inceleme, gerçek kod parçası alıntısı (vendoring) | **Claude (bu asistan)** | Sandbox'ta github.com/codeload.github.com erişimi var |
| Web araştırması, mimari/pattern özetleme, lisans/versiyon kontrolü | **Z.ai** | Search/Advanced Search bunun için yeterli |
| Doküman taslağı, skill/workflow içerik üretimi (kod değil, prosedür) | **Z.ai** (Claude denetler) | Metin üretimi, tokensız risk düşük |
| Kod yazma, test etme, şema tasarımı, mimari karar | **Claude** | Tutarlılık + DECISIONS.md senkronu gerektiriyor |
| npm build/test doğrulama, CI benzeri kontrol | **Claude** (bash_tool var) | Z.ai'de kod çalıştırma/doğrulama garantisi yok |

**Sonuç:** "Gerçek repolardan alıntı çekme" görevi bu listede **Claude'a
atanmıştır**, Z.ai'ye değil — Z.ai'ye bu görevi vermek çalışmaz.

---

## GRUP A — Gerçek Upstream Entegrasyonu (Claude yapacak)

### A1. superpowers'ı gerçekten klonla ve systematic-debugging'i zenginleştir
- **Ne:** `obra/superpowers` reposunu gerçekten clone et, `systematic-debugging`
  skill'inin (ve varsa `code-review`, `planning` gibi ilgili skill'lerin)
  gerçek `SKILL.md` içeriğini oku. Şu an bizim skill'imiz sadece
  *prosedür yapısını* adapte etmişti (kelime kelime kopya yok). Bu görevde
  gerçek dosyayı okuyup: (a) kaçırdığımız pratik detayları (örnek
  komutlar, hata senaryoları, kenar durumlar) bul, (b) bizim
  `evidence-engineering` ile uyumlu şekilde entegre et.
- **Ön koşul:** Yok, hemen başlanabilir.
- **Kabul kriteri:** `skills/systematic-debugging/SKILL.md` güncellenir,
  `NOTICE`'taki attribution genişletilir (hangi bölümün nereden
  geldiği net), gerçek commit SHA'sı kaydedilir.
- **Kim:** Claude.

### A2. spec-kit'in gerçek `specs/` şablonlarını incele ve uyarlayı derinleştir
- **Ne:** `github/spec-kit` reposunu clone et, gerçek
  `spec.md`/`plan.md`/`tasks.md`/`constitution.md` şablonlarını oku
  (şu an bizim `specs/` klasörü sadece placeholder). Bizim
  Specification layer'ımız (ADR-0002) için gerçek şablon içeriğini
  uyarla — `contracts.md`, `invariants.md`, `state-machines.md`
  eklentileriyle birlikte.
- **Ön koşul:** Yok.
- **Kabul kriteri:** `specs/spec.template.md`, `specs/plan.template.md`,
  `specs/tasks.template.md`, `specs/contracts.template.md`,
  `specs/invariants.template.md`, `specs/state-machines.template.md`
  gerçek içerikle doldurulur (artık placeholder değil). NOTICE
  güncellenir.
- **Kim:** Claude.

### A3. anthropics/skills'in gerçek `docx`/`pdf`/`pptx`/`xlsx` skill yapısını incele (lisans nedeniyle SADECE yapı, kopya değil)
- **Ne:** Bu repo mixed-license (bkz. NOTICE) — document skill'leri
  source-available, kopyalanamaz. Ama **yapısını** (nasıl progressive
  disclosure yaptıkları, `reference/` klasör kullanımı) inceleyip
  bizim `skills/` klasör konvansiyonumuzu iyileştirebiliriz — kod
  kopyalamadan.
- **Ön koşul:** Yok.
- **Kabul kriteri:** `skills/README.md`'ye "skill authoring
  conventions" bölümü eklenir (öğrenilen kalıplar, lisans notuyla).
- **Kim:** Claude.

### A4. OpenHands'in event-stream şemasını incele, bizim Trace/Event modeliyle karşılaştır
- **Ne:** `OpenHands/OpenHands` reposunda `openhands/events/` klasörünü
  (veya güncel karşılığını) clone edip incele. Bizim
  `evidence/schema/trace.schema.json` + `event.schema.json` ile
  karşılaştır — eksik alan var mı, onların action/observation
  ayrımından öğrenecek bir şey var mı?
- **Ön koşul:** A1-A3 sonrası (öncelik daha düşük, evidence modeli zaten
  gerçek bir bug'da kanıtlandı).
- **Kabul kriteri:** `docs/evidence-model.md`'ye "OpenHands comparison"
  notu eklenir; eğer gerçek bir iyileştirme bulunursa yeni bir alan
  şema versiyonuna eklenir (schema_version bump + ADR).
- **Kim:** Claude.

---

## GRUP B — Z.ai'ye Verilebilecek Araştırma/İçerik Görevleri

### B1. Kalan 13 workflow için `.sm.yaml` taslakları (içerik üretimi)
- **Ne:** `workflows/_router.md`'de "Planned" olarak işaretli 13
  workflow (`project-onboarding`, `feature-request`, `change-request`,
  `user-complaint`, `regression`, `refactor`, `code-review`,
  `performance-problem`, `security-problem`, `release`, `incident`,
  `unknown-failure`, `new-project`) için `workflows/bug-report.sm.yaml`
  ile **aynı formatta** taslak state machine'ler yaz.
- **Ön koşul:** Yok — `bug-report.sm.yaml` zaten örnek olarak var,
  format biliniyor.
- **Z.ai'ye verilecek prompt (örnek, `feature-request` için):**
  ```
  GÖREV: workflows/feature-request.sm.yaml taslağı yaz

  Referans dosya: workflows/bug-report.sm.yaml (bu formatı BİREBİR takip et:
  workflow, schema_version, description, states, initial_state,
  terminal_states, transitions, state_detail, skills_required,
  capabilities_required, safety_gates, question_economy alanları)

  Workflow: feature-request
  Tetikleyici: kullanıcı "şu özelliği ekle" / "kullanıcılar X yapabilsin"
  gibi yeni bir capability istediğinde.

  Önerilen state akışı (değiştirebilirsin, ama mantıklı bir sıra olsun):
  intake -> classify -> understand-existing-behavior -> design ->
  implement -> test -> verify -> document -> report

  Kısıtlar:
  - Sadece YAML üret, kod yazma.
  - safety_gates: implement state'i "broad-refactor" gate'i alsın (bug-report'taki
    propose-fix ile aynı mantık).
  - question_economy: max_questions: 2, allowed_states: [classify, design]
    (feature request'lerde tasarım kararları gerektiği için bug-report'tan
    1 fazla soru mantıklı).
  - Her state_detail girdisine "purpose" ve "emits_evidence" ekle.

  ÇIKTI: sadece YAML kod bloğu, açıklama metni yok.
  ```
- **Kabul kriteri (Claude denetler):** YAML syntax geçerli (Claude
  `python3 -c "import yaml..."` ile doğrular), state/transition
  tutarlılığı var (dead-end yok, tüm terminal_states states içinde),
  mevcut executor'ın (`executor/src/state-machine.ts`) hiçbir değişiklik
  gerektirmeden bu yeni workflow'u çalıştırabilmesi gerekir (executor
  zaten workflow-agnostic tasarlandı — bunu ilk gerçek testle
  kanıtlayacağız).
- **Kim:** Z.ai üretir, Claude doğrulayıp commit/push eder.

### B2. Kalan ~15 skill için `SKILL.md` taslakları
- **Ne:** `database`, `frontend`, `backend`, `mobile`, `security`,
  `performance`, `code-review`, `release`, `incident-response` vb.
  skill'ler için taslak yaz.
- **Ön koşul:** B1'deki ilgili workflow'lar tanımlanmış olmalı (bir
  skill hangi workflow'un hangi state'inde kullanılacağını bilmeli).
- **Z.ai'ye verilecek prompt (örnek, `code-review` için):**
  ```
  GÖREV: skills/code-review/SKILL.md taslağı yaz

  Referans dosyalar (bu 4 dosyanın formatını BİREBİR takip et):
  - skills/systematic-debugging/SKILL.md
  - skills/behavioral-verification/SKILL.md

  Format: YAML frontmatter (name, description, license, allowed-tools)
  + şu bölümler: "When to use this skill", "Procedure" (numaralı adımlar),
  "Tool integration", "Validation", "Examples" (happy-path + failure-mode).

  Skill: code-review
  Amaç: workflows/code-review.sm.yaml (varsa referans al) akışında,
  bir PR/diff'in constitution/engineering-principles.md prensiplerine
  uyup uymadığını kontrol etmek.

  Kısıtlar:
  - Gerçek dosya yollarına referans ver (docs/evidence-model.md,
    constitution/constitution.md gibi) — uydurma dosya adı kullanma.
  - "Novel to AIECP" mi yoksa bir upstream'den adapte mi olduğunu
    belirtme YAPMA — bu kararı Claude verecek (attribution gerektirebilir).
  - En az 1 happy-path, 1 failure-mode örneği yaz.

  ÇIKTI: sadece SKILL.md içeriği (frontmatter dahil), açıklama metni yok.
  ```
- **Kabul kriteri:** Frontmatter parse edilebilir YAML (Claude
  doğrular), gerçek dosya referansları var (uydurma yol yok), örnekler
  somut.
- **Kim:** Z.ai üretir, Claude denetler + NOTICE gerekiyorsa ekler + commit/push.

### B3. Diğer upstream repoların (yeni bulunan) araştırılması
- **Ne:** İlk araştırmada (`docs/research.md`) incelenen 7 repo dışında,
  o zamandan beri çıkmış olabilecek yeni/daha iyi alternatifleri
  Z.ai'nin Advanced Search'üyle taraması.
- **Z.ai'ye verilecek prompt:**
  ```
  GÖREV: AI coding agent framework / spec-driven development /
  agent skills ekosisteminde 2026 ortası itibariyle yeni öne çıkan
  projeleri araştır.

  Zaten incelenenler (bunları TEKRAR arama): obra/superpowers,
  github/spec-kit, bmad-code-org/BMAD-METHOD, OpenHands/OpenHands,
  anthropics/skills, agentskills/agentskills, vercel-labs/skills.

  Şunlara odaklan:
  - Evidence-based debugging / behavioral verification yapan yeni
    araçlar var mı? (Bizim en özgün katmanımız bu, rakip çıkarsa
    kritik.)
  - AGENTS.md / Agent Skills standardını genişleten yeni projeler.
  - Workflow state-machine tabanlı agent orchestration yapan yeni
    açık kaynak projeler.

  Her bulduğun proje için: isim, ne yaptığı, GitHub yıldız sayısı
  (referans için, TEK kriter olarak kullanma), lisans (arama sonucundan
  görebildiğin kadarıyla, "confirmed" değil "sources suggest" de),
  bizim projeyle çakışan/tamamlayan yönü.

  ÇIKTI: madde madde liste, her biri 3-4 cümle. Spekülasyon yapma,
  emin olmadığın yerde "doğrulanmadı" de.
  ```
- **Kabul kriteri:** Claude bulunan adayları `docs/research.md`'ye
  "Post-Phase-0 additions" bölümü olarak ekler, gerçekten değerliyse
  Grup A'ya yeni bir görev (gerçek clone) olarak açar.
- **Kim:** Z.ai araştırır, Claude değerlendirip entegre eder.

### B4. `docs/` içindeki eski/placeholder bölümlerin taranması
- **Ne:** Şu an `discovery/heuristics/`, `evaluations/skill-evals/`,
  `evaluations/workflow-evals/`, `evaluations/compatibility-tests/`,
  `evaluations/regression-cases/`, `tests/unit/`, `tests/integration/`,
  `tests/fixtures/` klasörleri Phase 0'dan beri boş/placeholder.
  Z.ai bunların her biri için "bu klasörde ne olmalı" içerik taslağı
  yazabilir (Phase 8 — Evaluation'a hazırlık).
- **Ön koşul:** B1 ve B2 kısmen tamamlanmış olmalı (test edilecek
  workflow/skill olmadan eval stratejisi yazmak soyut kalır).
- **Kabul kriteri:** `docs/evaluations/evaluation-strategy.md`'deki
  "Minimum bars" bölümüne uygun, somut örnek senaryo taslakları.
- **Kim:** Z.ai taslak yazar, Claude denetler.

---

## GRUP C — Claude'un Yapması Gereken Doğrulama/Entegrasyon İşleri

### C1. Z.ai'nin ürettiği her workflow/skill'i gerçek executor'la test et
- **Ne:** B1'de üretilen her yeni `.sm.yaml` için,
  `executor/src/workflow-loader.ts`'in `StateMachine.validateDefinition()`
  fonksiyonundan gerçekten geçirmek (dead-end state, dangling transition
  kontrolü). İdeal olarak her yeni workflow için de
  `executor/examples/` altında küçük bir gerçek senaryo (membership-bug
  örneğindeki gibi, ama daha kısa) yazıp çalıştırmak.
- **Kabul kriteri:** Her yeni workflow gerçekten `node dist/cli.js` ile
  yüklenip yapısal doğrulamadan geçer; en az 1 tanesi (öncelik: en
  sık kullanılacak olan, muhtemelen `feature-request`) tam bir
  self-test senaryosuyla kanıtlanır.
- **Kim:** Claude.

### C2. STATUS.md'yi her görev tamamlandığında güncelle
- **Ne:** Bu listedeki her madde bittiğinde `STATUS.md`'ye satır eklenir
  (mevcut format: Done / In progress / Not started).
- **Kim:** Claude (Z.ai'nin çıktısını commit ederken aynı commit'te).

### C3. NOTICE dosyasını her yeni adaptasyonda güncel tut
- **Ne:** A1-A4'te yapılan her gerçek upstream entegrasyonu NOTICE'a
  işlenir (hangi dosya, hangi upstream, hangi lisans, hangi commit SHA).
- **Kim:** Claude.

---

## Öncelik sırası (önerilen)

1. **A1** (superpowers derinleştirme) — en yüksek değer/efor oranı,
   zaten kanıtlanmış tek skill'i güçlendiriyor.
2. **B1** (2-3 yeni workflow taslağı, öncelik: `feature-request`,
   `code-review`, `refactor`) — executor'ın gerçekten workflow-agnostik
   olduğunu kanıtlamak için en kritik iş.
3. **C1** (yeni workflow'ları gerçek executor'la test etme) — B1 ile
   birlikte gider.
4. **A2** (spec-kit şablonları) — Specification layer'ı şu an en zayıf
   halka.
5. **B2** (yeni skill'ler, B1'deki workflow'larla eşleşenler öncelikli).
6. **A3, A4, B3, B4** — arka planda, düşük öncelik.

## Bu listenin kullanımı

- Kullanıcı, Grup B görevlerini yukarıdaki prompt taslaklarıyla (veya
  kendi düzenlemesiyle) Z.ai'ye verir.
- Z.ai'nin çıktısını bu konuşmaya yapıştırır.
- Claude çıktıyı denetler (format, tutarlılık, gerçek dosya referansları,
  şema uyumu), gerekiyorsa düzeltir, test eder, commit/push yapar.
- Grup A ve C görevleri doğrudan Claude'a "şunu yap" denilerek verilir.
- Her tamamlanan görev sonrası bu dosya (veya STATUS.md) güncellenip
  yeni öncelik sırası belirlenir.
