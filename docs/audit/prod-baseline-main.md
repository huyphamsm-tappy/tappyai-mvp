# Production-code baseline (`origin/main` 842379b) — web vs mobile · 2026-09-17

**What this is:** the first measurement of the code that production actually runs (`main` = prod web build lineage; merge-base with the V3 branch `f16a71f`), executed in the isolated audit environment (`zdaprdfgpbpnxyofagmc`, dedicated Pro audit user, instance-local quota, same vendor keys). **No fix is designed here.**

```text
LLM calls this phase: 13 = 12 baseline turns + 1 chitchat probe used to confirm the age gate opened (no tool)
Search calls: those made by the 10 tool turns; production DB: only the aggregate memory count (read-only, counts only)
Application code changed (committed): NO · Migration files changed: NO
Audit-worktree-only, uncommitted local patch: `streamEnrichment.ts` capture hook (env-gated by AUDIT_CAPTURE_PREGUARD_DIR) — never on production
```

## 1. Setup and what had to change to run `main`

| Item | Finding |
|---|---|
| Env vars required | the set of `process.env.*` names read by `src/**` is **identical** between `main` and V3; `package-lock.json` identical → the audit worktree's `node_modules` junction stays valid |
| Checkout | audit worktree detached at `842379b`, `.next` cleared, same gitignored `.env.local` |
| **Age gate (main-only)** | every `/api/chat` call returned **403 `age_verification_required`** — `main` carries PR #251 (`v3-user-data-foundation`) with a DOB gate that the V3 design branch `f6712b8` does not have. Opened for the audit user through the app's own RPC `set_user_date_of_birth('1990-01-01')` on the **non-prod** project (`user_age_status` → `has_dob: true, age_band: 35_44`). The first 12 attempts (all 403) cost **no** LLM call |
| Surface simulation | `main` has **no `x-tappy-surface` header handling** (V3-only), so "web" vs "mobile" on main differ only in **`userLocation`**: web sends District 1 for #8/#11; mobile simulates **Android** (`messages` + bearer only, no location). iOS would send location — recorded as *not* simulated |
| Memory | cleared before each pass (0 rows); within a pass the authenticated user still accumulates memory turn to turn (production-realistic) |
| Query set | 6 turns per surface: S1 (setup) + P1, P2, P3, P8, P11. **#15 dropped** (its V3 truncation cause does not exist on main; budget 12) |
| Pre-guard capture | 9 captures (5 web + 4 mobile; no-tool turns are not buffered and never reach the guard chain) |

## 2. Headline results

