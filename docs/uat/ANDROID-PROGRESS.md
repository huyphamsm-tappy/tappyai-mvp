# Android parity — progress log (branch `android/parity-2026-09-28`, worktree `C:\wtandroid`)

Base: `origin/rc/web-uat` @ 348cfe0. Only `android/` and `docs/uat/` are changed.
Evidence: `docs/uat/evidence/android-parity/<item>/` (web UAT | Android uat | D:\redesign side by side).

## Setup
- **uat build type** (6e6ae6c): API `https://uat.tappyai.com/`, Supabase = audit `zdaprdfgpbpnxyofagmc`,
  `x-vercel-protection-bypass` read at build time from the file named in `android/local.properties`
  (`TAPPYAI_UAT_VERCEL_BYPASS_FILE`), only when a uat task runs. Installs as `com.tappyai.app.staging`
  (google-services.json has no other id), label "TappyAI UAT". Proof that release carries no secret:
  `ReleaseCarriesNoUatSecretTest` passes in debug / release / uat unit tests, and the generated
  `release/BuildConfig.java` does not contain the secret (checked by byte search, not printed).
- Web captures: Playwright, 412×915 mobile, dark, vi-VN, bypass sent as a header.
- Android captures: dedicated emulator `Pixel_8` on port 5556 (the `Pixel_8_uat` emulator belongs to another session), dark mode.

## D:\redesign → web → Android
| Mockup | Web screen | Android screen |
|---|---|---|
| Sep 10 11_46 — 18+ gate (Ngày/Tháng/Năm) | `/age-check` | inline `GuestAgeDeclaration` in chat (no screen) — TODO |
| Sep 11 11_12 — onboarding "Bước 2/4" interests | onboarding | `OnboardingScreen` (2 steps) — TODO |
| Sep 22 01_41 — "Gợi ý cho bạn" nearby places | `/recommendations` | `RecommendationsScreen` — TODO |
| Sep 22 01_53 — Tài khoản & Cài đặt | `/profile` rows | Tôi hub — **fixed d8fd93b** |
| Sep 28 02_06 — Đã lưu | `/profile/favorites` | `SavedScreen` — TODO |
| Sep 28 02_12 — Viết content | `/viet-content` | `VietWriterScreen` — TODO |

## Done
| # | Item | Commit | Status |
|---|---|---|---|
| 1 | uat build type + bypass header only in uat | 6e6ae6c | done |
| 2 | Tôi hub = web accountRows() / mockup (9 rows, labels, guest locked rows, no privacy card) | d8fd93b | fixed; PASS for guest view (evidence profile-hub/) |
| 3 | Login = web card (email+password, Tạo tài khoản, Khách) + dark-mode colours | 05e3d84 | fixed; sign-in itself not yet exercised (needs owner) |

## Waiting on owner
- Sign in (web window + emulator window) — Claude does not type passwords.
