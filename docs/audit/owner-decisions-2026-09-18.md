# BÁO CÁO — QUYẾT ĐỊNH OWNER (cost report mục 4) + MEMORY DRIFT (2026-09-18)

Nhánh `merge/main-into-v3`, 13 commit local từ `3983b49` → `0662bb2` (xem `git log`). Không push, không deploy,
không xoá. Ngân sách LLM/search: **200 / 200** (đã dùng hết — xem mục 9). Test: web **13 441 passed / 69 skipped
(700 file, `npm test` gồm cả db)**, `tsc` sạch, Android unit **727 / 0**.

## 1. Tóm tắt

| Việc | Kết quả |
|---|---|
| Memory drift (ưu tiên 1) | **Tìm ra & sửa.** Nguyên nhân: (a) mỗi lượt thường (không nói gì về bản thân) vẫn trả 1 lệnh trích memory và lệnh đó lưu **chủ đề tìm kiếm thành "sở thích"** (`food: bún bò` từ 1 lần tìm bún bò, `shopping: nồi chiên không dầu`, `entertainment: chỗ đậu xe`), quận thành "điểm đến", "3 ngày 2 đêm" thành "thời gian hay đi"; (b) chính khối memory có dòng lệnh *"nếu tin nhắn mơ hồ … hỏi lại một câu ngắn"*. Sau ~20–30 lượt khối đó trở thành lý do để hỏi. Sửa cả 2 phía (mục 3). Gate 40 câu với memory LỚN nạp sẵn: **38/40** (trước sửa: 2 câu hỏi vì memory; sau: 0). |
| Hotel provider (quyết định 4) | **Không phải provider lỗi.** Serper `/maps` trả 18 khách sạn thật (rating, review, ảnh) — nhưng `normalizeHotels` chỉ đọc `distance/stars` nên không khách sạn nào "đủ bằng chứng", và guard stream chỉ đọc `search_results` (rỗng khi `/maps` trả) nên cắt mọi câu nêu tên khách sạn. Đã sửa: T2/T8 giờ có pick + rating thật. |
| S2 / T5 (quyết định 7) | **Sửa.** Luật 4/5 viết lại (hoạt động = đối tượng; không hỏi "ưu tiên gì"); thêm **backstop xác định**: prose không nêu tên quán/sản phẩm nào ⇒ chèn câu pick từ dữ liệu thẻ (S2 ✅). Với lượt mơ hồ ("đi chơi ở đâu", "ăn gì ngon giờ"), luật trong prompt KHÔNG chặn được model (đo 4 lần) ⇒ khối V1 mang **lệnh gọi tool cụ thể** cho lượt đó (`search_places({query, type})`), suy ra xác định từ frame (T5/F7 ✅). S5 hoãn, T6 nay ✅. |
| Memory extraction (quyết định 2) | Gate mới: chỉ trích khi user nói về BẢN THÂN hoặc lên kế hoạch chuyến đi; chủ đề lượt thường ghi vào `history` không cần model. Đo thật: **6/40 lượt** gọi (trước: 39/40), mỗi lệnh ≈935 token vào / 93 ra = **$0.0014**; trung bình **$0.0002/lượt** (trước ước tính $0.004) — giảm ~95 %. Không mất fact: những gì gate cũ lưu từ lượt thường đều là rác (mục 3.1). |
| Quota (quyết định 6) | Lượt trả lời sẵn (chào/cảm ơn, follow-up giờ/SĐT/địa chỉ đã nêu) **không trừ câu hỏi**. Quyết định ở đầu route trước khi trừ, dùng lại cho nhánh canned (test pin). |
| Cache Serper bền (1), bộ tool (3), mục 2 (5) | Giữ nguyên theo quyết định. |
| Final 40 (memory sạch, mọi cờ ON) | **38 / 40** (26 ✅, 12 ⚠️, 2 ❌: S5 hoãn, E1 — lỗi tham số tool, đã sửa sau run). Baseline 34/40. |
| Chi phí | Cùng script đo: LLM+Serper **$0.0263 → $0.0285/lượt** (+8 %: 31 lượt có tool thay vì 29 — T4/T5/T8 nay TÌM thay vì hỏi; trả lời dài hơn ~7 %); memory **$0.0039 (ước) → $0.0002 (đo)**; **tổng $0.0302 → $0.0287/lượt (−5 %)**. Lượt có tool $0.0330, không tool $0.0158, canned $0. |

