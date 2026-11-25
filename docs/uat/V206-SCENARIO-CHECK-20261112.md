# Đối chiếu từng kịch bản mockup v206 với sản phẩm (12/11/2026)

Nguồn: `D:\redesign\TappyAI_Web_Mockups_v206.html` (đã mở và bấm từng kịch bản bằng `testScenario`, đọc DOM và chụp), ảnh trong `D:\redesign\screenshots\`, RFC-001, bảng `V206-GAP-TABLE-20261112.md`.
Nhãn: KHỚP = giống mockup với dữ liệu thật; KHÁC = có nhưng bố cục/kiểu chữ chưa giống; THIẾU-CẦN-DỮ-LIỆU = mockup có, sản phẩm không có dữ liệu thật tương ứng nên KHÔNG làm giả.
Cờ cần bật: `NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED`, `NEXT_PUBLIC_RESPONSE_PRESENTATION`, `NEXT_PUBLIC_WORKSPACE_V206` (đều đã bật ở bản UAT). Tắt cờ: giao diện cũ, không đổi.

Cách xem mockup: `scenario-6` ném lỗi `Cannot read properties of null (reading 'classList')` vì thiếu nút `btn-toggle-entity-panel` trong HTML; chỉ cần tạo nút ẩn đó và định nghĩa `toggleEntityPanel` rỗng rồi gọi `selectProject('p1')`.

## Những gì mockup làm khi bấm (đã bấm thật)

| Thao tác trong mockup | Kết quả |
|---|---|
| Bấm chip tên (Elon Musk, Sam Altman, JW Marriott Bãi Khem) hoặc tên trong thẻ hoặc nút "Xem hồ sơ Tappy" | `openEntityOverlay(key)`: ngăn "Hồ Sơ Thực Thể" 480 px trượt đè từ bên phải (nền mờ), đóng các ngăn khác. Nội dung: ảnh, thông số đối soát, tổng quan, "hệ sinh thái doanh nghiệp", dòng "Hồ sơ được đối soát...", nút Đóng và "Lưu thực thể". |
| Nút "Mẹo" trên tiêu đề (chỉ ở kịch bản 4) | Ngăn "Mẹo Bản Địa" 460 px, 5 mẹo có thẻ danh mục, ô tìm kiếm, lọc theo chủ đề, Esc đóng. |
| Nút Đã lưu ở rail | Ngăn "Đã lưu" 460 px. |
| Tab ngày trong lịch trình | Lọc theo ngày; tab "Dự toán" hiện bảng ngân sách. |
| Mục dự án trong sidebar (scenario 6) | `selectProject`: tiêu đề đổi thành tên dự án, ẩn nút Mẹo, khung chat thay bằng trang tổng quan dự án: tiêu đề + mục tiêu + ngân sách + trạng thái, danh sách hội thoại liên kết (xem hội thoại), "Hồ sơ nghiên cứu & dossier", địa điểm đã lưu, ghi chú ràng buộc. |
| Nút chia sẻ / lưu (bookmark) | Toast + cập nhật huy hiệu Đã lưu ở rail. |

## Kịch bản 1: "So sánh 2 cha nội Elon với Sam coi cha nào giỏi hơn"

| Thành phần | Mockup | Sản phẩm bây giờ | Kết luận |
|---|---|---|---|
| Tiêu đề hội thoại + huy hiệu | tên + "Evidence Verified" + thời gian | tên + thời gian + huy hiệu Đã ghim/Lưu trữ/Trong dự án (thật) | KHÁC; "Evidence Verified": THIẾU-CẦN-DỮ-LIỆU (cờ xác minh theo câu trả lời) |
| Bong bóng người dùng | xanh `#1D68FE`, giờ + ✓✓ | giống | KHỚP |
| Đoạn dẫn đầu | 16 px, trắng sáng | 17 px, trắng sáng | KHỚP (lệch 1 px, cố ý theo RFC) |
| Chip thực thể trong câu (icon + tên) | pill sky, biểu tượng 👤/⚡ | pill sky, biểu tượng 👤/🏢/📍/📦/📖 theo mô tả Wikipedia, chỉ cho tên Wikipedia xác nhận được | KHỚP (dữ liệu thật) |
| Bấm chip | ngăn phải 480 px | ngăn phải 440 px: ảnh, tên, mô tả một dòng, tóm tắt, "Nguồn: Wikipedia" + liên kết | KHỚP về bố cục; rộng 440 thay vì 480; không có thông số đối soát, hệ sinh thái, "Lưu thực thể" |
| Tiêu đề mục mono "1. SO SÁNH..." | mono, hoa, sky, số | mono, hoa, sky; số "1." tự thêm khi có từ 2 mục chưa đánh số (không đổi nội dung) | KHỚP |
| Thẻ chân dung từng người (ảnh vuông, năm sinh, tuổi, nguồn) | có, dữ liệu viết sẵn | không có thẻ này; đã có `EntityRow` (thẻ Wikipedia khi câu hỏi so sánh), chưa chỉnh kiểu | KHÁC; năm sinh/tuổi/nguồn: THIẾU-CẦN-DỮ-LIỆU có cấu trúc |
| Bảng so sánh | khung kính, hàng tiêu đề màu, cột đầu xám | hộp dữ liệu: viền, thanh tiêu đề (chỉ khi câu trước bảng là lời dẫn kết thúc bằng dấu hai chấm), hàng tiêu đề đậm | KHỚP; tiêu đề hộp không bịa |
| Callout kết luận | viền trái sky, "Kết luận đối soát từ TappyAI" | callout cam của câu trả lời (`>`), do mô hình viết | KHÁC về màu (cam, không phải sky) |
| Hàng nguồn dưới thẻ | "Nguồn: ..." viết sẵn | chân trang "Nguồn · N" (các liên kết thật của câu trả lời) | KHÁC |
| Thanh nhập | hộp kính, ghi chú Shift+Enter | thanh nhập hiện có | KHÁC (không đụng) |

