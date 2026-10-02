# Blind grading — round 3 (U1–U3 travel, X1–X3 golden)

Labels are blind. No configuration or commit was inferred. `summary.json` was not used.
All runs were graded with the same rules as earlier rounds.

## Totals

| run | Part A travel (T x/8) |
|---|---|
| U1 | **6/8** |
| U2 | **7/8** |
| U3 | **7/8** |

| run | PASS | PARTIAL | FAIL |
|---|---|---|---|
| X1 | 9 | 9 | 6 |
| X2 | **11** | 13 | **0** |
| X3 | 9 | 9 | 6 |

All six FAILs in X1 and X3 are the same six cases: D1, G1b, M2, M3, M4 and T2.

- **The pattern:** on an actionable place query the run answers with a "Tầm giá? / Mấy người?" clarify and returns no tool call and no cards. The first searched turn then loses the context.
  - In M3 it starts a new generic search on "bao lâu".
  - In T2 and T3 it searches generic "rạp chiếu phim" / "quán ăn trưa ngon" and drops IMAX, lẩu and the budget.
- **In M4 t2,** the product query gets a "Bạn muốn mua món gì?" clarify.
- **X2** searches on every one of these turns.

## Part A — consultative-40 TRAVEL (b folded into parent)

Pass = ✅ + ⚠.

| run | T1 | T2 | T3 | T4 | T5 (+b) | T6 | T7 | T8 | total |
|---|---|---|---|---|---|---|---|---|---|
| U1 | ⚠ | ⚠ | ✅ | ⚠ | PASS | ⚠ | ❌ ACT | ❌ ACT | **6/8** |
| U2 | ⚠ | ❌ C2 | ✅ | ✅ | PASS | ⚠ | ⚠ | ✅ | **7/8** |
| U3 | ⚠ | ⚠ | ⚠ | ⚠ | PASS | ⚠ | ❌ ACT | ⚠ | **7/8** |

- **U1:**
  - T7 is actionable, but the run asked for the date with no tool call: ACT FAIL.
  - T8 is actionable, but the run asked with no tool call: ACT FAIL.
  - The ⚠ items come from:
    - breakfast scheduled before the venue opens (no invented prices);
    - a backstop "Mình chọn" pick prepended to the plan;
    - post-hoc search narration.
- **U2:** its transcripts are identical to the earlier travel transcripts graded in R1/S2, and the grades carry over. T2 fails C2.
- **U3:**
  - T7 asked for the date with no tool call: ACT FAIL.
  - Its ⚠ items come from:
    - breakfast before opening;
    - backstop picks;
    - an unverifiable "Ông Lang yên tĩnh" claim, softened by a heads-up (⚠, not FAIL);
    - narration.
- T5 is a vague id. All three runs gave exactly one clarify, then a plan on the b-turn: PASS.

## Part B — golden set (24 cases × X1–X3)

A verdict counts only the case's own criteria. Out-of-criteria defects are noted in brackets and do not change the verdict.

