# TappyAI Back Office — API Governance

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Define the rules that keep the `/api/admin/*` (and the shared client `/api/*`) surface consistent, versioned, secure, and evolvable. `05_API_Architecture.md` defines *what* the endpoints are; this document defines *how the API is governed over time*.

---

## 2. Versioning Strategy

| Surface | Strategy |
|---|---|
| **Back office API** (`/api/admin/*`) | Unversioned URL. Back office UI and API deploy together (same repo, same release), so lockstep evolution needs no URL version. |
| **Client API** (`/api/*` used by Web/Android/iOS) | **Additive-only** contract. Breaking changes require a new path suffix (`/api/chat/v2`) because older app versions in the field cannot be force-updated. |

**Rationale:** Native apps cannot be updated on demand; their contract must remain stable. The back office ships atomically with its API, so it does not need versioned URLs.

### Breaking vs Non-Breaking

| Non-breaking (allowed freely) | Breaking (requires new version path) |
|---|---|
| Add optional request field | Remove/rename a field |
| Add response field | Change a field's type/meaning |
| Add new endpoint | Change status code semantics |
| Loosen validation | Tighten validation on existing field |
| Add enum value the client ignores safely | Make an optional field required |

---

## 3. Contract Definition & Consistency

- Every endpoint's request and response are defined by a **Zod schema** (`21_Coding_Standards.md`). The Zod schema is the contract.
- Response envelope is uniform: `{ data, meta }` on success, `{ error: { code, message, details } }` on failure (`05_API_Architecture.md` §3).
- Error codes come from the fixed catalog. New codes require updating the catalog.
- List endpoints are **always** cursor-paginated with the same `meta.page` shape.

---

## 4. Mandatory Handler Contract

Every `/api/admin/*` route enforces this order (see Coding Standards §2):

1. `requireAdminRole(req, minRole)` — auth + RBAC.
2. Same-origin check for mutations.
3. Rate-limit check.
4. Zod validation of input.
5. Business operation via `supabaseAdmin`.
6. Audit-log write on mutation (non-blocking).
7. Uniform response envelope.

A handler missing any of steps 1, 4, or 6 (for mutations) fails review.

---

## 5. Rate Limiting Governance

Rate limits are a first-class part of the contract, not an afterthought.

| Class | Limit | Applies To |
|---|---|---|
| Read | 100/min/admin | analytics, list, detail GETs |
| Mutate | 20/min/admin | suspend, ban, campaign edits |
| Bulk | 5/min/admin | bulk actions |
| Heavy | 10/hour/admin | report/export generation |
| Dispatch | 5/hour/admin | campaign send |

Limits are keyed by `admin user_id`. Exceeding returns `429 RATE_LIMITED` with a `Retry-After` header. Enforced via existing `rateLimit.ts`.

---

## 6. Idempotency for Mutations

State-changing admin actions that could be double-submitted (ban, campaign send, report generation) accept an `Idempotency-Key` header. The server records processed keys for 24h and returns the original result on replay. This prevents double-bans from double-clicks and duplicate campaign sends.

---

## 7. Deprecation Policy

For the client API (native apps):
1. Mark endpoint deprecated in docs + response header `Deprecation: true` + `Sunset: <date>`.
2. Announce in release notes.
3. Maintain for **at least 2 major app releases** or 90 days, whichever is longer.
4. Monitor usage via `version_analytics` — only remove when field usage is negligible.
5. Removal requires an ADR.

Back office endpoints may be removed in the same release that removes their UI.

---

## 8. Observability

- Every admin request emits a structured server log: `{ route, actor_id, role, status, latency_ms }` (no PII, no bodies).
- 4xx/5xx rates per endpoint feed System Monitoring.
- Slow endpoints (p95 > target) are flagged.

---

## 9. Security Governance

- Back office API is same-origin only (CORS deny cross-origin) — Security §9.
- No admin endpoint is reachable without an admin role — enforced in middleware AND handler (defense in depth).
- Secrets never appear in responses or logs.
- Input is always validated before DB access; output never echoes raw DB errors.

---

## 10. Change Process

| Change | Required |
|---|---|
| Add endpoint | PR updating `05_API_Architecture.md` + Zod schema |
| Add response field | PR (non-breaking) |
| Breaking client-API change | ADR + new version path + deprecation of old |
| New error code | Update error catalog in `05_API_Architecture.md` |
| Rate limit change | Update this doc |

---

*End of API Governance*
