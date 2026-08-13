# Controller V2 — Component 11: Session Security — CONTRACT **DRAFT**

**Status:** 🟡 **POLICY RATIFIED — IMPLEMENTATION BLOCKED ON ENVIRONMENT.**
**P-1 … P-7 were ratified by the Owner on 2026-08-13** and are now contract text.
**O-1, O-2 and O-3 remain unresolved**, and the reason has changed: they are no longer open *questions* but blocked *experiments*. The Owner directed that they be settled empirically in a **non-production** Supabase environment. **No such environment exists on this machine** — see §20. They were not guessed, and implementation has not started.

**Date:** 2026-08-13 · **Baseline:** `origin/main` = `89cd1a1` · production `/api/version` = same
**Prior scope:** one line — *"Session inventory, revocation, forced logout"* ([`03_PHASE1_FOUNDATION_DESIGN.md`](03_PHASE1_FOUNDATION_DESIGN.md) §11) — plus [`02_PHASE0_AUDIT.md`](02_PHASE0_AUDIT.md) §"Not verified", which records that no implementation exists. Those are **scope signals, not semantics**, and this document does not pretend they defined anything.

> **Reading rule.** Every clause is marked **[D]** derived from repository evidence, **[R]** ratified by the Owner on 2026-08-13, or **[O]** open and blocking. [D] and [R] are binding. Nothing marked [O] may be implemented.

---

## 1. Purpose — what C11 owns **[D]**

C11 owns **the lifecycle of an authenticated session as a governed object**: knowing which sessions exist, ending them deliberately, and proving both in the audit chain.

It owns exactly three capabilities, and no fourth:

| | Capability |
|---|---|
| **Inventory** | enumerate sessions that currently exist for a subject |
| **Revocation** | end a specific session before its natural expiry |
| **Forced logout** | end *every* session for a subject, on an administrator's authority |

## 2. Non-goals — what C11 must NOT own **[D]**

| Owned elsewhere | Owner | Evidence |
|---|---|---|
| Creating sessions, refreshing them, expiring them, rotating refresh tokens, password/OAuth flows | **Supabase Auth (GoTrue)** | `middleware.ts:59`, `src/lib/auth/getRequestUser.ts` — the app never mints a session; it only reads one |
| Deciding *who may do what* | **C3 + C4 (PDP)** | `src/lib/admin/permissions/*`; `guards.ts:109` is the single authorization decision point |
| Module readiness (`enabled && available`) | **C6** | C6 contract §1; C8 §9c already established that C8 may not widen it, and neither may C11 |
| Tamper-evident audit storage | **C7** | `audit_log` hash chain, `writeAuditLog` |
| Typed configuration/secrets | **C9b** | 5 required variables, deploy-time gate |
| Request throttling | **C10** | `distributedRateLimit`, fail-closed |
| Event fan-out | **C8** | outbox; C11 publishes *no* events unless §14 is ratified |

**C11 introduces no new authentication mechanism, no second permission model, no second audit system, no second limiter, and no client-specific security rule.** A native client must not be able to reach a session outcome a web client cannot, and vice versa.

## 3. Session model **[D] with one [O]**

### 3.1 What a session *is* here

Not a guess: the SDK pins it. `@supabase/auth-js@2.108.2` declares `session_id` a **required JWT claim** (`lib/types.d.ts:1630`, *"Required claims (iss, aud, exp, iat, sub, role, aal, session_id)"*). Every access token this platform issues is therefore **bound to a server-side GoTrue session**, and that session — not the token, not the cookie — is C11's unit of governance.

> **A JWT is not the session.** A session outlives any single access token: tokens are refreshed against it. Treating the token as the session would make "revocation" mean "wait for expiry", which is not revocation.

### 3.2 Identity of a session

| Field | Value | Source |
|---|---|---|
| Session identifier | the `session_id` claim / GoTrue session row id | JWT required claim |
| Subject | `sub` claim = `auth.users.id` | already used throughout as `user_id` |
| Assurance level | `aal` claim | required claim; recorded, not interpreted by C11 |
| Client class | `cookie` \| `bearer` | **already carried** on `Actor.source` — `src/lib/admin/rbac.ts:217` states verbatim that it *"is retained so component 11 (Session Security) can reason about web vs native"* |

