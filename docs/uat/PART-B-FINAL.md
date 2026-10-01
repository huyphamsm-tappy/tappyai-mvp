# PHẦN B — BẢN CUỐI, SẴN SÀNG CHẠY (02/10/2026)

Chạy CHỈ sau khi Huy báo **«OK release»**. Một bước một lần; xong mỗi bước ghi kết quả rồi mới sang bước sau. Chi tiết từng việc nằm ở `ENV-RELEASE-CHECKLIST.md` (mục nêu trong ngoặc).
Ký hiệu: **[CC]** = Claude Code làm (Huy chỉ nói «OK» cho bước đó) · **[HUY 🔐]** = Huy làm, cần đăng nhập tài khoản của Huy · ⚠ = lệnh **chạm production**, cần Huy đồng ý rõ ràng cho đúng bước đó.
Không bước nào đọc hay in giá trị bí mật; Claude chỉ kiểm TÊN biến.

## Điều kiện bắt đầu
- UAT đã đóng băng ở SHA CUỐI (ghi ở `RELEASE-PROGRESS.md`), Regression Gate xanh (hai run), Huy đã test một lượt và nói «OK release».
- Production KHÔNG đổi gì trước bước 0.

## 0. Sao lưu ⚠ [HUY 🔐 hoặc CC nếu Huy cho chuỗi kết nối]
`pg_dump` production (DEPLOY-CHECKLIST §0), lưu ra nơi riêng, KHÔNG vào git. Production dùng Supabase Free **không có sao lưu tự động**: không có bản dump = KHÔNG làm bước 1. Đạt = tệp dump mở được, kích thước > 0, ghi lại giờ làm.

## 1. Migration production ⚠ [CC chạy từng file bằng `scripts/release/apply-migration.sh`; Huy đồng ý TỪNG file]
Thứ tự CỐ ĐỊNH: **D1 → D2 → D4 → chặn → báo cáo → rạp phim → kiểm duyệt → mã băm**. Mỗi bước: chạy câu «TRƯỚC», áp file, chạy câu «SAU», ghi kết quả. Lỗi = DỪNG, chạy rollback của chính file đó, báo Huy.
| # | File | Câu kiểm TRƯỚC | Câu kiểm SAU | Rollback |
|---|---|---|---|---|
| 1 | `20260911b_user_memory_auth_fk.sql` (D1; xoá dòng mồ côi — không hoàn lại được, cần dump) | `select data_type from information_schema.columns where table_name='user_memory' and column_name='user_id'` | cùng câu = `uuid` | `rollback/20260911b_user_memory_auth_fk_rollback.sql` |
| 2 | `20260925_account_deletion_cascade_gaps.sql` (D2) | `select count(*) from pg_constraint where conname in ('decision_evidence_owner_id_fkey','anon_chat_usage_user_id_fkey')` = 0 | = 2 | `rollback/20260925_account_deletion_cascade_gaps_rollback.sql` |
| 3 | `20260925c_account_deletion_f096.sql` (D4) | `select count(*) from pg_trigger where tgname='trg_enqueue_account_deletion'` = 0 | = 1 | `rollback/20260925c_account_deletion_f096_rollback.sql` |
| 4 | `20261001_user_blocks.sql` (chặn; đổi quyền đọc trên `reviews`, `review_comments`, `notifications`) | `select to_regclass('public.user_blocks')` = null; `select count(*) from chat_blocks` (ghi lại) | bảng có; ≥ 6 chính sách `user_blocks_%`; `chat_blocks` đếm bằng lúc trước; **đo feed** (xem ENV-RELEASE-CHECKLIST §1d 5c): ≤ 15 ms, vượt 50 ms = tắt khẩn | `rollback/20261001_user_blocks_rollback.sql` |
| 5 | `20261001b_user_reports.sql` | `select to_regclass('public.user_reports')` = null | có bảng; 2 chính sách | `rollback/20261001b_user_reports_rollback.sql` |
| 6 | `20261001c_commerce_providers_cinemas.sql` (4 dòng seed) | `select count(*) from commerce_providers where provider_id in ('galaxy','lotte','bhd','beta')` = 0 | = 4 | `delete from commerce_providers where provider_id in ('galaxy','lotte','bhd','beta')` |
| 7 | `20261001d_moderation_standards.sql` | `select to_regclass('public.moderation_decisions')` = null | cả hai bảng (`moderation_decisions`, `moderation_appeals`) có; 3 trigger | `rollback/20261001d_moderation_standards_rollback.sql` (xuất dữ liệu trước nếu đã có quyết định) |
| 8 | `20261001e_banned_identity_hash.sql` (2 trigger trên `auth.users`; lỗi tra cứu không chặn đăng ký/xoá) | `select to_regclass('public.banned_identities')` = null | bảng có; `select count(*) from pg_trigger where tgname in ('keep_banned_identity','refuse_banned_identity')` = 2 | `rollback/20261001e_banned_identity_hash_rollback.sql` |
Migration chặn (4) không đọc bảng chat cũ nên không đổi gì cho tới khi có người chặn qua API (đã sửa theo phiên bảo mật 02/10); báo cáo (5) chỉ ghi qua route (client không INSERT được); kiểm duyệt (7) và mã băm (8) không đổi hành vi cho tới khi có quyết định/khoá. Hai trigger của bước 8 chỉ khớp địa chỉ đã nằm trong bảng. Lưu ý: chính sách «chủ bài xoá được bình luận trên bài mình» (bước 4) có hiệu lực ngay khi áp, cờ chỉ quyết định nút hiện trong app. **pg_dump của bước 0 chứa cả «muối» và mã băm của bước 8: giữ dump như dữ liệu mật.**
Đã áp và thử THÀNH CÔNG trên DB audit (UAT) kèm rollback rồi áp lại — đo 02/10 (xem `docs/security/USER-BLOCKS-SLICE.md`).

