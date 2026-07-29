# Delete Account Sprint — Production Report

**Date:** 2026-07-17
**Sprint scope:** Complete the **Delete Account** feature on Android to satisfy Google Play's account-deletion requirement.
**Governing rules:** Web = Source of Truth; Android must match Web 100%; integrate existing backend only; **STOP and report if the backend is missing — no workaround, no self-invented business logic**.

## ✅ Final outcome: COMPLETE via Path B (owner-approved)

The survey (below) proved **no self-service delete backend exists on Web or Backend** — the Web's actual mechanism is a **deletion request by email to support** (`profile/privacy` §5). I first STOPPED and reported per the rules; the owner then authorized **Path B**: implement an in-app **"Request account deletion"** affordance that mirrors the Web's exact mechanism (email request), **with no backend and no new business logic**. That is now implemented, builds clean, and is runtime-verified on the emulator. No backend was created; no business logic was invented.

### Phase 1 (initial): STOPPED — backend contract does not exist
Self-service account deletion **cannot be implemented** because the required backend endpoint **does not exist**, and the Web (source of truth) itself has **no self-service delete feature**. Per the sprint's explicit rule, I stopped rather than create backend business logic or a client-side workaround, and reported. The owner then chose Path B.

---

## 1. Backend Contract Verification

Surveyed in the mandated order: **Web → Backend → Android**. Every finding below was read from the real source, not assumed.

### 1a. Web (source of truth) — no self-service deletion
- Searched the entire web app (`src/`) for any delete-account affordance: `delete account`, `deleteAccount`, `xóa tài khoản`, etc. → the phrase appears **only in privacy-policy text**, never as a functional button/action.
- The web Settings/Profile UI has delete buttons for **individual data** (favorites, conversations, reviews/posts, price-watches, memory) — **but none for the account itself**.
- **The Web's actual, stated deletion mechanism** (`src/app/profile/privacy/page.tsx` §5, verbatim):
  > *"Bạn có thể đăng xuất bất kỳ lúc nào. Nếu muốn xóa tài khoản và toàn bộ dữ liệu liên quan, vui lòng liên hệ qua email hỗ trợ của TappyAI."*
  > (= "You can sign out anytime. To delete your account and all related data, please contact TappyAI support by email.")
  → The Web's real mechanism is a **manual email request to support**, not an in-app/self-service flow.

### 1b. Backend — no deletion endpoint
Enumerated **all** API routes under `src/app/api/` and inspected every candidate:
| Checked | Result |
|---|---|
| `/api/profile/route.ts` | Exports **GET, PATCH, POST** — **no DELETE**. |
| `/api/users/[id]/route.ts` | Exports **GET only**. |
| Every `export async function DELETE` in the codebase | Deletes **individual items** (rbac roles, conversations, favorites, memory, message-feedback, notification subscription, price-watch, review comments, reviews, sound follow/save) — **none delete a user account**. |
| `supabase/functions/` (edge functions) | **Directory does not exist.** |
| `supabase.auth.admin.deleteUser` / RPC `delete_user` / account-cascade | **Not present anywhere.** (The only `auth.admin` uses are Zalo `createUser`/`generateLink` and `listUsers` for user search — none delete accounts.) |
| Migrations for account deletion / user-cascade | **None found.** |

**Conclusion:** There is **no backend contract to integrate**. A compliant self-service deletion is technically impossible from the mobile client alone — Supabase user deletion requires the **service-role key** (`auth.admin.deleteUser`), which must **never** ship in a mobile app. It can only be done via a server-side endpoint that **does not exist**.

### 1c. Android — nothing to wire, nothing pre-existing
- No delete-account flow exists in the Android app (Account screen: name/email/joined + Edit profile; Settings: Sign out only). Confirmed by grep — **NONE**.

---

## 2. Files Created / Modified

**Created:** none.

**Modified (Path B — UI only, no backend, no ViewModel/business-logic changes):**
| File | Change |
|---|---|
| `android/app/.../profile/SettingsScreen.kt` | Added a **"Request account deletion"** `TappyMenuRow` (danger style, `DeleteForever` icon) grouped in the same card as **Sign out**; a confirm `TappyDialog`; and a private `launchAccountDeletionEmail()` helper that fires `Intent.ACTION_SENDTO` (`mailto:`) prefilled to support, guarded with the app's established `ActivityNotFoundException` try/catch → toast fallback. Added imports (`Intent`, `Uri`, `Toast`, `ActivityNotFoundException`, `LocalContext`, `DeleteForever`, `TappyDialog`). |
| `android/app/src/main/res/values/strings_settings.xml` | Added EN strings: `settings_delete_account`, `_dialog_title`, `_dialog_message`, `_confirm`, `_subject`, `_body`, `_no_email_app`, and `support_email` (`translatable="false"` = huypham.sm@gmail.com). |
| `android/app/src/main/res/values-vi/strings_settings.xml` | Added matching Vietnamese translations for all of the above (support_email is shared/non-translatable). |

