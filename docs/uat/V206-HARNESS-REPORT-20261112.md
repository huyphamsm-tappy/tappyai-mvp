# Báo cáo trang thử v206 (Dev Test Harness) — 12/11/2026

Nhánh `feat/brain-r13-p1`, cây `D:\TappyAI-wt\wt-integration`. Chưa push, chưa PR, chưa deploy. Không đụng app iOS/Android, production, mockup gốc, và phần xuất báo cáo (Markdown/Word/PDF).

## 1. Đã xây gì

Trang `/dev/v206?s=1..6` (thêm `&bar=0` để ẩn thanh chọn tab) vẽ **workspace thật** (rail, lịch sử, thanh tiêu đề, product header, trang dự án) và **chat thật** (`ChatConversation` → `ChatInterface`) từ dữ liệu mẫu cục bộ.

- Không sao chép HTML mockup, không có bộ component riêng cho ảnh chụp. Mỗi tab đi qua đúng luồng sản phẩm: `[TAPPY_MEDIA]`, `[TAPPY_PLAN]`, chú thích địa điểm (qua bộ nhớ trao tay của chính sản phẩm), báo cáo, trang dự án.
- **Dev-only có cổng thật:** trang trả 404 khi `NODE_ENV=production` (kể cả bản build của preview); một chỗ duy nhất quyết định; không tệp sản phẩm nào liên kết hoặc nhập nó (test quét mã nguồn). Đột biến (bỏ dòng chặn) → test đỏ.
- **Không gọi dịch vụ trả phí:** một lớp bọc `fetch` trả hồ sơ chip từ dữ liệu cố định và từ chối bằng 503 các đường chat, research, deep-research, tts, voice, video, và `/api/auth/anonymous` (xem mục 4).
- Sản phẩm chỉ đổi 4 tệp nhỏ để khung nhận kho hội thoại mẫu: `WorkspaceFrame` nhận `store`, kho có thể nêu `activeId` (mặc định vẫn đọc từ URL). Hành vi `/chat` không đổi.

Chạy: máy chủ UAT cổng 3000 (đang chạy) → mở `http://localhost:3000/dev/v206?s=4`.

## 2. Commit (trên nhánh duy nhất, đường dẫn tường minh)

| Commit | Nội dung |
|---|---|
| `edaff0d` | Sửa lỗi thật của sản phẩm: mở hội thoại đã lưu không hiện nút "Mẹo" (xem mục 4) |
| `6684085` | Trang thử `/dev/v206`, dữ liệu mẫu, lớp bọc fetch, khung `WorkspaceFrame`, test |
| `2c10f4e` | Bộ T01–T18 + biến thể + hợp đồng + cách ly (34 test đạt, 1 hạn chế đã biết, 5 todo) |
| commit kế | Sửa hydration của trang thử (một đồng hồ cho server và client) |

HEAD trước phiên này: `710b458`.

## 3. So sánh từng tab với mockup (1600 × 1000)

