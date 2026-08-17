# TappyAI Trust & Safety — Group 01: Governance

> # GROUP 01 — GOVERNANCE · STATUS: RATIFIED
>
> **RATIFIED by the Owner on 2026-08-15.** The decisions in this document are
> authoritative for TappyAI Trust & Safety.
>
> Ratification is of the **governance model only**. It does not authorise
> technical contracts, and it does not authorise implementation: no runtime
> code, no schema, no migration, no API, no worker, and no change to
> Controller V2 is proposed or permitted by this document.

**Project:** TappyAI Policy / Trust & Safety · **Group:** 01 — Governance
**Version:** 1.0 · **Status:** ✅ **RATIFIED** (Owner, 2026-08-15)
**Date:** 2026-08-15 · **Base commit:** `906c254` · **Map:** [`00_TRUST_AND_SAFETY_ARCHITECTURE_MAP.md`](00_TRUST_AND_SAFETY_ARCHITECTURE_MAP.md)

**Lifecycle position:** `POLICY ARCHITECTURE → GROUP 01 GOVERNANCE → DRAFTED → SELF-AUDITED → OWNER REVIEW → REQUIRED REVISION (AP-8) → SELF-AUDITED → G01-D-19 RESOLVED → **RATIFIED**`

**Ratification record**

| | |
|---|---|
| Ratified by | Owner (Product / Company Governance Authority, §5.1) |
| Date | 2026-08-15 |
| Version | 1.0 |
| Authoritative decisions | **B-1** … **B-5** (§2.1, §10, §15, §2.4, §4.3) |
| Revisions made during review | **AP-8** rewritten (§11, §11.1); **PROP-1** rewritten (§10.5) under **G01-D-19** |
| G01-D-19 | **RESOLVED — OWNER APPROVED** |
| Still open | **G01-D-05 … G01-D-18** (§24) and **G01-L-01 … G01-L-07** (§25). Ratification does **not** close them |
| Next phase | Group 02 — Policy Taxonomy. **NOT STARTED**, requires separate Owner instruction |

---

## 1. What this document is

Governance is the document that says **who may decide what, by what process, and
what happens when two answers disagree.** It deliberately contains no policy
rules, no violation categories, no thresholds, and no mechanisms. Those are
Groups 02–16 and are listed as non-goals in §22.

It exists first because every later group inherits its answers. A taxonomy
without an owner is a suggestion; an enforcement ladder without an authority
model is a list of buttons.

Decisions **B-1** through **B-5** were made by the Owner on 2026-08-15 and are
treated here as settled inputs, realised in §2, §10, §15, §2.4 and §4.3
respectively. Everything still open is marked **OPEN — OWNER DECISION REQUIRED**
or **OPEN — LEGAL REVIEW REQUIRED** and collected in §24 and §25. Nothing
unknown is silently resolved.

---

## 2. Authority

### 2.1 The governance tree (B-1)

```
TappyAI Product / Company Governance
│
├── Controller / Security Governance
├── Backoffice Governance
└── Trust & Safety Policy Governance
    ├── Content Safety
    ├── User Safety
    ├── Moderation
    ├── Appeals
    ├── Evidence
    └── Compliance
```

The three branches are **peers**. None is subordinate to another. Each is
answerable upward to TappyAI Product / Company Governance, which is the only
authority able to resolve a conflict between them (§18).

### 2.2 `docs/policy/` is the authoritative domain for Trust & Safety

**AUTH-1.** `docs/policy/` is the authoritative documentation domain for TappyAI
Trust & Safety policy. A T&S question is answered here or it is not yet
answered.

**AUTH-2.** No document outside `docs/policy/` establishes, amends or overrides
T&S policy, regardless of that document's own claims about its supremacy.

**AUTH-3.** T&S governance does not extend beyond its subject matter (§4). It
does not govern the Back Office platform, the Controller, security architecture,
product features, or engineering practice generally.

### 2.3 Relationship to the Back Office Constitution

`docs/backoffice/00_Constitution.md` (v1.1, APPROVED) declares itself *"the
supreme governing law of the TappyAI Back Office Platform"* and states that it
*"overrides any conflicting instruction, memory, or preference."*

That claim is **accepted in full within its own domain** and **does not extend
to Trust & Safety policy**. It is supreme over the Back Office Platform; T&S is
not the Back Office Platform. Where T&S policy is delivered *through* Back
Office tooling, the Constitution governs the tooling and this domain governs the
policy the tooling applies.

Two consequences, stated so they are not rediscovered later:

- A change to Back Office documentation cannot change T&S policy.
- A T&S policy decision that requires a Back Office UI change does not
  authorise that change; it raises a dependency for Back Office governance,
  which follows its own ADR process.

### 2.4 Relationship to `docs/backoffice/11_Moderation.md` (B-4)

Preserved as **prior design input**. Not deleted, not authoritative, not
promoted. It is `DRAFT — Awaiting Owner Approval` (v1.0, 2026-07-13) and has
never been built: at `906c254`, `moderation_queue` and `moderation_actions`
appear in no migration, moderation appears in `src/` only in i18n strings and
one navigation test, and the only report endpoint in the API is
`music/tracks/[id]/report`.

Its core principle — **"AI assists. Humans decide."** — is adopted here in the
refined form set out in §10, which resolves the contradiction between its §2 and
its §11 rather than inheriting it.

After ratification of the relevant groups, compatible concepts may be
superseded, consolidated or migrated from it. Until then it is read as history.

### 2.5 Relationship to Controller / Security Governance

T&S **depends on** the Controller. It is not **subordinate to** it. Dependency
is not authority.

- T&S determines *what ought to be enforced and on what basis*.
- The Controller determines *whether the requesting actor is authorised, and how
  the action is executed safely, idempotently, audibly, and observably*.

The Controller may refuse to execute an enforcement action on authorisation or
safety grounds. That refusal is **not** an override of policy — it is a
different question answered by its rightful owner. The policy decision stands
and becomes an unexecuted decision requiring escalation (§18).

**AUTH-4.** No document in `docs/policy/` may propose a change to Controller V2
(C1–C11). Where a T&S requirement appears to need one, the document records it
as a **Controller dependency**, names it, and stops. Resolution belongs to
Product / Company Governance and Controller governance jointly.

### 2.6 Authority hierarchy of artefacts

When two artefacts disagree, the higher rank prevails. Rank is by *kind*, not by
recency or detail.

| Rank | Artefact kind | Example |
|---|---|---|
| 1 | Product / Company Governance decision | An Owner ratification |
| 2 | **T&S Governance** (this document, ratified) | Authority, lifecycle, proportionality |
| 3 | Ratified T&S policy definitions | Taxonomy, per-category policy (Group 02+) |
| 4 | Ratified T&S technical contracts | Decision record contract, evidence contract |
| 5 | Operational procedures / runbooks | Reviewer handbooks, queue procedure |
| 6 | Models, detectors, thresholds | Classifier versions, tuned parameters |
| 7 | Implementation, configuration, code | Services, jobs, clients |

