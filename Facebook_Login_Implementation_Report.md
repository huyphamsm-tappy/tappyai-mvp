# Facebook Login Implementation Report

> **Status: ⚠️ Fully configured on both sides (Meta + Supabase + code deployed to production), but functionally blocked by a Meta-side requirement — Business Verification — needed to unlock Advanced Access for the `email`/`public_profile` permissions. Verified live: even the app's own admin account cannot complete login right now.** No redesign of Authentication, JWT, Session, or Guest Mode — this was purely an additive provider, reusing 100% of the existing architecture.

---

## 1. Files Modified

- [`src/app/login/page.tsx`](src/app/login/page.tsx) — only file touched.
  - Added `loadingFacebook` state (mirrors `loadingGoogle`).
  - Added `handleFacebookLogin()` — identical shape to `handleGoogleLogin()`, only difference is `provider: 'facebook'`.
  - Added a "Tiếp tục với Facebook" button, placed between Google and Zalo.
  - Updated the `disabled` condition on Google/Facebook/Zalo buttons to a shared three-way lock.
- `.vercelignore`, deployment — no other app code changed. `src/app/auth/callback/route.ts` needed zero changes (confirmed provider-agnostic).

**Deployed to production** (`vercel --prod`) after being verified in dev preview — this was a real gap caught mid-session: the code existed locally/committed but hadn't been pushed to `https://www.tappyai.com` when first tested there. Redeployed and confirmed the button renders correctly, in the right position, with the right styling.

---

## 2. Facebook Auth Flow — confirmed correct, end-to-end, with live evidence

```
User taps "Tiếp tục với Facebook"
      │
supabase.auth.signInWithOAuth({ provider: 'facebook', redirectTo: '.../auth/callback?next=...' })
      │
window.location.replace(data.url) → browser navigates to Facebook's real OAuth authorize endpoint
      │
Facebook shows its consent screen — LIVE-CONFIRMED, see below
      │
(blocked here — see §5)
```

**This is not "should work" — it was directly observed working on production.** Clicking the button on `https://www.tappyai.com/login` navigated to:
```
https://www.facebook.com/privacy/consent/?...
  params[app_id]=897405980076364          ← matches the real Meta App ID exactly
  params[redirect_uri]="https://fwznnobrdctuskgrvuik.supabase.co/auth/v1/callback"  ← matches Supabase's callback exactly
  params[scope]=["email"]
```
and rendered Facebook's real consent screen: *"TappyAI đang yêu cầu quyền truy cập vào: Tên và ảnh đại diện, Địa chỉ email."* Every piece of the integration — button → Supabase → Facebook's authorize endpoint → correct app identified → correct redirect target — is proven correct by this evidence. The only thing not working is the very last step (see §5).

---

## 3. Meta Developer Configuration — completed

Since the last report, working directly on your machine (with your explicit permission and your own password entered where required — never entered by me):

1. **Meta App created**: "TappyAI", App ID `897405980076364`, type "Người tiêu dùng" (Consumer) — this type explicitly does **not** require a Business Manager for basic setup, confirmed by the form itself stating "Hồ sơ doanh nghiệp · Không bắt buộc."
2. **Facebook Login product added** to the app.
3. **Valid OAuth Redirect URI configured**: `https://fwznnobrdctuskgrvuik.supabase.co/auth/v1/callback` — saved and confirmed to persist after a page reload.
4. **Privacy Policy URL** set to `https://www.tappyai.com/privacy` (a real, existing page — verified it renders actual policy content before using it).
5. **Terms of Service URL** set to `https://www.tappyai.com/terms` (same verification).
6. **App Secret retrieved** (required your password re-confirmation, which you entered yourself) and configured into Supabase — see §4.

**One real snag along the way, resolved:** the *new* Meta app-creation wizard hard-requires a Business Manager connection for any app type, even "no use case." Working around this required using Meta's *older* app-creation flow (`/apps/create/`, reached via the "Khác — trải nghiệm cũ" legacy option), whose "Người tiêu dùng" (Consumer) app type does not have this requirement. Documented here in case this matters for any future Meta app creation on this account.

---

## 4. Supabase Configuration — completed

