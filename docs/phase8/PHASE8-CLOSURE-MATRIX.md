# PHASE 8 — CLOSURE MATRIX (2026-10-09, after the owner decisions)

Verdict rule: **PASS** = implemented AND an acceptance check I ran or read passes AND it is in the integration line the owner named; **FAIL** = checked and not met; **BLOCKED** = needs a permission, device, credential or owner action I do not have; **OPEN** = not done / not integrated. Finding an implementation on another branch is never a PASS. Item IDs come from `PHASE 8.docx`, which names them but does not define them; where I had to infer what an ID means, the row says so.

Integration lines used: **Phase 7 main** = `wtp7` `main` @`839030b` (contains the 20 reviewed security fixes, see WP-04); **origin/main** = `f9f2b12`; **P8 branches** = `phase8-master` / `sec/phase8-hardening` @`d1c8208` (worktree `wtsec-p8`), not ancestors of origin/main.

## A. Agent architecture gate
| Item | Verdict | Evidence | Commit | Blocker / next |
|---|---|---|---|---|
| UAT-10 acceptance gate | **FAIL** (second approved live turn, not repeated) | `artifacts/phase8/uat/uat10-e2e-defects-fixed-2026-10-09/REPORT.md`: the three earlier defects are gone (no unsupported name, no question mid-answer, no restated criteria), criteria + trade-offs came before the lookup; **but** one `search_products` call fanned out to 6 nested searches (card enrichment, one for a model not in the answer), spent the whole 8-credit ceiling, and two following `web_search` rounds could only be refused | `66ee450` (code = `000d248`) | OWNER decision on whether card enrichment may run for a criteria/advice question (design, not a prompt tweak); no further live turn without approval |
| Local gates on the final code | PASS | tsc clean · eslint 0 errors (47 old warnings) · full vitest 18,471 passed / 0 failed / 84 skipped / 1 todo · mutation harnesses M6 11/11, M7 13/13, WS-final 20/20, WS2 24/24, UAT-10 defects 12/12, freshness 15/15 (one mutation re-run corrected) | `000d248` | — |
| Freshness / retry / entity guard | IMPLEMENTED, offline-verified; not yet seen in a live cached-price turn | `b5c1f00`, `6d229f9` | | live check pending |

