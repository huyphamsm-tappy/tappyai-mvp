# TappyAI Back Office — Feature Flags Architecture

**Version:** 1.0  
**Status:** APPROVED (v1.0 — brought into scope by owner 2026-07-13, ADR-010)  
**Date:** 2026-07-13

---

## 1. Objective

Define a unified feature-flag system that lets the team enable, disable, gate, and gradually roll out features across Web, Android, and iOS **without a deploy**, consistently through one backend authority.

---

## 2. Why (Purpose)

- Decouple *deploy* from *release*: ship code dark, turn it on when ready.
- Kill-switch: instantly disable a broken or abusive feature without an app update — critical because native apps cannot be force-updated on demand.
- Gradual rollout: expose a feature to 1% → 10% → 100% and watch metrics.
- Entitlement gating: gate features by subscription tier (free/pro) from one place.
- Foundation for experimentation (`32_Experimentation_AB_Testing.md`).

---

## 3. Design Principles

| Principle | Implementation |
|---|---|
| **Backend authoritative** | Flag state lives in Supabase; clients read, never decide. |
| **One evaluation contract** | All platforms call the same resolution endpoint and get the same answer. |
| **Fail safe** | If flag service is unreachable, clients use a bundled default (usually "off" for new features). |
| **Auditable** | Every flag change is audit-logged. |
| **No secrets in flags** | Flags control behavior, never carry credentials. |

---

## 4. Flag Model

```sql
CREATE TYPE flag_type AS ENUM ('boolean', 'percentage', 'tier', 'variant');

CREATE TABLE feature_flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key             TEXT NOT NULL UNIQUE,       -- e.g. 'music_ugc_upload'
    description     TEXT,
    type            flag_type NOT NULL DEFAULT 'boolean',
    enabled         BOOLEAN NOT NULL DEFAULT false,
    rollout_pct     SMALLINT DEFAULT 0,          -- for 'percentage' (0-100)
    tier_required   TEXT,                        -- for 'tier' ('free'|'pro')
    platforms       TEXT[] DEFAULT '{web,android,ios}', -- where it applies
    min_app_version TEXT,                        -- gate by version if set
    variants        JSONB,                       -- for 'variant' flags (A/B)
    is_permanent    BOOLEAN NOT NULL DEFAULT false, -- ops kill-switch vs temp release flag
    created_by      UUID REFERENCES profiles(id),
    updated_by      UUID REFERENCES profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-user overrides (QA, VIP, gradual allowlist) — also used by Dev Tools
CREATE TABLE feature_flag_overrides (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_key    TEXT NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    value       JSONB NOT NULL,               -- forced value/variant
    created_by  UUID REFERENCES profiles(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (flag_key, user_id)
);
```

---

## 5. Evaluation

### 5.1 Resolution Endpoint

`GET /api/flags` (client API — additive, stable contract per API Governance §2)

- Returns the resolved flag set for the requesting user/anon on their platform + app version.
- Resolution order (first match wins): **per-user override → tier gate → platform/version gate → percentage bucket → global enabled**.
- Percentage bucketing is deterministic: `hash(flag_key + user_id_or_anon_id) % 100 < rollout_pct`. The same user always gets the same answer for a given rollout %, so ramps are stable.

### 5.2 Client Contract

```json
{
  "flags": {
    "music_ugc_upload": { "enabled": true },
    "new_chat_ui": { "enabled": true, "variant": "b" },
    "pro_travel_tools": { "enabled": false }
  },
  "evaluated_at": "2026-07-13T10:00:00Z",
  "ttl_seconds": 300
}
```

- Clients cache flags for `ttl_seconds` (default 300) and refresh on app foreground.
- Clients ship a **bundled default** for every flag they read; used if `/api/flags` is unreachable (fail-safe).

### 5.3 Cross-Platform Consistency

The same evaluation logic runs server-side for all platforms. Web, Android, and iOS never implement their own flag logic — they consume the resolved set. This satisfies the cross-platform mandate.

---

## 6. Back Office UI

Under Settings → Feature Flags (`admin`+ to view, `super_admin` to edit — consistent with Settings RBAC):

- List all flags with current state, type, rollout %, platforms.
- Toggle, set rollout %, set tier/version gates.
- Manage per-user overrides (also surfaced in Dev Tools, `03_Module_Architecture.md` §Module 18).
- Every change writes `settings.flag_updated` to the audit log with before/after.

---

## 7. Relationship to Existing Architecture

- **Settings module** already listed "feature flags to enable/disable features without deploy" — this document formalizes that capability.
- **Dev Tools module** already listed "feature flag override per user" — implemented via `feature_flag_overrides`.
- **Experimentation** (`32`) builds `variant` flags on top of this model.

No conflict with existing docs; this fills in a capability they referenced.

---

## 8. Trade-offs & Risks

| Aspect | Note |
|---|---|
| **Benefit** | Deploy/release decoupling; instant kill-switch; safe ramps |
| **Trade-off** | Extra `/api/flags` call per session; flag debt if temporary flags aren't cleaned up |
| **Risk** | Stale client cache (mitigated: 5-min TTL + foreground refresh) |
| **Mitigation** | `is_permanent=false` flags are reviewed quarterly and removed once fully rolled out |

---

## 9. Future Recommendations

> NOT in scope.

- Segment-targeted flags (by country/language) reusing `audience_segments`.
- Scheduled flag changes (auto-enable at a datetime).
- Flag-change notifications to a team channel.

---

*End of Feature Flags Architecture*
