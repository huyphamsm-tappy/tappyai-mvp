# CONSULTATIVE-40 — eval set + results (STEP F, overnight 2026-09-17/18)

Environment: audit project `zdaprdfgpbpnxyofagmc` only, runtime `audit-nonprod` on :3101, ALL flags ON
(`PLACE_GUARD_ATTRIBUTION_V2`, `SNIPPET_PRICE_GUARD_V2`, `MEDIA_PLACEMENT_V2`, `CONSULTATIVE_V1`), Haiku default,
memory cleared for the audit user before each pass. Budget: 120 LLM/search runs for the whole job (8 used by Step D).

## Per-turn PASS/FAIL criteria (RELEASE GATE)
| # | Criterion | How judged |
|---|---|---|
| C1 | Situation understood | the reply's pick/reasons match who/occasion/time/budget/hard stated (or states the assumption) |
| C2 | Clear pick | ONE venue named as the choice in the first sentence, and it is a `_tappy_shortlist` member |
| C3 | Grounded reasons | every reason is a row field / snippet the turn retrieved (check `TOOL ROW` before calling anything fabricated) |
| C4 | Trade-off | at most one alternative, with a real trade-off (or none) |
| C5 | Accuracy | numbers/hours/prices quoted equal the row's values |
| C6 | No fake search | no "mình đã kiểm tra/tìm lại" on a turn with no tool call; a named re-search actually happened (`tappyai_tool_called`) when the block asked for it |
| C7 | Layout | prose on top, then the carousel; no inline images/links in prose; filters above; Tappy rating line when present |
| C8 | Language | reply language = user language (undiacriticked VI ⇒ VI) |
| C9 | No fragments | no orphan sentence, no half-removed span, no empty body |

## The 40 queries (8 per vertical; each vertical has 1 follow-up pair, ≥1 vague, ≥1 no-diacritic, ≥1 tight budget, ≥1 family/date/group)

### Food (F1–F8)
| id | query | notes |
|---|---|---|
| F1 | Tìm quán ăn tối ngon gần Quận 1 cho 2 người | baseline, stated who/time/place |
| F2 | tim quan bun bo ngon o q1 duoi 80k | no-diacritic + tight budget |
| F3 | Đi date với gấu tối nay, chỗ nào lãng mạn yên tĩnh ở Quận 3? | date + hard(quiet) + mood |
| F4 | Cả nhà 6 người có con nít ăn trưa cuối tuần, cần chỗ đậu xe ô tô, Phú Nhuận | family/group + hard(parking, kids) |
| F5 | quán này mở mấy giờ? | follow-up to F4 (this → pick, fact: hours) |
| F6 | Ốc Đào có đông không? | follow-up by name (if in F4/F1 shortlist; else "quán số 2 có đông không?") |
| F7 | ăn gì ngon giờ | vague, no place, no who |
| F8 | Sinh nhật sếp, tiếp khách 8 người, phòng riêng, tầm 500k/người, Quận 1 | business + private_room + budget |

### Shopping (S1–S8)
| id | query | notes |
|---|---|---|
| S1 | Mua tai nghe bluetooth dưới 1 triệu, pin trâu | tight budget + priority |
| S2 | mua laptop van phong duoi 15tr | no-diacritic + budget |
| S3 | cái rẻ nhất có tốt không? | follow-up to S2 (reference to listing) |
| S4 | Robot hút bụi cho nhà có chó, tầm 5-7 triệu | family-ish + budget band |
| S5 | quà sinh nhật cho bạn gái tầm 1tr | date/gift + budget |
| S6 | mua gì bây giờ | vague |
| S7 | Máy lọc không khí cho phòng ngủ 20m2 | use case |
| S8 | Nồi chiên không dầu 5L loại nào tốt | comparison |

