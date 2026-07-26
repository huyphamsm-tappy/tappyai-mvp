# Implementation Spec — Android Fortune Parity (P1-7, P1-8, P1-9, P2-11)

Scope: port the web PRODUCTION fortune engine + data to Android so readings are
**byte-identical** to web, and add the two missing Tu-vi tabs plus the full 78-card tarot deck.

Source of truth = prod worktree `.claude/worktrees/cool-vaughan-b3c7ff/` (branch `main`).
All web `file:line` references below are relative to that worktree.
Android baseline = primary tree `android/app/src/main/java/com/tappyai/app/fortune/`.

**This is a pure client-side port. No backend, no network, no LLM.** Everything is
deterministic hashing over static string banks (web comment `fortuneEngine.ts:1-4`).

---

## 0. Gap summary (evidence-based)

| Area | Web prod | Android baseline | Gap |
|---|---|---|---|
| Deterministic engine (P1-7) | `src/lib/boi/fortuneEngine.ts` djb2 hash over banks, period key from VN time | none — 3 hardcoded readings/subject, hardcoded scores | port whole engine |
| Zodiac reading | engine picks love/career/money/health + **lucky number/color** + deterministic score | `zodiac/ZodiacData.kt` 3 static readings/sign, **no lucky number/color**, static score | wire engine + banks + lucky fields |
| Tu-vi period reading | engine + banks + lucky number/color | `tuvi/CanChiData.kt` 3 static readings/canchi, no lucky | wire engine + banks + lucky fields |
| Tu-vi Lifetime tab (P1-8) | `lifetimeData.ts` + `fortuneEngine.ts:329-519` (4 life stages) | absent (enum has Day/Week/Month only) | new data + engine + UI |
| Tu-vi By-Year tab (P1-9) | `fortuneEngine.ts:102-327` year fortune + 12-month breakdown + can-chi compat | absent | new data + engine + UI |
| Tarot deck (P2-11) | 78 cards = 22 major + 56 minor generated (`tarotData.ts`) | `tarot/TarotCard.kt` **22 major only** | add 56 minor generation |

Android already has correct plumbing to reuse: `getCanChiByYear` (`CanChiData.kt:102`) and
`getZodiacByDate` use the identical `((year-4)%12+12)%12` / date-range logic as web, and
`drawCards` (`TarotCard.kt:172-178`) already matches web's `reversed = random < 0.5`.

---

## 1. Deterministic engine (P1-7) — exact algorithm to reproduce

### 1.1 djb2 hash — `fortuneEngine.ts:62-69`
```ts
function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0  // 32-bit signed wrap
  return Math.abs(h)
}
```
Kotlin port — **two parity traps**:
1. `| 0` = force 32-bit signed wraparound. Kotlin `Int` arithmetic already wraps at 32 bits, so
   accumulate in an `Int`: `h = h * 33 + s[i].code`.
2. `Math.abs(h)` in JS returns a **non-negative double up to 2147483648**. Kotlin `kotlin.math.abs(Int)`
   returns `Int.MIN_VALUE` unchanged when `h == Int.MIN_VALUE` (still negative) → later `% arr.length`
   would be negative and crash/mismatch. **Fix: widen before abs.**
```kotlin
private fun hashString(s: String): Long {
    var h = 5381
    for (c in s) h = h * 33 + c.code          // Int, wraps at 32 bits exactly like `| 0`
    return kotlin.math.abs(h.toLong())         // widen so MIN_VALUE -> 2147483648, matches JS
}
```
`charCodeAt` returns a UTF-16 code unit; **every seed input is pure ASCII** (subject ids like `ty`,
`aries`; salts like `love`; period keys like `2026-07`), so `Char.code` is exact. No emoji ever enter
a seed.

### 1.2 Pick helpers — `fortuneEngine.ts:71-80`
```
pick(seed, salt, arr)            -> arr[ hashString("seed|salt") % arr.length ]
pickIndexInRange(seed,salt,min,max) -> min + hashString("seed|salt") % (max-min+1)
```
Kotlin: `arr[(hashString("$seed|$salt") % arr.size).toInt()]`. Use `Long % Long`.

