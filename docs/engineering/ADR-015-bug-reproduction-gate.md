# ADR-015 — The Bug Reproduction Gate

**Status:** Proposed — awaiting Owner approval · **Date:** 2026-07-29 · **Scope:** Web, Android, iOS (all bug work, all agents)
**Supersedes:** the implicit "investigate → fix → verify" habit. **Implements:** Engineering Constitution Amendment I.

## Context — what actually happened

During the Explore Navigation migration the AI issued **PASS verdicts three times** for scenarios the Owner immediately reproduced as failing. The post-mortem established, with evidence:

1. **The authenticated code path was never executed — not once.** `src/app/reviews/page.tsx` gates the personalization refetch behind `if (!me) return`. Every AI test ran anonymously (measured: 1 feed fetch when anonymous vs 2 when signed in). The Owner's bug lived in the branch the AI never entered.
2. **The rendered UI was never observed.** The Browser pane was not displayed, so no frames composited and every screenshot timed out. All verdicts rested on DOM/state values — structurally blind to any visual symptom.
3. **Simulation was treated as reproduction.** The second feed fetch was emulated (React fiber + intercepted response with rotated rows) and the emulation's success was reported as the bug being fixed.
4. **The surface was assumed, not proven.** Two rounds were lost to a stale dead server on port 3000 and to production never having been deployed.

None of these were coding errors. Every one was a **workflow** error: implementation began before the bug was reproducible, and PASS was issued from an execution path that was not the Owner's.

The cost: several cycles of Owner time, three false PASS reports, an approved-then-invalidated Release Candidate, and a spec revision (DFR-001) opened on the strength of a scenario the AI had only partially executed.

## Decision

**Adopt a mandatory Bug Reproduction Gate (Constitution Amendment I) in front of all bug work on every platform.**

1. Bugs are **classified** before any other work: REPRODUCIBLE / PARTIALLY REPRODUCIBLE / NOT REPRODUCIBLE.
2. A full **prerequisite inventory** (11 categories) is produced, each item evidenced.
3. **Any unsatisfied prerequisite ⇒ HARD STOP** and a Missing Prerequisites Report. No code, no architecture change, no E2E, no PASS, no concluded RCA.
4. Implementation unlocks **only** on REPRODUCIBLE.
5. **RED-before-GREEN**: the AI must have observed the failure itself before any fix claim; both halves must come from the same execution path and recorded build identity.
6. **PARTIAL is a stop**, not a discount. **OWNER BUG ≠ AI BUG**: substituting a simplified scenario is forbidden.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| **A. Require better evidence in reports** (more logs, more state dumps) | The false PASSes already had abundant evidence — from the wrong execution path. More evidence of the wrong thing changes nothing. |
| **B. Always demand Owner UAT before any claim** | Makes the Owner the AI's test harness; multiplies the cost this incident was made of. UAT stays the final acceptance, not the first filter. |
| **C. Ban AI verification; AI only writes code** | Discards genuine value (the reconciliation defect *was* found by adversarial AI testing) and leaves fixes wholly unverified. |
| **D. Allow "partial reproduction + strong reasoning" to unlock implementation** | This is precisely what happened. Reasoning cannot cross a branch the code never entered (`if (!me) return`). |
| **E. Rely on unit tests as the reproduction proof** | 381/381 unit tests were green throughout the entire failure. Unit tests cannot reproduce an environment-dependent, user-visible bug. |

## Consequences

**Positive** — the failure mode is structurally impossible: implementation cannot begin on an unreproduced bug. Blocked prerequisites surface in the first response instead of after days. The Owner's time is spent unblocking, not re-testing. Evidence becomes comparable (RED vs GREEN on one path). Android and iOS inherit the discipline before their bug backlogs open.

**Negative / accepted costs** — some bugs will stall at the gate awaiting Owner action (an authenticated session, a visible browser pane, a test account). Throughput drops on environment-dependent bugs. The AI will more often answer "I cannot verify this" — which is the intended behaviour, not a regression. Genuinely unreproducible production bugs need an explicit Owner waiver path (§ below).

**Risk accepted:** a real bug may sit unfixed while a prerequisite is pending. Judged strictly cheaper than shipping a fix for a bug nobody demonstrated, then re-litigating it for days.

## Waiver (the only escape hatch)

For bugs that cannot be reproduced by anyone (rare production-only reports), the **Owner may issue a written waiver** that: names the unsatisfied prerequisites, authorises speculative work, and pre-labels the outcome `UNVERIFIED — SHIPPED UNDER WAIVER`. The AI may never grant itself this waiver, and PASS remains forbidden for waived work.

## Compliance signals

- Every bug record opens with a classification line and a prerequisite table.
- Every fix commit references the RED evidence that preceded it.
- Any `PASS` in any report is traceable to a RED+GREEN pair on one execution path.
- Release gate **G0** (see `RELEASE_GATE.md`) blocks any RC containing a fix without that pair.
