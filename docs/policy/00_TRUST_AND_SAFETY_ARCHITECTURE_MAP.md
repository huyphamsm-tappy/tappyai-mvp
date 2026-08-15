# TappyAI Policy Architecture — Document Map & Architecture Boundary

> **STATUS: ACTIVE.** This document defines *what will be written and where the
> edges are*. It is the gate before any of the sixteen architecture documents is
> drafted. **Architecture only — no implementation, at any stage covered by this
> map.**
>
> **B-1 … B-5 are DECIDED and RATIFIED** (Owner, 2026-08-15), carried into
> [`01_GOVERNANCE.md`](01_GOVERNANCE.md), which is **RATIFIED**. §2.4, §3.1 and
> §6 below record the decisions rather than pose them.

**Project:** Policy Architecture — TappyAI **Trust & Safety**.
**Date:** 2026-08-15 · **Base commit:** `906c254`

### Group status

| Group | Status |
|---|---|
| **01 — Governance** | 🟢 **RATIFIED** (Owner, 2026-08-15, v1.0) — [`01_GOVERNANCE.md`](01_GOVERNANCE.md) |
| **02 — Policy Taxonomy** | 🟡 **NOT STARTED** — requires a separate Owner instruction |
| **03 … 16** | 🟡 **NOT STARTED** |
| Technical contracts | 🔴 **NOT AUTHORIZED** |
| Policy implementation | 🔴 **NOT AUTHORIZED** |

---

## 1. Scope correction

An earlier draft in this directory interpreted "Policy Architecture" as
authorization policy — PDP, RBAC, RLS, member-route access. **That reading was
wrong and has been discarded** (commit `856f3e3`, never pushed, never merged).

Authorization is **Controller V2**, and Controller V2 is **closed** at C1–C11.
This project does not reopen it, does not modify it, and does not touch
`pg_policy`, RLS, or member-route authorization.

One artefact is carried forward: the **Policy-as-data Source / Provider /
Engine** pattern, extracted as a domain-neutral precedent in
[`PRECEDENT_POLICY_AS_DATA.md`](PRECEDENT_POLICY_AS_DATA.md). It is a reusable
architectural pattern, not a commitment to use it anywhere in particular.

---

## 2. Architecture boundary

### 2.1 What Policy Architecture governs

The rules TappyAI applies to **user conduct and user-generated content**, and
the machinery that detects, decides, enforces, reviews, reverses, and records
those rules. Its subjects are TappyAI's own users and the content they create:
video reviews, comments, profiles, avatars, music tracks, uploads, chat
conduct, and deals.

### 2.2 What it explicitly does not govern

| Not in scope | Owned by |
|---|---|
| Authorization, RBAC, permissions, the PDP | Controller V2 (**closed**, C1–C11) |
| Row-Level Security, `pg_policy`, member-route access predicates | Controller V2 / data layer |
| Who may *use the moderation tools* | Controller V2 C3/C4 — T&S **consumes** these roles, never defines its own |
| Session revocation mechanics | Controller V2 C11 — T&S **invokes** it as an enforcement effect |
| Rate limiting mechanics | Controller V2 C10 |
| Protecting users from **external** scam URLs | `src/lib/scam-shield/` — see §4.3 |

### 2.3 The seam to Controller V2 — consume, never modify

Controller V2 is the substrate. T&S is a consumer of it and **no T&S document
may propose a change to C1–C11**. Where a T&S need appears to require one, the
document records it as a dependency for the Owner, and stops.

| T&S needs | Controller V2 provides (in production) |
|---|---|
| Tamper-evident record of every moderation decision | **C7** hash-chained `audit_log` |
| Fan-out of safety events without coupling | **C8** transactional outbox (mechanism only — no producers or consumers yet) |
| Abuse-resistant reporting endpoints | **C10** distributed rate limiter |
| Reviewer/moderator/admin authority | **C3/C4** permission registry + the one PDP |
| "Suspend user" actually ending their access | **C11** session revocation (measured immediate) |
| Owner as the final, unconstrained authority | **C1/C2** Platform Owner |

### 2.4 The governance boundary — **B-1, DECIDED / RATIFIED**

> **RESOLVED (Owner, 2026-08-15) — option B-1a, in the refined form ratified in
> [`01_GOVERNANCE.md`](01_GOVERNANCE.md) §2.** T&S Policy is a **separate
> authoritative domain**. Controller/Security Governance, Back Office
> Governance and Trust & Safety Policy Governance are **peers** under TappyAI
> Product / Company Governance. `docs/policy/` is authoritative for T&S; the
> Back Office Constitution is supreme **within its own domain only** and does
> not govern T&S policy. The analysis below is retained as the reasoning that
> led to the decision.

