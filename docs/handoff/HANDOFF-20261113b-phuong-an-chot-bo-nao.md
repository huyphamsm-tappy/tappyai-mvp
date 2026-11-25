# BÀN GIAO 13/11/2026 (b) — PHƯƠNG ÁN CHỐT để giải quyết dứt điểm bộ não Tappy (web)

Tệp này là **phương án đã chốt** giữa Owner (Huy), người bạn rà kiến trúc của Owner, và phiên Claude ngày 13/11. Nó thay cho mọi đề xuất kiến trúc trước đó về "làm gì tiếp". Trạng thái chi tiết, số đo và điều cấm đầy đủ nằm ở `HANDOFF-20261113-web-brain-measure-and-fixes.md` (cùng thư mục) và `HANDOFF-20261112c-web-parity-agoda-contract-unify.md`; đọc cả hai.
Nhãn: **ĐÃ XÁC MINH** (kiểm trong phiên, nêu bằng chứng) · **GHI** (lấy từ tài liệu khác, chưa tự kiểm lại) · **CHƯA** (chưa kiểm). Không có khoá, token hay nội dung `.env` trong tệp này.

## 0. Một đoạn

Không thay kiến trúc, không viết thêm tài liệu thiết kế, không sửa prompt cho từng câu, không vá từng case. **Việc đầu tiên và duy nhất được làm ngay: một phép thử đo "độ hiểu" của One Brain**, so chế độ `auto` (hiện tại) với chế độ `think` (ép suy luận), trên hội thoại thật nhiều lượt của Owner, **Owner chấm mù**. **Owner ĐÃ DUYỆT trần chi phí 2 USD cho phép thử này (13/11).** Sau khi có số, mới quyết nâng cấp bộ phận nào, theo lộ trình ở mục 6. Phép thử **không cần sửa mã sản phẩm**; chỉ cần thêm một tuỳ chọn cho bộ chạy đo (nằm ngoài repo).

## 1. Trạng thái thật lúc soạn (ĐÃ XÁC MINH bằng lệnh)

- Worktree `D:\TappyAI-wt\wt-integration`, nhánh `feat/brain-r13-p1`, HEAD `4762c58`, chưa push, không upstream.
- `git status --short`: chỉ `?? docs/handoff/` (thư mục bàn giao chưa theo dõi). Không có thay đổi mã nào. Mọi bản vá của ngày 13/11 đã hoàn lại theo lệnh Owner.
- Cổng 3000 và 3040: không chạy.
- `flags-uat.json` (bộ cờ UAT, ngoài repo) có `LLM_RESPONSES_PROCESS_BUDGET_USD=3`, `CONSULT_ONE_BRAIN=1`, `NEXT_PUBLIC_CONSULT_ONE_BRAIN=1`, `CONSULT_PARALLEL=1`, `CONSULT_CAPABILITY_LEVEL=2`. `.env.local` của worktree có khoá OpenAI, Anthropic, Serper, Parallel (chỉ kiểm có/không, không in).
- Chi phí đo đã tiêu trước tệp này: khoảng 0,87 USD (trần 1 USD cũ). **Trần mới 2 USD là riêng cho phép thử ở mục 4.**

## 2. Điều đã thống nhất (quyết định, đừng đảo)