## 2. Supabase production [HUY 🔐]
- Authentication → URL Configuration → **Redirect URLs**: xoá `https://*.vercel.app/**` (và mọi dòng wildcard còn lại); giữ `https://www.tappyai.com/**`, scheme app (`tappyai://…`), không thêm gì khác. Đạt = danh sách không còn dấu `*` ở tên miền ngoài tappyai.com.
- Authentication → Providers → **Apple**: bật, điền Services ID / Team ID / Key ID / khoá `.p8` (tệp `.p8` ở `D:\secrects`, KHÔNG dán vào chat). Đạt = nút «Đăng nhập bằng Apple» trên TestFlight vào được tài khoản.
- Authentication → **Secure email change = ON** (đừng tắt).

## 3. Biến môi trường Vercel Production, rồi cờ [HUY 🔐; Claude kiểm TÊN biến sau khi Huy xong]
Thứ tự: (a) biến nền trước, (b) deploy, (c) cờ theo thứ tự, mỗi cờ một lần redeploy hoặc gộp nếu Huy muốn.
- (a) **GCP_***: `GCP_PROJECT_NUMBER`=`1023373437508`, `GCP_WIF_POOL`=`vercel-oidc`, `GCP_WIF_PROVIDER`=`vercel`; KHÔNG có `GCS_MEDIA_BUCKET`, `GCP_MEDIA_SERVICE_ACCOUNT`, và không giá trị nào có `-uat` (ENV-RELEASE-CHECKLIST §2).
- (a) **Khoá OpenAI production**: key thử `tappy-luna-test` **hết hạn 30 ngày từ lúc tạo** — KHÔNG dùng cho production. Tạo key mới: platform.openai.com → (dự án production) → API keys → **Create new secret key** → quyền hạn chế (chỉ model đang dùng), đặt tên `tappy-production`, **đặt giới hạn chi tiêu hằng tháng** ở Settings → Limits; dán vào Vercel → `OPENAI_API_KEY` (Production). Không dán vào chat.
- (a) Luna: `CONSULT_LUNA=1`, `LLM_CONSULT_PROVIDER=openai`, `LLM_INTENT_PROVIDER=openai`, `CONSULT_LUNA_FAST=1`, `CONSULT_LUNA_PLAN=1`, `LLM_PLAN_PROVIDER=openai`, `LLM_PLAN_REASONING=low`, `SERPER_CACHE_V2=1`; KHÔNG có `LLM_PROVIDER`, `HAIKU_FALLBACK` (RELEASE-PLAN §2g, ENV-RELEASE-CHECKLIST §4).
- (c) Cờ, theo thứ tự: `STYLE_LUNA6=1` → `ACCOUNT_SELF_DELETE_ENABLED=true` (chỉ SAU bước 1.1–1.3) → `USER_BLOCKS_ENABLED=true` (chỉ SAU 1.4) → `REPORTS_ENABLED=true` (chỉ SAU 1.5) → `MODERATION_ADMIN_ENABLED=true` + `MODERATION_DIGEST_USER_IDS=<mã người dùng của Huy>` (chỉ SAU 1.7). `SUBSCRIPTIONS_ENABLED` KHÔNG đặt (gói trả phí không vào release này).
- Sau mỗi lần redeploy: `GET https://www.tappyai.com/api/version` = SHA CUỐI; `GET /api/config` có `flags.accountSelfDelete: true`, `p8.userBlocks: true`, `p8.reports: true`, `p8.moderationNotices: true`.
- (d) **Cron mới** (thêm vào `vercel.json`, Huy đồng ý; deploy lại): `/api/cron/moderation-digest` `0 1 * * *` và `/api/cron/moderation-snapshot-purge` `30 18 * * 0`.

