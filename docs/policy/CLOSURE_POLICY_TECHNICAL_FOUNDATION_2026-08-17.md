# Closure — Policy Technical Foundation

**Date:** 2026-08-17
**Repository:** `tappyai-memberapi` · branch `docs/policy-trust-safety-map` · HEAD `45dd8b1`
**Status:** POLICY TECHNICAL FOUNDATION = COMPLETE · POLICY WORKSTREAM = CLOSED

> 🚨 **THIS DOCUMENT IS NOT CORPUS.** It records the state of an implementation.
> It asserts no policy semantics, creates no authority, resolves no decision, and
> is subordinate to `01_GOVERNANCE.md` and `02_POLICY_TAXONOMY.md` in every
> respect. Where anything here appears to differ from the corpus, **the corpus
> governs.** Neither corpus file was modified by any of the work it describes.

---

## 1. Purpose

The Policy foundation exists as a **preventive risk foundation for Explore**. It
was built deliberately **before** large-scale production evidence existed,
because the alternative — waiting for incidents to reveal what is needed — means
building safety machinery under pressure, after harm.

**Technical readiness is not real-world validation.** These are two separate
gates and this document closes only the first:

| Gate | Meaning | State |
|---|---|---|
| Technical readiness | The machinery exists, is conservative, and is tested against the corpus | **COMPLETE** |
| Real-world validation | The machinery has been calibrated against real TappyAI cases | **NOT STARTED** — and not required for the above |

Real user cases are **future calibration evidence**, not a prerequisite. Nothing
in this foundation has been validated against production data, and nothing in it
claims to have been.

---

## 2. Final 18/18 status matrix

Derived from `POLICY_REGISTRY` and `POLICY_TECHNICAL_STATUS`, not from memory.
Every policy appears exactly once: **6 + 11 + 1 = 18.**

| # | Policy | Status | Machine classification possible today? | Dependency |
|---|---|---|---|---|
| 1 | `ts.violence.graphic-harm` | IMPLEMENTED | Not yet — no signal source | A detector for glorification / shock-primacy |
| 2 | `ts.violence.incitement-threats` | EVIDENCE_GATED | No | `CORROBORATED` — second independent basis |
| 3 | `ts.selfharm.promotion` | EVIDENCE_GATED | No | `HUMAN_REQUIRED` — human reviewer |
| 4 | `ts.danger.harmful-activity` | IMPLEMENTED | Not yet — no signal source | A detector for encouragement to imitate |
| 5 | `ts.graphic.presentation` | IMPLEMENTED | Not yet — no signal source | A presentation-event signal from a surface |
| 6 | `ts.child.sexual-exploitation` | EVIDENCE_GATED | No | `HUMAN_REQUIRED` (+ `LEGALLY_SENSITIVE`, `RESTRICTED_HANDLING`) |
| 7 | `ts.child.sexualization` | EVIDENCE_GATED | No | as above |
| 8 | `ts.child.grooming` | EVIDENCE_GATED | No | as above |
| 9 | `ts.child.abuse-harm` | EVIDENCE_GATED | No | as above |
| 10 | `ts.sexual.exploitation-nonconsent` | EVIDENCE_GATED | No | `CORROBORATED` + `RESTRICTED_HANDLING` |
| 11 | `ts.sexual.adult-content` | IMPLEMENTED | Not yet — no signal source | A declared required-conditions set |
| 12 | `ts.harassment.targeted` | EVIDENCE_GATED | No | `CORROBORATED` |
| 13 | `ts.hate.protected-target-abuse` | **LEGAL_BLOCKED** | No | `G02-D-07b` / `PROTECTED_TARGET_SET` |
| 14 | `ts.privacy.personal-information` | IMPLEMENTED | **Partly — wired to Explore** | Consent evidence for the positive path |
| 15 | `ts.animal.cruelty` | IMPLEMENTED | Not yet — no signal source | Human judgement of gratuitousness |
| 16 | `ts.deception.harmful` | EVIDENCE_GATED | No | `CORROBORATED` |
| 17 | `ts.fraud.scam` | EVIDENCE_GATED | No | `CORROBORATED` |
| 18 | `ts.platform.abuse-manipulation` | EVIDENCE_GATED | No | `CORROBORATED` |

**Counts:** IMPLEMENTED 6 · EVIDENCE_GATED 11 · LEGAL_BLOCKED 1 = **18**.
No duplicate, no missing policy, no policy invented. `evidenceGate.test.ts`
asserts the matrix is set-identical to the registry.

> 🔑 **"IMPLEMENTED" means the machinery is complete and safe, not that it
> detects things today.** Five of the six have no signal source yet, so they
> answer `UNDETERMINED`. That is the designed behaviour, not an omission.

---

## 3. Implemented policies

