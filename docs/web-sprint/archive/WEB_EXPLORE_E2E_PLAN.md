# Web Explore Sprint — E2E Verification & Acceptance Plan

**Status:** PREPARED, NOT EXECUTED. Awaiting (1) Browser pane displayed, (2) authenticated session.
**Constraints in force:** no push · no merge · no deployment · no Android · no ticket closure · no evidence collection until both prerequisites exist.

## Environment contract (fixed before Step 1)

| Item | Value |
|---|---|
| **BEFORE (pre-fix)** | Production `https://www.tappyai.com` — commit `1184bd5` (verify via `/api/version`) |
| **AFTER (fixed)** | Local production build — `http://localhost:3300` (real `next build` output, already running) |
| Commits under test | `8b9d7d5` (FOLLOW-002) · `73ec5dc` (HEADER-001) — local only, unpushed |
| Locale | `vi` (`localStorage.tappy_lang = 'vi'`) — labels are Vietnamese |
| Breakpoints | Mobile **375×812**, Desktop **1280×800** |
| Auth | Same signed-in account on BOTH origins where a step requires it |

**Rule:** BEFORE evidence comes only from production; AFTER evidence only from `:3300`. Never mix.

**Pre-flight (record once, attach to the report):**
- [ ] `GET https://www.tappyai.com/api/version` → confirm `1184bd5`
- [ ] `:3300` reachable, serving the built output
- [ ] `GET /api/profile` on the origin under test → **200** (authenticated) for Steps 2–3
- [ ] Browser pane displayed (screenshot capability confirmed with one throwaway capture)
- [ ] Browser console cleared before each numbered step

---

## 1. E2E checklist — WEB-EXPLORE-HEADER-001

**Requirement:** Explore header renders **Đăng bài · Đang follow · Đề xuất · Mới nhất** (approved order).

### 1A — BEFORE (production, mobile 375)
- [ ] `H1.1` Navigate prod `/reviews`, locale `vi` → **screenshot** `header-001-before-mobile.png`
- [ ] `H1.2` Record header children (tag + text + visible) → expect **3** items, no "Đăng bài"
- [ ] `H1.3` Record: is any `Đăng bài` **text** visible anywhere on screen? → expect **no**

### 1B — AFTER (local :3300, mobile 375)
- [ ] `H1.4` Navigate `:3300/reviews`, locale `vi` → **screenshot** `header-001-after-mobile.png`
- [ ] `H1.5` Header children in DOM order → expect exactly: `A "Đăng bài"` · `BUTTON "Đang follow"` · `BUTTON "Đề xuất"` · `BUTTON "Mới nhất"`
- [ ] `H1.6` "Đăng bài" `href` = `/reviews/new`, `visible: true`
- [ ] `H1.7` Tap "Đăng bài" → lands on `/reviews/new` (composer) → **screenshot** `header-001-after-composer.png`
- [ ] `H1.8` "Đăng bài" carries **no** selected-tab underline; tapping a feed filter does not style it as selected

### 1C — AFTER (local :3300, desktop 1280)
- [ ] `H1.9` **Screenshot** `header-001-after-desktop.png`
- [ ] `H1.10` Header "Đăng bài" → `visible: false` (`md:hidden`); sidebar still shows its "Đăng bài" → **no duplicate CTA**

### 1D — Locale
- [ ] `H1.11` Switch to `en` → header item reads **"Post"** (reuses `reviews.sidebarPost`); order unchanged

**Pass:** H1.5, H1.6, H1.7, H1.10 all true, with before/after screenshots at both breakpoints.
**Open decision (owner):** `md:hidden` scoping — mobile-only as specified, or show at all widths?

---

## 2. E2E checklist — WEB-EXPLORE-FOLLOW-002

**Requirement:** Tap "+" → follows the author → UI updates immediately → backend succeeds → **persists after refresh**.
**Precondition:** authenticated; a feed clip whose author is **not** you and **not already followed**.

### 2A — BEFORE (production)
- [ ] `F2.1` Prod `/reviews`, authenticated → **screenshot** `follow-002-before.png`
- [ ] `F2.2` Confirm the "+" is a **non-button** element (no `aria-label`, tag ≠ BUTTON)
- [ ] `F2.3` With network panel recording, click the "+" → expect **zero** requests to `/api/users/*/follow`, **zero** DOM change (the defect)

