# RELEASE CLOSE-OUT — 2026-09-19 (nhánh `merge/main-into-v3`, code `8b0dc46` → cuối job `16e7ffd`)

Ngân sách 17 lượt. **Đã dùng 1 (kiểm live B.2 + ghi toạ độ), còn 16.** Không gate, không push, không deploy. Mỗi khẳng định ghi VERIFIED BY.

## A.1 — GPS của Phase B (job trước) có thật là Việt Nam không?

**Có — nhưng server KHÔNG ghi toạ độ theo lượt (thiết kế privacy), nên không trích được lat/lng từ log cho từng lượt.** Cách đặt và bằng chứng:

- **Cách đặt (khác job trước):** `adb emu geo fix` không ăn trên image này (đo: sau 3 lần fix, `dumpsys location` vẫn `gps 37.421998,-122.084000`). Đã chuyển sang `appops set 2000 android:mock_location allow` + `cmd location providers add-test-provider gps` + `set-test-provider-location gps --location 10.7769,106.7009`; `andturn.sh` tiêm lại TRƯỚC MỖI lần gửi/chip; `andfresh.sh` in `Location[fused 10.776900,106.700900` trước mỗi session (B1, B2, B3, B8, B10). VERIFIED BY live (dumpsys).
- **Bằng chứng app gửi đúng toạ độ lên backend:** dry-run capture (`capture-2026-09-19.jsonl`, bản ghi "android-gps-fixed", 13:20, 7 phút trước B1, cùng cơ chế) — request `userLocation {lat:10.7769, lng:106.7009}`; hôm nay capture-live lượt upscale: `{lat:10.7769, lng:106.7009}` (VERIFIED BY server-side capture).
- **Bằng chứng từ server log / kết quả cho từng lượt** (khoảng cách `distance_km` CHỈ tồn tại khi search centred on GPS — với California thì `remoteDestination:true` và không có km, đúng như 13 lượt job trước):

| # | Lượt | Bằng chứng GPS = HCMC |
|---|---|---|
| B1 | chip "dưới 100k/người" | log `fn_entry … destination "Ho Chi Minh City", remoteDestination:false` + `centeredOnUser:true`; prose "Béo Ơi Quán cách bạn chỉ 0.9km" (NTMK Q1) |
| B2 | chip "200–500k/người" | "Công viên Tao Đàn cách 1km", "Jump Arena cách 4km"; `picked:3` |
| B3 | "spa nao thu gian" | "Hyan Spa cách bạn 0.9km", "Massage Golden 0.4km", "Hạ Spa 2.3km" |
| B4 | "cuoi tuan lam gi" | không search (lỗi được sửa) — GPS không liên quan |
| B5 | "khach san da nang…" | destination Đà Nẵng (remote theo từ vùng) — GPS không quyết định |
| B6 | "resort phu quoc…" | destination Phú Quốc (remote) |
| B7 | "goi y them" | như B6 |
| B8 | chip "dưới 100k/người" | "Quán Bụi Central cách bạn 0.7km", "Ốc Đào 2.2km" |
| B9 | "cuoi tuan di choi dau" | không search (lỗi được sửa) |
| B10a | chip | "Nhà Hàng Ngon cách bạn chỉ 0.1km" (138 NKKN — ≈150 m từ 10.7769,106.7009), "Béo Ơi 0.9km" |
| B10c | chip "dưới 200k/người" | "Karaoke MEI cách bạn 0.7km", "The Lủi 2.1km" |

Kết luận: **Phase B của job này hợp lệ** (mọi lượt HCMC đều centred on user và có km hợp lý); Phase B của job TRƯỚC là không hợp lệ (California). Sink: 16 bản ghi segment `android-retest`, 11 model-call, 5 canned.

## A.2 — Tái biện minh 3 fix, loại trừ lỗi GPS

