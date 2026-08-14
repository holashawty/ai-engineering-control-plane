# AIECP — Sıradaki Faz Görev Listesi
**Oluşturulma tarihi:** 2026-08-14 (revize: aynı gün, iş bölümü düzeltmesi)
**Repo:** holashawty/ai-engineering-control-plane (private)
**Son commit:** eed6869

Bu liste, kullanıcının Z.ai'yi (chat + cloud agent) yönlendirmesi ve
Claude'un (bu asistan) **kod/proje kontrolcüsü ve planlayıcı** olarak
çalışması için hazırlanmıştır.

---

## İş bölümü (düzeltilmiş)

| Araç | Yetenek | Bu listede kullanılacağı yer |
|---|---|---|
| **Z.ai Agent** (siteki agent bölümü, kendi bulut bilgisayarı) | Repo klonlama, dosya okuma/yazma, kod çalıştırma, test, commit/push — tam bir geliştirme ortamı | Grup A (gerçek upstream entegrasyonu) + Grup B (içerik üretimi) + kod yazma gerektiren her şey |
| **Z.ai Chat** (deep research / max thinking mode) | Web araştırması, derin analiz, karşılaştırma | Grup B'deki saf araştırma alt-görevleri (B3, B4) |
| **Claude (ben)** | Kod/proje denetimi, mimari tutarlılık kontrolü, plan güncelleme | **Kontrolcü + planlayıcı.** Z.ai'nin çıktısını denetler: doğru mu, eksik mi, DECISIONS.md/şemalarla tutarlı mı, güvenlik açığı var mı. Gerekirse düzeltme talimatı yazar. Yeni görev tanımlar. |

**Önceki hata:** Bir önceki TASKS.md sürümünde Grup A'yı ("gerçek repo
klonlama gerektiren işler") yanlışlıkla sadece Claude'a atamıştım,
Z.ai'nin chat modunun repo erişimi olmadığını Z.ai'nin *hiçbir*
modunun repo erişimi olmadığı şeklinde genellemiştim. Bu yanlıştı —
Z.ai Agent (bulut bilgisayar) tam donanımlı bir geliştirme ortamı.
Düzeltildi.

**Claude'un yeni rolü net olsun diye:** Aşağıdaki görevlerin hiçbirini
"ben yapayım" diye üstlenmeyeceğim. Z.ai Agent'a görev olarak
verilecekler, ben sonucu inceleyip onaylayacağım/reddedeceğim/
düzeltme isteyeceğim.

---

## GRUP A — Gerçek Upstream Entegrasyonu (Z.ai Agent yapacak, Claude denetler)

### A1. superpowers'ı gerçekten klonla ve systematic-debugging'i zenginleştir
- **Ne:** `obra/superpowers` reposunu gerçekten clone et, `systematic-debugging`
  skill'inin (ve varsa `code-review`, `planning` gibi ilgili skill'lerin)
  gerçek `SKILL.md` içeriğini oku. Şu an bizim skill'imiz sadece
  *prosedür yapısını* adapte etmişti (kelime kelime kopya yok). Kaçırılan
  pratik detayları (örnek komutlar, hata senaryoları, kenar durumlar)
  bul ve bizim `evidence-engineering` ile uyumlu şekilde entegre et.
- **Z.ai Agent'a verilecek prompt:**
  ```
  GÖREV: obra/superpowers reposunu klonla, systematic-debugging skill'ini
  incele, bizim skills/systematic-debugging/SKILL.md dosyamızı zenginleştir.

  1. git clone https://github.com/obra/superpowers
  2. systematic-debugging (ve varsa code-review, planning) skill
     dosyalarını oku.
  3. Bizim repomuzu (holashawty/ai-engineering-control-plane) clone et,
     skills/systematic-debugging/SKILL.md dosyasını oku — mevcut yapıyı
     KORU (frontmatter, bölüm başlıkları aynı kalsın).
  4. superpowers'tan öğrendiğin pratik detayları (somut komut örnekleri,
     kenar durum senaryoları, hata yakalama teknikleri) bizim dosyaya
     KENDİ CÜMLELERİNLE ekle — asla verbatim kopyalama, MIT lisansı
     attribution gerektiriyor ama yine de yeniden yazılmalı.
  5. NOTICE dosyasındaki "Actual adaptations" bölümünü güncelle: hangi
     ek bölümün superpowers'tan hangi commit SHA'sından geldiğini yaz.
  6. Değişikliği commit et, ama PUSH ETME — Claude'un denetlemesi için
     bir branch'te (örn. feature/a1-systematic-debugging-deepen) bırak
     ve bana diff'i göster.
  ```
