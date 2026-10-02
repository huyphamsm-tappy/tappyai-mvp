-- ============================================================================
-- `public.user_memory.user_id` — restore referential integrity to `auth.users`
--
-- GATE: applied to production ONLY under explicit Owner authorization, as its
--       own change with its own preflight, verification and rollback window
--       (ADR-014 / ADR-017 pattern). Nothing here runs as part of a batch.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT
-- ---------------------------------------------------------------------------
-- `public.user_memory` holds one row of private, LLM-extracted memory per user.
-- Its `user_id` is meant to BE `auth.users.id` — every writer in the codebase
-- pins it from a verified session (see "WHO WRITES THIS COLUMN" below). But on
-- the live database the column is `text` and carries NO foreign key, so the
-- database has never been told that.
--
-- The consequence is not theoretical. Account deletion in this product is
-- MANUAL: `/delete-account` opens a prepared support email and an operator
-- deletes the Auth user by hand (asserted in
-- `src/lib/legal/accountDeletionParity.test.ts` — the Android screen is
-- required NOT to contain `deleteUser`). Every sibling table cascades on that
-- deletion; `user_memory` alone does not. A deleted account therefore leaves
-- its private memory behind, and the row is INVISIBLE afterwards — RLS filters
-- it to an `auth.uid()` that no longer exists, so nothing in the product can
-- ever read it or clean it up again. It has to be found and deleted by hand.
-- That already happened once, which is why this file exists.
--
-- ---------------------------------------------------------------------------
-- WHY THE SCHEMA DIVERGED (so this is not "fixed" by re-running the baseline)
-- ---------------------------------------------------------------------------
-- `supabase-schema.sql:88` declares the column CORRECTLY:
--
--     user_id uuid references auth.users on delete cascade not null unique
--
-- but it is written `create table if not exists`, and the live table already
-- existed — created out of band in the SQL editor, `text`, before that file was
-- the baseline. `IF NOT EXISTS` then made the declaration a silent no-op
-- forever. This is the same drift `20260712_prod_baseline_and_review_saves_
-- indexes.sql` records for `review_saves` / `subscriptions`.
--
-- The live shape is recorded from introspection in
-- `docs/ios/05_DATABASE_CONTRACT.md:167` ("Note `user_id` is `text` in prod
-- (not uuid)"), and independently in `docs/ios/04_API_CONTRACT.md:54` and
-- `docs/ios/PHASE1_AUTH_SURVEY.md:126`.
--
-- 🚨 SO THIS FILE MUST HANDLE BOTH SHAPES. A database provisioned fresh from
--    `supabase-schema.sql` is ALREADY correct; production is not. Every section
--    below is conditional on what it finds, so this migration is a complete
--    no-op against the correct shape and a repair against the divergent one.
--    It is idempotent and safe to re-run in either case.
--
-- ---------------------------------------------------------------------------
-- WHY THE TYPE MUST CHANGE — MEASURED, NOT ASSUMED
-- ---------------------------------------------------------------------------
-- "Prefer the smallest safe change" would prefer adding the FK and leaving the
-- type alone. PostgreSQL does not allow it. Measured on embedded PostgreSQL 17:
--
--   ALTER TABLE m ADD CONSTRAINT f FOREIGN KEY (user_id)   -- user_id is text
--     REFERENCES auth.users(id);                           -- users.id is uuid
--   ERROR:  foreign key constraint "f" cannot be implemented
--   DETAIL: Key columns are of incompatible types: text and uuid.
--
-- A foreign key needs an equality operator in a shared btree operator family;
-- `text` and `uuid` have none. There is no cast, no opclass and no index trick
-- that avoids this. **TEXT -> UUID is therefore REQUIRED, not preferred.**
--
-- ---------------------------------------------------------------------------
-- 🚨 THE HAZARD THAT BREAKS A NAIVE MIGRATION: RLS BLOCKS THE TYPE CHANGE
-- ---------------------------------------------------------------------------
-- Also measured, and the reason section 4 looks the way it does:
--
--   ALTER TABLE m ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
--   ERROR:  cannot alter type of a column used in a policy definition
--
-- `user_memory` carries an RLS policy on this exact column, so the type change
-- CANNOT run while it exists. The policy must be dropped and recreated around
-- it. A migration that skipped this would fail halfway, in production, after
-- having already deleted the orphan rows.
--
-- And note WHAT the live policy must say. On a `text` column the intended
-- expression is not even writable:
--
--   CREATE POLICY p ON m FOR ALL USING (auth.uid() = user_id);
--   ERROR:  operator does not exist: uuid = text
--
-- So the live policy is necessarily stored as `((auth.uid())::text = user_id)`,
-- whatever the docs write as shorthand. Section 5 recreates it as the direct
-- `auth.uid() = user_id` once both sides are `uuid`. The two are EQUIVALENT for
-- every value that is a valid UUID, and after section 3 every surviving value
-- is one. **This migration makes no authorization change of any kind.**
--
-- ---------------------------------------------------------------------------
-- FK IS NOT A REPLACEMENT FOR RLS
-- ---------------------------------------------------------------------------
-- They answer different questions and this file changes only the first:
--   FK  = referential integrity — "does this row's owner exist?"
--   RLS = authorization         — "may THIS caller see this row?"
-- The policy is dropped and recreated with identical meaning solely because
-- PostgreSQL will not alter a column a policy references. Authorization is
-- exactly as strong after this migration as before it.
--
-- ---------------------------------------------------------------------------
-- WHO WRITES THIS COLUMN (audited at 842379b — why the FK cannot break writes)
-- ---------------------------------------------------------------------------
-- `src/lib/memory/memoryService.ts` is the SINGLE gateway; `memoryBoundary.
-- test.ts` enforces that no other module applies a write verb to the table.
-- Every caller supplies a server-derived id:
--
--   /api/memory GET/POST/PATCH/DELETE  getRequestUser(req).user.id
--   /api/onboarding                    getRequestUser(req).user.id
--   /api/chat (onFinish extraction)    authedUserId, set only after
--                                      getRequestUser + a not-anonymous check
--   /api/suggested-prompts, (home)     session user.id
--   cron/behavior-rollup               user_events.user_id — itself already
--                                      `uuid REFERENCES auth.users ON DELETE
--                                      CASCADE` (20260627_user_memory.sql)
--
-- No client, on any platform, ever supplies a `user_id`; `updateMemory` writes
-- it AFTER the sanitised patch is spread so no candidate field can override it
-- (MEM-01/04). Anonymous identities never reach the write at all
-- (`chat/route.ts:286,311`). So every row this table gains today already
-- references a live `auth.users` row — the FK only makes the database enforce
-- what the application already guarantees, and can refuse no legitimate write.
--
-- CLIENT IMPACT: NONE. PostgREST receives and returns a UUID as a JSON string
-- either way. `ios/TappyAI/Features/Profile/Model/ProfileModels.swift` has no
-- `user_id` field at all, and the Android memory package contains no occurrence
-- of `user_memory` or an ownership field. No client model, payload or query
-- changes. Nothing in `src/` depends on the column being `text` — no `like`,
-- no concatenation, no string manipulation anywhere near it.
-- ============================================================================


-- ============================================================================
-- 0. PREFLIGHT — STOP rather than guess.
--
-- Production row-level facts (orphan / NULL / non-UUID counts) cannot be known
-- when this file is written; they are only knowable when it runs. The rule is
-- that an EXPECTED condition is repaired automatically and an UNEXPECTED one
-- aborts the transaction with a message naming exactly what to look at.
--
-- Aborting is the safe outcome: this whole file runs in one transaction, so a
-- RAISE here leaves the database untouched, including the deletions in
-- section 3.
-- ============================================================================
DO $preflight$
DECLARE
  v_kind        "char";
  v_type        text;
  v_bad_shape   bigint;
  v_unknown_pol text;
  v_dependents  text;
BEGIN
  -- 0.1 The table must exist and be a table. Nothing below is meaningful
  --     otherwise, and a silent skip would report success over an absent fix.
  SELECT c.relkind INTO v_kind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'user_memory';

  IF v_kind IS NULL THEN
    RAISE EXCEPTION
      'user_memory FK migration: public.user_memory does not exist. Apply supabase-schema.sql first; it creates the table already correctly shaped, and this migration is then a no-op.';
  ELSIF v_kind <> 'r' THEN
    RAISE EXCEPTION
      'user_memory FK migration: public.user_memory is relkind=% , not an ordinary table. Refusing to proceed.', v_kind;
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.user_memory'::regclass
     AND a.attname  = 'user_id' AND a.attnum > 0 AND NOT a.attisdropped;

  IF v_type IS NULL THEN
    RAISE EXCEPTION
      'user_memory FK migration: public.user_memory has no user_id column. Refusing to proceed.';
  ELSIF v_type NOT IN ('text', 'uuid', 'character varying') THEN
    RAISE EXCEPTION
      'user_memory FK migration: user_id is % — expected text or uuid. This is an unexamined shape; stop and audit before running.', v_type;
  END IF;

  -- 0.2 🚨 Values that are not UUID-shaped.
  --
  -- `ALTER COLUMN ... USING user_id::uuid` aborts on the first such value
  -- ('invalid input syntax for type uuid'). These are NOT deleted automatically:
  -- unlike an orphan (whose owner provably no longer exists) a non-UUID value is
  -- evidence of a writer this audit did not find — a device id, an email, a
  -- legacy identity scheme — and deleting it would destroy the only evidence of
  -- that path. A human decides.
  --
  -- The regex is the shape test, NOT a cast: a cast here would raise the very
  -- error this check exists to pre-empt, with a worse message.
  IF v_type <> 'uuid' THEN
    EXECUTE $q$
      SELECT count(*) FROM public.user_memory
       WHERE user_id IS NOT NULL
         AND user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    $q$ INTO v_bad_shape;

    IF v_bad_shape > 0 THEN
      RAISE EXCEPTION
        'user_memory FK migration: % row(s) have a user_id that is not UUID-shaped. They cannot be cast, and they are NOT safe to delete blindly — some writer this audit did not find produced them. Identify them with VERIFY query 0 at the foot of this file (it returns a truncated fingerprint, not the value), resolve them, then re-run.',
        v_bad_shape;
    END IF;
  END IF;

  -- 0.3 Policies other than the one this file knows how to restore.
  --
  -- Section 4 must drop every policy on the column before the type change.
  -- Dropping one this file cannot faithfully recreate would silently REMOVE AN
  -- AUTHORIZATION RULE — the worst possible outcome of a data-integrity fix. So
  -- an unrecognised policy stops the migration instead.
  SELECT string_agg(policyname, ', ' ORDER BY policyname) INTO v_unknown_pol
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'user_memory'
     AND policyname <> 'Users can manage own memory';

  IF v_unknown_pol IS NOT NULL THEN
    RAISE EXCEPTION
      'user_memory FK migration: unrecognised RLS polic(ies) on user_memory: %. The type change requires dropping every policy on user_id, and this file only knows how to restore "Users can manage own memory". Record the unknown policy, extend section 5, then re-run.', v_unknown_pol;
  END IF;

  -- 0.4 Views / matviews / generated columns built on the column. PostgreSQL
  --     refuses the type change for these too, and each needs its own decision.
  SELECT string_agg(DISTINCT dependent.relname, ', ') INTO v_dependents
    FROM pg_depend d
    JOIN pg_rewrite r      ON r.oid = d.objid
    JOIN pg_class dependent ON dependent.oid = r.ev_class
   WHERE d.refobjid = 'public.user_memory'::regclass
     AND d.refobjsubid = (SELECT attnum FROM pg_attribute
                           WHERE attrelid = 'public.user_memory'::regclass AND attname = 'user_id')
     AND d.classid = 'pg_rewrite'::regclass
     AND dependent.relname <> 'user_memory';

  IF v_dependents IS NOT NULL THEN
    RAISE EXCEPTION
      'user_memory FK migration: view(s)/matview(s) depend on user_memory.user_id: %. PostgreSQL will not alter the column type beneath them. Each needs its own decision; stop and audit.', v_dependents;
  END IF;

  RAISE NOTICE 'user_memory FK migration: preflight OK (user_id is %).', v_type;
END
$preflight$;


-- ============================================================================
-- 1. The cleanup ledger.
--
-- Section 3 deletes rows. "Document exactly what was cleaned" needs to survive
-- the migration, so the record lives in the database rather than in scrollback.
--
-- 🚨 IT RECORDS A FINGERPRINT, NEVER THE MEMORY ITSELF.
-- The rows being deleted are the private memory of accounts that have already
-- been deleted. Copying their content into an archive table would recreate, in
-- a table with no RLS and no owner, precisely the "private memory outlives the
-- account" defect this migration exists to close — and it would contradict the
-- erasure policy, under which `user_memory` is deleted outright
-- (docs/backoffice/33_Privacy_Data_Governance.md:86). So: which row, whose id,
-- when it was last written, why it went. Enough to audit and to reconcile
-- counts; not enough to reconstruct anything anyone ever said.
--
-- This is the one respect in which section 3 is deliberately NOT reversible.
-- Making it reversible would mean retaining the data, which is the thing that
-- was wrong. (Task brief: do not weaken production safety for rollback.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_memory_fk_cleanup_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_row_id   uuid        NOT NULL,
  orphan_user_id  text,                     -- nullable: NULL-owner rows are logged too
  memory_updated_at timestamptz,
  reason          text        NOT NULL CHECK (reason IN ('orphan_no_auth_user', 'null_user_id')),
  cleaned_at      timestamptz NOT NULL DEFAULT now()
);

-- Born open, closed immediately. On Supabase `ALTER DEFAULT PRIVILEGES IN
-- SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role` gives
-- every new table an EXPLICIT grant to the client roles, so saying nothing
-- would leave this readable by the anonymous internet (ADR-019). RLS is enabled
-- with NO policy, which denies every non-BYPASSRLS role by default; the grants
-- are revoked as well so the closure does not depend on RLS alone.
--
-- `anon` and `authenticated` are named in the SAME statement as `PUBLIC`, not a
-- follow-up one: on Supabase the client roles hold EXPLICIT grants from
-- `ALTER DEFAULT PRIVILEGES`, and `REVOKE ... FROM PUBLIC` removes only the
-- implicit PostgreSQL default. Revoking from PUBLIC alone closes nothing here
-- (ADR-019 / G2).
ALTER TABLE public.user_memory_fk_cleanup_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_memory_fk_cleanup_log FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON TABLE public.user_memory_fk_cleanup_log TO service_role;


-- ============================================================================
-- 2. Record the pre-migration policy shape, for the incident report.
--
-- Section 4 drops the policy. If anyone ever needs to know what production
-- actually had — as opposed to what the docs say it had — this is the only
-- moment it can still be read. Written as a NOTICE, not a table: it is schema
-- metadata, not user data, and it belongs in the apply log beside the counts.
-- ============================================================================
DO $record$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, cmd, roles::text AS roles, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'user_memory'
  LOOP
    RAISE NOTICE 'user_memory FK migration: pre-existing policy % (cmd=%, roles=%) USING % WITH CHECK %',
      r.policyname, r.cmd, r.roles, coalesce(r.qual, '<none>'), coalesce(r.with_check, '<none>');
  END LOOP;
END
$record$;


-- ============================================================================
-- 3. GUARDED CLEANUP — the rows that cannot receive the foreign key.
--
-- `ADD CONSTRAINT ... FOREIGN KEY` validates every existing row, so anything
-- that does not point at a live `auth.users` row must go first. Two cases, and
-- BOTH are established rather than assumed — neither is a blind delete:
--
--   orphan_no_auth_user — `user_id` names no row in `auth.users`. Auth is the
--     sole authority on user existence, so this row's owner PROVABLY does not
--     exist. It is unreachable by every product path (RLS filters it to an
--     `auth.uid()` nobody holds), so it cannot be restored to anyone, and it is
--     exactly what erasure is supposed to have deleted. The task brief's
--     "identify whether they are genuine production data, test data, or
--     historical artifacts" resolves the same way in all three cases: a
--     deleted account's memory must not outlive the account.
--
--   null_user_id — no owner at all. Unattributable by construction: it can
--     never match `auth.uid() = user_id`, so no user can ever read, correct or
--     delete it. Section 4 also sets NOT NULL, which these rows would block.
--
-- Every deleted row is logged in section 1's ledger first, in the same
-- transaction, so the ledger and the deletion cannot disagree.
--
-- The count is expected to be 0 or very small (production held 18 rows at the
-- last verification, and one known orphan was already removed by hand). If it
-- is large, that is a finding in its own right — the NOTICE says so out loud.
-- ============================================================================
DO $cleanup$
DECLARE
  v_orphans bigint := 0;
  v_nulls   bigint := 0;
  v_total   bigint;
BEGIN
  SELECT count(*) INTO v_total FROM public.user_memory;

  -- ONE statement, deliberately. The DELETE and the ledger INSERT that records
  -- it are the same statement on the same snapshot, so there is no window in
  -- which a row can be deleted without being logged, or logged without being
  -- deleted. (Data-modifying CTEs are executed exactly once and to completion.)
  --
  -- `m.user_id::uuid` is written unconditionally and works for BOTH shapes: a
  -- no-op cast when the column is already uuid, and a safe one when it is text
  -- because section 0.2 has already proved every non-NULL value is UUID-shaped.
  -- That is why this needs no dynamic SQL.
  WITH removed AS (
    DELETE FROM public.user_memory m
     WHERE m.user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id::uuid)
    RETURNING m.id, m.user_id::text AS uid, m.updated_at
  ), logged AS (
    INSERT INTO public.user_memory_fk_cleanup_log
           (memory_row_id, orphan_user_id, memory_updated_at, reason)
    SELECT r.id, r.uid, r.updated_at,
           CASE WHEN r.uid IS NULL THEN 'null_user_id' ELSE 'orphan_no_auth_user' END
      FROM removed r
    RETURNING reason
  )
  SELECT count(*) FILTER (WHERE reason = 'orphan_no_auth_user'),
         count(*) FILTER (WHERE reason = 'null_user_id')
    INTO v_orphans, v_nulls
    FROM logged;

  IF v_orphans + v_nulls = 0 THEN
    RAISE NOTICE 'user_memory FK migration: cleanup removed 0 of % row(s) — every row already references a live auth user.', v_total;
  ELSE
    RAISE WARNING 'user_memory FK migration: removed % orphan and % null-owner row(s) of % total. Fingerprints are in public.user_memory_fk_cleanup_log.',
      v_orphans, v_nulls, v_total;
  END IF;