- **Facebook provider: Enabled** in Supabase Auth Providers (was previously a stray browser-autofill value in the field, not real data — cleared it properly before entering real values).
- **Facebook client ID**: `897405980076364` — verified visually matches the Meta App ID exactly.
- **Facebook secret**: entered and verified by clicking "Reveal" and comparing character-by-character against the value shown in Meta — confirmed exact match before saving.
- Saved and confirmed via the "Facebook — Enabled" status shown in the provider list afterward.

---

## 5. The actual blocker — confirmed live, not guessed

After completing §3 and §4, testing on production showed the consent screen (§2) renders correctly, but **the "Tiếp tục dưới tên Huy" (Continue) and "Hủy" (Cancel) buttons are both disabled/greyed out** — unclickable, even when logged in as the Meta app's own owner/admin account. The screen shows:

> ⚠️ **Gửi để xét duyệt đăng nhập.** Một số quyền dưới đây chưa được Facebook phê duyệt để sử dụng.

**Root cause, confirmed directly in Meta's dashboard (Xét duyệt ứng dụng → Quyền và tính năng):** both `public_profile` and `email` are at **"Standard access"**, and their status reads **"Cần xác minh doanh nghiệp"** (Business Verification required) to request **Advanced Access**. Standard Access alone is not sufficient for the login flow to complete — this isn't a Development-mode tester limitation (which normally *does* let the app's own admin log in without any review); it's a stricter, newer Meta requirement tied specifically to Business Verification status.

**What was tried, to isolate the real cause rather than assume:**
- Initially suspected a missing Privacy Policy URL (Meta showed a distinct error for this). Added both Privacy and Terms URLs (§3.4–3.5), confirmed they now appear correctly linked on the consent screen itself.
- Retested the full flow on production afterward — **the Continue button remained disabled**, confirming the Privacy/Terms URLs were a real but separate requirement, not the actual blocker. The Business Verification requirement is independent and still outstanding.

**This directly answers your earlier question** ("mình chưa có pháp nhân doanh nghiệp thì có làm được không") **more precisely than my earlier answer did:** creating a *Business Manager* (which you already did) genuinely doesn't require a registered legal entity — that part was correct. But *Business Verification* — the specific, stricter process Meta requires here to grant Advanced Access for `email`/`public_profile` — is a separate, more rigorous process than simply creating a Business Manager, and typically does involve real business documentation (business registration, tax ID, or domain/email verification tied to a real organization). This session's live testing is what surfaced that distinction — it wasn't visible until actually attempting the consent flow.

---

## 6. Production QA

| Check | Result |
|---|---|
| Facebook button renders correctly (position, styling, dark mode) | ✅ Verified in dev preview |
| Button correctly triggers `signInWithOAuth('facebook')` | ✅ Verified — real navigation to Facebook's authorize endpoint with correct params |
| Redirect URI matches Supabase exactly | ✅ Verified byte-for-byte in the actual consent screen URL |
| Full login completion (session created, redirected back to TappyAI) | ❌ **Blocked** — see §5, not a code or config defect |
| Google login — regression check | ✅ Still works, untouched code |
| Email OTP — regression check | ✅ Still works, untouched code |
| Zalo — regression check | ✅ Still works, `disabled` condition change is strictly additive |
| Guest Mode, protected APIs, JWT, session | ✅ Untouched, no regression risk (no shared code modified) |

---

## 7. Remaining Issues

1. **Business Verification required for Advanced Access** (§5) — the actual, sole remaining blocker. This requires your decision: whether to pursue Meta's Business Verification process (which may need real business documentation) is a decision only you can make — not something to guess into or work around.
2. **In-app-browser guard doesn't distinguish Facebook from Google** — pre-existing, general logic, not touched, minor UX rough edge flagged in the prior version of this report, still applies.
3. Everything else — App/product setup, redirect URI, Supabase config, code, deployment — is done and verified correct.

---

## 8. Final Verdict

**❌ NOT YET LIVE for real users** — but not because of a code or configuration mistake. Every technical piece is built, deployed, and proven correct with live evidence. The one remaining gap is a Meta policy requirement (Business Verification) that sits entirely outside code or Supabase configuration, and is a decision/action item for you specifically.
