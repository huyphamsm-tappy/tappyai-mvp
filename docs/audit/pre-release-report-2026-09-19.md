# PRE-RELEASE JOB — báo cáo 2026-09-19 (nhánh `merge/main-into-v3`, code đầu job `60982f9` → cuối job `b250124`)

Ngân sách 70 lượt (lượt = model call thật; canned $0 không tính). **Đã dùng: Phase A 0 · Phase B 11 · Phase C 0 → còn 59.**
Quy ước: mỗi khẳng định ghi *VERIFIED BY* = unit (test) / live (server audit :3101 + emulator) / reasoning (đọc code).

## 0. KẾT LUẬN TRƯỚC — **NO-GO (tạm)** và dừng chờ Owner quyết

Phase B trên Android tìm ra **1 lỗi chặn release nằm trong architecture lock** (Owner quyết, không tự sửa):

> **P1 — "hỏi lại thay vì search" lặp nhiều lần trong một hội thoại.** Session 2 (chat mới, GPS Quận 1, guest 18+): canned clarify ($0) → chip "dưới 100k/người" → model **hỏi "Bạn muốn ăn gì?"** (không search) → "quan an ngon o phu nhuan, co cho dau xe hoi" → model **hỏi lại lần 2** ("Nhưng mình vẫn chưa biết bạn muốn ăn gì") → "khach san gan san bay tan son nhat" → model **hỏi lần 3** ("Mấy người?"), tự bắt chước đúng format canned clarify. Server log cả 3 lượt: `clarify_gate actionable:true, missing:[]`, `forcedTool: search_places` (lượt 2, 3), `search_now exact:true` (lượt 1), **`toolCalls: 0`**. Session 1 trước đó: 1/2 (lượt chip hỏi lại, lượt "quan 1" mới search). Tổng Android: **4/5 lượt sau clarify không search.** Web eval trước (F8): 1/5.
> VERIFIED BY live (and-22, and-23, and-24) + log. Nguyên nhân cơ chế: `toolChoice` luôn `'auto'`, chỉ có prompt (khối SEARCH-NOW / forcedTool) — và **architecture lock** (`consultativeArchitecture.test.ts`: đúng 1 `AI.stream()`, AI layer không có `toolChoice`) cấm ép tool. AI SDK 4.3.19 `streamText` không có `prepareStep` (chỉ `generateText` có) nên "ép bước 1 rồi thả" không làm được trong 1 stream với SDK hiện tại. Đã chứng minh từ 2026-09-18: luật prompt không ép được tool call.

Vì Phase C chỉ chạy "sau khi A và B xanh", **gate 54 lượt chưa chạy** — không đốt 54 lượt lên một bản sẽ đổi nếu Owner mở lock. Cần Owner chọn (mục 8).

Ngoài P1, Phase B tìm được **3 lỗi thật đã sửa + test** (mục 7) và một số ghi nhận nhỏ (mục 9).

## 1. A.1 — Grounding gate: 6 chuỗi TRƯỚC / SAU (commit `850f5c1`, 0 lượt, VERIFIED BY unit — 65 test xanh, 9 test mới đỏ 5/9 trên gate cũ)

| Chuỗi | TRƯỚC (gate cũ) | SAU |
|---|---|---|
| `**Bữa Trưa**` | prose (lexicon) — không cắt | prose — không cắt |
| `**Lưu Ý**` | prose (lexicon) — không cắt | prose — không cắt |
| `**Tổng Kết**` | prose (lexicon) — không cắt | prose — không cắt |
| `**Gợi Ý Thêm**` | shape = tên ⇒ **cắt cả block** (3 câu còn lại của đoạn + đoạn sau, tới heading kế/ hết prose) + thêm dòng "xem card" | tên không grounded ⇒ cắt **đúng 1 câu** mang nó; đoạn còn nguyên |
| `**Món Ngon Hôm Nay**` | như trên — cắt cả block | cắt đúng 1 câu |
| `**bún bò Huế cô Ba**` (row thật, viết thường) | prose theo shape — không cắt nhưng **không được nhận là venue** | **row-match trước** ⇒ grounded, đếm là venue |

Hành động tỉ lệ: (1) row-match trước shape; (2) tên không grounded ⇒ bỏ đúng câu chứa nó (`sentenceSpans`, từ đầu dòng, không quá heading kế); (3) không định vị được câu ⇒ **giữ nguyên + log `grounding_gate kept_no_sentence`**; (4) dòng "xem card" chỉ thêm khi prose còn lại không nêu venue grounded nào. **Mất mát tệ nhất từ 1 false positive: trước = từ heading giả tới heading kế/hết bài (T6: cả itinerary; F8: cả hedge); sau = 1 câu.**