### 3.3 Fields C11 reads — and the ones it must not

Creation time, last refresh, expiry (`not_after`) and revocation state are properties of the GoTrue session row. **Whether this project can read that row at all is [O-3].**

**Never read, never stored, never returned, never logged:** access tokens, refresh tokens, cookie values, password hashes, MFA secrets, or any credential material. §12 makes this a testable invariant rather than an intention.

**Device metadata — [R], P-6 ratified.** GoTrue records `ip` and `user_agent`. Both are personal data, and both are **withheld**. C11 may expose only a coarse **platform class**, and only where it is already available (`Actor.source`); if a field cannot be obtained without adding a new collection path, it is **omitted**. C11 starts no new data collection to make itself more useful.

## 4. Lifecycle and states **[R — P-1 ratified 2026-08-13]**

Three states, and each is justified rather than assumed:

| State | Why it must exist | Who effects it |
|---|---|---|
| **active** | a session exists and its refresh path still works | GoTrue, at sign-in |
| **expired** | `not_after` has passed | GoTrue, by time — **not** an action |
| **revoked** | deliberately ended before expiry | C11, or the user signing out |

**`expired` and `revoked` are deliberately distinct.** Collapsing them would make the audit trail unable to answer *"was this session ended by someone, or did it simply run out?"* — the single most important question after an account compromise.

Legal transitions — the table is exhaustive; anything absent is illegal:

| From | To | Trigger |
|---|---|---|
| — | active | sign-in (GoTrue; C11 observes only) |
| active | expired | `not_after` passes |
| active | revoked | user sign-out · self-revoke · administrator revoke · forced logout |
| expired | revoked | **not permitted** — an expired session is already terminal; a revoke request against it is a **no-op success** (§8) |
| revoked | active | **never** — there is no un-revoke. Re-authentication creates a *new* session |
| revoked | revoked | permitted, idempotent no-op |

**`revoked` and `expired` are terminal.** This mirrors C8's `delivered`/`dead`, whose terminality is enforced by a `status = 'pending'` predicate rather than by convention — and, as C8's runtime suite showed, terminality that is only asserted in prose is not terminality.

### 4.1 Snapshot boundary for revoke-all — exact semantics **[R]**

The Owner required this be stated exactly rather than described. It is defined by *construction*, not by a re-check:

> **Revoke-all is ONE statement inside ONE `SECURITY DEFINER` function.** The set of sessions it affects is the set matched by that statement's snapshot — under PostgreSQL's default `READ COMMITTED`, the snapshot taken when that statement begins. A session row that becomes visible after that instant is **not** matched, and therefore **not** revoked.

Three consequences follow, and all three are testable against a real PostgreSQL:

1. **A login racing a forced logout survives.** This is the ratified purpose: revoke-all must never become an account lock. C11 offers no standing ban on an account; that would be a different capability, and nobody authorized one.
2. **No second pass.** An implementation must not loop, re-query, or "catch stragglers". Doing so would silently convert the operation into a lock and break invariant **I-8**.
3. **The count returned is the count actually revoked** by that statement — never an estimate, and never a count of "sessions that existed when the request arrived".

**Forbidden:** taking the snapshot in the application tier (selecting ids, then revoking them in a second call). That is two transactions — §10 — and the window between them is exactly where a concurrent login is either wrongly killed or wrongly spared, depending on timing.

## 5. Revocation semantics **[R — P-2, P-3 ratified] · enforcement blocked by [O-1]**

### 5.1 Authority **[R]**

| Question | Ratified rule | Rationale |
|---|---|---|
| May a user revoke **their own** session? | **Yes** — via existing sign-out; no new surface | already true today (`SignOutButton.tsx:15`) |
| May a user revoke **their own other** sessions? | **No** — not in v1 | needs an end-user UI on three frozen clients (P-5) |
| May an administrator revoke **another user's** session? | **Yes**, gated on `security.sessions.revoke` | the capability C11 exists to add |
| May an administrator revoke the **Ultimate Owner's** session? | **No — 403** | the Owner Gate (`guards.ts:102`) runs before authorization precisely so ownership cannot be attacked through the admin surface; logging the Owner out is a lateral path to the same effect |
| May an administrator revoke **their own current** session? | **Yes, explicitly**, effective on their next request | refusing is surprising; a silent exemption is worse. **No special-case branch may exempt the actor's own session** |

