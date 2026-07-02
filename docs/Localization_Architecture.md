# TappyAI — Localization Architecture

> **Phase:** Architecture Week — Part 3
> **Status:** Design/analysis only — no code changes, no migrations
> **Grounding:** Verified against `src/lib/ai/intent.ts` (`detectLang`), `src/lib/ai/promptBuilder.ts` (`langBlock`), `public/manifest.json`, `src/components/Header.tsx` (existing localStorage preference pattern, dark mode), and a repository-wide pattern check across every UI file read this session (Home, Chat, Explore, Login, Settings, Profile) confirming zero translation-key usage anywhere. No claim is speculative.

---

## 1. Current State

- **AI Response Language — 🟢 already correct, already independent.** `detectLang(lastText)` (`intent.ts`) runs **per message**, not from any stored profile field. `promptBuilder.buildSystem()`'s `langBlock` forces the LLM to respond entirely in the detected language when it isn't Vietnamese, and explicitly instructs that CTA-button labels must also be in that language. This already achieves genuine mixed-language conversation handling (a user switching from Vietnamese to English mid-conversation gets an AI response in English on that turn) with **zero storage** — it is stateless and re-evaluated every turn.
- **UI Language — 🟠 does not exist as a concept.** Every UI string across every component/page read this entire session (Header, BottomNav, Home, Chat composer, Explore, Login, Settings, Profile) is a **hardcoded Vietnamese literal directly in JSX**. No `t()`/translation-key/i18n library call was found anywhere. `public/manifest.json` declares `"lang": "vi-VN"` as a static, non-dynamic value. This is a comprehensive, confirmed finding, not a guess based on a sample.
- **No locale-related database fields exist.** Neither `profiles` nor `user_preferences` (both fully enumerated in prior Architecture Week documents, `profiles` confirmed via migration grep this session) has a `language`, `ai_language`, `timezone`, or `country` column.
- **Timezone handling today is hardcoded, not per-user.** Every date/time-sensitive server computation found across this session (chat's "current VN time" prompt block, the `morning-brief`/`lunch-reminder`/`weekly-recap` cron jobs) uses a fixed Vietnam offset (`Asia/Ho_Chi_Minh`, UTC+7) or manual `+7` arithmetic — not a per-user timezone. This was not previously flagged in any Architecture Week document; noted here as new, confirmed technical debt (§7 format, see Future Expansion).
- **Existing localStorage precedent for client-side preference persistence:** `Header.tsx`'s dark-mode toggle already uses `localStorage.getItem('theme')`/`setItem` for an unauthenticated-friendly, instant-apply preference — this is the pattern a UI-language preference should follow, not a new mechanism.

---

## 2. Proposed Architecture

### 2.1 UI Language vs. AI Response Language — kept explicitly separate
These are architecturally already separate today (AI language has no dependency on anything UI-related, since no UI language setting exists to conflate it with). The proposal's job is to **keep them separate once a UI language setting is introduced**, not to build a new separation mechanism:
- A future `profiles.language` value must **never** be read by `detectLang()`'s per-message flow. Per-message detection remains the sole source of truth for what language the AI responds in, for every message after the first (§2.3).
- **Recommendation, explicitly scoped down from the brief's example list:** for MVP, **do not build full UI translation** (i.e., do not translate the hundred-plus hardcoded Vietnamese strings across the app into English or any other language). TappyAI is a Vietnam-first product (confirmed by its own branding copy — "trợ lý AI thuần Việt" — appearing verbatim across Home, Login, and the app manifest). No evidence anywhere in this codebase suggests a non-Vietnamese UI is needed for MVP. Translating the UI is a large, unscoped content-production effort (every string in every component), not an architecture task, and is not proposed here. What **is** proposed is the minimal data model (§3) so this can be added later without a data migration — architecture-ready, not built.

### 2.2 Default Language
- **Device locale auto-detection, no first-launch picker** — exactly as the brief requests. On first load, read `navigator.language` (web/TWA — a TWA inherits the device's browser locale automatically, no separate Android-side detection needed) client-side; if it doesn't start with `vi`, this is a signal worth recording (§3) even while the UI itself stays Vietnamese for MVP (§2.1) — this keeps the signal available for AI-language cold-start (§2.3) and for a future UI-translation effort, without forcing any UI change now.
- **Settings override:** once a `profiles.language` field exists (§3), a Settings toggle can let a logged-in user set it explicitly — but since UI translation isn't proposed for MVP, this toggle's only proposed MVP effect is informational/stored, not yet UI-changing. This avoids building a toggle that does nothing visible, while still capturing the preference for later.

### 2.3 AI Language Strategy
- **Where the AI gets its language from:** `detectLang(lastText)`, per message — unchanged, already correct (§1).
- **When to override (the one genuine design gap):** the very **first** message of a new session has no prior conversation to detect a pattern from, but `detectLang` already runs on that first message's own text and works correctly today (it doesn't need conversation history — it detects from the current message alone, confirmed via `intent.ts`). So there is **no actual cold-start gap** to fix — `profiles.language` is not needed to seed the first AI response. This corrects an assumption the brief's structure might imply (that AI language needs a stored fallback); verified against the actual code, it doesn't.
- **When to keep per-message detection (i.e., always):** mixed-language conversations already work correctly (§1) — no change proposed.
- **Conclusion:** the AI Language Strategy requires **zero new code and zero new schema** — it is already correctly designed and already independent of any UI-language concept. This section exists to make that independence explicit and documented, not to change it.

---

## 3. Database Impact

**Proposed: exactly one new column, not four.** Directly answering "chỉ đề xuất những trường thực sự cần cho MVP" by explaining why three of the brief's four example fields are *not* proposed:

| Field | Proposed? | Reasoning |
|---|---|---|
| `profiles.language` (nullable text, e.g. `'vi'`/`'en'`) | 🔵 **Yes** | Captures device-detected or explicitly-set UI language preference (§2.2). `NULL` = not yet set, client falls back to `navigator.language` detection. Low cost (one nullable column), no current consumer required to break by adding it. |
| `ai_language` | ❌ **Not proposed** | AI language is already correctly stateless and per-message (§2.3) — a stored override would be a **new feature** (pin AI to always respond in X regardless of input) nobody has asked for, not a requirement of "keep UI and AI language separate." |
| `timezone` | ❌ **Not proposed for MVP** | Real gap exists (§1, hardcoded VN time everywhere) but fixing it means threading a per-user timezone through every cron job and every "current time" prompt block — a genuinely larger change than this document's schema-only scope, and there's no confirmed need (product is Vietnam-first; no evidence of non-VN users today). Flagged as future-only (§7), not MVP. |
| `country` | ❌ **Not proposed** | No current consumer anywhere in the codebase would read this field. Adding unused schema is exactly the kind of complexity the review instructions ask to avoid ("không thêm nếu không thật sự cần"). |

---

## 4. API Impact

Minimal, consistent with the single-column proposal (§3):
- `GET /api/preferences` (or a new dedicated settings field, mirroring how `budget_level` etc. are already handled) — return `language` alongside existing explicit-preference fields.
- No chat/Explore API changes — `detectLang()`'s per-message flow (§2.3) is unaffected, confirmed already independent.
- The proposed `GET /api/context` (`Final_Architecture_Review.md` §19) could optionally include `language` in its payload for Android's benefit (§5), but this is not required for that endpoint's core purpose and should not block its design.

---

## 5. Android Impact
- If Android ships as a TWA (per the Digital Asset Links configuration found in `Authentication_Architecture.md` §1/§8), **device-locale detection needs no Android-specific work** — the TWA's Chrome Custom Tab reports the same `navigator.language` the web app already would use.
- If a native Android client is ever built instead, it would read the device's `Locale` and should write it to `profiles.language` (§3) via the existing settings API (§4) the same way the web client would — one shared field, no platform-specific schema needed.
- Since UI translation isn't proposed for MVP (§2.1), Android has **no localized-string-bundle work** to do for launch — this significantly reduces Android's localization workload relative to what the brief's structure might have implied.

---

## 6. iOS Impact
Identical to Android (§5) — the `profiles.language` field and detection strategy are platform-agnostic. No iOS-specific consideration exists or is needed at this stage, consistent with `Authentication_Architecture.md` §9's finding that no iOS work is planned or blocked.

---

## 7. Future Expansion

- **Full UI translation** — only if/when there's concrete evidence of non-Vietnamese-speaking user demand (not assumed here). Recommended approach when that time comes: a standard key-based i18n library appropriate for Next.js (e.g., `next-intl`, or a minimal custom `t(key)` helper given the app currently has zero i18n dependency to migrate away from), with translation keys organized by feature/route (mirroring the existing `src/app` folder structure, per `Final_Architecture_Review.md` §2's folder-structure finding) rather than one large flat file. **Fallback rule:** any missing key falls back to the Vietnamese string (the always-complete base locale), never a raw key or blank string.
- **Per-user timezone (§3)** — revisit once/if TappyAI has confirmed non-Vietnam-timezone users; today's hardcoded `Asia/Ho_Chi_Minh` is a deliberate simplification for a Vietnam-first MVP, not an oversight.
  - **Current State:** every cron/time-sensitive computation hardcodes UTC+7.
  - **Impact:** notification timing (morning brief, lunch reminder) would be wrong for a hypothetical user in a different timezone; no impact for the current, actual Vietnam-based user base.
  - **Recommendation:** defer; add `profiles.timezone` only when a real non-VN user cohort is confirmed.
  - **Priority:** Low.
- **`country` field** — revisit only if multi-country expansion becomes a real roadmap item; no schema should be added speculatively ahead of that.

---

## 8. MVP Recommendation

1. **Add `profiles.language` only** (§3) — smallest possible schema footprint, captures the signal now without committing to translation work.
2. **Do not translate the UI for MVP** (§2.1) — no evidence of need, large unscoped effort, explicitly out of scope here.
3. **Do not touch AI language logic** — already correct, already independent, zero changes proposed (§2.3).
4. **Leave timezone/country hardcoded/absent** (§7) — real but low-priority, deferred until a concrete need is confirmed.
5. **Auto-detect device locale into the new field, no first-launch picker** (§2.2) — directly satisfies the brief's stated principle with the smallest possible implementation.

---

*This document is Architecture Week Part 3. No code changes were made. Awaiting review.*
