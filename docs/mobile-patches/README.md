# TikTok Removal — Mobile Patches (V1)

Product decision 2026-07-26: TikTok removed as a video source. These patches carry the
Android and iOS source changes **out of the Web branch** so they can be applied on their own
platform branches **without touching current owner WIP**. They are NOT built/verified here
(this environment is Windows — no Android SDK build, no Xcode).

The backend contract they depend on ships with the Web change:
`GET /api/config` → `video.linkProviders: ["youtube"]` (single source of truth).

---

## android-remove-tiktok-v1.patch

**Touches:** `android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewComposerViewModel.kt`

**What it does**
- `detectSource(url)` recognizes **YouTube only** (TikTok/Facebook URLs → `null` → cannot attach).
- Adds a single `supportedLinkProviders` field (default `["youtube"]`) that gates detection —
  no provider list hardcoded inline — plus `setSupportedLinkProviders(List<String>)` to apply
  `/api/config video.linkProviders`.
- YouTube poster `maxresdefault` → `hqdefault` (matches the web resolver).
- `ReviewSourceType` enum keeps `TikTok`/`Facebook` cases **on purpose** (legacy posts must still
  decode/render — backward compatibility).

**Apply**
```bash
# on the Android branch (the one holding the composer WIP), from repo root:
git apply --3way docs/mobile-patches/android-remove-tiktok-v1.patch
#   or, if it conflicts with WIP, review and merge by hand:
git apply --reject docs/mobile-patches/android-remove-tiktok-v1.patch   # creates .rej to resolve
```

**⚠ Expect conflicts:** the primary working tree has uncommitted changes to
`ReviewComposerViewModel.kt`. Apply on top of that WIP and reconcile.

**Remaining wiring (do in Android Studio):** call `vm.setSupportedLinkProviders(...)` after the
existing `/api/config` fetch (the onboarding path already fetches config) so the list is truly
config-driven at runtime rather than the default.

### Android verification checklist (Android Studio / Gradle)
- [ ] `./gradlew :app:assembleDebug` compiles (watch for unused `getLinkThumbnail`/`NetworkResult`/
      `linkMetaJob`/`isFetchingLinkMeta` — warnings only, but confirm no error).
- [ ] Paste a **YouTube** URL in the composer Link tab → recognized, poster (`hqdefault`) shows, can post.
- [ ] Paste a **TikTok** URL → **not recognized**, no attachment, cannot post.
- [ ] Paste a **Facebook** URL → not recognized.
- [ ] Open an existing/legacy **TikTok** review in the feed → renders gracefully (poster/no crash).
- [ ] After config wiring: with `/api/config video.linkProviders=["youtube"]`, only YouTube is accepted.

---

## ios-remove-tiktok-v1.patch

**Touches:**
`ios/TappyAI/Features/Reviews/Model/CreateReviewModels.swift`,
`ios/TappyAI/Features/Reviews/UI/CreateReviewView.swift`,
`ios/TappyAI/Features/Reviews/UI/CreateReviewViewModel.swift`,
`ios/TappyAI/Core/Config/AppConfigService.swift`

**What it does**
- `ExternalSource.detect` recognizes **YouTube only** (enum cases `tiktok`/`facebook` kept for
  legacy read).
- Composer selector iterates `vm.supportedSources` (default `[.youtube]`) instead of
  `ExternalSource.allCases`; `setSupportedLinkProviders([String])` applies the config list.
- YouTube poster `maxresdefault` → `hqdefault`.
- `AppConfigService` decodes `video.linkProviders` and adds `supportedLinkProviders()` (defaults to
  `["youtube"]`).

**Apply**
```bash
git apply --3way docs/mobile-patches/ios-remove-tiktok-v1.patch
```
iOS has **no uncommitted WIP**, so this should apply cleanly.

**Remaining wiring (do in Xcode):** call `vm.setSupportedLinkProviders(try await appConfig.supportedLinkProviders())`
when the composer appears, so the selector is config-driven at runtime.

### iOS verification checklist (Xcode)
- [ ] Project builds (`⌘B`) — no Swift errors; `AppConfig.Video` decodes (optional, won't break older config).
- [ ] `AppConfigService.supportedLinkProviders()` returns `["youtube"]` against production `/api/config`.
- [ ] Composer Link tab shows **only the YouTube** source button (not TikTok/Facebook).
- [ ] Paste a **YouTube** URL → detected, `hqdefault` poster, can post.
- [ ] Paste a **TikTok**/**Facebook** URL → not detected, cannot attach.
- [ ] Open a legacy **TikTok** review → renders gracefully (enum still decodes).
- [ ] After wiring `setSupportedLinkProviders`, the selector reflects the backend list.

---

## Cross-platform note
All three clients now consume the **same** backend list (`/api/config video.linkProviders`).
Web consumes it directly; Android/iOS default to `["youtube"]` and expose a setter — complete the
runtime wiring in each toolchain (steps above). The DB `source_type` CHECK still allows `tiktok`
for backward compatibility; legacy TikTok posts remain readable on every platform.
