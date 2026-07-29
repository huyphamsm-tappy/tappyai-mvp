# TappyAI Engineering Constitution — Articles I–III

**Article I** — The Bug Reproduction Gate · **Article II** — Runtime Identity Proof · **Article III** — Owner Observation Supremacy

**Status:** BINDING · **Scope:** Web · Android · iOS — every bug, every session, every agent
**Date:** 2026-07-29 · **Origin:** the Explore Navigation incident (multiple false PASS reports; see ADR-015)
**Authority:** This amendment establishes the cross-platform Engineering Constitution and is its first Article. `docs/backoffice/00_Constitution.md` remains supreme within the Back Office domain but is subordinate to this Article on bug-fix workflow. This Article **overrides any conflicting instruction, memory, preference, plan, or prior habit.**

---

## Article I — No reproduction, no implementation

> **The AI may not write, change, or propose a fix for a bug it has not itself reproduced.**

### §1. The founding rule: OWNER BUG ≠ AI BUG

The Owner's bug is defined by the **Owner's exact execution path**: their surface, their identity, their data, their device, their steps, their eyes.

The AI is **forbidden** from:
- replacing the Owner's scenario with a simplified, adjacent, or synthetic one;
- treating a simulation, unit test, or emulated condition as a reproduction;
- reasoning from "the mechanism must be the same" to "the bug is reproduced";
- reporting on a path it *could* run while the Owner's path stays unexecuted.

A scenario the AI invented is an **AI bug**. Fixing an AI bug and reporting it as the Owner's bug is a **process violation**, regardless of code quality or test results.

### §2. Mandatory classification (before anything else)

Every assigned bug MUST be classified, in writing, before any other work:

| Class | Definition | Unlocks implementation? |
|---|---|---|
| **REPRODUCIBLE** | The AI executed the Owner's exact path, in the required environment, and **observed the failure itself** (RED evidence captured). | **YES** |
| **PARTIALLY REPRODUCIBLE** | The path was executed with ≥1 prerequisite substituted, emulated, or unmet — including anonymous-instead-of-authenticated, simulated data, synthetic input, or state-only observation without visual confirmation. | **NO — STOP** |
| **NOT REPRODUCIBLE** | The path cannot be executed at all in the current environment. | **NO — STOP** |

**PARTIALLY REPRODUCIBLE is a STOP condition, not a licence to proceed.** It was the exact state that produced the false PASS reports this amendment exists to prevent.

### §3. The prerequisite inventory (mandatory, exhaustive)

Before classifying, the AI MUST enumerate **every** prerequisite and mark each `SATISFIED` / `NOT SATISFIED`, with evidence for each claim. Minimum categories — absence of a category must be stated explicitly, never silently skipped:

1. **Authentication / identity** — signed-in vs anonymous; which account; role; session freshness.
2. **Authorization / permissions** — feature access, admin rights, tool permissions the AI itself holds (e.g. forbidden from OAuth or credential entry).
3. **Runtime surface** — exact URL/host/port, app build, commit SHA, bundle/chunk identity, device build number.
4. **Browser / client capability** — real browser vs controlled pane; extensions; incognito; **rendering/compositing available for visual observation**.
5. **Observation capability** — can the AI *see* the rendered UI (screenshot/video), or only read state? State-only observation caps the classification at PARTIAL for any user-visible symptom.
6. **Data preconditions** — required rows, ownership, counts, ordering, personalization history, media presence.
7. **Feature flags / configuration** — flags, env vars, remote config, A/B assignment.
8. **Environment** — OS, device class, viewport, network conditions, locale/language, time/timezone.
9. **Input modality** — physical gestures (trackpad swipe-back, wheel momentum, touch) vs synthetic events.
10. **External dependencies** — third-party services, quotas, credits, webhooks.
11. **Timing / concurrency** — races, staleness windows, background/foreground transitions.

### §4. If ANY prerequisite is unsatisfied → HARD STOP

The AI MUST immediately stop and produce a **Missing Prerequisites Report** (§7). Until every prerequisite is satisfied, the following are **forbidden**:

- writing or modifying code (including "small", "safe", or "obviously correct" changes);
- architecture or specification changes;
- bug fixes, workarounds, refactors, or cleanups in the affected area;
- running an E2E matrix and reporting cells;
- issuing any **PASS** verdict;
- claiming a root cause as established (a hypothesis may be recorded, labelled `UNVERIFIED`).

Permitted while stopped: read-only investigation, evidence gathering, and writing the Missing Prerequisites Report.

