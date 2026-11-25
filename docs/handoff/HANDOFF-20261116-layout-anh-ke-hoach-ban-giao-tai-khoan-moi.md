# BIÊN BẢN BÀN GIAO CÔNG VIỆC — TappyAI web — 16/11/2026

Người nhận: một phiên Claude mới (có thể đăng nhập bằng TÀI KHOẢN KHÁC). Người giao: phiên Claude Sonnet 5.5 làm việc 14–16/11/2026 với anh Huy (chủ sản phẩm).
Tài liệu này tự đủ: đọc nó là hiểu dự án, luật làm việc, những gì đã làm, cái đang dở và cái phải làm tiếp. Mọi chữ viết cho anh Huy đọc phải bằng TIẾNG VIỆT, ngắn, thẳng.

---

## 0. ĐỌC TRƯỚC (10 phút đầu tiên của phiên mới)

1. Đọc mục 3 (LUẬT) và mục 9 (CẤM/RỦI RO). Anh Huy đã rất bực vì các lỗi lặp đi lặp lại (vá từng case, giao thử mò). Đừng lặp lại.
2. Làm việc ở: nhánh `feat/brain-r13-p1`, thư mục `D:\TappyAI-wt\wt-integration`. KHÔNG sửa mã ở `D:\Claude\Projects\TappyAI\.worktrees\g1-growth` (chỉ dùng làm thư mục chạy lệnh nếu phiên mở ở đó).
3. Kiểm tra nhanh trạng thái (không sửa gì): `git -C D:/TappyAI-wt/wt-integration status --short | head`, `npx tsc --noEmit -p .`, `npx vitest run src` (khoảng 25.300 test, 2 test chập chờn nêu ở mục 7).
4. Hỏi anh Huy: (a) máy chủ UAT `localhost:3000` có bật lại không (cách bật ở mục 2); (b) anh đã thử chat thật chưa và chỗ nào chưa giống mockup (mục 8, việc số 1).
5. Mọi việc ngoài phần "đang làm" ở mục 8: hỏi anh Huy trước. Chưa commit gì cho đến khi anh nói.

---

## 1. DỰ ÁN VÀ MỤC TIÊU

- **TappyAI**: trợ lý AI tổng quát bằng tiếng Việt cho người dùng ở Việt Nam, "như ChatGPT là trợ lý tổng quát", kiêm bạn đồng hành địa phương (địa điểm, du lịch, ăn uống, mua sắm, tin tức, tra cứu, kế hoạch). Có web (Next.js), Android, iOS. Hiện nay LÀM WEB TRƯỚC; mobile theo web sau.
- **4 mục tiêu cho câu trả lời tư vấn** (anh Huy chốt 17/10): (1) kiểu ChatGPT, (2) ít bịa, (3) tư vấn tốt, (4) bảo mật. Các luật cũ của Tappy bỏ được nếu cản bốn mục tiêu này.
- **Việc chính 15–16/11:** làm cho phần BỐ CỤC/LAYOUT trong cuộc trò chuyện (conversation) đẹp, "như đọc báo/tạp chí", giống file mockup `D:\redesign\TappyAI_Web_Mockups_v206.html` (6 tab; 4 tab đầu: Elon vs Sam = so sánh có thẻ chủ thể; Tesla Fact = tra cứu có ảnh/mốc/ô nổi bật/bảng; Thảo Điền = quán ăn có thẻ địa điểm; Đà Lạt = lịch trình). Nghiên cứu sâu (báo cáo Standard/Advanced) đã tốt và KHÔNG được sửa nữa.
- Nguyên tắc của anh Huy cho bố cục: Tappy phải TỰ HIỂU câu hỏi và ngữ cảnh để chọn bố cục; mockup chỉ là tham khảo, không phải khuôn để vá từng case hay từng prompt.

---

## 2. MÔI TRƯỜNG, ĐƯỜNG DẪN, CÁCH CHẠY

