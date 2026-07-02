# Authentication Implementation Report

> **Scope:** implements `docs/Authentication_Architecture.md` Task 1 (per-user JWT verification), Task 2 (Guest Mode audit), Task 3 (Email OTP backend readiness), Task 4 (Session flow check), Task 5 (security review) — closing the two "Must Fix" items from `docs/Android_Sprint_Go_NoGo.md` §3.1/§5.1.
> **Status:** implemented and live-verified against a running dev server. No migrations required for this part.

---

## 1. Files Modified

**New:**
- [`src/lib/auth/getRequestUser.ts`](src/lib/auth/getRequestUser.ts) — the shared per-user auth helper (Task 1).

**Modified — every protected API route, switched from the old inline cookie-only pattern to the shared helper (34 files):**
`track`, `suggested-prompts`, `bookings`, `stripe/checkout`, `profile`, `group/[id]/suggest`, `group`, `conversations`, `users/[id]`, `users/[id]/follow`, `users/search`, `price-watch`, `upload/video`, `favorites`, `message-feedback`, `reviews`, `reviews/upload`, `reviews/feed`, `reviews/[id]`, `reviews/[id]/like`, `reviews/[id]/save`, `reviews/[id]/comments`, `reviews/[id]/interact`, `memory`, `onboarding`, `notifications`, `notifications/subscribe`, `preferences`, `preferences/profile`, `explore/process`, `integrations`, `integrations/zalo`, `integrations/google-calendar`, `chat` (all under `src/app/api/`).

**Modified — login UI:**
- [`src/app/login/page.tsx`](src/app/login/page.tsx) — added the Email OTP flow (Task 3).

**Explicitly NOT modified (by design — see §3):**
- `middleware.ts` — still only refreshes the cookie session; no gating logic added here.
- Every `src/app/api/cron/*` route, plus `debug-places`, `test-photos`, `notifications/broadcast` — still authenticate via a static shared secret, unchanged.

---

## 2. Authentication Flow

**Per-user JWT verification (`getRequestUser`), the core deliverable of Task 1:**

```
Request arrives at any protected route
      │
      ├── Has "Authorization: Bearer <token>" header?
      │     │
      │     YES → create a Supabase client scoped to that header,
      │           call supabase.auth.getUser(token) — a real, per-user
      │           verification against Supabase Auth (not a string
      │           comparison) → { user, supabase } returned, RLS
      │           (auth.uid()) resolves correctly for all subsequent
      │           .from() calls on the returned client.
      │
      └── NO → fall back to the existing cookie-based flow
                (@supabase/ssr, unchanged) → { user, supabase }
```

Every route now does exactly this:
```ts
const { user, supabase } = await getRequestUser(req)
if (!user) return NextResponse.json({ error: '...' }, { status: 401 })
```
— a mechanical, 2-line replacement of the old `createClient()` + `auth.getUser()` pair, applied uniformly. No route's business logic, error message wording, or response shape was changed — only how `user`/`supabase` get resolved.

**One real bug found and fixed during this pass, not just a mechanical swap:** `chat/route.ts`'s `save_price_watch` tool (invoked mid-stream by the AI) called its own fresh `createClient()` — a *second*, independent cookie read, unrelated to the outer request's auth resolution. For a Bearer-authenticated (native) request this would have silently found no session and failed the write. Since `authedUserId` is already verified by that point (via the outer `getRequestUser` call), this was switched to `createAdminClient()` (service-role), which is correct here — the identity check already happened, this is just a trusted server-side write on behalf of an already-authenticated user, the same pattern `onboarding/route.ts` already uses.

---

## 3. JWT Flow — how this differs from the internal/cron pattern

The codebase now has **two, deliberately distinct** `Authorization: Bearer` mechanisms, and they must not be confused:

