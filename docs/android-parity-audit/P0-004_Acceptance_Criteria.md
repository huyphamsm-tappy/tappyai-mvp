# P0-004 — YouTube Playback: Acceptance Criteria (Phase 2)

**Status:** DESIGN / ACCEPTANCE ONLY. Defines the **observable behavior** required for Android↔Web parity. No implementation, no technology choice — those are Phase 3 (pending owner approval).
**Parity target:** frozen Web Production `main` @ `8a1be53` (see `P0-004_YouTube_Parity_Design.md` §1–§12).
**Test surface:** Android reviews feed + review-detail, on a real device, against production data (a review with `source_type='youtube'` exists in the live feed, id `f181e696-…`).

**How to read this doc:** each criterion is `AC-<section>.<n>`, written as an objectively testable assertion with a concrete verification method. Tags:
- **[Parity]** = must match Web Production's observable behavior.
- **[Floor]** = minimum stability bar where Web's own contract is thin (Web defers to YouTube's in-frame UI); Android must at least not crash / not block.
- Numeric bounds marked **{tunable}** are placeholders for the owner to fix before sign-off.

---

## 1. Functional acceptance

- **AC-1.1 [Parity]** A review with `source_type=youtube` and a valid YouTube URL renders **moving video**, not a static poster. *Verify:* open the known YouTube review → visible motion within **{tunable ≤3s}** on a normal connection.
- **AC-1.2 [Parity]** The **correct** video plays — the one identified by the id in `source_url`/`media_url`. *Verify:* the on-screen video matches the source URL's 11-char id (spot-check title/frames).
- **AC-1.3 [Parity]** YouTube reviews play in **both** the feed pager and the review-detail screen. *Verify:* the same clip shows motion in the feed and after opening it to detail.
- **AC-1.4 [Parity]** A YouTube clip shows the **same overlays** as an upload clip: author handle, body caption, place line, and the Like/Comment/Save/Share/sound rail. *Verify:* all overlays present and the rail actions respond.
- **AC-1.5 [Floor]** The review's `body` caption (e.g. "Hình ảnh không hiển thị…") still renders as caption text and is **not** mistaken for or replaced by an error UI. *Verify:* caption text visible over the clip.

## 2. Playback acceptance

- **AC-2.1 [Parity]** When a YouTube clip is the in-view clip, playback **starts automatically with no tap**. *Verify:* scroll it into view → motion within **{tunable ≤3s}**, zero taps.
- **AC-2.2 [Parity]** Playback **loops** — on reaching the end it restarts without user action. *Verify:* watch a short clip to its end → it restarts.
- **AC-2.3 [Parity]** Playback is **chromeless** — no YouTube control bar, title card, or branding overlay obscuring the feed presentation. *Verify:* no YouTube controls visible during playback.
- **AC-2.4 [Parity]** A YouTube clip that is **not** the in-view clip does **not** play (no motion, no audio). *Verify:* an off-screen/neighbour YouTube clip shows its poster only.
- **AC-2.5 [Parity]** At most **one** YouTube clip plays at any moment in steady state. *Verify:* only the in-view clip shows motion/emits audio (a brief overlap during a scroll transition is acceptable — see AC-3.x).

## 3. Scrolling behavior

- **AC-3.1 [Parity]** Scrolling from a YouTube clip to the next clip **stops** the YouTube clip (no residual motion, no residual audio) and the next clip becomes active. *Verify:* after the swipe, the previous YouTube clip is silent and not playing.
- **AC-3.2 [Parity]** Scrolling **away and back** to a YouTube clip **re-plays** it (never "stuck paused"). *Verify:* leave the clip, return → it autoplays again.
- **AC-3.3 [Floor]** Rapid scrolling through many clips leaves **no orphaned audio** and no lingering playback from any scrolled-past YouTube clip. *Verify:* fast-scroll 10+ clips → only the settled in-view clip is audible; silence otherwise.
- **AC-3.4 [Parity]** A **mixed feed** (upload and YouTube interleaved) hands off single-active playback correctly in both directions. *Verify:* upload→YouTube→upload swipes each leave exactly one active clip.

## 4. Audio policy

- **AC-4.1 [Parity]** On first appearance in a fresh session, a YouTube clip starts **muted** (silent before any user interaction). *Verify:* first YouTube clip after app launch → no audio.
- **AC-4.2 [Parity]** After the user's **first tap anywhere**, the in-view YouTube clip becomes **audible**. *Verify:* tap → sound within **{tunable ≤1s}**.
- **AC-4.3 [Parity]** The audio unlock is **app-wide and shared with upload clips** — once unlocked by any tap (on an upload OR a YouTube clip), subsequent YouTube clips are audible without an extra unlock tap. *Verify:* unlock on an upload clip, scroll to a YouTube clip → audible with no further tap.
- **AC-4.4 [Parity]** Only the in-view clip is audible; scrolling transfers audio to the new clip and silences the previous. *Verify:* per swipe, audio follows the active clip.
- **AC-4.5 [Parity]** There is **no mute/unmute button** on the clip (sound is always on once unlocked). *Verify:* no mute control present on YouTube (or upload) clips.

## 5. Error handling

*(Web's contract is deliberately thin — §11. These criteria hold Android to Web's graceful cases plus a no-crash floor; richer error UX is a Non-goal §10.)*