## 2. Quyết định owner — đã làm gì

1. **Cache Serper bền:** không làm (như quyết định). Serper trong bộ 40: 232 credit ($0.23), 100 % query khác nhau.
2. **Memory extraction:** `memoryGate.ts` chế độ consultative — mặc định KHÔNG; chỉ gọi khi có `DURABLE_SIGNAL`
   (tôi thích/ăn chay/dị ứng/nhà mình ở/thường đi…) hoặc `DESTINATION_SIGNAL` (du lịch/khách sạn/resort/vé/3 ngày 2
   đêm…). Lệnh trích chỉ đọc **tin nhắn user cuối** (trước: cả thread mỗi lượt). Lượt thường ⇒ `history` ghi xác
   định (`memoryTopic.ts`, 40 ký tự, dedupe, giữ 10). Test: `memoryGate.test.ts` (+28 case), `memoryDrift.route.test.ts`.
   Đo: sink `tappyai_usage_memory` ghi usage thật của lệnh trích.
3. **Bộ tool theo lượt:** giữ nguyên.
4. **Hotel:** mục 4.
5. **Mục 2 (xoá luật bị ghi đè):** vẫn revert.
6. **Quota canned:** `route.ts` — `cannedEarly` tính trước 3 điểm trừ quota (anon / account / no-identity); `quotaExempt`
   bỏ qua `consumeAiQuestion`. Test route: greeting + follow-up giờ không tăng `used`; lượt có model tăng 1.
7. **S2/T5:** mục 5. **S5, T6:** S5 vẫn hỏi loại quà (hoãn); T6 giờ ✅ (kế hoạch 1 ngày + thời tiết, không còn bị G1 cắt trắng nhờ hotel/places evidence + backstop).

## 3. MEMORY DRIFT — điều tra & sửa

### 3.1 Cái gì tích tụ, vào prompt thế nào (đo thật)
Replay 20 lượt đầu bộ eval qua đúng đường ghi của route (`scripts/audit/memReplay.audit.test.ts`, 20 lệnh trích thật,
kết quả `docs/audit/eval/memory/replay-first20.json`). Sau 20 lượt hàng `user_memory` là:

```
location_base: "Sài Gòn"            ← từ "gần Sài Gòn"
discovery_city: "Đà Nẵng"           ← trước đó lần lượt "Quận 1", "Quận 3", "Phú Nhuận" (quận = "điểm đến")
timing: "3 ngày 2 đêm"              ← độ dài chuyến đi thành "thời gian hay đi"; trước đó "tối" (từ "quán ăn tối")
preferences: food ["bún bò"]        ← 1 lần tìm bún bò, được model trích lặp lại ở MỌI lượt sau vì nằm trong memory cũ
              entertainment ["khách sạn gần biển"] ← điều kiện tìm thành sở thích ("chỗ đậu xe ô tô", "phòng riêng" cũng vậy)
              shopping ["nồi chiên không dầu"]    ← sản phẩm tìm gần nhất
history: 10 mục, có mục 50 ký tự
```
Khối prompt (`buildMemoryBlock`, ~1.1k ký tự) hiển thị tất cả + dòng lệnh cũ: *"Neu tin nhan hien tai con mo ho va
thong tin tren se dan den mot SAN PHAM/DIA DIEM/LOAI khac: hoi lai mot cau ngan…"* — với "ăn gì ngon giờ" và
`food: bún bò` thì đúng nghĩa đen là hỏi "bạn muốn ăn gì". Gate trích cũ mặc định CÓ cho mọi tin ≥12 ký tự; bộ lọc
transient của V1 chỉ chặn từ "tối nay/500k/yên tĩnh", không chặn chủ đề tìm kiếm.