| Thứ | Giá trị |
|---|---|
| Thư mục làm việc (web) | `D:\TappyAI-wt\wt-integration`, nhánh `feat/brain-r13-p1` |
| Commit gốc | `4762c58` (80 file sửa + khoảng 55 file mới CHƯA commit, xem mục 7) |
| Chỉ MỘT nhánh cho web | không tạo thêm worktree/nhánh (anh Huy 12/11) |
| Máy chủ UAT | `http://localhost:3000`, bộ chạy `D:\TappyAI-review-artifacts\consultative-wave3\measure30\uat-localhost.cjs`; lệnh: `cd /d/TappyAI-review-artifacts/consultative-wave3/measure30 && NODE_OPTIONS=--max-old-space-size=6144 UAT_FLAGS=flags-uat-blocks.json node uat-localhost.cjs` (chạy nền; nó nạp `.env.local` của dự án, không in khóa; cờ nằm trong `flags-uat-blocks.json`). Log: `...\measure30\logs\uat-3000.log`. Chỉ MỘT máy chủ `next dev` trên một thư mục (hai máy chủ làm hỏng `.next`: xóa `.next` rồi bật lại). `next dev` có thể ngốn ~3 GB (đã đặt heap 6 GB). |
| Bộ thử trực quan không gọi model | `/dev/v206?s=1..6` (6 kịch bản mockup, dữ liệu cố định, chặn mọi gọi tính tiền) |
| Sao lưu | `D:\TappyAI-review-artifacts\backup-20261114` (`tracked-changes.patch` = `git diff`, `untracked-files.tar`; làm mới sau mỗi chặng: `git diff > ...patch`, `git ls-files --others --exclude-standard > untracked.lst`, `tar --force-local -cf untracked-files.tar -T untracked.lst`) |
| Các bàn giao cũ | `docs/handoff/HANDOFF-20261112*.md`, `HANDOFF-20261113*.md` (trong thư mục này) |
| Bộ nhớ dự án của Claude | `C:\Users\Admin\.claude\projects\D--Claude-Projects-TappyAI-tappyai-mvp\memory\` (MEMORY.md + các file). Là bộ nhớ CỦA MÁY, có thể không nạp khi đổi tài khoản: vì vậy tài liệu này nằm trong dự án. |
| DB UAT | Supabase `zdaprdfgpbpnxyofagmc` (KHÁC production). Có 2 dự án Supabase dễ nhầm. Nối bằng `SUPABASE_DB_PASSWORD`; hỏi phép trước mọi ghi. Chi tiết: bộ nhớ `reference_uat_database_access_2026-11-15.md`. |
| Production | Vercel, deploy 04/11, KHÔNG có mã mới. Không deploy khi chưa có lệnh. |
| Khóa/biến môi trường | `D:\TappyAI-wt\wt-integration\.env.local`. TUYỆT ĐỐI không in/đọc nội dung khóa; kiểm sự tồn tại bằng script in đúng/sai. |

**Khóa API Anthropic (gói 1.000 USD của anh Huy):** đã tạo đúng trong một workspace; gọi `GET /v1/models` trả HTTP 200 và thấy 14 model (gồm `claude-fable-5-2`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`). Biến `ANTHROPIC_API_KEY` ở cấp người dùng Windows. **ỨNG DỤNG CLAUDE DESKTOP KHÔNG NHẬN KHÓA NÀY** (anh Huy xác nhận: chỉ dùng được trong terminal `claude`). Vì vậy: nếu phiên mới chạy trên Claude Desktop với tài khoản khác thì dùng quota của tài khoản đó; nếu cần dùng khóa thì chạy `claude` trong terminal. Quota gói Team của tài khoản cũ: tuần đã dùng ~93% (làm mới 18/11). Giữ phiên MỚI nhỏ để rẻ.

---

## 3. LUẬT LÀM VIỆC (anh Huy đặt; vi phạm nhiều lần, đã bực)

