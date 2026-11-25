# Giai đoạn 1 — Thiết kế bộ điều khiển lượt (18/11/2026)

Căn cứ: đo nền trên giao diện thật (`eval-runs/BASELINE-UI-20261118.md`), log từng lượt, và đọc mã `route.ts`, `oneBrain.ts`, `openai.ts`. Mọi con số "mục tiêu" là ước tính, chỉ có giá trị khi eval xác nhận. Nhãn: ĐÃ ĐO / ĐÃ ĐỌC MÃ / SUY LUẬN.

## 1. Mục tiêu và bất biến (không thương lượng)

Mục tiêu của anh Huy: hiểu đúng câu hỏi và ngữ cảnh, dùng đúng layout (thiết kế mới RFC-001), bảo mật hệ thống và dữ liệu, tối ưu chi phí; đạt trên 80% là đóng băng, phần còn lại sửa khi có người dùng.

Bất biến:
1. Hợp đồng giao diện không đổi: `present_blocks`, `present_plan`, các khung annotation (`tappy.presentation.v1`, `tappy.subject_images.v1`, `tappy.research.v1`).
2. Không đụng kiến trúc nghiên cứu sâu và truy xuất thông tin (chỉ đo; chi phí nghiên cứu chờ anh quyết riêng).
3. Chất lượng không được giảm: mỗi lát qua cổng eval, tụt ở loại câu nào thì hoàn lại lát đó.
4. Bảo mật là cổng cứng: 11/11 thăm dò + thử nội dung web độc hại; không lát nào được làm yếu cổng link, cổng quota, khóa phía máy chủ.
5. Chỉ commit cục bộ, không push, không deploy, không đụng production.

## 2. Nguyên nhân gốc đã chứng minh (từ log, không phải suy đoán)

| # | Hiện tượng đo nền | Nguyên nhân gốc | Bằng chứng |
|---|---|---|---|
| R1 | Khung đỏ "Mình gặp trục trặc" ở câu kế hoạch (5/21) | **Hạn chót cứng 110 giây của cả lượt** (`TURN_DEADLINE_MS = 110_000`, `route.ts:223`) ngắt luồng model ở giây 110 bất kể tiến độ. Vòng công cụ không biết thời gian: nó dùng 80+ giây cho 20–24 lần gọi công cụ, rồi bước viết cuối chỉ còn khoảng 26 giây, chạy ở effort `medium`, nghĩ lâu, bị ngắt. Log: `llm_call status:error, error:"aborted", mid_stream:true, deltas:0, ms:26129` rồi `responses_stream_broken`. Các lượt hỏng đều kết thúc ở giây 115–119 | D30 (116 s), D26 r2 (119 s), D24 (116 s); `route.ts:4086` `abortSignal: turnSignal(req.signal, startTime, TURN_DEADLINE_MS)` |
| R2 | "Bước dự trữ" đã có nhưng vẫn mất câu trả lời | Bước dự trữ (`finalSynthesisGuard`, `reserveHoldsToolCall`) chỉ tính theo SỐ BƯỚC, không theo THỜI GIAN. 8 bước không đo thời gian; một lượt 6 bước đã có thể ăn hết 110 s | `route.ts:4019–4035` |
| R3 | `think_deeper` gọi ở 100% lượt | Đổi effort sang `medium` cho mọi bước sau, mỗi lượt tốn thêm một vòng model, và bước viết cuối chậm hơn (R1) | đo nền 90/90; `route.ts:3144`, `autoThink` |
| R4 | Công cụ tuần tự (0,86 công cụ mỗi lần gọi model) | `parallelTools: oneBrain` đã bật ở mã (`route.ts:4115`) nhưng prompt không bảo mô hình gọi song song | `oneBrain.ts` không có câu hướng dẫn gọi song song |
| R5 | Mua sắm 38 lần Serper mỗi lượt (0,0497 USD) | `search_products` mở khoảng 10 lần Serper mỗi lần gọi; không có trần theo loại câu | đo nền, 12 lượt mua sắm |
| R6 | Hai thiết kế thẻ cùng lúc (33/90 lượt khối trùng hoặc lệch) | Cờ `NEXT_PUBLIC_TAPPY_ANSWER_V4` (bố cục bài 19/10 và thẻ ảnh mục) bật song song với RFC-001 (`WORKSPACE_V206`); thẻ nhóm 3 cột (`PlaceDecision` group) chạy cạnh thẻ đơn (solo); thẻ không khớp địa điểm mà chữ khuyên | `ChatInterface.tsx:593, 2012–2032`, ảnh D28 |
| R7 | Câu hỏi thừa cuối câu (14/90), markdown thô, chữ quy trình | Lời nhắc có yêu cầu "kết bằng câu hỏi" ở một số chỗ và thiếu kiểm đầu ra chung | đo nền (cờ `closing_question`, `leak`) |
| R8 | Chi phí: Serper 68%, model 32% (0,0198 USD mỗi lượt; 0,042 USD mỗi lượt đạt) | Không có trần số lần tìm theo độ khó, cache Serper V2 tắt, cache prompt 63%, ngữ cảnh 100 nghìn token vào | đo nền |
| R9 | Stream hỏng ngay từ đầu ở câu tư vấn (D12 r3, 11 giây) | Chưa rõ: log không có dòng tổng kết lượt | CHƯA XÁC MINH |