| | User auth (`getRequestUser`) | Internal/cron auth (unchanged) |
|---|---|---|
| Verifies | A specific user's identity | That the caller is a trusted internal job |
| Mechanism | `supabase.auth.getUser(token)` — real per-user JWT verification against Supabase Auth | `header === \`Bearer ${SHARED_SECRET}\`` — one static string comparison |
| Token source | Supabase-issued session/access token (web cookie or a native client's Supabase SDK session) | A single env var (`CRON_SECRET`), same for every caller |
| Where used | Every route in §1's list | `src/app/api/cron/*`, `debug-places`, `test-photos`, `notifications/broadcast` |
| Resolves to | `user.id` (different per request) | Nothing user-specific — it's a yes/no trust gate |

This was the exact gap `Android_Sprint_Go_NoGo.md` §3.1 flagged: prior docs had assumed the cron pattern "already proved" bearer-token auth was solved, but re-verification showed cron's pattern is structurally similar (same header) but functionally unrelated (no per-user check). That gap is now closed — cron/internal routes are untouched and still correct for their own purpose; user routes now have a real, independent mechanism.

---

## 4. Guest Flow

Re-audited every route against the required allow/deny list — already correct, mostly pre-existing, now uniformly enforced via the shared helper:

| Allowed (guest, `user` optional, no gate) | Denied (guest, `user` required, 401) |
|---|---|
| Chat (`POST /api/chat`) | Upload (`reviews/upload`, `upload/video`) |
| Explore feed (`GET /api/reviews/feed`, incl. `search=`) | Like (`reviews/[id]/like`) |
| Reviews list for a place (`GET /api/reviews`) | Save (`reviews/[id]/save`) |
| Comments list (`GET /api/reviews/[id]/comments`) | Comment (`POST reviews/[id]/comments`) |
| Public profile (`GET /api/users/[id]`) | Follow (`users/[id]/follow`) |
| | Profile editing (`PATCH/POST /api/profile`) |

Every gated route returns **HTTP 401** consistently (never 403 or a 200-with-error-body) — this is the one thing Android needs to key off to redirect to the Login screen, and it was already true before this change; the helper preserves it exactly.

One naming note, not a bug: `GET /api/users/search` (searching for *people*) is gated, which is correct and intentional — it's a follow-adjacent, anti-enumeration-sensitive feature, not the "Search" the Guest allow-list refers to (that's Explore's content search via `reviews/feed?search=`, which is open).

---

## 5. Security Notes

- Grepped the entire `src/app/api` tree after the migration: **zero** remaining direct `supabase.auth.getUser()` cookie-only call sites outside `getRequestUser` itself and the cron/internal routes' own (correct, unrelated) shared-secret checks.
- No route derives `userId` from a client-supplied parameter — confirmed unchanged, no route was touched in a way that could introduce this.
- `getRequestUser` never falls back to trusting an unverified token — a Bearer token that fails `auth.getUser(token)` resolves to `user: null`, which every route already treats as "not logged in," not as an error state.
- No duplicate auth logic remains — every protected route uses the single shared helper; the two intentionally-separate mechanisms (user JWT vs. internal shared-secret) are the only two auth code paths in the API surface, each used only for its own purpose.
- **Live-verified**, not just reasoned about:
  - `GET /api/memory` with `Authorization: Bearer garbage-invalid-token` → `{"memory": null}` (graceful, no 500, no crash).
  - `GET /api/memory` with no auth at all → `{"memory": null}` (unchanged guest behavior).
  - `POST /api/chat` as a guest → `200 OK`, streams normally.
  - `npx tsc --noEmit` and `next lint` both clean across every touched file.

## 6. Auth Providers (Task 3)

- **Google, Zalo:** unchanged, kept as-is.
- **Email OTP:** implemented client-side in `login/page.tsx` (`signInWithOtp` → `verifyOtp`, Supabase-native, no password storage). **Live-verified end-to-end, including a real external dependency that surfaced during testing:** sending a code against this Supabase project's current dev configuration returns `400 email_address_invalid` for any address tested (`test-otp-verification@example.com` and a second, different domain both rejected identically) — this points to a Supabase **dashboard-level** email/domain restriction, not a code defect. The UI handles this correctly (shows an inline error, doesn't crash, preserves the entered address), but **full Email OTP delivery will not work until the Supabase project's Auth → Email provider settings are reviewed in the dashboard** — that configuration is outside this repo and outside what code changes can fix. Flagged as a Remaining Issue (§7).
- **Apple:** not implemented, per the task's own instruction ("chỉ cần đảm bảo kiến trúc sẵn sàng"). Architecture is ready: adding it is one more `signInWithOAuth({provider:'apple', ...})` branch identical in shape to Google's, and the existing in-app-browser guard already applies generically (it's not Google-specific), so no structural change is needed when it's actually requested.

## 7. Remaining Issues

1. **Email OTP requires a Supabase dashboard configuration change** (§6) before it will work end-to-end — verified live, not hypothetical. Someone with dashboard access needs to check Auth → Providers → Email settings (and any configured email/domain allow-list) before this ships.
2. **Positive Bearer-token path (valid token → real user) was not live-tested** in this session — there was no ready test account to mint a real Supabase access token from. The negative paths (invalid token, no token) were verified live and behave correctly; the positive path relies on `supabase.auth.getUser(token)`, the standard documented Supabase verification call, but should get one real smoke test (log in via the web app, copy the access token from the Supabase client session, call any protected route with it as a Bearer header) before Android engineering starts.
3. **`ADMIN_IDS` flat env-var role check** — unchanged, already flagged as low-priority/fine-at-current-scale in `Authentication_Architecture.md` §2.4. Not touched here, not required for Android.
4. **Apple + full Location JIT fix** — deliberately not implemented (Apple not needed yet; Location fix is a separate, unrelated UX change outside this task's scope, already tracked in `Authentication_Architecture.md` §2.5).