1. **Không** viết sáu tài liệu kiến trúc mới, **không** đổi tên/thiết kế lại thành "5 tầng, 14 bộ máy". Tài liệu đã đủ: R13 (4 tệp ở `C:\Users\Admin\Downloads\TappyAI_*Revision13*`), `docs/architecture/AUDIT-KIEN-TRUC-20261112.md`, `HOP-DONG-TRINH-BAY-V1.md`, các bản bàn giao, và bản mô tả hiện trạng `KIEN-TRUC-BO-NAO-TAPPY-20261113.md` (Owner giữ; bản tải lên nằm ở `C:\Users\Admin\.claude\uploads\93155657-2711-415c-ad75-a42cf95eac47\7bd4ccc7-KIEN-TRUC-BO-NAO-TAPPY-20261113.md`).
2. **Đo trước khi sửa lõi.** Chưa có bằng chứng nào cho thấy nguyên nhân Tappy hiểu kém; ba nghi vấn (suy luận tắt, ngữ cảnh 7.000–34.000 token, mã sửa chữ sau mô hình) đều là giả thuyết.
3. **Không gỡ ~30 guard hậu xử lý.** Chúng tồn tại vì Tappy từng bịa giá, giờ mở cửa, link. Hướng đúng là chuyển dần sang kiểm dữ liệu có cấu trúc trước khi vẽ, **thay từng nhóm, có đo**, không tháo lớp bảo vệ trước khi có lớp thay.
4. **Tách lỗi chat với lỗi nghiên cứu sâu.** Câu cụt ("dưới 35.Điều này") và mã nguồn lộ ("nguồn 144, 98") nằm trong **báo cáo nghiên cứu sâu**; chưa có bằng chứng do guard của luồng chat. Hai đường điều tra riêng: One Brain = `streamEnrichment.ts` + guard; nghiên cứu sâu = `src/lib/ai/research/` (tổng hợp, kiểm claim, xuất Markdown/Word). Không sửa đường này vì lỗi thấy ở đường kia.
5. **Không** thêm bộ định tuyến đoán độ phức tạp bằng từ khoá (đó là thứ One Brain đã bỏ). Nếu sau này cần đổi mức suy luận: hoặc luôn bật mức thấp, hoặc để mô hình tự quyết; chọn bằng số đo.
6. **Mua sắm:** không cắt tìm link sản phẩm để tiết kiệm (đã đo: thẻ teo còn 1–2 link). Link không nhất thiết là link đối tác; link nào đáp ứng câu trả lời cho người dùng là được.
7. **Trần Serper 12 lần mỗi lượt** (`CONSULT_REQUEST_CAP=1`, `CONSULT_REQUEST_CAP_PER_TURN=12`): **không** đưa vào phép thử này (không đổi hai thứ cùng lúc); chỉ đưa vào UAT sau khi xác minh không làm hỏng tác vụ theo dõi giá định kỳ; không bật production.
8. **Benchmark so đối thủ chia theo nhóm** (câu đơn giản, hội thoại nhiều lượt, tìm kiếm, tư vấn, đa phương thức, tác vụ nhiều bước), chấm mù, không gộp thành một điểm tổng. Không thể ép ChatGPT dùng cùng công cụ/dữ liệu: chỉ so câu trả lời cuối.
9. Mọi thay đổi hành vi sau này: cờ tắt mặc định, khoá production, test trước, đột biến, đo không giảm chất lượng, có đường lùi. Không động production. Đường lùi khi dọn mã cũ: sửa xong → tag sao lưu → mới xoá.
10. Layout/bố cục: không vá từng thẻ, từng nút. Tappy hiểu ngữ cảnh và câu hỏi rồi **tự chọn** layout/bố cục (mục 11C của bản bàn giao 13/11). Vì vậy phép thử chấm cả tiêu chí "chọn đúng bố cục".

## 3. Sự thật kỹ thuật cần cho phép thử (ĐÃ XÁC MINH bằng đọc mã, trừ chỗ ghi khác)

