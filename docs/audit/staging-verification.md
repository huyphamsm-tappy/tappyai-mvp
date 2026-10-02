# TappyAI — `tappyai-staging` Read-Only Verification + Required Schema Baseline (Phase 1A.2)

**Date:** 2026-09-17 · **Branch:** `design/v3-phase4` @ `f6712b8` · **Mode:** read-only investigation; nothing provisioned, nothing written to any Supabase project, no application request made.

```text
LLM calls executed: 0
Search calls executed: 0
/api/chat calls executed: 0
Production writes: 0
Production schema export: 0
Production data accessed: 0
Staging writes: 0
Users created: 0
Application code changed: NO
Migration files changed: NO
```

Outbound network activity in this task, complete list: (a) one read-only `GET https://api.supabase.com/v1/projects` with the locally present PAT (→ 401); (b) two credential-free `GET`s to `https://nhncoqyadofojjrnpiia.supabase.co/rest/v1/` and `/auth/v1/health` (→ DNS `ENOTFOUND`, no connection made); (c) a control `GET` to a made-up ref (→ `ENOTFOUND`); (d) DNS lookups (no HTTP) of the staging, production and made-up hostnames. **No request of any kind reached the production project** — its hostname was only resolved by DNS to calibrate what an existing project looks like.

---

## 1. Git snapshot

`docs/audit/git-status-1a2-before.txt`, `git-diff-1a2-before.txt` (identical to the Phase 1A.1 end state); after-snapshots in `git-status-1a2-after.txt` / `git-diff-1a2-after.txt`. Only `docs/audit/**` changed.

## 2. Repository evidence for the staging ref

| File | Line | What it says | Describes as | Current or historical |
|---|---|---|---|---|
| `docs/controller-v2/11_COMPONENT11_SESSION_SECURITY_CONTRACT.md` | 5, 341 | "the **non-production** project `nhncoqyadofojjrnpiia` (`tappyai-staging`)", measured 2026-08-14 with `scripts/diagnostics/c11-session-revocation-probe.mjs`; "anonymous sign-ins disabled"; a disposable identity minted via admin API and deleted; O-3 measured "in the staging SQL editor (read-only; the direct database credential never worked)" | non-production / staging | historical measurement (2026-08-14) |
| `docs/architecture/ADR-021-c11-auth-sessions-dependency.md` | 8 | "Measured 2026-08-14 against the staging project `nhncoqyadofojjrnpiia`, read-only, through the SQL editor" | staging | historical (2026-08-14) |
| `docs/controller-v2/runbooks/K2_PLATFORM_SETTINGS_APPLY_PACK.md` | 15 | "The account also holds `nhncoqyadofojjrnpiia` (staging); this pack targets production only" | staging | 2026-08-22 |
| `docs/controller-v2/STATUS.md` | 294, 1200, 1393 | "this account also holds `nhncoqyadofojjrnpiia` (staging) … the script additionally aborts if the target resolves to staging"; "staging … never targeted"; "which was not touched" | staging | last edited 2026-09-01 |
| `scripts/migrations/apply-controller-v2-production.mjs` | 52 | `const STAGING_REF = 'nhncoqyadofojjrnpiia'` — used only to **refuse** a `PROD_DATABASE_URL` that names it | staging (guard) | 2026-08-15 |
| `scripts/diagnostics/c11-session-revocation-probe.mjs` | 25-28, 34, 55 | expects `STAGING_SUPABASE_URL / _ANON_KEY / _SERVICE_ROLE_KEY` (+ optional `STAGING_DATABASE_URL`); refuses the production ref | staging | 2026-08-14 |

No configuration file, deployment config, Vercel env pull, Android/iOS config, or `.env*` file references the staging ref or a `tappyai-staging` URL. The name `tappyai-staging` appears in exactly one file (the C11 contract). Nothing in the repository records how the project was created, what schema it carries, or whether it ever held copied production rows.

## 3. Access / tooling result

| Credential / tool | State |
|---|---|
| `SUPABASE_ACCESS_TOKEN` (Management PAT, `.env.local`, identical in main checkout) | **INVALID** — read-only `GET /v1/projects` → HTTP 401 (re-tested this task) |
| `STAGING_SUPABASE_URL` / `STAGING_SUPABASE_ANON_KEY` / `STAGING_SUPABASE_SERVICE_ROLE_KEY` / `STAGING_DATABASE_URL` | **ABSENT** in every `.env*` file of both checkouts and in the session env |
| `.env.prod-admin` / `PROD_DATABASE_URL` / any `DATABASE_URL` | **ABSENT** |
| Supabase CLI / CLI login | **ABSENT** |
| Any other Supabase credential for the staging project | **ABSENT** |
| Documented staging URL/keys | none documented anywhere |