| Fix | Có quan sát được độc lập với GPS không? | Khuyến nghị |
|---|---|---|
| `fb74e9c` collapse clarify | Có tính cấu trúc, không phụ thuộc GPS: ít token (bỏ ~220 ký tự canned + `[FOLLOWUPS]` mỗi lượt sau), "không hỏi 2 lần" thành bất khả về ví dụ. **Không hành vi nào cần model nhìn thấy lượt canned** — kiểm kê: `afterClarify = isClarifyReply(lastAssistantText)` (route 1249) đọc thread THÔ; `mergeClarifyAnswer(messages)`, intent gate, memory extractor, `priorVenuesIn`, referenceResolver đều đọc thô; chip [FOLLOWUPS] render ở client. Chỉ `modelMessages` (2 chỗ: AI.stream + đếm historyChars) nhận bản gộp. VERIFIED BY grep + dry-run capture sau fix. | **GIỮ** |
| `8b0dc46` cross-domain broad query | **B4 và B9 xảy ra TRONG job này, với GPS HCMC đã xác minh** (B9: 13:45, sau khi B8 cùng session có km 0.7). Cơ chế là logic tất định không dính GPS: gate đọc thread ⇒ `actionable:true domain:food` cho câu entertainment (unit test tái hiện không cần GPS: `ownDomainSwitch.test.ts`). Sau fix, B10b/c live: canned `scope:'turn'` → search. | **GIỮ** |
| `ad1f073`/`ede55d6` rule 4b | Câu hỏi chọn ở cuối reply quan sát được độc lập GPS: B3 (GPS đúng) "…hay foot massage?", B5 "Bạn chọn cái nào hợp hơn? 🏨", và trên harness web (Quận 1): F6, E2b, T2-rerun1 ("Bạn có muốn mình tìm thêm…?"); gate 40 hôm nay rule bắn 3 lần. Hậu quả đo được: B4 bị intent gate đọc là `clarification_response` vì "?" cuối B3. | **GIỮ** |

## B.1 — Provider là cấu hình, không phải sự hiện diện của secret (commit `a4f6016`)

`PLACES_PROVIDER=serper|google|osm`, **mặc định `serper`** (đúng mọi phép đo). Google chỉ chạy khi `=google`; `osm` bỏ cả Serper /maps. Giá trị lạ ⇒ log `tappyai_config_error` một lần + mặc định. Test `placesProvider.test.ts` (8): **key Google hợp lệ + `PLACES_PROVIDER=serper` ⇒ 0 call Google**; bỏ key ⇒ không đổi; `google`/`osm` chain đúng. 3 suite Google-path đặt `PLACES_PROVIDER=google` tường minh. VERIFIED BY unit.

**Owner phải đặt trên Vercel trước deploy:** `PLACES_PROVIDER=serper` (Production + Preview; tường minh, dù là mặc định). `GOOGLE_PLACES_API_KEY` có thể để nguyên — không còn ảnh hưởng hành vi. Muốn chạy Google-first (chưa đo) thì đặt `=google` có chủ đích.

## B.2 — "Vì sao" đi theo đúng pick của card #1 (commit `16e7ffd`)

`alignEmphasisToModelPick()` trước khi dựng payload: cùng entity ⇒ giữ; khác ⇒ bỏ nhấn của engine, pick của model nhận `recommended` + reasons từ CHÍNH row của nó (`rated N · N reviews · Nkm away`), bỏ trade-off của engine; không có pick model ⇒ không card nào có nhấn + log `emphasis_dropped_no_model_pick`. Tác dụng phụ tốt: `items[0]` (lead = recommended) nay cũng là pick của model cho mọi reader. VERIFIED BY unit (+3) và **live 1 lượt** (Android "resort phu quoc sang chut cho 2 nguoi", GPS capture 10.7769/106.7009): log `tappyai_cards emphasis:"rehomed"` (engine chọn khác), card #1 = Ocean Bay, **"Vì sao: rated 4.7 · 3176 reviews" = giá trị của Ocean Bay**, card #2 không có "Vì sao".

**Kiểm kê consumer của thứ tự/nhấn engine trên đường render (đã tìm 5):**