## 4. Smoke production ⚠ [CC làm bằng tài khoản test production; Huy đồng ý chạy]
Tài khoản test: `qa.release.a@tappyai.com`, `qa.release.b@tappyai.com` (KHÔNG dùng tài khoản thật). Mỗi dòng: việc → **đạt = thấy gì**.
1. Đăng nhập a → vào chat → hỏi «quán phở ngon quận 1» → **đạt** = có thẻ quán, nút «Xem bản đồ».
2. Hỏi «phim nào đang chiếu» → **đạt** = có 5 link rạp (CGV, Galaxy, Lotte, BHD, Beta).
3. Hỏi «vé máy bay đi Đà Nẵng» → **đạt** = hỏi «Bay từ đâu?».
4. Đăng MỘT video ngắn bằng a → mở link công khai → **đạt** = video phát; sau đó xoá clip (§2 ENV-RELEASE-CHECKLIST).
5. **Chặn/báo cáo bằng hai tài khoản:** a chặn b → b không thấy bài của a, không theo dõi/bình luận được; a bỏ chặn → khôi phục. b bình luận bài của a, a báo cáo bình luận đó → `GET /api/reports/mine` của a = `received`; bình luận CÒN NGUYÊN.
6. **Trang admin:** đăng nhập tài khoản của Huy (owner) mở `/admin/moderation` → thấy «Duyệt báo cáo», dòng báo cáo vừa tạo; tài khoản thường bị chuyển khỏi trang. Chọn «Cảnh cáo» (Spam) → b nhận thông báo; `/profile/notices` của b có quyết định + nút Kháng nghị. Cuối cùng kháng nghị rồi «Đảo ngược».
7. **Xoá tài khoản thử:** dùng tài khoản test có dữ liệu mẫu — **đếm trước** (chat, địa điểm lưu, review, bộ nhớ AI, kết quả tư vấn, số tệp của user trong bucket) → xoá trong app (gõ XÓA) → **đếm sau**: hàng = 0, tệp = 0 sau khi cron `account-deletion-jobs` chạy (chạy tay để kiểm) (ENV-RELEASE-CHECKLIST §1b bước 4). Không qua → tắt `ACCOUNT_SELF_DELETE_ENABLED`, báo Huy.
8. `/community-guidelines` mở được (vi/en), `/privacy`, `/delete-account` mở được.
Không qua bước nào → dừng, tắt cờ liên quan (bước 5), báo Huy; không sang bước 6.