### 2B — AFTER: click + network + backend
- [ ] `F2.4` `:3300/reviews`, authenticated → **screenshot** `follow-002-after-before-click.png`
- [ ] `F2.5` Record target: author `user_id`, `is_following` (expect `false`) from `/api/reviews/feed`
- [ ] `F2.6` "+" element is `BUTTON` with `aria-label="Theo dõi"`
- [ ] `F2.7` **Click** → capture **network request**: `POST /api/users/{author_id}/follow`
- [ ] `F2.8` Capture **backend response**: status **200**, body `{ following: true, follower_count: N }`
- [ ] `F2.9` Record `follower_count` before/after → expect **+1**

### 2C — AFTER: React state + immediate UI
- [ ] `F2.10` "+" disappears **immediately** on that card (no reload)
- [ ] `F2.11` If the same author appears on other slides, their "+" is gone too (all rows updated)
- [ ] `F2.12` **Screenshot** `follow-002-after-click.png`

### 2D — AFTER: database / server truth
- [ ] `F2.13` Read back `GET /api/reviews/feed` → that author's rows now carry `is_following: true`
- [ ] `F2.14` Corroborate via `GET /api/users/{author_id}` → `is_following: true`, `follower_count` = the incremented value
> **Method note:** direct DB console access is unavailable in this environment. Server-side truth is verified through the authoritative API read-back (a fresh server query, not client state). If direct `user_follows` inspection is required for acceptance, that must be run by the owner.

### 2E — AFTER: refresh persistence
- [ ] `F2.15` **Hard refresh** `/reviews`
- [ ] `F2.16` "+" is still absent for that author → **screenshot** `follow-002-after-refresh.png`
- [ ] `F2.17` `/api/reviews/feed` still returns `is_following: true` for those rows

### 2F — Guard rails
- [ ] `F2.18` Own posts: no "+" rendered
- [ ] `F2.19` Signed **out**: clicking "+" redirects to `/login?returnTo=%2Freviews` *(already verified locally)*
- [ ] `F2.20` Failure path: with the request forced to fail, the "+" **reverts** (optimistic rollback)
- [ ] `F2.21` Browser console **clean** (no errors/warnings introduced)

**Pass:** F2.7, F2.8, F2.10, F2.13, F2.16 all true with screenshots.

---

## 3. E2E checklist — WEB-EXPLORE-NAV-003

**Purpose:** PROVE OR DISPROVE the hypothesis. **Neutral by construction** — capture the same data points in both flows and locate the first divergence. Do not assume the outcome.
**Precondition:** authenticated (Case B requires `me`). Run on production first (the reported environment), then `:3300` only if behavior differs.

### 3A — Instrumentation (identical for both cases)
Capture at every checkpoint:
- [ ] `location.href`
- [ ] `history.length`
- [ ] whether **`popstate`** fired (install a counter/listener before starting)
- [ ] `sessionStorage['tappy:reviewsReturn']` (raw value: `{clipId, feedType}` or absent)
- [ ] active clip **id** and **index**
- [ ] feed container `scrollTop` and computed slide index
- [ ] the feed tab in effect (`for-you` / `following` / `latest`)

### 3B — Case A: Explore → **Other user** profile → Back
- [ ] `N3.1` On `/reviews`, scroll to a **non-first** clip (index ≥ 2). Record all 3A fields → **screenshot** `nav-003-caseA-1-feed.png`
- [ ] `N3.2` Open the author's profile (avatar/handle). Record all 3A fields → **screenshot** `nav-003-caseA-2-profile.png`
- [ ] `N3.3` Press **Back**. Record all 3A fields → **screenshot** `nav-003-caseA-3-back.png`
- [ ] `N3.4` Result: is the active clip id **identical** to N3.1? (expected per ticket: yes)

### 3C — Case B: Explore → **My** profile → Back
- [ ] `N3.5` Return to `/reviews`, scroll to a **non-first** clip. Record all 3A fields → **screenshot** `nav-003-caseB-1-feed.png`
- [ ] `N3.6` Open **My Profile** (bottom nav / sidebar). Record all 3A fields → **screenshot** `nav-003-caseB-2-profile.png`
- [ ] `N3.7` Press **Back**. Record all 3A fields → **screenshot** `nav-003-caseB-3-back.png`
- [ ] `N3.8` Result: active clip id vs N3.5 — same, different, or feed left entirely?