END
$cleanup$;


-- ============================================================================
-- 4. The type change — policy out, column converted, policy back in section 5.
--
-- `ALTER COLUMN ... TYPE uuid` rebuilds the table's indexes and re-checks its
-- constraints automatically, so the PRIMARY KEY and the UNIQUE on `user_id`
-- survive untouched (measured). The UNIQUE matters operationally: it is what
-- `memoryService.updateMemory`'s `upsert(..., { onConflict: 'user_id' })`
-- resolves against. Losing it would break every memory write in the product,
-- so section 6 asserts it is still there rather than trusting this note.
--
-- Guarded by the current type so re-running, or running against a database
-- provisioned correctly from `supabase-schema.sql`, does nothing at all.
-- ============================================================================
DO $convert$
DECLARE
  v_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.user_memory'::regclass AND a.attname = 'user_id';

  IF v_type = 'uuid' THEN
    RAISE NOTICE 'user_memory FK migration: user_id is already uuid — no type change.';
  ELSE
    -- Must precede the ALTER: PostgreSQL refuses to alter a column a policy
    -- references. Section 0.3 has already established this is the only policy.
    DROP POLICY IF EXISTS "Users can manage own memory" ON public.user_memory;

    ALTER TABLE public.user_memory
      ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

    RAISE NOTICE 'user_memory FK migration: user_id converted % -> uuid.', v_type;
  END IF;
