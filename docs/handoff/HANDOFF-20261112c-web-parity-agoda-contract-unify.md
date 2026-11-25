# BÀN GIAO 12/11/2026 (tối) — Web TappyAI: giống mockup, Agoda, hợp đồng trình bày, hợp nhất kiến trúc

Soạn lúc đóng phiên (tài khoản sắp hết hạn mức tuần). Mọi mục ghi **ĐÃ XÁC MINH** (có bằng chứng trong phiên, nói rõ bằng chứng) hay **CHƯA XÁC MINH**. Không có khóa, token, `.env` trong tài liệu này. Tài liệu bàn giao trước đó (cùng ngày, phiên khác) vẫn có hiệu lực cho phần nó nói: `docs/handoff/HANDOFF-20261112-web-brain-uat-v206.md` (chưa theo dõi bởi git; đọc, không ghi đè).

## 0. Trạng thái một đoạn

Cây `D:\TappyAI-wt\wt-integration`, nhánh `feat/brain-r13-p1`, **HEAD `4762c58`**, **chưa có upstream** (chưa push bao giờ), `git status --short` chỉ có `?? docs/handoff/`. **Không có thay đổi nào chưa commit của mã/test/tài liệu.** Phiên này thêm 10 commit sau `710b458`. **Owner đang bất mãn:** giao diện thật của Tappy (bản UAT) **không giống mockup `D:\redesign\TappyAI_Web_Mockups_v206.html`**; em (phiên này) chiều nay chủ yếu đo khoảng cách và sửa lỗi lẻ, **chưa thu hẹp khoảng cách thị giác**. Owner vừa ra lệnh **"Tạm dừng triển khai tính năng mới"**: phiên mới **không được tự bắt đầu việc mới** khi chưa có go-ahead; việc đầu tiên là kiểm trạng thái, rồi hỏi Owner chọn việc ở mục 8.

## 1. Mục tiêu và yêu cầu của Owner (Huy) — nguyên tắc cứng, đừng đảo

- Sản phẩm: **một bản web hoàn chỉnh** để Huy UAT ở `http://localhost:3000/chat`, theo mockup v206 (6 tab: Elon vs Sam, Tesla Fact, Thảo Điền, Đà Lạt Travel, Deep Research, Dự án Phú Quốc), với bộ não R13 (kiến trúc mới R9→R13, 9–10/11/2026: 4 tệp ở `C:\Users\Admin\Downloads\TappyAI_*Revision13*`).
- Tappy phải **hiểu ngữ cảnh và người dùng** để trả lời tốt như ChatGPT Plus; **Nghiên cứu sâu Standard/Advanced phải thắng ChatGPT Plus và Claude Sonnet 5.5 có nghiên cứu sâu**. Bộ não "hiểu ngữ cảnh thì tự chọn bố cục": **cấm vá từng case / chỉnh prompt cho một câu; sửa kiến trúc/quy tắc chung.**
- **Chỉ MỘT nhánh cho web: `feat/brain-r13-p1` ở `D:\TappyAI-wt\wt-integration`.** Không tạo nhánh/worktree mới, không `start_session` với worktree. Không đụng iOS/Android, production, PR #267, Merge Guard, 10 cây worktree One Life (Huy dặn GIỮ), và cây `D:\Claude\Projects\TappyAI\.worktrees\g1-growth` (việc khác, có thay đổi chưa commit của người khác).
- **Không push/PR/deploy, không áp migration.** Cờ mới: TẮT mặc định, khóa ở production, test "cờ tắt = hành vi cũ".
- **Báo cáo trong chat ngắn, tiếng Việt**; nghiên cứu sâu trong chat = thẻ tóm tắt (ý chính + tổng số nguồn + nút mở), không danh sách nguồn, **không nút PDF trong thẻ**; **phần xuất báo cáo (Markdown/Word/PDF) giữ nguyên, không đụng** (Huy: "chức năng báo cáo xuất được thì giữ nguyên").
- **Không giao việc cho agent con; tự làm** (Huy: "em đừng giao cho agent làm nữa mà hãy tự làm").
- **Phải có ảnh chụp** khi nói về giao diện (Huy: "e hỏi mà ko chụp hình lại sao a biết"). Không nói "khớp mockup" khi chưa so ảnh cạnh nhau cùng độ rộng và nhìn giống thật.
- Không chạy lệnh tốn tiền khi chưa có trần chi phí Huy chấp nhận; không bỏ câu nào của bộ UAT vì tiền. Không in/sao chép khóa; **đừng giải mã biến Vercel** (bộ phân loại quyền chặn, xem mục 10).

## 2. Công việc đã hoàn thành phiên này (tất cả đã COMMIT; ĐÃ XÁC MINH bằng `git log`)

| Commit | Nội dung |
|---|---|
| `edaff0d` | **Sửa lỗi thật:** mở hội thoại đã lưu có lịch trình không hiện nút "Mẹo". Nguyên nhân: `ChatInterface` xóa kho mẹo bằng effect lúc VÀO hội thoại, chạy sau effect của con nên xóa mất mẹo vừa công bố. Sửa: reset khi RỜI hội thoại. Test `tipsAfterOpen.test.tsx` đỏ trước (0 mẹo thay vì 2), xanh sau. |
| `6684085` | **Trang thử dev `/dev/v206?s=1..6[&bar=0]`**: vẽ workspace thật + `ChatInterface` thật từ dữ liệu mẫu cục bộ. 404 ở production (cổng trong `page.tsx`, test quét mã nguồn, đột biến làm test đỏ); lớp bọc `fetch` (`lib/dev/v206Harness/harnessFetch.ts`) trả hồ sơ chip cố định và **chặn** `/api/chat`, `research`, `deep-research`, `tts`, `voice`, `media/video`, `auth/anonymous` (503). `WorkspaceFrame` nhận `store` làm prop; kho có `activeId` tùy chọn (mặc định vẫn đọc từ URL). |
| `9732ac7` | Sửa hydration của trang thử (một đồng hồ `nowMs` từ server). |
| `2c10f4e` | Bộ **T01–T18 + biến thể + hợp đồng + cách ly** chạy qua `ChatInterface`/`ProjectOverview` thật (`adaptiveComposition.test.tsx`). Phần cần mô hình thật là `it.todo`. Một hạn chế đã biết ghim bằng `it.fails` (bộ nhớ thẻ địa điểm khóa theo 160 ký tự đầu câu trả lời). |
| `8939154` | **Thẻ địa điểm nằm dưới đoạn văn bản nhắc tên nó** (`lib/chat/placeAnchoring.ts`: quy tắc chung từ văn bản + tên, không theo câu hỏi/loại quán; địa điểm không được nhắc vào băng cuối); `PlaceDecision layout="solo"` (thẻ rộng, ảnh thật khi có); chỉ khi câu trả lời đã xong; chỉ khi `WORKSPACE_V206`. 21+9+7 test, tắt tách thẻ làm 5 test đỏ. |
| `7906339`, `8d40643` | Báo cáo harness `docs/uat/V206-HARNESS-REPORT-20261112.md` (đối chiếu từng tab, lỗi tìm thấy, T01–T18, thiếu gì). |
| `1d6007a`, `80b1aab` | Audit kiến trúc `docs/architecture/AUDIT-KIEN-TRUC-20261112.md` (một hàm POST 4.393 dòng, 3 thế hệ là phương án thay thế dùng chung phần đuôi, 3 kênh trình bày, số liệu vá). |
| `4762c58` | **Hợp đồng trình bày v1** `src/lib/presentation/contract.ts` (+ test 32, thiết kế `docs/architecture/HOP-DONG-TRINH-BAY-V1.md`): `parsePresentation` (cửa duy nhất cho dữ liệu ngoài) + `presentationFromMessage` (đọc marker/chú thích/hình dạng vào một hợp đồng). **Chỉ là thư viện, KHÔNG nối vào giao diện/máy chủ/lưu trữ.** |