**AUTH-5.** A lower-ranked artefact never amends a higher-ranked one. A code
comment, a configuration value, a threshold change, a model release, or a
runbook edit **cannot** alter policy. Where implementation and policy disagree,
**the implementation is defective** — it is not evidence that the policy
changed.

**AUTH-6.** Silence at a higher rank is not permission at a lower one. Where
policy has not spoken, implementation must escalate rather than choose.

---

## 3. Separation of concerns — the seven roles

These seven answer different questions. Collapsing any two is an architectural
defect, and the failure mode of each collapse is stated because that is what
makes the boundary enforceable rather than decorative.

| Role | Answers | Must not decide | Failure mode if collapsed |
|---|---|---|---|
| **POLICY** | What content or behaviour violates a rule? | What a detector can measure; what a system will do about it | Policy written around what today's classifier happens to detect — the tool defines the rule |
| **MODEL** | What signals or predictions can be produced, and with what reliability? | Whether something is a violation; what happens next | A model release silently changes policy semantics with no policy decision |
| **POLICY ENGINE** | How do policy definitions evaluate available signals and context? | The rules themselves; the models; the enforcement | Rules become code, unreadable to the people accountable for them |
| **DECISION** | What decision resulted — with what confidence, severity, risk, evidence and provenance? | Whether it is authorised; how it executes | An outcome exists with no record of why, so it cannot be reviewed, appealed or explained |
| **CONTROLLER V2** | Is this enforcement authorised, and how is it executed safely, idempotently, audibly, and emitted as an event? | Whether the content violates policy | Authorisation logic starts making safety judgements, or policy starts asserting authority it does not have |
| **HUMAN REVIEW** | Should a trained reviewer resolve this high-risk, high-impact, uncertain or legally sensitive case? | Legal interpretation; policy amendment | Review becomes a rubber stamp on automation, or reviewers invent policy case by case |
| **LEGAL REVIEW** | What legal interpretation or compliance determination requires qualified legal authority? | Product policy generally; individual routine cases | The platform makes legal claims it is not qualified to make (§15) |

**SEP-1.** A single component may implement more than one role only if the
boundary remains observable — each role's inputs, outputs and version are
separately identifiable in the decision record (§12).

**SEP-2 — Separation of policy from enforcement execution.** Deciding that an
action *should* occur and *causing* it to occur are distinct steps with distinct
records. A policy decision is not self-executing. This is what makes it possible
to review a decision that was never executed, and to detect an execution that no
decision authorised.

**SEP-3 — Separation of policy from model.** Policy version and model version
are independent (§14). Neither implies the other.

---

## 4. Scope

### 4.1 Subject matter

Trust & Safety governs **content and behaviour within the TappyAI platform** —
what users and the system publish, send, and do, and what the platform does in
response.

### 4.2 Surfaces

Policy applies coherently across **Web, Android, iOS, backend services, and
moderation operations** (§17). A surface is in scope regardless of whether a
client for it exists yet.

### 4.3 Content classes (B-5)

T&S scope **includes AI-generated and AI-assisted content**. These classes are
distinguished at the architecture level because they do not share the same
accountability, and must not be assumed to share policies, thresholds or
evidence requirements.

| Class | Description | Why it differs |
|---|---|---|
| **UGC** | Created by a user | The user is accountable; enforcement against the user is meaningful |
| **AI-Generated** | Produced by TappyAI's models | **TappyAI is accountable.** Enforcing against a user for what the platform generated would be wrong. The remedy is suppression, correction and model governance |
| **AI-Assisted** | User-directed, model-produced | Accountability is shared and **not yet apportioned** |
| **Mixed** | Contains more than one class | Needs a rule for which class governs |
| **External / Third-Party** | Not authored on the platform (links, embeds, imported media) | May be unremovable by TappyAI; the remedy is typically presentation-level, and this is the class `scam-shield` already addresses (§4.5) |

**SCOPE-1.** Every policy in Groups 02+ must state which content classes it
applies to. A policy silent on class is incomplete.

**OPEN — OWNER DECISION REQUIRED (G01-D-05):** how accountability is apportioned
for **AI-Assisted** content, and which class governs **Mixed** content. This is
a genuine product-and-ethics question, not a detail, and Groups 02, 04, 09 and
13 all inherit the answer.

### 4.4 Subjects who are not accounts

Policy must contemplate actors without a durable identity — anonymous and
pre-authentication users. TappyAI supports anonymous chat, so this is present
reality, not hypothesis.

**OPEN — OWNER DECISION REQUIRED (G01-D-06):** whether and how T&S policy
applies to anonymous actors, given that most enforcement instruments assume a
durable account.

### 4.5 Boundary with Scam Shield

`src/lib/scam-shield/` is production architecture with providers, a circuit
breaker, weighted scoring, score-to-level mapping, an action engine, an evidence
engine, and a confidence derived from actual provider coverage.

**Its architectural patterns are a legitimate precedent. Its semantics are
not.** Scam Shield protects a user *from external threats*; T&S governs content
and behaviour *within the platform*. Advising a user carries no due-process
burden. Enforcing against a user carries all of it. Any reuse must be a
deliberate architectural decision in the relevant group, never an inheritance.

One element is directly relevant to later groups and worth naming: Scam Shield
separates *score* from *confidence given how much provider coverage actually
completed*. A decision made while detectors were unavailable is not the same
decision, and T&S must be able to say so (§12, §10).

---

## 5. Ownership and decision rights

### 5.1 Roles

Role-based, never personal. Only one role is already established in the
repository; every other is unassigned.

| Role | Accountable for | Status |
|---|---|---|
| **Product / Company Governance Authority** | Final authority; cross-domain conflicts; ratification | **ESTABLISHED** — the Platform Owner is a constitutional principal in C1/C2, enforced as a database invariant and deliberately absent from the role enum |
| **Trust & Safety Policy Owner** | This domain; policy ratification; taxonomy; proportionality | **OWNER ASSIGNMENT REQUIRED** |
| **Moderation Operations Owner** | Review operations, quality, reviewer wellbeing, staffing | **OWNER ASSIGNMENT REQUIRED** |
| **Engineering Owner (Policy Platform)** | Technical contracts and their faithful implementation | **OWNER ASSIGNMENT REQUIRED** |
| **Security Owner (Controller)** | Controller V2; authorisation; execution safety | **OWNER ASSIGNMENT REQUIRED** (the domain exists and is closed; its ongoing owner is unnamed) |
| **Legal Reviewer** | Legal interpretation and compliance determination (§15) | **OWNER ASSIGNMENT REQUIRED** — qualified legal authority, may be external |
| **Privacy / Data Protection Owner** | Minimisation, retention, evidence access, legal hold (§13) | **OWNER ASSIGNMENT REQUIRED** |
| **Model Owner** | Detector and classifier lifecycle, evaluation, versioning (§14) | **OWNER ASSIGNMENT REQUIRED** |
| **Appeal Authority** | Final decision on appeals, independent of the original decision (§11) | **OWNER ASSIGNMENT REQUIRED** |
| **Incident Commander** | Emergency authority during a declared incident (§8, §16) | **OWNER ASSIGNMENT REQUIRED** — a standing role activated on declaration, not a permanent post |

