# BÀN GIAO 28/11/2026 TỐI — iOS: đã nộp Apple 1.1.0 (build 318), ĐÓNG BĂNG

Người đọc: phiên Claude mới. Anh Huy là chủ sản phẩm, không phải dân lập trình. Nói tiếng Việt, ngắn, thật, tách nhãn **ĐÃ KIỂM / SUY LUẬN / CHƯA KIỂM**. Kỹ thuật là việc của Claude; chỉ hỏi quyền, tiền, gu sản phẩm, riêng tư, production.

## 1. Mốc đóng băng
- Tag **`ios-freeze-20261128`** (chú thích, **chưa push**) trỏ commit **`271a00c`** trên nhánh `ios/layout-buoc5-20261126` = đúng mã của **build 318 / phiên bản 1.1.0** đã nộp Apple. Không đổi tag cũ.
- Sau tag có một commit dọn rác + bàn giao (không đổi mã app): bỏ tệp `ios/scripts/__pycache__/*.pyc` đang bị theo dõi nhầm, thêm `__pycache__/` và `*.pyc` vào `.gitignore`, thêm tệp này.
- Repo iOS: `D:\TappyAI-wt\wt-ios-messenger`. GitHub: `huyphamsm-tappy/tappyai-mvp`. **Chưa merge** vào `ios/consolidated-20261122` (đầu `b1af3e2`); chỉ merge khi anh cho phép sau khi Apple duyệt và anh UAT xong.

## 2. Đã nộp Apple (ĐÃ KIỂM trên App Store Connect)
- Phiên bản **1.1.0**, chọn **build 318**, mục "Có gì mới" tiếng Việt đã điền. Báo **"6 Items Submitted"** (app + 4 gói tự gia hạn + MoMo 7 ngày). Phát hành **thủ công**. Apple nói tối đa 48 giờ, kết quả gửi qua email (anh nhận mail).
- 5 gói đều có ảnh duyệt (ảnh màn Gói anh chụp từ TestFlight 318) và ghi chú cho người duyệt.
- Giá cửa hàng (chưa gồm thuế): Mỹ — MoMo 0,99 $, Coco 1 tháng 9,99, Tappy 1 tháng 12,99, Coco 3 tháng 29,99, Tappy 3 tháng 34,99. Việt Nam — 25.000 / 225.000 / 299.000 / 599.000 / 799.000 đ. Apple chỉ cho mức .99 (không có 11,99 hay 28,99).
- ASC app id `6816654420`; nhóm đăng ký "TappyAI Subscriptions" (22502849). Apple ID các gói: MoMo 6839901499 (`/non-renewing-subscriptions/…`), Coco 1 tháng 6839901326, Tappy 1 tháng 6839901162, Coco 3 tháng 6839901453, Tappy 3 tháng 6839901487 (`/subscriptions/…`).
- **CHƯA CÓ kết quả duyệt.** Nếu Apple từ chối: đọc lý do trong email, sửa, tăng build (dispatch TestFlight, số build = run number), nộp lại bằng cách vào App Review → gỡ mục cũ rồi Add for Review.

## 3. Việc đã làm hôm nay (28/11, đã nằm trong build 318)
Hồ sơ mở cả dãy clip (mọi tab) và vuốt ngang để thoát; Home đưa Smart Tools lên trên "Hỏi Tappy thử"; xác nhận 18+ chỉ một nút (`POST /api/age-declaration`); màn Gói theo web (Pip, hero, thứ tự gói, mascot, MoMo "dùng thử 1 lần", không nêu số câu, không "không giới hạn", chữ theo ngôn ngữ app); 401 `login_required` / 403 `account_required` mở đăng nhập đè lên màn đang đứng; năm công cụ cần tài khoản hiện mờ kèm dải "Cần đăng nhập"; dòng "Dùng gói Pro" dưới câu trả lời (Free và khách); bảng ≥3 cột vẽ thành thẻ xếp dọc.
Chi tiết thiết kế và layout để Android làm theo: `D:\TappyAI-review-artifacts\deploy\BAN-GIAO-IOS-THIET-KE-VA-LAYOUT-CHO-ANDROID-20261128.md` (phiên web đã gộp vào `BAN-GIAO-ANDROID-THEO-WEB-20261128.md`).