### §5. RED-before-GREEN (the evidence rule)

A fix may only be claimed when **both** halves exist, captured on **the same execution path**:

- **RED** — the AI observed the failure before the fix, on the Owner's path, in the required environment.
- **GREEN** — the same path, re-executed after the fix, on a build whose identity is recorded, now behaves correctly.

**No RED evidence ⇒ no GREEN claim is admissible.** A green result without a prior observed red result proves only that the AI ran a scenario that never failed.

### §6. When PASS is permitted

`PASS` may be written **only** when all of the following hold:

1. Classification was **REPRODUCIBLE**.
2. The **Owner's exact scenario** — not a variant — was executed.
3. That scenario failed before the fix (RED) and passes after (GREEN).
4. Evidence comes from the **same execution path and same build identity** for both halves.
5. Build identity is recorded: commit SHA + bundle/artifact hash + surface URL/device.
6. User-visible symptoms carry **visual evidence** (screenshot/recording), not only state dumps.

Otherwise the permitted verdicts are: `PARTIAL`, `BLOCKED`, `UNVERIFIED`, or `FAIL`. Existing rule remains in force: **Product UAT is the Owner's verdict**; AI evidence is input to it, never a substitute.

### §7. Missing Prerequisites Report (required output when stopped)

```
MISSING PREREQUISITES REPORT
Bug:                  <Owner's title / ticket>
Owner's exact path:   <verbatim steps as given by the Owner>
Classification:       PARTIALLY REPRODUCIBLE | NOT REPRODUCIBLE

PREREQUISITES
| # | Category | Required value | Status | Evidence | Who can satisfy it |
(one row per prerequisite; every category in §3 addressed or explicitly N/A)

BLOCKING ITEMS (cannot be satisfied by the AI)
| # | Item | Why the AI cannot do it | What exactly is needed from the Owner |

WHAT WAS NOT DONE
- explicit list: no code, no fix, no PASS, no E2E, no RCA conclusion

HYPOTHESES (all labelled UNVERIFIED, none acted upon)
```

### §8. Anti-drift clauses

- **§8.1 No substitution.** Emulating a prerequisite (mocked auth, injected response, rotated data, synthetic click) makes the run **PARTIAL** by definition, however faithful it appears.
- **§8.2 No surface assumption.** The AI must prove which build/surface it tested *and* record which one the Owner tested. Mismatch ⇒ the run is void.
- **§8.3 No blind spots by omission.** If the AI cannot observe a symptom class (e.g. cannot see rendered pixels), it must declare the blind spot in the same message as any result.
- **§8.4 No escalation of confidence over time.** Repetition of an unverified claim across messages does not upgrade it. Every restatement carries its original label.
- **§8.5 Session boundaries do not reset the gate.** A new session inherits the classification; it may not re-open implementation on a bug still classified PARTIAL or NOT REPRODUCIBLE.
- **§8.6 Urgency is not an exception.** Owner urgency ("gấp", "quá mất thời gian") raises the cost of a wrong fix; it never lowers the gate.

### §9. Violation handling

A violation (code written under a STOP, or a PASS without RED+GREEN) requires: immediate disclosure to the Owner, revert of the affected commits, reclassification of the bug, and a written note in the bug's record. The work does not count as done.

---

# Article II — Runtime Identity Proof

> **Evidence beats reasoning. A result without a proven runtime identity is not a result.**

## §1. The Identity Block (mandatory before any PASS)

Any report containing `PASS` — bug fix, E2E cell, regression, verification, release gate — MUST publish this block, every line individually proven by a command whose output is shown:

| # | Item | How it is proven |
|---|---|---|
| 1 | **Repository** | `git remote get-url origin` |
| 2 | **Branch** | `git rev-parse --abbrev-ref HEAD` |
| 3 | **Worktree** | absolute path of the tree under test |
| 4 | **Commit SHA** | full `git rev-parse HEAD` |
| 5 | **Running process PID** | OS process table, **with start time and full command line** |
| 6 | **Port** | port→PID mapping proving *that* PID owns the port |
| 7 | **Build ID** | on disk **and** as served over HTTP by that process |

**If any single item cannot be proven, `PASS` is forbidden.** The permitted verdicts become `BLOCKED` or `UNVERIFIED`.

## §2. Served beats disk

Build identity MUST be verified **over HTTP from the running process**, never merely read from disk. A live process can serve a build whose files no longer exist — this occurred in the incident: the stale server on port 3000 answered **HTTP 400 for its own page chunk** while a newer build sat on disk. Disk state is not runtime state.