- **Chế độ chat đi trong body request, trường `mode`** (`src/lib/ai/security/clientInput.ts:350` `readChatMode`): chỉ nhận `web`, `think`, `deep`, `auto`; **mọi giá trị khác hoặc thiếu ⇒ `chat`**.
- **Hệ quả quan trọng:** bộ chạy `run-uat20.mjs` / `run-uat20-flags.mjs` gửi body `{ messages, lang, chatSessionId, userLocation? }`, **không có `mode`** ⇒ mọi lượt đo ngày 12–13/11 chạy ở chế độ **`chat`**, không phải `auto`. Web thật mặc định `auto` (GHI). Vậy số đo cũ chưa phản ánh đúng chế độ người dùng web đang dùng.
- `think_deeper` chỉ có trong danh sách công cụ khi One Brain + chế độ `auto` (GHI từ bản kiến trúc; dòng `route.ts:3123`).
- Chế độ `think`: `route.ts:4042` đặt `thinkEffort: 'medium'` cho cả lượt ⇒ mọi lệnh gọi dùng Responses API ở mức `medium`. Chế độ `auto`: bắt đầu không suy luận; nếu mô hình gọi `think_deeper` thì các bước sau chuyển sang `medium` (`ai.ts:45-52`). **A không đồng nghĩa "`effort: none` cả lượt".**
- Responses API cần `LLM_RESPONSES_PROCESS_BUDGET_USD > 0` (`openai.ts:226-227`, `responsesConfigured()` dòng 633); bộ cờ UAT đang đặt `3` ⇒ đủ điều kiện. Đây là **trần chi tiêu cứng của một tiến trình máy chủ** (3 USD mỗi lần bật máy chủ), có hạn 60 s mỗi lệnh gọi (GHI). **CHƯA** thấy tận mắt một lượt `think` chạy thật trong phiên này.
- `/chat/completions` ép `effort: none` khi lệnh gọi mang công cụ hàm (`openai.ts` `effortForCall`, GHI từ bản kiến trúc).
- **Hai chế độ khác nhau ở HAI thứ:** mức suy luận **và** một dòng trong lời dặn (`ONE_BRAIN_MODE_LINES`). Nếu B thắng, chỉ kết luận được "chế độ `think` hiểu tốt hơn"; chưa tách được là nhờ suy luận hay nhờ dòng dặn. Tách hai thứ cần một cấu hình thứ ba và phải sửa mã: **không làm ở lượt đầu**, ghi rõ giới hạn này trong báo cáo kết quả.
- Khách ẩn danh hỏi được **5 câu mỗi lần bật máy chủ** ⇒ mỗi cuộc hội thoại thử tối đa 5 lượt, mỗi cuộc một "batch" (bộ chạy tự bật lại máy chủ giữa các batch).
- Log mỗi lượt đã có: `tappyai_usage` (thời gian từng chặng, `toolCalls`, `llmCalls`), `tappyai_turn_cost` (USD, token, số lần Serper), `tappyai_one_brain_turn` (`effort`, `steps_run`, `tools`), `tappyai_trace ev=tool` (từng lần gọi công cụ), `tappyai_llm_call` (API nào được dùng, GHI). Đủ để ghi vết "mô hình có gọi `think_deeper` không, mức suy luận thật từng bước" mà **không cần sửa mã**.

## 4. PHÉP THỬ ĐỘ HIỂU — thiết kế chốt (Owner đã duyệt trần 2 USD)

### 4.1 Hai cấu hình
- **A = `auto`**: đúng chế độ mặc định của web. Mô hình tự quyết có gọi `think_deeper` không.
- **B = `think`**: ép suy luận `medium` cả lượt qua Responses API.
- Cùng mã (`4762c58`), cùng bộ cờ `flags-uat.json`, cùng bộ câu, cùng vị trí người dùng, cùng ngày. **Không bật trần Serper, không bật cờ nào khác.**

### 4.2 Bộ câu (mỗi cuộc một batch, tối đa 5 lượt; ngôn ngữ giao diện `vi`)
Lấy nguyên văn từ hội thoại thật của Owner (`C:\Users\Admin\Desktop\TappyAI – câu hỏi mới nhất.pdf`; cùng câu hỏi có ở `chatgpt câu hỏi mới nhất.pdf` để so về sau):