## Kịch bản 2: "Tesla có phải do Elon sáng lập từ đầu không?"

| Thành phần | Mockup | Sản phẩm | Kết luận |
|---|---|---|---|
| Chip tên Elon Musk, Tesla | có | có cho tên Wikipedia xác nhận: "Elon Musk" 👤, "Tesla, Inc." 🏢. Từ "Tesla" trơn KHÔNG thành chip (trang vi.wikipedia "Tesla" là đơn vị từ trường, không mô tả ngắn: bị loại để không dẫn nhầm) | KHỚP có chủ ý |
| Mini-card sản phẩm (Tesla Model S, 3, Cybertruck) | thẻ nhỏ viết sẵn | không có | THIẾU-CẦN-DỮ-LIỆU (danh sách sản phẩm có cấu trúc: tên, mô tả, ảnh). Không vẽ thẻ khi câu trả lời không có |
| Dòng thời gian 2003/2004/2008 | danh sách | danh sách của câu trả lời | KHỚP |
| Callout 💡 | viền amber | callout cam | KHỚP |
| Hộp dữ liệu "DỮ LIỆU ĐỐI SOÁT: ..." + "Verifying Status: ACTIVE" + chú thích nguồn | có | hộp dữ liệu (thanh tiêu đề, hàng tiêu đề, bảng); KHÔNG có huy hiệu Verifying/ACTIVE; chú thích nguồn là đoạn "Nguồn đối soát:" của chính câu trả lời | KHỚP (trừ huy hiệu giả, cố ý bỏ) |

## Kịch bản 3: "Quán ăn tối cao cấp ở Thảo Điền"

| Thành phần | Mockup | Sản phẩm | Kết luận |
|---|---|---|---|
| Tiêu đề từng quán "01. LA VILLA ... — CỔ ĐIỂN..." mono | mono hoa | đúng khi mô hình viết `## 1. Tên` (mono hoa sky); số tự thêm khi chưa có | KHỚP |
| Thẻ địa điểm | rộng, nền kính, có ảnh, huy hiệu "Thực thể đã xác minh", đặc trưng nổi bật, giờ mở, nút đặt bàn ưu đãi, hotline, menu, video | thẻ kính tối nhiều cột (huy hiệu loại, sao, địa chỉ, giờ + trạng thái, nút Xem bản đồ, Bản đồ, Hotline, Lưu) từ `LivePlace` thật | KHÁC về kích thước và nội dung |
| "Thực thể đã xác minh" | có | không | THIẾU-CẦN-DỮ-LIỆU |
| "Đặc trưng nổi bật" (món tủ, không gian, mức giá), bãi xe, khoảng cách | có | mức giá chỉ khi nhà cung cấp trả về; còn lại không | THIẾU-CẦN-DỮ-LIỆU (adapter nhà hàng có cấu trúc) |
| Nút "Đặt bàn ưu đãi / Tặng welcome drink", mã GrabFood TAPPY20 | có | không | THIẾU-CẦN-DỮ-LIỆU (kho đối tác, điều khoản; ngoài phạm vi RFC mục 5) |
| Nút Menu & Báo giá, Chi tiết đối soát, clip TikTok/YouTube | có | không (YouTube/TikTok có ở thẻ cũ qua tìm kiếm) | THIẾU-CẦN-DỮ-LIỆU |
| Chip tên địa danh (Thảo Điền) | có | có khi Wikipedia xác nhận (📍) | KHỚP |