1. **KHÔNG vá từng case/từng prompt.** Sửa ở gốc, theo nguyên tắc chung; Tappy phải tự hiểu ngữ cảnh. Nếu thấy mình đang thêm "lớp vá" thì dừng và nói với anh.
2. **Bằng chứng trước khi sửa.** Em KHÔNG tự chạy được chat thật vì cổng tuổi chặn (không được gọi `/api/age-declaration` hay bấm xác nhận tuổi để chạy chat thật). Vì vậy: không giao anh Huy thử "mò". Tự kiểm bằng: bộ thử `/dev/v206`, test, script gọi model rời với dữ liệu mẫu (chi nhỏ, tối đa ~0,05 USD mỗi lần đã được anh cho phép), đọc log UAT.
3. **Chỉ sửa mã bằng công cụ Edit/Write** (hoặc file `.py` viết bằng Write rồi chạy). KHÔNG heredoc, KHÔNG `sed -i`, KHÔNG `python -c`/`python -`, KHÔNG `echo > file` để viết mã. Kiểm kết quả Edit trước khi chạy test (file chưa Read thì Edit không áp). Kết thúc dòng LF.
4. **Tiếng Việt** cho mọi chữ anh Huy đọc (chat, nút, ô tóm tắt, kế hoạch). Trả lời ngắn, thẳng, nói rõ cái gì chưa làm/chưa kiểm. Không hứa trước kết quả.
5. **Kỹ thuật là việc của em, KHÔNG hỏi anh chọn phương án kỹ thuật.** Chỉ hỏi: quyền (cài đặt, tải về, tài khoản), tiền, gu sản phẩm, quyền riêng tư, production.
6. **Chi tiền phải hỏi trước.** Anh đã cho phép tối đa ~0,05 USD mỗi lần thử model rời; đo benchmark/nghiên cứu sâu lớn phải xin riêng (anh từng từ chối thêm chi).
7. **Chưa commit/push/deploy** khi anh chưa nói rõ. Có ~135 thay đổi chưa commit: đừng làm mất (làm mới sao lưu thường xuyên).
8. **Không dùng/dẫn nguồn từ sản phẩm AI khác** (đối thủ AIHAY...), và không coi lời khuyên kiến trúc của ChatGPT/Gemini là chân lý: đề Phase A do ChatGPT viết dùng tên "Consultative Synthesizer" không khớp mã Tappy. Phải đọc MÃ THẬT.
9. **Nghiên cứu sâu (Standard/Advanced) đã chốt, KHÔNG đụng.** Báo cáo PDF/Word/Markdown tải một chạm cũng đã chốt.
10. Không đụng cách LẤY THÔNG TIN (công cụ tìm kiếm, bằng chứng, xếp hạng). Việc bố cục chỉ nằm ở phần trình bày + chỗ quyết định hiển thị.
11. Mỗi khi đổi kỳ vọng của một test cũ: đối chiếu từng assertion, không làm yếu test an toàn.
12. Chỉ làm trên ổ D (không tạo cây/temp/cache của Tappy trên ổ C).
13. Vitest: dùng `--reporter=verbose --silent=false` nếu cần thấy stdout.
14. Khi báo cáo: tách rõ "đã xác minh (có bằng chứng)" và "giả thuyết"; nhận lỗi thẳng; không tự chữa cháy bằng giải thích dài.

---

## 4. LỊCH SỬ NHỮNG NGÀY QUA (tóm tắt theo ngày; chi tiết ở các file bộ nhớ)

