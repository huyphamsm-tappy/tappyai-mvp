# UAT3 — Android on a PHYSICAL phone, 2026-09-27

**Device: Samsung Galaxy A12 (SM-A127F, `R58RC0V30BH`), Android 12, 720×1600**, the only device in `adb devices`.
Debug app `com.tappyai.app.debug` at rc/web-uat `9553d07`, built by `scripts/uat/build-android-local.ps1 -Reverse`
(API `http://localhost:3007/`, Supabase **audit**, `adb reverse tcp:3007`). The phone has no Play build of TappyAI.
The earlier emulator run of the same script is `../uat3-android-2026-09-27/`.

Accounts: two throwaway audit users from `scripts/uat/throwaway-accounts.mjs`, signed in through the app's
`tappyai://auth-callback` deep link (the Android build has no email login). Both deleted by the test itself and
their queue rows removed (auth 0 / public rows 0 / queue 0). "XÓA" was typed by tapping the phone's own **Samsung
Keyboard** (Tiếng Việt, Telex: X O A S → "XÓA"); no ADBKeyboard was installed and the IME was never changed
(`com.samsung.android.honeyboard` before and after). Location prompts were answered "Không cho phép".

| step | result | evidence |
|---|---|---|
| 12-turn multi-domain thread (unaccented input) | 12/12 `/api/chat` 200, no error bubble; history 25 880–27 115 chars at turns 11–12 (over the old 24 000 budget) | `10-t01…21-t12.jpg`, `android-thread-db-check.json` |
| MacBook turns 9–12 | no "Quy Nhơn", no `[TAPPY_PLAN]`; product card + "Khác cấu hình" + "So sánh 4 lựa chọn" in the saved thread | `20-t11.jpg`, `22-macbook-cards.jpg` |
| Settings row (VI / EN) | "Xóa tài khoản · Xóa vĩnh viễn tài khoản và dữ liệu của bạn" / "Delete account · Permanently delete your account and data" (the d1ef6ec fix) | `31-settings.jpg`, `40-settings-en-dark.jpg` |
| Delete (VI): empty and "xoa" → disabled; "XÓA" (real keyboard) → enabled → deleted → OK → signed out | pass | `32…38-*.jpg` |
| DB after delete (account A) | auth.users 0, every public table 0 (incl. the 24-message thread), one job queued | `db-after-delete-accountA.json` |
| Delete (EN + Dark): "DELET" disabled, "DELETE" enabled → deleted → "Go to Home" → signed out | pass | `42…47-*.jpg` |
| DB after delete (account B) + old token | auth.users 0, public 0, one job queued; old token → 401 on `/api/profile`, `/api/conversations`, `/api/account/delete` | `db-after-delete-accountB.json` |
| logcat (app pids) | 0 FATAL EXCEPTION; all 12 chat + 2 delete calls 200; E lines: FCM token registration 400/401 at start-up, `/api/recommendations` 403 while a guest (not investigated) | `logcat-app-warnings-errors.txt` |