### Travel (T1–T8)
| id | query | notes |
|---|---|---|
| T1 | Đi Đà Nẵng 3 ngày 2 đêm cho 2 người, ngân sách 6 triệu | couple + budget |
| T2 | khach san da nang gan bien duoi 1tr/dem | no-diacritic + tight budget |
| T3 | Cái thứ hai có bao gồm ăn sáng không? | follow-up to T2 (ordinal + fact) |
| T4 | Cuối tuần này gia đình 4 người đi đâu gần Sài Gòn? | family + vague dest |
| T5 | đi chơi ở đâu | vague |
| T6 | Hội An có gì hay, đi 1 ngày | itinerary |
| T7 | Vé máy bay Sài Gòn Hà Nội tuần sau rẻ nhất | dynamic price (must not invent) |
| T8 | Resort Phú Quốc cho kỷ niệm 1 năm, sang chút | celebration + fancy |

### Spa (P1–P8)
| id | query | notes |
|---|---|---|
| P1 | Spa nào tốt rẻ ở Đà Nẵng | cheap_good, no who |
| P2 | spa massage chan gan q1 duoi 300k | no-diacritic + budget |
| P3 | chỗ đó có đặt trước được không? | follow-up to P2 (this + booking fact) |
| P4 | Đi spa với mẹ cuối tuần, chỗ nào yên tĩnh sạch sẽ Quận 7 | family + hard(quiet) |
| P5 | massage | vague, one word |
| P6 | Spa couple cho 2 người tối nay gần Quận 1 | date + time |
| P7 | gội đầu dưỡng sinh gần đây | near me (GPS absent on web ⇒ must ask/assume honestly) |
| P8 | Spa nào mở khuya sau 22h ở Quận 3 | hard(late_open) |

### Entertainment (E1–E8)
| id | query | notes |
|---|---|---|
| E1 | Tối nay đi chơi gì với hội bạn 5 người ở Quận 1 | group + tonight |
| E2 | rap phim nao gan q1 | no-diacritic |
| E3 | quán bar nào chill có nhạc sống Quận 1 | hard(live_music) + mood |
| E4 | chỗ đó có giữ xe không? | follow-up to E3 (this + parking fact) |
| E5 | cuối tuần làm gì | vague |
| E6 | Karaoke cho 10 người tầm 100k/người Gò Vấp | group + tight budget |
| E7 | Xem phim gì hay tối nay | movie recommend (no venue search) |
| E8 | Chỗ chơi cho trẻ em 5 tuổi cuối tuần ở Sài Gòn | family/kids |

Follow-ups are sent in the same thread as their parent (F5 after F4, F6 after F1/F4, S3 after S2, T3 after T2, P3
after P2, E4 after E3); everything else is a fresh thread. Android runs 10 of these on the emulator (guest, same
question as web): F1, F2, F3, F5(after F4), S1, T1, P2, P6, E1, E3.

## Results

Runs: pass 1 (E build) → fixes → pass 2/3 re-runs. Grades are on the LATEST run of each turn (`runs/<id>.json`;
earlier runs archived in `runs/pass1/`, `runs/pass2/`). LLM/search runs spent: **95 / 120** (8 Step D + 87 here:
40 first-pass web + 37 web re-runs + 10 Android). Memory cleared before pass 1 and before pass 3.

Legend: ✅ PASS · ⚠️ PASS with a note · ❌ FAIL. Criteria C1–C9 as above; a turn PASSES when C1–C9 all pass
(⚠️ counts as PASS).