Six policies carry a constitutive predicate. All share one shape: a single
constitutive field, three-valued (`established` / `not established` / **could not
be established**), with the corpus's own `Does not govern` items resolved in the
signal layer rather than as a `defeatingContext` — a defeating context would
yield `APPLICABLE_NO_VIOLATION` where the corpus yields `NOT_APPLICABLE`.

| Policy | Constitutive element (from the corpus) |
|---|---|
| `ts.violence.graphic-harm` | Glorification or shock-primacy — *not* the presence of injury or blood |
| `ts.danger.harmful-activity` | Presented as encouragement to imitate — *not* risk alone |
| `ts.graphic.presentation` | `NOT_VIEWER_INITIATED` viewing of the assessed item — *not* intensity |
| `ts.sexual.adult-content` | Absence of the required presentation conditions — *not* explicitness |
| `ts.animal.cruelty` | Gratuitousness relative to purpose — *not* the presence of an animal |
| `ts.privacy.personal-information` | Governed exposure without established consent |

**The safety invariant, common to all six and enforced structurally:**

```
missing or insufficient evidence  →  UNDETERMINED
missing evidence                  →  NEVER a violation
detector or engine failure        →  NEVER a violation
uncertainty                       →  NEVER silently "safe"
stale result                      →  neither reused, nor softened, nor hardened
```

Each policy has exactly one code path that can produce a finding, and it requires
the decisive element to be positively established. Exhaustive tests walk the
whole finite signal space of each predicate to prove no other path exists.

---

## 4. Evidence-gated policies

Eleven policies carry a full constitutive definition **and** an evidence gate.
The gate is **one-directional**: it can turn a would-be finding into uncertainty,
and it can never create or strengthen a finding.

This follows the corpus's own wording, which gates the **conclusion of a
violation** and does not bar the machine from establishing that a policy is *not*
constituted. So a carve-out can still clear content with no evidence at all.

### A. Human review — 5 policies

`ts.child.sexual-exploitation` · `ts.child.sexualization` · `ts.child.grooming` ·
`ts.child.abuse-harm` · `ts.selfharm.promotion`

Corpus: *"No violation may be concluded without human review, regardless of
confidence."*

- The machine **must never** conclude a violation. No volume of machine evidence
  substitutes for the reviewer.
- The machine **may** establish non-violation where the corpus permits it.
- Otherwise: `UNDETERMINED`, with the gate reporting `HUMAN_REVIEW_REQUIRED`.

`HUMAN_REVIEW_REQUIRED` travels **beside** a decision. It is not a §4 outcome
class and none was invented.

### B. Corroboration — 6 policies

`ts.violence.incitement-threats` · `ts.sexual.exploitation-nonconsent` ·
`ts.harassment.targeted` · `ts.deception.harmful` · `ts.fraud.scam` ·
`ts.platform.abuse-manipulation`

Corpus: *"More than one independent basis required before a violation may be
concluded."*

- One source is insufficient.
- **Duplicate signals from the same source are not independent** — bases are
  counted by distinct source identifier.
- **Conflicting evidence remains `UNDETERMINED`**, because the corpus specifies
  no other outcome for disagreement.
- No second source is fabricated anywhere.

---

## 5. Legal boundary

`ts.hate.protected-target-abuse` is **LEGAL_BLOCKED** by
**`G02-D-07b` / `PROTECTED_TARGET_SET`**.

- **Legal has not resolved this.** The blocker is an appointment blocker as much
  as a legal one: no Legal Reviewer has been appointed, so no one currently holds
  the authority to answer.
- **No protected-target set was invented.** The policy has no constitutive
  definition in any implementation file.
- **No Legal inference was made.**
- **No allow, deny or violation behaviour was created.** However the policy is
  asked, it yields neither `VIOLATION` nor `NOT_APPLICABLE`; it carries the
  blocker id and resolves to `UNDECIDABLE_LEGAL_BLOCKED`, kept deliberately
  distinct from ordinary uncertainty so the Legal boundary stays visible.

---

## 6. Special corpus safety rules found during implementation

Two corpus rules changed the design. Both are recorded here as they are; no
further interpretation is added.

**CS-0.3 — a purpose claim does not excuse constituted conduct.** The corpus
records that an exploitative behaviour *presented as* education, documentation or
research remains a violation. Because the shared resolver checks carve-outs
before the decisive element, declaring purpose carve-outs on those policies would
have let a claimed purpose acquit established conduct. All child-safety policies
therefore declare no carve-outs, and purpose operates where the corpus puts it —
at the earlier question of what happened. `ts.animal.cruelty` is empty for the
same structural reason: its `Does not govern` items are legitimate *purposes*,
and its constitutive element is gratuitousness *relative to* purpose.

