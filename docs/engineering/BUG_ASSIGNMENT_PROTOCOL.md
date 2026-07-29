# Bug Assignment Protocol (v2 — gate-aware)

**Binding:** Engineering Constitution Amendment I · ADR-015 · Applies to Web, Android, iOS.
**Changes from v1:** intake now carries a reproduction record; classification precedes everything; PARTIAL is a stop; the hard stop moved from *after RCA* to *before any work*.

## Rules that do not change

1. **The Owner owns the backlog and the order.** The AI never re-prioritises or picks up an unassigned bug.
2. **One bug at a time.** No opportunistic fixes, no drive-by cleanups in the same area.
3. **The Owner's verdict closes the bug.** AI evidence is input to UAT, never a substitute.

## Step 1 — Intake: the Owner Reproduction Record

A bug is not assignable until this record exists. The AI must request any missing field **before** classification, and must never fill a field by assumption.

| Field | Why it is mandatory |
|---|---|
| **Surface** — exact URL / app build / device | Two incidents were lost to a stale server and to an undeployed production build |
| **Identity** — signed in (which account type) or anonymous | The entire authenticated branch was never executed because this was assumed |
| **Exact steps** — numbered, including *where* Back/gestures were pressed | "Back" meant three different mechanisms during the incident |
| **Expected vs actual** — what the Owner saw | Separates a defect from a spec disagreement (this incident contained one of each) |
| **Device / viewport / language** | Slide-height math, locale-dependent labels |
| **Timestamp + frequency** — always / intermittent | Distinguishes races from deterministic faults |
| **Visual** — screenshot or recording when available | The AI may be structurally unable to see the symptom |

If the Owner cannot supply a field, it is recorded as `UNKNOWN` and becomes a prerequisite in Step 2 — never a guess.

## Step 2 — Classification (before any other work)

Produce the prerequisite inventory (Amendment I §3) and classify: **REPRODUCIBLE / PARTIALLY REPRODUCIBLE / NOT REPRODUCIBLE**.

- REPRODUCIBLE → proceed to Step 3.
- Anything else → **STOP**, issue the Missing Prerequisites Report, wait. Nothing else is permitted.

## Step 3 — Reproduce and capture RED

Execute the Owner's exact path. Observe the failure. Capture the full evidence pack. If the path runs clean, the bug is **NOT REPRODUCED** → back to Step 2's stop with a divergence note (what the AI saw instead, and every environmental difference that remains).

## Step 4 — RCA on the reproduced failure

Root cause is claimed only against the observed RED. **HARD STOP after RCA** — the Owner decides whether to fix, defer, or change the spec. Hypotheses beyond the reproduced failure stay labelled `UNVERIFIED`.

## Step 5 — Implementation (unlocked only here)

One fix, one isolated commit; verify the changed-file count before committing. No unrelated refactors. Spec conflicts do not get patched around — they go back to the Owner (DFR path).

## Step 6 — GREEN on the same path

Re-run the Owner's exact path on a build whose identity is recorded. Capture GREEN. Run unit + regression + build gates. Any `PASS` written here must satisfy Amendment I §6 in full.

## Step 7 — Owner UAT

Hand over: RED evidence, GREEN evidence, the diff, the build identity, and the exact steps to re-check. Then **stop and wait**. `Product UAT: WAITING FOR PRODUCT OWNER`.

## Escalation triggers (stop and ask, do not improvise)

- A prerequisite needs an action the AI is forbidden to take (OAuth sign-in, credential entry, payment, destructive data change).
- The Owner's expected behaviour conflicts with an approved specification → open a Design Freeze Revision; do not implement either side.
- The bug cannot be reproduced by the Owner either → propose a waiver (ADR-015) for the Owner to grant or refuse.
- Two consecutive rounds end with the Owner reporting "unchanged" → stop debugging the symptom and audit the environment/surface parity first.

## Anti-patterns (each one caused real damage in the Explore Navigation incident)

| Anti-pattern | Correct behaviour |
|---|---|
| Testing anonymously a bug reported by a signed-in user | Declare the prerequisite; stop |
| Emulating a code path (mock/injection) and calling it reproduced | Classify PARTIAL; stop |
| Reporting PASS from state values for a visual symptom | Declare the blind spot; classify PARTIAL |
| Assuming the Owner tested the same surface | Prove both surfaces; record both |
| Letting a simplified AI scenario stand in for the Owner's | Forbidden — OWNER BUG ≠ AI BUG |
| Repeating an unverified claim until it sounds settled | Every restatement keeps its original label |