**OWN-1.** Until a role is assigned, its decisions escalate to the Product /
Company Governance Authority. Unassigned is not unowned; it is *concentrated*,
and concentration is a bottleneck, not a governance model.

**OWN-2.** One person may hold several roles, **except** the separations
required in §11 (appeal independence) and §5.3.

### 5.2 Reviewer authority does not exist today — a Controller dependency

A `moderator` role **does** exist in the production `admin_role` enum
(`super_admin`, `admin`, `moderator`, `analyst`). But of the 18 permissions in
the C3 registry at `906c254`, `moderator` holds exactly **four**, all read-only
and all identical to `analyst`: `dashboard.home.view`, `analytics.auth.read`,
`analytics.activation.read`, `analytics.content.read`. **No permission in the
registry concerns content, reports, review, enforcement or appeals.**

So the role name exists and the authority does not.

**DEP-C-01 — Controller dependency.** Any real reviewer or enforcement authority
requires new permissions in the C3 registry. That is a Controller V2 change,
which this domain **may not make and does not propose** (AUTH-4). It is recorded
here as a dependency for Product / Company Governance and Controller governance
to resolve jointly, at the time the relevant group is ratified — not now.

**OWN-3.** T&S defines *what authority is needed and why*. It never defines
*how authority is granted*. Reviewer authority comes from C3/C4 or it does not
exist.

### 5.3 Decision rights

| Decision | Proposes | Decides | Must be consulted |
|---|---|---|---|
| Ratify or amend this Governance document | T&S Policy Owner | **Product / Company Governance Authority** | Security, Legal, Engineering |
| Ratify a policy definition or taxonomy change | T&S Policy Owner | T&S Policy Owner | Moderation Ops, Legal (if sensitive), Model Owner |
| Ratify a technical contract | Engineering Owner | Engineering Owner + T&S Policy Owner | Security Owner |
| Approve a model or detector version change | Model Owner | Model Owner | T&S Policy Owner (§14) |
| Change a threshold | Model Owner | T&S Policy Owner | Model Owner, Moderation Ops |
| Individual enforcement decision | Automation or reviewer | Per §9, §10 | — |
| Individual appeal outcome | Appeal reviewer | **Appeal Authority** (independent, §11) | Legal (if sensitive) |
| Emergency policy change | Incident Commander | Incident Commander, ratified after (§8) | T&S Policy Owner, Legal |
| Legal interpretation | Anyone | **Legal Reviewer only** (§15) | — |

**Threshold changes are decided by the T&S Policy Owner, not the Model Owner.**
A threshold is where a measurement becomes a consequence — that is a policy act
performed on a technical artefact, and putting it under model ownership is how
policy silently drifts.

---

## 6. Policy lifecycle

Conceptual. Not implemented by this document.

```
DRAFT → SELF-AUDIT → OWNER REVIEW → RATIFICATION → VERSIONED ACTIVE POLICY
      → MONITORED → REVIEWED → AMENDED / SUPERSEDED → RETIRED
```

| Transition | Performed by | Requires |
|---|---|---|
| → DRAFT | Any contributor | A stated scope |
| → SELF-AUDIT | Author | Audit against this document's boundaries; unknowns marked OPEN, never resolved silently |
| → OWNER REVIEW | Author | A complete draft plus its self-audit and its open questions |
| → RATIFICATION | T&S Policy Owner; this document by Product / Company Governance | Open items closed or explicitly accepted as open |
| → VERSIONED ACTIVE | T&S Policy Owner | A version identifier and an effective date |
| → MONITORED | Moderation Ops + Model Owner | Agreed observation, including false-positive and false-negative signal |
| → REVIEWED | T&S Policy Owner | A scheduled or triggered review |
| → AMENDED / SUPERSEDED | T&S Policy Owner | A new version; the prior version retained (§20) |
| → RETIRED | T&S Policy Owner | A stated end date and disposition of decisions made under it (§21) |

**LC-1.** A policy is enforceable only in **VERSIONED ACTIVE**. Drafts do not
bind, and no decision may cite a policy that was not active at the time of the
conduct.

**LC-2.** Retirement never invalidates decisions correctly made under the policy
while it was active. Whether such decisions are *revisited* is a separate,
explicit act (§21).

**OPEN — OWNER DECISION REQUIRED (G01-D-07):** the review cadence — how often an
active policy must be reviewed absent a trigger.

---

## 7. Approval, ratification and versioning authority

**VER-1.** Every ratified policy artefact carries a **version identifier**, an
**effective-from** and, where applicable, an **effective-to**. An artefact
without these cannot be cited in a decision record.

**VER-2.** The **T&S Policy Owner** is the sole versioning authority for T&S
policy artefacts. Not engineering, not operations, not a deployment.

**VER-3.** Policy version is **independent of** software release. A deploy does
not change policy; a policy change does not require a deploy. If the two are
coupled in implementation, that coupling is a defect to be recorded, not a
governance fact.

**VER-4.** Prior versions are **retained, not overwritten**. A decision made
last month must remain explainable by the text that was in force last month.
This is the governance requirement behind the decision-record obligations in
§12, and it is the same discipline the domain-neutral precedent
[`PRECEDENT_POLICY_AS_DATA.md`](PRECEDENT_POLICY_AS_DATA.md) identifies: rules
that can change need lifecycle metadata and a recorded version, or past
decisions become unexplainable.

**VER-5.** Ratification is explicit and recorded. Absence of objection is not
ratification.

---

## 8. Emergency policy changes

An emergency mechanism exists for an active safety threat, coordinated abuse, a
major exploit, a legal emergency, or a platform-wide harmful-content event.

**EM-1.** Declared by the **Incident Commander**. Declaration itself is recorded.

**EM-2.** An emergency change is **temporary by construction**. It carries an
expiry at the moment it is made. It does not become permanent by inattention.

