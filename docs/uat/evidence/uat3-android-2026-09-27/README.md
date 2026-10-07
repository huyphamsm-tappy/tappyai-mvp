# UAT3 — Android device run, 2026-09-27

**Device: the `Pixel_8_uat` EMULATOR (headless, API 34), not a physical phone** — `adb devices` showed no phone
attached and Windows listed no USB Android device. Debug app `com.tappyai.app.debug` built by
`scripts/uat/build-android-local.ps1 -Reverse` (API `http://localhost:3007/`, Supabase **audit**), `adb reverse tcp:3007`.

Accounts: three throwaway audit users made by `scripts/uat/throwaway-accounts.mjs` (never an existing account); the
Android build has no email login (`SHOW_EMAIL_LOGIN = false`), so each was signed in through the app's own
`tappyai://auth-callback` deep link with a session minted by `auth.admin.generateLink` (magic link). All three deleted at
the end (auth 0 / public rows 0 / queue 0). "XÓA" was typed with real Gboard Telex key taps (x o a s → "XOÁ"); no
ADBKeyboard was installed; the IME was never changed (`LatinIME` before and after).

| step | result | evidence |
|---|---|---|
| 12-turn multi-domain thread (Sài Gòn → Quy Nhơn plan → MacBook → M1 32GB → used-laptop checklist), unaccented input | 12/12 `/api/chat` 200, no error bubble; history reached 29 504–30 858 chars (over the old 24 000 budget) | `10-t01…21-t12.jpg`, `android-thread-db-check.json` |
| MacBook turns 9–12 | no "Quy Nhơn", no `[TAPPY_PLAN]`; product cards with config tags + "So sánh 4 lựa chọn" | `22-macbook-cards.jpg`, `android-thread-db-check.json` |
| Delete (VI): empty / wrong word "xoa" → button disabled; "XOÁ" → enabled | pass | `32…35-*.jpg` |
| Delete → confirmation → OK → signed out (guest greeting, "Đăng nhập" row) | pass | `36…38-*.jpg` |
| DB after delete (account 3) | auth.users 0, every public table 0, one `account_deletion_jobs` row queued | `db-after-delete-account3.json` |
| Delete (EN + Dark): "DELET" disabled, "DELETE" enabled → deleted → "Go to Home" → signed out | pass | `40…47-*.jpg` |
| Old token after delete (account 2) | `/api/profile` 401, `/api/conversations` 401, `/api/account/delete` 401 | report |
| DB after delete (account 2) | auth.users 0, every public table 0 (incl. its golden conversations), one job queued | `db-after-delete-account2.json` |
| Row subtitle | FOUND: still "Gửi yêu cầu xóa…/Request deletion…" on the in-app flow → fixed, re-verified on device | `31-settings.jpg` (before), `48-subtitle-fixed-vi.jpg` (after) |
| logcat | 0 FATAL EXCEPTION; app E/W lines in `logcat-app-warnings-errors.txt` (FCM token registration 400/401 at start-up, not investigated) | `logcat-app-warnings-errors.txt` |
