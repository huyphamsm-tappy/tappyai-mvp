# Audit 18/11/2026 — Tappy so với cách Anthropic xây agent (chỉ đọc, chưa sửa mã)

Nguồn: file `anthropic-ai-agent-blueprint.md` của anh + 3 lượt đọc thêm các trang Anthropic chưa có trong file (Managed Agents, tool-use/effort/caching/prompting theo model/guardrails, 7 bài kỹ thuật). Số đo của Tappy lấy từ log `tappyai_one_brain_turn`, `tappyai_turn_cost`, `tappyai_usage` của lượt chạy UAT 18/11 và A/B 15 câu (`D:\TappyAI-review-artifacts\uat15-ab\`). Nhãn: ĐÃ KIỂM = có số/ảnh/mã; SUY LUẬN = chưa đo.

## 1. Kết luận một đoạn

Anh đúng: ta đang vá từng case. Bằng chứng: `oneBrain.ts` nặng 40 KB, 58 mục luật, 34 commit chạm file này từ 01/11 (14 commit từ tag 16/11 đến nay); có luật "sinh ra từ một ca" đã phải rút lại (`cbcc074`); mỗi vòng UAT lại thêm một luật. Anthropic làm ngược lại: prompt tối thiểu + ví dụ tiêu biểu, và **bỏ từng bộ phận để thử xem còn cần không**. Các lỗi anh thấy (chậm, đắt, kế hoạch hỏng) không đến từ thiếu luật mà từ **thiếu vài cơ chế điều khiển lượt** mà Anthropic coi là nền tảng.

## 2. Đối chiếu từng mục (checklist mục 11 của file)

| Mục của Anthropic | Tappy hiện tại | Nhận định |
|---|---|---|
| Dừng có điều kiện, không để agent cạn bước trước khi trả lời | Trần 8 bước (`ONE_BRAIN_MAX_STEPS`); log ghi `wrote_text:false`, `text_chars:0` ở lượt kế hoạch (ĐÃ KIỂM). **SỬA 18/11 sau khi đối chiếu audit độc lập:** ĐÃ CÓ bước viết cuối (`finalWriteStream`, cờ `CONSULT_FINAL_SYNTHESIS=1`, `route.ts:4305`) và audit độc lập ghi 16/16 lượt `wrote_text:false` được cứu; câu "KHÔNG có bước viết dành riêng" của em là sai ở dạng tuyệt đối. Điều còn đúng: lượt kế hoạch (câu 12, 13, 15 của UAT 15 câu) vẫn ra chỉ thẻ quán, không có kế hoạch; điều kiện chạy bước cứu có `!planningIntent` (`route.ts:4305`). Nguyên nhân chính xác CHƯA chứng minh (cần truy vết một ca) | cơ chế đã có nhưng không phủ lượt kế hoạch; gốc chưa xác định |
| Luật theo độ khó (đơn giản 3–10 lần gọi, so sánh 10–15 mỗi agent con, phức tạp nhiều hơn) | Không thấy luật mở rộng-theo-độ-khó trong prompt; lượt kế hoạch gọi 15–24 công cụ, Serper 14–43 lần (ĐÃ KIỂM) | thiếu |
| Gọi công cụ song song ("make all independent tool calls in parallel", đo công cụ mỗi tin nhắn > 1) | Không có câu này trong `oneBrain.ts`; số công cụ gần bằng số bước (trung vị 3 công cụ / 4 lần gọi mô hình) = gần như tuần tự (ĐÃ KIỂM từ log; SUY LUẬN là do thiếu luật) | thiếu, ăn thẳng vào thời gian |
| Effort cố định trong lượt, đổi effort/thinking làm mất cache | `think_deeper` là một CÔNG CỤ mà mô hình gọi ở 81% lượt (log 300 lượt) và đổi chế độ giữa lượt (effort none sang medium) | tốn một bước ở mọi lượt, phá cache (SUY LUẬN về cache; ĐÃ KIỂM về 81%) |
| Cache đọc ≥ 80% đầu vào (Anthropic: trung vị 84%) | Lượt nặng: đọc cache 66%, ghi cache 34% trên trung bình 127 nghìn token vào mỗi lượt (ĐÃ KIỂM, 102 lượt) | dưới chuẩn, đang trả giá ghi cache 1,25 lần ở một phần ba đầu vào |
| Ngữ cảnh gọn, dọn kết quả công cụ cũ, trả kết quả súc tích (`concise` 72 so với 206 token), trần 25 nghìn token mỗi kết quả | Lượt nặng trung bình 127 nghìn token vào; lượt Nhật 535 nghìn; mỗi bước đọc lại toàn bộ kết quả trước (ĐÃ KIỂM). Chưa thấy dọn kết quả cũ hay trần theo kết quả | thiếu, là nguồn tiền và chậm |
| Bộ công cụ nhỏ, không chồng chéo (hạ tầng: tool search khi ≥10 công cụ) | 15 công cụ khác nhau thực sự được dùng; `web_search` dùng nhiều nhất (1,7 lần mỗi lượt) | ổn, chưa cần tool search |
| Prompt "đúng độ cao", ví dụ tiêu biểu, đừng nhồi ngoại lệ | 58 mục luật, 40 KB, nhiều luật sinh từ một ca | ngược lại với Anthropic |
| Eval nhỏ nhưng cố định (khoảng 20 câu thật), LLM chấm điểm 0–1 + đạt/trượt, giữ bộ kiểm riêng, kiểm nhiều lần | UAT thủ công 60 câu mỗi vòng, đọc ảnh bằng mắt, mỗi ô đo 1 lần (nhiễu: câu kế hoạch lúc hỏng lúc không); câu hỏi mỗi vòng khác nhau nên không so được | thiếu, là lý do ta cứ vá theo ca vừa thấy |
| Kiểm chứng: trích nguyên văn trước, bỏ khẳng định không có trích dẫn | `factSense.ts` làm đúng kiểu này | ĐÃ KHỚP |
| Tách nội dung không đáng tin (khối dữ liệu có nhãn, hướng dẫn nằm ngoài) | Dữ liệu được bọc `DATA_OPEN/CLOSE`, khóa ở phía máy chủ | ĐÃ KHỚP (chưa audit sâu) |
| Chọn model theo vai, route câu dễ sang model rẻ | Một model (gpt-6-luna) cho mọi lượt trừ vài tác vụ phụ | chưa tận dụng |
| Trần chi phí theo lượt, ghi usage từng lượt | Có ghi usage từng lượt (log); trần cứng theo lượt chưa thấy | một nửa |

## 3. Đối chiếu với các bằng chứng đo hôm nay

- **Đắt/chậm do ngữ cảnh và bước, không do độ dài chữ:** chữ mô hình viết trung vị ~1.000 ký tự và ổn định; tiền nằm ở Serper (75%) và token vào (127 nghìn trung bình lượt nặng). Phù hợp với bài multi-agent của Anthropic: lượng token giải thích ~80% biến thiên kết quả, và agent tốn ~4 lần token của chat.
- **A/B ba bản (tag 16/11, trước chính sách nguồn, hiện tại):** thời gian 996 / 1.013 / 992 giây và chi phí 0,374 / 0,354 / 0,374 USD trên 15 câu giao diện: KHÔNG chậm đi hay đắt lên. Chỉ chất lượng câu kế hoạch dao động (câu 12: 7.713 / 698 / 267 ký tự).
- Nghĩa là "cảm giác chậm/đắt" của anh là thật ở lượt kế hoạch và lượt tìm quán (78–114 giây), nhưng nó là đặc tính của kiến trúc hiện tại từ trước, không phải do một commit mới.

## 4. Đề xuất theo kiến trúc (không vá ca)

Mỗi mục là một cơ chế chung, có đo trước-sau bằng bộ eval ở mục 5:

1. **Bộ điều khiển lượt:** N−1 bước đầu cho công cụ, bước cuối bắt buộc viết (tắt công cụ ở bước cuối), thêm trần token cho cả lượt; hết ngân sách thì viết từ những gì đã có. Khắc phục lỗi "hết bước không viết" ở mọi loại câu.
2. **Bỏ `think_deeper` làm công cụ:** chọn effort một lần ở đầu lượt bằng bộ định tuyến rẻ (hoặc để thinking tự điều chỉnh), giữ effort cố định suốt lượt để cache không vỡ. Bớt một bước ở ~81% lượt.
3. **Công cụ song song + luật mở rộng theo độ khó** (câu đơn giản 1–3 lần gọi, so sánh 3–6, kế hoạch phức tạp tối đa vài đợt song song). Đo "công cụ mỗi bước" phải > 1.
4. **Giữ ngữ cảnh gọn:** kết quả công cụ có định dạng súc tích và trần cứng mỗi kết quả, dọn kết quả cũ theo ngưỡng (kiểu context editing), mục tiêu cache đọc ≥ 80%.
5. **Giảm prompt:** gom 58 luật về vài nguyên tắc + 3–5 ví dụ tiêu biểu; gỡ từng khối và đo lại để biết luật nào còn có tác dụng (cách Anthropic dùng khi thử bỏ từng bộ phận harness).
6. **Chính sách "mọi sự kiện có nguồn":** thực hiện bằng bước kiểm chứng theo từng khẳng định (đã có `factSense`) chỉ ở câu nhiều sự kiện, không bắt mọi câu phải tra thêm web. Cần anh quyết (gu sản phẩm và tiền).

## 5. Bộ eval cố định để hết vá ca (làm TRƯỚC khi sửa)

- Khoảng 20–30 câu thật, cố định, phủ các loại (tin, tìm kiếm, mua sắm, địa điểm, kế hoạch, nghiên cứu), thêm 10 câu giữ riêng không bao giờ dùng để chỉnh.
- Mỗi câu chạy 3 lần (vì nhiễu), ghi: có viết trả lời không, số bước, số công cụ, token, cache đọc, giây, USD.
- LLM chấm theo rubric (đủ ý, nguồn đúng, bố cục đúng) điểm 0–1 + đạt/trượt; người đọc ảnh chỉ để hiệu chuẩn.
- Mọi thay đổi chạm não phải qua bộ này; không đạt ngưỡng thì quay lại (đã có tag đóng băng làm điểm quay).

## 6. Giới hạn của lần đọc đầu (phần lớn đã đọc nốt, xem mục 7 và 8)

- Đã đọc toàn văn hoặc gần toàn văn: file blueprint của anh; 13 trang Managed Agents; tool-use (manage-tool-context, tool-combinations, define-tools, tool-search); effort, fast mode, multilingual; reduce-latency, reduce-hallucinations, increase-consistency, mitigate-jailbreaks; prompting Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.2; 7 bài kỹ thuật (building effective agents, multi-agent research, writing tools, code execution with MCP, harness design, context engineering, long-running harness).
- Đọc một phần, có đoạn dựa trên tóm tắt của model: parallel tool use, programmatic tool calling, context editing, compaction, batch, prompt caching (còn ~27.700 ký tự cuối), thinking, structured outputs, streaming, trang optimizing-for-cost (còn ~76.000 ký tự cuối).
- CHƯA đọc: bài hướng dẫn bảo mật chính (`secure-deployment`), self-hosted sandboxes/data-and-access, trang tools/sessions/events/webhooks/mcp-connector của Managed Agents, các trang con của compaction, pricing, tool-use-with-prompt-caching, streaming refusals, reduce-prompt-leak, bài "Managed Agents" mới. Managed Agents ít liên quan tới một ứng dụng chat tự viết vòng lặp như Tappy; các trang đó nên đọc nốt nếu anh muốn dựng chạy nền sau này.
- Tiếng Việt: tài liệu không có hướng dẫn riêng (Vietnamese không nằm trong bảng đa ngôn ngữ); khuyến nghị của Anthropic là nêu rõ ngôn ngữ đầu ra và tự đánh giá.
- Nhận định về kiến trúc Tappy dựa trên log và mã đã đọc, nhưng em chưa đọc toàn bộ `route.ts` (hơn 4.000 dòng); các mục ghi SUY LUẬN cần đo xác nhận.

## 7. Những điều mới sau khi đọc nốt (ảnh hưởng tới đề xuất)

**Cache và chi phí (trang prompt caching, optimizing-for-cost, pricing)**
- Đòn bẩy số 1 là cache; mục tiêu đọc cache từ 80% (trung vị Anthropic 84%). Tappy lượt nặng mới 66%.
- Điều làm vỡ cache: đổi định nghĩa công cụ (vỡ toàn bộ), đổi effort hoặc cấu hình thinking ở cấp cao nhất, đổi `tool_choice`, bật/tắt web search. Muốn đổi hành vi giữa phiên thì dùng effort theo từng tin nhắn hoặc tin nhắn role `system`. Tài liệu dặn rõ "đừng đổi effort giữa phiên". Điều này củng cố đề xuất bỏ `think_deeper` (đổi chế độ giữa lượt).
- Mốc cache đặt ở khối cuối giống nhau giữa các yêu cầu, không đặt trên dấu thời gian hay tin nhắn mới. Đây là điều cần soi trong lớp ghép prompt của Tappy (SUY LUẬN: chưa đọc đoạn đó).
- Haiku 5.5: prompt trên 100.000 token bị tính giá dài (0,50 / 2,50 USD mỗi triệu), kể cả đọc và ghi cache. Nghiên cứu Standard của Tappy chạy Haiku: cần cắt hoặc tóm tắt trước ngưỡng 100 nghìn.
- "Chạy lượt đầu ở effort thấp, thất bại mới chạy lại ở effort cao" rẻ hơn khoảng 40% so với luôn chạy cao, cùng tỉ lệ đạt (số nội bộ của Anthropic). Đây là mẫu thay cho việc để mô hình tự gọi `think_deeper` ở 81% lượt.
- So sánh model theo chi phí mỗi việc xong, không theo giá mỗi token; giá đầu ra gấp 5 lần đầu vào.
- Đưa dữ liệu lớn qua Files API và code execution thay vì dán vào prompt: 25/25 đúng ở 0,40 USD so với 7/25 ở 5,01 USD (bảng 91 nghìn token).

**Vòng công cụ**
- Gọi song song là mặc định của API; trả mọi `tool_result` trong một tin nhắn, kết quả đứng trước chữ; đo số công cụ mỗi tin nhắn (> 1,0 là chạy được). Câu gợi ý trong prompt: "make all of the independent tool calls in parallel".
- Mô tả công cụ là yếu tố ảnh hưởng nhiều nhất (ít nhất 3–4 câu: khi nào dùng, khi nào không, tham số, lưu ý); gom các hành động liên quan vào một công cụ có tham số `action`; trả ít trường nhưng có ID ổn định.
- Công cụ tìm web có `max_uses` (câu một sự kiện thường 1–3); tìm thất bại vẫn tính vào số lần dùng. Tool search chỉ cần từ khoảng 10 công cụ; độ chính xác chọn công cụ tụt từ khoảng 30–50 công cụ. Tappy có 15 công cụ nên chưa cần.
- Kết quả công cụ quá lớn: tài liệu Claude Code chặn 25.000 token mỗi kết quả; sandbox đám mây ghi kết quả trên 100.000 ký tự ra file và chỉ đưa xem trước. Tappy chưa có trần như vậy (SUY LUẬN, chưa đọc đoạn nạp kết quả vào bước kế).
- Dọn kết quả công cụ cũ (context editing): ngưỡng mặc định 100.000 token, giữ 3 lượt gần nhất; xóa theo đợt lớn vì mỗi lần xóa làm mất cache. Compaction theo ngưỡng mặc định 150.000 token (tối thiểu 50.000); bản tóm tắt dùng cùng model, không chọn model rẻ hơn.

**Dừng đúng và viết xong câu trả lời (trang prompting theo model)**
- Sonnet 5.5 ở effort thấp/trung bình có thể dừng sớm; Haiku 5.5 ở effort thấp với prompt agent dài dừng sớm; cả hai được khuyên thêm câu bền bỉ kiểu "tiếp tục đến khi mọi điều người dùng nhờ được làm xong". Opus 5.5 trong vòng không người trông: coi `end_turn` như báo cáo, theo dõi việc còn mở, dừng sau 2–3 lần tự tiếp tục. Fable 5.2: "tránh dừng khi còn nợ việc", tránh các câu "never" tuyệt đối. Prompt của Tappy có nhiều câu cấm tuyệt đối (SUY LUẬN chưa đếm).
- Haiku 5.5: nên đưa ngày hôm nay khi dùng công cụ tìm kiếm; tắt thinking cộng định dạng JSON có thể làm model bỏ gọi công cụ cần thiết.
- Mọi chữ do người dùng gửi giữa lượt không được đặt trong `tool_result`; không đếm ngược sau kết quả công cụ (dễ gây nghi ngờ injection).

**Đánh giá (trang test-and-evaluate)**
- Tiêu chí thành công phải đo được (chỉ số + cỡ bộ kiểm + ca biên). Thứ tự chấm: chấm bằng mã trước (nhanh, đáng tin), rồi LLM chấm (phải kiểm định trước), người chấm cuối cùng vì chậm và đắt.
- Luật cho LLM chấm: rubric chi tiết, có luật loại thẳng ("không có X ở câu đầu thì sai"), đầu ra là nhãn hoặc thang 1–5 có thể phân tích, bật thinking cho người chấm, **dùng model khác để chấm so với model viết**. Dùng Claude sinh thêm ca kiểm từ vài ca mẫu. Tappy đang dùng một model nhỏ ("intent") để kiểm chứng sự kiện, đã đo là nhiễu.
- Tài liệu không có trang "Evaluation tool" và không có mục Agent SDK trong chỉ mục em đọc được; trang Managed Agents (bảo mật, ngân sách, quyền, webhook, bộ nhớ) cho thấy mẫu: trần chi tiêu cứng theo phiên, ngắt bằng `interrupt`, ghi log trước khi xóa, bộ nhớ chỉ đọc khi không cần ghi.

**Bảo mật (guardrails, tool-use, secure-deployment)**
- Nội dung không đáng tin chỉ nằm trong khối `tool_result`, mã hóa JSON và ghi rõ nguồn; hướng dẫn của mình đặt ở lượt user, không đặt trong kết quả công cụ; sàng lọc kết quả công cụ trước khi hành động; quyền tối thiểu; chống "làm rò dữ liệu qua URL" (chỉ cho mở URL đã thấy trong phiên, danh sách tên miền cho phép chứ không phải danh sách chặn).
- Sàng lọc đầu vào bằng model rẻ (Haiku 5.5) kèm lược đồ JSON; coi `stop_reason: refusal` là kết luận có hại; refusal trả HTTP 200 nên phải theo dõi như một chỉ số riêng.
- Tappy đã bọc dữ liệu bằng `DATA_OPEN/CLOSE` và giữ khóa ở máy chủ; chưa kiểm xem nội dung web có nằm trong khối `tool_result` đúng chuẩn hay trong tin nhắn user (SUY LUẬN, cần soi mã).

**Managed Agents (đã đọc gần hết)**
Chủ yếu hợp việc chạy nền dài, không hợp chat có người chờ. Rút ra duy nhất cho Tappy: trần chi tiêu cứng theo lượt và theo phiên, nhật ký sự kiện có thể truy lại, quyền mặc định tối thiểu, bộ nhớ chỉ đọc khi không cần ghi.

## 8. Giới hạn sau khi đọc nốt

- Đã đọc toàn văn (theo báo cáo của các lượt đọc): chín trang Managed Agents còn thiếu (secure-deployment, self-hosted x4, cloud-sandboxes-reference, tools, sessions, events, webhooks, mcp-connector) và bài "What's new in Managed Agents"; compaction và bốn trang con; prompt caching cả phần cuối; tool-use-with-prompt-caching; extended thinking; streaming refusals; reduce-prompt-leak; optimizing-for-cost-and-intelligence (đủ); hướng dẫn prompting Haiku 5.5; chấm đánh giá và toàn bộ sáu trang guardrails; web search, web fetch, files, tool-use overview, define-tools, handle-tool-calls, skills best practices.
- Chỉ đọc một phần (phần đuôi do công cụ tóm tắt): context-editing (đuôi ~68 nghìn ký tự), structured outputs (~75 nghìn), batch (~41 nghìn), parallel tool use (~19 nghìn), programmatic tool calling (~28 nghìn), streaming (~15 nghìn), pricing (~16 nghìn), develop-tests (giữa), code-execution, citations, search-results, multiagent-orchestration.
- CHƯA đọc: trang tổng "claude-prompting-best-practices" (chỉ qua tóm tắt), các trang prompting của model cũ hơn (Opus 5, Sonnet 5, Fable 5/5.1, Opus 4.8); trang secure-deployment-monitoring/risks/budgets/permission-policies/environments/vaults/workflow-runs đã đọc ở lượt đầu nhưng không đọc lại toàn văn.
- Không tồn tại hoặc không tìm thấy trong chỉ mục: trang "Evaluation tool", mục Agent SDK, trang hooks, trang chọn model theo tác vụ ngoài choosing-a-model.
- Lưu ý chất lượng nguồn: các lượt đọc dùng công cụ trích xuất; một số đoạn dài đi qua tóm tắt của chính công cụ nên có thể sai lệch nhỏ; phần dựa trên tóm tắt đã ghi rõ. Phần "bài của Anthropic" lấy từ nguồn không được phép sao chép nguyên văn nên em chỉ diễn đạt lại.