## 2. A.2 — Giá / khoảng cách: chẩn đoán (0 lượt, KHÔNG implement; VERIFIED BY reasoning trên 35 answer có row của finalGate + đọc code)

**GIÁ thiếu trong prose 13/35.** Chia: row CÓ giá mà prose không nêu **3** (S4 6/9, S7 6/6 — shopping card mang giá, prose không; E8 2/10); row KHÔNG có giá **10** (F3 F4 F6 T4 T8 P3 P8 E1 E3 E4). Theo vertical, row có giá: food chỉ khi có budget kích hoạt `/maps` price retry (item-5 gating: F2 10/10, F7b 9/10, F8 7/10 vs F1/F3/F4 0/10); spa 0/80; entertainment ≈0; hotel 0; T6 8/10.
**KHOẢNG CÁCH thiếu 13/35.** Row có `distance_km` mà prose không nêu **2** (F6, P3 — follow-up hỏi fact); row KHÔNG có **11**: toàn bộ shopping (không có khái niệm) + hotel/destination (T1 T2 T8 T6): `distance_km` chỉ tính khi search **centred on user GPS** (BUG-011 D2); có từ chỉ khu vực ⇒ `centeredOnUser:false` ⇒ không tính; model copy không có toạ độ.
**Đề xuất (chưa làm):** (a) food: bật `/maps` price retry mọi lượt food (+1 credit ≈ $0.001, +~40 token/lượt); (b) spa/entertainment: snippet giá qua `/search` (+1 credit, +400–800 token, REVIEW_SUPPORTED, guard hiện có); (c) shopping: luật prose "nêu giá card" (0 token); (d) destination: tính khoảng cách từ **centroid destination** đã biết, nhãn "cách trung tâm <dest>" (0 call, +~100 token/lượt). Tổng ≈ +$0.001–0.003/lượt tuỳ vertical.

## 3. A.3 — `hard_not_applicable` của shopping có che lỗi lớp S5b không? (VERIFIED BY reasoning)

Có. S5b ("nước hoa nam cho bạn gái") không có `situation.hard` nào (13 giá trị `Hard` đều là thuộc tính chỗ ăn/ở), nên `applyHardConstraintGate` với shopping log `hard_not_applicable` với `hard: []` — tức là "không có gì để kiểm" chứ không phải "đã kiểm và đúng". Lệch giới tính/đối tượng nhận là ràng buộc **sản phẩm ↔ người nhận**, chưa có mô-đun nào đọc (tương tự `admitsForUpscale` nhưng cho shopping); hôm nay nó vô hình với telemetry. Cần một luật shopping-side (recipient gender/product class) và log riêng — không nằm trong job này.

## 4. A.4 — Ảnh card (commit `e7214ca`)

(a) 10 URL thật `https://lh3.googleusercontent.com/gps-cs-s/<token ~150 ký tự>` (2 `grass-cs/`), dài 182–191, **không query, không size suffix, không token/expiry**; `cache-control: public, max-age=86400, no-transform`; JPEG ~121 KB (~78 KB với `=w400-h300`). VERIFIED BY live (`scripts/audit/photoMatrix.mjs`).
(b) Ma trận Node (không header / UA / UA+Referer `www.tappyai.com` / UA+Referer rỗng × as-is / `+=w400-h300`): **80/80 → 200**.
(c) Playwright 1.63 **headless** Chromium 153 (headed: `spawn UNKNOWN`, chỉ có headless shell — nêu rõ): 6 lần tải × 30 img (default / no-referrer / origin, URL khác nhau) = **180/180 naturalWidth>0**, 200 có và không Referer. Pane built-in hôm nay 32/32 + burst 48/48. 429 hôm qua (5–12/16, hết sau ~30 s) **không tái hiện**; tương quan theo burst/thời gian, không theo referrer.
(d) Android: Coil/OkHttp không gửi Referer; ảnh card #1 hiển thị ở mọi lượt có card (and-09, and-13, and-15, and-26, and-27). **Android không có vấn đề ảnh.**
(e) Expiry: không có (không token); chỉ `max-age=86400`.
(f) Sửa theo bằng chứng: `CardPhoto` retry **1 lần** với `=w400-h300` sau 1200 ms rồi mới collapse (`place-photo-failed`); **không** thêm referrerPolicy (bằng chứng không ủng hộ). +3 test. Tỉ lệ render trước/sau: hôm qua 31–75 % (429 burst) → hôm nay 100 % ở cả 3 kênh (không tái hiện được lỗi nên "sau" là trần, không phải chứng minh fix).