## Kịch bản 4: Lịch trình Đà Lạt 3N2Đ

| Thành phần | Mockup | Sản phẩm | Kết luận |
|---|---|---|---|
| Khung tổng quan (tiêu đề, chip ngày/điểm/người/ngân sách) | có | có (`TripTimeline`), chip chỉ từ kế hoạch | KHỚP |
| Nhãn nguồn gốc Yêu cầu/Đề xuất/Ước tính/Đối soát | có | không | THIẾU-CẦN-DỮ-LIỆU (trường `provenance`) |
| Tab ngày, đường dọc, nút số, chip giờ, ảnh chặng, giá | có | có | KHỚP |
| Callout mẹo cạnh chặng | có | có khi mẹo có `place` khớp | KHỚP |
| Nút Mẹo + ngăn Mẹo Bản Địa 460 | 5 mẹo "chuyên gia TVI", danh mục | chỉ mẹo thật của câu trả lời; tìm kiếm từ 4 mẹo | KHỚP về bố cục; "chuyên gia TVI đã đối soát", danh mục: THIẾU-CẦN-DỮ-LIỆU |
| Thẻ khách sạn (tiện ích, loại phòng, giờ nhận/trả), vé tham quan | có | không | THIẾU-CẦN-DỮ-LIỆU |
| Dự toán 5 nhóm min/max, bình quân đầu người | có | bảng dự toán theo `cost_breakdown` | KHÁC; min/max, giả định: THIẾU-CẦN-DỮ-LIỆU |
| Thêm điểm dừng, Đổi điểm đến, Lưu vào dự án | có | không | THIẾU-CẦN-DỮ-LIỆU (API sửa kế hoạch) |
| Banner ĐỐI TÁC (giảm 10%) | có | không | THIẾU-CẦN-DỮ-LIỆU |

## Kịch bản 5: Dossier Phú Quốc (báo cáo nghiên cứu sâu)

Quy tắc cố định của chủ sản phẩm: trong chat chỉ còn THẺ TÓM TẮT (ý chính, ĐẾM nguồn, một nút; không PDF). Mockup hiện cả dossier trong chat; sản phẩm giữ thẻ và mở báo cáo đầy đủ ở ngăn lớn.

| Thành phần | Mockup | Sản phẩm (ngăn báo cáo) | Kết luận |
|---|---|---|---|
| Nhãn "DEEP_RESEARCH DOSSIER • EVIDENCE VERIFIED (3/3)" | huy hiệu mono | nhãn mono "DEEP_RESEARCH DOSSIER" (kèm hạng nghiên cứu nếu có); không có "EVIDENCE VERIFIED" | KHỚP một phần; "EVIDENCE VERIFIED": THIẾU-CẦN-DỮ-LIỆU |
| Tiêu đề lớn | có | có | KHỚP |
| Dòng "Biên soạn bởi Luna ... Đối soát quý 1/2026", "Gate Status: PASS" | có | "Biên soạn bởi TappyAI Deep Research · ngày"; KHÔNG có Luna, Gate PASS | KHỚP có chủ ý (bỏ hư cấu) |
| Mục "01. TÓM TẮT..." mono hoa | có | "01.", "02." mono hoa (số tự thêm cho mục cấp 2 chưa có số; mục "Nguồn" không đánh số) | KHỚP |
| Bảng đối soát trong khung | có | hộp dữ liệu kính tối | KHỚP |
| Chip thực thể trong chữ (JW Marriott) | có | có cho tên Wikipedia xác nhận, mở ngăn phải (Esc đóng ngăn trên cùng trước) | KHỚP |
| Ảnh bằng chứng viễn thám + nhãn "Luna Geospatial" | có | không | THIẾU-CẦN-DỮ-LIỆU (nhãn nguồn gốc ảnh) |
| Chú thích nguồn [1] [2] | có | chú thích nguồn thật, bấm nhảy tới nguồn | KHỚP |
| Mục lục dính, thanh công cụ | có | có (không PDF) | KHỚP |

