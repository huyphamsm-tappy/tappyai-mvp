# TappyAI Back Office — Database Architecture

**Version:** 1.1 (Review-hardened)  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13  
**Changelog:** v1.1 adds the analytics-integrity structures required by Analytics Architecture v1.1 — `event_id`/`schema_version`/`anon_id` on `track_events`, `is_final`/`reconciled_at` on `daily_snapshots`, and the `user_active_days` + `anon_identity_map` tables. See §7A. Governance for naming/migration rules is in `29_Database_Governance.md`.

---

## 1. Objective

Define the database schema additions required to support the Back Office Platform, including analytics aggregation tables, audit log, RBAC tables, engagement tables, and moderation tables.

This document covers **new tables only**. Existing tables are not modified unless strictly necessary (see Section 9).

---

## 2. Schema Strategy

All back office tables live in the default `public` schema alongside existing tables.

A future migration to a dedicated `backoffice` schema is possible but unnecessary for MVP.

> **Authoritative source (per Database Governance `29` and Constitution §8):** This document (`04`) is the **single authoritative source of truth for the database schema**. Some tables carry a convenience DDL in the feature document that owns them (noted in the Table Registry below); where a table is described in more than one document, the definition referenced here **governs**, and any other copy is a non-authoritative reference. The `user_active_days` DDL previously duplicated in `06` is now a reference to §7A of this document.

```
public/
├── [existing tables — unchanged]
│
├── [analytics]
│   ├── daily_snapshots
│   ├── feature_usage_rollup
│   ├── cohort_metrics
│   ├── version_analytics
│   ├── ai_usage_log
│   ├── user_active_days          (§7A)
│   └── anon_identity_map         (§7A)
│
├── [back office operations]
│   ├── admin_roles
│   ├── admin_permissions
│   ├── audit_log
│   ├── moderation_queue
│   ├── moderation_actions
│   ├── user_notes
│   └── system_health_log
│
├── [engagement]
│   ├── notification_campaigns
│   ├── notification_templates
│   ├── audience_segments
│   ├── notification_deliveries
│   └── in_app_messages           (DDL in 09 §9)
│
├── [releases]
│   └── app_releases
│
├── [reporting]
│   └── report_jobs               (DDL in 08 §4)
│
├── [investor]
│   └── investor_share_grants     (DDL in 15 §5.4)
│
├── [feature flags]
│   ├── feature_flags             (DDL in 31 §4)
│   └── feature_flag_overrides    (DDL in 31 §4)
│
└── [experimentation]
    ├── experiments               (DDL in 32 §4)
    └── experiment_assignments    (DDL in 32 §4)
```

### 2.1 Table Registry (authoritative index)

Every architecture-owned table, its owning module, and where its DDL is defined. `04` is authoritative; feature-doc DDLs are incorporated by reference.

| Table | Owning module | DDL location |
|---|---|---|
| `daily_snapshots` | Analytics | 04 §3.1 |
| `feature_usage_rollup` | Analytics | 04 §3.2 |
| `cohort_metrics` | Analytics | 04 §3.3 |
| `version_analytics` | Analytics | 04 §3.4 |
| `ai_usage_log` | Analytics | 04 §3.5 |
| `user_active_days` | Analytics | 04 §7A (authoritative; `06` §8C references this) |
| `anon_identity_map` | Analytics | 04 §7A |
| `admin_roles` | RBAC | 04 §4.1 |
| `admin_permissions` | RBAC | 04 §4.2 |
| `audit_log` | Audit | 04 §4.3 |
| `moderation_queue` | Moderation | 04 §4.4 |
| `moderation_actions` | Moderation | 04 §4.5 |
| `user_notes` | CRM | 04 §4.6 |
| `system_health_log` | Monitoring | 04 §4.7 |
| `notification_campaigns` | Engagement | 04 §5.1 |
| `notification_templates` | Engagement | 04 §5.2 |
| `audience_segments` | Engagement | 04 §5.3 |
| `notification_deliveries` | Engagement | 04 §5.4 |
| `in_app_messages` | Engagement | 09 §9 (referenced) |
| `app_releases` | Release Mgmt | 04 §6.1 |
| `report_jobs` | Reporting | 08 §4 (referenced) |
| `investor_share_grants` | Investor Dashboard | 15 §5.4 (referenced) |
| `feature_flags` | Feature Flags | 31 §4 (referenced) |
| `feature_flag_overrides` | Feature Flags | 31 §4 (referenced) |
| `experiments` | Experimentation | 32 §4 (referenced) |
| `experiment_assignments` | Experimentation | 32 §4 (referenced) |