#### 5.1.1 How Owner protection is enforced — narrowly scoped, no parallel model **[R]**

The Owner ratified this as *"a narrowly scoped enforcement check"*, and it stays narrow:

- The check is a **target-side predicate**: refuse when the *target subject* is the Platform Owner. It is **not** a second authorization model, and it does not touch `checkOwnerGate()`, which continues to run unchanged as step 2 of the decision order (§18) and concerns the **actor**.
- Ownership is determined by the **existing** authority — the `platform_owner` row, reachable through `fn_is_platform_owner` / `resolvePrincipal`'s `isOwner`. C11 introduces no new notion of ownership and no second source of truth for it.
- Enforced in **both** the handler (so the answer is a clean 403) **and** inside the revocation SQL function (so no future caller can bypass it). The database is the authority; the handler exists to give a good error. This is the shape Component 1 already uses for `fn_grant_admin_role`, where the handler pre-checks the constitutional rules the function enforces.
- **Invariant I-4a:** a revoke or forced-logout request targeting the Owner fails **even when the actor is a `super_admin` holding `security.sessions.revoke`**. Mutation-tested by removing the target check, never by asserting its text.

### 5.2 What "revoked" must mean at request time

Revocation is worthless unless something *enforces* it. The enforcement point already exists and is uniform:

```
src/lib/auth/getRequestUser.ts  →  supabase.auth.getUser()   [cookie path]
                               →  supabase.auth.getUser(token) [bearer path]
```

Both branches make a **real round-trip to the Auth server on every request** — the file says so, and `middleware.ts:53-58` records why `getUser()` was chosen over `getSession()` in the first place. So if GoTrue refuses a revoked session, **every** authenticated surface enforces revocation with no new per-request check, no denylist, and no cache to invalidate.

> ⛔ **[O-1] blocks this.** Whether hosted GoTrue rejects a *still-unexpired* access token whose session row was revoked is not determinable from this repository, and cannot be tested without either a live GoTrue or a production mutation. See §20.
>
> - If **yes** → revocation is **immediate** at the next request, and C11 is a thin, high-value component.
> - If **no** → revocation is **eventual**, bounded by the access-token TTL **[O-2]**, and immediate enforcement would require a C11-owned revocation check inside `getRequestUser` — a per-request lookup on the hot path of every authenticated request in the product.
>
> These are different components with different costs. This contract will not pick one by assumption.

### 5.3 Precedent for eventual consistency, and its limit

`src/lib/admin/rbac.ts:46-48` already accepts a bounded lag: the principal cache is ~60 s, so *role* revocation "tolerates <=60s lag" (ADR-003). That precedent supports a **small, stated, bounded** delay. It does not support an unbounded one, and it does not answer [O-1] — a 60-second role lag and a one-hour session lag are not the same risk.

## 6. Forced logout **[P-2, P-4]**

"Forced logout" = revoke **all** sessions for one subject, in one authorized action.

| Aspect | Rule |
|---|---|
| Actor | an admin holding `security.sessions.revoke`, subject to the Owner Gate and the corporate-identity boundary (F-10C) |
| Target | exactly one `user_id`. **No bulk/multi-user form** — a "log everyone out" button is an availability weapon, and no authoritative source asks for one |
| Scope | every session of that subject, including ones created moments earlier (see §9 race) |
| Reason | **required**, free text, stored in the audit entry — a forced logout without a recorded reason is indistinguishable from an attack |
| Already fully revoked | success, `revoked: 0` — idempotent, not an error |
| Nonexistent user | **404**, and no audit entry claiming a revocation happened |
| Anonymous subjects | **[R] excluded from C11 v1** — see §6.1 |

### 6.1 Anonymous exclusion — scope boundary **[R — P-4 ratified]**

The product mints anonymous sessions (`/api/auth/anonymous`). C11 v1 neither lists nor revokes them, and **nothing in the anonymous authentication architecture changes**.