**OUT-3 — self-harm disclosure is not a violation.** For
`ts.selfharm.promotion`, the corpus assigns support-seeking and personal
disclosure the outcome `APPLICABLE_NO_VIOLATION`, response-warranted — not
`NOT_APPLICABLE`, and never a violation. The corpus states that treating
disclosure as a violation is itself a foreseeable harm, and that the policy is
written to make that structurally impossible. The implementation reproduces that
outcome through existing engine inputs. The response itself belongs to Group 09
and is not named.

---

## 7. P1 Explore status

`ts.privacy.personal-information` is connected to the real Explore feed
(`/api/reviews/feed`).

Current behaviour: **observation-only**. No persistence · no user-visible policy
field · no change to ranking, ordering, visibility or recommendation · no
notification · no moderation · no enforcement. The observation result is computed
and discarded, because storage is not approved.

**Measured impact** (not estimated): approximately **+0.1 ms CPU per request** at
the route's maximum page size, and approximately **+12.1 kB gzip** on the route
bundle.

> ⚠️ **This is not a production safety system.** It is one policy, observing, with
> its output discarded and its positive path unreachable for want of consent
> evidence. Describing it as content screening would misstate the capability.

---

## 8. Other Explore policies

**Only P1 is connected to the Explore feed.** The other seventeen are not.

They were deliberately **not** connected: the production signals their decisive
elements require do not exist in the feed, and wiring them would add cost per
request to produce `UNDETERMINED` for every row — coverage in appearance only.
**No signal was invented to make them run.**

---

## 9. Validation evidence

Last verified state, 2026-08-17:

| Check | Result |
|---|---|
| Policy tests | **662 / 662 PASS** (16 files) |
| Adjacent Explore suites | **447 / 447 PASS** |
| TypeScript | **0 errors** |
| Architecture guard | **8 / 8** |
| `audit-09d` | **CLEAN** |
| `gate66-phase0` | **NO DRIFT** |
| `verify-policy-foundation` | **VERIFIED** |
| Enforcement token scan | **0** |
| Mutation testing (cumulative) | **26 / 26 killed** |
| Corpus | **unchanged** |
| Legal boundary | **unchanged** |
| Enforcement · Group 06 · Group 09 | **OFF · OFF · OFF** |

Mutation testing is recorded because green tests alone are not evidence. Every
mutation was applied to real source, the suites were run, and each source file
was restored and byte-compared afterwards.

---

## 10. Generator note

The registry generator's dry run currently reports `WOULD UPDATE`. Measured
cause: the generated `generatedAt` date only. Source hash and byte count are
identical; the diff is confined to that one field per record.

**This is not policy drift**, and the generator and `registry.ts` were not
modified as part of this closure.

---

## 11. Privacy / data boundary

**Not approved, and not created:** observation storage · new database table ·
new database column · `user_events` sink · `audit_log` sink · retention policy ·
User Report · moderation queue · enforcement.

**No new persistence was introduced by the Policy foundation.** The module
performs no database writes, constructs no client, makes no network call, and
schedules nothing. No raw content, audio, private payload, PII or service-role
data is logged anywhere.

---

## 12. Enforcement boundary

The entire foundation preserves **classification ≠ action**.

Enforcement **OFF** · Group 06 **OFF** · Group 09 **OFF**.

No hide · block · delete · warn · suspend · ban · ranking change ·
recommendation change · notification · moderation · appeal · access restriction.

A source scan across the whole policy module finds no enforcement identifier, and
every Explore presentation state maps to `RENDER_UNCHANGED` — written out state
by state, so changing one is a visible edit.

---

## 13. Future calibration — not blockers

The following are **future calibration and evidence stages**. None of them means
the technical foundation is incomplete:

- Real TappyAI user cases
- Production evidence at usable volume
- False-positive measurement
- False-negative measurement
- Signal refinement
- Additional evidence sources
- Independent corroboration sources
- Human-review capability
- Legal resolution of `G02-D-07b`

The foundation was built specifically so these can arrive later and be absorbed,
rather than being prerequisites for starting.

---

## 14. Reopen conditions

Reopen the Policy workstream when one of the following occurs. No dates or
numeric thresholds are set here, because none has been decided.

- A new Legal decision, in particular resolution of `G02-D-07b`
- A new Product or UX requirement that changes policy semantics
- A real-world safety pattern that requires detector refinement
- A new evidence source becoming available
- A measured false-positive or false-negative problem
- An approved reporting or human-review capability
- A major Explore architecture change affecting policy signals

Absent one of these, the workstream stays closed.

---

## 15. Final status

**POLICY TECHNICAL FOUNDATION = COMPLETE**

**POLICY WORKSTREAM = CLOSED**

**NEXT SCOPE = NOT STARTED** — to be selected separately by the Product Owner.