*Existing product tables (`profiles`, `subscriptions`, `reviews`, `conversations`, `track_events`, `notification_subscriptions`, music/`sound_*`, `anon_chat_usage`, etc.) are defined in the main app schema; §7 documents the additive columns this architecture requires on them.*

---

## 3. Analytics Tables

### 3.1 `daily_snapshots`

Pre-computed daily KPI snapshot. Populated by `analytics-snapshot` cron at 00:05 VN (Asia/Ho_Chi_Minh, UTC+7 = 17:05 UTC).

```sql
CREATE TABLE daily_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date   DATE NOT NULL,
    platform        TEXT NOT NULL DEFAULT 'all',  -- 'all' | 'web' | 'android' | 'ios'

    -- User growth
    total_users         INTEGER NOT NULL DEFAULT 0,
    new_users           INTEGER NOT NULL DEFAULT 0,
    returning_users     INTEGER NOT NULL DEFAULT 0,
    churned_users       INTEGER NOT NULL DEFAULT 0,

    -- Active usage
    dau                 INTEGER NOT NULL DEFAULT 0,
    wau                 INTEGER NOT NULL DEFAULT 0,
    mau                 INTEGER NOT NULL DEFAULT 0,

    -- Sessions
    total_sessions      INTEGER NOT NULL DEFAULT 0,
    avg_session_sec     NUMERIC(10,2) DEFAULT 0,
    total_app_opens     INTEGER NOT NULL DEFAULT 0,

    -- AI
    ai_conversations    INTEGER NOT NULL DEFAULT 0,
    ai_messages         INTEGER NOT NULL DEFAULT 0,
    ai_input_tokens     BIGINT NOT NULL DEFAULT 0,
    ai_output_tokens    BIGINT NOT NULL DEFAULT 0,
    ai_cost_usd         NUMERIC(10,6) DEFAULT 0,

    -- Content
    reviews_uploaded    INTEGER NOT NULL DEFAULT 0,
    review_views        BIGINT NOT NULL DEFAULT 0,
    review_likes        INTEGER NOT NULL DEFAULT 0,
    review_shares       INTEGER NOT NULL DEFAULT 0,
    review_saves        INTEGER NOT NULL DEFAULT 0,
    review_comments     INTEGER NOT NULL DEFAULT 0,

    -- Revenue
    new_subscriptions   INTEGER NOT NULL DEFAULT 0,
    churned_subs        INTEGER NOT NULL DEFAULT 0,
    mrr_usd             NUMERIC(10,2) DEFAULT 0,
    revenue_day_usd     NUMERIC(10,2) DEFAULT 0,

    -- Search
    searches_total      INTEGER NOT NULL DEFAULT 0,
    searches_food       INTEGER NOT NULL DEFAULT 0,
    searches_travel     INTEGER NOT NULL DEFAULT 0,

    -- Notifications
    notifs_sent         INTEGER NOT NULL DEFAULT 0,
    notifs_delivered    INTEGER NOT NULL DEFAULT 0,
    notifs_opened       INTEGER NOT NULL DEFAULT 0,
    notifs_clicked      INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (snapshot_date, platform)
);

CREATE INDEX idx_daily_snapshots_date ON daily_snapshots(snapshot_date DESC);
CREATE INDEX idx_daily_snapshots_platform ON daily_snapshots(platform, snapshot_date DESC);
```