- **Tháng 10 → 04/11:** Bộ não "consultative"/"one brain" (một model Responses API, tự gọi công cụ), nhiều đợt đo UAT, đóng băng kiến trúc nhiều lần (tag `arch-freeze-20261102`, `...1103`), bảo mật đợt 1–2 lên production (PR #284), Messenger web/Android/iOS (PR #308–#313), iOS phát hành công khai nhưng nhiều lỗi, Apple từ chối build 179 vì thiếu xóa tài khoản (đã xử lý), Explore Video ADR đã duyệt (chưa code).
- **10/11:** ưu tiên số 1 = hoàn tất "bộ não" theo Master Architecture v3.0 Rev13; bộ não R13 lát 1–6 xong ở `wt-integration`.
- **11/11:** Report Engine V2.1 (báo cáo theo luận điểm, cờ `RESEARCH_THESIS_REPORT`) M1–M5 xong; nhiều đo; anh Huy đòi phương án dứt điểm cho nghiên cứu sâu.
- **12/11:** audit production; Agoda không hiện (cần ngày + tên thành phố khớp); anh Huy: chỉ một nhánh cho web; máy chủ đo thứ hai làm hỏng `.next`.
- **13/11:** phương án chốt cho bộ não web; anh rất bất mãn với vá từng case; mọi bản vá đã hoàn lại; chỉ cho MỘT phép thử độ hiểu (2 USD).
- **14/11:** bảng gói chính thức (Free = chỉ năng lực model, KHÔNG công cụ; Trial = Pro; Pro/Promax; nghiên cứu sâu Standard = Haiku, Advanced = Sonnet + Haiku; Promax = 10 Standard + 15 Advanced); đầu vào bộ não sửa (Agoda, số khách, thời tiết, TVI, ghi nhớ người dùng, banner/nền); lát 1 hợp đồng trình bày (compare/ask/booking).
- **15/11:** (a) tải báo cáo Word/PDF/Markdown một chạm (pdfmake 0.3.14 anh đã duyệt cài; bố cục PDF thiết kế áp cho MỌI báo cáo; logo Tappy); (b) đính kèm nhiều file (5 ảnh + 3 tài liệu, 3 MB; Word/Excel đọc phía máy chủ); (c) nghiên cứu sâu: sửa nguồn tin cậy, thời điểm số liệu, số học, đo live 1,57 USD; (d) nút "+" ở trang chủ (đính kèm + nghiên cứu sâu, chuyển sang chat); nền Hồ Gươm; (e) khối `profiles` (thẻ mỗi chủ thể) + khung đọc link bên phải (`/api/link-preview`) + hồ sơ bên phải có bảng Wikidata (`/api/entity-facts`).
- **16/11 (phiên này, buổi sáng và chiều):** xem mục 5.

---

## 5. VIỆC ĐÃ LÀM 16/11 (chi tiết, đều CHƯA commit, test xanh)

### 5.1 Quá trình và bài học (quan trọng để không lặp lại)
Em đã thêm nhiều "lớp" cho bố cục tin tức/tra cứu rồi ANH HUY BẮT GỠ: (1) biên tập viên trang (một lượt gọi model sau câu trả lời), (2) ba khối `facts`/`timeline`/`note` trong công cụ `present_blocks`, (3) nhận dạng danh sách mốc theo kiểu viết bằng regex. Cả ba đều là vá phía sau, không đụng gốc. ĐÃ GỠ SẠCH (file và đoạn trong `contract.ts`, `declare.ts`, `read.ts`, `PresentationBlocks.tsx`, `ChatInterface.tsx`, `ArticleAnswer.tsx`, `oneBrainMedia.ts`, `route.ts`). Đừng đưa lại các cơ chế đó.

### 5.2 Chẩn đoán gốc (Phase A, chỉ đọc mã; các điểm [V] đã xác minh)
- Luồng: `src/app/api/chat/route.ts:444` `oneBrain = consultOneBrainOn() && ...`; bước hiểu câu hỏi `understandTurn` (`src/lib/ai/answerV4/understand.ts`) chạy SONG SONG, không đến được model trả lời, chỉ phục vụ ảnh/thẻ sau khi xong; prompt viết câu trả lời = `ONE_BRAIN_CORE` + `ONE_BRAIN_SHAPE_REMINDER` (`src/lib/ai/consultative/oneBrain.ts`); `AI.stream(streamOpts)` (route.ts ~4265) rồi `toDataStreamResponse()` và chuỗi bộ lọc `streamEnrichment.ts`; cuối cùng `oneBrainMediaStream` (`consultative/oneBrainMedia.ts`) thêm thẻ/ảnh trước khung kết thúc.
- Gốc lỗi bố cục: prompt cũ mô tả ~12 "hình dạng" cố định, không có hình dạng cho câu hỏi thông tin hiện tại, hình dạng "một chủ thể" ép thành 3–6 gạch đầu dòng chữ đậm = "robot liệt kê"; model gần như không bao giờ gọi `present_blocks`.
- Bằng chứng tìm kiếm: `web_search` (route.ts ~3093 → `webSearch`/`serperSearchEx` trong `src/lib/ai/tools/common.ts`): mỗi dòng `{title, link, snippet, date?, site?}`, tối đa 6 dòng + `answer_box`/`knowledge_graph`; KHÔNG có nội dung trang (chỉ qua công cụ `read_page`, tối đa 4). Trích dẫn trong one-brain là markdown link do model viết; bộ lọc `stripUnownedLinks` (streamEnrichment.ts) xóa link không thuộc URL của kết quả công cụ.
- Ảnh: `DocItemImage {title, src, source:'wikipedia'|'web', href?}` (`src/lib/answerDoc/media.ts`); ảnh/thẻ chỉ cho `intent` là `knowledge`/`comparison` (`SUBJECT_CARD_INTENTS` trong oneBrainMedia.ts) và danh sách có `item_kind` trực quan; câu giá/tin tức/tra cứu không có ảnh. Khóa này có từ 29/10 vì từng ra thẻ sai.
- Truyền chữ: model `gpt-6-luna` qua OpenAI Responses API (`src/lib/ai/llm/providers/openai.ts`); không có luồng suy luận hiển thị (chỉ mục mã hóa để phát lại); effort `none` ở bước đầu rồi `medium` sau `think_deeper` (chế độ Tự động mặc định, mọi lượt đều gọi `think_deeper`); chế độ effort `none` KHÔNG truyền thật (byte đầu = byte cuối), chế độ `medium` truyền thật SSE; `tappyai_buffer_reasons` mọi lượt `hold:false` (không giữ cả câu), chỉ giữ đuôi link đang hình thành. Phân loại: chủ yếu "C" (chữ thô từ token đầu) kèm đệm nhỏ ở đuôi link.
- Ngữ cảnh nhiều lượt: tối đa 10 tin gần nhất, `compactHistoryToBudget` nén câu trả lời cũ từ xa tới gần, giữ nguyên câu trả lời cuối.

### 5.3 Thay đổi mã (theo nhóm)
1. **Prompt dàn trang** (`oneBrain.ts`): mục "Lay the answer out" viết lại theo NGUYÊN TẮC dàn trang theo cấu tạo nội dung (câu mở mang đáp án; bảng cho số cùng loại; danh sách mốc mở bằng ngày in đậm; tối đa 1 dòng quote nổi bật; câu tiếp nối không mở đầu lại; thẻ giữ địa chỉ/điểm/giờ/link còn chữ chỉ nói chọn gì - vì sao - cần kiểm gì); `ONE_BRAIN_SHAPE_REMINDER` sửa theo. Test ghim (`oneBrain.test.ts`) vẫn xanh. Thử model thật (script rời, dữ liệu mẫu): so sánh ra BẢNG, các dạng khác đổi nhẹ.
2. **Kế hoạch du lịch** (`PRESENT_PLAN_DESCRIPTION`, mục itinerary ở `ONE_BRAIN_CORE`, nhãn ngày trong schema `present_plan` ở `route.ts`): kế hoạch đầu tiên ĐẶC SẮC, ăn chơi đến khuya theo địa phương, mục cuối mỗi đêm bắt đầu >= 20:30 (trừ ngày đi), tra cứu cả lựa chọn buổi tối, "nhẹ nhàng" CHỈ khi người dùng yêu cầu. Thử model thật ở effort `medium` (như chế độ Tự động): ra chợ đêm 20:30 + rooftop 22:00; yêu cầu nhẹ nhàng vẫn giảm nhịp đúng. Ở effort thấp hiệu quả yếu.
3. **Chống lặp** (`src/lib/chat/cardDedupe.ts` + test; nối vào `ChatInterface.tsx`): thẻ kế hoạch giữ các điểm của nó; thẻ địa điểm chỉ giữ chỗ kế hoạch không nêu; thẻ lựa chọn bỏ mục trùng tên với hai loại kia. Nguyên nhân gốc (PDF của anh Huy): chữ + thẻ địa điểm + thẻ lựa chọn cùng hiện ba lần cùng ba quán.
4. **Giao diện theo mockup** (`ArticleAnswer.tsx`, `v206.css`): ô quote = thẻ xanh, dòng ngắn ngay dưới bảng = chú thích mono, ảnh trong `ImageGrid` có chip tên. Chỉ hiện khi model viết bảng/quote.
5. **Ảnh cố định cho câu hỏi THỜI GIAN THỰC** (phạm vi anh Huy chốt: vàng, dầu, tiền tệ, chứng khoán, crypto, tăng trưởng, lãi suất, thị trường chung; KHÔNG làm cho thứ đổi theo thương hiệu: mua sắm, xe, ẩm thực, du lịch; KHÔNG có ảnh dự phòng chung): 
   - `src/lib/media/topicImages.ts`: 8 khóa `TOPIC_KEYS`, `TOPIC_VARIANTS` (gold 2, oil 2, currency 3, stocks 2, crypto 2, growth 1, rates 1, markets 2), `pickTopicVariant`, `topicImageSrc`. File ảnh trong `public/topics/` (`topic-<khóa>.webp` = ảnh đầu, `topic-<khóa>-<n>.webp` = ảnh sau; 1536x512 webp, <80 KB; test canh đủ file, đúng kích thước, không file lạ).
   - `understand.ts`: thêm trường `topic_visual` (enum `none` + 8 khóa) vào lược đồ gửi cho model; kiểu TS để optional nên test cũ không đổi. Thử model thật 15 câu: chọn đúng 15/15 (vàng/dầu/tỷ giá/bitcoin/VN-Index/lãi suất/GDP...; và `none` cho iPhone/BYD/thời tiết/quán ăn/cà phê).
   - `mediaHosts.ts`: khối `kind:'topic'` {topic, variant?}; `oneBrainMedia.ts`: phát `[TAPPY_MEDIA]` topic khi câu trả lời xong, chọn ảnh ngẫu nhiên và lưu trong tin nhắn, bỏ qua nếu đã có thẻ chủ thể; client `TopicBanner.tsx` + `ChatInterface.tsx` (nhúng dưới câu mở đầu), i18n alt `v206.topic.*` trong `src/lib/i18n/presentation.ts`.
   - Nguồn ảnh: `D:\redesign\topic-images` (PNG 3:1 do ChatGPT làm theo yêu cầu) và `D:\redesign\topic-images\New folder` (ảnh thật anh Huy ĐÃ XÁC NHẬN được dùng; em cắt về 3:1 bằng sharp, vùng cắt chọn tay). Không dùng: ảnh báo chí, ảnh thời tiết (ngoài 8 loại). Ảnh vàng/chứng khoán thật có số in trong ảnh (anh đã duyệt). Ảnh dầu hoàng hôn độ phân giải thấp (800 px) hơi mềm.
   - Log chat thật của anh Huy đã có 1 lượt phát khối `topic`.
6. **Khác:** thẻ nhiều chủ thể chỉ khi `answer_shape = 'comparison'` (`docMedia.ts`); `localizedWikiEntity` ưu tiên bài Wikipedia tiếng Việt; thông báo "trang không cho Tappy đọc tự động" (laodong.vn chặn bằng cookie JS, không phải lỗi); `reportPdfDesign.test.ts` khóa đồng hồ (test cứng ngày 15/11, không phải lỗi mã).

---

## 6. TRẠNG THÁI SẢN PHẨM — nói thật (anh Huy hỏi "đã sửa hết như mockup chưa, sao không thấy đổi")

CHƯA hết. Em chưa từng tự thấy một câu trả lời thật hiện đẹp như mockup. Cụ thể:
- Có hiệu lực thật, đã thấy trong log/thử model: ảnh banner theo chủ đề; bảng cho câu so sánh; kế hoạch đến khuya (khi effort `medium`).
- Nằm trong mã nhưng chỉ hiện khi model viết đúng kiểu: ô quote xanh, chú thích dưới bảng. Câu trả lời ngắn nhìn gần như cũ.
- CHƯA làm hoặc chưa đạt mockup: thư viện ảnh 3 tấm có chú thích cho câu thông tin thường (ảnh đến từ ảnh từng mục danh sách; câu tra cứu không có); thẻ chủ thể (tab 1): chưa đổi gì, anh Huy chưa duyệt bố cục; thẻ địa điểm và lịch trình (tab 3, 4): vẫn như cũ (chỉ so sơ trong bộ thử, thấy khác chủ yếu do bộ thử không có ảnh); dòng thời gian có chấm tròn: đã gỡ theo lệnh anh.
- Trình duyệt giữ mã cũ nếu trang mở từ trước: bảo anh Huy bấm Ctrl+F5.

---

## 7. TRẠNG THÁI MÃ

- `git diff --shortstat`: 80 file sửa, +2448/−359 dòng; ~55 file/thư mục mới chưa theo dõi. Nhóm chính:
  - **Báo cáo/nghiên cứu sâu/PDF (đã chốt, đừng đụng):** `src/lib/ai/research/{deepResearch,deepResearchDeps,evidenceCards,evidenceState,forecastModel,thesisReport}.ts`, `src/lib/answerDoc/{reportDesign,reportPdf,reportPdfDesign,reportExport}.ts`, `src/components/chat/{ResearchCanvas,ResearchCard,ReportExportBar,reportPdfCover}.ts*`, `src/types/pdfmake.d.ts`, `package.json` (+pdfmake, fflate).
  - **Đính kèm:** `src/lib/attachments/policy.ts`, `src/lib/ai/attachments/{officeText,pdfAttachments}.ts`, `src/lib/ai/security/clientInput.ts`, `src/components/chat/{composerAttachment,useAttachmentTray}.ts`, `src/app/HomeV3.tsx`, `src/lib/chat/homeHandoff.ts`.
  - **Trình bày (khối model khai báo, thẻ, khung đọc, hồ sơ):** `src/lib/presentation/{contract,declare,read}.ts`, `src/components/chat/{PresentationBlocks,ProfileCards,TopicBanner}.tsx`, `src/components/chat/v206/{V206Drawers,ReaderLinkInterceptor,...}.tsx`, `src/app/api/{link-preview,entity-facts}/`, `src/lib/entity/wikiFacts.ts`, `src/lib/chat/{entityFacts,entityProfiles,readerLinks,cardDedupe}.ts`, `src/components/ChatInterface.tsx`.
  - **Bộ não/prompt/ảnh:** `src/lib/ai/consultative/{oneBrain,oneBrainMedia,planV2,decisionFrame,memoryBlock,...}.ts`, `src/lib/ai/answerV4/{understand,docMedia}.ts`, `src/lib/media/{mediaHosts,topicImages}.ts`, `public/topics/*.webp`, `public/backgrounds/shell-background.webp`, `public/banners/`.
  - **Khác đã có từ trước phiên:** TVI, ghi nhớ người dùng (`personFacts`), Agoda (`agodaLite`, `agodaVietnamCities.json`), thời tiết, plans/tiers.
- `npx tsc --noEmit -p .` sạch. `npx vitest run src`: ~25.300 test đạt. HAI test chập chờn khi chạy cả bộ nhưng đạt khi chạy riêng, không do thay đổi này: `src/lib/media/video/overlay/renderPng.test.ts`, `src/app/api/chat/consultativeV1.route.test.ts`.
- Sao lưu mới nhất đã làm sau thay đổi cuối (xem mục 2).

---

## 8. VIỆC PHẢI LÀM TIẾP (theo thứ tự)

1. **Chờ phản hồi từ phía anh Huy sau khi anh thử chat thật** (Ctrl+F5 trước). Hỏi anh gửi ảnh/chỉ rõ những chỗ chưa giống mockup (thẻ chủ thể, thư viện ảnh 3 tấm, thẻ địa điểm, lịch trình, câu giá vàng/dầu...). Mỗi chỗ lệch: dựng lại bằng bộ thử `/dev/v206`, tự chụp màn hình, sửa đúng chỗ đó theo nguyên tắc chung (luật 1), rồi cho anh xem trước.
2. **Thẻ chủ thể (tab 1):** anh Huy chưa duyệt bố cục. KHÔNG sửa cho đến khi anh nói ý.
3. **Thư viện ảnh 3 tấm có chú thích cho câu thông tin thường:** cần quyết định cách lấy ảnh (hiện chỉ có từ ảnh mục danh sách). Hỏi anh trước vì đụng vào bước ảnh/thẻ (rủi ro thẻ sai như 29/10).
4. **Bộ ảnh cố định:** `rates` và `growth` mới có 1 ảnh; thêm ảnh thật cho lãi suất khi anh có (đặt file vào `public/topics`, tăng số trong `TOPIC_VARIANTS`).
5. **Kiểm lại trên thiết bị:** Android và iOS có hiển thị đúng khối `topic` không (đoán là bị bỏ qua, chưa kiểm). Các phần web-first nên mobile theo sau.
6. **Chờ anh quyết:** mở ảnh Wikipedia cho câu tra cứu/tin tức (rủi ro thẻ sai); production Promax migration (chạy bằng script phát hành, do anh/lead); nội dung xin phép lưu thông tin cá nhân (person memory) trên trang quyền riêng tư; đo lại nghiên cứu sâu với mã mới (cần anh duyệt tiền); commit gộp khi anh bảo.
7. Nếu đổi prompt thêm: mỗi lần PHẢI thử bằng script rời trên ít nhất vài câu mới khác nhau (gồm câu ngắn, câu có bảng, câu kế hoạch, câu "nhẹ nhàng") và so với bản cũ (`git show HEAD:...` cho bản gốc), tổng chi < 0,05 USD.

---

## 9. CẤM / RỦI RO / LƯU Ý KỸ THUẬT

- Không tự vượt cổng tuổi để chạy chat thật. Không bấm xác nhận tuổi hộ người dùng.
- Không in/đọc khóa hay `.env*` (đã có sự cố: grep in nguyên khóa). Kiểm bằng script in đúng/sai.
- Không chạy hai `next dev` trên cùng thư mục; không để máy chủ chiếm quá nhiều RAM (khởi động lại nếu worker chết: xóa `.next`, bật lại).
- Cạm bẫy khi viết chuỗi trong mã: chuỗi dùng dấu nháy đơn mà có chữ `person's` làm vỡ file (đã gặp 1 lần, sửa bằng diễn đạt khác); Write giải mã `\uXXXX` thành ký tự thô: không chèn ký tự vô hình/bidi.
- Test "cứng ngày" gây đỏ khi sang ngày mới: khóa đồng hồ (`vi.useFakeTimers({ toFake: ['Date'] })`).
- Không bao giờ dùng `git stash` trần, `git reset --hard`, `git checkout --` khi chưa chắc cwd: dùng `git -C <đường dẫn tuyệt đối>`.
- Android/iOS ăn theo web sau; không deploy app khi Apple đang duyệt.
- 10 worktree "One Life" (game): giữ nguyên, không dọn.
- Gói/Quota: Free không có công cụ (chỉ năng lực model); Trial = Pro; nghiên cứu sâu Standard = Haiku, Advanced = Sonnet + Haiku.

---

## 10. PROMPT KHỞI ĐỘNG PHIÊN MỚI (dán nguyên văn cho Claude)

```
Đây là phiên tiếp nối công việc TappyAI web. Hãy đọc kỹ file bàn giao này trước khi làm bất cứ việc gì:
D:\TappyAI-wt\wt-integration\docs\handoff\HANDOFF-20261116-layout-anh-ke-hoach-ban-giao-tai-khoan-moi.md
(nếu có bộ nhớ dự án thì đọc thêm ghi chú "BẮT ĐẦU TỪ ĐÂY" trong đó, nhưng file này là nguồn đầy đủ nhất).

Làm theo thứ tự: (1) đọc mục 3 (luật) và mục 9 (cấm/rủi ro); (2) kiểm trạng thái: nhánh feat/brain-r13-p1 ở D:\TappyAI-wt\wt-integration, git status, tsc, và hỏi tôi có bật lại máy chủ UAT localhost:3000 không; (3) chờ tôi gửi ảnh những chỗ chưa giống mockup rồi sửa đúng chỗ đó theo mục 8 — không vá từng case hay từng prompt, không giao tôi thử mò, tự chụp/kiểm trước. Chưa commit, không đụng nghiên cứu sâu, không đụng cách lấy thông tin. Trả lời tiếng Việt, ngắn, nói rõ cái gì chưa làm/chưa kiểm.
```

---

## 11. PHỤ LỤC: LỆNH VÀ SCRIPT HỮU ÍCH

- Kiểm kiểu: `cd D:/TappyAI-wt/wt-integration && npx tsc --noEmit -p .`
- Toàn bộ test: `npx vitest run src` (một nhóm: `npx vitest run src/lib/media src/lib/ai/consultative`).
- Thử prompt bằng model thật, rời, không qua chat: đọc `ONE_BRAIN_CORE`/`ONE_BRAIN_SHAPE_REMINDER` ra khỏi `oneBrain.ts`, gọi `https://api.openai.com/v1/responses` với `gpt-6-luna`, `store:false`, effort `none`/`medium`, nạp khóa từ `.env.local` bằng `process.loadEnvFile` (không in khóa), kèm "kết quả công cụ mẫu" trong tin nhắn. Có thể viết lại script này trong thư mục tạm của phiên.
- Nén ảnh: dùng `sharp` có sẵn trong `node_modules` (`sharp(file).extract(...).resize(1536, 512, { fit: 'cover' }).webp({ quality: 82 })`); giữ <80 KB.
- Xem mockup: chạy tạm máy chủ tĩnh `python -m http.server 8765 --bind 127.0.0.1 --directory D:/redesign` rồi mở `http://127.0.0.1:8765/TappyAI_Web_Mockups_v206.html` trong trình duyệt (khung xem cục bộ của ứng dụng không bấm được tab trên file://); nhớ tắt máy chủ sau khi xem.
- Mockup nội bộ: các nút `dev-btn-scenario-1..6` (id), vùng hội thoại `conversation-viewport`.
- Log chat thật: tìm dòng `tappyai_one_brain_media` (có `block`, `understand_usd`), `tappyai_present_blocks`, `tappyai_turn_cost`, `tappyai_usage` trong `measure30/logs/uat-3000.log`.

Hết biên bản.
