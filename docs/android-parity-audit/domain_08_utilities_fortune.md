# Domain 08 — Utilities + Fortune + Games (Android ↔ Web parity)

**Baseline:** current working tree (uncommitted included), read directly. Web = source of truth.
**Web ref:** `docs/freeze/Web_V1_Platform_Freeze_2026-07-25/` (07_Features, 11_Android_Migration) + `src/`.

## Verdict

Utilities (Currency, Translate, VietWriter, Scan) and Games are at or near full parity — real native
implementations calling the shared Web backends, with documented, sensible divergences. **Fortune is
the one large gap and it is *worse* than the freeze doc states:** beyond the known tarot 22-vs-78 and
static-vs-deterministic readings, Android's tu-vi is missing the entire **Lifetime tab, By-Year tab +
12-month breakdown, lucky number/color, and Ngũ Hành** — none of which freeze item 13 mentions.

---

## IMPLEMENTED (parity confirmed)

- `[P3]` **Currency — full parity.** 12 currencies, USD-based table from `GET /api/rates`, reactive
  cross-rate conversion, swap, quick-amounts, fallback-notice-without-error degrade.
  EVIDENCE Android `currency/CurrencyViewModel.kt:78-95` (cross-rate `(r[to])/(r[from])`, USD special-cases)
  + `currency/Currency.kt` (12 entries) ↔ Web `src/app/currency/page.tsx:89-102` (identical math) + `src/app/api/rates/route.ts:5` (12 SUPPORTED). Android's `parseFloat`-leniency port is a faithful match (`CurrencyViewModel.kt:70-75`).
- `[P3]` **Translate — full parity.** 30 languages (same codes/order), bounded 2000-char input,
  `POST /api/translate`, read-aloud + copy. EVIDENCE Android `translate/Language.kt:25-56` (30 langs) +
  `translate/TranslateViewModel.kt:106-136` ↔ Web `src/app/api/translate/route.ts:9-18` (30-key LANG_NAMES), `DAILY_LIMIT=30`.
- `[P3]` **Scan — parity (OCR, not QR).** Client resize → base64 → `POST /api/scan` vision LLM →
  extracted text with Copy/Share. EVIDENCE Android `scan/ScanViewModel.kt:109-131` (`toScaledJpegBase64` maxPx 2048/q85) ↔ Web `src/app/api/scan/route.ts:34-40` (`AI.vision`, 6MB cap, DAILY_SCAN_LIMIT 20).
- `[P3]` **VietWriter — contract parity.** Maps to Web **`/viet-content`** (not a distinct route).
  `{topic,platform,tone,length}` → `{caption,hashtags}`; 3 platforms / 5 tones / 3 lengths.
  EVIDENCE Android `vietwriter/data/VietWriterDtos.kt:9-24` + `vietwriter/VietWriterOptions.kt:10-30` ↔ Web `src/app/api/viet-content/route.ts:4-21,49`.
- `[P3]` **Games — WebView over Web SuperTux (approved divergence, NOT a bug).** Loads
  `${WEB_APP_URL}/games/supertux` in a WebView with JS+DOM-storage on, host-confined navigation, and
  `destroy()` cleanup. Matches Web's own `<iframe src="/games/supertux">` architecture (COOP/COEP set
  server-side). EVIDENCE Android `games/GamesScreen.kt:106-166` ↔ freeze 11_Android_Migration §4.5/§6 ("acceptable as-is").
- `[P3]` **Fortune — Tarot draw mechanics parity.** Client shuffle + `reversed` at prob 0.5; draw
  1/2/3. EVIDENCE Android `fortune/tarot/TarotCard.kt:172-178` ↔ Web `src/lib/boi/tarotData.ts:220-228` (`getRandomCards`, `Math.random() < 0.5`). NOTE: tarot is NOT deterministic on either side — only zodiac/tu-vi use the seeded engine.
- `[P3]` **Fortune — Zodiac/CanChi sign resolution parity.** `getZodiacByDate` and
  `getCanChiByYear ((y-4)%12)` match Web. Android CanChi correctly drops the fabricated heavenly-stem
  (documented `CanChiData.kt:20-23`). EVIDENCE Android `zodiac/ZodiacData.kt:104-113`, `tuvi/CanChiData.kt:102-105`.

---

## MISSING (Web feature absent on Android)

- `[P1]` **Tu-vi "Lifetime" (Trọn đời) tab — entirely absent on Android.** Web renders a lifetime
  overview + career/love/health + advice (`LIFETIME_READINGS`) plus 4 expandable life stages
  (`generateLifeStages`: niên thiếu / thanh niên / trung niên / hậu vận). Android `tuvi/TuViViewModel.kt`
  only models day/week/month. EVIDENCE Web `src/components/boi/TuViForm.tsx:189-195,245-329` +
  `src/lib/boi/{lifetimeData.ts,fortuneEngine.ts:502-519}` ↔ Android `tuvi/TuViViewModel.kt:24-51` (no lifetime path). **Freeze item 13 does NOT list this.**
- `[P1]` **Tu-vi "By-Year" tab + 12-month breakdown — absent on Android.** Web has a year picker
  (±5 yrs), can-chi compatibility note (tam hợp / lục xung / etc.), a year overview reading, and a
  per-month expandable breakdown. EVIDENCE Web `TuViForm.tsx:197-206,357-475` +
  `fortuneEngine.ts:188-327` (`generateYearFortune`, `generateMonthlyBreakdown`) ↔ Android has none. **Not in freeze item 13.**