**EM-3.** Every emergency action preserves, at the time it is taken:
**authority** (who), **reason** (why), **timestamp**, **scope** (what and
whom), **policy version or change identifier**, and an **audit trail**.

**EM-4.** Emergency authority may **broaden containment**; it may **not** create
new irreversible enforcement powers, and it may not lower the evidence
requirement for permanent termination (§10).

**EM-5.** Mandatory **post-incident review** by the T&S Policy Owner, plus
Legal where the trigger was legal. The review either ratifies the change through
the normal lifecycle, amends it, or lets it expire. Failure to review is itself
an incident.

**EM-6.** Emergency process is **not a governance bypass**. Repeated use for the
same cause is evidence that normal governance is too slow, and the remedy is to
fix normal governance.

**OPEN — OWNER DECISION REQUIRED (G01-D-08):** the maximum duration of an
emergency change before it must expire or be ratified, and who may extend it.

---

## 9. Human review authority

**HR-1.** Human review is **mandatory** for cases that are high-risk,
high-impact, high-uncertainty, or legally sensitive. These bands are defined
qualitatively here and quantitatively in later groups (§22).

**HR-2.** Reviewers decide **individual cases**. They do not amend policy. A
reviewer who believes the policy is wrong records that and escalates; case-by-case
reinterpretation is how a policy quietly becomes unwritten.

**HR-3.** Reviewers may **overturn or decline** an automated recommendation
without needing to justify the automation's failure. The recommendation is
advisory input, not a default requiring rebuttal.

**HR-4 — Independence.** A reviewer must be able to reach the correct outcome
against the automated recommendation without adverse consequence. Reviewer
quality is never measured by agreement rate with automation, because that metric
converts review into ratification.

**HR-5.** Reviewer capacity is a governance constraint, not an implementation
detail. A policy whose mandatory-review volume exceeds review capacity is not
enforceable as written, and must be changed rather than quietly under-enforced.

**HR-6.** Reviewer wellbeing is a governance responsibility of the Moderation
Operations Owner. Exposure to harmful material is a foreseeable occupational
harm of this architecture, and later groups must treat it as a design input.

**OPEN — OWNER DECISION REQUIRED (G01-D-09):** whether human review is performed
by TappyAI personnel, contracted reviewers, or both — this materially affects
§13 access boundaries and §15.

---

## 10. Enforcement authority and proportionality (B-2)

### 10.1 The posture

Neither extreme is adopted. "AI can never act" is rejected as unworkable at
scale; "confidence above a number causes permanent deletion" is rejected as
unjust.

**The governing axis is reversibility.**

> **The lower the certainty, the more reversible the action must be.
> The more permanent the action, the higher the evidence and authority required.**

Thresholds and evidence requirements move in **opposite directions** along the
permanence axis. Containment is cheap to enter and cheap to exit. Permanence is
expensive to reach, by design.

### 10.2 Reversibility classes

Conceptual, ordered by what the affected person loses.

| Class | Nature | Example character |
|---|---|---|
| **R0** | No user-visible effect | Internal signal or flag only |
| **R1** | Fully reversible, no lasting record against the user | Interim containment or quarantine pending review |
| **R2** | Reversible but materially adverse | Content hidden; a feature restricted; a temporary suspension |
| **R3** | Irreversible or effectively permanent | Permanent removal; permanent termination of an account |

### 10.3 Governance invariants

| | Invariant |
|---|---|
| **GA-1** | Automated authority **decreases** as reversibility decreases. Bounded automated action is permissible in the low-risk, high-confidence band; it is never permissible at **R3**. |
| **GA-2** | **No automated path to R3 exists.** Irreversible enforcement always requires human authority, and this cannot be waived by confidence, volume, or emergency (EM-4). |
| **GA-3** | **No single signal source is sufficient for R3** — not one user report, not one classifier, not one reviewer acting alone where §11 requires independence. |
| **GA-4** | Automated action must be **time-bounded and self-expiring**. Containment that does not expire is enforcement wearing a softer name. |
| **GA-5** | Every automated adverse action **creates a review obligation**, not merely a record. An unreviewed automated action must surface as a backlog, never lapse into a settled outcome. |
| **GA-6** | High risk, high impact, high uncertainty, or legal sensitivity ⇒ **mandatory human review** (HR-1), regardless of confidence. |
| **GA-7 — Escalation asymmetry** | Automation may freely escalate *toward containment* and *toward human review*. It may never escalate *toward permanence*. |
| **GA-8** | Every adverse action against a person must have a **reachable human path** — notice and appeal (§11). |
| **GA-9** | Uncertainty resolves **toward containment, not toward permanence**. Where the system does not know, it must choose the reversible option. |
| **GA-10** | Detector unavailability is **not** evidence of safety, and it is **not** evidence of violation. Degraded coverage lowers confidence and must move the decision toward review (§4.5). |

### 10.4 Explicitly rejected

Each of these is prohibited as a governance matter, not merely discouraged:

- one user report → permanent termination
- confidence score alone → permanent termination
- keyword or simple content match → permanent termination
- **any** automated irreversible enforcement without sufficient evidence and human authority
- accumulating reversible actions into a permanent one without a distinct, evidenced, human decision

### 10.5 Proportionality

Enforcement must be proportional to **severity, confidence, evidence, context,
legitimately relevant history, impact, and uncertainty** — with uncertainty
reducing severity of response, never increasing it.

**PROP-1 — Non-prejudice.** History is relevant only where legitimately so, and
only where it was itself correctly decided. **Overturned decisions must not
prejudice the person in future enforcement decisions, but the original decision
and its audit and evidence history must remain preserved. A successful appeal
changes the enforcement outcome; it does not erase the historical record**
(AP-8, §11.1).

**NON-PREJUDICE ≠ DELETION.** Non-prejudice governs how history may be *used*;
it never governs whether history is *kept*. An overturned decision is excluded
from forward-looking proportionality and escalation judgements and remains
intact in the authoritative audit history (EV-3, AU-4).

**PROP-2.** The **least restrictive effective action** is the default. Choosing
a more restrictive action requires a stated reason.

**No numeric thresholds are defined here.** They belong to later groups (§22).

---

## 11. Appeals governance

**Appeals are mandatory architecture. They are not deferred, and they are not
"future work."** `docs/backoffice/11_Moderation.md` §9 deferred them; that
deferral is not adopted. A system able to suspend an account without a defined
path to reversal is not finished.