## 5. A.5 — Google Places key (VERIFIED BY live trên audit env; prod KHÔNG đo được)

- Key đọc ở `GOOGLE_PLACES_API_KEY` (`food.ts:704`, `common.ts:85`). Audit `.env.local` và `v3-phase4-design/.env.local` cùng **một** key: last-4 `LKXQ`, dài 39, sha256[:8] `32640e98`. **Prod (Vercel) không đọc được** — đọc env repo chính bị từ chối; `gcloud auth list` bị từ chối ⇒ không thử auth.
- Places API (New) `places:searchText` → **403** `{"error":{"code":403,"message":"The caller does not have permission","status":"PERMISSION_DENIED"}}` (96–426 ms). Legacy textsearch → `REQUEST_DENIED: This API key is not authorized to use this service or API. Please check the API restrictions settings of your API key` (= **API restriction của key**). Geocoding → `This API is not activated on your API project` (= API chưa bật).
- Console (Owner làm): APIs & Services → Credentials → key …LKXQ → *API restrictions* → thêm "Places API (New)"; Library → enable Places API (New).
- Runtime: Google gọi TRƯỚC → 403 → breaker `PLACES_BREAKER_MS` 10 phút (`food.ts:593/606`) → Serper `/maps` → OSM. Người dùng không thấy; ≤1 call phí (~100–400 ms) mỗi 10 phút mỗi process (mỗi serverless instance).
- Giữ hay bỏ: Places (New) ≈ $32+/1000 vs Serper ≈ $3/1000; **mọi guard/eval xây trên field row của Serper**; nếu prod key được mở, prod lật sang pipeline Google **chưa đo**. **Khuyến nghị: tắt/flag-off call Google cho release này** (không tự bỏ — Owner quyết). Parity: số audit = Serper-first-in-practice; prod giống hệt **chỉ khi** prod key cũng bị restrict (chưa xác minh được).

## 6. Phase B — Android E2E (APK debug từ `43d37d2`, Android source không đổi; backend audit :3101 @ `e7214ca` → `8d4f5b5` → `b250124`; GPS 10.7769,106.7009 Quận 1; guest 18+; emulator Pixel_8_uat)

Lượt model: 11. Canned $0: 3. Chi phí Phase B: $0.079 (3 lượt đầu) + $0.312 (10 lượt sau) = **$0.39**; hotel turn 15 Serper credit/lượt (ảnh 8 chỗ), food 4–7.

