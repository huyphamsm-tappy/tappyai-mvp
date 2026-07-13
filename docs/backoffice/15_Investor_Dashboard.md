# TappyAI Back Office — Investor Dashboard Architecture

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Design a curated, executive-grade dashboard that presents TappyAI's business health to investors and board members with clarity, accuracy, and professional presentation.

---

## 2. Design Principles

| Principle | Implementation |
|---|---|
| **Curated, not configurable** | Fixed layout. Investors see what founders want them to see. |
| **Accurate, not estimated** | All metrics from authoritative sources. No projections disguised as actuals. |
| **Visually clean** | One metric per card. No information overload. |
| **Never public** | The dashboard is NEVER publicly accessible. External sharing always requires authentication (password or OTP) in addition to a secure, expiring, revocable link (see §5). |
| **Export-ready** | One-click PDF / Excel export of all displayed data |

---

## 3. Dashboard Layout

### Section 1 — Growth

```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│   Total Users  │ │   MAU (28d)    │ │  MoM Growth    │
│    124,500     │ │    42,300      │ │    +18.3%      │
│  ▲ +2,100 7d  │ │  ▲ vs 35,700  │ │  🟢 growing    │
└────────────────┘ └────────────────┘ └────────────────┘

[Chart: Monthly Active Users — 12 months rolling]
```

### Section 2 — Retention

```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│  D1 Retention  │ │  D7 Retention  │ │  D30 Retention │
│    62%         │ │    41%         │ │    28%         │
│  industry: ~40%│ │  industry: ~20%│ │  industry: ~10%│
└────────────────┘ └────────────────┘ └────────────────┘

[Table: Monthly Cohort Retention — last 6 cohorts]
```

### Section 3 — Revenue

```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│      MRR       │ │      ARR       │ │  Net New MRR   │
│   $8,450       │ │   $101,400     │ │   +$1,200      │
│  ▲ vs $7,250  │ │  ▲ 16.6% YoY  │ │  this month    │
└────────────────┘ └────────────────┘ └────────────────┘

[Chart: MRR — 12 months rolling]
[Chart: Subscription Breakdown: New | Churned | Net]
```

### Section 4 — Unit Economics

```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│   Rev / MAU    │ │   AI Cost/MAU  │ │  Gross Margin  │
│   $0.20        │ │   $0.08        │ │    ~60%        │
│  (est.)        │ │  (est.)        │ │  (est.)        │
└────────────────┘ └────────────────┘ └────────────────┘
```

*Note: Gross margin is estimated (Revenue − AI cost only). Real gross margin requires full cost accounting.*

### Section 5 — Engagement

```
[Chart: DAU / WAU / MAU — 30 days]
[Chart: Stickiness (DAU/MAU) — 12 months]
```

### Section 6 — Platform Split

```
[Pie Chart: MAU by Platform — Web / Android / iOS]
[Pie Chart: Revenue by Platform — Stripe / Apple IAP]
```

---

## 4. Data Sources

| Metric | Source | Refresh |
|---|---|---|
| Total Users | `SELECT COUNT(*) FROM profiles` | Daily snapshot |
| MAU | `daily_snapshots.mau` | Daily snapshot |
| MoM Growth | Compare current vs prior month MAU | Computed |
| D1/D7/D30 Retention | `cohort_metrics` | Daily snapshot |
| MRR | Sum of active subscription amounts | Stripe API or `subscriptions` |
| ARR | MRR × 12 | Computed |
| Net New MRR | New subscriptions − churned × price | Computed |
| Rev/MAU | MRR / MAU | Computed |
| AI Cost/MAU | `daily_snapshots.ai_cost_usd` sum / MAU | Computed |
| DAU/WAU/MAU | `daily_snapshots` | Daily snapshot |
| Platform split | `daily_snapshots` per platform | Daily snapshot |

---

## 5. Secure Authenticated Sharing (D7 — Owner-Mandated)