| | Requirement |
|---|---|
| **AP-1** | A **right to appeal** exists for adverse actions against a person. Its precise boundary is G01-D-10. |
| **AP-2** | **Notice precedes appeal.** A person cannot appeal what they were not told. Notice states what happened, the policy basis, and how to appeal — at a level of detail that does not itself become an evasion manual (G01-D-11). |
| **AP-3 — Independence.** | The appeal decision is **not** made by the person or the automation that made the original decision. Independence is structural, not attitudinal. |
| **AP-4** | **Evidence is preserved** for the appeal window and throughout an open appeal. An appeal cannot be defeated by deletion, and this obligation interacts with retention and erasure rights (§13, G01-L-04). |
| **AP-5** | **Final decision authority** rests with the Appeal Authority. |
| **AP-6** | Appeals have a **defined time expectation**, both for the person appealing and for the platform. Indefinite is not a service level (G01-D-12). |
| **AP-7 — Traceability.** | Every appeal records the policy id and version the original decision cited, and the version in force at appeal time. A policy change between the two must be visible, and its effect on the outcome stated. |
| **AP-8 — Reversal is not erasure.** | A successful appeal **reverses or rescinds the active enforcement outcome where appropriate, while preserving the original decision, evidence, reviewer actions, appeal record, and final disposition in the authoritative audit history.** **Active enforcement state and audit history are different things** and a successful appeal acts on the first, never on the second. See §11.1. |
| **AP-9** | Appeal outcomes are a **governance signal**, not just a customer-service metric. A sustained overturn rate in a category is evidence the policy or its detection is wrong, and must trigger review (§6). |

### 11.1 AP-8 in detail — active enforcement state is not audit history

Two distinct concepts, routinely conflated, and conflating them is how a
platform either fails to give a person their remedy or destroys the record of
how it treated them.

- **Active enforcement state** — what is true about this person or this content
  *right now*: whether an account is restricted, whether content is hidden,
  what the current disposition is. This is a **present-tense state**, and a
  successful appeal is precisely the act of changing it.
- **Audit history** — what happened, and when, and on what basis. This is an
  **immutable record of the past**. An appeal is an *event in* that history, not
  an eraser applied to it.

Conceptual state model:

```
Original decision
  → Enforcement
    → Appeal
      → Successful appeal
        → Enforcement    = REVERSED / RESCINDED   (active state changes)
        → Audit history  = PRESERVED              (record is added to, never removed)
```

**A successful appeal MAY change:**

- current enforcement status
- current content or account restriction
- current user-visible outcome
- final disposition

**A successful appeal MUST NOT delete:**

- the original decision, and its `decision_id`
- `policy_id` and `policy_version`
- `model_version`
- the original evidence
- reviewer actions
- the appeal submission
- the appeal review
- the final appeal result
- timestamps
- audit events
- legally relevant preservation metadata, where applicable

**AP-8.1 — Reversal ≠ erasure.** Rescinding an enforcement outcome and deleting
the record of it are different acts. Only the first is an appeal remedy. The
second would destroy the platform's ability to explain, review in aggregate
(AU-5), detect systematic error (AP-9), or answer for its own conduct — and it
would defeat a preservation obligation that may apply (§13, G01-L-04).

**AP-8.2 — Consistency with EV-3.** This is the same discipline §12 already
requires of every decision record: append-only in effect, corrections recorded
as new records referencing the prior, never as edits. A reversal is a **new
authoritative event that supersedes the enforcement outcome**, not a
modification of the original decision.

**AP-8.3 — Non-prejudice.** Where a decision has been overturned, it must not
count against the person in any later proportionality or escalation judgement
(§10.5). Non-prejudice is a rule about **how history may be used**, not a
licence to delete it. See the discrepancy reported against PROP-1 in §23.2.

**No storage schema, retention rule or implementation is defined here** (§22).
This is the governance requirement a later contract must satisfy.

**OPEN — OWNER DECISION REQUIRED (G01-D-10):** which actions carry a right of
appeal — all adverse actions, or those at R2 and above.
**OPEN — OWNER DECISION REQUIRED (G01-D-11):** how much detail notice discloses,
balancing due process against evasion.
**OPEN — OWNER DECISION REQUIRED (G01-D-12):** appeal time expectations.
**OPEN — OWNER DECISION REQUIRED (G01-D-13):** whether appeal is available to
anonymous actors (§4.4), who may have no channel to receive notice.

---

## 12. Evidence and audit governance

### 12.1 Requirements

A meaningful moderation decision must be **explainable after the fact, by
someone who was not present when it was made.** That is the whole purpose.

Governance requires that a decision record be capable of carrying: content
identity (such as a hash), decision id, policy id, **policy version**, model and
detector **versions**, the signals relied on, extracted evidence, timestamps,
reviewer identity where applicable, the enforcement applied, appeal history,
final result, retention metadata, legal-hold state, and the audit trail.

**No storage schema is defined here** (§22). This is the governance requirement
that a later contract must satisfy.

### 12.2 Invariants

| | Invariant |
|---|---|
| **EV-1** | A decision without a recorded policy version is **not explainable** and must not be treated as sound. |
| **EV-2** | Provenance is mandatory: every decision distinguishes what was **measured**, what was **inferred**, and what was **judged by a human**. |
| **EV-3** | Decision records are **append-only in effect**. Corrections are new records referencing the prior, never edits. |
| **EV-4** | Confidence and **coverage** are recorded together. A decision taken with detectors unavailable must say so (GA-10). |
| **EV-5** | Absence of evidence is recorded as absence, never as a negative finding. |
| **EV-6** | The evidence sufficient to *contain* is not the evidence sufficient to *terminate* (§10). Records must make clear which standard was met. |

### 12.3 Relationship to C7 and the limits of the claim

Controller V2 **C7** provides a tamper-evident hash-chained `audit_log` in
production, and it is the natural substrate for the audit trail. Using it is a
**Controller dependency** (AUTH-4), not a decision this document makes.

**EV-7 — No legal-admissibility claim.** Tamper-evidence is a technical
property. **It does not establish that any record is legally admissible
evidence in any jurisdiction, and this architecture makes no such claim.**
Admissibility is a legal determination (§15, G01-L-03).

---

## 13. Privacy governance

| | Requirement |
|---|---|
| **PR-1 — Minimisation** | Collect and retain only what the decision and its appeal require. Evidence collection is not intelligence gathering. |
| **PR-2 — Purpose limitation** | Evidence gathered for a safety decision is used for that decision, its appeal, and legitimate oversight. It is **not** repurposed for product analytics, personalisation, model training, or marketing without an explicit, separately governed decision (G01-D-14). |
| **PR-3 — Access control** | Access to evidence is role-bound and least-privilege. Reviewers see what the case requires, not the user's life. Access to evidence is itself auditable. |
| **PR-4 — Retention discipline** | Every evidence class has a defined retention period and a defined disposition. "Indefinite" is a decision requiring justification, not a default. |
| **PR-5 — Legal hold** | Legal hold suspends deletion for identified material, is explicitly scoped and time-bound, and is itself recorded and reviewable. |
| **PR-6 — Sensitive evidence** | Some material is harmful to store and harmful to view. Its handling, minimisation and access are stricter, and the tension with EV-1's explainability requirement must be resolved deliberately, per class, in later groups. |
| **PR-7 — Reviewer access boundaries** | Reviewer access is scoped to assigned cases, time-bound, and logged. Bulk or exploratory access is a privileged, separately authorised act. |
| **PR-8 — Reporter identity** | Reporter identity is sensitive. Whether it is disclosed to the reported party, and to reviewers, is G01-D-15. Retaliation is a foreseeable harm. |