### 1.3 VN time-period bucket — `fortuneEngine.ts:28-60`
- `getVNNow()` = `new Date(Date.now() + 7h)`, then reads `getUTCFullYear/Month/Date` → this is the
  **Vietnam (UTC+7) civil date**. Kotlin: `LocalDate.now(ZoneOffset.ofHours(7))` (or
  `Instant.now().plusSeconds(7*3600)` read as UTC). Do NOT use device zone.
- Key formats (`pad2` = zero-pad to 2):
  - `day`  → `"YYYY-MM-DD"`  label "Hôm nay"
  - `week` → `"YYYY-Www"`    label "Tuần này"   (`w` = ISO week number, pad2)
  - `month`→ `"YYYY-MM"`     label "Tháng này"
- **ISO week trap** (`getISOWeekNumber` lines 37-43): the week number is ISO-8601
  (`WeekFields.ISO.weekOfWeekBasedYear()`), but the **year prefix is the plain calendar year**
  (`vn.getUTCFullYear()`), NOT the ISO week-based year. So on e.g. 2026-01-01 the key is
  `"2026-W01"` using calendar year. Kotlin must mirror this exactly:
  `year = vnDate.year` (calendar) + `week = vnDate.get(WeekFields.ISO.weekOfWeekBasedYear())`.
- Seed for a period reading = `"${subjectId}|${key}"` (line 88).

### 1.4 CRITICAL cross-platform parity trap — subject IDs must be the web strings
The seed embeds `subjectId`. Web ids are **strings**; Android currently uses **Int** ids. Identical
output requires Android to seed with the exact web id strings:
- Zodiac (`zodiacData.ts:17+`): `aries, taurus, gemini, cancer, leo, virgo, libra, scorpio,
  sagittarius, capricorn, aquarius, pisces`.
- Can-chi (`canChiData.ts:13+`): `ty, suu, dan, mao, thin, **ty2**, ngo, mui, than, dau, tuat, hoi`.
  **Gotcha: Tỵ (snake) id is `ty2`, not `ty`.** Order index 0..11 maps to `(year-4)%12`.
- Life-stage keys (`fortuneEngine.ts:495-500`): `nienhieu, thanhnien, trungnien, hauvan`.

If Android keeps Int ids in the seed, readings will NOT match web. Add a `seedId: String` to the
Kotlin `CanChi`/`ZodiacSign` models (or a parallel lookup) carrying the web string.

### 1.5 Score is deterministic, not hardcoded
Web computes `score = pickIndexInRange(seed,'score',3,5)` (period/year) and `2,5` (monthly).
Android's static `score` ints (`CanChiData.kt`, `ZodiacData.kt`) must be **removed** and computed by
the engine, or scores won't match.

### 1.6 Lucky number / color (missing on Android today)
Web period + year readings show `luckyNumber` (`pick(seed,'number',banks.luckyNumbers)`) and
`luckyColor` (`pick(seed,'color',banks.luckyColors)`) — `fortuneEngine.ts:97-98`, rendered
`CungHoangDaoForm.tsx:123-130`, `TuViForm.tsx:231-238`. Android has **no** `fortune_lucky_number`/
`fortune_lucky_color` strings and no lucky data. Add banks + strings + UI row.

---

## 2. Kotlin `FortuneReading` shape (period + year)
Port `FortuneReading` (`fortuneEngine.ts:17-26`): `periodLabel, love, career, money, health,
score(1-5), luckyNumber(Int), luckyColor(String)`. `YearFortuneReading` extends it with
`yearAnimal, compatLabel, compatNote` (lines 182-186).

`generateFortune(subjectId, period, banks)` — `fortuneEngine.ts:86-100`.

---

## 3. Tu-vi Lifetime tab (P1-8)

Data + generation, rendered `TuViForm.tsx:189-195`, `LifetimeCard` lines 245-329.

### 3.1 Static overview per can-chi — `lifetimeData.ts`
`LIFETIME_READINGS: Record<canChiId, {overview, career, love, health, advice}>` — 12 entries,
keyed by the web string id (`ty`…`ty2`…`hoi`). ~5 paragraphs × 12 = 60 strings. Pure static, no hash.