Consequence: no authenticated read-only path to the staging project exists on this machine. Only credential-free reachability could be tested.

## 4. Staging project identity

| Check | Result |
|---|---|
| Documented ref | `nhncoqyadofojjrnpiia` (six repo references, §2) |
| `ref != fwznnobrdctuskgrvuik` | **VERIFIED** (trivially — different string; the apply script and probe both hard-code the pair as distinct) |
| Hostname `nhncoqyadofojjrnpiia.supabase.co` resolves | **NO** — system resolver returns no address (`nslookup` empty), Node `fetch` → `ENOTFOUND`; identical behaviour to the made-up control ref `zzzzzzzzzzzzzzzzzzzz.supabase.co`. The production hostname resolves (`172.64.149.246`), so Supabase does publish per-project DNS for live projects |
| Project exists / name / status / creation metadata / Auth issuer / database identity | **UNVERIFIED** — a project that is **deleted** or **paused** is consistent with the DNS result; which of the two: NO DATA (the Management API, which would distinguish them, is unreachable with an invalid PAT) |
| Credentials belong to this project | n/a — no credentials exist |

**Identity: UNVERIFIED — the project is not currently reachable at all.**

## 5. Production separation verification

| Property | Production | Staging | Result |
|---|---|---|---|
| Supabase ref | `fwznnobrdctuskgrvuik` | `nhncoqyadofojjrnpiia` | different — **VERIFIED** |
| Auth issuer | `https://fwznnobrdctuskgrvuik.supabase.co/auth/v1` | would be `https://nhncoqyadofojjrnpiia.supabase.co/auth/v1` | **UNVERIFIED** (host unresolvable) |
| Database | production | unknown | **UNVERIFIED** |
| URL | resolves, served | does not resolve | **UNVERIFIED** (not "isolated" — absent) |
| Application deployment | `www.tappyai.com` (Vercel, prod ref in every Vercel env pull) | none references staging (Android `staging` flavour → placeholder `staging.tappyai.example.com`) | no deployment points at staging — **VERIFIED from repo** |
| KV / quota store | production KV | none configured for staging | n/a |
| User population | production | unknown; C11 record: anonymous sign-ins disabled, one disposable admin-API identity created and deleted on 2026-08-14 | **UNVERIFIED** |

A different ref is necessary but not sufficient; every other row is unverifiable today.

## 6. Data provenance assessment — **UNKNOWN**

No document, script, migration, or config records whether the staging schema/data came from a production clone, a partial copy, `supabase-schema.sql`, or nothing. The only recorded activity is the 2026-08-14 C11 measurement (read-only SQL-editor queries on `auth.sessions`, one disposable identity created and deleted). Whether any production rows were ever copied there: **NO DATA**.

## 7. Staging usage assessment — **D. abandoned / historical (most consistent), formally E. unknown**

Evidence: last repository activity involving it is 2026-08-14 (measurement) with mentions up to 2026-09-01 only as "never targeted"; no deployment, client, or env file points at it; its hostname no longer resolves. Nothing indicates shared use by other teams. A paused free-tier project would also fit this pattern.

## 8. Staging schema inventory — **NOT OBTAINABLE**

No read-only metadata access exists (no keys, no PAT, no DB URL, host unresolvable). The table below therefore records only the repository side; the "Exists in staging?" column is UNKNOWN for every row.

| Object | Exists in staging? | Exists in repo migrations? | Exists in `supabase-schema.sql`? | Required by `/api/chat`? |
|---|---|---|---|---|
| `auth.users` | UNKNOWN | platform-provided | referenced | YES |
| `profiles` | UNKNOWN | NO (referenced by 19) | YES | YES (FKs; trigger target; profile row of the test user) |
| `account_status` | UNKNOWN | YES `20260819_m08_account_status.sql` | NO | YES (`maybeSingle`; absent row = not blocked) |
| `subscriptions` | UNKNOWN | YES `20260712_prod_baseline…` (IF NOT EXISTS) | YES | YES (Pro check) |
| `user_memory` (+ `budget`, `history`) | UNKNOWN | NO table; `companions/timing/personality` via `add_memory_columns.sql`; **`budget`/`history`: no DDL anywhere** | YES (8 cols, without `budget/history`) | YES |
| `user_preferences` (+ typed cols, `preference_profile`) | UNKNOWN | YES `add_preferences.sql` + `20260627_…` + `add_user_preference_profile.sql` + `add_user_language_preference.sql` | YES (base) | YES |
| `user_integrations` | UNKNOWN | YES `add_tracking_integrations.sql` | NO | YES (calendar block) |
| `reviews` | UNKNOWN | **NO** (referenced by 16) | **NO** | YES (`searchPlaces` community rating; clip context) |
| `review_interactions` | UNKNOWN | YES `add_explore_upgrade.sql` | NO | clip turns only |
| `review_likes` | UNKNOWN | YES `add_review_social.sql` | NO | clip turns only |
| `review_saves` | UNKNOWN | YES `20260712_prod_baseline…` | NO | clip turns only |
| `user_follows` | UNKNOWN | YES `add_social_week2.sql` | NO | clip turns only |
| `user_events` | UNKNOWN | YES (two differing CREATEs + later ALTERs) | NO | clip turns only |
| `conversations` | UNKNOWN | NO | YES | not on the chat request path (saved threads) |
| `decision_evidence` + RPC `decision_evidence_save` / `decision_evidence_load` | UNKNOWN | YES `20260824_decision_evidence_state.sql` | NO | YES (ADR-024) |
| `handle_new_user()` + trigger `on_auth_user_created` | UNKNOWN | replaced by `20260808c_…` (base in root script) | YES | YES (profile row on user creation) |
| Enum types (`admin_role`, `moderation_*`) | UNKNOWN | YES | NO | NO (admin/moderation only) |
| Extension `vector` | UNKNOWN | NO | YES | NO (unused by chat) |

