# ĐÓNG BĂNG WEB — 02/10/2026

**Mã đã chạy test và kiểm trên UAT: `24b70baffce21ae2917ee649c9c50528d1f4d29d`.** Commit đóng băng (chỉ thêm tài liệu, mã y hệt) là commit chứa tệp này; SHA cuối ghi trong báo cáo và ở `RELEASE-PROGRESS.md`.

## Đã làm đêm 01→02/10
- Nợ cũ: hồi quy 30 hội thoại/135 lượt trong nhiễu; 4 rạp phim (98c9db0); chi phí tìm kiếm không tăng; hai ca không link đã kết luận (`DEBT-RESULTS-2026-10-01.md`).
- Chữ `/r/…` sửa; `gps-proof.json` xoá khỏi cây + `docs/audit/uat/` bị bỏ qua + test bậc thang toạ độ; backlog PL-COPY-PREMIUM.
- Gộp chặn người dùng, báo cáo bình luận/người dùng, kiểm duyệt (sổ strike bất biến, kháng nghị, màn hình duyệt, Quy tắc cộng đồng), mã băm người bị khoá. Phiên bảo mật duyệt độc lập: «Có thể gộp», ba điều kiện mức vừa đã sửa và kiểm lại.
- Cờ Preview (rc/web-uat): `STYLE_LUNA6`, `ACCOUNT_SELF_DELETE_ENABLED`, `USER_BLOCKS_ENABLED`, `REPORTS_ENABLED`, `MODERATION_ADMIN_ENABLED` = true. Gói trả phí tắt. Riêng UAT: `PLATFORM_OWNER_USER_ID` (nhánh rc/web-uat) trỏ tới tài khoản QA `qa.admin.uat@tappyai.com` trên DB audit để xem được `/admin` trên UAT (trước đó UAT chưa bao giờ vào được admin vì DB audit không có chủ nền tảng). **Xoá biến này và dòng `platform_owner` của DB audit sau release.**

## Bằng chứng trên UAT (SHA 24b70ba, tài khoản dùng-một-lần trên DB audit)
- `modE2E`: **38/38 đạt** — cờ trong `/api/config`; chặn / chặn hai lần / bỏ chặn; người bị chặn không thấy bài, không theo dõi được (403), không bình luận được (403), không mở được hồ sơ (404); danh sách chặn chỉ của người chặn; báo cáo bình luận / người dùng (lý do native «scam») / bài; báo cáo lại = `alreadyReported`; tự báo mình 400; 3 báo cáo KHÔNG xoá gì; trạng thái báo cáo `received`; trang `/admin/moderation` mở được bằng tài khoản QA, tài khoản thường bị từ chối; quyết định «Cảnh cáo» ghi sổ, không strike, báo tin cho người bị xử lý (không nêu người báo/nội dung); `/profile/notices`; kháng nghị một lần (lần hai 409); đảo ngược; tab Số liệu; `/community-guidelines`; dọn sạch không còn tài khoản/bài thử.
- Chat qua trang thật (`webe2e`): phở quận 1 ✓ (4 thẻ + bản đồ), khách sạn ✓, vé máy bay ✓.
- Ảnh: `gs://tappyai-uat-evidence/evidence/24b70ba/` (riêng tư).

## Chưa kiểm / hạn chế
- Web CHƯA có nút «Chặn» và «Báo cáo bình luận/người dùng» trong giao diện (mới có API + app Android/iOS đọc `p8.*`); trang `/admin/moderation` trên UAT chỉ vào được bằng tài khoản QA.
- Android/iOS thật chưa thử với cờ bật.
