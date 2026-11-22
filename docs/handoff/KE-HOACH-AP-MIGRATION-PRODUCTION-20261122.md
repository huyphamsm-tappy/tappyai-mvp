# Kế hoạch áp migration lên production (22/11/2026) — CHỜ ANH DUYỆT, CHƯA CHẠY GÌ

Cơ sở: bản sao lưu `D:\TappyAI-backups\prod-20261122-1551-pre-sepay` (đạt 3/3 kiểm tra) và hai bộ kiểm chỉ-đọc chạy trên production ngày 22/11:
`scripts/release/sql/precheck-all.sql` (mốc 17/09) và `scripts/release/sql/precheck-post-0930.sql` (mới viết, từ 30/09 trở đi).
Quy tắc thứ tự, cổng và bản gỡ lấy từ `scripts/release/apply-migration.sh` (hàm `policy_of`) và `docs/uat/RELEASE-PLAN-2026-09-29.md`.
Nhãn: **ĐÃ KIỂM** = chạy thật chỉ-đọc trên production; **CHƯA KIỂM** = suy từ mã/tài liệu.

## 1. Production hiện đang ở đâu (ĐÃ KIỂM)

Production là bản chắp vá: một phần tháng 10 và đầu tháng 11 đã áp, nhưng nhiều bản tháng 9 và toàn bộ nửa sau tháng 11 chưa có.

**Đã có trên production (không áp lại):** chat phase1/6, review_shares, commerce providers + feed_items, user_blocks, user_reports, moderation standards, account_deletion_cleanup, content_reports queue + flood guard, p8_subscriptions_plan_model, p8_payments, p8_subscriptions, ai_data_consent, chat_honours_user_blocks, ai_usage_events, chat_messages.client_id, messenger_notification_collapse, chat_media, chat_media_retention.

**Chưa có (cần áp):**
| Nhóm | Bản còn thiếu |
|---|---|
| Tháng 9 (trước deploy) | 20260913_g1_growth_foundation, 20260913_plan_shares, 20260915_profile_public_presentation, 20260918_g1b_share_ancestry, 20260920_f028, 20260921_f032, 20260921 ga4 + shopping (không tác dụng), 20260922_groups_avatar_url, 20260925b (D3) + d3-one-off-sweep, 20260925d (D5), 20260929130000, 20260929140000, 20260915b (L1) |
| Tháng 9 (sau deploy) | 20260904 (S1), 20260921_music_tracks_lockdown |
| Tháng 9–10 (sau kiểm khói) | H1 20260927 và M1 20260928 (cả hai còn MỞ), 20260928b, 20260928c, 20260930, 20260930b |
| Thanh toán / gói | **20261016_p7_pip_one_time, 20261017_p7_pip_trial_any_source, 20261203_payments_no_refund** (cần cho SePay) |
| Tháng 11 | video 20261111–20261117 (5+2 bản), 20261118 ghim/lưu trữ, 20261119 dự án chat, 20261120 TVI, 20261201 Scam Shield, 20261202 xác nhận 18+ |
| Nhóm ăn / kiểm duyệt | 20261204, 20261205, 20261206, 20261207, 20261208 |

**Chưa kiểm được (cần thêm một lần dò trước khi áp):** 20261019_ai_data_consent_client_acl, 20261102_plans_promax, 20261107_chat_hardening, 20261112–20261116 (phụ thuộc 20261111, chắc chắn chưa có vì video_assets chưa có).

**Cố ý KHÔNG áp:** 20261121_mcp_jobs (hoãn), 20260911b / 20260925 / 20260925c (xóa tài khoản, hoãn), 20260922_music_soundhelix_attribution (bỏ). **20261001e_banned_identity_hash** chưa có trên production và script xếp nó vào nhóm sau kiểm khói, nhưng commit 7d27321 ghi "20261001e stays out (named-file apply only)": em cần anh xác nhận có áp hay không.

## 2. Hai bẫy đã thấy (CHƯA xử lý)

1. **(ĐÃ XỬ LÝ sau diễn tập, xem mục 4)** **20261208 (ẩn bình luận) cần 20260928c đã áp**, mà 20260928c bị script khóa vào nhóm "sau kiểm khói". Nhưng web mới đọc cột `hidden_at` nên nếu deploy trước khi áp 20261208 thì bình luận lỗi. Em đề xuất kiểm điều này trên bản thử (mục 3) rồi chốt thứ tự: nhiều khả năng 20260928c phải áp trước deploy, cùng nhóm với 20261208. Cần đổi một dòng chính sách trong script, em sẽ xin anh duyệt riêng.
2. **Vercel đang để `ACCOUNT_SELF_DELETE_ENABLED=true`** (theo tài liệu 29/09). Hoãn xóa tài khoản nghĩa là phải đặt rõ `false` khi deploy. Em sẽ kiểm lại giá trị thật trong bảng điều khiển trước.

## 3. Quy trình đề xuất (an toàn theo thứ tự)

