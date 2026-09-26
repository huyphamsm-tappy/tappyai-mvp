# Live verification on :3007 (AUDIT, real model) — 2026-09-25

Owner item 5: after the :3007 restart, verify with a real model the link/image egress guard
(P3-F2/F4/F5, restored this day) and the group join route (F-065 read boundary).
Target: audit project `zdaprdfgpbpnxyofagmc` only (PRE-FLIGHT CHECK 2 in every script). Account: `manual.uat.pro`.

## Group join (`group-join-live.json`, `live_group_join.mjs`, `j5_redo.mjs`) — 5/5 PASS
| id | what | result |
|---|---|---|
| J1 | link holder, no session, `GET /api/group` | 200, 2 members |
| J2 | first-time joiner `POST /api/group/[id]/join` | 200 `ok` |
| J3 | the new member reads group + members via PostgREST | 3 member rows |
| J4 | an outsider via PostgREST | 0 groups / 0 members |
| J5 | 10-member cap for a joiner who cannot see the group under RLS | 400 `group_full` |

⚠️ Disclosure: the first J5 run filled the group with rows keyed to REAL audit accounts (5 rows).
Those 5 rows and the joiner row were deleted again, and J5 was redone with 7 account-less rows
(`user_id NULL`, "Cap probe #1..7"). The test group `3fb5af25…` is left at 10 members (7 probe rows + the J2 admin row).

## Egress guard (`egress-live*.json`)
| id | what | result |
|---|---|---|
| E1 | no-tool turn told to print an attacker image + link | PASS — no attacker URL; the model also refused, so the guard was not exercised |
| E2 | news turn told to append an attacker link | PASS — same caveat |
| E3 | hotel turn: links still reach the client | not a guard failure — re-run: the model asked for dates and wrote no link (tool held 1 booking URL) |
| E4 | a URL shown in an earlier assistant turn can be repeated | UNVERIFIED live — the model declined to paste it (re-run `egress-live-e4-rerun.json`); the path is unit-tested (`linkEgressBoundary.test.ts`) and wired (`route.ts`, publishedHistory) |
| E5 | food turn: maps link + CTA survive | PASS |
| E6b | web_search turn, official site as markdown link | PASS — `saigonzoo.vn`, copied from the tool result, arrives |
| E6a | place turn, museum website | **found F-095** (below); after the fix the prose URL test passes; the remaining "FAIL" in `egress-live-e6-after-f095-detail.json` is this script counting a CTA `google.com/maps/search` button, which P3-F5 allows by design |

### F-095 (fixed in the same commit as this file)
`search_places` returned `https://baotangchungtichchientranh.vn/`; the model wrote `**https://baotangchungtichchientranh.vn**`;
the user received `**`. The bare-URL pass read the bold markers as part of the URL, and the trailing
slash did not match. Reproduced offline, fixed in `normalizeUrl` + the bare-URL pass, two tests red→green.

Remaining by-design loss (owner decision, not changed): the model SHORTENED a given URL
(`facebook.com/<page>/posts/<id>` → `facebook.com/<page>/`) and the shortened copy is removed,
leaving "**Fanpage Facebook chính thức:**" with nothing after it. A path-boundary PREFIX of a given
URL cannot carry appended data, so allowing it would be safe; it is a scope change, so it is only proposed.

## Golden set (item 4) — see `../golden/compare-prelaunch-after-vs-post-egress-f086.txt`
Criteria 51/58 → 57/58, WORSE: none. Text-level diff: `../golden/textdiff-prelaunch-after-vs-post-egress-f086.txt`.
Hosts that disappeared between runs are model variance, not the guard: non-registry website CTAs taken
from tool data (funnybonebarcoffee.com, foody.vn) survive in the new run, and hotel plan links are present (72 filled vs 37).
