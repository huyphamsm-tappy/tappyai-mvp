# BÁO CÁO — SHORT JOB (đóng trước release), 2026-09-19

Nhánh `merge/main-into-v3`, commit code cuối **`60982f9`** (A.1 `d1a40fc` · A.2 `8f21dd5` · A.3 `e2966ad` · probe ids `60982f9`). LOCAL — không push, không deploy.
Ngân sách 14 lượt: Phase A 0 · **Phase B 12/12** · còn 2.
Gate trước Phase B: full web `npm test` **714 file / 13 628 test xanh, required-suite OK**, `tsc` 0, control-byte guard sạch (không đổi source Android).

---

## A. FIXES (0 lượt)

| # | Commit | Đổi gì | Test | Verified by |
|---|---|---|---|---|
| A.1 | `d1a40fc` | **Đảo phép thử tên quán.** `properNounShape()` / `isVenueHeading()` trong `groundingGate.ts`: một đoạn in đậm là TÊN QUÁN chỉ khi VIẾT NHƯ TÊN RIÊNG — không có `:` `?` `!` bên trong, ≤10 từ, ≥60 % từ viết hoa ("Hải Sản Hoàng Gia", "Nhà hàng Nam Phương", "The Workshop Coffee"); bold 1 từ chỉ khi được TRÌNH BÀY như tiêu đề (có dấu phân cách/sự kiện sau nó). Câu in đậm hay tiêu đề mục ("Tổng kết", "Bữa trưa", "Điểm cộng lớn nhất", "Bạn muốn ăn gì?") là prose theo hình dạng. Lexicon nhãn chỉ còn là khoá cuối cho nhãn viết hoa toàn bộ ("Kết Luận"). Áp ở MỌI nơi parse tên quán từ prose: gate (cắt), `ungroundedNamesIn` (detector), `referenceResolver.priorVenuesIn`, `historyCompaction`; `placeMatch.proseHeaders`, backstop `namesKnown`, `pickedRecs` đã dương (khớp tên HÀNG) từ trước. | gate: 6 nhãn của owner + bold không dấu câu, tên thật vẫn khớp, tên khác hàng về hoa/dấu/khoảng trắng/tiền tố loại/rút gọn vẫn khớp, MỌI dạng heading bịa vẫn bị cắt (kể cả ca production "**Maison Sen Buffet** buffet cao cấp…"), `isVenueHeading` trực tiếp; resolver: nhãn loại, tên giữ, hạn chế viết thường ghim; fixture cũ "**A** rồi lại **A**" từng xanh do TRÙNG HỢP (regex khớp "rồi lại" giữa 2 chữ A) — thay. Suite AI+chat 3 792 xanh. | unit |
| A.1 — nơi KHÔNG thể dùng "khớp hàng" | | (1) Gate + detector tồn tại để tìm tên BỊA — theo định nghĩa không khớp hàng nào ⇒ luật "chỉ là tên khi khớp hàng" biến gate thành no-op; luật dương ở đây là HÌNH DẠNG trình bày, khớp hàng vẫn là phép thử grounded. (2) `priorVenuesIn` và `historyCompaction` chạy ở LƯỢT SAU, không có tập hàng nào của places được lưu (card đi qua annotation frame, `[TAPPY_PLACES]` bị cờ tắt, decision evidence chỉ có cho shopping) ⇒ hình dạng là phép thử dương duy nhất có được; hạn chế: tên model viết toàn chữ thường không được thấy (ghim bằng test). Đường sửa tận gốc: lưu tên hàng places mỗi lượt như shopping đã có. | | reasoning + test |
| A.2 | `8f21dd5` | **`late_open` = ROW_FLAG_BACKED theo `opening_hours`.** `closesLate()` đọc mọi cách viết của provider ("09:00–22:00", "10:00–05:00" qua đêm, "Mở cửa cả ngày", "Open 24 hours", OSM "Mo-Su 08:00-22:00"); không parse được ⇒ null, không thay bằng tín hiệu khác. `rowsVouching()` nêu TÊN hàng vouch; report có `rowBackedBy` + `fieldMissing`; evidence note thêm "CHI cac quan nay co bang chung ve giờ mở khuya: <tên> … KHONG noi dieu do ve quan khac". Không hàng nào có giờ ⇒ gap ⇒ câu "chưa xác nhận được giờ mở khuya". `admitsForLateOpen`: khi có ràng buộc và ≥1 hàng có bằng chứng, hàng không có KHÔNG vào shortlist. Từ review "mở khuya" không còn vouch (chỉ nuôi atmosphere guard). **Hàng CÓ giờ** trên Serper /maps (probe: hầu hết hàng spa và quán ăn mang `opening_hours`; 1 hàng spa không có) — không cần mua thêm dữ liệu; hàng OSM fallback không có giờ ⇒ report `fieldMissing`. **1.4 KHÔNG revert.** | +5 case | unit + probe 4/4 |
| A.3 | `e2966ad` | **Cổng ràng buộc cứng tại MỘT điểm mọi tool đi qua.** `hardConstraintGate.ts` `applyHardConstraintGate(toolName, result, situation, lang)`; route bọc MỌI `execute()` bằng `gateTools()` cạnh `timeTools` (`tools: gateTools(timeTools({...}))`), bỏ khối cũ nằm riêng trong nhánh `search_places`. Áp cho `search_places` + `get_hotel_prices` (hàng là địa điểm): chú thích bản model đọc (`_tappy_hard_gaps`, `_tappy_hard_contrary`, `_tappy_hard_backed_by`, `_tappy_evidence_note`, `_tappy_budget_evidence`) + cập nhật stream context; tool khác (mua sắm có validator riêng; vé, di chuyển, thời tiết, tin, vàng, web_search, tool tương lai) ⇒ log `hard_not_applicable` kèm tool + ràng buộc — không bao giờ im. Hotel cũng nhận review-attribute cho shortlist. `modelPayload` giữ `has_delivery`/`has_order` để cổng (đọc bản model) vouch được delivery. | 16 case | unit + probe (hotel gate 4/4) |
| A.3 — test "tên ràng buộc lạ" | | `sauna_xyz` qua cổng ⇒ gap trên result + `console.warn` `hard_unclassified` | ✓ | unit |

