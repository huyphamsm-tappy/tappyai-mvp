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

Every upload resolves. There is no state a post can be left in indefinitely.

```
CREATED → UNDER_REVIEW → ┬─ passes ─→ PUBLISHED  (public in Explore)
                         └─ does not ─→ RESTRICTED (your profile only)
```

| State | Meaning | Publicly visible |
|---|---|---|
| `PUBLISHED` | Checked; nothing prohibited was found | ✅ yes |
| `RESTRICTED` | Not published — either a finding, or the check could not confirm it | ❌ no, author only |
| `UNDER_REVIEW` | The check is running. Transient today, since it runs during upload | ❌ no |
| `NULL` | Predates the gate | ✅ yes, unchanged |

**Anything that cannot be positively established as safe becomes `RESTRICTED`** —
a violation, insufficient evidence, a provider failure, an unexaminable video, a
result about older content. This is deliberately fail-closed: there is no state,
no failure and no missing evidence that reaches `PUBLISHED`.

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

## 7. What happens to a post that is not published

**It is not deleted, and it does not disappear.** You are told straight away, on
the posting screen itself — a post that was not published is never reported to
you as a success. It then stays in your profile, where only you can see it,
marked with the same warning. You can still delete it yourself. Everyone else —
Explore, other profiles, anonymous visitors, a direct link, and the post count
on your public profile — is refused it, by the application and independently by
the database.

The wording distinguishes the two reasons, because they are not the same thing:

- **A finding.** "⚠️ This content can't be published because it doesn't meet
  TappyAI's Community Guidelines."
- **An unfinished check** — the far more common case today, and every video.
  "The safety check could not confirm this content, so it was not published
  publicly. It is still in your profile. This is not a finding that you did
  anything wrong."

Uncertainty is never phrased as an accusation. You are not told *which* check
stopped it — knowing that is knowing what to change to get past it.

🔴 **There is no appeal, and no human review. There are no reviewers.** Every
decision described here is made by software. Human review is a capability
TappyAI intends to add when it has the scale and the staff to operate one; it
does not exist today, and nothing in this document should be read as promising
it. Until it exists, a decision cannot be contested — you can delete the post and
try again, and that is the whole of the recourse available.

---

## 8. Current operational reality — read this before relying on the gate

✅ **A benign photo or text post now publishes.** **Videos are held back and
rejected** — see below, and §6.

**What was fixed.** Every policy used to answer `INSUFFICIENT_EVIDENCE` for every
post, because the evidence model had no way to express "we examined this and the
policy is not in play". It could say *violated* or *unknown*, and nothing else.
It now distinguishes them: where an item was **completely examined** and nothing
observed raises a given policy, that policy is reported absent
(`NOT_APPLICABLE`) rather than unknown. A benign photo went from 18 of 18 policy
lines blocking to **none**.

That change can only ever make the system more cautious, never less. It emits no
positive finding, it is inert unless the examination was complete, and any
observed indicator withholds it — so an indicator now costs a review where it
previously cost nothing.

**The RESTRICTED decision (Owner, 2026-08-19).** Two policies —
`ts.graphic.presentation` and `ts.sexual.adult-content` — no longer gate
publication. They are the only two whose disposition is `RESTRICTED` rather than
`PROHIBITED`, and both turn on a **presentation event**: whether the viewer chose
to see the item, and whether an interstitial or audience condition was applied.
No presentation event exists at publication time, so neither could ever be
answered there.

They were also incoherent as blockers. Per the Owner's decision of 2026-08-16, a
`RESTRICTED` policy establishes **no violation even when fully constituted** — its
maximum adverse outcome is `APPLICABLE_NO_VIOLATION`, which does not withhold
publication. The system was withholding more for *not knowing* than it would for
knowing the worst.

🚨 **THIS IS NOT A GENERAL PERMISSION.** It does not mean sexual content is
allowed, and it does not mean graphic violence is allowed. Sexual harm is
governed by `ts.sexual.exploitation-nonconsent` and by
`ts.child.sexual-exploitation`, `ts.child.sexualization`, `ts.child.grooming` and
`ts.child.abuse-harm` — every one `PROHIBITED`, every one still blocking, every
one still requiring absence to be positively established before it stops holding
a post. Material that raises any of them still goes to review. Both RESTRICTED
policies also continue to evaluate and to report at the policy layer; only their
publication authority changed.

**Videos are held back regardless of any of this**, because frames across the clip
and audio are not examined (§6). A video therefore cannot be confirmed safe, and
under the MVP contract that means it is **rejected**: it stays in the author's
profile with the "could not confirm" wording, and never becomes public. This is
an accepted limitation of the current release, not a decision about video
content. Closing it needs server-side frame sampling — which needs infrastructure
this build does not have (no ffmpeg, no Cloud Run, no Video Intelligence, no
speech-to-text) — or the human review that does not exist yet (§7).

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
