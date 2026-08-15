# TikTok Removal — Mobile Patches (V1) — SUPERSEDED

**Status: the TikTok/Facebook composer removal described here is now applied directly in-tree.**
The two `.patch` files that used to live in this directory have been deleted, because a patch that
is already applied is not a to-do — it is a trap. Re-applying them would conflict, and they encode
an older design than what shipped.

## What actually happened

Product decision 2026-07-26 removed TikTok as a video source. The web change shipped, and the
Android/iOS source changes were parked here as `.patch` files "to be applied on their own platform
branches". **They were never applied.** For roughly three weeks both native composers kept
offering TikTok:

- Android `detectSource` recognized `tiktok.com`/`facebook.com`, so a pasted TikTok URL was
  attached and posted.
- iOS rendered the source selector from `ExternalSource.allCases`, so TikTok and Facebook were
  literally buttons in the composer.

This did **not** surface as an error. Neither native client calls `POST /api/links/resolve` (the
endpoint that 400s an unsupported source) — they post `source_type` straight to `POST /api/reviews`,
which stores it verbatim, and the DB CHECK still permits `'tiktok'` for backward compatibility. So
the drift silently created rows no client can play, rather than failing loudly.

## What replaced it

Both clients now read the provider list from the backend instead of carrying one:

| Client | Reads | Gate |
| --- | --- | --- |
| Web | `LINK_VIDEO_PROVIDERS` (direct import) | `detectSource` in `src/lib/links/platforms.ts` |
| Android | `GET /api/config` → `video.linkProviders` | `ReviewComposerViewModel.supportedLinkProviders` |
| iOS | `GET /api/config` → `video.linkProviders` | `CreateReviewViewModel.supportedSources` |

`src/lib/links/clientProviderParity.test.ts` is the CI guard. It derives the unsupported set from
`LINK_VIDEO_PROVIDERS`, so re-enabling a provider relaxes the guard automatically rather than
requiring a second edit. It also asserts the read paths still decode `tiktok`/`facebook`, so legacy
rows keep degrading to the generic `video` treatment.

## Still unapplied from the original patches

Nothing. The last outstanding item shipped separately, as its own change:

- **YouTube poster `maxresdefault` → `hqdefault`** — applied to both native composers
  (`android/.../reviews/ui/ReviewComposerViewModel.kt` `onLinkUrlChanged`,
  `ios/TappyAI/Features/Reviews/UI/CreateReviewViewModel.swift` `handleURLChange`). The web resolver
  uses `hqdefault` because `maxresdefault` 404s for many videos and most Shorts
  (`src/lib/links/platforms.ts`). `src/lib/links/nativePosterParity.test.ts` is the CI guard: it
  derives the expected URL from `youTubeThumbnail` rather than spelling out `hqdefault`, so changing
  the web derivation flags the native clients instead of quietly leaving them behind.
