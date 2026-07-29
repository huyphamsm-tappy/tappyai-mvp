# Backend Topology & Identity Investigation — Zalo vs Google visibility

**Date:** 2026-07-29 · **Trigger:** Owner reports Google login sees 3 test accounts, Zalo login sees only itself.
**Method:** read-only. Service-role key used locally for admin reads only; never printed, nothing mutated.
**Verdict: NO duplicate project. NO RLS restriction. NO soft-deleted or banned account. The reported symptom is NOT explained by topology, identity, or the feed query — one user-dependent difference was found (follow graph) and is reported as evidence, not as a cause.**

## 1. Environment topology — ONE project, proven identical

| Item | localhost | production |
|---|---|---|
| Supabase Project URL | `https://fwznnobrdctuskgrvuik.supabase.co` (`.env.local`) | `https://fwznnobrdctuskgrvuik.supabase.co` (runtime network calls: `/auth/v1/user`) |
| Project Ref | `fwznnobrdctuskgrvuik` | `fwznnobrdctuskgrvuik` (decoded from the anon JWT payload) |
| Anon key fingerprint | len 208 · `sha256:65b759105402` | len 208 · **`sha256:65b759105402` — IDENTICAL** (extracted from prod chunk `2409-6604cecda9d70efb.js`) |
| Anon JWT payload | — | `{"iss":"supabase","ref":"fwznnobrdctuskgrvuik","role":"anon","iat":1780468093,"exp":2096044093}` |
| Auth URL | `https://fwznnobrdctuskgrvuik.supabase.co/auth/v1` | same |
| Service-role key | len 219 · `sha256:a3a780a92944` | not readable from outside (server-only) — code path proven below |
| Storage (media) | Vercel Blob `y5ozy0i9wdb73mam.public.blob.vercel-storage.com` (separate service, not Supabase Storage) | same host observed in prod video src |

**Zalo user creation uses the same project:** `/api/auth/zalo/complete` → `createAdminClient()` → `src/lib/supabase/admin.ts` builds the client from **`NEXT_PUBLIC_SUPABASE_URL`** + `SUPABASE_SERVICE_ROLE_KEY`. There is no second URL anywhere in the auth path.

**Conclusion:** one project, one database, one auth source, shared by production, localhost, Google login and Zalo login.

## 2. User identities — all three coexist in that one project

Source: Supabase Admin API `GET /auth/v1/admin/users` (11 users total) + `profiles` (11 rows) via service role.

| Account | `auth.users.id` | Provider | Last sign-in | Banned | Soft-deleted | Profile | Reviews |
|---|---|---|---|---|---|---|---|
| **Zalo** (`zalo_7571374941361288576@zalo.tappyai.com`) | `d2883fba-5fd6-4a1e-9ee7-1a82a9ecd71f` | `app_metadata.providers=["email"]`, `user_metadata.provider="zalo"` (magic-link bridge) | **2026-07-29T03:53:24Z** | `null` | `null` | "Huy Phạm", avatar ✓ | **3** |
| **huypham.sm@gmail.com** | `4dcce7cf-5f49-4c58-9901-2d586e31352d` | `google` | 2026-07-28T02:33:42Z | `null` | `null` | "PHẠM ĐOÀN HUY", avatar ✓ | **6** |
| **miastore2803@gmail.com** | `0f864f05-ad6f-4df7-a081-19a5ce63445f` | `google` | 2026-07-27T06:08:12Z | `null` | `null` | "Huy Phạm", avatar ✓ | **1** |

All three: active, not banned, not soft-deleted, profile row present. Total reviews 10, `is_hidden` set on **none**.

⚠️ **Two profiles share the display name "Huy Phạm"** (the Zalo account and miastore2803); huypham.sm renders as "PHẠM ĐOÀN HUY". Any account list shows two identical labels.

## 3. Explore feed — actual path traced

`/api/reviews/feed` → `getRequestUser(req)` (`src/lib/auth/getRequestUser.ts`) returns a client **scoped to the caller's identity** (cookie session for web, verified Bearer JWT for native), so `auth.uid()` RLS applies.

- **For-You (`sort=trending`)** — `from('reviews').select(…).or('is_hidden.is.null,is_hidden.eq.false').order(created_at desc).limit(200)`, scored in memory (watch/completion/engagement/recency × city boost), then a second `.in('id', wantIds)` fetch with `profiles(full_name, avatar_url)` — a **LEFT** join (not `!inner`), so a missing profile cannot drop a row. **No `user_id` filter anywhere on this path.**
- **Latest / search / userId** — same base, plus `eq('user_id', …)` only when `?userId=` is supplied.
- **Following (`following=true`)** — `user_follows` → `followingIds` → `.in('user_id', followingIds)`. If the caller follows nobody, the route returns `{reviews: [], empty: 'not_following_anyone'}` **before any query**. This path shows **only followed authors' posts — never the caller's own**.