### 3.2 Sửa (chỉ khi `CONSULTATIVE_V1` ON; OFF giữ nguyên byte, test pin)
**Phía đọc** — `consultative/memoryBlock.ts` (`buildMemoryBlock(..., { consultative, domains })`):
- tối đa **4 giá trị mới nhất / danh mục, 3 danh mục**, `avoid` (dị ứng/kiêng) luôn đứng đầu; mỗi giá trị ≤40 ký tự;
- **chỉ danh mục của lĩnh vực lượt này** (food → ăn uống; travel → trip; +avoid) — đổi khối sau khi có decision frame;
- `discovery_city` + `history` gộp thành 1 dòng "Gần đây đã hỏi về (lịch sử, KHÔNG phải yêu cầu hôm nay)";
- companions/timing/personality thành "Mặc định nếu tin nhắn không nói";
- lệnh mới: *dùng để CHỌN tốt hơn; KHÔNG BAO GIỜ hỏi lại vì thông tin trên; tin nhắn mơ hồ thì cứ chọn theo sở
  thích đã biết và nói rõ*.
- Hàng cũ (đã tích rác) được xử lý ở đây, không cần xoá dữ liệu user.

**Phía ghi** — `memoryGate.ts` (mặc định KHÔNG), `memoryTransientFilter.ts`: `timing` và mọi preference (trừ `avoid`)
chỉ giữ khi user nói như thói quen ("mình thích/hay/thường…"); `discovery_city` chỉ khi có tín hiệu chuyến đi; lệnh
trích đọc tin nhắn cuối; `memoryTopic.ts` ghi history xác định.

**Bảo vệ thêm (xác định):** `proseShape` luật 4 — khi đã có câu pick, gỡ câu hỏi "bạn muốn ăn gì / loại nào / hay
loại nào khác?" và lead-in "mình cần biết:" của nó (đo F8/T4 với memory lớn: model chọn xong vẫn hỏi, danh sách hỏi
chính là list sở thích trong memory).

### 3.3 Gate: 40 câu với memory LỚN nạp sẵn (`scripts/audit/seedmem.mjs`: 10 món, 6 giải trí, 5 mua sắm, 3 spa,
4 budget, 10 history, timing "3 ngày 2 đêm", personality "lãng mạn, yên tĩnh", discovery Đà Nẵng)
| lần | mã | kết quả | ghi chú |
|---|---|---|---|
| gate 1 | sau memory fix + hotel + S2/T5 | ≈36/40 (chấm nhanh) | F8/T4 vẫn hỏi "ăn gì?" với list = memory; T8 mất thân bài; E1 lỗi |
| gate 2 | + scope theo lĩnh vực, luật 4, backstop | ≈33/40 (chấm nhanh) | 7 lượt hỏi-không-tìm (F8, T4, T8, E1, E2, E5, E6) — **biến thiên model**, cùng prompt byte-identical (F8/T4) lúc tìm lúc hỏi |
| gate 3 | + lệnh gọi tool cụ thể cho MỌI lượt đầu có địa điểm | **38/40** (27 ✅, 11 ⚠️) | ❌ S5 (hoãn), E1 (lỗi tham số tool). **0 câu hỏi do memory.** |
Kết quả chi tiết: `docs/audit/eval/runs-owner2/gate-largemem{,2,3}/`. Chi phí gate 3: $0.0286/lượt (≈ memory sạch).

**Còn lại:** với memory lớn, model vẫn có xác suất "giả sử … rồi hỏi xác nhận" ở lượt subject-less (E5) — đúng luật.
Không có cách xác định nào ép được tool call (khoá kiến trúc: `toolChoice: 'auto'`, 1 `AI.stream()`); lệnh cụ thể
trong prompt là đòn bẩy cuối và đã đo hiệu quả (gate 2 → 3: 7 → 1 lượt không tìm, lượt còn lại là lỗi tham số).