## 3. Bộ điều khiển lượt — đặc tả

Một đối tượng `TurnBudget` tạo một lần ở đầu lượt, mọi lớp đọc cùng nó (không lớp nào tự đếm riêng):

1. **Thời gian.** `deadline = startTime + 110 s` (đã có). Thêm `toolCutoff = deadline − 40 s` (khoảng giây 70) và `writeReserve = 40 s`. Quá `toolCutoff` thì mọi lời gọi công cụ được trả lời bằng ghi chú "Hết lượt tìm. Viết ngay từ dữ liệu đã có" (cơ chế `reserveHoldsToolCall` có sẵn, thêm điều kiện thời gian). Bước viết cuối không bao giờ bắt đầu với dưới 30 giây.
2. **Effort bước viết.** Khi dự trữ kích hoạt (theo thời gian hoặc theo bước), bước viết chạy effort `low`, không `medium`: đã đo bước viết ở `medium` sau 20 lần tìm không kịp phát chữ trong 26 giây.
3. **Số bước, token, số lần tìm theo độ khó.** Bảng ngân sách theo loại (dùng phân loại sẵn có `understandTurn`; không thêm từ khóa): realtime ≤ 3 lần tìm; tin tức và tư vấn ≤ 5; địa điểm ≤ 6; mua sắm ≤ 8 (kèm trần fan-out của `search_products`); kế hoạch ≤ 12 gọi nhưng theo đợt song song. Chạm trần thì dừng tìm và viết.
4. **Song song.** Một câu hướng dẫn chung trong lời nhắc: các lời gọi độc lập gửi cùng một bước; mục tiêu độ song song > 1,3.
5. **Effort chọn một lần, bỏ `think_deeper` làm công cụ** (lát sau, rủi ro cao hơn): effort theo độ khó từ `understandTurn`; giữ nguyên effort suốt lượt để cache không vỡ.
6. **Một nguồn nhật ký.** Mỗi lượt ghi: thời gian từng bước, token từng bước, lý do dự trữ kích hoạt, effort thật (sửa nhãn `turnType: legacy` và effort tĩnh).

## 4. Bảo mật ngay trong thiết kế

1. Kết quả công cụ và nội dung web là DỮ LIỆU: luôn nằm trong khối được bọc có nhãn nguồn, không bao giờ trong vai trò hướng dẫn. Thêm bộ thử nội dung web độc hại thật (một trang thử cục bộ chứa lệnh chèn) vào bộ bảo mật.
2. `urlGrants`: nối vào luồng phát hành link (`streamEnrichment.ts`); danh sách link được phép chỉ gồm URL do công cụ trả về, không lấy từ đoạn trích bên thứ ba.
3. Ngân sách là kiểm soát xuyên suốt lượt: số bước, số lần tìm, thời gian, token đều đọc từ `TurnBudget`; chạm trần là chặn, không phải gợi ý. Giữ nguyên trần khách (5 câu), trần Pro, giới hạn thân yêu cầu.
4. Quyền công cụ tối thiểu theo gói: đã có (Free không công cụ); không mở rộng.
5. Không lát nào được in khóa, đọc `.env*`, hay nới `CONSULT_PRODUCTION_ALLOW`.