| Mã | Các lượt (nguyên văn) | Điều cần hiểu |
|---|---|---|
| U1 | "nay với mai sài gòn có mưa không cha" → "rồi tháng sau đi quy nhơn du lịch ngày nào thì được, dự tính đi 3 ngày với con ghệ" → "vé máy bay thì sao" → "khách sạn nữa cha" | giữ chuyến Quy Nhơn, ngày đã chọn, 2 người qua các lượt ngắn |
| U2 | "biết testla ko" → "tui hỏi nhà bác học mà cha" → "nghe nói 3 cha nội elon, Sam và Mark đang chạy đua vũ trang trong việc tạo ra ứng dụng Agent cá nhân hóa hả, nghe kịch liệt lắm" → "ê vậy tui tính làm một nền tảng kết nối các Agent đó lại với nhau đó, chúng ta sẽ giải quyết vấn đề trong tương lai là Con người sẽ giao tiếp bằng cách nào. Competitor của tui là Google luôn á, ông coi thử có thằng nào đang làm mảng A2A không ?" → "thì tui xây lớp khám và giao tiếp cho agents mà, chứ ai rảnh đâu đi build agent chi cha" | lỗi gõ, sửa hiểu nhầm, giữ ý "lớp khám phá và giao tiếp", không bắt nhầm sang "xây agent" |
| U3 | "chiều nay muốn gặp mấy thằng cốt, coi có quán nhậu nào êm êm không? quanh mấy quận phú nhuận, quận 3 thôi nha cha" → "quán mắc tiền vậy cha" → "Tối nay mình muốn spa thư giãn rồi ăn tối ngon, 2 người, budget khoảng 800k, gợi ý lịch trình giúp mình nhé" | "êm êm" = yên để nói chuyện; lượt 2 là chê giá, cần quán rẻ hơn cùng khu, thẻ phải là quán được khuyên; lượt 3 giữ khu vực |
| U4 | "tui tính cuối tuần sau đi thanh hóa chơi, ở đó có gì dzui ko" → "tui thích văn hóa địa phương và ẩm thực địa phương đó" → "tết này đi hàn quốc chơi được không cha" | đổi hướng theo sở thích vừa nêu; lượt 3 dùng lại sở thích đó |
| U5 | "nghe đồn cốc cốc của việt nam bán rồi hả?" → "ủa nghe nói đại tướng võ nguyên giáp và đại tướng gì có câu nói để đời lắm: đánh trận này xong 3 đời Thái Lan còn sợ" → "hai đại tướng là hai anh em ruột hả, nghe đồn vậy đúng ko? ko biết tiểu sử chiến tích của hai cụ thế nào ta" | tin đồn, tên thiếu, "hai đại tướng" chỉ về lượt trước |
| U6 | 5 lượt đa ngôn ngữ trong `lang-thread-cases.json` (đã có) | trả lời đúng ngôn ngữ của câu vừa hỏi |
| S | 20 câu `uat20-cases.json` (21 lượt, đã có) | mốc so với các lượt đo cũ |

U3 cần vị trí người dùng ở TP.HCM: lấy trường `loc` giống các ca có vị trí trong `uat20-cases.json`. Tổng khoảng 46 lượt mỗi cấu hình.
**Không bỏ ca nào vì tiền** (luật của Owner). Nếu trần không đủ, dừng và báo, không lặng lẽ cắt.

### 4.3 Cách chạy (không sửa mã sản phẩm)
1. Bộ chạy: `D:\TappyAI-review-artifacts\consultative-wave3\measure30\run-uat20-flags.mjs` (ngoài repo; nhận `--flags`, `--cases`, `--out`, `--max-usd`, `--port`). **Phải thêm tuỳ chọn `--mode`** để đưa `mode` vào body `POST /api/chat` (một dòng trong tệp ngoài repo). Kiểm bằng `node --check`.
2. Soạn tệp ca `understanding-cases.json` cạnh bộ chạy theo đúng định dạng `{ "batches": [[{ "id", "field", "turns": [{ "lang": "vi", "text", "loc"? }] }]] }`; mỗi cuộc một batch.
3. Tắt mọi `next dev` của `wt-integration` (bộ chạy tự bật máy chủ cổng 3040; hai máy chủ cùng thư mục làm hỏng `.next`).
4. Chạy A rồi B, mỗi lần một thư mục kết quả, ví dụ:
   `node run-uat20-flags.mjs --flags flags-uat.json --cases understanding-cases.json --mode auto --out runs\UNDERSTAND-A-<ngày> --max-usd 0.6`
   `node run-uat20-flags.mjs --flags flags-uat.json --cases understanding-cases.json --mode think --out runs\UNDERSTAND-B-<ngày> --max-usd 1.4`
   và tương tự cho `uat20-cases.json` và `lang-thread-cases.json` (hoặc gộp chung một tệp ca). **Tổng `--max-usd` của mọi lần chạy ≤ 2,0.** Lệnh dài hơn 2 phút: chạy nền.
