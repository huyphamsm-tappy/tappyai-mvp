-- Rollback for 20260925c_account_deletion_f096.sql. Restores SET NULL on the two owner columns and
-- removes the deletion queue. Pending jobs are lost with the table — run the worker first.
DROP TRIGGER IF EXISTS trg_enqueue_account_deletion ON auth.users;
DROP FUNCTION IF EXISTS public.fn_enqueue_account_deletion();
DROP TABLE IF EXISTS public.account_deletion_jobs;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass AND c.confdeltype = 'c'
       AND ((c.conrelid = 'public.shared_results'::regclass AND a.attname = 'owner_id')
         OR (c.conrelid = 'public.notifications'::regclass  AND a.attname = 'actor_id'))
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
                   r.tbl, r.conname, r.col);
  END LOOP;
END $$;
