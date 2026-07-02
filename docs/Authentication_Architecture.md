# TappyAI — Authentication Architecture

> **Phase:** Architecture Week — Part 2
> **Status:** Design/analysis only — no code changes, no migrations
> **Grounding:** Verified against `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/components/LocationProvider.tsx`, `src/components/notifications/NotificationSettings.tsx`, `src/lib/admin.ts`, `middleware.ts`, `public/manifest.json`, `public/.well-known/assetlinks.json`. No claim is speculative.
> **Convention:** 🟢 Live · 🔵 Proposed · 🟠 Confirmed gap

---

## 1. Current State

- **Providers, verified:** **Google** (Supabase-native `signInWithOAuth({provider:'google'})`) and **Zalo** (custom flow via `/api/auth/zalo` → `/api/auth/zalo/callback`, not a Supabase-built-in provider). **No Apple Sign-In, no Email OTP, no phone auth exist today.**
- **In-app-browser guard — 🟢 real, already solved.** `login/page.tsx` detects Facebook/Messenger/Instagram/Zalo/LINE/TikTok/WeChat in-app webviews via user-agent sniffing and blocks/redirects the Google button with an explicit "open in Chrome/Safari" instruction — because Google blocks OAuth inside embedded webviews. This is a genuine, non-trivial, already-shipped solution to a real mobile-web auth problem, not a gap.
- **Redirect safety:** `returnTo` query param is validated to relative-paths-only (`startsWith('/') && !startsWith('//')`) both in the login page and in `auth/callback/route.ts` — consistent open-redirect protection, confirmed in both places independently.
- **Session:** fully delegated to Supabase Auth via `@supabase/ssr`. `middleware.ts` calls `supabase.auth.getSession()` on every non-static request, refreshing cookies as needed. No custom session table, no custom JWT issuance/verification code anywhere in the app.
- **Authorization:** exactly one role check exists — `isAdmin(userId)` (`src/lib/admin.ts`), a flat `ADMIN_IDS` env-var comma-list. No formal "User" role entity; every authenticated non-admin user is implicitly a full "User." No RLS-level role logic beyond per-row ownership (`auth.uid() = user_id`) found anywhere across this session's security review.
- **Guest access — already substantial.** Confirmed via `FINAL_ARCHITECTURE.md` §14 and every route read this session: chat works fully anonymously (tools included), Explore feed browsing works anonymously, search works anonymously. Login is required only at the point of a write: comment, like, save, follow, upload, booking, price-watch.
- **Permission requests — 3 of 4 already correct, 1 confirmed gap:**
  - **Notification:** 🟢 correctly Just-in-Time — `usePushNotifications`/`NotificationSettings.tsx` only requests the browser permission when the user explicitly taps a toggle. No eager request anywhere.
  - **Camera / Gallery:** 🟢 correctly Just-in-Time **by construction** — both are plain `<input type="file">` (with `capture="environment"` for camera in chat's image attach), so the OS/browser permission prompt is inherently tied to the user's own file-picker interaction, never triggered by app load.
  - **Location:** 🟠 **not Just-in-Time.** `LocationProvider.tsx` is mounted at the root layout and calls `navigator.geolocation.getCurrentPosition()` **unconditionally on every app load** (gated only by a 30-minute localStorage TTL, not by any user action or explanation UI). This is the one permission in the app that violates the Just-in-Time principle the MVP brief explicitly asks for.
- **Android signal already present, not asserted as decided:** `public/.well-known/assetlinks.json` exists and contains a **real, specific** Digital Asset Links entry — `package_name: "com.tappyai.twa"`, a real SHA-256 cert fingerprint. This is the standard verification file for a **Trusted Web Activity (TWA)** — an installable Android app that is a chromeless wrapper around this exact web app, sharing its origin, cookies, and session. This document treats this as a **verified fact about repo configuration**, not as a confirmed product decision — but it is the single most relevant piece of evidence found anywhere in the codebase about Android's intended shape, and materially changes this document's Android Impact section (§8).

---

## 2. Proposed Architecture

### 2.1 Authentication Providers
**Proposed for MVP:** Google, Apple, Email OTP (Supabase-native) — exactly the three named in the brief, no more.

| Provider | Status | Notes |
|---|---|---|
| Google | 🟢 keep as-is | Already correct, including the in-app-browser guard |
| Zalo | 🟢 keep as-is | Not requested for removal; culturally relevant for a Vietnam-first product, already working — no reason to drop a working provider that wasn't asked to be removed |
| **Apple** | 🔵 propose adding | Supabase-native OAuth provider, same `signInWithOAuth` pattern as Google — **the in-app-browser guard (§1) must be extended to Apple too**, since Apple similarly restricts sign-in inside many embedded webviews. This is not new logic, just one more entry in the same detection/handling path already built for Google. |
| **Email OTP** | 🔵 propose adding | Supabase-native (`signInWithOtp`) — no password storage, no password-reset flow needed (avoids an entire class of auth UX/security surface the brief didn't ask for and this document does not propose). The one provider that works inside any in-app browser without restriction, making it the natural fallback offered *alongside* the in-app-browser warning (§1) rather than only as a "open in Chrome" redirect. |
| Anything else (phone/SMS, Facebook, etc.) | Not proposed | No stated need; adding providers has a real maintenance cost (each is a new failure mode, a new support burden) that isn't justified without a concrete reason. |

### 2.2 Guest Mode
**Allowed for guests (confirmed already true today, restated as the formal target):** Chat (including tool use), Explore (feed browsing, video playback), Search, Maps-adjacent content (place links/CTA buttons render and are clickable without login — clicking them opens an external app/site, which is itself outside TappyAI's session).

**Not allowed for guests (confirmed already enforced today, restated as the formal target):** Upload, Comment, Like, Save, Follow, Trip Sync (moot today since Trip persistence doesn't exist yet — Explore doc §1.7 — but the rule should apply identically once it does).

**Trade-off, stated explicitly as requested:** the cost of this openness is that TappyAI cannot personalize (Memory Engine, Learning Engine) or track engagement for anonymous sessions — every guest interaction is architecturally invisible to the Personalization Engine (Personalization doc §1) until they authenticate. This is an intentional, already-made trade-off (not proposed new here) favoring discovery/conversion over day-one personalization, consistent with a consumer app's typical funnel. No change proposed to this trade-off.

### 2.3 Session Management (design only, not implemented)
- **Access Token:** short-lived JWT, issued and rotated entirely by Supabase Auth — no proposal to build a custom token issuer. Stored in an httpOnly cookie via `@supabase/ssr` (already the case).
- **Refresh Token:** long-lived, Supabase-managed, rotated automatically on use. `middleware.ts`'s `getSession()` call on every request is the existing refresh trigger — no separate refresh endpoint needed or proposed.
- **Session:** cookie-based, same-origin — this is why a TWA (§1) needs zero new session logic: it shares the origin's cookie jar with the browser.
- **Logout:** `supabase.auth.signOut()` (Supabase-native) clears the session cookie set. No server-side session table to invalidate (Supabase handles refresh-token revocation server-side on its end) — no new logout logic proposed.
- **Token Refresh:** already automatic via the existing middleware pattern — explicitly **not proposing** a custom refresh scheme; Supabase's built-in rotation is sufficient and is what every route in this codebase already implicitly relies on.

### 2.4 Authorization
**Roles: Guest, User, Admin — exactly the three the brief allows, no more proposed.**
- **Guest:** unauthenticated, scoped per §2.2.
- **User:** any authenticated, non-admin account — the current implicit default, made explicit here as a named role for documentation clarity, not a new mechanism.
- **Admin:** `isAdmin(userId)` (§1) — kept as-is for MVP. **Flagged, not proposed as an MVP change:** the flat `ADMIN_IDS` env-var list is adequate for a small internal team today; if the admin surface (`/admin/analytics`, per `Final_Architecture_Review.md` §12) grows or the team grows, a proper role column/table would be the natural upgrade — explicitly deferred, not needed for Android.

### 2.5 Permission Strategy — Just-in-Time
**Proposed fix (the one concrete change in this document):** `LocationProvider.tsx`'s eager, app-load-triggered geolocation request should become **user-action-triggered** — e.g., only requested when the user taps something location-dependent ("Tìm quanh đây" chip, already present in chat per earlier UI work, or on first Explore "nearby" interaction), not on every app mount. Notification, Camera, and Gallery need **no change** — already correctly Just-in-Time by construction (§1).

---

## 3. Login Flow

```
User taps "Tiếp tục với Google" (or Apple 🔵, or enters email for OTP 🔵)
      ↓
detectInAppBrowser() check (🟢 existing, extend to Apple 🔵)
      ↓ (not in a restricted webview)
supabase.auth.signInWithOAuth({provider, redirectTo: '/auth/callback?next=<returnTo>'})
      ↓
Provider's consent screen (external)
      ↓
/auth/callback: exchangeCodeForSession() → session cookies set
      ↓
Redirect to returnTo (validated relative-path-only) or /onboarding if profile.onboarded is false
```
Zalo follows the same shape via its own `/api/auth/zalo` → `/api/auth/zalo/callback` pair (custom, not Supabase-native, but structurally parallel — confirmed via file existence, not re-derived here).

---

## 4. Guest Flow

```
User opens app (no session)
      ↓
Chat / Explore / Search fully usable (§2.2)
      ↓
User attempts a write action (like/save/follow/upload/comment)
      ↓
401 from the relevant API route (already enforced everywhere, confirmed across all prior security reviews)
      ↓
Client redirects to /login?returnTo=<current path>
      ↓
On successful login → returns to the exact action's context via the validated returnTo
```
This exact `returnTo`-preserving pattern is already implemented and verified (§1) — no new flow proposed, restated here as the formal Guest Flow documentation.

---

## 5. Session Flow

```
Every request → middleware.ts → supabase.auth.getSession()
      ↓
Valid session → cookies refreshed transparently if near expiry (Supabase-managed)
      ↓
Invalid/expired/no session → request proceeds as Guest (no forced redirect — app is open by design, §2.2)
      ↓
API routes individually check auth.getUser() and return 401 if a write requires a session
```
**Logout:**
```
User taps "Đăng xuất" → supabase.auth.signOut() → cookies cleared → client redirects to / (Guest state)
```

---

## 6. Permission Flow

```
Notification: user taps toggle in Settings → browser native permission prompt → subscribe() on grant   [🟢 unchanged]
Camera/Gallery: user taps "attach photo"/"chụp ảnh" → OS file picker (camera or gallery choice) →
                permission prompt is the OS's own, tied to that exact interaction                        [🟢 unchanged]
Location: 🔵 PROPOSED — user taps a location-dependent action ("Tìm quanh đây") →
          THEN request getCurrentPosition() → cache per existing 30-min TTL logic
          (was: requested unconditionally on every app mount — §1, §2.5)
```

---

## 7. Security

- Every write-requiring route already derives `userId` from session, never from a client-supplied parameter — confirmed repeatedly across the Security phase and every Architecture Week document; no new finding here.
- Email OTP (§2.1) has a real, contained security property this document credits explicitly: it introduces **no password storage**, so it cannot add a password-related attack surface (credential stuffing, weak-password risk) — this is a genuine advantage over a hypothetical password-based email auth, not a neutral choice.
- Apple Sign-In (§2.1), if added, should use the same `redirectTo`/`returnTo` open-redirect protection already proven for Google (§1) — no new pattern to invent, just apply the existing one.
- The in-app-browser guard (§1) is itself a security-adjacent UX safeguard (prevents users from hitting a confusing, silently-failing OAuth attempt) — worth preserving exactly as-is when Apple is added, not simplified away.

---

## 8. Android Impact

**This is the most consequential finding in this document.** The repo already contains a **configured** `assetlinks.json` for a Trusted Web Activity (`com.tappyai.twa`, real cert fingerprint — §1). If Android ships as a TWA (a fact this document observes from repo configuration, not one it asserts as a confirmed product decision):

- **Authentication requires zero new backend or session work.** A TWA runs inside Chrome Custom Tabs, sharing the exact same origin, cookies, and Supabase session as the web app. Google and Zalo OAuth (§1) work identically, unmodified. The in-app-browser guard (§1) is irrelevant inside a TWA (it's Chrome itself, not an embedded webview) but remains correctly necessary for users who reach the *web* version via a link shared inside Zalo/Facebook/etc.
- **The only genuinely new consideration:** verifying the TWA's Digital Asset Link resolves correctly at deploy time (a deployment/ops checklist item, not an architecture change) and confirming Apple/Email-OTP (§2.1) redirect flows behave correctly inside a TWA's Custom Tab (should work identically to Google's already-proven flow, but not yet tested against a real TWA build in this codebase — flagged, not assumed).
- **If Android instead ships as a fully native or React-Native/Flutter app** (not indicated by any file found in this repo, but not ruled out either), then the `GET /api/context`-style bearer-token pattern (`Final_Architecture_Review.md` §19) becomes the relevant auth integration point, and Supabase's native Android/Kotlin SDK (which speaks the same JWT session format already used server-side) would be the natural client library — no new server-side auth mechanism needed either way, only a client-side integration choice.

**Recommendation:** confirm which of these two paths (TWA vs. native) is actually planned **before** the Android week starts — this document cannot determine that from the codebase alone, and the two paths have meaningfully different (though both small) auth-integration workloads.

---

## 9. Future iOS Impact

No iOS-specific configuration exists anywhere in the codebase (confirmed: no `apple-app-site-association` file, no universal-link setup found). This is expected — iOS is not the current target — and is not a finding of concern. Everything in this document (providers, guest mode, session model, permission strategy) is platform-agnostic and applies to a future iOS effort unchanged. iOS has no TWA-equivalent (Apple does not support installable web-wrapper apps the way Android does), so if a future iOS app is pursued, it would need either a genuine native/cross-platform client (using the same `GET /api/context`-style bearer-token pattern) or a "add to home screen" PWA-only approach — this decision is out of scope for this document and not proposed here.

---

## 10. MVP Recommendation

1. **Add Apple + Email OTP** (§2.1) — both are low-cost, Supabase-native additions that extend an already-correct pattern rather than build a new one. Extend the existing in-app-browser guard to cover Apple.
2. **Fix Location's Just-in-Time gap** (§2.5) — the one concrete behavioral change this document proposes; small, scoped, directly serves a principle the brief explicitly asked for.
3. **Do not build a new role system, new session mechanism, or new provider beyond the three named** — every other piece of the current auth architecture is already sound and should be preserved unchanged.
4. **Resolve the TWA-vs-native question (§8) before Android week begins** — not because the current architecture is unready, but because the two paths' auth-integration workload, while both small, differs enough to affect sequencing.

---

*This document is Architecture Week Part 2. No code changes were made. Awaiting review.*