## B. Work packages (`PHASE 8.docx` §3)
| WP | Item | Verdict | Evidence (what I ran / read) | Commit / branch | Owner action or blocker |
|---|---|---|---|---|---|
| WP-01 | SEC1/I6 production RLS/grant verification | **BLOCKED** | needs production read access — not available and not assumed. Offline part done: `docs/security/SECURITY-REVIEW-2026-10-01.md` independently re-verified the 22 fixes at `3fce8b7`; I confirmed all 20 code commits are ancestors of Phase 7 main (`git merge-base --is-ancestor`, 20/20) | `d1c8208` (review), Phase 7 main `839030b` | **Needs:** read-only production DB role/dashboard access to run the RLS/grant queries (`check:sql-grants` + the cross-user matrix against prod), and the printed result attached |
| WP-01 | 6 migrations RC review | OPEN | review of the RC migrations is not in a readable file (only the 22-fix review) | — | security session: written review of the 6 migrations |
| WP-01 | Secure email change | **BLOCKED** | a Supabase dashboard setting; memory note says it must stay ON; I cannot read it | — | owner: confirm the toggle in the dashboard (screenshot) |
| WP-02 | I1 migration numbering | **PASS** (offline) | `supabase/MIGRATION_ORDER.txt` (144 lines) lists every migration incl. the latest four (`20261011…20261017`); `src/lib/db/migrationOrder.test.ts` 8/8 pass on Phase 7 main. Note: filenames still mix 8-digit and 14-digit prefixes and share date prefixes — order is governed by the manifest, not the filename | Phase 7 main `839030b` | — |
| WP-02 | I2 flags/config | **OPEN** | the P8 flag registry `src/lib/p8/flags.ts` (all default OFF) exists only on P8 branches; Phase 7 main has no `src/lib/p8`; `DEPLOY_PHASE8.md` §3 lists the waves | P8 branches | decide which p8_ flags enter the integration line |
| WP-02 | I3 cherry-pick strategy | **OPEN** | slice branches exist (`sec/user-blocks-slice` reviewed "can merge", `p8/subscriptions`, `p8/scam-scenarios`, `p8/news-feeds`); merge risk recorded (59 conflicts); no final slice-by-slice plan found | — | owner/security session: final slice list + order |
| WP-02 | I5 docs | **PARTIAL** | `DEPLOY_PHASE8.md` (migration order, env names, flag waves, crons, manual steps) and `ENV-RELEASE-CHECKLIST.md` exist on the P8 branches, not on Phase 7 main | `phase8-master`, `d1c8208` | land with the slices |
| WP-03 | iOS baseline merge | **OPEN** | `ios/sync-2026-09-30` @`8009f07` is **188 commits / 380 files ahead of origin/main**, not merged | `8009f07` | owner: merge decision (iOS session) |
| WP-03 | iOS CI | **PASS** (for `8009f07`) | `gh run list`: iOS push run 37740882067 and workflow_dispatch run 37742509623 = success; Architecture Guard and Regression Gate success; the previous build `9a3c1aa` also green (run 37603795303) | `8009f07` | — |
| WP-04 | SEC4 limiter | **PASS, conditional on SEC4 = audit M4** | commit `6120558` "public routes use the distributed rate limiter (audit M4)" is an ancestor of Phase 7 main and was reviewed "đạt" at `3fce8b7` (review row 1). P8's own `p8_shared_limiter` (+ `limiter.test.ts`, passes on its branch) is the duplicate the Phase 8 document says is already absorbed | `6120558` | owner: confirm SEC4 = M4 (the IDs are not defined in any readable file) |
| WP-04 | SEC9 magic-byte | **PARTIAL** | server routes: `sniffImageType` used by the group-avatar, profile and `reviews/upload` routes on Phase 7 main (not by client-direct upload completion), UP-1/UP-3 (`d178adf`, `936e9c8`) reviewed. **Client-direct uploads**: `p8_upload_content_verify` + EXIF strip (`uploadCompletion.p8.test.ts` passes) exist only on `sec/phase8-hardening`, flag OFF, not in Phase 7 main | `d1c8208` | integrate the slice or decide it is out of scope |
| WP-04 | SF8 audit_log | **PASS, conditional on SF8 = F-096 audit-log PII retention** | migration `20260925d_audit_log_pii_retention.sql` in the manifest, commit `94395ec` in Phase 7 main; `cron/audit-retention/route.test.ts` 3/3 and real-Postgres `audit_log_pii_retention.test.ts` 12/12 pass on Phase 7 main | `94395ec` | owner: confirm the mapping |
| WP-04 | E2 user_events | **UNVERIFIED** | `user_events` table, writers (chat route, crons) and several DB tests exist on Phase 7 main; the Phase 8 "one event pipeline / consent / PostHog removal" slice (`372e1f0`) is only on P8 branches; what E2 requires is not readable | — | owner: define E2's acceptance |
| WP-05 | C1 memory text | **OPEN (implemented on a branch)** | `p8_cost_memory_text` in `dbc41e5` (photos were pasted as base64 into the memory prompt: est. $300–390/month); `costWins.test.ts` 8/8 pass on `sec/phase8-hardening`; **not an ancestor of Phase 7 main or origin/main** | `dbc41e5` | cherry-pick into the integration line |
| WP-05 | C2 scam cache KV | **OPEN (same)** | `p8_cost_scam_cache_kv` (Scam Shield cache read only `UPSTASH_*`, prod has `KV_*`) — same commit/tests | `dbc41e5` | same |
| WP-05 | C3 indexes | **OPEN (same)** | `20261005_p8_cost_indexes.sql` + rollback; real-Postgres `p8_cost_indexes.test.ts` 4/4 pass on the branch; the migration is **not** in Phase 7 main's manifest | `dbc41e5` | integrate; build `CONCURRENTLY` on prod (owner/ops) |
| WP-06 | Safety UI — Web | PARTIAL | block/report/moderation migrations and routes are on Phase 7 main; Web UI merged, flags ON on Preview only (memory 02/10) | Phase 7 main | production flag decision |
| WP-06 | Safety UI — Android | **BLOCKED** (device) | `safety/` package (API, repository, view model, `AuthorSafetyMenu`, `BlockedUsersScreen`, dialogs) and unit tests exist in `wtandroid` @`86b327d`; that commit is on no remote branch (**never pushed**); no device test | `86b327d` (local) | Android session: push; owner: a real device to run block/report end-to-end |
| WP-06 | Safety UI — iOS | **BLOCKED** (device) | `Features/Safety` (store, service, `BlockedAccountsView`, `SafetySheet`) and `SafetyTests.swift` exist; `SafetyFlags` default off; CI green; no device test; comment/user-report flag off (memory 07/10) | `8009f07` | owner: iPhone for safety testing; WP-06c needs WP-03 merged |
| WP-09 | Sign in with Apple | **BLOCKED** | Supabase Apple provider DISABLED on audit and prod (memory 05/10); 5.1.1(v) revocation open; no device | — | owner: enable/configure the provider (Apple key id, team id, services id, secret) + a real iPhone |
| WP-10 | Integration → parity → security re-review → UAT | **OPEN** | depends on WP-01…09; the Agent Runtime branch is web-only and unmerged | — | after the above |

## C. Capability register (data tools) — verified source or none
| Capability | Source in code | Fields it really provides | Freshness | Status |
|---|---|---|---|---|
| Web search, product rows, places | Google via Serper (`/search`, `/shopping`, `/maps`), OSM fallback for places | titles, links, snippets, listed prices, ratings, addresses | `retrieved_at` now carried; price 6 h limit | verified live |
| Weather | `wttr.in` public JSON | current + forecast text | per call | works, no SLA/licence (unverified reliability) |
| Gold price | `vang.today/api/prices` (third-party aggregator) | brand buy/sell | per call; market limit 15 min | works, third party |
| News | VnExpress, Tuổi Trẻ, Dân Trí RSS | headlines | per call | verified |
| Flights | no fare provider (Travelpayouts removed) | route + booking links; `fare_status: not_verified` | — | **no source** for fares/status |
| Hotels | Serper rows + OTA links | listed prices from snippets/rows | price 6 h | partial, not a rate feed |
| Cinema | now-showing titles/links | titles only | — | **no source** for showtimes/ticket price (Moveek access not established) |
| Intercity transport | Serper snippets + Vexere link | snippets | price 6 h | partial |
Per the owner decision, no purchase/extension of flight, status or showtime access is pursued; these fields stay `not_verified` and nothing is invented.

## D. Not PASS — one line each
UAT-10 gate (FAIL) · WP-01 (BLOCKED) · WP-02 I2/I3/I5 (OPEN/PARTIAL) · WP-03 merge (OPEN) · WP-04 SEC9 client-direct (PARTIAL), E2 (UNVERIFIED) · WP-05 (OPEN, implemented on a branch) · WP-06 Android/iOS (BLOCKED) · WP-09 (BLOCKED) · WP-10 (OPEN). **Phase 8 is not COMPLETE and the Agent architecture is not COMPLETE.**