**RLS measured empirically (not read from catalog — PostgREST cannot expose `pg_policies`):**

| Table | service-role (bypasses RLS) | anon key (RLS enforced) | Delta |
|---|---|---|---|
| `reviews` | 10 | 10 | **none** |
| `profiles` | 11 | 11 | **none** |

Per-author counts identical under both keys: `4dcce7cf`=6, `d2883fba`=3, `0f864f05`=1.

**Live production check (anonymous):** `GET https://www.tappyai.com/api/reviews/feed?sort=trending&limit=12` → 10 clips, authors `{d2883fba:3, 4dcce7cf:6, 0f864f05:1}` — **all three accounts visible without any login**.

**The one user-dependent difference found in the whole path — the follow graph** (`user_follows`, service role):

```
0f864f05 (miastore2803) → 4dcce7cf (huypham.sm)
4dcce7cf (huypham.sm)   → 0f864f05 (miastore2803)
0f864f05 (miastore2803) → d2883fba (Zalo)
d2883fba (Zalo)         → (follows NOBODY)
```

Consequence from the code: on the **"Đang follow"** tab both Google accounts see content, while the Zalo account gets the `not_following_anyone` empty result. On **"Đề xuất"** every identity sees all 10. This is the only visibility asymmetry between these identities that exists in the traced path — **recorded as evidence; NOT claimed as the cause**, because the Owner reports seeing the Zalo account itself rather than an empty feed.

## 4. Architecture validation — PASSES

Intended: one production Supabase project · one database · one auth source · all three accounts coexisting. **All four hold, proven in §1–§2.** No violation found.

## 5. Duplicate-project investigation — none found, one anomaly logged

No second Supabase project appears in any env var, code path, or runtime call. Canonical and only project: **`fwznnobrdctuskgrvuik`**.

⚠️ **Anomaly (logged, not acted on):** in the Owner's Chrome on `localhost:3000` a cookie named **`sb-your-project-auth-token-code-verifier`** exists alongside the real `sb-fwznnobrdctuskgrvuik-…` one. `your-project` is a **placeholder ref**, meaning some client was once constructed with a placeholder Supabase URL (e.g. `https://your-project.supabase.co`). It is a PKCE code-verifier only — **no session, no data, no second dataset**. Recommendation deferred until the Owner confirms which local build produced it. **Nothing deleted, nothing migrated.**

**Recommendation on merge/synchronise/retire:** **not applicable** — there is only one project. No merge, no sync, no retirement required.

## 6. What is still unproven

The Owner's observation stands as the active hypothesis (Constitution Article III). It is **not** explained by anything above. The missing datum is **which screen** the account list was observed on:

1. Explore feed — For-You (`Đề xuất`) / Latest (`Mới nhất`) / **Following (`Đang follow`)**?
2. Search → **`👤 Người dùng`** results (requires login; exact-match email/phone via admin API, partial name via `profiles`)?
3. A profile's follower / following list?
4. `Hồ sơ & Bài của tôi` (own posts only by design)?

Reproducing on the Zalo identity requires that session; the AI cannot sign in (OAuth/credentials forbidden). Until then: **no cause is claimed, no fix proposed.**

## Assumption register

| ID | Statement | Status |
|---|---|---|
| B1 | Production and localhost share one Supabase project/DB/auth | **EVIDENCE** (identical anon-key fingerprint + ref) |
| B2 | All three accounts exist, active, in that project | **EVIDENCE** (Admin API) |
| B3 | RLS does not restrict `reviews`/`profiles` | **EVIDENCE** (service-role vs anon counts identical) |
| B4 | The For-You feed is identity-independent | **EVIDENCE** (code path + anonymous prod call returns all 3 authors) |
| B5 | The Zalo account follows nobody → empty "Đang follow" feed | **EVIDENCE** (`user_follows`) |
| B6 | That follow gap is the cause of the Owner's observation | **ASSUMPTION — not claimed**; contradicted by "sees itself" ≠ "sees nothing" |
| B7 | The `your-project` cookie indicates a second project with data | **DISPROVEN** (code-verifier only; no session, no second URL in any config) |
