# DFR-001 — Design Freeze Revision: My Profile Back Navigation Semantics

**Status:** **APPROVED by owner 2026-07-28** — spec is now v1.1; implementation authorized
**Target spec version:** 1.0 → **1.1** upon approval · **Scope:** ONLY the My-Profile ↔ feed-tab Back semantics. No other architecture, contract, schema, or invariant changes.
**Trigger:** Owner UAT rejected the v1.0 behavior; reproduced with instrumentation in `EXPLORE_NAV_UAT_FAIL_RCA_2.md` (step B4: Back from "Hồ sơ" exits `/reviews` to the previous route). **The Product Owner defines product behavior; the specification is revised to match.**

## 1. Owner-defined required behavior (normative once signed)

> From the My Profile tab inside Explore, pressing browser/system **Back returns the user to the Explore feed tab, showing the exact clip they left**, with `restore_result = exact`. Back does NOT exit Explore from the My Profile tab.

## 2. Normative changes (v1.0 → v1.1)

| Ref | v1.0 (frozen) | v1.1 (this revision) |
|---|---|---|
| BT-02 *Browser* | "URL `?tab=` changes only (**replace** — no new entry; transport choice)" | The **home → profile** tab transition **creates a history entry (push)**. Other tab transitions keep replace (out of scope) |
| **BT-02b (new)** | — | Init: feed clip X → "Hồ sơ" tab. Action: browser/system Back. Expected: **feed tab visible, clip X restored, `restore_result=exact`, zero data loss**. A second Back (now on the feed tab) follows transport out of Explore as before |
| BT-03 | "Back follows transport (may leave `/reviews` — allowed, P2)" from the profile tab | BT-03 now applies only to exits that actually leave `/reviews` (route changes, external nav). From the **My Profile tab**, Back is governed by BT-02b |
| Spec §8 Web binding | Arrival signals: mount / tab return / pageshow | Adds: **URL-driven tab transitions (history traversal across `?tab=` states) MUST route through the same enter/leave signal path as direct tab taps** — a Back that moves `?tab=profile → (none/home)` emits the same `enterExplore` as tapping the feed tab, and the reverse traversal emits `leaveExplore('tab-switch')`. (Also closes audit note N2: the URL-echo effect ceases to be a signal-less path.) |
| ADR-001 Alternatives | "A. Patch My Profile to use `push` — REJECTED (treats the symptom)" | Reclassified: push is adopted **as a product-mandated transport choice**, NOT as the state mechanism. The rejection stands for its original meaning — push is not *how state survives* (ExploreSession is); it is only *where Back lands* |

## 3. Explicitly unchanged (scope fence)

- `ExploreSession` contract §3, `ExploreState`/`Snapshot` schema §2, versioning V1–V7 — **untouched** (no schema bump; this is behavior at the transport edge).
- Invariants **I1–I12 all hold unchanged**. In particular: I1/I4 — the restore trigger remains "the feed tab became visible"; the history traversal only moves transport (the URL), and the *tab transition* emits the business signal. No business decision reads history state; P1/P2 stand: push-vs-replace remains a transport choice with zero impact on state **survival** — v1.1 constrains it for UX **landing**, which is Product's prerogative.
- Failure scenarios F1–F11, telemetry §7, ownership §4 — untouched.
- Search/Inbox tab Back semantics — **untouched** (open question for the owner, deliberately NOT decided here: should they also push? Recorded as a v1.2 candidate).

## 4. Platform notes (informative)

Android/iOS: system Back from the My Profile tab returns to the feed tab — the natural mobile back-stack pattern (a tab transaction on the back stack / navigation-stack entry). This revision *aligns* the Web with the expected mobile behavior rather than diverging from it.

## 5. Implementation impact (for sizing only — no code in this revision)

Web: `handleSetTab` pushes (instead of replaces) for home→profile; the `?tab=` traversal handler emits enter/leave signals; new business test BT-02b; E2E cells for BT-02b desktop+mobile. Estimated as one atomic migration-step commit plus tests. **Not started until this DFR is signed.**

## 6. Sign-off

- [ ] Product Owner approves DFR-001 → spec becomes **v1.1**; BT list updated; implementation may begin as its own migration step with the standard gates (unit + build + E2E BT-02b + owner UAT re-run of Scenario B).
