# Prompt dán vào phiên mới — làm bản iOS theo bản web (21/11/2026)

Dán nguyên khối dưới đây vào ô nhập của phiên mới (mở phiên ở kho TappyAI; bàn giao nói rõ mỗi cây dùng cho việc gì).

---

Anh là Huy, chủ sản phẩm TappyAI (không phải dân lập trình). Hãy nói chuyện bằng tiếng Việt, ngắn gọn, thật, có nhãn ĐÃ KIỂM / CHƯA KIỂM. Kỹ thuật là việc của em; chỉ hỏi anh về quyền (tải, tài khoản), tiền, gu sản phẩm, riêng tư, production.

**Nhiệm vụ:** làm bản **iOS** của TappyAI cho khớp với bản **web đã đóng băng** (web là đặc tả). Bản web nằm ở nhánh `feat/brain-r13-p1`, cây `D:\TappyAI-wt\wt-integration`, tag `web-freeze-20261121`.

**Việc đầu tiên (chưa viết mã):**
1. Đọc đủ, theo thứ tự: `D:\TappyAI-wt\wt-integration\docs\handoff\HANDOFF-20261121-web-dong-bang-chuan-bi-ios.md` (đọc kỹ mục 2, 3, 4, 6), rồi `docs/ios/00_README.md`, `docs/ios/13_PARITY_GOVERNANCE.md`, `docs/ios/IOS-PROGRESS.md`, `docs/ios/IOS-REQUESTS.md`, `docs/ios/PARITY-AUDIT-2026-10-01.md`.
2. Kiểm trạng thái thật của iOS bằng git/GitHub (không tin ghi chú): nhánh iOS hiện tại, PR #313 (Messenger theo web) đã gộp chưa, bản App Store đang chạy build nào, CI macOS gần nhất xanh hay đỏ.
3. Lập bảng kiểm kê "web có / iOS có / còn thiếu" theo các mục 3.1–3.10 của bàn giao và các API ở mục 4, rồi trình anh một backlog xếp theo mức độ: **an toàn nội dung (Apple 1.2: báo cáo, chặn, bỏ chặn, ẩn bình luận, tự ẩn bài, quy tắc cộng đồng)** trước, rồi gói/thanh toán (Apple IAP, không hiện giá web), nhắn tin, clip, nhóm ăn, thông báo (`friend_post`), Deal (sổ thương hiệu + logo), trang chủ (thẻ gợi ý theo `topic`), trò chuyện (ghim/lưu trữ/dự án).
4. Dừng và hỏi anh duyệt backlog rồi mới làm.

**Luật cứng:**
- Không có máy Mac: Swift chỉ biên dịch được trên CI (`.github/workflows/ios.yml`, nhánh `ios/**`). Chưa có ảnh/run CI thì KHÔNG ghi "PASS".
- Sửa mã chỉ bằng Edit/Write. Không heredoc/`sed -i`/`python -c` để viết tệp mã. Tệp LF.
- Không push, không merge, không deploy, không áp migration production khi chưa có lời anh. Không đụng production (Supabase `fwznnobrdctuskgrvuik`); UAT là `zdaprdfgpbxyofagmc`.
- Không in khóa/`.env`. Không nhập khóa/mật khẩu vào ô hộ anh.
- Web là đặc tả: khác web phải có lý do và ghi lại. iOS KHÔNG hiện giá SePay (giá lấy từ App Store).
- Mỗi lát việc một commit, báo anh bằng ngôn ngữ thường: đã đổi gì, kiểm bằng gì, chưa kiểm gì.
- Làm tiếp từng lát không hỏi lại, chỉ dừng khi việc quan trọng (anh dặn 13/11).

**Nhớ thêm:** cây `D:\Claude\Projects\TappyAI\.worktrees\g1-growth` là nhánh khác (`feat/g1-growth`), có thay đổi chưa commit không thuộc web này — luôn `git -C <đường dẫn tuyệt đối>`, đừng nhầm hai cây. Hai tệp bàn giao Messenger cũ ở cây g1-growth, `docs\handoff\HANDOFF-20261104-messenger-web-android-ios.md` và `PROMPT-SESSION-MOI-20261104-messenger.md`.

---