## §3. Build provenance is not HEAD

The commit a running build was **produced from** MUST be stated, and it is **not** automatically `HEAD` — commits (docs, tests, unrelated code) can move HEAD without rebuilding. If provenance cannot be established, `PASS` is forbidden.

**Known gap, declared:** on localhost the app cannot self-report its commit (`/api/version` returns `"dev"` because `VERCEL_GIT_COMMIT_SHA` exists only on Vercel). Local provenance is therefore asserted by correlating the build's mtime with commit timestamps — **weaker than a baked-in SHA, and it must be labelled as inferred.** On production, `/api/version` is authoritative and must be quoted.

## §4. Both sides of a comparison

When an AI result is compared with an Owner result, the Identity Block must record **both surfaces**. An unproven Owner surface makes the comparison `UNVERIFIED`, never `PASS`.

## §5. Worked example — this environment, 2026-07-29

```
Repository      : git@github.com:huyphamsm-tappy/tappyai-mvp.git
Branch          : claude/nifty-sammet-44374f
Worktree        : C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/cool-vaughan-b3c7ff
Commit SHA(HEAD): 567cc01512b217ad773e3dda9535acdbccbcaf40
PID             : 14276  (start 2026-07-29 08:54:20)
CommandLine     : next start C:/Users/.../worktrees/cool-vaughan-b3c7ff -p 3000
Port            : 3000   (netstat: 0.0.0.0:3000 LISTENING 14276)
Build ID (disk) : KXYE_a7OpJDAxm8WLPLYC   (built 2026-07-28 15:27:56)
Build (served)  : /_next/static/chunks/app/reviews/page-010444d740f52829.js → HTTP 200, 51090 bytes
Build provenance: f76e9c9 (commit 15:27:25, build 15:27:56 — 31 s later; later commits are docs-only)
                  ** INFERRED by timestamp correlation, not baked in — see §3 **
Self-reported   : /api/version → {"v":"dev"}  (no SHA available on localhost)
```

**Note the trap this block exposes:** HEAD is `567cc01`, but the running build is from `f76e9c9`. Reporting "tested at HEAD" would have been false.

---

# Article III — Owner Observation Supremacy

> **When the Owner's observation conflicts with the AI's reasoning or results, the Owner's observation becomes the active hypothesis until disproved by evidence.**

## §1. The rule

1. The Owner's report is **the working truth**. The AI's task is to **confirm and explain it**, not to defend its own contrary result.
2. The AI's passing result is **not a refutation**. It is demoted to an **unexplained divergence** that the AI must resolve.
3. Only **evidence** disproves an Owner observation — never reasoning, never a green test suite, never a prior PASS, never repetition.
4. While the divergence stands: **no PASS, no bug closure, no RC, no "cannot reproduce" as a conclusion.**
5. The **burden of proof sits with the AI**, always. The Owner is never asked to justify what they saw.

## §2. Required response to a conflict

On any "still broken" / "vẫn vậy" report the AI must, in this order:
1. Adopt the Owner's observation as the active hypothesis, in writing.
2. Publish its own Identity Block **and** state what is known/unknown about the Owner's surface (Article II §4).
3. Enumerate **every** environmental difference that still exists (auth, surface, observation capability, input modality, data, device…).
4. Attempt to satisfy the differences — first by its own means, then by naming exactly what only the Owner can unlock.
5. Report `BLOCKED` or `UNVERIFIED`. **`PASS` is unavailable while the divergence is unexplained.**

## §3. Forbidden rebuttals

"It works on my machine" · "the tests are green" · "the code is logically correct" · "the mechanism cannot produce that" · "you must be on the wrong build" *(as an assertion rather than a proven fact)* · asking the Owner for more evidence **instead of** obtaining it. Each of these is a rebuttal by reasoning against an observation — the exact inversion this Article forbids.

## §4. Closure

An Owner-observed bug is closed **only** by: (a) the Owner confirming it is fixed, or (b) evidence that identifies the true cause of the Owner's observation and explains it fully — including "the Owner tested surface X" **proven**, never assumed.

---

**Adopted as Articles I–III of the TappyAI Engineering Constitution. Companion documents:** ADR-015 (rationale), `BUG_REPRODUCTION_GATE_WORKFLOW.md` (diagram + evidence pack), `BUG_ASSIGNMENT_PROTOCOL.md` (intake + conflict handling), `RELEASE_GATE.md` (gates G0–G7).
