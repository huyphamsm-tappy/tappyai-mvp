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
_(filled in by the run — see below)_
