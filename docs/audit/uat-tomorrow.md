# UAT 2026-09-20 — kịch bản chạy từ trên xuống (LOCALHOST, code `16e7ffd` + log-only `61a0e9c`)

**Server:** launch config `uat-owner` → `http://localhost:3101` (đã bật tối 19/9, warm). Env: `PLACES_PROVIDER=serper`, `CONSULTATIVE_V1=1`, `PLACE_GUARD_ATTRIBUTION_V2=1`, `SNIPPET_PRICE_GUARD_V2=1`, `MEDIA_PLACEMENT_V2=1` (= production sau deploy).
**Log mỗi lượt:** `docs/audit/uat/2026-09-20/` → `server.log` (console), `usage.jsonl` (cost/Serper/cắt grounding), `capture.jsonl` (request: surface, GPS, câu user). Bảng theo số lượt:

```bash
node scripts/audit/uatturns.mjs docs/audit/uat/2026-09-20 --md
```

(một lượt = một dòng; `--turn N` in thêm prose TRƯỚC khi grounding gate cắt). **Chạy web và Android TUẦN TỰ, không song song** — hai lượt cùng lúc sẽ trộn log.

**Đăng nhập web:** `http://localhost:3101/login?email=1` bằng AUDIT_TEST_USER_EMAIL / PASSWORD trong `audit-nonprod/.env.local` (user Pro: miễn quota, có memory). Guest (web không đăng nhập / Android "Dùng thử") bị quota 5 câu/lifetime tính trong process — nếu gặp `anon_limit_reached`, restart `uat-owner` (đếm lại từ 0).
**Memory:** session A = xoá memory trước (`node scripts/audit/clearmem2.mjs`, in `user_memory after 0`); session B = để nguyên memory sau session A (hoặc `node scripts/audit/seedmem.mjs` để có memory lớn).
**Android:** APK debug build từ `16e7ffd` đã cài (`com.tappyai.app.debug`, backend `10.0.2.2:3101`, đã kiểm 1 request tới server tối 19/9: surface android, GPS 10.7769/106.7009). Trước lượt đầu: `bash scripts/audit/uat-android-gps.sh` → phải in `fused 10.776900,106.700900`; sau lượt model đầu tiên, cột GPS trong bảng `uatturns` phải là `10.7769,106.7009` — **nếu là 37.42,-122.08 thì dừng, GPS sai (lỗi đã tốn một job)**.

Ký hiệu: **Gõ** · **Đúng** · **Sai** = tiêu chí rớt.

## WEB — Session A (memory đã xoá, đăng nhập audit user)

| # | Gõ | Đúng | Sai |
|---|---|---|---|
| W1 | `ăn gì ngon giờ` | Trả lời canned $0 (bắt đầu "Để chọn đúng chỗ, mình cần biết thêm:"), 3 chip tầm giá; KHÔNG search | model tự hỏi bằng lời khác; search ngay; hỏi về khu vực dù có GPS |
| W2 | bấm chip `dưới 100k/người` | Search (bảng: toolCalls 1), pick rõ 1 quán câu đầu, 3 card, card #1 = quán được chọn (`card1` = `model pick`), "Vì sao" ở card #1 | hỏi lại bất kỳ câu gì; card #1 khác quán prose chọn; "Vì sao" ở card khác |
| W3 | `quán phở ngon ở Quận 1 cho 2 người` | Search thẳng (không clarify), pick + ≤1 lựa chọn thay thế, kết bằng khuyến nghị (không kết bằng câu hỏi chọn) | clarify canned bật cho câu đã đủ; kết "Bạn muốn … hay …?" |
| W4 | `spa nào mở khuya sau 22h ở Quận 3` | Nếu có row mở sau 22h: pick nêu giờ đóng ≥22:00 đúng row (bảng: `hard ["late_open"] backed`); nếu không: nói rõ "chưa xác nhận được…" và nêu chỗ gần nhất | khẳng định "mở khuya" khi bảng ghi `gaps ["late_open"]`; giờ trong prose ≠ card |
| W5 | `resort Phú Quốc cho kỷ niệm 1 năm, sang chút` | Card #1 = resort model chọn, không guest house/hostel; "Vì sao" đúng card #1; câu hedge "chưa thấy bằng chứng về mức sang trọng" nếu bảng `gaps ["upscale"]` | card #1 là nhà nghỉ/hostel; "Vì sao" ở card #2 |
| W6 | `khách sạn Đà Nẵng có view biển, sang chút` | Pick + hedge về `view`/`upscale` nếu không có bằng chứng; KHÔNG carry ràng buộc lượt trước (bảng `hard` chỉ `[view, upscale]`) | bảng `hard` còn `late_open` từ W4; khẳng định "view biển" khi gaps có `view` |
| W7 | `quán ăn Phú Nhuận có phòng riêng cho 8 người` | Pick + câu "Mình chưa thấy bằng chứng về phòng riêng… nên gọi hỏi trước" (P2 hedge), không khẳng định có phòng riêng | prose nói "có phòng riêng" mà bảng `gaps ["private_room"]` |
| W8 | `mua tai nghe bluetooth dưới 1 triệu, pin trâu` | Card shopping + câu "Mình chọn **<tên>** — giá, sao"; giá trong prose = giá card | prose không có câu chọn (như S7 đã biết — ghi nhận, không chặn); giá prose ≠ card |
| W9 | `gợi ý thêm` | 2–3 quán KHÁC từ cùng bộ (ghi nhận: hiện search lại, toolCalls 1 — known issue) | lặp lại đúng pick cũ; đổi thành phố |
| W10 | `cuối tuần đi chơi đâu` (câu rộng KHÁC domain giữa session) | Canned clarify $0 với chip giải trí (bảng: clarify `ASK/entertainment/turn`) | model tự hỏi bằng lời ("bạn thích chơi gì?"); search food |
| W11 | bấm chip `200–500k/người` | Search giải trí, pick, card #1 = pick | hỏi lại |
| W12 | (P2 — chấm mức trung thực) `quán ăn tối gần đây dưới 100k/người` | Nếu card #1 có band `100–200k` hay `1–100.000 ₫`: prose PHẢI không nói "vừa ngân sách" khi band vượt 100k, hoặc nói "chưa có giá để đối chiếu" | "100–200k/người, hoàn toàn vừa tầm" với budget <100k (P2 open — Owner quyết chặn hay không) |
| W13 | UI trên lượt có card: cuộn card | 3 card trên fold, "Xem thêm N chỗ" mở fold KHÔNG gọi server (bảng không có lượt mới); ảnh card #1 hiện (hoặc placeholder sau 1 lần retry); nút "Review trên TikTok" mở tiktok.com; "Xem tất cả trên bản đồ" mở Google Maps **tìm query** (known issue: không phải 8 row) | fold tạo lượt mới; ảnh vỡ không placeholder; TikTok mở trang search chung |