| # | Consumer | Trạng thái |
|---|---|---|
| 1 | `pickedRecs` so cả tên (card #1 = engine row) | sửa `8d4f5b5` |
| 2 | Fill card 2–3 theo engine khi model nêu <3 | thiết kế, không đụng #1 |
| 3 | "#1"/"🔥 Phổ biến" gắn vào vị trí 0 | web tắt khi `pickUnmatched` (`5ee5998`); Android chưa |
| 4 | `recommended`/`reasons`/`tradeOff` = derivePick engine | **sửa `16e7ffd`** |
| 5 | `primaryOf` → `items[0]` (lead) | theo `recommended` ⇒ nay = pick model; không pick ⇒ shortlist head (engine), có flag khi named-but-unmatched |
| 6 | G1 `pickName` = engine pick cho backstop "Mình chọn …" + telemetry attribution | chỉ khi model KHÔNG nêu pick — server-authored theo thiết kế; báo cáo |
| 7 | Marker `[TAPPY_PLACES]` cũ mang `recommended` engine | `EMIT_TAPPY_PLACES=false` — không phát |

## C — Android re-verify: **bỏ qua** (A.1 chứng minh GPS đã đúng); 1 lượt dùng cho B.2 live ở trên.

## D — Ship list

**BLOCKING (thông tin sai tới người dùng):** không còn mục nào sau B.1/B.2. Gần ngưỡng: **P2 budget-band overclaim** ("100–200k/người vừa ngân sách" với budget <100k — B1, B8, F7b, E6): thông tin giá là đúng row, câu kết luận "vừa ngân sách" sai; fix ≈ nửa ngày (guard so band ↔ `need.budget`, sửa câu/hedge). Owner quyết có chặn không.

**KNOWN ISSUES, ship as-is:**
| Vấn đề | Triệu chứng người dùng thấy | Cỡ fix |
|---|---|---|
| S7 shopping | "Mình tìm được vài lựa chọn…:" rồi trống, không có câu chọn; card vẫn có 6 sản phẩm | backstop pick shopping khi body còn chữ mà không có câu pick ≈ nửa ngày |
| "gợi ý thêm" search lại | chậm ~15 s và tốn 1 lượt tool (+15 credit hotel) dù rows đã có | evidence store place rows + canned "chỗ khác" ≈ 1–2 ngày |
| Map footer | "Xem tất cả trên bản đồ" mở Google Maps TÌM query, không phải 8 row vừa đọc; "quận 1" lặp | đổi nhãn 0 ngày; màn hình bản đồ riêng 1–3 ngày (§A.7 báo cáo trước) |
| Ảnh card | không tái hiện (Node/Playwright/Android 100 %); giữ retry `=w400-h300` | cần Network tab của Owner |
| Hotel enrich 8 ảnh để hiện 3 | không thấy; +5 credit +1–3 s/lượt hotel | giới hạn theo `CARDS_SHOWN` ≈ nửa ngày |
| Android `pickUnmatched` | badge "#1" vẫn hiện khi server không khớp pick (hiếm; log server có) | 1 dòng Kotlin + test |
| Đổi thành phố cùng domain ≠ task switch | hard `view` Đà Nẵng carry sang Phú Quốc (hedge thừa) | mở rộng switch theo destination ≈ nửa ngày |
| Model typo/tiếng Anh nhỏ | "Gia tham khảo", "Okee"; "Vì sao: rated · reviews" | i18n `rated/reviews` 1 giờ |

## E — Go / no-go

**GO có điều kiện (Owner quyết trên sự thật, không trên điểm):**
- 37/40 nằm trong biên ±3 mà eval này đã cho thấy (36 → 38 → 37 qua ba gate với cùng code lớp; S4/T2 lật ✓/✗ giữa các lần chạy).
- **Zero regression deterministic**: S7 3/3 là lỗ hổng cũ của đường shopping (cùng cắt ở gate 38/40), không có commit để revert.
- Zero tên quán bịa; late_open, upscale pass; memory lớn 6/6; Android 11/11 không hỏi lại với GPS đã chứng minh; B.1 khoá pipeline prod = pipeline đã đo; B.2 hết cặp card/giải-thích lệch.
- **Tín hiệu chất lượng:** advise/select/list = **23/6/6** (trước 18/11/6 — cùng 29 lượt có quyết định, nhiều lời khuyên hơn, ít chọn khô hơn); facts 3.9/6.
- Điều kiện: Owner đặt `PLACES_PROVIDER=serper` trên Vercel; chấp nhận danh sách ship-as-is; quyết P2 budget-band.

**Lượt: dùng 1 / còn 16.** Commit job này: `a4f6016` (B.1), `16e7ffd` (B.2). Sink segment `closeout-live @16e7ffd`.
