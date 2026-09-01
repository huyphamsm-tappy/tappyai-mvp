-- ============================================================================
-- V2.2-2 Marketing Phase 2 -- GOVERNANCE FOUNDATION
--
-- CONTRACT: docs/controller-v2/V2.2_MARKETING_PHASE2_CONTRACT.md
--   M-1    consent per (user, channel); ABSENCE MEANS OPTED OUT
--   M-3    channels: push / email / in_app  (Phase 2 sends push only)
--   M-5    category is structural, never author-declared
--   M-6c   the delivery record IS the frequency cap's history
--   M-10   global unsubscribe overrides every per-channel consent
--   M-14   exactly three tables, no more
--   M-15   rollback file; REVOKE from PUBLIC/anon/authenticated; RLS explicit
--   M-16   lifecycle draft -> active -> completed, `completed` terminal
--   M-27a  pruning must never orphan a delivery
--   M-34   per-recipient idempotency keyed (campaign, recipient)
--
-- NOTE ON CHARACTER SET: this file is deliberately pure ASCII. The migration
-- boundary suite runs it through an embedded PostgreSQL whose cluster encoding
-- follows the host locale (WIN1252 on this machine), and a character with no
-- WIN1252 equivalent makes the whole migration unsendable. Every other
-- db-tested migration in this repository keeps to the same rule.
--
-- !! THIS MIGRATION GRANTS NOBODY ANYTHING NEW AND SENDS NOTHING. It creates
--    three empty tables. Marketing activation remains blocked by M-30
--    (consent export UNSATISFIED) and Q6 (ownership OPEN); that gate lives in
--    the activation route, not here, and this file must not be read as
--    authorising a send.
--
-- !! THERE IS NO BACKFILL, AND THERE MUST NEVER BE ONE.
--    Owner decision 2026-09-01: marketing consent is OPT-IN and every existing
--    user defaults to OPTED OUT. A single `INSERT ... SELECT id FROM auth.users`
--    here would invert that legal posture while looking like a sensible
--    default. Grep this file: it contains no INSERT and no UPDATE.
--
-- IDEMPOTENT: safe to run repeatedly.
-- ROLLBACK:   supabase/migrations/rollback/20260901_marketing_governance_foundation_rollback.sql
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. marketing_consent -- M-1, M-3, M-10
--
--    ABSENCE = OPTED OUT. That is the whole design, and it is why no row is
--    seeded anywhere: a user who has never acted has no row, and the reader
--    treats "no row" as "no".
--
--    `opted_in` still exists as a column because a REVOCATION must leave
--    evidence (M-24). Deleting the row on opt-out would satisfy M-1's letter
--    and destroy the proof that the person ever asked to be removed -- an
--    unsubscribe that cannot be evidenced later is indistinguishable from one
--    that was ignored. So opting out UPDATEs the row to `opted_in = false` and
--    stamps `opted_out_at`; it never deletes.
--
--    HONEST LIMIT, stated rather than implied: this is CURRENT STATE plus two
--    timestamps, not a full event history. A user who opts in, out, and in
--    again leaves one row whose `opted_out_at` records the middle event only.
--    A per-event log would be a FOURTH table, and M-14 names three. If full
--    consent history is later required, that is its own Owner decision.
--
--    THE `global` CHANNEL IS NOT A CHANNEL. `channel = 'global'` with
--    `opted_in = false` is the global unsubscribe of M-10 -- one row that
--    overrides every per-channel row for that user. It shares this table
--    rather than taking a fourth because it is the same fact about the same
--    person: what they have agreed to receive.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_consent (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('push', 'email', 'in_app', 'global')),
  opted_in      BOOLEAN NOT NULL,
  opted_in_at   TIMESTAMPTZ,
  opted_out_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, channel)
);

COMMENT ON TABLE public.marketing_consent IS
  'Marketing consent per (user, channel). ABSENCE OF A ROW MEANS OPTED OUT (contract M-1). '
  'channel=''global'' with opted_in=false is the global unsubscribe of M-10 and overrides every '
  'per-channel row. Rows are never deleted on opt-out so a revocation stays evidenced (M-24).';

