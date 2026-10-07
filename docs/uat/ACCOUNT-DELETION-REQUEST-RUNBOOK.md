# Xử lý yêu cầu xoá tài khoản qua email (khi `ACCOUNT_SELF_DELETE_ENABLED=false`)

Bản này (owner 29/09): nút trong app/web mở thư soạn sẵn tới **support@tappyai.com**; người trực hỗ trợ xác minh rồi xoá.
Chi tiết nội dung còn lại sau khi xoá và phương án từng loại: `docs/uat/F-096-ACCOUNT-DELETION-OPTIONS.md`
(D1/D2/D4 hoãn trong bản này — xem RELEASE-PLAN §1).

## Các bước

1. **Xác minh người yêu cầu.** Thư phải gửi TỪ đúng địa chỉ email của tài khoản (hoặc trả lời thư xác nhận do support gửi tới
   địa chỉ đó). Không xoá theo yêu cầu từ địa chỉ khác.
2. **Tìm tài khoản:** supabase.com/dashboard → project **production `fwznnobrdctuskgrvuik`** → Authentication → Users →
   tìm theo email → ghi lại **User UID** vào phiếu hỗ trợ (không ghi ở nơi công khai).
3. **Xoá:** ⋯ → **Delete user** → xác nhận.
   Việc xoá user trong `auth.users` tự xoá theo (ON DELETE CASCADE) các bảng gắn với user — trong đó có:
   - **`commerce_click_attributions`** — bảng nối link đối tác (sub1 → người dùng, phương án C). Ràng buộc
     `commerce_click_attributions_identity_fkey` (migration `20260929140000`, R21). Dòng của **khách ẩn danh** xoá theo
     cùng cách: phiên khách cũng là một user trong `auth.users`; xoá user ẩn danh đó (tìm theo UID nếu người yêu cầu cung cấp,
     hoặc để hệ thống dọn phiên khách) thì các dòng nối của nó đi theo. Dòng không gắn danh tính tự xoá sau 12 tháng (cron
     `/api/cron/click-attributions-sweep`).
   - các bảng khác theo F-096 (những bảng chưa cascade vì D1/D2/D4 hoãn được ghi rõ ở đó).
4. **Kiểm (SQL Editor, chỉ đọc) với UID ở bước 2** — mỗi dòng phải trả `0`:
   ```sql
   select count(*) from public.commerce_click_attributions where identity_id = '<UID>';
   select count(*) from auth.users where id = '<UID>';
   ```
5. **Trả lời người dùng** trong thời hạn đã hứa ở trang `/delete-account`; ghi ngày xoá vào phiếu.

## Đã kiểm trên DB audit (UAT, 29/09)

Tài khoản test mới → qua cổng 18+ → một lượt chat khách sạn → bấm 2 link đối tác (2 sub1 khác nhau, 2 dòng nối đúng UID) →
`auth.admin.deleteUser` (cùng thao tác "Delete user") → **0 dòng nối còn lại**, ràng buộc `CASCADE`.
Bằng chứng: `gs://tappyai-uat-evidence/evidence/r21-2026-09-29/` (`r21-delete.json`, `sweep.json`).