## 9. RLS / security metadata assessment — **NOT OBTAINABLE** (no access). Repository side: RLS enabled and owner-scoped policies for `profiles/conversations/subscriptions/user_memory/user_preferences` come from `supabase-schema.sql`; `account_status`, `decision_evidence` policies and grants from their migrations; the base `reviews` SELECT policy "Read visible reviews" is prod-only (no DDL); the grant model (ADR-019) and the `service_role` hardening (§12) are additive migrations on top.

## 10. Schema provenance — **UNKNOWN**

None of the four classifications can be evidenced: no repo-controlled source can rebuild the schema (Phase 1A.1 §5), no owner-approved baseline artefact exists, no record says staging was cloned or hand-built, and staging itself cannot be read. Formally UNKNOWN; if it were reachable, the same repository gaps would make the HISTORICAL / MANUAL classification the most likely.

## 11. `supabase-schema.sql` assessment (unchanged from Phase 1A.1 §6)

197 lines, idempotent, **schema only — no data rows**; creates extension `vector`, tables `profiles`, `conversations`, `subscriptions`, `user_memory`, `services`, `bookings`, `message_feedback`, `user_preferences`, RLS + owner policies, `handle_new_user()` + trigger. Does **not** create `reviews`, `account_status`, `decision_evidence` or any RPC, nor `user_memory.budget/history`. It is the product's original SQL-editor bootstrap ("Chạy file này trong Supabase SQL Editor") and **cannot serve as the complete audit baseline** — but it is a required *component* of any Git-derived attempt, because it is the only DDL for `profiles`, `conversations` and `user_memory`.

## 12. Deferred / rollback assessment

- `deferred/FOUNDATION_END_service_role_hardening.sql` (59 lines, applied to production 2026-08-19): `REVOKE INSERT, UPDATE, DELETE ON platform_owner/admin_roles FROM service_role`; `GRANT EXECUTE ON FUNCTION fn_is_platform_owner / fn_grant_admin_role / fn_revoke_admin_role`. Touches **no** chat-path object → **NOT REQUIRED** for `/api/chat` behaviour or schema; required only for full production security parity (Controller V2 admin surfaces).
- `deferred/PHASE2_M08_profiles_account_status.sql`: superseded, never applied → NOT REQUIRED, must not be applied.
- `rollback/*` (14 files): reverse migrations, "NOT applied automatically" → NOT REQUIRED for a forward bootstrap.

## 13. Exact required schema baseline (for a new non-production audit project)

### A. REQUIRED SCHEMA OBJECTS
- `public.profiles` (+ `handle_new_user()` and trigger `on_auth_user_created` in their **current** production form — the root script version was replaced by `20260808c_handle_new_user_skip_anonymous.sql`).
- `public.account_status` (as `20260819_m08_account_status.sql`).
- `public.subscriptions` with `user_id`, `status`, `current_period_end` (as `20260712_prod_baseline…`).
- `public.user_memory` with **all** of `location_base, preferences, budget, history, companions, timing, personality, updated_at` (`memoryService.ts:30`) — the `budget`/`history` definitions exist only in production.
- `public.user_preferences` with `budget_level, cuisine_likes, dietary_restrictions, inferred_preferences, budget_min, budget_max, preferred_style, preference_profile` (+ the language column) as the union of its four migrations.
- `public.user_integrations` (as `add_tracking_integrations.sql`).
- `public.reviews` with at least `place_id`, `rating`, `is_hidden` and the clip-context columns; the only column list in the repo is the introspection record in `docs/ios/05_DATABASE_CONTRACT.md:49` (24 columns).
- `public.review_interactions`, `review_likes`, `review_saves`, `user_follows`, `user_events` (with the event-catalog columns `event_id, schema_version, anon_id, is_unknown_event, platform`) — needed only for Explore-clip turns, which the 15 baseline queries do not exercise; include for fidelity.
- `public.decision_evidence` + `decision_evidence_save(uuid, jsonb)` / `decision_evidence_load(uuid)` (as `20260824_decision_evidence_state.sql`).
- Platform: `auth.users`, `auth.uid()`, roles `anon`/`authenticated`/`service_role` (provided by any Supabase project).
- Extensions: none beyond defaults (`gen_random_uuid()`); `vector` is not needed by the chat path.