### 3D — Divergence analysis
- [ ] `N3.9` Tabulate A vs B at each checkpoint; identify the **FIRST** field that differs
- [ ] `N3.10` Determine for each case: did `popstate` fire on Back? was `tappy:reviewsReturn` **written**? was it **read/consumed**?
- [ ] `N3.11` State whether the evidence **supports or refutes** the hypothesis (push vs `router.replace`; page unmount vs tab toggle; restore gated on `isBackForwardMount()` + a saved clip)
- [ ] `N3.12` If refuted → record the actual mechanism and re-open RCA. **No implementation either way** until owner approves.

**Deliverable:** side-by-side A/B evidence table + sequential screenshots + explicit **hypothesis: APPROVED / REJECTED**.

---

## 4. Owner Acceptance checklist

A ticket may be submitted for acceptance **only** when every box is ticked.

**Per ticket:**
- [ ] Reproduction steps documented
- [ ] Expected vs Actual recorded
- [ ] **Before** screenshot (production `1184bd5`)
- [ ] **After** screenshot (local build `:3300`)
- [ ] Sequential screenshots for multi-step flows
- [ ] Network evidence (request + response) where applicable
- [ ] Server/DB truth verified by API read-back where applicable
- [ ] React state / UI update evidence
- [ ] Router & history evidence (NAV-003)
- [ ] Browser console **clean**
- [ ] Root cause stated and evidence-backed
- [ ] Blast radius stated
- [ ] Regression checklist (§5) executed and passing
- [ ] Files changed + commit SHA listed

**Sprint-level gate:**
- [ ] HEADER-001 complete
- [ ] FOLLOW-002 complete
- [ ] NAV-003 hypothesis approved **or** rejected with evidence (implementation, if any, separately approved)
- [ ] No unrelated changes in the diff
- [ ] Full test suite green (**326/326**) + `next build` clean
- [ ] Open decision resolved: HEADER-001 `md:hidden` mobile-only vs all widths
- [ ] **Owner explicitly approves** → only then may push/merge/deploy be discussed

**Nothing is "fixed" until accepted here. No push before acceptance.**

---

## 5. Regression checklist

Run on the **AFTER** build (`:3300`) before submitting; re-run post-deploy when that is eventually approved.

**Explore feed — core**
- [ ] `R1` Feed loads; 3 filters (Đang follow / Đề xuất / Mới nhất) switch correctly
- [ ] `R2` Upload clips autoplay muted, loop; unmute on first tap
- [ ] `R3` YouTube-linked clip still plays (iframe mounts in view) — **pane must be displayed**
- [ ] `R4` Photo posts render (single + carousel)
- [ ] `R5` Vertical swipe/scroll: one active clip; no orphan audio
- [ ] `R6` Pagination (infinite scroll) loads page 2
- [ ] `R7` Back-restore-to-same-clip still works from an **other-user** profile (must not be broken by NAV-003 work)

**Social actions**
- [ ] `R8` Like / unlike round-trips with live count
- [ ] `R9` Comment post + count update; delete own comment
- [ ] `R10` Save / unsave persists
- [ ] `R11` Follow from **creator profile page** still works (pre-existing path)
- [ ] `R12` Follow from **user search** still works (`toggleFollow` untouched)
- [ ] `R13` Share sheet opens with correct canonical URL

**Header / navigation**
- [ ] `R14` Header CTA does not overlap or displace the 3 filters at 375 / 768 / 1280
- [ ] `R15` Desktop sidebar unchanged; bottom-nav "+" unchanged
- [ ] `R16` Profile clip viewer (ProfileTab) renders — `showFeedTabs=false`, no header CTA, no "+" (no `onFollow` passed)
- [ ] `R17` Tab switches (Discover / Search / Inbox / Profile) still work

**Cross-cutting**
- [ ] `R18` Anonymous browsing works; gated actions redirect to `/login?returnTo=…`
- [ ] `R19` vi ↔ en switch correct on all touched strings
- [ ] `R20` No new console errors; no layout shift on the feed header
- [ ] `R21` Feed API cache headers unchanged: anon → `public, s-maxage=30`; authed → `private, no-store` + `Vary` (guards the earlier P0 fix — `is_following` is personalized and must never be publicly cached)
- [ ] `R22` `326/326` tests pass; `next build` exit 0

---

**Execution order (fixed):** Step 1 HEADER-001 → Step 2 FOLLOW-002 → Step 3 NAV-003 → §5 regression → §4 acceptance submission.
**No code changes. No commits altered. No push before Owner Acceptance.**
