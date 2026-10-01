# Chặn người dùng — lát cắt thu hẹp (01/10/2026)

Nhánh `sec/user-blocks-slice` (từ `rc/web-uat`), worktree `D:\TappyAI-wt\wtblock`. CHƯA push, CHƯA áp lên production, CHƯA merge.
Dành cho phiên bảo mật duyệt độc lập: mọi thứ đã viết nằm ở đây.

## 1. Đã làm so với 6 điều kiện của Huy
1. **Không cherry-pick 23f157d.** Viết lại từ đầu; chỉ ĐỌC phiên bản phase8 để lấy ý (và để sửa P8-11).
2. **Không đụng `chat_blocks`.** Migration chỉ ĐỌC nó (qua hàm helper). Test `chat_blocks provably intact` so sánh cấu trúc + chính sách + hàng trước/sau.
3. **Route viết lại theo helper của rc:** `getRequestUser`, `refuseAnonymousSocialWrite`, `rateLimit` (30/phút/tài khoản, khoá `user-block:<id>`), cờ `USER_BLOCKS_ENABLED` mặc định TẮT ⇒ 404 thân rỗng. Không lộ tài khoản kia có tồn tại không (khoá ngoại 23503 trả như thành công) và không lộ ai chặn ai (RLS chỉ cho đọc hàng do mình tạo).
4. **Không có `/api/reports`.** Giữ báo cáo bài/clip hiện có. Báo cáo bình luận / người dùng: làm ở §8 bằng bảng riêng `user_reports` (vì `content_reports.content_id` là khoá ngoại tới `reviews`).
5. **Đã chạy RLS trên DB audit và đo truy vấn** (mục 5).
6. Tài liệu này.

## 2. Những gì đã viết
| Tệp | Nội dung |
|---|---|
| `supabase/migrations/20261001_user_blocks.sql` | bảng `user_blocks` + RLS (chỉ select/insert/delete hàng của mình; tài khoản ẩn danh bị từ chối insert), schema riêng `safety_private` (không lộ qua REST) với `blocked_ids()` và `review_author_blocked(uuid)` (SECURITY DEFINER, `search_path` ghim, EXECUTE chỉ cho authenticated/service_role), 5 chính sách RESTRICTIVE (follows INSERT, comments INSERT, reviews SELECT, comments SELECT, notifications SELECT) + 1 PERMISSIVE (chủ bài xoá được bình luận trên bài mình), GRANT tường minh theo ADR-019 |
| `supabase/migrations/rollback/20261001_user_blocks_rollback.sql` | gỡ chính sách → hàm → schema → bảng; `chat_blocks` không đụng |
| `src/lib/safety/userBlocks.ts` | cờ + `blockedPeers()` (lọc phía server khi dùng admin client) |
| `src/app/api/users/[id]/block/route.ts` | POST (ghi cả `user_blocks` VÀ `chat_blocks`, upsert idempotent; nếu hàng chat lỗi thì thu hồi hàng kia, trả 500 — không chặn nửa vời; xoá follow hai chiều) / DELETE (xoá cả hai bảng) |
| `src/app/api/users/blocks/route.ts` | GET danh sách của chính mình (gộp hai bảng, không trùng, mới nhất trước; lỗi đọc = 500, không bao giờ trả «rỗng» giả) |
| `src/app/api/config/route.ts` | thêm `p8: {reports:false, userBlocks, commentModeration, accountDeletion:false}` |
| `src/app/api/users/search/route.ts`, `users/[id]/route.ts` | admin client ⇒ lọc phía server (người bị chặn/đã chặn mình không hiện; hồ sơ trả 404) |
| `src/app/api/reviews/[id]/comments/route.ts` | DELETE bỏ bộ lọc `.eq('user_id',…)`; RLS quyết (tác giả comment HOẶC chủ bài) |
| tests | `supabase/tests/user_blocks.test.ts` (20), `user_blocks.measure.test.ts` (đo), `userBlocksHarness.ts`, unit cho 2 route + lib |

**Không sửa:** `src/app/api/reviews/route.ts`, `uploadCompletion.ts`, mã chat, `chat_blocks`.

