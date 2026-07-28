# Explore Navigation Migration — Legacy Removal Report · Dead Code Report · Architecture Audit

**Phase 3 + Phase 4 deliverable** · Date: 2026-07-28
**Spec:** `docs/CANONICAL_EXPLORE_NAVIGATION_SPEC.md` (Design Freeze `ffa7e79`)
**Migration commits:** M1 `63dc74c` · M2 `2d44f1a` · M3 `a9ac82c` · M4 `8ad62de` · M5 `be41eae` · M6 `0178fa1`
**Status of claims:** everything below is grep/test/build evidence produced on this tree. Runtime E2E (Phase 5) and Owner UAT are SEPARATE gates — nothing here closes them.

---

## 1. Legacy Removal Report (L1–L16)

| # | Artifact | Disposition | Commit | Evidence |
|---|---|---|---|---|
| L1 | `RETURN_KEY` | REMOVED | M2 | grep `RETURN_KEY\|reviewsReturn` → 0 code hits |
| L2 | `lastPopStateAt` | REMOVED | M2 | grep → 0 |
| L3 | module `popstate` listener | REMOVED | M2 | grep `popstate` in page.tsx → 0 |
| L4 | `navTimingConsumed` | REMOVED | M2 | grep → 0 |
| L5 | `isBackForwardMount()` | REMOVED | M2 | grep → 0 |
| L6 | `isBackNavRef` | REMOVED | M2 | grep → 0 |
| L7 | `feedType` lazy-init from marker | REPLACED — reads session state (§3.1: shape before fetch) | M2 | page.tsx feedType initializer |
| L8 | `tab` lazy-init from sessionStorage | REPLACED — URL echo wins, else session `tab` | M2 | page.tsx tab initializer |
| L9 | unmount marker write | REMOVED — freeze fires at explicit intent (tab-switch / link-click / background); App-Router segment teardown remains as idempotent §8 signal conversion for programmatic navs (see §4 note N1) | M2 | page.tsx session-edges effect |
| L10 | `didRestoreRef` + restore effect | REPLACED — `session.restore()` with id→index→top and F11 bounded retries | M2 | page.tsx restore effect |
| L11 | ProfileTab sessionStorage tab write | REMOVED | M3 | grep `reviews_tab` → 0 in src/ |
| L12 | tab read/remove side | REMOVED | M2/M3 | same grep |
| L13 | `activeIndexRef` | REMOVED — zero readers post-M2 (only consumer was L9) | M5 | grep in M5 commit body |
| L14 | `reviewsRef` | **KEPT** — 3 readers: scroll reporter (§3.3), visibility re-enter restore ×2. Justified at declaration | M5 | page.tsx comment |
| L15 | `feedTypeRef` | REMOVED — zero readers. The plan's "likely kept (feed loader)" prediction was **falsified**: the fetch effect closes over `feedType` state directly | M5 | M5 commit body |
| L16 | `feedBackRestore.test.tsx` | REPLACED, not lost — full mapping in `ExploreSession.test.ts` header; its "push-visit ≠ Back" case deliberately superseded by BT-03 (restore on ANY re-entry) | M2+M6 | test file header |

## 2. Dead Code Report

- Orphan sweep after M2–M4: `tsc --noEmit` clean; `next lint` on page.tsx shows only one **pre-existing** `exhaustive-deps` warning at the inbox effect (present before the migration; untouched — no drive-by change under the Web freeze).
- No unused imports introduced or left: legacy removal took its imports with it (verified by tsc/lint).
- No dual-path branches, compat shims, or feature flags in the navigation code: grep `adapter|featureFlag|dual` in `src/lib/explore/` → 0. (`UploadCompatAdapter` belongs to the playback track, out of scope by plan §1F.)

## 3. Duplicate-logic / single-owner verification (I2)

Files referencing the session: `page.tsx` (the only UI writer), `webExploreSession.ts` (platform binding + F10 identity edge), `ExploreSession.test.ts` (tests). ProfileTab, ClipViewer, feedShared, Router: **zero** session references. Exactly one restoration mechanism exists in the tree.

## 4. Architecture audit — invariants

| Inv | Statement | Verdict | Evidence |
|---|---|---|---|
| I1 | No business decision reads history | **PASS w/ 2 justified transport uses** | `SoundSheet` popstate (closes a modal), `ReviewBackButton` history.length (destination pick) — inline-justified, write no state |
| I2 | One writer per state row | PASS | §3 above |
| I3 | Freeze = explicit intent, not unmount | PASS (unit: tab-switch freezes with no unmount) | + note N1 below |
| I4 | Restore = visibility, never history event | PASS | restore only runs on `RESTORING`, set by `enterExplore`; no history input exists |
| I5 | Id-first restore | PASS | unit 'restores by id when the feed re-ordered' |
| I6 | Every outcome reported | PASS | `restore()` always returns + emits; unit F1/I6 |
| I7 | Freeze idempotent; restore once/entry | PASS | units F6/I7 + NAV-004 cross-trigger test |
| I8 | Feed persists no navigation state | PASS | grep: only `tappy_like_count` (personalization counter, not navigation) + session mirror inside the binding (session-owned by design) |
| I9 | All profile paths identical | PASS at unit level; **E1≡E2 pending Phase 5 browser evidence** | NAV-004 test |
| I10 | No temporary adapters | PASS | §2 |
| I11 | Session unit-tests with no UI framework | PASS | test file runs in plain Node, no jsdom |
| I12 | Snapshot JSON-lossless | PASS | V3/I12 unit |

**Note N1 (flagged for owner review):** M2 keeps a `leaveExplore('route-change')` call in the page's unmount cleanup. This is **not** the L9 pattern returning: it reads no UI values (state was reported continuously), it is idempotent behind the click/tab/background intent signals, and it exists solely because App-Router segment teardown is the only observable signal for programmatic navigations the page doesn't own (child-modal `router.push`, auth redirects). Without it, any un-instrumented departure would silently lose state — the exact legacy defect class. Spec §8 names "route change" as the Web departure signal; this is its conversion point. If the owner reads I3 more strictly, the alternative is instrumenting every programmatic departure individually.

## 5. Failure scenarios F1–F11 (wiring status)

F1/F2 fallback chain (unit + restore effect) · F3 setQueryShape on feed-type/query (M2) · F4 storage-broken units · F5 mirror hydrate on cold start (unit) · F6/F7 units + scroll reporter marks user input · F8 ClipViewer contract (M4) · F9 stale-30min unit · F10 `reportAuthState` binding + `authResolved` restore gate · F11 bounded rAF retries then reported top-fallback. Runtime proof deferred to Phase 5.

## 6. Memory-leak review

- One module singleton session per tab (by frozen design); `resetExploreSessionForTests` seam for tests.
- All listeners added by the migration (visibilitychange, pagehide, pageshow, scroll) are removed in effect cleanups (S3 will verify at runtime, BT-26).
- No timers introduced; F11 retries are bounded (≤10 rAF).

## 7. Gates summary

`tsc --noEmit` clean · vitest **380/380** · `next build` exit 0 · DoD greps as above.
**NOT claimed:** E2E matrix (Phase 5), Owner UAT, NAV-003/NAV-004 ticket closure (each needs its own re-test evidence). Production untouched; nothing pushed or deployed.