5. Sau mỗi lần chạy, đọc log `logs\server-3040.log` phần mới (ghi kích thước tệp trước khi chạy) để lấy cho từng lượt: có gọi `think_deeper` không, `effort`, API (`chat`/`responses`), số bước, số lần gọi công cụ, thời gian từng chặng, USD. Với B: **xác nhận tận mắt** có dòng log cho thấy Responses API ở `medium`; nếu B lặng lẽ chạy như A thì phép so vô nghĩa, dừng và báo.

### 4.4 Chấm mù (Owner chấm; Claude chỉ được chấm sơ bộ và phải ghi rõ là sơ bộ)
- Xuất một tệp Markdown cho Owner: mỗi lượt gồm câu hỏi, các lượt trước, và hai câu trả lời đặt nhãn **X / Y** (trộn ngẫu nhiên từng lượt), kèm danh sách loại khối mỗi bên xuất ra (thẻ địa điểm, lịch trình, mua sắm, bảng, chip…). Bảng giải mã X/Y để ở tệp riêng, Owner không mở khi chấm.
- Bốn tiêu chí, mỗi tiêu chí chấm 1–5 cho từng bên: (1) nắm đúng ý câu hỏi; (2) dùng đúng ngữ cảnh các lượt trước; (3) trả lời đúng điều được hỏi; (4) chọn đúng layout/bố cục cho câu hỏi và ngữ cảnh.
- Tiêu chí (4) lượt đầu chấm theo **loại khối** bên nào xuất ra; chỉ chụp màn hình thật (Edge 1600×1000) cho các ca đáng ngờ.
- Gửi tệp cho Owner bằng SendUserFile.

### 4.5 Cách đọc kết quả (ghi trước để không diễn giải theo ý muốn)
- Mỗi ca chỉ có **một mẫu** mỗi cấu hình; mô hình và kết quả tìm kiếm không lặp lại y hệt. **Chênh lệch nhỏ không phải kết luận.** Chỉ coi B hơn A khi hơn rõ (từ 1 điểm trở lên ở tiêu chí 1–3) và lặp lại ở phần lớn các cuộc U1–U5, theo điểm của Owner.
- Luôn báo kèm: thời gian chờ chữ đầu, tổng thời gian, USD mỗi lượt của A và B; số lượt A tự gọi `think_deeper`.
- Giới hạn phải ghi trong báo cáo: B khác A ở cả suy luận lẫn một dòng lời dặn (mục 3).
- Báo cáo cho Owner: một thẻ ngắn tiếng Việt, số thật, không tuyên bố thắng/thua khi Owner chưa chấm.

## 5. Sau phép thử: cây quyết định (không làm trước khi có điểm của Owner)

- **B hơn rõ:** nguyên nhân chính nằm ở cách bộ não chạy. Bước kế: tách "suy luận" khỏi "dòng lời dặn" bằng một cấu hình thứ ba (cần một công tắc sau cờ tắt mặc định, test trước), rồi chọn giữa "luôn suy luận mức thấp" và "mô hình tự quyết" bằng số đo chất lượng + thời gian + chi phí. Không thêm bộ đoán độ phức tạp bằng từ khoá.
- **B không hơn rõ:** kiểm lần lượt, mỗi lần MỘT yếu tố: (a) ngữ cảnh (lời dặn và kết quả công cụ chiếm bao nhiêu token; thử rút gọn kết quả công cụ đưa lại cho mô hình); (b) hậu xử lý của luồng chat (so chữ mô hình viết với chữ người dùng nhận trên cùng lượt; log đã có điểm so). Không đổi nhiều yếu tố cùng lúc.
- **Cả hai đều kém ở cùng loại ca:** ghi loại ca đó làm bằng chứng cho lát hợp đồng trình bày hoặc cho giới hạn của mô hình; không vá ca.

