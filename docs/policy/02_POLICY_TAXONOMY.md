# TappyAI Trust & Safety — Group 02: Policy Taxonomy

> # GROUP 02 POLICY TAXONOMY IS NOT RATIFIED.
>
> **STATUS: OWNER-REVIEW DRAFT.** Architecture only. No detection algorithm, no
> model, no threshold, no scoring formula, no enforcement, no schema, no
> runtime code, no migration, and no change to Controller V2.

**Project:** TappyAI Policy / Trust & Safety · **Group:** 02 — Policy Taxonomy
**Date:** 2026-08-15 · **Governs under:** [`01_GOVERNANCE.md`](01_GOVERNANCE.md) (**RATIFIED**, v1.0, `45dd8b1`)
**Map:** [`00_TRUST_AND_SAFETY_ARCHITECTURE_MAP.md`](00_TRUST_AND_SAFETY_ARCHITECTURE_MAP.md)

**Lifecycle position:** `POLICY ARCHITECTURE → GROUP 02 POLICY TAXONOMY → DRAFTED → SELF-AUDITED → **OWNER REVIEW REQUIRED**`

---

## 1. What this document is

The taxonomy is the vocabulary the rest of Trust & Safety speaks. Detection,
context, risk, decision, enforcement, appeal, evidence and testing all reference
it, so an imprecision here is inherited everywhere.

It defines **what TappyAI recognises as a policy concept**. It does not define
how anything is detected, scored, or acted upon.

**Domain note.** This is Trust & Safety policy — content and conduct. It is
**not** authorization policy: not the PDP, RBAC, RLS, the permission registry,
resource authorization, or member access control. Those belong to Controller V2,
which is closed. The abandoned authorization-policy draft is not revisited.

Inherited and binding from Group 01: **B-1**…**B-5**, the Policy / Model /
Decision / Controller separation (§3), **SCOPE-1** (every policy states its
content classes), **EV-2** (provenance), **MG-1** (policy version ≠ model
version), and **REVERSAL ≠ ERASURE**.

---

## 2. The foundational principle

> **A violation is not a property of content. It is a conclusion about an act,
> in a context, against a protected interest.**

A flat category list — `violence`, `blood`, `animal`, `politics`, `religion` —
cannot express that, because every item in it is a **topic**, and a topic is an
observation about subject matter. Subject matter is not conduct.

The taxonomy therefore never asserts a violation directly. It **composes** one:

```
POLICY  applies  ⟺   BEHAVIOR is constituted
                  ∧  CONTEXT does not defeat it
                  ∧  the protected HARM is plausible
                  ∧  the policy's APPLICABILITY covers this subject
```

Topic appears nowhere in that formula. Its role is defined and bounded in §3.2.

### 2.1 Constitutive, not subtractive

The naive fix for "blood ≠ violation" is an exception list: prohibit graphic
content, then carve out food, medicine, journalism, history, art, culture… That
list is infinite, it encodes the exceptions someone happened to think of, and
**everything not on it is a violation by default** — which is precisely how
culturally unfamiliar practices get punished.

This taxonomy inverts it. **Context is part of what constitutes the behavior,
not a discount applied afterwards.**

`ts.animal.cruelty` is not "content showing an animal harmed, minus exceptions."
Its constitutive behavior is *inflicting suffering on an animal gratuitously,
for entertainment, or beyond what a legitimate purpose entails*. Slaughtering a
pig for food does not instantiate that behavior. It is not excused — **it never
enters the policy at all.** No exception is needed, because nothing was ever
constituted.

**Defeating contexts** (§6.3) still exist for genuine carve-outs, but they are
the minority instrument and every one must be justified.

### 2.2 Viewpoint neutrality

**VP-1.** No policy may be constituted by the **position taken**. Policies are
constituted by **behavior, target and harm** only. A taxonomy that can classify
a viewpoint as a violation is a censorship instrument, and none of the families
in §9 is permitted to become one.

---

## 3. The layer model

Six layers. Each answers a different question, and collapsing any two reproduces
the failure this taxonomy exists to prevent.

| Layer | Question | Can it establish a violation? |
|---|---|---|
| **L0 Subject** | What is being assessed? | No |
| **L1 Topic** | What is this *about*? | **Never** |
| **L2 Behavior** | What is being *done*? | Necessary, not sufficient |
| **L3 Context** | In what frame does it appear? | Can defeat; cannot alone establish |
| **L4 Harm** | What protected interest is at risk, to whom? | Necessary, not sufficient |
| **L5 Policy** | Which rule binds these into a judgement? | **Yes — only here** |

### 3.1 L0 — Subject

What the assessment is *about*: a content item, an actor/account, an
interaction, or a coordinated set of any of these. Policies declare which
subject types they reach; a policy about coordinated manipulation cannot be
evaluated against a single item in isolation.

### 3.2 L1 — Topic — descriptive, never dispositive

A topic is an **observation about subject matter**: *depicts blood*, *concerns
religion*, *mentions self-harm*, *shows an animal*.

**TOP-1.** A topic **may never be a sufficient condition** for any policy.
**TOP-2.** A topic's only sanctioned use is **candidate policy retrieval** —
narrowing which policies are worth evaluating.
**TOP-3.** A topic is recorded as an observation in the decision record and is
never recorded as a finding.

Topic is retained precisely *because* it is useful for routing and dangerous for
judging, and naming that split is what keeps a detector's output from becoming a
verdict.

### 3.3 L2 — Behavior — the atom of policy

A behavior is an **act**, expressed with an actor and an object: *inflicting
suffering on an animal for entertainment*; *threatening identifiable people with
violence*; *instructing others in methods of self-harm*.

**BEH-1.** Every policy names at least one constitutive behavior (WF-1).
**BEH-2.** A behavior is a verb phrase, never a noun-topic. "Violence" is not a
behavior; "depicting the infliction of violence in order to glorify it" is.
**BEH-3.** Behaviors are shared across policies where genuinely the same act.
Duplication is a taxonomy defect (WF-7).

### 3.4 L3 — Context — first-class, not an afterthought

Context is what distinguishes a surgical video from an atrocity video when both
show the same thing. It is a **constitutive input** (§6).

### 3.5 L4 — Harm — what is actually at risk

Every policy names the protected interest it exists to defend: physical safety,
**health**, psychological safety, dignity, privacy, **identity and
account-security**, financial security, **autonomy**, sexual autonomy,
child welfare, animal welfare, informational integrity, ecosystem integrity.

**HRM-0 — vocabulary extension (Owner, 2026-08-16).** Three interests were added
to the original ten: **health**, **autonomy** *(freedom from coercion and
exploitation)*, and **identity and account-security**. Reason, from the
expressibility test at §7.3.12: of the ratified harm classes only **H2** mapped
cleanly; **H1** was unmapped on *health*, **H3** on *identity and
account-security*, and **H4** had **no counterpart at all** — *sexual autonomy*
was the only autonomy listed, which the analysis found to be an **omission, not
an exclusion**. The extension is governed under **A1-B**: this is a controlled
list, extended only by an Owner decision recorded here, **never by
interpretation**. **H1–H5 are unchanged and are not reopened.**

**HRM-1.** A policy with no nameable harm is not a policy (WF-3). This is the
guard against "offensive but harmless" becoming enforceable.
**HRM-2.** Offence is not harm. Discomfort is not harm. Unfamiliarity is not
harm.

### 3.6 L5 — Policy — the only layer that judges

The rule that binds behavior, context, harm and applicability into a normative
statement, with an identity, a version, a severity class and an evidence
sensitivity.

---

## 4. Classification outcomes

Violation is **one** of several outcomes, and the non-violating ones are
first-class. A taxonomy able only to say "violation / no violation" forces false
positives whenever the world is uncertain.

| Outcome | Meaning |
|---|---|
| `OUT_OF_SCOPE` | Not a T&S subject at all |
| `NOT_APPLICABLE` | No policy's constitutive behavior is present. **The default.** Most content lands here, including most content that a topic detector flagged |
| `APPLICABLE_NO_VIOLATION` | The behavior is present, but context defeats it or the harm is not plausible. *A surgical video assessed against graphic-harm policy resolves here* |
| `VIOLATION` | Behavior constituted, no defeating context, harm plausible, applicability satisfied |
| `INSUFFICIENT_EVIDENCE` | The taxonomy applies but the record cannot support a conclusion. **Not a violation** |
| `DISPUTED` | The classification depends on a factual question that cannot presently be settled. **Not a violation** (§9.6) |
| `INDETERMINATE_CONTEXT` | The behavior is present and context is decisive but unreadable — commonly missing cultural or linguistic context. **Not a violation**, and a routing signal toward human review |

**OUT-1.** `INSUFFICIENT_EVIDENCE`, `DISPUTED` and `INDETERMINATE_CONTEXT` are
**terminal outcomes**, not soft violations. Nothing downstream may treat them as
diminished violations.

**OUT-2.** `APPLICABLE_NO_VIOLATION` is recorded, not discarded. It is how the
platform proves it considered a case and correctly declined to act.

**OUT-3 — Non-violating, response-warranted.** Some outcomes are not violations
yet warrant a supportive response — a person disclosing self-harm is the clearest
case. The taxonomy marks this as an attribute of the classification; **what the
response is belongs to Group 09**, and it must never be an enforcement action.

---

## 5. Well-formedness rules

These make the taxonomy **testable**. A policy failing any of them is malformed
and cannot be ratified. Group 14 can check them mechanically.

| | Rule |
|---|---|
| **WF-1** | Every policy names ≥ 1 constitutive **behavior** |
| **WF-2** | **No policy may name a topic as a sufficient condition.** A policy whose conditions reduce to topics is malformed. This is the structural guard against keyword classification |
| **WF-3** | Every policy names the **harm** it protects against |
| **WF-4** | Every policy states **what it does not govern** |
| **WF-5** | Every policy declares severity class, evidence sensitivity, disposition, applicability, content classes (SCOPE-1), identity and version |
| **WF-6** | **Defeating contexts** are enumerated and individually justified. A policy may declare none — child-safety policies do (§9.2) |
| **WF-7** | No two policies share the same *behavior × context × harm* triple without a declared **relationship** (§11) |
| **WF-8** | **VP-1** viewpoint neutrality holds |
| **WF-9** | Every policy is expressible in one sentence a reviewer can apply. Unexplainable is unenforceable |

### 5.1 Self-containment — ✅ **G02-D-09g-7, OWNER APPROVED (2026-08-15)**

> ## SC-1 — Every policy is a self-contained conformance unit for all declarations required by the applicable WF rules.

**SC-2.** A domain may provide shared **rationale, explanatory material, examples
or precedent**. **Domain-level material does NOT satisfy a policy's mandatory
declaration** unless the policy itself explicitly contains the required
declaration.

**SC-3 — No inheritance is authorised by this decision.** No inheritance
mechanism, **no domain identity**, **no domain versioning**, no dual citation and
no version propagation is created. **VER-T1 and VER-T2 are unchanged**, and
**WF-1 … WF-9 are unchanged** — SC-1 governs *where* their declarations live, not
what they require.

**SC-4 — Why Option A, precisely.** It is **the only architecture compatible with
the taxonomy's current identity and version machinery** without introducing a
domain identity and versioning system. Under inheritance, a domain declaration
could change the effective meaning of `ts.child.grooming@2` **without changing
the policy version a decision cites**, conflicting with the purpose of VER-T1 and
VER-T2. Full analysis: [`DECISION_G02-D-09g-7_RECORD_SHAPE.md`](DECISION_G02-D-09g-7_RECORD_SHAPE.md).

**SC-5 — This is a decision about the current architecture, not a claim that
Option A is universally superior.** Duplication is **not** held to be
intrinsically safe:

- self-contained records **reduce hidden propagation risk**;
- duplicated declarations **create drift risk**;
- **drift is to be addressed later through conformance checking and validation — never by silently introducing inheritance**;
- **D2 remains safety-critical and must not be weakened for convenience.**

That conformance mechanism is **not designed here**.

**SC-6 — Reconsideration path.** Domain inheritance may be reconsidered **only**
through a future versioned architecture decision that **first** establishes
domain identity semantics, domain version semantics, and historical
reconstruction. Absent all three, SC-1 governs.

**SC-7 — D2 boundary.** **`CS-0`, `CS-1` and `CS-2` are unchanged and are not
copied into the four D2 policies by this decision.** The D2 registry is **not**
restructured here. Existing domain-level CS material remains historical and
design input until a later, separately authorised conformance-remediation task,
at which point each D2 policy must carry its own required declarations.

**SC-8.** Approving SC-1 is **not** approval of registry remediation
(**G02-D-09g-6**).

---

## 6. Context model

### 6.1 Dimensions

Not every policy uses every dimension; each declares which are **decisive** for
it.

**Purpose** — educational · journalistic · documentary · medical/clinical ·
historical · scientific · artistic/fictional · satirical/parodic · culinary ·
commercial · religious/devotional · civic/political · personal expression ·
support-seeking · advocacy

**Actor & target** — intent (where legitimately inferable) · target
(identifiable person / group / protected characteristic / self / none) ·
relationship · consent, where relevant

**Setting** — audience · surface · public vs private · content class (§13) ·
**age context** (five states, §9.2 CS-3; `AGE_KNOWN` · `AGE_UNCERTAIN` ·
`AGE_UNAVAILABLE` · `AGE_INDICATORS_SUGGEST_MINOR` ·
`AGE_INSUFFICIENT_TO_ESTABLISH`) · **viewing initiation** (three states, added
2026-08-15; `VIEWER_INITIATED` · `NOT_VIEWER_INITIATED` ·
`INITIATION_UNAVAILABLE`)

**`viewing initiation`** — whether presentation of **the assessed content item**
began from an act by the viewer selecting **that item**.

- **`VIEWER_INITIATED`** — it did: the viewer opened the item, pressed play on
  it, or followed a link they themselves chose.
- **`NOT_VIEWER_INITIATED`** — it did not: automatic playback, playback begun by
  recommendation or by continuation, or presentation begun by the platform
  rather than by an act of the viewer.
- **`INITIATION_UNAVAILABLE`** — the presentation event cannot be observed or
  recorded sufficiently to establish either. Per **CTX-1** this yields
  **`INDETERMINATE_CONTEXT`**, never a violation.

**Guard.** The state **must be established from the presentation event and its
evidence**, and **may never be inferred from the imagery's subject matter, its
content class, its intensity, or the policy category under which the item was
retrieved** (TOP-1, TOP-2). It describes **how the item came to be presented**,
never whether any presentation handling was applied — it is **not** an
enforcement or remedy condition (Group 09 owns actions).

**Scope.** The element refers to **the content item assessed at L0 (§3.1)**; it
creates **no sub-item subject**. It is **available to any policy and required of
none** — no existing policy is amended by its addition.

**Cultural & linguistic** — language · dialect/regional variety · register ·
code-switching · culturally specific practice · euphemism · humour convention

**Temporal & geographic** — recency · ongoing-event status · jurisdictional
context (**LEGAL REVIEW REQUIRED** before any jurisdictional variance is
operative — §21)

### 6.2 Constitutive context — the default instrument

Context conditions written **into** the behavior definition, so non-qualifying
cases never enter the policy (§2.1).

### 6.3 Defeating context — the minority instrument

A genuine carve-out: behavior constituted, harm plausible, but a named context
defeats application. Each must be individually justified, and **child-safety
policies declare none** (§9.2).

### 6.4 Missing context is not adverse context

**CTX-1.** Absence of context is **not** evidence of violating context. Where
context is decisive and unreadable, the outcome is `INDETERMINATE_CONTEXT` —
never `VIOLATION`. This is the taxonomy-level expression of Group 01's **GA-9**
(uncertainty resolves toward containment) and **GA-10** (unavailability is not
evidence).

**CTX-2 — Cultural unfamiliarity is a property of the observer.** That a
practice is unfamiliar to a reviewer or absent from a model's training
distribution is a fact about the reader, never about the content. It may never
weigh toward violation.

---

## 7. Severity, confidence and risk — kept apart

Group 01 §10 requires these stay separate. The taxonomy owns exactly one.

| | Definition | Owner | Property of |
|---|---|---|---|
| **Severity** | How serious the **established** conduct or harm is, on the facts of the case | **This taxonomy** | **The established case**, within the envelope its policy permits (SEV-2) |
| **Confidence** | How strongly the evidence supports the classification | Detection / Evidence (Groups 04, 11) | This assessment |
| **Risk** | Decision-level exposure combining severity, confidence, context, uncertainty, impact | Risk & Decision Engine (Group 06) | This decision |

### 7.1 What severity is, and is not

**SEV-1 — Definition.** Severity describes the **potential seriousness of the
policy-relevant behavior once the taxonomy's constitutive elements are
established**. It presupposes constitution; it says nothing about whether
constitution occurred.

| | Severity is **not** | That is |
|---|---|---|
| **SEV-1.1** | "how sure the model is" | **Confidence** — Groups 04, 11 |
| **SEV-1.2** | "how exposed this decision is" | **Risk** — Group 06 |
| **SEV-1.3** | "what action should happen" | **Decision / Enforcement** — Groups 06, 09 |

**SEV-2 — Severity is assigned at case level.** *(Rewritten under **G02-D-09e**,
Owner decision 2026-08-15; the earlier text said severity was a property of the
behavior class and excluded instance variation.)*

| | |
|---|---|
| **SEV-2.1** | **The taxonomy does not assign one universal severity to every instance of a policy.** |
| **SEV-2.2** | A policy defines a **severity envelope** — the classes its constitutive definition can legitimately produce (§7.3.6a). |
| **SEV-2.3** | **Severity is assigned to the established case, after constitution.** |
| **SEV-2.4** | The **case's established dimensions** (D-a…D-g) determine the applicable class. |
| **SEV-2.5** | The policy definition **constrains which classes are plausible; it does not select the case's class.** |
| **SEV-2.6** | `SEVERITY_UNDETERMINED` exists **only after constitution**, where severity is applicable but cannot be reliably classified. |
| **SEV-2.7** | `INSUFFICIENT_EVIDENCE`, `DISPUTED` and `INDETERMINATE_CONTEXT` remain **pre-severity** outcomes. |

**SEV-2.8 — This is not a licence for risk semantics.** Case-level assignment
reads the **seven dimensions and nothing else**. It authorises no probability, no
likelihood, no urgency, no confidence, no report volume, no audience size and no
model score (SEV-4, SEV-8, SEV-9, and G02-D-09b/09c).

**SEV-3.** The taxonomy declares **no confidence and no risk**. A taxonomy that
declared confidence would be asserting something about evidence it has not seen.

**SEV-4 — Nothing numeric, nothing operative.** Group 02 defines **no** numeric
score, confidence threshold, risk formula, automatic action, quarantine
threshold, suspension threshold, removal threshold, or termination threshold.
None may be inferred from any ordering used here.

### 7.2 The class set — **DECIDED: Option B (S1–S4)**

**SEV-5 — RESOLVED, OWNER APPROVED (2026-08-15), G02-D-09a.** The class set is
**Option B**: four semantic classes **S1 BOUNDED · S2 SIGNIFICANT · S3 GRAVE ·
S4 CRITICAL**, defined in §7.3.6.

**SEV-6 — The five earlier labels are SUPERSEDED.** `MINIMAL` · `MODERATE` ·
`SERIOUS` · `SEVERE` · `CRITICAL` belonged to Option A, which was **not chosen**.
Every such label still appearing in §9 is **superseded vocabulary carrying no
meaning under S1–S4**, pending re-assignment under **G02-D-09d**. They do not map
across: **no later group may translate an Option A label into an S-class.**

**SEV-7.** Where the evidence does not support a reliable class, the outcome is
**`SEVERITY_UNDETERMINED`** (§7.3.6) or, at policy level, **OPEN under
G02-D-09d** — never an invented class and never a rounded one.

---

### 7.3 G02-D-09 — proposed severity model

> **STATUS: PROPOSED / SELF-AUDITED / OWNER REVIEW REQUIRED. NOT RATIFIED.**
> **§7.3.6 presents three materially different class sets and does not choose
> between them.** A recommendation is given; the choice is the Owner's.

#### 7.3.1 Where severity sits

```
POLICY CONCLUSION
      ↓
CONSTITUTIVE ELEMENTS ESTABLISHED
      ↓
SEVERITY                      ← Group 02 defines the meaning of this step only
      ↓
RISK / DECISION ENGINE        ← Group 06
      ↓
ENFORCEMENT                   ← Group 09
```

Severity answers **"how serious is the established policy-relevant conduct or
harm?"** It never answers **"how sure are we that it happened?"**

| | Rule |
|---|---|
| **SEV-8** | `HIGH CONFIDENCE ≠ HIGH SEVERITY` · `LOW CONFIDENCE ≠ LOW SEVERITY`. Confidence and severity are orthogonal, and a decision may sit at any combination of the two |
| **SEV-9** | `HIGH SEVERITY ≠ AUTOMATIC HIGH ENFORCEMENT` · `LOW SEVERITY ≠ AUTOMATIC NO ACTION`. Severity is an **input** to Group 06, never a decision |
| **SEV-10** | Severity is not policy applicability, not evidence quality, not reviewer authority, not probability, not certainty |

#### 7.3.2 Interpretive dimensions

**Qualitative interpretive dimensions only. No weights, no scores, no formula,
no mathematical combination, no ordering among the dimensions themselves.** They
are what a reviewer *thinks about*, not what a system computes.

| | Dimension | Meaning | Guard |
|---|---|---|---|
| **D-a** | **Magnitude of harm** | how grave the harm to the affected interest is | of the *established* harm, not the topic |
| **D-b** | **Irreversibility of the harm** | whether the harm to the affected subject can be undone | **Distinct from Group 01 R0–R3**, which is about the reversibility of *actions* (§7.3.5) |
| **D-c** | **Vulnerability of the affected subject** | **established circumstances** of the affected subject that materially increase impact | **Never** category membership. **Protected status is not a severity multiplier** (PT-8, PT-9). A child-related *topic* is not severity; where age is unresolved, **CS-5 governs and no vulnerability is inferred** |
| **D-d** | **Scope of impact** | one subject, a determinate group, or broadly | not audience size or view count (SEV-4) |
| **D-e** | **Persistence / duration** | whether the harm continues or recurs | |
| **D-f** | **Targeting** | directed at an identifiable subject, versus diffuse | targeting is not itself harm |
| **D-g** | **Exploitation or coercion** | abuse of power, dependency or constrained choice | Vulnerability or constrained choice must be established from the circumstances of the affected subject and must never be inferred solely from species, category, or status. |

**Two candidate dimensions were excluded by Owner decision. There are seven
dimensions, not nine.**

| | Excluded | Decision |
|---|---|---|
| **Immediacy** | ✅ **G02-D-09b = RESOLVED — OWNER APPROVED.** Belongs to **RISK / URGENCY**, not severity. *"How soon does harm require attention?"* is a different question from *"how serious is the established harm?"* — **a grave harm does not become less grave because its consequences arrive slowly.** **No immediacy component exists inside severity** |
| **Likelihood of serious consequences** | ✅ **G02-D-09c = RESOLVED — OWNER APPROVED.** Where "likelihood" means **probability**, it belongs to **RISK**. Severity concerns the seriousness of **established** harm; risk may later weigh the probability of future or uncertain consequences. **`likelihood ≠ severity`. No probability exists inside severity** |

#### 7.3.3 Severity presupposes constitution

**SEV-11 — No constitution, no severity.** Severity is evaluated **only after**
the policy conclusion has been established. Where nothing is constituted,
**no severity label is assigned at all** — not a low one.

**SEV-12 — Severity never decides constitution.** It may not be used, at any
point, to determine *whether* a policy was violated. It has no role before the
conclusion exists.

**SEV-13 — No topic is severe.** Not blood, not animals, not politics, not
religion, not a protected characteristic, not a child-related topic, not medical
imagery. Topics are topics (TOP-1, TOP-2, WF-2). Any severity model that can be
driven by a topic is malformed.

#### 7.3.4 Severity and uncertainty

**SEV-14 — Severity uncertainty ≠ policy uncertainty.**
**SEV-15.** `INSUFFICIENT_EVIDENCE`, `DISPUTED` and `INDETERMINATE_CONTEXT` are
**terminal non-violating outcomes** (OUT-1). They are **not low severity**, and
converting them into a severity label would manufacture a finding the taxonomy
declined to make.
**SEV-16.** Where a policy *is* constituted but the severity dimensions cannot
be read, severity is recorded as **undetermined** — which is not a level and not
a default to the bottom of the scale.

#### 7.3.5 Severity is not R0–R3

Related, distinct, and not to be collapsed.

| | Describes | Owner |
|---|---|---|
| **R0–R3** | reversibility of the **action** the platform might take | Group 01 §10 |
| **Severity** | seriousness of the **established conduct or harm** | this taxonomy |

**SEV-17.** High severity may warrant review without determining enforcement.
Low severity may still warrant containment in a later system. **That
relationship is Group 06 and Group 09 and is not defined here.**

#### 7.3.6 The severity classes — ✅ **OPTION B, OWNER APPROVED**

> ## G02-D-09a = RESOLVED — OWNER APPROVED (2026-08-15)
> **S1 BOUNDED · S2 SIGNIFICANT · S3 GRAVE · S4 CRITICAL.**
> **Semantic classes, not points.**

**SEV-18 — Not numbers.** S1–S4 may not be treated as scores. They may not be
summed, averaged, multiplied, weighted, converted to numerals, or arithmetically
combined with anything. The digits are ordinal labels, nothing more.

**SEV-19 — No dimension-count rule.** *"Three dimensions present ⇒ S3"* and every
variant of it is **prohibited**. The dimensions are **interpretive evidence** for
assigning a class, never inputs to a calculation.

**SEV-20 — Level of assignment.** *(Rewritten under **G02-D-09e**.)* The
**policy** declares a severity **envelope**; the **case** is assigned a class
within it, on its established dimensions (SEV-2). Variation between cases of the
same policy is **expected and correct** — it is *not* a risk input and *not* a
defect. What remains outside severity is probability, urgency and confidence
(SEV-2.8).

**SEV-21 — `S4` does not mean "95% confidence"; `S1` does not mean "low
confidence"; `S4` does not mean permanent suspension; `S1` does not mean no
action** (SEV-8, SEV-9).

---

##### S1 — BOUNDED

1. **What establishes it.** Established policy-relevant conduct or harm whose seriousness is **bounded** across the dimensions: limited in magnitude, substantially reversible, not directed at an identifiable subject, not exploiting dependency, not persisting.
2. **Distinguished from below.** Nothing lies below S1. **Below S1 is not a lower class — it is *not constituted*, and carries no severity at all** (SEV-11).
3. **What does NOT establish it.** Being the default. Being uncertain. Being a topic. **S1 is a positive finding of bounded seriousness, never a fallback.**
4. **Examples.** Constituted conduct with limited, reversible consequence and no identifiable target.
5. **What remains uncertain.** Where boundedness itself cannot be read, the outcome is `SEVERITY_UNDETERMINED` — **not S1**.

##### S2 — SIGNIFICANT

1. **What establishes it.** Materially significant consequences, or characteristics making the harm meaningfully more serious than S1 — typically harm **material to an identifiable subject**, or harm that **persists or recurs**, while remaining substantially reversible.
2. **Distinguished from S1.** Crosses when the harm becomes **material to a subject** (D-a with D-f), or **persists** (D-e), rather than remaining bounded and diffuse.
3. **What does NOT establish it.** Volume of reports (REP-2). How offensive it is. How widely it was seen. The identity of anyone involved.
4. **Examples.** Constituted targeted conduct causing meaningful but reversible harm to an identifiable person.
5. **What remains uncertain.** Where it cannot be determined whether harm reached a subject materially → `SEVERITY_UNDETERMINED`, not a rounded S1 or S3.

##### S3 — GRAVE

1. **What establishes it.** Serious consequences with **substantial irreversibility** (D-b), or **serious exploitation or coercion** (D-g), or **serious established vulnerability** (D-c), or comparably grave characteristics.
2. **Distinguished from S2.** Crosses on **substantial irreversibility, exploitation of dependency or constrained choice, or serious established vulnerability** — **not** on intensity of language, and **not** on how many dimensions are present (SEV-19).
3. **What does NOT establish it.** Protected status or category membership (PT-8, PT-9). Age uncertainty (CS-5). A sensitive topic (SEV-13). How upsetting the material is.
4. **Examples.** Constituted conduct causing harm the affected person cannot readily undo, or that exploits a dependency.
5. **What remains uncertain.** Where irreversibility or exploitation cannot be established, **do not round up**: S2 or `SEVERITY_UNDETERMINED` as the evidence supports.

##### S4 — CRITICAL

1. **What establishes it.** The highest seriousness boundary: consequences that are exceptionally severe, **harm to life or bodily integrity**, harm that is **irreversible for the affected subject**, or conduct that is **deeply exploitative or coercive** at the outer limit.
2. **Distinguished from S3.** S3 is **difficult** to reverse; **S4 is not reversible for the affected subject**, or reaches **life or bodily integrity**.
3. **What does NOT establish it.** The gravity of the *policy family* alone. Public attention. Topic sensitivity. Scope alone — breadth is D-d, not the S4 boundary.
4. **Examples.** Constituted conduct causing or directed at grave bodily harm; constituted exploitation at the outer boundary.
5. **What remains uncertain.** **S4 is never inferred from the seriousness of the domain.** If the established dimensions do not reach it, it is not S4.

---

##### 7.3.6a — `SEVERITY ENVELOPE` — ✅ **G02-D-09e, OWNER APPROVED**

> **Definition.** A **severity envelope** is the set or range of severity classes
> that a policy's constitutive definition can legitimately produce when its
> elements are established under different factual circumstances.

```
POLICY  → constitutive behavior + permissible severity ENVELOPE
CASE    → established facts + applicable dimensions
SEVERITY→ a single class, assigned to the established CASE
```

Written as `S2–S3`, `S3–S4`, `S4`, or `OPEN`.

| | Rule |
|---|---|
| **ENV-1** | **An envelope is not a case severity.** A policy with envelope `S2–S4` has no severity of its own; it permits three |
| **ENV-2** | **An envelope is never inferred mechanically from the number of dimensions** a policy engages (SEV-19) |
| **ENV-3** | **An envelope is not an enforcement threshold.** It authorises nothing (SEV-9) |
| **ENV-4** | A case may not be assigned a class **outside** its policy's envelope. If the facts appear to demand one, the **envelope is wrong** and is corrected by versioned taxonomy change (§12) — never by exceeding it in the case |
| **ENV-5** | A single-class envelope (e.g. `S4`) means the constitutive behavior does not admit meaningful variation — **not** that assignment is skipped. The case is still assigned, and may still be `SEVERITY_UNDETERMINED` |
| **ENV-6** | `OPEN` is not an envelope. It records that the taxonomy has not yet determined one (SEV-26) |
| **ENV-7** | **`NO_ENVELOPE` — the third state, added by `G02-D-02a` = **C**, Owner 2026-08-16.** A policy whose disposition is `RESTRICTED` **carries no severity envelope at taxonomy level**. Ground: `RESTRICTED` is *"permitted subject to conditions"* (§9.1), so **no harm is established**; every one of `D-a`…`D-g` keys on established harm, and `S1` demands a **positive finding of bounded seriousness, never a fallback**. 🚨 **`NO_ENVELOPE` is NOT `S1`, NOT `SEVERITY_UNDETERMINED`, and NOT `OPEN`.** It differs from `OPEN` exactly as `ENV-6` requires: `OPEN` means *"not yet determined"*, whereas `NO_ENVELOPE` means **the question does not arise for this policy class**. It differs from the outcome class `NOT_APPLICABLE` (§4), which is a **case** result, not an envelope. Where graphic or adult imagery co-occurs with a **constituted** violation, severity attaches to **that** violation’s policy — never to the `RESTRICTED` one. **Only `ts.graphic.presentation` and `ts.sexual.adult-content` hold this state today; it is not a fallback for any other policy** |

##### `SEVERITY_UNDETERMINED`

**SEV-22 — Case-level only. Not a fifth class.** It records that
**constitution has been established**, **severity is applicable**, and the
available established facts **do not support reliable selection among the
applicable S1–S4 classes**. It is not S1, not a fifth class, **not policy
`OPEN`**, and not taxonomy-level uncertainty (SEV-26, ENV-6).

**SEV-23.** It **is never S1**, never "low severity", and never the bottom of the
scale. Reading it as either is a defect.

**SEV-24.** It **must not automatically trigger, nor automatically prevent, any
downstream action.** What follows from it is Groups 06 and 09.

**SEV-25.** Where the evidence cannot distinguish **adjacent** classes, record
`SEVERITY_UNDETERMINED` rather than inventing precision. **Never round up, never
round down.**

**SEV-26 — Distinguish two different unknowns.** `SEVERITY_UNDETERMINED` is a
**case-level** outcome. A *policy* whose class has not yet been assigned is
**OPEN under G02-D-09d** — a taxonomy gap, not a case outcome.

##### Terminal outcomes are not severity