Two existing documents cover adjacent ground and must be reconciled in Group 12,
not here: `docs/backoffice/33_Privacy_Data_Governance.md` and
`docs/backoffice/34_Data_Retention_Policy.md`.

**OPEN — LEGAL REVIEW REQUIRED (G01-L-04):** the interaction between evidence
retention, legal hold, and any user right to deletion or erasure that may apply.
These conflict by construction, and the resolution is legal, not architectural.

---

## 14. Model governance boundary

**MG-1.** **Policy version and model version are separate and independent.**

**MG-2.** A **model change must not silently change policy semantics.** If a new
model version changes which content is actioned, that is a policy-affecting
change and requires T&S Policy Owner involvement even though no policy text
changed. This is the most likely route by which policy drifts without anyone
deciding to change it.

**MG-3.** A **policy change must not silently imply a model change.** New policy
that current detection cannot support is a policy with a known enforcement gap,
and that gap is recorded rather than papered over with an unreviewed model
change.

**MG-4.** Review and approval expectations, by change kind:

| Change | Approved by | Requires |
|---|---|---|
| New model or detector | Model Owner + T&S Policy Owner | Evaluation before rollout; stated capability and known failure modes |
| Model version change | Model Owner; T&S Policy Owner if behaviour-affecting | Comparison against the prior version on an agreed evaluation set |
| Detector change | Model Owner | Same |
| **Threshold change** | **T&S Policy Owner** | Stated expected effect on outcomes (§5.3) |
| Policy change | T&S Policy Owner | Full lifecycle (§6) |
| Taxonomy change | T&S Policy Owner | Impact assessment on every dependent artefact — taxonomy is referenced everywhere (map §5.1) |

**MG-5.** Every model and detector in the decision path is **identifiable and
versioned in the decision record** (§12). A model that cannot be named in a
decision must not be in the decision path.

**MG-6.** Evaluation precedes rollout. What "evaluation" means quantitatively is
Group 13/14 (§22).

**MG-7.** TappyAI's AI platform architecture (`docs/architecture/AI_PLATFORM.md`,
enforced by the CI Architecture Guard) governs *how* models are accessed. It is
Engineering governance and is **not** amended by this document.

---

## 15. Legal review boundary (B-3)

TappyAI is initially Vietnam-focused and may be distributed through the App
Store and Google Play.

**LG-1.** This architecture **does not claim legal compliance**, and no document
in `docs/policy/` may state or imply that TappyAI is legally compliant.

**LG-2.** This architecture **does not invent statutory obligations**. Where a
legal requirement is asserted, it cites an authoritative source or it is marked
**LEGAL REVIEW REQUIRED**.

**LG-3.** Legal interpretation and compliance determination are made **only by
the Legal Reviewer**. Product, engineering and moderation may identify legal
questions; they may not answer them.

**LG-4.** The architecture **may**: identify legal and compliance questions; map
requirements to authoritative sources once known; define ownership for legal
review; and define evidence and retention requirements **architecturally**.

**LG-5.** Evidence produced by this system is **not claimed to be legally
admissible** (EV-7). Whether any record has legal standing is a legal
determination.

**LG-6.** Where legal guidance conflicts with existing policy, policy is
suspended in the affected scope pending resolution — it is not silently
overridden and not silently continued (§18).

**LG-7.** Compliance is a **governance responsibility with a named owner**, not
a product claim.

---

## 16. Incident governance

**IN-1.** A **safety incident** is distinct from a service incident. Its impact
is measured in harm to people, not in availability.

**IN-2.** Declaration activates the **Incident Commander** (§5.1) and the
emergency mechanism in §8.

**IN-3.** Severity, escalation paths and communication obligations are defined
in Group 15 (§22). This document establishes only that the authority exists,
that it is bounded by EM-4, and that it is reviewed after the fact (EM-5).

**IN-4.** Failure of the T&S system itself — detectors down, review backlog
beyond capacity, enforcement executing without decisions, or decisions not
executing — is a safety incident, not merely an operational one.

---

## 17. Cross-platform consistency

**CP-1.** Policy applies coherently across Web, Android, iOS, backend services
and moderation operations. The same conduct is not a violation on one surface
and permissible on another.

**CP-2.** **Policy authority is server-side and domain-level.** Clients do not
define, interpret, or locally amend policy semantics.

**CP-3.** A client may **render** policy outcomes, **collect** reports, and
**present** notices. It may not decide them.

**CP-4.** Client-side checks are **user experience, never enforcement**. A
client-side block is a convenience; the authoritative decision is made
server-side. A policy enforced only on a client is not enforced.

**CP-5.** Platform capability differences (what a client can display, or what a
store permits) may change **presentation**. They do not change **policy**.

**CP-6.** A surface is in scope whether or not a client exists for it. Note as
current fact, not as a policy exception: iOS and Android carry no T&S client
surfaces today, and iOS is frozen. Building them is later work under Group 16.

**OPEN — OWNER DECISION REQUIRED (G01-D-16):** how policy applies where an app
store's requirements are **stricter** than TappyAI policy — global uplift, or
per-distribution variance. Variance is a real cost, and it must be chosen
knowingly.

---

## 18. Conflict resolution

Escalation, never invention. No path below produces a legal outcome.

| Conflict | Resolution |
|---|---|
| **Policy vs operational procedure** | Policy prevails (AUTH-5). Procedure is corrected. If the procedure exists because the policy is unworkable, that is a policy review trigger (HR-5). |
| **Policy vs model output** | Policy prevails. The model is an input, never an authority. Persistent conflict is a Group 13/14 signal. |
| **Back Office documentation vs T&S policy** | T&S policy prevails **on policy questions** (§2.3); Back Office governance prevails on Back Office platform questions. Genuine overlap escalates to Product / Company Governance. |
| **Model confidence vs severity** | They are different axes and must not be traded off silently. High severity with low confidence ⇒ containment plus human review (GA-6, GA-9), never permanence and never dismissal. |
| **User report vs system evidence** | Neither is authoritative alone. Disagreement is itself a signal, and the case is routed to human review. |
| **Human reviewer vs automated recommendation** | The reviewer prevails on the individual case (HR-3). The disagreement is recorded as model-quality signal (MG-2). |
| **Legal guidance vs existing policy** | Policy is suspended in the affected scope pending Legal Reviewer determination and T&S Policy Owner amendment (LG-6). |
| **T&S policy vs Controller authorisation** | The Controller prevails **on execution** — an unauthorised action does not occur. The policy decision stands as an unexecuted decision and escalates (§2.5). Neither side amends the other. |
| **Two T&S policies conflict** | The more specific prevails over the more general; if genuinely equal, the more protective of users applies pending T&S Policy Owner resolution. |
| **Two governance branches conflict** | Product / Company Governance decides (§2.1). |