END
$convert$;

-- Ownership is not optional. Section 3 removed the rows that would block this,
-- and every writer pins `user_id` from a verified session, so nothing in the
-- product can produce a NULL here. Making it NOT NULL closes the one remaining
-- way to create a row that no user can ever reach — matching the column as
-- `supabase-schema.sql` has always declared it.
ALTER TABLE public.user_memory ALTER COLUMN user_id SET NOT NULL;


-- ============================================================================
-- 5. Re-establish the access model, then add the foreign key.
--
-- The policy is recreated with the SAME MEANING it had before: owner-only, all
-- verbs, read and write. `auth.uid() = user_id` is now a plain `uuid = uuid`
-- comparison rather than `(auth.uid())::text = user_id`, which is the identical
-- predicate for every value that is a valid UUID — and after sections 0.2 and 3
-- every surviving value is one.
--
-- `CREATE POLICY` has no `IF NOT EXISTS`, so the DROP is what makes this
-- idempotent. The pair is deliberately adjacent: on the already-uuid path
-- section 4 does not drop, so without this the policy would be recreated
-- identically — harmless — and with it the file converges on one known shape
-- from either starting point.
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage own memory" ON public.user_memory;
CREATE POLICY "Users can manage own memory" ON public.user_memory
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;

-- The point of the whole file.
--
-- ON DELETE CASCADE, not SET NULL and not RESTRICT:
--   * `user_memory` is private memory OWNED BY the user. It has no meaning
--     without them and no other referent, so SET NULL would manufacture exactly
--     the unattributable row section 3 had to clean up.
--   * RESTRICT would make deleting an Auth user FAIL, which turns a support
--     request into an incident and would be discovered at the worst moment.
--   * CASCADE matches every sibling table (`user_events`, `user_integrations`,
--     `notification_subscriptions`, `profiles`) and matches the erasure policy,
--     under which `user_memory` is deleted outright
--     (docs/backoffice/33_Privacy_Data_Governance.md:86).
--
-- Referencing `auth.users` rather than `public.profiles` is deliberate:
-- anonymous identities exist in `auth.users` with NO `profiles` row
-- (20260808c_handle_new_user_skip_anonymous.sql), so a `profiles` FK would be a
-- different and wrong constraint.
DO $fk$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.user_memory'::regclass
       AND contype  = 'f'
       AND conkey   = ARRAY[(SELECT attnum FROM pg_attribute
                              WHERE attrelid = 'public.user_memory'::regclass
                                AND attname = 'user_id')]::int2[]
  ) THEN
    RAISE NOTICE 'user_memory FK migration: a foreign key on user_id already exists — left as is.';
  ELSE
    ALTER TABLE public.user_memory
      ADD CONSTRAINT user_memory_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'user_memory FK migration: user_memory_user_id_fkey added (ON DELETE CASCADE).';
  END IF;