## 4. HOTEL (T2/T8) — provider không lỗi, pipeline mù
Chạy T2 với `--raw` (runner giữ tool result): `hotel_list` 18 dòng từ Serper Maps (Hanami 4.6⭐/2.231, M Hotel
4.9⭐/2.821…), thẻ `tappy.places.v1` có đủ 18 item. Lỗi ở 2 chỗ: `normalizeHotels` (candidate.ts) chỉ đọc
`distance_km`/`stars` ⇒ `_tappy_shortlist` rỗng, không pick; `streamEnrichment` với `get_hotel_prices` chỉ đọc
`search_results` ⇒ G1 không có bằng chứng ⇒ cắt mọi câu có tên khách sạn ⇒ còn "bạn định check-in ngày nào?".
Sửa: đọc rating/review/price band từ dòng `/maps` (như places); dòng `hotel_list` vào bộ bằng chứng theo tên
(closure `readRowEvidence` dùng chung); `hotel_list` được sắp theo ranking và cắt còn 5 dòng cho model (thẻ vẫn
đủ); test `hotelEvidenceStream.test.ts`, `candidate.test.ts`, `modelPayload.test.ts`. Runner `eval40.mjs --raw`
để không chấm nhầm "0 rows" lần nữa (runner cũ chỉ đếm `results/search_results`).
Lưu ý audit env: Google Places trả 403 `permission_denied` (log `tappyai_places_debug`) — không ảnh hưởng vì Serper-first,
nhưng fallback Google Places trên audit env đang chết (key/quyền) — owner kiểm.

## 5. S2 / T5 / E1
- **Luật 4/5** (`consultativeV1Prompt.ts`): với ĐỊA ĐIỂM, hoạt động là đối tượng ("ăn gì", "đi chơi ở đâu", "massage")
  ⇒ giả sử + tìm ngay; chỉ MUA SẮM thiếu món mới hỏi. Không hỏi "bạn ưu tiên gì (giá/hiệu năng/pin)".
