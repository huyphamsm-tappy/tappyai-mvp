-- ============================================================================
-- ROLLBACK for 20260807_audit_chain.sql — Controller V2 Component 7
--
-- NOT applied automatically. Kept beside the migration so the rollback is a
-- rehearsed file rather than something improvised during an incident.
--
-- Step 1 alone restores pre-Component-7 insert behaviour. The application never
-- knew the trigger existed — `writeAuditLog` was untouched — so there is no
-- application rollback to coordinate.
--
-- Steps 2 and 3 are OPTIONAL and destructive of evidence. The columns are
-- additive and nullable-safe for every reader (`/api/admin/audit` selects an
-- explicit list that excludes them), so leaving them in place costs nothing and
-- preserves the chain built so far. Drop them only if the design is being
-- abandoned, not to "clean up" after a transient incident.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Stop chaining. Inserts immediately behave as they did before Component 7.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS zzz_audit_log_chain ON audit_log;
-- Pre-rename name, for a database migrated before the ordering fix.
DROP TRIGGER IF EXISTS trg_audit_log_chain ON audit_log;

-- ---------------------------------------------------------------------------
-- 2. OPTIONAL — remove the functions.
--     Note: dropping fn_audit_row_hash makes the existing hashes unverifiable,
--     so the chain becomes dead weight rather than evidence.
-- ---------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS fn_verify_audit_chain(BIGINT, BIGINT);
-- DROP FUNCTION IF EXISTS fn_audit_log_chain();
-- DROP FUNCTION IF EXISTS fn_audit_row_hash(BYTEA, BIGINT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, INET, TEXT, TIMESTAMPTZ);
-- DROP FUNCTION IF EXISTS fn_audit_ts(TIMESTAMPTZ);
-- DROP FUNCTION IF EXISTS fn_audit_part(TEXT);

-- ---------------------------------------------------------------------------
-- 3. OPTIONAL — remove the columns. DESTROYS the chain irreversibly.
--     The NOT NULL constraints must go first, or step 1's effect leaves new
--     rows unable to satisfy them.
-- ---------------------------------------------------------------------------
-- ALTER TABLE audit_log ALTER COLUMN seq      DROP NOT NULL;
-- ALTER TABLE audit_log ALTER COLUMN row_hash DROP NOT NULL;
-- ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_seq_key;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS row_hash;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS prev_hash;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS seq;
-- DROP SEQUENCE IF EXISTS audit_log_seq;

-- ---------------------------------------------------------------------------
-- IMPORTANT: if step 1 is applied alone and inserts continue, later rows will
-- carry NULL row_hash and violate the NOT NULL constraint. Either apply step 3's
-- two DROP NOT NULL lines alongside step 1, or re-create the trigger promptly.
-- ---------------------------------------------------------------------------
ALTER TABLE audit_log ALTER COLUMN seq      DROP NOT NULL;
ALTER TABLE audit_log ALTER COLUMN row_hash DROP NOT NULL;
