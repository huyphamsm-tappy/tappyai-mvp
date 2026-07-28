# RCA — Owner UAT FAILED vs E2E "PASS" Discrepancy

**Date:** 2026-07-28 15:0x · **Investigation only — no code written, no fixes proposed, nothing committed.**
**File is intentionally left UNCOMMITTED per the no-repository-operations directive.**

## Verdict (root cause, with the one fact that decides it)

**The owner and the E2E run almost certainly did not test the same build.** The migration exists ONLY on `localhost:3300`. Both other plausible test surfaces serve pre-migration code where both bugs reproduce immediately and necessarily:

| Surface | What it serves | Evidence (collected 15:00, timestamps below) | Bugs present? |
|---|---|---|---|
| **https://www.tappyai.com (production)** | Pre-migration `1184bd5` | `GET /api/version` → `{"v":"1184bd55956…"}` — nothing was ever pushed/deployed (release gate held) | **YES — by definition** |
| **http://localhost:3000** | **Stale pre-migration build cached in a running process** | Server PID 24412 started **12:31:49** — 86 min BEFORE the first migration commit (M2 `2d44f1a`, 13:57). Its HTML references chunk `page-b3e0330c9e3fc196.js`, which **no longer exists on disk**; the server answers **HTTP 400** for its own chunk. A browser that ever visited it uses its immutable-cached copy of that old chunk → runs the **legacy** restore code | **YES** |
| **http://localhost:3300 (RC)** | RC build `8da316e`/`0378fce` | Server PID 10000 started 14:42:36 (post-audit-fix build). Serves `page-586b3d523944c679.js` — the only chunk on disk; it contains the `exploreSession` marker (1 hit) and **zero** legacy markers (`reviewsReturn` = 0) | Anonymous NAV-003 path re-verified **again at 15:01:30** (below) |

**Fresh re-verification on 3300 (owner's U1 scenario, anonymous), run during this RCA:**
```
{"timestamp":"2026-07-28T08:01:30Z(UTC)","url":"/reviews","phase":"active",
 "activeReviewId":"2fd1deeb-347a-4ddb-bda8-84826e0445ad","activeIndex":2,
 "scrollTop":1440,"clientH":720,"rcStillRestoresExact":true}
```
Sequence: scroll to clip 2 (id `2fd1deeb…`) → author profile (push) → browser Back → exact clip restored (index 2 = scrollTop 1440/720). Screenshot still not capturable — the Browser pane is not displayed, so the page does not composite; this limitation was declared in the original evidence doc and stands.

## Answers to the six mandated questions

**1. Same build?** Almost certainly **NO** — see table. My evidence was collected exclusively on 3300. The UAT guide named 3300, but 3000 is the historical muscle-memory port (used by every earlier session) and production is the habitual UAT surface. **I need one fact from the owner: which URL was tested.** Contributing process fault on my side: I left a known-stale server alive on the familiar port while directing UAT to an unfamiliar one — a trap I created and documented (in memory) but did not neutralize.

**2. Same navigation paths?** Partially. The anonymous other-profile→Back path (NAV-003 shape): yes, and it passes on 3300 (re-verified above). The **authenticated My-Profile path (NAV-004): NO — never exercised in a browser.**

**3. Did E2E exercise the authenticated flow?** **NO — and the report said so.** Verbatim from `EXPLORE_NAV_E2E_EVIDENCE.md`: BT-02 was graded PASS as *"(anon mechanics) / E2-shape"* only, and *"BT-02/03/05 authenticated (My Profile 'Hồ sơ')"* is listed **BLOCKED** ("Requires real sign-in; OAuth clicking is forbidden… Owner UAT"). Readiness checklist item 18: BLOCKED. However — my conversational summaries ("BT-02 mechanics now pass exactly") could reasonably be read as "NAV-004 is fixed." That is a real communication failure on my part: **NAV-004's authenticated reproduction was never demonstrated fixed in a browser.**

**4. Assertions checking the wrong condition?** For the cells that ran: no — assertions checked `activeReviewId` equality, `activeIndex`, and `scrollTop/clientHeight` alignment of the live container, which directly encode "the same clip is on screen." But assertions cannot compensate for testing the wrong build (Q1) or the untested path (Q3).

**5. Was restore logic never executed?** On 3300: it executed (phase transitions `restoring→active` observed; scroll moved; re-verified at 15:01). On production or 3000: **the restore logic does not exist in the served bundle at all** — nothing to execute.

**6. Another code path bypassing ExploreSession?** On the RC build, the audit found none (single-writer sweep; N2 latent-only). On the surfaces above, the "bypassing path" is the entire legacy mechanism, still shipped there.

## Second hypothesis — applies EVEN IF the owner tested 3300 (authenticated NAV-004 case)

The frozen spec **changed what Back does** on the My-Profile path. BT-03: pressing browser Back while on the "Hồ sơ" tab **follows transport and may leave `/reviews` entirely** (the tab switch deliberately creates no history entry — P2); the saved clip is restored **on the next re-entry into Explore**, not by the Back press itself. The ORIGINAL NAV-004 symptom was "Back from My Profile loses my clip." An owner reproducing their original steps on the RC would see: Back → leaves `/reviews` → *looks identical to the old bug* unless they then re-enter Explore and observe the clip restored. If the owner's failing scenario is exactly this, the observation and the spec may both be "correct" and the spec's BT-03 semantics are what failed *product* acceptance — an owner-level spec decision, not a regression I can adjudicate.

## Exact reproduction request (to close this RCA)

Please provide, for each of the two failing bugs:
1. **URL tested** (production / localhost:3000 / localhost:3300 / other device).
2. **Signed in?** (yes/no)
3. **Exact steps** — especially what "Back" was pressed where, and what you expected it to do.
4. If it was localhost: F12 console → `typeof window.__exploreSession` — `"object"` = RC build; `"undefined"` = pre-migration build (instant discriminator).
5. If convenient: `__exploreSession.getState()` and `__exploreSession.snapshot()` at the failure moment.

**Clean-room repro of the RC (recommended):** open a NEW browser window → `http://localhost:3300/reviews` (port 3300 exactly; 3000 must not be used — its process serves a dead build and will also poison that origin's browser cache) → hard reload (Ctrl+Shift+R) once → run the scenario. Ports are distinct cache origins, so 3300 is unaffected by any earlier 3000 visits.

## Process corrections identified (no action taken pending your instruction)
1. The stale port-3000 server should be stopped (it is another session's process — I have not touched it) or the UAT guide must carry a red warning; it currently 400s its own assets and weaponizes browser cache.
2. Every future evidence row will carry the tested URL + build discriminator (`__exploreSession` presence + chunk hash) inline, not only in the header.
3. "PASS" language in conversation summaries will name the exact scope ("anon mechanics on 3300"), matching the evidence table's precision.
4. The authenticated NAV-004 scenario remains **the** unclosed verification and stays RED until it reproduces correctly under your hands or an owner-authorized session.

**No PASS is claimed for the owner's scenarios. Status: NAV-003 / NAV-004 = OPEN, UAT = FAILED, awaiting the five facts above.**