`docs/backoffice/00_Constitution.md` (v1.1, **APPROVED**) declares itself *"the
supreme governing law of the TappyAI Back Office Platform"* and states it
*"overrides any conflicting instruction, memory, or preference."* Its Rule 1 is
"no code without an approved architecture document"; Rule 2 forbids scope
expansion. It names the "Moderation team (content safety)" as one of the
platform's served audiences, and `docs/backoffice/11_Moderation.md` sits inside
that approved doc set.

But Trust & Safety is **wider than the Back Office**. Reporting, blocking,
in-app notices, and appeals are *product* surfaces on Web, Android and iOS —
outside the Back Office's stated remit.

Three options, and this is the Owner's call, not the architecture's:

| | Option | Consequence |
|---|---|---|
| **B-1a** | `docs/policy/` is a **peer** doc set with its own governance | Cleanest for product-side T&S; requires deciding precedence when it and the Constitution disagree |
| **B-1b** | `docs/policy/` sits **under** the Back Office Constitution | Inherits an approved governance model immediately; every T&S change then needs an ADR in `22_Architecture_Decision_Records.md`, and product-side surfaces are governed by a Back Office document |
| **B-1c** | Split: Back Office keeps operator-facing tooling; `docs/policy/` owns policy, product surfaces and cross-platform contracts | Matches reality most closely; costs the most in cross-referencing |

~~Nothing further should be drafted until B-1 is answered~~ — **answered**:
Group 01 wrote the governance model rather than inheriting one, and it is
ratified.

---

## 3. Relationship to `docs/backoffice/11_Moderation.md`

This document already exists, is **v1.0 DRAFT — Awaiting Owner Approval**
(2026-07-13), and materially overlaps six of the sixteen groups.

**It has never been built.** Evidence at `906c254`:

- `moderation_queue` and `moderation_actions` appear in **no migration**
- moderation appears in `src/` only in i18n strings and one navigation test
- the only report endpoint in the entire API is
  `src/app/api/music/tracks/[id]/report/route.ts`
- of the columns it depends on, only `is_hidden` exists

So it is a design that was never ratified and never implemented. It is an
input, not a constraint — but it is a *good* input and its core principle
(§4.1) should survive.

### 3.1 A contradiction inside it — **B-2, DECIDED / RATIFIED**

> **RESOLVED (Owner, 2026-08-15).** Neither extreme was adopted. **Bounded
> automated action is permitted**, governed by reversibility: the lower the
> certainty, the more reversible the action must be; the more permanent the
> action, the higher the evidence and authority required. There is **no
> automated path to permanent termination**, and no single signal source
> suffices for it. See [`01_GOVERNANCE.md`](01_GOVERNANCE.md) §10 (R0–R3,
> GA-1 … GA-10). The contradiction below is retained as the reason the question
> was raised.

Section 2 states the core principle:

> AI will **never** automatically ban users, hide content, or take
> consequential action without a human moderator approving the action.

Section 11 then states:

> **Exception:** If AI confidence > 0.95, content may be temporarily hidden
> pending review. This is the ONLY case of automated action.

These cannot both be the rule. Whether automated interim action exists at all
is a governance decision, not a detail — it determines whether Group 1's
principle is absolute or qualified, and everything in Groups 6, 8 and 9
inherits the answer. ~~**B-2 must be resolved in Group 1 before Group 6 is
drafted.**~~ — **resolved in Group 01 §10, ratified.**

---

## 4. Current state — what exists to build on

### 4.1 The principle worth keeping

> **AI assists. Humans decide.** — `11_Moderation.md` §2

### 4.2 Documents that already own part of the territory

| Existing document | Overlaps group | Status |
|---|---|---|
| `backoffice/00_Constitution.md` | G1 Governance | **APPROVED** v1.1 |
| `backoffice/11_Moderation.md` | G2, G3, G4, G8, G9, G10 | DRAFT, unapproved, unbuilt |
| `backoffice/13_Audit_Log.md` | G11 Evidence/Audit/Legal | in the approved set |
| `backoffice/33_Privacy_Data_Governance.md` | G12 Privacy | in the approved set |
| `backoffice/34_Data_Retention_Policy.md` | G12 Privacy | in the approved set |
| `backoffice/19_Security.md`, `28_API_Governance.md`, `29_Database_Governance.md` | G13, G15 | in the approved set |
| `architecture/AI_PLATFORM.md` + CI Architecture Guard | G13 Model Governance | **enforced in CI** |

Groups 5, 7, 14, 15 and 16 have **no existing document at all**.

