# RED Evidence — Owner's Authenticated Scenario (Gate satisfied for Scenario B)

**Date:** 2026-07-29 · **Constitution:** Articles I–V in force · **Verdict:** evidence only, **no PASS claimed**

## Runtime Identity Block (Article II §1)

**Surface under test — production, in the Owner's own Chrome**

```
Surface        : https://www.tappyai.com/reviews
Version (self-reported, authoritative): /api/version → {"v":"1184bd55956ba8e3af38a213fe9f9f72dcf02209"}
Fix present?   : NO — window.__exploreSession === "undefined" (pre-migration build)
Browser        : Owner's real Chrome (extension deviceId f5849670…, isLocal true), tab 1554066564
Identity       : SIGNED IN — session cookies sb-fwznnobrdctuskgrvuik-auth-token.0/.1 present;
                 profile renders "PHẠM ĐOÀN HUY / @phạmđoànhuy / 6 Bài viết"; inbox badge = 2
Language       : vi (localStorage tappy_lang = "vi")
Viewport       : 1568×772 screenshots; feed slide clientHeight = 945
```

**Comparison surface — the fixed build (for contrast only)**

```
Surface     : http://localhost:3000/reviews   (PID 14276, port 3000)
Worktree    : C:/Users/.../worktrees/cool-vaughan-b3c7ff   Branch: claude/nifty-sammet-44374f
Build ID    : KXYE_a7OpJDAxm8WLPLYC · served chunk page-010444d740f52829.js → HTTP 200
Provenance  : f76e9c9 (INFERRED by timestamp, Article II §3)
Identity    : NOT signed in — only PKCE code-verifier cookies present. Language: en
```

**The decisive asymmetry:** in the Owner's own browser, the surface where they are **signed in** (production) has **no fix**; the surface with the **fix** (localhost) has **no session**. Cookies do not cross origins.

## Scenario B — Explore → My Profile → Back · **BUG REPRODUCED (RED)**

| Step | Observation | Evidence |
|---|---|---|
| Feed, clip index 2 | `@huyphạm` — "Tay nắm cửa với móng tay sơn đỏ…", scrollTop 1890 / clientHeight 945, `history.length = 3` | screenshot `ss_72786hrki` |
| Click "Hồ sơ & Bài của tôi" (real mouse click, sidebar) | URL → `/reviews?tab=profile`; **`history.length` stays 3 — no entry created**; feed unmounted (`.snap-y` gone); real profile grid renders (6 tiles) | screenshot `ss_03418g2tf` |
| **Back** | **Left www.tappyai.com entirely** — landed on the previous history entry. Explore, the clip and the feed are all gone | screenshot `ss_0645yu91o` |

**This is the Owner's reported bug, reproduced on the Owner's exact execution path** — signed in, real Chrome, Vietnamese, production.

**Root cause (evidence, not assumption):** the feed→profile tab switch uses `router.replace`, so no history entry exists (`history.length` 3 → 3, measured). Back therefore traverses to whatever preceded `/reviews`. This is the original NAV-004 defect, still present in `1184bd5` because **the fix has never been deployed** — it exists only in the local worktree (commit `f76e9c9`, DFR-001 / BT-02b: feed→profile now *pushes*).

## Scenario A — Explore → Other Profile → Back · **NOT reproduced on this surface**

| Step | Observation |
|---|---|
| Feed, clip index 1 | `@phạmđoànhuy` — "Bánh bao nóng hổi…", scrollTop 945, `history.length = 3` |
| Click author avatar (real mouse click) | `/users/4dcce7cf…`, `history.length` → **4** (push) |
| Back | `/reviews`, **visibleIndex 1, same caption, video mounted** — correct clip restored |

On production, authenticated, the legacy marker logic handled this path. **Scenario A did not fail here.** Per Article I, a bug that does not reproduce gets **no fix** — the Owner's Scenario A observation therefore remains an open divergence (Article III), not a closed item.

## Execution Path Equivalence Matrix (Article IV §5)

| Dimension | Owner | This RED run | Verdict |
|---|---|---|---|
| Authentication | signed in | **signed in (Owner's own session)** | MATCH |
| User role | own profile, own posts | same account, 6 posts | MATCH |
| Feature flags | none known | none known | MATCH (unenumerated both sides) |
| Browser / platform | own Chrome, real window | **Owner's own Chrome**, 1568×772 | MATCH |
| Navigation path | Explore → My Profile → Back | identical | MATCH |
| Data source | production | production | MATCH |
| Runtime configuration | production `1184bd5` | production `1184bd5` (verified) | MATCH |
| Interaction method | mouse click + browser Back | real mouse clicks + real wheel scroll; **Back issued via `history.back()`** (Alt+Left is not deliverable through the extension) | MINOR DIFFER — same history operation, same popstate |

**Classification for Scenario B: REPRODUCIBLE.** Implementation for B is unlocked — but the fix for B **already exists** (`f76e9c9`); nothing further to write.

## Assumption Register (Article V §4)

| ID | Statement | Status |
|---|---|---|
| A1 | The Owner tested a surface without the fix | **EVIDENCE** — their Chrome is signed in only on production, which self-reports `1184bd5` and lacks `__exploreSession` |
| A2 | The B fix resolves the Owner's symptom on the authenticated path | **ASSUMPTION** — verified anonymously on localhost only (PARTIALLY VERIFIED) |
| A3 | Scenario A fails for the Owner | **UNVERIFIED** — could not reproduce on production authenticated |
| A7 | Scenario B's fix is auth-independent | **ASSUMPTION** — plausible (tab/push logic), but Article IV forbids ruling the difference immaterial by reasoning |

## Blocking prerequisite for GREEN (Article I §4)

GREEN requires the Owner's authenticated scenario on a build **containing the fix**. Neither surface offers that today:

| Option | What it needs | Who can do it |
|---|---|---|
| **(a)** Owner signs in at `http://localhost:3000` (same Chrome, one Google click) | AI is forbidden to click OAuth or enter credentials | **Owner** — ~30 seconds |
| **(b)** Deploy the fix to production, then re-run in the existing session | Deploy authorisation (currently frozen) | **Owner** |

Until one of these exists: **no PASS, no bug closure, no RC.** Scenario A stays open as an unexplained divergence.