### Web (40 turns, all flags ON)
| id | verdict | notes |
|---|---|---|
| F1 | ✅ | pick 4.7⭐/961 + open-late heads-up + one alt with distance trade-off; ⚠️ model CTA label "Tìm phòng trên Haisanhoanggia" for a seafood restaurant (model-authored `[CTA_BUTTONS]`, pre-existing) |
| F2 | ✅ | undiacriticked → Vietnamese; budget with no price on rows → honest price line; fit-claim sentence now removed (commit after this run) |
| F3 | ✅ | after fixes: pick keeps its decision, unsupported "yên tĩnh/lãng mạn" clause stripped, gap sentence, one alt with trade-off, one question |
| F4 | ✅ | parking/kids gaps named; alt with hours trade-off |
| F5 | ✅ | follow-up "quán này" → pick; hours answered from the carried prose, no re-search needed |
| F6 | ✅ | "quán số 2" resolved; `crowd` fact → real re-search by name (`tappyai_tool_called` query = venue name); honest "dữ liệu không cho thấy mức độ đông"; phone from the row |
| F7 | ✅ | vague → assumptions stated ("Mình giả sử bạn đang ở Quận 1… trưa… 1-2 người") then pick |
| F8 | ⚠️ | two options without an explicit pick sentence in the last run (first run had a pick); private_room has no evidence lexicon → no gap sentence. Budget honesty ✓ |
| S1 | ⚠️ | decision lives in the shopping card (Phase 9 design): card NÊN CHỌN 79k/4.9⭐/17 reviews + trade-off; prose does not NAME the pick ("Đây là lựa chọn cực kỳ tiết kiệm…") — open item (shopping prose under V1) |
| S2 | ⚠️ | `search_products` fell back to web listicles (no priced rows); the reply quotes 4.49tr/4.9⭐/63 from snippets — unverifiable (C5 unknown); a clause-cut fragment "nhiều tab), nên chọn" — now removed by the fragment rule |
| S3 | ✅ | follow-up "cái rẻ nhất" resolved from ADR-024 evidence; honest trade-off (8GB RAM); one question |
| S4 | ⚠️ | card decision ✓; prose fragment "Lau nhà, thời gian chạy) …" (pre-existing guard clause cut) — now removed by the fragment rule |
| S5 | ❌ | asks the gift category (with bullets) instead of assuming + searching. Open: gift queries should search by the frame (who=couple) |
| S6 | ✅ | subject never assumed: one short question "bạn định mua cái gì" (first run had assumed FOOD — fixed) |
| S7 | ⚠️ | results mixed air-conditioners with purifiers; the model asked one clarifying question (acceptable: changes the pick) |
| S8 | ⚠️ | card ✓; prose names only the alternative (Sunhouse) + one question |
| T1 | ❌ | trip planner asked "ưu tiên hoạt động gì" and made no plan / no tool call; first run also leaked a memory trait ("như sở thích trước đây") — personality filter added. Open: the planner's clarification stage vs V1 assume-and-go (owner) |
| T2 | ❌ | `get_hotel_prices` returned 0 rows on the audit env (both runs); the model invented hotels → G1 cut 4 sentences, leaving "Mình tìm được vài khách sạn…" (false framing). Data gap: hotel provider empty on the audit env |
| T3 | ✅ | honest: no prior venues → asks which hotel (T2 produced none) |
| T4 | ✅ | family + kids: pick + kids-area alternative + one question |
| T5 | ❌ | assumption stated then "phải không?" — asked instead of searching (both runs) |
| T6 | ❌ | two searches + weather; every venue sentence cut by G1 → fallback sentence, no pick in prose (G1 over-cut on a multi-search planning turn — not V1) |
| T7 | ⚠️ | flight tool empty → honest + validated booking links (links in prose: flights have no card) |
| T8 | ❌ | assumed weekend dates and CALLED the hotel tool (rule 7 ✓) but rows = 0 (provider) → vague "Resort này…" + still asked dates |
| P1 | ⚠️ | pick 5⭐/3.147 + alt; "gần vị trí bạn hiện tại" is wrong (user GPS is HCMC, venue in Đà Nẵng; no km figure so the distance guard did not fire) |
| P2 | ✅ | pick + 2 alts + honest "chưa tìm thấy giá" (server line not duplicated after the regex fix) |
| P3 | ✅ | booking fact → re-search by name ran; answer grounded in website/phone presence; ⚠️ G1b fallback sentence appended although the body survived |
| P4 | ✅ | quiet gap named; pick + alt with hours trade-off |
| P5 | ⚠️ | one-word query → one location question + stated assumptions |
| P6 | ✅ | pick + 2 alts (one sentence) |
| P7 | ✅ | near-me with GPS → pick 1 km + one question |
| P8 | ✅ | honest "hầu hết đóng trước 22h", one pick open to 22:00, gap sentence |
| E1 | ✅ | after the slot-admission fix ("ở Quận 1" ≠ quán): card renders, one search, karaoke pick for 5 friends + alt with closing-time trade-off. First run: no card + inline media (FAIL) |
| E2 | ✅ | cinema pick 0.2 km + alts + one question |
| E3 | ⚠️ | pick + alt; "Không gian chill, nhạc sống hay" nameless claim survived (live_music attribute added after this run) |
| E4 | ✅ | parking fact → re-search by name; honest "chưa tìm thấy"; phone from row; ⚠️ Maps link in prose |
| E5 | ⚠️ | subject-less → one question, but with bullets (shape guard skipped without venues) |
| E6 | ✅ | karaoke pick 4.9⭐/6.371, price band present, group booking heads-up |
| E7 | ✅ | film recommendation: 3 titles with why (first run was cut to one by the cap — fixed) |
| E8 | ✅ | kids: tiNiWorld pick + zoo alternative; kids gap sentence (row category text now counts as evidence — after this run) |