The discriminator is not invented: `auth.users.is_anonymous` is a real column, and [`20260808c_handle_new_user_skip_anonymous.sql`](../../supabase/migrations/20260808c_handle_new_user_skip_anonymous.sql) records it as *verified, not assumed* (`attnum 35 · is_anonymous boolean`), having already chosen it as the right signal for exactly this kind of decision.

**Boundary, stated so it cannot be crossed by accident:** every C11 read and write filters `is_anonymous = false`. An anonymous session is therefore invisible to the inventory and unaffected by forced logout — including a forced logout aimed at a user id that happens to be anonymous, which returns **404** rather than silently succeeding. Anonymous chat continuity is preserved by construction, not by care.

## 7. Session inventory **[R — P-5, P-6 ratified] · source blocked by [O-3]**

| Question | Proposed rule |
|---|---|
| Who may list? | an admin holding `security.sessions.read` **[R]** |
| Whose sessions? | **one subject at a time**, addressed by `user_id`. No "all sessions on the platform" listing — it is a compromise-amplifying surface and nothing requires it |
| End-user self-service? | **[R]** not in v1 — admin surface only; no web/Android/iOS UI work |
| Ordering | most recently active first |
| Pagination | `limit` ≤ 50, default 20, cursor on `(created_at, id)` |
| Filtering | by state only (`active` / `all`) |
| Never exposed | **[R]** tokens of any kind, cookie values, **IP address**, **raw user-agent**, credentials, secrets. Only a coarse platform class may be shown, and only if it is already available — no new collection path may be added to obtain it |

**Where the data comes from is [O-3].** The repository has **zero** references to `auth.sessions` or `auth.refresh_tokens` (measured: 0 occurrences across `src/` and `supabase/`), while `auth.users` is referenced routinely as an FK target. Reading GoTrue's session tables would be **new coupling to Supabase-internal schema** that no ADR sanctions. §20 puts the three options to the Owner rather than choosing one here.

## 8. Idempotency **[D from C8 precedent]**

| Operation | Behaviour |
|---|---|
| Revoke an already-revoked session | **200**, `revoked: 0`. Not an error |
| Revoke an expired session | **200**, `revoked: 0` — terminal is terminal (§4) |
| Revoke a nonexistent session id | **404**. Distinguishable from the above *to an authorized admin only*, and never in a way that lets a caller enumerate ids (§11) |
| Forced logout with no active sessions | **200**, `revoked: 0` |
| Repeated forced logout | identical result; each attempt is audited, because the *attempt* is the security-relevant fact |

This is C8's rule restated: `ON CONFLICT DO NOTHING` and "a late settle returns NULL" both make a repeat harmless rather than fatal.

## 9. Concurrency and races **[R]**

| Race | Required behaviour |
|---|---|
| Two revocations of the same session | Both succeed. Exactly **one** records `revoked: 1`; the other is a no-op. The state after is `revoked` under either interleaving |
| Request arrives *during* revocation | The request either sees `active` or `revoked` — never a torn state. Whether it is admitted is [O-1]'s consequence, not a separate rule |
| Forced logout races user sign-out | Both terminal, same end state. Audit records both, because both actors acted |
| **Revoke-all races a new sign-in** | The new session **survives**. Revoke-all is defined over the set of sessions *existing when the operation began*; it is not a standing ban on the account. Anything else would be an account lock, which is a different capability nobody authorized |
| Concurrent revoke-all calls | Serialized by the database; the second reports `revoked: 0` |

The last row is the one that must be written down: without it, an implementation could quietly turn forced logout into a lockout.

## 10. Transaction boundaries **[D]**

Any operation that revokes **more than one row** — i.e. forced logout — must be atomic **inside a single PostgreSQL function**, for the same reason C8 §5 gives: the app tier speaks only PostgREST, so two calls are two transactions, and there is **no `pg` client and no connection pool** (a fact C8 re-verified and this contract inherits).

**Forbidden, explicitly:** an application-level loop that revokes sessions one at a time and calls that "atomic". A partially applied forced logout that reports success is worse than a failure, because the operator believes the account is secured.