-- The consent read happens once per recipient per dispatch, keyed by user.
CREATE INDEX IF NOT EXISTS idx_marketing_consent_user
  ON public.marketing_consent (user_id);


-- ---------------------------------------------------------------------------
-- 2. marketing_campaigns -- M-14, M-16, M-5
--
--    `category` is CHECKed to the single value 'marketing' rather than left
--    free text. M-5 says classification is structural, not authorial: an
--    author who could store 'system' here would be exempt from every cap,
--    quiet-hours rule and consent check in the contract, because those rules
--    key on the category. A CHECK constraint makes that unrepresentable at the
--    storage layer, so it cannot be reintroduced by a route that forgets.
--
--    `status` is CHECKed to the three lifecycle values. The TERMINALITY of
--    `completed` (M-16) is a transition rule, not a value rule, so it is
--    enforced in the route -- a CHECK cannot see the previous row.
--
--    `link` is constrained to a relative same-site path for the same reason
--    the Phase C route constrains it: a campaign reaches many people at once,
--    so an absolute URL here is a redirect to anywhere aimed at all of them.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  body             TEXT NOT NULL CHECK (char_length(btrim(body))  BETWEEN 1 AND 500),
  link             TEXT CHECK (link IS NULL OR (link LIKE '/%' AND link NOT LIKE '//%')),
  category         TEXT NOT NULL DEFAULT 'marketing' CHECK (category = 'marketing'),
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  audience_filter  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by       UUID NOT NULL,
  activated_by     UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at     TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ
);

COMMENT ON TABLE public.marketing_campaigns IS
  'One row per marketing campaign. category is CHECKed to ''marketing'' so a campaign author '
  'cannot declare itself transactional and escape governance (contract M-5). Lifecycle '
  'draft -> active -> completed; terminality of completed is enforced in the route (M-16).';

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status
  ON public.marketing_campaigns (status, created_at DESC);


-- ---------------------------------------------------------------------------
-- 3. notification_deliveries -- M-6c, M-14, M-34, M-27a
--
--    NAMED BY doc 34 (`34_Data_Retention_Policy.md`: 1 year, Prune, "Campaign
--    analysis window"), which has been describing this table since before it
--    existed. This creates it under that name deliberately rather than
--    inventing a parallel one.
--
--    >> THIS TABLE IS THE FREQUENCY CAP (M-6c). The rolling 24h/7d windows are
--    computed from `status = 'sent'` rows here. A delivery that is not recorded
--    is invisible to the cap, so writing the row is PART of the cap rather
--    than bookkeeping about it -- which is why the partial index below exists
--    and why the unique key is (campaign_id, user_id).
--
--    >> AND IT IS THE IDEMPOTENCY LEDGER (M-34). UNIQUE (campaign_id, user_id)
--    means a resumed campaign cannot notify the same person twice: the second
--    insert conflicts. Per-RECIPIENT, not per-campaign -- a dispatch that
--    succeeds and then dies before recording anything is survivable only if
--    the key names the recipient (M-35).
--
--    SKIPPED ROWS ARE NOT SENDS. A row with status='skipped' records that the
--    campaign considered this person and governance refused; it does NOT count
--    toward the cap, which is why the cap index is partial on status='sent'.
--    Getting that backwards would let a quiet-hours skip silence someone for
--    the next 24 hours.
--
--    FK TO CAMPAIGNS IS `ON DELETE RESTRICT` -- M-27a. Deliveries and campaigns
--    are pruned at the same age (1 year), and a delivery whose campaign is gone
--    is an orphan the cap can still read but nobody can explain. RESTRICT makes
--    the prune order mandatory instead of hopeful: deliveries first, campaigns
--    second, or the delete fails loudly.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE RESTRICT,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel          TEXT NOT NULL DEFAULT 'push' CHECK (channel IN ('push', 'email', 'in_app')),
  category         TEXT NOT NULL DEFAULT 'marketing' CHECK (category = 'marketing'),
  status           TEXT NOT NULL CHECK (status IN ('sent', 'skipped')),
  skip_reason      TEXT CHECK (
                     skip_reason IS NULL OR skip_reason IN (
                       'consent', 'unsubscribed', 'frequency_24h', 'frequency_7d',
                       'quiet_hours', 'ineligible'
                     )
                   ),
  notification_id  UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, user_id),
  -- A sent row has no reason; a skipped row must have one. Without this a
  -- skip could be recorded with a NULL reason and the campaign result would
  -- report a skip it could not explain.
  CONSTRAINT notification_deliveries_reason_matches_status CHECK (
    (status = 'sent'    AND skip_reason IS NULL) OR
    (status = 'skipped' AND skip_reason IS NOT NULL)
  )
);

