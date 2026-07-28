# Playback Architecture — Implementation Plan

**Ticket:** WEB-EXPLORE-YOUTUBE-001 · **Architecture:** `PLAYBACK_CONTROLLER_ARCHITECTURE.md` v3 (FINAL/APPROVED)
**Status:** PLAN ONLY — awaiting owner approval. No code, no commits, no push, no merge, no deployment.
**Baseline:** worktree `73ec5dc` (2 ahead of `origin/main`); production untouched at `1184bd5`.

## Guiding constraint

> **Phase 1 must not change upload behaviour by a single frame.** Upload is the highest-traffic path and is currently working. The entire phasing exists to keep it that way while YouTube gains transport.

---

# PHASE 1 — Abstraction + YouTube + Upload adapter

**Goal:** YouTube becomes controllable (play/pause/stop/seek with real state). Upload behaviour byte-for-byte unchanged.

### 1.1 Contracts *(no behaviour change)*
Define `PlaybackController`, `TransportState`, `TransportCapabilities`, `PlaybackSession` per architecture §7. Pure types + a controller factory (`sourceType → controller`) — the **single** permitted site of provider knowledge (§9).

### 1.2 `PlaybackSession` *(policy + lifecycle)*
Owns: controller, playback state, `userPaused`, `autoplayEligible`, `audioUnlocked`, visibility state, slide identity, Feed↔Controller synchronization.
Implements the §5 lifecycle table in **one** decision function. `autoplayEligible = active && documentVisible && !userPaused`. `userPaused` sticky; lifecycle `play()` never clears it.

### 1.3 `YouTubeController` *(the actual fix)*
- Outbound: `playVideo`, `pauseVideo`, `stopVideo`, `seekTo(s, true)` via existing raw postMessage (`ytCmd`). Retain `unMute`/`setVolume`.
- **Inbound (Option B):** `listening` handshake → consume `onStateChange` → map to `TransportState.status` (§4 table).
- 🔒 **Origin validation on every inbound message** (`event.origin !== 'https://www.youtube.com'` → return). Verify source frame; defensive parse.
- `capabilities`: `stateIsAuthoritative: true`, `canSeek: true`, `canReportPosition` per what `onStateChange` actually yields.
- `dispose()`: remove listener, stop playback, release frame ref.

### 1.4 `UploadCompatAdapter` *(protective wrapper — NOT a refactor)*
Wraps the **existing** `<video>` implementation to satisfy `PlaybackController` by **delegating into today's logic**. No upload logic rewritten.

> **Delegation rule (mandatory):** for upload, **Session delegates and mirrors — it does not command.** The legacy component remains the single owner of upload playback state; Session's `userPaused` is a *reflection* of it. Session becomes authoritative for upload only in **Phase 3**.

### 1.5 Feed rewiring
Remove all `sourceType` branching from feed/render code (§2). Feed computes `activeIndex` + render window and calls `session.setActive()` / `setInRenderWindow()`; the gesture layer calls `session.onUserPauseToggle()`.

### 1.6 Visibility + pagehide *(Phase 1 per §6)*
One app-level listener pair → `session.onVisibilityChange()` / `onPageHide()`. Passive; must not block unload.

### 1.7 `ytActive` demotion
Retained **only** as mount gate / perf optimization. Must not appear in any playback decision (§3).

**Phase 1 exit criteria:** YouTube pausable/resumable with real state; upload observably unchanged; zero `sourceType` branches in feed code; full suite + build green.

---

# PHASE 2 — Regression & parity verification

No further changes until green. Full checklist in §Verification below. Must include **both** substrates, the §5 lifecycle matrix, visibility/pagehide, overlay parity, and single-embed. Any red → fix or roll back before Phase 3.

---

# PHASE 3 — `HTMLVideoController` migration

Only **after the YouTube path is stable in production-equivalent testing**.