## 3. Sửa P8-11 (oracle tồn tại tài khoản)
Bản phase8 để client gọi thẳng hàm trả «X có chặn tôi không» ⇒ dò được quan hệ chặn. Bản này: hàm chỉ ở schema `safety_private` (PostgREST không thấy), chỉ trả boolean/mảng của CHÍNH người gọi (`auth.uid()`), dùng bên trong chính sách. Người dùng không tự gọi được.

## 4. Kiểm toán mọi đường ĐỌC
| Đường | Client | Trạng thái |
|---|---|---|
| Feed Khám phá / Mới nhất / Đang theo dõi, lưới hồ sơ, danh sách review, bộ sưu tập, trang SSR bài | client của người dùng (RLS) | **lọc bởi chính sách RESTRICTIVE trên `reviews`** |
| Bình luận (GET) | RLS | lọc bởi chính sách trên `review_comments` |
| Thông báo | RLS | lọc bởi chính sách trên `notifications` (theo `actor_id`) |
| Số like | cột `like_count` trên `reviews` | không lộ danh tính; bài bị ẩn thì không thấy |
| `users/search` | **admin** | lọc server (`blockedPeers`) + test |
| `users/[id]` | **admin** | lọc server ⇒ 404 + test |
| `reviews/route.ts` (ghi) | admin (writer) | chỉ ghi bài của chính người gọi; không đọc dữ liệu xã hội của người khác ⇒ không đổi |
| `reviews/[id]/like` | RLS đọc bài; admin chỉ INSERT milestone | người bị chặn không thấy bài ⇒ không like được |
| `comments` owner lookup | admin | chỉ tra chủ bài để gửi thông báo; INSERT đi qua RLS (bị chặn = 42501) |
| `notifications/backfill`, `lib/notifications/emit.ts` | admin | **CHƯA lọc**: backfill là cron một lần (cần CRON secret), chỉ tạo thông báo; emit ghi thông báo — người nhận bị chặn sẽ không THẤY nó (chính sách SELECT). Chưa có bộ lọc ở phía ghi. |
| `/api/admin/*`, cron | admin | cố ý không lọc (công cụ vận hành) |

**Còn chưa lọc ở phía server (liệt kê thẳng):** backfill thông báo, emit thông báo (ghi), các route admin/cron. Không có đường người dùng nào đọc dữ liệu xã hội bằng admin mà chưa lọc, ngoài những mục trên đã sửa.
Chưa rà: dữ liệu bên trong các RPC SECURITY DEFINER cũ (nếu có RPC feed gộp) — **nhờ phiên bảo mật xác nhận**.

## 5. Đo truy vấn (EXPLAIN ANALYZE, trung vị 7 lần)
**Dữ liệu tổng hợp trên Postgres nhúng (schema prod), 300.000 review / 600.000 bình luận / 100.000 thông báo / 3.000 người** — `docs/security/USER-BLOCKS-MEASURE.json`. Đơn vị ms.
| Truy vấn | Trước | Sau (mảng InitPlan, bản gửi đi) 0 / 10 / 200 chặn | Phương án hàm-theo-dòng (bỏ) |
|---|---|---|---|
| explore_pool_200 | 0,36 | 1,76 / 1,18 / 2,22 | 272 / 147 / 305 |
| latest_page_20 | 0,12 | 1,54 / 0,81 / 1,56 | 81 / 42 / 91 |
| following_feed_20 | 0,52 | 1,97 / 1,44 / 2,60 | 36 / 15 / 57 |
| profile_grid_30 | 0,25 | 1,58 / 1,15 / 1,94 | 154 / 65 / 150 |
| comments_50 | 0,04 | 1,32 / 0,85 / 1,52 | 1,7 / 1,0 / 1,4 |
| notifications_50 | 0,04 | 1,31 / 0,80 / 1,57 | 1,7 / 0,8 / 1,6 |
Kết luận: chi phí thêm ≈ 1–2 ms cố định (tính tập bị chặn một lần/câu lệnh), không phụ thuộc số dòng; không cần thêm index. Hàm gọi từng dòng chậm 100–800× ⇒ không dùng.

**DB audit thật** (26 review, 1 bình luận, 316 người — quá nhỏ để nói về quy mô): trước 0,04–0,09 ms, sau 0,50–0,58 ms. Số liệu quy mô lấy từ bộ dữ liệu tổng hợp ở trên, **không** có số đo trên dữ liệu production.