### A.3 — Kiểm kê toàn bộ lưới ràng buộc cứng (đọc từ code: `Hard` union `situationFrame.ts` + `HARD_GROUP` `hardConstraints.ts`; test exhaustive 13/13)

| Hard | Regex phát hiện (folded) | Nhóm | Bằng chứng | Path áp cổng (sau A.3) |
|---|---|---|---|---|
| quiet | yen tinh / im lang / quiet / khong on… | EVIDENCE_REQUIRED | review-attr `quiet` | food · spa · entertainment · **hotel** |
| parking | dau xe / giu xe / parking / o to… | EVIDENCE_REQUIRED | review-attr `parking` | food · spa · ent · **hotel** |
| kids | con nit / tre em / kids / khu vui choi… | EVIDENCE_REQUIRED | review-attr `kids` | food · spa · ent · **hotel** |
| vegetarian | chay / vegan… | EVIDENCE_REQUIRED | review-attr `vegetarian` | food · spa · ent · **hotel** |
| outdoor | ngoai troi / san vuon / rooftop… | EVIDENCE_REQUIRED | review-attr `outdoor` | food · spa · ent · **hotel** |
| private_room | phong rieng / phong vip / private | EVIDENCE_REQUIRED | KHÔNG có lexicon ⇒ luôn gap trừ khi text nói | food · spa · ent · **hotel** |
| view | view / huong bien / tam nhin… | EVIDENCE_REQUIRED | review-attr `view` (+ loại hình hàng "view biển") | food · spa · ent · **hotel** |
| live_music | nhac song / acoustic / live band | EVIDENCE_REQUIRED | review-attr `live_music` | food · spa · ent · **hotel** |
| wheelchair | xe lan / wheelchair / accessible | EVIDENCE_REQUIRED | KHÔNG có lexicon ⇒ gap | food · spa · ent · **hotel** |
| upscale (1.4) | sang chut / xin hon / sang trong / dep hon / cao cap / luxury / 4-5 sao… | EVIDENCE_REQUIRED | review-attr `fancy` (+ tên hàng "Luxury") ; shortlist loại guest house | food · spa · ent · **hotel** |
| air_con | may lanh / dieu hoa / aircon | ASSUME_PRESENT | chỉ gap khi text NGƯỢC (`CONTRARY`) | food · spa · ent · **hotel** |
| delivery | giao hang / ship / mang ve / takeaway | ROW_FLAG_BACKED | hàng `has_delivery` / `has_order` (nay có trong bản model) | food · spa · ent · **hotel** |
| late_open (A.2) | mo khuya / mo muon / 24h / con mo / mo toi khuya | ROW_FLAG_BACKED | hàng `opening_hours` (đóng ≥23:00 / qua đêm / cả ngày); shortlist loại hàng không vouch khi có hàng vouch | food · spa · ent · **hotel** |
| (tên lạ) | — | EVIDENCE_REQUIRED + warn `hard_unclassified` | — | mọi path áp cổng |