## 6. Lộ trình sau đó (thứ tự đã chốt; mỗi lát: test đỏ trước, cờ tắt mặc định, khoá production, đo không giảm chất lượng, Owner duyệt mới commit)

1. **Kết luận nguyên nhân gốc về độ hiểu** (mục 5).
2. **Hợp đồng trình bày** lát 2–6 (`docs/architecture/HOP-DONG-TRINH-BAY-V1.md` mục 5): mô hình tự nêu khối trình bày qua hợp đồng có kiểu; thêm khối còn thiếu (`comparison`, `shopping`, `ask`, `anchor`); giao diện, lưu trữ và chia sẻ đọc cùng hợp đồng. Kèm **một quyết định ngôn ngữ cho mỗi lượt** dùng chung mọi nơi.
3. **Tách Standard và Advanced của nghiên cứu sâu theo R13** (Standard: Haiku; Advanced: Sonnet lập kế hoạch + tổng hợp, Haiku làm gói việc, kiểm độc lập), rồi chấm mù với Claude Sonnet 5.5. Điều tra riêng câu cụt và mã nguồn lộ trong báo cáo.
4. **Các lát còn lại:** chính sách link + ngăn đọc + dịch; khôi phục xuất PDF; chia sẻ báo cáo qua hợp đồng; logo mới (Owner đã gửi ảnh); giao diện giống mockup `D:\redesign\TappyAI_Web_Mockups_v206.html` theo lát, mỗi lát có ảnh cạnh mockup 1600×1000.
5. **Cuối cùng mới dọn mã kiến trúc cũ:** chuyển `read_page` ra khỏi `src/lib/ai/agent/runtime/` trước; đưa lượt có clip vào đường chuẩn; gắn tag sao lưu; rồi mới xoá, theo lát, có bộ đếm chứng minh mã không còn chạy.
Việc đo phụ, làm khi tới lượt (cần sửa mã nhỏ, sau cờ hoặc chỉ là log): ghi mã băm truy vấn công cụ để phân biệt "cùng công cụ cùng truy vấn", "cùng công cụ khác truy vấn", "cùng mục tiêu đổi truy vấn qua nhiều bước".

## 7. Quy tắc cứng (tóm tắt; đầy đủ ở bản 13/11 mục 10 và bản 12c)

- Làm DUY NHẤT trong `D:\TappyAI-wt\wt-integration`, nhánh `feat/brain-r13-p1`. Không tạo nhánh/worktree. Không đụng iOS/Android/production, cây `D:\Claude\Projects\TappyAI\.worktrees\g1-growth`, 10 cây One Life, PR #267, Merge Guard, các nhánh Explore video.
- Không push/PR/deploy/migration. Không reset/checkout làm mất dữ liệu/stash/amend. Không commit khi Owner chưa bảo.
- Sửa mã chỉ bằng Edit/Write, LF; test viết trước; đột biến cho test bảo vệ quy tắc; đổi kỳ vọng test cũ phải xin duyệt; tự làm, không giao agent con.
- Không in khoá/token/`.env`; không giải mã biến Vercel.
- Không chạy hai `next dev` trên cùng thư mục. Chạy vitest theo đường dẫn cụ thể; sau khi chạy rộng `git checkout -- docs/audit`.
- **Tiền:** chỉ được tiêu trong trần 2 USD đã duyệt, và chỉ cho phép thử ở mục 4. Mọi lượt trả tiền khác cần Owner duyệt riêng. Không bỏ ca vì tiền; không chạy lại ca đã có kết quả chỉ để lấy lại thông tin.
- **Cấm:** vá từng case; sửa prompt cho một câu; thêm luật "câu kiểu X thì làm Y"; trình thêm một vòng rà/đề xuất kiến trúc; gỡ guard khi chưa có lớp thay đã đo; tuyên bố PASS/"thắng" khi chưa có bằng chứng và điểm của Owner.
- Mọi chữ Owner đọc: tiếng Việt, ngắn, số thật, nói rõ điều chưa xác minh. Owner đang rất mệt vì các vòng lặp; đừng hỏi dồn, đừng trình phương án mới.