### 3.2 Four life stages (deterministic) — `fortuneEngine.ts:329-519`
- `STAGE_DEFS` (lines 495-500): 4 stages `{key,label,ageRange,emoji}`:
  - `nienhieu` "Thời niên thiếu" "0 – 18 tuổi" 🌱
  - `thanhnien` "Thanh niên" "18 – 30 tuổi" 🔥
  - `trungnien` "Trung niên" "30 – 50 tuổi" 🌳
  - `hauvan` "Hậu vận" "50+ tuổi" 🌟
- `STAGE_BANKS` (lines 340-493): per stage, 3 arrays (`fate`, `career`, `love`) **× 10 entries each**
  = 4 × 3 × 10 = **120 strings**.
- `generateLifeStages(subjectId, birthMonth, birthDay)` (lines 502-519):
  seed = `"${subjectId}|bm${birthMonth}|bd${birthDay}|stage-${key}"`, then
  `pick(seed,'fate'|'career'|'love', bank)`.
- UI: overview card (overview italic + career/love/health rows + advice box) then an expandable
  card per stage (fate italic + career + love). Android: `LazyColumn` + expandable cards.

---

## 4. Tu-vi By-Year tab (P1-9)

Rendered `TuViForm.tsx:197-206`, `YearReadingSection` lines 357-436.

### 4.1 Year picker
`VN_YEAR = current VN calendar year`; options = `VN_YEAR-5 .. VN_YEAR+5` (11 years),
`fortuneEngine.ts:29-30` / `TuViForm.tsx:29-30`. Each option labelled `"{year} ({animal})"` where
`animal = YEAR_ANIMALS[((year-4)%12+12)%12]`. `YEAR_ANIMALS` = `Tý,Sửu,Dần,Mão,Thìn,Tỵ,Ngọ,Mùi,
Thân,Dậu,Tuất,Hợi` (line 104).

### 4.2 Year fortune + can-chi compatibility — `fortuneEngine.ts:188-212`
```
seed = "${subjectId}|year-${targetYear}"
subjectIdx = ((birthYear-4)%12+12)%12
yearIdx    = ((targetYear-4)%12+12)%12
diff       = (yearIdx - subjectIdx + 12) % 12
compat     = YEAR_COMPAT[diff]     // 12 fixed {label,note} entries, lines 106-119
```
`diff` semantics (branch offset, this is the "can-chi compatibility" the gap report means):
0=Năm bản mệnh, 4/8=Tam hợp, 6=Lục xung, 3/9=Tương hình, 2=Lục hợp, others "—".
Reading fields use `YEAR_BANKS` (lines 121-180): love/career/money/health **× 12 each**,
`luckyNumbers=[1,3,6,8,9,18,36]`, `luckyColors=[Vàng,Đỏ,Xanh lá,Trắng,Tím,Xanh dương,Cam]`.
`score = pickIndexInRange(seed,'score',3,5)`.

### 4.3 12-month breakdown — `fortuneEngine.ts:214-327`
`generateMonthlyBreakdown(subjectId, birthYear, birthMonth, birthDay, targetYear)` returns 12 items:
```
seed = "${subjectId}|by${birthYear}|bm${birthMonth}|bd${birthDay}|y${targetYear}|m${month}"  // month 1..12
love/career/money/health/note = pick(seed, salt, MONTH_BANKS[salt])
score = pickIndexInRange(seed,'score',2,5)
```
`MONTH_BANKS` (lines 233-304): 5 arrays (`love,career,money,health,note`) **× 12 entries** = 60 strings.
`monthName = "Tháng {n}"`. UI: expandable card per month with a mini 5-star row (score) collapsed,
love/career/money/health/note rows expanded.

---

## 5. Tarot 78-card deck (P2-11)

### 5.1 Baseline
`tarot/TarotCard.kt` has **22 major arcana only** (ids 0-21), `data class TarotCard(id:Int,…)`.
`drawCards` (line 172) already parity-correct for reversed prob.

