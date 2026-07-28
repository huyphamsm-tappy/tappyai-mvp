# Navigation Migration — Legacy Removal + Migration Plan

**Architecture:** `NAVIGATION_SESSION_ARCHITECTURE.md` (proposal)
**Framing:** this is a **migration, not an addition**. The end state contains **one** navigation-state mechanism.
**Status:** PLAN ONLY — no code, no commits, no push, no deployment.

---

# PART 1 — Legacy Removal Plan

Every artifact below was located by inspection (file:line). **Each row carries a disposition and a justification; nothing is left "just in case."**

## 1A. Module-level history machinery — `src/app/reviews/page.tsx`

| # | Artifact | Loc | Purpose today | Disposition | Justification |
|---|---|---|---|---|---|
| L1 | `RETURN_KEY = 'tappy:reviewsReturn'` | :34 | key for the saved clip marker | **REMOVE** | Replaced by `ExploreState` owned by the Session (its own storage key/versioning) |
| L2 | `lastPopStateAt` | :35 | timestamp of last popstate | **REMOVE** | Violates Rule 1 — history deciding business state |
| L3 | module `popstate` listener | :37 | feeds L2 | **REMOVE** | Same; restore is no longer history-triggered |
| L4 | `navTimingConsumed` | :47 | one-shot `back_forward` guard | **REMOVE** | Only exists to interpret navigation type |
| L5 | `isBackForwardMount()` | :48–56 | gate: "is this a Back/Forward mount?" | **REMOVE** | **The central violation.** Restore trigger becomes "Explore became visible" |

## 1B. Component-level restore machinery — `page.tsx`

| # | Artifact | Loc | Disposition | Justification |
|---|---|---|---|---|
| L6 | `isBackNavRef` + init | :390–391 | **REMOVE** | Consumer of L5 |
| L7 | `feedType` lazy-init reading `RETURN_KEY` | :410–422 | **REPLACE** | feedType restoration moves into `ExploreState` (restored *before* fetch, as today, but not history-gated) |
| L8 | `tab` lazy-init reading `sessionStorage['reviews_tab']` | :394–400 | **REPLACE** | Ad-hoc cross-component channel → explicit Session field |
| L9 | unmount handler writing `RETURN_KEY` | :~708–716 | **REMOVE** | Freeze becomes explicit departure intent, never an unmount side effect (this is exactly why My Profile never saved) |
| L10 | `didRestoreRef` + restore effect | :722–~740 | **REPLACE** | Becomes `NavigationSession.restore()` with documented fallback order |

## 1C. Cross-component ad-hoc channel

| # | Artifact | Loc | Disposition | Justification |
|---|---|---|---|---|
| L11 | `sessionStorage.setItem('reviews_tab','profile')` | `ProfileTab.tsx:468` | **REMOVE** | Untyped side channel between components; superseded by Session |
| L12 | `sessionStorage.getItem/removeItem('reviews_tab')` | `page.tsx:398–399` | **REMOVE** | Read side of L11 |

## 1D. Mirror refs — ⚠️ conditional, verify before removal

| # | Artifact | Loc | Disposition | Justification |
|---|---|---|---|---|
| L13 | `activeIndexRef` | :432–433 | **VERIFY → remove only if sole consumer was L9** | Introduced so the unmount closure saw live values. **Must confirm no other reader** (e.g. scroll handler) before deleting |
| L14 | `reviewsRef` | :434–435 | **VERIFY → same** | Same rationale |
| L15 | `feedTypeRef` | :436–437 | **VERIFY → same** | Also read by the feed loader — likely **KEPT**; will be justified per-use, not blanket-removed |

> These three are explicitly **not** assumed dead. Each will be re-grepped at implementation time and either removed with evidence or kept with a stated reason.

## 1E. Tests

