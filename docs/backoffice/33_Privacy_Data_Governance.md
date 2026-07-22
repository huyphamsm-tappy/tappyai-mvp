# TappyAI Back Office — Privacy & Data Governance

**Version:** 1.0  
**Status:** APPROVED (v1.0 — 2026-07-13)  
**Date:** 2026-07-13

---

## 1. Objective

Consolidate TappyAI's privacy and data-governance rules into one authoritative document: what data is collected, how it is classified, who may access it, how subject rights are honored, and how compliance is maintained. This unifies the privacy rules previously distributed across Security (`19`), Analytics (`06` §9), User Management (`10`), and CRM (`14`).

---

## 2. Principles

| Principle | Meaning |
|---|---|
| **Data minimization** | Collect only what a defined purpose requires. |
| **Purpose limitation** | Data collected for one purpose is not repurposed without review. |
| **Least privilege** | Each role sees only the data its function needs (RBAC). |
| **Privacy by default** | New tables deny access by default; analytics never store PII. |
| **Transparency** | Users can obtain their data; deletions are honored. |
| **Accountability** | Every sensitive access/action is audit-logged. |

---

## 3. Data Classification

Every field in the system maps to one class. This class dictates storage, access, and retention.

| Class | Definition | Examples | Access Floor |
|---|---|---|---|
| **C0 — Public** | Non-sensitive, user-published | display name, public reviews, avatar | Any admin role |
| **C1 — Internal** | Operational, non-identifying | event counts, feature usage, aggregates | `analyst`+ |
| **C2 — Personal (PII)** | Identifies a person | email, phone, IP, device id | `admin`+ (email masked below) |
| **C3 — Sensitive** | High-harm if exposed | payment tokens, auth secrets, precise location | `super_admin` / never in BO |
| **C4 — Content** | User private content | AI conversation contents, private messages | Never exposed in BO |

**Hard rules:**
- C4 (conversation content) is **never** shown in the back office — only aggregates (count, cost).
- C3 secrets are never rendered; payment shows last-4 only.
- Analytics tables (`track_events`, snapshots) store **no C2/C3/C4** — only `user_id`/`anon_id` (pseudonymous) plus C1 data.

---

## 4. PII Access Matrix (authoritative)

| Data (class) | analyst | moderator | admin | super_admin |
|---|---|---|---|---|
| Email — masked (C2) | ❌ | ✅ | ✅ | ✅ |
| Email — full (C2) | ❌ | ❌ | ✅ | ✅ |
| IP address (C2) | ❌ | ❌ | ✅ (audit only) | ✅ (audit only) |
| Device id (C2) | ❌ | ❌ | ✅ | ✅ |
| Payment last-4 (C3) | ❌ | ❌ | ✅ | ✅ |
| Payment full/token (C3) | ❌ | ❌ | ❌ | ❌ (never) |
| Conversation content (C4) | ❌ | ❌ | ❌ | ❌ (never) |
| Aggregated analytics (C1) | ✅ | ✅ | ✅ | ✅ |

Enforced in the API query layer, not only the UI (Security §4). This matrix is consistent with RBAC (`12`) and supersedes any looser statement elsewhere.

---

## 5. Consent & Opt-Out

| Scope | Rule |
|---|---|
| Analytics tracking | Users may opt out; opted-out clients skip event batching entirely (`06` §9). |
| Marketing notifications | Opt-in per channel; global unsubscribe honored immediately (`27` §4). |
| Essential/operational | Auth, security, and transactional events are not opt-out (needed to run the service). |
| Cookie/consent (web) | Default to privacy-preserving; decline non-essential unless the user opts in. |

Consent state is stored per user and is included in their data export.

---

## 6. Data Subject Rights

| Right | Mechanism | Owner Doc |
|---|---|---|
| **Access / Portability** | Admin triggers export → JSON zip of all user data | `10` §5 |
| **Erasure** | Soft-delete: anonymize PII, delete memory/push subs, null analytics identity, hide content | `10` §4, `19` §7 |
| **Rectification** | Admin edits profile fields; user edits own profile | `10` |
| **Restriction** | Suspend halts processing of the account | `10`, `11` |

**Erasure detail (unified):** on erasure, `profiles` PII anonymized; `user_memory`, `notification_subscriptions` deleted; `track_events.user_id`, `ai_usage_log.user_id`, `user_active_days.user_id` (cascade), `anon_identity_map` (cascade) nulled/removed; content hidden; `audit_log` retained (legal record) with identifiers intact as the lawful basis is legitimate interest / legal obligation.

---

## 7. Data Residency & Processors

| Processor | Data | Purpose |
|---|---|---|
| Supabase | All primary + analytics data | Database, auth, storage |
| Vercel | Request processing, blob (reports/exports) | Hosting |
| Anthropic | Prompt content (transient) | AI responses |
| PostHog | Pseudonymous events | Product analytics |
| Stripe / Apple | Payment data | Billing |
| FCM / APNs | Push tokens + payloads | Notifications |

A processor register is maintained. Adding a processor that receives C2+ data requires review (and a DPA where applicable). Payment C3 data stays with Stripe/Apple — never in TappyAI's DB beyond references + last-4.

---

## 8. Governance Operations

| Control | Practice |
|---|---|
| Access review | Admin roles reviewed quarterly (`12`); stale roles revoked |
| Audit | All C2+ access via BO is audit-logged (`13`) |
| PII in logs | Prohibited; ingestion rejects PII-shaped `properties` (`06` §8A.3) |
| Breach response | Documented escalation: contain → assess → notify per applicable law → remediate |
| New-field review | Any new field is classified (§3) before it ships (`29` change process) |

---

## 9. Relationship to Data Retention

Retention windows are defined authoritatively in `34_Data_Retention_Policy.md`. Erasure (§6) overrides retention — an erasure request is honored regardless of remaining retention window (except immutable `audit_log`, retained as legal record).

---

## 10. Future Recommendations

> NOT in scope.

- Formal DPA management + processor audit cadence.
- Automated PII discovery scans across tables.
- Region-pinned storage if EU users become material.
- Differential-privacy noise on small-cohort analytics exports.

---

*End of Privacy & Data Governance*