**Bước A — Diễn tập trên bản sao (em làm, không đụng production).** Phục hồi `prod.dump` vào một máy chủ Postgres tạm trong Docker (trên ổ D), áp toàn bộ danh sách theo thứ tự dưới đây, chạy bộ kiểm sau mỗi bản, rồi chạy bộ test API chính. Kết quả là danh sách thứ tự đã được chứng minh chạy được, hoặc danh sách lỗi cần sửa. Anh không phải làm gì.

**Bước B — Áp lên production, từng bản, mỗi bản một giao dịch (dừng ngay khi có lỗi).** Chỉ làm sau khi anh nói "UAT ổn" và duyệt kết quả bước A. Em chạy `apply-migration.sh <bản> --i-have-a-valid-backup <thư mục sao lưu>`; sau mỗi bản chạy lại bộ kiểm để thấy `f → t`.

Thứ tự:
1. Kiểm trạng thái lần cuối: `precheck-all.sql` và `precheck-post-0930.sql`; sao lưu mới nếu bản hiện tại cũ hơn 12 giờ.
2. **Trước deploy:** nhóm tháng 9 (theo thứ tự bảng trên, L1 `20260915b` đặt cuối), rồi nhóm thanh toán (`20261016`, `20261017`, `20261203`), rồi tháng 11 (video, 20261118, 20261119, 20261120, 20261201, 20261202), rồi nhóm ăn (`20261204`–`20261206`, sát giờ deploy), rồi `20261207`, `20261208` (thứ tự cuối cùng chốt ở bước A, xem bẫy 1).
3. Anh gộp PR, Vercel deploy; em kiểm `/api/version` ra đúng mã bản phát hành.
4. **Sau deploy:** `20260904` (S1) và `20260921_music_tracks_lockdown`.
5. Chạy `smoke-prod.mjs`; nếu đạt thì sao lưu mới, rồi nhóm sau kiểm khói: H1, M1, 20260928b, 20260928c (nếu chưa áp), 20260930, 20260930b.
6. Chạy lại smoke có đăng nhập; sau đó mới nối SePay và thử MoMo 25.000đ.

**Bản gỡ:** mỗi bản có tệp gỡ trong `supabase/migrations/rollback/`; thứ tự gỡ là ngược lại của thứ tự đã áp, chỉ gỡ cái đã áp. Cảnh báo: gỡ `20261114` (kiểm duyệt video) làm mất lịch sử quyết định; gỡ L1/S1 mở lại lỗ riêng tư cũ.

## 4. KẾT QUẢ DIỄN TẬP BƯỚC A (ĐÃ KIỂM, 22/11/2026, trên bản sao, production không bị đụng)

Cách làm: Postgres 17 tạm trong Docker, phục hồi `prod.dump` + cấu trúc `safety_private` (lấy riêng từ production, chỉ đọc). Số dòng sau phục hồi khớp production: 676 tài khoản, 46 hồ sơ, 10 bài.
- **53/53 migration áp thành công**, từng bản một giao dịch, theo đúng thứ tự `MIGRATION_ORDER.txt`, không bản nào lỗi. (Đã bỏ: các bản production đã có, các bản hoãn, và `20261001e`.)
- Bộ kiểm sau áp: mọi bản `t`; H1 và M1 đã đóng (`f`) như mong muốn.
- **Rollback thử 6 bản mới nhất** (`20261203` → `20261208`): cả 6 chạy sạch.
- **Bẫy 1 được xác nhận:** áp `20261208` khi chưa có `20260928c` thì lỗi `function public.is_content_moderator() does not exist`. Đã sửa: `20260928c` chuyển từ nhóm "sau kiểm khói" sang "trước deploy" trong `apply-migration.sh`; test chính sách cập nhật kèm lý do (header của 28c ghi "no code dependency - apply any time"; còn bản gỡ).
- **Phát hiện mới:** bản sao lưu `backup-prod.ps1` chỉ gồm schema `public`, `auth`, `storage`, **không có `safety_private`** (chứa hàm chặn người dùng). Sao lưu vẫn đủ dữ liệu người dùng, nhưng muốn phục hồi hoàn chỉnh phải kèm tệp `safety_private-schema.sql` em đã lưu cạnh bản sao lưu.
- **Chưa kiểm:** chạy thử mã web trên cơ sở dữ liệu sao; thử rollback toàn bộ chuỗi; thử `20261001e`.

- **Lưu ý khi áp thật:** `20261016` và `20261017` tự có `BEGIN/COMMIT` nên `apply-migration.sh` từ chối (dòng 244, "psql -1 would nest it"). Hai bản này (cần cho gói Pip/SePay) phải áp bằng cách chạy cùng kết nối docker psql không có `-1`, vẫn `ON_ERROR_STOP`, như phiên Apple 1.2 đã làm (`docs/security/APPLE-1-2-RELEASE-PLAN.md`, mục "Migrations needing the helper"). Trên bản sao diễn tập cả hai chạy sạch.

## 5. Cần anh quyết (ngắn)
- ~~Có áp `20261001e` không?~~ **Anh Huy quyết 22/11/2026: KHÔNG áp** (bộ kích hoạt trên bảng đăng nhập, chưa có mã dùng, thời hạn lưu theo luật chưa xác nhận).
- Sau khi anh nói "UAT ổn", em mới sang bước B (áp lên production).