### 4.3 `src/lib/scam-shield/` — the engine shape already exists

Shipped and in production, with a structure that maps almost exactly onto
Groups 6 and 11:

| Part | Role |
|---|---|
| `providers/` + `registry.ts` + `circuitBreaker.ts` | independent signal sources, degradable |
| `engine/riskEngine.ts` | weighted signals → score 0–100, **plus a confidence derived from how much provider coverage actually completed** |
| `engine/levels.ts` + `config.ts` | score → `RiskLevel` by declared thresholds |
| `engine/actionEngine.ts` | level → recommended actions, bilingual labels |
| `engine/evidenceEngine.ts` | the evidence behind the score |

**But its subject is the opposite of T&S's.** Scam-shield protects a TappyAI
user *from external content*; Trust & Safety governs *TappyAI users' own
content and conduct*. Advice to a user carries no due-process burden;
enforcement against a user carries all of it.

**Reuse the shape, never the semantics.** In particular, scam-shield's
separation of *score* from *confidence-given-partial-coverage* is directly
relevant to Group 6: a moderation decision made while three of five detectors
timed out is not the same decision, and the architecture should be able to say
so.

---

## 5. The sixteen documents

Numbering follows the group order given by the Owner. Each is a separate
document in `docs/policy/`.

| # | Document | Purpose | Prior art | Gate |
|---|---|---|---|---|
| **01** | [`01_GOVERNANCE.md`](01_GOVERNANCE.md) | Who owns policy, how it changes, precedence over/under the Constitution, the "AI assists, humans decide" principle and its limits | `backoffice/00_Constitution.md` | 🟢 **RATIFIED** 2026-08-15 — B-1 … B-5 settled here |
| **02** | `02_POLICY_TAXONOMY.md` | The violation categories themselves, their definitions, severity tiers, and the stable identifiers everything else references | `11_Moderation.md` §3, §11 | after 01 |
| **03** | `03_MODERATION_ARCHITECTURE.md` | End-to-end pipeline: ingest → detect → score → route → decide → enforce → record | `11_Moderation.md` (reconcile) | after 02 |
| **04** | `04_MULTIMODAL_DETECTION.md` | Text, image, video, audio detection; per-modality capability and failure modes; TappyAI is video-first, so video is the hard case | `11_Moderation.md` §11 (text+image sketch only) | after 03 |
| **05** | `05_CONTEXT_AND_CULTURAL_INTELLIGENCE.md` | Vietnamese-first reality: language, diacritics, code-switching, regional slang, sarcasm, and why a generic classifier under-performs here | none | after 02 |
| **06** | `06_RISK_AND_DECISION_ENGINE.md` | Signals → score → severity → routing; confidence under partial detector coverage; the policy-as-data question | `scam-shield/engine/*`, [`PRECEDENT_POLICY_AS_DATA.md`](PRECEDENT_POLICY_AS_DATA.md) | after 02, 04, 05 |
| **07** | `07_USER_REPORT_BLOCK_ABUSE.md` | Reporting, blocking, muting; abuse *of* the reporting system (brigading, retaliation) | one endpoint exists | after 02 |
| **08** | `08_HUMAN_REVIEW.md` | Queue, prioritisation, case model, reviewer roles via C3/C4, reviewer wellbeing, quality sampling | `11_Moderation.md` §5–6 | after 03, 06 |
| **09** | `09_ENFORCEMENT.md` | The action ladder — notice, warning, hide, restrict, suspend, ban — proportionality, and how enforcement reaches C11 | `11_Moderation.md` §6–8 | after 08 |
| **10** | `10_APPEAL.md` | Due process: notice, right to appeal, reversal, restoration. **Deliberately not deferred** — `11_Moderation.md` §9 called this "future"; the map treats it as mandatory | `11_Moderation.md` §9 | after 09 |
| **11** | `11_EVIDENCE_AUDIT_LEGAL.md` | What is captured, how it is made tamper-evident via C7, retention, chain of custody, lawful requests | `backoffice/13_Audit_Log.md`, C7 | after 09 |
| **12** | `12_PRIVACY_AND_DATA_GOVERNANCE.md` | Minimisation, reporter identity, access controls on evidence, cross-border, reconciliation with the two existing privacy documents | `backoffice/33`, `34` | after 11 |
| **13** | `13_MODEL_AND_POLICY_GOVERNANCE.md` | Versioning of classifiers *and* of policy; change control; evaluation before rollout; drift | `AI_PLATFORM.md` + CI guard | after 06 |
| **14** | `14_TESTING_AND_RED_TEAM.md` | Golden sets, adversarial evaluation, evasion, measurement of false positives/negatives as first-class metrics | none | after 13 |
| **15** | `15_INCIDENT_AND_COMPLIANCE.md` | Safety incident response, severity, escalation, regulatory posture (see **B-3**) | none | after 11, 14 |
| **16** | `16_CONTROLLER_INTEGRATION_AND_ROADMAP.md` | Exactly which C1–C11 services are consumed and how; sequencing; what must exist before anything is built | Controller V2 | last |