## 11. Failure semantics **[D]**

Codes and envelope reuse `adminError` exactly as `/api/admin/rbac/roles/route.ts` does — C11 invents no new error shape.

| Condition | Status | Code |
|---|---|---|
| No identity | 401 | `UNAUTHORIZED` |
| Identity, no permission | 403 | `FORBIDDEN` |
| Non-corporate identity | 403 | `FORBIDDEN` (F-10C boundary, unchanged) |
| Owner Gate failed | 403 | `FORBIDDEN` |
| Target user does not exist | 404 | `NOT_FOUND` |
| Malformed body/params | 422 | `VALIDATION_ERROR` |
| Cross-origin mutation | 403 | `FORBIDDEN` (`isSameOrigin`, as in every mutating admin route) |
| Rate limited | 429 | `RATE_LIMITED` + `Retry-After` |
| Database failure | 500 | `INTERNAL_ERROR`, message **generic** |

**No error may leak:** whether a given `user_id` exists to an *unauthorized* caller (authorization is evaluated before existence), session ids belonging to other users, token material, or internal SQL text. `console.error` keeps details server-side, as the existing handlers already do.

## 12. Security invariants — written to be mutation-tested **[D]**

| # | Invariant |
|---|---|
| **I-1** | A revoked session cannot authenticate a subsequent request *(enforcement window governed by [O-1])* |
| **I-2** | Session validity is checked **inside identity resolution**, before authorization, and **never** substitutes for it — a valid session grants nothing by itself |
| **I-3** | Listing sessions requires `security.sessions.read`; no caller can enumerate another subject's sessions without it |
| **I-4** | Revocation requires `security.sessions.revoke`; the Owner Gate and the F-10C corporate boundary both run first |
| **I-4a** | A revoke or forced logout targeting the **Ultimate Owner** fails, even for a `super_admin` holding the permission |
| **I-12** | No C11 read or write ever touches a session whose subject has `is_anonymous = true` |
| **I-5** | No response, log line, audit entry or error ever contains an access token, refresh token or cookie value |
| **I-6** | Repeated revocation is idempotent and never reports a second revocation |
| **I-7** | Forced logout affects **exactly one** subject; no interleaving revokes another user's session |
| **I-8** | A session created *after* a revoke-all begins remains active (§9) |
| **I-9** | No new session is ever created in `revoked` state |
| **I-10** | Every revocation attempt — allowed **or denied** — produces exactly one audit entry |
| **I-11** | C11 adds no permission check that could admit a request C4 would deny |

## 13. Audit — reuses C7, adds no second system **[D] · names [R]**

`writeAuditLog` (`src/lib/admin/audit.ts:45`) into the C7 hash-chained `audit_log`. Proposed action names, following the existing `<area>.<event>` convention (`rbac.role_granted`, `owner.super_admin_granted`):

| Action | When |
|---|---|
| `session.listed` | an inventory read succeeds |
| `session.revoked` | a specific session is revoked |
| `session.force_logout` | all sessions for a subject are revoked |
| `session.revoke_denied` | an attempt is refused (403) |

Each entry carries actor (id + role via `auditActorRole`), target `user_id`, target session id **where one was specified**, result, count revoked, reason (forced logout), and timestamp. Authorization denials also flow through `auditAuthorizationDecision`, which C4 already wires — C11 must not duplicate that path.

## 14. Events (C8) — **not in v1** **[P]**

C8 exists and is deployed, so `session.revoked` is an obvious candidate event. It is **excluded from v1** deliberately: C8 has **zero consumers**, and its §9c refuse-the-tick policy means a future consumer without a handler halts the whole drain. Publishing an event nobody consumes adds risk and no capability. If the Owner wants it, it is a separate, small decision — and it would need a producer `SECURITY DEFINER` function calling `fn_outbox_publish` in the same transaction (C8 §5).

## 15. Rate limiting — reuses C10 **[D]**

`distributedRateLimit(key, limit, windowMs)`, fail-closed, `Retry-After` on 429 — identical to every admin route.