| # | Lượt (text gõ không dấu) | Kết quả | 3 card | Ảnh | TikTok | Bản đồ | GPS→BE | Crash | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|
| 1 | "an gi ngon gio" | canned clarify $0 (3 chip budget) | — | — | — | — | ✓ `area:true` | không | bullet "•" render trong 1 đoạn (Android) ⚠️ |
| 2 | chip "dưới 100k/người" | **hỏi lại "khu vực nào?"**, không search | — | — | — | — | ✓ | không | **P1 lớp ask-không-search** |
| 3 | "quan 1" | search; pick **Béo Ơi Quán** | ✓ nhưng **card #1 = "Quán ăn ngon Sài Gòn" 200–300k, không được nhắc** | ✓ | ✓ | ✓ | ✓ | không | **LỖI → sửa `8d4f5b5`** |
| 4 | "spa nao mo khuya sau 22h o quan 3" | "chưa xác nhận được spa nào mở sau 22h", gần nhất An Miên 22:00 | ✓ #1 = pick (fix live) | ✓ | ✓ | ✓ | ✓ | không | `hard_gaps:[late_open]` đúng; model gõ "chua" ⚠️ |
| 5 | "tim resort o phu quoc sang chut cho 2 nguoi" | pick Ocean Bay 4.7★/3176; hedge **"chưa thấy bằng chứng về giờ mở khuya"** cho resort | ✓ #1 = pick | ✓ | #2 có | (hotel không có footer map) | ✓ | không | **LỖI carry `late_open` → sửa `56afca4`**; "các quán này" cho resort ⚠️; "Gia tham khảo" typo ⚠️ |
| 6 | "goi y them" | 2 resort khác từ **cùng bộ rows** nhưng **`toolCalls:1` = search lại** (get_hotel_prices) | ✓ | ✓ | ✓ | — | ✓ | không | **Không đạt "không search mới"** — gap đã ghi trong `b40dc8a` ("chỗ khác vẫn đi qua model"); vẫn còn hedge late_open → **sửa `b250124`** |
| 7 | "xkhach san da nang co view bien, sang chut" (chữ "x" thừa do harness gõ khi bàn phím đang mở) | pick Meliá Vinpearl **Riverfront** ("bờ sông Hàn") cho "view biển"; hedge `view/upscale` chưa có bằng chứng | ✓ | ✓ | ✓ | — | ✓ | không | frame `[view,upscale]`, **không** còn late_open ✓; pick sông ≠ biển: `view` là hard chung, không phân biệt sea view ⚠️ |
| 8 | "xquan an ngon o phu nhuan" (chữ "x" thừa) | pick Tám Riêu Phú Nhuận; hedge view/upscale **carry** | ✓ | ✓ | ✓ | ✓ | ✓ | không | carry là do "xquan an" không khớp `\bquan an\b` ⇒ không nhận task-switch (lỗi harness, không phải fix) — replay cùng hội thoại với text đúng qua curl (403 sau intent-gate, 0 lượt): `new_consultation` ✓ |
| 9 | (Home card "Ăn gì?") | canned clarify $0 — **chat mới** (thao tác nhầm của harness) | — | — | — | — | ✓ | không | chỉ 3 chip budget dù hỏi 2 câu (Mấy người?) ⚠️ |
| 10 | chip "dưới 100k/người" | **hỏi "Bạn muốn ăn gì?"**, không search | — | — | — | — | ✓ | không | **P1 (2/2 chip)** |
| 11 | "quan an ngon o phu nhuan, co cho dau xe hoi" | **hỏi lại lần 2** dù `forcedTool:search_places`, area+budget+hard đủ | — | — | — | — | ✓ | không | **P1**; câu đầu bị snippet_price cắt ⇒ reply mở đầu bằng "Nhưng…" ⚠️ |
| 12 | "khach san gan san bay tan son nhat" | `new_consultation` ✓, frame `hard:[]` (**parking không carry — fix `b250124` VERIFIED live**); model **hỏi lần 3** ("Mấy người?") bắt chước format canned | — | — | — | — | ✓ | không | **P1** |
| 13 | (chat mới, category Ăn uống) "quan pho ngon o quan 1 cho 2 nguoi, duoi 100k" | search; pick Phở Nhất Vị 4.9★/1101; card giá "1-100.000 ₫" | ✓ #1 = pick | ✓ | ✓ | ✓ | ✓ | không | prose dài (preamble "mình sẽ tìm ngay…" + câu hỏi cuối) ⚠️; "Vì sao: rated 4.9 · 1101 reviews" tiếng Anh ⚠️ |

Kiểm 0 lượt trên lượt 13: **"Xem thêm 5 chỗ"** mở fold client-side (8 dot, "Thu gọn", **không có POST mới** — VERIFIED BY server log) ✓. **"Xem tất cả trên bản đồ"** mở Google Maps app với `maps?q=phở ngon quận 1 Quận 1, TP HCM` — là **Google Maps search cho query, KHÔNG phải 8 row của mình** (đúng thiết kế `b40dc8a`; "quận 1" lặp 2 lần ⚠️). **TikTok**: nút "Review trên TikTok" có ở mọi lượt có card; **chưa bấm** (hội thoại mất khi app relaunch — guest chat không persist ⚠️). Crash: `logcat -b crash` 0, dropbox 0.

## 7. Sửa trong Phase B (mỗi lỗi 1 commit, có test đỏ-trước/xanh-sau)

| Commit | Lỗi | Sửa | Prose behaviour | VERIFIED BY |
|---|---|---|---|---|
| `8d4f5b5` | 3 card ≠ venue model nêu: `pickedRecs` so **cả tên** row ("Béo Ơi Quán - Món ngon Hà Nội") với prose, model viết "Béo Ơi Quán" ⇒ `named_in_prose:0`, fold lấy theo engine order, card #1 là chỗ không được nhắc | dùng `findPlaceOffset` (header ⊂ tên / exact / segment / token overlap có competitor) — đúng locator ảnh đang dùng | NO | unit `cardsPickedByProse.test.ts` (đỏ trên code cũ: card #1 = "Quán ăn ngon Sài Gòn" y hệt emulator) + live lượt 4, 5, 13 (#1 = pick) |
| `56afca4` | frame gộp 3 lượt user bất kể task-switch ⇒ `late_open` spa carry sang resort | window 1 trên `new_consultation` | YES (V1 ON) | unit — **bị thay bởi `b250124`** (không đủ: refinement sau switch vẫn carry) |
| `b250124` | như trên, cả lượt refinement sau switch ("goi y them") | `consultationUserTexts()` (refinement.ts): chỉ các lượt user từ task-switch gần nhất; không switch ⇒ như cũ | YES (V1 ON) | unit `frameTaskSwitch.test.ts` 9/9 + live lượt 12 (`hard:[]` sau lượt food có parking) |

