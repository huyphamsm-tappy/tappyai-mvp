# Analytics Deployment Runbook — Step 2: Production Environment Variable Verification

**Scope of this document:** Step 2 only. This is a **read-only verification checklist against the Vercel dashboard** — no code is modified, no migration is applied, and nothing is deployed as part of this step. Nothing in this document is executed yet; it defines exactly what to check and how to judge each result.

**Where to check:** Vercel project → **Settings → Environment Variables**, filtered to the **Production** environment specifically (not Preview, not Development — a variable can exist correctly in Preview while being missing or wrong in Production, and only Production matters for this deployment).

---

## Required variables

### V1 — `CRON_SECRET`

| | |
|---|---|
| **Purpose in this scope** | Gates `/api/cron/analytics-snapshot` (`src/app/api/cron/analytics-snapshot/route.ts:28`) — the single cron behind both Authentication Analytics and Activation Analytics rollups/dimension population. Also shared by 8+ other unrelated cron/debug routes in this codebase. |
| **Expected value/format** | A non-empty secret string (any format Vercel Cron sends as a Bearer token — this project's own convention, not a fixed external spec). No particular length/charset requirement beyond "long enough to not be guessable" — it is compared via exact string equality (`Bearer ${secret}` match), not hashed. |
| **PASS criteria** | Present in the **Production** environment, non-empty. |
| **FAIL criteria** | Missing, empty, or only present in Preview/Development. |
| **Common misconfiguration risk** | Set only for Preview during earlier testing and never promoted to Production; or rotated for one of the *other* 8 crons that share this variable without re-deploying, silently breaking this one too (shared blast radius, not specific to Analytics). |
| **Decision if FAIL** | **STOP.** Every cron invocation will 401 immediately (`route.ts:22-24`) — `auth_daily_rollup`, `user_acquisition`, `last_login_at` sync, and the entire Activation stage (candidate discovery, evaluation, `activation_daily_rollup`) never populate. This blocks all of Step 5 (Verification Checklist)'s cron-related items (C1–C8) before they can even be attempted. |
| **Decision if PASS** | CONTINUE to V2. |

---

### V2 — `NEXT_PUBLIC_SITE_URL` (highest-risk variable in this step)

| | |
|---|---|
| **Purpose in this scope** | Used by `isSameOrigin` (`src/lib/admin/rbac.ts:117-121`) to gate both `/api/admin/analytics/auth` and `/api/admin/analytics/activation` against cross-origin requests. Also referenced by Stripe checkout/portal flows (unrelated to this scope, but shares the same variable — a wrong value affects both). |
| **Expected value/format** | The **exact** real production origin, including scheme, exactly matching what a real browser sends in its `Origin` header when a user loads the admin dashboard — e.g. `https://www.tappyai.vn` or `https://tappyai.vn`, whichever is the **actual** canonical domain your users land on. No trailing slash (an `Origin` header never has one). Must match **case-sensitively and exactly**, including the `www` vs. apex distinction. |
| **PASS criteria** | Present in Production, and — critically — **matches the real domain a browser will actually send**, not just "looks plausible." This must be confirmed by checking what domain the production deployment is actually served from (Vercel's assigned production domain / custom domain settings), not assumed from the repo or `.env` files. |
| **FAIL criteria** | Missing; present but pointing at a Preview URL (e.g. `*.vercel.app`) instead of the real custom domain; present but with a `www`/apex mismatch relative to the actual serving domain; present with a trailing slash; present with `http://` instead of `https://`. |
| **Common misconfiguration risk (why this is called out specifically)** | `isSameOrigin` returns `true` when a request has **no** `Origin` header at all (`rbac.ts:118-119`) — which describes almost every automated test, curl request, and server-to-server call used throughout this project's own verification history. A **real browser loading the dashboard**, however, always sends an `Origin` header. This means: **this exact check has never once been exercised by anything in this entire multi-week Analytics build** — not by `npm test`, not by `tsc`/`lint`/`build`, not by any of the 150 unit tests, not by Step 1's SQL checks. The very first time this code path is exercised for real will be the first real admin opening the dashboard in a browser, in production. If the value is even slightly wrong, every dashboard API call 403s at that exact moment — with everything else about the deployment looking perfectly healthy. |
| **Decision if FAIL (or unverifiable)** | **STOP.** Do not consider Step 2 passed on this item without independently confirming the actual serving domain (check Vercel's Domains tab for the production deployment) and comparing it character-for-character against this variable's value. A "looks right" visual check is not sufficient given the risk described above. |
| **Decision if PASS** | CONTINUE to V3. |

---

### V3 — `NEXT_PUBLIC_SUPABASE_URL`

| | |
|---|---|
| **Purpose in this scope** | Read (non-null-asserted, no runtime guard) by `src/lib/supabase/admin.ts` to construct the admin Supabase client used by every service, cron, and API route in both Authentication Analytics and Activation Analytics. |
| **Expected value/format** | `https://<project-ref>.supabase.co` — must match the **production** Supabase project confirmed in Step 1 (project ref `fwznnobrdctuskgrvuik`, per the SQL editor URL used during Step 1's verification). |
| **PASS criteria** | Present, non-empty, and the project ref in the URL matches `fwznnobrdctuskgrvuik` exactly (the same project Step 1's 13 queries were run against). |
| **FAIL criteria** | Missing, empty, or pointing at a **different** Supabase project (e.g. a staging/dev project) — this would mean the deployed app reads/writes a different database than the one just verified in Step 1, silently invalidating all of Step 1's findings for the actual production deployment. |
| **Common misconfiguration risk** | A leftover value from an earlier project setup, or a copy-paste from a staging project's credentials during initial environment setup. |
| **Decision if FAIL** | **STOP.** If this points at the wrong project, every one of Step 1's 13 PASS results is irrelevant to what actually deploys — the whole plan must restart against the correct project's environment variables. |
| **Decision if PASS** | CONTINUE to V4. |

---

### V4 — `SUPABASE_SERVICE_ROLE_KEY`

| | |
|---|---|
| **Purpose in this scope** | Read by the same `src/lib/supabase/admin.ts` admin client (paired with V3) — grants the service-role (RLS-bypassing) access every Analytics service/cron/API route depends on to read/write `user_events`, `user_acquisition`, `auth_daily_rollup`, `activation_daily_rollup`, and to call all 5 SQL functions checked in Step 1's Q13. |
| **Expected value/format** | A non-empty JWT-format secret (Supabase's own service-role key format — starts with `eyJ...` typically). **Do not paste its actual value anywhere, including back to me** — only confirm it exists and was generated for the same project as V3. |
| **PASS criteria** | Present in Production, non-empty, generated for project ref `fwznnobrdctuskgrvuik` (same project as V3 — Supabase's dashboard shows which project a service-role key belongs to; cross-check there, not by inspecting the key's contents). |
| **FAIL criteria** | Missing, empty, or belongs to a different Supabase project than V3. |
| **Common misconfiguration risk** | Key rotated in Supabase (e.g. for a security incident response) without updating Vercel afterward — every admin client call would then fail authentication silently until traced back to this specific variable. |
| **Decision if FAIL** | **STOP.** Without a valid, matching service-role key, every Analytics read/write fails at the client-construction or auth layer — nothing in Step 5's checklist is executable. |
| **Decision if PASS** | This completes all four variable checks. |

---

## Execution order

Check **V1 → V2 → V3 → V4**, in that order. V2 carries the highest real-world risk (per its "common misconfiguration risk" note above) despite being simplest to state — do not rush past it with only a visual glance at the Vercel dashboard; explicitly cross-reference it against the actual serving domain shown in Vercel's Domains settings for this project.

Record, for each of the four: **present/absent in Production**, and for V2/V3 specifically, the **actual value observed** (V2's real domain string; V3's project-ref substring) so I can confirm the cross-checks above — V4's value itself should never be pasted back, only its presence and project association.

---

## Final production readiness conclusion for Step 2 — EXECUTED 2026-07-14 via Vercel dashboard (project `tappyai-mvp`, team `huyphamsm-tappy`)

**Production domain confirmed first (prerequisite for V2):** Project Settings → Domains shows `www.tappyai.com` marked **Production**; `tappyai.vn`, `www.tappyai.vn`, and `tappyai.com` all 308-redirect to it. **`https://www.tappyai.com` is the real domain a browser sends as `Origin` when a user loads the admin dashboard.**

| Variable | Present in Production? | Matches expected? | Evidence | STOP / CONTINUE |
|---|---|---|---|---|
| `CRON_SECRET` | ✅ Yes — tagged "Production and Preview" | ✅ Non-empty (value correctly not inspected) | Environment Variables list, search-filtered | **CONTINUE** |
| `NEXT_PUBLIC_SITE_URL` | ✅ Yes — tagged "All Environments" | ❌ **NO — MISMATCH** | Actual value: `https://tappyai-mvp.vercel.app`. Real production domain: `https://www.tappyai.com`. These do not match. | **STOP** |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes — tagged "All Environments" | ✅ Yes | Actual value: `https://fwznnobrdctuskgrvuik.supab...` — project ref `fwznnobrdctuskgrvuik` matches exactly the project Step 1's 13 queries were run against | **CONTINUE** |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes — tagged "Production and Preview", last updated Jul 6 | ⚠️ **Not independently verifiable via dashboard** — Vercel marks this variable `Sensitive` with no reveal option, so its project association cannot be cross-checked without exposing the secret value, which this plan explicitly prohibits. | Environment Variables list, search-filtered; "Sensitive" badge confirmed, no eye/reveal icon present (unlike the two `NEXT_PUBLIC_*` vars, which are non-secret by design and were safely revealed to read their values) | **CONTINUE (with caveat)** — if this actually belonged to the wrong Supabase project, it would manifest as an outright authentication failure the first time any admin service/cron tries to use it (Step 5's cron/API checks would fail hard, not silently) — this is a self-revealing failure mode, unlike V2's silent one, so it is safe to proceed with this caveat noted rather than block on it. |

## Overall Step 2 decision: **STOP**

**Root cause:** `NEXT_PUBLIC_SITE_URL` is set to the Vercel-assigned default domain (`https://tappyai-mvp.vercel.app`) instead of the real, custom production domain (`https://www.tappyai.com`) that `www.tappyai.com` actually serves the app from. This is precisely the risk this document's V2 section warned about before any check was run.

**Concrete impact if deployment proceeded as-is:** `isSameOrigin` (`src/lib/admin/rbac.ts:117-121`) would compare every real browser request's `Origin: https://www.tappyai.com` header against `process.env.NEXT_PUBLIC_SITE_URL = "https://tappyai-mvp.vercel.app"` — a mismatch — and reject it with 403. **Every dashboard API call from a real admin browsing the real production site would fail**, while everything else (migrations, cron, RBAC login itself) would appear completely healthy. This would have been discovered only during Step 5's live dashboard verification (D1/A4), at the worst possible time — after migrations were already applied and the app already deployed.

**Required fix before Step 3 can proceed:** Update `NEXT_PUBLIC_SITE_URL` in the Vercel Production environment to `https://www.tappyai.com` (exact value — no trailing slash, matching the domain marked Production in the Domains tab). **I have not made this change** — modifying environment variables is outside this step's read-only scope, and you should apply and confirm it yourself. Once updated, this specific check must be re-run to confirm CONTINUE before Step 3 (migration application) begins.

---

## Re-verification after fix — 2026-07-14

**Owner explicitly authorized the fix** (env var edits are a production-config change requiring clear confirmation, not implied by a general "continue" instruction — confirmed separately before acting). `NEXT_PUBLIC_SITE_URL` was updated in the Vercel dashboard (Environment Variables → edit) from `https://tappyai-mvp.vercel.app` to `https://www.tappyai.com`, applied across Production/Preview/Development (the variable was configured as one shared value across all three environments before this fix, and remains so — no environment-splitting was introduced, since that wasn't part of what was authorized).

**Confirmed by re-reading the value after save:** `NEXT_PUBLIC_SITE_URL = https://www.tappyai.com` — now matches the real production domain confirmed earlier in this document. **V2 now PASSES.**

| Variable | Final status |
|---|---|
| `CRON_SECRET` | PASS |
| `NEXT_PUBLIC_SITE_URL` | **PASS (fixed and re-verified)** |
| `NEXT_PUBLIC_SUPABASE_URL` | PASS |
| `SUPABASE_SERVICE_ROLE_KEY` | CONTINUE (with the noted self-revealing-failure caveat) |

## Overall Step 2 decision (updated): **CONTINUE**

**Important caveat carried forward, not resolved by this step:** an environment variable change in Vercel does **not** retroactively affect the currently-running production deployment — it only takes effect on the **next deployment**. This means the fix just applied is correct and verified in configuration, but has **no effect yet** on the live site until Step 4 (Deploy) actually redeploys the application. This is expected and does not block Step 3 (which only touches the database, not the app runtime) — it is simply something Step 4/5 must account for (the dashboard's same-origin behavior cannot be verified live until after the redeploy that Step 4 performs).

Step 2 is now complete with all four variables at CONTINUE. Ready for Step 3 preparation once explicitly approved.

---

*Step 2 verification executed, one real misconfiguration found and — with explicit owner authorization — corrected and re-verified. No code changed, no migration applied, no deployment performed. The env var fix will only take effect on the next deployment (Step 4).*
