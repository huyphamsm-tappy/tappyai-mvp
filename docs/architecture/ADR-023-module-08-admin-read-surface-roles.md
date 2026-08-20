# ADR-023 — `moderator` may read the Module 08 user surface; `ban_reason` and email search may not

**Status:** Accepted
**Date:** 2026-08-20
**Context:** Controller V2 Phase 2 — Module 08 User Management, admin write surface (PR #119)
**Supersedes:** the `GET /api/admin/users` and `GET /api/admin/users/[id]` permission lines of `docs/backoffice/05_API_Architecture.md` §6, for those two endpoints only
**Related:** [ADR-022 account status isolation](ADR-022-account-status-isolation.md) · `docs/backoffice/12_RBAC.md` §3 · `docs/backoffice/10_User_Management.md` §3.9, §6 · `docs/backoffice/04_Database_Architecture.md` §8 · `docs/controller-v2/BACKLOG.md` BL-C3-02 · Owner Decision A, 2026-08-20

---

## Background

Module 08's admin write surface needs a read surface: an administrator cannot suspend an account they cannot find. Implementing the two read endpoints surfaced a contradiction inside the approved architecture set that had never been resolved because no code had needed to resolve it.

`00_Constitution.md` §4 lists the documents but establishes precedence for exactly one of them — itself. `05`, `10` and `12` all carry `Version 1.0`, `Status: DRAFT — Awaiting Owner Approval`, dated 2026-07-13. **No document in the conflict outranks another by status, version or date.** The conflict therefore could not be resolved by reading the hierarchy; it required an Owner decision.

## Problem statement

Four sources speak to who may read the Module 08 user surface. Three say `moderator`; one says `admin`.

| Source | Clause | Says |
|---|---|---|
| `12_RBAC.md` §3 | **User List — View** | analyst ❌ · **moderator ✅** · admin ✅ · super_admin ✅ |
| `12_RBAC.md` §3 | **User — View full profile** | analyst ❌ · **moderator ✅ (masked email)** · admin ✅ · super_admin ✅ |
| `10_User_Management.md` §6 | Email masking policy | `moderator` sees `h***@gmail.com` — a rule that presupposes a moderator can open the view |
| `04_Database_Architecture.md` §8 | `account_status` access matrix | *"Back office roles (`moderator`+) … `12_RBAC.md`"* — already merged with PR #117 |
| `05_API_Architecture.md` §6 | `GET /api/admin/users`, `GET /api/admin/users/[id]` | **Permissions:** `admin` or higher |

Two further facts bounded the question:

1. **The conflict covers two permissions, not four.** `05` §6 itself assigns `POST …/suspend` and `POST …/unsuspend` to *"`moderator` or higher"*, matching `10` §3.9 and `12` §3. Only the two READ endpoints were contested. Ban, unban and unmasked-email access are `admin`+ in every source and were never in question.
2. **`05` §6 is internally inconsistent.** It grants `moderator` the authority to suspend an account while denying them the ability to look one up — an action with no reachable subject.

## Decision

**Owner Decision A, 2026-08-20.** Three parts.

### A — `moderator` holds `users.list.read` and `users.detail.read`

`12_RBAC.md` §3 is followed. `05` §6's *"admin or higher"* on those two endpoints is recorded as stale and corrected to *"`moderator` or higher"*.

`analyst` is admitted to neither. `12` §3 denies them every User Management row, and they hold no user-management duty in `10` §3.9.

### A(a) — `ban_reason` is `admin`+, behind its own permission

A `moderator` reaching the detail view does **not** read the internal moderation note. They can neither ban nor unban, so no action of theirs is informed by it, and `00_Constitution.md` **Rule 9 — Privacy by Default** (*"Minimum data access per role. No role sees data it does not need to perform its function."*) settles the rest.

Implemented as a **separate** permission, `users.ban_reason.read`, not as a reuse of `users.email.read_full`. The two fields carry different data classifications — an address is user PII under `10` §6; the `33_Privacy_Data_Governance.md` §3 classification of `ban_reason` remains an open Owner decision (ADR-022) — and a single permission covering both would make that future answer unable to move one field without moving the other.

The ban itself stays visible. Withholding the *note* must not withhold the *standing* it explains.

### A(b) — searching by email address requires `users.email.read_full`

A `q` containing `@` triggers an exact-address lookup. That is not "viewing" an address, but it answers *"does this address have an account here?"* — an existence oracle over exactly the data `10` §6 withholds from `moderator`.

It is gated on the permission that already governs reading a full address, so the two cannot drift apart. The refusal is decided **before** the directory is consulted: a check performed after the lookup would still have performed it, and response timing would answer the question anyway.

Name search is unaffected. The gate is on addresses, not on the search box.

## Classification under `00_Constitution.md` §8.2

This is a **Design Change**, not Editorial Errata, and this ADR is what §8.2 and §7 require.

Errata is defined as *"alignment of stale text to an **already-approved** ADR"*. No approved ADR governed this question, and §8.2 adds: *"If there is any doubt whether a change is Editorial or Design, it is treated as a **Design Change**."* A change to who may read user PII is a security decision under any reading.

## Consequences

**The `moderator` role stops being a copy of `analyst`.** Before this decision both held 4 permissions and were identical. `moderator` now holds 8.

This directly affects **BL-C3-02** (*"Should `moderator` keep analytics read access?"*), whose argument rests on the premise *"`analyst` and `moderator` hold **identical** permission sets"* and which names its own trigger: *"Natural moment to decide: when the Moderation Hub ships and `moderator` gains permissions of its own, making the two roles genuinely distinct."* **That premise is now false and that moment has arrived.** BL-C3-02 is not decided here; it is unblocked and should be taken up on its own terms.

**What a `moderator` can do after this ADR:** find a consumer account, open it, read its standing and suspension expiry, and suspend or unsuspend it. Every mutation writes `audit_log`.

**What a `moderator` still cannot do:** ban, unban, read a full email address, search by email address, read a ban reason, soft-delete, force logout, or reach any account-status row except through the service-role API — `account_status` grants no PostgREST role any write, and `ban_reason` no read at all (ADR-022).

**Enforcement mechanism.** Both field gates are permissions evaluated by the PDP via `permissionEngine.can`, never role comparisons. A role comparison in a handler would be a second authorization decision path, which Component 4 exists to prevent and `singleDecisionPath.test.ts` fails on. The email-search refusal goes through `auditAuthorizationDecision`, so it is the PDP's own audited denial rather than a bare 403 that leaves no trace.

**Registry.** `REGISTRY_VERSION` → `2026-08-20.2`. Eight permissions under module `users`.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Follow `05` §6 — read is `admin`+ | Contradicts three sources including one already merged (`04` §8), and leaves `moderator` holding a suspend power with no way to reach a subject. Would also have required removing suspend/unsuspend from `moderator`, contradicting `05` §6 itself. |
| Treat the fix as Editorial Errata | §8.2 permits errata only as alignment to an already-approved ADR, and requires doubt to resolve toward Design Change. Who reads user PII is a security decision. |
| Gate `ban_reason` on `users.email.read_full` | Conflates user PII with an internal moderation note whose classification is still open. One permission would prevent the `33` §3 answer from moving either field independently. |
| Mask `ban_reason` the way email is masked | A half-shown moderation note is misleading, not safer. There is no partial form that is more useful than absence. |
| Let email search fall back to name search | Silently answers a different question than the one typed. A refusal states the boundary; a silent fallback hides it. |
| Leave the email-search oracle open | `moderator` is denied address reads by `10` §6; confirming an address exists is a channel over the same data. |

## What this ADR does NOT change

- **`12_RBAC.md` §3** — followed, not amended. Every row it states for User Management is implemented exactly, including its denials.
- **`10_User_Management.md` §3.9 and §6** — unchanged. Suspend/unsuspend at `moderator`, ban/unban at `admin`, email masked below `admin` are all as written.
- **`04_Database_Architecture.md` §8** — unchanged. Its `moderator`+ band is what this ADR confirms.
- **The `33` §3 classification of `ban_reason`** — still an open Owner decision. This ADR decides only who may read it *through the admin surface*, which is a narrower question and does not pre-empt the classification.
- **`12_RBAC.md` §2's inheritance model.** That ladder was replaced by union semantics in Controller V2 Component 3; this ADR neither restores nor re-litigates it.
- **BL-C3-02.** Unblocked, not answered.
- **Ban semantics.** A ban still does not revoke sessions. That gap is unchanged and is recorded in `10` §4 and in the API response.
- **Anything outside the two read endpoints.** No route, permission, or role edge beyond those named above.
