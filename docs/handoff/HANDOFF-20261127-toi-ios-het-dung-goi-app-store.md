# BÀN GIAO TỐI 27/11/2026 — iOS: lỗi đứng app, gói App Store, 7 lỗi UAT

Người đọc: phiên Claude mới. Anh Huy là chủ sản phẩm, không phải dân lập trình. Nói tiếng Việt, ngắn, thật, nhãn **ĐÃ KIỂM / SUY LUẬN / CHƯA KIỂM**. Kỹ thuật là việc của Claude, chỉ hỏi quyền, tiền, gu sản phẩm, riêng tư, production.

Luật vẫn giữ (đã bị phạt vì quên): **không push khi một lần TestFlight đang chạy** (workflow `ios.yml` có `cancel-in-progress` cùng nhánh: push mới huỷ lần chạy cũ, đã mất 2 lần TestFlight vì vậy); chỉ sửa mã bằng Edit/Write (**cấm heredoc / `python -` để viết mã**, hệ thống sẽ chặn); đọc tệp trước khi Edit; không đụng production; không nhập mật khẩu hộ anh; không gửi duyệt App Store khi anh chưa nói "gửi".

## 1. Nhánh, bản dựng, CI

- Nhánh: `ios/layout-buoc5-20261126` (repo `D:\TappyAI-wt\wt-ios-messenger`), chứa đợt layout bước 1–5 + mọi sửa hôm nay. **Chưa merge** vào `ios/consolidated-20261122` (chờ anh UAT xong và đồng ý).
- Mã cuối: `4245cfc` (CI build 309 **xanh**). Đã bấm TestFlight lúc 14:2x giờ VN từ commit `6f35ff3` (= `4245cfc` + tệp bàn giao): **build 310**, run 46005299277, chạy trên GitHub nên tắt PC không ảnh hưởng. Kiểm: `gh run view 46005299277 --repo huyphamsm-tappy/tappyai-mvp --json status,conclusion,jobs`. Bước "Archive + upload" thành công = bản đã lên TestFlight (Apple xử lý thêm vài phút).
- Bản TestFlight trước đó: **build 306** (commit `1bcebf0`: danh sách chat dựng sẵn, cửa sổ 60 tin, màn Gói 5 gói, thông tin nhanh thực thể, thẻ lựa chọn…). **Build 310 thêm 7 lỗi UAT dưới đây.** Đừng đẩy commit chạm `ios/**` khi run 46005299277 còn `in_progress` (sẽ huỷ).
- Bước "Archive + upload" của `ios.yml` KHÔNG chờ test: chạy `workflow_dispatch` là tải bản lên TestFlight dù test hỏng. Vì vậy chỉ bấm khi CI của đúng commit đã xanh.

## 2. Lỗi đứng app — đã đi đến đâu

- **ĐÃ KIỂM:** danh sách chat dùng `LazyVStack`; bài thử trên GitHub (workflow `iOS freeze hunt`, tệp `.github/workflows/ios-freeze-hunt.yml`, bài `ios/TappyAIUITests/ChatFreezeUITests.swift`, máy chủ giả `ios/scripts/ui_stub_server.py` chế độ `chat: stream`) tái hiện được: với `LazyVStack` luồng vẽ kẹt >60 giây trong `LazyStack.measureEstimates`; với `VStack` dựng sẵn thì không kẹt. Chạy bài thử: đẩy commit có `[hunt]` trong lời nhắn (workflow_dispatch không gọi được vì tệp chưa ở nhánh mặc định).
- **Đã sửa:** `ChatMessageList` dùng `ChatRowsContainer` dựng sẵn (không lười), vẽ cửa sổ **60 tin gần nhất**, nút "Xem tin cũ hơn" thêm 60 (`ChatListMode.window`). Đã bỏ chuyển chế độ chọn chữ lúc câu kết thúc, bỏ `textSelection` ở đoạn/gạch đầu dòng/số, `ChatFlowLayout` đo chip một lần (có cache).
- **Công cụ chẩn đoán trong app:** màn Nâng cấp → kéo xuống cuối → "Copy Diagnostics": có dòng `main thread stalled` kèm `stall stack` (ngăn xếp luồng chính, SIGUSR2). Bộ canh chạy thêm 90 giây sau khi nhận xong.
- **CHƯA KIỂM trên iPhone:** build 306 anh đã cài nhưng chưa báo kết quả hết đứng chưa. Bài thử máy giả lập không xanh hoàn toàn vì phông chữ tải chậm (đợt chậm 8–12 giây tự hồi, ngăn xếp `libFontParser`) và một lỗi gõ chữ của bài thử.
- Hội thoại >60 tin: vẫn dựng sẵn cửa sổ 60, không quay về kiểu lười nữa (`eagerRows` luôn true trừ khi `-uitest-lazy-list`).