END
$fk$;

-- A cascading delete on the parent scans the child by `user_id`, and
-- `memoryService.updateMemory` upserts with `onConflict: 'user_id'`, which needs
-- a single-column UNIQUE on it or every memory write in the product fails with
-- 42P10. Both are already satisfied — `supabase-schema.sql` declares the column
-- UNIQUE and `add_memory_columns.sql` adds `user_memory_user_id_idx` besides —
-- and `ALTER COLUMN TYPE` rebuilds indexes rather than dropping them (measured).
--
-- So this is a backstop for a database that somehow has neither, and it is
-- CONDITIONAL ON THE PROPERTY rather than on an index NAME. `CREATE UNIQUE INDEX
-- IF NOT EXISTS user_memory_user_id_key` would look equivalent and is not: the
-- existing index is only called that if it came from an inline `UNIQUE`, so
-- against a database whose constraint is named anything else the name check
-- would miss and quietly add a SECOND, redundant unique index to production.
DO $unique$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indrelid = 'public.user_memory'::regclass
       AND i.indisunique AND i.indnatts = 1
       AND i.indkey[0] = (SELECT attnum FROM pg_attribute
                           WHERE attrelid = 'public.user_memory'::regclass AND attname = 'user_id')
  ) THEN
    CREATE UNIQUE INDEX user_memory_user_id_key ON public.user_memory (user_id);
    RAISE NOTICE 'user_memory FK migration: added the missing UNIQUE index on user_id.';
  END IF;