## 8. Lệnh kiểm tra đầu phiên (không tốn tiền)

```
git -C D:\TappyAI-wt\wt-integration status --short
git -C D:\TappyAI-wt\wt-integration log --oneline -1
git -C D:\TappyAI-wt\wt-integration branch --show-current
git -C D:\TappyAI-wt\wt-integration diff --stat
cd D:\TappyAI-wt\wt-integration; npx tsc --noEmit -p .
```
Kỳ vọng: status chỉ có `?? docs/handoff/`; HEAD `4762c58`; nhánh `feat/brain-r13-p1`; diff rỗng; tsc sạch. Cổng 3000 và 3040 không chạy. Lệch thì DỪNG và báo Owner, không tự sửa.

## 9. Chưa xác minh — phải kiểm trước khi tin

1. Một lượt `mode: "think"` thật sự đi Responses API ở `medium` trên bộ cờ UAT (kiểm bằng log của lượt đầu tiên của B; có thể thử trước bằng đúng 1 lượt, trong trần).
2. Web thật gửi `mode: "auto"` mặc định (đọc chỗ máy khách đặt `mode` trong `ChatInterface.tsx` hoặc hook gửi tin).
3. Trần tiến trình `LLM_RESPONSES_PROCESS_BUDGET_USD=3` có bị chạm trong một batch dài của B không (nếu chạm, lệnh gọi bị từ chối: xem log, không nâng trần khi chưa hỏi Owner).
4. Chi phí thật của B (ước 1–1,5 USD cho cả A và B là ước tính, chưa đo).
5. Số đo cũ (mục 2.2–2.3 của bản 13/11) chạy ở chế độ `chat`, không phải `auto`: đừng dùng chúng làm mốc cho A.
6. Toàn bộ vitest chưa chạy một lượt ở phiên 13/11 (chỉ chạy theo nhóm).
7. Các mục "chưa xác minh" của bản 13/11 và 12c vẫn nguyên (giá trị `CONSULT_ONE_BRAIN` trên production, đường chạy của lượt có clip, chỗ sinh câu cụt trong báo cáo…).

## 10. PROMPT cho phiên mới (sao chép nguyên khối)

