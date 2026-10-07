# TappyAI — Non-Production Audit Environment · Readiness Report

**Date:** 2026-09-17 · **Branch:** `design/v3-phase4` @ `f6712b8` (worktree `v3-phase4-design`)
**Task:** provision/verify only. **Result (Phase 1A.3 final, 2026-09-17 14:00 +07): `READY FOR BASELINE` — see the last section; earlier sections are the historical record.**
**Baseline executed: NO · LLM/search runs executed: 0 · Application code changed: NO · Production written: NO.**

Everything below was established from configuration files, source and repository documentation. No request was sent to Supabase, Vercel, KV, Anthropic, Serper, Google or any other service. Secret values were never printed; only variable names, hostnames/refs and file names appear.

---

## A. Existing environment inventory

| Resource | Found? | Reference (sanitised) | Non-prod verified? | How checked |
|---|---|---|---|---|
| DEV Supabase project | **NO** | — | — | every `.env*` in this worktree and the main checkout (`.env.local`, `.env.local.bak-before-restore`, `.env.production.local`, `.env.production.tmp`, `.env.vercel.prod.tmp`, `.env.vercel.tmp`) references exactly one ref: `fwznnobrdctuskgrvuik`; repo-wide grep for `*.supabase.co` → 7 hits, all the same ref |
| Staging / test / preview Supabase project | **NO** | — | — | same; `android/app/build.gradle.kts:230`: "single-project setup — no evidence of separate staging/prod Supabase projects"; Android `staging` flavour points at the placeholder `staging.tappyai.example.com` |
| Vercel Preview/Development environment with its own DB | **NO** | `.env.vercel.tmp` ("Created by Vercel CLI", pulled from the non-production Vercel env) | — | it carries the **same** production Supabase ref → Vercel Preview/Development share the production database |
| Non-production KV / Upstash store | **NO** | `.env.local` `KV_REST_API_URL` host prefix `true-bonef…` (single store); no `UPSTASH_*` anywhere | — | one store only, the one the deployed app uses |
| Local Supabase stack (`supabase start`) | **NO** | no `supabase/config.toml`; no `supabase` CLI on PATH; Docker installed but not running | — | `which supabase` empty; `docker info` fails |
| DEV Cloud Run service | **NO** | no Dockerfile, no Cloud Run config (`infra/` holds only `gcs`) | n/a | Cloud Run is not part of this product's runtime |
| Local development runtime | YES (capability) | `next dev` on this checkout | **NO** — it would load `.env.local` → production Supabase + production KV | Next.js env loading order |
| Dedicated audit/test user | **NO** | — | — | no test identity in env, docs, scripts or `supabase/seed` (`backoffice_super_admins.sql`, `platform_owner_bootstrap.sql` are owner/admin bootstraps for the real project) |
| Existing test credentials | **NO** | — | — | — |
| Audit infrastructure | YES | `scripts/audit/baselineRunner.mjs`, `scripts/audit/*.audit.test.ts`, `docs/audit/**` | n/a | Phase 1 + review |
| Supabase management PAT | present as `SUPABASE_ACCESS_TOKEN` in `.env.local` | — | — | **not used**: this task has no explicit authorization to create billable resources on the owner's organisation, and the standing project rule treats the PAT as unavailable |

**Conclusion A:** there is no non-production stateful resource of any kind. Provisioning requires the owner (§M checklist).

## B. Production separation verification (current state)