### 3.2 `feature_usage_rollup`

Per-feature daily usage. One row per feature per day per platform.

```sql
CREATE TABLE feature_usage_rollup (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date   DATE NOT NULL,
    feature_key     TEXT NOT NULL,  -- 'chat' | 'food' | 'travel' | 'explore' | 'reviews' | etc.
    platform        TEXT NOT NULL DEFAULT 'all',
    unique_users    INTEGER NOT NULL DEFAULT 0,
    total_sessions  INTEGER NOT NULL DEFAULT 0,
    total_events    INTEGER NOT NULL DEFAULT 0,
    avg_duration_sec NUMERIC(10,2) DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (snapshot_date, feature_key, platform)
);

CREATE INDEX idx_feature_rollup_date ON feature_usage_rollup(snapshot_date DESC, feature_key);
```

### 3.3 `cohort_metrics`

D1/D7/D30 retention per registration cohort.

```sql
CREATE TABLE cohort_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cohort_date     DATE NOT NULL,          -- Registration date of cohort
    platform        TEXT NOT NULL DEFAULT 'all',
    cohort_size     INTEGER NOT NULL DEFAULT 0,
    d1_retained     INTEGER NOT NULL DEFAULT 0,
    d7_retained     INTEGER NOT NULL DEFAULT 0,
    d30_retained    INTEGER NOT NULL DEFAULT 0,
    d1_rate         NUMERIC(5,4) DEFAULT 0, -- 0.00-1.00
    d7_rate         NUMERIC(5,4) DEFAULT 0,
    d30_rate        NUMERIC(5,4) DEFAULT 0,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (cohort_date, platform)
);

CREATE INDEX idx_cohort_metrics_date ON cohort_metrics(cohort_date DESC);
```

### 3.4 `version_analytics`

Analytics broken down by app version.

```sql
CREATE TABLE version_analytics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date   DATE NOT NULL,
    platform        TEXT NOT NULL,      -- 'web' | 'android' | 'ios'
    app_version     TEXT NOT NULL,      -- '1.2.3'
    build_number    TEXT,
    active_users    INTEGER NOT NULL DEFAULT 0,
    new_installs    INTEGER NOT NULL DEFAULT 0,
    crash_count     INTEGER NOT NULL DEFAULT 0,
    error_count     INTEGER NOT NULL DEFAULT 0,
    avg_session_sec NUMERIC(10,2) DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (snapshot_date, platform, app_version)
);

CREATE INDEX idx_version_analytics_date ON version_analytics(snapshot_date DESC, platform);
```

### 3.5 `ai_usage_log`

Granular AI call log for cost monitoring. One row per API call.

```sql
CREATE TABLE ai_usage_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
    session_id      TEXT,
    feature         TEXT NOT NULL,      -- 'chat' | 'scan' | 'translate' | 'fortune' | etc.
    model           TEXT NOT NULL,
    provider        TEXT NOT NULL DEFAULT 'anthropic',
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    cost_usd        NUMERIC(10,8) DEFAULT 0,
    latency_ms      INTEGER,
    error           TEXT,               -- NULL if success
    platform        TEXT,
    app_version     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_log_user ON ai_usage_log(user_id, created_at DESC);
CREATE INDEX idx_ai_usage_log_date ON ai_usage_log(created_at DESC);
CREATE INDEX idx_ai_usage_log_feature ON ai_usage_log(feature, created_at DESC);
```

---

## 4. Back Office Operations Tables

### 4.1 `admin_roles`

RBAC role assignments. Replaces `ADMIN_IDS` env var.

