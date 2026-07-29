# 10 — Testing

**Frozen commit:** `79d05f3`. This chapter is the test *inventory and posture*; the executed
evidence (counts, exit codes, live probes) is in `13_Release_Gate.md`. Nothing here is claimed to
"pass" without the corresponding evidence in Chapter 13.

---

## 1. What automated testing exists

| Kind | Tooling | Runs where | Gate? |
|---|---|---|---|
| Unit / component | **Vitest** + Testing Library (jsdom per-file) | Local, pre-merge | **NOT CI-gated** |
| Architecture guard | `scripts/architecture/check.mjs` | **GitHub Actions** (`architecture-guard.yml`) | **CI-gated** |
| Type + lint | `next build` | Local + Vercel build | **Build-gated** (`next.config.mjs`) |

**Executed during the freeze (evidence in `13_Release_Gate.md`):**
`npx vitest run` → **31 test files, 253 tests, all passing.**

> **⚠ The unit tests do NOT run in CI.** The only GitHub Actions workflow is the architecture
> guard. Test counts appear as claims in commit bodies (`177 → … → 253`). The real automated
> gates are (a) the architecture guard and (b) the TypeScript/ESLint build gate. This is a
> genuine gap — a regression that a test would catch can still merge if the author skips
> `vitest` locally. Carried into `12_Open_Items.md`.

---

## 2. Test inventory (31 files, as executed)

### AI pipeline — the highest-risk subsystem, best covered
- `src/lib/ai/streamEnrichment.test.ts` — enrichment contract: per-place grouping, boundary
  detection, no injection into `[TAPPY_PLAN]`/`[CTA_BUTTONS]`/`[FOLLOWUPS]`.
- `src/lib/ai/placeMatch.test.ts` (7) — the 4-tier place-name matching cascade.

### Reviews / video feed
- `src/app/reviews/feedBackRestore.test.tsx` — Bug #8/#17 (active clip survives Back, same- and
  cross-document, consumed-flag guard).
- `src/app/reviews/profileGridDelete.test.tsx` — grid behaviour after delete.
- `src/components/explore/attachedSoundMute.test.tsx` — attached-sound mute race.
- `src/lib/ui/gridFill.test.ts` — trailing-filler arithmetic.

### Commerce / finance / links
- `src/lib/deals/partnerDeals.test.ts` (10) — Deals V1 catalog + click counter.
- `src/lib/finance/exchange.test.ts` — Bug #15 cross-rate + missing-currency throw.
- `src/lib/finance/format.test.ts` — rate/amount formatting, never-zero.
- `src/lib/platformLinks/travel.test.ts` — flight links (route + `DD-MM-YYYY` + never-aviasales).

### i18n / TTS
- `src/lib/i18n/localePersistence.test.ts` — the `dd74359` persistence regression.
- `src/lib/tts/voiceSelection.test.ts` (8) — never a wrong-language voice; picks best when present.

### Back office analytics (13 files)
`activationAnalyticsClient/Service`, `activationDimensionWriter`, `activationEvaluationRunner`,
`activationRuleEngine`, `authAnalyticsClient/Service`, `rollupWindow`, `userAcquisitionService`,
plus route + **schema** tests for `/api/admin/analytics/{activation,auth}`, plus two component
tests.

### Music + tracking
`formatDuration`, `normalizeSearch`, `validateSelection`, `deviceContext`.

---

## 3. Coverage posture

**Coverage follows a clear convention: every new pure/deterministic library ships with a
colocated `.test.ts`.** The V1 bug sweep produced named regression tests for language
persistence, TTS voice, exchange-rate precision, grid fill, feed back-restore, attached-sound
mute, place matching, stream enrichment, deals, and travel links — each mapping to a specific
fixed bug in `08_Bug_History.md`. The back-office analytics subsystem is the single
best-covered area.

**Untested surfaces (the large, stateful ones):** `ChatInterface.tsx` (1466 lines),
`api/chat/route.ts`, `reviews/new/page.tsx`, the music module service/repository, `lib/boi`,
`lib/memory`, `lib/preferences`, and the utility pages. These are exercised only by manual/UAT
verification.

---

## 4. Regression-test policy — honoured, but late

The standing rule is that every automatable bug gets a permanent regression test that is never
deleted. The inventory confirms this **held from ~2026-07-22 onward** — from `b90fc0a` almost
every fix ships a suite. Fixes **before** that date largely have none (the eleven-commit
autoplay cluster and the desktop-arrows cluster shipped with zero tests). The 253-test total is
therefore heavily weighted to the final week of V1 work. See the pattern analysis in
`08_Bug_History.md` §Patterns.

**A consequence to internalise:** unit tests here cover *arithmetic and contracts*, not
*rendering*. Every cosmetic bug in the freeze (gray-cell, desktop arrows, autoplay, enrichment
layout) needed 2–3 iterations and was ultimately closed by **live DOM inspection / production
screenshots**, not tests. Android should expect the same — visual parity needs visual
verification.

---

## 5. Test traps recorded

1. **Run vitest from inside the intended checkout.** Running `npx vitest run` from the repo root
   picks up test files inside `.claude/worktrees/**` and reports 2 spurious failures (the `@`
   alias resolves to the wrong `src`). Not production defects. (`13_Release_Gate.md` §4.3.)
2. **The frozen commit is in a worktree, not the primary tree.** The primary working directory is
   192 files behind production; running tests there gives a different, smaller, wrong set.

---

## 6. How to run

```bash
git worktree add ../tappyai-freeze 79d05f351f20550e6f4e981cb9e4c3e29bf8837b
cd ../tappyai-freeze
npm ci
npx vitest run          # 31 files / 253 tests
npm run lint            # 0 errors, 26 accepted warnings
npm run build           # type + lint gate; 72 routes
node scripts/architecture/check.mjs   # the CI guard
```