- **Kabul kriteri (Claude denetler):** Verbatim kopya yok (metni
  karşılaştırıp kontrol edeceğim), NOTICE doğru güncellenmiş, gerçek
  commit SHA'sı var, mevcut frontmatter/format bozulmamış.

### A2. spec-kit'in gerçek `specs/` şablonlarını incele ve uyarlamayı derinleştir
- **Ne:** `github/spec-kit` reposunu clone et, gerçek
  `spec.md`/`plan.md`/`tasks.md`/`constitution.md` şablonlarını oku
  (şu an bizim `specs/` klasörü sadece placeholder). Bizim
  Specification layer'ımız (ADR-0002) için gerçek şablon içeriğini
  uyarla — `contracts.md`, `invariants.md`, `state-machines.md`
  eklentileriyle birlikte.
- **Z.ai Agent'a verilecek prompt:** (A1 ile aynı kalıp — clone, oku,
  bizim repoyu clone et, `specs/*.template.md` dosyalarını doldur,
  NOTICE güncelle, branch'te bırak, push etme.)
- **Kabul kriteri:** `specs/spec.template.md` vb. artık placeholder
  değil, gerçek, kullanılabilir şablon içeriği var; NOTICE güncel.

### A3. anthropics/skills'in klasör yapısını incele (lisans nedeniyle SADECE yapı, kopya değil)
- **Ne:** Bu repo mixed-license (bkz. NOTICE) — document skill'leri
  source-available, kopyalanamaz. Yapısını (progressive disclosure,
  `reference/` klasör kullanımı) inceleyip bizim `skills/` klasör
  konvansiyonumuzu iyileştir.
- **Z.ai Agent'a verilecek prompt:** Clone et, yapıyı incele, **hiçbir
  içerik kopyalamadan** `skills/README.md`'ye "skill authoring
  conventions" bölümü ekle.
- **Kabul kriteri:** Kod/metin kopyası yok (lisans ihlali riski sıfır
  olmalı — Claude bunu özellikle kontrol edecek), sadece yapısal öğrenim.

### A4. OpenHands'in event-stream şemasını incele, bizim Trace/Event modeliyle karşılaştır
- **Ne:** `OpenHands/OpenHands` reposunda event/observation şemasını
  incele, bizim `evidence/schema/trace.schema.json` +
  `event.schema.json` ile karşılaştır.
- **Kabul kriteri:** `docs/evidence-model.md`'ye karşılaştırma notu
  eklenir; gerçek iyileştirme varsa yeni ADR + schema_version bump
  önerisiyle Claude'a sunulur (Claude onaylamadan şema değişmez —
  ADR-0008 gereği).

---

## GRUP B — Z.ai (Agent veya Chat/deep research) İçerik Üretimi

### B1. Kalan 13 workflow için `.sm.yaml` taslakları
- **Ne:** `workflows/_router.md`'de "Planned" işaretli 13 workflow için
  `workflows/bug-report.sm.yaml` formatında taslak yaz.
- **Nerede:** Z.ai Agent (repoyu görüp format tutarlılığını kendi
  kontrol edebilir) tercih edilir, ama Chat modunda da (referans
  dosya yapıştırılarak) yapılabilir.