```sql
CREATE TYPE admin_role AS ENUM (
    'super_admin',
    'admin',
    'moderator',
    'analyst'
);

CREATE TABLE admin_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role            admin_role NOT NULL,
    granted_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,        -- NULL = permanent
    notes           TEXT,

    UNIQUE (user_id, role)
);

CREATE INDEX idx_admin_roles_user ON admin_roles(user_id);
```

### 4.2 `admin_permissions`

Fine-grained permission overrides (beyond role defaults).

```sql
CREATE TABLE admin_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    permission      TEXT NOT NULL,      -- e.g. 'export.user_list' | 'investor_dashboard.view'
    granted         BOOLEAN NOT NULL DEFAULT true,
    granted_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, permission)
);
```

### 4.3 `audit_log`

Immutable record of every administrative action.

```sql
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID NOT NULL,          -- Admin who performed the action
    actor_email     TEXT NOT NULL,          -- Snapshot at time of action
    actor_role      TEXT NOT NULL,          -- Snapshot at time of action
    action          TEXT NOT NULL,          -- e.g. 'user.suspend' | 'moderation.hide_review'
    target_type     TEXT,                   -- e.g. 'user' | 'review' | 'notification'
    target_id       TEXT,                   -- ID of affected resource
    before_state    JSONB,                  -- Snapshot before change
    after_state     JSONB,                  -- Snapshot after change
    metadata        JSONB,                  -- Additional context
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutability: no UPDATE or DELETE on this table via RLS
-- Only INSERT allowed via service role

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at DESC);
CREATE INDEX idx_audit_log_date ON audit_log(created_at DESC);
```

### 4.4 `moderation_queue`

Content and user reports awaiting review.

```sql
CREATE TYPE moderation_status AS ENUM (
    'pending',
    'in_review',
    'resolved',
    'dismissed'
);

CREATE TYPE moderation_type AS ENUM (
    'review_report',
    'comment_report',
    'user_report',
    'music_report',
    'ai_flag'
);

CREATE TABLE moderation_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            moderation_type NOT NULL,
    status          moderation_status NOT NULL DEFAULT 'pending',
    priority        SMALLINT NOT NULL DEFAULT 1, -- 1=normal, 2=high, 3=urgent
    reported_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    target_type     TEXT NOT NULL,      -- 'review' | 'comment' | 'user' | 'music_track'
    target_id       UUID NOT NULL,
    reason          TEXT,
    metadata        JSONB,              -- Snapshot of reported content
    assigned_to     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    resolved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    resolution      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_modq_status ON moderation_queue(status, priority DESC, created_at ASC);
CREATE INDEX idx_modq_target ON moderation_queue(target_type, target_id);
```

### 4.5 `moderation_actions`

History of moderator decisions on queue items.

```sql
CREATE TYPE moderation_action_type AS ENUM (
    'warn',
    'hide_content',
    'restore_content',
    'suspend_user',
    'unsuspend_user',
    'ban_user',
    'restore_user',
    'delete_content',
    'dismiss_report'
);

CREATE TABLE moderation_actions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id        UUID REFERENCES moderation_queue(id) ON DELETE SET NULL,
    action          moderation_action_type NOT NULL,
    actor_id        UUID NOT NULL REFERENCES profiles(id),
    target_user_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    target_content_id UUID,
    reason          TEXT NOT NULL,
    duration_hours  INTEGER,            -- For suspensions; NULL = permanent
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mod_actions_actor ON moderation_actions(actor_id, created_at DESC);
CREATE INDEX idx_mod_actions_target ON moderation_actions(target_user_id, created_at DESC);
```

### 4.6 `user_notes`

Internal admin notes on users (CRM).

```sql
CREATE TABLE user_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES profiles(id),
    note            TEXT NOT NULL,
    is_pinned       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_notes_user ON user_notes(user_id, created_at DESC);
```

### 4.7 `system_health_log`

Records of system health check results.

