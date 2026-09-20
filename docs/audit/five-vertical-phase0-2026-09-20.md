# FIVE-VERTICAL PARITY — PHASE 0 AUDIT (2026-09-20, code `61a0e9c`, 0 lượt, không đổi code)

Mọi dòng ghi VERIFIED BY: **code** (đọc mã), **runs** (43 thư mục run `docs/audit/eval/runs-owner3`, 328 lượt đã chạy live 18–19/9), **sink** (`usage-owner3.jsonl`), **live** (emulator/harness), hoặc **reasoning only**.

## 0.1 — Bảng theo vertical (hợp đồng cho phần còn lại của job)

| | Food & beverage | Shopping | Travel (hotel · air · coach/rail) | Spa | Entertainment |
|---|---|---|---|---|---|
| **Tool** | `search_places` (Serper `/maps` → OSM; +`/search` giá khi có budget) | `search_products` (Serper `/shopping` → `/search`) | `get_hotel_prices` (Serper `/maps` + `site:booking/agoda`), `get_flight_prices` (Travelpayouts API cần `TRAVELPAYOUTS_TOKEN`; link Trip.com/Traveloka/Google Flights), `get_transport_options` (Serper `/search` ×2 + link), `get_weather`, VnExpress editorial | `search_places` type spa | `search_places` type bar/cinema/attraction (karaoke→bar, rạp phim→cinema, công viên/bảo tàng/vui chơi→attraction); phim = kiến thức model (E7, không tool) |
| **Answer unit** | VENUE | PRODUCT (card shopping) | VENUE (hotel) · **SCHEDULE+TICKET: chưa tồn tại** — air/coach/rail trả về link + ghi chú, không có row giờ/giá (T7 0 row 4/4 lần; 1 lần T1-rerun có 20 fare Travelpayouts nhưng không thành unit) | VENUE | VENUE; **showtime/vé: không có** |
| **Grounding gate** | có — bold ↔ tên row `/maps` (row-match trước, shape sau, cắt 1 câu) | có — bold ↔ **tiêu đề sản phẩm** (`productRecords.title`); giá do **money guard** (R3: cắt CẢ câu chứa số tiền không có bằng chứng) + spec guard | có cho hotel (tên row); air/coach: **không có tên để đối chiếu** — `travelGuard` che fact động (giá vé/giờ) khi không có bằng chứng live | có (tên row) | có (tên row) |
| **hardConstraintGate** | ÁP DỤNG (`_tappy_hard_gaps`, hedge) | **`hard_not_applicable`** — validator riêng `shoppingConstraints.ts` (chỉ: productType 7 loại điện tử, brand, budget, RAM/SSD, phụ kiện). Không có size/variant/tồn kho/người nhận ⇒ S5b vô hình | hotel: ÁP DỤNG; air/coach/rail: `hard_not_applicable` | ÁP DỤNG | ÁP DỤNG |
| **13 hard nhận diện** | cả 13 (lexicon chung; `late_open`/`delivery` ROW_FLAG_BACKED, `air_con` ASSUME_PRESENT, 10 còn lại EVIDENCE_REQUIRED) | **0** (lexicon `Hard` là thuộc tính chỗ) | hotel: 13 nhưng row hotel không có giờ ⇒ `late_open` luôn field_missing; `view` là hard chung (sea view ≠ river) | 13 (spa thực dụng: quiet, late_open, upscale, parking) | 13 (thực dụng: kids, live_music, late_open, parking) |
| **Eval 40 nhắm vào** | 8 (F1–F8) +1 answer | 8 (S1–S8) +2 | 8 (T1–T8) +1: hotel 3, flight 1 (T7), plan/itinerary 2, follow-up 1, outing 1; **coach/rail 0** | 8 (P1–P8) +2 | 8 (E1–E8) +2: cinema-venue 1, phim 1, karaoke 1, bar 1, trẻ em 1, outing 3; **showtime/công viên nước/thuỷ cung/khu vui chơi lớn 0** |
| **Đã chạy live** (VERIFIED BY runs) | 66 lượt | 55 lượt (37 lần `search_products`) | 66 lượt: `get_hotel_prices` 37 lần; `get_flight_prices` **5 lần, 4 lần 0 row**; `get_transport_options` **0 lần — chưa bao giờ chạy live** | 74 lượt | 67 lượt |
| **Link affiliate/booking** | GrabFood/ShopeeFood = **trang tìm kiếm** (L2), không tracking; card render ✓ | Link sản phẩm = **trang Google Shopping** (`google.com/search?ibp=oshop…`), không phải trang merchant; CTA "Tìm trên Shopee/Lazada" = **trang search**; **0 link tracking** (CCP_ENABLED=false) | Hotel: Booking = **searchresults**, Agoda = **HOMEPAGE**, +link OTA riêng khi `site:` tìm được; Air: Trip.com/Traveloka search URL, Google Flights; Coach: **Vexere HOMEPAGE**, dsvn.vn homepage; không tracking | Klook có adapter CCP (approved) nhưng OFF; card chỉ website/call/maps | CGV/Ticketbox có registry nhưng OFF; card: website/maps/call; **không link vé** |
| **Web vs app** | giống (cùng annotation `tappy.places.v1`) | web `ShoppingDecision`; Android render card shopping (D1) ✓ | giống; link trong prose (markdown) cả hai | giống | giống; Android chưa render `pickUnmatched` (badge #1 vẫn hiện); bullet canned clarify render 1 đoạn trên Android |

**Gap nêu đích danh:** (1) SCHEDULE+TICKET unit không tồn tại; (2) shopping ngoài lưới hard-constraint và validator chỉ biết 7 loại điện tử; (3) coach/rail chưa chạy live lần nào, flight 4/5 lần không row; (4) Vexere/Agoda/dsvn = homepage (vi phạm "không homepage"); (5) mọi link mua/đặt = search page/Google Shopping, 0 tracking; (6) không eval cho showtime, công viên nước, thuỷ cung, coach/rail; (7) Android thiếu `pickUnmatched`; (8) `place_claim` guard không kiểm GIỜ trong prose (kiểm rating/count/phone/distance/ticket) — giờ mở là claim số/thời gian chưa gate; (9) hotel `late_open` luôn field_missing (row không giờ).

## 0.2 — Card fields như đã xây (`LivePlace`, `liveView.ts`; VERIFIED BY code + live Android/web)

Có: `name`, `rating` + `ratingCount`, `address`, `phone`, `openingHours`/`openNow`/`openingHoursWeek`, `priceLevel`/`priceRangeText`/`priceSignal`, `distanceKm`, `categories`, `image`, `stars` (hotel), `tappyRating`, `flags`, `reasons` ("Vì sao"), `actions[]` với kind `maps | directions | website | order | delivery | booking | reservation | ticket | purchase | review (TikTok/YouTube) | call | social`. **Đủ 7 trường Owner kỳ vọng.** Thiếu về DỮ LIỆU chứ không phải trường: `booking` chỉ có khi tool trả link OTA riêng (đa số turn = search link), `ticket` chưa tool nào sinh ra, `phone` thiếu ở row OSM. Không thêm gì.

## 0.3 — Affiliate (VERIFIED BY code `src/lib/ccp/**`; trạng thái tài khoản = giá trị ghi trong registry ngày 14/9, **Owner phải xác nhận lại trên portal — mình không truy cập được**)

| Merchant | Domain | Network | Approval (theo code) | Adapter | Ghi chú |
|---|---|---|---|---|---|
| TikTok Shop, CellphoneS, Trip.com, Klook | shopping / shopping / travel / entertainment+spa | Accesstrade | approved | có | CellphoneS handoff-only |
| Điện Máy Xanh, Shopee, Lazada, Vexere | shopping ×3 / travel | Accesstrade | pending | có | |
| CGV, Booking, Agoda, Traveloka, Vietnam Airlines, Vietjet, Ticketbox, GrabFood, ShopeeFood | — | **không có network** | — | có (direct link) | Booking/Agoda: không affiliate trong code; **CJ: không xuất hiện ở đâu trong code** |

- **Feed:** Accesstrade CSV tĩnh, header `sku,name,url,price,discount,image,desc,category`, tái tạo hàng ngày ~00:08 UTC (DMX/CellphoneS/TGDD/Shopee); **không có stock, brand, timestamp/dòng**; parser `feeds/accesstradeCsv.ts` có, **ingest OFF** (`CCP_FEED_INGEST_ENABLED=false`, D6 cần endpoint HTTPS xác thực), **display OFF** (`CCP_FEED_DISPLAY_ENABLED=false`, D7 chờ xác nhận quyền dữ liệu bằng văn bản). Tiki: không có trong registry. Không có API tra cứu real-time nào được nối.
- **Tracked link:** `go.isclix.com/deep_link/<publisher>/<campaign>?url=…` (deterministic, `tracking/accesstrade.ts`), cần `ACCESSTRADE_PUBLISHER_ID`; **`CCP_ENABLED = false` ⇒ hôm nay KHÔNG link nào được wrap** — đúng ca "link tay chạy hoàn hảo, không kiếm gì, không lỗi": VERIFIED BY code + card S1/S7 (`ibp=oshop`) + hotel/flight links.
- **Thiếu trước khi live:** (a) `ACCESSTRADE_PUBLISHER_ID` trên Vercel; (b) bật `CCP_ENABLED` + test wrap/echo (`validation/paramEcho`); (c) approval Shopee/Lazada/DMX/Vexere; (d) **URL merchant thật** cho shopping — hôm nay row là Google Shopping, deep link Accesstrade chỉ có nghĩa với URL đích của merchant ⇒ cần feed (DMX/CellphoneS/Shopee có) hoặc resolver; (e) quyết D7 (hiển thị giá/ảnh feed); (f) CJ: không có gì để bật.

## 0.4 — Latency baseline (VERIFIED BY sink `preGate` 39 lượt model + console 11 lượt Android; median)

| Vertical | TTFT server (delta đầu) | **Người dùng thấy chữ** (place turn buffer tới cuối) | Xong toàn bộ = card render | tool | post-model (ảnh/TikTok/guard) |
|---|---|---|---|---|---|
| Food | 1.47 s | ≈ 15.5 s | 15.5 s | 2.9 s | 1.5 s |
| Shopping | 1.42 s | tool turn 13.4 s (không buffer: chữ ra sớm hơn) | 13.4 s | 1.8 s | 1.5 s |
| Travel | 1.33 s | ≈ 17.4 s | 17.4 s | 3.9 s | 1.6 s (hotel 4.3–5.4 s với 8 ảnh) |
| Spa | 1.36 s | ≈ 13.4 s | 13.4 s | 2.1 s | 1.3 s |
| Entertainment | 1.77 s | ≈ 14.4 s | 14.4 s | 2.5 s | 1.3 s |

Phân rã một tool turn điển hình (Android B1, console): step-1 model (lập kế hoạch + gọi tool) **7.7 s** · tool 4.7 s · step-2 sinh prose ~5 s · post-model 1.5 s · tổng 16.0 s. **Phát hiện chính: place turn được BUFFER (fail-closed cho guard) nên người dùng thấy màn hình trống 13–17 s dù TTFT server 1.3 s.**
Nghi phạm đã đo: (1) **2-step turn**: step-1 ≈ 6–7.7 s + ~3–4k token uncached/lượt — bỏ được bằng pre-search server-side cho lượt có `search_now exact` (route tự gọi tool, model chỉ viết prose): −6 s, −$0.005/lượt; **chạm architecture lock** (1 AI.stream) — Owner quyết; 1–2 ngày. (2) **Google 403** (hỏi 2 lần, trả lời: 96–426 ms mỗi 10 phút/instance, 0 credit, không retry với 403; 429 retry đúng 1 lần) — **đã bỏ hẳn bằng `PLACES_PROVIDER=serper` (`a4f6016`)**: 0 ms. (3) **Ảnh 8 chỗ để hiện 3** (hotel): 8 credit + wall 2.9–4.2 s (song song; cắt về 3 tiết kiệm 5 credit = $0.005 và ~0.5–1 s) — 2 h, không mất chất lượng. (4) **"gợi ý thêm" search lại**: 15–17 s + $0.03–0.05 vs canned <1 s — 1–2 ngày (evidence store rows theo lượt). Không đụng: buffer guard, TikTok batch (1 credit, ~1 s — tính năng), memory extract.

## 0.5 — Security (VERIFIED BY code; RLS theo DDL baseline prod 17/9)

| Mục | Hiện trạng | Đánh giá |
|---|---|---|
| **Rate limit chat** | per-IP 30 req/phút bằng **Map trong process** (`rateLimit.ts`, "ngoài hợp đồng C10"); per-user: free 15/ngày, anon 5/lifetime, **Pro không giới hạn**; bộ đếm phân tán chỉ khi có `KV_REST_API_URL` (Upstash) — **không xác định được prod có KV không** (Vercel env không đọc được); không có ⇒ đếm theo instance (N lambda × limit) | **LAUNCH BLOCKER**: một script từ nhiều IP hoặc một tài khoản Pro chạy vô hạn LLM+Serper; per-IP limit trong RAM không giữ được trên serverless. Cần: Upstash KV trên prod (Owner cấp), chat rate limit qua `distributedRateLimit`, trần/ngày cho cả Pro (ví dụ 300), trần Serper/ngày toàn hệ thống (kill switch). ~0.5 ngày code + Owner cấp KV |
| **Secret** | Không `process.env` phi-`NEXT_PUBLIC` trong file `'use client'`; không `.env` commit; **`android/app/google-services.json` commit kèm Firebase API key (…6HVA)** — key client Firebase là public by design nhưng phải restrict theo package + SHA trong GCP; `ACCESSTRADE_PUBLISHER_ID` là cấu hình (xuất hiện trong link công khai) | 1 việc Owner: restrict key Firebase; 0.5 h |
| **Guest 5 câu + 18+** | server-side (`route.ts`: quota trước model; 18+ 403 trước quota; cookie HttpOnly `tappy_guest_age` + header Android) — client không bỏ qua được; **nhưng** quota anon/guest local = per-process (như rate limit) | đúng về nguyên tắc; phụ thuộc KV như trên |
| **RLS** | Baseline prod: **70/70 bảng ENABLE RLS**; `user_memory` policy own (`auth.uid()=user_id`), `conversations` own, `profiles` SELECT public (cố ý) + insert/update own, `decision_evidence` chỉ qua SECURITY DEFINER `_load/_save` (REVOKE anon/authenticated) | đạt; migration V3 mới (20260915) chưa apply prod — kiểm lại sau apply |
| **PII trong log** | `tappyai_tool_called` ghi `query`/`location` do MODEL soạn (dẫn xuất từ câu user); `fn_entry` ghi query/location/destination; **không ghi toạ độ** (đó là lý do lỗi Mountain View vô hình); memory/prefs không log; `/api/track` mask PII | Đề xuất: log `gps: "10.78,106.70"` (làm tròn 2 số = ~1.1 km) + `centeredOnUser` trong `fn_entry`; 1 h |
| **Prompt injection** | Fence không giả mạo được (`fenceUntrusted`) cho: user_memory, user_preferences, stored_preferences, user_location, calendar, explore_clip, scam_message. **KHÔNG fence cho tool result** (tiêu đề sản phẩm, snippet Serper, title TikTok, VnExpress, review attributes) — vào model như tool-result JSON (role tool của SDK); output-side: grounding gate/claim guards/CTA validation/`sanitizeUrlForMarkdown` giới hạn hậu quả (tên/giá/link bịa bị cắt) nhưng một tiêu đề "Ignore previous…" vẫn là chữ mà model đọc | gap trung bình: fence các trường text của tool payload (`modelPayload`) trước khi vào model + test; 0.5 ngày |
| **Abuse** | Không fetch URL do user chỉ định trong chat; ảnh website qua `safeGetText` (SSRF guard BUG-010); scam-shield có SSRF guard 3 pha; tool call ≤ `maxSteps` 5/lượt; Serper có `placesBudget`/lượt; `maxTokens` 2048 | đạt; ghi rõ: Serper "budget" là per-turn, không có trần/ngày toàn hệ thống (thuộc blocker rate limit) |

## Ước lượng giờ (thật thà; runs = 0 cho Phase 1–3, 1.5 có thể cần vài lượt kiểm live)

| Phase | Việc | Giờ | Ghi chú |
|---|---|---|---|
| 1.1 | S7 proportional (money guard R3 cắt cả câu → cắt mệnh đề/số + hedge cho list item) | 5 | có fixture S7 3/3 |
| 1.1 | grounding tên+giá sản phẩm ↔ row Serper/feed (đã có title; thêm price/offer id) | 4 | |
| 1.1 | shopping hard: budget/brand/size-variant/in-stock/người nhận + `hardConstraintGate` áp dụng cho `search_products` | 8 | in-stock: feed không có ⇒ luôn "chưa xác nhận" |
| 1.2 | SCHEDULE+TICKET unit: row schema (operator, time, price, link, freshness) + guard giờ/giá ↔ row + hedge + link sâu; flights (Travelpayouts cần token — có trong env prod? chưa biết), coach/rail, showtime | 24–40 | phụ thuộc 1.5 để có row thật; Travelpayouts token = câu hỏi Owner |
| 1.2 | passengers cap | **0 — đã có** (`passengers.ts`: clamp 9 + note, không crash, không im lặng) | VERIFIED BY code |
| 1.3 | numeric/temporal guard mọi vertical (giờ mở, giá band, showtime) proportional + P2 budget-band | 12–16 | |
| 1.4 | karaoke/cinema/water park/aquarium → card (placeType đã map karaoke→bar, rạp→cinema, công viên/thuỷ cung→attraction; cần test + 4 query mới) | 4 | showtime prose = 1.2 |
| 1.5 | interface adapter + health check + TTL/freshness stamp; pilot 1 operator | 8–16 | **CGV/Đầm Sen/Vinpearl không có API công khai** — lấy showtime = fetch trang HTML ⇒ ToS: báo cáo trước, không tự làm |
| 2 | bật CCP, wrap link, deep link merchant, test thiết bị/mạng/marketplace | 16–24 + Owner (publisher id, approvals, D7) | |
| 3 | ảnh 3 chỗ (2) · gợi ý thêm reuse (8–16) · rate limit phân tán + trần ngày (4 + KV) · GPS bucket log (1) · fence tool text (4) | 19–27 | |
| 4 | eval mới ~60 câu + 6 multi-turn, cân 5 vertical (đề xuất trước) | 6 soạn + ≈75 lượt | |
| 5 | parity web/app | 8 + ≈40 lượt | |
| 6 | UAT kịch bản 5 vertical + log/lượt (mở rộng `uatturns`: link tracked?, latency) | 4 | |

**Lượt: 0/150. Dừng ở GATE 0.**