END
$unique$;


-- ============================================================================
-- 6. Post-conditions — assert, do not hope.
--
-- This runs inside the migration's own transaction, so a failed assertion rolls
-- the whole file back rather than leaving the table half-converted. Everything
-- here is the invariant the product depends on, not a restatement of the DDL.
-- ============================================================================
DO $assert$
DECLARE
  v_type    text;
  v_fk      text;
  v_action  "char";
  v_uniques int;
  v_orphans bigint;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.user_memory'::regclass AND a.attname = 'user_id';
  IF v_type <> 'uuid' THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: user_id is % , expected uuid.', v_type;
  END IF;

  SELECT c.conname, c.confdeltype INTO v_fk, v_action
    FROM pg_constraint c
   WHERE c.conrelid = 'public.user_memory'::regclass
     AND c.contype = 'f'
     AND c.confrelid = 'auth.users'::regclass;
  IF v_fk IS NULL THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: no foreign key from user_memory.user_id to auth.users.';
  END IF;
  IF v_action <> 'c' THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: foreign key % has ON DELETE % , expected CASCADE.', v_fk, v_action;
  END IF;

  -- The upsert's conflict target. Without it every memory write in the product
  -- fails with "there is no unique or exclusion constraint matching".
  SELECT count(*) INTO v_uniques
    FROM pg_index i
   WHERE i.indrelid = 'public.user_memory'::regclass
     AND i.indisunique
     AND i.indnatts = 1
     AND i.indkey[0] = (SELECT attnum FROM pg_attribute
                         WHERE attrelid = 'public.user_memory'::regclass AND attname = 'user_id');
  IF v_uniques = 0 THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: user_id lost its UNIQUE index — memoryService.updateMemory upserts on it.';
  END IF;

  SELECT count(*) INTO v_orphans
    FROM public.user_memory m
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id);
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: % orphan row(s) survive.', v_orphans;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='user_memory'
       AND policyname='Users can manage own memory'
  ) THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: the owner-only RLS policy was not restored.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_memory'::regclass) THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: row level security is not enabled on user_memory.';
  END IF;

  RAISE NOTICE 'user_memory FK migration: all post-conditions hold.';