1. Implement first-class `HTMLVideoController`, migrating behind the interface: the **300 ms self-healing watchdog**, muted-first play ladder, attached-sound companion audio, watch-progress/`onDurationKnown`.
2. Transfer upload state ownership from the legacy component to `PlaybackSession` (ends dual ownership).
3. **Remove `UploadCompatAdapter`** and the legacy internal state.
4. Re-run the **entire** Phase 2 checklist.

**Phase 3 exit criteria:** adapter deleted; Session authoritative for both substrates; no behavioural delta vs Phase 2 baseline.

---

# Expected regression risks

| # | Risk | Phase | Impact | Likelihood | Mitigation |
|---|---|---|---|---|---|
| R1 | **Dual state ownership** — Session and legacy upload component both hold `userPaused`; watchdog resumes a Session-issued pause | 1 | **High** | Medium | §1.4 delegation rule (Session mirrors, never commands, for upload); dedicated pause-stickiness test |
| R2 | **Watchdog fights new lifecycle** — 300 ms resume loop overrides `pause()` on deactivate | 1 | **High** | Medium | Route all upload pause through legacy intent flags; verify with the ±1 neighbour case |
| R3 | **Sticky user-pause lost** — "clip won't stay paused" returns | 1/3 | High | Medium | `userPaused` Session-owned + never cleared by lifecycle `play()`; explicit regression case |
| R4 | **YouTube handshake unreliable** — `onStateChange` never arrives → status stuck `idle` | 1 | Medium | Medium | Timeout fallback to `buffering`/`idle`; overlay tolerant of unknown state; log (dev only) |
| R5 | 🔒 **Origin spoofing** — unvalidated inbound message injects fake state | 1 | **Security** | Low | Hard origin check + frame identity check; treat payload as untrusted |
| R6 | **Audio unlock desync** — iOS unmute breaks if notification becomes async | 1 | High | Low | Keep unlock notification synchronous inside the click call stack |
| R7 | **Attached-sound double audio** — companion `Audio` + video both audible | 1/3 | High | Low | Untouched in Phase 1 (adapter); re-verify explicitly in Phase 3 |
| R8 | **Two embeds / orphan stream** — mount gate and `active` disagree | 1 | Medium | Low | `active`-driven mount; assert exactly one live embed |
| R9 | **Orphan audio after navigation** — `pagehide` not firing on bfcache | 1 | Medium | Medium | Handle both `pagehide` and `visibilitychange`; verify on real back-navigation |
| R10 | **Watch-progress analytics regression** (upload) | 3 | Medium | Medium | Migrate callbacks deliberately; compare event payloads before/after |

**Highest-risk items are R1/R2** — both are consequences of the (correct) decision to defer the upload refactor. They are *contained* by the delegation rule, but must be **verified, not assumed**.

---

# Verification checklist

Run on the local production build; every item objectively pass/fail.

### A. Upload — must be UNCHANGED (Phase 1 & 3)
- [ ] `A1` Active clip autoplays muted; loops
- [ ] `A2` First tap unlocks audio; clip becomes audible
- [ ] `A3` Single-tap pauses; tapping again resumes
- [ ] `A4` **Sticky pause:** paused clip stays paused ≥10s (watchdog must not resume)
- [ ] `A5` Scroll away → pause; scroll back → resumes (not stuck)
- [ ] `A6` Attached-sound clip: borrowed track plays, **no double audio**
- [ ] `A7` Attached-sound failure → falls back to clip's own audio (never silent)
- [ ] `A8` Watch-progress / duration callbacks still fire

### B. YouTube — the fix
- [ ] `B1` Active YouTube clip autoplays muted, loops, chromeless
- [ ] `B2` **Single-tap PAUSES the clip** (the ticket)
- [ ] `B3` Tapping again resumes from the same position
- [ ] `B4` **Sticky pause** — stays paused; no lifecycle resume
- [ ] `B5` `getState()` reflects the **real** player (`onStateChange`), not intent — verify `playing`/`paused`/`buffering`/`ended`
- [ ] `B6` Audio unlock unmutes the active YouTube clip
- [ ] `B7` 🔒 Messages from a non-YouTube origin are **ignored** (inject a foreign `postMessage`; state must not change)