| Operation | Proposed limit | Rationale |
|---|---|---|
| list sessions | `100 / 60s` per admin | matches existing read routes |
| revoke session | `20 / 60s` per admin | matches `rbac:grant`, the closest-risk precedent |
| forced logout | `10 / 60s` per admin | strictly tighter — it is the highest-blast-radius operation in the component |

## 16. API surface **[P-7 for permissions]**

Handler contract per `21_Coding_Standards.md` §2, unchanged: **RBAC → origin → rate-limit → validate → operation → audit → uniform envelope**.

| Method | Path | Permission | Body/params |
|---|---|---|---|
| `GET` | `/api/admin/security/sessions?userId=&state=&limit=&cursor=` | `security.sessions.read` | — |
| `DELETE` | `/api/admin/security/sessions/[sessionId]` | `security.sessions.revoke` | — |
| `POST` | `/api/admin/security/sessions/force-logout` | `security.sessions.revoke` | `{ userId, reason }` |

`export const dynamic = 'force-dynamic'` on all three (they read auth headers). Mutations require `isSameOrigin`.

**Response shape** — the inventory returns only: `id`, `userId`, `state`, `createdAt`, `lastRefreshedAt`, `expiresAt`, `aal`, `clientClass`. Nothing else. That list *is* the contract; adding a field is a contract change.

## 17. Permissions **[R — P-7 ratified]**

Two new entries in the C3 registry (`src/lib/admin/permissions/registry.ts`), plus a `REGISTRY_VERSION` bump so cached permission sets are discarded — the mechanism the registry already documents.

| Permission | Module | Category | Risk | Ratified `defaultRoles` |
|---|---|---|---|---|
| `security.sessions.read` | security | read | medium | `super_admin`, `admin` |
| `security.sessions.revoke` | security | write | **high** | `super_admin` only |

Rationale for the asymmetry: the closest precedent, `security.roles.grant`, is `super_admin`-only, and ending another person's sessions is comparable in blast radius. **Ratified 2026-08-13.**

**No new role, no new rank, no change to C6, no change to the PDP.** The only C1–C10 edit this component requires is *adding two rows to the registry*, which is the registry's documented extension point ("New modules add entries when they ship").

## 18. Decision order — C11's exact position **[D]**

```
1. identity        getRequestUser → auth.getUser()   ← C11 session validity lives HERE
2. Owner Gate      checkOwnerGate()                    (unchanged)
3. authorization   permissionEngine.authorize()        (unchanged, C3/C4)
```

C11 inserts **inside step 1 only**. It cannot admit anything step 3 would deny (**I-11**), and it must never be consulted *instead of* step 3. This preserves the order Components 1–4 pinned with tests.

## 19. Contract-source audit

| # | Behaviour | Authoritative source | Enforcing artifact | Test |
|---|---|---|---|---|
| 1 | Session = GoTrue session identified by `session_id` | `@supabase/auth-js@2.108.2` required-claims declaration | — (model) | contract test asserting the claim is required |
| 2 | C11 never creates/refreshes/expires sessions | `middleware.ts`, `getRequestUser.ts` | absence of any session-minting code | architecture assertion: no C11 module calls `signInWith*` |
| 3 | Revocation enforced at identity resolution | `getRequestUser.ts` (round-trip on both paths) | `getRequestUser` | runtime test **once [O-1] is answered** |
| 4 | Decision order identity → Owner Gate → authorization | `guards.ts:96-109`; C3/C4 contracts | `requirePermission` | existing order tests + new I-2/I-11 tests |
| 5 | Authorization via the PDP, no parallel model | C3 registry; C4 single-decision-path | `registry.ts` entries | `singleDecisionPath.test.ts` (existing) + registry test |
| 6 | Audit via C7 chain | `audit.ts:45`; C7 contract | `writeAuditLog` | audit-entry test per action, incl. denial (**I-10**) |
| 7 | Rate limiting via C10 | C10 contract §§7–8 | `distributedRateLimit` | route contract test with a real limiter |
| 8 | Multi-row revocation atomic in one SQL function | C8 §5 (no `pg` client, PostgREST-only) | `fn_session_revoke_all` (proposed) | embedded-postgres runtime test |
| 9 | Terminal states never reopen | §4, C8 terminal-state precedent | SQL predicate | runtime test + mutation |
| 10 | Idempotent repeats | §8 | SQL function return count | runtime test + mutation |
| 11 | Revoke-all does not lock the account | §9 | operation defined over a snapshot set | runtime test (**I-8**) |
| 12 | No credential material ever exposed | §3.3, ADR-019 grant model | response projection + table grants | invariant test (**I-5**) scanning every response field |
| 13 | Inventory source | ⛔ **[O-3]** — blocked, §20 | — | — |
| 14 | Immediate vs eventual revocation | ⛔ **[O-1]** — blocked, §20 | — | — |
| 15 | Owner target protection | §5.1.1 · Component 1 `platform_owner` authority | handler pre-check **and** SQL function predicate | invariant **I-4a**, mutation-tested by deleting the predicate |
| 16 | Anonymous exclusion | §6.1 · `auth.users.is_anonymous` (verified in `20260808c`) | `is_anonymous = false` filter on every read and write | invariant **I-12** |
| 17 | Revoke-all snapshot boundary | §4.1 | single statement in one SQL function | runtime test: a session created mid-operation survives (**I-8**) |

