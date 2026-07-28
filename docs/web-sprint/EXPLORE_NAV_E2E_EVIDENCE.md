# Explore Navigation — Phase 5 E2E Evidence (Run #1)

**Date:** 2026-07-28 · **Build:** production `next build` + `next start` (port 3300) at commit `c1f9308` · **Session:** anonymous (see Auth-blocked section) · **Console:** zero errors across the entire run (checked repeatedly, including after S1)
**Method:** in-app browser; state dumped via the spec's inspectability surface (`__exploreSession.getState()/snapshot()/getPhase()` — P3), router state via `location`/`history.length`/Navigation Timing. Feed slide verified by `scrollTop / clientHeight` against `activeIndex`.
**Screenshots:** NOT captured — the Browser pane was not displayed in this unattended run (compositing off). Visual confirmation is part of Owner UAT regardless; every cell below carries full state evidence.
**Verdict vocabulary:** PASS (evidence attached) · BLOCKED (cannot execute in this environment — never inferred) · UNIT (proven at unit level; runtime cell pending).

## Executed cells

| Cell | Scenario | Evidence (values observed) | Verdict |
|---|---|---|---|
| BT-16 / E4-half | Cold start, no prior session | phase `active`, snapshot null, mirror null, idx 0 with id echoed, **no restore attempt** | PASS |
| BT-01 / E1 / E7 | Clip 2 (id `2fd1deeb…`) → author profile (push, hist 2→3, freeze `route-change` v1, mirror written) → Back | phase `active`, id exact, idx 2, scrollTop 1440 | PASS |
| BT-13 / E8 | Forward → profile (fresh freeze v2, same id — no stale state) → Back | id exact, idx 2, scrollTop 1440 | PASS |
| S1 / BT-22 | Rapid Back/Forward ×10 (120 ms apart) | terminal `/reviews`, id exact, idx 2, scrollTop 1440, snapVersion 7 (one freeze per departure), zero console errors | PASS |
| BT-14 / E4 | F5 reload on Explore | navType `reload`; pagehide froze → mirror → cold hydrate → id exact, idx 2; mirror consumed after restore | PASS |
| BT-11 / E5 | Search "phở" on search tab → leave via link → Back | `/reviews?tab=explore` restored (URL echo), session query `phở`, input repopulated, search re-ran ("Không tìm thấy kết quả" state faithfully reproduced) | PASS |
| BT-02 (anon mechanics) / E2-shape | Feed clip 1 → tab-switch freeze (`tab-switch`, no unmount, no history) → feed-tab return | phase restoring → active, id exact, idx 1, scrollTop 720, session tab `home` (after fix `c1f9308`), history unchanged | PASS |
| BT-10 | For-You → Mới nhất → back to For-You | `invalidated`, snapshot null, clean top; switching back did NOT resurrect | PASS |
| BT-19 / S14 | 31-min-old snapshot injected via `hydrate()` → `enterExplore()` | frozen → invalidated path taken; snapshot discarded; no ancient clip | PASS (mechanism; wall-clock 30 min not simulated otherwise) |
| BT-18 | visibilityState hidden → visible (property override + real events) | freeze trigger `background` v-snap idx 2 → re-enter → `active`, zero state loss | PASS |
| BT-04 (viewer legs) | Other profile → grid tile → ClipViewer open → close → Back → re-enter Explore | viewer open/close: history.length 7→7 (no entries), URL unchanged, session untouched (same id, still `frozen`); later re-entry restored id exact @1440 | PASS |
| BT-03 | Back landed OFF Explore (`/`, cross-document `back_forward`) → fresh push-visit to `/reviews` (`navType: navigate`) | id exact, idx 2, scrollTop 1440 from durable mirror — **restore on a push-visit, the deliberate spec inversion of legacy case 4** | PASS |
| BT-27 / E9 | Mobile 375×812: scroll to clip 1 → profile → Back | id exact, idx 1, scrollTop 812 (= 1 × mobile clientHeight — viewport-correct math) | PASS |
| E10 / BT-28 (partial) | Desktop viewport | all desktop cells above ran at desktop size; prev/next-arrow round-trip not separately exercised | PASS (core) / arrows pending |
| Telemetry (I6) | `/api/track` POSTs | continuous 200s during freeze/restore activity; event names code-verified in `webExploreSession.emit` | PASS (payload-level capture pending dev-build run) |

## Defect found & fixed during this run
- **Tab stale after feed-tab return** — `setQueryShape({tab})` before `enterExplore()` was clobbered by snapshot adoption (§3.1 adopts wholesale). Fixed by ordering (`c1f9308`), re-verified live (session tab `home` after return). Found only at runtime — the unit sequence used the correct order. This is why the browser matrix exists.

## Spec-behavior observation for owner (no action taken)
- Typing a search query while a feed snapshot is held **invalidates it** (F3 letter: `query` is row-shaping). The feed fetch does not actually use `query` (search is a separate endpoint), so a search detour costs the user their feed position. No BT scenario is violated; flagged as a possible spec v1.1 refinement (exclude `query` from feed-row-shaping or scope it per-surface). Spec is frozen — not changed.

## Blocked / deferred cells

| Cell | Reason |
|---|---|
| BT-02/03/05 authenticated (My Profile "Hồ sơ") | Requires real sign-in; OAuth clicking is forbidden (standing rule). Anonymous profile tab shows the login placeholder. **Owner UAT** or an owner-provided session token. |
| BT-20 (auth change) | Same sign-in constraint. `reportAuthState` unit + code path verified. |
| BT-07 / E6 (trending re-order) | Cannot force a server-side re-order deterministically; id-first resolution proven by unit (re-ordered feed) and by BT-03's index-independent restore. Runtime cell: owner UAT over time. |
| BT-08/BT-09 (clip beyond window / deleted) | Needs data mutation on the shared DB — not done from an anon E2E run. UNIT (F1/F2 fallback chain). |
| BT-17 / S13 (two tabs) | Not run this pass (second pane tab + full flow); sessionStorage is per-tab by platform guarantee. Next run. |
| BT-21 / S11 (storage blocked) | Cannot deny storage in this environment's prod build. UNIT (F4: never throws, reports). |
| BT-24/25 / S4/S5/S10 (in-flight races) | Not reliably scriptable here; F7 user-wins + single-attempt are UNIT-proven; S5 wait-for-load is structural (restore effect gates on `loading`). |
| S2 deep chain ×3, S3/BT-26 ×20 | Shorter equivalents ran (S1 ×10, multiple enter/leave cycles ≈8 this session, versions monotone, one live session throughout). Full-length runs: next pass. |
| S12 rotate mid-restore | Viewport change between freeze/restore was exercised implicitly (desktop→mobile session continuity); explicit mid-restore rotation not scripted. |

## Status line
Runtime E2E: **core matrix PASS (15 cells with evidence), 9 cells BLOCKED/UNIT/deferred as itemized.**
**Product UAT: WAITING FOR PRODUCT OWNER.** Nothing here is a product acceptance verdict; no ticket (NAV-003/NAV-004) is closed by this document.