## 5. Layout (giữ thiết kế mới, bỏ cái cũ)

1. Tắt cờ `NEXT_PUBLIC_TAPPY_ANSWER_V4` trong bộ cờ UAT (đã chuẩn bị `flags-uat-blocks-v4off.json`; đang chấm kiểm).
2. Thẻ quán và khách sạn: thẻ đơn nằm dưới đoạn chữ nhắc địa điểm đó (đã có); thẻ nhóm 3 cột chỉ hiện khi chữ không nhắc địa điểm nào, và các lựa chọn trong thẻ phải khớp địa điểm chữ khuyên (hiện lệch ở D28, D25). Không đổi hợp đồng; chỉ đổi quy tắc vẽ.
3. Câu hỏi mời cuối câu và markdown thô: một nguyên tắc chung trong lời nhắc, đo bằng cờ `closing_question` và `leak` của người chấm.

## 6. Các lát thi công (thứ tự, ước tính tác động, cách hoàn lại)

Mỗi lát: một commit cục bộ; cổng nhẹ (30 câu × 1 lần, giao diện thật, chấm mù) sau mỗi lát; cổng đầy đủ (90 + 10 lượt) ở các mốc M1–M3. Tụt chất lượng ở loại câu nào thì `git revert` lát đó.

| Lát | Nội dung | Mục tiêu đo | Mốc |
|---|---|---|---|
| S1 | Nhật ký: thời gian và token từng bước, lý do dự trữ, effort thật | không đổi hành vi | |
| S2 | Dự trữ theo thời gian + effort `low` cho bước viết (R1, R2) | khung đỏ và thẻ trần từ 6/90 và 5/90 về ≤ 1/90; kế hoạch đạt tăng | M1 |
| S3 | Hướng dẫn gọi song song + ngân sách tìm theo độ khó (R4, R5) | thời gian trung vị 51 s xuống khoảng 40 s; Serper mỗi lượt giảm | |
| S4 | Trần fan-out `search_products` + cache Serper V2 cho truy vấn không realtime | mua sắm 0,0497 xuống ≤ 0,025 USD | M2 |
| S5 | Layout: cờ V4 tắt trong bộ cờ; thẻ khớp lời khuyên; bỏ câu hỏi thừa (R6, R7) | khối trùng 33/90 về ≤ 5/90 | |
| S6 | Bỏ `think_deeper` làm công cụ, effort theo độ khó (R3) | thêm 5 đến 8 giây, bớt một vòng model | |
| S7 | Ngữ cảnh gọn, kết quả công cụ có trần, cache ≥ 80% | chi phí model giảm | |
| S8 | `urlGrants` + thử web độc hại + trần chi tiêu thống nhất | 100% bảo mật | M3 |
| S9 | Rút prompt và thử gỡ từng lớp phụ (fact check, chip, media) | chỉ gỡ lớp không làm điểm tăng; báo anh trước khi gỡ | |

## 7. Cổng chấp nhận và đóng băng

Đóng băng khi cùng lúc đạt, trên bộ phát triển và trên holdout (chỉ dòng tổng):
- "Tốt, tính cả lỗi loại thẳng" (không khung lỗi, thẻ trần, vi phạm lỗi loại thẳng; nội dung từ 3,5) từ 80% trở lên (hiện khoảng 58%);
- lượt không có câu trả lời hoặc khung lỗi ≤ 2% (hiện 6,7%);
- bảo mật 100%, gồm thử nội dung web độc hại;
- tiền mỗi lượt đạt thấp hơn mốc nền 0,042 USD;
- thời gian trung vị thấp hơn mốc nền 51 giây.

Sau đó: tag đóng băng, rồi UAT 20 câu mọi lĩnh vực trên giao diện thật, chụp ảnh từng câu, gửi anh qua điện thoại.