```sql
CREATE TABLE system_health_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_name      TEXT NOT NULL,
    status          TEXT NOT NULL,      -- 'ok' | 'degraded' | 'down'
    latency_ms      INTEGER,
    message         TEXT,
    metadata        JSONB,
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_log_check ON system_health_log(check_name, checked_at DESC);
```

---

## 5. Engagement Tables

### 5.1 `notification_campaigns`

```sql
CREATE TYPE campaign_status AS ENUM (
    'draft',
    'scheduled',
    'sending',
    'completed',
    'cancelled'
);

CREATE TYPE campaign_channel AS ENUM (
    'push',
    'in_app',
    'announcement'
);

CREATE TABLE notification_campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    description     TEXT,
    channel         campaign_channel NOT NULL,
    status          campaign_status NOT NULL DEFAULT 'draft',
    template_id     UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
    segment_id      UUID REFERENCES audience_segments(id) ON DELETE SET NULL,
    scheduled_at    TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Stats (denormalized for dashboard performance)
    target_count    INTEGER NOT NULL DEFAULT 0,
    sent_count      INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    opened_count    INTEGER NOT NULL DEFAULT 0,
    clicked_count   INTEGER NOT NULL DEFAULT 0
);
```

### 5.2 `notification_templates`

```sql
CREATE TABLE notification_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    channel         campaign_channel NOT NULL,
    title_vi        TEXT,
    title_en        TEXT,
    body_vi         TEXT,
    body_en         TEXT,
    image_url       TEXT,
    action_url      TEXT,
    metadata        JSONB,
    created_by      UUID NOT NULL REFERENCES profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.3 `audience_segments`

```sql
CREATE TABLE audience_segments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    description     TEXT,
    filters         JSONB NOT NULL,  -- Filter definition (platform, language, country, subscription, last_active, etc.)
    estimated_size  INTEGER,
    last_computed   TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.4 `notification_deliveries`

Individual delivery tracking record per user per campaign.

```sql
CREATE TABLE notification_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES notification_campaigns(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    channel         campaign_channel NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'delivered' | 'failed' | 'opened' | 'clicked'
    sent_at         TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    opened_at       TIMESTAMPTZ,
    clicked_at      TIMESTAMPTZ,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_del_campaign ON notification_deliveries(campaign_id, status);
CREATE INDEX idx_notif_del_user ON notification_deliveries(user_id, campaign_id);
```

---

## 6. Release Management Tables

### 6.1 `app_releases`

```sql
CREATE TABLE app_releases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform        TEXT NOT NULL,      -- 'web' | 'android' | 'ios'
    version         TEXT NOT NULL,
    build_number    TEXT,
    release_notes_vi TEXT,
    release_notes_en TEXT,
    is_forced_update BOOLEAN NOT NULL DEFAULT false,
    min_supported_version TEXT,
    released_at     TIMESTAMPTZ,
    created_by      UUID REFERENCES profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (platform, version)
);
```

---

## 7. Existing Table Modifications

**Minimal modifications to existing tables.** Only additions, never breaking changes.

### `profiles` table — add columns:

```sql
-- Soft ban / suspension support
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT;
```

### `track_events` table — existing `/api/track` target, add columns:

```sql
-- Platform + version metadata for release analytics
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS app_version TEXT;
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS build_number TEXT;
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS os_name TEXT;
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS os_version TEXT;
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS device_type TEXT;
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS session_id TEXT;
```

*Note: `track_events` table must already exist as the target of `/api/track`. If not yet created as a formal table, this migration also creates it.*

---

## 7A. Analytics Integrity Additions (v1.1)

These structures implement idempotent ingestion, rolling active-user counts, late-event reconciliation, and anonymous identity stitching (Analytics Architecture §8A–§8D).

### `track_events` — additional columns