## 3. Gói App Store (IAP) — trạng thái

App Store Connect app id `6816654420`, nhóm đăng ký "TappyAI Subscriptions" (id 22502849). Gói cũ `com.tappyai.ios.pro.monthly` đã Approved, **không đụng**.

| Gói | Product ID | Loại | Giá VND đặt | Giá web |
|---|---|---|---|---|
| MoMo 7 ngày | `tappy_pip_1w` | Non-Renewing | 25.000 | 25.000 |
| Coco 1 tháng | `tappy_momo_1m` | Auto-Renewable | 225.000 | 225.000 |
| Coco 3 tháng | `tappy_coco_3m` | Auto-Renewable | 599.000 | 607.500 |
| Tappy 1 tháng | `tappy_promax_1m` | Auto-Renewable | 299.000 | 300.000 |
| Tappy 3 tháng | `tappy_promax_3m` | Auto-Renewable | 799.000 | 810.000 |

- Cả 5 đang "Prepare for Submission", bán 175 quốc gia.
- **Tên + mô tả hiển thị đã điền:** MoMo 7 ngày (Việt + Anh), Coco 1 tháng (chỉ Việt). **Chưa điền:** Coco 1 tháng (Anh), Coco 3 tháng, Tappy 1 tháng, Tappy 3 tháng (cả hai ngôn ngữ). Mẫu đã dùng: tên "MoMo 7 ngày" / mô tả "Gói dùng thử 7 ngày, mua một lần, không tự gia hạn"; gói tự gia hạn: "Gói 1 tháng, tự gia hạn hàng tháng" (3 tháng: "…mỗi 3 tháng"); tiếng Anh "Coco 1 month" / "1 month, renews monthly".
- **Chưa làm:** ảnh chụp màn hình duyệt (Review Information) cho từng gói, "Add for Review". Gói không tự gia hạn đầu tiên phải gửi cùng một phiên bản app mới.
- Mẹo thao tác ASC qua Chrome: hộp thoại chọn ngôn ngữ là `select` gốc, chỉ nhận khi **click vào rồi gõ tên ngôn ngữ + Enter**; ô nhập dùng `find` lấy `ref` (toạ độ đổi theo cỡ cửa sổ).
- Web: PR #349 (xác nhận Pip không tự gia hạn, ngày hết hạn = ngày mua + 7, một lần/tài khoản) và #351 (`/api/subscription` trả `pipUsed`) đã merge; anh nói đã deploy production (em không tự kiểm). App ẩn gói 7 ngày khi máy chủ không gửi `pipUsed=false`.
- Tên gói theo web: stored id `pip` = **MoMo** 7 ngày; `momo`/`coco` = **Coco**; `promax*` = **Tappy**; "Pip" là gói Free.

## 4. 7 lỗi anh báo tối nay (có PDF kèm)