**SEV-27.** `INSUFFICIENT_EVIDENCE`, `DISPUTED` and `INDETERMINATE_CONTEXT` arise
**before** severity, where constitution itself is unresolved. They are **not
severity classes**, **not S1**, and must never be converted into one (OUT-1,
SEV-15).

#### 7.3.7 Test cases

Re-run against **S1–S4**. `—` = **severity does not apply at all**, because
nothing is constituted (SEV-11) — this is *not* S1 and *not*
`SEVERITY_UNDETERMINED`. Where severity *does* apply, **the class is not assigned
here**: that is **G02-D-09d**.

| | Case | Policy constituted? | Severity applies? | Uncertainty | Context |
|---|---|---|---|---|---|
| 1 | Tiết canh | **No** | **—** | none | culinary, cultural. **Blood is a topic** (SEV-13) |
| 2 | Trứng vịt lộn | **No** | **—** | none | culinary, cultural (VN-2) |
| 3 | Poultry/pig slaughter for food | **No** | **—** | none | legitimate purpose; not constituted |
| 4 | Cooking with raw meat | **No** | **—** | none | culinary |
| 5 | Medical / surgical footage | **No** | **—** | none | clinical. **Medical imagery is not severity** (SEV-13) |
| 6 | Journalism showing violence | **No** (`ANV`) | **—** | none | journalistic purpose |
| 7 | Historical war footage | **No** | **—** | none | historical record |
| 8 | Educational anatomy | **No** | **—** | none | educational |
| 9 | Religious discussion | **No** | **—** | none | **Religion is not severity** (SEV-13) |
| 10 | Political discussion | **No** | **—** | none | **Politics is not severity** (SEV-13, VP-1) |
| 11 | Satire / parody | **No** | **—** | none | satirical form |
| 12 | Animal cruelty | **Yes** | **Yes** | — | gratuitous suffering established. D-a, D-g |
| 13 | Torture | **Yes** | **Yes** | — | D-a, D-b at their limit |
| 14 | Abuse for entertainment | **Yes** | **Yes** | — | D-a, D-f, D-g |
| 15 | Child abuse | **Yes** | **Yes** | if age unresolved → **CS-5, no severity** | D2. **A child-related topic is never severity by itself** |
| 16 | Sexual exploitation | **Yes** | **Yes** | if age unresolved → **CS-5, no severity** | D-a, D-b, D-g |
| 17 | Incitement / threats | **Yes** | **Yes** | — | D-a, D-f |
| 18 | Targeted harassment | **Yes** | **Yes** | — | D-f, D-e |
| 19 | Deliberate harmful deception | **Yes**, once all four elements + H1–H5 | **Yes** | if harm unestablished → rung 9, **no severity** | severity follows the harm class, never establishes it |
| 20 | Benign factual error | **No** | **—** | none | rung 1 |
| 21 | Self-harm support-seeking | **No** (`ANV`, response-warranted) | **—** | none | **Must never carry a severity label** |
| 22 | Self-harm encouragement | **Yes** | **Yes** | — | D-a, D-f |

**Thirteen of twenty-two take no severity label at all**, because nothing was
constituted. That is the model working: severity is a property of established
conclusions, **not a way of ranking content**.

**None of the nine that do carry severity is assigned a class here.** Each awaits
**G02-D-09d**, and each will need its dimensional signature and boundary argument
recorded. Case 15 additionally routes through **CS-5** where age is unresolved —
in which case there is **no severity at all**, not `SEVERITY_UNDETERMINED`,
because constitution itself was never reached.

#### 7.3.8 G02-D-09 — decision record