- **Öncelik sırası:** `feature-request`, `code-review`, `refactor` ilk
  3 (executor'ın workflow-agnostik olduğunu kanıtlamak için).
- **Kabul kriteri:** YAML geçerli, state/transition tutarlı (dead-end
  yok), Claude gerçek executor'dan (`node dist/cli.js`) geçirip
  doğrular.

### B2. Kalan ~15 skill için `SKILL.md` taslakları
- **Ne:** B1'deki yeni workflow'larla eşleşen skill'ler öncelikli.
- **Kabul kriteri:** Frontmatter geçerli, gerçek dosya referansları var
  (uydurma yol yok), en az 1 happy-path + 1 failure-mode örneği.

### B3. Yeni upstream alternatiflerinin araştırılması (Z.ai Chat/deep research)
- **Ne:** İlk 7 repo dışında, evidence-based debugging / agent
  orchestration alanında yeni öne çıkan projeler var mı?
- **Kabul kriteri:** Claude bulunanları `docs/research.md`'ye ekler,
  değerliyse Grup A'ya yeni görev açılır (Z.ai Agent'a clone görevi).

### B4. `evaluations/`, `tests/` altındaki boş klasörler için içerik taslağı
- **Ne:** Phase 8 hazırlığı — eval senaryosu taslakları.
- **Ön koşul:** B1/B2 kısmen tamamlanmış olmalı.

---

## GRUP C — Claude'un Rolü: Kontrolcü + Planlayıcı

Bu grupta Claude "görev yapmaz", **denetler ve yönlendirir:**

### C1. Her Z.ai çıktısını gerçek araçlarla doğrula
- Z.ai'nin ürettiği her `.sm.yaml`'ı gerçek `executor`'dan geçirip
  yapısal doğrulama yapar (dead-end, dangling transition kontrolü).
- Her yeni skill'in frontmatter'ını gerçekten parse eder.
- Kod içeren her PR/branch'i inceleyip: mimari tutarlılık, güvenlik
  (credential sızıntısı, redaction), lisans/attribution doğruluğu
  kontrol eder.

### C2. Eksik/unutulmuş şeyleri tespit et
- Z.ai'nin bir görevi "bitti" dediği ama gerçekte eksik bıraktığı
  yerleri bulur (örn. NOTICE güncellenmemiş, test yazılmamış,
  STATUS.md güncellenmemiş).
- Bunu kullanıcıya açıkça raporlar: "Z.ai şunu yaptı, şunu unuttu,
  şurada hata var."

### C3. Planı sürekli güncelle
- Her tamamlanan görev sonrası bu dosyayı (`TASKS.md`) ve
  `STATUS.md`'yi günceller, yeni öncelik sırası önerir.
- Kullanıcı onaylarsa commit/push eder (push yetkisi hâlâ token
  üzerinden Claude'da — bu değişmedi, sadece "kim kod yazıyor"
  değişti).

---

## Öncelik sırası (önerilen)

1. **A1** (superpowers derinleştirme) — Z.ai Agent'a ilk verilecek görev.
2. **B1** (feature-request, code-review, refactor workflow taslakları)
   — executor'ın workflow-agnostik olduğunu kanıtlamak için kritik.
3. **C1** (B1 çıktılarını gerçek executor'la test etme) — Claude,
   B1 biter bitmez.
4. **A2** (spec-kit şablonları).
5. **B2** (B1'deki workflow'larla eşleşen skill'ler).
6. **A3, A4, B3, B4** — arka planda.

## Bu listenin kullanımı

1. Kullanıcı, Z.ai Agent'a yukarıdaki prompt'ları (branch'te bırak,
   push etme talimatıyla) verir.
2. Z.ai Agent işi yapar, branch'i/diff'i kullanıcıya gösterir.
3. Kullanıcı diff'i (veya branch linkini) Claude'a getirir.
4. **Claude inceler:** doğru mu, eksik mi, tutarlı mı, güvenli mi —
   ve kararını açıkça söyler (onay / red / düzeltme talebi).
5. Onaylanırsa Claude ana branch'e merge eder / kendi committer
   erişimiyle push eder ve STATUS.md + bu dosyayı günceller.