Path KHÔNG áp cổng (được LOG `hard_not_applicable` khi user nêu ràng buộc): `search_products` (mua sắm — validator riêng `shoppingConstraints.ts`, chưa có nhóm "loại sản phẩm vs tình huống"), `get_transport_options`, `get_flight_prices`, `get_weather`, `get_news`, `get_gold_price`, `web_search`, tool tương lai. Trước A.3: hotel KHÔNG có cổng (gap, note, heads-up, atmosphere gap-attrs đều thiếu); mọi tool khác im lặng.

| A.4 | — | Xem §A.4 | | |
| A.5 | — | Xem §A.5 | | |

### A.4 — Đối chiếu kế toán cache-write (không đổi breakpoint)

**Nguồn của "49 %":** đo trên **finalGate = TRỘN cold/warm** — 12/36 lượt T2 là prompt hình dạng mới, mỗi lượt GHI ~26 500 token cache (1.25×) — artefact của gate (server restart + hình dạng prompt mới). Trên **24 lượt T2 warm** của cùng gate: uncached in $0.0031 (14 %) · **cache write $0.0061 (28 %)** · cache read $0.0046 (22 %) · output $0.0034 (16 %) · Serper $0.0043 (20 %) · memory <1 % = **$0.0216/lượt**. Hai con số không mâu thuẫn khi nêu cold/warm: 49 % là cold-mixed, 28 % là warm.

**Warm vẫn ghi ~4 900 token/lượt — vì sao, và có gì trong vùng cache:** `providers/claude.ts` đặt **2 breakpoint**: BP1 = cuối `systemShared` (rulebook chung ≈12k token, tĩnh, dùng chung mọi user — đây là phần đọc 0.1×, KHÔNG bị vô hiệu); BP2 = cuối **message user cuối** (cost item 2026-09-18): prefix kết thúc tại đó gồm [system động: khối tình huống, giờ hiện tại, GPS, memory, decision frame, clarify] + [lịch sử] + [câu user] — theo định nghĩa mới mỗi lượt (câu user khác nhau), nên BP2 là **ghi-1-lần / đọc-1-lần trong cùng lượt** (bước 2 của lượt tool đọc lại ở 0.1×): 1.25 + 0.1 = 1.35× so với gửi thẳng 2 lần = 2.0×. Không có thứ gì "vô hiệu hoá" BP1; 4.9k ghi/lượt là thiết kế cố ý, có lợi cho lượt 2 bước (65 % lượt) và lỗ +25 % trên ~5k token ở lượt 1 bước (T4). Tiết kiệm nếu bỏ BP2 chỉ cho lượt 1 bước ≈ 0.25 × 5k × $1e-6 ≈ **$0.0012 mỗi lượt T4** (~8 % lượt) — đúng bậc với "≈$0.0005–0.001" đã nêu; không phải 49 %.

**Số đã hiệu chỉnh cho mô hình tài chính (cold/warm ghi rõ):**
- T2 tìm+trả lời: cold (prompt mới) $0.0515 · **warm $0.0218** (đo, n=24) — dùng warm.
- T4 chat không tool: cold $0.0251 · warm $0.0099 (n=1, ít mẫu).
- T1 hỏi-rõ, T3 follow-up server: $0.
- Per-conversation warm ≈ **$0.0246** (A 59 %: 1×T2 · B 24 %: T1+T2 · C 18 %: +follow-up ≈ +$0.0142) — **là số thật, hơi thận trọng** (bao gồm 4.9k ghi cache/lượt là thiết kế; bao gồm Serper 4.3 credit/lượt ở giá $0.001). Giả định để giữ warm: ≥1 request/5 phút (TTL cache Anthropic). Cold đo được $0.0353/hội thoại = trần khi cache nguội.
- Probe hôm nay: lần 1 (8 lượt, Serper lạnh) $0.0335/lượt, lần 2 (4 lượt, warm) $0.0199/lượt — nhất quán.