| case | X1 | X2 | X3 |
|---|---|---|---|
| B1 | PASS: all criteria met | PASS: all criteria met | PASS: all criteria met |
| B2 | PASS: all criteria met | PASS: all criteria met | PASS: all criteria met |
| B3 | PASS: all criteria met | PASS: all criteria met | PASS: all criteria met |
| B4 | PASS: all criteria met | PASS: all criteria met | PASS: all criteria met |
| D1 | FAIL: clarify turn, no search and no cards where cards are required | PASS: searched, cards with a named pick | FAIL: same clarify with no cards as X1 |
| D2 | PASS: all criteria met | PASS: all criteria met | PASS: all criteria met |
| G1a | PASS: all criteria met | PASS: all criteria met | PASS: all criteria met |
| G1b | FAIL: clarify with no cinema cards; the follow-up loses the requirement | PARTIAL: searched, but a shopping mall is picked as the cinema | FAIL: same as X1 |
| G3a | PASS: all criteria met | PARTIAL: the picked venue's name is cut from visible text (breaks the named-pick criterion) | PASS: all criteria met |
| G3b | PARTIAL: correction not acknowledged, or budget fit asserted without rows | PARTIAL: same | PARTIAL: same |
| G4a | PASS: all criteria met | PASS: all criteria met (note: memory bleed from an earlier turn, outside criteria) | PASS: all criteria met |
| G5a | PARTIAL: MDM missing; numeric thresholds | PARTIAL: same | PARTIAL: same |
| G5b | PARTIAL: frame/engine-number check missing | PARTIAL: frame/engine-number check missing | PARTIAL: invented numbers |
| G5c | PARTIAL: invented numbers, or the VIN/deposit lead is missing | PARTIAL: same | PARTIAL: same |
| G5d | PARTIAL: the fake payment-screenshot vector is missing | PARTIAL: same | PARTIAL: same |
| L1 | PARTIAL: one criterion only partly met | PARTIAL: one criterion only partly met | PASS: all criteria met |
| M1 | PARTIAL: t7 TAPPY_PLAN is malformed JSON; duplicated or contradictory sentence (breaks "reply once") | PARTIAL: t9 has a phantom "dưới 2 triệu" budget on the MacBook (budget bleed the criteria forbid) | PARTIAL: same as X1 (malformed t7 plan, duplicate sentence) |
| M2 | FAIL: t2 spa and t3 cinema both get a clarify, with no spa cards and no cinema cards | PASS: t1 food under 100k in Q3; t2 spa only, no 100k applied; t3 cinemas only (note: typo "dưa") | FAIL: same as X1 |
| M3 | FAIL: t1 clarify with no lẩu cards; t2 "bao lâu" runs a new restaurant search; t3 clarify; t4 runs search_products, shows stationery SHOP cards and Q1 café cards for a Đà Lạt question | PASS: t1 lẩu Q1; t2 answers travel time to The Lủi; t3 indoor cinema/karaoke with no products; t4 answers Đà Lạt weather/season | FAIL: t1 clarify; t2 new search; t3 clarify; t4 mixes Q1 café cards into the Đà Lạt answer |
| M4 | FAIL: t2 hair dryer answered with "Bạn muốn mua món gì?", no products (note: t3 narrates "tìm cả hai nhu cầu") | PASS: t1 Phú Nhuận spas, price honestly unverified; t2 Philips products under 1tr; t3 late-open spas, no products and no 1tr budget | FAIL: same t2 clarify with no products; t3 narration mentions the hair dryer |
| T1 | PASS: t2 corrects to 2 days/1 night; M Hotel named from t1 with cards; no delivery apps; cost split has 2-person, 1-night lines (all "chưa có giá") (notes: "đang gọi tool" narration, stray "[" at the end of t1) | PARTIAL: hotel is only a generic "Check-in khách sạn" in t1/t2 and is first named at t3 (note: t3 plan flies from Hà Nội, not TP HCM) | PARTIAL: t1 has a generic hotel and asks "tìm khách sạn không?"; t2 budget-split line is cut in visible text ("Vé máy bay khứ hồi (2 người)" with no amount) |
| T2 | FAIL: t1 clarify; t2 searches generic "rạp chiếu phim" with no IMAX and asserts "không có rạp IMAX"; says "sàn chiếu" | PARTIAL: IMAX searched with cards and says "phòng IMAX"; uncertainty stated with a way to check (CGV.vn/GalaxyCine.vn), but it is repeated in both turns and CGV Liberty is still presented as the IMAX answer | FAIL: generic search with no IMAX; invents "Rạp IMAX ở TP HCM đã đóng cửa" |
| T3 | PARTIAL: t2 search is generic and ignores 50–60k; correction not acknowledged; "rẻ tiền" not backed by rows; a Quận 5 card appears; closed places are marked | PARTIAL: correction acknowledged and budget honestly unverified, but cards still include restaurant-type venues (Hàng Dương Quán, Sài Gòn Xưa và Nay, Cơm Bắc Làng Cua Đồng) | PARTIAL: same as X1 |
| T4 | PARTIAL: risks come first (iCloud, instalment, deposit, Scam Shield), but MDM, stolen goods and the Apple serial check are missing; "<80% pin" given, with a disclaimer | PARTIAL: stolen goods, iCloud/Find My, deposit and Scam Shield come first; MDM and the serial check are missing | PARTIAL: first risk block lacks Activation Lock; MDM and Apple ID arrive only in an appended block AFTER the condition checks (order broken); no serial check and no stolen-goods mention |

### Out-of-criteria defects

These are noted only and do not change any verdict.

- **X1 and X3:**
  - post-hoc "Mình tìm ngay / đang gọi tool" narration after the pick (M4 t3, T1 t1);
  - T1 t1 visible text ends in a stray "[".
- **X2:**
  - T1 t3 plan changes the origin to Hà Nội;
  - M2 t2 typo "dưa bạn";
  - G4a memory bleed.
- **All runs:** plan cost_breakdown values are all "chưa có giá". This is honest, but gives no numbers.