- **AC-5.1 [Parity]** A YouTube review whose URL yields **no extractable id** shows the **poster** (thumbnail or placeholder) with no player, and the app stays stable (no crash, feed still scrollable). *Verify:* seed/inspect a malformed-URL YouTube review → poster shown, app stable.
- **AC-5.2 [Parity]** A **broken/missing thumbnail** falls back to a placeholder poster (no broken-image state). *Verify:* YouTube review with an unreachable thumbnail → placeholder shown.
- **AC-5.3 [Floor]** An **unplayable** video (removed/private/embedding-disabled/age-restricted/geo-restricted) does **not crash** the app and does **not block scrolling** — the user can scroll past. *Verify:* a known-unplayable YouTube review → no crash, no ANR, feed remains scrollable. *(Android is NOT required to detect the specific reason or show a custom message — matching Web, which defers to YouTube's in-frame UI or a blank frame.)*
- **AC-5.4 [Floor]** **Offline / network failure** while a YouTube clip is in view does not crash the app and leaves the feed scrollable. *Verify:* enable airplane mode, open the YouTube clip → no crash; scrolling still works; a poster/placeholder is shown.

## 6. Performance

- **AC-6.1 [Parity]** Scrolling a YouTube-containing feed stays **smooth** — no sustained jank/ANR attributable to YouTube clips. *Verify:* scroll a YouTube-heavy feed for {tunable ≥30s} → no ANR; frame rate within the app's existing feed budget.
- **AC-6.2 [Parity]** **At most one** YouTube video streams at a time in steady state. *Verify:* observe network traffic while parked on a YouTube clip → exactly one active YouTube media stream; off-screen clips generate none.
- **AC-6.3 [Parity]** **Time-to-first-frame** for an in-view YouTube clip is **{tunable ≤3s}** on a normal connection. *Verify:* measure from clip-becomes-active to first visible frame.
- **AC-6.4 [Parity]** Off-screen YouTube clips generate **no** ongoing network or CPU cost (not merely paused). *Verify:* park off-screen → network idle for that clip, CPU returns toward baseline.

## 7. Memory

- **AC-7.1 [Floor]** Scrolling through **{tunable ≥20}** YouTube clips does not cause unbounded memory growth or OOM; memory returns toward baseline after settling. *Verify:* memory profiler shows a stable sawtooth, not a monotonic climb; no OOM.
- **AC-7.2 [Floor]** After scrolling past a YouTube clip, its player resources are **released** (player instances do not accumulate). *Verify:* active player/embed count returns to ≤1 after settling.
- **AC-7.3 [Floor]** **No orphaned background audio** persists after leaving a YouTube clip. *Verify:* scroll away → audio stops immediately and does not resume on its own.

## 8. Lifecycle

- **AC-8.1 [Parity]** Backgrounding the app **pauses** YouTube playback — no audio continues in the background. *Verify:* Home/Recents while playing → audio stops.
- **AC-8.2 [Parity]** Returning to the foreground **resumes** the in-view clip. *Verify:* reopen the app → the active YouTube clip plays again.
- **AC-8.3 [Parity]** Navigating to another tab/screen **stops** YouTube playback; returning re-activates the in-view clip. *Verify:* switch tabs → silence; return → plays.
- **AC-8.4 [Floor]** A configuration change (rotation, if reachable) does **not crash** and leaves playback state coherent. *Verify:* rotate → no crash; one active clip.
- **AC-8.5 [Parity]** Opening a YouTube review to detail and pressing **Back** returns to the feed with the feed's active clip playing and **no orphan** playback/audio from the detail view. *Verify:* open detail → Back → feed clip plays, no double audio.

## 9. Regression checklist (must remain unchanged by any P0-004 work)

- **RC-1** Upload (mp4) clips still autoplay muted, unmute on first tap, and loop.
- **RC-2** Photo reviews still render (single image and multi-photo carousel).
- **RC-3** Attached-sound ("use this sound") clips still play the borrowed track without double audio.
- **RC-4** Like / Comment / Save / Follow / Share work on **both** YouTube and upload clips.
- **RC-5** Feed tabs (For You / Following / Latest), pagination, and back-restore-to-same-clip still work.
- **RC-6** Watch-progress/analytics for **upload** clips is unaffected.
- **RC-7** The review `body` caption still displays for all clip types (data, never suppressed).
- **RC-8** No new crash or ANR in the feed or detail screens.
- **RC-9** App startup, auth gate, and top-level navigation are unaffected.

## 10. Non-goals (explicitly out of scope for P0-004 parity)

- **NG-1** Richer error UX than Web — no bespoke "video unavailable" card, no "Watch on YouTube" link, no retry button for embed-level failures (Web defers to YouTube's in-frame UI; matching that thin contract is the bar).
- **NG-2** A mute/unmute button (Web has none).
- **NG-3** A fullscreen affordance / control (Web surfaces none).
- **NG-4** YouTube player controls: scrubbing, seek, quality, captions toggle, next/prev.
- **NG-5** Watch-progress / completion analytics for YouTube clips (Web does not track these for YouTube).
- **NG-6** Eliminating the transient two-embed possibility at the exact scroll crossover (Web does not guarantee this; steady-state single is the requirement — AC-2.5/6.2).
- **NG-7** TikTok / Facebook playback (legacy providers; Web shows poster + external link only). Out of scope for P0-004.
- **NG-8** Choosing or naming the Android rendering technology, or any implementation detail — Phase 3.

---

**No implementation described. No technology chosen. No code written.** This completes the Phase 2 design set for P0-004:
1. `P0-004_YouTube_Parity_Design.md` (§1–§12: contract + failure/fallback + single-iframe verification)
2. `P0-004_Acceptance_Criteria.md` (this document)

Awaiting owner approval to proceed to **Phase 3 (implementation strategy)**.