> Tiếp tục dự án TappyAI WEB. Giao tiếp với Huy bằng tiếng Việt (xưng em, gọi anh); mọi chữ Huy đọc viết tiếng Việt, ngắn, số thật.
>
> NHIỆM VỤ DUY NHẤT của phiên này: chạy MỘT phép thử đo "độ hiểu" của bộ não Tappy (One Brain) theo đúng tệp `D:\TappyAI-wt\wt-integration\docs\handoff\HANDOFF-20261113b-phuong-an-chot-bo-nao.md` mục 4, rồi đưa Huy chấm mù. Huy ĐÃ DUYỆT trần chi phí 2 USD cho phép thử này. Không thay kiến trúc, không viết thêm tài liệu thiết kế, không sửa prompt cho từng câu, không vá từng case, không sửa mã sản phẩm.
>
> ĐỌC TRƯỚC (đọc hết):
> 1. `D:\TappyAI-wt\wt-integration\docs\handoff\HANDOFF-20261113b-phuong-an-chot-bo-nao.md` (phương án chốt; làm theo tệp này)
> 2. `D:\TappyAI-wt\wt-integration\docs\handoff\HANDOFF-20261113-web-brain-measure-and-fixes.md` (trạng thái, số đo, điều cấm, mục 11C về layout)
> 3. `D:\TappyAI-wt\wt-integration\docs\handoff\HANDOFF-20261112c-web-parity-agoda-contract-unify.md` (kiến trúc, production, điều cấm)
> 4. `D:\TappyAI-wt\wt-integration\CLAUDE.md`
> 5. Bộ nhớ `C:\Users\Admin\.claude\projects\D--Claude-Projects-TappyAI-tappyai-mvp\memory\MEMORY.md` (đầu trang) và `project_brain_fix_progress_2026-11-13.md`
>
> LUẬT CỨNG: làm duy nhất trong `D:\TappyAI-wt\wt-integration`, nhánh `feat/brain-r13-p1`, HEAD kỳ vọng `4762c58`; không tạo nhánh/worktree; không đụng iOS/Android/production, cây `g1-growth`, 10 cây One Life, PR #267, Merge Guard. Không push/PR/deploy/migration/commit; không reset/checkout làm mất dữ liệu/stash/amend. Không sửa mã sản phẩm ở phiên này. Không in khoá/token/.env. Không chạy hai `next dev` trên cùng thư mục. Tiền: tổng mọi lượt chạy ≤ 2,0 USD, chỉ cho phép thử này; không bỏ ca vì tiền; không bật trần Serper hay cờ nào khác trong phép thử. Tự làm, không giao agent con. Không tuyên bố kết quả khi Huy chưa chấm.
>
> BƯỚC 1 (chỉ đọc): chạy các lệnh ở mục 8 của tệp phương án chốt; kiểm cổng 3000 và 3040 không chạy. Khác kỳ vọng thì DỪNG và báo.
> BƯỚC 2 (chuẩn bị, không tốn tiền): thêm tuỳ chọn `--mode` vào `D:\TappyAI-review-artifacts\consultative-wave3\measure30\run-uat20-flags.mjs` (đưa `mode` vào body `POST /api/chat`; tệp này nằm ngoài repo); `node --check`. Soạn `understanding-cases.json` theo bảng ở mục 4.2 (nguyên văn câu hỏi, mỗi cuộc một batch tối đa 5 lượt, U3 có vị trí TP.HCM). Đọc chỗ máy khách đặt `mode` để xác nhận web mặc định `auto`.
> BƯỚC 3 (trả tiền, trong trần): chạy A (`--mode auto`) rồi B (`--mode think`) trên cùng bộ câu, cùng `flags-uat.json`; ghi kích thước log trước mỗi lần chạy; với lượt đầu của B, xác nhận trong log là Responses API ở `medium` rồi mới chạy tiếp. Lệnh dài chạy nền.
> BƯỚC 4: trích từ log cho từng lượt: có gọi `think_deeper` không, mức suy luận, số bước, số lần gọi công cụ, thời gian chờ chữ đầu, tổng thời gian, USD. Xuất tệp Markdown chấm mù (X/Y trộn ngẫu nhiên từng lượt, 4 tiêu chí thang 1–5, kèm loại khối mỗi bên xuất ra) và tệp giải mã riêng; gửi Huy bằng SendUserFile. Báo một thẻ ngắn: số lượt, thời gian, chi phí của A và B, số lượt A tự gọi `think_deeper`, giới hạn của phép thử (một mẫu mỗi ca; B khác A ở cả suy luận lẫn một dòng lời dặn).
> BƯỚC 5: DỪNG, chờ Huy chấm. Không làm gì tiếp theo mục 5–6 của tệp phương án khi chưa có điểm của Huy.
>
> TIÊU CHÍ HOÀN THÀNH: đủ mọi ca ở cả A và B (hoặc dừng và báo rõ ca nào thiếu, vì sao); tổng chi ≤ 2,0 USD có số thật; tệp chấm mù và tệp giải mã đã gửi; cây mã vẫn sạch (`git status --short` chỉ có `?? docs/handoff/`); máy chủ đo đã tắt; báo cáo nêu rõ điều đã và chưa xác minh.
