# Android store listing kit — TappyAI

**Status:** preparation only. **Nothing submitted.** Publishing an Android app is a separate owner decision (release build, signing, account). This kit exists so that when that decision is made, every listing agrees with the web entity (`/about`) and the extension listing — one name, one description, one logo.

## Store facts (verify at submission; fees are for the developer account, not per app)

| Store | Developer registration | Listing | Organic discovery | Source |
|---|---|---|---|---|
| Google Play | **US$25 one-time** | free | Play search; Google Search surfaces Play listings | support.google.com/googleplay/android-developer/answer/6112435 |
| Samsung Galaxy Store | Seller Portal sign-up; no fee found | free | Galaxy Store search (pre-installed on Samsung — the largest Android OEM share in Vietnam) | developer.samsung.com/galaxy-store |
| Huawei AppGallery | free ("Join Huawei Developer portal for free") | free | AppGallery search | developer.huawei.com/consumer/en/appgallery |
| Xiaomi GetApps | registration documented; fee not stated | — | GetApps search | global.developer.mi.com |
| Apple App Store | US$99/year — **not free**; needs macOS | — | — | out of scope |
| APK aggregator sites | — | — | — | **rejected** (no control, malware association) |

Note on Vietnam: Samsung, Xiaomi and OPPO dominate Android shipments; Galaxy Store and GetApps are pre-installed alternatives to Play on those devices — free listings that reach a Play-less discovery surface. (Market-share claim: HYPOTHESIS from general knowledge; verify with current data before prioritising.)

## Canonical listing copy (must match `/about` and the extension listing)

| Field | Value |
|---|---|
| App name | TappyAI |
| Short description (≤80) | vi: `Trợ lý AI thuần Việt: ăn gì, mua gì, đi đâu — và Scam Shield kiểm tra lừa đảo.` · en: `Vietnamese-first AI for food, shopping, travel, beauty — plus Scam Shield.` |
| Full description | vi/en: the `/about` text (`about.intro`, `about.whatDomains`, `about.whatScam`, `about.whatShare`, `about.howSources`, `about.howHonesty`, `about.privacyBody`) |
| Category | Lifestyle (alt: Tools) |
| Content rating | to be completed by owner (app has an 18+ age declaration for accounts — disclose) |
| Privacy policy URL | https://www.tappyai.com/privacy |
| Website | https://www.tappyai.com |
| Support email | support@tappyai.com |
| Icon | `public/branding/otter-logo.png` (512×512 export needed) |
| Feature graphic | `public/feature-graphic.png` (1024×500 check) |
| Screenshots | real device captures only — the ones under `public/landing/screen-*.webp` are web captures; Android captures are an owner task (Pixel_8 emulator exists) |
| Data safety (Play) | declare: account data (email), user content (queries), location (optional, for local results), analytics (first-party `user_events` + PostHog). No selling. Encryption in transit. Deletion via `/delete-account`. |

## After publication (code-side, prepared)

- Add the Play listing to `public/manifest.json` `related_applications` (`platform: "play"`, `id: "com.tappyai.app"`) — keep `prefer_related_applications: false` so the PWA remains installable.
- Android App Links: publish the release signing cert SHA-256 → `ANDROID_APP_LINKS_SHA256` (server statement already served at `/.well-known/assetlinks.json`), then add the `autoVerify` https intent-filter and a native `/r/*` handler (see `DISTRIBUTION.md`).
- Attribution: Play Install Referrer is not wired (FUTURE); first-run web deep links from the app carry no `src` today.

## Do not

- Do not sideload-distribute an APK through aggregator sites.
- Do not buy installs, reviews or ratings.
- Do not claim "featured" or ranking.