END
$assert$;


-- ============================================================================
-- VERIFY (read-only)
--
--   -- 0. PREFLIGHT, run BEFORE applying — and the query section 0.2's error
--   --    message points at. Only meaningful while user_id is still `text`.
--   --    Returns a TRUNCATED fingerprint, never the value, so diagnosing this
--   --    does not put identifiers in a terminal or a ticket.
--   SELECT id,
--          left(user_id, 8) || '...' AS fingerprint,
--          length(user_id)           AS len,
--          updated_at
--     FROM public.user_memory
--    WHERE user_id IS NOT NULL
--      AND user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--   -- Expect: no rows. Any row here BLOCKS the migration by design — it is a
--   -- writer this audit did not find, and it needs a human decision, not a cast.
--
--   -- 0b. What the migration will clean, counted before it runs.
--   SELECT count(*) FILTER (WHERE user_id IS NULL)                          AS null_owner,
--          count(*) FILTER (WHERE user_id IS NOT NULL
--                             AND NOT EXISTS (SELECT 1 FROM auth.users u
--                                              WHERE u.id = user_id::uuid))  AS orphans,
--          count(*)                                                          AS total
--     FROM public.user_memory;
--
--   -- 1. The column is uuid and NOT NULL.
--   SELECT data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='user_memory' AND column_name='user_id';
--   -- Expect: uuid, NO.
--
--   -- 2. The foreign key exists, points at auth.users, and cascades.
--   SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
--     FROM pg_constraint c
--    WHERE c.conrelid='public.user_memory'::regclass AND c.contype='f';
--   -- Expect: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--
--   -- 3. No orphans remain.
--   SELECT count(*) AS orphans FROM public.user_memory m
--    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id);
--   -- Expect: 0.
--
--   -- 4. What the cleanup removed, if anything (fingerprints only).
--   SELECT reason, count(*) FROM public.user_memory_fk_cleanup_log GROUP BY reason;
--   -- Expect: no rows, if production had already been cleaned by hand.
--
--   -- 5. Row count is unchanged apart from (4).
--   SELECT count(*) AS surviving_rows FROM public.user_memory;
--   -- Expect: pre-migration count minus the sum of (4).
--
--   -- 6. Authorization is unchanged in meaning: owner-only, all verbs.
--   SELECT policyname, cmd, roles::text, qual, with_check
--     FROM pg_policies WHERE schemaname='public' AND tablename='user_memory';
--   -- Expect: one row — "Users can manage own memory", ALL,
--   --         qual and with_check both (auth.uid() = user_id).
--
--   -- 7. The upsert conflict target survived the type change.
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE schemaname='public' AND tablename='user_memory';
--   -- Expect: at least one UNIQUE index on (user_id).
--
--   -- 8. The cleanup ledger is not readable by client roles.
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND table_name='user_memory_fk_cleanup_log'
--    ORDER BY grantee;
--   -- Expect: service_role SELECT only; no anon, no authenticated.
-- ============================================================================
