# Explore Content Policy

> **STATUS: DESCRIPTIVE, NOT ASPIRATIONAL.** Everything in this document
> describes what the system does today, in the build that carries it. Where a
> capability does not exist, it says so in the same sentence rather than in a
> footnote. Nothing here is a commitment to a capability that is not implemented.
>
> **Scope:** user-generated content published to Explore — the video, its
> thumbnail, its caption, its hashtags, and the place metadata attached to it.
> **Not** chat, Scam Shield, Deals, or the AI assistant's own output.
>
> **Companion documents:** [`01_GOVERNANCE.md`](01_GOVERNANCE.md) (who may decide
> what), [`02_POLICY_TAXONOMY.md`](02_POLICY_TAXONOMY.md) (the eighteen policy
> definitions this file refers to by `ts.*` identity).

---

## 1. What moderates Explore, stated precisely

TappyAI does **not** use Facebook's, TikTok's, YouTube's or any other platform's
proprietary moderation algorithm. No such technology is licensed or integrated,
and nothing in this repository connects to one. Claims to the contrary would be
false.

What actually exists, in the order the layers run:

| # | Layer | What it is here | Status |
|---|---|---|---|
| 1 | Proprietary third-party algorithms | **None.** Not licensed, not integrated. | ❌ absent |
| 2 | Third-party moderation APIs/models | **None.** No Web Risk, Vertex Safety, Hive, Rekognition, Cloud Vision SafeSearch or equivalent is configured. | ❌ absent |
| 3 | AI observation | One vision-model call over the **poster frame**, asked only to transcribe visible text and name visible subjects. It is **never asked whether content violates a policy.** | ✅ implemented |
| 4 | TappyAI's deterministic policy engine | Eighteen `ts.*` policies evaluated against normalised evidence. No model output reaches a decision without passing through it. | ✅ implemented |
| 5 | Human review / escalation | **None. There are no reviewers.** No queue, no reviewer interface, no one assigned. | ❌ absent |
| 6 | Final publication decision | Deterministic, server-side, derived — never accepted from a client. | ✅ implemented |

**The single most important line:** the AI is an *observer*, not a judge. It
reports what it can see. Whether what it saw matters is decided by layer 4
against the policy taxonomy, and only by layer 4.

---

## 2. The pre-publication gate

Explore is **pre-moderated**. The order is fixed and enforced server-side:

```
upload → store → gather evidence → evaluate 18 policies → decide → only then publish
```

A post that has not been decided is **not publicly visible**. This is enforced in
two independent places, and both must be defeated for held content to leak:

1. **Application layer** — every public read path filters on
   `publication_state ∈ {NULL, PUBLISHED}`.
2. **Database layer** — a `RESTRICTIVE` row-level-security policy on `reviews`
   applies the same rule inside PostgreSQL. It holds against a direct PostgREST
   call with the anonymous key, which the application filter alone would not.

`NULL` means "created before the gate existed" and keeps exactly the visibility it
had; the gate does not reclassify anyone's existing posts.

### Failure is never treated as safety

There is no fail-open path. Every way of *not knowing* resolves to held:

| Situation | Result |
|---|---|
| Provider times out / is unavailable | held |
| Malformed or unparsable model reply | held |
| Evidence gathering throws | held (`ENGINE_ERROR`) |
| A policy evaluation throws | held |
| Evidence insufficient | held |
| A legal dependency is open | held |
| Media could not be examined | held |

`ENGINE_ERROR` deliberately outranks a violation finding: if the pipeline broke,
a finding produced alongside the breakage is not trustworthy enough to act on.

**"We could not verify this" never becomes "this is safe."** That property is
what the test suite exists to defend.

---

## 3. Decision states

| State | Meaning | Publicly visible |
|---|---|---|
| `PUBLISHED` | Evaluated; nothing constituted a violation | ✅ yes |
| `UNDER_REVIEW` | Held — uncertainty, a failure, or an open dependency | ❌ no |
| `RESTRICTED` | A policy was constituted | ❌ no |
| `NULL` | Predates the gate | ✅ yes, unchanged |

The underlying safety states are kept separate and are never collapsed: `SAFE`,
`VIOLATION`, `UNDETERMINED`, `HUMAN_REVIEW_REQUIRED`, `LEGAL_REVIEW_REQUIRED`,
`ENGINE_ERROR`. Two of those distinctions are load-bearing — `UNDETERMINED` is
never `SAFE` and never `VIOLATION`, and neither is `ENGINE_ERROR`.

🚨 **`RESTRICTED` means "was never published", not "was taken down."** No content
is removed, no account is penalised, no ranking is touched. The distinction is
deliberate: the governance corpus requires notice *and an appeal path* before an
adverse action against published content, and no appeal exists (§7).

---

## 4. Prohibited — these block publication

All eighteen policies below block publication when constituted. Identities are
the taxonomy's, so this table and the engine cannot drift apart.

**Child safety** — `ts.child.sexual-exploitation`, `ts.child.sexualization`,
`ts.child.grooming`, `ts.child.abuse-harm`. No contextual exception of any kind.