**CR-1.** Unresolved conflicts are **recorded and escalated**, never resolved by
whoever is nearest to the code.

---

## 19. Exception handling

**EX-1.** Exceptions to ratified policy are possible, and must be **explicit,
scoped, time-bound, justified, owned, and recorded**.

**EX-2.** A standing exception is a **policy amendment wearing a disguise**, and
must go through §6 instead.

**EX-3.** Exceptions are reviewed on expiry. Expiry is the default; renewal is
an act.

**EX-4.** No exception may lower the requirements for R3 enforcement (GA-2) or
remove the right of appeal (AP-1).

**EX-5.** Exceptions are audited as a class. A high exception rate against one
policy is evidence that the policy is wrong.

---

## 20. Auditability

**AU-1.** Every **governance act** — ratification, amendment, exception,
emergency declaration, role assignment, threshold change — is recorded with
authority, reason, timestamp and scope. Governance is auditable, not only
enforcement.

**AU-2.** Every **enforcement decision** is auditable per §12.

**AU-3.** Auditability is designed in, never reconstructed. A decision that
cannot be explained after the fact is a defect at the time it is made.

**AU-4.** Prior policy versions are retained so past decisions remain
explainable (VER-4).

**AU-5.** Oversight requires the ability to review decisions **in aggregate**,
not only individually. Systematic error is invisible one case at a time.

---

## 21. Deprecation, sunset and change management

**CM-1.** Retiring a policy is a governed act (§6) requiring a stated end date
and a stated disposition for decisions made under it.

**CM-2.** Retirement is **not retroactive by default** (LC-2). Revisiting past
decisions is a separate, explicit decision with its own justification.

**CM-3.** Superseded policy is **retained, not deleted** (VER-4).

**CM-4.** Deprecating a **taxonomy category** requires an explicit mapping for
existing decisions, evidence and appeals that reference it. An orphaned category
identifier makes historical decisions unreadable.

**CM-5.** Every change identifies the artefacts that depend on it. Taxonomy and
this Governance document have the widest dependency reach (map §5.1).

**CM-6.** Change management applies to **this document**. Amending it follows
§5.3 and requires Product / Company Governance.

---

## 22. Non-goals — what Group 01 does NOT define

Explicitly out of scope here and belonging to later phases:

- detailed policy taxonomy and content-specific violation definitions
- multimodal detection algorithms and per-modality capability
- exact scoring thresholds and numeric bands
- model architecture, detector design, model registry
- database schema and storage design
- moderation APIs and endpoint contracts
- worker, queue and pipeline architecture
- enforcement implementation
- appeal implementation
- golden datasets
- red-team test cases
- production integrations and client work

Also explicitly not done here: **no runtime code, no migrations, no APIs, no
moderation workers, no Controller V2 modification, no production change.**

---

## 23. Self-audit

Audited against the eighteen dimensions required for this group.

| Dimension | Verdict | Note |
|---|---|---|
| Authority boundary | **Covered** | §2. B-1 realised: peer domains, `docs/policy/` authoritative for T&S, Back Office Constitution supreme only within its own domain |
| Ownership | **Covered with gaps** | §5. One role established (Platform Owner, C1/C2); **nine roles OWNER ASSIGNMENT REQUIRED**. Reviewer authority does not exist today (§5.2, DEP-C-01) |
| Approval | **Covered** | §5.3, §7 |
| Lifecycle | **Covered** | §6. Cadence open (G01-D-07) |
| Emergency changes | **Covered** | §8. Maximum duration open (G01-D-08) |
| Human review | **Covered** | §9. Staffing model open (G01-D-09) |
| Legal review | **Covered** | §15. B-3 honoured: no compliance claim, no invented obligations, four legal items in §25 |
| Evidence | **Covered** | §12. Requirements only, no schema. No admissibility claim (EV-7) |
| Privacy | **Covered with a known tension** | §13. PR-6 vs EV-1 — explainability vs minimisation for sensitive material — deliberately surfaced, not resolved |
| Model governance | **Covered** | §14. Threshold authority assigned to policy, not model |
| Appeals | **Covered — AP-8 revised at the Owner Review gate** | §11, §11.1. Mandatory, not deferred. AP-8 now separates active enforcement state from audit history: reversal ≠ erasure. Four decisions remain open, unchanged |
| Proportionality | **Covered — PROP-1 revised at the G01-D-19 gate** | §10. Reversibility axis; ten invariants; five rejected practices; no numeric thresholds. PROP-1 is now *Non-prejudice* and no longer carries erasure language (§23.2) |
| Controller boundary | **Covered** | §2.5, AUTH-4, DEP-C-01. Dependency without subordination; no C1–C11 change proposed |
| Cross-platform consistency | **Covered** | §17. Store-strictness case open (G01-D-16) |
| Conflict resolution | **Covered** | §18. Ten conflict classes, all escalation-based |
| Exception handling | **Covered** | §19 |
| Auditability | **Covered** | §20. Governance acts audited, not only enforcement |
| Deprecation / sunset | **Covered** | §21 |

### 23.1 Weaknesses this draft acknowledges

1. **Ownership is the weakest area.** Nine of ten roles are unassigned, so by
   OWN-1 nearly all authority currently concentrates on the Platform Owner. That
   is a functioning governance model for a small team and a bottleneck for a
   large one, and it should be revisited before Group 08.
2. **A structural gap between authority and capability.** §5.2 establishes that
   no reviewer authority exists in the C3 registry today, and AUTH-4 forbids this
   domain from creating it. Groups 08 and 09 will therefore describe authority
   that cannot yet be granted. This is correct and deliberate, but it means
   DEP-C-01 must be resolved before any T&S implementation phase — not at it.
3. **PR-6 versus EV-1 is unresolved on purpose.** Minimising sensitive evidence
   and fully explaining decisions pull against each other. Resolving it
   generically here would produce a rule that is wrong for some content classes.
   It belongs per-class in Groups 11 and 12.
4. **Anonymous actors are under-specified** (§4.4, G01-D-06, G01-D-13). Most
   instruments in §10 and §11 assume a durable account and a notice channel.
   Anonymous chat exists in production today, so this is a live gap.
