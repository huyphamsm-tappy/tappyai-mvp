# UAT-Fix Verification — DFR-001 Item 1 + Item 2 (Run on build `f76e9c9`)

**Date:** 2026-07-28 15:2x–15:3x · localhost:3300, fresh production build · anonymous session · console: **zero errors** across the entire run.
**Gates:** `tsc --noEmit` clean · vitest **381/381** · `next build` exit 0.
**Claims below are Claude's browser evidence — Product UAT: WAITING FOR PRODUCT OWNER.**

## Owner UAT Scenario 2 — My Profile → Back (Item 1 / BT-02b) — evidence

| Step | Observed |
|---|---|
| Feed clip 2 (`2fd1deeb…`), tap "Hồ sơ" | FREEZE `tab-switch`, snapshot clip X; URL → `?tab=profile`; **history 12 → 13 (entry pushed — DFR-001)** |
| **Browser Back** | **Still on `/reviews`**, feed tab (`tab: home`), phase `active`, **clip X restored: id exact, idx 2, scrollTop 1440, `<video>` mounted at the visible slide** — `BT02b_PASS: true` |

## Owner UAT Scenario 1 — Other Profile → Back — evidence
Clip 2 → author profile (push) → Back → id `2fd1deeb…`, idx 2, scrollTop 1440, video at visible slide — `S1_PASS: true`.

**Item 2 adversarial re-run (the exact experiment that proved the bug):** `fetchRef` invoked with the personalization refetch's arguments; response rows rotated by 3. Before: session X @ idx 2. After replacement (t 29:58.428): **session KEPT X · UI followed X to its new index 9 (scrollTop 6480) · `activeIndex` realigned to 9 · video mounted at the visible slide** (`ITEM2_*: all true` — every one of the four proven failure conditions inverted). Then profile → Back: **snapshot froze X (not the stale-slot id) and Back restored X** — `CHAIN_FIXED_RESTORES_X: true`. Feed-type guard: refetch now skips when the current feed is not For-You (BT-12 protection).

## Owner UAT Scenario 3 — '+' button (FOLLOW-002) — not regressed
- Fix commit `f76e9c9` touches only `page.tsx`; **zero** diff hits on `followFromFeed` / `onFollow` / `is_following`.
- Live: '+' badge renders on the visible slide (`aria-label "Theo dõi"`, Plus icon, `bg-[#fe2c55]`).
- Anonymous click → correct FOLLOW-002 anon behavior: redirect to `/login?returnTo=%2Freviews`.
- Signed-in follow round-trip: owner UAT (as always).
- Bonus: returning from the login redirect restored clip X exactly (BT-03 shape holds).

## Regression probes on the reworked paths
- BT-02 tap-return (profile → tap "Khám phá"): clip X restored, video alive — PASS. (One synthetic-click artifact noted: two taps inside a single JS turn share a stale closure and the second is ignored — not reproducible by human interaction.)
- BT-11 search round-trip through the new traversal handler: query "bún" + `?tab=explore` + input repopulated after leave/Back — PASS.

## Known scope notes
- All evidence is anonymous; the authenticated Scenario A trigger (real personalization refetch) is emulated with the identical call + a re-ordered response. Owner's signed-in run is the closing confirmation.
- No RC prepared, no deployment docs touched, nothing merged/pushed/deployed (per instruction).