### A.5 — Hai câu hỏi nhỏ

1. **2 loại dữ liệu realtime thiếu nhiều nhất** (diffmetric trên finalGate, 40 câu): **giá/mức giá** — chỉ 47 % câu dùng (thiếu 53 %; hàng Serper /maps chỉ có `price_range_text` cho ~40 % quán ăn, spa/khách sạn gần như không) và **khoảng cách/khu vực** — 57 % (thiếu 43 %; thiếu khi không có GPS thật hoặc tìm theo tỉnh xa). Còn lại: giờ 60 %, ảnh 70 %, review 75 %, link 88 %.
2. **Vì sao chưa cài `@types/json-schema` (1.5):** không có trong `package.json` (`json-schema` runtime là dependency bắc cầu, `@types/json-schema` chưa từng được khai báo; `skipLibCheck` che lỗi). Cài = đổi dependency + `package-lock` — ngoài phạm vi "chỉ sửa code bằng Edit/Write" và cần owner duyệt thay đổi dependency. Đề xuất: 1 commit riêng `npm i -D @types/json-schema@7` rồi bật lại assertion assignability thật trong `providers/toolSchemaShape.test.ts`.

---

## B. PROBE (12/12 lượt, sau khi A xanh; server @ `60982f9`, memory sạch; lần 1 Serper lạnh, lần 2 warm)

| # | Câu | Lần | Kết quả | Lý do |
|---|---|---|---|---|
| 1 | Spa nào mở khuya sau 22h ở Quận 3 | 1 | **PASS** | chọn Charm Spa Garden (10:00–00:00, hàng duy nhất vouch, `hard_row_backed_by.late_open=[Charm]`), Cổ Phong 22:00 nêu là "đi sớm hơn" |
| 2 | (cùng) | 2 | **PASS** | giống lần 1 |
| 3 | quán ăn nào gần Quận 1 còn mở giờ này không | 1 | **PASS** | 7 hàng vouch; chọn Izakaya MATSUKI (17:00–02:00) + Hùng Xíu (đến 04:00); không quán nào được nói mở khuya mà không có giờ |
| 4 | (cùng) | 2 | **PASS** | MATSUKI + Hùng Xíu |
| 5 | Resort Phú Quốc cho kỷ niệm 1 năm, sang chút | 1 | **PASS** | Ocean Bay Resort & Spa; Rio Guest House có trong 10 hàng, KHÔNG được chọn; heads-up "chưa thấy bằng chứng về mức sang trọng" — **lần đầu xuất hiện trên hotel path** |
| 6 | (cùng) | 2 | **PASS** | Ocean Bay + heads-up |
| 7 | khách sạn Đà Nẵng xịn hơn chút gần biển | 1 | **PASS** (⚠️) | không guest house; `upscale` KHÔNG gap vì 2 hàng có "Luxury" trong tên = bằng chứng fancy (đúng luật); ⚠️ pick M Hotel với link inline trong prose |
| 8 | nhà hàng sang trọng cho tiệc công ty ở Quận 1 | 1 | **PASS** | Laang SaiGon Central + heads-up mức sang trọng |
| 9 | Sinh nhật sếp… phòng riêng… (kỳ vọng prose có `**Lưu ý:**`) | 1 | **PASS / không tái hiện** | model KHÔNG viết nhãn in đậm lần này; gate cắt **0** span trong cả 12 lượt (`tappyai_audit_grounding` = 0 dòng); heads-up phòng riêng + giá ✓ |
| 10 | (cùng) | 2 | **PASS / không tái hiện** | 3 tên quán in đậm giữ nguyên, 0 cắt; model không viết `**Lưu ý:**`/`**Gợi ý?**` — hành vi nhãn được ghim bằng 11 unit case (không ép được model viết nhãn trong 2 lượt) |
| 11 | khách sạn Đà Nẵng có view biển, sang chút | 1 | **PASS** | **cổng hotel nổ**: `_tappy_hard_gaps=["view"]`, log `step: attributes, tool: get_hotel_prices`; heads-up "chưa thấy bằng chứng về view"; upscale supported bởi tên "Luxury" |
| 12 | resort Phú Quốc có chỗ đậu xe cho gia đình 4 người, cần phòng riêng | 1 | **PASS** (⚠️) | gaps `parking, private_room` + heads-up ✓; ⚠️ 1 câu mồ côi "Bạn nên liên hệ trực tiếp…" + "[Booking.com](…)Agoda" mảnh (lớp có sẵn, không phải fix A) |