## 5. Tắt khẩn cấp (không cần deploy lại code)
- Cờ: Vercel → Production → xoá biến (hoặc đặt khác `true`) → Redeploy. `USER_BLOCKS_ENABLED` tắt = route chặn 404, app ẩn nút (đọc `p8.userBlocks`); `REPORTS_ENABLED`, `MODERATION_ADMIN_ENABLED`, `ACCOUNT_SELF_DELETE_ENABLED` tương tự. Chính sách RLS ở DB vẫn lọc (an toàn).
- Rollback migration: chạy file rollback ở bảng bước 1 theo thứ tự NGƯỢC (8 → 7 → 6 → 5 → 4); chỉ khi chính migration gây sự cố. D1–D4 chỉ rollback khi có sự cố (D1 xoá dữ liệu mồ côi — khôi phục bằng dump).
- Feed chậm (> 50 ms) hoặc lỗi 5xx ở feed sau bước 1.4: tắt `USER_BLOCKS_ENABLED` rồi rollback 1.4.
- Lỗi đăng ký tài khoản mới sau 1.8: chạy rollback 1.8 ngay (hai trigger trên `auth.users`).

## 6. Báo «OK release» cho các app [CC viết lời; Huy bấm]
- **Android**: bản nháp «Sản xuất» ở Play Console, đăng **từng phần** (ví dụ 20% rồi tăng) — [HUY 🔐] bấm trong Play Console; AAB đã có (phiên Android giữ). Nút «Chặn»/«Báo cáo» tự hiện nhờ `p8.*` ở `/api/config` — không cần build lại.
- **iOS**: TestFlight đã có; nộp App Store sau khi smoke đạt — [HUY 🔐] trong App Store Connect (iOS gọi `POST /api/reports` ở mục I7 phải đổi sang hai đường riêng nếu muốn có báo cáo: xem `docs/ios/IOS-REQUESTS.md` §4–5).
- Báo cho phiên Android và iOS: «web production đã bật cờ lúc …, SHA …».

## 7. SAU RELEASE
- **Khoá repo** [HUY 🔐]: GitHub → Settings → Branches → bảo vệ `main` và `rc/web-uat` (bắt buộc Regression Gate, chặn force-push).
- **Cắt phút CI** [CC, khối riêng]: Regression Gate chạy trên `pull_request` vào rc/main (không chạy cả `push`), thêm `concurrency` huỷ run cũ, cache `node_modules`/`.next`.
- **Dọn file tạm** [CC]: `docs/audit` (bản ghi chạy thử có vị trí, số điện thoại, dữ liệu Google Places) chuyển sang kho riêng `gs://tappyai-uat-evidence` rồi xoá khỏi cây (không viết lại lịch sử); test ratchet vị trí đã có (`scripts/repoHygiene.test.ts`).
- **Đổi/thu hồi khoá** nếu phiên bảo mật báo; key `tappy-luna-test` thu hồi sau khi key production chạy.
- **Cron cần thêm sau** (chưa áp dụng): hết hạn gói trả phí (khi bật gói); đã nêu ở bước 3(d): digest hàng chờ và dọn ảnh chụp bình luận.
- **Người xem hàng chờ mỗi ngày** — Apple 1.2 đòi xử lý kịp thời. Hệ thống chỉ nhắc (thông báo hằng ngày), không tự xử lý; chưa có email gửi đi (cần nối Brevo — backlog).
- **Backlog sau release:** PL-COPY-PREMIUM, PL-HISTORY-CARDS (lịch sử chat mất ảnh/thẻ), email tóm tắt hàng chờ, nối thời hạn lưu mã băm theo ý kiến luật.

## Lệnh nào chạm production (cần Huy đồng ý TỪNG bước)
Bước 0 (đọc dump), bước 1 (ghi DB, 8 file), bước 2–3 (Huy tự làm trên Supabase/Vercel), bước 4 (ghi dữ liệu thử bằng tài khoản test, xoá thử), bước 5 (chỉ khi sự cố). Mọi thứ khác (UAT, audit DB, nhánh) không chạm production.
