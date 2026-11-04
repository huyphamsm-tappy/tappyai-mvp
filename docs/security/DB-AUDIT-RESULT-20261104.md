# Kết quả kiểm CSDL production và khóa Firebase — 04/11/2026

Chạy trong Supabase SQL Editor (dự án production `fwznnobrdctuskgrvuik`), chỉ SELECT trên danh mục hệ thống; truy vấn nằm trong `DB-AUDIT-QUERIES.sql`. Không có dữ liệu người dùng trong kết quả.

## Kết quả

| Kiểm | Kết quả | Đánh giá |
|---|---|---|
| Hàm SECURITY DEFINER trong `public` thiếu `search_path` (D-05) | **0** | Đạt |
| Bảng trong `public` chưa bật RLS | **0** | Đạt |
| View không đặt `security_invoker` | **0** | Đạt |
| Chính sách GHI mở cho `anon`/`public` mà không ràng buộc `auth.uid()`/vai trò/quyền | **0** | Đạt: dù `anon` có quyền ghi mức bảng (mặc định Supabase), RLS chặn |
| Bảng `anon` có quyền ghi / quyền đọc ở mức GRANT | 49 / 49 | Mặc định Supabase; an toàn nhờ RLS. Muốn chặt hơn: thu hồi ghi của `anon` trên mọi bảng (xem mục "Đề xuất") |
| Bucket Storage (D-03) | 1 bucket: `review-thumbnails`, **công khai** | Chủ đích (ảnh thu nhỏ của bài review). Ảnh/video người dùng không nằm ở Supabase Storage |
| Chính sách trên `storage.objects` (D-04) | **không có** | Mặc định chặn mọi truy cập qua API; chỉ service role ghi được. Đạt |
| Hàm `anon` được EXECUTE | 139 trong `public`; trong đó **13 hàm SECURITY DEFINER** | Xem dưới |

### 13 hàm SECURITY DEFINER mà `anon` gọi được
- Hàm trigger (không gọi được trực tiếp qua RPC, nhưng không cần quyền EXECUTE cho anon): `chat_touch_thread`, `fn_audit_log_chain`, `handle_new_user`, `update_follow_counts`, `update_review_comment_count`, `update_review_like_count`, `update_review_save_count`.
- Hàm đọc/đếm công khai có chủ đích hoặc không nguy hiểm: `account_deletion_ready` (cố ý công khai), `fn_original_sound_is_servable`, `music_followed_count`, `music_saved_count`.
- **Có thể bị lạm dụng làm phồng bộ đếm:** `increment_deal_click`, `music_increment_play`.

**Phát hiện chính:** migration `20260928b_revoke_increment_deal_click_public.sql` (thu hồi quyền của `increment_deal_click` khỏi PUBLIC/anon/authenticated) **có trong repo nhưng chưa được áp dụng trên production**: ACL hiện vẫn có `=X/postgres` (PUBLIC), `anon`, `authenticated`. Tệp đó ghi "chỉ áp dụng khi Owner cho phép rõ ràng". Mã phía máy chủ (`/api/deals/[id]/click`) đã dùng service role từ trước nên áp dụng không làm gì vỡ.

## Đề xuất (chưa áp dụng, cần Owner cho phép)
1. Áp dụng `20260928b` bằng quy trình migration thường lệ (có sao lưu).
2. Thu hồi EXECUTE của hàm trigger khỏi PUBLIC/anon/authenticated. Trigger không cần quyền này khi chạy. Câu lệnh gợi ý (idempotent):

```sql
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
```
3. `music_increment_play`: thu hồi khỏi `anon` (và chuyển sang gọi qua máy chủ) khi tính năng nhạc bật lại; hiện nhạc đang ẩn.
4. (Tùy chọn, chặt hơn) thu hồi quyền ghi của `anon` trên các bảng ứng dụng, đặt `ALTER DEFAULT PRIVILEGES` để bảng mới không tự cấp quyền. Cần thử trên bản sao vì một số luồng khách có thể ghi qua RLS.

## Khóa Firebase Android (W-10)
- Dự án Google Cloud `aerobic-lock-498409-u7`, khóa "Android key (auto created by Firebase)": đã giới hạn **25 API** nhưng **Application restrictions = None**.
- Các vân tay SHA-1 hợp lệ của app (lấy từ các OAuth client Android đã tạo): `com.tappyai.app` có 3 (Play App Signing `C2:0A:A1:27…A9:1D`, khóa upload `33:09:7D:22…28:24`, chứng chỉ triển khai `12:BD:98:F6…06:9F`); `com.tappyai.app.staging` và `com.tappyai.app.debug` dùng khóa debug `B1:90:A7:B0…54:2F`.
- **Đã thử đặt giới hạn "Android apps" với 5 cặp trên nhưng Google cảnh báo khóa này đang có lưu lượng từ các API Maps phía máy chủ** (Directions, Geocoding, Places, Static Maps, Timezone). Giới hạn theo ứng dụng Android sẽ làm các cuộc gọi máy chủ đó bị từ chối. **Không lưu; khóa giữ nguyên.**
- Việc cần làm trước: xác định cuộc gọi Maps nào đang dùng khóa này (Metrics Explorer, hoặc đối chiếu với `GOOGLE_PLACES_API_KEY` trên Vercel), chuyển chúng sang một khóa riêng giới hạn theo API Maps (và theo IP nếu có thể), rồi mới đặt giới hạn Android cho khóa Firebase. Nếu `GOOGLE_PLACES_API_KEY` chính là khóa này thì tìm kiếm địa điểm hiện đang phụ thuộc vào nó.
