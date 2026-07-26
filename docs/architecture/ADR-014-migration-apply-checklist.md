# ADR-014 Phase 0 — Migration Apply & Verification Checklist

**Owner applies this migration to production.** Claude cannot run DDL in this environment
(only `SUPABASE_SERVICE_ROLE_KEY` = PostgREST data JWT; no direct Postgres connection, no
CLI link). After you confirm every check below passes, Claude proceeds to deploy Phase 1–3
(code is already written & locally tested on branch `feat/notif-unification-impl`).

**Migration file:** `supabase/migrations/20260725_notifications_unification.sql`
It is **idempotent** (all `IF NOT EXISTS` / guarded `DO` blocks) — safe to re-run.

---

## 1. Apply

**Option A — Supabase Dashboard (recommended, no CLI link needed):**
1. Dashboard → **SQL Editor** → New query.
2. Paste the **entire** contents of `supabase/migrations/20260725_notifications_unification.sql`.
3. **Run**. Expect "Success. No rows returned."

**Option B — Supabase CLI (only if this project is linked):**
```bash
supabase db push
```

> ⚠️ Do **not** hand-edit the SQL. The schema is frozen (ADR-014). If anything about the
> schema looks wrong, tell Claude — Claude will STOP and report, not silently change it.

---

## 2. Verify (run each query in SQL Editor; expected result noted)

**2.1 — Table + all 15 columns exist**
```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'notifications'
order by ordinal_position;
```
Expect 15 rows: `id, user_id, type, category, title, body, actor_id, entity_url,
image_url, data, read_at, push_status, push_sent_at, push_attempts, push_error, created_at`
(16 — id + those). `push_status` default `'pending'`, `data` default `'{}'::jsonb`,
`push_attempts` default `0`.

**2.2 — CHECK constraint on push_status**
```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.notifications'::regclass and contype = 'c';
```
Expect a CHECK: `push_status = ANY (ARRAY['pending','sent','failed','skipped'])`.

**2.3 — 3 indexes (+ primary key)**
```sql
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'notifications' order by indexname;
```
Expect: `notifications_pkey`, `notifications_push_retry_idx`,
`notifications_user_created_idx`, `notifications_user_unread_idx`.

**2.4 — RLS enabled**
```sql
select relrowsecurity from pg_class where relname = 'notifications';
```
Expect: `t` (true).

**2.5 — 2 RLS policies (SELECT own, UPDATE own)**
```sql
select policyname, cmd from pg_policies where tablename = 'notifications' order by policyname;
```
Expect: `notifications_select_own` (SELECT), `notifications_update_own` (UPDATE).
There is **no INSERT policy** by design — only the service-role (server) mints rows.

**2.6 — Added to the Realtime publication**
```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications';
```
Expect: exactly 1 row (`notifications`).

**2.7 — REPLICA IDENTITY FULL (so UPDATE/read_at flips carry the row over Realtime)**
```sql
select relreplident from pg_class where relname = 'notifications';
```
Expect: `f` (full). (`d` = default would be wrong — tell Claude if you see `d`.)

---

## 3. Confirm back to Claude

Reply with **"migration applied, all checks pass"** (or paste any check that failed).
Claude will then run the production verification suite (insert a test row via service-role →
observe it appear in Inbox + badge + Realtime + push) and, once green, request deploy approval.