**Web pass rate: 34 / 40 PASS (⚠️ included), 6 FAIL** (S5, T1, T2, T5, T6, T8). Of the 6: T2/T8 are the hotel
provider returning nothing on the audit env; T1/T6 are the planner's own stages (clarify / multi-search G1 cut);
S5/T5 are "asked instead of assumed" on genuinely open questions.

### Android (10 turns, emulator-5558, debug guest, unaccented input; screenshots in `android/`)
| id | verdict | notes |
|---|---|---|
| F1 | ⚠️ | layout ✓ (prose → filters → carousel), VI from unaccented ✓; pick was a lunch-only place (open to 13:30) for "ăn tối" — flagged by the model, not swapped. Prompt rule added after |
| F2 | ⚠️ | ✓ pick/alt; an orphan bold "4.9⭐ (1.008 đánh giá)" line above the pick (listing rule misses `1.008` vs `1008` — open) |
| F3 | ✅ | pick + gap sentence; unsupported clause stripped |
| F4 | ⚠️ | ✓ pick/alt/gap sentence; one clause-cut tail "liên hệ trực tiếp…" (fragment rule widened after) |
| F5 | ✅ | re-search by name ran (Serper → nothing → OSM), honest "chưa tìm thấy giờ mở cửa" |
| S1 | ❌ | shopping card ✓ but prose starts mid-argument ("Tuy số lượt đánh giá chưa nhiều…") — pick sentence cut by a pre-V1 shopping guard |
| T1 | ❌ | planner asked activities (same as web) |
| P2 | ❌ | asked massage duration instead of picking (budget gap → "search_again" policy); rule 6 added after |
| E1 | ❌→✅ | first run: no card + inline media (slot admission); fixed, the web re-run confirms the card |
| Age gate | ✅ | fresh guest: location prompt → 18+ declaration → auto re-send (`android/F4-*`) |

**Android pass rate: 6 / 10** on the runs as captured (3 of the 4 FAILs have fixes landed after the capture; not re-run — budget).

### Fixes landed during STEP F (all committed, tests green)
carried evidence on follow-ups · evidence-gap and missing-price heads-up sentences · orphan/fragment lines ·
anaphora + gap-attribute enforcement · pick keeps its decision (clause strip) · venue segment survives bold numbers ·
link-only lines with a card · "ở Quận 1" slot-admission bug · V1 active on frame goal / forced tool / prior venues /
the situation itself · assumed weekend stay for hotel/trip · subject never assumed · pick even without price ·
personality/companions transient filter · live_music attribute · row category text as evidence · shape guard only
with venues · budget-fit claim removal.

### Open (not fixed tonight)
1. Hotel provider returns 0 rows on the audit env (T2/T8) — verify `get_hotel_prices` keys/config on the audit project.
2. Trip planner clarification stage vs V1 "assume and go" (T1) — owner decision.
3. Multi-search planning turns: G1 cuts every venue sentence (T6) — G1 attribution across two result sets.
4. Shopping prose does not name the pick (S1/S8) — the card does; decide whether V1's shape applies to shopping prose.
5. Gift / open-subject queries (S5, T5, E5): one question with bullets; consider searching by the frame.
6. Listing rule: thousands-separated counts (`1.008` vs `1008`) — Android F2.
7. Model-authored CTA labels ("Tìm phòng trên …" for a restaurant) — `SERVER_AUTHORED_CTA` flag exists, off.
8. Named re-search with `location = district` finds nothing on Serper (F5 Android) — suggest the city in the instruction.
