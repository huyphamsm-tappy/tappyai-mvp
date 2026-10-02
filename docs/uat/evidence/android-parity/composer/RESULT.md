# composer

Run `2026-09-28T13-51-39` · UAT `776f3926ecb915c7cc4a7289ecc787145763b1bb`

## android: PASS

- ✅ tab Video có gợi ý "mp4 · mov · tối đa 5 phút · 150MB"
- ✅ video tải lên xong ("Video đã tải lên") — 30 s
- ✅ server: bài ảnh đã lưu, có ảnh — {"body":"[E2E] ảnh từ Android mulb3foa","type":"photo","source":"upload","media":"","photos":["https://storage.googleapi
- ✅ server: bài video đã lưu (video/upload, media_url) — {"body":"[E2E] video từ Android mulb3foa","type":"video","source":"upload","media":"https://storage.googleapis.com/tappyai-media-uat/videos/
- ✅ server: bài link YouTube đã lưu — {"body":"[E2E] link YouTube từ Android mulb3foa","type":"video","source":"youtube","media":"https://www.youtube.com/watc
- ✅ hồ sơ "Đã đăng" có thêm các bài mới — 2 thẻ
- ✅ server: feed "Mới nhất" của người khác có các bài mới — 3/3
- ✅ Khám phá "Mới nhất" (tài khoản khác) hiện bài mới — caption chứa mã mulb3foa

## web: PASS

- ✅ server: bài ảnh (web) đã lưu
- ✅ server: bài video (web) đã lưu
- ✅ server: bài link (web) đã lưu

Side-by-side images: `D:/TappyAI-backups/android-parity-evidence/2026-09-28T13-51-39/composer/compare/` (9 steps).
Video + raw screenshots: `D:/TappyAI-backups/android-parity-evidence/2026-09-28T13-51-39/composer/{android,web}/` (outside git — rule 2026-09-28).

> Note: the web half comes from run `2026-09-28T13-35-55` (UAT `363b55c`); the Android half from the run above (UAT `776f392`). The Android flow was rerun alone after fixing the test-script bug (tapping the "Link" tab instead of the "Dán link" field; "Mới nhất" never shows the author their own posts, route.ts:60, so the check looks from another account).
