# G1 migrations — apply & verification checklist (owner runs this; nothing here has been applied)

**Owner applies these two migrations to production.** Claude cannot run DDL against production (no Postgres connection, no CLI link, and `SUPABASE_SERVICE_ROLE_KEY` is not a DDL channel by policy). This is the G1 counterpart of `docs/architecture/ADR-014-migration-apply-checklist.md`, written from the migration files themselves.

| Migration | What it creates | Rollback |
|---|---|---|
| `supabase/migrations/20260913_g1_growth_foundation.sql` | tables `public.shared_results`, `public.anon_identity_map`; function `public.fn_shared_result_bump(text, text, integer)`; 3 indexes; RLS + 2 policies; grants | `supabase/migrations/rollback/20260913_g1_growth_foundation_rollback.sql` (**destructive** — drops every `/r/<slug>` row) |
| `supabase/migrations/20260918_g1b_share_ancestry.sql` | columns `shared_results.parent_id`, `shared_results.owner_is_anonymous`; 2 partial indexes | `supabase/migrations/rollback/20260918_g1b_share_ancestry_rollback.sql` (non-destructive for pages) |

Both are **additive only** (no existing table, policy or function is touched), **idempotent** (`IF NOT EXISTS` / guarded `DO` / `CREATE OR REPLACE`), and the second **depends on the first** (`ALTER TABLE public.shared_results`). Both are exercised end-to-end against embedded PostgreSQL with the platform's default ACLs in `supabase/tests/g1_growth_foundation.test.ts` (port 54385; 20 cases incl. idempotency and both rollbacks) and pass `npm run check:sql-grants`.

## 0. Why the release needs them

The RC (`rc/web-uat @ b0896e7`) already ships the share-out loop; `feat/g1-completion` adds nothing that needs a further migration. Behaviour of the deployed code **without** the migrations:

