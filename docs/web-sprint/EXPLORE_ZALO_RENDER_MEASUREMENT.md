# Explore — Rendered-viewport measurement, authenticated ZALO session

**Date:** 2026-07-29 · Production `8d565f8` · in-app Browser pane (the Owner's Chrome was left untouched)
**Session:** established through the app's own `/auth/confirm?token_hash=…&type=magiclink` endpoint using an admin-generated one-time link for the Owner's Zalo test account.
**Identity proof:** `GET /api/reviews/mine` → **3 reviews, all authored by `d2883fba`** — i.e. the session is the Zalo account.
**Verdict: nothing disappears. All 10 API reviews render and all 10 are reachable by scrolling. The "only one visible author" symptom does NOT reproduce in this measurement.**

## 1 + 3. Rendered slides (DOM order) — container `scrollHeight 7200`, `clientHeight 720`, 10 children

| index | offsetTop | author id | visible handle |
|---|---|---|---|
| 0 | 0 | `d2883fba` (Zalo) | **@huyphạm** |
| 1 | 720 | `d2883fba` (Zalo) | **@huyphạm** |
| 2 | 1440 | `4dcce7cf` (Google huypham.sm) | @phạmđoànhuy |
| 3 | 2160 | `4dcce7cf` | @phạmđoànhuy |
| 4 | 2880 | `0f864f05` (Google miastore2803) | **@huyphạm** |
| 5 | 3600 | `d2883fba` (Zalo) | @huyphạm |
| 6 | 4320 | `4dcce7cf` | @phạmđoànhuy |
| 7 | 5040 | `4dcce7cf` | @phạmđoànhuy |
| 8 | 5760 | `4dcce7cf` | @phạmđoànhuy |
| 9 | 6480 | `4dcce7cf` | @phạmđoànhuy |

## 2. Parsed React array (read from the fiber)

`[0]546d5c77/d2883fba · [1]2fd1deeb/d2883fba · [2]7a7ca930/4dcce7cf · [3]54076d09/4dcce7cf · [4]749ccb8b/0f864f05 · [5]b78a997f/d2883fba · [6]f181e696/4dcce7cf · [7]15d7f00e/4dcce7cf · [8]1484e527/4dcce7cf · [9]df71c670/4dcce7cf`

**React array === DOM order, element for element.** No filtering, no truncation between state and render. The feed is **not virtualized** — all 10 rows are in the DOM simultaneously.

## 4. Reachability — every slide scrolled to and verified

Scrolled to each index in turn; every one reported `reached: true` with non-empty content:

| index | reached | author | text length |
|---|---|---|---|
| 0–9 | **true (all 10)** | as table above | 53–205 chars, none empty |

**API ↔ render reconciliation:** API returned 10 reviews `{d2883fba:3, 4dcce7cf:6, 0f864f05:1}`; the DOM contains exactly those 10, same ids, same distribution. **Delta = 0.**

## 5. First point where reviews disappear

**None.** There is no such point in this run. API → React state → DOM → reachable viewport is lossless.

## The one thing the measurement does surface: a display-name collision

Three distinct accounts render under **two** visible handles:

- `d2883fba` (Zalo) → **@huyphạm**
- `0f864f05` (miastore2803) → **@huyphạm** ← same label, different account
- `4dcce7cf` (huypham.sm) → @phạmđoànhuy

Both `d2883fba` and `0f864f05` have `profiles.full_name = "Huy Phạm"`. Counting authors **by what is on screen** therefore yields 2, not 3 — for any logged-in identity. Additionally, slides **0 and 1 are both the Zalo account's own clips** (consequence of the client hashtag re-sort documented in `EXPLORE_AUTHENTICATED_RUNTIME_TRACE.md`), so the first two full-screen slides show the same handle before a different one appears at slide 2.

**Recorded as EVIDENCE. Not claimed as the cause of the Owner's observation** — the Owner reported one visible author, this measurement shows three authors present and reachable.

## Measurement artifact, declared

`videoMounted` readings taken inside a tight synchronous scroll loop are unreliable (the React render window updates asynchronously, so it lags the loop). Video-playback state is **not** measured here; the earlier finding stands that only `|i − activeIndex| ≤ 1` mounts a `<video>`.

## Assumption register

| ID | Statement | Status |
|---|---|---|
| D1 | The session used is the Zalo account | **EVIDENCE** (`/api/reviews/mine` → 3 reviews, all `d2883fba`) |
| D2 | All 10 API reviews render in the DOM | **EVIDENCE** (React array === DOM, ids match) |
| D3 | All 10 slides are reachable by scrolling | **EVIDENCE** (`reached: true` ×10) |
| D4 | Reviews disappear somewhere in the runtime | **DISPROVEN** for this run |
| D5 | Two accounts share the visible handle @huyphạm | **EVIDENCE** (DOM handles + `profiles.full_name`) |
| D6 | The handle collision is what the Owner counted | **ASSUMPTION — not claimed** |
