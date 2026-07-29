# Release Gate (v2 — with G0 Reproduction Gate)

**Binding:** Engineering Constitution Amendment I · ADR-015 · Applies to Web, Android, iOS.
**Change from v1:** a new **G0** precedes every other gate. A Release Candidate containing a bug fix that cannot satisfy G0 is **invalid** — regardless of how green every other gate is.

## Gate order — all must be GREEN, in sequence

| Gate | Name | Requirement | Verdict values |
|---|---|---|---|
| **G0** | **Reproduction** | Every bug fix in the release carries a **RED capture** (AI observed the Owner's exact failure) **and** a **GREEN capture** on the same path, both with recorded build identity. Fixes classified PARTIAL/NOT REPRODUCIBLE, or emulated reproductions, **do not qualify** | PASS / FAIL / WAIVED (Owner, written) |
| **G1** | Static + unit | `tsc --noEmit` clean · full unit suite green · lint no new warnings | PASS / FAIL |
| **G2** | Build | Production build exits 0 on the exact release SHA | PASS / FAIL |
| **G3** | Architecture | Spec/ADR compliance · single-owner invariants · no legacy path · no temporary adapters | PASS / FAIL |
| **G4** | Runtime E2E | The scenario matrix executed on the release build, with evidence; blocked cells itemised, never inferred; each cell carries its Execution Path Equivalence Matrix | PASS / PARTIALLY VERIFIED / BLOCKED |
| **G5** | Regression | Prior fixed bugs re-checked; permanent regression tests present and green | PASS / FAIL |
| **G6** | **Owner UAT** | The Owner has personally exercised the scenarios and accepted | PASS / FAIL — **Owner only** |
| **G7** | Deployment readiness | Merge/push/deploy plan, production verification steps, rollback levels | PASS / FAIL |

**No "probably", no "should be".** Every item is PASS, FAIL, BLOCKED, PARTIALLY VERIFIED, or WAIVED.

**Two absolute bars across all gates:** a **`PARTIALLY VERIFIED`** result never satisfies a gate (Article IV §3), and an **assumption** never satisfies a gate — it must first become evidence or the gate is FAIL (Article V §2).

## G0 in detail — the new blocking gate

A fix qualifies only with all of:

1. **Classification = REPRODUCIBLE** recorded before implementation began.
2. **RED evidence** — the AI's own observation of the Owner's failure: exact steps, surface, identity, state dump, visual (for user-visible symptoms), console/network, timestamp, build identity.
3. **GREEN evidence** — the same path, post-fix, same fields, new build identity.
4. **Same execution path** for both. A GREEN obtained on a different path, identity, or surface than the RED **fails G0**.
5. **Traceability** — the fix commit references its RED evidence.

6. **Runtime Identity Block proven** (Article II §1) on both captures — repository, branch, worktree, commit SHA, PID, port, Build ID **served over HTTP**, plus build provenance. Any unprovable line ⇒ G0 FAIL.

**G0 failure modes (automatic FAIL):** no RED capture · reproduction was emulated/simulated · tested anonymously a signed-in bug · state-only evidence for a visual symptom · surface/build identity unrecorded or mismatched between captures · Build ID read from disk but never verified over HTTP · build provenance assumed to be HEAD without proof · an unresolved Owner-vs-AI divergence still open (Article III §1.4).

## Release Candidate admissibility

An RC may be **prepared** only when G0–G5 are PASS (G4 may be PARTIAL if every blocked cell is itemised and none is a blocking scenario).
An RC may be **approved** only by the Owner after G6.
Merge / push / deploy require **explicit Owner authorisation per step**, after approval — never inferred from a green board.

## Standing release rules (unchanged)

- Nothing is merged, pushed, or deployed without explicit Owner instruction.
- Production SHA is verified before and after any deploy.
- Rollback levels are defined before deploy, not after an incident.
- A green gate board is evidence, not permission.

## Waiver

Only the Owner may waive **G0**, in writing, naming the unsatisfied prerequisites. Waived work ships labelled `UNVERIFIED — SHIPPED UNDER WAIVER`, and **PASS remains forbidden** for it. The AI can never waive a gate.