### 5.2 Web deck — `tarotData.ts`
- 22 major arcana static (lines 18-151), fields:
  `id,name,nameVi,arcana,number,emoji,keywordsUpright[],keywordsReversed[],meaningUpright,meaningReversed`.
- **56 minor arcana generated** by `buildMinorArcana()` (lines 196-216) from templates:
  - `SUITS` (lines 162-167): 4 = wands/cups/swords/pentacles, each `{id,nameVi,emoji,domain}`
    (Gậy 🔥 "công việc, đam mê và hành động"; Cốc 💧 "tình cảm…"; Kiếm 🗡️ "tư duy…"; Tiền 💰 "tài chính…").
  - `RANKS` (lines 179-194): 14 = Ace..10 + Page/Knight/Queen/King, each
    `{number,nameVi,emoji,upright,reversed,kwUp,kwRev}`.
  - Per (suit × rank): `id="minor-{suit}-{n}"`, `emoji=suit.emoji`,
    `keywordsUpright=[rank.kwUp, suit.domain.split(',')[0]]`,
    `meaningUpright="{rank.upright}, đặc biệt trong lĩnh vực {suit.domain}."` (reversed analogous),
    `nameVi="{rank.nameVi} {suit.nameVi}"`, English `name` maps Gậy→Wands etc.
- `TAROT_DECK = [...major, ...minor]` = 78. `getRandomCards(count)` splices without replacement +
  `reversed = random < 0.5` (lines 220-229).

### 5.3 Android port
Extend `TAROT_DECK` by appending a `buildMinorArcana()` producing the 56 cards from the same
SUITS×RANKS templates. Keep the existing 22 major entries (already close; optionally align Vietnamese
names to web's exact strings — e.g. web "Kẻ Khờ" vs Android "Kẻ Ngốc" — for text parity, not required
for the deck-count gap). `id:Int` model works fine (offset minor ids 22..77) since tarot draw uses
`Math.random`, **not** the deterministic hash — no seed-id constraint here.

### 5.4 Tarot has NO lucky number / color / Ngũ Hành
Correction to the gap-report phrasing: neither web `TarotDraw.tsx` nor Android tarot show a lucky
number/color or Ngũ Hành. A tarot reading = card(s) + upright/reversed badge + keyword chips +
meaning paragraph only. "Lucky number/color" belongs to **zodiac + tu-vi** (§1.6); "Ngũ Hành" is a
**tu-vi/zodiac** concept (§6). Do not add lucky fields to tarot.

---

## 6. Ngũ Hành (five elements)

- **Tu-vi**: `getNguHanhByYear(year)` — `canChiData.ts:394-402` — by last digit of birth year:
  0/1→Kim, 2/3→Thủy, 4/5→Mộc, 6/7→Hỏa, 8/9→Thổ. Shown in the can-chi header (`TuViForm.tsx:126`).
  Android `CanChiData.kt` has **no** nguHanh function → add it + show in header.
- **Zodiac**: the "element" is the `element` field on each sign (`zodiacData.ts` — Hỏa/Thổ/Khí/Thủy).
  Android `ZodiacData.kt` already has `element` but uses different strings (**Lửa/Đất/Khí/Nước** vs web
  **Hỏa/Thổ/Khí/Thủy**) — align to web for parity.

---

## 7. Can-chi (Heavenly Stems / Earthly Branches) logic actually used

Web deliberately uses **branch (Chi) only** — no heavenly stem is computed. `CanChi.id`/`nameVi` are
the branch (Tý, Sửu, …); there is no "Canh/Tân/…" stem anywhere. Android already matches this and
documents the rationale (`CanChiData.kt:20-23`: a hardcoded stem is wrong for 9 of every 10 birth
years). The only "can-chi compatibility" logic is the **branch-offset `diff`** in §4.2. Do not add
stems.

---

## 8. Concrete file plan (add / modify)