- `[P2]` **Lucky number + lucky color — missing from Android readings.** Web every period/year
  reading shows `luckyNumber`/`luckyColor`; Android `ZodiacReading`/`TuViReading` data classes have
  no such fields. EVIDENCE Web `fortuneEngine.ts:17-26,97-98` + `CungHoangDaoForm.tsx:123-130` ↔ Android `zodiac/ZodiacData.kt:17-24`, `tuvi/CanChiData.kt:11-18`.
- `[P2]` **Ngũ Hành (five-element) label — missing.** Web tu-vi header shows `getNguHanhByYear`;
  Android `CanChi` has no nguHanh field. EVIDENCE Web `TuViForm.tsx:11,68,126` ↔ Android `tuvi/CanChiData.kt:3-9`.
- `[P2]` **Tarot minor arcana — 56 cards missing (22 vs 78).** Web deck = 22 Major +
  `buildMinorArcana()` (4 suits × 14 ranks = 56). Android ships only the 22 Major Arcana.
  EVIDENCE Web `src/lib/boi/tarotData.ts:196-218` (`TAROT_DECK = [...MAJOR_ARCANA, ...buildMinorArcana()]`) ↔ Android `fortune/tarot/TarotCard.kt:15-170` (22 entries, ids 0-21). Matches freeze item 13. NOTE: freeze 07_Features says "78-card tarot" — TRUE, but 56 are *generated* from suit×rank templates, not hand-authored.
- `[P3]` **Scan TXT/DOCX export — not ported (deliberate).** Web offers `.txt`/`.docx` download;
  Android substitutes the native Share sheet + Copy. Documented decision, low impact.
  EVIDENCE Android `scan/ScanScreen.kt:72-74` ↔ Web `src/app/scan/page.tsx:34-53,219-221`.

---

## DIFFERENT BEHAVIOR

- `[P1]` **Zodiac & Tu-vi period readings: STATIC on Android vs DETERMINISTIC date-seeded on Web.**
  Web `generateFortune(subjectId, period, banks)` djb2-hashes `subjectId|periodKey` (VN-time day/ISO-week/
  month bucket) to pick from 12-entry banks + a 3–5 score — so a sign's "today" reading *changes each
  day/week/month*. Android returns 3 hardcoded `ZodiacReading`/`TuViReading` per sign (one fixed
  day/week/month), identical every visit, fixed scores. EVIDENCE Web `fortuneEngine.ts:86-100` +
  `CungHoangDaoForm.tsx:72` ↔ Android `zodiac/ZodiacData.kt:41-101` (static READINGS map), `tuvi/CanChiData.kt:39-100`. Core of freeze item 13; **no `fortuneEngine.ts` port exists in Android.**
- `[P3]` **Tarot card Vietnamese names/emojis differ from Web.** e.g. Android "Kẻ Ngốc"/🃏 vs Web
  "Kẻ Khờ"/🃏; "Nữ Giáo Chủ" vs "Nữ Tư Tế"; "Cái Chết"/💀 vs "Tử Thần"/🦋. Cosmetic, but the two decks
  are independently authored. EVIDENCE Android `tarot/TarotCard.kt:16-38` ↔ Web `tarotData.ts` MAJOR_ARCANA.
- `[P3]` **Currency input validation surface differs (both faithful).** Web `type="number"` blocks a
  second `.`; Android replicates JS `parseFloat` leading-prefix parsing to degrade identically on
  grouped input. Documented, correct. EVIDENCE Android `CurrencyViewModel.kt:58-75`.

---

## BUGS

- `[P2][UNVERIFIED]` **Translate read-aloud may use the wrong-language voice on devices lacking the
  target voice.** Android `speak()` does `tts.language = Locale.forLanguageTag(ttsTag)` without checking
  the return of `setLanguage()`/`isLanguageAvailable()`. Android `TextToSpeech.setLanguage` returns
  `LANG_NOT_SUPPORTED` and keeps the previous/default voice (often en-US) instead of erroring — the same
  class of defect Web fixed with `lib/tts/voiceSelection.ts` (a language-matched picker + "no voice"
  notice; see MEMORY `project_tts_language_voice`). Android has no equivalent guard/notice.
  EVIDENCE Android `translate/TranslateViewModel.kt:126-136` ↔ Web `src/lib/tts/voiceSelection.ts` (freeze 07_Features §15 "Language-matched voice picker"). Needs on-device confirmation.

---

## REQUIRED BACKEND CONTRACTS

None new. All four utilities reuse existing shared endpoints with matching payloads:
`GET /api/rates`, `POST /api/translate`, `POST /api/scan`, `POST /api/viet-content`. Fortune and Games
require **zero** backend: fortune is fully offline/local (data banks + engine) and Games is a WebView
over the existing `/games/supertux` route. Closing fortune parity is a **pure client port of
`src/lib/boi/fortuneEngine.ts` + `lifetimeData.ts` + minor-arcana builder** — no API work.

---

## Freeze-doc contradictions noted

1. **11_Android_Migration item 13 understates the fortune gap** — lists only tarot (22/78) and
   "3 static readings/sign vs deterministic engine". It omits the missing **Lifetime tab, By-Year +
   monthly breakdown, lucky number/color, and Ngũ Hành**. The true fortune gap is materially larger.
2. **07_Features §8 / §15 reference a `finance/**` lib with `crossRate`/`MissingCurrencyError` and
   Bug #15 "missing-currency now throws"** — but `src/lib/finance/` **does not exist** in the current
   tree, and the `/currency` utility does its conversion inline in `page.tsx` with `|| 1` fallbacks
   (no throw). Android correctly mirrors the *actual* `page.tsx` (`?: 1.0`), not the freeze's described
   finance lib. (Bug #15/finance likely pertains to a chat exchange tool, not the `/currency` surface.)
3. **07_Features §8 "78-card tarot" is technically true but 56 cards are generated** from
   suit×rank templates (`buildMinorArcana`), not hand-authored data.
