-- Scam Shield weekly knowledge sync (owner 18/11/2026): one row per OFFICIAL page as the weekly job read it. FILE ONLY: this migration has NOT been applied anywhere
-- and must not be applied without the owner. Until it is applied the reader fails open to the static dataset (src/lib/scam-shield/knowledge/bocongan2026.ts).
--
--  * body is the official text, verbatim (title in `title`, paragraphs joined by blank lines). The model never rewrites it. `structured` is optional and only ever
--    sits BESIDE it (policy reasons, lead, author and, when SCAM_SHIELD_SYNC_AI=true, a machine-made reading under structured.ai).
--  * status: 'pending' (waits for a person), 'approved' (what the checker and the page may show), 'rejected'. The job approves by itself only when the host is on the
--    official allow-list, the page is https, its date is newer than the last approved one and the extraction is complete (src/lib/scam-shield/sync/policy.ts);
--    the CHECK constraints below repeat the host and scheme rule so a manual insert cannot approve a foreign page either.
--  * content_hash is UNIQUE: a page whose text did not change is not stored again (the job re-verifies it instead).
--  * Service-role only: RLS on, no policy, every grant to PUBLIC / anon / authenticated revoked.
-- Rollback: rollback/20261201_scam_knowledge_versions_rollback.sql.

CREATE TABLE IF NOT EXISTS public.scam_knowledge_versions (
  version      bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_url   text        NOT NULL,
  host         text        NOT NULL,
  title        text        NOT NULL,
  published_at date        NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  verified_at  timestamptz NULL,
  content_hash text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending',
  body         text        NOT NULL,
  structured   jsonb       NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scam_knowledge_versions_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT scam_knowledge_versions_hash_check   CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT scam_knowledge_versions_url_check    CHECK (source_url ~ '^https://' AND char_length(source_url) <= 2000),
  CONSTRAINT scam_knowledge_versions_host_check   CHECK (host = lower(host) AND char_length(host) BETWEEN 3 AND 253),
  CONSTRAINT scam_knowledge_versions_title_check  CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  CONSTRAINT scam_knowledge_versions_body_check   CHECK (char_length(body) <= 200000),
  -- an APPROVED row must be on one of the official hosts (the same list as OFFICIAL_SOURCE_HOSTS in the code)
  CONSTRAINT scam_knowledge_versions_approved_host_check CHECK (
    status <> 'approved' OR host ~ '(^|\.)(bocongan\.gov\.vn|mps\.gov\.vn|ncsc\.gov\.vn|khonggianmang\.vn|tinnhiemmang\.vn|chinhphu\.vn)$'
  ),
  CONSTRAINT scam_knowledge_versions_hash_uniq UNIQUE (content_hash)
);

CREATE INDEX IF NOT EXISTS scam_knowledge_versions_approved_idx ON public.scam_knowledge_versions (published_at DESC NULLS LAST) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS scam_knowledge_versions_url_idx ON public.scam_knowledge_versions (source_url);

ALTER TABLE public.scam_knowledge_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scam_knowledge_versions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.scam_knowledge_versions TO service_role;