- **Backstop pick** (`pickBackstop.ts` + `streamEnrichment`): sau các guard, nếu thân bài không nêu tên quán/sản
  phẩm nào (in đậm hoặc thường) ⇒ chèn câu pick từ dữ liệu thẻ lên đầu (places: câu G1b; shopping: entity NÊN CHỌN
  của thẻ; nếu engine không có pick thì #1 của engine). Không xoá chữ của model.
- **Lệnh gọi tool cụ thể** (`searchNow.ts`): lượt đầu, có địa điểm, không chờ hỏi vị trí, không phải phim/mua sắm ⇒
  khối V1 mở đầu bằng `BUOC 1 CUA LUOT NAY: goi search_places({ query, type })` (mơ hồ: tham số chính xác; đã rõ:
  query gợi ý, model tự làm sắc hơn; khách sạn: `get_hotel_prices` với ngày giả sử cuối tuần). Suy ra xác định từ
  situation + decision frame + need profile; test `searchNow.test.ts`.
- **E1** (phát hiện ở gate): model gọi `search_places` với `type: "entertainment"` ngoài enum ⇒ AI SDK từ chối
  tham số trước khi execute ⇒ stream kết thúc bằng `3:"An error occurred."`, user thấy "Tôi sẽ tìm…" rồi im (4/4
  lần). Sửa `placeType.ts`: `type` là chuỗi khoan dung, map đồng nghĩa (entertainment→attraction, karaoke→bar,
  resort→hotel…), lạ thì bỏ type. **Chưa chạy lại live** (hết ngân sách) — có unit test. Cùng lớp rủi ro còn ở
  `get_transport_options.mode` (enum 2 giá trị) — ghi nhận.

## 6. FINAL 40 — memory sạch, mọi cờ ON (`docs/audit/eval/runs-owner2/final40/`)
**38 / 40** (✅ 26 · ⚠️ 12 · ❌ 2). Baseline Step F: 34/40. ⚠️ = đạt với ghi chú (như cách chấm Step F).

| # | Kết quả | Ghi chú | LLM calls | Serper credits | $ LLM | $ Serper | $ memory | **$ lượt** |
|---|---|---|---|---|---|---|---|---|
| F1 | ✅ | chọn Izakaya 4.8⭐/201, 0.9km, mở 22:00 + 1 thay thế có đánh đổi | 2 | 9 | $0.0199 | $0.0090 | — | **$0.0289** |
| F2 | ✅ | chọn Bếp Ông Cậu 4.9⭐/1.008; heads-up "chưa có mức giá" vì card không có giá | 2 | 9 | $0.0433 | $0.0090 | — | **$0.0523** |
| F3 | ✅ | chọn Hoa Túc 4.8⭐/482; heads-up chưa thấy bằng chứng yên tĩnh | 2 | 6 | $0.0159 | $0.0060 | — | **$0.0219** |
| F4 | ⚠️ | chọn Tám Riêu 4.8⭐/1.290 + heads-up đậu xe/trẻ em; còn 1 dòng in nghiêng lẻ | 2 | 10 | $0.0183 | $0.0100 | — | **$0.0283** |
| F5 | ✅ | trả lời tức thì từ giờ đã nêu (canned, $0, không trừ quota) | 0 | 0 | $0.0000 | $0.0000 | — | **$0.0000** |
| F6 | ✅ | tìm lại theo tên; trung thực "không có dữ liệu đông"; nêu chi nhánh gần hơn | 2 | 9 | $0.0175 | $0.0090 | — | **$0.0265** |
| F7 | ✅ | mơ hồ → giả sử + tìm ngay (LENH LUOT NAY) → chọn Béo Ơi 4.6⭐/1.189 | 2 | 6 | $0.0203 | $0.0060 | — | **$0.0263** |
| F8 | ⚠️ | chọn Du Ký 4.7⭐/1.116 + thay thế; câu hỏi "ăn món gì" đã bị luật 4 gỡ, còn lead-in (đã sửa sau run) | 2 | 6 | $0.0416 | $0.0060 | — | **$0.0476** |
| S1 | ✅ | backstop nêu pick từ thẻ NÊN CHỌN (29.9k, 4.7⭐/354) | 2 | 3 | $0.0487 | $0.0030 | — | **$0.0517** |
| S2 | ✅ | backstop nêu pick 4.49tr/4.9⭐/63 + lưu ý cấu hình chưa rõ | 2 | 3 | $0.0485 | $0.0030 | — | **$0.0515** |
| S3 | ✅ | follow-up "rẻ nhất có tốt không" trả lời từ evidence, đánh đổi rõ | 1 | 0 | $0.0175 | $0.0000 | — | **$0.0175** |
| S4 | ⚠️ | pick Ecovacs 4.5tr cho yêu cầu 5-7tr — thẻ chọn dưới ngân sách (ranker mua sắm, ngoài phạm vi) | 2 | 3 | $0.0411 | $0.0030 | — | **$0.0441** |
| S5 | ❌ | quà tặng: hỏi loại quà (owner: ghi nhận, hoãn) | 1 | 0 | $0.0324 | $0.0000 | $0.0013 | **$0.0337** |
| S6 | ✅ | không có đối tượng → hỏi 1 câu ngắn (đúng luật) | 1 | 0 | $0.0072 | $0.0000 | — | **$0.0072** |
| S7 | ⚠️ | thẻ có 6 dòng; prose bị guard cắt còn mảnh "Mình tìm được khử mùi…" (clause-cut cũ) | 2 | 3 | $0.0125 | $0.0030 | — | **$0.0155** |
| S8 | ⚠️ | thẻ có; prose nêu thay thế Sunhouse + 1 câu hỏi, câu pick bị cắt mất chủ ngữ | 2 | 3 | $0.0147 | $0.0030 | — | **$0.0177** |
| T1 | ✅ | planner lập kế hoạch với ngày giả sử cuối tuần, khách sạn M Hotel 4.9⭐/2.821 | 2 | 22 | $0.0658 | $0.0220 | $0.0015 | **$0.0893** |
| T2 | ⚠️ | hotel_list là bằng chứng: chọn M Hotel 4.9⭐/2.821 + trung thực giá; vẫn hỏi số đêm ở cuối | 2 | 6 | $0.0189 | $0.0060 | $0.0014 | **$0.0263** |
| T3 | ✅ | trung thực: không có dữ liệu ăn sáng, chỉ đường tới Booking | 1 | 0 | $0.0096 | $0.0000 | — | **$0.0096** |
| T4 | ✅ | gia đình 4 người → tìm ngay → chọn Công viên bờ sông 4.6⭐/629 + Thảo Cầm Viên | 2 | 8 | $0.0156 | $0.0080 | $0.0014 | **$0.0250** |
| T5 | ⚠️ | mơ hồ → tìm ngay; câu pick "Nhà hát TP" bị G1 cắt (claim "nổi tiếng nhất"), còn thay thế | 2 | 8 | $0.0171 | $0.0080 | — | **$0.0251** |
| T6 | ✅ | kế hoạch 1 ngày Hội An + thời tiết, không còn bị G1 cắt trắng | 2 | 12 | $0.0322 | $0.0120 | — | **$0.0442** |
| T7 | ⚠️ | tool vé máy bay rỗng → link hợp lệ + hỏi ngày (như Step F) | 2 | 0 | $0.0132 | $0.0000 | $0.0012 | **$0.0144** |
| T8 | ⚠️ | gọi tool với ngày giả sử → chọn Rio Guest House 5⭐/138 ("sang chút" chưa được ranker cân) | 2 | 13 | $0.0176 | $0.0130 | $0.0015 | **$0.0321** |
| P1 | ✅ | tìm đúng Đà Nẵng, chọn Bliss 5⭐/3.148, trung thực giá | 2 | 9 | $0.0189 | $0.0090 | — | **$0.0279** |
| P2 | ✅ | chọn Hyan 5⭐/100, 0.9km; heads-up chưa có mức giá | 2 | 8 | $0.0436 | $0.0080 | — | **$0.0516** |
| P3 | ⚠️ | trung thực không có dữ liệu đặt trước; dùng bullet | 1 | 0 | $0.0102 | $0.0000 | — | **$0.0102** |
| P4 | ✅ | chọn Charm Spa 4.9⭐/220 + heads-up yên tĩnh | 2 | 8 | $0.0184 | $0.0080 | — | **$0.0264** |
| P5 | ⚠️ | "massage" → tìm ngay + chọn Cổ Phong 4.9⭐/3.107; câu giả sử vẫn có "phải không?" | 2 | 8 | $0.0186 | $0.0080 | — | **$0.0266** |
| P6 | ✅ | chọn Cổ Phong + thay thế gần hơn | 2 | 8 | $0.0183 | $0.0080 | — | **$0.0263** |
| P7 | ✅ | chọn An Miên 4.9⭐/882, 1km | 2 | 8 | $0.0175 | $0.0080 | — | **$0.0255** |
| P8 | ✅ | trung thực: không spa nào mở sau 22h ở Q3 | 2 | 8 | $0.0180 | $0.0080 | — | **$0.0260** |
| E1 | ❌ | model gọi search_places với type="entertainment" ngoài enum → SDK từ chối → stream lỗi. ĐÃ SỬA (type khoan dung), chưa chạy lại vì hết ngân sách | 1 | 0 | $0.0096 | $0.0000 | — | **$0.0096** |
| E2 | ✅ | chọn CGV Liberty 0.2km + thay thế | 2 | 8 | $0.0171 | $0.0080 | — | **$0.0251** |
| E3 | ✅ | chọn Dollhouse 5⭐/1.383 có nhạc sống + Loop 1 | 2 | 8 | $0.0182 | $0.0080 | — | **$0.0262** |
| E4 | ✅ | tìm lại theo tên; trung thực chưa thấy đậu xe; SĐT từ row | 2 | 7 | $0.0140 | $0.0070 | — | **$0.0210** |
| E5 | ⚠️ | không có đối tượng → hỏi (bullet) — như Step F | 1 | 0 | $0.0057 | $0.0000 | — | **$0.0057** |
| E6 | ✅ | chọn Karaoke Avatar 4.9⭐/6.371 + heads-up giá | 2 | 8 | $0.0428 | $0.0080 | — | **$0.0508** |
| E7 | ✅ | gợi ý 3 phim, không bịa lịch chiếu | 1 | 0 | $0.0328 | $0.0000 | — | **$0.0328** |
| E8 | ✅ | chọn tiNiWorld 4.7⭐/804 + Thảo Cầm Viên | 2 | 5 | $0.0150 | $0.0050 | — | **$0.0200** |

Trung bình: **$0.0287/lượt** (LLM $0.0227 · Serper $0.0058 · memory $0.0002); lượt có tool **$0.0330** (31 lượt,
uncached ≈3.8k token, cache hit 73 %), không tool **$0.0158** (8), canned **$0** (1: F5). Bảng cost đầy đủ:
`docs/audit/cost-report.md` (mục "2026-09-18 owner decisions"), dữ liệu `docs/audit/eval/cost/usage-owner2.jsonl`
(các segment `gate`, `gate2`, `gate3`, `final`).

So với run cuối của job cost (cùng script `scripts/audit/costseg.mjs`): LLM $0.0216 → $0.0227 (out 610 → 654 token:
câu trả lời có pick + thay thế dài hơn), Serper $0.0048 → $0.0058 (29 → 31 lượt có tool, hotel `/maps` 3 credit),
memory $0.0039 (ước) → $0.0002 (đo). Tổng $0.0302 → $0.0287.

## 7. UNIT ECONOMICS (giá Haiku 4.5 + Serper như trên; mix như bộ 40: 78 % lượt có tool)
| Đơn vị | Giả định | Chi phí |
|---|---|---|
| 1 lượt | trung bình bộ 40 | **$0.0287** (có tool $0.033 · follow-up $0.016 · canned $0) |
| 1 cuộc hội thoại | 3,5 lượt: 1 tìm + 1,5 follow-up + 1 canned (chào/giờ mở) | ≈ **$0.057** |
| 1 cuộc hội thoại "nặng" | 2 tìm + 2 follow-up | ≈ $0.10 |
| User hoạt động / tháng — 5 lượt | | **$0.14** |
| — 20 lượt | | **$0.57** |
| — 60 lượt | | **$1.72** |
| Guest dùng thử (5 câu, hết quota) | 5 lượt mix, chào không tính | ≈ **$0.14** (tối đa $0.17 nếu 5 lượt đều có tool) |
| 100 lượt | | **$2.87** |
| Tháng @1k lượt/ngày | | ≈ $860 (Serper ≈ $175, memory ≈ $6) |
| Tháng @10k lượt/ngày | | ≈ $8 600 |

**Hoà vốn affiliate / 100 lượt** = $2.87 ÷ hoa hồng 1 chuyển đổi (chưa có số thật — cần owner điền):
| Hoa hồng/chuyển đổi (giả định) | Ví dụ | Chuyển đổi cần / 100 lượt |
|---|---|---|
| $0.30 (≈7.5k ₫) | GrabFood/ShopeeFood đơn 150k × 5 % | **9,6** |
| $0.60 (≈15k ₫) | Shopee/Lazada đơn 500k × 3 % | **4,8** |
| $1.20 (≈30k ₫) | Agoda/Booking đêm 750k × 4 % | **2,4** |
| $2.40 (≈60k ₫) | Booking 2 đêm 1,5tr × 4 % | **1,2** |
Tức là với ~2–5 % lượt tạo 1 chuyển đổi trung bình $0.6–1.2 là hoà vốn chi phí AI (chưa tính hạ tầng/Supabase/Vercel).

## 8. RATE LIMIT & XỬ LÝ LỖI PROVIDER (chỉ liệt kê, chưa sửa)
**Anthropic (qua AI SDK 4.3.19, `@ai-sdk/anthropic`)**
- Giới hạn thực tế theo tier của org (Haiku 4.5: tier 1 ≈ 50 RPM / 50k input-token/phút; tier cao hơn lớn hơn) —
  **không đọc được từ code**, owner xem Console → Limits. Với ~5k uncached + 21k cached token/lượt có tool và 2 request/lượt,
  tier 1 chịu ≈ 25 lượt có tool/phút.
- Retry: SDK mặc định `maxRetries: 2` (backoff 2s → 4s) cho 429/5xx/408/409; **không đọc `retry-after`**; route không
  đặt gì thêm. Sau 3 lần: nếu lỗi TRƯỚC khi stream mở → `502 {error:'ai_error'}` (không có `message`) → UI hiện hộp
  đỏ chung "Mình gặp trục trặc khi trả lời — tin nhắn của bạn vẫn được giữ nguyên. Bạn thử lại nhé?" + nút Thử lại;
  nếu lỗi GIỮA stream (kể cả lỗi tham số tool như E1) → frame `3:"An error occurred."` → cùng hộp đỏ, phần chữ đã
  stream vẫn hiển thị. **Graceful: có**, nhưng không phân biệt "AI đang bận, thử lại sau X giây" với lỗi khác.
- Lệnh trích memory / TTS / vision: lỗi nuốt im (`catch → {}`), không ảnh hưởng user.
- Gap: (1) không có telemetry 429/5xx provider (usage event không ghi mã lỗi); (2) không có circuit-breaker / fallback
  provider dù registry hỗ trợ nhiều provider; (3) retry không tôn trọng `retry-after`; (4) lỗi tham số tool (zod enum)
  làm mất cả lượt — đã sửa cho `search_places.type`, còn `get_transport_options.mode`; (5) `maxRetries` với stream
  tool 2 bước: 3 lần × 2 bước có thể kéo dài >20 s trước khi báo lỗi, không có timeout tổng ở route.

**Serper** (`/maps` 3 credit, `/search` `/shopping` `/images` 1 credit)
- Giới hạn: theo gói credit (không có giới hạn/phút công bố trong code; Serper công bố ~300 query/s cho gói trả phí) —
  owner xem dashboard; hết credit ⇒ HTTP 4xx.
- Xử lý: `!resp.ok → null` (429/5xx/hết credit **không phân biệt** với "không có kết quả"), timeout 6 s (`/search`),
  8 s (`/maps`, `/shopping`), **không retry**, meter chỉ đếm số lệnh, không đếm status. Chuỗi fallback của places:
  Serper `/maps` → Google Places (audit env: 403) → OSM; hotel: `/maps` → `/search` snippets → DDG. User thấy: card
  ít/không có, prose "mình chưa tìm thấy…" (G1/grounding fail-closed) — graceful nhưng **câm**: không nói "nguồn tìm
  kiếm tạm lỗi".
- Gap: (1) không log status/credit-remaining (header Serper); (2) không retry 5xx; (3) hết credit = "không có kết
  quả" ở mọi lượt, không cảnh báo vận hành; (4) `/images` gọi song song theo số row (≤8) — 1 lượt có thể đốt 10+
  credit khi cache lạnh.

**App-level (đã có):** 30 req/phút/IP (`429` + `Retry-After`), quota câu hỏi anon 5/đời · account 15/ngày · Pro miễn
(429/401 kèm `message`, UI render), age-gate 403. Store quota distributed fail-closed (Upstash lỗi ⇒ từ chối).

## 9. Ngân sách, test, trạng thái máy, mở
- **LLM/search: 200/200** — 20 replay memory + 13 probe (hotel/S2/T5/F7) + 40 gate1 + 40 gate2 + 7 probe memory-lớn
  + 40 gate3 + 40 final. Hết đúng lúc final xong ⇒ **E1 fix chưa chạy live**, F8 lead-in fix chưa chạy live (chỉ unit test).
- Test: `npm test` 13 441 passed / 69 skipped (700 file), `tsc -p tsconfig.json` sạch, Android unit 727/0.
- Backend audit `:3101` cấu hình `audit-flags-on` (mọi cờ ON, không sink), worktree `audit-nonprod` @ `0662bb2`;
  emulator-5558 + APK debug (trỏ `10.0.2.2:3101`, build 12:58 — backend đổi nhưng APK không cần build lại).
- Mở / cần owner: (a) chạy lại E1/F8 live khi có ngân sách (2 run); (b) enum `get_transport_options.mode` cùng lớp rủi
  ro; (c) Google Places 403 trên audit env; (d) S4 thẻ NÊN CHỌN chọn sản phẩm DƯỚI ngân sách (5-7tr → 4.5tr) — ranker
  mua sắm; (e) S7/S8 prose bị clause-cut (guard grounding cũ) — thẻ vẫn đúng; (f) T8 "sang chút" chưa được ranker cân
  (Rio Guest House 5⭐/138 thắng resort) — ranker soft-signal, quyết định cũ; (g) 3 file có byte 0x08 từ commit cũ
  `28e1d7d` (`src/lib/links/tiktokEnrichment.ts`, `specGuard.test.ts`, `smartTools.test.tsx`) — không phải của job này, nên kiểm.