### 5.1 Dependency order

```
01 Governance  (B-1, B-2)
      ↓
02 Policy Taxonomy ──────────┬──────────────┬────────────┐
      ↓                      ↓              ↓            ↓
03 Moderation Arch      05 Context      07 Report    (12 Privacy inputs)
      ↓                      ↓
04 Multimodal ───────→ 06 Risk & Decision Engine ──→ 13 Model Governance
                             ↓                              ↓
                       08 Human Review              14 Testing / Red Team
                             ↓                              ↓
                       09 Enforcement                       │
                          ↓        ↓                        │
                    10 Appeal   11 Evidence ──→ 12 Privacy  │
                                     ↓                      ↓
                                    15 Incident & Compliance
                                             ↓
                              16 Controller Integration & Roadmap
```

Group 02 is the keystone: taxonomy identifiers are referenced by detection,
scoring, enforcement, appeal and evidence. If it is drafted loosely, every
later document inherits the looseness.

---

## 6. Owner decisions — **all DECIDED / RATIFIED (2026-08-15)**

These five blocked drafting. All are now settled and carried into
[`01_GOVERNANCE.md`](01_GOVERNANCE.md), which is **RATIFIED**.

| | Decision | Ratified outcome |
|---|---|---|
| **B-1** | Governance relationship between `docs/policy/` and the Back Office Constitution | ✅ **DECIDED / RATIFIED** — **separate authoritative domain**; peer branches under Product / Company Governance; the Constitution is supreme within its own domain only (Group 01 §2) |
| **B-2** | Is "AI never acts without a human" absolute, or qualified? | ✅ **DECIDED / RATIFIED** — **bounded automated action permitted**, governed by reversibility; **no automated path to permanent termination**; no single signal source suffices for it (Group 01 §10, R0–R3, GA-1 … GA-10) |
| **B-3** | Regulatory posture | ✅ **DECIDED / RATIFIED** — **no compliance claim, no invented statutory obligations**; `LEGAL REVIEW REQUIRED` where interpretation is needed; evidence is **not** claimed legally admissible (Group 01 §15, EV-7). Seven legal questions remain open as **G01-L-01 … G01-L-07** |
| **B-4** | Status of `backoffice/11_Moderation.md` | ✅ **DECIDED / RATIFIED** — **preserved as prior design input**; not deleted, not authoritative, not promoted. Its principle *"AI assists. Humans decide."* adopted in the refined form at Group 01 §10 (Group 01 §2.4) |
| **B-5** | Does T&S cover AI-generated output? | ✅ **DECIDED / RATIFIED** — **yes.** Five content classes distinguished: UGC · AI-Generated · AI-Assisted · Mixed · External/Third-Party, which do **not** share policies, thresholds or evidence requirements (Group 01 §4.3) |

**Ratification did not close anything else.** Group 01 carries **G01-D-05 …
G01-D-18** (open Owner decisions) and **G01-L-01 … G01-L-07** (open legal
questions). **G01-D-19** — the PROP-1 erasure-language contradiction — is
**RESOLVED — OWNER APPROVED**; the ratified appeal principle is
**REVERSAL ≠ ERASURE**. This map does not track those registers; Group 01 §24
and §25 are authoritative for them.

---

## 7. Non-goals

- **No implementation.** No schema, no endpoints, no code, at any point in this map.
- **No change to Controller V2**, and no reopening of C1–C11.
- **No RLS, `pg_policy`, or member-route authorization work.**
- **No invented legal or regulatory requirements** (B-3).
- **No new permission model.** Reviewer authority comes from C3/C4 or it does not exist.
- **No vendor selection.** Detection capability is described by requirement, not by product name.

---

## 8. Sequencing

**Completed.** Group 01 was drafted first and carried **B-1** and **B-2** to
resolution. It is **RATIFIED** (Owner, 2026-08-15, v1.0), and B-1 … B-5 are
authoritative.

**Next.** Group 02 — Policy Taxonomy, the keystone (§5.1). It is
🟡 **NOT STARTED** and requires a **separate Owner instruction**. Ratifying
Group 01 does not authorise it.

Technical contracts and implementation remain 🔴 **NOT AUTHORIZED**.