```sql
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS event_id UUID;
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS schema_version SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS anon_id UUID;
ALTER TABLE track_events ADD COLUMN IF NOT EXISTS is_unknown_event BOOLEAN NOT NULL DEFAULT false;

-- Idempotency: dedupe on client-generated event_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_track_events_event_id ON track_events(event_id);

-- One of user_id / anon_id must be present (enforced in app layer;
-- a CHECK is avoided to keep legacy rows valid during backfill)
```

Ingestion uses `INSERT ... ON CONFLICT (event_id) DO NOTHING`.

### `daily_snapshots` — additional columns

```sql
ALTER TABLE daily_snapshots ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE daily_snapshots ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
```

Provisional snapshots are written with `is_final=false`; the `snapshot-reconcile` cron re-computes the trailing 3 days and sets `is_final=true` once the window closes.

### `user_active_days` — rolling active-user source of truth

```sql
CREATE TABLE user_active_days (
    user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    active_date   DATE NOT NULL,              -- Asia/Ho_Chi_Minh calendar day
    platform      TEXT NOT NULL DEFAULT 'all',
    PRIMARY KEY (user_id, active_date, platform)
);
CREATE INDEX idx_user_active_days_date ON user_active_days(active_date, platform);
```

DAU/WAU/MAU and retention all derive from this table (Analytics Architecture §8C). One row per user per active day — orders of magnitude smaller than `track_events`.

### `anon_identity_map` — anonymous → registered stitching

```sql
CREATE TABLE anon_identity_map (
    anon_id     UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    linked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_anon_identity_user ON anon_identity_map(user_id);
```

Populated from `auth_anonymous_converted`. Lets funnels/cohorts follow a user across the signup boundary.

---

## 8. Row Level Security

### Analytics tables
- All reads: require authenticated admin session with `analyst` role or higher
- All writes: service role only (cron jobs)
- No direct user access

### `audit_log`
- Reads: `admin` role or higher
- Inserts: service role only
- Updates: DENIED for all roles
- Deletes: DENIED for all roles

### `admin_roles`
- Reads: `admin` role or higher (can see own role and others)
- Inserts/Updates: `super_admin` only
- Deletes: `super_admin` only

### `moderation_queue` + `moderation_actions`
- Reads: `moderator` role or higher
- Inserts: service role (reports from users) + `moderator` role (manual additions)
- Updates: `moderator` role or higher
- Deletes: DENIED

### `notification_campaigns` + related
- Reads: `admin` role or higher
- Inserts/Updates: `admin` role or higher
- Deletes: `admin` role or higher (campaigns in draft only)

---

## 9. Index Strategy Summary

| Table | Key Indexes |
|---|---|
| `daily_snapshots` | `(snapshot_date DESC)`, `(platform, snapshot_date DESC)` |
| `feature_usage_rollup` | `(snapshot_date DESC, feature_key)` |
| `cohort_metrics` | `(cohort_date DESC)` |
| `ai_usage_log` | `(created_at DESC)`, `(user_id, created_at DESC)`, `(feature, created_at DESC)` |
| `audit_log` | `(actor_id, created_at DESC)`, `(target_type, target_id)`, `(created_at DESC)` |
| `moderation_queue` | `(status, priority DESC, created_at ASC)`, `(target_type, target_id)` |
| `notification_deliveries` | `(campaign_id, status)`, `(user_id, campaign_id)` |
| `track_events` | `(user_id, created_at DESC)`, `(event_type, created_at DESC)`, `(platform, app_version)` |

---

## 10. Data Retention Policy

| Table | Retention | Reason |
|---|---|---|
| `track_events` | 90 days raw | Cost control; rolled up to snapshots |
| `daily_snapshots` | 3 years | Historical trend analysis |
| `audit_log` | 1 year minimum | Compliance; configurable |
| `ai_usage_log` | 90 days | Cost analysis; rolled to daily_snapshots |
| `notification_deliveries` | 1 year | Campaign analysis |
| `system_health_log` | 30 days | Operational use only |

---

*End of Database Architecture*