| ID | Status |
|---|---|
| **G02-D-09a** | ✅ **RESOLVED — OWNER APPROVED (2026-08-15)** — **Option B**, classes **S1–S4** (§7.3.6) |
| **G02-D-09b** | ✅ **RESOLVED — OWNER APPROVED** — **immediacy belongs to risk/urgency**, not severity |
| **G02-D-09c** | ✅ **RESOLVED — OWNER APPROVED** — **likelihood/probability belongs to risk**, not severity |
| **G02-D-09d** | 🟡 **PARTIALLY RESOLVED (2026-08-15)** — **15 of 18 envelopes ratified**; ~~3 remain OPEN (#5, #11, #13 on D-02/D-04/07b)~~ → as of **2026-08-16 only #13 remains OPEN** (`G02-D-07b`); **#5** and **#11** carry **`NO_ENVELOPE`** (ENV-7). Full detail in the §20 register |
| **Overall G02-D-09** | **PARTIALLY RESOLVED / OWNER APPROVED MODEL, FOLLOW-ON WORK REQUIRED** |

##### G02-D-09d — the remaining work

The eighteen policies in §9 still carry **Option A vocabulary**, which was **not
chosen** and **does not map onto S1–S4** (SEV-6). Re-assignment is deliberately
**not done here**.

**What re-assignment requires, per policy:** the dimensional signature that
justifies the class (D-a…D-g), the boundary argument against the adjacent class,
and a statement of what does *not* determine it. **Where the evidence is
materially ambiguous, the policy is marked OPEN rather than guessed** (SEV-26).

Two policies were flagged **materially ambiguous** in advance:
- **`ts.deception.harmful`** — its seriousness varies by which of H1–H5 is
  established, so a single class for the policy may be the wrong shape.
- **`ts.graphic.presentation`** — a `RESTRICTED` policy whose remedy is
  presentation, not prohibition (interacts with **G02-D-02**).

The full 18-policy pass is at **§7.3.9**, and it surfaced **three architectural
findings**, one of them blocking.

#### 7.3.9 G02-D-09d — the 18-policy pass

> **STATUS: G02-D-09d remains OPEN.** A blocking contradiction (**Finding A**)
> prevents definitive assignment. The shapes below are **proposed**, not
> assigned, and nothing in §9 has been changed.

##### Findings — reported, not silently fixed

**FINDING A — ✅ RESOLVED. `G02-D-09e = RESOLVED — OWNER APPROVED (2026-08-15)`.**

The contradiction was real: `SEV-2` and `SEV-20` said severity was *"a property
of the behavior class, not of a particular instance"*, while the method assigned
severity to the established case.

**Resolved in favour of CASE-LEVEL SEVERITY.** A **policy** declares a
**severity envelope**; a **case** is assigned a class within it, on its
established dimensions. **This is not a contradiction — the two operate at
different levels.**

`SEV-2` has been **rewritten** (SEV-2.1…2.8), `SEV-20` **rewritten**, the §7.1
table row corrected from *"intrinsic and context-independent"*, and
**`SEVERITY ENVELOPE`** defined at **§7.3.6a** (ENV-1…ENV-6). Case-level
assignment reads the seven dimensions and **nothing else** — no probability, no
urgency, no confidence, no report volume, no audience size, no model score
(SEV-2.8).

**FINDING B — ✅ RESOLVED (`G02-D-09f`, 2026-08-15). Owner chose **Q2 = OPTION A —
ONE SUBJECT-NEUTRAL SCALE**.** The four options below are **retained as the
record of the analysis**; **A is adopted, B and D are not**, and C was eliminated
at Q5. The assessments below were written *before* the decision and are
**superseded by it wherever they disagree** — they are not rewritten (CM-3,
VER-4). *(Quotations below corrected 2026-08-15 — see the amendment note that
follows.)* S4 now reads *"harm to life or bodily integrity, or harm irreversible
**for the affected subject**"*, and D-c now reads *"established circumstances of
the affected **subject**"*.

**⚠️ Amendment note (G02-D-09a, 2026-08-15).** As originally written, this
finding rested on S4 and D-c being **person-scoped**, which is why
`ts.animal.cruelty` (subject: an animal) and `ts.platform.abuse-manipulation`
(subject: the ecosystem) did not fit. The ratified 09a amendment removed that
**grammatical** obstacle. It did **not** choose among options A–D below; that
architectural question was **subsequently decided by the Owner as Q2 = Option A**
(2026-08-15), which **closed Finding B**.

*Can one common severity model serve all 18 policies?* ~~**Yes — but only under
option D. Bare option A is not sufficient.**~~ **⚠️ SUPERSEDED by the Owner's
Q2 = A decision.** The struck assessment was this document's analytical
recommendation; the Owner decided otherwise, and **the decision governs**
(Group 01 §5.3). The concern it expressed — that a bare subject-neutral scale
lets incommensurable harms share an S-class — is **not thereby refuted**; it is
**explicitly accepted as a known consequence** of A and recorded at §20.

| | Option | Assessment |
|---|---|---|
| **A** | Replace "person" with **"affected subject / entity"** | *Simplest, and insufficient alone.* It generalises the words but **flattens the moral distinction**: "irreversible for the ecosystem" and "irreversible for the person" would occupy the same class while being incommensurable. It makes the scale grammatical, not meaningful |
| **B** | **Separate human and non-human severity dimensions** | Preserves the distinction honestly, but yields **two scales**, so cross-policy ordering becomes impossible — and ordering is the only thing S1–S4 provides over Option C's profile |
| **C** | **Policy-specific severity interpretation** | Each policy reads S1–S4 in its own terms. Keeps one scale **nominally** while hollowing it out: `S3` would mean different things in different policies, so comparison is meaningless. Ad hoc |
| **D** | **Anchor the scale to the policy's declared protected interest** *(recommended, with two corrections at §7.3.10)* | Calibrate S1–S4 *within* the interest the policy defends. Systematic where C is ad hoc; preserves distinction where A flattens; keeps one scale where B splits it. **⚠️ Corrected at §7.3.10:** this row originally said *"HRM-1 already requires every policy to name the protected interest"* — **WF-3 requires it, but no policy in §9 actually declares one** (Finding D), so D is **not executable until `G02-D-09g` closes**. Its comparability claim was also overstated (Finding E) |
| | | **Under D**, S4 would read *"harm at the outer limit of the protected interest this policy defends — for policies protecting persons, harm to life or bodily integrity"*, and D-c would read *"established vulnerability of the affected subject"* |

**These are materially different architectures.** ~~none is adopted here~~
✅ **RESOLVED — OWNER APPROVED (2026-08-15): `G02-D-09f` Q2 = OPTION A.** The
amended **S1–S4 is the single common subject-neutral scale**. **B and D are not
adopted; C was eliminated at Q5.** Severity envelopes were subsequently ratified
in part at **`G02-D-09d`** (2026-08-15): **15 of 18 are authoritative, ~~3 remain
OPEN~~ → as of 2026-08-16 only **#13** remains OPEN** (`G02-D-07b`); #5 and #11 carry **`NO_ENVELOPE`** (ENV-7).

**FINDING C — `RESTRICTED` policies. Both confirmed affected; one viable option.**

**Confirmed: two policies, not one** — `ts.graphic.presentation` **and**
`ts.sexual.adult-content`.

| | Option | Assessment |
|---|---|---|
| **A** | Severity applies normally | **Not viable.** A `RESTRICTED` disposition establishes **no violation** — the class is defined as *"permitted subject to conditions"* (§9.1) — **and no harm to grade**: neither policy's `Governs` asserts harm. Grading it would mean grading the *intensity of the imagery* (for `ts.sexual.adult-content`, explicitness) — a **topic**, which **SEV-13** prohibits: *"Any severity model that can be driven by a topic is malformed."* *(Precision, 2026-08-15: the original read "**SEV-13 and WF-2** prohibit". **WF-2 governs constitution, not severity** — it bars a topic as a *sufficient condition* for a policy. **SEV-13 is the operative severity rule**, and itself cites WF-2 only as background. The conclusion is unaffected.)* |
| **B** | Severity applies only to an underlying harm/conduct dimension | **Viable, and it reduces to C.** Where graphic imagery co-occurs with a constituted violation, severity attaches to **that violation's** policy, not to the RESTRICTED one. That is C plus a clarification, not a distinct architecture |
| **C** | **Severity not meaningful at taxonomy level for `RESTRICTED` policies** *(recorded; **NOT adopted** — `G02-D-02a`)* | ⚠️ **STATED DERIVATION IS FALSE — corrected 2026-08-15.** ~~Follows from SEV-11: no constitution of a violation, nothing to grade.~~ **SEV-11 does not establish this.** Its text reads *"**No constitution, no severity** … where nothing is **constituted**, no severity label is assigned at all"* — it keys on **constitution**, **not on violation**. A `RESTRICTED` policy **can be constituted**: the conclusion *presentation conditions apply* **is** an established policy conclusion, so **SEV-11 is not engaged at all** for a constituted `RESTRICTED` case. The surviving candidate ground is **Row A's premise instead** — that **no harm is established**, so **D-a…D-g have nothing to read** and **S1 demands a positive finding of bounded seriousness, never a fallback** (S1 clause 3). **Whether that ground suffices is exactly what `G02-D-02a` must settle. It is neither adopted nor rejected here.** ✅ Still accurate: the outcome *presentation conditions apply* **is not a finding of wrongdoing** |

~~**Only one option is materially viable, so this is reported as a conclusion
rather than a stop:**~~ ⚠️ **Superseded twice, 2026-08-15.** *(i)* It is **no
longer a conclusion but an OPEN Owner decision — `G02-D-02a`.* *(ii)* **C's
ground has changed**: A remains not viable and B still reduces to C, so C is
still the only standing candidate — but **on Row A's no-established-harm ground,
not on SEV-11**, whose citation was false. **The option set is unchanged; the
reasoning under C is not.**

Severity **may be** not meaningful for `RESTRICTED` policies — **recorded, not
ratified** — with **B's residue confirmed and mechanically supported**: where
graphic content co-occurs with a constituted violation, that violation's own
policy carries severity normally, because **SC-1** makes every policy a
self-contained conformance unit. **B's residue is the one part of Finding C that
survives unqualified.**

🔷 **OWNER DECISION (2026-08-15) — `G02-D-02a` OPTION C: REPAIR DEFINITIONS
FIRST.** **Finding C remains neither adopted nor rejected.** The Owner
**declined to characterise** the absence of established harm as either
**intrinsic to `RESTRICTED`** or a **defect** in #5/#11, and directed that those
two definitions be **repaired/clarified first**, after which **`G02-D-02a` is
re-run against the repaired text**. **`G02-D-02a` therefore stays OPEN** —
this decided the **sequence**, not the **answer**.

✅ **`G02-D-02` RESOLVED (2026-08-15): the `RESTRICTED` disposition IS in scope
for v1.** The existence question this conclusion was contingent on is answered.

🚨 **But the conclusion above is NOT adopted.** At the same gate the Owner
**expressly separated the scope decision from the severity-treatment decision**,
so *"severity is not meaningful for `RESTRICTED` policies"* remains **recorded
analysis, not ratified taxonomy**, and is deferred to **`G02-D-02a`**. Adopting
it would imply a **third envelope state** — neither an `S1–S4` range nor `OPEN` —
which **ENV-1…ENV-6 do not define**; that gap is part of what 02a must settle.

**Both policies therefore remain OPEN in the matrix**, `ts.graphic.presentation`
on **`G02-D-02a`** and `ts.sexual.adult-content` on **`G02-D-02a` + `G02-D-04`**.

##### The matrix

> ### PARTIALLY RATIFIED — 15 authoritative, 3 still OPEN (2026-08-15)
>
> The authoritative slot is each policy's **`severity_envelope`** field in its
> **SC-1 conformance block** (§9); this column mirrors it.
>
> - ✅ **15 envelopes are RATIFIED** by Owner decision (2026-08-15) and are
>   **authoritative** — **12 ranges + 3 single-class**: every policy except #5,
>   #11 and #13. **#1** and **#17** were re-ratified at `S2–S3` after their
>   boundary arguments were found unsound and corrected; **their bounds are
>   Owner-chosen, not derived** (ENV-2, SEV-2.5).
> - 🔶 ~~**3 remain OPEN** and are **not envelopes at all** (**ENV-6**):
>   **#5** (`G02-D-02a`), **#11** (`G02-D-02a/04`),~~ → **as of 2026-08-16 exactly one
>   remains OPEN** and is **not an envelope at all** (**ENV-6**): **#13** (`G02-D-07b`).
>   **#5** and **#11** were answered by `G02-D-02a` = **C** and now carry
>   **`NO_ENVELOPE`** (**ENV-7**) — a declared state, not an open one.
>
> *(Corrected 2026-08-15: this banner previously read "Every value in the
> 'Envelope' column **is** a `SEVERITY ENVELOPE`", which contradicted ENV-6 and
> the then-18 `OPEN` conformance fields, and made a proposal set read as an
> assignment.)*
>
> **What the column means once ratified.** A `SEVERITY ENVELOPE` (§7.3.6a) is
> **not a case severity.** It states which classes a policy *can* legitimately
> produce; the class for any given case is assigned from that case's established
> dimensions (SEV-2.3, ENV-1). A case may not be assigned outside its envelope
> (ENV-4).

Dimensional signature lists only the dimensions **characteristically engaged**.
`—` = not applicable. Nothing below is a dimension count (SEV-19).

| # | Policy | Sev. applicable? | Dimensional signature | **Envelope** | Boundary argument | Must NOT determine it | Case-varies? |
|---|---|---|---|---|---|---|---|
| 1 | `ts.violence.graphic-harm` | Yes | D-a, D-b(partial), D-d, D-e, D-f(when the depicted person is identifiable) | ✅ **S2–S3** *(ratified 2026-08-15 — bounds CHOSEN, not derived)* | ~~Above S1 because glorification reaches an identifiable dignity interest~~ ⚠️ **UNSOUND, corrected 2026-08-15 — the envelope was re-ratified on a corrected basis, not on this argument.** That argument conflates an identifiable **interest** with an identifiable **subject**; **D-f requires a subject**, and this policy's own signature engages D-f *only when the depicted person is identifiable*. Every policy has an identifiable interest, so the argument would push all 18 above S1 — **refuted by #18, whose `S1` floor is ratified**. **S1 is therefore NOT mechanically excluded**: with the depicted person unidentifiable, all five S1 conjuncts can hold (**D-g is absent from this signature**, so "not exploiting dependency" holds by default). ✅ **Sound and retained:** below S4 because the policy governs **depiction**, not the infliction — S4 route 2 (*life or bodily integrity*) cannot attach to depicting, and route 4 is excluded since **D-g is absent**. Route 1 is unspecified and route 3 is bounded by **D-b(partial)**. ✅ **RATIFIED `S2–S3` (2026-08-15).** The Owner **declined S1 as a matter of judgement**, not because it is excluded — the mechanical test above shows S1 reachable — and held the ceiling at S3. **Both bounds are chosen (ENV-2, SEV-2.5)** | blood; gore intensity; topic (SEV-13) | **Yes** |
| 2 | `ts.violence.incitement-threats` | Yes | D-a, D-f (definitional), D-b, D-d | **S3–S4** | S3 floor because a credible targeted threat is grave by construction; reaches S4 where directed at life or bodily integrity | how angry the language sounds; hyperbolic idiom (VN-4) | **Yes** |
| 3 | `ts.selfharm.promotion` | Yes | D-a, D-b (at the limit), D-c, D-f | **S4** | Does not vary below S4: the constitutive conduct is **directed at death or grave bodily harm**, which is irreversible for the person | mention of self-harm; disclosure (not constituted at all) | Little |
| 4 | `ts.danger.harmful-activity` | Yes | D-a, D-b, D-d | **S3–S4** | S1/S2 excluded **by construction** — the policy already requires *serious* risk of physical harm | virality; audience size (SEV-4) | **Yes** |
| 5 | `ts.graphic.presentation` | **No** *(answered by `G02-D-02a` = **C**, Owner 2026-08-16 — severity is not meaningful at taxonomy level for a `RESTRICTED` policy; ENV-7)* | — | **`NO_ENVELOPE`** *(`G02-D-02a` = **C**, Owner 2026-08-16 — a `RESTRICTED` policy carries no severity envelope at taxonomy level; see **ENV-7**. Not the `OPEN` of ENV-6, and not `S1`)* | **Option C — severity not meaningful at taxonomy level — was RECOMMENDED but is NOT ADOPTED.** A `RESTRICTED` disposition establishes **no harm and no wrongdoing to grade**; it establishes that presentation conditions apply. ✅ **`G02-D-02` is RESOLVED — the class is in scope for v1** — but the Owner **expressly deferred the severity-representation question to `G02-D-02a`**, so this envelope stays OPEN | — | ✅ **G02-D-02 RESOLVED** · ✅ **Q1 = A, DEFINITION DEFECT (ratified 2026-08-15)** — unmet **WF-1** *(no constitutive behavior declared)* and **WF-2** *(topic as sufficient condition)*; **not intrinsic to `RESTRICTED`** · **envelope NOT derived, stays `OPEN` per ENV-6** · 🔶 **G02-D-02a still OPEN**; repair is a separate gate |
| 6 | `ts.child.sexual-exploitation` | Yes | D-a, D-b (max), D-c (established), D-g, D-f | **S4** | At the outer boundary by the nature of the established conduct | the word "child"; topic; age uncertainty (**CS-5**); protected status | Little |
| 7 | `ts.child.sexualization` | Yes | D-a, D-b, D-c, D-g | **S3–S4** | This policy covers the **non-explicit** band; explicit conduct is #6. Range is honest, and severity ≠ enforcement (SEV-9) — **CS-1 already requires `HUMAN_REQUIRED` + `LEGALLY_SENSITIVE` regardless** | as #6 | **Yes** |
| 8 | `ts.child.grooming` | Yes | D-g (max), D-b, D-c, D-e (patterned), D-f | **S4** | Patterned exploitation of a minor's trust sits at the outer boundary | a single message; topic; age uncertainty | Little |
| 9 | `ts.child.abuse-harm` | Yes | D-a, D-b, D-c, D-e | **S3–S4** | Spans abuse to endangerment; S4 where harm reaches life or bodily integrity | as #6 | **Yes** |
| 10 | `ts.sexual.exploitation-nonconsent` | Yes | D-a, D-b (imagery persists), D-f, D-g | **S3–S4** | S3 floor by construction; S4 where sexual violence or coercion reaches bodily integrity | topic; nudity as such | **Yes** |
| 11 | `ts.sexual.adult-content` | **No** *(answered by `G02-D-02a` = **C**, Owner 2026-08-16 — severity is not meaningful at taxonomy level for a `RESTRICTED` policy; ENV-7)* | — | **`NO_ENVELOPE`** *(`G02-D-02a` = **C**, Owner 2026-08-16 — a `RESTRICTED` policy carries no severity envelope at taxonomy level; see **ENV-7**. Not the `OPEN` of ENV-6, and not `S1`)* | **Same question as #5** (Finding C — recommended, **not adopted**). ✅ **`G02-D-02` is RESOLVED**; this envelope stays OPEN on **`G02-D-02a`** and additionally on **`G02-D-04`**, the product stance, which is open | — | ✅ **G02-D-02 RESOLVED**; 🔶 **G02-D-02a OPEN — sequenced behind definitional repair (Owner option C)**; 🔶 **G02-D-04 OPEN** |
| 12 | `ts.harassment.targeted` | Yes | D-f (definitional), D-e, D-a, D-b(partial) | **S2–S3** | Above S1 because an identifiable person is targeted; reaches S3 on persistence or coordination, not on rudeness | report volume (REP-2); offensiveness; the target's identity | **Yes** |
| 13 | `ts.hate.protected-target-abuse` | Yes, in shape | D-a, D-f, D-c, D-d | 🔶 **OPEN — G02-D-07b** *(shape S3–S4)* | **Not an envelope (ENV-6)** — blocked on **G02-D-07b**. *Shape only, not ratified:* S3 floor because dehumanisation is grave by construction; S4 at incitement reaching bodily integrity. *(Corrected 2026-08-15: this cell previously showed `S3–S4` as the primary value, contradicting both the SC-1 field and §7.3.11, which read OPEN.)* | **protected identity is never a multiplier** (PT-8, PT-9) | **Yes** — **but status OPEN: policy is non-operational until G02-D-07b** (PT-5) |
| 14 | `ts.privacy.personal-information` | Yes | D-b (exposure is irreversible), D-f, D-a, D-e | **S2–S4** | Wide but principled: S2 for bounded exposure; **S4 only where exposure creates risk to life or bodily integrity** | already-public information; self-disclosure | **Yes** |
| 15 | `ts.animal.cruelty` | Yes | **D-a…D-g all subject-neutral** since the **G02-D-09a** amendment generalised D-b/D-c/D-d/D-f and guarded D-g | ✅ **S1–S4** *(ratified 2026-08-15 — Owner)* | **RATIFIED S1–S4.** ~~Organised or spectacle cruelty reaches S3; whether animal harm can reach S4 remains an Owner envelope decision~~ — the Owner **decided the full span**. Since 09a, **no S4 route is person-scoped** — one subject-neutral via D-b, one via D-g, two deliberately unspecified (A-1) — so the wording does not close S4 against animals, and the Owner admitted it. **S1 is likewise admitted**: a minor, reversible, non-persisting, non-exploitative act can be bounded. **Reachability did not compel either bound; both were chosen** (ENV-2, SEV-2.5) | `animal` as a topic (TOP-1); cultural unfamiliarity (CTX-2, VN-2) | **Yes** |
| 16 | `ts.deception.harmful` | Yes | varies with the established H-class: H1→D-a,D-b · H2→D-a · H3→D-b,D-f · H4→D-g,D-c · H5→D-f,D-a | **S2–S4, case-dependent** | **S1 excluded by construction** — element 3 requires materiality, so bounded/immaterial harm never constitutes the policy. **No fixed H→S mapping**: a minor H1 case may be S2 and a severe H5 case S3. The **established dimensions** decide, not the H-label | which H class alone; deliberateness (DEC-0.2); reach (DEC-6) | **Yes — the clearest case for ranges** |
| 17 | `ts.fraud.scam` | Yes | D-a, D-g, D-f, D-d | ✅ **S2–S3** *(ratified 2026-08-15 — bounds CHOSEN, not derived)* | ~~Above S1 because a transaction victim is material; S4 not reached — economic harm does not touch life or bodily integrity~~ ⚠️ **BOTH BOUNDS UNSOUND, corrected 2026-08-15 — the envelope was re-ratified on a corrected basis, not on this argument.** **Floor:** the argument asserts a **materiality element this policy does not state** — contrast `ts.deception.harmful`, whose element 3 *does* require materiality. **S1 is NOT mechanically excluded**: D-b, D-c and D-e are absent from this signature, D-f is present but **not definitional** (a broadcast fraudulent offer is diffuse), and **D-g cannot be assumed** — its ratified guard requires exploitation to be *established from the circumstances of the affected subject*. **Ceiling:** the old argument tested **only route 2 of S4's four disjunctive routes** — the same single-route error corrected twice for `ts.animal.cruelty`. Full test: route 2 (*life or bodily integrity*) **excluded** ✅ · route 1 (*exceptionally severe*) **unspecified** · route 3 (*irreversible for the affected subject*) **not excluded** — transferred funds are frequently unrecoverable · route 4 (*deeply exploitative or coercive*) **not excluded, and decisive — D-g is in this policy's own signature**. ✅ **RATIFIED `S2–S3` (2026-08-15).** The Owner **declined S1** (reachable but not admitted) and **declined S4 notwithstanding that routes 1, 3 and 4 remain textually open** — including route 4 via **D-g**, which this policy characteristically engages. **This is a deliberate ceiling, not a derivation** (ENV-2, SEV-2.5); it is **not** supported by the struck single-route argument | amount taken (M-4, SEV-4); number of victims | **Yes** |
| 18 | `ts.platform.abuse-manipulation` | Yes | D-d, D-e · **subject is the ecosystem, not a person — see Finding B** | ✅ **S1–S4** *(ratified 2026-08-15 — Owner)* | **RATIFIED S1–S4.** ~~S1–S2: bounded because the harm is to ecosystem integrity rather than to a person~~ — the Owner **admitted the full span**. Harm to ecosystem integrity is bounded at the floor and rises to S2 on persistence or coordination; **retaliatory reporting against an individual engages D-f**. Since **G02-D-09a** the S4 irreversibility route is no longer closed to this policy *grammatically* (the ecosystem is a subject). **Q4 = NO still stands and is not contradicted**: S4 is **not required**, merely **not excluded**. In practice S3–S4 will be rare, since integrity harm is typically reversible and an ecosystem has no life or bodily integrity — **that is a factual constraint on cases, not a narrower envelope** (ENV-1) | popularity; organic virality | **Yes** |

**Result after Owner ratification (2026-08-15): 15 of 18 envelopes are
AUTHORITATIVE; ~~3 are OPEN~~ → as of 2026-08-16 exactly **one** is OPEN (#13).** The three: `ts.graphic.presentation` and
`ts.sexual.adult-content` on the `RESTRICTED` question (Finding C,
**G02-D-02a/04**), and `ts.hate.protected-target-abuse` on **G02-D-07b**.
`ts.violence.graphic-harm` and `ts.fraud.scam` were briefly held while their
boundary arguments were corrected, then **re-ratified at `S2–S3`** on a corrected
basis — **the arguments were wrong; the envelopes were the Owner's to choose.**

**Twelve of the fifteen ratified envelopes span more than one class**; the other
three are the single-class `S4` at #3, #6 and #8. *(Prior state, retained: before
ratification 15 carried a proposal — 12 ranges + 3 singles. An earlier version
read "Eleven", which was wrong and self-contradictory, since 11 + 3 = 14, not
15.)* Finding A had to be resolved before any of this could mean anything, and
it was — `G02-D-09e`.

**Ranges unchanged by the 09e correction.** The envelopes are the same values as
before; what changed is that they are now correctly *interpreted* — `S2–S3` was
always an envelope and is now labelled one, rather than being read as a policy's
fixed severity. Single-class envelopes (`S4` at #3, #6, #8) mean the constitutive
behavior admits no meaningful variation — the case is still assigned, and may
still be `SEVERITY_UNDETERMINED` (ENV-5).

#### 7.3.10 G02-D-09f — protected-interest analysis

> **STATUS: ✅ G02-D-09f RESOLVED — Q2 = OPTION A (2026-08-15).** The amended
> **S1–S4 is the single common subject-neutral scale**; **Option D is NOT
> adopted**. ~~Option D is still the best target~~ — that was this document's
> recommendation, now **superseded by the Owner decision**.
> **The two corrections below remain valid and are retained**: D's stated premise
> (*"HRM-1 already requires every policy to name the protected interest"*) **is
> false today** — **WF-3 requires it and 0/18 declare one** — and its
> comparability claim was overstated. They stand as the record of why D was not
> executable, and **`G02-D-09g` remains OPEN for WF-3 conformance**, which
> **Option A does not depend on**.

##### FINDING D — 🔴 **HRM-1 / WF-3 is unmet across all 18 policies**

**WF-3** requires *"every policy names the harm it protects against."* **No policy
in §9 does.** Searched: **zero** occurrences of a protected-interest declaration
in the entire registry. The fields actually present are `Governs`,
`Does not govern`, `Constitutive boundary`, `Ambiguity`, `Legal` — **there is no
harm or protected-interest field at all.**

**Correction to an earlier claim of mine.** §7.3.9 Finding B and the G02-D-09f
register row asserted that *"HRM-1 already requires every policy to name the
protected interest it defends."* **WF-3 requires it; the registry does not do
it.** Option D was recommended on a premise that is **not currently satisfied**.

**WF-5 omits what WF-3 demands.** WF-5 enumerates what every policy must
declare — severity, evidence sensitivity, disposition, applicability, content
classes, identity, version — and does not include the harm/protected interest.
*(⚠️ Corrected at §7.3.11 Q2: this originally read "the two rules **disagree**".
They do **not** conflict — WF-5 is not exhaustive, so the rules are
**cumulative**. The real defect is that WF-5 reads as *the* declaration schema
while omitting WF-3's requirement, which is how the registry came to violate it.)*

**Consequence: Option D is not executable today.** It anchors severity to a
declared interest that does not exist. It becomes executable only after the
registry declares one per policy — **a prerequisite, tracked as `G02-D-09g`.**

##### FINDING E — Option D's comparability claim was overstated

D was recommended partly for **cross-policy comparability**. On inspection that
is **not what it delivers**. Anchoring S1–S4 to each policy's own protected
interest makes `S3`-for-privacy and `S3`-for-child-safety **methodologically
consistent but not morally commensurable** — the interests themselves are
incommensurable, and no scale can make them otherwise.

**What D actually delivers is explainability and method consistency, not
magnitude comparability.** Corrected here rather than left to mislead Group 06:
**no later group may treat equal S-classes across different policies as equal
seriousness.**

##### A/B/C/D evaluation

| Criterion | A — subject/entity | B — two scales | C — per-policy reading | D — interest-anchored |
|---|---|---|---|---|
| Semantic coherence | weak — flattens incommensurables | strong | weak — `S3` drifts per policy | **strong** |
| Cross-policy **comparability** | false comparability | none (honest) | none (concealed) | **none — but explicit** (Finding E) |
| S1–S4 stable meaning | nominal only | within each scale | **no** | **yes, as method** |
| Hidden policy-specific meanings | some | no | **yes — the failure mode** | no — anchoring is declared |
| Humans | fine | fine | fine | fine |
| Animals | included but flattened | separate scale | ad hoc | **works — D-b/D-c/D-d/D-f generalised and D-g guarded by G02-D-09a** *(corrected: this cell previously named the stale set "D-c/D-f/D-g")* |
| Platforms / systems | flattened into person-harm | separate scale | ad hoc | **works; S4 unreachable, correctly** |
| Harm not topic | preserved | preserved | **at risk** — drift invites topic reasoning | preserved |
| Interest becomes a multiplier? | no | no | **risk: "important interest ⇒ higher class"** | **no — explicitly barred, PI-3** |
| Compatible D-a…D-g | needs D-f wording | duplicates them | yes | **yes — the required D-b/D-c/D-d/D-f wording and the D-g guard landed under G02-D-09a** *(corrected: this cell previously named the stale set "D-c/D-f/D-g")* |
| Compatible SEV-2.1–2.8 | yes | yes | yes | **yes** |
| Compatible ENV-1–6 | yes | envelopes per scale | yes | **yes** |
| Compatible SEV-11–19 | yes | yes | **strains SEV-13** | **yes** |
| Clarity for later groups | deceptively simple | two models to carry | poor | **good, once interests are declared** |
| Loophole / arbitrariness risk | moderate | low | **high** | **low** |

~~**Recommendation: D remains the best option, but it does not "clearly dominate"
today** — it is blocked on `G02-D-09g`, and its comparability claim is narrower
than first stated. **No option is adopted here.**~~

⚠️ **SUPERSEDED — OWNER DECISION (2026-08-15): `G02-D-09f` Q2 = OPTION A.** The
comparison above is **retained as analysis** (CM-3, VER-4). The Owner adopted
**A — one subject-neutral scale**; **D is not adopted** and its `G02-D-09g`
dependency is therefore **no longer on the severity path**. **A's known trade-off
— the "flattening" row above — is accepted, not refuted.**

##### The protected-interest anchor — definition, if adopted

> ⚠️ **NOT ADOPTED.** `G02-D-09f` closed at **Q2 = Option A**, so **Option D was
> not adopted** and **PI-1…PI-3 below are NOT in force as a severity anchor**.
> They are retained as the definition D *would* have required. **PI-3 — protected
> interest is never a severity multiplier — remains binding independently**, and
> is reaffirmed by the Q2 = A decision.

> **PI-1.** Every policy **declares the protected interest** it defends — the
> thing harmed when the policy is violated.
> **PI-2.** Severity classes S1–S4 are calibrated **within that interest**: the
> case's established dimensions are read as seriousness of harm **to that
> interest**.
> **PI-3 — A protected interest is never a severity multiplier.** A policy does
> not reach S4 because its interest sounds important. Severity arises from
> **established dimensions only** (SEV-11, SEV-13).
> **PI-4 — Protected interest ≠ protected characteristic.** The interest is what
> the policy protects; a characteristic is an attribute of a person (PT-6). They
> are unrelated concepts, and PT-8/PT-9 continue to bar characteristics from
> affecting severity.
> **PI-5 — No cross-policy magnitude comparison** (Finding E).

##### 18-policy protected-interest matrix

**Declared interest: NONE, for all 18** (Finding D). The column below records the
interest **evident from the `Governs` line** — this is *evidence of feasibility*,
**not a declaration and not an inference to be adopted**.

| # | Policy | Subject / affected entity | Interest evident from `Governs` | Harm structure | Envelope | Test verdict |
|---|---|---|---|---|---|---|
| 1 | `ts.violence.graphic-harm` | depicted person; audience | **contestable** — dignity of the depicted, or normalisation | depiction-mediated | ✅ **S2–S3** *(ratified 09d)* | **PASS WITH QUALIFICATION** — interest genuinely ambiguous |
| 2 | `ts.violence.incitement-threats` | targeted person/group | physical safety | direct + fear | S3–S4 | **PASS** |
| 3 | `ts.selfharm.promotion` | audience at risk | life and health | inducement | S4 | **PASS** |
| 4 | `ts.danger.harmful-activity` | imitating audience | physical safety | imitation-mediated | S3–S4 | **PASS** |
| 5 | `ts.graphic.presentation` | viewer | ✅ **psychological safety** *(ratified 2026-08-15, `G02-D-02a` input (i); was "not evident")* · 🔷 **HRM-2 rationale — `G02-D-08c` dependency DETACHED (Owner option B, 2026-08-15; prior deferral superseded)** — naming satisfied; rationale still **not independently established**; returns to `G02-D-02a` on its own evidence | ~~BLOCKED, not merely pending — the WF-2 constitutive boundary is undraftable from ratified vocabulary and the L3 amendment was declined; `WF-1` is also unmet~~ ✅ **UNBLOCKED 2026-08-15** — the L3 element **`viewing initiation`** was added and `Governs` restructured, so **WF-1 ✅ and WF-2 ✅ now close**. 🔶 **Harm structure itself is still NOT independently established** — the HRM-2 rationale remains unresolved, so no harm-structure value is entered here. **Q1 = A (definition defect), ratified 2026-08-15, unchanged**; envelope stays `OPEN` per ENV-6 *(was "none established")* | **`NO_ENVELOPE`** *(`G02-D-02a` = **C**, Owner 2026-08-16 — a `RESTRICTED` policy carries no severity envelope at taxonomy level; see **ENV-7**. Not the `OPEN` of ENV-6, and not `S1`)* | **OPEN — INSUFFICIENT DEFINITION** *(analysis verdict only — the Owner **declined to characterise** this as a defect at `G02-D-02a`, choosing **C: repair definitions first**)* *(RESTRICTED; G02-D-02a)* |
| 6 | `ts.child.sexual-exploitation` | the minor | child welfare; sexual autonomy | direct | S4 | **PASS** |
| 7 | `ts.child.sexualization` | the minor | child welfare; dignity | direct + persistence | S3–S4 | **PASS** |
| 8 | `ts.child.grooming` | the minor | child welfare | relational | S4 | **PASS** |
| 9 | `ts.child.abuse-harm` | the minor | child welfare; physical safety | direct | S3–S4 | **PASS** |
| 10 | `ts.sexual.exploitation-nonconsent` | the depicted/coerced person | sexual autonomy; dignity | direct + persistence | S3–S4 | **PASS** |
| 11 | `ts.sexual.adult-content` | viewer / audience | **not evident** | none established | **`NO_ENVELOPE`** *(`G02-D-02a` = **C**, Owner 2026-08-16 — a `RESTRICTED` policy carries no severity envelope at taxonomy level; see **ENV-7**. Not the `OPEN` of ENV-6, and not `S1`)* | **OPEN — INSUFFICIENT DEFINITION** *(analysis verdict only — the Owner **declined to characterise** this as a defect at `G02-D-02a`, choosing **C: repair definitions first**)* *(RESTRICTED; G02-D-02a, G02-D-04)* |
| 12 | `ts.harassment.targeted` | targeted person | dignity; psychological safety | direct | S2–S3 | **PASS** |
| 13 | `ts.hate.protected-target-abuse` | targeted people | dignity | direct | **OPEN** *(shape S3–S4)* | **PASS** on interest; policy OPEN on **G02-D-07b** |
| 14 | `ts.privacy.personal-information` | exposed person | privacy; personal security | exposure | S2–S4 | **PASS** |
| 15 | `ts.animal.cruelty` | **an animal** | animal welfare | direct | ✅ **S1–S4** *(ratified 09d)* | **PASS WITH QUALIFICATION** — see below |
| 16 | `ts.deception.harmful` | the deceived person | **varies with the established H-class** | reliance-mediated | S2–S4 | **PASS WITH QUALIFICATION** — the only policy whose interest is **per-case, not per-policy** |
| 17 | `ts.fraud.scam` | defrauded person | financial security | reliance-mediated | ✅ **S2–S3** *(ratified 09d)* | **PASS** |
| 18 | `ts.platform.abuse-manipulation` | **the ecosystem** | platform / service integrity | systemic | ✅ **S1–S4** *(ratified 09d)* | **PASS WITH QUALIFICATION** — see below |

**12 PASS · 4 PASS WITH QUALIFICATION · 2 OPEN · 0 FAIL** — every verdict
**conditional on Finding D being closed**.

##### `ts.animal.cruelty` — dimension-by-dimension

The subject is an animal. **No separate animal scale is created.**

| | Applies? | Note |
|---|---|---|
| **D-a** magnitude | **Yes, as written** | suffering inflicted |
| **D-b** irreversibility | **Yes, as written** *(resolved by the G02-D-09a amendment)* | now reads *"whether the harm to the **affected subject** can be undone"*. Conceptually applicable (death, permanent injury) and no longer person-scoped in wording |
| **D-c** vulnerability | **Yes, as written** *(resolved by the G02-D-09a amendment)* | now reads *"**established circumstances** of the affected **subject**"*. **Must remain established circumstances of the individual animal — restraint, captivity, dependency — and must NEVER be inferred from species membership** |
| **D-d** scope | **Yes, as written** *(resolved by the G02-D-09a amendment)* | now reads *"**one subject**, a determinate group, or broadly"*. Conceptually applicable (number of animals affected) and no longer person-scoped in wording |
| **D-e** persistence | **Yes, as written** | ongoing or repeated |
| **D-f** targeting | **Yes, as written** *(resolved by the G02-D-09a amendment)* | now reads *"directed at an identifiable **subject**, versus diffuse"* |
| **D-g** exploitation | **Yes, as written, subject to its guard** *(guard added by the G02-D-09a amendment)* | *"abuse of power, dependency or constrained choice."* Dependency applies to a captive or domesticated animal. The ratified guard now reads: vulnerability or constrained choice **must be established from the circumstances of the affected subject and must never be inferred solely from species, category, or status**. **It must NEVER become "animals are inherently exploitable"** |

**Effect on human policies of these four generalisations: none.** *(Corrected: an
earlier draft said "three" and named only D-c, D-f, D-g. The person-scoped
dimensions are **D-b, D-c, D-d and D-f**; D-g needs a guard, not a wording
change.)* Replacing "person" with "subject" in **D-b, D-c, D-d and D-f**, and
anchoring D-g to an *established* dependency, leaves every human reading
identical. **These changes have since been made** under the ratified
**G02-D-09a amendment (2026-08-15)**; this section previously recorded them as
pending. Subject-neutral as written: **D-a** (already *"harm to the affected
**interest**"*), **D-e**, **D-g**.

**Can animal harm reach S4?** ⚠️ **CORRECTED TWICE — and now SUPERSEDED by the
G02-D-09a amendment; read the two notes beneath the table.** The original answer
("no, because S4 says *for the person*") was **false**. The first correction then
said *"four routes and only two are person-scoped"*, which **contradicted its own
table** — the table **then showed one** person-scoped route. Both were fixed.
**Since the amendment the table below shows *no* person-scoped route**, so this
paragraph is a record of the earlier corrections, **not a live count**.

S4 clause 1 is **disjunctive** — four routes:

| S4 route | Classification |
|---|---|
| *"consequences that are exceptionally severe"* | **Unspecified — genuinely ambiguous** (no subject named) |
| *"harm to **life or bodily integrity**"* | **Unspecified — genuinely ambiguous** (no subject named; an animal has both, but the clause does not say) |
| *"harm that is **irreversible for the affected subject**"* | **Subject-neutral** *(was person-scoped; generalised by the G02-D-09a amendment)* |
| *"conduct that is **deeply exploitative or coercive** at the outer limit"* | **Subject-neutral**, via D-g — with the caveat that *"constrained choice"* is anthropomorphic |

**Historically, exactly one of four routes was person-scoped.** Clause 2
(*"not reversible for the person, or reaches life or bodily integrity"*) restated
the **same** route — so the **two person-references** across clauses 1 and 2
expressed **one route**, not two.

**⚠️ Superseded by the G02-D-09a amendment (2026-08-15).** Both of those
person-references now read *"the affected **subject**"*, so **no S4 route is
person-scoped any longer**: one is subject-neutral via D-b, one subject-neutral
via D-g, and two remain deliberately **unspecified** (approved decision **A-1** —
*"exceptionally severe"* and *"life or bodily integrity"* were left unspecified,
not generalised).

**The wording therefore no longer closes S4 against non-person subjects.** This
is a statement about the **text only**. The Owner answered **Q3 = YES** in the
09a gate, and subsequently closed **G02-D-09f** with **Q2 = Option A** — the
amended S1–S4 is the **single common subject-neutral scale**, so **animal harm is
textually able to reach S4**.

✅ **The assignment has since been made.** At the **`G02-D-09d`** gate
(2026-08-15) the Owner ratified `ts.animal.cruelty`'s **severity envelope as
`S1–S4`** — the full span. **This did not follow from reachability**: S4 being
textually reachable never compelled its inclusion, and S1 being reachable never
compelled its inclusion either (**ENV-2**, **SEV-2.5**). **Both bounds were
chosen by the Owner.** Case-level classes are still assigned per case from the
established dimensions and may be `SEVERITY_UNDETERMINED` (ENV-1, SEV-22).

##### `ts.platform.abuse-manipulation` — what it actually protects

`Governs` covers coordinated inauthentic behavior, engagement manipulation, ban
evasion, automated abuse, and abuse of the reporting system. The evident interest
is **platform / service integrity** — **not** human harm, and it is **not**
converted into human harm here.

- **Engaged:** D-a (integrity harm), D-d (scope, strongly), D-e (persistence).
- **Largely not engaged:** D-b (integrity harm is typically reversible), D-c (no affected subject with circumstances), D-g.
- **D-f engages only in the retaliatory-reporting limb**, where a **person** is targeted — and there a *person-affecting* policy may also apply (COMP-1).

**S1–S4 remains coherent. No new scale is required. Person-centric language is
not forced onto it.**

**⚠️ Amended 2026-08-15 (G02-D-09a) — the previous justification no longer
holds.** This paragraph previously read *"S4 is correctly unreachable for a
systemic interest **under current wording**"*. That reasoning depended on the S4
irreversibility route being **person-scoped**, which excluded the ecosystem
grammatically. After the amendment that route reads *"irreversible for the
affected **subject**"*, and the ecosystem **is** a subject — so **the wording no
longer closes S4 against this policy**.

What still constrains it is **substantive, not grammatical**: D-b is largely not
engaged because **integrity harm is typically reversible**, and the ecosystem has
no *"life or bodily integrity"*. On those grounds the **S1–S2** reading is
unchanged in practice.

**This is a reported side-effect, not a decision.** Whether
`ts.platform.abuse-manipulation` may now reach S4 is an **envelope** question
belonging to **`G02-D-09d`** — `G02-D-09f` closed at **Q2 = Option A**, which
settles the **scale**, not the **envelope**.

✅ **Resolved at the `G02-D-09d` gate (2026-08-15): the Owner ratified
`ts.platform.abuse-manipulation`'s envelope as `S1–S4`.** **Q4 = NO is not
contradicted** — it established that the policy **does not *require*** S4, which
was never the same as excluding it. The envelope now **admits** S4 without
mandating any case reaching it. In practice S3 and S4 will be rare here, because
integrity harm is typically reversible (D-b) and an ecosystem has no *"life or
bodily integrity"* — **a constraint on cases, not a narrower envelope (ENV-1)**.

##### Dimensions requiring qualification

*(⚠️ Corrected — this previously read "**D-c**, **D-f**, **D-g** — wording only",
which was wrong on both counts: it omitted D-b and D-d, and it mislabelled D-g as
a wording issue.)*

**✅ ALL RESOLVED by the ratified G02-D-09a amendment (2026-08-15).** This
section previously recorded these as pending; it is retained as the record of
what the amendment had to address.

- **Was person-scoped — four dimensions, now generalised:** **D-b** (*"harm to the **person** can be undone"* → *"harm to the **affected subject** can be undone"*) · **D-c** (*"affected **persons**"* → *"the affected **subject**"*) · **D-d** (*"**one person**, a determinate group"* → *"**one subject**, a determinate group"*) · **D-f** (*"an identifiable **person**"* → *"an identifiable **subject**"*).
- **Was subject-neutral, guard required — one dimension:** **D-g** (*"abuse of power, dependency or constrained choice"*). It took **no wording change**; the amendment added the ratified guard that vulnerability or constrained choice **must be established from the circumstances of the affected subject and must never be inferred solely from species, category, or status**. *"Constrained choice"* remains anthropomorphic for non-human subjects.
- **Subject-neutral, no change needed:** **D-a** (already *"harm to the affected **interest**"*) · **D-e**.

**Human readings are unchanged** by all five changes.

##### Policies whose envelope must remain OPEN

`ts.graphic.presentation` and `ts.sexual.adult-content` — **RESTRICTED**. ✅
**`G02-D-02` is now RESOLVED** (the class is in scope for v1), so it is **no
longer their blocker**; they remain OPEN on **`G02-D-02a`** — the deferred
question of what severity representation a `RESTRICTED` policy carries — and
`ts.sexual.adult-content` additionally on **`G02-D-04`**. The protected-interest
analysis resolves **neither of those**.
`ts.hate.protected-target-abuse` — OPEN on **G02-D-07b**.

#### 7.3.11 G02-D-09g — protected-interest declaration / policy schema

> **STATUS: OPEN — OWNER DECISION REQUIRED.** Schema analysis only. No field
> added, no rule rewritten, no policy value invented.

##### Evidence, verbatim

**§3.5 (L4 — Harm):** *"Every policy names the protected interest it exists to
defend: physical safety, psychological safety, dignity, privacy, financial
security, sexual autonomy, child welfare, animal welfare, informational
integrity, ecosystem integrity."*

**HRM-1:** *"A policy with no nameable harm is not a policy (WF-3). This is the
guard against 'offensive but harmless' becoming enforceable."*

**WF-3:** *"Every policy names the **harm** it protects against."*
**WF-5:** *"Every policy declares severity class, evidence sensitivity,
disposition, applicability, content classes (SCOPE-1), identity and version."*
**WF-7:** *"No two policies share the same **behavior × context × harm** triple
without a declared relationship."*
**§5 preamble:** *"A policy failing any of them is malformed and cannot be
ratified. Group 14 can check them mechanically."*

**§9 registry:** fields present are `Governs`, `Does not govern`,
`Constitutive boundary`, `Ambiguity`, `Legal`. **No harm or protected-interest
field. Zero of 18 declare one.**

##### Q1 — Is WF-3 actually required? → **A, deliberate and mandatory**

Three independent supports: the **§5 preamble** makes every WF rule a
ratification gate and mechanically checkable; **HRM-1** makes a nameable harm
*constitutive of being a policy at all*; and **WF-7** uses harm as a component of
**policy identity**, so uniqueness checking cannot run without it.

**Not C (redundant)** — no existing field carries it (Q4). **Not B
(aspirational)** — the preamble forecloses that reading. **Not D (incorrectly
specified)** — the requirement is coherent; only its implementation is missing.

##### Q2 — WF-3 vs WF-5 → **correction: not a conflict**

**I overstated this at the previous gate.** I reported that *"WF-3 and WF-5
disagree about what a policy must declare."* On re-reading, **they do not
disagree.** WF-5 enumerates a list; it does **not** say "and nothing else". The
two are **cumulative**, not contradictory.

The real defect is narrower and still worth fixing: **WF-5 reads as *the*
declaration schema while omitting what WF-3 mandates.** Anyone implementing WF-5
as the field set produces a policy that violates WF-3 — which is precisely what
the §9 registry did. Call it a **schema-surface incompleteness**, not a conflict.

**Precedence: the document defines none among WF rules** (verified: zero
statements of one WF rule overriding another). **None is invented here.** No
precedence is needed anyway, since the rules are cumulative.

##### Q3 — What is a "protected interest"? → **(1), with a documented ambiguity**

Of the four candidates: it is **(1) the thing the policy exists to protect**, per
§3.5's own sentence. It is **not (3) the affected subject** — §7.3.10 already
separates subject (person / animal / ecosystem) from interest.

**Ambiguity to report: §3.5 conflates (1) and (2).** Its heading is
**"L4 — Harm"** while its body says *"names the **protected interest**"*. These
are converses — harm is the damage, the interest is what is damaged — and the
document uses them interchangeably. **WF-3 says "harm", §3.5 says "protected
interest", WF-7 says "harm".** The concepts are close enough to have gone
unnoticed and different enough to matter for a machine check.

**Boundaries preserved:** protected interest ≠ protected characteristic (PI-4) ·
≠ topic (TOP-1, WF-2) · ≠ severity (PI-3) · ≠ harm class H1–H5 (see gap below) ·
≠ enforcement · ≠ legal classification (LG-3, PT-3).

##### Q4 — Can an existing field substitute? → **No**

| Field | Can it serve? | Why not |
|---|---|---|
| `Governs` | **No** | States the **behavior** and its context — *what is done*, not *what is protected*. Interest is at most inferable, and WF-3 requires **naming** |
| `Does not govern` | **No** | Negative scope only |
| `Constitutive boundary` | **No** | Where the behavior begins |
| `Ambiguity` | **No** | Known hard cases |
| `Legal` | **No** | Legal-review pointers; conflating it would breach **PI-4/LG-3** |

**No field is renamed or repurposed to make the schema look complete.**

##### Two further findings

**FINDING F — SCOPE-1 is also unmet.** WF-5 requires content classes per SCOPE-1
(*"a policy silent on class is incomplete"*). **Zero of 18 declare content
classes.** The registry's non-compliance is broader than WF-3 alone.

**FINDING G — Two harm vocabularies that do not reconcile.** §3.5 lists **ten
protected interests**; §9.6.3 defines **H1–H5** deception harm classes. They are
different vocabularies at different scopes, and **H4 (coercion/exploitation)** and
**H5 (targeted reputational/livelihood)** have **no clean counterpart** among the
ten — "autonomy" is absent (only *sexual* autonomy is listed) and "livelihood"
splits across dignity and financial security. Any field constrained to the ten
would fail to express two of the five H classes.

##### Q5 — Should a field exist? Options

| | Option | Assessment |
|---|---|---|
| **A** | **Add an explicit `Protected interest` field** *(recommended)* | Clear; **machine-checkable** (presence, and membership in a declared vocabulary); reviewable; versionable per §12; supplies exactly what 09f option D needs; keeps interest separate from behavior. Risk of topic creep (*"blood"* as an interest) is mitigated by constraining the vocabulary — which is sub-decision **A1** |
| **B** | Expand `Governs` | **Conflates behavior with interest**, collapsing an L2/L4 distinction the layer model exists to keep. Poorly machine-checkable — a checker cannot tell which clause is the interest |
| **C** | Semantic property, not a registry field | Unverifiable and unreviewable. WF-3 says *"names"*, which implies stating. Leaves the mechanical check impossible, so §5's promise fails |
| **D** | Remove or revise WF-3 | **Not viable, but evaluated seriously.** WF-3 is load-bearing three ways: HRM-1's *"offensive but harmless"* guard becomes unenforceable; WF-7's identity triple loses a component; 09f option D loses its anchor. Removing it would weaken the taxonomy's central guard against enforcing mere offence |
| **E** | Other | Nothing found that is not a variant of A |

**Recommendation: A — but it is not a single decision.** Adopting A forces three
materially different sub-choices, **not made here**:

- **A1** — Is the value constrained to a declared vocabulary (the §3.5 ten), or free text? *Constrained is machine-checkable; free text invites topic creep.*
- **A2** — May a policy declare **more than one** interest? Several plausibly protect two.
- **A3** — How do the ten reconcile with **H1–H5** (Finding G)? Two H classes have no counterpart.

##### 18-policy expressibility — **no values populated**

Classifying only whether existing policy text could *safely support* a value.
**Nothing is filled in.** Evidence is the "evident interest" column at §7.3.10,
which remains evidence, not a declaration.

| Classification | Count | Policies |
|---|---|---|
| **Clearly expressible** | **14** | `violence.incitement-threats` · `selfharm.promotion` · `danger.harmful-activity` · all four `child.*` · `sexual.exploitation-nonconsent` · `harassment.targeted` · `hate.protected-target-abuse` *(expressible; policy separately OPEN on G02-D-07b)* · `privacy.personal-information` · `animal.cruelty` · `fraud.scam` · `platform.abuse-manipulation` |
| **Partially expressible** | **1** | `deception.harmful` — its interest **varies per case** with the established H-class, so a single policy-level value may be the wrong shape (interacts with **A2**, **A3**) |
| **Ambiguous** | **1** | `violence.graphic-harm` — dignity of the depicted person, or normalisation of violence? Genuinely contestable from the current text |
| **Not currently expressible** | **2** | `graphic.presentation` · `sexual.adult-content` — `RESTRICTED`; no harm is established, so there may be nothing to name. **Leave OPEN. G02-D-02 and G02-D-04 are not resolved.** |

##### Does severity legitimately depend on this?

**Only under 09f option D.** Options A (subject/entity), B (two scales) and C
(per-policy reading) need no declared interest.

**Therefore: G02-D-09f can proceed without 09g — but option D cannot.** If the
Owner selects D, 09g is a hard prerequisite, because D anchors S1–S4 to a
declaration that does not exist. Everything else in the severity model is
untouched by this question: S1–S4, D-a…D-g, case-level severity, envelopes,
`SEVERITY_UNDETERMINED`, and the bars on numerics, scores, weights, formulas,
risk, enforcement and confidence all stand.

##### Proposed Owner Decision

> ### G02-D-09g = OPEN — OWNER DECISION REQUIRED
>
> **Does the policy schema formally declare a protected interest, and how?**
> Recommended **option A** (explicit field), which forces **A1** (constrained
> vocabulary or free text), **A2** (one interest or several) and **A3**
> (reconcile the ten with H1–H5, Finding G).
>
> Also requiring decision: **Finding F** — SCOPE-1 content classes are
> undeclared across all 18 — and the **§3.5 harm/interest conflation** in Q3.
> **WF-3 and WF-5 are cumulative, not conflicting** (Q2 correction); no
> precedence among WF rules exists or is invented.

#### 7.3.12 G02-D-09g — decision space

> **STATUS: OPEN. Nothing resolved, no field added, no value populated, no rule
> or vocabulary rewritten.** This section defines *what must be decided*.

##### FINDING H — the gap is systemic, not specific to WF-3

Compliance across the §9 registry, counted directly:

| Requirement | Compliant |
|---|---|
| **WF-3** harm / protected interest | ~~**0 / 18**~~ → **18 / 18** *(2026-08-16, machine-verified)* |
| **SCOPE-1** content classes (via WF-5) | ~~**0 / 18**~~ → **18 / 18** *(2026-08-16, machine-verified)* |
| **WF-4** states what it does not govern | ~~**14 / 18**~~ → **18 / 18** *(2026-08-16, machine-verified)* |
| **WF-5** applicability, identity, version, per policy | **not declared per policy** |

**The four non-compliant WF-4 policies are the entire D2 child-safety domain**,
which is written as **one-line bullets with no field structure at all** — so the
four most safety-critical policies carry the *least* structure in the registry.

**Root cause:** the registry predates the WF rules, and **no compliance pass was
ever run**. Adding a protected-interest field alone would leave the registry
still malformed under §5. → **G02-D-09g-6**.

##### PART 1 — A1, vocabulary

| Criterion | **A1-A** closed canonical | **A1-B** controlled + extension | **A1-C** structured free text | **A1-D** free text |
|---|---|---|---|---|
| Machine-checkable | **yes** (membership) | **yes** (membership at a version) | partial (shape only) | **no** |
| Semantic drift | none | governed | high | **uncontrolled** |
| Versioning | set version | **set version + governed extension** | none | none |
| Reviewability | high | high | medium | low |
| Represents all 18 today | **no** — gaps at H1/H3/H4/H5 (Part 3) | **yes, after governed extension** | yes | yes |
| Represents future policies | needs a version bump each time | **yes, by design** | yes | yes |
| Non-human interests | **yes** — animal welfare, ecosystem integrity are already in the ten | **yes** | yes | yes |
| Platform / system integrity | **yes** — "ecosystem integrity" | **yes** | yes | yes |
| Legal contamination risk | low | low | medium | **high** |
| Relationship to H1–H5 | blocked without extension | **workable** | unconstrained | unconstrained |
| "Other" bucket ⇒ unbounded scope | none exists | **none** — extension is a governed act, not a bucket | n/a | effectively unbounded |

**Recommended: A1-B**, and the reason is precedent rather than preference —
**it is exactly the model already ratified for H1–H5** at G02-D-08: a closed set,
*"extension only by versioned Policy Taxonomy change plus separate Owner
approval, never by interpretation"*. Using a different model for interests than
for harm classes would be an unforced inconsistency.

**A1-A is not automatically superior** and in fact **fails today**: the ten
cannot express H4 at all (Part 3), so a strictly closed set would either block
the deception policy or force a bad mapping.

##### PART 2 — A2, cardinality

| | Model | Test result |
|---|---|---|
| **A2-A** | exactly one per policy | **Fails at least three.** `deception.harmful` (interest varies by established H-class) · `privacy.personal-information` (privacy **and** personal security — its S4 reach reads on physical-safety risk) · `violence.graphic-harm` (dignity vs normalisation, genuinely ambiguous) |
| **A2-B** | one **primary** + zero or more secondary | **Expresses 17 of 18.** The primary gives **WF-7's identity triple a stable anchor**, which matters because harm is a component of policy identity |
| **A2-C** | multiple, unordered | Expresses everything but **weakens WF-7** — with no primary, the uniqueness check becomes set comparison, and "same harm" becomes ambiguous |
| **A2-D** | case-level only | **Breaks two rules.** WF-3 becomes unsatisfiable at policy level and WF-7's triple loses its harm component. Also leaves 09f option D with no anchor for the **envelope**, which is policy-level by definition (ENV-1) |

**Where does the interest actually belong? A combination — and the evidence is
specific:**

- **Policy-level** for 17 policies.
- **Harm-class-derived** for **`ts.deception.harmful`** — element 3 selects an H class, and the interest follows *that*, not the policy. This is a **third locus** the question did not list, and it is the honest description.
- **Case-level** is where the interest is *observed*, but that follows from the two above rather than being independent.

**Recommended: A2-B, plus an explicit marker for harm-class-derived interests.**
Not adopted — it depends on A3.

##### PART 3 — A3, relationship to H1–H5

Tested individually against the §3.5 ten. **No mapping invented for symmetry.**

| H class | Counterpart in the ten | Relationship |
|---|---|---|
| **H1** Physical safety and health | *physical safety* ✓ · **"health" absent** | **partial** — one-to-one on safety, unmapped on health |
| **H2** Financial and transactional | *financial security* ✓ | **one-to-one** — "transactional" is a mechanism, not a distinct interest |
| **H3** Privacy, identity and account-security | *privacy* ✓ · **identity and account-security absent** | **partial** |
| **H4** Coercion and exploitation | **none** — *autonomy* is absent; only **sexual** autonomy is listed | **no counterpart** |
| **H5** Targeted reputational and livelihood | *dignity* (reputation) + *financial security* (livelihood) | **one-to-many** — splits across two interests |

**Only H2 is clean. H1 and H3 are partial, H4 has no counterpart, H5 splits.**

| | Option | Assessment |
|---|---|---|
| **A3-A** | completely separate vocabularies | Honest, needs no extension — but leaves two harm vocabularies attached to a deception case with **no stated relation**, which Groups 06 and 11 would have to reconcile themselves |
| **A3-B** | deterministic H→interest mapping | **Not viable today** — would require inventing *health*, *identity/account-security* and *autonomy*, or forcing bad mappings. **Presupposes A1-B extension** |
| **A3-C** | H1–H5 **reference** one or more interests without defining them | **Least-committal viable option.** Accommodates H5's one-to-many naturally. Still needs *autonomy* for H4 ⇒ **depends on A1-B** |
| **A3-D** | interest is a **parent taxonomy** above harm classes | Elegant, and it would make H1–H5 deception-specific specialisations of general interests — but a parent must cover its children, so it **presupposes the same extension** |

**Recommended: A3-C**, explicitly **dependent on A1-B**. A3-B and A3-D are not
available until the vocabulary can express H4.

##### PART 4 — Finding F / SCOPE-1

**Classification: F2 — an existing requirement whose implementation is
incomplete.** The rule is clearly specified (SCOPE-1: *"a policy silent on class
is incomplete"*) and mandatory via WF-5. It is **not F1**: nothing in the
severity work depends on content classes, so it is not a prerequisite. **Not
F3** — B-5 makes content class materially affect applicability. **Not F4** — the
rule is correct.

**Relationship to the protected-interest schema: two independent decisions,
neither a prerequisite for the other.** They share a **root cause** (Finding H)
but no dependency. **No precedence invented.** The sensible container is a single
**registry-conformance workstream** (G02-D-09g-6) with independent decisions
inside it.

##### PART 5 — the §3.5 ten values, exactly as written

| Value | Assessment |
|---|---|
| physical safety | **clearly usable** |
| psychological safety | **usable**; overlaps *dignity* at the margin |
| dignity | **usable but broad**; overlaps psychological safety and reputation |
| privacy | **usable**; narrower than H3 — no identity or account-security |
| financial security | **clearly usable** |
| sexual autonomy | **usable, but anomalous** — the only *qualified* autonomy, which suggests general autonomy was **omitted rather than excluded**. This is exactly the H4 gap |
| child welfare | **usable**; category-inconsistent — see below |
| animal welfare | **usable**; category-inconsistent — see below |
| informational integrity | **usable** |
| ecosystem integrity | **usable**; covers platform / service integrity |

**Structural observation (not a rewrite).** The ten **mix two different kinds of
thing**: *interest kinds* (safety, privacy, dignity, autonomy, integrity) and
*subject-qualified interests* (**child** welfare, **animal** welfare). A
consistent vocabulary would be either all kinds, or a two-part
`(kind, subject)`. This bears directly on **A1** and **A2** and is reported, not
resolved.

**Expressibility test:** H1 partial · H2 ✓ · H3 partial · **H4 ✗** · H5 splits ·
animal welfare ✓ · platform/service integrity ✓ (*ecosystem integrity*) · child
welfare ✓ · sexual autonomy ✓.

##### PART 6 — 18-policy impact

**Invariant across all 18, stated once rather than repeated:** current
declaration is **NONE**; evidence is the `Governs` line (§7.3.10 column);
interest would be **policy-level** except where noted; **no policy is blocked by
A1-B / A2-B / A3-C**, which is the combination's main argument.

| # | Policy | One interest sufficient? | Multiple necessary? | Locus | §3.5 can represent? | H1–H5 conflict? | Blocked by D-02/D-04? |
|---|---|---|---|---|---|---|---|
| 1 | `violence.graphic-harm` | **ambiguous** | possibly (dignity + safety) | policy | yes | no | no |
| 2 | `violence.incitement-threats` | yes | no | policy | yes | no | no |
| 3 | `selfharm.promotion` | **no** — safety **and health** | yes | policy | **partial** — "health" absent | no | no |
| 4 | `danger.harmful-activity` | yes | no | policy | yes | no | no |
| 5 | `graphic.presentation` | **n/a** | n/a | n/a | n/a | no | **yes — G02-D-02a** |
| 6 | `child.sexual-exploitation` | yes | possibly + sexual autonomy | policy | yes | no | no |
| 7 | `child.sexualization` | yes | possibly + dignity | policy | yes | no | no |
| 8 | `child.grooming` | yes | no | policy | yes | no | no |
| 9 | `child.abuse-harm` | yes | possibly + physical safety | policy | yes | no | no |
| 10 | `sexual.exploitation-nonconsent` | **no** — sexual autonomy + dignity | yes | policy | yes | no | no |
| 11 | `sexual.adult-content` | **n/a** | n/a | n/a | n/a | no | **yes — G02-D-02a, G02-D-04** |
| 12 | `harassment.targeted` | **no** — dignity + psychological safety | yes | policy | yes | no | no |
| 13 | `hate.protected-target-abuse` | yes (dignity) | possibly | policy | yes | no | no *(OPEN on G02-D-07b)* |
| 14 | `privacy.personal-information` | **no** — privacy + personal security | yes | policy | **partial** — "personal security" not a listed value | **H3 partial** | no |
| 15 | `animal.cruelty` | yes | no | policy | yes | no | no |
| 16 | `deception.harmful` | **no** | yes | **harm-class-derived** | **no — H4 unmapped** | **yes — the conflict** | no |
| 17 | `fraud.scam` | yes | no | policy | yes | no | no |
| 18 | `platform.abuse-manipulation` | yes | no | policy | yes | no | no |

**Six policies need more than one interest; one is harm-class-derived; two are
n/a; three hit vocabulary gaps.** Under **A2-A** at least six fail. Under
**A1-A** at least two cannot be expressed.

##### PART 7 — proposed schema shape *(PROPOSAL ONLY — nothing added)*

Conditional on A1-B + A2-B + A3-C:

```
primary_protected_interest    : one value from the controlled vocabulary @version
secondary_protected_interests : zero or more values from the same vocabulary
interest_locus                : "policy" | "harm-class-derived"
vocabulary_version            : the interest-set version this declaration reads against
```

`interest_locus: "harm-class-derived"` exists solely so `ts.deception.harmful`
can be honest rather than forced. **No field is added to the registry, no
implementation, no migration.**

##### PART 8 — relationship to severity

**Conditional, and it depends on an open decision (09f), so it is not decided
here.**

| Under 09f… | Protected interest is… |
|---|---|
| **A / B / C** | **merely explanatory metadata** — the severity model needs nothing from it |
| **D** | **necessary for explaining severity** and **for selecting the envelope** (the envelope is calibrated *within* the interest) — but **NOT for assigning the case class**, which reads D-a…D-g on established facts |

**PI-3 stands under every option: a protected interest is never a severity
multiplier.** "Important interest ⇒ higher severity" is prohibited. All ratified
severity semantics are unchanged — S1–S4, D-a…D-g, case-level assignment,
envelopes, `SEVERITY_UNDETERMINED`, and the bars on numerics, scores, weights,
formulas, risk, enforcement and confidence.

##### PART 9 — boundaries preserved

protected interest ≠ protected characteristic (PI-4) · ≠ topic (TOP-1, WF-2) ·
≠ legal category (PT-3, LG-3 — **no Vietnamese legal category is inferred from
§3.5**) · ≠ harm class (Part 3 shows they are not isomorphic) · ≠ enforcement
action · ≠ severity class (PI-3).

##### PART 10 — Owner Decision register

| ID | Question | Options | Recommended | Depends on | Why it cannot be resolved here |
|---|---|---|---|---|---|
| **G02-D-09g-1** | Vocabulary model | A1-A closed · **A1-B controlled + governed extension** · A1-C structured free text · A1-D free text | **A1-B** — mirrors the ratified H1–H5 closure model | — | Materially different models; A1-A **fails today** on the H4 gap |
| **G02-D-09g-2** | Cardinality | A2-A one · **A2-B primary + secondary** · A2-C unordered set · A2-D case-level only | **A2-B + a `harm-class-derived` marker** | 09g-1, 09g-3 | Six policies need more than one interest; one is harm-class-derived. A2-A and A2-D both break existing rules |
| **G02-D-09g-3** | Relationship to H1–H5 | A3-A separate · A3-B deterministic map · **A3-C reference-not-define** · A3-D parent taxonomy | **A3-C** | **09g-1** (A3-B/C/D all need the vocabulary to express H4) | Only H2 maps cleanly; H4 has no counterpart. B and D are unavailable until the vocabulary can express it |
| **G02-D-09g-4** | Protected-interest schema vs SCOPE-1 content-class schema | one combined decision · **two independent decisions** · one a prerequisite · separate workstreams | **Two independent decisions inside one conformance workstream** | — | Shared root cause (Finding H), **no dependency**; no precedence exists or is invented |
| **G02-D-09g-5** | Treatment of the §3.5 ten values | keep as-is · extend · restructure as `(kind, subject)` · replace | **None recommended** — evidence supports extension for H4, but the **category inconsistency** (kinds vs subject-qualified) is a design question the evidence does not settle | 09g-1, 09g-3 | Deciding it would be rewriting the vocabulary, which this gate forbids |
| **G02-D-09g-6** | Registry conformance (**Finding H**) | field-by-field remediation · full registry rewrite against §5 · amend the WF rules to match the registry | **None recommended** — the scale of the gap is now known but the remedy is not | all of the above | WF-3 **0/18**, SCOPE-1 **0/18**, WF-4 **14/18** with the **entire D2 domain unstructured**. Adding one field leaves the registry malformed under §5 |

##### Case examples — **POLICY ENVELOPE ≠ CASE SEVERITY**

Cases 1, 2, 3 and 5 are all `ts.harassment.targeted`, **envelope `S2–S3`**, and
the policy does not change between them.

| | Scenario | Established facts | Dimensions | Case severity |
|---|---|---|---|---|
| **1** | Bounded facts | one directed insult at an identifiable person; not repeated; no lasting effect | D-f only | **S2** — the envelope's floor |
| **2** | More serious facts | sustained directed abuse over weeks against the same person | D-f, D-e, D-a | **S3** — the envelope's ceiling |
| **3** | Severity evidence insufficient | abuse constituted against an identifiable person, but whether it persisted or reached the person at all cannot be established | D-f only; D-a and D-e unreadable | **`SEVERITY_UNDETERMINED`** — constituted, applicable, unclassifiable (SEV-22). **Not S2** |
| **4** | Constitution unresolved | it cannot be established whether the target was identifiable, so the policy is not constituted | — | **No severity at all.** `INSUFFICIENT_EVIDENCE` (or `DISPUTED` / `INDETERMINATE_CONTEXT`). Severity is never reached (SEV-11, SEV-2.7) |
| **5** | Context changes the applicable dimensions, not the policy | identical words, but directed at someone in a dependent relationship with the speaker — established, not assumed | D-f, D-g **now engaged** | **S3** — the same policy and the same envelope; **the facts moved the class** |

**What these show.** One policy, one envelope `S2–S3`, and four different
outcomes across cases 1, 2, 3 and 5 — plus no severity at all in case 4. The
envelope constrained every one of them and selected none of them (ENV-1,
SEV-2.5). Case 5 is the cleanest demonstration: **the policy did not change, the
established dimensions did.**

##### Case-level tests

Using `ts.harassment.targeted` and `ts.deception.harmful`.

| | Scenario | Established facts | Outcome |
|---|---|---|---|
| 1 | **Low-impact violation** | one directed insult at an identifiable person, not repeated, no lasting effect | **S2** *(S1 unavailable here — targeting is definitional to this policy)* |
| 2 | **Materially significant** | sustained directed abuse over weeks | **S2–S3**, landing S3 on persistence (D-e) |
| 3 | **Grave** | coordinated pile-on that drives the person offline; exploits a dependency | **S3** on D-e + D-g |
| 4 | **Critical** | deception (H1) inducing someone to take a dangerous substance; hospitalisation | **S4** on D-a + D-b reaching bodily integrity |
| 5 | **Ambiguous severity** | deception constituted, H2 harm established, but whether the loss was material to the person cannot be determined | **`SEVERITY_UNDETERMINED`** — the policy **is** constituted; the class is not readable (SEV-25) |
| 6 | **Constitution unresolved** | intent to deceive cannot be established | **no severity at all** — rung 9 or `INSUFFICIENT_EVIDENCE`; severity is never reached (SEV-11) |

**The four unknowns are distinct and must not be merged:**

| | Means | When |
|---|---|---|
| `SEVERITY_UNDETERMINED` | policy **constituted**; severity class not readable | **after** constitution |
| `INSUFFICIENT_EVIDENCE` | a constitutive **element** cannot be established | before severity |
| `DISPUTED` | the underlying **factual question** cannot be settled | before severity |
| `INDETERMINATE_CONTEXT` | **context** unreadable, so the behavior cannot be determined | before severity |

Only the first sits after constitution. The other three mean **no severity was
ever reached**, and none of the four is S1.

---

## 8. Evidence sensitivity

A conceptual declaration of what a policy's decisions demand. It sets no schema
and no retention period.

| Class | Meaning |
|---|---|
| `ORDINARY` | Standard decision record suffices |
| `CORROBORATED` | More than one independent basis required before a violation may be concluded |
| `HUMAN_REQUIRED` | No violation may be concluded without human review, regardless of confidence |
| `LEGALLY_SENSITIVE` | Legal review may attach; handling, access and preservation are stricter (**LEGAL REVIEW REQUIRED**) |
| `RESTRICTED_HANDLING` | The evidence is itself harmful to store or view; minimised, access-bound, special preservation |

**ES-1.** Evidence sensitivity is **independent of severity**. A `CRITICAL`
policy may need corroboration; a `MODERATE` one may be legally sensitive.

---

## 9. Policy families — proposal

**Candidate, not approved** (**G02-D-01**). Six domains, eighteen policies —
deliberately compact. Each policy is stated as *governs / does not govern /
contextual boundary / relationships / ambiguity / legal*.

Identifiers: `ts.<family>.<policy>`, versioned `ts.<family>.<policy>@<n>` (§12).

> **⚠️ Every severity label below is SUPERSEDED vocabulary.** The class set is now
> **Option B — S1 BOUNDED · S2 SIGNIFICANT · S3 GRAVE · S4 CRITICAL**
> (**G02-D-09a**, §7.3.6). The labels shown here — `MINIMAL`, `MODERATE`,
> `SERIOUS`, `SEVERE`, `CRITICAL` — belong to the **rejected Option A** and
> **carry no meaning under S1–S4**. They **do not map across** (SEV-6): no reader
> or later group may translate one into the other. Re-assignment is
> **G02-D-09d**, and until it completes **every policy below is severity-OPEN**.

**Disposition class** — the policy's normative stance, **not an enforcement
action** (Group 09 owns actions):
`PROHIBITED` (behavior not permitted) · `RESTRICTED` (permitted subject to
conditions such as audience or presentation) · `CONDITIONAL` (permitted; policy
exists to define the boundary).

---

### 9.1 D1 — Human Physical Safety

**`ts.violence.graphic-harm`** — severity `SEVERE` · evidence `ORDINARY` · `PROHIBITED`
- **Conformance (SC-1)** — `identity` ✅ `ts.violence.graphic-harm` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `ORDINARY` · `disposition` ✅ `PROHIBITED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** dignity — of the person being recorded. **secondary:** psychological safety — of the audience *(Owner decision 2026-08-16, resolving the reading §7.3.10 recorded as **contestable**. Both subjects the corpus records for this policy are expressed: *"depicted person; audience"*. **`normalisation of violence` was NOT selected** and **no vocabulary extension was made** — the value uses two terms already in the list, under the 09g-2 **A2-B** primary/secondary model)* · `applicability` ✅ **Actor:** `content item`. **Target:** the depicted person, and the audience *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose**, **Actor & target** *(§6.1. Purpose is decisive — the entire `Does not govern` list is purpose-based: news, documentary, historical record, medical/surgical, education, fiction, and food preparation. Actor & target is decisive on the identifiability of the depicted person. Setting not decisive on the current text)* · `severity_envelope` ✅ **S2–S3** *(ratified G02-D-09d, 2026-08-15 — Owner; bounds CHOSEN, not derived)* · `relationships` ✅ *see Relationships*
- **Governs:** depicting infliction of serious physical harm on people where the depiction glorifies, celebrates, or exists primarily to shock.
- **Does not govern:** news · documentary · historical record · medical/surgical · education · fiction and artistic depiction · ordinary depiction incidental to a narrative · **any food preparation**.
- **Constitutive boundary:** the constitutive element is *glorification or shock-primacy*, not the presence of injury or blood. Blood is a topic (TOP-1) and cannot constitute this policy.
- **Relationships:** narrower than `ts.graphic.presentation`; related to `ts.violence.incitement-threats`.
- **Ambiguity:** war and atrocity documentation is simultaneously journalism and extreme imagery. Resolution favours the journalistic purpose, with `ts.graphic.presentation` available for presentation handling.

**`ts.violence.incitement-threats`** — severity `SEVERE` · evidence `CORROBORATED` · `PROHIBITED`
- **Conformance (SC-1)** — `identity` ✅ `ts.violence.incitement-threats` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `CORROBORATED` · `disposition` ✅ `PROHIBITED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** physical safety *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`, `actor/account`. **Target:** the targeted person or group *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose**, **Actor & target** *(§6.1. Actor & target is decisive by the `Constitutive boundary` — requires credibility AND a target, both together. Purpose is decisive via `Does not govern`: hyperbole, fiction, gaming and sports idiom, reporting, advocacy for lawful action)* · `severity_envelope` ✅ **S3–S4** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **related-to** `ts.violence.graphic-harm` *(the converse of that policy’s own declared `related to` — §11. No shared triple, so WF-7 is not triggered)*
- **Governs:** credible threats of violence against identifiable people or groups; incitement or solicitation of violence.
- **Does not govern:** hyperbole · fiction · gaming and sports idiom · reporting on threats made by others · advocacy for lawful action · anger without a target.
- **Constitutive boundary:** requires **credibility** and a **target**. Both, together.
- **Ambiguity:** credibility is context-dependent and culturally variable; Vietnamese hyperbolic idiom is a known false-positive source (§14).

**`ts.selfharm.promotion`** — severity `SEVERE` · evidence `HUMAN_REQUIRED` · `PROHIBITED`
- **Conformance (SC-1)** — `identity` ✅ `ts.selfharm.promotion` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `HUMAN_REQUIRED` · `disposition` ✅ `PROHIBITED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** physical safety. **secondary:** health *(the source records the interest as "life and health"; `health` is one of the three interests added by the 2026-08-16 extension)* *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`, `actor/account`. **Target:** the audience at risk *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose**, **Actor & target** *(§6.1. Actor & target is decisive by the `Constitutive boundary` — promotion or instruction **directed at others**, of which disclosure is the inverse. Purpose is decisive because support-seeking yields `APPLICABLE_NO_VIOLATION` under OUT-3)* · `severity_envelope` ✅ **S4** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*
- **Governs:** encouraging self-harm or suicide; instructing in methods; content designed to induce self-harm in others.
- **Does not govern — explicitly and importantly:** personal disclosure · support-seeking · recovery narrative · prevention and awareness · education · journalism · memorial · clinical discussion.
- **Constitutive boundary:** the constitutive element is **promotion or instruction directed at others**. Disclosure is its inverse.
- **OUT-3 applies.** Support-seeking is `APPLICABLE_NO_VIOLATION`, response-warranted. **Treating disclosure as violation is itself a foreseeable harm** and this policy is written to make that structurally impossible.
- **Ambiguity:** imminent-risk indicators are a *care* pathway, not an enforcement pathway. **G02-D-05.**

**`ts.danger.harmful-activity`** — severity `SERIOUS` · evidence `ORDINARY` · `PROHIBITED`
- **Conformance (SC-1)** — `identity` ✅ `ts.danger.harmful-activity` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `ORDINARY` · `disposition` ✅ `PROHIBITED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** physical safety *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`. **Target:** the imitating audience *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose**, **Setting** *(§6.1. Purpose is decisive via `Does not govern`: professional or stunt content with evident expertise, safety education, warning content, fiction, documentation of risk. Setting is decisive on audience, since `Governs` requires presentation **as encouragement to imitate**)* · `severity_envelope` ✅ **S3–S4** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*
- **Governs:** instruction or promotion of activity posing serious risk of physical harm, where presented as encouragement to imitate.
- **Does not govern:** professional/stunt content with evident expertise · safety education · warning content · fiction · documentation of risk · lawful activity that is merely dangerous.
- **Legal:** overlap with illegal-activity questions — **G02-L-03**.

**`ts.graphic.presentation`** — severity `MODERATE` · evidence `ORDINARY` · **`RESTRICTED`**
- **Conformance (SC-1)** — `identity` ✅ `ts.graphic.presentation` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `ORDINARY` · `disposition` ✅ `RESTRICTED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** psychological safety *(of the viewer — ratified by Owner 2026-08-15 as `G02-D-02a` repair input (i); this declaration records the already-ratified value, it does not re-decide it. Its HRM-2 rationale remains not independently established)* *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`. **Target:** the viewer *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-15; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Setting** *(§6.1, decisive on **`viewing initiation`** — the `Constitutive boundary` states the constitutive element is **`NOT_VIEWER_INITIATED` viewing of the assessed item**, expressly **not** the intensity of the imagery, which is a topic under TOP-1)* · `severity_envelope` ✅ **`NO_ENVELOPE`** *(`G02-D-02a` = **C**, Owner 2026-08-16 — `RESTRICTED` policies carry no severity envelope at taxonomy level; see **ENV-7**. This is **not** `OPEN` and **not** `S1`; the question does not arise for this policy class)* · `relationships` ✅ **broader-than** `ts.violence.graphic-harm` *(the converse of that policy’s own declared `narrower than` — §11. WF-7 itself is not triggered: the two differ on both context and harm, which is exactly why WF-7 was recorded as SATISFIED for this policy)*
- **Governs:** **presenting** intensely graphic imagery **to a viewer who did not initiate the viewing of that item** (`viewing initiation` = `NOT_VIEWER_INITIATED`, §3.3). **Not a prohibition** — the outcome is that **presentation conditions apply** (audience or interstitial). *(Restructured 2026-08-15; previously read "whether intensely graphic imagery requires presentation handling (audience or interstitial)", which declared no constitutive behavior and left a topic as the sufficient condition.)*
- **Constitutive boundary:** the constitutive element is **`NOT_VIEWER_INITIATED` viewing of the assessed item**, **not the intensity of the imagery**. Intense imagery is a **topic** (TOP-1) and cannot constitute this policy; it may only narrow which policies are worth evaluating (TOP-2). The initiation state must be **established from the presentation event**, never inferred from subject matter, content class, intensity, or the policy category under which the item was retrieved. 🔑 **Graphic material inside an item the viewer *did* initiate is not reached by this policy** — the assessed unit is **the content item (§3.1)** and **no sub-item is created**. That is **non-constitution**, *not* `INDETERMINATE_CONTEXT`.
- **Does not govern:** whether the underlying conduct violates anything — that is other policies' work.
- **Protected interest:** **psychological safety** of the **viewer** — *ratified by Owner, `G02-D-02a` repair input (i), 2026-08-15.* This satisfies **WF-3** and **HRM-1** *(Layer 1 — naming in prose)*. 🚨 **HRM-2 compliance rests on an explicit Owner threshold judgment**: HRM-2 bars *offence*, *discomfort* and *unfamiliarity* from counting as harm, and the Owner judged that **unwarned exposure to intensely graphic imagery exceeds mere discomfort**. 🕐 **HISTORICAL — Q2(c) option (a), SUPERSEDED 2026-08-15; retained verbatim under CM-3 / VER-4:** *"🔷 **OWNER DECISION (2026-08-15) — THE INTEREST IS KEPT; ITS HRM-2 RATIONALE IS FORMALLY DEFERRED BEHIND `G02-D-08c`.** The **naming requirement is satisfied**: §3.5 enumerates `psychological safety` as an existing protected interest and §7.3.12 rates it **usable**, so **WF-3 / HRM-1 are met**. But the **HRM-2 rationale above is NOT independently established** and **must not be treated as such**: the substantive distinction it needs — separating policy-relevant psychological harm from **offence, discomfort, unfamiliarity, criticism, disagreement and embarrassment** — is **already deferred under `G02-D-08c`**, which records that "no boundary separating ordinary offence… from policy-relevant harm can be drawn safely at taxonomy level today".*"

🔷 **SUPERSEDING OWNER DECISION (2026-08-15) — OPTION B: THE `G02-D-08c` DEPENDENCY IS DETACHED.** **`G02-D-08c` is *related* to this policy's HRM-2 question but is NOT mechanically required for it.** The prior dependency **was an Owner sequencing choice, not a taxonomy requirement**: a primary-source audit found **no rule** making D-08c a prerequisite for #5, and **`ts.harassment.targeted` holds `psychological safety` as a ratified interest with no D-08c dependency whatsoever**. **`G02-D-08c` is formally scoped to deception / H1–H5 harm classes (§9.6), so its resolution does NOT establish that #5 would thereby be unblocked.** ⇒ **#5 returns to `G02-D-02a` on its own evidence.** 🚨 **Nothing about the substance changes:** the **naming requirement remains satisfied** (§3.5 + §7.3.12 *usable* ⇒ WF-3 / HRM-1 met); the **HRM-2 rationale remains NOT independently established** and must still not be treated as such; **detachment implies NO HRM-2 conclusion whatsoever**, favourable or otherwise; **`G02-D-08c` is NOT resolved and is NOT modified**; and **WF-2 remains unresolved** — this policy still has no `Constitutive boundary`. 🚨 **This is a DEFERRED-RATIONALE dependency only** — **not** a severity decision, **not** a new taxonomy dependency, and **not** a claim that `psychological safety` is an H1–H5 class: **the formal relationship between `G02-D-08c`'s H1–H5 question and the §3.5 protected-interest vocabulary is UNRESOLVED and must not be inferred** (it is open under `G02-D-09g-3`). **The interest is NOT disproven and input (i) is NOT reopened.** **`unwarned` remains an ungrounded term and must never be promoted into taxonomy vocabulary.** **The interest is the viewer's, not the depicted person's** — dignity of the depicted remains with `ts.violence.graphic-harm` (WF-7). ⚠️ **This is NOT the SC-1 `protected_interest` field**, which remains **OPEN on `G02-D-09g-1/2/3/5`** *(Layer 2)*, because **09g-5 may restructure or replace the §3.5 ten**.
- **Why it exists separately:** it lets TappyAI handle a legitimate but intense surgical or journalistic video **without ever classifying it as a violation**. Culturally specific food content is expressly in view here (§14).
- **G02-D-02:** ✅ **RESOLVED (2026-08-15) — `RESTRICTED` IS in scope for v1**, so this policy exists as written. 🔶 Its **severity representation** is deferred to **`G02-D-02a`**, which is why its envelope remains OPEN under `G02-D-09d`.
- 🔷 **REPAIR AUTHORISED — status pointer, not a definitional element (2026-08-15).** Under `G02-D-02a` option **C-split**, this policy's definition is to be repaired **now**, **Layer 1 only**. ✅ **Input (i) SUPPLIED (2026-08-15): protected interest = psychological safety of the viewer** — see the *Protected interest* bullet above; **WF-3 / HRM-1 satisfied at Layer 1**. 🕐 ~~Its HRM-2 rationale is DEFERRED behind `G02-D-08c` (Owner, 2026-08-15) — the interest is kept and not reopened; only the rationale is deferred, and it must not be treated as independently established until `G02-D-08c` resolves.~~ **SUPERSEDED 2026-08-15 (CM-3/VER-4).** 🔷 **OPTION B — DEPENDENCY DETACHED.** **`G02-D-08c` is related but NOT mechanically required**; the prior link was an **Owner sequencing choice**, and D-08c's **deception / H1–H5 scope** does not establish that resolving it would unblock #5. **#5 returns to `G02-D-02a` on its own evidence.** **The interest is still kept and not reopened; its HRM-2 rationale is still NOT independently established; detachment implies no HRM-2 conclusion; `G02-D-08c` is untouched and unresolved.** 🔴 **Input (ii) UNRESOLVED — REPAIR HALTED INCOMPLETE (2026-08-15).** A `Constitutive boundary` preventing this policy's condition reducing to the topic *"intensely graphic imagery"* (**WF-2**) **could not be drafted from ratified vocabulary** — the corpus has no established term for a viewer's advance awareness of what they are about to see, and every adjacent term (`notice`, `warning`, `interstitial`, `surface`, `consent`, `content class`) carries a materially different established meaning. **The Owner declined the minimal L3 Setting vocabulary amendment**, so **no new term was coined and §3.3 is unchanged**. ⇒ **This policy remains WF-2-deficient; the question returns to `G02-D-02a`.** ✅ **REPAIR COMPLETED 2026-08-15 — `WF-1` and `WF-2` are now CLOSED**, by a single restructure: `Governs` states a **behavior** (*presenting*) qualified by the **`NOT_VIEWER_INITIATED`** situational modifier (§3.3), with a `Constitutive boundary` recording the topic-proxy guard. **Repair status: WF-1 ✅ · WF-2 ✅ · WF-3 ✅.** 🚨 **This does NOT make #5 ratifiable** — **§5** bars ratification for *any* unmet well-formedness rule, and ~~`WF-5` (severity class, applicability, content classes, version), `WF-6` (defeating contexts) and `WF-7` (relationships) remain unmet, all via `OPEN` conformance fields~~ **⚠️ CORRECTED 2026-08-15 (Owner-authorised): `WF-5` and `WF-6` remain OPEN; `WF-7` is SATISFIED.** **`WF-5`** is unmet on four declarations — severity class *(dependency-blocked on `G02-D-09d` / `G02-D-02a`)*, applicability, content classes and version *(each an Owner decision, no dependency)*. **`WF-6`** is unmet because `defeating_contexts` reads `OPEN`, and **`OPEN` is not a declaration** — WF-6 expressly permits a policy to **declare none**, so it is satisfiable by a single Owner act with no dependency. **`WF-7` is SATISFIED**: it tests whether two policies **share the same *behavior × context × harm* triple**, and #5 shares none — #1 is *depicting infliction of serious physical harm* × *glorification / shock-primacy* × its own harm structure, whereas #5 is *presenting intensely graphic imagery* × **`NOT_VIEWER_INITIATED`** × *psychological safety of the viewer*. **No equivalence between #5 and #1 is implied.** Independently, **#1 already declares `narrower than ts.graphic.presentation`** (a §11 relationship), and WF-7 does not specify which side declares. 🔑 **The SC-1 `relationships` field is a record-shape requirement (SC-1 / `G02-D-09g-7`) and is NOT itself WF-7** — the earlier wording conflated the two. *Caveat: `ts.sexual.adult-content` remains unrepaired, so a future relationship/collision assessment involving it remains open; this is **not** a present WF-7 failure for #5.* The SC-1 `protected_interest` field stays **OPEN on 09g-1/2/3/5** (Layer 2), the **severity envelope stays `OPEN`**, and **`G02-D-02a` remains OPEN**.
- ✅ **Q1 RESOLVED — OWNER APPROVED (2026-08-15): OPTION A — DEFINITION DEFECT.** The missing `S1–S4` envelope is a **defect in this policy's definition**, **not a property of `RESTRICTED`**. **Two well-formedness rules are unmet:** *(both **REPAIRED 2026-08-15** — see the repair record below; the finding is retained verbatim as the ratified basis of Q1 = A, per CM-3/VER-4, and the characterisation "definition defect" is **unchanged and confirmed** by the fact that a definition repair closed them.)* 🔴 **WF-1** — `Governs` states **a question/determination about content**, *"**whether** intensely graphic imagery **requires** presentation handling"*, and therefore **declares no constitutive behavior** *(new finding: all 16 non-`RESTRICTED` policies state a behavior; both `RESTRICTED` ones state a question)*; 🔴 **WF-2** — *"intensely graphic imagery"* is a **topic (TOP-1)** and cannot be a sufficient condition. **Not B**, because **SC-1 keeps `disposition` and `constitutive_behavior` separate**, so the disposition cannot govern whether a behavior is nameable. 🚨 **No severity or envelope is derived; `severity_envelope` stays `OPEN` per ENV-6; no new state; `G02-D-08c` is no longer a blocker.** 🔶 **The definition is NOT repaired here — that is a separate gate**, since the vocabulary needed for a safe boundary does not exist and the L3 amendment was declined.

---

### 9.2 D2 — Child Safety — structurally isolated

**CS-0 — No generic context defeats an *established* child-safety violation.**
These policies declare **no defeating contexts** (WF-6). Narrow constitutive
boundaries are drawn *inside* each definition instead. This prevents the §6.3
instrument from ever being pointed at this domain — the reason child safety is a
**domain** rather than a family inside another.

#### CS-0.1 — CS-0 does **not** mean context is irrelevant to child safety

This distinction is the whole of CS-0 and misreading it would be harmful in
either direction — either context is ignored and ordinary family photographs
become findings, or context is treated as a discount and real violations are
excused.

```
CONTEXT HELPS DETERMINE THE ACTUAL BEHAVIOR
        ↓
POLICY DETERMINES WHETHER THAT BEHAVIOR VIOLATES
        ↓
GENERIC CONTEXT CANNOT AUTOMATICALLY ERASE
AN ESTABLISHED CHILD-SAFETY VIOLATION
```

**CS-0.2 — Context is fully in force at the *what happened* stage.** Determining
what a thing actually is — a medical photograph, a family record, a school
event, a historical archive, a safeguarding report, a work of fiction — requires
context, and child-safety policies use it exactly as every other policy does.
The layer model (§3) is unchanged here: L3 Context feeds the determination of
L2 Behavior.

**CS-0.3 — Context loses defeating power only *after* constitution.** Once the
constitutive elements of a child-safety violation are established, generic
purposes — **educational, documentary, artistic, historical, cultural,
journalistic** — do **not** automatically defeat the violation. In every other
domain a purpose may be a defeating context (§6.3); in this domain it may not.

**CS-0.4 — Why the two stages are not the same thing.** "This is a clinical
photograph" is a claim about *what the thing is*, and it operates at CS-0.2.
"This is exploitative material, but it is being shared for educational
purposes" is a claim about *what may be excused*, and it operates at CS-0.3
where it has no force. Collapsing the two is exactly how generic exceptions
reach child safety, and CS-0 exists to keep them apart.

**CS-0.5.** Nothing in CS-0 is an enforcement rule. What follows from an
established violation is Groups 06 and 09.

**CS-1.** All are evidence `LEGALLY_SENSITIVE` + `RESTRICTED_HANDLING` +
`HUMAN_REQUIRED`, severity `CRITICAL` *(provisional — **G02-D-09**)*,
disposition `PROHIBITED`.

**CS-2 — LEGAL REVIEW REQUIRED across this entire domain** (**G02-L-01**),
including definitions, evidentiary handling, preservation, and any reporting
question. **This document asserts no statutory obligation** (Group 01 LG-2).

- **`ts.child.sexual-exploitation`** — sexual exploitation of minors, and material depicting it. **G02-L-01.**
  - **Conformance (SC-1)** — `identity` ✅ `ts.child.sexual-exploitation` · `constitutive_behavior` ✅ *"sexual exploitation of minors, and material depicting it"* · `does_not_govern` ✅ **clinical or medical content**, **documentation or journalism**, **educational context**, **historical material** *(conformance remediation 2026-08-16, SC-7 authorised; Owner decision A. Source: **`CS-5.7` rows G, H, I and K**, each of which records these as **`NOT_APPLICABLE` — not constituted**, with context fully operative under **CS-0.2**. **Deliberately NOT included:** fiction, which `CS-5.7` row L makes conditional and routes to **`G02-L-01`**; and the further `CS-0.2` illustrations (a family record, a school event, a safeguarding report), which the corpus offers only as aids to determining what a thing **is**, never as exclusions. 🔒 **Nothing here excuses anything:** under **CS-0.3** and `CS-5.7` row **J**, an exploitative behavior *presented as* education, documentation or research remains a **VIOLATION** — a purpose claim has no force once the behavior is constituted. **No substantive child-safety definition, and no Legal question, is changed or resolved here)* · `evidence_sensitivity` ✅ `LEGALLY_SENSITIVE + RESTRICTED_HANDLING + HUMAN_REQUIRED` *(per CS-1)* · `disposition` ✅ `PROHIBITED` *(per CS-1)* · `defeating_contexts` ✅ **none** *(per CS-0; rationale CS-0.1–0.5 not copied)* · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** child welfare. **secondary:** sexual autonomy *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`, `actor/account`. **Target:** the minor *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `decisive_dimensions` ✅ **Actor & target**, **Setting** *(SC-7 conformance remediation 2026-08-16, §6.1 dimension space. **Setting** is decisive on **age context** (CS-3 five states). **Actor & target** is decisive on the minor as target. **Purpose is NOT decisive as a defeating dimension** — CS-0.3 holds that generic educational, documentary, artistic, historical, cultural or journalistic purposes do **not** defeat an established child-safety violation; per CS-0.2 purpose still operates at the earlier *what happened* stage only. No child-safety definition or enforcement is changed by this declaration)* · `severity_envelope` ✅ **S4** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*
- **`ts.child.sexualization`** — presenting minors in a sexualised manner, including where no explicit act is depicted. Constitutive boundary drawn at *sexualised presentation*, so that ordinary family, medical and educational imagery is not constituted. **G02-L-01.**
  - **Conformance (SC-1)** — `identity` ✅ `ts.child.sexualization` · `constitutive_behavior` ✅ *"presenting minors in a sexualised manner, including where no explicit act is depicted"* · `does_not_govern` ✅ ordinary **family**, **medical** and **educational** imagery of minors *(conformance remediation 2026-08-16, SC-7 authorised. Source: this policy’s own registry entry — the constitutive boundary is drawn at **sexualised presentation**, expressly so that such imagery is not caught. **No substantive definition changed**)* · `evidence_sensitivity` ✅ `LEGALLY_SENSITIVE + RESTRICTED_HANDLING + HUMAN_REQUIRED` *(per CS-1)* · `disposition` ✅ `PROHIBITED` *(per CS-1)* · `defeating_contexts` ✅ **none** *(per CS-0; rationale CS-0.1–0.5 not copied)* · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** child welfare. **secondary:** dignity *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`. **Target:** the minor *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `decisive_dimensions` ✅ **Actor & target**, **Setting** *(SC-7 conformance remediation 2026-08-16, §6.1 dimension space. **Setting** is decisive on **age context** (CS-3 five states). **Actor & target** is decisive on the minor as target. **Purpose is NOT decisive as a defeating dimension** — CS-0.3 holds that generic educational, documentary, artistic, historical, cultural or journalistic purposes do **not** defeat an established child-safety violation; per CS-0.2 purpose still operates at the earlier *what happened* stage only. No child-safety definition or enforcement is changed by this declaration)* · `severity_envelope` ✅ **S3–S4** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*
- **`ts.child.grooming`** — patterned conduct to build exploitative trust with a minor. Behavioral and **pattern-based**, so a single message is rarely constitutive; this is a subject-type `interaction` policy (§3.1).
  - **Conformance (SC-1)** — `identity` ✅ `ts.child.grooming` · `constitutive_behavior` ✅ *"patterned conduct to build exploitative trust with a minor"* · `does_not_govern` ✅ an **isolated single message** absent an established pattern *(conformance remediation 2026-08-16, SC-7 authorised. Source: this policy’s own registry entry — behavioral and **pattern-based**, so a single message is rarely constitutive. **No substantive definition changed**)* · `evidence_sensitivity` ✅ `LEGALLY_SENSITIVE + RESTRICTED_HANDLING + HUMAN_REQUIRED` *(per CS-1)* · `disposition` ✅ `PROHIBITED` *(per CS-1)* · `defeating_contexts` ✅ **none** *(per CS-0; rationale CS-0.1–0.5 not copied)* · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** child welfare *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `interaction` *(the registry states this is a subject-type `interaction` policy, §3.1)*. **Target:** the minor *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `decisive_dimensions` ✅ **Actor & target**, **Setting** *(SC-7 conformance remediation 2026-08-16, §6.1 dimension space. **Setting** is decisive on **age context** (CS-3 five states). **Actor & target** is decisive on the minor as target. **Purpose is NOT decisive as a defeating dimension** — CS-0.3 holds that generic educational, documentary, artistic, historical, cultural or journalistic purposes do **not** defeat an established child-safety violation; per CS-0.2 purpose still operates at the earlier *what happened* stage only. No child-safety definition or enforcement is changed by this declaration)* · `severity_envelope` ✅ **S4** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*
- **`ts.child.abuse-harm`** — non-sexual abuse or endangerment of minors. Constitutive boundary excludes documentation for protective, journalistic or educational purposes **by defining the behavior as the abuse itself, not its depiction** — CS-0 is preserved because this is constitutive, not a carve-out.
  - **Conformance (SC-1)** — `identity` ✅ `ts.child.abuse-harm` · `constitutive_behavior` ✅ *"non-sexual abuse or endangerment of minors"* · `does_not_govern` ✅ **documentation for protective, journalistic or educational purposes** *(conformance remediation 2026-08-16, SC-7 authorised. Source: this policy’s own registry entry — the constitutive boundary excludes it by defining the behavior as **the abuse itself, not its depiction**. **No substantive definition changed**)* · `evidence_sensitivity` ✅ `LEGALLY_SENSITIVE + RESTRICTED_HANDLING + HUMAN_REQUIRED` *(per CS-1)* · `disposition` ✅ `PROHIBITED` *(per CS-1)* · `defeating_contexts` ✅ **none** *(per CS-0; rationale CS-0.1–0.5 not copied)* · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** child welfare. **secondary:** physical safety *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`, `actor/account`. **Target:** the minor *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `decisive_dimensions` ✅ **Actor & target**, **Setting** *(SC-7 conformance remediation 2026-08-16, §6.1 dimension space. **Setting** is decisive on **age context** (CS-3 five states). **Actor & target** is decisive on the minor as target. **Purpose is NOT decisive as a defeating dimension** — CS-0.3 holds that generic educational, documentary, artistic, historical, cultural or journalistic purposes do **not** defeat an established child-safety violation; per CS-0.2 purpose still operates at the earlier *what happened* stage only. No child-safety definition or enforcement is changed by this declaration)* · `severity_envelope` ✅ **S3–S4** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*

#### CS-3 — Age context states

Minor-status determination is frequently uncertain, and a taxonomy with only
"minor / not minor" forces a guess. Five distinguishable states, and the
distinctions are architectural, not evidentiary thresholds:

| State | Meaning |
|---|---|
| `AGE_KNOWN` | Age or minor status is established on the record |
| `AGE_UNCERTAIN` | Some basis exists but it does not establish age either way |
| `AGE_UNAVAILABLE` | No basis is present at all — the question was not reachable |
| `AGE_INDICATORS_SUGGEST_MINOR` | Evidence points toward minor status **without establishing it** |
| `AGE_INSUFFICIENT_TO_ESTABLISH` | Evidence was examined and is insufficient to conclude |

`AGE_UNAVAILABLE` and `AGE_INSUFFICIENT_TO_ESTABLISH` are distinct on purpose:
one means nobody looked or nothing was reachable, the other means the question
was assessed and could not be answered. They call for different follow-up, and
merging them would hide which happened.

#### CS-4 — Uncertainty posture

> **UNCERTAINTY IS A SAFETY SIGNAL, NOT ITSELF PROOF OF A POLICY VIOLATION.**

| | Rule |
|---|---|
| **CS-4.1** | **Uncertain age does not automatically constitute a violation.** No state above is, by itself, a finding. `AGE_INDICATORS_SUGGEST_MINOR` is a *signal*, not a conclusion |
| **CS-4.2** | **Uncertain age does not automatically permit either.** The absence of established minor status is not a finding of adult status, and must not be read as clearance |
| **CS-4.3** | Where age is decisive and unresolved, the outcome is `INSUFFICIENT_EVIDENCE` or `INDETERMINATE_CONTEXT` (§4) — **terminal, non-violating** outcomes (OUT-1) |
| **CS-4.4** | Uncertainty in this domain **may raise the need** for containment, human review, or evidence preservation. **Group 02 does not define any of those actions, nor when they trigger.** Groups 06, 08, 09 and 11 own them |
| **CS-4.5** | This is the one domain where CTX-1's "missing context is never adverse" is deliberately **qualified**: uncertainty is not adverse *as a finding*, but it is not neutral *as a signal* either. The qualification is confined to signalling and creates no finding |

**CS-4.6.** No age threshold, no legal definition of minority, and no statutory
obligation is asserted anywhere in this document.

#### CS-5 — G02-D-03 decision record

> ## G02-D-03 = RESOLVED — OWNER APPROVED
> **Decided by the Owner, 2026-08-15.** Scope: **taxonomy and context semantics
> only.** It authorises no enforcement, quarantine, suspension, removal,
> termination, scoring, confidence threshold, legal age threshold, or
> implementation. The legal portion remains open — see **CS-5.6**.

##### CS-5.1 — Age state → taxonomy outcome

Applies **only where age is material to whether a child-safety policy applies**.
Where age is not material, none of this engages.

| Age state | Meaning | Outcome where age is decisive | Constitutes? |
|---|---|---|---|
| `AGE_KNOWN` | established on the record | normal assessment proceeds | per the behavior |
| `AGE_UNCERTAIN` | some basis, establishes neither way | **`INSUFFICIENT_EVIDENCE`** | **No** |
| `AGE_UNAVAILABLE` | no basis reachable at all | **`INSUFFICIENT_EVIDENCE`** | **No** |
| `AGE_INDICATORS_SUGGEST_MINOR` | evidence points toward minor status **without establishing it** | **`INSUFFICIENT_EVIDENCE`**, carrying the indicator on the record | **No** |
| `AGE_INSUFFICIENT_TO_ESTABLISH` | assessed, cannot be concluded | **`INSUFFICIENT_EVIDENCE`** | **No** |

##### CS-5.2 — The two prohibited rules

| | |
|---|---|
| **CS-5.2a** | **`unknown age = violation` is PROHIBITED.** Uncertainty is never itself a finding of violation, at any state, however suggestive |
| **CS-5.2b** | **`unknown age = adult` is PROHIBITED.** Absence of established minor status is **not** established adult status and is never clearance |

Both directions are closed. **The taxonomy does not manufacture certainty in
either direction**, and an unresolved question is recorded as unresolved.

##### CS-5.3 — Indicators are evidence, not proof

`AGE_INDICATORS_SUGGEST_MINOR` **is evidence**: it enters the record, it is
weighed, and it distinguishes this state from `AGE_UNCERTAIN`, which is why the
two are never collapsed (CS-3).

**It is not proof**: it cannot complete the establishment of a constitutive
element. Evidence that points is not evidence that establishes, and the gap
between them is not closed by the seriousness of the domain.

##### CS-5.4 — Signal, not finding

Unresolved age in this domain **is** a safety signal. The taxonomy's entire
contribution is to **record it faithfully** — the age state, that age was
decisive, and that it was unresolved.

**CS-5.4a.** A signal is not a finding. It creates no classification, no
violation, and no adverse conclusion about any person.
**CS-5.4b.** The signal **may** warrant later review, containment or evidence
preservation. **Group 02 defines none of those, and defines no trigger for
them.** Groups 06, 08, 09 and 11 own them (CS-4.4).
**CS-5.4c.** Downstream groups may act on the signal. **They may not convert it
into a finding**, because the taxonomy did not make one.

##### CS-5.5 — Which terminal outcome applies

| Situation | Outcome |
|---|---|
| The **behavior** is determinable; only **age** is unresolved | **`INSUFFICIENT_EVIDENCE`** — a specific element cannot be established |
| The **context is unreadable**, so the behavior itself cannot be determined | **`INDETERMINATE_CONTEXT`** |

Both are **terminal and non-violating** (OUT-1). Neither is a diminished
violation, and nothing downstream may treat them as one.

##### CS-5.6 — What remains legally open

**RESOLVED here:** the taxonomy posture — outcomes, the two prohibitions,
evidence-versus-proof, and signal-versus-finding.

**NOT resolved, and not resolvable by architecture — `G02-L-01`, LEGAL REVIEW
REQUIRED:**

- any statutory definition of minority, or age threshold of any kind
- any consent threshold
- any mandatory reporting duty — **named as a question; no duty is asserted to exist**
- any evidence-preservation obligation attaching to unresolved-age cases (interacts with Group 01 **G01-L-04**)
- any jurisdiction-specific obligation

**No age threshold, no legal definition of minority, and no statutory obligation
is asserted anywhere in this document** (CS-4.6). If a downstream group needs a
legal answer to proceed safely, that portion stays open rather than being
guessed.

##### CS-5.7 — Mandatory case recheck

| | Case | Age state | Behavior | Context | Outcome | Evidence sufficient? |
|---|---|---|---|---|---|---|
| **A** | Age-known adult, benign content | `AGE_KNOWN` (adult) | none prohibited | ordinary | **`NOT_APPLICABLE`** | n/a — D2 not engaged |
| **B** | Age-known minor, child-safety prohibited behavior | `AGE_KNOWN` (minor) | constituted | **CS-0.3: generic purpose cannot excuse** | **`VIOLATION`** — `CRITICAL` *(provisional, G02-D-09)*, `HUMAN_REQUIRED`, `LEGALLY_SENSITIVE` | Yes |
| **C** | Age unavailable | `AGE_UNAVAILABLE` | may be determinable | any | **`INSUFFICIENT_EVIDENCE`** | **No** — and not clearance (CS-5.2b) |
| **D** | Age uncertain | `AGE_UNCERTAIN` | may be determinable | any | **`INSUFFICIENT_EVIDENCE`** | **No** |
| **E** | Indicators suggest minor | `AGE_INDICATORS_SUGGEST_MINOR` | may be determinable | any | **`INSUFFICIENT_EVIDENCE`**, indicator recorded | **No** — evidence, not proof (CS-5.3) |
| **F** | Age decisive but unresolved | any unresolved state | determinable | any | **`INSUFFICIENT_EVIDENCE`** (or `INDETERMINATE_CONTEXT` per CS-5.5) | **No** |
| **G** | Clinical / medical content | any | **not constituted** — clinical procedure | medical (CS-0.2 fully in force) | **`NOT_APPLICABLE`** | n/a — nothing constituted |
| **H** | Documentary / journalistic | any | **not constituted** — documenting, not doing | journalistic (CS-0.2) | **`NOT_APPLICABLE`** | n/a |
| **I** | Educational context | any | **not constituted** | educational (CS-0.2) | **`NOT_APPLICABLE`** | n/a |
| **J** | **Exploitative behavior presented as education** | any | **constituted** | claimed educational purpose | **`VIOLATION`** — **CS-0.3: the claim operates at the excuse stage, where it has no force** | Yes, on the behavior |
| **K** | Historical footage | any | **not constituted** — historical record | historical (CS-0.2) | **`NOT_APPLICABLE`** | n/a |
| **L** | Fictional representation | any | assessed on its own terms | fictional | **`NOT_APPLICABLE`** where no real minor is involved and nothing is constituted. **Depiction questions are `G02-L-01`** | Depends |

**G versus J is the whole of CS-0.** G, H, I and K are claims about **what the
content is** — CS-0.2, context fully operative, nothing constituted. J is a claim
about **what should be excused** — CS-0.3, no force. The taxonomy separates them
structurally rather than by judging sincerity.

---

### 9.3 D3 — Sexual Safety (adult)

**`ts.sexual.exploitation-nonconsent`** — severity `CRITICAL` · evidence `CORROBORATED` + `RESTRICTED_HANDLING` · `PROHIBITED`
- **Conformance (SC-1)** — `identity` ✅ `ts.sexual.exploitation-nonconsent` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `CORROBORATED + RESTRICTED_HANDLING` · `disposition` ✅ `PROHIBITED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** sexual autonomy. **secondary:** dignity *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`, `actor/account`. **Target:** the depicted or coerced person *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose**, **Actor & target** *(§6.1. Actor & target is decisive on **consent**, which `Governs` makes constitutive. Purpose is decisive via `Does not govern`: fiction, education, survivor narrative, journalism)* · `severity_envelope` ✅ **S3–S4** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*
- **Governs:** sexual content produced or shared without consent (including intimate-image abuse); sexual violence presented approvingly; sexual coercion; trafficking-related conduct.
- **Does not govern:** consensual adult content · fiction · education · survivor narrative · journalism.
- **Legal:** **G02-L-02**.

**`ts.sexual.adult-content`** — severity `MINIMAL`–`MODERATE` · evidence `ORDINARY` · **`RESTRICTED`**
- **Conformance (SC-1)** — `identity` ✅ `ts.sexual.adult-content` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `ORDINARY` · `disposition` ✅ `RESTRICTED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** psychological safety *(Owner decision 2026-08-16. Named for this policy on its own repaired text — the constitutive element is the **absence of the required presentation conditions**, and the affected subject recorded at §7.3.10 is the **viewer or audience**. No new interest was created; the value comes from the existing vocabulary)* · `applicability` ✅ **Actor:** `content item`. **Target:** the viewer or audience. *(Recorded on the current text; this policy’s definition repair remains outstanding under `G02-D-02a`)* *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose**, **Setting** *(§6.1, derivable from the repaired text 2026-08-16. **Setting** is decisive because the constitutive element is the **absence of the required presentation conditions** — an audience and surface question. **Purpose** is decisive via `Does not govern`: sexual education, medical and anatomical content, art, health discussion, and non-sexual nudity in a cultural, artistic or medical context. Explicitness is **not** a dimension — it is a topic under TOP-1)* · `severity_envelope` ✅ **`NO_ENVELOPE`** *(`G02-D-02a` = **C**, Owner 2026-08-16 — `RESTRICTED` policies carry no severity envelope at taxonomy level; see **ENV-7**. This is **not** `OPEN` and **not** `S1`; the question does not arise for this policy class)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*
- **Governs:** **presenting** sexual content between **consenting adults** **without the presentation conditions this policy requires**. **Not a prohibition** — the outcome is that **presentation conditions apply** (`RESTRICTED`).
- **Constitutive boundary:** the constitutive element is the **absence of the required presentation conditions**, **not** the explicitness of the content. Explicitness is a **topic** (TOP-1) and cannot constitute this policy.
- 🔷 **DEFINITION REPAIRED — `G02-D-02a`, Owner approved 2026-08-16.** ~~Governs: whether consensual adult sexual content is permitted, and under what audience conditions.~~ **SUPERSEDED (CM-3 / VER-4).** The former text stated a **question**, not a constitutive **behavior**, which was this policy’s **WF-1** defect; and it carried no `Constitutive boundary`, which was its **WF-2** defect. Both are now closed by the same restructure, on the model already used for `ts.graphic.presentation`. The question the old text embedded was **`G02-D-04`**, resolved 2026-08-16. 🚨 **Scope unchanged:** minors in any form, non-consensual sexual content, sexual exploitation, and sexual violence or coercion are **not** governed here and remain with **D2** and `ts.sexual.exploitation-nonconsent`, both **untouched**. No new exception is created. 🔶 The **severity representation** for `RESTRICTED` policies remains OPEN at **`G02-D-02a`**; this repair supplies the definition it was waiting on, and decides nothing about severity.
- **Does not govern:** sexual education · medical and anatomical content · art · health discussion · non-sexual nudity in cultural, artistic or medical context.
- **G02-D-02:** ✅ **RESOLVED (2026-08-15) — `RESTRICTED` IS in scope for v1**, so this policy exists as written. 🔶 Its **severity representation** is deferred to **`G02-D-02a`**, which — together with **G02-D-04** — is why its envelope remains OPEN under `G02-D-09d`. *(This policy carries the `RESTRICTED` disposition, so 02a blocks it exactly as it blocks `ts.graphic.presentation`. Recorded 2026-08-15; the record previously named only D-04, while its own conformance field and both envelope tables already cited D-02.)*
- **G02-D-04:** ✅ **RESOLVED — OWNER APPROVED (2026-08-16). PERMITTED SUBJECT TO CONDITIONS.** Consensual adult content is **not prohibited merely for being adult**. 🚨 **Not "unrestricted"** — **no minors in any form**, **no non-consensual sexual content**, **no sexual exploitation**, **no sexual violence or coercion**; those remain governed by D2 and `ts.sexual.exploitation-nonconsent` and are **unaffected**. Presentation conditions, warnings and age-appropriate access are **implementation work, not settled here**. *(Originally recorded as: TappyAI's product stance on adult content is a product decision, not a safety one, and is not assumed here.)* **G02-L-02** for age-related legal aspects; **no age or legal threshold is defined in this document**.
- 🔷 **REPAIR UNBLOCKED — status pointer, not a definitional element.** ~~REPAIR DEFERRED (2026-08-15): under `G02-D-02a` option **C-split**, this policy's definition repair is **held until `G02-D-04` resolves**.~~ **✅ SUPERSEDED 2026-08-16 (CM-3/VER-4): `G02-D-04` IS RESOLVED**, so the hold is discharged and the definition repair is now **available to be scheduled**. 🚨 **The repair itself has NOT been performed** — this records only that its precondition is met. The original deferral reason is retained verbatim below. Reason from primary text: this policy's **`Governs` embeds D-04's own question** — *"whether consensual adult sexual content **is permitted**"* **is** the product stance — so its constitutive scope cannot be fixed while D-04 is open. It carries the **same WF-3 and WF-2 gaps** as `ts.graphic.presentation`; both are recorded, neither is repaired here.

---

### 9.4 D4 — Dignity & Personal Security

**`ts.harassment.targeted`** — severity `SERIOUS` · evidence `CORROBORATED` · `PROHIBITED`
- **Conformance (SC-1)** — `identity` ✅ `ts.harassment.targeted` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `CORROBORATED` · `disposition` ✅ `PROHIBITED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** dignity. **secondary:** psychological safety *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`, `actor/account`, `interaction`, `coordinated set` *(`Governs` reaches sustained or coordinated pile-on)*. **Target:** the targeted person *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose**, **Actor & target** *(§6.1. Actor & target is decisive by the `Constitutive boundary` — requires an **identifiable target** and abuse directed at the person rather than at their position or work. Purpose is decisive via `Does not govern`: criticism of ideas, institutions, products, governments or public conduct, reporting, reviews, robust disagreement, satire of public figures in their public role)* · `severity_envelope` ✅ **S2–S3** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*
- **Governs:** directed abuse at identifiable people; sustained or coordinated pile-on; sexual harassment; degrading treatment of an individual.
- **Does not govern:** criticism of ideas, institutions, products, governments or public conduct · unflattering reporting · negative reviews · robust disagreement · satire of public figures in their public role.
- **Constitutive boundary:** requires an **identifiable target** and abuse **directed at the person** rather than at their position or work. This is where **VP-1** does its heaviest work.
- **Ambiguity:** the public-figure boundary. **G02-D-06.**

**`ts.hate.protected-target-abuse`** — severity `SEVERE` · evidence `CORROBORATED` · `PROHIBITED`
- **Conformance (SC-1)** — `identity` ✅ `ts.hate.protected-target-abuse` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `CORROBORATED` · `disposition` ✅ `PROHIBITED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** dignity *(the interest is declared here; **which characteristics qualify as a protected target is NOT declared** — `PROTECTED_TARGET_SET` remains OPEN at `G02-D-07b`, Legal pending)* *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`, `actor/account`. **Target:** the targeted people. *(Which characteristics qualify is **not** declared here — `PROTECTED_TARGET_SET` remains OPEN at `G02-D-07b`, Legal pending)* *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose**, **Actor & target** *(§6.1, populated 2026-08-16 from this policy’s own text — the same derivation used by the other seventeen. **Actor & target** is decisive by the `Constitutive boundary`: *"the target must be **people**, and the characteristic must be the **basis** of the attack"* — and §6.1 already enumerates **`protected characteristic`** as one of its target values, with **PT-9** making the characteristic an *applicability condition* and **PT-10** naming the concept a **context dimension**. **Purpose** is decisive via `Does not govern` — criticism of religions, ideologies, political systems, practices or institutions, religious debate, satire, historical and academic discussion, discussion *about* hate speech — which **PT-7.2** reduces to a test of the **object** of the conduct. 🚨 **This declares which dimensions decide, NOT which characteristics qualify.** `PROTECTED_TARGET_SET` remains **OPEN at `G02-D-07b`** and is untouched; **PT-5** still holds, so the policy remains **non-operational**, and `severity_envelope` remains OPEN. Precedent: **#6–#9** declare **Setting** decisive *on age context* without enumerating ages, and **#10** declares **Actor & target** decisive *on consent* without enumerating consent states. **Not declared decisive:** **Setting** (the policy text turns on no audience, surface or age condition) and **Temporal & geographic**. **Left open, and not decided here:** whether **Cultural & linguistic** is additionally decisive for the *reclaimed in-group speech* carve-out — the phrase appears once in the corpus and is nowhere assigned to a dimension; it reads either as **relationship** under Actor & target or as **register** under Cultural & linguistic. Either reading leaves the two dimensions declared above unchanged)* · `severity_envelope` 🔶 **OPEN — G02-D-09d / G02-D-07b** · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)* · *`PROTECTED_TARGET_SET` membership remains* **OPEN — G02-D-07b**
- **Governs:** dehumanising attack, incitement to hatred, or advocacy of exclusion directed at people **because of** a protected characteristic.
- **Does not govern:** criticism of religions, ideologies, political systems, practices or institutions · religious debate · satire · historical and academic discussion · reclaimed in-group speech · discussion *about* hate speech.
- **Constitutive boundary:** the target must be **people**, and the characteristic must be the **basis** of the attack. *Criticism of a religion is not an attack on believers* — the single most important line in this policy.
- **Protected target:** the policy references `PROTECTED_TARGET_SET` — **OWNER / LEGAL DEFINITION REQUIRED**. Its contents are **not defined in this document**. See §9.4.1.

#### 9.4.1 `PROTECTED_TARGET_SET` — three concepts that are not the same thing

The taxonomy needs a **protected-target dimension** for policies such as
`ts.hate.protected-target-abuse` and, in part, `ts.harassment.targeted`. It does
not need — and must not manufacture — a legal classification.

| | Concept | Owner | What it is |
|---|---|---|---|
| **A** | **Policy-level protected-target concept** | This taxonomy | The *structural slot*: a policy may be constituted by an attack directed at people **because of** a characteristic. Content-free |
| **B** | **Product-level protected-group policy** | TappyAI product / T&S Policy Owner | The characteristics TappyAI chooses to protect **as a platform**. A product commitment |
| **C** | **Legally protected classification** | Law, via the Legal Reviewer | Whatever classification law actually establishes |

**PT-1.** A, B and C are **not automatically identical** and **must not be
conflated**. They may overlap, diverge, or move independently.

**PT-2.** This taxonomy defines **A only**. `PROTECTED_TARGET_SET` is a named,
deliberately **empty placeholder** whose contents come from B, informed by C.

**PT-3 — No legal claim.** The taxonomy is **not** a legal classification.
Inclusion in `PROTECTED_TARGET_SET` **confers no legal protection and implies
none**. Exclusion implies no absence of legal protection.

**PT-4 — Not exhaustive, not authoritative.** No list produced under B may be
described as exhaustive under Vietnamese law, or as an authoritative statement
of C.

**PT-5.** The *shape* of the slot is stable without its contents: the **behavior**
(dehumanising attack, incitement to hatred, advocacy of exclusion) and the
**direction** (at people, **because of** a characteristic) are defined regardless
of which characteristics populate the set. VP-1 and the "criticism of a religion
is not an attack on believers" line hold either way.
**But the policy cannot be *applied* to anything while the set is empty** —
determining "because of a characteristic" requires knowing which characteristics
count. **`ts.hate.protected-target-abuse` is therefore non-operational until
G02-D-07b closes** (§9.4.2). *(Corrected at the G02-D-07 gate: an earlier draft
of PT-5 said the slot "works" without its contents, which overstated it.)*

#### 9.4.2 G02-D-07 — decision record

> ## G02-D-07 = OPEN — OWNER + LEGAL REVIEW REQUIRED
> Split. The **criterion** is decided; the **membership** is not, and forcing it
> would invent exactly what Group 01 B-3 forbids.

| | |
|---|---|
| **G02-D-07a — the inclusion criterion** | ✅ **RESOLVED — OWNER APPROVED (2026-08-15).** PT-6 and the operational principles PT-7…PT-13 (§9.4.2.1–9.4.2.2) |
| **G02-D-07b — the concrete membership of `PROTECTED_TARGET_SET`** | **OPEN — OWNER + LEGAL REVIEW REQUIRED (G02-L-04).** Not decided |
| **PT-14 — perceived characteristics** | **PROPOSED — OWNER REVIEW.** *Not* ratified by this decision; carried into **G02-D-07b** |
| **Overall G02-D-07** | **OPEN**, because (b) blocks. **G02-D-08a remains DEFERRED** on it |

**No `PROTECTED_TARGET_SET = [ … ]` exists or may be written.** Approving the
criterion does **not** create the set (§9.4.2.3).

**Why not options A or C.** Both require producing a list. A "minimal product
set" is still an invented list, and any list produced here would be produced
from general knowledge rather than Vietnamese social and legal context. **Why
not bare option B:** deferring everything leaves the most consequential
architectural question — *what kind of thing may enter the set* — unanswered,
and that question is answerable without law. Hence the split.

##### 9.4.2.1 — PT-6, the inclusion criterion — ✅ **OWNER APPROVED**

> ### PT-6 — RESOLVED, OWNER APPROVED (2026-08-15)
>
> **A protected-target characteristic is an attribute of personhood — something a
> person *is*, or an identity they hold — as distinct from a position they
> advocate or conduct they choose.**

**PT-6.1 — This is a PRODUCT-POLICY TAXONOMY CRITERION.** It is **not** a legal
definition, not a statement of Vietnamese law, not an exhaustive legal
definition, not a legal protected-characteristic list, and not a compliance
claim. PT-3, PT-4, PT-15 and PT-16 are unchanged.

**PT-6.2 — The three-way separation the criterion enforces:**

```
PERSONHOOD / IDENTITY   ≠   ADVOCATED POSITION   ≠   CHOSEN CONDUCT
```

**PT-6.3 — Why this line and not another.** A policy against attacking people
*because of who they are* is coherent. A policy against attacking people
*because of what they argue* is a viewpoint instrument, and **VP-1 forbids it**.
The criterion is what keeps `ts.hate.protected-target-abuse` from becoming the
thing the whole taxonomy exists to prevent.

**PT-6.4.** **Political opinion and political position do not become
protected-target characteristics merely because someone holds them.**

##### PT-7 — Identity versus doctrine ✅ **OWNER APPROVED**

*Criticism of a religion is not automatically an attack on believers.* The
**belief system** is criticisable; the **person holding it** is not attackable
*for holding it*. PT-6 generalises that split to every candidate: **religious
identity ≠ agreement with a religious doctrine.**

**PT-7.1 — Generalised carefully, and NOT an exemption.** A person may be
protected as an identity-bearing target **without** every criticism of that
identity, religion, ideology, organisation, practice or doctrine becoming a
violation. The converse is equally true: **calling something "criticism" does not
defeat the policy** where the behavior actually constituted is dehumanising abuse
of, incitement against, or advocacy of exclusion of **people**. PT-7 sorts
*what the behavior is* (CS-0.2's logic, applied here); it grants no cover to
behavior already constituted.

**PT-7.2.** The test is the **object** of the conduct: a doctrine, institution,
practice or argument — or **people, because of who they are**.

##### 9.4.2.2 — Operational rules — ✅ **PT-8 … PT-13 OWNER APPROVED**

These hold regardless of membership. **PT-14 is NOT approved** — it remains
**PROPOSED — OWNER REVIEW**, carried into G02-D-07b.

| | Rule |
|---|---|
| **PT-8** | **Protected characteristic ⇒ violation is PROHIBITED.** Membership never constitutes anything. Constitutive behavior, direction, context and harm are all still required |
| **PT-9** | **Target belongs to a protected group ⇒ content violates is PROHIBITED.** The characteristic is an *applicability condition*, never a finding |
| **PT-10 — What the concept actually does.** | Target identification · applicability condition · routing information · context dimension · harm-class input. **It may never independently constitute a violation** |
| **PT-11 — No keyword trigger.** | Identity terms — religion, ethnicity, nationality, gender, disability, political or any other identity vocabulary — are **topics** (TOP-1, TOP-2, WF-2). Their presence is routing and context only, **never** a trigger |
| **PT-12** | **Absence of protected-characteristic classification ≠ absence of harm.** Conduct not reaching this policy may still reach `ts.harassment.targeted`, `ts.violence.incitement-threats` or another policy on its own terms |
| **PT-13 — Unknown or ambiguous target characteristics** | Neither a violation nor a clearance. Where the characteristic is decisive and unresolved → `INSUFFICIENT_EVIDENCE`; where the target itself is unreadable → `INDETERMINATE_CONTEXT`. Both terminal, both non-violating (mirrors CS-5.2 in structure) |
| **PT-14 — Perceived characteristics** · **PROPOSED — OWNER REVIEW, NOT APPROVED** | Where an attack is directed at someone **because of a characteristic the actor believes the target has**, the *direction* is characteristic-based even if the belief is mistaken. **Explicitly not ratified by the G02-D-07a decision**; carried into **G02-D-07b** |

##### 9.4.2.3 — Candidate analysis

> **ANALYSIS ONLY — NOT RATIFIED, NOT THE SET.** Approving PT-6 (G02-D-07a) did
> **not** convert any of this into membership. **No `PROTECTED_TARGET_SET = [ … ]`
> may be written while G02-D-07b is open.** Classification below is against
> **PT-6 only**: it is not a legal assessment, implies nothing about **C**, and
> is **not legally exhaustive**. No claim is made that Vietnamese law does or
> does not protect any candidate.

| Candidate | Against PT-6 | Note |
|---|---|---|
| Age | **Criterion met** | Child safety is governed separately by **D2**, which is stricter |
| Disability | **Criterion met** | |
| Sex | **Criterion met** | |
| Gender | **Criterion met** | |
| Sexual orientation | **Criterion met** | |
| Gender identity / expression | **Criterion met** | An identity, not a position. Socially contested in places; that is a **B/C** question, not a criterion question |
| Race / ethnicity | **Criterion met** | |
| Nationality | **Criterion met** | |
| Religion / belief | **Criterion met — as identity only** | The **believer** is protected; the **doctrine** remains fully criticisable (PT-7) |
| Health / medical status | **Criterion met** | |
| Pregnancy | **Criterion met** | |
| Family status | **Criterion met** | |
| Language | **Criterion met** | Relevant in Vietnam — regional varieties, dialect, code-switching (VN-3) |
| Socioeconomic status | **DEFER — OWNER** | An attribute of circumstance rather than of personhood; the criterion does not cleanly decide it |
| Migration / immigration status | **DEFER — OWNER + LEGAL (G02-L-04, G02-L-06)** | Criterion arguably met as a status, but legally and politically sensitive in Vietnam |
| Veteran / service status | **DEFER — OWNER** | Carries specific social weight in Vietnam that this document is not positioned to assess |
| "Historical identity" | **DEFER — OWNER: term undefined** | If it means descent or heritage it is already covered by race/ethnicity/nationality; if it means historical-group affiliation it is a different question. Needs the Owner's definition before analysis |
| Occupation | **Criterion NOT met — recommend exclude** | A chosen role, not an attribute of personhood. Occupational targeting is real harm and routes to `ts.harassment.targeted` (PT-12) |
| **Political affiliation** | **Criterion NOT met — recommend exclude** | A chosen position |
| **Political opinion** | **Criterion NOT met — recommend exclude, emphatically** | Including it would convert **criticism of political positions into protected-target abuse** — precisely the viewpoint instrument VP-1 exists to prevent. This is the single most dangerous candidate on the list |
| "Other relevant identity attributes" | **Criterion NOT applicable — recommend exclude as a category** | An open-ended residual would reintroduce unbounded scope, exactly the failure **G02-D-08 closed** by refusing an "other harm" bucket. Extension by versioned taxonomy change only |

**On excluding political opinion.** Nobody is left unprotected by it. Dehumanising
abuse or threats against a person remain reachable through
`ts.harassment.targeted` and `ts.violence.incitement-threats`, neither of which
requires a protected characteristic (PT-12).

##### 9.4.2.4 — Legal boundary

**PT-15.** If the Owner later approves a set under B, it must be recorded as:
**"This is a product-policy classification, not a claim about the complete legal
definition of protected characteristics."**

**PT-16.** **`G02-L-04` remains LEGAL REVIEW REQUIRED.** No claim is made or
implied that Vietnamese law protects exactly any set, or fails to protect any
group. No exhaustive statutory classification, and no compliance claim. PT-3 and
PT-4 are unchanged.

##### 9.4.2.5 — Test cases, re-run after PT-6 ratification

*Supersedes the pre-ratification A–T probe; it subsumes every case in it and adds
criticism-of-doctrine, criticism-of-position and the identity-keyword test.*

| | Case | Behavior | Target | Context | PT-6 relevant? | Policy constituted? |
|---|---|---|---|---|---|---|
| 1 | Neutral description of a protected identity | describing | group referenced | descriptive | **No** — topic only (PT-11) | **No** — `NOT_APPLICABLE` |
| 2 | Journalism about a protected group | reporting | group referenced | journalistic | No | **No** |
| 3 | Documentary about a protected group | documenting | group referenced | documentary | No | **No** |
| 4 | Historical discussion | analysing | group referenced | historical | No | **No** (DEC-4) |
| 5 | Religious discussion | discussing | belief referenced | religious | No | **No** |
| 6 | **Criticism of a religious doctrine** | criticising a **doctrine** | doctrine, not people | religious / civic | **No** — object is a belief system (PT-7, PT-7.2) | **No** |
| 7 | Political discussion | arguing | position referenced | civic | No | **No** |
| 8 | **Criticism of a political position** | criticising a **position** | position, not people | civic | **No** — a position is not a characteristic (PT-6, PT-6.4) | **No** |
| 9 | Academic discussion | analysing | group referenced | academic | No | **No** |
| 10 | Satire / parody | satirising | may reference a group | satirical | No, on its own | **No**; other policies assessed on their own terms |
| 11 | Self-identification | describing oneself | self | personal | No | **No** |
| 12 | Advocacy for a protected group | advocating | group referenced | advocacy | No | **No** |
| 13 | Advocacy against a political position | arguing against a **position** | position | civic | No (PT-6.4) | **No** |
| 14 | Criticism of an individual who belongs to a protected group | criticising **conduct or work** | individual, member | any | **No** — not *because of* the characteristic | **No.** Membership does not immunise (PT-8, PT-9) |
| 15 | Targeted harassment **because of** a protected characteristic | directed abuse | identifiable, characteristic-based | any | **Yes** | **Candidate** — `ts.harassment.targeted` **+** `ts.hate.protected-target-abuse` (COMP-1/2). **Hate policy blocked on G02-D-07b** |
| 16 | Threat directed at a target **because of** a protected characteristic | credible threat | characteristic-based | any | Yes, secondarily | **Candidate** — `ts.violence.incitement-threats` **applies regardless of the set** (PT-12) |
| 17 | Dehumanising abuse at a protected target | dehumanising attack | characteristic-based | any | **Yes** | **Candidate** — **blocked on G02-D-07b**. Calling it "criticism" does not defeat it (PT-7.1) |
| 18 | Unknown target characteristic | possibly abusive | unknown | any | Undetermined | **No** — `INSUFFICIENT_EVIDENCE`; **neither violation nor clearance** (PT-13). Other policies still assessed (PT-12) |
| 19 | Incorrectly perceived characteristic | attack because of a **believed** characteristic | perceived, mistaken | any | **Undecided — PT-14 is PROPOSED, not approved** | **Not determinable here.** Carried to **G02-D-07b** |
| 20 | **Identity keywords, no protected-target behavior** | none constituted | none | any | **No** | **No** — keywords are topics; **a term is never a trigger** (PT-11, TOP-1, WF-2) |

**Fifteen of twenty constitute nothing.** Cases 5–8 and 13 confirm that religious
and political **discussion and criticism** all remain fully possible. Case 14 is
load-bearing: **belonging to a protected group does not immunise a person from
criticism.** Case 17 is its mirror: **calling dehumanising abuse "criticism" does
not defeat the policy.** Case 20 is the keyword test — identity vocabulary alone
constitutes nothing.

**`ts.privacy.personal-information`** — severity `SERIOUS` · evidence `ORDINARY` · `PROHIBITED`
- **Conformance (SC-1)** — `identity` ✅ `ts.privacy.personal-information` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `ORDINARY` · `disposition` ✅ `PROHIBITED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** privacy. **secondary:** physical safety *(the source records "privacy; personal security"; the personal-security limb is read as bodily security, consistent with this policy’s envelope reasoning that S4 is reached only where exposure creates risk to life or bodily integrity)* *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`, `actor/account`. **Target:** the exposed person *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose**, **Actor & target**, **Setting** *(§6.1. Actor & target is decisive on **consent** and on self-disclosure versus disclosure of another. Setting is decisive on **public versus private** — already-public information in its ordinary context does not constitute. Purpose is decisive on journalism in the public interest)* · `severity_envelope` ✅ **S2–S4** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*
- **Governs:** publishing private identifying information without consent; doxxing; exposure creating risk of harm.
- **Does not govern:** already-public information in its ordinary context · self-disclosure · journalism in the public interest · business contact details · information shared with consent.
- **Legal:** **G02-L-05**; interacts with Group 01 §13 and **G01-L-04**.

---

### 9.5 D5 — Animal Welfare

**`ts.animal.cruelty`** — severity `SERIOUS` · evidence `ORDINARY` · `PROHIBITED`
- **Conformance (SC-1)** — `identity` ✅ `ts.animal.cruelty` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `ORDINARY` · `disposition` ✅ `PROHIBITED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** animal welfare *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`, `actor/account` *(`Governs` reaches organising such acts)*. **Target:** an animal *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose** *(§6.1, and Purpose **alone**. The `Constitutive boundary` states the constitutive element is **gratuitousness relative to purpose**: where a legitimate purpose is present and the suffering does not materially exceed it, the policy is **not constituted** — there is no exception to grant. Actor & target is not decisive because the subject is an animal, which §6.1 target values do not enumerate)* · `severity_envelope` ✅ **S1–S4** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*
- **Governs:** inflicting suffering on an animal **gratuitously**, **for entertainment or spectacle**, or **materially beyond what a legitimate purpose entails**; organising such acts.
- **Does not govern — expressly:** slaughter for food · traditional and cultural food practices · farming and animal husbandry · fishing and hunting · veterinary and medical procedures · pest control · wildlife documentary · conservation and education · religious practice involving animals.
- **Constitutive boundary:** the constitutive element is **gratuitousness relative to purpose**. Where a legitimate purpose is present and the suffering does not materially exceed it, **the policy is not constituted** — there is no exception to grant because nothing was constituted (§2.1). **`animal` is a topic and can never constitute this policy** (TOP-1, WF-2).
- **CTX-2 applies with force.** Vietnamese food practices unfamiliar to a model or reviewer are, on that ground alone, **not** evidence of cruelty (§14).
- **Ambiguity:** slaughter conducted with suffering materially beyond the purpose *can* constitute it. The boundary is real and requires human judgement, not a keyword.
- **Legal:** **G02-L-03** where illegality is asserted.

---

### 9.6 D6 — Integrity & Deception

**`ts.deception.harmful`** — severity `SERIOUS` · evidence `CORROBORATED` · `PROHIBITED`
- **Conformance (SC-1)** — `identity` ✅ `ts.deception.harmful` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `CORROBORATED` · `disposition` ✅ `PROHIBITED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **locus = `harm-class-derived`** — no single policy-level value. The interest follows the **established H class** for the case, per 09g-2’s marker and 09g-3 **A3-C**: H1 references physical safety and health, H2 financial security, H3 privacy and identity and account-security, H4 **autonomy**, H5 dignity and financial security. **H1–H5 are referenced, not redefined** *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`, `actor/account`. **Target:** the deceived person *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose**, **Actor & target** *(§6.1. Actor & target is decisive on **relevant intent or knowing misrepresentation** and on the **applicable target and context**, two of the four conjunctive elements. Purpose is decisive via `Does not govern`: satire and parody, fiction, marketing and promotional expression, opinion)* · `severity_envelope` ✅ **S2–S4** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **related-to** the four `ts.child.*` policies and `ts.sexual.exploitation-nonconsent` *(stated at §9.6: where deception causes child-safety or sexual-exploitation harm, **D2 and D3 govern directly** and this policy is **`related-to`, not the governing policy**. Routing, not a shared triple — WF-7 is not triggered)*
- **Governs:** **materially harmful deception**. Four conjunctive elements — **deception** ∧ **relevant intent or knowing misrepresentation** ∧ **materiality / relevant harm** ∧ **applicable target and context** (§9.6.1). Absent any one, **not constituted**.
- **Does not govern:** factual error · uncertainty · opinion · satire and parody · fiction · marketing and promotional expression · disputed claims · misleading representation without knowledge or materiality · minority scientific positions · political argument · religious belief · historical interpretation · updated or evolving information (§9.6.2).
- **VP-1 is load-bearing here.** See §9.6.1 for the constitutive structure and §9.6.2 for the expression ladder.

#### 9.6.1 Four conjunctive elements — none of them sufficient alone

"Deception" as a bare concept is far too broad to be a policy. The chains this
taxonomy must break are:

```
false       ⇏ deceptive
deceptive   ⇏ harmful
harmful     ⇏ policy violation
deliberate  ⇏ materially harmful        ← DEC-0
```

None of those arrows exists. The policy is constituted only by **all four**
elements together:

| | Element | Absent ⇒ |
|---|---|---|
| **1** | **Deception** — a misleading representation, not merely a statement that turns out to be untrue | not constituted |
| **2** | **Relevant intent or knowing misrepresentation** — knowledge of falsity, or reckless disregard where legitimately inferable | not constituted |
| **3** | **Materiality / relevant harm** — the misrepresentation is **material** (§9.6.3 M), the harm falls within the **approved closed set H1–H5** (§9.6.3; **G02-D-08 RESOLVED**, no residual category), and it is **causally connected** to the deception through reliance (§9.6.3 CC) | not constituted |
| **4** | **Applicable target / context** — someone is actually placed at risk, in a context where the policy reaches | not constituted |

#### DEC-0 — the distinction this policy turns on

> **DELIBERATE DECEPTION ≠ `ts.deception.harmful`.**

Deliberate deception is a **behavioral concept**. `ts.deception.harmful` is a
**policy violation**. They are not the same thing, and one does not become the
other by degree.

```
DECEPTION
    ↓
DELIBERATE / KNOWING MISREPRESENTATION      ← elements 1 + 2
    ↓
POTENTIALLY HARMFUL DECEPTION
    ↓   additional policy-relevant harm / materiality
    ↓   must be SEPARATELY ESTABLISHED  (element 3, + element 4)
MATERIAL / POLICY-RELEVANT HARM ESTABLISHED
    ↓
ts.deception.harmful
```

**DEC-0.1.** **A person can deliberately deceive without the conduct
constituting `ts.deception.harmful`.** Establishing elements 1 and 2 establishes
that someone knowingly misrepresented something. It establishes **nothing** about
element 3 or element 4.

**DEC-0.2.** The step from deliberate deception to materially harmful deception
is **not a difference of degree, intensity, or confidence**. It is an
**additional constitutive element that must be separately established** on its
own evidence. "More deliberate" never becomes "materially harmful."

**DEC-0.3.** Where elements 1 and 2 are established and element 3 or 4 is not,
the correct outcome is `APPLICABLE_NO_VIOLATION` — or `INSUFFICIENT_EVIDENCE`
where harm or materiality could not be assessed at all. **Neither is a
diminished violation** (OUT-1).

**DEC-0.4.** This is taxonomy semantics, **not an enforcement flow**. The chain
above describes what must be established for the policy to be constituted; it
describes no action, no sequence of operations, and no consequence.

**DEC-1 — Falsity is not a violation.** *"False statement = violation"* is
**expressly rejected.**
**DEC-2 — Disagreement with an asserted truth is not a violation.**
*"Disagreement with truth = violation"* is **expressly rejected.** VP-1 forbids
constituting this policy on the position taken.
**DEC-3 — Where truth cannot reasonably be established, the outcome is
`DISPUTED` or `INSUFFICIENT_EVIDENCE`** — terminal and non-violating (OUT-1).
The taxonomy has no mechanism to conclude a violation from an unresolved factual
question, and this is deliberate.
**DEC-4 — Not an arbiter of history.** Historical interpretation and academic
disagreement are outside this policy. **`history` is a topic, never a
misinformation finding.**
**DEC-5 — No numeric materiality.** Materiality is a qualitative element. **No
numeric threshold, score or confidence value is defined here** (§7).
**DEC-6 — Intent is not presumed from reach.** Wide circulation is not evidence
of intent to deceive.

#### 9.6.2 The expression ladder

Ten distinguishable expressions. **Only rung 10 is the violation candidate.**
This is a list of **different things**, not degrees of one thing: each rung
below 10 **fails at least one constitutive element**, and a rung never becomes
the rung above it by being more of itself (DEC-0.2).

**Rungs 1–9 are descriptive concepts. None of them is `ts.deception.harmful`.**

| | Expression | What it is | Element(s) not established | Outcome |
|---|---|---|---|---|
| 1 | **Factual error** | being wrong | 2 — no knowledge or intent | `NOT_APPLICABLE` |
| 2 | **Uncertainty** | nothing represented as settled | 1, 2 | `NOT_APPLICABLE` |
| 3 | **Opinion** | not a factual representation | 1 | `NOT_APPLICABLE` (VP-1) |
| 4 | **Satire / parody** | a form that signals itself | 2 — no intent to deceive | `NOT_APPLICABLE` |
| 5 | **Fiction** | presented as invented | 2 | `NOT_APPLICABLE` |
| 6 | **Marketing / promotional expression** | promotional register; puffery is not deception | usually 2 and 3 | `NOT_APPLICABLE`; deceptive commercial schemes are `ts.fraud.scam` |
| 7 | **Disputed claim** | truth unresolved | truth itself unresolved | **`DISPUTED`** — terminal |
| 8 | **Misleading representation** | misleading without knowledge, or immaterial | often 2 or 3 | `NOT_APPLICABLE` or `INSUFFICIENT_EVIDENCE` |
| 9 | **Deliberate / knowing deception** | **a behavioral concept — elements 1 + 2 established.** *Not a violation candidate* | **3 and/or 4 NOT established** | `APPLICABLE_NO_VIOLATION`, or `INSUFFICIENT_EVIDENCE` where harm or materiality could not be assessed |
| 10 | **Materially harmful deception** | **the policy-specific violation candidate** | **none — all four established** | **`VIOLATION`** |

**DEC-7 — Context may defeat an incorrect literal reading.** Satire, fiction,
journalism, education, opinion and marketing function here by **failing an
element**, not by being excused. Where a literal reading would constitute the
policy but the context shows the expression is one of rungs 1–8, the policy is
**not constituted**. This is §2.1 applied — constitutive, not a carve-out list.

**DEC-9 — Rung 9 is not a lesser rung 10.** Reaching rung 9 means a knowing
misrepresentation was established and **nothing more**. It creates no
presumption of harm, no partial violation, and no reason to resolve element 3 or
4 against the person. The gap between rung 9 and rung 10 is closed only by
**separately establishing** material, policy-relevant harm — never by inference
from the deliberateness already found (DEC-0.2).

**DEC-8 — Where the rung cannot be determined**, the outcome is
`INDETERMINATE_CONTEXT`, not a violation (CTX-1).

#### 9.6.3 Policy-relevant harm classes — **APPROVED CLOSED SET**

> **STATUS: G02-D-08 = RESOLVED — OWNER APPROVED (2026-08-15).**
> **H1–H5 are the closed set of policy-relevant harm for
> `ts.deception.harmful`. There is no residual "other harm" category, and no
> additional harm class may be introduced by interpretation.** Any future
> addition requires a **versioned Policy Taxonomy change** (§12) and **separate
> Owner approval**.
>
> **H1–H5 are not automatic violations.** Satisfying a harm class satisfies
> **element 3 only**. A case remains a **VIOLATION CANDIDATE** until all four
> constitutive elements, applicable context and the reliance connection are
> established (§9.6.1, DEC-0, CC-3).

**The organising principle — reliance.** Deception harms by inducing a false
belief on which someone acts, or refrains from acting, to their detriment. That
mechanism is what makes a harm *relevant to a deception policy* rather than
merely bad. It is the filter that keeps this set small and keeps "anything
harmful" out.

##### The set

**H1 — Physical safety and health harm**
- *Harm:* bodily injury, death, or medically significant detriment, including detriment from forgone necessary care.
- *Why deception is material:* the person acts or refrains on a false belief about safety or health, and the body bears the consequence.
- *Not this:* disagreement about health · medical uncertainty · legitimate scientific debate · minority scientific positions · evolving guidance · personal health opinion · harmless error.
- *Context that changes applicability:* whether the guidance is actionable; whether it displaces care; lay versus professional framing; whether it addresses a determinate person or the world at large.
- *False positives to exclude:* wellness discussion · traditional remedies described as such · satire · fiction · reporting on health claims.
- *Legal:* **G02-L-03** where illegality is asserted.

**H2 — Financial and transactional harm**
- *Harm:* economic detriment from a transaction or decision entered under a false belief.
- *Why deception is material:* reliance is the whole mechanism — the person parts with money, assets or access they would not otherwise have parted with.
- *Not this:* "money was lost" · ordinary commercial disappointment · ordinary competitive behaviour · legitimate marketing · puffery · price disputes · negative reviews · disputed business practice.
- *Context:* whether a transaction was actually induced; whether the misrepresentation concerned a **material term** rather than an incidental one.
- *Relationship:* where an organised scheme exists, **`ts.fraud.scam` governs and is primary** (COMP-2). H2 covers deception causing economic detriment outside a scheme.
- *Merged from candidates 4 and 5* — identical policy semantics.

**H3 — Privacy, identity and account-security harm**
- *Harm:* loss of control over personal information, identity, credentials, or an account, induced by deception.
- *Why deception is material:* the person discloses, or grants access, **because** they were misled about who is asking or why.
- *Not this:* accidental disclosure (no deception) · already-public information in its ordinary context · error · pseudonymity or a pen name, which is not deception harm.
- *Context:* whether disclosure or access was **induced**; whether an identity was impersonated; whether exposure is targeted.
- *Distinguishes:* ordinary disclosure · public information · accidental error · targeted exploitation · identity misuse · credential compromise · account takeover · targeted exposure.
- *Merged from candidates 6 and 7* — both operate through induced disclosure or induced access.
- *Legal:* **G02-L-05**.

**H4 — Coercion and exploitation harm**
- *Harm:* a person is induced by deception into a position of coercion, dependency or exploitation.
- *Why deception is material:* the deception is the **entry mechanism** into an arrangement the person would have refused.
- *Not this:* hard bargaining · unmet expectations · ordinary employment disputes · unfavourable but disclosed terms.
- *Context:* power asymmetry; whether exit is constrained; whether the misrepresentation concerned the **nature** of the arrangement.
- *Legal:* **G02-L-08** — trafficking-adjacent questions. **LEGAL REVIEW REQUIRED**; no legal conclusion is drawn here.

**H5 — Targeted reputational and livelihood harm** *(deliberately narrow)*
- *Harm:* material consequential impact on an **identifiable** person's standing or means of living, caused by a deceptive representation **about them**.
- *Why deception is material:* third parties act on the false belief to the target's detriment — reliance, by others.
- *Requires all of:* identifiable target ∧ deceptive representation about that target ∧ material consequential impact ∧ meaningful connection between the deception and the impact.
- *Not this — and this is the conservative core:* criticism is not harm · unflattering truth is not deception · **embarrassment is not policy-relevant harm** · reputational disagreement is not harm · negative reviews · criticism of public conduct · satire of a public figure in their public role · opinion · disputes about quality.
- **VP-1 applies with force.** A representation is not deceptive because it is unwelcome.

**That is the entire set. There is no residual "other harm" class**, and none may
be added by interpretation — only by a versioned taxonomy change (§12).

##### M — Materiality

**M-1.** Materiality is **qualitative**: would the misrepresentation matter to a
reasonable person's decision **in that context**?
**M-2.** Materiality is measured against **the decision the deceived person
faced**, not against the platform's interest or the topic's importance.
**M-3.** Immaterial deception does not satisfy element 3 **however deliberate**
(DEC-0.2).
**M-4.** **No numeric materiality.** No monetary amount, percentage, victim
count, audience size, view count, duration, probability, confidence or risk
value is a threshold here (DEC-5, SEV-4).
**M-5.** Where materiality cannot be assessed, the outcome is
`INSUFFICIENT_EVIDENCE` — not a violation.

##### CC — Causal connection

**CC-1.** Element 3 requires harm **connected to the deception**, not harm merely
**subsequent to** it.
**CC-2.** Sequence is not causation. Post hoc is not propter hoc.
**CC-3 — The connective test is reliance.** Did the harm operate through someone
acting, or failing to act, on the induced false belief? **If the harm would have
occurred regardless, the deception is not materially relevant** and element 3 is
not satisfied.
**CC-4.** The taxonomy states that a connection is **required**. **How strongly
it must be evidenced is Group 06 and Group 11** and is not defined here.
**CC-5.** Unestablished causation ⇒ `INSUFFICIENT_EVIDENCE`, never a violation.

##### DI — Direct, consequential and indirect harm

**DI-1.** Three tiers: **direct** harm to the deceived person · **foreseeable
consequential** harm following naturally from the reliance · **indirect /
downstream** diffuse harm.
**DI-2.** **Direct and foreseeable consequential harm are in scope. Indirect and
downstream harm is OUT of scope** for element 3. Downstream harm is precisely
where an unbounded harm concept re-enters.
**DI-3 — The boundary, without numbers.** Harm is in scope where it follows from
the reliance **without requiring an independent intervening choice by an actor
whose own decision was not induced by the deception**. Third-party reliance in
H5 stays in scope because those third parties *were* deceived.

##### IH — Intent and harm stay separate

**IH-1.** Element 2 and element 3 are established **separately**. Neither proves
the other.
**IH-2.** **Harm occurring does not prove deception.** "Someone was hurt" is not
evidence that anyone was misled.
**IH-3.** Malice is **not required** — knowing misrepresentation suffices for
element 2. Equally, absence of malice does not excuse where all four elements
hold.

#### 9.6.4 Candidate domains — include / exclude / defer

| # | Candidate domain | Decision | Reason |
|---|---|---|---|
| 1 | Physical safety | **INCLUDE** → H1 | Clean reliance structure |
| 12 | Health / medical | **INCLUDE** → merged into **H1** | Same mechanism; forgone care is the distinctive path |
| 4 | Financial / economic | **INCLUDE** → H2 | Reliance is definitional |
| 5 | Fraud / transactional | **INCLUDE** → merged into **H2** | Identical policy semantics; `ts.fraud.scam` primary where a scheme exists |
| 6 | Privacy / identity | **INCLUDE** → H3 | Induced disclosure |
| 7 | Security / account compromise | **INCLUDE** → merged into **H3** | Induced access — same mechanism as 6 |
| 9 | Coercion / exploitation | **INCLUDE** → H4 | Deception as entry mechanism |
| 8 | Targeted reputational / livelihood | **INCLUDE** → H5, narrow | Third-party reliance; heavily bounded |
| 3 | **Child safety** | **EXCLUDE as a harm class — ROUTED** | **This strengthens child safety, it does not weaken it.** Deception is a *method*; **D2 governs directly** and its policies are stricter (CS-0, `HUMAN_REQUIRED`, `LEGALLY_SENSITIVE`). Routing a child-safety case through a deception policy whose element 3 must be separately established would apply a **weaker** test. Declared relationship: `related-to`. **G02-D-03 dependency preserved; G02-L-01 unchanged** |
| 2 | **Sexual safety / exploitation** | **EXCLUDE as a harm class — ROUTED** | Same reasoning: `ts.sexual.exploitation-nonconsent` governs directly (D3). Deception is a method of achieving it. **G02-L-02 unchanged** |
| 14 | Legal / regulatory exposure | **EXCLUDE** | **"Violation of law" ≠ policy-relevant harm.** Legal status is a separate question owned by the Legal Reviewer (Group 01 LG-3). Legal review may attach to any class; it is not itself a class |
| 15 | Collective / societal harm | **EXCLUDE** | Cannot be bounded — this is exactly where "anything harmful" re-enters. Its defensible narrow forms are already covered by H1 or deferred under domain 11 |
| 10 | Discriminatory / protected-target | **DEFER — G02-D-08a** | Depends on `PROTECTED_TARGET_SET`, which is empty pending **G02-D-07** + **G02-L-04**. `ts.hate.protected-target-abuse` governs directly meanwhile |
| 11 | Civic / public-interest | **DEFER — G02-D-08b** | **OWNER + LEGAL REVIEW REQUIRED (G02-L-06).** Political speech is not inherently harmful and VP-1 must hold. The only shape that could preserve viewpoint neutrality is a narrow **procedural** one — deception about process rather than about positions — and that is **noted, not adopted**. Legally sensitive in Vietnam |
| 13 | Psychological / emotional | **DEFER — G02-D-08c** | Subjective distress alone is insufficient, and no boundary separating ordinary offence, criticism, disagreement and embarrassment from policy-relevant harm can be drawn safely at taxonomy level today |

**Result: five harm classes.** Not fifteen. Two candidates merged into H1, two
into H2, two into H3; two routed to stricter domains; two excluded as unbounded
or category-confused; three deferred.

#### 9.6.5 G02-D-08 — decision record

> ## G02-D-08 = RESOLVED — OWNER APPROVED
> **Decided by the Owner, 2026-08-15.**

| | Recorded |
|---|---|
| **Approved closed set** | **H1 · H2 · H3 · H4 · H5 — and only these** |
| **Residual category** | **None.** No "other harm" class exists or may be inferred |
| **Extension** | Only by versioned Policy Taxonomy change (§12) **plus** separate Owner approval. Never by interpretation |
| **G02-D-08d** | **RESOLVED — OWNER APPROVED** — H1–H5 approved with the merges (12→H1, 5→H2, 7→H3), the two routings and the two exclusions |
| **G02-D-08a** | **DEFERRED** — protected-target harm; depends on **G02-D-07** (+ **G02-L-04**). Not part of H1–H5 |
| **G02-D-08b** | **DEFERRED — OWNER DECISION REQUIRED** — civic / public-interest harm (+ **G02-L-06**). Not part of H1–H5 |
| **G02-D-08c** | **DEFERRED — OWNER DECISION REQUIRED** — psychological / emotional harm. Not part of H1–H5 |
| **Child safety** | **Routed to D2**, approved architectural boundary (§9.6.4). **Not** an H class |
| **Sexual exploitation** | **Routed to D3**, approved architectural boundary. **Not** an H class |
| **No H6/H7/H8** | None created. The deferred items are **future taxonomy questions**, not silent permanent exclusions |
| **Legal** | No legal classification implied; **H1–H5 are not Vietnamese legal categories** and are not claimed exhaustive |
| **Enforcement** | No enforcement semantics created |

**What this resolution does not do.** It closes **G02-D-08 only**. It does not
resolve **G02-D-07**, **G02-D-09**, or **G02-D-08a/b/c**, all of which remain
exactly as they were. *(**G02-D-03** was subsequently resolved by its own Owner
decision at §9.2 CS-5 — not by this one.)* `ts.deception.harmful` is now unblocked on the
harm question specifically; its severity label remains `PROVISIONAL — G02-D-09`.

**The complete constitutive chain** — nothing here is scoring, confidence, risk,
enforcement or automatic moderation:

```
DECEPTION
  + RELEVANT INTENT / KNOWING MISREPRESENTATION
  + MATERIALITY                       (qualitative — §9.6.3 M)
  + POLICY-RELEVANT HARM in H1–H5     (closed set)
  + APPLICABLE TARGET / CONTEXT
  + RELIANCE / CAUSAL CONNECTION      (§9.6.3 CC)
        ↓
ts.deception.harmful  —  VIOLATION CANDIDATE
```

**DEC-10 — A harm class is not a verdict.** Establishing H1–H5 establishes
element 3 and nothing else. **DELIBERATE DECEPTION ≠ `ts.deception.harmful`**
remains in force (DEC-0), and rung 9 remains rung 9 (DEC-9).

#### 9.6.6 Harm-element test cases

Testing **element 3** specifically. `1`/`2`/`3`/`4` = the constitutive elements.
**No enforcement is specified for any case.**

| | Case | Deception (1) | Intent (2) | Harm class (3) | Causal (CC) | Context | Outcome |
|---|---|---|---|---|---|---|---|
| **A** | Deliberate deception, no established harm | ✓ | ✓ | **none** | n/a | any | **`APPLICABLE_NO_VIOLATION`** — rung 9. *Not* `ts.deception.harmful` |
| **B** | …causing physical safety harm | ✓ | ✓ | **H1** | reliance shown | actionable guidance | **VIOLATION CANDIDATE** — all four |
| **C** | …causing material financial harm | ✓ | ✓ | **H2** | transaction induced | material term | **VIOLATION CANDIDATE** |
| **D** | …enabling fraud | ✓ | ✓ | **H2** | reliance shown | organised scheme | **VIOLATION CANDIDATE** — **`ts.fraud.scam` primary** (COMP-2), `ts.deception.harmful` related |
| **E** | …causing privacy / identity harm | ✓ | ✓ | **H3** | disclosure induced | impersonation | **VIOLATION CANDIDATE** |
| **F** | …causing account / security compromise | ✓ | ✓ | **H3** | access induced | credential capture | **VIOLATION CANDIDATE** |
| **G** | …causing child exploitation / safety harm | ✓ | ✓ | **ROUTED — not an H class** | — | minor involved | **D2 governs directly** (`ts.child.*`), CS-0 applies. `ts.deception.harmful` is `related-to`, not the governing policy. **G02-D-03**, **G02-L-01** |
| **H** | …causing sexual exploitation | ✓ | ✓ | **ROUTED — not an H class** | — | — | **D3 governs directly** (`ts.sexual.exploitation-nonconsent`). **G02-L-02** |
| **I** | …causing targeted livelihood / reputational harm | ✓ | ✓ | **H5** | third-party reliance | identifiable target, material impact | **VIOLATION CANDIDATE** — narrow; all four H5 requirements must hold |
| **J** | …causing coercion / exploitation | ✓ | ✓ | **H4** | entry induced | power asymmetry | **VIOLATION CANDIDATE**. **G02-L-08** |
| **K** | Deliberate deception, harm **alleged but unestablished** | ✓ | ✓ | **not established** | not established | any | **`INSUFFICIENT_EVIDENCE`** — terminal, non-violating (M-5, CC-5) |
| **L** | False statement, no deception | ✗ | ✗ | — | — | error | **`NOT_APPLICABLE`** — rung 1. **DEC-1** |
| **M** | Opinion | ✗ | — | — | — | evaluative | **`NOT_APPLICABLE`** — rung 3, VP-1 |
| **N** | Satire | — | ✗ | — | — | form signals itself | **`NOT_APPLICABLE`** — rung 4 |
| **O** | Fiction | — | ✗ | — | — | presented as invented | **`NOT_APPLICABLE`** — rung 5 |
| **P** | Marketing puffery | ✗ usually | — | **immaterial** (M-3) | — | promotional register | **`NOT_APPLICABLE`** — rung 6 |
| **Q** | Disputed factual claim | unresolved | unresolved | — | — | contested | **`DISPUTED`** — terminal, rung 7. **DEC-3** |
| **R** | Political disagreement | ✗ | — | — | — | civic | **`NOT_APPLICABLE`** — VP-1. Civic harm is **deferred (G02-D-08b)** and is *not* a class |
| **S** | Religious disagreement | ✗ | — | — | — | religious | **`NOT_APPLICABLE`** — VP-1 |
| **T** | Historical disagreement | ✗ | — | — | — | academic | **`NOT_APPLICABLE`** — **DEC-4**, history is a topic, never a misinformation finding |

**What A–T demonstrate.** Only **seven** of twenty are violation candidates
(B, C, D, E, F, I, J), and every one turns on a named harm class **plus**
established reliance. Case A is the load-bearing negative:
deliberate deception with no harm is **not** the violation. Cases G and H route
to stricter domains rather than being absorbed here. Cases K and Q stay
terminal-uncertain. Cases L–T never reach element 3 at all.

**`ts.fraud.scam`** — severity `SERIOUS` · evidence `CORROBORATED` · `PROHIBITED`
- **Conformance (SC-1)** — `identity` ✅ `ts.fraud.scam` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `CORROBORATED` · `disposition` ✅ `PROHIBITED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** financial security *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `content item`, `actor/account`. **Target:** the defrauded person *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose**, **Actor & target** *(§6.1. Purpose is decisive via `Does not govern`: legitimate commerce, advertising, disputed business practice, negative reviews, lawful risk-bearing offers. Actor & target is decisive on the intent to obtain money, credentials or assets)* · `severity_envelope` ✅ **S2–S3** *(ratified G02-D-09d, 2026-08-15 — Owner; bounds CHOSEN, not derived)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*
- **Governs:** deceptive schemes to obtain money, credentials or assets; impersonation for gain; fraudulent commercial offers.
- **Does not govern:** legitimate commerce · advertising · disputed business practice · negative reviews · lawful risk-bearing offers.
- **Note:** `src/lib/scam-shield/` addresses **external** threats to users. This policy addresses **on-platform conduct**. Group 01 §4.5 governs the boundary: architectural patterns may be reused, semantics may not.

**`ts.platform.abuse-manipulation`** — severity `MODERATE`–`SERIOUS` · evidence `CORROBORATED` · `PROHIBITED`
- **Conformance (SC-1)** — `identity` ✅ `ts.platform.abuse-manipulation` · `constitutive_behavior` ✅ *see Governs* · `does_not_govern` ✅ *see Does not govern* · `evidence_sensitivity` ✅ `CORROBORATED` · `disposition` ✅ `PROHIBITED` · `version` ✅ `@1` *(initial drafted version — Owner decision 2026-08-16, `VER-T1` notation. **Not a ratification claim:** `@1` records the **first drafted revision of this policy record** and asserts nothing about whether the content was ratified beforehand. Taxonomy identity, H1–H5, the protected-interest vocabulary, the severity model, the policy definitions and the Governance document version `1.0` are all **unchanged** by this)* · `protected_interest` ✅ **primary:** ecosystem integrity *(§3.5’s `ecosystem integrity` is the value that covers platform and service integrity)* *(09g executed 2026-08-16 — 09g-1 **A1-B** controlled vocabulary with governed extension, 09g-2 **A2-B** primary plus secondary, 09g-3 **A3-C** H1–H5 reference interests without redefining them. Source of the value: this policy’s own `Governs`, as recorded in the §7.3.10 interest column. **H1–H5 unchanged**)* · `applicability` ✅ **Actor:** `actor/account`, `coordinated set` *(stated verbatim in this policy’s own `Subject type` line, not single items)*. **Target:** the ecosystem *(Owner decision 2026-08-16 — applicability is declared as **two separate dimensions**, not collapsed. **Actor** uses the §3.1 subject types a policy reaches; **Target** uses the affected entity established at §7.3.10)* · `content_classes` ✅ `UGC`, `AI_GENERATED`, `AI_ASSISTED`, `MIXED`, `EXTERNAL_THIRD_PARTY` *(all five — Owner 2026-08-16, D3 corpus-wide default; B-5 value space, SCOPE-1 satisfied. **Declaration only:** `AI_ASSISTED` / `MIXED` accountability remains OPEN at `G01-D-05` per ORIG-2/ORIG-3, and `EXTERNAL_THIRD_PARTY` v1 scope remains OPEN at `G02-D-10` — neither is resolved, pre-empted, nor implied here)* · `defeating_contexts` ✅ **none** *(corpus-wide WF-6 convention, Owner 2026-08-15 — a declaration, not a defeating-context justification)* · `decisive_dimensions` ✅ **Purpose**, **Actor & target** *(§6.1. Purpose is decisive via `Does not govern`: organic popularity, legitimate promotion, genuine coordinated advocacy, multiple accounts for legitimate purposes. Actor & target is decisive on authenticity and coordination of the acting party)* · `severity_envelope` ✅ **S1–S4** *(ratified G02-D-09d, 2026-08-15 — Owner)* · `relationships` ✅ **none required** *(WF-7 is conditional and is **not triggered**: this policy shares no `behavior × context × harm` triple with any other of the eighteen — its constitutive behavior is unique. Evaluated 2026-08-16, once `protected_interest` made the triple computable. No §11 relationship type applies; none is invented)*
- **Governs:** coordinated inauthentic behavior; engagement manipulation; ban evasion; automated abuse; **abuse of the reporting system itself**, including retaliatory or brigaded reporting.
- **Does not govern:** organic popularity · legitimate promotion · genuine coordinated advocacy · multiple accounts for legitimate purposes.
- **Subject type:** primarily `actor` and `coordinated set`, not single items.

---

## 10. Policy composition

Real cases engage several policies at once. A threat against someone because of
their religion is simultaneously threat, harassment and protected-target abuse.

**COMP-1.** Multiple policies may apply. All applicable ones are recorded.
**COMP-2.** A **primary** policy is identified — the one whose harm is most
directly implicated — with the others recorded as **related**. Primary is a
*descriptive* designation, not a severity ranking.
**COMP-3.** Recording all applicable policies is what lets an appeal address the
right one (§16) and lets Group 14 detect systematic over-classification.
**COMP-4 — Precedence for enforcement is NOT defined here.** How multiple
applicable policies combine into one decision belongs to Group 06 (risk) and
Group 09 (enforcement). The taxonomy supplies the inputs and stops.

---

## 11. Policy relationships

Declared, machine-checkable relationship types:

`parent-of` / `child-of` · `broader-than` / `narrower-than` · `related-to` ·
`overlaps-with` (requires a stated distinction) · `mutually-exclusive-with` ·
`contextual-exception-to` · `supersedes` / `superseded-by` ·
`deprecated-by` · `jurisdiction-variant-of` (**LEGAL REVIEW REQUIRED**)

**REL-1.** `overlaps-with` obliges a written statement of what distinguishes the
two. Undistinguished overlap is a defect (WF-7).
**REL-2.** Relationship graphs are acyclic for `parent-of` and `supersedes`.
**REL-3.** Deprecated policies are **retained**, never deleted — Group 01
**CM-3**, **CM-4** and **VER-4**.

---

## 12. Versioning

**VER-T1 — Identity ≠ version.** `ts.animal.cruelty` is the identity;
`ts.animal.cruelty@2` is a version. Decisions cite the **version**.

**VER-T2 — Versions are immutable once used.** A published version whose
meaning has been relied upon in a decision is **never** edited. A change in
meaning is a new version. This is Group 01 **VER-4** and **EV-1** at taxonomy
level: a decision from last month must remain interpretable by the text in force
last month.

**VER-T3 — Semantics of a version change.** Each version states whether it
**narrows**, **broadens**, or **clarifies without changing scope**. A broadening
is a policy change requiring the Group 01 §6 lifecycle; a clarification is not
licence to broaden by stealth.

**VER-T4 — Non-retroactive by default.** A new version does not retroactively
recharacterise decisions made under a prior one (Group 01 **LC-2**, **CM-2**).

**VER-T5 — Taxonomy version is independent of model version** (Group 01
**MG-1**) and of software release (**VER-3**).

**VER-T6 — Deprecation requires mapping.** Retiring a policy or a behavior
requires an explicit mapping for existing decisions, evidence and appeals
referencing it (Group 01 **CM-4**).

---

## 13. Content classes and origin

Group 01 **B-5** and **SCOPE-1**: every policy declares which classes it reaches
— `UGC` · `AI_GENERATED` · `AI_ASSISTED` · `MIXED` · `EXTERNAL_THIRD_PARTY`.

**ORIG-1 — Origin is not severity.** AI-generated content is neither
automatically higher nor lower risk. Policy evaluates **behavior and context**;
origin affects **applicability and accountability**, not the classification of
the behavior.

**ORIG-2 — Accountability differs from applicability.** A policy may be
*violated* by AI-generated content while the *accountable party* is TappyAI, not
a user. The taxonomy records the classification; **who is accountable is Group 01
§4.3 and remains open at G01-D-05**, which this document does not pre-empt.

**ORIG-3.** `MIXED` governance is open at **G01-D-05**. The taxonomy is built to
accept the answer, not to supply it.

---

## 14. Vietnamese cultural intelligence

Vietnam is the initial market, so this is a correctness requirement, not a
courtesy.

**VN-1 — Unfamiliarity is never evidence** (CTX-2). That a practice is absent
from a model's training distribution is a fact about the model.

**VN-2 — Named as legitimate at taxonomy level, not as exceptions.** *Tiết canh*
(raw blood pudding), *trứng vịt lộn* (balut), home and market slaughter,
*mắm* and fermented preparations, whole-animal presentation, and *lễ hội*
practices involving animals are **culinary, cultural and religious contexts**
that do not constitute `ts.animal.cruelty` or `ts.violence.graphic-harm`. They
are not carve-outs; they never enter those policies (§2.1).

**VN-3 — Language.** Vietnamese diacritics, regional varieties (Bắc/Trung/Nam),
slang, teencode, and **Vietnamese–English code-switching** are first-class
context, not noise. Diacritic-stripped text is not evidence of evasion.

**VN-4 — Hyperbolic idiom.** Vietnamese conversational register contains
emphatic constructions that read as threats under literal translation. Literal
rendering is **not** credibility (§9.1).

**VN-5 — No stereotype encoding.** No policy, behavior or context may be defined
by reference to a nationality, ethnicity, region or religion as a proxy for
risk. A taxonomy entry that makes "Vietnamese" predictive of anything is
malformed.

**VN-6 — Local civic discussion.** Political and historical discussion is
topical, not violating (§9.6, VP-1). Jurisdictional questions are
**G02-L-06**, and no jurisdictional variance is operative before legal review.

---

## 15. User reports are signals, not findings

**REP-1.** A report is an **input signal**. It is never evidence of a violation
and never a classification.
**REP-2 — Report count has no taxonomic meaning.** *N reports → violation* is
prohibited at every N. Volume is a **routing** signal at most, owned by Groups
07 and 06.
**REP-3.** Reports are not neutral: brigading and retaliatory reporting are
themselves covered by `ts.platform.abuse-manipulation`.
**REP-4.** A report's stated category is the **reporter's** hypothesis. It never
binds classification.

---

## 16. Appeal traceability

Group 01 **AP-7** requires an appeal to identify what was decided under what
rule. The taxonomy must make that answerable:

**APX-1.** Every classification records **policy identity + policy version**,
the **behavior** found constituted, the **contextual interpretation** applied,
the **outcome class** (§4), and every **other applicable policy** (COMP-1).

**APX-2 — A contextual interpretation is part of the finding.** "We read this as
entertainment rather than food preparation" *is* the decision. An appeal
contests it, so it must be recorded as a stated interpretation, not left
implicit.

**APX-3 — REVERSAL ≠ ERASURE.** A successful appeal reverses the enforcement
outcome; the classification, its version and its evidence **remain** in the
authoritative record (Group 01 AP-8, §11.1, PROP-1).

---

## 17. Non-goals

Group 02 does **not** define: multimodal detection algorithms · ASR/OCR ·
model selection or prompts · confidence calculation · risk scoring · enforcement
thresholds · quarantine · moderation queues · appeal APIs · evidence schemas ·
Controller integration · migrations · runtime Policy Engine · numeric severity
values · enforcement precedence (COMP-4) · jurisdictional variance (pending
legal review) · protected-characteristic enumeration (G02-D-07) · age or legal
thresholds (G02-L-01, G02-L-02).

No code, no schema, no migration, no Controller V2 change, no production change.

---

## 18. The 25 mandatory cases

`NA` = `NOT_APPLICABLE` · `ANV` = `APPLICABLE_NO_VIOLATION` · `V` = `VIOLATION` ·
`DISP` = `DISPUTED` · `IC` = `INDETERMINATE_CONTEXT`

> **All severity labels in this table are `PROVISIONAL — G02-D-09`** (§7.2),
> whether or not individually marked. They indicate relative seriousness for
> review; they are not a ratified scale and carry no enforcement meaning.

| # | Case | Topic (L1) | Behavior (L2) | Context (L3) | Policy applicability | Outcome | Ambiguity |
|---|---|---|---|---|---|---|---|
| 1 | **Tiết canh** | blood, food, VN cuisine | preparing/consuming a traditional dish | culinary, cultural | `ts.animal.cruelty` **not constituted** (no gratuitous suffering); `ts.violence.graphic-harm` not constituted (no glorification of harm to people) | **NA** | None at policy level. High detector false-positive risk on "blood" — a Group 04/05 problem, and TOP-1 forbids it becoming a finding |
| 2 | **Trứng vịt lộn** | food, embryo, VN cuisine | preparing/eating a traditional dish | culinary, cultural | Nothing constituted | **NA** | None. Named in VN-2 precisely because unfamiliarity invites miscoding as cruelty |
| 3 | **Poultry/pig slaughter for food** | animal, slaughter, food | slaughtering an animal for food | culinary, agricultural, cultural | `ts.animal.cruelty` **not constituted** — legitimate purpose, suffering not materially beyond it | **NA** (`ts.graphic.presentation` may apply — `RESTRICTED`, not a violation) | Real boundary: suffering *materially beyond* the purpose can constitute cruelty. Human judgement, never keyword |
| 4 | **Cooking content involving blood** | blood, food | food preparation | culinary | Nothing constituted. **Blood is a topic** (TOP-1) | **NA** | None |
| 5 | **Medical/surgical footage** | blood, injury, medicine | performing/documenting a clinical procedure | medical, educational | `ts.violence.graphic-harm` not constituted (no glorification, no shock-primacy) | **NA** (presentation handling available) | None at policy level |
| 6 | **Journalism showing violence** | violence, news | reporting an event | journalistic, public interest | `ts.violence.graphic-harm` — behavior present but purpose is journalistic, shock-primacy absent | **ANV** | Atrocity footage is both journalism and extreme imagery; resolution favours journalism, presentation handled separately |
| 7 | **Historical footage** | violence, history | documenting the historical record | historical, educational | Not constituted; `ts.deception.harmful` **not** engaged — DEC-3, history is not a misinformation finding | **NA** | Historical interpretation is expressly outside the taxonomy |
| 8 | **Educational content** | varies | teaching | educational | Purpose is constitutive across D1/D3/D5 | **NA** | Only where "educational" is pretextual — a genuine, human-judged question |
| 9 | **Political discussion** | politics | discussing/criticising government or policy | civic | **No policy.** `politics` is a topic; VP-1 forbids viewpoint constitution | **NA** | None. Becomes relevant only if threat/incitement/harassment is independently constituted |
| 10 | **Religious discussion** | religion | discussing, practising or criticising religion | religious, civic | **No policy.** Criticism of a religion is not an attack on believers (§9.4) | **NA** | The line is *people targeted because of* the characteristic — a different behavior entirely |
| 11 | **Satire / parody** | varies | satirising | satirical | Defeats `ts.deception.harmful` (no intent to deceive). Does **not** automatically defeat harassment or threats | **NA** for deception; other policies assessed on their own terms | Satire aimed at a private individual can still constitute harassment. Satire is not a universal shield |
| 12 | **Animal cruelty** | animal, harm | inflicting suffering gratuitously or for entertainment | entertainment/spectacle; no legitimate purpose | `ts.animal.cruelty` **constituted** | **V** — `SERIOUS` | Boundary with case 3 is purpose and proportionality |
| 13 | **Torture** | violence, harm | inflicting extreme suffering on a person | if glorified/shock-primary | `ts.violence.graphic-harm` **constituted**; `ts.child.abuse-harm` if the subject is a minor | **V** — `SEVERE` | Documentation of torture for journalism or accountability is case 6, not this |
| 14 | **Abuse for entertainment** | abuse | inflicting harm as spectacle | entertainment | Animal subject → `ts.animal.cruelty`; person → `ts.violence.graphic-harm` and/or `ts.harassment.targeted`; minor → **D2** | **V** | Subject determines the policy; "entertainment" is the constitutive context |
| 15 | **Child abuse** | minor, harm | abusing or endangering a minor | **CS-0: no context defeats** | `ts.child.abuse-harm` **constituted** | **V** — `CRITICAL`, `HUMAN_REQUIRED`, `LEGALLY_SENSITIVE` | Protective documentation is not the abuse itself — a constitutive distinction, not a carve-out. **G02-L-01** |
| 16 | **Sexual exploitation** | sexual, exploitation | sexual exploitation / non-consensual sexual content | context establishes *what happened* (CS-0.2); generic purpose cannot excuse it (CS-0.3) | Minor → `ts.child.sexual-exploitation`; adult → `ts.sexual.exploitation-nonconsent` | **V** — `CRITICAL` *(provisional)* | Where age is decisive and unresolved → `INSUFFICIENT_EVIDENCE`, **not** a violation and **not** a clearance (CS-4.1/4.2/4.3). **G02-D-03**, **G02-L-01/02** |
| 17 | **Incitement** | violence, politics | inciting or soliciting violence | any | `ts.violence.incitement-threats` **constituted** — target + credibility | **V** — `SEVERE` | Distinguishing incitement from heated advocacy is the whole difficulty; VN-4 applies |
| 18 | **Credible threats** | violence | threatening identifiable people | any | `ts.violence.incitement-threats` **constituted** | **V** — `SEVERE`, `CORROBORATED` | Credibility is contextual and culturally variable (VN-4). Absent credibility → **NA**, not a lesser violation |
| 19 | **Targeted harassment** | harassment | directed abuse at an identifiable person | any | `ts.harassment.targeted` **constituted**; add `ts.hate.protected-target-abuse` if characteristic-based (COMP-1/2) | **V** — `SERIOUS` | Public-figure boundary — **G02-D-06**. Criticism of work ≠ abuse of person |
| 20 | **Dangerous illegal activity** | danger, illegality | instructing/promoting seriously harmful activity as imitable | promotional | `ts.danger.harmful-activity` **constituted** | **V** — `SERIOUS` | Legality varies; **G02-L-03**. Documentation and warning are not promotion |
| 21 | **Self-harm support-seeking** | self-harm | **disclosing distress / seeking help** | support-seeking, personal | `ts.selfharm.promotion` **not constituted** — its behavior is promotion *directed at others*; disclosure is the inverse | **ANV**, **response-warranted (OUT-3)** | **None. This must never be a violation.** Response is Group 09; **G02-D-05** |
| 22 | **Self-harm encouragement / instructions** | self-harm | encouraging or instructing others in self-harm | directed at others | `ts.selfharm.promotion` **constituted** | **V** — `SEVERE`, `HUMAN_REQUIRED` | Boundary with 21 is direction: toward others vs about oneself |
| 23 | **Sexual education** | sexual, education | teaching about sexual health | educational, medical | `ts.sexual.adult-content` **not constituted**; D2 not engaged where the content is educational and non-sexualising | **NA** | Age-appropriateness may raise audience questions, not violation. **G02-L-02** |
| 24 | **Materially harmful deception** *(with policy-relevant harm in H1–H5 established)* | misinformation | knowingly misrepresenting, materially, to someone's foreseeable harm | deceptive intent | `ts.deception.harmful` — **ladder rung 10**; element 3 satisfied by an **H1–H5** class (§9.6.3) | **VIOLATION CANDIDATE** — becomes a violation only once **all four elements**, applicable context and the reliance connection are established. Severity `SERIOUS` *(provisional — G02-D-09)*, `CORROBORATED` | Intent is hard to establish; absent it → rung 8/9, never a downgraded violation. **H1–H5 satisfy element 3 only — a harm class is not a verdict (DEC-10)** |
| 25 | **Disputed / uncertain factual claim** | varies | asserting a contested claim | any | `ts.deception.harmful` **not constituted** — element 1 and element 2 both unestablished (§9.6.1) | **DISP** — terminal, **not a violation** (DEC-3, OUT-1) | None. The taxonomy is structurally incapable of concluding a violation from an unresolved factual question, by design |

### 18.1 Supplementary cases added at the revision gate

Named in the Owner recheck list and not previously distinguished as rows. The 25
mandatory cases above are unchanged.

| # | Case | Topic (L1) | Behavior (L2) | Context (L3) | Policy applicability | Outcome | Ambiguity |
|---|---|---|---|---|---|---|---|
| 26 | **Ordinary factual error** | varies | stating something that is untrue, without knowing it | any | `ts.deception.harmful` **not constituted** — **element 2 fails** (no knowledge or intent). Ladder rung 1 (§9.6.2) | **NA** | None. **Being wrong is not a violation.** DEC-1 |
| 27 | **Fiction** | varies — may include violence, crime, sex | narrating or depicting invented events | fictional / artistic | `ts.deception.harmful` **not constituted** — element 2 fails, rung 5. `ts.violence.graphic-harm` not constituted absent glorification or shock-primacy | **NA** (`ts.graphic.presentation` may apply as `RESTRICTED`) | Fiction does **not** shield conduct that is independently constituted — a real threat inside a fictional frame is still assessed on its own terms (cf. case 11) |
| 28 | **Deliberate deception, no policy-relevant material harm established** | misinformation | knowingly misrepresenting | deceptive intent present | **NOT `ts.deception.harmful`** — elements 1 + 2 established; **no H1–H5 harm established**, so element 3 fails. **Ladder rung 9** | **ANV** — or `INSUFFICIENT_EVIDENCE` where harm/materiality could not be assessed. **Not a violation, not a violation candidate, not a diminished one** | **This is the case the harm element exists for.** Deliberateness alone never closes the gap to rung 10 (DEC-0.2, DEC-9). Marketing puffery and most everyday dishonesty land here |
| 29 | **Truth, harm, materiality or applicability unresolved** | misinformation | cannot be determined | unreadable or absent | No element can be established with confidence | `DISPUTED` or `INSUFFICIENT_EVIDENCE` or `INDETERMINATE_CONTEXT` — **terminal, non-violating** (OUT-1, DEC-3, DEC-8) | **Suspicion is not a constitutive element.** The taxonomy cannot force a violation because content looks suspicious |

**What the table demonstrates.** Fifteen of twenty-five resolve to non-violating
outcomes, and the violating ten are constituted by **behavior, target and
purpose** — never by topic. Cases 1–5 all involve blood or animals and none is a
violation. Cases 9, 10 and 7 involve politics, religion and history and none is
a violation. Case 25 is uncertain and stays uncertain.

---

## 19. Self-audit

| # | Dimension | Verdict |
|---|---|---|
| 1 | topic ≠ violation | ✅ TOP-1/2/3, WF-2; cases 1–5, 9, 10 |
| 2 | behavior ≠ topic | ✅ BEH-1/2/3; behaviors are verb phrases |
| 3 | context first-class | ✅ §6; constitutive by default (§2.1) |
| 4 | intent represented | ✅ §6.1; conjunctive in `ts.deception.harmful` |
| 5 | severity ≠ confidence | ✅ §7.1 SEV-1.1, SEV-3 |
| 6 | confidence ≠ risk | ✅ §7 — taxonomy declares neither |
| 7 | reports ≠ proof | ✅ REP-1…4 |
| 8 | Vietnam cultural context | ✅ §14 VN-1…6; cases 1–3 |
| 9 | AI-generated | ✅ §13 ORIG-1 |
| 10 | AI-assisted | ✅ §13; accountability deferred to G01-D-05, not pre-empted |
| 11 | child safety | ✅ §9.2. CS-0 isolation **plus CS-0.1–0.5**: context establishes *what happened*, generic purpose cannot erase an established violation. CS-3 five age states · CS-4 uncertainty posture · **CS-5 = G02-D-03 RESOLVED** (terminal non-violating outcomes; `unknown age = violation` and `unknown age = adult` both prohibited; evidence ≠ proof; signal ≠ finding). **Legal portion still open: G02-L-01** |
| 12 | self-harm | ✅ §9.1; cases 21/22; disclosure structurally cannot violate |
| 13 | sexual content | ✅ §9.3; no age or legal threshold asserted |
| 14 | violence | ✅ §9.1; glorification/shock-primacy constitutive, not blood |
| 15 | animal | ✅ §9.5; gratuitousness-relative-to-purpose |
| 16 | politics | ✅ VP-1; case 9 |
| 17 | religion | ✅ §9.4; criticism of religion ≠ attack on believers |
| 18 | history | ✅ DEC-3; case 7 |
| 19 | misinformation | ✅ §9.6.1 four conjunctive elements; **DEC-0: DELIBERATE DECEPTION ≠ `ts.deception.harmful`**; §9.6.2 ten-rung ladder where only rung 10 is the violation candidate; DEC-1…9. `false ⇏ deceptive ⇏ harmful ⇏ violation`, and `deliberate ⇏ materially harmful` |
| 20 | ambiguity / insufficient evidence | ✅ §4 — three terminal non-violating outcomes; OUT-1 |
| 21 | multiple applicable policies | ✅ COMP-1/2/3 |
| 22 | precedence left to later groups | ✅ COMP-4 |
| 23 | versioning | ✅ §12 VER-T1…6 |
| 24 | auditability | ✅ APX-1; OUT-2 records non-violations |
| 25 | appeal traceability | ✅ §16 APX-1/2/3 |
| 26 | legal-review boundaries | ✅ §21; no statutory obligation asserted |
| 27 | compactness | ✅ 6 domains, 18 policies, one shared behavior/context/harm vocabulary |
| 28 | no authorization/PDP contamination | ✅ §1; verified — no PDP, RBAC, RLS or permission concept appears |
| 29 | no enforcement implementation | ✅ §17; disposition is a normative stance, not an action |
| 30 | no Controller modification | ✅ none proposed; Group 01 AUTH-4 holds |

### 19.1 Weaknesses this draft acknowledges

1. **The severity class set is now formally OPEN** (§7.2, **G02-D-09**). It was
   asserted rather than derived, so every label in §9 is marked `PROVISIONAL`
   and SEV-6 forbids downstream reliance. The *concept* is settled; the *scale*
   is not, and it should not be replaced by another arbitrary set (SEV-7).
2. **`ts.deception.harmful` is the most dangerous policy here.** Four
   conjunctive elements, **DEC-0** separating deliberate deception from the
   violation, a ten-rung ladder where only rung 10 is a violation candidate, and
   now a **closed five-class harm set H1–H5 with no residual category**
   (§9.6.1–9.6.3), **approved at G02-D-08**. **Element 3 is bounded**, which was
   the specific viewpoint-instrument risk, and the harm question no longer blocks
   this policy. Its severity label is still `PROVISIONAL — G02-D-09`, and
   **G02-D-08a/b/c** remain deferred future questions rather than settled
   exclusions. **H5 is the class most likely to be misused** — it is written at
   its narrowest and should be reviewed hardest.
3. **Age uncertainty in D2 is resolved as taxonomy, not as law** (**G02-D-03
   RESOLVED**, CS-5; **G02-L-01 still open**). Every unresolved-age state yields
   a terminal non-violating outcome, and both `unknown age = violation` and
   `unknown age = adult` are prohibited. What remains genuinely open is legal —
   statutory minority, thresholds, reporting and preservation duties — and no
   downstream group should read CS-5 as answering any of those. CTX-1 stays
   qualified here, confined to signalling so it creates no finding in either
   direction.
4. **"Credibility" and "gratuitousness" are irreducibly judgemental.** No
   definition removes that, and pretending otherwise would produce a taxonomy
   that reads precise and behaves arbitrarily. They are flagged as
   human-judgement points rather than falsely specified.
5. **Eighteen policies may still be too many.** Consolidation should be
   considered at review (**G02-D-01**), particularly D6.
6. **`PROTECTED_TARGET_SET` is still empty, and the policy is therefore
   non-operational** (**G02-D-07b** + **G02-L-04**). §9.4.1 separates the
   structural slot (A) from the product policy (B) and from legal classification
   (C); §9.4.2 now adds the **inclusion criterion** (PT-6, **G02-D-07a**) and the
   operational rules PT-8…PT-14, all of which hold regardless of membership. What
   is still missing is the membership itself, and supplying it from general
   knowledge rather than Vietnamese social and legal context would be exactly the
   invention Group 01 B-3 forbids. **PT-5 was corrected at this gate**: the slot's
   *shape* is stable without contents, but `ts.hate.protected-target-abuse`
   cannot be applied to anything until the set is populated.

---

## 20. Owner decisions required

| ID | Decision |
|---|---|
| **G02-D-01** | Approve, amend or consolidate the six-domain / eighteen-policy family set (§9) |
| ~~**G02-D-02**~~ | ✅ **RESOLVED — OWNER APPROVED (2026-08-15). `RESTRICTED` IS IN SCOPE FOR v1.** The class exists: legitimate intense content — surgical or journalistic video, culturally specific food content (§14) — receives **presentation handling** (audience gate or interstitial) **without ever being classified as a violation** (§9.1). This settles **existence and scope only**. 🚨 **The Owner expressly declined to adopt Finding C in the same breath**: what severity representation a `RESTRICTED` policy should carry is **deferred to `G02-D-02a`**, so **`ts.graphic.presentation` and `ts.sexual.adult-content` remain OPEN under `G02-D-09d`**. `ts.sexual.adult-content` additionally needs **G02-D-04** |
| **G02-D-02a** | ✅ **RESOLVED — OWNER APPROVED (2026-08-16) = option C.** Severity is **not meaningful at taxonomy level for a `RESTRICTED` policy**; the third envelope state **`NO_ENVELOPE`** is recorded at **ENV-7** (§7.3.6a) and carried by **#5** and **#11**. *(register back-swept 2026-08-16 — **status only**, no decision made here)* ~~🔶 OPEN — OWNER DECISION REQUIRED.~~ *(Split from `G02-D-02` at the Owner's direction, 2026-08-15, following the `G02-D-07a`/`07b` precedent: the parent question is answered, a distinct sub-question remains.)* **What severity representation does a `RESTRICTED` policy carry?** Analysis at **Finding C** (§7.3.9) concluded — with options A and B eliminated mechanically (**SEV-13/WF-2** bar grading imagery intensity as a topic; **SEV-11** means no constitution, nothing to grade) — that **severity is not meaningful at taxonomy level** for `RESTRICTED` policies. **That conclusion is recorded but NOT adopted.** 🚨 If adopted it implies a **third envelope state** — neither an `S1–S4` range nor `OPEN` — which **the taxonomy does not currently define** (**ENV-1…ENV-6** provide no such value), so adopting it would itself require defining that state. **Blocks the envelopes of #5 and #11 under `G02-D-09d`.** 🔷 **SEQUENCING DECIDED BY OWNER (2026-08-15) — OPTION C: REPAIR DEFINITIONS FIRST.** The Owner **expressly declined to characterise** the absence of established harm as *either* intrinsic to `RESTRICTED` *or* a defect in these two policies. Consequently: **#5 and #11's policy definitions are to be repaired/clarified first, and `G02-D-02a` is then re-run against the repaired primary text.** 🚨 **This does NOT resolve `G02-D-02a`, which remains OPEN** — it fixes the *order of work*, not the answer. **No new severity state is created; `OPEN` keeps its exact `ENV-6` meaning — "not yet determined", never "severity never applies"; no envelope is assigned; ENV-1…ENV-6 and WF-5 are unamended; #5 and #11 remain non-conformant on the WF-5 severity limb.** ⚠️ **Flagged, not decided:** repairing these definitions means declaring a protected interest, which is **WF-3** work living under **`G02-D-09g`** — so C may place 09g back on the severity path *for these two policies only*, reversing the post-Q2=A note that 09g is "no longer on the severity path". 🔷 **SCOPE DECIDED BY OWNER (2026-08-15) — OPTION C: SPLIT.** **`ts.graphic.presentation` (#5) is repaired now; `ts.sexual.adult-content` (#11) is deferred until `G02-D-04` resolves.** Basis, from primary text: **#11's `Governs` embeds D-04's own question** — *"whether consensual adult sexual content **is permitted**"* **is** the product stance — so #11 cannot be defined while its own scope is undecided. #5's `Governs` carries no such dependency. 🔑 **The repair has TWO LAYERS and only Layer 1 is in scope:** **Layer 1 — naming the harm in prose (WF-3, HRM-1) — is independent of 09g**, since §3.5 already enumerates ten interests; **Layer 2 — populating the SC-1 `protected_interest` field — remains BLOCKED on `G02-D-09g-1/2/3/5`**, because **09g-5 may restructure or replace the §3.5 ten outright**. Consequently **re-running `G02-D-02a` needs only Layer 1**, and **`G02-D-02a` is NOT hard-blocked on 09g**. ⚠️ **SECOND DEFECT FOUND AND RECORDED, NOT YET REPAIRED — `WF-2`, not only WF-3.** WF-2 bars a topic as a *sufficient condition*; **#5's condition reduces to *"intensely graphic imagery"*** — an intensity descriptor — **and #5 carries no `Constitutive boundary` bullet**, unlike `ts.violence.graphic-harm`, whose boundary states its element is *"glorification or shock-primacy, **not** the presence of injury or blood"*. **#11 has the same shape** via *"consensual adult sexual content"*. **This is a recorded finding, not a ratified malformedness declaration** — naming a harm alone will **not** make #5 well-formed. ✅ **INPUT (i) RATIFIED (2026-08-15): #5's protected interest is *psychological safety of the viewer*.** **WF-3 / HRM-1 are satisfied for #5 at Layer 1.** 🚨 **HRM-2 compliance rests on an explicit Owner threshold judgment** — that **unwarned exposure to intensely graphic imagery exceeds mere discomfort** — since HRM-2 bars offence, discomfort and unfamiliarity from counting as harm. The interest is the **viewer's**, not the depicted person's; dignity-of-the-depicted stays with `ts.violence.graphic-harm` (**WF-7**). 🔴 **INPUT (ii) UNRESOLVED — REPAIR HALTED INCOMPLETE (2026-08-15).** The **constitutive boundary** stopping #5's condition reducing to the topic *"intensely graphic imagery"* (**WF-2**) **could not be drafted from ratified vocabulary.** A full provenance audit established that the corpus has **no established term for a viewer's advance awareness of what they are about to see**: *"opportunity"*, *"prepare"*, *"encounter"* and *"sought"* have **zero** occurrences; **`notice`** and **`warning`** are bound to the **enforcement action ladder** in the **unwritten** `09_ENFORCEMENT.md`; **`interstitial`** and **`presentation handling`** are #5's **remedy**, not an element; **`surface`** carries **CP-1**'s platform meaning; **`consent`** is the **depicted person's**; **`content class`** is **origin** (§13); **`applicability`** is an OPEN declaration slot. Only `presentation`, `audience` and `viewer` are reusable, and they name *who* and *how delivered*, not advance awareness. 🔴 **The Owner then DECLINED the minimal L3 Setting vocabulary amendment (2026-08-15) — no context element was added, and §3.3 is unchanged.** ⇒ **#5's WF-2 defect is UNRESOLVED and returns to `G02-D-02a`.** **Status of the C-split repair for #5: WF-3 ✅ satisfied (Layer 1) · WF-2 🔴 unresolved · repair INCOMPLETE.** ⚠️ **Flagged, NOT decided:** this bears on D-02a's intrinsic-vs-defect question — a defect that cannot be repaired from ratified vocabulary is evidence the Owner may weigh — but **the characterisation remains expressly undecided under option C**. 🚨 **Sharpest form of that evidence, recorded for the D-02a re-run:** #5's **ratified protected interest** and its **undraftable boundary rest on the SAME unexpressible concept.** The HRM-2 justification for the interest is that *"**unwarned** exposure to intensely graphic imagery exceeds mere discomfort"* — and **`unwarned` has zero independent provenance**, occurring only in these two status records. So the interest currently stands on a concept the taxonomy **cannot express**, the same gap that blocks WF-2. ~~**This is recorded as a finding, not acted on**~~ 🕐 **HISTORICAL — Q2(c) option (a), SUPERSEDED 2026-08-15; retained verbatim under CM-3 / VER-4:** *"🔷 **RESOLVED BY OWNER (2026-08-15) — Q2(c) OPTION (a): KEEP THE INTEREST, DEFER ITS HRM-2 RATIONALE BEHIND `G02-D-08c`.** **The ratified interest stands and input (i) is NOT reopened**; the ratified basis is **not rewritten** (CM-3, VER-4). **What is deferred is only the RATIONALE.** Grounds: §3.5 names `psychological safety` as an existing protected interest and §7.3.12 rates it **usable**, so the Layer-1 declaration **satisfies WF-3 / HRM-1 naming**; but the HRM-2 distinction it requires is **already deferred under `G02-D-08c`** — "no boundary separating ordinary offence, criticism, disagreement and embarrassment from policy-relevant harm can be drawn safely at taxonomy level today".*" 🔷 **SUPERSEDING OWNER DECISION (2026-08-15) — OPTION B: DEPENDENCY DETACHED.** **`G02-D-08c` is related to #5's HRM-2 question but is NOT mechanically required for it**, and the prior link **was an Owner sequencing choice rather than a taxonomy requirement**. Audit basis: **no primary rule** makes D-08c a prerequisite for #5 — the only text asserting it was the Q2(c) record itself; **`ts.harassment.targeted` holds `psychological safety` as a ratified interest with zero D-08c dependency**, achieving HRM-2 compliance **through its own constitutive boundary** (identifiable target, directed at the person, VP-1); and **`G02-D-08c` is formally scoped to deception / H1–H5 harm classes (§9.6), so its resolution does not establish that #5 would be unblocked.** **09g-3 governs only the H1–H5 ↔ §3.5 mapping and is merely related.** ⇒ **#5 returns to `G02-D-02a` on its own evidence.** 🚨 **Unchanged by this detachment:** the interest remains **ratified** and **input (i) is NOT reopened**; **WF-3 / HRM-1 naming remains satisfied**; the **HRM-2 rationale remains NOT independently established**; **no HRM-2 conclusion is implied in either direction**; **`G02-D-08c` remains DEFERRED, unresolved and unmodified**; **WF-2 remains unresolved** with no `Constitutive boundary`; and **no severity, envelope or new state is created**. 🚨 **Recorded as a DEFERRED-RATIONALE dependency only — NOT a severity decision, NOT a new taxonomy dependency, and NOT an assertion that `psychological safety` is an H1–H5 class.** **The formal relationship between `G02-D-08c`'s H1–H5 question and the §3.5 interest vocabulary remains UNRESOLVED and must not be inferred** (open under `G02-D-09g-3`). **`G02-D-08c` is NOT resolved by this record.** **`unwarned` remains ungrounded and must never be promoted into taxonomy vocabulary.** **No new decision ID is minted** — both inputs remain under `G02-D-02a`. ✅ **Q1 RESOLVED — OWNER APPROVED (2026-08-15): OPTION A — DEFINITION DEFECT.** The absence of an established `S1–S4` envelope for `ts.graphic.presentation` is a **defect in that policy's definition**, **NOT a property of the `RESTRICTED` disposition**. **Basis — #5 fails TWO well-formedness rules simultaneously** *(both **REPAIRED 2026-08-15** via the `viewing initiation` element (§3.3) and a restructured `Governs`; **WF-1 ✅ WF-2 ✅** now. The basis is retained verbatim per CM-3/VER-4 — Q1 = A is **unchanged and confirmed**, since a *definition* repair is exactly what closed them. **#5 is still NOT ratifiable**: ~~WF-5, WF-6 and WF-7 remain unmet~~ **⚠️ CORRECTED 2026-08-15 (Owner-authorised): `WF-5` and `WF-6` remain OPEN; `WF-7` is SATISFIED** — WF-7 tests a shared *behavior × context × harm* triple and #5 shares none with #1, which is additionally already declared `narrower than ts.graphic.presentation` (§11). **The SC-1 `relationships` field is not WF-7**; the earlier wording conflated them. *(Caveat: `ts.sexual.adult-content` is unrepaired, so a future collision assessment involving it stays open — not a present WF-7 failure.)* **WF-5 and WF-6 alone are sufficient to bar ratification under §5.** The envelope stays `OPEN`, and this decision remains OPEN.)***:* 🔴 **WF-1** — *"Every policy names ≥ 1 constitutive **behavior**"*; #5's `Governs` states **a question/determination about content** (*"**whether** intensely graphic imagery **requires** presentation handling"*), **not a constitutive behavior**. *(New finding, 2026-08-15: all 16 non-`RESTRICTED` policies state a behavior; both `RESTRICTED` policies state a question.)* 🔴 **WF-2** — *"intensely graphic imagery"* is a **topic** under **TOP-1** and therefore **cannot be a sufficient condition**; WF-2's own word for this is **"malformed"**. 🔑 **Why not B:** **SC-1 treats `disposition` and `constitutive_behavior` as separate declarations**, so `RESTRICTED` cannot determine whether a behavior is nameable; 2-of-2 `RESTRICTED` policies sharing the defect evidences **a drafting habit, not an intrinsic property**. 🚨 **What Q1 = A does NOT do:** **no severity or envelope is derived** — `severity_envelope` **remains `OPEN` under ENV-6** (*"not yet determined"*, never *"never applicable"*); **no new state is created**; **`G02-D-08c` is no longer a blocker for #5** (detached, Owner option B); **`G02-D-09g-3`, L3 §3.3, H1–H5 and `ts.sexual.adult-content` are untouched**. 🔶 **The definition is NOT repaired in this gate** — repair is a **separate gate**, because the taxonomy was already established to lack the vocabulary needed to write a safe constitutive boundary, and the L3 amendment that would supply it was declined. **Nothing else is chosen here** |
| ~~**G02-D-03**~~ | **RESOLVED — OWNER APPROVED (2026-08-15)** — taxonomy and context semantics only (§9.2, CS-5). Where age is decisive and unresolved, every state yields a **terminal non-violating** outcome: `INSUFFICIENT_EVIDENCE`, or `INDETERMINATE_CONTEXT` where the behavior itself cannot be determined. **`unknown age = violation` PROHIBITED** (CS-5.2a) and **`unknown age = adult` PROHIBITED** (CS-5.2b). `AGE_INDICATORS_SUGGEST_MINOR` is **evidence, not proof** (CS-5.3); unresolved age is a **signal, not a finding** (CS-5.4). **The legal portion remains OPEN under `G02-L-01`** — statutory minority, age and consent thresholds, reporting duties, preservation obligations, jurisdictional rules — **none asserted** (CS-5.6) |
| ~~**G02-D-04**~~ | ✅ **RESOLVED — OWNER APPROVED (2026-08-16). PERMITTED SUBJECT TO CONDITIONS.** Consensual adult content is **not prohibited merely for being adult**. 🚨 **This is not "unrestricted adult content."** The safety boundaries remain absolute and are **unaffected**: **no minors in any form** (D2, `ts.child.*`), **no non-consensual sexual content**, **no sexual exploitation**, **no sexual violence or coercion** (`ts.sexual.exploitation-nonconsent`). Presentation conditions, warnings and age-appropriate access are **policy-implementation work**, not settled here. *(Product decision, not a safety one — as this row originally stated.)* |
| **G02-D-05** | Whether a non-enforcement **care pathway** exists for self-harm disclosure, and who owns it (§9.1, OUT-3) |
| **G02-D-06** | The public-figure boundary in harassment: how much criticism attaches to a public role (§9.4) |
| **G02-D-07** | **`PROTECTED_TARGET_SET`** (§9.4.1–9.4.2). **OPEN — OWNER + LEGAL REVIEW REQUIRED**, split at this gate into **07a** and **07b**. The taxonomy defines the structural slot (**A**) and now proposes the inclusion criterion; it makes no legal claim (**C**) and the set is still empty. **`ts.hate.protected-target-abuse` is non-operational until 07b closes** |
| ~~**G02-D-07a**~~ | ✅ **RESOLVED — OWNER APPROVED (2026-08-15).** The **inclusion criterion PT-6**: *a protected-target characteristic is an attribute of personhood — something a person **is**, or an identity they hold — as distinct from a position they advocate or conduct they choose.* A **PRODUCT-POLICY TAXONOMY CRITERION**, explicitly **not** a legal definition (PT-6.1). Operational principles **PT-7…PT-13 also approved**. **PT-14 (perceived characteristics) is NOT approved** — it stays **PROPOSED — OWNER REVIEW** and is carried into 07b. Approving the criterion **did not create the set** |
| **G02-D-07b** | **OPEN — OWNER + LEGAL REVIEW REQUIRED (G02-L-04).** The **concrete membership** of `PROTECTED_TARGET_SET` under **B**, plus confirmation of **PT-14** (perceived characteristics). Candidate analysis at §9.4.2.3 is **analysis, not the set** — notably it recommends **excluding political opinion and political affiliation**, since including them would convert criticism of positions into protected-target abuse and break VP-1 |
| ~~**G02-D-08**~~ | **RESOLVED — OWNER APPROVED (2026-08-15).** Policy-relevant harm for element 3 is the **closed set H1–H5** (§9.6.3, §9.6.5): physical safety & health · financial & transactional · privacy, identity & account-security · coercion & exploitation · targeted reputational & livelihood. **No residual "other harm" category**; extension only by versioned taxonomy change **plus** separate Owner approval. Child safety **routed to D2**, sexual exploitation **routed to D3** — neither is an H class. **No H6/H7/H8.** No legal classification implied, no enforcement semantics. **H1–H5 satisfy element 3 only — a harm class is not a verdict (DEC-10)**, and **DELIBERATE DECEPTION ≠ `ts.deception.harmful`** (DEC-0) |
| **G02-D-08a** | **DEFERRED** — should **discriminatory / protected-target** harm become a class? Depends on **G02-D-07** (+ **G02-L-04**). **Not part of H1–H5**; a future taxonomy question, not a silent permanent exclusion |
| **G02-D-08b** | **DEFERRED — OWNER DECISION REQUIRED** — should a narrow **civic / public-interest** class exist, and can it hold VP-1? (+ **G02-L-06**). Only a *procedural* shape is noted, **not adopted**. **Not part of H1–H5** |
| **G02-D-08c** | **DEFERRED — OWNER DECISION REQUIRED** — can **psychological / emotional** harm be given a principled boundary? **Not part of H1–H5** |
| ~~**G02-D-08d**~~ | **RESOLVED — OWNER APPROVED (2026-08-15).** H1–H5 approved with the merges (12→H1, 5→H2, 7→H3), the two **routings** (child safety → D2, sexual exploitation → D3) and the two **exclusions** (legal/regulatory exposure, collective/societal harm) |
| **G02-D-09** | **Severity** (§7.2, §7.3). **PARTIALLY RESOLVED / OWNER APPROVED MODEL, FOLLOW-ON WORK REQUIRED.** Model approved: seven interpretive dimensions **D-a…D-g** (qualitative only — no weights, scores, formula or dimension-count rule), SEV-8…SEV-27, classes **S1–S4**, and **`SEVERITY_UNDETERMINED`** which is **not a fifth class and never S1** |
| ~~**G02-D-09a**~~ | ✅ **RESOLVED — OWNER APPROVED (2026-08-15).** **Option B** — `S1 BOUNDED · S2 SIGNIFICANT · S3 GRAVE · S4 CRITICAL`. **Semantic classes, not points** (SEV-18) |
| ~~**G02-D-09b**~~ | ✅ **RESOLVED — OWNER APPROVED.** **Immediacy belongs to risk / urgency, not severity.** A grave harm is not less grave for arriving slowly. No immediacy component inside severity |
| ~~**G02-D-09c**~~ | ✅ **RESOLVED — OWNER APPROVED.** **Likelihood / probability belongs to risk, not severity.** No probability inside severity |
| **G02-D-09d** | 🟡 **PARTIALLY RESOLVED — OWNER APPROVED (2026-08-15). 15 of 18 envelopes RATIFIED; ~~3 remain OPEN~~ → as of **2026-08-16 only #13 remains OPEN** (`G02-D-07b`); **#5** and **#11** carry **`NO_ENVELOPE`** (ENV-7).** ✅ **Ratified and authoritative** (12 ranges + 3 single-class): **#1 `S2–S3`** · #2 `S3–S4` · #3 `S4` · #4 `S3–S4` · #6 `S4` · #7 `S3–S4` · #8 `S4` · #9 `S3–S4` · #10 `S3–S4` · #12 `S2–S3` · #14 `S2–S4` · **#15 `ts.animal.cruelty` `S1–S4`** · #16 `S2–S4` · **#17 `S2–S3`** · **#18 `ts.platform.abuse-manipulation` `S1–S4`**. 🔑 **#1 and #17 were held at the first pass because their boundary arguments were UNSOUND, then re-ratified at `S2–S3` on a corrected basis.** #1's old floor conflated an identifiable *interest* with an identifiable *subject* (refuted by #18's ratified `S1` floor), and its D-f is conditional; #17's old floor asserted a materiality element the policy lacks, and its ceiling tested **only one of S4's four disjunctive routes** while **D-g — S4 route 4 — sits in its own dimensional signature**. **In both cases the argument was wrong but the envelope was the Owner's to choose; S1 and S4 are declined by judgement, not excluded by the text.** 🔶 **Still OPEN (ENV-6 — these are not envelopes):** **#5** (`G02-D-02a`), **#11** (`G02-D-02a/04`), **#13** (`G02-D-07b`). 🔑 **The two Owner bounds were CHOSEN, not derived** — **ENV-2** bars mechanical inference and **SEV-2.5** says the definition constrains plausibility without selecting; **reachability never compelled either bound**. ✅ **Finding A DISCHARGED** (`G02-D-09e` RESOLVED). *(Row history: previously read "Not ratifiable — blocked by Finding A" and "11 of them ranges" — both stale/wrong; corrected 2026-08-15.)* §9 labels remain superseded Option A vocabulary and were **not** changed |
| ~~**G02-D-09e**~~ | ✅ **RESOLVED — OWNER APPROVED (2026-08-15).** **Case-level severity is authoritative.** Policy declares a **`SEVERITY ENVELOPE`** (§7.3.6a, ENV-1…6); the **case** is assigned a class within it from its established dimensions. `SEV-2` rewritten (SEV-2.1…2.8), `SEV-20` rewritten, §7.1 table corrected. **Not a licence for risk semantics** — no probability, urgency, confidence, report volume, audience size or model score (SEV-2.8) |
| ~~**G02-D-09f**~~ | ✅ **RESOLVED — OWNER APPROVED (2026-08-15). Q2 = OPTION A — ONE SUBJECT-NEUTRAL SCALE.** The amended **S1–S4** is ratified as the **single common severity scale**; human and non-human subjects use the **same class definitions**, and **no further wording change is required to accommodate non-person subjects**. **Option B** (separate human/non-human scale) and **Option D** (interest-anchored) are **NOT adopted**; **Option C** was eliminated at Q5. **A does NOT mean different protected interests are morally equivalent, and does NOT permit protected interest to become a severity multiplier (PI-3).** **Acknowledged open concern:** incommensurable harms may occupy the same S-class — accepted as a known consequence, not a defect. **A depends on nothing further: it does not require 09g-1/2/3/5**, which remain OPEN for **WF-3 conformance** only, no longer as a severity blocker. **Severity envelopes were subsequently ratified in part at `G02-D-09d` (2026-08-15): 15 of 18 authoritative, 3 still OPEN.** *(Prior state, updated 2026-08-15 after the ratified **G02-D-09a amendment**:)* **S1–S4 no longer carry person-scoped wording.** The **8 references** were resolved as follows: **6 operative references generalised** to *"subject"* across all four classes, and the **2 illustrative Examples** (S2 c4, S3 c4) **deliberately left unchanged** (approved **A-3 = NO**). The **four person-scoped dimensions** (`D-b`, `D-c`, `D-d`, `D-f`) were generalised and **`D-g` received its ratified guard** (approved **A-2**); `D-a` and `D-e` were already subject-neutral, and **`D-a` is already interest-anchored**. Analysis: §7.3.9, §7.3.10. **Owner-resolved: Q1 = YES** (reopen and amend 09a — **done**) · **Q3 = YES** · term = **`subject`** · **A-1** = the two unspecified S4 routes **left unspecified** · **Q4 — `ts.platform.abuse-manipulation` does NOT require S4** (envelope constraint, not a defect) · **Q5 — Option C REJECTED** (hidden policy-specific semantics). **STILL OPEN — the reason this decision is not closed: Q2 (A/B/D)**, the architectural question of *what S1–S4 is anchored to*, which the amendment did **not** touch; **D additionally blocked on 09g-1/2/3/5**. ⚠️ **Consequential and NOT decided:** the wording now leaves S4 grammatically open to **non-person subjects**, so the **severity envelopes** of `ts.animal.cruelty` and `ts.platform.abuse-manipulation` were **subsequently ratified as `S1–S4` each at `G02-D-09d`** (2026-08-15) — chosen, not derived (§7.3.10) |
| **G02-D-09g** | ✅ **RESOLVED — OWNER APPROVED (2026-08-16).** The schema **does** formally declare a protected interest, executed through **09g-1 = A1-B**, **09g-2 = A2-B** and **09g-3 = A3-C**. `protected_interest` is declared **18/18**, so **WF-3 is satisfied**. *(register back-swept 2026-08-16 — **status only**, no decision made here)* ~~🔴 OPEN — OWNER DECISION REQUIRED.~~ Policy-schema question: **does the schema formally declare a protected interest, and how?** Full analysis at **§7.3.11**. **WF-3 is mandatory** (§5 preamble + HRM-1 + WF-7's identity triple) and **unmet by all 18** — no field carries it, and no existing field can substitute. Recommended **option A** (explicit field), which forces **A1** vocabulary, **A2** cardinality, **A3** reconciling the ten interests with H1–H5. **Correction:** WF-3 and WF-5 are **cumulative, not conflicting** — the earlier "disagree" framing was wrong; the defect is that WF-5 reads as *the* schema while omitting WF-3's requirement. ~~**Prerequisite for G02-D-09f option D only** — 09f can proceed under A/B/C without it~~ ✅ **MOOT — `G02-D-09f` closed at Q2 = Option A (2026-08-15).** Option D was not adopted, so **09g is no longer a prerequisite for any severity decision**; it remains OPEN for **WF-3 conformance** in its own right |
| **G02-D-09g-1** | ✅ **RESOLVED — OWNER APPROVED (2026-08-16) = A1-B** (controlled vocabulary with governed extension). *(register back-swept 2026-08-16 — **status only**, no decision made here)* ~~🔶 OPEN.~~ **Vocabulary model** (§7.3.12 Part 1). A1-A closed · **A1-B controlled + governed extension** *(recommended — mirrors the ratified H1–H5 closure model)* · A1-C structured free text · A1-D free text. **A1-A fails today** — the ten cannot express H4 |
| **G02-D-09g-2** | ✅ **RESOLVED — OWNER APPROVED (2026-08-16) = A2-B** (primary plus secondary, with the `harm-class-derived` marker). *(register back-swept 2026-08-16 — **status only**, no decision made here)* ~~🔶 OPEN.~~ **Cardinality** (Part 2). A2-A one · **A2-B primary + secondary, plus a `harm-class-derived` marker** *(recommended)* · A2-C unordered · A2-D case-level only. **Six policies need more than one interest**; `deception.harmful` is **harm-class-derived**; A2-A and A2-D break WF-3/WF-7 |
| **G02-D-09g-3** | ✅ **RESOLVED — OWNER APPROVED (2026-08-16) = A3-C** (reference H1–H5 without redefining them). *(register back-swept 2026-08-16 — **status only**, no decision made here)* ~~🔶 OPEN.~~ **Relationship to H1–H5** (Part 3). Only **H2 maps cleanly**; H1 and H3 partial; **H4 has no counterpart** (autonomy absent — only *sexual* autonomy); H5 splits one-to-many. A3-A · A3-B · **A3-C reference-not-define** *(recommended)* · A3-D. **Depends on 09g-1** |
| **G02-D-09g-4** | ✅ **SATISFIED IN FACT (2026-08-16) — machine-verified.** Never an Owner question (**F2**: an existing requirement, incompletely implemented). `content_classes` is now declared **18/18**, so **SCOPE-1 is satisfied**. *(register back-swept 2026-08-16 — **status only**, no decision made here)* ~~🔶 OPEN.~~ **Protected-interest schema vs SCOPE-1 content classes** (Part 4). **F2** — an existing requirement, incompletely implemented, **not** a prerequisite. Recommended: **two independent decisions in one conformance workstream**. No precedence invented |
| **G02-D-09g-5** | ✅ **RESOLVED — OWNER APPROVED (2026-08-16).** The §3.5 ten are **extended, not replaced or restructured**: **HRM-0** adds `health`, `autonomy` and `identity and account-security`. *(register back-swept 2026-08-16 — **status only**, no decision made here)* ~~🔶 OPEN.~~ **Treatment of the §3.5 ten values** (Part 5). **No recommendation** — evidence supports extension for H4, but the **category inconsistency** (interest *kinds* vs subject-qualified *child/animal welfare*) is a design question the evidence does not settle. Also: §3.5 **conflates harm with protected interest** (heading *Harm*, body *protected interest*) |
| **G02-D-09g-6** | 🔶 **OPEN. Registry conformance — Finding H, §7.3.12.** The gap **was** systemic: ~~WF-3 0/18 · SCOPE-1 0/18 · WF-4 14/18~~ → **corrected 2026-08-16, machine-verified: WF-3 18/18 · SCOPE-1 18/18 · WF-4 18/18** *(the remedy question itself remains OPEN and is **not** decided by this correction)*, and the **entire D2 child-safety domain is written as one-line bullets with no field structure** — the four most safety-critical policies carry the least structure. The registry predates the WF rules and **no compliance pass was ever run**. **Unblocked in principle by G02-D-09g-7**: the target record shape is now known (**SC-1**, self-contained). **Still OPEN** — remediation is a separate, separately authorised task and is **not** approved by 09g-7 (SC-8) |
| ~~**G02-D-09g-7**~~ | ✅ **RESOLVED — OWNER APPROVED (2026-08-15).** **Option A — mandatory self-contained per-policy records** (§5.1, **SC-1**). *Reason:* the **only architecture compatible with the taxonomy's current identity and version machinery** without introducing domain identity and versioning (SC-4). **No inheritance, no domain identity, no domain versioning, no dual citation, no version propagation; VER-T1, VER-T2 and WF-1…WF-9 unchanged** (SC-3). Explicitly **not** a claim that Option A is universally superior; duplication is **not** deemed intrinsically safe, and **drift is to be handled by conformance checking, never by silently introducing inheritance** (SC-5). Reconsideration only via a future versioned architecture decision establishing domain identity, domain version and historical reconstruction (SC-6). **`CS-0`/`CS-1`/`CS-2` unchanged and not copied; D2 not restructured** (SC-7) |
| **G02-D-10** | Whether `EXTERNAL_THIRD_PARTY` content is in v1 scope, given TappyAI often cannot remove it (§13) |
| **G02-D-11** | Whether the taxonomy is expressed as **data** per [`PRECEDENT_POLICY_AS_DATA.md`](PRECEDENT_POLICY_AS_DATA.md) (Source / Provider / Engine, serialisable, no executable member) or as prose only. Affects Groups 06 and 13 substantially**🔶 STILL OPEN — this row is not decided by the note that follows.** *(Audit evidence recorded 2026-08-16, **not** a decision. A Source / Provider / Engine implementation exists in the repository at `src/lib/policy/` and was verified against this corpus: **216/216 declarations byte-identical**, every typed value independently re-derivable from its own corpus text, **no enforcement vocabulary**, and `PROTECTED_TARGET_SET` still BLOCKED. So the **implementation adds no policy semantics** — but that answers only *whether it is faithful*, never *whether it is authorised*. Both alternatives this row names remain open, `PRECEDENT_POLICY_AS_DATA.md` is explicitly **"PRECEDENT, NOT A COMMITMENT"**, §22 still reads **"implementation remains NOT AUTHORIZED"**, and §5.1’s **Engineering Owner (Policy Platform)** — accountable for "technical contracts and their faithful implementation" — is **unassigned**. Deleting `src/lib/policy/` restores the prose-only state exactly; the corpus is unchanged by the implementation either way.)* |

Not re-opened: **B-1**…**B-5** and **G01-D-19** are ratified. **G01-D-05**
(AI-assisted accountability) and **G01-D-06** (anonymous actors) remain open in
Group 01 and are **not** pre-empted here.

---

## 21. Legal review required

**No statutory obligation is asserted anywhere in this document** (Group 01
LG-2). No age threshold, no legality determination, no jurisdictional rule.

| ID | Question |
|---|---|
| **G02-L-01** | **Child safety, entire domain** (§9.2): definitions, age determination, evidence handling, preservation, and any reporting question. Named as questions **without asserting that such duties exist** |
| **G02-L-02** | Sexual content: age-related legal aspects, non-consensual imagery, applicable definitions (§9.3) |
| **G02-L-03** | Where illegality is an element — dangerous activity, animal welfare, regulated goods (§9.1, §9.5) |
| **G02-L-04** | Whether any protected-characteristic set is legally determined in Vietnam, or is purely a platform policy choice (§9.4, G02-D-07) |
| **G02-L-05** | Privacy and personal information: applicable obligations and their interaction with evidence retention (§9.4, Group 01 G01-L-04) |
| **G02-L-06** | Vietnam-specific obligations touching political, historical or religious content, and whether any jurisdictional variant is required (§14, VN-6) |
| **G02-L-07** | Cross-border applicability if content, users or reviewers span jurisdictions (Group 01 G01-L-07) |
| **G02-L-08** | *(added at the G02-D-08 gate)* **H4 coercion and exploitation harm** — trafficking-adjacent questions, and whether any mandatory reporting or preservation duty attaches. Named as a **question**; **no duty is asserted to exist** (§9.6.3 H4) |

---

## 22. Status

> # GROUP 02 POLICY TAXONOMY IS NOT RATIFIED.

`POLICY ARCHITECTURE → GROUP 02 POLICY TAXONOMY → DRAFTED → SELF-AUDITED → OWNER REVIEW REQUIRED`

Group 01 — Governance remains 🟢 **RATIFIED**. Group 03 is **NOT STARTED** and
must not be drafted. Technical contracts and implementation remain **NOT
AUTHORIZED**.