**Sexual content** — `ts.sexual.exploitation-nonconsent` (including
non-consensual intimate imagery), `ts.sexual.adult-content`.

**Violence** — `ts.violence.graphic-harm`, `ts.violence.incitement-threats`,
`ts.graphic.presentation` (gratuitous gore).

**Harm to people and animals** — `ts.selfharm.promotion`,
`ts.danger.harmful-activity`, `ts.harassment.targeted`, `ts.animal.cruelty`.

**Deception and exploitation** — `ts.deception.harmful`, `ts.fraud.scam`,
`ts.platform.abuse-manipulation`.

**Privacy** — `ts.privacy.personal-information`.

**Hate** — `ts.hate.protected-target-abuse`. ⚠️ This policy has an unresolved
legal dependency and cannot currently reach a conclusion. Product decided
(Owner, 2026-08-17) that an unanswerable policy must not hold every upload, so it
does not gate publication. **This is not a legal ratification and does not
resolve the dependency**; the policy still reports `LEGAL_REVIEW_REQUIRED` at the
policy layer.

---

## 5. Allowed — topic is not harm

The system classifies **conduct**, not **subject matter**. The following are
legitimate and are *not* grounds for blocking:

- political discussion, political news, election coverage, criticism of
  governments, officials, policies and institutions
- religious discussion, teaching, practice, comparison and criticism
- journalism and reporting, including reporting *about* violence
- documentary and historical material, including historical atrocity
- educational and medical explanation
- artistic and satirical work
- ordinary opinion, complaint and negative review

**"Politics" alone is never a block. "Religion" alone is never a block.** No
policy in the taxonomy takes a topic as its trigger, and there is no
political-content or religious-content classifier in the system. Violence shown
to *report* or *document* is treated differently from violence shown to
glorify, instruct or incite — the distinction lives in the policy definitions,
not in a topic list.

---

## 6. What is examined — and what is not

Honest coverage, because a gate that overstates what it inspected is worse than
one that admits a gap:

| Modality | Status | Detail |
|---|---|---|
| Caption + hashtags | ✅ examined | text the author supplied |
| Place metadata | ✅ examined | structured facts already on the row |
| Poster frame (one image) | ✅ examined | vision call: visible text + visible subjects |
| **Video frames across the clip** | ❌ **not examined** | no video decoder in this runtime |
| **Audio / speech / transcript** | ❌ **not examined** | no speech-to-text is configured |

The two gaps are recorded on **every** evaluation as `coverageGaps`, so a result
always carries the truth about what it could not see. They are not silently
treated as clean.

**Consequence, stated plainly:** harmful material that appears only in the middle
of a video, or only in its audio, is **not** detected by automated means today.
The filename is never used as evidence — it is chosen by the uploader and
describes nothing.

---

## 7. What happens to a held post

The author is told, in Vietnamese or English, that their post is being checked
and **that this is not a finding that they did anything wrong**. Uncertainty is
never phrased as an accusation. The author can always see their own held post;
they can edit or delete it. It is only other people who cannot see it.

The author is **not** told which check held the post. That is deliberate: knowing
which check fired is knowing what to change to get past it.

🔴 **There is no appeal, and no human review.** Governance requires an adverse
action to carry notice *and* an appeal decided by someone other than the original
decider — and with one person currently holding every role, that is not
satisfiable. Until it is, no adverse enforcement action is enabled, and this
document does not claim one.

---

## 8. Current operational reality — read this before relying on the gate

🔴 **As configured today, no new Explore post reaches `PUBLISHED`.**

Eleven of the eighteen policies are evidence-gated and one is legally blocked;
against the evidence the three available modalities produce, they return
`INSUFFICIENT_EVIDENCE`, which is a blocking outcome. Measured on a deliberately
benign post — a bowl of noodles, no text, all three modalities observed, zero
coverage gaps — the result is `UNDER_REVIEW`, with 18 of 18 policy lines
blocking.

This is the safe direction, and it is working exactly as designed. But its
product meaning must not be misread: **with the gate active, Explore accepts no
new public content, and there is no human review to release what it holds.**

Closing that requires one of:

1. resolving the evidence-gated policies so a clean post can constitute
   `APPLICABLE_NO_VIOLATION` rather than `INSUFFICIENT_EVIDENCE` — corpus work,
   plus Owner ratification; or
2. a human review capability, which is governance-blocked per §7; or
3. weakening the gate so unresolved policies stop blocking — **which is the
   fail-open this architecture exists to prevent, and is not recommended.**

Until then the gate should be regarded as *correct and not yet operable*, and its
activation is a product decision rather than an engineering one.

---

## 9. Reporting

Signed-in users can report a music track. **There is no report path for an
Explore post**, and no reviewer workflow to act on reports if there were. A
report is modelled as a *source of evidence*, never as a verdict, and an
unverified report establishes nothing on its own.

---

## 10. Clients

The backend is authoritative. Web, Android and iOS **must not** implement their
own moderation logic, and none of them does. Clients receive the publication
state for the author's own post plus the wording to show, and their only job is
to display it. A client cannot submit a publication state: any attempt to set one
on a write is rejected, and the value is always derived server-side.