**Rows 13 and 14 have no source. That is why this contract is a draft and not a specification.**

## 20. ⛔ BLOCKED — the three experiments cannot be run from this machine

The Owner ratified P-1…P-7 and directed that O-1/O-2/O-3 be **resolved empirically in a non-production Supabase environment**, explicitly forbidding both guessing and production testing. That instruction is correct, and it cannot be carried out here.

### 20.1 What was checked, and what was found

| Requirement | Measured result |
|---|---|
| A non-production Supabase **project** | **None exists.** The only Supabase URL anywhere in this working copy — `.env.local`, `.env.local.example` — is `fwznnobrdctuskgrvuik.supabase.co`, which **is production** (it is the project `/api/version` and the live app serve from) |
| A **local** Supabase stack (`supabase start`, which runs `gotrue`) | **Cannot start.** `supabase status` → `docker: command not found (podman also not found) — install Docker Desktop or Podman`. `docker`, `docker info` and `podman` are all absent from PATH. `supabase/config.toml` does not exist; the local stack was never initialised here |
| Supabase CLI itself | present (2.114.0) — but every `start` path is container-based |
| The embedded-postgres harness | present and working (it runs C8's runtime suite), but it provides **PostgreSQL only**. GoTrue is a separate service, and `auth.sessions` is *created by GoTrue*, not by any migration in this repository. The harness hand-stubs `auth.users` in its PRELUDE precisely because the real auth schema is not there |

### 20.2 Why each item stays open

**O-1 — immediate vs eventual revocation.** The experiment requires a live GoTrue: sign in, capture a still-valid access token, revoke the session, re-call `auth.getUser()` with the same token. There is no GoTrue to sign into except production's, and creating and revoking a session there is a production mutation. **Not attempted.**

**O-2 — access-token TTL.** Conditional on O-1, and in any case it is a Supabase Auth *setting*, absent from this repository. It must be read from the project's configuration, and if the non-production project's value differs from production's, both must be recorded — a TTL that is only true in staging is not a security guarantee.

**O-3 — may C11 read `auth.sessions`.** Option **A** is ratified *subject to technical verification*, and the verification needs a GoTrue-provisioned `auth` schema to inspect: which columns exist, whether a `SECURITY DEFINER` function can read them, and whether the six checks in the Owner's brief hold. PostgreSQL alone cannot answer it, because the table would not exist. **Measured, unchanged:** zero references to `auth.sessions` / `auth.refresh_tokens` anywhere in `src/` or `supabase/`.

### 20.3 Any of three unblocks all of it

| Path | What it gives | Cost |
|---|---|---|
| **1. Install Docker Desktop** (or Podman) | `supabase init && supabase start` brings up a local GoTrue **and** a real `auth` schema. O-1, O-2 and O-3 all become answerable here, with **zero** contact with production. Best option — it also gives every future auth-touching component a real test target | one install |
| **2. A throwaway Supabase project** | Same answers against hosted GoTrue, which is what production actually runs. Needs URL + anon key + service-role key placed in a local `.env.staging` (**not** pasted into chat) | one free project |
| **3. The Owner runs the experiment** | Fastest if a non-production project already exists elsewhere. A ready-to-run script is prepared and refuses to execute against the production project reference | ~5 minutes |

### 20.4 The experiment, specified exactly

So that whoever runs it produces an unambiguous answer:

1. In a **non-production** project, sign in a throwaway account (`signInWithPassword` or `signInAnonymously`).
2. Capture `session.access_token` and `session.session_id`; assert `getUser(token)` → **200**.
3. Revoke: `supabase.auth.admin.signOut(access_token, 'global')` using that project's service-role key.
4. **Immediately** — well inside the token's lifetime — call `getUser(token)` again.
5. Record the HTTP status and error code verbatim.

| Result | Meaning | Consequence for C11 |
|---|---|---|
| **401 / 403** | GoTrue validates the session behind the token | Revocation is **immediate**. §5.2 stands as written, no per-request database check is added, and TTL is *not* the guarantee (O-2 closes as "not applicable") |
| **200** | The access token outlives its session | Revocation is **eventual**, bounded by the TTL. C11 must then add the minimum enforcement needed to honour the ratified guarantee, on the hot path of every authenticated request — a materially larger component that must not be shipped by accident |

Step 3 also yields O-3's answer for free: with a live `auth` schema, `information_schema.columns` and `has_table_privilege` settle which fields exist and whether a definer function can read them.

### 20.5 What has NOT been done, deliberately

No implementation, no migration, no endpoint, no auth-path change, no mirror table, and no assumed answer to any of the three. Per the Owner's own instruction — *"If `auth.sessions` cannot provide a truthful inventory, HARD STOP and report exactly what is missing rather than inventing a substitute"* — this section is that report.

---

## 21. Self-audit against C3/C4/C6/C7/C8/C9b/C10

| Check | Result |
|---|---|
| Duplicate authorization model | **None** — two registry rows, PDP unchanged |
| C6 changed | **No** — readiness untouched; C8 §9c's precedent respected |
| C4 bypassable | **No** — §18 keeps C11 inside identity; **I-11** is a test |
| Duplicate audit system | **None** — C7 `writeAuditLog` only |
| Duplicate rate limiter | **None** — C10 only |
| Client-specific security semantics | **None** — `Actor.source` is *recorded*, never used to decide |
| Plaintext token storage | **None** — §3.3, **I-5** |
| Unnecessary personal data | Constrained by **[R] P-6**; IP and raw user-agent withheld, nothing new collected |
| Transaction ambiguity | Resolved — §10, one SQL function, no app-level loop |
| Undefined race behaviour | Resolved — §9, including revoke-all vs new sign-in |
| Frozen-client impact | **None in v1** — admin surface only, **[R] P-5** |
| F-10 | Untouched; `authorizeDepartmentResource` keeps 0 runtime callers |

**One conflict found and deliberately left visible:** §5.2's enforcement claim depends on [O-1]. Everything else in this contract survives either answer; §5.2 does not.

## 22. Supabase Auth dependency — ADR required before implementation **[R, conditional]**

Option **A** (a `SECURITY DEFINER` function reading `auth.sessions`) is ratified *subject to technical verification*. Because it couples Controller V2 to a schema this project does not own, the Owner required an ADR, and it must be written **once O-3 is verified** — not before, since its central claims are exactly what verification establishes. It must record:

| Must state | Why |
|---|---|
| Why the coupling exists | no alternative source is truthful — see the mirror-table rejection below |
| Why a mirror table is rejected | nothing populates it. GoTrue fires no hook this app receives, so it would be wrong the moment a session is created outside the app's knowledge, and **a silently incomplete inventory is worse than none** |
| Which columns are assumed, and their observed types | the assumption set is the blast radius of an upstream change |
| What happens when the upstream schema changes | the failure must be **loud**: the function fails, the endpoint 500s, and a test goes red — never a silently empty inventory |
| How incompatibility is detected | a runtime test asserting the assumed columns exist with the assumed types, so a Supabase upgrade breaks CI rather than production |

This follows ADR-020, which already exists precisely because repository-baseline objects that no migration creates need their assumptions written down.