| Component | Current target | Environment | Verified non-prod? |
|---|---|---|---|
| Backend (local `next dev`) | this checkout reading `.env.local` | production-shaped | **NO** |
| Backend (deployed) | `https://www.tappyai.com` (Vercel) | production | **NO** |
| Supabase | `fwznnobrdctuskgrvuik.supabase.co` | production (`docs/backoffice/phase-reports/ANALYTICS_STEP2_ENV_VERIFICATION.md:44-45`, `docs/AI_Personalization_Architecture.md:6`, `AUTH_SETUP.md:3`) | **NO** |
| Auth | same project (`getRequestUser.ts:26-27` verifies bearer JWTs against `NEXT_PUBLIC_SUPABASE_URL`; `/api/auth/anonymous` mints anonymous users there) | production | **NO** |
| Memory | `user_memory` via `createAdminClient()` (`lib/supabase/admin.ts:6-7` ← `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) | production | **NO** |
| Quota / KV | `KV_REST_API_URL` + `KV_REST_API_TOKEN` → `distributedRateLimit` (`distributedRateLimit.ts:128-138`) | production | **NO** |
| Model endpoint | Anthropic via `ANTHROPIC_API_KEY` | vendor account shared with production (no dev key exists) | n/a (stateless; cost only) |
| Search providers | Serper (`SERPER_API_KEY`), Google Places (`GOOGLE_PLACES_API_KEY`), OSM/Overpass (no key) | vendor accounts shared with production | n/a (stateless; cost only) |
| Test user | none | — | **NO** |

**PRODUCTION SAFETY of the *current* environment: NOT VERIFIED as non-production — it is production.** No stateful call was made.

## C. Non-production resources

None exist. None were created (no authorization; see A, last row). The required set is listed in §M.

## D. Supabase readiness

- **Required project:** a new Supabase project (any region), named to mark it as audit/dev, separate from `fwznnobrdctuskgrvuik`, with **no production data copied**.
- **Schema the `/api/chat` path touches** (grep of the route and its direct helpers): tables `account_status`, `subscriptions`, `user_memory`, `user_preferences`, `user_integrations`, `reviews`, `review_interactions`, `review_likes`, `review_saves`, `user_follows`, `user_events`; RPCs `decision_evidence_save`, `decision_evidence_load`; plus Supabase-managed `auth.users` (43 of the 83 migrations reference `auth.users` / `auth.uid()`).
- **Migrations:** 83 files in `supabase/migrations/` (`20260620_place_photos.sql` … latest) + 14 rollback scripts. **NO DATA on whether the full chain applies cleanly in order to an empty project**: the `embedded-postgres` suite applies *selected* migrations per test (e.g. `anonymous_chat_full_chain.test.ts:44`, `phase6_messenger.test.ts:32`), never the whole directory. Applying the chain is an owner step (Supabase CLI `db push` / SQL editor), and any failure there is an **ENVIRONMENT NOT READY** condition, not something this task may patch.
- **Seed data:** none required for the 15 queries. `reviews` empty ⇒ no `tappy_rating` on rows (an ordinary production case). `subscriptions` needs one row for the test user (§G).
- Status: **NOT READY** (project does not exist).

## E. Memory isolation

Path (source): `route.ts` → `buildChatPromptContext(user.id, supabase)` reads `user_memory`/`user_preferences` under the caller's client; `onFinish` → `updateMemory(authedUserId, …, createAdminClient())` upserts `user_memory`; `decision_evidence_save/load` RPCs run under the caller's client; `user_events` upsert (clip path only) under the admin client. **All of these resolve to `NEXT_PUBLIC_SUPABASE_URL`.** Isolation therefore follows from the server process's env pointing at the non-prod project — and from nothing else. In the current environment: **MEMORY ISOLATION: NOT VERIFIED** (would write to production).

## F. Quota isolation

- Path (source): `route.ts` → `consumeAiQuestion(aiQuotaIdentity(user, ip))` **before any model/tool work** → `isDistributedStoreConfigured()` → Upstash-compatible REST store when `KV_REST_API_URL`+`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`+`_TOKEN`) are set, else an **instance-local in-memory map** (`aiQuestionQuota.ts:138-146`, `distributedRateLimit.ts:128-138`). Empty-string values count as unset (`!!url && !!token`).
- Limits (code constants, not env): guest (no bearer, keyed by **IP**) and anonymous session → **5 lifetime**; account → **15 per VN day**; Pro (`subscriptions.status='active'` with future `current_period_end`) → exempt (`route.ts:377`).
- Isolation options (either is acceptable; neither is configured today): (1) **omit** the KV/Upstash variables in the audit server's env → instance-local store, zero shared state; (2) a **dedicated** non-prod Upstash/KV database. Never the production KV.
- 36 runs: possible **only** with a Pro test user (or 15/day over 3 VN days). Guest/anonymous paths can never reach 36.
- Current environment: **NOT ISOLATED** (production KV).

## G. Test user readiness

- Must be created by the owner **in the non-prod project only** (this task may not create accounts anywhere): email/password identity with a non-personal address; then a `subscriptions` row `{ user_id, status: 'active', current_period_end: <future> }` in the **non-prod** DB so the quota exemption applies; `account_status` must not mark it blocked.
- The runner authenticates with `AUDIT_TEST_USER_BEARER` (a Supabase access token minted from the non-prod project; default lifetime ~1 h — sufficient for one 36-run pass, but a refresh may be needed if the run stalls).
- Verification once it exists (static/config, no LLM): the token's `iss` must be `https://<nonprod-ref>.supabase.co/auth/v1`; `getRequestUser` verifies it against the server's `NEXT_PUBLIC_SUPABASE_URL`, so a token from the wrong project simply fails auth (guest path → 5-run cap) — the runner records that as failures, it does not fall back to production.
- Status: **NOT READY** (no user, no project).

## H. Backend endpoint / runtime

- **Preferred runtime:** local `next dev` (or `next build && next start`) of this branch in a **dedicated checkout/worktree** whose `.env.local` contains only non-prod values and **no** `KV_REST_API_URL`/`KV_URL`/`REDIS_URL`/`UPSTASH_*`. `.env*` files are gitignored, so this does not touch the repository. Overriding via shell variables on top of the existing production `.env.local` is **not recommended**: a variable cannot be unset by an env file, and NO DATA on whether an empty shell value survives Next's env loading — a dedicated checkout is unambiguous, and the runner's `.env.local` scan (`baselineRunner.mjs:73-77`) then passes.
- **Vercel Preview: NOT sufficient** — Preview/Development env carries the production Supabase ref (`.env.vercel.tmp`), and Preview is behind Vercel SSO (`docs/perf/PHASE_B_BASELINE_2026-08-10.md` §1). Using it would require both a separate env scope and a Protection-Bypass token: owner actions, and still not preferred.
- **Cloud Run: not used, not required.**
- No backend was started in this task (starting it against the current env would have exercised production identity/quota paths on the first request; connectivity verification adds nothing until non-prod values exist).
- Status: **NOT READY**.

## I. Model / search credential readiness

| Credential | Required for representative baseline? | Exists locally | Nature |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes (every turn) | yes | production vendor key; no dev key exists |
| `SERPER_API_KEY` | yes (`/maps` place search, price/order snippets, TikTok batch, web_search) | yes | production vendor key |
| `GOOGLE_PLACES_API_KEY` | yes (first provider in the chain; without it Serper `/maps` answers — still representative of the V3 path, but Google-branch rows differ) | yes | production vendor key |
| `LLM_PROVIDER`, `LLM_*_MODEL` | must be **unset** | unset | keeps `claude-haiku-4-5-20251001` for every role (`providers/claude.ts:37-42`) |
| `GCP_LOGGING_ENABLED` | unset (console logging only) | unset | fine for a local run |
| `SUPABASE_SERVICE_ROLE_KEY` | yes — of the **non-prod** project (memory writes) | only the production one | must be the non-prod key |

Vendor keys are stateless with respect to TappyAI data; using the same vendor accounts from an isolated server affects cost only (≤36 turns). They must be supplied as local runtime environment variables in the dedicated checkout, never committed. **Missing** Serper/Google keys would materially change behaviour (OSM/DuckDuckGo fallback — the Phase B caveat) and would make the baseline non-representative.
Status: keys exist but are **not yet placed in a non-prod env** → NOT READY.

## J. Location readiness — **VERIFIED (mechanism)**

`route.ts:129-133` reads `body.userLocation.{lat,lng,address}` (numbers required) and threads it to `deriveNeedProfile`, the GPS prompt block and `searchPlaces` bias/`distance_km`. The web client (`ChatInterface.tsx`) and iOS (`ChatService.swift:186-187`) send exactly this field. `baselineRunner.mjs` sends `{ lat: 10.7769, lng: 106.7009, address: 'District 1, Ho Chi Minh City, Vietnam' }` for #8/#10/#11. No code change needed; no request made.

## K. Conversation setup readiness — **VERIFIED (mechanism)**

`/api/chat` accepts the full `messages` array (`validateClientInput`, ≤100 messages, roles user/assistant, tool state stripped by design); the route trims to the last 10 and sanitises prior assistant text. The runner posts the setup message, captures the real streamed `0:` reply, and sends `[setup user, real assistant text, primary user]` — identical to what the web client would hold. No state is fabricated; no request made now.

## L. Baseline runner safety review (static; not executed)

| Requirement | Status | Evidence |
|---|---|---|
| Refuses production Supabase | ✔ unconditional | `baselineRunner.mjs:69` — refusal occurs even if the prod ref is typed as "confirmed" |
| Requires explicit non-prod confirmation | ✔ | line 70 |
| Refuses a `.env.local` that names the prod ref or a distributed KV | ✔ | lines 73-77 (cwd-relative; skipped if run from another directory — run it from the checkout root) |
| 36-run cap, setup runs counted | ✔ | plan = 30 + 6 = 36; checked at line 87 and inside the loop |
| Excludes language tests | ✔ | separate vitest files |
| 2 runs per primary | ✔ | |
| No silent retries; failures recorded | ✔ | single `fetch` at line 131; errors → `status: 0`, `errors[]` |
| Real setup turns | ✔ | §K |
| Mock location | ✔ | §J |
| Timestamp/timezone | ✔ (UTC ISO + note that the server clock block is Asia/Ho_Chi_Minh) | |
| Sanitises secrets | ✔ | bearer/headers never written; URL-like keys redacted |
| Dry-run performs zero network/state operations | ✔ (static) | `AUDIT_DRY_RUN` exits at line 89, before the only `fetch` (131) — **not executed in this task** |
| Known reporting gaps (unchanged, not fixed) | — | operator-typed ref trusted; guest/free-tier caps recorded as failures rather than pre-empted; failed setup does not flag its primary; `AUDIT_SURFACE` default = non-web prompt; `searchPlaces` 30-min in-process cache between run 1 and run 2; the `.env.local` scan would also refuse an explicit `KV_REST_API_URL=""` line even though the app treats it as unset — simply omit the line |

## M. Final safety gate — `NOT READY FOR BASELINE`

| Gate | State |
|---|---|
| Supabase verified non-production | **NO** — no non-prod project exists |
| Database isolated | **NO** |
| Auth isolated | **NO** |
| Memory isolated | **NO** |
| Quota store isolated | **NO** |
| Dedicated test user in non-prod | **NO** |
| Test user has sufficient isolated quota (Pro) | **NO** |
| Backend endpoint verified non-production | **NO** |
| Model credentials safely available | YES (exist; must be placed in the non-prod env) |
| Search credentials safely available | YES (exist; must be placed in the non-prod env) |
| Location mechanism | YES |
| Conversation setup mechanism | YES |
| Runner passes static safety review | YES |
| No production resource would receive state-changing traffic | **NO** in the current env |
| No application code changed | YES |

### Owner-provisioned resources (checklist — configure secrets in the secure env only; do not paste them in chat)

```text
1. Create a NEW Supabase project (name it e.g. tappyai-audit-dev); never reuse fwznnobrdctuskgrvuik; copy no production data.
2. Apply supabase/migrations/** in filename order to that project (Supabase CLI `db push` or SQL editor). Report any migration that fails — do not patch it ad hoc.
3. Create ONE dedicated test user in that project (non-personal email/password), and insert a `subscriptions` row for it: status='active', current_period_end = a future timestamp (Pro ⇒ quota-exempt, so 36 runs fit in one day).
4. Prepare a DEDICATED checkout/worktree of branch design/v3-phase4 whose .env.local contains ONLY:
   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY  ← of the NEW project
   NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL = http://localhost:3000
   ANTHROPIC_API_KEY, SERPER_API_KEY, GOOGLE_PLACES_API_KEY  ← runtime-only, never committed
   and NO KV_REST_API_URL / KV_REST_API_TOKEN / KV_URL / REDIS_URL / UPSTASH_* (⇒ instance-local quota), NO LLM_* overrides.
   (Alternative to the omission: a dedicated non-prod Upstash database — never the production one.)
5. Mint an access token for the test user from the NEW project and expose it to the runner as AUDIT_TEST_USER_BEARER (env only).
6. Decide: AUDIT_SURFACE=web (web prompt variant) or unset (mobile variant); and whether to restart the server between run 1 and run 2 to defeat the searchPlaces cache.
7. Then, in a later explicitly authorised phase: start next dev in that checkout, run
   AUDIT_BASE_URL=http://localhost:3000 AUDIT_SUPABASE_REF=<new-ref> AUDIT_CONFIRMED_NONPROD_REF=<new-ref> AUDIT_DRY_RUN=1 node scripts/audit/baselineRunner.mjs
   from the checkout root, and only after that the real run.
```

Once 1–5 are done, the re-verification this report describes (§B matrix with the new ref, token issuer check, `.env.local` scan, migration status) can be repeated statically before any baseline authorisation.

## Git integrity

`docs/audit/git-status-env-before.txt` / `git-status-env-after.txt`; tracked `git diff --stat` identical to `git-before.txt`. Only `docs/audit/**` changed in this task.


---

# PHASE 1A — Provisioning attempt (2026-09-17, owner-authorised) · Result: `NOT READY FOR BASELINE`

**Baseline executed: NO · LLM calls: 0 · Search calls: 0 · `/api/chat` invoked: 0 · Application code changed: NO · Production written: NO.**
Git: `git-status-1a-before.txt` / `git-status-1a-after.txt` identical; tracked `git diff --stat` identical to `git-diff-1a-before.txt` (and to Phase 1's `git-before.txt`). Branch `design/v3-phase4` @ `f6712b8`.

## 1. Provisioning actions performed

| Step | Action | Outcome |
|---|---|---|
| Tooling discovery | Checked Supabase CLI (PATH, `node_modules/.bin`), CLI login state (`~/.supabase`), Management PAT in every `.env*` of both checkouts and in the session env, Vercel CLI, Docker, gcloud, `scripts/migrations/**`, `supabase/seed/**`, `supabase/tests/**` | Supabase CLI: **ABSENT**; CLI login: **ABSENT** (`~/.supabase` holds only telemetry); Vercel CLI: PRESENT (not needed; not used); gcloud: PRESENT (not relevant); Docker Desktop: PRESENT, engine **not running** |
| Management PAT validation | One `sbp_…` token found (identical in both checkouts' `.env.local`); validated with the read-only call `GET https://api.supabase.com/v1/projects` | **INVALID — HTTP 401 `Unauthorized`** from every copy. No other token anywhere. ⇒ hosted project creation / key retrieval / `database/query` are all impossible |
| Existing non-prod project | The standing project note records a second project on this account, ref `nhncoqyadofojjrnpiia` ("staging"), not referenced anywhere in the repo | **NO DATA — cannot be verified** (no valid PAT to list projects, no anon key/URL for it in any config). Not used |
| Local Supabase stack | Launched Docker Desktop to evaluate `supabase start` as a credential-free isolated alternative | Engine did not report ready within the task window; **not pursued** because the migration gate below blocks readiness regardless of where the database lives. (Docker Desktop may still be starting; it was not used and can be closed.) |
| New Supabase project | — | **NOT CREATED** (no authorised tooling works) |
| Migrations | — | **NOT APPLIED** — see §3: the chain cannot be established from `supabase/migrations/**` |
| Test user / Pro row | — | **NOT CREATED** (no project) |
| Audit worktree / `.env.local` | — | **NOT CREATED** (nothing to point it at) |

## 2. New Supabase project — safe identifier

None. Production ref `fwznnobrdctuskgrvuik` was **not** touched (no write-capable call was made anywhere; the only network calls were two `GET /v1/projects` token probes that returned 401).

## 3. Migration status — **BLOCKED: the complete chain cannot be established from the repository**

Static evidence (no database needed):

1. **Filename order is not an application order.** `supabase/migrations/` holds 59 dated `2026MMDD_*.sql`, 22 undated `add_*.sql`, plus `deferred/` and `rollback/`. Sorted by filename, position **3** is `20260627_user_memory.sql`, whose first statement is `ALTER TABLE public.user_preferences ADD COLUMN …`; the table is created by `add_preferences.sql` at position **73**. On an empty database the chain fails at the third file.
2. **Four baseline tables have no `CREATE TABLE` in any migration**: `reviews` (first referenced `20260703_add_reviews_update_policy.sql`), `profiles` (`20260711_music_ugc_combined.sql`), `user_memory` (`add_gatea_db_hardening.sql`), `conversations` (`20260808b_anon_claim_conversations.sql`). The repo states this itself:
   - `supabase/migrations/20260818_publication_boundary_rls.sql:21-24`: "The base SELECT policy on `public.reviews` … was applied out-of-band and exists ONLY in production. There is no `CREATE TABLE public.reviews` anywhere in this repo."
   - `supabase/migrations/20260712_prod_baseline_and_review_saves_indexes.sql:5-9`: "`review_saves` and `subscriptions` exist in the live production database but have NO CREATE TABLE migration (they were applied out-of-band in the SQL editor). A fresh / disaster-recovery environment therefore cannot be provisioned from the migration set." (that file fixed those two; the four above remain).
   - `docs/architecture/ADR-020-repository-baseline-objects.md`: "Some objects those migrations read are repository-baseline objects: their CREATE statement is absent from the repository's migration history because … an earlier un-captured baseline created them (e.g. `profiles`, `reviews`)." ADR-020 permits *test harnesses* to scaffold them; it explicitly does not authorise reconstructing production schema that way, and the Phase 1A brief forbids audit-only schema changes.
3. The root `supabase-schema.sql` (197 lines) creates `profiles`, `subscriptions`, `user_memory`, `user_preferences`, `conversations`, `bookings`, `services`, `message_feedback` — but **not** `reviews`, and it is not part of `supabase/migrations/**`; nothing records whether production's `profiles`/`user_memory` still match it.
4. The `embedded-postgres` suite never applies the whole directory; each test replays a hand-picked subset on top of ADR-020 scaffolds (`anonymous_chat_full_chain.test.ts:44`, `phase6_messenger.test.ts:32`).

Consequence: applying "the existing migration chain in filename/order sequence" to an empty project **fails at file 3** and, even with a curated order, cannot produce `reviews`/`profiles`/`user_memory`/`conversations` or production's base RLS policies. Per §6 of the brief (no patching, no skipping, no audit-only schema) this is a hard STOP. The `/api/chat` schema list (`account_status`, `subscriptions`, `user_memory`, `user_preferences`, `user_integrations`, `reviews`, `review_interactions`, `review_likes`, `review_saves`, `user_follows`, `user_events`, `auth.users`, RPCs `decision_evidence_save/load`) therefore cannot be verified in any non-prod database yet.

## 4. Auth issuer verification — NOT APPLICABLE (no non-prod project)
## 5. Dedicated test user — NOT CREATED
## 6. Pro entitlement — NOT CREATED
## 7. Quota isolation — design verified (omit `KV_REST_API_URL`/`KV_REST_API_TOKEN`/`KV_URL`/`REDIS_URL`/`UPSTASH_*` ⇒ `isDistributedStoreConfigured()` false ⇒ instance-local store; limits 5 lifetime guest/anon, 15/day user, Pro exempt) — **not instantiated** (no audit runtime exists yet); effective-runtime check pending
## 8. Backend runtime target — planned: dedicated worktree at `f6712b8` with its own `.env.local` (non-prod Supabase, no KV, vendor keys runtime-only), `next dev` on a non-3000 port, `scripts/audit/` copied in untracked — **not created**
## 9. Vendor credential presence — `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GOOGLE_PLACES_API_KEY`: PRESENT in the production-shaped `.env.local` (values not printed, not copied anywhere); `LLM_*`: ABSENT (pinned model preserved)
## 10. Location mechanism — VERIFIED statically (unchanged): `route.ts:129-133` reads `body.userLocation.{lat,lng}`; the runner sends District 1 for #8/#10/#11
## 11. Conversation setup — VERIFIED statically (unchanged): full `messages` array accepted, tool state stripped by design, prior assistant text carried forward; runner performs real setup turns for #1/#5/#7
## 12. Baseline runner safety — VERIFIED statically (unchanged from the review): unconditional production-ref refusal (`baselineRunner.mjs:69`), non-prod attestation (70), `.env.local` scan (73-77), 36-cap incl. 6 setup runs (87 + loop), single `fetch` (131) with no retry, failures recorded, bearer env-only and never written, URL-like keys redacted; not executed
## 13. Production-separation matrix (current state)

| Component | Production target | Audit target | Verified isolated? |
|---|---|---|---|
| Supabase | `fwznnobrdctuskgrvuik` | none | **NO** |
| Auth | production issuer | none | **NO** |
| Database | production DB | none | **NO** |
| Memory | production `user_memory` | none | **NO** |
| Subscriptions | production | none | **NO** |
| AI quota | production KV | none (design: instance-local) | **NO** |
| Backend | production Vercel | none (design: local dedicated) | **NO** |
| Anthropic | vendor | would be audit runtime (stateless) | n/a |
| Search | vendor | would be audit runtime (stateless) | n/a |
| Test user | none | none | **NO** |
| Location | real user data | fixed District 1 via `userLocation` | YES (mechanism) |

## 14. Git integrity — VERIFIED (only `docs/audit/**` changed)
## 15. Execution statement — **No LLM call, no search call, no `/api/chat` request, no Anthropic/Serper/Google/OSM/DuckDuckGo request was made. The only outbound requests were read-only `GET https://api.supabase.com/v1/projects` token probes (both 401).**

## Owner action still required

```text
1. Issue a fresh Supabase Personal Access Token (dashboard → Account → Access Tokens) and place it in the audit
   checkout's .env.local as SUPABASE_ACCESS_TOKEN — or create the project yourself in the dashboard. The current
   token is expired (401). (Alternatively install Docker + Supabase CLI for a local stack; the schema problem
   below still applies.)
2. Provide a production-matching SCHEMA for the new project, because supabase/migrations/** cannot rebuild it:
   the recommended source is a schema-only dump of production (pg_dump --schema-only, or the dashboard's
   schema export) — NO data rows. This is what ADR-020 and 20260712/20260818 already say is missing.
   Apply it to the NEW project (never to production), then the audit can verify the /api/chat schema list.
   (An explicit, owner-defined migration apply order would be an acceptable substitute only if it also creates
   reviews/profiles/user_memory/conversations and the base RLS policies — today nothing in the repo does.)
3. Then the remaining Phase 1A steps can be executed as designed: test user + Pro subscriptions row in the NEW
   project, dedicated worktree with a non-prod .env.local and no KV variables, effective-env verification,
   bearer via AUDIT_TEST_USER_BEARER, static re-verification, and only then a separately authorised baseline.
```


---

# PHASE 1A.3 — Autonomous provisioning attempt (2026-09-17, owner-authorised) · Result: `NOT READY FOR BASELINE`

```text
Baseline executed: NO · LLM calls: 0 · Search calls: 0 · /api/chat calls: 0
Production writes: 0 · Production data copied: NO · Production rows read: 0
Application code changed: NO · Migration files changed: NO
```

Git: `git-status-1a3-before.txt` / `git-status-1a3-after.txt` identical; tracked `git diff --stat` unchanged. Only `docs/audit/**` changed (this section, `docs/audit/schema-baseline/prod-postgrest-openapi-inventory.json`, snapshots).

## 1. Provisioning summary

The owner's single-authority workflow requires credentials that are **not present**: the local environment is byte-for-byte the one audited in Phases 1A–1A.2 (`.env.local` mtimes 2026-09-07 / 2026-09-08, no session env). Nothing could be provisioned. What was possible — and done — is a read-only **schema-metadata inspection of production** through a channel that is provably rows-free, which closes every previously UNKNOWN column fact and pins the exact owner inputs still missing.

| Step (brief §) | Outcome |
|---|---|
| §4 credentials | `SUPABASE_ACCESS_TOKEN` PRESENT → **INVALID** (read-only `GET /v1/projects` → 401, re-tested); `SUPABASE_DB_PASSWORD` / `SUPABASE_DATABASE_URL` / `PROD_DATABASE_URL` / `DATABASE_URL` **ABSENT**; `NEXT_PUBLIC_SUPABASE_ANON_KEY` PRESENT, valid JWT (`role=anon`, `ref=fwznnobrdctuskgrvuik`); `SUPABASE_SERVICE_ROLE_KEY` PRESENT, valid (`role=service_role`, same ref); `ANTHROPIC_API_KEY` / `SERPER_API_KEY` / `GOOGLE_PLACES_API_KEY` PRESENT (not used). Tools: Supabase CLI ABSENT, `pg_dump`/`psql` ABSENT (no PostgreSQL client install; `embedded-postgres` ships a server, not `pg_dump`), Docker engine not responding (`docker info` hangs), Vercel CLI PRESENT (irrelevant) |
| §5 management access | **UNAVAILABLE** — no valid PAT, no CLI login, no other authorised management channel |
| §6 production identity | **VERIFIED** — `NEXT_PUBLIC_SUPABASE_URL` host = `fwznnobrdctuskgrvuik`; both JWT keys carry `ref=fwznnobrdctuskgrvuik`; the PostgREST document served at that URL identifies PostgREST 14.5, "standard public schema" |
| §7 schema acquisition | `pg_dump` **NOT POSSIBLE** (no binary, no connection string). Equivalent schema-only export via Management API `database/query` **NOT POSSIBLE** (PAT invalid). Performed instead: one read-only `GET /rest/v1/` (PostgREST OpenAPI root) with the service-role key — see §2–3 |
| §10 new project | **NOT CREATED** — no management access |
| §11–§16 apply schema / verify DB / test user / Pro / quota / runtime / bearer | **NOT PERFORMED** — no project |

## 2. Production schema acquisition method

`GET https://fwznnobrdctuskgrvuik.supabase.co/rest/v1/` with `apikey`/`Authorization` = service-role key (the anon key is refused for this endpoint: `"Only the service_role API key can be used for this endpoint"`). This is PostgREST's OpenAPI description: tables, columns, JSON/PG types, defaults, required flags, PK/FK notes, exposed views, and RPC signatures of the exposed schema. **It is metadata by construction — the endpoint cannot return rows.** The raw 350,035-byte document was parsed in memory and **not stored**; a derived inventory (`tables → columns`, `rpcs`) was written to `docs/audit/schema-baseline/prod-postgrest-openapi-inventory.json` (sha256 `828c0a3f…aed0ef`, 70 tables, 52 RPCs). `docs/audit/` is untracked; nothing was committed.

## 3. Proof that the artefact is schema-only

- Endpoint semantics: PostgREST's root serves the OpenAPI spec only; table data requires `GET /rest/v1/<table>`, which was never called.
- Content check on the raw document: no `INSERT`, no `COPY`, no row objects; only `definitions`/`paths`.
- Stored artefact: column names/types/defaults and RPC names only. **DATA ROWS = 0 · AUTH USERS = 0 · USER MEMORY = 0 · CONVERSATIONS = 0 · PII = 0 · TOKENS = 0 · SECRETS = 0.**
- Limitation (why this is not the baseline): it carries **no indexes, no CHECK/UNIQUE constraints, no triggers, no RLS policies, no function bodies, no grants, no enum members, and nothing outside the exposed `public` schema** (`auth.*`, `handle_new_user` trigger). A faithful non-prod copy still needs DDL-level extraction (§20).

## 4. Schema baseline validation against Phase 1A.1 findings (production metadata vs repository)

| Object | Production (OpenAPI) | Repository | Verdict |
|---|---|---|---|
| `profiles` | 10 cols: `id, username, full_name, avatar_url, created_at, updated_at, onboarded, follower_count, following_count, language` | root script: `id, email, full_name, avatar_url, …, onboarded, stripe_customer_id`; no `CREATE` in migrations; `username` never created in Git | **DRIFTED** — production `profiles` has no `email`, has `username`; unversioned |
| `user_memory` | 12 cols incl. **`budget jsonb`, `history jsonb`** (confirmed), `behavior_summary`, `discovery_city` | table only in root script; `budget`/`history`/`discovery_city` have **no DDL anywhere** | **UNVERSIONED COLUMNS CONFIRMED** (3) |
| `conversations` | 7 cols = root script | root script only | matches root script |
| `reviews` | **28 cols** (24 documented + `publication_state, safety_state, evaluated_version, evaluated_at`) | no `CREATE` anywhere | **PROD-ONLY TABLE CONFIRMED** |
| `account_status` | 7 cols (`user_id, is_suspended, suspended_until, is_banned, ban_reason, …`) | `20260819_m08_account_status.sql` | present |
| `subscriptions` | 10 cols: `…, stripe_sub_id, plan` (**NOT NULL**), `status` (NOT NULL), `current_period_end, cancel_at_period_end` | matches `20260712_prod_baseline…` exactly; root script's `stripe_subscription_id/price_id` shape is **stale** | the 20260712 definition is the accurate one; a future Pro row must supply `plan` — code writes `plan: 'pro'` (`api/webhooks/stripe/route.ts:35,60`) |
| `user_preferences` | 15 cols (union of its four migrations + `preferences`, `profile_updated_at`) | four migrations | present; two extra columns NO DATA on provenance |
| `user_integrations` | 11 cols | `add_tracking_integrations.sql` | present |
| `review_interactions`, `review_likes`, `review_saves`, `user_follows` | 6 / 4 / 4 / 4 cols | migrations | present |
| `user_events` | **22 cols** (event-catalog + device fields) | two conflicting `CREATE`s + ALTERs | present; shape = the 7-column CREATE + ALTERs |
| `decision_evidence` + RPCs `decision_evidence_save`, `decision_evidence_load` | table 5 cols; both RPCs exposed | `20260824_decision_evidence_state.sql` | present |
| `handle_new_user` trigger | not visible (triggers are not in OpenAPI) | root script + `20260808c_…` | NO DATA |

Conclusion: production carries at least **five unversioned schema facts** on the chat path (`reviews` table, `profiles` shape, `user_memory.budget/history/discovery_city`) and the repository's only correct `subscriptions` DDL is the 20260712 baseline file. A Git-only bootstrap would produce a database the application cannot run against; the schema-only export remains the required artefact — now with a concrete, verified target to validate it against.

## 5. New Supabase project ref — **none** (not created).
## 6. Project separation verification — n/a (no audit project). Production identity: VERIFIED (§1).
## 7. Applied schema inventory — none applied.
## 8. RPC / function / trigger verification — production exposes `decision_evidence_save`/`_load` (52 RPCs total); triggers/function bodies not observable read-only without DDL access.
## 9. RLS / security verification — not observable through OpenAPI; NO DATA.
## 10. Dedicated test user — NOT CREATED.
## 11. Pro entitlement — NOT CREATED. Schema fact for later: `subscriptions` requires `user_id`, `plan` (code value `'pro'`), `status='active'`, and `current_period_end` in the future (`route.ts:373-375`).
## 12. Quota isolation — design unchanged (omit `KV_REST_API_URL`/`KV_REST_API_TOKEN`/`KV_URL`/`REDIS_URL`/`UPSTASH_*` ⇒ instance-local); NOT INSTANTIATED.
## 13. Dedicated runtime — NOT CREATED.
## 14. Vendor credential presence — PRESENT in the production-shaped `.env.local`; not used, not copied.
## 15. Location mechanism — VERIFIED statically (`route.ts:129-133`, `userLocation` body field; runner sends District 1).
## 16. Conversation setup — VERIFIED statically (full `messages` array; real setup turns for #1/#5/#7 in the runner).
## 17. Baseline runner safety — VERIFIED statically (unchanged: unconditional prod-ref refusal `baselineRunner.mjs:69`, attestation, `.env.local` scan, 36-cap incl. setup, no retry, bearer env-only, URL-like keys redacted).
## 18. Full production-separation matrix

| Component | Production | Audit | Verified |
|---|---|---|---|
| Supabase | `fwznnobrdctuskgrvuik` | none | **NO** |
| Auth | production | none | **NO** |
| Database | production | none | **NO** |
| Memory | production `user_memory` | none | **NO** |
| Subscriptions | production | none | **NO** |
| Reviews | production `reviews` | none | **NO** |
| AI quota | production KV | none (design: instance-local) | **NO** |
| Backend | production Vercel | none (design: local) | **NO** |
| Test user | production users | none | **NO** |
| Location | real users | fixed District 1 via `userLocation` | YES (mechanism) |
| Vendor API | production account | would be isolated runtime | n/a |

## 19. Git integrity — VERIFIED (only `docs/audit/**`).

## 20. Final readiness gate — `NOT READY FOR BASELINE`

Owner decisions recorded for the eventual baseline (do not authorise execution): **`AUDIT_SURFACE = web`**, **`SERVER_RESTART_BETWEEN_RUNS = YES`** (defeats the 30-minute `searchPlaces` in-process cache between run 1 and run 2).

**Exactly what the owner must provide, once, for the single-authority workflow to complete autonomously** (place in the audit checkout's `.env.local`/env only — never in chat):

```text
1. SUPABASE_ACCESS_TOKEN — a NEW, valid Personal Access Token (the present one returns 401).
   With it the audit can, autonomously and read-only against production:
     · verify identity (GET /v1/projects/fwznnobrdctuskgrvuik),
     · extract DDL through SELECT-only catalog queries via POST /v1/projects/<ref>/database/query
       (information_schema, pg_indexes, pg_constraint, pg_policies, pg_get_functiondef,
        pg_get_triggerdef, pg_type enums) — every statement a SELECT, verifiable before it runs,
       rows-free by construction (catalog only; no user table is ever selected),
   and, write-only against the NEW project:
     · create tappyai-consultative-audit (POST /v1/projects), retrieve its keys,
     · apply the generated schema-only DDL, create the test user (GoTrue admin API, new project only),
       insert its Pro row (plan='pro', status='active', future current_period_end),
     · build the dedicated runtime and verify everything in this report's gate list.
   ALTERNATIVELY (if the owner prefers not to issue a PAT):
2a. A direct Postgres connection string to production with a READ-ONLY role (or the owner runs
    pg_dump --schema-only --no-owner --no-privileges and drops the file in docs/audit/schema-baseline/), AND
2b. The NEW project's URL / anon key / service-role key (owner creates the project in the dashboard).
```

Nothing else is missing: vendor keys, the runner, the location/setup mechanisms and the design for quota/runtime isolation are all in place.


---

# PHASE 1A.3 (continued, 2026-09-17 ~13:00 +07) — with the owner's new token · Result so far: `NOT READY FOR BASELINE` (two token permissions missing)

```text
Baseline executed: NO · LLM calls: 0 · Search calls: 0 · /api/chat calls: 0
Production writes: 0 · Production data copied: NO · Production rows read: 0 (catalog only)
Application code changed: NO · Migration files changed: NO
```

## 1. Provisioning summary (what happened this run)

| Step | Outcome |
|---|---|
| Token validation | new `SUPABASE_ACCESS_TOKEN` in the audit worktree's `.env.local`: **VALID but fine-grained/scoped**. `GET /v1/organizations` → 200 (org `huyphamsm-tappy`, id `fcjgqoztfetwtathrgzb`); `GET /v1/projects`, `GET /v1/projects/<ref>`, `GET …/api-keys` → **403** ("account does not have the necessary privileges"); `POST /v1/projects/<ref>/database/query` → **201, executing as `supabase_read_only_user`** (member of `pg_read_all_data`, `pg_monitor`; not superuser) |
| Production identity (§6) | **VERIFIED**: `NEXT_PUBLIC_SUPABASE_URL` host, both JWT `ref` claims, and the `database/query` endpoint path all name `fwznnobrdctuskgrvuik`; the read-only role's own `current_user`/`version()` answered from it (PostgreSQL 17.6 aarch64) |
| Schema acquisition (§7) | **DONE, catalog-only**: 30-odd `SELECT`s over `pg_catalog`/`information_schema` (extensions, enum types, sequences, tables/columns via `pg_attribute`, `pg_get_functiondef`, `pg_get_constraintdef`, `pg_indexes`, `pg_get_triggerdef`, `pg_policy` + `pg_get_expr`, `aclexplode`, `pg_publication_tables`). **No user table was selected**; the executing role could not have written anyway. Generated DDL: `docs/audit/schema-baseline/prod-schema-only.sql` (220,988 bytes, **1,235 statements**, sha256 `b7c358ac0ee192919fb1cc4f572bd4829a40fc18c7cfa67054c1edd9756fe0dc`) + `prod-schema-only.manifest.json` |
| Schema-only proof (§7, §22) | statement kinds: CREATE EXTENSION 3 · CREATE TYPE 4 · CREATE SEQUENCE 1 · CREATE TABLE 70 · CREATE OR REPLACE FUNCTION 66 · ALTER TABLE 314 · CREATE [UNIQUE] INDEX 107 · CREATE TRIGGER 16 · CREATE POLICY 95 · REVOKE/GRANT 551 · ALTER PUBLICATION 6 · SET 2. **Top-level INSERT/COPY/UPDATE/DELETE/TRUNCATE: 0.** DATA ROWS = 0 · AUTH USERS = 0 · USER MEMORY = 0 · CONVERSATIONS = 0 · TOKENS = 0 (jwt-like 0, `sbp_` 0, api-key-like 0) · SECRETS = 0 · PII = 0 — the only email-like and UUID literals are inside `fn_owner_recovery_audit` and are the sentinel `…@system.invalid` and the nil UUID `00000000-…` (masked inspection; not a real address, not `PLATFORM_OWNER_USER_ID`) |
| Storage (§8) | kept **untracked** under `docs/audit/schema-baseline/` (the whole `docs/audit/` tree is untracked; nothing committed). It embodies production's security model (95 policies, 50 SECURITY DEFINER functions) — committing it is an owner decision; this task did not |
| Baseline validation (§9) | present in the DDL: `profiles` (10 cols), `user_memory` (12 cols incl. `budget jsonb`, `history jsonb`, `discovery_city`), `conversations`, `reviews` (28 cols, + base policy "Read visible reviews" and the RESTRICTIVE publication policy), `account_status`, `subscriptions` (`plan` NOT NULL), `user_preferences` (15), `user_integrations`, `review_interactions`, `review_likes`, `review_saves`, `user_follows`, `user_events` (22), `decision_evidence` + `decision_evidence_save/load`, `handle_new_user` + trigger `on_auth_user_created` on `auth.users`, `vector@0.8.0` (extension objects excluded from DDL by `pg_depend deptype='e'`), 4 enums, 83 FKs, 107 indexes, 70 RLS-enabled tables, 6 realtime publication tables. Not extracted (recorded in manifest): comments, default privileges (Supabase defaults), object ownership, storage buckets (data), storage policies (0 exist), auth-schema functions (0 non-platform) |
| New project (§10) | **CREATED**: `tappyai-consultative-audit`, ref **`zdaprdfgpbpnxyofagmc`**, org `huyphamsm-tappy`, region `ap-southeast-1`, free plan (`desired_instance_size` is rejected on free orgs), created 2026-09-17T04:33:30Z; **ref ≠ production: VERIFIED**; database reachable (PostgreSQL 17.6 x86_64), **0 public tables** (empty) |
| Apply schema (§11) | **BLOCKED**: `database/query` on the new project also executes as `supabase_read_only_user` → DDL impossible with this token |
| Keys (§10) | **BLOCKED**: `GET /v1/projects/zdaprdfgpbpnxyofagmc/api-keys` → 403 → anon/service-role keys of the new project not retrievable → no runtime, no GoTrue admin user creation, no Pro row, no bearer |
| Dedicated runtime (§15) | **PREPARED**: worktree `.claude/worktrees/audit-nonprod` at `f6712b8` (detached), `node_modules` junction to the source worktree (identical lockfile), `scripts/audit/*` copied (untracked). `.env.local` written (gitignored) with `NEXT_PUBLIC_SUPABASE_URL=https://zdaprdfgpbpnxyofagmc.supabase.co`, the generated `SUPABASE_DB_PASSWORD`, localhost URLs on port 3100, `AUDIT_BASE_URL/AUDIT_SUPABASE_REF/AUDIT_CONFIRMED_NONPROD_REF/AUDIT_SURFACE=web`; **no KV/Upstash/Redis/LLM_* variables**; anon/service-role keys, vendor keys, PAT and test-user fields are **EMPTY placeholders**. The desktop classifier declined a script that would have copied the vendor keys out of the production `.env.local`; they are therefore left for the owner to paste (runtime-only, one time) |

## 2–4. Method / schema-only proof / validation — see table above.
## 5. New Supabase project ref — `zdaprdfgpbpnxyofagmc` (`tappyai-consultative-audit`).
## 6. Project separation — ref differs (VERIFIED); database distinct (VERIFIED: separate host, empty schema, x86_64 vs prod aarch64); Auth issuer will be `https://zdaprdfgpbpnxyofagmc.supabase.co/auth/v1` (not yet exercised).
## 7–9. Applied schema / RPCs / RLS in the new project — NOT YET (blocked at §11).
## 10–11. Test user / Pro — NOT YET.
## 12. Quota isolation — configured by omission in the audit `.env.local`; effective-runtime check pending the keys.
## 13. Runtime — prepared (see above); not started.
## 14. Vendor credentials — present only in the production `.env.local`; audit env placeholders EMPTY (owner pastes).
## 15–17. Location / conversation setup / runner safety — VERIFIED statically (unchanged).

## 18. Production-separation matrix (current)

| Component | Production | Audit | Verified |
|---|---|---|---|
| Supabase | `fwznnobrdctuskgrvuik` | `zdaprdfgpbpnxyofagmc` | **YES** (distinct project, empty DB) |
| Auth | production | new project (issuer not yet exercised) | PENDING |
| Database | production | new DB, 0 tables | YES (exists) / schema PENDING |
| Memory / Subscriptions / Reviews | production | new DB (schema not applied) | PENDING |
| AI quota | production KV | instance-local (no KV vars in audit env) | YES (config) / runtime PENDING |
| Backend | production Vercel | `audit-nonprod` worktree @ f6712b8, port 3100 | prepared, not started |
| Test user | production users | none yet | PENDING |
| Location | real users | fixed District 1 via `userLocation` | YES |
| Vendor API | production account | audit runtime (keys to be pasted) | PENDING |

## 19. Git integrity — `git-status-1a3b-before.txt` vs after: identical for the source worktree (only `docs/audit/**` changed). The new worktree is registered in `.git/worktrees/audit-nonprod` (no tracked file changed; its only untracked content is `scripts/audit/`; `.env.local` is gitignored).

## 20. Readiness gate — `NOT READY FOR BASELINE`

Owner decisions recorded: `AUDIT_SURFACE = web`, `SERVER_RESTART_BETWEEN_RUNS = YES`.

**Exactly what is missing — two permissions on the same fine-grained token** (Supabase → Account → Access Tokens → edit the token's scopes for organization `huyphamsm-tappy`), or replace it with a classic user-scoped token:

```text
1. Database: WRITE (SQL)   → database/query on zdaprdfgpbpnxyofagmc runs as postgres instead of
                              supabase_read_only_user, so the 1,235-statement schema-only baseline can be applied
                              (production keeps its own protection: the audit's SQL guard refuses any non-SELECT
                              against fwznnobrdctuskgrvuik, and nothing will be sent there again)
2. Projects / API keys: READ → GET /v1/projects/<ref> (status polling) and GET /v1/projects/<ref>/api-keys
                              (anon + service-role keys of the NEW project only)
Then paste into D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\audit-nonprod\.env.local:
   SUPABASE_ACCESS_TOKEN (the updated token), ANTHROPIC_API_KEY, SERPER_API_KEY, GOOGLE_PLACES_API_KEY
and say "continue" — the remaining steps (apply schema → verify tables/columns/RPCs/triggers/RLS → create the
audit user via the new project's GoTrue admin API → insert its Pro row (plan='pro', status='active', future
current_period_end) → mint AUDIT_TEST_USER_BEARER → start next dev on :3100 → effective-env and issuer
verification → final matrix) run without further owner input and with zero LLM/search/chat calls.
```


---

# PHASE 1A.3 (continued, 2026-09-17 ~13:30 +07) — schema applied and verified · Result: `NOT READY FOR BASELINE` (API-key scope + vendor keys outstanding)

```text
Baseline executed: NO · LLM calls: 0 · Search calls: 0 · /api/chat calls: 0
Production writes: 0 · Production data copied: NO · Production rows read: 0
Application code changed: NO · Migration files changed: NO
```

## Provisioning summary (this run)

| Step | Outcome |
|---|---|
| Token scope (owner updated it in the source worktree's `.env.local`, 13:12) | Database **WRITE** now granted: `database/query` on the NEW project executes as `postgres`. Still **403**: `GET /v1/projects/<ref>`, `GET /v1/projects/<ref>/api-keys`. (A broader credential probe was declined by the desktop classifier and not retried — only the documented `api-keys` endpoint was used.) |
| Apply schema (§11) | **DONE on `zdaprdfgpbpnxyofagmc` only** (production refusal is hard-coded in the SQL helper: any write-mode call naming `fwznnobrdctuskgrvuik` throws before sending). Pass 1 (one statement per call) was throttled by the Management API after ~95 calls (`429 ThrottlerException`) and revealed one real ordering issue: `SET check_function_bodies = off` does not persist across calls (each call is a new session), so the `LANGUAGE sql` function `fn_audit_row_hash` failed on a forward reference; 15 triggers failed only because their functions had been throttled. Pass 2 (batches of 25 in one implicit transaction each, `SET check_function_bodies = off` prefixed per batch, exponential back-off on 429, "already exists" = applied): **1,157 applied + 76 already existed = 1,233 / 1,233; 0 failures**. Logs: `docs/audit/schema-baseline/apply-log.json`, `apply-log-pass2.json`. Nothing in the repository or the baseline file was edited. |
| Verify (§12) — `docs/audit/schema-baseline/verify-new-project.json`, identical read-only catalog queries on both projects | tables 70=70 · columns 619=619 · non-extension functions 66=66 (SECURITY DEFINER 50=50) · constraints 244=244 (FKs 83=83) · indexes 211=211 · triggers 16=16 incl. `on_auth_user_created` on `auth.users` · policies 95=95 · RLS-enabled 70=70 · enums 4=4 · realtime publication tables 6=6 · `user_memory` columns identical (`…budget,history,…,discovery_city`) · `subscriptions` columns + NOT NULL flags identical (`plan*`, `status*`) · `reviews` 28=28 columns with policies "Read visible reviews" / "Owners can see own reviews" / update policy / RESTRICTIVE publication policy · `decision_evidence_load(p_id uuid)` / `decision_evidence_save(p_id uuid, p_evidence jsonb)` present · `handle_new_user` SECURITY DEFINER · grant spot-checks identical (`platform_owner` DML revoked from `service_role`; `fn_grant_admin_role` EXECUTE → postgres, service_role) · all 14 required tables present. Only difference: `vector` 0.8.0 (prod) vs 0.8.2 (new) — platform-provided extension build. **New DB: `auth.users` = 0 rows, `public` live tuples = 0** (production row counts were not queried). |
| Test user (§13) / Pro row / bearer (§16) | **BLOCKED** — need the NEW project's `service_role` key (GoTrue admin API) and `anon` key (password grant + the app runtime). `GET …/api-keys` → 403. |
| Quota isolation (§14) | audit `.env.local` has no KV/Upstash/Redis variables → instance-local store; effective-runtime check pending the keys. |
| Dedicated runtime (§15) | worktree `audit-nonprod` @ `f6712b8` ready; `.env.local` still has EMPTY `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GOOGLE_PLACES_API_KEY`, `SUPABASE_ACCESS_TOKEN` (the owner's paste went to the source worktree; the classifier declines copying secrets between env files). |

## Production-separation matrix (current)

| Component | Production | Audit | Verified |
|---|---|---|---|
| Supabase | `fwznnobrdctuskgrvuik` | `zdaprdfgpbpnxyofagmc` | **YES** |
| Database | production | new DB, full schema parity, 0 rows | **YES** |
| Memory / Subscriptions / Reviews (schema) | production | new DB (same DDL, empty) | **YES** |
| Auth | production | new project (0 users; issuer not yet exercised) | schema YES / runtime PENDING |
| AI quota | production KV | instance-local (no KV vars) | config YES / runtime PENDING |
| Backend | production Vercel | `audit-nonprod` worktree, port 3100 | prepared, not started |
| Test user | production users | none yet | PENDING |
| Location | real users | fixed District 1 via `userLocation` | YES |
| Vendor API | production account | audit runtime (keys not yet pasted) | PENDING |

## Readiness gate — `NOT READY FOR BASELINE`

Remaining owner input (either form), then "continue":

```text
A. Add "API keys / Secrets: READ" (and Projects: READ) to the fine-grained token so GET
   /v1/projects/zdaprdfgpbpnxyofagmc/api-keys works — the audit then stores the NEW project's
   anon + service_role keys in the audit .env.local itself;
   — or —
   paste the NEW project's anon and service_role keys (Dashboard → tappyai-consultative-audit →
   Project Settings → API) into D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\audit-nonprod\.env.local
   as NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
B. Paste into the SAME audit .env.local: ANTHROPIC_API_KEY, SERPER_API_KEY, GOOGLE_PLACES_API_KEY,
   and SUPABASE_ACCESS_TOKEN (the updated token). Runtime-only; never in chat.
```

Remaining automated steps after that: create the audit user via the new project's GoTrue admin API → insert its Pro row (`plan='pro'`, `status='active'`, future `current_period_end`) → mint `AUDIT_TEST_USER_BEARER` (issuer check) → start `next dev` on :3100 → effective-env, issuer and quota-store verification → final matrix. Zero LLM/search/chat calls throughout.


---

# PHASE 1A.3 (continued, 2026-09-17 ~13:50 +07) — keys, audit user, Pro, bearer, runtime verified · Result: `NOT READY FOR BASELINE` (only the three vendor keys are missing from the audit runtime)

```text
Baseline executed: NO · LLM calls: 0 · Search calls: 0 · /api/chat calls: 0
Production writes: 0 · Production data copied: NO · Production rows read: 0
Application code changed: NO · Migration files changed: NO
```

## Provisioning summary (this run)

| Step | Outcome |
|---|---|
| Token scope (owner: Organization Projects READ-WRITE, API Keys READ, Database READ-WRITE) | `GET /v1/projects/zdaprdfgpbpnxyofagmc/api-keys?reveal=false` → **200** (`reveal=true` → 403; the non-reveal listing already carries the legacy JWT keys). `GET /v1/organizations`, `GET /v1/projects[/<ref>]` → 403 (not needed). |
| New project keys (§10) | `anon` (`role=anon`, `ref=zdaprdfgpbpnxyofagmc`) and `service_role` (`role=service_role`, same ref) retrieved and written to the audit worktree `.env.local` — values never printed. Two default `sb_publishable_…`/`sb_secret_…` keys also exist; not used. |
| Dedicated audit user (§13) | Created through the **new project's** GoTrue admin API (`POST /auth/v1/admin/users`, service-role key of the new project): `consultative-audit-user@example.com` (non-personal), `email_confirm: true`, id `5c9cceb8…`, `aud=authenticated`, `is_anonymous=false`. `auth.users` before: 0 → after: 1. The production-derived `handle_new_user` trigger fired: `public.profiles` = 1 row. |
| Pro entitlement (§13) | `INSERT … ON CONFLICT (user_id)` into `public.subscriptions` on the new project via `database/query`: `plan='pro'` (the value `api/webhooks/stripe/route.ts` writes), `status='active'`, `current_period_end = now() + 1 year`. Verified in-DB with the route's own predicate: `status='active' AND current_period_end > now()` → **true**. `account_status` blocking rows: 0. New DB rows: users 1, profiles 1, subscriptions 1, user_memory 0. |
| Bearer (§16) | Password grant against `https://zdaprdfgpbpnxyofagmc.supabase.co/auth/v1/token` with the new anon key → access token with **`iss = https://zdaprdfgpbpnxyofagmc.supabase.co/auth/v1`**, `role=authenticated`, `sub=5c9cceb8…`, lifetime 3600 s. Stored as `AUDIT_TEST_USER_BEARER` (+ `AUDIT_TEST_USER_REFRESH`, `AUDIT_TEST_USER_EMAIL`, `AUDIT_TEST_USER_PASSWORD`, `AUDIT_TEST_USER_ID`) in the audit `.env.local` only. Never printed, never committed, not in any report. Note: the bearer expires after 1 h — the stored credentials/refresh token allow re-minting without owner input. |
| Dedicated runtime (§15) | `.claude/launch.json` (gitignored) gained a configuration `audit-nonprod` that runs `npm run dev -- --port 3101` **inside** `.claude/worktrees/audit-nonprod`; started via `preview_start`. Next.js reports `Environments: .env.local` (the audit one). Port changed 3100 → 3101 to keep clear of the existing `v3-web` config. |
| Effective runtime env (§14, §15) — `docs/audit/runtime-verification.json`, computed with Next's own `@next/env` loader on the audit directory | `NEXT_PUBLIC_SUPABASE_URL` → `zdaprdfgpbpnxyofagmc`; anon-key ref and service-key ref → `zdaprdfgpbpnxyofagmc`; `KV_REST_API_URL`/`KV_REST_API_TOKEN`/`UPSTASH_REDIS_REST_URL`/`KV_URL`/`REDIS_URL` **ABSENT** (⇒ `isDistributedStoreConfigured()` false ⇒ instance-local quota); `LLM_PROVIDER`/`LLM_*_MODEL` ABSENT (⇒ `claude-haiku-4-5-20251001` for every role; maxTokens 3072 / maxSteps 5 / toolChoice auto / temperature unset / thinking off / caching on, all in source); `GCP_LOGGING_ENABLED` ABSENT; **production ref present anywhere: false**; `ANTHROPIC_API_KEY` / `SERPER_API_KEY` / `GOOGLE_PLACES_API_KEY`: **ABSENT**. |
| Live server verification (no LLM) | `GET /api/version` → `{ v: "dev" }`. `GET /api/subscription` with the new bearer → **200** `{ isPro: true, status: "active", currentPeriodEnd: 2027-09-17…, freeDailyLimit: 15, quotaPeriod: "day", isAnonymous: false, todayMessageCount: 0, remaining: 15 }` — proves: the server verifies the JWT against the **new** project, reads `subscriptions` from the **new** DB, and the quota peek ran on the instance-local store. Without bearer → 401. Server log shows only `/`, `/api/track`, `/api/version`, `/api/subscription` — no `/api/chat`, no provider call. |

## Production-separation matrix (current)

| Component | Production | Audit | Verified |
|---|---|---|---|
| Supabase | `fwznnobrdctuskgrvuik` | `zdaprdfgpbpnxyofagmc` | **YES** |
| Auth | production issuer | `https://zdaprdfgpbpnxyofagmc.supabase.co/auth/v1` (bearer `iss`, accepted by the audit server) | **YES** |
| Database | production | new DB, schema parity, 1 user / 1 profile / 1 subscription / 0 memory | **YES** |
| Memory | production `user_memory` | new DB (`user_memory` = 0 rows; server key ref = new) | **YES** |
| Subscriptions | production | new DB (`isPro: true` read live) | **YES** |
| Reviews | production | new DB (`reviews` = 0 rows, same DDL/policies) | **YES** |
| AI quota | production KV | instance-local (KV vars absent in effective env; peek served locally) | **YES** |
| Backend | production Vercel | `audit-nonprod` worktree @ f6712b8, `next dev` :3101, env = audit `.env.local` only | **YES** |
| Test user | production users | `5c9cceb8…` exists only in the new project | **YES** |
| Location | real users | fixed District 1 via `userLocation` (runner) | **YES** |
| Vendor API | production account | audit runtime — **keys not present** | **NO** |

## Readiness gate — `NOT READY FOR BASELINE` — one item left

Every safety-critical gate is verified; the only unmet gate is "required vendor credentials are available to the audit runtime". The desktop classifier declines any script of mine that copies these secrets out of the production `.env.local` (twice today), so:

```text
OWNER: open D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\audit-nonprod\.env.local and fill the
three lines ANTHROPIC_API_KEY=, SERPER_API_KEY=, GOOGLE_PLACES_API_KEY= with the same values as in
D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\v3-phase4-design\.env.local (copy the lines).
Runtime-only; gitignored; never paste them in chat. Then say "continue" — the audit re-runs the
effective-env check (no LLM/search call), and if the three keys are PRESENT it declares READY.
```

Owner decisions recorded: `AUDIT_SURFACE = web`, `SERVER_RESTART_BETWEEN_RUNS = YES`. The audit server on :3101 is left running (preview server `audit-nonprod`); it must be restarted after the keys are added so the process picks them up.


---

# PHASE 1A.3 — FINAL (2026-09-17 ~14:00 +07) · Result: `READY FOR BASELINE`

```text
Baseline executed: NO · LLM calls: 0 · Search calls: 0 · /api/chat calls: 0
Production writes: 0 · Production data copied: NO · Production rows read: 0
Application code changed: NO · Migration files changed: NO
```

## What changed in this run
- Owner filled `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GOOGLE_PLACES_API_KEY` in the audit worktree `.env.local` (13:56). The audit server on :3101 was stopped and restarted (`preview_stop` / `preview_start audit-nonprod`) so the process re-read the file.
- Re-verification (`docs/audit/runtime-verification.json`, regenerated): Next loads only the audit `.env.local`; Supabase URL / anon-key / service-key refs all `zdaprdfgpbpnxyofagmc`; `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `UPSTASH_REDIS_REST_URL`, `KV_URL`, `REDIS_URL` ABSENT; `LLM_PROVIDER` / `LLM_*_MODEL` ABSENT; `GCP_LOGGING_ENABLED` ABSENT; **`ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GOOGLE_PLACES_API_KEY` PRESENT**; production ref present anywhere: **false**. `GET /api/subscription` with the audit bearer → 200 `isPro: true` (new DB); without bearer → 401. No `/api/chat`, no provider request in the server log.
- Final row inventory of the new DB (catalog/statistics only): `auth.users` 1 (0 anonymous), `profiles` 1, `subscriptions` 1, `user_memory` 0, `conversations` 0, `reviews` 0, `decision_evidence` 0; `public` live tuples 7 = the two rows above plus `user_events` analytics rows written by the audit server's own home page during verification (`POST /api/track`) — generated here, not copied.

## Final readiness gate — every item positively verified

| Gate (§27) | Evidence |
|---|---|
| NEW Supabase project exists; ref ≠ production | `zdaprdfgpbpnxyofagmc` (`tappyai-consultative-audit`, org `huyphamsm-tappy`, ap-southeast-1) vs `fwznnobrdctuskgrvuik` |
| Production identity verified | env host + both JWT refs + query endpoint path; PostgreSQL 17.6 |
| Schema-only baseline obtained safely; contains no data | catalog `SELECT`s under `supabase_read_only_user`; 1,235 statements, 0 DML; DATA/USERS/MEMORY/CONVERSATIONS/PII/TOKENS/SECRETS = 0 (`prod-schema-only.manifest.json`, sha256 `b7c358ac…6fe0dc`) |
| Schema applied to NEW project; tables / columns / RPCs / triggers / RLS verified | 1,233/1,233 applied; parity 70 tables · 619 columns · 66 functions · 244 constraints · 211 indexes · 16 triggers (incl. `on_auth_user_created`) · 95 policies · RLS 70 · `decision_evidence_save/load` · `user_memory.budget/history` · `reviews` 28 cols + policies (`verify-new-project.json`) |
| Dedicated audit user exists; is Pro | `5c9cceb8…` in the new project only; `subscriptions` `plan='pro'`, `status='active'`, `current_period_end` 2027-09-17; route predicate true; `/api/subscription` → `isPro: true` |
| Quota isolated; production KV not loaded | effective env: all KV/Upstash/Redis vars ABSENT → instance-local store; quota peek served locally |
| Dedicated backend runtime exists, points to NEW Supabase, not production | `audit-nonprod` worktree @ `f6712b8`, `next dev` :3101, `Environments: .env.local` (audit); prod ref absent |
| Vendor credentials runtime-only | present only in the gitignored audit `.env.local` (and the production env it was copied from); never printed, never in reports, not committed |
| Bearer env-only; issuer = new project | `AUDIT_TEST_USER_BEARER` in audit `.env.local`; `iss = https://zdaprdfgpbpnxyofagmc.supabase.co/auth/v1`; expires 1 h after 13:44 +07 — re-mint from the stored credentials/refresh token before the baseline |
| Location mechanism | `userLocation` body field (`route.ts:129-133`); runner sends District 1 |
| Conversation setup | full `messages` array; runner performs real setup turns for #1/#5/#7 |
| Baseline runner safety | unconditional production refusal, non-prod attestation, `.env.local` scan (audit env has no prod ref, no KV lines), 36-cap incl. setup, no retry, failures recorded, bearer env-only, URL-like keys redacted |
| No production writes / no production data copied | only catalog `SELECT`s reached production; the SQL helper refuses write-mode calls naming the production ref; new DB contains no production rows |
| No application code / migration change; zero LLM/search/chat calls | git status + tracked diff unchanged for the source worktree (only `docs/audit/**` and the gitignored `.claude/launch.json`); audit worktree has only untracked `scripts/audit/`; server log shows no `/api/chat` |

## Final production-separation matrix

| Component | Production | Audit | Verified |
|---|---|---|---|
| Supabase | `fwznnobrdctuskgrvuik` | `zdaprdfgpbpnxyofagmc` | **YES** |
| Auth | production issuer | new project issuer (bearer accepted by audit server) | **YES** |
| Database | production | new DB, schema parity, own rows only | **YES** |
| Memory | production | new DB (0 rows) | **YES** |
| Subscriptions | production | new DB (Pro row for the audit user) | **YES** |
| Reviews | production | new DB (0 rows) | **YES** |
| AI quota | production KV | instance-local | **YES** |
| Backend | production Vercel | dedicated local runtime :3101 | **YES** |
| Test user | production users | dedicated audit user | **YES** |
| Location | real users | fixed District 1 | **YES** |
| Vendor API | production account | isolated runtime (keys present) | **YES** |

## Operating notes for the (separately authorised) baseline
- Audit surface: **web** (`AUDIT_SURFACE=web` in the audit env). Server restart between run 1 and run 2: **YES** (defeats the 30-minute `searchPlaces` cache).
- Run the runner from the audit worktree root so its `.env.local` scan reads the audit env: `cd …\audit-nonprod` then load `AUDIT_*` from `.env.local` into the shell and `node scripts/audit/baselineRunner.mjs` (`AUDIT_DRY_RUN=1` first).
- Re-mint the bearer if more than ~1 h has passed (password grant with the stored `AUDIT_TEST_USER_EMAIL/PASSWORD` against the new project, or the refresh token).
- The audit server is left running (preview `audit-nonprod`); `.claude/launch.json` keeps the config.

---

# FINALIZATION PASS (2026-09-17 ~14:10 +07) — READY state re-verified · TASK COMPLETE

```text
LLM calls: 0 · Search calls: 0 · /api/chat calls: 0 · Production writes: 0 · Production data copied: NO
Application code changed: NO · Migration files changed: NO
```

Re-checks performed (all non-LLM/non-search): git status and tracked diff of the source worktree identical to the Phase 1 snapshot (`git-before.txt`) and to the Phase 1A.3 start; model/tool constants unchanged in source (`claude-haiku-4-5-20251001` for all four roles, `maxTokens 3072` / `maxSteps 5` on tool turns, `streamText` passes no `toolChoice`/`temperature`/thinking, `prompt-caching` beta + `cacheControl` present); runner copy in the audit worktree byte-identical to the source, with the unconditional production refusal (line 69), the `.env.local` KV scan (76) and the 36-run cap (37/87/140) intact; audit `.env.local` (gitignored): URL/anon/service refs all `zdaprdfgpbpnxyofagmc`, bearer `iss = https://zdaprdfgpbpnxyofagmc.supabase.co/auth/v1` (role authenticated, expires 2026-09-17T07:44:29Z UTC = 14:44 +07), vendor keys PRESENT, `AUDIT_SURFACE=web`, no KV/Upstash/Redis/`LLM_*`, production ref absent; new-project catalog counts re-queried and equal to the production values recorded in `verify-new-project.json` (70 / 619 / 66 / 244 / 211 / 16 / 95 / RLS 70 / both `decision_evidence_*` RPCs / 14 required tables) — production itself was **not** queried in this pass; new DB rows: `auth.users` 1 (0 anonymous; the audit user), `profiles` 1, active Pro `subscriptions` 1, `user_memory` 0, `conversations` 0, `reviews` 0; audit server `audit-nonprod` running on :3101 (preview server id `8248a965…`, started 06:58:16Z), effective env re-computed with `@next/env` on the audit directory (prod ref absent, KV absent, `LLM_*` absent, vendor keys present), `GET /api/subscription` with the audit bearer → 200 `isPro: true`, without → 401; server log contains only `/`, `/api/track`, `/api/version`, `/api/subscription`.

Recorded decisions: `AUDIT_SURFACE = web`, `SERVER_RESTART_BETWEEN_RUNS = YES`. Terminal state of this task: **READY FOR BASELINE — TASK COMPLETE.** The Phase 1 baseline was not started and requires separate explicit authorisation; before it runs, re-mint the bearer (it expires at 14:44 +07) from the stored audit credentials.