5. **"Bounded automated action" is bounded qualitatively only.** GA-1 through
   GA-10 constrain direction and reversibility, not magnitude. Group 06 must
   supply the quantitative bound, and until it does, the safe reading of GA-9 is
   that automation contains rather than acts.

### 23.2 PROP-1 erasure language — G01-D-19, RESOLVED (Owner approved)

Revising AP-8 exposed a conflict in language elsewhere in this document. It was
reported at the prior gate rather than silently corrected, and the Owner has
since approved the fix as **G01-D-19**. It is now applied.

**PROP-1 (§10.5) previously read:**

> History is relevant only where legitimately so, and only where it was itself
> correctly decided. **Overturned decisions leave no trace in a user's
> enforcement history** (§11).

**The conflict.** "Leave no trace" was erasure language. It contradicted AP-8,
AP-8.1, AP-8.2 and AP-8.3, and also **EV-3** (§12.2: decision records are
"append-only in effect… never edits") and **AU-4** (prior versions retained so
past decisions remain explainable). It was the clause the pre-revision AP-8
cited as its authority.

**Pre-existing, not introduced by the AP-8 gate.** The original AP-8 and PROP-1
already contradicted EV-3 and AU-4 in the first draft. The Owner's AP-8 revision
resolved most of that latent conflict; PROP-1 was the last remaining instance,
and G01-D-19 closes it.

**Resolution.** PROP-1 is now titled *Non-prejudice* and preserves both
obligations: an overturned decision must not prejudice the person in future
enforcement decisions, **and** the original decision with its audit and evidence
history remains preserved. **NON-PREJUDICE ≠ DELETION** is stated explicitly in
§10.5. A successful appeal changes the enforcement outcome; it does not erase
the historical record.

**No new policy principle was created by this correction.** The document now
carries one consistent rule across §10.5, §11, §11.1, §12.2 and §20:
**REVERSAL ≠ ERASURE**.

---

## 24. Owner decisions required

| ID | Decision | Blocks |
|---|---|---|
| **G01-D-05** | Accountability apportionment for **AI-Assisted** content; which class governs **Mixed** content (§4.3) | 02, 04, 09, 13 |
| **G01-D-06** | Whether and how T&S policy applies to **anonymous actors** (§4.4) | 02, 07, 09, 11 |
| **G01-D-07** | Policy **review cadence** absent a trigger (§6) | 01 ratification |
| **G01-D-08** | Maximum **duration of an emergency change**, and who may extend (§8) | 01 ratification, 15 |
| **G01-D-09** | Human review performed by **TappyAI personnel, contractors, or both** (§9) | 08, 12, 13 |
| **G01-D-10** | Which actions carry a **right of appeal** — all adverse, or R2 and above (§11) | 10 |
| **G01-D-11** | **Notice detail** — due process versus evasion (§11) | 09, 10 |
| **G01-D-12** | **Appeal time expectations** (§11) | 10 |
| **G01-D-13** | Whether **anonymous actors may appeal** (§11) | 10 |
| **G01-D-14** | Whether safety evidence may **ever** be reused for analytics, personalisation or model training (§13) | 12, 13, 14 |
| **G01-D-15** | **Reporter identity** disclosure to reviewers and to the reported party (§13) | 07, 08, 12 |
| **G01-D-16** | Handling where **app store requirements exceed** TappyAI policy — global uplift or per-distribution variance (§17) | 15, 16 |
| **G01-D-17** | **Role assignment** for the nine unassigned roles in §5.1 | 08 and all operational groups |
| **G01-D-18** | Timing and route for resolving **DEP-C-01** (reviewer authority as a Controller dependency, §5.2) | any implementation phase |
| ~~**G01-D-19**~~ | **RESOLVED — OWNER APPROVED.** PROP-1 rewritten as *Non-prejudice* (§10.5), applied at this gate. Resolves the contradiction between **PROP-1**, **AP-8**, **EV-3** and **AU-4**: non-prejudice governs how history may be used, never whether it is kept. No new policy principle created. See §23.2 | — closed |

Decisions **B-1 … B-5** are already made and are not reopened.

---

## 25. Legal review required

| ID | Question |
|---|---|
| **G01-L-01** | Which legal obligations actually apply to TappyAI's Trust & Safety operation, given a Vietnam-focused launch with App Store and Google Play distribution. **This architecture asserts none** (LG-2). |
| **G01-L-02** | Whether any notice, timing, transparency or reporting duty attaches to enforcement or to appeals, and if so its source. |
| **G01-L-03** | The evidentiary standing, if any, of decision and audit records. **No admissibility is claimed** (EV-7, LG-5). |
| **G01-L-04** | The interaction between evidence retention, legal hold, and any applicable right to deletion or erasure — these conflict by construction (§13). |
| **G01-L-05** | Obligations concerning reporter identity, retaliation, and disclosure to a reported party (§13, G01-D-15). |
| **G01-L-06** | Whether handling of any content class carries mandatory reporting or preservation duties. Named as a question **without asserting that such duties exist**; illegal-content handling is precisely where an unqualified guess would be most harmful. |
| **G01-L-07** | Cross-border considerations if evidence, reviewers, or processing are located outside Vietnam (interacts with G01-D-09). |

---

## 26. Status

> # 🟢 GROUP 01 — GOVERNANCE = RATIFIED
>
> Ratified by the Owner on **2026-08-15**, version **1.0**.

`POLICY ARCHITECTURE → GROUP 01 GOVERNANCE → DRAFTED → SELF-AUDITED → OWNER REVIEW → REQUIRED REVISION (AP-8) → SELF-AUDITED → G01-D-19 RESOLVED → RATIFIED`

**B-1 … B-5 are authoritative.** **G01-D-19 is RESOLVED — OWNER APPROVED.** The
final appeal principle is **REVERSAL ≠ ERASURE** (AP-8, §11.1, PROP-1 §10.5).

### 26.1 What ratification does not authorise

Ratification settles the **governance model**. It authorises nothing else.

| | Status |
|---|---|
| 🟡 **Group 02 — Policy Taxonomy** | **NOT STARTED.** Requires a separate Owner instruction |
| 🔴 **Technical contracts** | **NOT AUTHORIZED** |
| 🔴 **Policy implementation** | **NOT AUTHORIZED** — no runtime code, schema, migration, API, worker, model integration or deployment |
| 🔴 **Controller V2 changes** | **NOT AUTHORIZED** (AUTH-4). **DEP-C-01** remains an open dependency, not a licence |

**G01-D-05 … G01-D-18** and **G01-L-01 … G01-L-07** remain **open**. Ratifying
the governance model did not answer them, and none may be treated as settled by
implication.