Ảnh ghép (trái mockup, phải sản phẩm) ở `D:\TappyAI-review-artifacts\v206-harness\` (`tabN-*.png`, kèm bản gốc từng bên `-mockup.png`, `-product.png`, và `state-*` cho ngăn chip/mẹo).

**Khung ứng dụng (chung cho cả 6 tab)**
- Ba cột: rail 120 / sidebar 400 / canvas còn lại. **Khớp** ở 1600 (product 120 / 400 / 1032; mockup 120 / 400 / ~1019). Product header cao 80 px: khớp.
- **Khác:** product header chỉ có logo + tên; mockup có nút menu, nhãn PRO, pill "Evidence Gate 6.0", chuông, avatar. Nhãn PRO/chuông/avatar xây được từ dữ liệu thật nhưng chưa làm (chờ chốt); pill Evidence Gate không có dữ liệu.
- **Khác:** rail của mockup: Trò chuyện, Khám phá, Đã lưu, Hộp thư, Tiện ích. Rail sản phẩm: Trang chủ, Chat, Khám phá, Đã lưu, Deal, Tôi (đích đến thật của sản phẩm).
- **Khác về kiểu chữ:** mockup dùng Plus Jakarta Sans (16 px), nhãn mono JetBrains Mono. Sản phẩm dùng **Inter** và `ui-monospace`; chưa nạp Plus Jakarta Sans / Newsreader / JetBrains Mono (không có trong mã nguồn). Đây là khác biệt thị giác rõ nhất sau thẻ địa điểm; cần anh duyệt vì thêm font là đổi toàn bộ nhận diện chữ.
- **Khác:** thanh tiêu đề: mockup có huy hiệu "Evidence Verified", biểu tượng lưu và chia sẻ, banner đối tác; sản phẩm có "Xuất .md" và "Đã lưu". Không có dữ liệu cho Evidence Verified và đối tác.

**Tab 1 Elon vs Sam.** Khớp: chip thực thể trong câu, tiêu đề mục mono có số, bảng dạng hộp dữ liệu có tiêu đề, callout kết luận. Khác: thẻ chân dung từng người (ảnh, năm sinh, tuổi, gạch đầu dòng thành tựu, nguồn) — sản phẩm chỉ có hai thẻ tên + tóm tắt (`EntityRow`); callout màu cam thay vì xanh trời; ngăn hồ sơ chip rộng 440 (mockup 480) chỉ có tóm tắt + nguồn Wikipedia, thiếu thông số đối soát, hệ sinh thái, "Lưu thực thể".

**Tab 2 Tesla.** Khớp: danh sách mốc, callout, bảng dữ liệu. Thiếu: lưới 3 ảnh, mini-card sản phẩm (cần ảnh và dữ liệu có cấu trúc), huy hiệu "Verifying Status: ACTIVE" (cố ý không làm giả).

**Tab 3 Thảo Điền.** **Khác về cấu trúc, không chỉ giao diện:** mockup đặt một thẻ rộng ngay dưới phần mô tả của từng quán (ảnh lớn, đặc trưng nổi bật, giá, giờ mở, nút chính, hotline, menu, video). Sản phẩm gom các thẻ thành một băng ngang nhỏ sau đoạn mở đầu, tách khỏi phần mô tả từng quán. Thiếu: ảnh quán, "đặc trưng nổi bật", bãi xe, nút đặt bàn ưu đãi, menu, clip review, "Thực thể đã xác minh" (cần adapter nhà hàng có cấu trúc và kho đối tác). Thẻ thứ ba của mockup (Cá Khói – Quy Nhơn) là minh họa wireframe, không đưa vào.

**Tab 4 Đà Lạt.** Khớp cấu trúc tốt nhất: khung tổng quan, tab ngày, đường dọc, nút số, chip giờ, callout mẹo cạnh chặng, tab Dự toán, ngăn Mẹo (5 mẹo, tìm kiếm, Esc đóng). Khác: không có ảnh từng chặng (cần `photo_url` từ máy chủ), nhãn nguồn gốc Yêu cầu/Đề xuất/Ước tính/Đối soát, thẻ khách sạn/vé, nút Thêm điểm dừng/Đổi điểm đến, banner đối tác.

**Tab 5 Deep Research.** Theo quy tắc anh đã chốt: trong chat chỉ có thẻ tóm tắt (ý chính, đếm nguồn, một nút), báo cáo đầy đủ mở ở ngăn lớn: bìa DEEP_RESEARCH DOSSIER, mục lục, mục "01." mono, bảng, chú thích. Mockup hiện nguyên dossier trong chat. Không có: "EVIDENCE VERIFIED (3/3)", "Gate PASS", "Luna Deep Intelligence" (cố ý bỏ), ảnh viễn thám có nhãn nguồn.

**Tab 6 Dự án Phú Quốc.** Đây là trang tổng quan dự án (không phải câu trả lời chat): tiêu đề, mô tả, số hội thoại, hai hội thoại liên kết bấm mở được. Thiếu so với mockup: mục tiêu có cấu trúc, ngân sách, trạng thái thực thi, nút "Tạo hội thoại con", hồ sơ dossier của dự án, địa điểm đã lưu, ghi chú ràng buộc. Cả bảy mục này cần dữ liệu dự án chưa tồn tại (dự án hiện chỉ có tên và mô tả).

## 4. Lỗi tìm thấy nhờ trang thử

1. **Lỗi thật của sản phẩm (đã sửa, `edaff0d`):** mở một hội thoại đã lưu có lịch trình thì **thanh tiêu đề không hiện nút "Mẹo"**. Nguyên nhân: `ChatInterface` xóa kho mẹo trong một effect khi vào hội thoại; effect của cha chạy sau effect của con nên xóa mất mẹo lịch trình vừa công bố. Test `tipsAfterOpen` đỏ trước khi sửa (0 mẹo thay vì 2), xanh sau. Test đơn vị trước đây không bắt được vì không ai dựng cả `ChatInterface`.
2. **Tác dụng phụ (đã chặn trong trang thử):** mỗi lần mở trang chat, sản phẩm gọi `/api/auth/anonymous` và **tạo người dùng ẩn danh thật trên Supabase**. Các lần chụp ảnh đầu của em (khoảng 25 lần tải trước khi chặn) đã tạo từng đó phiên ẩn danh (đến khi bị giới hạn 429). Đây không phải dịch vụ trả phí và không đụng tài khoản có sẵn, nhưng anh nên biết; nếu cần dọn, đó là các user `is_anonymous` mới tạo hôm nay trong dự án Supabase của `.env.local` (em chưa đọc hay xóa gì).
3. **Hydration (của trang thử, đã sửa):** mốc thời gian mẫu tính lúc nạp module nên server và client lệch ("57" so với "30 phút trước").
4. **Hạn chế đã biết, chưa sửa (cần quyết định thiết kế):** bộ nhớ trao tay thẻ địa điểm khóa theo **160 ký tự đầu của câu trả lời**. Hai hội thoại có câu trả lời mở đầu giống nhau trong cùng một tab sẽ dùng chung thẻ quán. Đã ghim bằng `it.fails` (đỏ khi được sửa).
5. Console: chỉ còn log HTTP 401 (khách: `/api/favorites`, `/api/preferences`) và 404 `/api/payments/me` (đường thanh toán đang tắt theo cờ). Không có ngoại lệ JavaScript.

## 5. Bộ T01–T18 trên dữ liệu mẫu (`adaptiveComposition.test.tsx`)

Chạy qua `ChatInterface` và `ProjectOverview` thật. **34 đạt, 1 hạn chế đã biết (it.fails), 5 todo.**

| Ca | Kết quả |
|---|---|
| T01 | đạt: thẻ chủ thể + bảng + callout, không lịch trình/thẻ quán/báo cáo |
| T03 | đạt: mốc thời gian + callout + bảng, không thẻ chủ thể |
| T05, T07, T13 | đạt: cùng thành phần thẻ, mỗi truy vấn có tên riêng, không lẫn tên của truy vấn kia |
| T08 | đạt: lịch trình 7 điểm, 5 tab, 5 mẹo công bố |
| T09 (phía hiển thị) | đạt: thay ngày 2, giữ nguyên ngày 1 và 3 |
| T10, T11 | đạt: thẻ báo cáo, đếm nguồn đúng; báo cáo thị trường AI Agent không lẫn nội dung resort |
| T12, T14, T16 | đạt: bảng so sánh / mục có tiêu đề / văn bản thường, không thẻ thừa |
| T15 | đạt phía hiển thị: thẻ quán và lịch trình cùng một câu trả lời |
| T17, T18 | đạt: trang dự án (không phải câu chat); hội thoại liên kết mở đúng bản ghi của nó |
| Biến thể | lịch 1/2/5 ngày, bảng 2/3/4 cột, báo cáo 1/3/5 nguồn, 3 câu ngắn, dự án 0/1/4 hội thoại: bố cục đi theo dữ liệu |
| Hợp đồng | JSON lịch trình hỏng, thẻ chủ thể có `javascript:`/host lạ, chú thích địa điểm rỗng: bỏ phần hỏng, không lộ marker, không vỡ cuộc trò chuyện |
| Cách ly (tầng hiển thị) | mẹo và ngăn của hội thoại A không sang B; thẻ quán trùng 160 ký tự đầu: xem mục 4.4 |

**Chưa kiểm được bằng dữ liệu mẫu (todo, cần mô hình thật):** T02 (chọn bố cục gọn cho câu so sánh hẹp), T04 (hiểu "ông ấy"), T06 (giữ ngân sách qua câu hỏi tiếp), T09 như một cuộc hội thoại (mô hình chỉ đổi ngày 2 và tính lại ngân sách), T15 (hiểu đủ hai ý). **Không được báo rằng AI đã hiểu đúng.** Bộ test ngữ cảnh có sẵn (`src/lib/context`, `src/lib/ai/consultative`: 163 tệp, 2889 test đạt) kiểm luật ở mức văn bản, không thay cho UAT mô hình thật.

## 6. Thành phần còn thiếu (danh sách để quyết định trước khi xây)

**Chưa tồn tại trong sản phẩm và cần quyết định kiến trúc:** sản phẩm **không có hợp đồng trình bày thích ứng có kiểu khối** như prompt mô tả (`AdaptivePresentation`, `blocks`). Hiện chỉ có văn bản + marker (`[TAPPY_MEDIA]` với bốn loại: news, entity, entities, options; `[TAPPY_PLAN]`) + chú thích địa điểm. Mọi thành phần trong mục "Cần dữ liệu" dưới đây cần một loại khối mới ở cả máy chủ lẫn giao diện. Em chưa xây gì trong số này.

1. Thẻ chân dung thực thể có cấu trúc (ảnh, năm sinh, thành tựu, nguồn) và ngăn hồ sơ có thông số, hệ sinh thái, lưu thực thể.
2. Thẻ địa điểm đầy đủ đặt dưới từng quán: ảnh, đặc trưng nổi bật, bãi xe, giá, giờ, nút theo loại hình (nhà hàng, khách sạn, spa, cửa hàng sửa chữa), menu, clip review.
3. Adapter khách sạn và vé tham quan; nhãn nguồn gốc từng thông tin của lịch trình; ngân sách có min/max và giả định; API sửa lịch trình.
4. Evidence Gate theo từng câu trả lời/mục báo cáo (đúng/sai, phiên bản); nhãn nguồn gốc ảnh.
5. Dữ liệu dự án: mục tiêu, ngân sách, trạng thái, dossier, địa điểm đã lưu, ghi chú ràng buộc, tạo hội thoại con.
6. Kho mẹo biên tập và kho đối tác (ngoài phạm vi RFC mục 5).
7. Nhận diện chữ: Plus Jakarta Sans, Newsreader, JetBrains Mono; header đủ PRO/chuông/avatar.

## 7. Kiểm tra cuối

Chạy sau commit `9732ac7`, máy chủ dev đã tắt:
- `npx tsc --noEmit -p .`: sạch.
- `npx vitest run --project app`: 26693 đạt, 2 lỗi, 8 expected fail, 94 bỏ qua, 6 todo. Hai lỗi là `scripts/architecture/businessDataBoundary.test.ts` và `vendorCacheRule.test.ts`, cả hai **quá 5000 ms** (hai guard quét cả kho mã, đã nằm trong danh sách test định giờ của bàn giao). Chạy riêng `scripts/architecture`: 46/46 đạt. Đây là suy luận về nguyên nhân (định giờ), được hỗ trợ bởi việc chạy riêng đạt, không phải chứng minh.
- `docs/audit` đã hoàn lại bằng `git checkout -- docs/audit`.
- Chưa xem lại bằng mắt sau commit hydration: chỉ đo console (6 dòng, đều HTTP 401/404, không ngoại lệ JS).