No backend files, no ViewModel, no repository, no network layer touched. The action composes an email; deletion is processed by support — identical mechanism to the Web.

---

## 3. Production Issues Found

1. **[BLOCKER] No account-deletion backend endpoint.** Google Play requires an account-deletion path for account-based apps. Neither Web nor Backend provides self-service deletion; only a manual email request exists.
2. **[CONSISTENCY BUG in Web] Contradictory privacy policies.** The login-facing policy (`src/app/privacy/page.tsx` §6) promises deletion *"thông qua phần Cài đặt tài khoản trong ứng dụng"* (via in-app Account Settings) — **a feature that does not exist**. The profile-facing policy (`src/app/profile/privacy/page.tsx` §5) correctly says deletion is by **email request**. These two must be reconciled (Web-side; out of this Android sprint's scope, flagged for the owner).
3. **[BLOCKER persists] Android in-app deletion still absent.** Matches the README blocker #1 from the Release Kit; unchanged because it cannot be resolved without backend work.

---

## 4. Production Issues Fixed

1. **[BLOCKER cleared] Google Play account-deletion path now exists on Android** — the Path B "Request account deletion" affordance (email request) mirrors the Web's mechanism. Combined with entering the **Account Deletion method / URL** in Play Console Data Safety, this satisfies Google Play's requirement without backend business logic.
2. **Honest, non-misleading UX** — the confirm dialog explicitly states the account "is not deleted automatically," so users understand the tap sends a *request*, not an instant deletion.

Issue #2 (Web privacy-policy contradiction) and Path A (true self-service) remain out of scope / deferred — see Section 6.

---

## 5. Build & Runtime Verification

- **Compile (per change, as required):** `:app:compileDebugKotlin` → **BUILD SUCCESSFUL** after adding the row + dialog + email helper (one iteration fixed a missing `LocalContext` import).
- **Final gate:** `assembleDebug` + `testDebugUnitTest` → **BUILD SUCCESSFUL in 43s**, full unit-test suite passing, on the **reverted (no-hack) production** source.
- **Lint note:** `lintDebug` (not part of the project's standard build gate) surfaced one **pre-existing, unrelated** `MissingTranslation` on the brand string `app_name`. **None of the new delete-account strings are flagged** — their EN + VI + `translatable="false"` coverage is complete. Left untouched per single-mission scope; flagged in Section 6.
- **Runtime (emulator `emulator-5554`, screenshots captured):**
  1. ✅ **"Request account deletion"** row renders in Settings, grouped with Sign out, red danger styling + `DeleteForever` icon.
  2. ✅ Tapping it shows the confirm dialog with the honest "not deleted automatically" wording (Cancel / Open email).
  3. ✅ Tapping **Open email** launched the email composer — logcat confirmed `act=android.intent.action.SENDTO dat=mailto: cmp=com.google.android.gm/.ComposeActivityGmailExternal` (Gmail compose opened). An `ActivityNotFoundException` → toast fallback covers devices with no email app.
  - Verification used a temporary `TEMP_VERIFY_HACK` (forced `AuthSessionState.Authenticated`) to reach the authenticated Settings screen without a real login.
- **`TEMP_VERIFY_HACK` revert:** Verified clean — `grep -rn "TEMP_VERIFY_HACK" android --include=*.kt` returns **zero** matches (exit 1). Final reverted APK rebuilt and reinstalled on the emulator so the device is not left on a hacked build.

---

## 6. Remaining Deferred Items

- **Path A — true self-service deletion (deferred, needs backend + owner approval).** A one-tap in-app delete would require a new server-side endpoint (e.g. `DELETE /api/profile` using the Supabase service-role `auth.admin.deleteUser` + cascade cleanup), then a small Android integration. This is real backend business-logic work — out of scope here. Path B is fully sufficient for Google Play; Path A is a future UX upgrade, not a compliance requirement.
- **Web privacy-policy contradiction (Web-side, deferred).** `src/app/privacy/page.tsx` §6 still falsely promises in-app deletion "via Account Settings," while `src/app/profile/privacy/page.tsx` §5 correctly says email request. Reconcile Web-side so the published policy matches the shipped (email-request) mechanism. Out of scope for this Android sprint.
- **Play Console step (owner action).** Enter the account-deletion method/URL in the **Data Safety** form (a support-email/deletion instructions page), matching the in-app affordance. See `docs/release/android/02_data_safety.md`.
- **Pre-existing `app_name` MissingTranslation lint (out of scope).** Mark `app_name` `translatable="false"` (or `tools:ignore`) in a future housekeeping pass — unrelated to Delete Account, and the project's build gate does not run lint.

> Per the sprint rule "do not move to another module until Delete Account is complete and verified," no other module work was started. Delete Account (Path B) is **complete and runtime-verified**.