**12/12 không có fail chặn release.** Chưa tái hiện live được prose có `**Lưu ý:**`/`**Gợi ý?**` (biến thiên model) — bằng chứng cho A.1 là unit test + 0 cắt/12 lượt.

---

## C. BACKLOG (§4 báo cáo FINAL JOB, không làm trong job này) — mức độ

| # | Lỗi | Mức | Ghi chú |
|---|---|---|---|
| 1 | Bold kết thúc "?" bị cắt (S4) | — | **ĐÃ đóng bởi A.1** (luật dương) |
| 2 | P8 / late_open | — | **ĐÃ đóng bởi A.2** |
| 3 | Hotel path không có hard-gap / atmosphere guard | — | **ĐÃ đóng bởi A.3** |
| 4 | Backstop bỏ sót câu " **X** cũng…" chỉ-thay-thế (E2b) | TRUNG BÌNH | reply có thể không có câu chọn; sửa regex ALT thêm "cũng/hoặc" |
| 5 | Câu hỏi "bạn có muốn… không?" cuối reply | THẤP | trong hạn 1 câu; chất lượng |
| 6 | F7b gọi 100–200k là "vừa ngân sách" với "dưới 100k" | TRUNG BÌNH | guard giá không kiểm phép so sánh ngân sách; đề xuất: so band với `situation.budget` ở stream |
| 7 | S5b nước hoa NAM cho "bạn gái" 1/3 | TRUNG BÌNH | shopping chưa có "loại sản phẩm vs tình huống" (tương tự `admitsForUpscale`) |
| 8 | Follow-up không có tập hàng places để khớp dương (A.1 hạn chế) | TRUNG BÌNH | lưu tên hàng places mỗi lượt như shopping decision evidence |
| 9 | `@types/json-schema` chưa cài | THẤP | 1 commit dependency, owner duyệt |
| 10 | Mua sắm: cổng ràng buộc cứng không áp (log not_applicable) | THẤP–TB | cần nhóm ràng buộc cho sản phẩm |
| 11 | Mảnh câu sau guard mua sắm (S1/S8) + "[Booking.com](…)Agoda" | THẤP | lớp có sẵn từ baseline |

---

## D. Chi phí một gate pre-release đầy đủ, và nhận định release

- **Gate đầy đủ = 40 lượt model** (48 turn HTTP, 8 canned $0) **+ rerun 2× cho câu ❌ (thường 4–8) + memory 6 = 50–54 lượt**, ≈ $1.3–1.5 ở giá audit, ~35 phút máy. Sau A.1–A.3 (prose behaviour YES ở guard/hotel/late_open) gate này là bắt buộc trước release theo luật của owner; job này không chạy nó (không có ngân sách và owner cấm).
- **Nhận định:** với `60982f9`, không còn lỗi nào tôi biết **chặn** release web + Android ở mức "thông tin sai cho user": G1 (cắt nhầm nội dung thật) đã đổi sang luật dương có test; mở khuya đọc giờ thật; hotel vào cùng lưới ràng buộc; T8 đạt; follow-up không nêu quán khác. Hai điều kiện trước khi bấm release: (1) chạy gate 40 đầy đủ trên `60982f9` (≥36 raw, 0 deterministic — kỳ vọng ≥ finalGate 38 vì A.2 sửa P8 và A.3 chỉ thêm heads-up), (2) owner UAT theo checklist dòng 25–27 (đã cập nhật). Rủi ro còn lại, không chặn: backlog 4/6/7 (chất lượng câu, 1/3 biến thiên), chi phí per-conversation +6.4 % so với baseline (quyết định mục 2 = A đã chốt), Android chưa gửi câu nào từ app trong hai job hôm nay (chỉ build + cài + mở).

## E. Lượt: Phase A 0 · Phase B 12 · **còn 2/14**.
