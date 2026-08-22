# K-2 — `platform_settings` production apply pack

**Authorization:** Owner, 2026-08-22 — *"Apply `20260822_k2_platform_settings.sql` lên production. Chỉ thực hiện đúng migration này, không mở rộng scope."*
**Contract:** [Owner Decision D1b](../OWNER_DECISIONS_2026-08-22.md#d1b--platform_settings-01_arch-41-is-the-schema-authority-migration-authorized-runtime-tier-authorized) · [`01_ARCH` §4.1](../01_CONTROLLER_V2_ARCHITECTURE.md) · apply pattern [ADR-017](../../architecture/ADR-017-service-role-hardening-strategy.md) / [ADR-014](../../architecture/ADR-014-migration-apply-checklist.md)

> **Why this document exists.** [ADR-014](../../architecture/ADR-014-migration-apply-checklist.md) line 3 states the standing condition: *"**Owner applies this migration to production.** Claude cannot run DDL in this environment (only `SUPABASE_SERVICE_ROLE_KEY` = PostgREST data JWT; no direct Postgres connection, no CLI link)."* That condition was re-measured on 2026-08-22 and **still holds** — see Preflight §0. So the migration is handed over rather than applied.

---

## 0. Preflight — MEASURED 2026-08-22, before handover

| Check | Result |
|---|---|
| **Source is merged `main`, not a working tree** | ✅ read via `git show origin/main:supabase/migrations/20260822_k2_platform_settings.sql`. `main` = `4fe6fd4`, blob `ec9b97f`, **5605 bytes**, SHA-256 `9c1333ab1064a092d487d651fa9865e83df22570e8040fe7fbc0a12398768658`. Byte-identical to the worktree copy |
| **Target project** | ✅ `fwznnobrdctuskgrvuik` — **production** (`NEXT_PUBLIC_SUPABASE_URL`). The account also holds `nhncoqyadofojjrnpiia` (staging); this pack targets production only |
| **Not already applied** | ✅ `platform_settings` probes **`PGRST205`** ("Could not find the table … in the schema cache") with the service-role key |
| **Exactly five columns, per D1b** | ✅ `key` · `value` · `scope` · `value_schema` · `updated_by` |
| **No `updated_at` or any extra column** | ✅ `updated_at` appears **3 times, all in comments**; **0 occurrences** in executable SQL |
| **Scope of the file** | ✅ **five mutating statements, all on `platform_settings`**: `CREATE TABLE` · `CREATE INDEX` · `REVOKE` · `GRANT` · `ALTER TABLE … ENABLE ROW LEVEL SECURITY`. **No** `INSERT`/`UPDATE`/`DELETE`/`DROP`/`TRUNCATE`, and no other object is named |
| **No includes / meta-commands** | ✅ 0 matches for `\i`, `\ir`, `pg_read_file`, `COPY` — pasting this file cannot pull in another migration |
| **Idempotent** | ✅ `IF NOT EXISTS` on both the table and the index; re-running is safe |
| **Rollback exists** | ✅ [`rollback/20260822_k2_platform_settings_rollback.sql`](../../../supabase/migrations/rollback/20260822_k2_platform_settings_rollback.sql) |
| **🔴 Apply channel** | **BLOCKED.** No `SUPABASE_ACCESS_TOKEN` in either worktree `.env.local`, the session environment, `~/.supabase` (only `telemetry.json` + `traces/`) or `%APPDATA%`. `supabase projects list` → `LegacyPlatformAuthRequiredError`. The service-role key is a PostgREST **data** JWT and has no DDL path |

**Nothing about the database state differs from the contract.** The only thing missing is a credential only the Owner can mint.

---

## 1. Apply — Dashboard → SQL Editor

The authoritative text is the file itself at `main` = `4fe6fd4`:

`supabase/migrations/20260822_k2_platform_settings.sql`

1. Supabase Dashboard → **project `fwznnobrdctuskgrvuik`** → **SQL Editor** → New query.
2. Paste the **entire** file. Do not hand-edit it — the schema is fixed by D1b, and if anything looks wrong, stop and say so rather than changing it.
3. **Run.** Expect *"Success. No rows returned."*

### The executable part, for reference

```sql
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key             TEXT PRIMARY KEY,
  value           JSONB NOT NULL,
  scope           TEXT NOT NULL DEFAULT 'global',
  value_schema    TEXT,
  updated_by      UUID REFERENCES public.profiles(id),
  CONSTRAINT platform_settings_scope_check CHECK (scope IN ('global', 'hub', 'module'))
);

CREATE INDEX IF NOT EXISTS idx_platform_settings_scope ON public.platform_settings(scope);

REVOKE ALL ON TABLE public.platform_settings FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
```

> ⚠️ This is a **transcription for reading**. Paste the file, not this block — the file is the artefact whose hash is recorded above.

---

## 2. Verify — read-only, run after apply

Copy the whole block; each query is labelled with what it must return.

```sql
-- 2.1  Exactly five columns, and no updated_at.
--      EXPECT 5 rows: key, scope, updated_by, value, value_schema
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'platform_settings'
 ORDER BY column_name;

-- 2.2  Grants: service_role ONLY. EXPECT zero rows for anon/authenticated/PUBLIC.
SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'platform_settings'
 GROUP BY grantee ORDER BY grantee;

-- 2.3  RLS on, and ZERO policies (a missing policy is a denial).
--      EXPECT rls_enabled = true, policy_count = 0
SELECT c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'platform_settings') AS policy_count
  FROM pg_class c WHERE c.oid = 'public.platform_settings'::regclass;

-- 2.4  The scope CHECK is the three §4.1 names. EXPECT the IN ('global','hub','module') text.
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.platform_settings'::regclass AND contype = 'c';

-- 2.5  The updated_by FK does NOT cascade. EXPECT confdeltype = 'a' (no action).
SELECT conname, confdeltype
  FROM pg_constraint
 WHERE conrelid = 'public.platform_settings'::regclass AND contype = 'f';

-- 2.6  The table is EMPTY. This migration inserts nothing. EXPECT 0.
SELECT count(*) AS rows_present FROM public.platform_settings;

-- 2.7  Nothing outside scope was created. EXPECT exactly one row: platform_settings.
SELECT tablename FROM pg_tables
 WHERE schemaname = 'public' AND tablename IN ('platform_settings', 'module_registry');
--      module_registry MUST NOT appear — Decision D1a puts it OUT OF SCOPE.
```

### Expected results

| Query | Expected |
|---|---|
| 2.1 | **5 rows** — `key`, `scope`, `updated_by`, `value`, `value_schema`. `scope` default `'global'::text`. **No `updated_at`** |
| 2.2 | **`service_role` only.** `anon`, `authenticated`, `PUBLIC` absent |
| 2.3 | `rls_enabled = true`, `policy_count = 0` |
| 2.4 | `platform_settings_scope_check` → `CHECK (scope = ANY (ARRAY['global'…,'hub'…,'module'…]))` |
| 2.5 | `confdeltype = 'a'` — deleting an administrator must not delete the setting they last changed |
| 2.6 | `0` |
| 2.7 | **`platform_settings` only.** `module_registry` must be absent |

---

## 3. Rollback window

The table is empty on creation, so rollback loses nothing at apply time. Keep the window open until §4 passes.

Rollback is [`rollback/20260822_k2_platform_settings_rollback.sql`](../../../supabase/migrations/rollback/20260822_k2_platform_settings_rollback.sql). Read its header first — **the risk it carries is not an outage.** Dropping this table does not break the Controller: every request falls through to flags, env and manifest defaults, which is exactly what the loader is written to do when the table is unreachable. So a rollback **silently reverts configured values to their environment values**. Export before dropping.

## 4. After apply — what Claude does next

Nothing in this pack changes application behaviour on its own: the table is empty, so the runtime tier resolves nothing and precedence still falls through to env and defaults. Once §2 passes, Claude:

1. re-probes `platform_settings` (expects `42501`, not `PGRST205` — present but not anon-readable);
2. re-runs the production UAT — `/admin` non-5xx, EN + VI, 0 console errors, `/api/version` on the production SHA;
3. proves the runtime tier is **live** rather than merely present, which is the only check this table's existence enables;
4. re-runs the Controller regression;
5. updates [`STATUS.md`](../STATUS.md) to record K-2 as complete, and opens the PR.