### C. Lifecycle matrix (§5) — both substrates
- [ ] `C1` Inside ±1, not active → `pause()` (not stopped/unmounted)
- [ ] `C2` Outside render window → `stop()` → unmounted
- [ ] `C3` Exactly **one** clip playing in steady state
- [ ] `C4` Exactly **one** YouTube embed live; none off-screen streaming
- [ ] `C5` Rapid scrolling leaves no orphan audio

### D. Visibility (Phase 1)
- [ ] `D1` Tab hidden → playback pauses (both substrates)
- [ ] `D2` Tab visible → resumes **only if** not user-paused
- [ ] `D3` User-paused + hide + show → **stays paused**
- [ ] `D4` `pagehide` / back-navigation → stops; **no orphan audio**

### E. Source independence
- [ ] `E1` `grep` feed/render code → **zero** `sourceType` branches (only the factory)
- [ ] `E2` Overlay play/pause icon identical for both substrates

### F. Gates
- [ ] `F1` Full suite green (**326/326** + new tests)
- [ ] `F2` `next build` exit 0; `tsc --noEmit` clean
- [ ] `F3` Browser console clean
- [ ] `F4` Feed cache headers unchanged (anon `public, s-maxage=30`; authed `private, no-store` + `Vary`) — guards the earlier P0
- [ ] `F5` No unrelated diff

### G. Regression (existing feed features)
- [ ] `G1` 3 feed filters, pagination, back-restore-to-clip
- [ ] `G2` Like / Comment / Save / Follow / Share
- [ ] `G3` Photo posts (single + carousel)
- [ ] `G4` Profile clip viewer (`showFeedTabs=false`, no CTA, no "+")

---

# Rollback strategy

**Precondition:** all work lands as **isolated commits on the local `main` worktree**, unpushed until owner acceptance. Production stays at `1184bd5` throughout, so **production rollback is never required during Phases 1–3.**

| Level | Trigger | Action | Cost |
|---|---|---|---|
| **L0 — Uncommitted** | Failure during development | Discard working-tree changes | None |
| **L1 — Per-commit revert** | One phase-1 item regresses (e.g. R4 YouTube handshake) | `git revert` that commit; others stand | Minutes |
| **L2 — Phase 1 rollback** | Upload regression (R1/R2/R3) not resolvable quickly | Revert the Phase 1 commit range → tree returns to `73ec5dc` behaviour | Low — nothing deployed |
| **L3 — Adapter re-instate** | Phase 3 destabilises upload | Revert Phase 3 only; `UploadCompatAdapter` returns; YouTube fix **retained** | Low — this is *why* the adapter exists |
| **L4 — Post-deploy** (future, only after acceptance) | Regression found in production | Revert the merge commit on `main` → redeploy previous SHA | Standard deploy cycle |

**Structural rollback property:** because YouTube (Phase 1) and upload refactor (Phase 3) are separated, a Phase 3 failure **never** costs the YouTube fix, and a Phase 1 failure **never** touches working upload code. This is the primary engineering benefit of the owner's revised ordering.

**Commit granularity (enables L1):** contracts · Session · YouTubeController · UploadCompatAdapter · feed rewiring · visibility/pagehide — separate commits, one concern each.

---

# Sequencing summary

| Phase | Deliverable | Gate to proceed |
|---|---|---|
| **1** | Contracts, Session, YouTubeController, UploadCompatAdapter, feed rewiring, visibility | Exit criteria met; suite + build green |
| **2** | Regression + parity verification | **All** checklist items pass; owner review |
| **3** | `HTMLVideoController`; adapter removed | Full Phase 2 checklist re-run green |

---

**No code written. No commits. No push. No merge. No deployment. Android remains PAUSED.**
**Awaiting explicit owner approval before Phase 1.**