### B. REQUIRED SECURITY BASELINE
- RLS enabled + owner policies on `user_memory`, `user_preferences`, `subscriptions`, `profiles` (so the caller-scoped reads in `contextBuilder.ts` behave as in production).
- `reviews` base SELECT policy (`USING (NOT is_hidden)`, prod-only) + the two repo policies from `20260703_add_reviews_update_policy.sql` + the RESTRICTIVE policy from `20260818_publication_boundary_rls.sql` — these decide what `searchPlaces` can read under the caller's client.
- `account_status` policies/grants (M08) and `decision_evidence_*` grants (ADR-024) exactly as their migrations define.
- `SECURITY DEFINER` + `search_path` settings of `handle_new_user()`.

### C. NOT REQUIRED
- Admin/back-office objects (`admin_roles`, `platform_owner*`, `audit_log`, moderation, marketing, cohort/daily rollups, notifications, messaging `chat_*`, music, groups, price watches, plan shares, `services`/`bookings`, `vector`), `deferred/**`, `rollback/**`.
- Any data rows, any auth users, any storage objects, any KV state.

### D. UNKNOWN (cannot be established from repository or staging evidence)
- The exact production definitions of `reviews` (constraints, defaults, base policy text), `profiles` (drift since the root script), `user_memory.budget` / `user_memory.history` (types/defaults), the surviving shape of `user_events`, and whether production carries further out-of-band changes. These are precisely the objects only a production **schema-only** export can supply.

## 14. Required owner inputs

The evidence supports — and the repository itself states (`docs/ios/05_DATABASE_CONTRACT.md:13` "can only be reconstructed from a real `pg_dump`"; `20260712…:5-9`; `20260818…:21-24`) — that no repository-controlled baseline exists. Therefore:

```text
SCHEMA ONLY
NO DATA ROWS
NO AUTH USERS
NO USER MEMORY
NO CONVERSATIONS
NO PERSONAL INFORMATION
NO TOKENS
NO SECRETS
```

1. **A schema-only export of production** (`pg_dump --schema-only --no-owner --no-privileges` or the Dashboard schema export), `public` schema plus the functions/triggers/policies it owns; performed by the owner, never by the audit; applied by the owner to a **new** non-production project (or to staging, if it is unpaused and re-verified — see §15).
2. **A reachable non-production project** with its URL / anon key / service-role key placed only in the audit checkout's runtime env (never in chat, never committed): either unpause + re-verify `nhncoqyadofojjrnpiia` (confirm it holds no production rows; if in doubt, reset its `public` schema and apply the export) or create a new one.
3. **Optionally a fresh Management PAT**, only if the owner wants the audit to verify schema/apply through the Management API instead of the Dashboard SQL editor (the repo's documented channel, ADR-014).
4. Subsequently (separate authorised phase): dedicated test user + Pro `subscriptions` row in that project; instance-local quota (no KV variables); dedicated checkout.

## 15. Final staging classification — **`UNVERIFIED`**

- Identity: **UNVERIFIED** (hostname does not resolve; project deleted or paused — undeterminable without a valid PAT).
- Production separation: ref differs (verified); everything else UNVERIFIED.
- Data provenance: UNKNOWN. Usage: historical/abandoned (most consistent), no deployment depends on it.
- Schema: UNKNOWN. Could it be used without mutation? Not applicable while unreachable; if revived, the required audit state (test user, Pro row, memory, quota) would be isolated from production by construction, but its **pre-existing** content would still have to be verified empty of production rows before use.
- It cannot be `SUITABLE` or `SUITABLE AFTER OWNER VERIFICATION` on today's evidence: the project cannot even be shown to exist.

## 16. Safety statement

No write, no authenticated call, no application request, no production request, no data access of any kind was performed. The counters at the top of this document are exact. Git integrity: only `docs/audit/**` changed.