| # | Lỗi | Trạng thái |
|---|---|---|
| 1 | Hồ sơ chỉ xem được từng clip | Đã sửa: tab Đã thích/Đã lưu/Đã chia sẻ (`MyPostsView.openCollection`) mở cả dãy clip, tải tối đa 20 clip quanh clip bấm. **Chưa làm:** Yêu thích ở `FavoritesView` (vẫn mở từng clip). |
| 2 | Liên kết đối tác là chữ xanh dài | Đã sửa: `PartnerLinks` (Model) tách 2 dòng "🔗 Liên kết đối tác" / "📎 Tham khảo thêm" ra khỏi chữ, `PartnerLinkTiles` (UI) vẽ ô; thứ tự Vexere → Agoda → Lazada → khác. |
| 3 | PDF kế hoạch không ảnh, bố cục xấu | Đã sửa: `TripPdfRenderer` mới (dải tiêu đề, ảnh 58pt cạnh từng điểm dừng có ảnh, chỗ ở, món ăn, bảng chi phí, mẹo, số trang), `PlanPdf.dataWithPictures` tải ảnh trước. **CHƯA xem PDF bằng mắt.** PDF nghiên cứu sâu (báo cáo) vẫn dùng bộ viết cũ, chưa có ảnh. |
| 4 | Nguồn hiện cả danh sách | Đã sửa: thẻ nghiên cứu chỉ hiện "Nguồn · N", bấm mới xổ. |
| 5 | Toyota: không ảnh/nguồn, 2 thẻ Shopee lạ | Một nửa: thẻ mua sắm không biết là sản phẩm gì (không config/specs/ảnh) không vẽ nữa. **Phần thiếu ảnh/nguồn là dữ liệu máy chủ** → việc của phiên web. |
| 6 | iPhone Duo: ảnh sai, không link mua | **Chưa sửa ở app.** Ảnh sai do mô hình nhúng markdown; link Lazada phải do máy chủ web gửi → giao phiên web (lọc ảnh theo sản phẩm, gắn link Lazada, luật "ưu tiên Lazada cho mua sắm"). |
| 7 | Đưa gói subscription lên App Store | Chưa làm (xem mục 3): phiên Chrome ASC **hết hạn, đang ở trang đăng nhập**. |

## 5. Anh Huy cần làm (ngày mai)

1. Đăng nhập lại App Store Connect trong Chrome (em không được nhập mật khẩu). Màn hình PC phải sáng: lúc máy khoá/tắt màn hình, Chrome không chụp được ảnh nên không điều khiển được.
2. Cập nhật TestFlight (build 309 nếu đã lên; không thì build 306) và thử: nhiều câu liền (xem còn đứng không); câu có thẻ quán; kế hoạch du lịch → tải PDF xem có ảnh/bố cục; câu có "Liên kết đối tác" (ô đối tác); nghiên cứu sâu (Nguồn · N); hồ sơ → Đã thích → vuốt qua nhiều clip; màn Gói. Nếu đứng: Copy Diagnostics ngay rồi dán.
3. Nói "gửi" nếu muốn em điền nốt tên/mô tả, chụp ảnh duyệt cho 5 gói và bấm Add for Review (gửi công khai cho Apple, 1–2 ngày duyệt). Quyết định dùng bản build nào.
4. Gửi phiên web (nội dung ở mục 4 dòng 5, 6): ảnh sai, thiếu link Lazada, Toyota không ảnh/nguồn, thẻ Shopee lạc đề.
5. UAT xong thì cho phép merge nhánh layout vào `ios/consolidated-20261122`.

## 6. Việc Claude chưa làm / nên làm tiếp

- Nếu CI 4245cfc xanh mà chưa có TestFlight → bấm TestFlight (mục 1). Nếu đỏ → đọc log (`gh run view <id> --log`, tìm `error:` / `Test Case … failed`), sửa, đẩy MỘT lần.
- Xem PDF kế hoạch trên máy thật; thêm ảnh cho PDF nghiên cứu sâu nếu anh muốn.
- Chạy lại `iOS freeze hunt` trên bản cuối (`[hunt]`) nếu anh báo còn đứng; nếu còn kẹt thì mở `stall stack` để xem hàm nào.
- `FavoritesView` mở chuỗi clip như Đã thích.
- Điền nốt metadata ASC (mục 3), ảnh duyệt, gửi duyệt (chờ lệnh "gửi").
- Mục từ bàn giao cũ vẫn mở: "Hỏi cụ thể hơn" đã làm (focus ô nhập), bản dịch EN đầy đủ cho vài chữ cố định, đo hiệu năng hội thoại rất dài, chạy Dynamic Type XXL/sáng-tối.
- Bàn giao cũ: `HANDOFF-20261127-ios-layout-va-cac-viec-dang-do.md` (cùng thư mục).