| Path | Without migrations | With both |
|---|---|---|
| `GET /r/<slug>` | 404 (read error → "not found"; no crash) | renders |
| Hubs, `sitemap.xml`, `feed.xml`, `/api/oembed` | static content only; result lists empty | list public results |
| `POST /api/shared-results`, `POST /api/scam-shield/share` (the Share button) | **fails** (`db_error`) — the insert writes `owner_is_anonymous` and `parent_id`, so the ancestry migration is required too, not only the foundation | works |
| `/api/track` stitching + view/ask counters | logged errors (`[track/g1] …`), events still ingested | stitched + counted |
| Everything else (chat, Scam Shield check, hubs' static copy, `/about`, `/extension`, `/scam-shield/kich-ban/*`) | unaffected | unaffected |

So: **the site is safe to deploy before the migrations, but the share loop (the point of G1) is dead until both are applied.** Apply them before the release goes to anyone who will press Share.

## 1. Apply — in this order

**Supabase Dashboard → SQL Editor → New query** (project `fwznnobrdctuskgrvuik` = production; do not run against the audit project unless that is the intent).

1. Paste the **entire** `supabase/migrations/20260913_g1_growth_foundation.sql` → **Run** → expect `Success. No rows returned`.
2. Paste the **entire** `supabase/migrations/20260918_g1b_share_ancestry.sql` → **Run** → expect `Success. No rows returned`.
3. Re-running either file is safe (idempotent) — if a run is interrupted, run it again rather than editing it.

> Do **not** hand-edit the SQL. If the editor reports an error, copy the exact message and stop; the rollback for a partially applied foundation is the same file as for a full one.

## 2. Verify — run each in the SQL Editor; compare the **column names** of the result grid, not just the row count (the grid can show a previous query's result)

**2.1 — both tables exist, RLS on**
```sql
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('shared_results', 'anon_identity_map')
order by c.relname;
```
Expect 2 rows, `relrowsecurity = true` for both.

**2.2 — `shared_results` columns (15 = 13 foundation + 2 ancestry)**
```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'shared_results'
order by ordinal_position;
```
Expect, in order: `id, slug, owner_id, query, payload, domain, locale, status, og_version, view_count, ask_count, created_at, updated_at, parent_id, owner_is_anonymous`. `owner_is_anonymous` is `boolean`, `NO`, default `false`; `parent_id` is `uuid`, `YES`. (If the last two are missing, migration 2 did not run.)

**2.3 — constraints: status CHECK, slug UNIQUE, owner FK SET NULL, parent self-FK SET NULL**
```sql
select conname, contype, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.shared_results'::regclass
order by conname;
```
Expect at least: a CHECK `status = ANY (ARRAY['public','removed'])`, `shared_results_slug_key` UNIQUE, `shared_results_owner_id_fkey` … `ON DELETE SET NULL`, `shared_results_parent_id_fkey` → `shared_results(id) ON DELETE SET NULL`, `shared_results_pkey`.

**2.4 — indexes (5 on shared_results + 1 on anon_identity_map, plus the PKs)**
```sql
select tablename, indexname from pg_indexes
where schemaname = 'public' and tablename in ('shared_results', 'anon_identity_map')
order by tablename, indexname;
```
Expect on `shared_results`: `shared_results_listed_idx`, `shared_results_owner_idx`, `shared_results_parent_idx`, `shared_results_pkey`, `shared_results_public_domain_idx`, `shared_results_slug_key`. On `anon_identity_map`: `anon_identity_map_pkey`, `anon_identity_map_user_idx`.

**2.5 — policies (2 on shared_results, 0 on anon_identity_map — by design)**
```sql
select tablename, policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename in ('shared_results', 'anon_identity_map')
order by tablename, policyname;
```
Expect exactly: `shared_results_owner_select` (SELECT, `{authenticated}`), `shared_results_owner_withdraw` (UPDATE, `{authenticated}`). No rows for `anon_identity_map`.

**2.6 — table grants are the authority (RLS filters rows, grants decide access)**
```sql
select r.role,
  has_table_privilege(r.role, 'public.shared_results', 'SELECT')  as sr_select,
  has_table_privilege(r.role, 'public.shared_results', 'INSERT')  as sr_insert,
  has_table_privilege(r.role, 'public.shared_results', 'DELETE')  as sr_delete,
  has_column_privilege(r.role, 'public.shared_results', 'status',  'UPDATE') as sr_upd_status,
  has_column_privilege(r.role, 'public.shared_results', 'payload', 'UPDATE') as sr_upd_payload,
  has_table_privilege(r.role, 'public.anon_identity_map', 'SELECT') as aim_select
from (values ('anon'), ('authenticated'), ('service_role')) as r(role);
```
Expect:

| role | sr_select | sr_insert | sr_delete | sr_upd_status | sr_upd_payload | aim_select |
|---|---|---|---|---|---|---|
| anon | false | false | false | false | false | false |
| authenticated | **true** | false | false | **true** | false | false |
| service_role | true | true | true | true | true | true |

Any `true` in the `anon` row, or `sr_insert`/`sr_upd_payload` true for `authenticated`, means the ADR-019 default-privilege revoke did not take — stop and report.

**2.7 — the counter function: SECURITY DEFINER, service_role only**
```sql
select p.proname, p.prosecdef,
  has_function_privilege('anon',          'public.fn_shared_result_bump(text,text,integer)', 'EXECUTE') as anon_exec,
  has_function_privilege('authenticated', 'public.fn_shared_result_bump(text,text,integer)', 'EXECUTE') as auth_exec,
  has_function_privilege('service_role',  'public.fn_shared_result_bump(text,text,integer)', 'EXECUTE') as svc_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_shared_result_bump';
```
Expect 1 row: `prosecdef = true`, `anon_exec = false`, `auth_exec = false`, `svc_exec = true`.

**2.8 — `check:sql-grants` parity (local, already green):** `npm run check:sql-grants` → `0 errors`. Nothing to run in production for this step.

## 3. After apply — application-level check (production, one real share by the owner)

1. Deploy the release (the code is already on the RC / `feat/g1-completion`).
2. Signed in, in chat: get one answer → **Share** → preview → confirm → the `/r/<slug>` page opens (200, OG tags present, page carries no LLM call).
3. `GET https://www.tappyai.com/sitemap.xml` lists that `/r/<slug>` (listed = public AND `owner_is_anonymous = false`).
4. Open the page logged out → `share_viewed` lands; then in the SQL Editor:
   ```sql
   select slug, status, owner_is_anonymous, parent_id, view_count, ask_count from public.shared_results order by created_at desc limit 3;
   ```
   `view_count ≥ 1` on that slug confirms `fn_shared_result_bump` is reachable from the ingestion route.
5. Withdraw it (API only — there is no withdraw button in the UI): signed in as the owner, `DELETE /api/shared-results/<slug>` (e.g. from the browser console: `fetch('/api/shared-results/<slug>', { method: 'DELETE' })`) → `{ ok: true }`; then `status = 'removed'`, `/r/<slug>` → 404, drops from the sitemap.

If step 2 fails with a server error, read the Vercel function log for `[shared-results]` / `db_error` — the message names the missing column or table.

## 4. Rollback — reverse order, only with owner authorization

1. `rollback/20260918_g1b_share_ancestry_rollback.sql` — drops the two columns and two indexes; pages keep working.
2. `rollback/20260913_g1_growth_foundation_rollback.sql` — **destructive**: every `/r/<slug>` stops resolving and attribution rows are gone. Export `shared_results` first if any real share exists.

Rolling back only the foundation while the ancestry columns exist is impossible (the table goes with them); rolling back only the ancestry file leaves a working foundation but the Share button will fail again (§0) until the ancestry file is re-applied.