## WEB — Session B (memory còn từ A)

| # | Gõ | Đúng | Sai |
|---|---|---|---|
| W14 | `ăn gì ngon giờ` | Nếu memory có budget/sở thích: có thể **không** clarify mà search + "mình chọn theo … bạn nói trước đây"; nếu clarify thì đúng W1 | hỏi lại thứ memory đã có ("KHÔNG BAO GIỜ hỏi lại vì thông tin trên") |
| W15 | `sinh nhật sếp, tiếp khách 8 người, phòng riêng, tầm 500k/người, Quận 1` | Pick + hedge phòng riêng; không "mình đã kiểm tra…" giả (bảng: toolCalls 1) | claim đã gọi/kiểm tra khi toolCalls 0 |
| W16 | `quán này mở mấy giờ?` | Canned carried-fact $0 (bảng: canned carried_fact) hoặc re-search theo TÊN (toolCalls 1, query = tên quán) | search rộng mới; giờ khác card |

## ANDROID (emulator, guest "Dùng thử", GPS Quận 1 đã kiểm)

| # | Gõ (không dấu được) | Đúng | Sai |
|---|---|---|---|
| A1 | `an gi ngon gio` | canned clarify, chip; bảng: lượt canned | như W1 |
| A2 | chip `dưới 100k/người` | search; card #1 = pick; **cột GPS = 10.7769,106.7009**; khoảng cách "cách bạn X km" hợp lý (<3 km Q1) | GPS 37.42; không có km; hỏi lại |
| A3 | `quan pho ngon o quan 1 cho 2 nguoi` | như W3; kết không bằng câu hỏi chọn | |
| A4 | `spa nao mo khuya sau 22h o quan 3` | như W4 | |
| A5 | `resort phu quoc sang chut cho 2 nguoi` | như W5; "Vì sao: rated · reviews" ở card #1 = giá trị card #1 | "Vì sao" ở card #2 |
| A6 | `khach san da nang co view bien` | như W6 (không carry) | |
| A7 | `quan an phu nhuan co phong rieng 8 nguoi` | như W7 | |
| A8 | `goi y them` | như W9 | |
| A9 | `cuoi tuan di choi dau` | canned clarify `scope:turn`; chip giải trí | model hỏi "bạn thích chơi gì?" |
| A10 | chip `dưới 200k/người` | search, card #1 = pick | |
| A11 | `mua tai nghe bluetooth duoi 1 trieu` | card shopping + câu chọn | |
| A12 | UI: cuộn card | 3 card + dấu chấm ●○○, "Xem thêm 5 chỗ" mở fold không gọi server, "Thu gọn"; ảnh card #1; "Review trên TikTok" mở app/web TikTok; "Xem tất cả trên bản đồ" mở Google Maps (search) | crash (logcat FATAL); card trống |
| A13 | (P2) `quan an toi gan day duoi 100k` | như W12 | |

## Sau UAT
```bash
node scripts/audit/uatturns.mjs docs/audit/uat/2026-09-20 --md > docs/audit/uat/2026-09-20/turns.md
```
Ghi số lượt (#) cạnh mỗi nhận xét "kỳ kỳ" — mọi thứ trong bảng đối chiếu được về prose trước/sau guard, provider, card #1 vs pick, hard gaps, credits, $.
