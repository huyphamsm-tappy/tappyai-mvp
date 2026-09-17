# ADR-027 — Chat response language: the client's locale as the tie-breaker

**Status:** Accepted — Owner decision, 2026-09-09 · **Scope:** Web backend (authoritative), web client, Android client
**Amends:** `ADR-016` §2 (known limitation 1), §3 (architecture flow), §9 (accepted costs) — the detection algorithm itself is unchanged and every rule in ADR-016 §2–§4 still binds.
**Also updates:** `docs/Localization_Architecture.md` §2.1/§2.3 · `supabase/migrations/add_user_language_preference.sql` (comment only)
**Required by:** `00_Constitution.md` §8.2 — changing a shipped decision is a Design Change and needs an ADR.

---

## 1. Context

ADR-016 §2 accepted a known limitation, in these words:

> **Fully-undiacritized Vietnamese** ("cho toi xem menu") carries zero signal and reads as `en`.
> Accepted: the input is genuinely ambiguous; the user can add diacritics or say "trả lời bằng
> tiếng Việt".

That limitation turned out not to be an edge case. Typing Vietnamese **without diacritics is
ordinary typing** — it is what Telex users produce before the IME composes, what people type in a
hurry, and what anyone types on a keyboard that is not set up for Vietnamese. Reproduced against
the live pipeline on 2026-09-08:

```
detectLang('Tim quan bun bo ngon o TPHCM')  →  'en'
```

so a Vietnamese user, inside a Vietnamese-language app, asking a Vietnamese question, was answered
in English. Telling that user to "add diacritics or ask in Vietnamese" is asking them to work
around the product.

The two directions of ADR-016's original incidents remain the governing risk: a detector that
becomes eager to say `vi` re-breaks the English speaker who correctly writes "Đà Nẵng". So the fix
must add a signal *without* loosening the detector.

## 2. Decision

`/api/chat` resolves the reply language in this order (`src/app/api/chat/route.ts`):

| # | Source | Function |
|---|---|---|
| 1 | An explicit request in the message | `detectExplicitLangRequest(lastText)` |
| 2 | The language the message is **clearly** in | `detectLangConfident(lastText)` |
| 3 | The language the **client** says the user is using | `requestLocale(req)` — `?lang=`, then `Accept-Language` |
| 4 | Whole-sentence detection (defensive tail, see §4) | `detectLang(lastText)` |

**`detectLangConfident` (new, `src/lib/ai/intent.ts`)** reports only what the text settles beyond
doubt, and `null` otherwise:

- a non-Latin script (kana / hangul / CJK / Arabic / Thai) — unambiguous, same scan as ADR-016 §2.1;
- Vietnamese when every word carries a diacritic, or when a lowercase accented word appears
  alongside **≥2** Vietnamese function words;
- English on **≥2** English function words with no lowercase accented word, so one loanword
  ("best", "view", "cafe") cannot flip a Vietnamese turn.

It reuses ADR-016's own signals and adds none. `detectLang` is untouched, so ADR-016 §6's
regression suite stays valid exactly as written.

**What step 3 reads, and does not read.** `requestLocale` reads only this request: `?lang=`, then
the first tag of `Accept-Language`. It does **not** read `profiles.language`, conversation history,
country, or any account data. The AI's language remains stateless per message — nothing is stored
about it, and ADR-016 §8's rejection of a *stored* per-user AI language stands.

**What the clients send.**

- **Android** — `AuthInterceptor` sets `Accept-Language: Locale.getDefault().toLanguageTag()` on
  our own host only, and `LanguageManager.applyDefaultIfUnset()` makes that the product language
  rather than the handset's.
- **Web** — the `appLanguageFetch` interceptor (C29) sets the header on same-origin `/api/**`. As
  of this ADR it sends `appLocale()` — the user's explicit choice, else the product default —
  instead of sending nothing when no choice had been made. See §3.
- **iOS** — sends no locale today, so it gets the product default. When it adds one, it reports the
  locale it is rendering in; that is not client-side language detection and does not weaken
  ADR-016 §5 (`docs/ios/14_BACKEND_CLIENT_BOUNDARY.md`), which forbids a client deciding or
  translating the AI's language. The backend remains the sole authority.

