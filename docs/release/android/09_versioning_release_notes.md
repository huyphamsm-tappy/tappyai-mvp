# 09 · Versioning & Release Notes

## Current version (verified in `android/app/build.gradle.kts`)
- `versionCode = 1`
- `versionName = "0.1.0"`
- Debug variant appends `.debug` to the applicationId and `-debug` to the versionName; staging appends `.staging` / `-staging`.

## Versioning scheme (recommended)
- **`versionName`** — human-readable **SemVer** `MAJOR.MINOR.PATCH`.
  - `MAJOR` — breaking UX/behavior changes.
  - `MINOR` — new features (parity with web features as they land).
  - `PATCH` — bug fixes only.
- **`versionCode`** — a monotonically increasing integer. **Every upload to Play must increase it**, even for a re-upload of the same `versionName`. Never reuse or decrease it.
- Suggested convention: bump `versionCode` by 1 per Play upload; keep `versionName` aligned to SemVer. Optionally derive `versionCode` from CI build number later.

### Launch-version decision
`0.1.0` signals pre‑1.0 / early. Two valid options:
- **Ship as `0.1.0`** — honest "first public release, actively evolving." Fine for an initial launch (internal/closed → production).
- **Bump to `1.0.0`** for a public GA if you want to signal production readiness. If you do this, set `versionName = "1.0.0"` and keep `versionCode = 1` for the very first upload (or higher if you already uploaded test builds).
> Recommendation: use **`1.0.0`** for the first **Production** track submission (cleaner store impression), and reserve `0.x` for internal/closed testing. Whichever you choose, this kit's copy doesn't hard-code the number except here.

---

## Release notes (What's new) — max 500 chars per language

### First release — Vietnamese (vi-VN)
```
Chào mừng đến với TappyAI — trợ lý AI thuần Việt!
• Trò chuyện với AI để tìm quán ăn, địa điểm, du lịch, spa, mua sắm.
• Khám phá địa điểm, xem bản đồ, lưu nơi yêu thích.
• Cộng đồng review: đọc & đăng bài có ảnh, thả tim, bình luận.
• Tiện ích: đổi tiền, dịch nhanh, quét ảnh, theo dõi giá, ưu đãi.
• Giải trí: Tarot, Tử Vi, con giáp & trò chơi nhỏ.
• Hỗ trợ tiếng Việt/Anh, giao diện sáng–tối.
```

### First release — English (en-US)
```
Welcome to TappyAI — your Vietnamese-first AI assistant!
• Chat with AI to find food, places, travel, spa and shopping.
• Discover places, view maps, save favorites.
• Reviews community: read & post with photos, like, comment.
• Tools: currency converter, quick translate, photo scan, price tracking, deals.
• For fun: Tarot, Vietnamese astrology, zodiac and mini-games.
• Vietnamese & English, light and dark themes.
```

---

## Change-log template for future releases
Keep a running `CHANGELOG` and mirror the user-facing subset into the Play "What's new".

```
## [x.y.z] — YYYY-MM-DD  (versionCode N)
### Added
- …
### Changed
- …
### Fixed
- …
### Notes
- Data Safety / permissions / policy changes, if any (re-review Data Safety & Content Rating when relevant).
```

### Reminders tied to versioning
- Re-take **Content Rating** questionnaire if content materially changes (e.g. moderation, new UGC, IAP).
- Update **Data Safety** if data collection/sharing changes (e.g. adding an analytics SDK, billing).
- If you add push notifications later, you'll need `POST_NOTIFICATIONS` + an FCM service + a Data Safety update.
