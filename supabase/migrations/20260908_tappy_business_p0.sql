-- ============================================================================
-- Tappy Business — P0 Foundations
--
-- Contract: docs/tappy-business/PHASE_0_ARCHITECTURE.md (FROZEN)
--
-- Creates the nine commerce tables Tappy Business owns. No API, no UI, no
-- business logic — this migration is primitives only.
--
-- ── WHY THE GRANTS ARE THE ENFORCEMENT ──────────────────────────────────────
--
-- Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
-- TO anon, authenticated, service_role`. A new table is therefore born
-- world-readable AND world-writable through PostgREST, and saying nothing about
-- grants leaves it that way. ADR-019 records the production incident this
-- caused. Every table below is explicitly closed and then re-opened to
-- `service_role` alone, because every Business access path is an API route
-- holding the service-role key (`createAdminClient()`), never a browser.
--
-- RLS is enabled with NO policies as defence in depth: if a future GRANT is
-- added carelessly, the table still denies every anon/authenticated row read
-- instead of silently opening. This mirrors 20260813_c8_event_outbox.sql §2.
--
-- Merchant isolation in MVP is therefore enforced in the application layer by
-- `src/lib/business/authz.ts`, proved by the IDOR suite — not by RLS policies,
-- because no client ever holds a connection to these tables. Adding
-- `authenticated` policies is a deliberate later step if a direct-read path is
-- ever introduced; it is not needed now and unused grants are attack surface.
--
-- ── THE GRANT SET ENCODES THE DOMAIN INVARIANTS ─────────────────────────────
--
-- Where the architecture says a row is immutable or undeletable, the grant says
-- so too. `service_role` holds no UPDATE on append-only tables and no DELETE on
-- tombstoned ones, so an application bug cannot rewrite history — it gets a
-- permission error instead of silently succeeding.
--
--   business_order_status_history   SELECT, INSERT          append-only (§20)
--   business_merchant_terms_...     SELECT, INSERT          append-only (§8)
--   business_order_items            SELECT, INSERT          snapshot (§15, §16)
--   business_products               SELECT, INSERT, UPDATE  tombstone, no hard delete (§9)
--   business_orders                 SELECT, INSERT, UPDATE  retention nulls PII; rows never deleted
--
-- ── MONEY ───────────────────────────────────────────────────────────────────
--
-- Amounts are integers in the currency's minor unit. VND has exponent 0, so
-- `price_amount = 45000` means 45,000 VND — NOT 450.00 and NOT 4,500,000. Any
-- future migration to another commerce engine must transform explicitly; see
-- PHASE_0_ARCHITECTURE.md §9. Enforced in code by src/lib/business/money.ts.
--
-- ── PII ─────────────────────────────────────────────────────────────────────
--
-- `business_orders.customer_phone` has NO INDEX, deliberately. §16 forbids any
-- mechanism that enumerates orders by phone; without an index there is no
-- efficient lookup even if a query is written by mistake. Rate limiting uses a
-- keyed HMAC in Redis, never a query against this column.
--
-- Idempotent DDL — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Shared trigger function
--
-- SECURITY INVOKER (the default). A trigger function cannot be called directly
-- — PostgreSQL raises "trigger functions can only be called as triggers"
-- regardless of privilege — so it needs no REVOKE, and ADR-019's G1 exempts it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 1. business_merchants
--
-- One Tappy identity owns at most one merchant in MVP. `controller_user_id`
-- references Controller identity and is the ONLY authorization anchor: it is
-- what src/lib/business/authz.ts resolves against. Business stores no other
-- profile field that Controller already owns.
--
-- `legal_name` and `tax_or_identity_number` exist and are nullable, but are NOT
-- collected in MVP: this codebase has no encryption capability (PHASE_0 §F3),
-- and collecting an identity number without one would be the wrong order of
-- operations. The columns are here so that enabling collection later never
-- requires re-contacting every merchant.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_merchants (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id                TEXT NOT NULL UNIQUE
                             CHECK (public_id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
    controller_user_id       UUID NOT NULL UNIQUE,

    legal_name               TEXT,
    tax_or_identity_number   TEXT,

    business_category        TEXT NOT NULL CHECK (business_category IN (
                               'FOOD_BEVERAGE','RESTAURANT','CAFE','FASHION',
                               'COSMETICS','GROCERY','ELECTRONICS','HOME_LIVING',
                               'HEALTH','SERVICES','OTHER')),
    shop_name                TEXT NOT NULL CHECK (length(btrim(shop_name)) > 0),
    address                  TEXT NOT NULL CHECK (length(btrim(address)) > 0),
    phone                    TEXT NOT NULL CHECK (length(btrim(phone)) > 0),

    status                   TEXT NOT NULL DEFAULT 'ACTIVE'
                             CHECK (status IN ('ACTIVE','SUSPENDED')),
    suspended_at             TIMESTAMPTZ,
    suspended_reason         TEXT,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A suspended merchant must carry the timestamp that suspended it, so the
    -- moderation trail cannot be half-written.
    CONSTRAINT business_merchants_suspension_consistent
      CHECK ((status = 'SUSPENDED') = (suspended_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS business_merchants_status_idx
    ON business_merchants (status);

DROP TRIGGER IF EXISTS trg_business_merchants_updated_at ON business_merchants;
CREATE TRIGGER trg_business_merchants_updated_at
  BEFORE UPDATE ON business_merchants
  FOR EACH ROW EXECUTE FUNCTION business_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. business_merchant_terms_acceptances
--
-- Append-only. Not a contract-management system (§8): three facts, one row per
-- version accepted. Keeping history rather than overwriting a column on the
-- merchant is what makes "which terms did this merchant agree to in March"
-- answerable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_merchant_terms_acceptances (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id   UUID NOT NULL REFERENCES business_merchants(id) ON DELETE RESTRICT,
    terms_version TEXT NOT NULL CHECK (length(btrim(terms_version)) > 0),
    accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_ip   INET,
    UNIQUE (merchant_id, terms_version)
);

CREATE INDEX IF NOT EXISTS business_merchant_terms_merchant_idx
    ON business_merchant_terms_acceptances (merchant_id);

-- ---------------------------------------------------------------------------
-- 3. business_products
--
-- Never hard-deleted (§9): `status = 'DELETED'` plus `deleted_at`. Public URLs
-- shared to Facebook and Zalo outlive the product, and a 404 on a link a
-- merchant posted is a worse answer than "Sản phẩm ngừng bán".
--
-- Two independent flags, deliberately not merged:
--   status         lifecycle — ACTIVE / UNPUBLISHED (moderation) / DELETED
--   is_available   the merchant's own "còn hàng / hết hàng" switch
-- Merging them would make a moderation action indistinguishable from a
-- merchant marking something out of stock.
--
-- There is NO stock quantity column. §13 forbids an inventory engine, and a
-- quantity column is how one starts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_products (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id         TEXT NOT NULL UNIQUE
                      CHECK (public_id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
    merchant_id       UUID NOT NULL REFERENCES business_merchants(id) ON DELETE RESTRICT,

    name              TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    description       TEXT,
    image_asset_key   TEXT,

    price_amount      BIGINT NOT NULL CHECK (price_amount >= 0),
    currency          TEXT NOT NULL DEFAULT 'VND' CHECK (currency ~ '^[A-Z]{3}$'),

    is_available      BOOLEAN NOT NULL DEFAULT true,
    status            TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE','UNPUBLISHED','DELETED')),
    deleted_at        TIMESTAMPTZ,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT business_products_deletion_consistent
      CHECK ((status = 'DELETED') = (deleted_at IS NOT NULL)),

    -- Redundant on its own — `id` is already unique — and present solely so
    -- `business_order_items` can carry a composite foreign key into (id,
    -- merchant_id). PostgreSQL requires a unique constraint on exactly the
    -- referenced columns. This is what makes a cross-merchant order item
    -- unrepresentable rather than merely discouraged; see section 7.
    CONSTRAINT business_products_id_merchant_key UNIQUE (id, merchant_id)
);

-- The merchant dashboard's only listing query.
CREATE INDEX IF NOT EXISTS business_products_merchant_idx
    ON business_products (merchant_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_business_products_updated_at ON business_products;
CREATE TRIGGER trg_business_products_updated_at
  BEFORE UPDATE ON business_products
  FOR EACH ROW EXECUTE FUNCTION business_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4-5. Product options — structured attributes only (§12)
--
-- Predefined groups and values. There is deliberately NO price_delta and NO
-- per-variant stock: that is a variant matrix, which is LATER. Free text is
-- forbidden because "Màu: đỏ đậm nhé shop" cannot be mapped onto any commerce
-- engine's option model without a human reading it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_product_option_groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   UUID NOT NULL REFERENCES business_products(id) ON DELETE CASCADE,
    name         TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    position     INTEGER NOT NULL DEFAULT 0,
    is_required  BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, name)
);

CREATE INDEX IF NOT EXISTS business_product_option_groups_product_idx
    ON business_product_option_groups (product_id, position);

CREATE TABLE IF NOT EXISTS business_product_option_values (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    option_group_id UUID NOT NULL REFERENCES business_product_option_groups(id) ON DELETE CASCADE,
    value           TEXT NOT NULL CHECK (length(btrim(value)) > 0),
    position        INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (option_group_id, value)
);

CREATE INDEX IF NOT EXISTS business_product_option_values_group_idx
    ON business_product_option_values (option_group_id, position);

-- ---------------------------------------------------------------------------
-- 6. business_orders
--
-- TRACKING TOKEN. The raw token is NEVER stored here — only SHA-256 of it
-- (§21). The token is a bearer credential that lives in a URL the customer is
-- encouraged to share, so the database holds something that can verify it and
-- nothing that can mint it. `tracking_token_hash` is a separate identifier from
-- `public_id` on purpose: possessing one must not yield the other.
--
-- PII. `customer_*` columns are unindexed. See the header note.
--
-- `claimed_by_user_id` is write-once and stays NULL in MVP — the claim flow is
-- Phase 1.5. The column exists so that shipping it later is not a migration
-- over live order data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_orders (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id                TEXT NOT NULL UNIQUE
                             CHECK (public_id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
    merchant_id              UUID NOT NULL REFERENCES business_merchants(id) ON DELETE RESTRICT,

    tracking_token_hash      BYTEA NOT NULL UNIQUE
                             CHECK (octet_length(tracking_token_hash) = 32),

    status                   TEXT NOT NULL DEFAULT 'PENDING'
                             CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),

    customer_name            TEXT NOT NULL CHECK (length(btrim(customer_name)) > 0),
    customer_phone           TEXT NOT NULL CHECK (length(btrim(customer_phone)) > 0),
    customer_address         TEXT NOT NULL CHECK (length(btrim(customer_address)) > 0),
    customer_note            TEXT,

    total_amount             BIGINT NOT NULL CHECK (total_amount >= 0),
    total_items              INTEGER NOT NULL CHECK (total_items > 0),
    currency                 TEXT NOT NULL DEFAULT 'VND' CHECK (currency ~ '^[A-Z]{3}$'),

    source                   TEXT NOT NULL DEFAULT 'DIRECT'
                             CHECK (source IN ('DIRECT','QR','CLIP')),
    source_content_public_id TEXT,

    expires_at               TIMESTAMPTZ NOT NULL,

    claimed_by_user_id       UUID,
    claimed_at               TIMESTAMPTZ,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT business_orders_claim_consistent
      CHECK ((claimed_by_user_id IS NULL) = (claimed_at IS NULL)),

    -- Same purpose as its counterpart on business_products: the target of the
    -- composite foreign key that binds an order item to one merchant.
    CONSTRAINT business_orders_id_merchant_key UNIQUE (id, merchant_id)
);

-- The merchant dashboard's listing query.
CREATE INDEX IF NOT EXISTS business_orders_merchant_idx
    ON business_orders (merchant_id, status, created_at DESC);

-- The expiry job's only query: partial, so it stays small no matter how many
-- orders reach a terminal state.
CREATE INDEX IF NOT EXISTS business_orders_pending_expiry_idx
    ON business_orders (expires_at)
    WHERE status = 'PENDING';

-- ⚠️ There is intentionally NO index on customer_phone. Adding one re-enables
-- the enumeration §16 exists to prevent. See supabase/tests/tappy_business_p0_boundary.test.ts.

DROP TRIGGER IF EXISTS trg_business_orders_updated_at ON business_orders;
CREATE TRIGGER trg_business_orders_updated_at
  BEFORE UPDATE ON business_orders
  FOR EACH ROW EXECUTE FUNCTION business_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. business_order_items
--
-- Snapshot, not a join (§16). The product is referenced for lineage, but every
-- value a customer agreed to is copied at creation time. A merchant editing a
-- price next week must not change what last week's order says it cost — that is
-- the difference between an order history and a report that silently rewrites
-- itself.
--
-- `product_public_id` is stored alongside the FK because it is the migration
-- anchor (§40): it survives even if the FK is dropped during a cut-over.
--
-- 🔑 MERCHANT ISOLATION IS STRUCTURAL HERE, NOT CONVENTIONAL.
--
-- An order item points at both an order and a product, and those two could
-- belong to DIFFERENT merchants. With independent single-column foreign keys
-- nothing would prevent it: merchant A's order could hold merchant B's product,
-- which would put B's product name and price beside A's customer's real name,
-- phone and address, and would send the migration lineage in
-- `product_public_id` across a merchant boundary.
--
-- `merchant_id` is therefore carried on the row and BOTH foreign keys are
-- composite, so a row can only exist when the order and the product agree about
-- whose they are. The denormalisation is the point: one column is what lets the
-- database refuse the combination outright.
--
-- This deliberately does NOT depend on src/lib/business/authz.ts. Application
-- code is where the filter gets dropped in a refactor; a composite foreign key
-- is not.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_order_items (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                  UUID NOT NULL,
    product_id                UUID NOT NULL,
    merchant_id               UUID NOT NULL,

    product_public_id         TEXT NOT NULL
                              CHECK (product_public_id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
    product_name_snapshot     TEXT NOT NULL CHECK (length(btrim(product_name_snapshot)) > 0),
    unit_price_amount         BIGINT NOT NULL CHECK (unit_price_amount >= 0),
    currency                  TEXT NOT NULL DEFAULT 'VND' CHECK (currency ~ '^[A-Z]{3}$'),
    quantity                  INTEGER NOT NULL CHECK (quantity > 0),
    selected_options_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    line_total_amount         BIGINT NOT NULL CHECK (line_total_amount >= 0),

    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Integer arithmetic, checked by the database. If this ever fails, the
    -- application has done money in floating point somewhere.
    CONSTRAINT business_order_items_line_total_is_product
      CHECK (line_total_amount = unit_price_amount * quantity),

    -- The two composite keys. Each says "this item's merchant must be the same
    -- merchant the parent already belongs to", and together they say the order
    -- and the product must be the same merchant's.
    CONSTRAINT business_order_items_order_same_merchant
      FOREIGN KEY (order_id, merchant_id)
      REFERENCES business_orders (id, merchant_id) ON DELETE RESTRICT,

    CONSTRAINT business_order_items_product_same_merchant
      FOREIGN KEY (product_id, merchant_id)
      REFERENCES business_products (id, merchant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS business_order_items_order_idx
    ON business_order_items (order_id);

CREATE INDEX IF NOT EXISTS business_order_items_product_public_idx
    ON business_order_items (product_public_id);

-- ---------------------------------------------------------------------------
-- 8. business_order_status_history
--
-- Append-only (§20). The grant set below withholds UPDATE and DELETE, so this
-- is not a convention the application is trusted to honour.
--
-- 🔑 THE from_status CHECK IS THE STATE MACHINE.
--
-- The only legal transitions are ∅ → PENDING and PENDING → {ACCEPTED, REJECTED}
-- (§18). Every one of them departs from NULL or from PENDING, so a row whose
-- `from_status` is ACCEPTED or REJECTED describes a transition out of a terminal
-- state — the thing the architecture forbids. The constraint makes it
-- unrecordable, which is stronger than making it unreachable in code.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_order_status_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES business_orders(id) ON DELETE RESTRICT,

    from_status TEXT CHECK (from_status IN ('PENDING')),
    to_status   TEXT NOT NULL CHECK (to_status IN ('PENDING','ACCEPTED','REJECTED')),

    actor_type  TEXT NOT NULL CHECK (actor_type IN ('CUSTOMER','MERCHANT','SYSTEM','ADMIN')),
    actor_id    TEXT,
    reason      TEXT NOT NULL CHECK (length(btrim(reason)) > 0),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Order creation is the only transition with no predecessor, and it is the
    -- only one that may land on PENDING.
    CONSTRAINT business_order_status_history_shape
      CHECK ((from_status IS NULL) = (to_status = 'PENDING'))
);

CREATE INDEX IF NOT EXISTS business_order_status_history_order_idx
    ON business_order_status_history (order_id, created_at);

-- ---------------------------------------------------------------------------
-- 9. business_product_reports
--
-- Minimal moderation intake (§33): enough that abuse is handled through the
-- product rather than by editing the database by hand. The reporter's IP is
-- stored only as a hash — it is a rate-limiting and de-duplication key, not an
-- identity.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_product_reports (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id        UUID NOT NULL REFERENCES business_products(id) ON DELETE RESTRICT,
    reporter_ip_hash  BYTEA CHECK (reporter_ip_hash IS NULL OR octet_length(reporter_ip_hash) = 32),
    reason            TEXT NOT NULL CHECK (reason IN (
                        'COUNTERFEIT','ILLEGAL','SCAM','OFFENSIVE','WRONG_INFO','OTHER')),
    note              TEXT,
    status            TEXT NOT NULL DEFAULT 'OPEN'
                      CHECK (status IN ('OPEN','ACTIONED','DISMISSED')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_product_reports_product_idx
    ON business_product_reports (product_id);

CREATE INDEX IF NOT EXISTS business_product_reports_status_idx
    ON business_product_reports (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_business_product_reports_updated_at ON business_product_reports;
CREATE TRIGGER trg_business_product_reports_updated_at
  BEFORE UPDATE ON business_product_reports
  FOR EACH ROW EXECUTE FUNCTION business_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 10. RLS — defence in depth
--
-- Enabled with no policies on every table. The grants in section 11 are the
-- actual control; this is the second line that holds if a grant is ever added
-- carelessly.
-- ---------------------------------------------------------------------------
ALTER TABLE business_merchants                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_merchant_terms_acceptances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_products                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_product_option_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_product_option_values        ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_orders                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_order_items                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_order_status_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_product_reports              ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 11. Grants (ADR-019)
--
-- Close everything, including service_role, then re-open exactly what each
-- table's role in the architecture requires. `REVOKE ... FROM PUBLIC` alone
-- would close nothing: Supabase's default privileges name anon and
-- authenticated explicitly, so every REVOKE below names them too.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE business_merchants                  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE business_merchant_terms_acceptances FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE business_products                   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE business_product_option_groups      FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE business_product_option_values      FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE business_orders                     FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE business_order_items                FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE business_order_status_history       FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE business_product_reports            FROM PUBLIC, anon, authenticated, service_role;

-- Merchant profile: created once, edited by its owner. Never deleted — orders
-- and products reference it, and a merchant who leaves must not orphan them.
GRANT SELECT, INSERT, UPDATE ON TABLE business_merchants TO service_role;

-- Terms acceptance: append-only.
GRANT SELECT, INSERT ON TABLE business_merchant_terms_acceptances TO service_role;

-- Products: tombstoned, never hard-deleted. No DELETE, on purpose.
GRANT SELECT, INSERT, UPDATE ON TABLE business_products TO service_role;

-- Options belong to the product being edited; removing one is ordinary editing.
-- Historical orders are unaffected because they carry a JSONB snapshot.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_product_option_groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_product_option_values TO service_role;

-- Orders: status transitions and the retention job's PII nulling are UPDATEs.
-- Rows are never deleted — §37 keeps the non-PII order for audit and migration.
GRANT SELECT, INSERT, UPDATE ON TABLE business_orders TO service_role;

-- Order items: written once with the order, never touched again.
GRANT SELECT, INSERT ON TABLE business_order_items TO service_role;

-- Status history: append-only. Withholding UPDATE and DELETE here is what makes
-- the audit trail an audit trail.
GRANT SELECT, INSERT ON TABLE business_order_status_history TO service_role;

-- Reports: intake plus triage state.
GRANT SELECT, INSERT, UPDATE ON TABLE business_product_reports TO service_role;

-- ---------------------------------------------------------------------------
-- 12. Documentation that travels with the schema
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN business_products.price_amount IS
  'Integer amount in the currency''s minor unit. VND has exponent 0: 45000 means 45,000 VND. Never float. See src/lib/business/money.ts.';
COMMENT ON COLUMN business_orders.total_amount IS
  'Integer amount in the currency''s minor unit. VND exponent 0. Product items only — shipping is never included (§17).';
COMMENT ON COLUMN business_orders.customer_phone IS
  'PII. Deliberately UNINDEXED: §16 forbids enumerating orders by phone. Rate limiting uses a keyed HMAC in Redis, never a query here.';
COMMENT ON COLUMN business_orders.tracking_token_hash IS
  'SHA-256 of the tracking token. The raw token is never stored in PostgreSQL (§21).';
COMMENT ON COLUMN business_orders.claimed_by_user_id IS
  'Write-once, references Controller identity. Stays NULL in MVP; the claim flow is Phase 1.5. Phone is never an authorization key.';
COMMENT ON TABLE business_order_status_history IS
  'Append-only. service_role holds no UPDATE or DELETE. The from_status CHECK makes a transition out of a terminal state unrecordable.';
