# Phase 7 — Music hidden on Web / Android / iOS

2026-09-24 · worktree `D:/Claude/Projects/TappyAI/.worktrees/web-uat-rc` · branch `rc/web-uat`
HEAD **`b496f4a`** — unchanged. Nothing committed, nothing pushed.

A product/UI visibility change. **No music code was deleted, no migration removed, no music row
touched, no Jamendo data changed, no licensing decision made, and Music was not re-enabled.**

---

## 1. Every Music entry point found

Enumerated by route, by link target, and by affordance — not by file name, because three of these
had no "music" in their path.

| # | Entry point | Where |
|---|---|---|
| 1 | Sidebar row "Nhạc" → `/music` | web `V3Shell.tsx` |
| 2 | Smart Tools tile `music` → `/music` (feeds `/tools` **and** Home's rail) | web `lib/tools/registry.ts` |
| 3 | Explore top-bar tab "Music" → `/music` | web `ExploreStage.tsx` |
| 4 | The same top-bar tab on a public profile | web `users/[id]/PublicProfileView.tsx` |
| 5 | Legacy Home tool card → `/music` | web `HomeView.tsx` |
| 6 | Composer "Thêm nhạc" chip → `MusicPickerSheet` | web `reviews/new/page.tsx` |
| 7 | Composer selected-track card (replace / remove) | web `reviews/new/page.tsx` |
| 8 | The clip's spinning music disc → sound page | web `feedShared.tsx` → `ReviewMusicDisc` |
| 9 | Sound-page overlay from the feed | web `reviews/page.tsx` → `SoundSheet` |
| 10 | Sound-page overlay from a profile grid | web `reviews/ProfileTab.tsx` → `SoundSheet` |
| 11 | Attached-track card on a review (links to `/sound/<id>`) | web `reviews/[id]/ReviewDetailView.tsx` |
| 12 | Direct route `/music` (library **+ its search**) | web |
| 13 | Direct route `/music/upload` (UGC audio) | web |
| 14 | Direct route `/sound/[trackId]` | web |
| 15 | Smart Tools tile → `MusicRoute.Library` | Android `SmartTools.kt`, `HomeScreen.kt`, `SmartToolsScreen.kt` |
| 16 | Home landing callback `onOpenMusic` | Android `HomeTabHost.kt` |
| 17 | Smart Tools page route `SmartToolId.Music ->` | Android `HomeTabHost.kt` |
| 18 | Composer "Add music" button → `MusicPickerSheet` | Android `ReviewComposerScreen.kt`, `ReviewsScreens.kt` |
| 19 | The clip's sound pill → `SoundSheet` | Android `ReviewCard.kt` |
| 20 | Sound-sheet destination from the feed and the clip pager | Android `ReviewsNavHost.kt` (×2) |
| 21 | Sound-sheet destination from the profile grid | Android `ProfileTab.kt` |
| 22 | Attached-track card on the detail screen | Android `ReviewsScreens.kt` |
| 23 | Composer music section (Add-music + selected card) | iOS `CreateReviewView.swift` |
| 24 | Composer picker sheet `musicPickerOpen` | iOS `CreateReviewView.swift` |
| 25 | The clip's music disc in the action rail | iOS `ReviewActionRail.swift` |
| 26 | Sound page sheet from the feed | iOS `ReviewsFeedView.swift` |

**Measured and found to need nothing:** iOS `MusicLibraryView` and `MusicUploadView` are declared
and **never presented** — iOS has never had a library entry point. Recorded in the test so a later
pass does not add one while Music is withdrawn. `settings.copyright` on all three platforms is the
copyright / notice-and-takedown POLICY, which is legal reference material and a rights holder's
route to file a complaint — it is not a Music entry point and was left alone.

## 2. The mechanism — the app's existing convention, one flag per platform

| Platform | Flag | Served / mirrored |
|---|---|---|
| Web | `SHOW_MUSIC` in `src/lib/config/product.ts` | also `flags.showMusic` from `GET /api/config` |
| Android | `com.tappyai.app.ProductFlags.SHOW_MUSIC` | new file, mirrors `product.ts` |
| iOS | `ProductFlags.showMusic` (`Core/Config/ProductFlags.swift`) | new file; `AppConfigService.Flags` also gained `showMusic: Bool?` so the server value is decodable later |

Web follows `SHOW_MARKETPLACE` exactly: a gated entry point, and `notFound()` for a direct visit.
**No new error page was invented.** Android follows its own `SHOW_PRO_UPGRADE` precedent, promoted
to a shared object because four packages have to agree on this one.

All three are set to the same value, and `musicHidden.test.tsx` fails if they drift.

## 3. Web — what is hidden

Rows 1–11 are gated with `SHOW_MUSIC`; rows 12–14 call `if (!SHOW_MUSIC) notFound()`.

The composer's **payload** is gated too (`if (SHOW_MUSIC && music)`), so a restored draft cannot
post a track the UI no longer offers. Hiding the tile at the **registry** rather than at each
surface is what makes `/tools`, Home's rail and the sidebar agree — the registry is the single list
all three read.

Verified on the running RC build (`localhost:3111`, non-prod Supabase):

```
/music                                          -> 404
/music/upload                                   -> 404
/sound/<id>                                     -> 404
GET /api/config  flags -> { showMusic: false, showScamShield: true, showProUpgrade: false, showAppConnections: false }
```

Rendered-DOM sweep for `a[href^="/music"]`, `a[href^="/sound"]` and the words "Nhạc"/"Music":

| Page | Music links | "Nhạc"/"Music" in text |
|---|---|---|
| `/` | 0 of 59 links | no |
| `/tools` | 0 of 41 | no |
| `/deals` | 0 of 32 | no |
| `/reviews` (Explore) | 0 — top bar is `Khám phá · Hỏi Tappy · Kế hoạch` (was 4 tabs) | no |
| `/users/<id>` | 0 — sidebar and top bar both clean | no |
| `/users/<id>` → clip pager | 0 links, no disc, no sound pill | no |

## 4. Android — what is hidden

- `smartTools()` is the new gated view of the registry; `SMART_TOOLS` stays the full 9-row web
  mirror. Home's rail (`HomeScreen.kt`) and the Smart Tools page (`SmartToolsScreen.kt`) both read
  the gated list, so the tile is absent from both.
- `HomeTabHost.kt`: `onOpenMusic` and `SmartToolId.Music ->` are refused by the flag, so no stale
  callback can reach `MusicRoute.Library`.
- Composer: `AddMusicButton` is not composed, and `onAddMusic` cannot open the picker.
- `ReviewCard.kt`: the sound pill — the tap target for the sound page — is not composed.
- `ReviewsNavHost.kt` (×2) and `ProfileTab.kt`: the `SoundSheet` destinations are refused.
- `ReviewsScreens.kt`: the attached-track card is dropped from the detail list.

The `com.tappyai.app.music` package, its API, repository and screens are untouched.

## 5. iOS — what is hidden

- `CreateReviewView.musicSection` becomes an empty `@ViewBuilder` — no Add-music button, no
  selected-track card. Its body moved to `musicSectionBody`, unchanged.
- The picker sheet binding is refused (`ProductFlags.showMusic && vm.musicPickerOpen`), so a
  restored state cannot present it.
- `ReviewActionRail`: `ReviewMusicDisc` is not built.
- `ReviewsFeedView.soundPageBinding` returns `nil`, so the sound page cannot be presented.

`Features/Music` and the view models are untouched. The existing architecture is unchanged: these
are four conditionals, no new types, no navigation rework.

## 6. Entry-point audit

| Music Entry Point | Web | Android | iOS |
|---|---|---|---|
| Main navigation (sidebar / Home rail) | Hidden | Hidden | Hidden (never existed) |
| Smart Tools catalogue | Hidden | Hidden | Hidden (never existed) |
| Explore | Hidden | Hidden | Hidden (never existed) |
| Profile surfaces | Hidden | Hidden | Hidden (never existed) |
| Composer | Hidden | Hidden | Hidden |
| Music search | Hidden (inside `/music`, now 404) | Hidden (inside the library screen, unreachable) | Hidden (inside the picker, unreachable) |
| Music library | Hidden (404) | Hidden (unreachable) | Hidden (no presenter) |
| Music detail / sound page | Hidden (404) | Hidden | Hidden |
| Music upload | Hidden (404) | n/a — never built | Hidden (no presenter) |
| Clip music disc / sound pill | Hidden | Hidden | Hidden |
| Attached-track card on a review | Hidden | Hidden | n/a — never built |
| Feature discovery cards / menus | Hidden | Hidden | Hidden |
| Direct normal-UI route | Hidden (404) | Hidden | Hidden |

## 7. Tests

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npx next lint` | **0 errors** |
| `git diff --check` | clean |
| Vitest project `app` | **703 files · 12,987 passed · 0 failed** (10 skipped) |
| Vitest project `db` | **29 files · 805 passed · 0 failed** |
| Android `:app:compileDebugKotlin` | **BUILD SUCCESSFUL** |
| Android `:app:testDebugUnitTest` | **745 tests · 0 failed** |
| iOS | **not compiled — no macOS on this host.** Covered by the static parity checks in `musicHidden.test.tsx`, which assert each Swift gate by source. Flagged, not claimed. |

New: `src/components/v3/musicHidden.test.tsx` — 38 assertions covering the flag on all three
platforms, every web gate, the three `notFound()` routes, every Android gate and every iOS gate,
plus a check that the music packages are still present (hidden, not deleted).

Three existing tests were updated, each for the same reason and with the reason written in:

| Test | Was | Now |
|---|---|---|
| `homeAiFirst.test.tsx` — "leaves no tool route unreachable" | `/music` in `REQUIRED_TOOLS` | removed, with a note that it is unreachable **on purpose** and returns when the flag flips |
| `exploreStage.test.tsx` — top-bar composition | 4 tabs incl. Music | 3 tabs |
| `exploreStage.test.tsx` — branding check | `.v3-xp-nav a` length 4 | length 3 |
| `SmartToolsTest.kt` (Android) | Discover = 2 tools; page/Home read `SMART_TOOLS` | Discover = 1 offered of 2 registered; page/Home read `smartTools()`; Music's route branch asserted to be flag-guarded |

## 8. Remaining issues

1. **The backend is still live and serving.** By instruction, no backend change was made:
   `GET /api/music/*` and `GET /api/sound/*` still answer, `/api/upload/audio` still accepts an
   authenticated POST, and the catalogue rows are untouched. Nothing in normal product UI reaches
   them, but they are not closed. Closing them is the separate music/licensing decision — and note
   that the Phase 7 line's answer to the reuse and UGC-audio routes was **410**, not a hidden entry
   point (F-024 / F-034; `PHASE7-AUDIT.md` §6.1).
2. **iOS was not compiled.** No macOS host. The four gates are single conditionals with no type
   changes, and each is pinned by a source assertion, but a real build has not run.
3. **Deep links.** No platform exposes a music deep link through normal UI (`DeepLinkHandler`
   handles `/copyright` only, and Android's `ComposerWithSound` route is only reachable from Sound
   Detail, which is now unreachable). A hand-typed web URL gets a 404.
4. **`music_saved`** remains a real table with a real save/unsave route and no list surface — the
   near-miss already recorded in `SavedView.tsx`. Unchanged, and still not listed anywhere.