## 3. The web half, and why this ADR changes it

C29's interceptor originally sent the header **only** when the user had explicitly chosen a
language, reasoning that the browser's own header was otherwise "the honest answer, and it is also
what seeds the UI, so header and UI still agree".

That premise no longer holds: the UI store now settles on the product default rather than on
`navigator.language`. Silence therefore meant the visitor **read** Vietnamese and was **answered**
in whatever their browser was configured with — and under §2 step 3, that now decides the AI's
reply language too. A fresh visitor on an en-US browser typing `Tim quan bun bo ngon o TPHCM` would
have received English: precisely the defect this ADR exists to remove.

So the client's language now comes from one function, `appLocale()` in
`src/lib/i18n/useTranslation.ts`, used by the React store, by `resolvedClientLocale()`, and by the
fetch interceptor. Three separate `?? fallback` expressions is how the UI and the header came to
disagree in the first place; there is now one.

## 4. Consequences

**Step 4 is unreachable today, and stays for a reason.** `requestLocale` never returns null — a
request with no `?lang=` and no `Accept-Language` gets `DEFAULT_LOCALE = 'vi'`. Step 4 is therefore
a defensive tail rather than a live branch. It is kept so that making `requestLocale` locale-less
(should a caller ever need "I genuinely do not know") degrades to detection rather than to a
hardcoded default. Pinned in `src/lib/i18n/chatLanguagePriority.test.ts`.

**A short English question on a Vietnamese client is answered in Vietnamese.** `find me a quiet
cafe` carries too few English function words to clear step 2, so step 3 decides. This is deliberate
and conservative: loosening the English bar re-opens ADR-016's Incident 1 direction, and answering
a Vietnamese-locale user in Vietnamese is the safer miss. A fuller sentence
(`What is the best laptop under 20 million?`) clears it, and an explicit request always wins.

**The product default is now visible in the AI's language, not just the UI's.** With no explicit
choice and no client locale, the answer is Vietnamese. That is a product position — TappyAI is
Vietnam-first — not a detection outcome.

**Coverage.** `src/lib/i18n/chatLanguagePriority.test.ts` pins the four-step chain including the
diacritic-free regression; `src/lib/i18n/appLanguageFetch.test.ts` pins what the web actually sends,
including `/api/chat`; ADR-016 §6's suite and `src/lib/ai/responseLanguage.test.ts` continue to pin
`detectLang` itself, unchanged.

**Compliance signals (extending ADR-016 §9).** A PR touching this chain must keep the whole-sentence
property (no single character may decide a language), keep the explicit override first, keep
`detectLang` and ADR-016 §6 green, and update this ADR if the order changes.

## 5. Alternatives considered

| Alternative | Rejected because |
|---|---|
| Keep ADR-016's rule and teach `detectLang` to read undiacritized Vietnamese | This is what ADR-016 already refused for good reason: "tim quan bun bo" is genuinely ambiguous text, and every threshold that catches it also catches English sentences containing Vietnamese place names. The signal that resolves it is not in the text at all. |
| Make `requestLocale` return null when no locale is present, so step 4 runs | Kept as a documented option (§4), not taken now: the only callers that send nothing are non-browser tools, and answering them in the product language is the same behaviour every other endpoint already has. |
| Store an AI language per user | Unchanged from ADR-016 §8 — it breaks mixed-language conversations and adds schema for a solved problem. This ADR reads the request, not the profile. |
| Ask the model to detect the language | Unchanged from ADR-016 §8 — latency, cost and non-determinism, for a case that is now deterministic. |

## 6. Implementation status at the time of this decision

Both halves exist but are **uncommitted**, and on two different branches:
`fix/places-marker-contract` (the route chain, `detectLangConfident`, the web client) and
`feat/consultative-d1-d2-r1-r2-d3` (the Android `LanguageManager` / `AuthInterceptor` half). They
have to land together, or an Android build sends a header no route reads, or a route reads a header
Android does not send.