## 6. Kết quả RLS trên DB audit (3 tài khoản tạm, đã xoá sạch, 0 dòng sót)
A chặn B ⇒ A thấy bài {a,c}, B thấy {b,c} (không thấy bài của nhau), C thấy cả ba; follow cả hai chiều 42501; B bình luận bài của A 42501 và A bình luận bài của B 42501; C bình luận bài của A được; B đọc `user_blocks` = 0 hàng; tài khoản ẩn danh chặn bị 42501; bỏ chặn ⇒ khôi phục đủ {a,b,c}; xoá tài khoản có hàng chặn ⇒ hàng chặn về 0.
Migration đã áp lên **DB audit (UAT) — KHÔNG phải production**.

## 7. Rủi ro / việc cần người quyết
1. **Lớn nhất:** áp migration lên production là thay đổi RLS trên `reviews`, `review_comments`, `notifications` (bảng nóng). Số đo cho thấy rẻ, nhưng chưa đo trên dữ liệu production thật. Bắt buộc `pg_dump` trước, có rollback.
2. Hàng chờ kiểm duyệt chưa đọc `user_reports` (xem §8) — cần quy trình vận hành 24 giờ.
3. `commentModeration` đi chung công tắc `USER_BLOCKS_ENABLED`.
4. API ghi hai bảng không nằm trong một giao dịch (hai request); có bước thu hồi, nhưng nếu thu hồi cũng lỗi thì còn hàng `user_blocks` không có `chat_blocks` (an toàn theo hướng chặn nhiều hơn, bỏ chặn xoá cả hai).
5. Đường backfill/emit admin chưa lọc (mục 4).

## 8. Báo cáo bình luận / người dùng (bổ sung 01/10, Huy quyết: LÀM)
- Migration `20261001b_user_reports.sql` (+ rollback, có trong MIGRATION_ORDER.txt): bảng riêng `user_reports(id, reporter_id, target_type 'comment'|'user', target_id, reason, note ≤300, created_at)`. `content_reports` KHÔNG đổi.
- Ràng buộc: không tự báo mình (user: CHECK; bình luận của mình: chính sách INSERT), một người một lần cho mỗi đối tượng (UNIQUE), lý do thuộc danh sách (7 chuẩn + 6 của app native, lưu đúng như gửi).
- RLS: chỉ chọn/thêm hàng của mình; không UPDATE/DELETE từ client; ẩn danh không báo được; người bị báo và người lạ đọc 0 hàng.
- **Xoá tài khoản (Huy có thể đổi):** người BÁO bị xoá → `reporter_id` thành NULL, báo cáo ở lại ẩn danh làm bằng chứng kiểm duyệt; ĐỐI TƯỢNG bị xoá → hàng ở lại (không có khoá ngoại vì trỏ comment HOẶC user), chỉ chứa uuid + lý do + ghi chú của người khác. Phương án thay: xoá báo cáo về đối tượng đã xoá (một trigger).
- Hàng chờ kiểm duyệt: hàng chờ hiện có đọc `content_reports` nên KHÔNG đọc bảng này; không tạo hệ thống phạt. Bảng đọc bằng service role. **Việc vận hành 24 giờ cần người/quy trình (Huy).**
- Route: `POST /api/comments/{id}/report`, `POST /api/users/{id}/report` (cờ `REPORTS_ENABLED`, mặc định tắt ⇒ 404; 10 lần/10 phút; không lộ tồn tại). `p8.reports` = cờ này. Cờ bật tay SAU khi áp migration (thứ tự Part B).
- Lý do native (Android scam/sensitive; iOS hate/sexual/self_harm/scam/impersonation): bảng người dùng nhận đúng như gửi; route báo cáo bài (`content_reports`, lý do chuẩn) quy về lý do gần nhất.
- Kiểm: 10 test DB (Postgres nhúng) + 10 test route + chạy lại trên DB audit (báo cáo bình luận/user ok, trùng 23505, tự báo 23514/42501, ẩn danh 42501, người bị báo/người lạ thấy 0, client xoá 42501, xoá người báo → hàng ở lại với reporter_id NULL; đã dọn sạch).