## 4. Chưa kiểm / còn mở
- CHƯA KIỂM trên máy thật: bảng thành thẻ ở phiên "Đi quy nhơn mùa này được không"; ba câu Free tra nhẹ ("Phan Xích Long có quán cơm tấm nào không", "Chủ tịch nước Việt Nam hiện nay là ai", "Nguyên nhân Thế chiến I"); 403 với phiên ẩn danh thật; mascot khít hàng gói; xác nhận 18+ với máy chủ production.
- Mục Yêu thích (Discovery) vẫn mở từng clip. PDF nghiên cứu sâu chưa có ảnh. Chưa xem PDF kế hoạch mới bằng mắt.
- Việc của web (anh nói làm sau): bỏ "Không giới hạn câu hỏi AI" ở Pip; cân nhắc bảng thẻ cho màn hẹp; lỗi Toyota (ảnh/nguồn) và iPhone Duo (ảnh sai, thiếu link Lazada).
- Giá Google Play chưa đặt (việc Android, cần hỏi anh).

## 5. Dọn rác đã làm (28/11)
Đã: bỏ tệp `.pyc` bị theo dõi nhầm, thêm quy tắc bỏ qua, xoá 3 tệp tạm của phiên trong thư mục scratchpad. Worktree sạch (không còn tệp lạ).
**Chưa xoá, chờ anh quyết:** các nhánh trung gian `ios/layout-buoc1…4-20261126` (cả máy và GitHub) — đã nằm trong `ios/layout-buoc5-20261126`; nhiều nhánh `ios/*` cũ trên GitHub; các cây worktree khác trong `D:\TappyAI-wt` (anh đã dặn giữ 10 cây One Life).

## 6. Luật (đã bị phạt vì quên)
1. **Không push khi một lần TestFlight đang chạy**: `ios.yml` có `cancel-in-progress` cùng nhánh. Chỉ bấm `gh workflow run ios.yml --repo huyphamsm-tappy/tappyai-mvp --ref ios/layout-buoc5-20261126` khi CI của đúng commit đã xanh và không có run nào đang chạy; bước "Archive + upload" không chờ test. Đẩy chỉ tệp trong `docs/` thì không kích `ios.yml`.
2. Sửa mã chỉ bằng Edit/Write (đọc tệp bằng Read trước); cấm heredoc/`sed -i`/`python -c` để viết mã.
3. Test chặn App Review (`ExternalPurchaseGuardTests`): không có "web", "momo", "bank", "chuyển khoản", "rẻ hơn"… trong câu `sub.*`; không hứa số câu hay "không giới hạn" ở các khoá Pro cũ; mọi tệp mở liên kết ra ngoài phải nằm trong danh sách duyệt 3.1.1.
4. Không đụng production, khoá, tiền; không nhập mật khẩu hộ anh; **không gửi duyệt khi anh chưa nói "gửi"**; không đổi tag cũ, không `reset --hard`, không `push --force`, không xoá nhánh khi chưa hỏi.
5. Test đỏ → sửa mã hoặc ghi lý do duyệt, không làm yếu assertion.
6. Chrome (nhóm `mcp__claude-in-chrome__*`) chỉ chụp được khi màn hình PC sáng; khi "renderer unresponsive" thì dừng, không bấm mù vào App Store Connect. Trên ASC: đổi giá tại `…/subscriptions/<id>/pricing` → Starting Price → Edit Price; chọn "Keep the calculated prices" rồi đặt riêng giá Mỹ để giữ giá Việt Nam; chờ ~20 giây rồi mới mở lại kiểm.

## 7. Việc Claude làm khi quay lại
1. Hỏi anh có email Apple chưa (duyệt hay từ chối). Duyệt xong: hỏi anh có bấm phát hành 1.1.0 không (đang để phát hành thủ công); chỉ phát hành khi anh nói.
2. Từ chối: đọc lý do, sửa, build mới, nộp lại.
3. Khi anh UAT xong và cho phép: merge nhánh vào `ios/consolidated-20261122`, tạo tag mới (không đổi tag cũ).
4. Làm nốt mục 4 nếu anh muốn.