| Measure | Web (with GPS on #8/#11) | Mobile/Android (no GPS) |
|---|---|---|
| Place provider on every tool turn | **OpenStreetMap** (Google Places → 403 "caller does not have permission"; `main` has no Serper `/maps` — that provider is V3-only) | same |
| Rows with rating / hours | **0 / 0** on all turns (OSM rows: name, address, 1 row with a `wifi` tag) | same |
| Turns where OSM returned **0 rows** | **#8 and #11** (GPS-biased query → nothing) | #11 returned 10 rows; #8 asked for the location (no tool) |
| Names presented that are **not** retrieved rows (from listicle snippets) | S1: 4 · P2: 1 · **P8: 4 · P11: 3** | S1: 3 · others 0 |
| "Search-dump" shape (list of venues lifted from snippets, no evidence) | **P8 (4 street-food names + "phố Cô Giang"), P11 (3 cafés with address/price/hours from articles), S1 (4 sushi names "được nhắc đến trong các bài viết")** | S1 (3 names) |
| Decision sentence ("Mình chọn/gợi ý X") | P2, P3 | S1, P2, P3, P11 |
| Unsupported claims (wish words as facts) | every tool turn: "yên tĩnh", "có wifi nên yên tĩnh" (P3), "không gian yên tĩnh, có wifi" (P2), "được đánh giá cao về chất lượng" with **no rating in any row** (S1), "4.3⭐ (Google Maps)" for L'Usine with **0 rows** (P11), prices "45.000–100.000đ", "200.000–300.000đ/người" from area listicles | same pattern; P2 quotes "Shamoji Robata Yaki, Kichi Kichi, Hokkaido Sachi Sushi… 200.000–300.000đ/người" from snippets |
| Relevance of the engine's pick | **wrong category**: the ranker's pick for "quán Nhật" is **Nhà Hàng Jaspas** (a western restaurant; shortlist Au Tresor / Crazy Buffalo), because OSM returned generic "nhà hàng" rows and the only scoreable attribute was one `wifi` tag | same |
| Post-model guard removals (from capture, all 4 guards on main) | **0 sentences removed** on all 9 captured turns — the text grows only by injected image/link blocks | same |
| Prose integrity | image + ShopeeFood/GrabFood/BeFood link blocks are injected **inside sentences** ("Ngoài ra còn có [IMG][links] **Nhà Hàng Au Tresor** và [IMG][links] **Crazy Buffalo**…") | same — on mobile this is the entire reply surface |
| #1 follow-up ("Quán này mở cửa mấy giờ?") | asks which restaurant (legitimately ambiguous: the setup reply named 4 snippet venues + 3 OSM rows); no re-search | same, adds "nếu bạn có tên quán cụ thể mình sẽ tìm" |
| #8 nearby | web: GPS → OSM 0 rows → snippet dump; mobile: no GPS → asks for the area (**correct behaviour**, but Android can never do better because it sends no location — the product bug the owner flagged) | |

## 3. Per-turn notes

| Turn | Web | Mobile |
|---|---|---|
| S1 setup "quán Nhật yên tĩnh Q1" | 10 OSM rows (none Japanese); model says "hệ thống chưa có đủ thông tin", lists **Chiyoda Sushi, Shamoji Robata Yaki, Yen Sushi & Sake Pub, Izakaya Kamura** "được nhắc đến trong các bài viết", asks a clarifying question; enrichment appends photos/links for Jaspas/Au Tresor/Crazy Buffalo (non-Japanese) | same shape, 3 snippet names, "được đánh giá cao về chất lượng và không gian" (no ratings exist) |
| P1 "mở cửa mấy giờ?" | asks which venue | asks which venue; offers to search by name |
| P2 "quán Nhật ngon và yên tĩnh" | "Mình gợi ý **Nhà Hàng Jaspas** — không gian yên tĩnh, có wifi"; adds **Saiko Sushi** from snippets | "gợi ý **Jaspas** — có wifi, yên tĩnh"; then a snippet paragraph with 3 more names and "200.000–300.000đ/người" |
| P3 "< 500k, 2 người, yên tĩnh" | "Mình chọn **Jaspas** — quán có wifi nên yên tĩnh"; honest "chưa tìm thấy giá cụ thể"; sentence broken by inline media | 2 tool calls (memory made it search Japanese first); same pick; "được đánh giá tốt trên Google Maps" (no rating in rows) |
| P8 "gần tôi" | OSM 0 rows → **pure snippet dump** ("phố Cô Giang", "Cơm Niêu Thiên Lý", "Hủ tiếu Nam Vang Thành Đạt", "Bún Bò Huế 31") + memory-driven follow-up | no GPS → asks where the user is |
| P11 "cafe chill gần đây" | OSM 0 rows → **3-café list from articles** with addresses, prices and hours ("L'Usine 4.3⭐", "Po Cafe", "The Workshop") — the exact listing pattern the audit was opened for | 10 OSM rows → "gợi ý **Cà Phê Acoustic**" (no evidence beyond name/address) + 2 alternatives |

## 4. What this changes in the root-cause picture (production, not V3)

| # | Production root cause (code-proven + observed) | Evidence |
|---|---|---|
| **R1 — Place evidence on production is OSM-only because the Google Places key is refused (403), and `main` has no Serper `/maps`** | every tool turn `source: OpenStreetMap`; `tappyai_places_debug httpStatus 403`; V3 added Serper `/maps` precisely for this (memory: "Serper /maps là nguồn place chính" in V3 Phase 4) | rows have no rating/hours/price; category relevance is poor (Japanese → generic restaurants) |
| **R2 — With thin or empty rows, the model falls back to the Serper `/search` listicle snippets and presents article names as venues** ("search dump") | web P8/P11 (0 rows), S1 both surfaces, P2 mobile; `main` lacks V3's `place_search_status` / `no_results_instruction` / `suppressUngroundedVenues`, so nothing stops it | this is the original complaint, reproduced on the production code path |
| **R3 — Wish → fact (B) is worse on production than on V3** because there is no rating to lean on: "có wifi nên yên tĩnh", "được đánh giá cao" with no ratings, prices from area listicles | all tool turns | |
| **R4 — Inline enrichment injection breaks sentences** (images/links inserted mid-sentence) — on mobile the prose is the whole UI | P2/P3/P11 mobile, P3 web | presentation, not fabrication |
| **R5 — Android sends no location** → "gần tôi" can only ask back; with location (web) the OSM bias query returned nothing anyway | P8 both surfaces | product bug (owner-flagged) + provider weakness |
| C — no place evidence in follow-up context | P1 both surfaces | confirmed on production |
| G1 (guard truncation) | **not on production** (0 removals; guard absent) — **V3 RELEASE BLOCKER**, deferred per owner decision | capture |
| M — memory | within a pass the user's earlier turns already personalise later ones ("Vì bạn thích ẩm thực Nhật"); the production aggregate check found **no** user with a `budget` who never wrote money words (§5) | |

**Net:** on production the dominant defect is **R1+R2** (a broken place provider chain feeding an ungated snippet fallback), which produces exactly the listing/"đổ kết quả" behaviour the audit was opened for; on the unreleased V3 branch that pair is fixed (Serper `/maps` + grounding gate) but replaced by **G1** (over-aggressive attribution in the new guard) plus B/C. The two branches fail differently; neither is releasable as-is for the follow-up (#1) and wish-as-fact (B) problems, which both share.

## 5. Memory count on production (read-only, aggregate only, `supabase_read_only_user`)

Query (counts only; no message text, e-mail or id leaves the database):

```sql
with um as (select user_id::text as user_id, budget from public.user_memory),
with_budget as (select user_id from um where budget is not null and jsonb_typeof(budget)='object' and budget <> '{}'::jsonb),
money_users as (
  select distinct c.user_id::text as user_id from public.conversations c
  cross join lateral jsonb_array_elements(c.messages) m
  where m->>'role'='user' and (m->>'content') ~* '<money-word regex>'),
users_with_conversations as (select distinct user_id::text as user_id from public.conversations)
select (select count(*) from um) users_with_memory,
       (select count(*) from with_budget) users_with_budget,
       (select count(*) from with_budget w where w.user_id in (select user_id from users_with_conversations)) users_with_budget_and_saved_conversations,
       (select count(*) from with_budget w where w.user_id in (select user_id from users_with_conversations)
                                                and w.user_id not in (select user_id from money_users)) users_with_budget_but_no_money_words_in_own_messages,
       (select count(*) from with_budget w where w.user_id not in (select user_id from users_with_conversations)) users_with_budget_but_no_saved_conversations_at_all;
```

Run twice — broad regex (`triệu|k|nghìn|đồng|vnd|₫|ngân sách|giá|rẻ|đắt|budget|price|cheap|expensive|tiền|ddd.ddd…`) and strict regex (no bare `giá`/`gia`/`re`/`dat`; only `giá cả|giá tiền|giá bao nhiêu|giá rẻ|…`, amounts with `k|tr|triệu|nghìn|đồng|vnd|₫`, `budget|price|cheap|expensive|tiền|rẻ|đắt`):

| Count | Broad | Strict |
|---|---|---|
| users with memory | 18 | 18 |
| users with `budget` set | 9 | 9 |
| …with saved conversations | 9 | 9 |
| **…with `budget` but no money words in their own messages** | **0** | **0** |
| …with `budget` but no saved conversations | 0 | 0 |

Reading: the fabricated `budget.trip` seen on the audit user is **not observed** among the 9 real users with a budget (every one of them wrote a money-related word themselves). Caveat: `conversations` holds saved threads only; extraction runs on live request messages — but all 9 have saved threads, so the check is complete for this population. n = 9; small.

## 6. Artefacts

`docs/audit/prod-main-web.json`, `prod-main-mobile.json` (sanitised runs), `prod-main-preguard-capture.jsonl` (model text before/after each guard, 9 turns), this report. The audit worktree (`.claude/worktrees/audit-nonprod`) is now on `842379b` with the uncommitted capture hook in `src/lib/ai/streamEnrichment.ts`; server `audit-nonprod` on :3101 still running.

## 7. Status of the other two decisions

- **G1:** deferred; marked **V3 RELEASE BLOCKER** here and in `phase2-g1-guard-fix-design.md` (implementation waits for an explicit instruction).
- **Memory count:** done (§5). The Supabase token has no further planned use — revoke it now.