Suite: `src/lib/ai` + `recommendation` + `components/chat` + `api/chat` 4530 passed; `tsc -p tsconfig.json` sạch. Audit server ở `b250124`.

## 8. P1 — các lựa chọn cho Owner (không tự làm vì architecture lock là quyết định đã test)

1. **Giữ lock, chấp nhận**: flow "câu hỏi rộng → clarify → trả lời" trên Android hỏng 4/5; các flow **đã đủ thông tin** (lượt 3, 4, 5, 7, 8, 13) đều search và ra card đúng. Release với ghi chú "hỏi rộng có thể bị hỏi lại 1–3 lần".
2. **Mở lock cho đúng lượt sau canned clarify**: ép `search_places` ở bước 1. Với SDK 4.3.19 cần 2 `streamText` (bước ép tool + bước prose) merge vào 1 data stream (`createDataStream`), hoặc nâng AI SDK 5 (`prepareStep` trên streamText). Số LLM call **không tăng** (lượt tool hôm nay đã 2 call). Ước tính 1–2 ngày + gate lại 54 lượt.
3. **Giảm nhẹ trong lock (chưa chứng minh)**: gộp Q&A clarify vào lượt user trong `modelMessages` (như `mergeClarifyAnswer` đang làm cho framing) để model không thấy "ví dụ hỏi"; không đảm bảo (session 1 lượt 2 vẫn hỏi ngay sau canned).
4. **Route trả canned cho lượt hỏi-lại**: phát hiện reply hỏi lại sau clarify (`afterClarify && toolCalls===0 && kết thúc "?"`) và thay bằng… không có row để trả ⇒ không khả thi trong lock.

**Nếu Owner chọn 2 hoặc 3: xin +20 lượt contingency** (Android re-test 6 + gate lại phần F/T bị ảnh hưởng 14).

## 9. Ghi nhận khác (không chặn, chưa sửa)

- "gợi ý thêm" search lại (gap đã ghi `b40dc8a`) — tốn 1 lượt tool + 15 credit trên hotel.
- Hedge server: "ở các **quán** này" cho resort/spa; chip clarify chỉ render câu hỏi 1 (budget), không render "Mấy người?"; bullet "•" trong 1 đoạn trên Android; "Vì sao: rated · reviews" tiếng Anh; maps query lặp "quận 1"; guest chat mất khi relaunch; model typo ("chua", "Gia", "Okee").
- `view` là hard chung — "view biển" chọn riverfront mà không có `hard_contrary`.
- Ảnh hotel: `photoPlacesSelected: 8` (không phải 3 chỗ được nêu) ⇒ 8 Serper image call/lượt hotel; food turn `photoPlacesSelected: null`. Kiểm lại item-2 "photo named-only" cho hotel.
- Cache: 2 lượt ask (T10, T11) `cacheRead 0 / cacheWrite ~25k` cách nhau 2m45s — prefix không hit dù <5 phút; T12 hit 20k. Cần đối chiếu BP1 giữa lượt có/không tool result.

## 10. Phase C / D — CHƯA CHẠY

Gate 40 lượt, rerun, seeded-memory, differentiation metric (so 18/11/6 và 3.98/6): **không chạy** vì B không xanh (P1). Bản cuối hiện tại `b250124` (3 fix trên `60982f9` + A.1 + A.4). Khi Owner quyết mục 8, chạy gate trên commit cuối, memory sạch, cold, 2 nửa có remint.

**Ship UNVERIFIED nếu release ngay:** gate 40 trên `b250124` (4 commit mới sau gate 38/40 của `849cb55`); prod Google key; TikTok tap trên Android; iOS.
**Owner tự làm:** GCP console (key …LKXQ, API restriction); Vercel env prod (fingerprint key prod); quyết P1; apply migration đã ghi trước.

## 11. Lượt: Phase A 0 · Phase B 11 (+3 canned) · Phase C 0 · **còn 59/70**. Tất cả số cost là live trên audit env (cold/warm ghi theo cột hit trong `costseg`).