**Constraint (owner decision, 2026-07-13):** The Investor Dashboard is **NEVER publicly accessible**. Every external view requires **authentication in addition to a secure, expiring, revocable link**. A link alone grants nothing. See ADR-009.

### 5.1 Sharing Model

Super Admin creates a **named share grant** for a specific investor (not an open link):

1. Super Admin clicks "Share with investor" and enters:
   - Recipient label (e.g. "Investor — VC Firm X")
   - Access method: **Password** (Super Admin sets a passphrase, delivered to the recipient out-of-band) **or OTP** (one-time code sent to the recipient's email each session)
   - Expiration (7 / 30 / 90 days — required, no "never")
2. Server creates an `investor_share_grants` row (see §5.4) and returns the secure link.
3. The link resolves to a **login gate**, not the dashboard. The recipient must authenticate (password or email OTP) before any data renders.
4. On successful auth, a short-lived (15-minute, sliding) view session is issued. The dashboard renders read-only.
5. Every step — grant creation, each authentication attempt (success + failure), each data view, and revocation — is written to the audit log.

### 5.2 Authentication Options

| Method | Flow | Best for |
|---|---|---|
| **Password** | Super Admin sets a passphrase; delivered to recipient via a separate channel (call/secure message). Recipient enters it at the gate. | Single trusted recipient |
| **Email OTP** | Recipient enters their email (must match the grant's allowed email); a 6-digit code is emailed; code valid 10 min, single use. | Verifiable identity, no shared secret |

Failed-auth lockout: 5 failed attempts locks the grant for 1 hour and alerts the Super Admin.

### 5.3 Revocation & Limits

- Super Admin can revoke any grant instantly (`is_revoked = true`) — active view sessions are terminated on next request.
- Grants auto-expire at `expires_at`; expired grants deny access.
- Max **5 active grants** at once (prevents over-distribution).
- No grant is transferable; OTP grants bind to a specific recipient email.

### 5.4 `investor_share_grants` Table

```sql
CREATE TABLE investor_share_grants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label           TEXT NOT NULL,
    auth_method     TEXT NOT NULL,          -- 'password' | 'otp'
    password_hash   TEXT,                   -- argon2/bcrypt hash; NULL for otp
    allowed_email   TEXT,                   -- required for otp; NULL for password
    link_token      TEXT NOT NULL UNIQUE,   -- random 256-bit, identifies the grant (not an access grant by itself)
    created_by      UUID NOT NULL REFERENCES profiles(id),
    expires_at      TIMESTAMPTZ NOT NULL,
    is_revoked      BOOLEAN NOT NULL DEFAULT false,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    last_viewed_at  TIMESTAMPTZ,
    view_count      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.5 Security Properties

- `link_token` is a random 256-bit value stored server-side; it identifies which grant is being accessed but confers **no access without passing authentication**.
- Passwords stored only as argon2/bcrypt hashes; OTP codes never stored in plaintext (hashed, short-TTL).
- View sessions are signed, HttpOnly, 15-minute sliding, scoped to the investor dashboard only — they grant no other admin capability.
- All access is same-origin and served over HTTPS.
- Full audit trail: `investor.grant_created`, `investor.auth_succeeded`, `investor.auth_failed`, `investor.viewed`, `investor.grant_revoked`.

---

## 6. Export

From the Investor Dashboard:
- **PDF**: Full formatted report (see `08_Reporting_Architecture.md` — Investor Report)
- **Excel**: Raw data tables for all displayed metrics, date-filterable

---

## 7. Access Control

| Role | Access |
|---|---|
| `analyst` | ❌ No access |
| `moderator` | ❌ No access |
| `admin` | ✅ View only — cannot create Share Grants |
| `super_admin` | ✅ Full access + Share Grant management (create/revoke, per ADR-009 §5) |

---

*End of Investor Dashboard Architecture*
