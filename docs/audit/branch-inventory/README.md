# Branch inventory — 2026-09-17/18 (report only; nothing merged, rebased or changed)

Raw data (one row per ref / worktree, generated read-only):
- `branches-2026-09-17.tsv` — all **663 refs** (local heads + `origin/*`): tip date, subject, ahead/behind
  vs `design/v3-phase4` and vs `origin/main`, and 14 ancestry flags (see legend).
- `worktrees-2026-09-17.tsv` — all **89 worktrees**: path, branch, HEAD, HEAD date, modified / untracked counts.

`origin` fetched first; `origin/main` = `842379b` (PR #251, 2026-09-11). Web prod = `f16a71f` (#247).

## Legend — how each feature was fingerprinted (ancestry of a commit, `git merge-base --is-ancestor`)

| Flag | Meaning | Anchor |
|---|---|---|
| WEB | web PlaceDecision card grid + filters (`src/components/chat/PlaceDecision.tsx`, `grid sm:grid-cols-2 lg:grid-cols-3`, "Tất cả / Đang mở cửa / Đánh giá cao") | `f8dca88` 2026-09-10 "complete phase 4 design and provenance" — the common root of every V3 branch. No branch has a horizontal *swipe* carousel; this grid is the "carousel". |
| APC | Android `PlaceCard.kt` renderer (vertical `Column` of cards fed from the `8:` live frame) | `60df033` 2026-09-11 |
| CCPc | CCP cross-platform contract (Android + iOS render the canonical commerce action) | `66efcd7` 2026-09-14 |
| AFF | "affiliate cross-platform" = `merge(affiliate): integrate origin/main into CCP canonical` + 1 test fix. There is no separate affiliate feature: the branch is `feat/ccp-canonical` + `origin/main` (#251). | `764effd` 2026-09-17 |
| REV / BOOK | review links (TikTok `d0d221e` #81, `review_actions` `2ee2baf` #194) — on `origin/main` since August, so on every live branch; `booking_links` arrive with `f8dca88` | `2ee2baf`, `f8dca88` |
| CCP | Commerce Capability Platform core (`src/lib/ccp/**`, 17 providers, flags off) | `e2c37c9` 2026-09-13 (`56a5726` = isolated MVP on `feat/ccp-mvp`) |
| G1 / G2 / G3 | place-claim attribution ladder / snippet-price guard / media placement, all flag-gated | `c07e98b` / `f25f542` / `7796ac5` 2026-09-17 |
| M89 / M2e / M96 | merge of `origin/main` into V3 / rollback SQL / D1-revised guest gate | `89e65f7` / `2e3ec8a` / `968472e` |
| MAIN | contains `origin/main` tip (#251 age gate) | `842379b` |

## The branches that matter (every ref containing the V3 web, 12 of 663; remotes mirror the locals)

| Branch | Tip (date · subject) | vs `design/v3-phase4` | vs `origin/main` | WEB | APC | CCPc | AFF | CCP | G1–G3 | main merge / D1 | Worktree (dirty) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **`merge/main-into-v3`** | 2026-09-17 22:14 · D1 revised — guests keep the trial behind an 18+ self-declaration | +28 / −0 | +90 / **−0** | ✓ | ✗ | ✗ | ✗ | ✗ | ✓✓✓ | ✓ 89e65f7 · 2e3ec8a · 968472e | `.claude/worktrees/g1-place-guard` (clean) |
| `fix/g1-place-guard-attribution` | 2026-09-17 21:14 · parity CRLF fix | +11 / −0 | +86 / −13 | ✓ | ✗ | ✗ | ✗ | ✗ | ✓✓✓ | ✗ (pre-merge state of the line above) | — |
| `design/v3-phase4` (tag `layout-approved-2026-09-17` = `f6712b8`) | 2026-09-15 14:03 · anon quota naming | 0 | +75 / −13 | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `.claude/worktrees/v3-phase4-design` (9 mod / 7 untracked — home greeting + docs/audit) · `audit-nonprod` (detached, docs only) |
| `claude/admiring-euler-fd4c48` | 2026-09-15 11:19 · consultative decision core | +5 / −2 (forks at 3731efa) | +78 / −13 | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `cool-vaughan-b3c7ff` (**20 mod / 13 untracked** — Explore public profile v2, review_likes private, VnExpress editorial; needs 2 migrations) |
| **`feat/affiliate-cross-platform`** (= `origin/…`) | 2026-09-17 15:27 · reconcile two merge-artifact test contracts | +41 / −34 | +69 / **−0** | ✓ (CCP-modified) | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ main via 764effd; **no D1–D4** | `D:/…/.worktrees/affiliate-xplat` (clean) |
| `feat/ccp-canonical` (= `origin/…`, = `origin/backup/ccp-canonical-2026-09-17`) | 2026-09-17 09:31 · multilingual false-limitation guard | +28 / −34 | +67 / −11 | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ (has #248 via 997f55c, not #251) | `D:/…/.worktrees/ccp-canonical` (clean; built the emulator-5554 APK) |
| `integration/v3-canonical` | 2026-09-17 20:14 · complete personal collections parity | +20 / −34 | +59 / −11 | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | `D:/…/tappyai-v3-canonical` (**97 mod / 55 untracked**, 12.8k+/9.5k− — Android inbox/messaging/planner/scam knowledge, iOS l10n, web scam-shield; last edit 2026-09-17 19:58) |
| `feat/g1-growth` | 2026-09-13 15:51 · finalize v3 explore and creator experience | +13 / −34 | +52 / −11 | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | `D:/…/.worktrees/g1-growth` (15 mod / 47 untracked) — ancestor of `integration/v3-canonical` |
| `fix/places-marker-contract` | 2026-09-11 10:07 · iOS Place Card on the shared marker contract | +10 / −34 | +49 / −11 | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | `D:/…/tappyai-places-contract` (clean) — ancestor of both canonical lines |

Everything else (651 refs) predates `f8dca88` or is a `main`-era feature branch: none carries the V3 web, the Android
PlaceCard, CCP or the guards. `feat/ccp-mvp` (`56a5726`, 09-13) is the isolated CCP MVP later re-applied as `e2c37c9`.
`feat/v3-user-data-foundation` / `claude/determined-knuth-609039` / `claude/ecstatic-turing-0cf4b7` are #250/#251 (already in `origin/main`).

## Shape of the fork

```
f16a71f (#247, prod) ── origin/main ── b85ddd9 (#248) ── 842379b (#251)
   │
   └─ f8dca88 (V3 phase-4 design, 09-10)  ← common root of ALL V3 lines
        ├─ design/v3-phase4 (+34: 7f8eb0d Serper-first/TikTok review, share brochure, 15 screen redesigns,
        │    scam alerts, global AI quota)  ── G1 c07e98b → G2 f25f542 → G3 7796ac5 → 89e65f7 merge(main #251)
        │    → 2e3ec8a → 968472e   = merge/main-into-v3            ← LAYOUT TAG on f6712b8
        └─ 997f55c merge(main #248) → 60df033 Android PlaceCard → d675990 iOS card → 9c08e7d
             ├─ e2c37c9 CCP core … 66efcd7 contract … 4b84aa9  = feat/ccp-canonical
             │     └─ 764effd merge(main #251) → 475f31c        = feat/affiliate-cross-platform
             └─ 7b0ee0c (g1-growth) … 1ec07bb … c1e1227          = integration/v3-canonical (+97 uncommitted)
```

`design/v3-phase4` and the canonical lines have **never** been merged into each other: 34 commits on one side, 28
(CCP) + 20 (canonical) on the other, both touching chat/route/enrichment/food and the Android chat screen.

## Which branch is the most complete "new version"?

No single branch has all three. Scored on the owner's list:

| | web PlaceDecision | Android PlaceCard | affiliate/CCP | review links + order/booking CTAs | V3 redesign stack (34) | G1/G2/G3 + guardrails | main #251 + owner decisions D1–D4 | uncommitted work attached |
|---|---|---|---|---|---|---|---|---|
| `merge/main-into-v3` | ✓ (V3 original) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ (D1 revised, D2 radius, D3 rollback, D4 gate) | none |
| `feat/affiliate-cross-platform` | ✓ (CCP re-ordered CTAs, dropped the Tappy-rating line) | ✓ | ✓ | ✓ (+ CCP handoff) | ✗ (none of the 34) | ✗ | main merged, but D1 (guest gate) / D2 / D3 / D4 **not applied** | none |
| `integration/v3-canonical` | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ (#248 only) | 97 mod / 55 untracked |

`feat/affiliate-cross-platform` is the most complete on **web + Android + affiliate** as literally asked; it is the
least complete on everything the owner has decided and verified this week (redesign, Serper-first cards, share,
scam alerts, quota, G1–G3, the D1–D4 merge, the protected-layout tag).

## Recommendation — ONE integration base: `merge/main-into-v3`

Why this one and not `feat/affiliate-cross-platform`:
1. It already contains `origin/main` **with the owner's D1–D4 decisions implemented and tested** (11 605 tests, tsc clean,
   protected snapshot tests unchanged, migrations rehearsed). `affiliate` merged the same `origin/main` mechanically
   (`764effd`) — chat there would require an account (#251) with no guest declaration, no radius decision, no rollback SQL.
2. It carries the layout baseline the owner approved (`layout-approved-2026-09-17` is on this line) and G1/G2/G3
   behind flags; the RELEASE GATE was written against it.
3. The 34 V3 commits are far larger and more user-visible (15 screen redesigns, share/brochure, Serper-first cards
   with TikTok review links, scam alerts, global quota) than the 28 CCP commits, and CCP is *designed* to land
   flags-off (`feat(ccp): … (flags off)`), i.e. it is the natural thing to bring *in*.
4. Bringing CCP in means reviewing its PlaceDecision/food.ts edits against the RELEASE GUARDRAILS (below); doing it
   the other way round would silently make CCP's card the baseline.

### What must be brought into it, in order

**Step A — `feat/affiliate-cross-platform` (brings Android PlaceCard + iOS card + CCP + the CCP web wiring).**
Merge the branch, not cherry-picks (28 commits, one lineage). Dry run `git merge-tree --write-tree` → **20 conflicting
files**:

| Group | Files | Why |
|---|---|---|
| Android chat (5) | `chat/ChatScreen.kt`, `chat/ChatViewModel.kt`, `chat/TripPlanCard.kt`, `chat/data/ChatRepository.kt`, `chat/data/RealChatRepository.kt` | V3: share parity / plan share / quota copy. CCP: `PlaceCards` wiring, `livePlaces`, commerce callbacks, tappable handoff links. Both real; keep both. |
| iOS chat (3) | `Features/Chat/Model/ChatModels.swift`, `Model/ContentParser.swift`, `UI/ChatViewModel.swift` | same split (V3 share parity vs iOS Place Card `d675990`). iOS is frozen — resolve textually, cannot build. |
| Web backend (4) | `src/app/api/chat/route.ts` (V3: G-flags + D1 gate + ageBand; CCP: commerce wiring; **both merged #251 → duplicate age-gate hunks**), `src/lib/ai/streamEnrichment.ts` (G1–G3 + capture points vs CCP Phase 6 commerce links, ~170 lines), `src/lib/ai/tools/food.ts` (V3 Serper-first 7f8eb0d ~260 lines vs CCP provider pass ~280 lines — the hardest file), `src/lib/ai/tools/travel.ts`, `src/lib/recommendation/fromToolResult.ts` |
| Web UI (3) | `src/components/ChatInterface.tsx` (both applied main's age-gate branch), `src/app/(home)/page.tsx` (both merged #251 — pick either, identical intent), `src/lib/i18n/useTranslation.ts` |
| Tests (4) | `chatEntryContract.test.tsx`, `reviews/exploreAskTappyBridge.test.tsx`, `tools/placeDestinationScope.test.ts`, `tools/placeLocationGrounding.test.ts` — expect the union of both contracts |

About 7 of the 20 are "both sides merged `origin/main` separately" (identical intent, mechanical); `food.ts`,
`streamEnrichment.ts`, `route.ts` and the Android chat pair are real three-way merges.

🚨 RELEASE GUARDRAILS: CCP changes protected surfaces — `PlaceDecision.tsx` (commerce "lead" action reordered ahead
of Maps; **the `tappyRating` line removed**), `food.ts` provider/row fields, Serper call budget. These need an explicit
owner decision (accept CCP's card ordering, or keep V3's and re-apply CCP behind its flag) before Step A is committed;
the card/marker snapshot tests will show exactly which one wins.

**Step B — `integration/v3-canonical` (brings Android Explore/Home/Tools/Profile V3 alignment, Android personal
collections, reviews fetch-by-id, web collections parity, `1ec07bb` chat place-decision parity / saved / share / nav,
`20260915_review_shares.sql`).** 8 unique commits after `feat/ccp-canonical`'s base. Dry run vs `merge/main-into-v3`:
**18 conflicting files** — the same Android/iOS chat files as Step A (they will already be resolved), plus
`AndroidManifest.xml`, `src/app/api/profile/route.ts`, `src/app/profile/ProfileView.tsx`, `src/app/reviews/page.tsx`,
`src/lib/i18n/v3/web.ts`, `food.ts`, the two place-scope tests. Between Step A's result and this branch only
**4 files** conflict (`route.ts`, `api/profile/route.ts`, `travel.ts`, `fromToolResult.ts`), so do A before B.
One migration (`review_shares`) → same D3 treatment (SQL + rollback, owner applies).

**Step C — uncommitted work that lives only on disk (commit on its own branch first, then merge):**
- `D:/…/tappyai-v3-canonical` — 97 modified / 55 untracked on `integration/v3-canonical` (Android inbox + messaging +
  planner + scam-knowledge assets + appearance/notification prefs; iOS `Localizable.xcstrings`; web scam-shield, i18n).
  Unknown state, last touched 2026-09-17 19:58. Not merge-able until committed.
- `cool-vaughan-b3c7ff` — 20 modified / 13 untracked on `claude/admiring-euler-fd4c48` (Explore public profile v2,
  cover/bio, `review_likes` private, VnExpress editorial; **2 migrations must be applied first**). Branch itself is
  +5 on V3 (consultative decision core, `/reviews/new` composer, plan-share OG) — cherry-pickable, low conflict.
- `g1-growth` worktree — 15 / 47 (its commits are already inside `integration/v3-canonical`; the dirty files are unknown).
- `v3-phase4-design` (this session's base) — 9 modified / 7 untracked from a parallel session (home greeting/AI-first
  tests, i18n). Do not commit blindly.

**Step D — nothing to bring from `origin/main`** (already inside via `89e65f7`; `origin/main` has not moved since).

### Post-integration gate
Re-run the RELEASE GATE (12 turns flags OFF + 12 ON, web + Android) on the integrated branch; the protected
card/marker snapshot tests must pass unchanged unless the owner accepts CCP's card changes in Step A.
