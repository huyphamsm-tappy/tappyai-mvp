# Controller V2 — Owner Decisions, 2026-08-13

**Status:** DECISION RECORD — authoritative and current
**Baseline at decision time:** `origin/main` = `bef923cb4a3083b9ea700d566983cf219c6de808` · production `/api/version` = same
**Input:** the Completion & Roadmap Audit and the Owner Decision Package presented 2026-08-13
**Authority:** these five decisions were made by the Owner. They are recorded verbatim in effect, not reinterpreted.

---

## Why this record exists

Controller V2 had an approved **scope** — Phase 1, Blocks A+B+C, Components 1–11, owner approval 2026-08-03 — but no statement of what **"complete"** means, no verdict on Component 10, and no position on whether CI checks should block merges. Five questions were put to the Owner. All five are now answered.

---

## The decisions

### A — Definition of Done: **COMPONENT-COMPLETE**

Controller V2 is **COMPLETE** when Components **C1–C11** are complete according to their actual contracts/specifications, their applicable gates pass, and the production verification required by each component is satisfied.

Technical debt that lies **outside** C1–C11 must **not** silently become a blocker for Controller V2 completion. It remains tracked, and is scheduled on its own merits.

### B — Component 10: **REQUIRE C10 SPEC FIRST**

C10 is **not** accepted on the strength of the existing implementation. It must pass through:

`SPEC → REQUIREMENTS → IMPLEMENTATION AUDIT → TEST COVERAGE → VERIFICATION → DOCUMENTED VERDICT`

The contract is now written: [`10_COMPONENT10_RATE_LIMITING_CONTRACT.md`](10_COMPONENT10_RATE_LIMITING_CONTRACT.md).

> This decision proved load-bearing. The Completion Audit had reported *"no Component 10 spec exists"*. That was wrong — [`03_PHASE1_FOUNDATION_DESIGN.md`](03_PHASE1_FOUNDATION_DESIGN.md) defines C10 as *"Shared store; real global caps (closes S4)"*, and **S4 is an open HIGH finding**. Accepting the current implementation would have silently closed it.

### C — Required checks on `main`: **ENABLE**

Branch or ruleset protection is to be configured on `main` so that **Regression Gate**, **Architecture Guard** and **Brand registry validation** are *required*, with no bypass outside an approved policy.

Measured at decision time: `branches/main/protection` → **404 "Branch not protected"**, `/rulesets` → empty. The repository is public and the token holds `admin`, so this is a genuine absence, not a permissions artifact. Until it is configured, CI-01 runs but does not block.

**Not yet executed.** This is a repository-settings change and is scheduled separately; it is not a C1–C11 blocker under Decision A.

### D — BL-002 (G1 production validation): **DEFER**

BL-002 stays in the backlog. Under Decision A it does not gate Controller V2 completion.

Recorded constraint, so the deferral is understood rather than merely inherited: the only `super_admin` in production is `huypham.sm@gmail.com`, which is **not** an `@tappyai.com` identity. The Option B corporate boundary therefore returns **403 at the identity layer before `requireOwner()` is reached**, so running the test today would produce a 403 for the wrong reason and prove nothing. Closing BL-002 would require temporarily granting `super_admin` to a corporate identity — a real production privilege mutation, requiring its own authorization.

### E — Component 7 Owner UAT: **ACCEPT EXISTING PRODUCTION EVIDENCE**

C7 Audit Hardening is accepted on implementation + production evidence + automated tests. A separate manual Owner UAT is **not** a prerequisite.

Evidence of record: merged `f3caf59`, live in production; hash chain active with `seq` 1–15 contiguous, no gaps, `prev_hash` null only at genesis, zero null `row_hash`; 102 tests executing the real `.sql` against a real PostgreSQL.

---

## Consequences

1. **Controller V2 is NOT COMPLETE.** Remaining in-scope components: **C6** (partial), **C8**, **C9b**, **C10** (contract now written), **C11**.
2. **C10 is NOT DONE** and is blocked on Owner infrastructure provisioning — see the contract, §11.
3. **C7 is complete** for the purposes of Decision A.
4. **BL-002, required checks, ADR-017 service-role hardening, and all `BL-*` backlog items are non-blocking** under Decision A. They remain open and tracked.
5. One manual Owner UAT remains: the **final production acceptance** after C1–C11 are individually complete. No intermediate Owner approval gates are to be manufactured.

## Still pending — not decided here

| Item | Needs |
|---|---|
| ~~C10 failure behaviour~~ | ✅ **RESOLVED 2026-08-13 — FAIL-CLOSED.** A shared-store outage blocks admin operations rather than silently dropping the cap. No break-glass exception; a future one is a separate authorized decision. See contract §8 |
| **C10 infrastructure** — Upstash provisioning + two environment variables | Owner action; blocks C10 implementation. See contract §11 |
| **C10 scope question** — whether the `docs/backoffice` DRAFT limit classes ever become binding | Not required by any approved source; recorded only so the omission is deliberate |
| **C8 / C9b / C11 ordering** | No design documents exist for these three, so their dependency order is **not determinable from repository evidence** and must not be guessed |

## Not in scope, and not reopened

**Resource Enforcement** and **F-11** are untouched by these decisions. Resource Enforcement remains a separate future capability — not a defect of FOUNDATION-10, which is CLOSED under Decision C / Option 1 (`navigation/context scoped + role/PDP secured`). `authorizeDepartmentResource` still has **0 runtime callers**. **F-11 does not exist** anywhere in this repository.