**New (data + engine, pure Kotlin — mirror `src/lib/boi/`):**
- `fortune/engine/FortuneEngine.kt` — djb2 hash, pick/pickIndexInRange, VN period key (ISO week),
  `generateFortune`, `generateYearFortune`, `generateMonthlyBreakdown`, `generateLifeStages`,
  `YEAR_ANIMALS`, `YEAR_COMPAT`, `YEAR_BANKS`, `MONTH_BANKS`, `STAGE_BANKS`, `STAGE_DEFS`, models
  (`FortuneReading`, `YearFortuneReading`, `MonthlyFortune`, `LifeStage`, `FortuneBanks`).
- `fortune/tuvi/LifetimeData.kt` — `LIFETIME_READINGS` (12 × 5 fields) keyed by web string id.

**Modify (data — add banks + web string ids + lucky arrays; drop static readings/scores):**
- `fortune/tuvi/CanChiData.kt` — add `seedId:String` + `banks:FortuneBanks` per entry; add
  `getNguHanhByYear`; delete the hardcoded `READINGS` map + `getTuViReadings`.
- `fortune/zodiac/ZodiacData.kt` — add `seedId:String` + `banks`; align element strings; delete
  hardcoded `READINGS`/`getZodiacReadings`.
- `fortune/tarot/TarotCard.kt` — append `buildMinorArcana()` (SUITS×RANKS) → 78 cards.

**Modify (ViewModel — engine + new tabs):**
- `fortune/tuvi/TuViViewModel.kt` — replace `TuViPeriod` enum usage with a `ViewMode`
  (Day/Week/Month/Lifetime/Year) matching `TuViForm.tsx:21`; hold `selectedYear`; call engine.
- `fortune/zodiac/ZodiacViewModel.kt` — call `generateFortune` per period; expose lucky number/color.
- `fortune/tarot/TarotViewModel.kt` — unchanged (deck grows underneath it).

**Modify (UI):**
- `fortune/tuvi/TuViScreen.kt` — add Lifetime + By-Year tab UI (mode selector `TuViForm.tsx:132-182`,
  `LifetimeCard`, `YearReadingSection`, expandable stage/month cards), lucky number/color row, Ngũ Hành
  in header.
- `fortune/zodiac/ZodiacScreen.kt` — add lucky number/color row (line ~181 header already shows element).

**Modify (strings):** `res/values/strings_fortune.xml` + `values-vi/` — add keys for lifetime tab,
by-year tab, lucky number, lucky color, monthly breakdown, life stages, year overview, pick-year,
compat fallback, etc. (mirror web i18n `fortune.*`). Android already has `fortune_career_life`,
`fortune_love/career/money/health`, period labels. Missing: lucky number/color, lifetime/year/monthly.

**Tests (regression, permanent per standing rule):** golden test asserting the Kotlin engine produces
the **exact same** love/career/money/health/score/luckyNumber/luckyColor as web for a fixed
`(subjectId, periodKey)` — e.g. hardcode `hashString("aries|2026-07")` and a couple of `pick` outputs
computed from web to lock cross-platform determinism (guards the §1.1 abs trap and §1.4 seed-id trap).

---

## 9. Data volume (all static, no backend)

Rough string counts to port: can-chi banks 12×(4+4+4+3) + lucky (12×5); zodiac banks 12×(~5+4+4+3) +
lucky; lifetime 12×5=60; STAGE_BANKS 120; MONTH_BANKS 60; YEAR_BANKS 4×12+7+7; YEAR_COMPAT 12×2;
tarot minor 4 SUITS + 14 RANKS templates → 56 generated. Total ≈ **500-600 Vietnamese strings** plus
the generated tarot. Mechanical port; the risk is not volume but the two hash-parity traps (§1.1 abs,
§1.4 seed ids incl. `ty2`) and the ISO-week/VN-timezone key format (§1.3).

## 10. Scope estimate
Medium-large, mechanical: ~2 new Kotlin files (engine + lifetime data), ~5 modified (2 data, 2 VM,
tarot), 2 UI screens gain tabs, ~20-30 new string pairs, 1 regression test. No architectural change,
no DI/network wiring — fully offline client port. Highest-value correctness gate = the golden
cross-platform determinism test.