## Kịch bản 6: Dự án Du lịch Phú Quốc 2026

| Thành phần | Mockup | Sản phẩm | Kết luận |
|---|---|---|---|
| Tiêu đề trang dự án (tile thư mục, "DỰ ÁN", tên) | có | có (`ProjectOverview`) | KHỚP |
| Mô tả | "Mục tiêu & quy mô" viết sẵn | mô tả thật của dự án; không có thì không vẽ | KHỚP |
| Ngân sách dự kiến, trạng thái thực thi | có | không | THIẾU-CẦN-DỮ-LIỆU (dự án chỉ có tên + mô tả) |
| Nút "+ Tạo Hội thoại Con" | có | không | THIẾU-CẦN-DỮ-LIỆU (tạo hội thoại có `project_id`) |
| Hội thoại liên kết dạng hàng (biểu tượng, tiêu đề, xem trước, thời gian, số tin) | có | có, từ hội thoại thật của dự án (bỏ hội thoại đã lưu trữ), bấm mở hội thoại | KHỚP |
| Trạng thái rỗng | không rõ | có (chữ sẵn của sản phẩm) | KHỚP |
| Hồ sơ nghiên cứu / dossier của dự án | có | không | THIẾU-CẦN-DỮ-LIỆU (liên kết báo cáo với dự án) |
| Địa điểm đã lưu trong dự án | có | không | THIẾU-CẦN-DỮ-LIỆU (lưu theo dự án) |
| Ghi chú & ràng buộc | có | không | THIẾU-CẦN-DỮ-LIỆU |

## Xác nhận bằng mắt (honest)

Xem được (ảnh chụp cửa sổ trình duyệt của ứng dụng, thu nhỏ vì khung chỉ rộng ~650 px: nhìn rõ bố cục, không rõ từng nét chữ):
- Sản phẩm (trang thử có dữ liệu giả nhưng chạy qua đúng các thành phần thật; đã xóa sau khi kiểm): kịch bản 1 tại 1586 (kể cả ngăn chip), 1366 (ngăn chip) và 834 (ngăn chip); kịch bản 2, 3, 4, 6 tại 1586; kịch bản 5 (báo cáo mở) tại 1586.
- Mockup: kịch bản 1 và 6 trực tiếp; kịch bản 2, 3, 5 qua đọc DOM/văn bản; ảnh gốc `tappy_1586px_s1_elon_sam_full_canvas.png`.
Chỉ đo bằng DOM, không xem ảnh: kịch bản 2 đến 6 tại 834 (không cuộn ngang: scrollWidth = clientWidth); kịch bản 2 đến 6 tại 1366.
KHÔNG xem được: ProjectOverview trong khung làm việc thật (cần đăng nhập và dữ liệu dự án; nối dây `HistorySidebar` -> `ChatWorkspaceShell` chỉ kiểm bằng test và kiểu); chip trong một lượt trả lời thật của mô hình (chỉ thấy qua trang thử); không có ảnh chụp mockup đặt cạnh sản phẩm cùng độ rộng ở 1366 và 834.

## Còn khác mockup (nói thẳng)

1. Thẻ chân dung từng nhân vật (kịch bản 1), mini-card sản phẩm (kịch bản 2): cần dữ liệu có cấu trúc.
2. Thẻ địa điểm không có khối "đặc trưng nổi bật", nút đặt bàn ưu đãi, menu: cần kho đối tác và adapter nhà hàng.
3. Ngăn hồ sơ rộng 440 px (mockup 480), không có thông số, hệ sinh thái, "Lưu thực thể".
4. Callout kết luận màu cam thay vì sky.
5. Trang dự án chỉ có tên, mô tả, danh sách hội thoại.
6. Chip chỉ xuất hiện khi Wikipedia có trang khớp tên VÀ có mô tả ngắn; tên trùng nghĩa khác (ví dụ "Mercury" công ty hay hành tinh) vẫn có thể dẫn tới trang cùng tên có mô tả nhưng khác nghĩa trong câu: rủi ro còn lại, đã giảm bằng điều kiện mô tả ngắn và so khớp tiêu đề.