COMMENT ON TABLE public.notification_deliveries IS
  'Per-recipient marketing delivery record. Named by 34_Data_Retention_Policy.md (1 year, prune). '
  'It is BOTH the rolling frequency cap''s history (contract M-6c, sent rows only) and the '
  'per-recipient idempotency ledger (M-34, UNIQUE (campaign_id, user_id)).';

-- THE CAP'S INDEX. Partial on status='sent' because only a real send counts
-- against 1/24h and 4/7d; DESC because every cap read asks for the most recent
-- window.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_cap
  ON public.notification_deliveries (user_id, created_at DESC)
  WHERE status = 'sent';

-- The campaign result read: all rows for one campaign, including skips.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_campaign
  ON public.notification_deliveries (campaign_id);


-- ---------------------------------------------------------------------------
-- 4. GRANTS AND RLS -- M-15, ADR-019
--
--    All three tables are born fully open on Supabase: `ALTER DEFAULT
--    PRIVILEGES` grants `anon` and `authenticated` explicitly, on top of
--    PostgreSQL's PUBLIC default. Without the REVOKEs below, the entire
--    consent set -- who agreed to marketing and who revoked -- is one anonymous
--    PostgREST GET away, and the delivery table would let any signed-in client
--    enumerate who was messaged and when.
--
--    >> CONSENT IS NOT CLIENT-WRITABLE, DELIBERATELY. There is no
--    `authenticated` policy letting a user write their own row. Consent is
--    changed through a server route that verifies the session and writes with
--    the service client, so the write path is one place that can be audited
--    and rate-limited. A self-scoped RLS policy would additionally mean a
--    client could set `opted_in = true` for itself with no server record of
--    who asked or when.
--
--    RLS ON WITH ZERO POLICIES. With RLS enabled, a missing policy is a
--    DENIAL; `service_role` reaches these tables by BYPASSRLS rather than by
--    policy. This is the same shape as `moderation_queue` (04 section 8).
--
--    NOTE ON `service_role` AND M-15: the contract requires `service_role` to
--    be named explicitly in every REVOKE "where applicable". It is applicable
--    to FUNCTIONS -- that is the #212 lesson, where a SECURITY DEFINER function
--    stayed callable by the service key because Supabase grants it explicitly.
--    THIS MIGRATION CREATES NO FUNCTIONS. For these tables `service_role` is
--    the intended writer (the server routes use it), so it is GRANTed, and
--    revoking it would break the only legitimate access path. Stated here so a
--    future reader does not read the absence of a service_role REVOKE as the
--    omission #212 caught.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.marketing_consent        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.marketing_campaigns      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.notification_deliveries  FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.marketing_consent         TO service_role;
GRANT ALL ON TABLE public.marketing_campaigns       TO service_role;
GRANT ALL ON TABLE public.notification_deliveries   TO service_role;

ALTER TABLE public.marketing_consent       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- VERIFICATION (run after apply; read-only)
--
--   SELECT grantee, table_name, privilege_type
--     FROM information_schema.role_table_grants
--    WHERE table_name IN ('marketing_consent','marketing_campaigns','notification_deliveries')
--    ORDER BY table_name, grantee;          -- service_role only
--
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('marketing_consent','marketing_campaigns','notification_deliveries');
--                                            -- all true
--
--   SELECT count(*) FROM pg_policies
--    WHERE tablename IN ('marketing_consent','marketing_campaigns','notification_deliveries');
--                                            -- 0
--
--   SELECT count(*) FROM public.marketing_consent;        -- 0  (NO BACKFILL)
--   SELECT count(*) FROM public.marketing_campaigns;      -- 0
--   SELECT count(*) FROM public.notification_deliveries;  -- 0
-- ============================================================================