| # | Artifact | Disposition | Justification |
|---|---|---|---|
| L16 | `feedBackRestore.test.tsx` (163 lines, 5 cases incl. Bug #8 + Bug #17) | **REPLACE — never silently delete** | It encodes real regressions. The *behaviour* ("Back returns to the same clip", "a push-visit is not treated as Back") must be re-expressed against `NavigationSession`. Standing project rule: regression tests are permanent |

## 1F. Explicitly KEPT (with justification)

| Artifact | Why it stays |
|---|---|
| `handleSetTab` → `router.replace` | Router is transport. Push-vs-replace becomes a URL/shareability choice with **zero** correctness impact. Kept unless product wants a different URL |
| `scrollIntoView` in `feedShared.tsx:141` | Comment-scroll UX, unrelated to Explore restoration |
| `PlaybackSession` / `UploadCompatAdapter` | **Different track.** The playback adapter's removal is already scheduled as playback Phase 3 and is out of scope here |

---

# PART 2 — Migration Plan

**Governing principle (learned from the playback work):** never let two mechanisms own the same state simultaneously. Each surface is **switched over atomically** — the new path lands and the legacy path is removed **in the same commit** — so a dual-write window never exists.

| Step | Change | Rollback point |
|---|---|---|
| **M0** | **Baseline capture.** Record current behaviour as evidence (Case A PASS twice, Case B divergence). No code. | n/a |
| **M1** | **Add `NavigationSession`** — contract, `ExploreState`, freeze/restore, storage (in-memory + `sessionStorage` mirror), unit tests. **Not wired.** Zero behaviour change. | `git revert M1` — tree identical to today |
| **M2** | **Explore switchover (atomic).** Wire freeze/restore to the Session **and** remove L1–L7, L9, L10 in the same commit. | `git revert M2` → legacy restore returns intact |
| **M3** | **Profile paths (atomic).** Both other-user and My Profile emit identical enter/leave signals. Remove L8, L11, L12. | `git revert M3` |
| **M4** | **ClipViewer.** Codify: owns only its viewer index; never writes `ExploreState`; no history for open/closed. | `git revert M4` |
| **M5** | **Dead-code sweep.** Resolve L13–L15 with per-use evidence; remove anything orphaned by M2–M4. | `git revert M5` |
| **M6** | **Test migration.** Replace L16 with `NavigationSession` equivalents covering the same regressions (Bug #8, Bug #17) plus the new My-Profile case. | `git revert M6` |
| **M7** | **E2E matrix** (Part 4). No code. | n/a |

**Rollback properties**
- Every step is one commit, revertible independently, newest-first.
- **M2 is the highest-risk step** (it removes the working Case A path). It is *also* the cleanest rollback: reverting it restores the legacy mechanism wholesale.
- Nothing is pushed/deployed during M1–M6; production stays at `1184bd5` throughout, so **production rollback is never required**.

---

# PART 3 — Definition of Done

Not done until **every** box is true and evidenced:

- [ ] **Legacy removed** — L1–L12 gone from the tree (verified by grep returning zero hits)
- [ ] **Dead code removed** — L13–L15 resolved with per-use justification recorded
- [ ] **Duplicate logic removed** — exactly **one** mechanism owns Explore restoration; no second writer anywhere
- [ ] **Single state owner verified** — every row of the ADR State Ownership Table has exactly one writer (invariant **I2**), evidenced by grep + review
- [ ] **No history-dependent business logic** — grep for `popstate`, `back_forward`, `history.length`, `navigation.type` in `src/app/reviews/` returns **no business-logic hits** (listeners for pure transport/telemetry must be individually justified)
- [ ] **No temporary adapters remaining** — no compat shim, no feature flag, no dual-path branch in the navigation code
- [ ] **Architecture invariants I1–I10 hold** (ADR §2), each with its stated check
- [ ] Full unit suite green + `tsc --noEmit` clean + `next build` exit 0
- [ ] **Runtime E2E matrix (Part 4) fully PASS with evidence**
- [ ] **Owner UAT complete** — owner has personally exercised the flows in their authenticated session and accepted

> **Implementation is NOT complete until runtime E2E passes AND owner UAT is complete.** No ticket closes on reasoning. No cell is marked PASS without browser evidence. Claude's E2E evidence is *input to* owner UAT, never a substitute for it.

---

# PART 4 — Required E2E matrix

**Every cell requires:** screenshot · router state (URL + `history.length` + nav type) · `ExploreState` · `activeReviewId` · `activeIndex` · `scrollPosition`.

| # | Scenario | Must prove |
|---|---|---|
| E1 | **Other Profile** → back | Exact same clip, index, scroll |
| E2 | **My Profile** → back | **Identical outcome to E1** (the reported defect) |
| E3 | **Clip Viewer** (open a clip inside a profile) → back | Returns to Explore at the original clip |
| E4 | **Refresh** on Explore | Defined behaviour (restore or clean top) — explicitly stated, not accidental |
| E5 | **Search** — enter a query, leave, return | query + results + position restored |
| E6 | **Feed reorder** (`trending` re-orders between fetches) | Restores **by `activeReviewId`**, not index |
| E7 | **Browser Back** | Same as E1/E2 |
| E8 | **Browser Forward** | No stale/incorrect state |
| E9 | **Mobile** (375×812) | All of the above |
| E10 | **Desktop** (1280×800) | All of the above |

**Cross-cutting per run:** clean console · exactly one restore attempt · fallback (if any) explicitly reported, never a silent slide-0 landing.

## 4B. Stress-test additions

Ordinary paths pass easily; these are where a state owner actually breaks.

| # | Stress scenario | Must prove |
|---|---|---|
| S1 | **Rapid repeated Back/Forward** (10× alternating, fast) | No stale clip, no double-restore, no drift |
| S2 | **Deep chain** Explore → Profile → Clip → Profile → Explore → Profile → Back×3 | Correct clip at each level; no leaked state |
| S3 | **Enter/leave Explore 20×** | No unbounded growth of sessions/listeners; one live session |
| S4 | **Freeze during in-flight fetch** (leave while page 2 loads) | Freeze captures a coherent snapshot; restore is not corrupted by the late response |
| S5 | **Restore while feed still loading** | Restore waits or falls back per F11 — never lands blank |
| S6 | **Saved clip deleted** while away (F2) | Graceful fallback + reported, no blank slide |
| S7 | **Feed re-ordered between freeze and restore** (F1 / E6) | Restores **by id**, not index |
| S8 | **Filter/sort/query changed** while frozen (F3) | INVALIDATED → clean top, reported |
| S9 | **Refresh while on a restored clip**, then Back | Defined, non-accidental behaviour |
| S10 | **Slow network** (throttled) | No race between restore and fetch; single restore attempt |
| S11 | **Private mode / storage blocked** (F4) | No throw; SPA restore still works |
| S12 | **Rotate / resize** mid-restore | Scroll target recomputed; no off-by-one slide |
| S13 | **Two tabs open** on Explore | Sessions independent; no cross-tab contamination |
| S14 | **Background the tab during freeze, return later** (stale, F9) | INVALIDATED per staleness policy, reported |

---

# PART 5 — Migration Checklist

Worked strictly top-to-bottom; each item is checked off with evidence at the time it is done.

**Pre-flight**
- [ ] ADR §11 open decisions settled (staleness · scope · one-session-vs-many · URL shareability · durability fallback)
- [ ] Baseline captured (M0): Case A PASS ×2, Case B divergence, current test suite count recorded
- [ ] Working tree clean; branch identified; production SHA noted

**Build**
- [ ] M1 `ExploreSession` added (unwired) + unit tests; suite green; **zero behaviour change verified**
- [ ] M2 Explore switchover **atomic** (wire + remove L1–L7, L9, L10); suite green; build green
- [ ] M3 Profile paths uniform (remove L8, L11, L12); **E1 ≡ E2 asserted**
- [ ] M4 ClipViewer responsibilities codified
- [ ] M5 Dead-code sweep; L13–L15 each resolved **with written justification**
- [ ] M6 `feedBackRestore.test.tsx` replaced by `ExploreSession` equivalents covering Bug #8 + Bug #17 + My-Profile

**Verify**
- [ ] Invariants I1–I10 checked
- [ ] DoD grep gates return zero hits
- [ ] E2E matrix E1–E10 PASS with full evidence
- [ ] Stress matrix S1–S14 PASS
- [ ] Telemetry emitting; `restore_result.exact` observed on the happy path
- [ ] Owner UAT complete and accepted

**Close**
- [ ] NAV-003 and NAV-004 each independently re-tested and closed on their own evidence (still not auto-merged)

---

# PART 6 — Sprint-level Rollback Policy

| Level | Trigger | Action | Cost |
|---|---|---|---|
| **L0** | Failure mid-step, uncommitted | Discard working tree | none |
| **L1** | One step regresses | `git revert` that step only | minutes |
| **L2** | **M2 (Explore switchover) regresses** | Revert M2 → legacy restoration returns **wholesale and intact** | low — nothing deployed |
| **L3** | Migration judged unsound after several steps | Revert M1–M6 as a contiguous range → tree returns to `db52586` behaviour | low |
| **L4** | Post-deploy regression (only after owner acceptance) | Revert the merge on `main`, redeploy previous SHA | standard deploy cycle |

**Policy rules**
1. **No step may be started while a previous step is red.** Stop-on-regression is absolute.
2. Each step is exactly one commit — never squash the migration into one.
3. **Nothing is pushed during M1–M6**; production stays at `1184bd5`, so L4 cannot be needed during the sprint.
4. **Abort criteria (stop the migration, escalate to owner):** any invariant I1–I10 cannot be satisfied without a second state owner; or Case A regresses and cannot be restored within one step; or the migration requires a temporary adapter that cannot be removed by DoD.
5. Rollback is a *normal outcome*, not a failure — the phased structure exists to make it cheap.

---

## Open items carried forward (unchanged)
The 5 architecture decisions in `NAVIGATION_SESSION_ARCHITECTURE.md` §11 (staleness policy · scope · one-session-vs-many · URL shareability · migration of the durability fallback) remain **open** and should be settled before M1.

**NAV-003 and NAV-004 remain OPEN and separate — not merged, no RCA concluded.**
**No code. No commits. No push. No merge. No deployment. Android PAUSED.**
