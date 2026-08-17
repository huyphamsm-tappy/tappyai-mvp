-- Content Safety Gate — minimum lifecycle state.
--
-- ⚠ NOT APPLIED TO PRODUCTION. Written, tested locally, and left for the Owner.
--
-- ============================================================================
-- BACKWARD COMPATIBILITY IS THE WHOLE DESIGN
-- ============================================================================
-- Every column is nullable with NO default. NULL means "this row predates the
-- safety gate", and every read path treats NULL exactly as it treats
-- 'PUBLISHED'. So applying this migration changes the visibility of nothing:
--
--   · no existing post is hidden
--   · no existing post is published that was not already
--   · no existing post is reclassified
--   · no backfill runs
--
-- New content is written with publication_state = 'UNDER_REVIEW' by the API,
-- not by a default — a default would silently decide the lifecycle of any row
-- inserted by code that has not been taught about the gate.

-- ---------------------------------------------------------------------------
-- reviews — lifecycle state
-- ---------------------------------------------------------------------------

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS publication_state TEXT
    CHECK (publication_state IN ('UNDER_REVIEW', 'PUBLISHED', 'RESTRICTED'));

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS safety_state TEXT
    CHECK (safety_state IN (
      'SAFE', 'VIOLATION', 'UNDETERMINED',
      'HUMAN_REVIEW_REQUIRED', 'LEGAL_REVIEW_REQUIRED', 'ENGINE_ERROR'
    ));

-- The content fingerprint the safety decision was made against. A decision whose
-- evaluated_version differs from the item's current fingerprint is stale and may
-- not authorise publication — this column is what makes that checkable in SQL as
-- well as in code.
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS evaluated_version TEXT;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.reviews.publication_state IS
  'Content safety lifecycle. NULL = predates the gate and is treated as PUBLISHED by every read path. Server-controlled; never accepted from a client.';
COMMENT ON COLUMN public.reviews.safety_state IS
  'The safety evaluation outcome behind publication_state. Metadata only — carries no content.';
COMMENT ON COLUMN public.reviews.evaluated_version IS
  'Content fingerprint the decision belongs to. If it differs from the current fingerprint the decision is stale.';

-- Read paths filter on this constantly; partial index keeps the common case cheap.
CREATE INDEX IF NOT EXISTS reviews_publication_state_idx
  ON public.reviews (publication_state)
  WHERE publication_state IS NOT NULL;

-- ---------------------------------------------------------------------------
-- content_reports — a user report as an evidence source
-- ---------------------------------------------------------------------------
--
-- 🚨 `reporter_source_id` is an OPAQUE, non-reversible identifier derived from
-- the reporter's user id. It exists so two reports can be told apart by source —
-- which is what stops one person's repeated reports from counting as
-- corroboration — and NOT so anyone can be identified. The raw user id is
-- deliberately absent from this table.

CREATE TABLE IF NOT EXISTS public.content_reports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id         UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  reporter_source_id TEXT NOT NULL,
  reason             TEXT NOT NULL,
  -- The `ts.*` policy the reason points at, or NULL for a reason that names none.
  -- A pointer for evaluation, never a classification.
  policy_id          TEXT,
  verification_state TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_state IN ('UNVERIFIED', 'VERIFIED', 'REJECTED')),
  status             TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'closed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One report per source per content per reason. A second submission updates
  -- nothing and inflates nothing: duplicate submissions must not manufacture
  -- corroboration.
  UNIQUE (content_id, reporter_source_id, reason)
);

COMMENT ON TABLE public.content_reports IS
  'User reports as evidence sources. A report is evidence that someone complained, never evidence that they were right.';
COMMENT ON COLUMN public.content_reports.reporter_source_id IS
  'Opaque non-reversible source identifier. Distinguishes reporters; identifies none. The raw user id is intentionally not stored.';
COMMENT ON COLUMN public.content_reports.verification_state IS
  'UNVERIFIED until a reviewer with authority says otherwise. Only VERIFIED contributes an evidence basis.';

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- A signed-in user may file a report. There is deliberately NO select, update or
-- delete policy: reports are readable only through the service role. A reporter
-- cannot read back even their own report, because a report set is a map of who
-- reported whom.
DROP POLICY IF EXISTS "Users can file a content report" ON public.content_reports;
CREATE POLICY "Users can file a content report"
  ON public.content_reports FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS content_reports_content_idx ON public.content_reports (content_id);
CREATE INDEX IF NOT EXISTS content_reports_policy_idx ON public.content_reports (policy_id)
  WHERE policy_id IS NOT NULL;