Tệp **ngoài repo** phiên này tạo (không nằm trong git): `D:\TappyAI-review-artifacts\` → `DIEU-TRA-HOP-NHAT-KIEN-TRUC-20261112.md`, `HANDOFF-HOP-NHAT-KIEN-TRUC-20261113.md` (bàn giao riêng phần hợp nhất), `UAT20-BAO-CAO-20261112.md`, `UAT20-UI-BAO-CAO-20261112.md`, thư mục `UAT20-UI\` (50 ảnh 1600×1000 + `00-contact-sheet.png` + `ui-results.json`), `UAT20-UI-trial\`, `v206-harness\` (ảnh mockup ↔ sản phẩm), và trong `consultative-wave3\measure30\`: `uat20-cases.json`, `run-uat20.mjs` (bộ chạy API nhiều lượt), `ui-run.mjs` (chạy qua giao diện thật bằng Edge + chụp), `runs\UAT20-20261112\results.json`. Bộ nhớ: `C:\Users\Admin\.claude\projects\D--Claude-Projects-TappyAI-tappyai-mvp\memory\project_production_audit_2026-11-12.md`, `project_agoda_findings_2026-11-12.md` + 2 dòng chỉ mục trong `MEMORY.md`.

Không xóa tệp nào; không sửa production; không sửa app.

## 3. Kiểm thử — nói đúng cái gì đã chạy

| Lần chạy | Kết quả | Nhãn |
|---|---|---|
| `npx tsc --noEmit -p .` sau commit cuối (`4762c58`) | sạch | ĐÃ XÁC MINH |
| `npx vitest run --project app` toàn bộ, **sau `9732ac7`** (máy chủ dev tắt) | 26693 đạt, 2 lỗi, 8 expected fail, 94 skipped, 6 todo. 2 lỗi = `scripts/architecture/businessDataBoundary.test.ts`, `vendorCacheRule.test.ts`, đều **quá 5000 ms**; chạy riêng `scripts/architecture`: 46/46 đạt | ĐÃ XÁC MINH (nguyên nhân "định giờ" là SUY, hỗ trợ bởi chạy riêng đạt) |
| Sau đó chỉ chạy **có chọn lọc**: `src/components src/lib/chat` (158 tệp, 1901 đạt, 1 expected fail, 5 todo); `adaptiveComposition` 41 đạt; `contract.test.ts` 32 đạt; `placeAnchoring` 21; `placeEmbeds` 9 | đạt | ĐÃ XÁC MINH |
| **Toàn bộ vitest sau `8939154` và `4762c58`** | **CHƯA chạy lại** | CHƯA XÁC MINH |
| Bộ test định giờ khi server dev đang chạy | hay quá 5000 ms (đã biết): `controllerRules`, `businessDataBoundary`, `vendorCacheRule`, `attrContextEgress`, `MediaBlocks`, `research.test`, `renderPng` | ĐÃ XÁC MINH |

Sau mỗi lần chạy toàn bộ: `git checkout -- docs/audit` (4 tệp JSON bị đổi bởi test; không phải thay đổi thật).

UAT có mô hình thật phiên này (tổng ≈ **0,59 USD**): API 20 câu (0,22), qua giao diện 21 lượt (0,37), thử 1 câu (≈0,001). Chưa chấm mù; không so ChatGPT/Claude.

## 4. Phát hiện chưa sửa (từ UAT 12/11, ĐÃ XÁC MINH bằng log/ảnh trừ chỗ ghi khác)

1. **Agoda không hiện, hai lớp.** (a) Không có ngày nhận/trả phòng ⇒ `criteriaFor('hotel')` (`src/lib/ai/tools/realtimeBooking.ts`) trả null ⇒ log `tappyai_realtime agoda attach unsupported`; thêm nữa từ 20/09 trang chủ/trang tìm kiếm Agoda không được phát (A3.3, `tools/travel.ts`). (b) **Có ngày vẫn lỗi:** mô hình nhét cả cụm vào `location` ("Phú Quốc, gần biển, phù hợp 4 người lớn"); `src/lib/providers/realtime/locations.ts` có `phuquoc → 17188` nhưng khớp **tuyệt đối** sau `fold` ⇒ `needs_location_id`. Ảnh S12b chỉ có Trip.com và Booking.com. **Chưa sửa.**
2. **Liên kết đối tác sai sản phẩm:** hỏi S25 ⇒ khối "Liên kết đối tác" trỏ **Galaxy S25 Ultra** (lặp lại ở cả lần chạy API và lần chạy giao diện).
3. **Thẻ ≠ văn bản:** S12b khuyên Tahiti Beach Hotel nhưng hai thẻ đầu là PureJoy và Rio Guest House; hàng "iPhone 16 … chưa rõ giá" trong khi văn bản nêu 24,49 triệu.
4. **Ba nút "Đặt chỗ" cùng nhãn** trên một thẻ quán (S3).
5. **S6 (sức khỏe):** gợi ý Bệnh viện Từ Dũ (phụ sản) như nơi cấp cứu cho ca đau bụng + sốt (có hedge, vẫn dễ gây hiểu nhầm).
6. **C1#2:** đổi một ngày làm hai ngày còn lại mất chi tiết ("Điểm tham quan đã chọn gần nơi lưu trú" thay Fresh Garden).
7. **S4:** chuỗi tiếng Việt "(chưa xác minh)" rò vào thẻ kế hoạch tiếng Hàn (đã nằm trong danh sách "đã biết" của tài liệu đóng băng, mục d).
8. Nút giao diện vẫn tiếng Việt khi trả lời tiếng Hàn/Nhật (ngôn ngữ giao diện là cài đặt riêng; **CHƯA kiểm giao diện khi đặt `ko`/`en`**).
9. Lịch sử hội thoại của khách ẩn danh luôn trống ("Chưa có cuộc trò chuyện nào"): **CHƯA biết** thiết kế hay lỗi lưu. Hộp "Tappy muốn hiểu bạn hơn!" che màn hình sau câu đầu của người mới (hành vi thật).
10. Mô hình **không bao giờ viết bảng so sánh** trong 21 lượt (kể cả hai câu so sánh) ⇒ bố cục so sánh kiểu mockup không xuất hiện.
11. Hạn chế đã biết: bộ nhớ thẻ địa điểm khóa theo 160 ký tự đầu (`it.fails` trong `adaptiveComposition.test.tsx`).

## 5. Khoảng cách giao diện ↔ mockup (lý do Owner bất mãn)

ĐÃ XÁC MINH bằng ảnh (`v206-harness\` và `UAT20-UI\`) và bảng `docs/uat/V206-GAP-TABLE-20261112.md` + `V206-HARNESS-REPORT-20261112.md`. Đã bật trên UAT (qua cờ `NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED`, `NEXT_PUBLIC_WORKSPACE_V206`, `NEXT_PUBLIC_RESPONSE_PRESENTATION`) nhưng **không giống mockup**:
- **Làm được không cần dữ liệu mới:** product header (thiếu menu, nhãn PRO, chuông, avatar); kiểu chữ Inter thay Plus Jakarta Sans / Newsreader / JetBrains Mono; bong bóng câu hỏi thiếu giờ và ✓✓; ô nhập khác (hàng chip gợi ý, biểu tượng); tên mục rail khác (mockup: Trò chuyện, Khám phá, Đã lưu, Hộp thư, Tiện ích); thẻ quán là băng thẻ nhỏ thay vì thẻ rộng ảnh trái/chi tiết phải; callout màu cam thay vì sky; thẻ chân dung thực thể.
- **Cần dữ liệu sản phẩm chưa có (đừng làm giả):** "Evidence Verified", banner đối tác, ảnh từng chặng lịch trình, đặc trưng nổi bật/menu/clip của quán, ngân sách/trạng thái dự án (9 mục trong bảng khoảng cách).
- **Trên production: không có gì trong số này** (code và cờ chưa có trong bản deploy 04/11).

## 6. Kiến trúc và production (ĐÃ XÁC MINH trừ chỗ ghi khác)

- **Chỉ MỘT bộ não đang sống: One Brain** (`gpt-6-luna` đọc cả hội thoại, 8 bước, mọi công cụ) ở cả UAT và (rất có khả năng) production. Bộ luật cũ "Consultative V2" ngủ phần lớn (`route.ts` dòng 521: `consultOn = consultV2Enabled() && !hasImage && !clipRef && !oneBrain`; 16 cờ `CONSULT_UNWIND_*` bật); agent runtime (`TAPPY_AGENT`) không bật ở đâu. Chúng là **phương án thay thế dùng chung phần đuôi**, không hỗ trợ nhau. `oneBrain = consultOneBrainOn() && !tappyAgentEnabled() && !clipRef` (dòng 442): **lượt có clip chạy đường không phải One Brain; em CHƯA lần ra nó chạy mã nào.**
- **Production:** bản live `dpl_vHV5H72nncX44MnMUJ6uXHx76tDn`, tạo 04/11/2026 20:41 (+07), mã khớp `main@33cef8b` (theo bộ nhớ + giờ; deploy bằng CLI nên Vercel không ghi commit), **không có cờ R13**. Nhánh này hơn `33cef8b` **114 commit** (trước phiên này) + 10 commit phiên này. Tên biến production có `CONSULT_ONE_BRAIN`, `CONSULT_PRODUCTION_ALLOW`, `CONSULT_V2`, `CONSULT_CAPABILITY_LEVEL`, 16 `CONSULT_UNWIND_*` (đặt ≈02/11, trước deploy). **Giá trị cờ hiện tại CHƯA đọc được** (xem mục 10).
- R13 vs mã: khái niệm "Processing Stream/Server Request Admission" cho luồng thường **chưa tồn tại**; nghiên cứu sâu **mặc định vẫn Luna** (R13 nói Haiku/Sonnet, không Luna); R13 **không** định nghĩa hợp đồng trình bày có kiểu. Tài liệu R13 tự ghi "Design Freeze NOT APPROVED / implementation NOT AUTHORIZED"; Huy cho phép làm bằng lời ngày 10/11.
- **Owner đã tạm dừng việc hợp nhất** ("khoan hợp nhất, anh thấy nguy hiểm quá"). **Nội dung bàn giao đầy đủ của phần hợp nhất đã GỘP vào mục 6B dưới đây** (tệp riêng `D:\TappyAI-review-artifacts\HANDOFF-HOP-NHAT-KIEN-TRUC-20261113.md` và `DIEU-TRA-HOP-NHAT-KIEN-TRUC-20261112.md` vẫn còn để tham khảo thêm, nhưng không cần đọc để làm việc).

## 6B. HỢP NHẤT KIẾN TRÚC — bàn giao đầy đủ (gộp vào tệp này)

**Trạng thái: Owner TẠM DỪNG ("khoan hợp nhất, anh thấy nguy hiểm quá"). Chưa được xóa, gộp hay cách ly mã nào.** Chỉ khi Owner cho phép mới được làm **bước ĐO** (6B.5, bước 1). Mọi bước sau cần Owner duyệt riêng.

### 6B.1 Bối cảnh Owner nêu
- Owner mất rất nhiều thời gian cho bộ não Tappy; **không chấp nhận "3 kiến trúc chồng chéo"** nhưng sợ việc hợp nhất làm ảnh hưởng kiến trúc mới. Kiến trúc mới nhất = chuỗi R9→R13 (9–10/11/2026); cái trước đó "có thể bỏ"; **production đang chạy bộ não cũ, chưa deploy bản mới.**
- Owner nói hiện **đang thắng ở câu trả lời tìm web do Luna** nhờ công cụ Serper, Parallel, Agoda, Vexere affiliate (hôm nay); **nghiên cứu sâu Standard/Advanced chưa đo lại**. (CHƯA XÁC MINH: bộ nhớ chỉ ghi mốc chấm mù 03/11 là 6,89 so với 7,60, không rõ bên nào hơn; nếu Owner có số mới thì dùng làm bộ chuẩn.)

### 6B.2 Hiện trạng đã xác minh (ĐO bằng mã/git/Vercel)
**Chỉ MỘT bộ não đang sống: One Brain** (`CONSULT_ONE_BRAIN=1`; `gpt-6-luna` là bên duy nhất đọc câu hỏi; 8 bước; mọi công cụ), ở UAT và (rất có khả năng) production. "Ba kiến trúc" thực chất là **phương án thay thế loại trừ nhau dùng chung phần đuôi**, không hỗ trợ nhau:

| Thành phần | Production | UAT (3000) | Mã | Nhận định |
|---|---|---|---|---|
| One Brain | BẬT (rất có khả năng; giá trị cờ chưa đọc được) | BẬT | `consultative/oneBrain.ts` + nhánh trong `route.ts` | bộ não sống duy nhất |
| Bộ luật cũ "Consultative V2" (`consultRouter.ts` 1.256 dòng, `needProfile` 984, `shoppingConstraints` 743, `rank` 563, `pick` 485, `candidate` 449, `consultBrain` 417…; cả `consultative/` 18.352 dòng/98 tệp) | `CONSULT_V2=1` nhưng 16 cờ `CONSULT_UNWIND_*` đều bật; `route.ts` dòng 521: `consultOn = consultV2Enabled() && !hasImage && !clipRef && !oneBrain` | giống production | ngủ phần lớn; mô-đun nào còn chạy: **CHƯA đo** |
| Agent runtime Luna (`TAPPY_AGENT=2`; `src/lib/ai/agent/` 8.103 dòng/43 tệp; 24 chỗ `agentV2`) | không đặt | không đặt | | tắt ở mọi nơi, NHƯNG một phần dùng chung (bẫy 1) |
| R13 (đích) | CHƯA deploy | một phần, sau cờ | nhánh hơn `main@33cef8b` **114 commit** (trước phiên này) | đích kiến trúc, chưa hoàn thành |

- `route.ts`: một hàm `POST` dài 4.393 dòng (225–4617), 207 import; chọn thế hệ ở dòng 442: `oneBrain = consultOneBrainOn() && !tappyAgentEnabled() && !clipRef`. **Lượt có clip chạy đường không phải One Brain; chưa lần ra nó dùng mã cũ nào.**
- **Các thay đổi R13 trong `route.ts` kể từ bản production (`33cef8b`): +113/−18 dòng; chỉ 1 dòng nhắc `oneBrain`, 0 dòng nhắc agent/bộ luật cũ ⇒ R13 không phụ thuộc mã cũ.**
- Công cụ (tìm web, `read_page`, `get_flight_prices`, `get_hotel_prices`=Agoda, `get_transport_options`=Vexere) đăng ký trong `route.ts` KHÔNG qua cờ, cài đặt ở `lib/ai/tools`, `lib/ccp` (không ở thư mục cũ). Trên production: **Agoda có (biến đã đặt); Parallel và cờ Vexere chưa có** (chỉ UAT).
- **Production**: bản live `dpl_vHV5H72nncX44MnMUJ6uXHx76tDn`, tạo 04/11/2026 20:41 (+07), aliases tappyai.com / www / tappyai.vn; mã khớp `main@33cef8b` (theo bộ nhớ + giờ; deploy CLI nên không có git metadata); **không có cờ R13** (`git grep` 0 tệp trong `33cef8b` cho `RESEARCH_THESIS_REPORT`, `RESEARCH_ADVANCED`, `AI_COST_GATE`, `ATTACHMENT_ONLY_POLICY`, `MARKET_GATE`, `SAFETY_EMERGENCY`, `CANONICAL_CONTEXT`, `TVI_CAPTURE`, `NEXT_PUBLIC_WORKSPACE_V206`, `NEXT_PUBLIC_RESPONSE_PRESENTATION`). Tên biến Production (giá trị mã hóa): có `CONSULT_ONE_BRAIN`, `CONSULT_PRODUCTION_ALLOW`, `CONSULT_V2`, `CONSULT_CAPABILITY_LEVEL`, 16 `CONSULT_UNWIND_*`… đặt ≈02/11 (trước deploy ⇒ có hiệu lực); không có `SUBSCRIPTIONS_ENABLED`, `DEEP_RESEARCH_*`, `RESEARCH_*`, `AI_COST_GATE`, `TAPPY_AGENT`. `/api/config` công khai: `subscriptions:false`. Cấu hình dự định: `docs/cost/PRODUCTION-FLAGS-ONE-BRAIN.md` (`CONSULT_ONE_BRAIN=1`, `CONSULT_CAPABILITY_LEVEL=2`, mọi `UNWIND=1`); log 02/11 do phiên trước ghi (GHI, chưa tự kiểm): `tappyai_chat_mode`, `tappyai_one_brain_turn`.
- **CHƯA XÁC MINH:** giá trị cờ hiện tại (xem mục 10.1); mô-đun cũ nào còn chạy dưới cờ production; lượt clip.

### 6B.3 R13 so với mã (chương 0–4.2 em đã đọc kỹ; chương 5–25 chỉ dựa bảng đối chiếu 10/11 `docs/architecture/R13-DOI-CHIEU-SAU-LAT-20261110.md`)
- R13: luồng thường do Luna dẫn (General/Consultative/Current) sau Safety → Pre-Router (**chỉ gợi ý**) → Context Resolver → Market/Capability Gate → Server Request Admission; **Nghiên cứu sâu** riêng: Research Admission → Haiku (Standard) / Sonnet lập kế hoạch + tổng hợp, Haiku làm gói việc (Advanced), Research Controller xác định, Verifier độc lập, **không gọi Luna**.
- Mã: không có kiểu "ProcessingStream" hay "Server Request Admission" cho luồng thường (tên luồng chỉ xuất hiện ở `attachments/policy.ts`, `context/canonicalContext*`); nghiên cứu sâu **mặc định vẫn dùng Luna** (`deepResearchDeps.ts` nhắc Luna 9, Haiku 15, Sonnet 4; bản ghi đóng băng 03/11: "người viết mặc định là Luna"); các mảnh R13 nối sau cờ riêng (`CANONICAL_CONTEXT`, `MARKET_GATE`, `SAFETY_EMERGENCY`, `ATTACHMENT_ONLY_POLICY`, `RESEARCH_ADMISSION/ADVANCED/THESIS_REPORT`); nhiều chương R13 là "HÀM" (có mã + test, chưa nối); **R13 không định nghĩa hợp đồng trình bày có kiểu** (chỉ nhắc "Output Safety & Response Contract → Concierge Cards").
- R13 tự ghi "Design Freeze NOT APPROVED / implementation NOT AUTHORIZED"; Owner cho phép bằng lời 10/11.

### 6B.4 Hai bẫy khi gỡ mã (đã thấy trong mã)
1. **`read_page` nằm trong thư mục agent.** Bộ đọc trang an toàn mà One Brain dùng (và đường dùng Parallel khi đọc trang) ở `src/lib/ai/agent/runtime/readPage.ts` (dùng `parallelClient`); `research/deepResearchDeps.ts` cũng dùng `parallelClient`. Xóa nguyên thư mục agent làm One Brain mất `read_page`. **Phải chuyển phần dùng chung ra trước.** Tệp ngoài `agent/` đang import nó: `answerV4/flag.ts`, `answerV4/hostedResearch.ts`, `consultative/chatSessionState.ts`, `consultative/proseRanking.ts`, `consultative/researchLoop.ts`, `consultV3Flag.ts`, `llm/ai.ts`, `llm/providers/openai.ts`, `llm/types.ts`.
2. **Bộ luật cũ là đường lùi của production.** `docs/cost/PRODUCTION-FLAGS-ONE-BRAIN.md` mục 5: muốn lùi thì gỡ `CONSULT_ONE_BRAIN` khỏi `CONSULT_PRODUCTION_ALLOW` rồi deploy lại ⇒ chạy đường cũ. Xóa bộ luật cũ = mất đường lùi này. Owner phải chọn trước khi xóa: giữ làm đường lùi, hay lùi bằng promote bản deploy trước trên Vercel.
3. (Phụ) Nếu có ngày tắt One Brain, phần R13 đã thêm vào `route.ts` sẽ chạy trên đường cũ; **chưa kiểm R13 trên đường đó**.

### 6B.5 KẾ HOẠCH (chỉ bước 1 được phép, và chỉ khi Owner cho phép; 2–4 cần Owner duyệt từng bước)
1. **ĐO (không đổi mã sản phẩm):** (a) coverage của bộ test dưới đúng cờ production/UAT (bộ cờ UAT: `D:\TappyAI-review-artifacts\consultative-wave3\measure30\flags-uat.json`; launcher `uat-localhost.cjs`) để biết mô-đun trong `src/lib/ai/consultative/` (98 tệp) và `src/lib/ai/agent/` nào KHÔNG bao giờ chạy; **chưa kiểm repo đã có cấu hình coverage chưa** (xem `vitest.config`/`package.json` trước); không gọi dịch vụ trả phí. (b) Xác định lượt clip (`clipRef`, nút "Hỏi Tappy về chỗ này" của Explore) chạy đường nào. (c) Ghi **bộ chuẩn**: các ca Owner đang thắng (bộ đo 30 ca ở `D:\TappyAI-review-artifacts\consultative-wave3\measure30\`, sổ `LEDGER.json`; 38 ca tự UAT `docs/uat/UAT-TU-KIEM-38-CAU-20261112.md`; 20 ca UAT phiên này `uat20-cases.json` + `runs\UAT20-20261112\results.json`) kèm vết gọi công cụ đã ghi. (d) Báo Owner bằng thẻ tóm tắt: mô-đun chết, mô-đun còn sống, rủi ro.
2. **Cách ly (cần duyệt):** đặt mô-đun chết vào chỗ không tới được + bộ đếm báo nếu chạy.
3. **Xóa (cần duyệt):** chỉ khi bộ đếm không có lượt nào, so lại bộ chuẩn không tệ hơn (đo mù) và Owner duyệt. Mỗi lát một commit, **đặt tag sao lưu trước**. Cập nhật `architectureFreeze.test.ts` có ngày; **không sửa test cho qua**.
4. **Khái niệm R13** (Processing Stream/Admission cho luồng thường; nghiên cứu sâu sang Claude mặc định) chỉ sau UAT chấm mù với trần chi phí Owner duyệt.

### 6B.6 Sáu điểm Owner CHƯA chốt (D1–D6) — em đã khuyến nghị, Owner CHƯA quyết
| # | Câu hỏi | Khuyến nghị |
|---|---|---|
| D1 | Nền: One Brain + nối R13 từng lát, hay dựng lại theo R13 | One Brain làm nền (đang sống, đã đo; R13 cũng lấy Luna làm bộ não luồng thường) |
| D2 | R13 có Pre-Router xác định (chỉ gợi ý); One Brain (28/10, Owner) bỏ router ý định | Không router ý định; mã chỉ làm phần xác định (an toàn, ngữ cảnh/địa danh, thị trường, duyệt nghiên cứu) |
| D3 | Gỡ bộ luật cũ | Theo lát, chỉ sau khi đo (6B.5) |
| D4 | Agent runtime | Tách phần dùng chung rồi xóa vòng agent |
| D5 | Nghiên cứu sâu mặc định Luna hay Claude | Chuyển sang Claude **chỉ sau** UAT chấm mù (cần trần chi phí; Owner chưa UAT Standard/Advanced) |
| D6 | Hợp đồng trình bày có kiểu (R13 không yêu cầu) | Có (lát 1 đã làm, mục 2) — nhưng là việc ngoài R13, cần Owner duyệt riêng cho các lát sau |

### 6B.7 Cấm riêng cho phần hợp nhất
Không xóa/gộp/cách ly mã khi Owner chưa duyệt; không vá thêm vào hàm `POST` trong lúc chờ; không sửa `architectureFreeze.test.ts` cho qua; không nói "production chạy X" khi chưa có giá trị cờ thật; không giải mã biến Vercel; không đổi mặc định người viết nghiên cứu sâu (Luna → Claude) trước khi Owner UAT chấm mù.

## 6C. Các mảng khác Owner hỏi cuối ngày: bảo mật, Inbox Messenger, nén clip Explore (kiểm 12/11 tối bằng git/mã/bộ nhớ; KHÔNG gọi production/Supabase, KHÔNG sửa gì)

Nhãn: **ĐO** = em chạy lệnh đọc thấy trực tiếp (git/mã/Vercel) · **GHI** = có trong bộ nhớ/tài liệu của phiên trước, em chưa tự kiểm lại · **CHƯA** = chưa kiểm. `origin/main` = `33cef8b` (04/11) = đúng mã đang chạy ở production (khớp bản deploy 04/11).

### 6C.1 Bảo mật
- **Đã lên production (ĐO: nằm trong `origin/main`):** đợt 1–2 và phần lớn đợt 3–5 của bản kiểm toán 04/11 (4 báo cáo + đề xuất ở `D:\TappyAI-review-artifacts\security-20261103\`: `DE-XUAT-BAO-MAT-20261104.md`, `web-server.md`, `data-infra.md`, `android.md`, `ios.md`). Gồm: W-01 nghiên cứu sâu luôn tính hạn mức (kể cả khi cờ gói tắt); W-02/W-03 gom IPv6 theo /64, quét/dịch có trần body + trần toàn cục; D-09 trần nghiên cứu sâu toàn cục; W-06 cảnh báo khi không có kho giới hạn dùng chung; W-07 **lỗi tiêm thuộc tính thật** trong `formatMessage` (đã vá, 81 test tấn công); W-08/W-11 bỏ `freeDailyLimit` khỏi `/api/config`, bỏ `X-Powered-By`; W-09 không để `_tappy_*` ra trình duyệt; W-05 CSP `script-src-attr 'none'` + CSP Report-Only; W-13 Stripe ghi trạng thái hiện tại; D-01/D-02/D-10 CI (quyền chỉ-đọc, ghim action theo SHA, Dependabot, CODEOWNERS, sổ tay xoay khóa); D-03..D-05 kiểm DB production + thu hồi quyền `anon`/PUBLIC của hàm (có rollback SQL); A-01/A-02/A-04/A-07 Android; I-01/I-02/I-04/I-06..I-08 iOS. Ngoài mã (GHI): Cloudflare rate-limit "TappyAI flood shield" (>30 req/10 s/IP chặn 10 s trên `/api/auth/anonymous` và `/api/chat`), GitHub secret scanning + push protection + Dependabot BẬT, branch protection = 4 check + enforce_admins; Owner tự giới hạn khóa Firebase Android; quét lịch sử 4,18M dòng: không có secret thật.
- **Số liệu (ĐO):** 46 phát hiện; **32 có commit nêu tên trên `origin/main` kể từ 03/11; 14 không có commit nào nêu tên** (nghĩa là chưa thấy commit, chưa chắc chưa làm): **A-03** (không ghim chứng chỉ Android, Trung bình), **I-03** (không ghim chứng chỉ iOS, Trung bình), **D-06** (CSP còn `unsafe-inline`, Trung bình), **D-07** (không có giới hạn kích thước body tập trung, Trung bình), và mức Thấp/Thông tin: A-05, A-06 (Play Integrity), A-08, A-09, D-11, D-13, I-05, I-09, I-10 (App Attest), W-14 (cổng tuổi khách tự khai, có chủ đích).
- **Hoãn có chủ đích sang PHASE 9 (GHI, `memory/project_phase9_backlog_2026-11-04.md`; khi bắt đầu Phase 9 phải NHẮC Huy làm luôn):** (1) nâng Next 16/ai 7/zod 4 từng bước, đo chất lượng sau mỗi bước (12 lỗ `npm audit` còn lại = W-04); (2) bỏ `unsafe-inline` bằng nonce (D-06; mất lưu đệm tĩnh `/chat`, `/deals`, `/reviews`); (3) Play Integrity + App Attest (A-06/I-10); (4) chặn Tappy khai tên công cụ (cần đổi prompt, hiện cấm vá từng trường hợp); (5) ba mục chưa xác minh: FCM Android sau khi giới hạn khóa Firebase, iOS I-04 (chỉ thử trên iPhone thật), thu hồi quyền ghi `anon` ở mức bảng (thử trên dự án TEST `zdaprdfgpbpnxyofagmc`). **Turnstile: Owner ĐÃ DỪNG có chủ đích** (app native không chạy được; không nối widget).
- **Trên nhánh web R13 (`feat/brain-r13-p1`)**, sau cờ TẮT và khóa production: cổng chi phí bền (`AI_COST_GATE`), kiểm byte/kích thước ảnh đính kèm (`ATTACHMENT_BYTE_CHECK`), cổng thị trường, an toàn khẩn cấp: **chưa lên production**.
- **CHƯA kiểm hôm nay:** không đọc trạng thái production/Supabase thật; không chạy lại bộ kiểm F12/quét công khai. Việc tiếp theo nếu Owner muốn: làm D-06/D-07/ghim chứng chỉ, hoặc rà lại 14 mục trên.

### 6C.2 Inbox Messenger
- **Web: ĐÃ LÊN PRODUCTION (ĐO).** `origin/main` có `src/app/api/messaging/*` (threads, messages, media, read, unread, report), `src/components/messaging/*` (ThreadList, ThreadView, NewMessageSheet, MessagePhoto, MessagesProvider…) và migration đến `20261110` (`chat_messaging_phase1`, `chat_messages_client_id`, `user_reports_message_target`, `chat_media`, `chat_media_retention`). PR #308–#311 (GHI): độ cứng, giờ/tên, báo cáo tin, gửi ảnh, quét ảnh OpenAI, hết hạn 30 ngày (số này do em chọn, không phải số chính thức của Zalo), huy hiệu chưa đọc toàn cục.
- **Android #312 và iOS #313: ĐÃ GỘP vào `main` (ĐO: các nhánh `feat/messenger-web-hardening`, `-images`, `-followups`, `feat/android-messenger-parity`, `feat/ios-messenger-parity` đều là tổ tiên của `origin/main`), nhưng KHÔNG phát hành bản app nào** (Owner: app chưa cần deploy; không build TestFlight khi Apple đang duyệt build 179). Android/iOS **chưa chạy máy thật/giả lập** (GHI). Nhánh `origin/feat/messenger-web` (PR #308 đầu tiên) tip **không** là tổ tiên của `main`: mã vẫn có trên `main` nhưng **chưa biết lý do** (CHƯA kiểm).
- **Chưa xác minh (GHI/CHƯA):** gửi ảnh thật + quét ảnh trên production (khóa local thiếu scope `model.request`; Owner nói khóa production đủ quyền, chưa thấy chạy thật; **không tạo tài khoản thử trên production**, nhờ Owner tự gửi 1 ảnh); cờ thông báo tin nhắn `MESSAGE_NOTIFICATIONS_ENABLED` vẫn TẮT (không thấy trong danh sách biến Vercel); **clip trong Messenger chưa làm (hoãn)**.
- **5 việc còn lại Owner dặn nhắc (GHI, `memory/project_messenger_remaining_5_2026-11-05.md`; đã hẹn nhắc 9h 05/11, nếu chưa làm thì nhắc):** (1) quyết xử lý khi quét ảnh lỗi: giữ chặn (503) / cho gửi / tắt hẳn `CHAT_IMAGE_SCAN_ENABLED=false`; (2) kiểm thật trên production; (3) thử trên điện thoại; (4) phát hành app (không build TestFlight khi Apple đang duyệt 179); (5) clip.

### 6C.3 Nén clip trong Explore (khi user đăng clip)
- **Production hiện tại KHÔNG nén/transcode gì (ĐO):** `src/app/api/reviews/route.ts` ghi rõ máy chủ không giải mã file ("a transcoding pipeline … far more machinery than this rule is worth"); clip lưu nguyên, giới hạn **150 MB và 300 s (chấp nhận 305 s)** (`/api/config`, iOS `CreateReviewModels.swift`). Android chỉ mã hóa lại ảnh >5 MB/HEIC/GIF, không đụng clip.
- **Cơ chế mới ĐÃ CODE XONG nhưng CHƯA gộp, CHƯA deploy (ĐO):** nhánh web **`feat/explore-video-p1`** trong cùng repo (không phải `feat/brain-r13-p1`): 2 commit trên `33cef8b` (`6cc96e7` 198 tệp, +17.911/−44; `e0c5dce` token gcloud cục bộ cho UAT), **chưa push/PR/merge**, mọi cờ TẮT mặc định. Luồng: tải lên **kho nguồn riêng** → máy chủ tự đọc header MP4 (`mp4Info.ts`: kích thước hiển thị, thời lượng, có âm thanh; không tin lời khai của client) → **Google Transcoder** (`transcodeConfig.ts`): thang **HLS cạnh ngắn 720/480/360**, không bao giờ lớn hơn nguồn, giữ tỷ lệ, H.264, bitrate 2,5/1,1/0,6 Mbps, AAC 128 kbps, **tối đa 30 fps** (nguồn 60 fps bị giảm; chưa đọc fps nguồn), kèm sprite 6 khung (kiểm duyệt hình) và `audio.mp4` (chuyển lời nói thành chữ) → kiểm duyệt **hình + lời nói** (OpenAI; AI chỉ tự duyệt khi chắc) → chữ overlay **tĩnh** → xuất bản (cờ đồng ý AI bắt buộc để đăng) → tải **MP4 có watermark** (logo, @username, "Explore on TappyAI"). Cờ: `EXPLORE_VIDEO_PIPELINE_ENABLED`, `VIDEO_SPEECH_TRANSCRIBE_ENABLED`, `VIDEO_MODERATION_AUTO_REJECT_ENABLED` (đều `=== 'true'`, mặc định tắt). Cơ sở dữ liệu: 7 migration `20261111…20261117` (`video_assets`, `video_asset_cleanup`, `video_transcode`, `video_moderation`, `video_overlays`, `video_publish_delivery`, `video_clip_consent`), mỗi bản có rollback; **không có trên `origin/main`**.
- **KHÔNG có nén phía thiết bị trong cơ chế mới (ĐO: diff Android/iOS không có Transformer/MediaCodec/AVAssetExportSession/bitrate, chỉ có HLS).** Giới hạn đầu vào vẫn là luật chung 150 MB/5 phút.
- **Mobile:** Android `feat/android-explore-video` (1 commit `51d567c`, **chưa push**, chưa chạy máy, thêm phát HLS media3); iOS `ios/explore-video` (2 commit, tip `e2744f8`, **đã push**, CI xanh theo GHI, chưa PR). **Chưa gọi route mới**: clip cũ vẫn đi đường cũ; iOS upload hiện nạp cả file vào RAM.
- **Kiểm thử/hạ tầng (GHI, chưa kiểm lại):** UAT thật 13/13 (GCS + Transcoder + Supabase TEST) ngày 10/11, 7 migration mới chạy trên Supabase TEST, **chưa production**; **CHƯA kiểm:** kiểm duyệt OpenAI trực tiếp (khóa local không quyết định được ⇒ duyệt tay), CDN/cookie thật, giao diện trình duyệt/thiết bị, bộ đọc MP4 với clip thật iPhone/Android (HEVC, MOV, xoay: mới thử clip tổng hợp).
- **Việc còn thiếu trước khi bật (GHI, `docs/handoff/EXPLORE-VIDEO-CHECKLIST-BAT-TINH-NANG-20261105.md` trong cây `g1-growth`, chưa commit):** hạ tầng Google Cloud (bucket nguồn PRIVATE, tài khoản dịch vụ riêng cho Transcoder, quyền cho service agent, CORS; project production `aerobic-lock-498409-u7`, **chưa làm**); biến Vercel (`GCS_VIDEO_SOURCE_BUCKET`, `GCP_TRANSCODER_SERVICE_ACCOUNT`, không có mặc định); CDN + signed cookie cho HLS (đã spike chạy tốt: vô hiệu cache ~6 s, xoay khóa ~190 s) + bucket phát + host mới trong CSP; HLS player web; cổng đồng ý (bản nháp thông báo vào `legal.ts`, đồng bộ phiên bản đồng ý iOS/Android); **CSAM: quy trình khẩn + đường báo cáo, tính năng phải giữ TẮT cho tới khi có** ("luật cần gì mình làm đó", chưa có đầu mối pháp lý).
- **Quyết định Owner (GHI):** 10/11 "CHƯA DEPLOY — đợi xong hết rồi deploy WEB TRƯỚC"; STT = OpenAI nhưng **mọi chức năng video/STT TẮT, chỉ bật khi Owner nói**; clip tối đa 5 phút khi upload; KHÔNG tạo project/billing mới; spike chỉ dùng bucket/service account riêng đặt tên spike, **không đụng `tappyai-media-prod`/`-uat`**; mỗi lần bật API/gọi dịch vụ tính phí phải hỏi lại. ADR: `ADR-EXPLORE-VIDEO-SUA-DOI-20261104.md`, `…-LAN2-20261105.md`, `AUDIT-EXPLORE-VIDEO-PHASE-A-20261104.md`, `EXPLORE-VIDEO-API-CONTRACT-20261105.md` (đều trong `g1-growth/docs/handoff`, chưa commit).
- **Rủi ro khi gộp (SUY):** `feat/explore-video-p1` tách từ `33cef8b` nên **không có R13** của `feat/brain-r13-p1`; khi gộp có thể xung đột ở `vercel.json` (thêm cron), `supabase/MIGRATION_ORDER.txt`, `scripts/release/apply-migration.sh`, sổ chi phí route (`lib/security/costRoutes/registry.ts`). Owner (12/11) dặn "chỉ một nhánh cho web": nhánh Explore video là ngoại lệ có từ trước (10/11), **cần Owner quyết cách gộp**; phiên mới KHÔNG tự checkout/merge/rebase nhánh này.

## 7. Giả thuyết đã bị bác bỏ phiên này

- "Ba kiến trúc hỗ trợ nhau" → sai: là phương án thay thế loại trừ nhau, chỉ chia sẻ phần đuôi.
- "Agoda không hiện vì khóa/API lỗi" → sai: do thiếu ngày (thiết kế) và do tên địa điểm khớp tuyệt đối.
- "Nút Mẹo mất vì dữ liệu" → sai: lỗi thứ tự effect cha/con.
- "Bố cục workspace bật cờ = đã giống mockup" (em từng nói "đã nối") → sai: cờ bật, giao diện **không** giống.
- "Hai lỗi vitest cuối là hồi quy" → chưa có bằng chứng; quá giờ, chạy riêng đạt.
- Lỗi tiền sử vẫn đúng: "Lỗi `/chat` 500 do thiếu cờ" là sai (nguyên nhân là `node:crypto` lọt bundle trình duyệt).

## 8. Việc tiếp theo, ĐÚNG THỨ TỰ (không làm gì ở mục B–D khi Owner chưa cho phép)

**A. Kiểm trạng thái (luôn làm trước, chỉ đọc).** Xác nhận `git -C D:\TappyAI-wt\wt-integration status --short` chỉ có `?? docs/handoff/`, `git log --oneline -1` là `4762c58`, nhánh `feat/brain-r13-p1`. Kiểm máy chủ UAT cổng 3000 (xem mục 9). **Đừng chạy `next dev` thứ hai trên cùng thư mục.**

**B. Giống mockup (Owner đang chờ trả lời "bắt đầu lát 1 ngay chứ?").** Làm theo lát, mỗi lát kết thúc bằng ảnh Tappy cạnh mockup ở 1600×1000 và chỉ nói "khớp" khi nhìn giống:
 1. Khung ngoài: font (Plus Jakarta Sans / Newsreader / JetBrains Mono, qua `next/font`), product header (menu, PRO, chuông, avatar từ dữ liệu thật), rail, bong bóng câu hỏi có giờ + ✓✓, ô nhập. Cờ mới nếu cần, TẮT mặc định.
 2. Khối trong câu trả lời: tiêu đề mục, hộp bảng, callout (sky), thẻ chân dung (chỉ dữ liệu thật).
 3. Thẻ quán rộng (ảnh trái, chi tiết phải) dưới từng quán.
 4. Lịch trình, dossier, trang dự án.
 Công cụ: trang thử `/dev/v206` + Edge CDP (xem mục 9). Mockup mở trực tiếp `file:///D:/redesign/TappyAI_Web_Mockups_v206.html` trong Edge không đầu (script chạy), gọi `testScenario('scenario-N')`; `scenario-6` cần tạo nút ẩn `btn-toggle-entity-panel` và định nghĩa `toggleEntityPanel` rỗng rồi gọi `selectProject('p1')`.

**C. Agoda (chờ Owner chọn).** (a) chuẩn hóa tên địa điểm trong mã (tách đoạn theo dấu phẩy/gạch, tiền tố dài nhất trùng thành phố đã biết ở `locations.ts`), test viết trước, nhiều biến thể, không sửa lời dặn mô hình; (b) quyết định sản phẩm: khi không có ngày, dùng ngày mặc định (ghi rõ là giả định) hay hỏi lại ngày. Sau khi sửa: hỏi lại câu có ngày và kiểm log `tappyai_realtime`.

**D. Hợp nhất kiến trúc: chỉ làm bước ĐO nếu Owner cho phép** (coverage dưới cờ production/UAT, xác định lượt clip chạy đường nào, ghi bộ chuẩn). Không xóa/cách ly gì. Chi tiết đầy đủ ở **mục 6B của chính tệp này**.

**E. Các mảng khác (mục 6C), chỉ khi Owner chọn:** (i) rà 14 phát hiện bảo mật chưa có commit nêu tên, ưu tiên D-06, D-07 và ghim chứng chỉ; (ii) kế hoạch gộp nhánh `feat/explore-video-p1` với nhánh web R13 (chỉ lập kế hoạch/so sánh xung đột, chưa gộp); (iii) 5 việc Messenger còn lại là việc của Owner (quyết xử lý quét ảnh lỗi, kiểm thật trên production, thử điện thoại), phiên mới chỉ nhắc.

**Chưa lên lịch, chờ Owner:** hợp đồng trình bày lát 2–6 (`HOP-DONG-TRINH-BAY-V1.md` mục 5); sửa các lỗi mục 4 (2–7); UAT nghiên cứu sâu Standard/Advanced (Owner tự UAT); push/PR/deploy (chưa được phép).

## 9. Môi trường và lệnh kiểm tra

- Cây: `D:\TappyAI-wt\wt-integration` (PowerShell và Bash đều dùng được). Sửa mã **chỉ bằng Edit/Write**; LF; không heredoc/`sed -i`/`python -c` cho mã.
- Máy chủ UAT cổng 3000: lúc soạn tài liệu **đang chạy** (đã bật lại và làm ấm) bằng `node D:\TappyAI-review-artifacts\consultative-wave3\measure30\uat-localhost.cjs` (cờ ở `flags-uat.json` cùng thư mục; khóa nạp từ `.env.local` của worktree, không in). Cờ `NEXT_PUBLIC_*` chỉ đọc lúc khởi động. Nếu hỏng `.next` (lỗi `vendor-chunks/posthog-js`): dừng server, xóa `D:\TappyAI-wt\wt-integration\.next`, chạy lại launcher, làm ấm `GET /`, `/chat`, `/api/config`, `POST /api/chat` body `{}` (400, không tốn tiền).
- Trang thử: `http://localhost:3000/dev/v206?s=1..6&bar=0` (chỉ dev, 404 production).
- Kiểm tĩnh: `cd D:\TappyAI-wt\wt-integration; npx tsc --noEmit -p .`
- Test có chọn lọc (không gọi API thật): `npx vitest run --project app src/lib/presentation src/lib/chat/placeAnchoring.test.ts src/components/chat src/lib/dev "src/app/(app)/dev"`. Toàn bộ: `npx vitest run --project app` **khi đã tắt server dev**, rồi `git checkout -- docs/audit`.
- Chụp ảnh: **Edge** `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` headless + CDP (`ui-run.mjs` trong `measure30` có mẫu: gõ vào ô chat thật, chờ trả lời, chụp). Chromium của Playwright (`chrome.exe`) **không khởi chạy được** (`spawn UNKNOWN`). Script `shot.mjs`/`shot2.mjs` nằm trong thư mục scratchpad tạm của phiên cũ, **sẽ mất**; viết lại theo mẫu của `ui-run.mjs`.
- **`ui-run.mjs` và `run-uat20.mjs` TỐN TIỀN** và tự bật máy chủ riêng (phải tắt máy chủ cổng 3000 trước); chỉ chạy khi Owner duyệt trần chi phí.

## 10. Rủi ro / việc phải kiểm trước khi sửa mã

1. **Giá trị cờ production CHƯA biết.** `vercel env pull` và `vercel api …decrypt=true` bị bộ phân loại quyền chặn (`Credential Materialization`); **đừng vòng**. Cần Huy xem `CONSULT_ONE_BRAIN`, `CONSULT_PRODUCTION_ALLOW` ở Vercel (Settings → Environment Variables → Production) hoặc tự thêm quy tắc quyền. `vercel` CLI đã đăng nhập (`huyphamsm-tappy`); lệnh chỉ-đọc (`ls`, `inspect`, `env ls` chỉ in tên) dùng được; log Vercel chỉ giữ ~1 giờ.
2. **Chưa chạy lại toàn bộ vitest** sau `8939154` và `4762c58`; hai test guard kiến trúc có thể quá 5000 ms khi chạy cả bộ. Chạy riêng trước khi kết luận hồi quy.
3. Lượt **clip** chạy đường nào: chưa lần ra.
4. Giao diện chưa kiểm ở ngôn ngữ khác `vi`, di động/máy tính bảng, hay người dùng đã đăng nhập.
5. Anonymous-session: mỗi lần mở `/chat` bằng trình duyệt mới sản phẩm gọi `/api/auth/anonymous` và **tạo người dùng ẩn danh thật** trên Supabase của `.env.local` (≈25+ phiên đã tạo trong lúc chụp ảnh đầu; sau đó đã bị giới hạn 429; trang thử đã chặn). Dùng **một** hồ sơ trình duyệt cho cả đợt chụp.
6. Cây `g1-growth` (`D:\Claude\Projects\TappyAI\.worktrees\g1-growth`, nhánh `feat/g1-growth`) có nhiều thay đổi chưa commit của việc khác: **đừng đụng, đừng commit từ đó**. Kho stash dùng chung có 23 mục có sẵn: không dùng `git stash`.
7. Hạn mức: tài khoản Claude của phiên này sắp hết hạn mức tuần; phiên mới dùng tài khoản khác. Bộ nhớ (`MEMORY.md`) dùng chung trên máy, đọc đầu trang.

## 11. Cờ liên quan (UAT bật; production KHÔNG bật)

`NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED=true`, `NEXT_PUBLIC_WORKSPACE_V206=1`, `NEXT_PUBLIC_RESPONSE_PRESENTATION=1`, `NEXT_PUBLIC_REPORT_LAYOUT=a`, `NEXT_PUBLIC_REPORT_SUMMARY_VIEW=1`; bộ não: `CONSULT_ONE_BRAIN=1`, `CONSULT_V2=1`, `CONSULT_CAPABILITY_LEVEL=2`, 15–16 `CONSULT_UNWIND_*=1`; R13: `RESEARCH_*` (ADMISSION, ADVANCED, THESIS_REPORT…), `ATTACHMENT_ONLY_POLICY`, `MARKET_GATE`, `SAFETY_EMERGENCY`, `HOTLINE_CLAIM_GUARD`, `CANONICAL_CONTEXT`, `TVI_CAPTURE`, `VEXERE_DIRECT_AFFILIATE`, `CCP_REALTIME_AGODA_LITE`. **`MCP_GATEWAY` không bật.** Mọi cờ mới bị khóa ở production trừ khi tên nằm trong `CONSULT_PRODUCTION_ALLOW`. Phiên này **không thêm cờ mới**.

## 12. Tuyệt đối không

Push/PR/deploy; áp migration; **bật bất kỳ cờ video/STT nào** (`EXPLORE_VIDEO_PIPELINE_ENABLED`, `VIDEO_SPEECH_TRANSCRIBE_ENABLED`, `VIDEO_MODERATION_AUTO_REJECT_ENABLED`) hoặc tạo/đổi hạ tầng Google Cloud/bucket/billing cho Explore video; checkout/merge/rebase các nhánh `feat/explore-video-p1`, `feat/android-explore-video`, `ios/explore-video`; sửa production, iOS, Android, PR #267, Merge Guard, 10 cây One Life; tạo nhánh/worktree; `git reset/checkout làm mất dữ liệu/stash/amend`; commit từ cây `g1-growth`; giải mã/in biến bí mật; chạy `next dev` thứ hai trên cùng thư mục; chạy lệnh tốn tiền không có trần Huy duyệt; nói "khớp mockup"/"PASS" khi chưa có bằng chứng; sửa test cho qua (đặc biệt `architectureFreeze.test.ts`); xóa/gộp mã kiến trúc khi chưa được duyệt; giao việc cho agent con.

## 13. PROMPT cho phiên mới (sao chép nguyên khối)

> Tiếp tục dự án TappyAI WEB (tiếng Việt: em/anh; mọi chữ Huy đọc viết tiếng Việt, báo cáo ngắn). Làm DUY NHẤT trong worktree `D:\TappyAI-wt\wt-integration`, nhánh `feat/brain-r13-p1`, HEAD kỳ vọng `4762c58`, chưa push. KHÔNG tạo nhánh/worktree mới, KHÔNG đụng iOS/Android/production, KHÔNG push/PR/deploy/migration, KHÔNG đụng cây `D:\Claude\Projects\TappyAI\.worktrees\g1-growth` và 10 cây One Life. Sửa mã chỉ bằng Edit/Write (không heredoc/sed -i/python -c cho mã), LF, test viết trước và kiểm đột biến cho test bảo vệ quy tắc. Tự làm, không giao agent con. KHÔNG giải mã/in biến bí mật Vercel (bộ phân loại sẽ chặn; đừng vòng). KHÔNG chạy `next dev` thứ hai trên cùng thư mục. KHÔNG chạy lệnh tốn tiền (`ui-run.mjs`, `run-uat20.mjs`, bất kỳ gọi mô hình/Serper) khi Huy chưa duyệt trần chi phí. Owner đã ra lệnh TẠM DỪNG triển khai tính năng mới: chưa làm việc mới nào cho tới khi Huy chọn.
>
> ĐỌC THEO THỨ TỰ: (1) `docs/handoff/HANDOFF-20261112c-web-parity-agoda-contract-unify.md` (đọc hết); (2) `docs/handoff/HANDOFF-20261112-web-brain-uat-v206.md` (bàn giao trước, cùng ngày); (3) `docs/uat/V206-HARNESS-REPORT-20261112.md` và `docs/uat/V206-GAP-TABLE-20261112.md`; (4) `D:\TappyAI-review-artifacts\UAT20-UI-BAO-CAO-20261112.md` và xem ảnh `D:\TappyAI-review-artifacts\UAT20-UI\00-contact-sheet.png`; (5) `docs/architecture/AUDIT-KIEN-TRUC-20261112.md` và `HOP-DONG-TRINH-BAY-V1.md`; (6) `CLAUDE.md` của repo; (7) bộ nhớ `C:\Users\Admin\.claude\projects\D--Claude-Projects-TappyAI-tappyai-mvp\memory\MEMORY.md` (đầu trang) + `project_production_audit_2026-11-12.md` + `project_agoda_findings_2026-11-12.md`.
>
> BƯỚC 1 (chỉ đọc, làm trước): chạy `git -C D:\TappyAI-wt\wt-integration status --short` (kỳ vọng chỉ `?? docs/handoff/`), `git log --oneline -3` (kỳ vọng đầu là `4762c58`), `git branch --show-current` (`feat/brain-r13-p1`). Kiểm cổng 3000 (UAT localhost) có chạy không; nếu không, khởi động bằng `node D:\TappyAI-review-artifacts\consultative-wave3\measure30\uat-localhost.cjs` rồi làm ấm `GET /`, `/chat`, `/api/config`, `POST /api/chat` body `{}`. Chạy `npx tsc --noEmit -p .` (kỳ vọng sạch) và test có chọn lọc ở mục 9 của tệp bàn giao (không gọi API thật). Báo Huy trạng thái bằng một thẻ ngắn.
>
> BƯỚC 2: Hỏi Huy chọn việc, theo thứ tự đề nghị (KHÔNG tự làm): (B) bố cục giống mockup theo lát (lát 1: font, product header, rail, bong bóng câu hỏi, ô nhập), mỗi lát có ảnh Tappy cạnh mockup 1600×1000, chỉ nói "khớp" khi nhìn giống; (C) sửa Agoda (a: chuẩn hóa tên địa điểm trong mã; b: quyết ngày mặc định hay hỏi lại ngày); (E) các mảng khác ở mục 6C (bảo mật còn 14 mục chưa có commit; Messenger; nhánh Explore video chưa gộp): chỉ báo cáo/lập kế hoạch khi Huy chọn, không gộp/bật cờ/động hạ tầng; (D) hợp nhất kiến trúc: Owner đang TẠM DỪNG; chỉ làm bước ĐO nếu Huy cho phép, không xóa/cách ly gì (toàn bộ bối cảnh, bằng chứng, hai bẫy, kế hoạch và D1–D6 nằm ở mục 6B của tệp bàn giao, không cần đọc tệp nào khác).
>
> TIÊU CHÍ HOÀN THÀNH mỗi lát: test viết trước (đỏ rồi xanh), `tsc` sạch, test liên quan đạt, đột biến cho test bảo vệ quy tắc, ảnh trước/sau khi nói về giao diện, mọi thay đổi commit theo đường dẫn tường minh trên nhánh duy nhất (không push), cờ mới tắt mặc định và khóa production, báo cáo cuối bằng tiếng Việt nêu rõ điều đã/chưa xác minh. Không tuyên bố PASS nếu chưa có bằng chứng. Không mở rộng phạm vi, không bắt đầu lại dự án.
>
> CHƯA XÁC MINH, phải kiểm trước khi sửa: (1) giá trị cờ `CONSULT_ONE_BRAIN`/`CONSULT_PRODUCTION_ALLOW` trên production (nhờ Huy xem Vercel); (2) toàn bộ vitest sau `8939154` và `4762c58` (chạy khi tắt server dev; hai guard `businessDataBoundary`, `vendorCacheRule` hay quá 5000 ms, chạy riêng đạt); (3) lượt clip chạy đường nào; (4) giao diện ở ngôn ngữ khác `vi`, di động, người dùng đã đăng nhập; (5) lịch sử hội thoại của khách ẩn danh trống là thiết kế hay lỗi.
