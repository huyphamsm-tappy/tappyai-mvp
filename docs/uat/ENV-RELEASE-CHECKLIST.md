# ENV-RELEASE-CHECKLIST — biến môi trường và việc console cho release (01/10/2026)

Tệp này gom các mục PHẦN B mới (từ báo cáo phiên Android `docs/android/OVERNIGHT-2026-10-01.md` và `PLAY-CONSOLE-PASTE.md`)
vào một chỗ. Nó **bổ sung** `OWNER-TOMORROW-2026-09-30.md` B0…B8, không thay thế. `docs/phase8/ENV-RELEASE-CHECKLIST.md`
chỉ có ở nhánh Phase 8 (đã đỗ) — tệp này mới là bản của rc.
🔐 = bước cần đăng nhập tài khoản của Huy. Claude KHÔNG đọc giá trị bí mật nào; chỉ kiểm TÊN biến khi anh yêu cầu.
Không có bước nào dưới đây được làm trước khi Huy báo "OK release".

## 1. XOÁ TÀI KHOẢN — BẬT KHI RELEASE (Huy quyết 01/10) — làm đúng thứ tự, mỗi bước xác nhận rồi mới sang bước sau

**Quyết định:** người dùng bấm xoá trong app thì tài khoản bị XOÁ LUÔN (không gửi email). Cờ `ACCOUNT_SELF_DELETE_ENABLED` = `true` trên production, **chỉ sau khi Huy báo "OK release"**.

### 1a. D1, D2, D4 là gì — nói bằng tiếng thường
Khi một người dùng bị xoá, hệ thống chỉ xoá sạch phần dữ liệu nào đã được «nối dây» với tài khoản đó. Ba migration này nối nốt những dây còn thiếu:
- **D1** — bảng «bộ nhớ AI» của từng người từng bị tạo tay trên production, kiểu dữ liệu sai và KHÔNG nối dây vào tài khoản. Xoá tài khoản xong, bộ nhớ AI (chuyện riêng tư người đó từng kể) **vẫn nằm lại và không ai thấy để dọn**. D1 sửa kiểu dữ liệu và nối dây (đồng thời xoá các dòng mồ côi đã có từ trước).
- **D2** — hai bảng nhỏ nữa (lưu kết quả tìm kiếm của một cuộc tư vấn, đếm lượt chat của khách) cũng chưa nối dây; xoá tài khoản thì chúng ở lại. D2 chỉ thêm hai sợi dây, không xoá gì.
- **D4** — chốt phần còn lại của lời hứa «xoá thật»: (i) trang kết quả đã chia sẻ công khai và thông báo mang tên người đó gửi cho người khác sẽ bị xoá theo (trước đây chỉ bị «bỏ tên»); (ii) tạo «chuông báo» tự động: mỗi khi một tài khoản bị xoá, hệ thống xếp việc xoá **ảnh, video, âm thanh đã tải lên** (nằm ở kho lưu trữ tệp, không nằm trong cơ sở dữ liệu) và thu hồi quyền Google Lịch. Không có chuông này thì tệp media **không bao giờ bị dọn**.
- **Vì sao bị loại khỏi lần release 29/09:** Huy hoãn vì lúc đó cờ xoá tài khoản để TẮT (xoá bằng email), nên chưa cần; thêm nữa production dùng gói Supabase Free **không có sao lưu tự động**, và D1 xoá dữ liệu mồ côi nên cần sao lưu trước.
- **Các «dây liên kết» có đúng là phần dọn dữ liệu khi xoá không?** Có. UAT từng đo thiếu đúng chỗ đó (bộ nhớ AI và kết quả tư vấn còn lại sau khi xoá tài khoản thử).
- **Nếu BẬT cờ khi chưa áp cả ba:** (1) một số bảng chặn việc xoá → người dùng bấm xoá thấy lỗi, tài khoản còn nguyên; (2) dữ liệu mồ côi ở lại (bộ nhớ AI, kết quả tư vấn); (3) ảnh/video/âm thanh KHÔNG bị dọn, trang chia sẻ công khai vẫn mở được; (4) cron dọn tệp báo lỗi 500. Tức là «xoá vĩnh viễn» sẽ là lời hứa không giữ được ⇒ KHÔNG bật khi chưa áp.
- **Đưa vào nhóm áp lúc release: CÓ** — vì cần thiết để xoá đúng. Thứ tự: D1 → D2 → D4. Mỗi file có rollback ở `supabase/migrations/rollback/` (`20260911b_user_memory_auth_fk_rollback.sql`, `20260925_account_deletion_cascade_gaps_rollback.sql`, `20260925c_account_deletion_f096_rollback.sql`). **Đã áp và thử trên DB audit (UAT) — đo 01/10 chỉ-đọc:** `user_memory.user_id` = uuid có dây cascade; hai khoá D2 cascade và đã validate; trigger `trg_enqueue_account_deletion` có; `shared_results.owner_id` và `notifications.actor_id` cascade; bảng `account_deletion_jobs` có.
- **Rủi ro khi áp trên production:** (i) D1 đổi kiểu cột và XOÁ các dòng mồ côi — không hoàn lại được ⇒ **bắt buộc sao lưu `pg_dump` trước** (DEPLOY-CHECKLIST §0); (ii) cần bảng khoá ngắn trên `user_memory` khi đổi kiểu — làm lúc ít người dùng; (iii) D2 có thể để khoá ở trạng thái «NOT VALID» nếu còn dòng mồ côi (không hỏng, chỉ cảnh báo); (iv) áp sai thứ tự (D2 trước D1) vi phạm điều kiện của file.

### 1b. Thứ tự PHẦN B (production) — chỉ sau "OK release"
1. Sao lưu production (§0 DEPLOY-CHECKLIST).
2. Áp D1 → D2 → D4; sau mỗi file chạy câu kiểm tương ứng (bên dưới) và ghi kết quả.
3. Bật `ACCOUNT_SELF_DELETE_ENABLED=true` (Vercel Production) → redeploy → `GET /api/config` phải có `flags.accountSelfDelete: true`.
4. **XOÁ THỬ** bằng MỘT trong hai tài khoản test production (`qa.release.a@tappyai.com` hoặc `…b`), tài khoản đã có dữ liệu mẫu (chat, địa điểm đã lưu, ảnh): **đếm trước** (hàng: chat, địa điểm lưu, review, bộ nhớ AI, kết quả tư vấn; tệp: số object của user trong bucket) → xoá trong app (gõ XÓA) → **đếm sau** (hàng = 0; tệp = 0 sau khi cron `account-deletion-jobs` chạy, tối đa 48 giờ; chạy tay cron để kiểm ngay).
5. Chỉ khi bước 4 qua mới báo release xong. Không qua → tắt cờ lại, báo Huy.
- Câu kiểm: D1 `select data_type from information_schema.columns where table_name='user_memory' and column_name='user_id'` = `uuid`; D2 `select conname from pg_constraint where conname in ('decision_evidence_owner_id_fkey','anon_chat_usage_user_id_fkey')` = 2 hàng; D4 `select tgname from pg_trigger where tgname='trg_enqueue_account_deletion'` = 1 hàng.

### 1d. Chặn người dùng — migration + cờ (nhánh sec/user-blocks-slice; chỉ sau khi phiên bảo mật duyệt VÀ Huy đồng ý)
Thứ tự PHẦN B đầy đủ: sao lưu → D1 → D2 → D4 → **migration chặn người dùng** → **migration báo cáo (`20261001b_user_reports.sql`)** → cờ.
1. `pg_dump` production TRƯỚC (DEPLOY-CHECKLIST §0). Không có bản sao lưu = không áp.
2. Áp `supabase/migrations/20261001_user_blocks.sql` (một giao dịch). Kiểm: `select to_regclass('public.user_blocks')` có giá trị; `select count(*) from pg_policies where policyname like 'user_blocks_%'` ≥ 6; `select count(*) from chat_blocks` bằng lúc trước khi áp.
2b. Áp `supabase/migrations/20261001b_user_reports.sql` (sau file chặn). Kiểm: `select to_regclass('public.user_reports')` có giá trị; `select count(*) from pg_policies where tablename='user_reports'` = 2.
3. **Hoàn lại:** `supabase/migrations/rollback/20261001_user_blocks_rollback.sql` (không đụng `chat_blocks`) và `rollback/20261001b_user_reports_rollback.sql` (chỉ bỏ bảng `user_reports`, không đụng `content_reports`).
4. Vercel → Project → Settings → Environment Variables → thêm `USER_BLOCKS_ENABLED=true` cho **Production** → **Redeploy** (biến đọc lúc build). Thêm `REPORTS_ENABLED=true` (cùng chỗ, chỉ SAU khi áp migration báo cáo) → Redeploy. Kiểm `GET /api/config` có `p8.userBlocks: true` và `p8.reports: true`.
5. Kiểm sau khi bật bằng HAI tài khoản test (không phải người thật): A chặn B ⇒ B không thấy bài/bình luận của A, không theo dõi/bình luận được; A bỏ chặn ⇒ khôi phục; chat giữa hai bên bị chặn; ẩn danh bấm chặn bị từ chối. Ghi kết quả.
5b. Kiểm báo cáo bằng hai tài khoản test: A báo cáo một bình luận của B và hồ sơ B → `200`; gửi lại → `alreadyReported`; B và người lạ không đọc được; kiểm `select reason, target_type from user_reports` bằng service role thấy 2 dòng. **Ai xem bảng `user_reports` và trong bao lâu là việc VẬN HÀNH (Apple 1.2: 24 giờ) — chưa có màn hình admin cho bảng này; hàng chờ kiểm duyệt hiện chỉ đọc `content_reports`.**
5c. **Tự đo truy vấn trên production (chỉ đọc, giờ ít người):** với một tài khoản test có 2–3 người bị chặn chạy trong SQL editor: `set local role authenticated; select set_config('request.jwt.claim.sub','<uuid test>',true); explain (analyze, buffers) select id from reviews where coalesce(is_hidden,false)=false order by created_at desc limit 200;` — chạy trước và sau migration. **Ngưỡng chấp nhận:** Execution Time sau ≤ 15 ms (đo tổng hợp: 2–3 ms ở 300.000 bài) và có dòng `InitPlan` cho `blocked_ids`. **Tắt khẩn:** vượt 50 ms, hoặc thấy nhiều lỗi 5xx ở feed → xoá `USER_BLOCKS_ENABLED` + redeploy; nếu chậm vẫn còn (chính sách RLS ở DB vẫn chạy) → chạy rollback chặn.
6. **Tắt khẩn cấp:** xoá hoặc đổi `USER_BLOCKS_ENABLED` / `REPORTS_ENABLED` khác `true` → Redeploy: route trả 404, app ẩn nút (đọc `p8.userBlocks`). Chính sách RLS ở DB vẫn lọc (an toàn); chỉ khi chính migration gây sự cố mới chạy rollback.

### 1c. Chữ cảnh báo trên màn xác nhận (nguyên văn Huy)
VI: «Xóa tài khoản vĩnh viễn? Toàn bộ dữ liệu của bạn sẽ bị xóa ngay và không thể khôi phục: lịch sử chat, địa điểm đã lưu, bài đăng, ảnh và clip. **[chỉ khi đang có gói trả phí]** Gói trả phí và credit còn lại sẽ mất, Tappy không hoàn lại phần chưa dùng. Xóa tài khoản không tự hủy gói trên App Store hoặc Google Play, bạn cần hủy gói ở đó để không bị tính phí tiếp. Gõ XÓA để xác nhận.»
EN: «Delete your account permanently? All your data will be deleted immediately and cannot be recovered: chat history, saved places, posts, photos and clips. **[only when you have a paid plan]** Your paid plan and any remaining credit will be lost, and Tappy does not refund the unused part. Deleting your account does not cancel your subscription on the App Store or Google Play — cancel it there so you are not charged again. Type DELETE to confirm.»
- Web: đoạn gói chỉ hiện khi `subscriptions.status = 'active'` (dữ liệu có sẵn, đã dùng cho huy hiệu Premium) — không thêm field.
- Android/iOS: chỉ sửa CHỮ (xem ANDROID-REQUESTS R29, IOS-REQUESTS I-5). Server biết gói, app có thể chưa biết ⇒ app dùng bản chung «Nếu bạn đang có gói trả phí, gói và credit còn lại sẽ mất …» nếu không có dữ liệu gói; KHÔNG đổi hợp đồng.
- Về hoàn tiền: câu «Tappy không hoàn lại phần chưa dùng» và «việc hoàn tiền (nếu có) do App Store/Google Play quyết theo chính sách của họ» **cần người am hiểu quy định bảo vệ người tiêu dùng xem lại** (việc của Huy).
- **Nút xoá (Huy 01/10, kiểu TikTok): hàng chữ thường, KHÔNG đỏ, mục «Khác», hàng cuối, xa «Đăng xuất».** Web đã đổi; Android/iOS làm theo R29 / I-5 (app hiện tại còn hàng đỏ cạnh Đăng xuất).
- Trang web `/delete-account` (link cho Google Play) hoạt động: nói xoá trong app (Cài đặt) hoặc email support@tappyai.com; thêm đoạn gói trả phí/hoàn tiền (App Store/Google Play quyết).

## 2. Đăng video lên production (PHẦN B-a)

Mục tiêu: bài đăng video trên www.tappyai.com ghi vào bucket production, không đụng bucket UAT.
- Bucket: `tappyai-media-prod`. Service account: `tappyai-media-bridge` với vai trò `objectUser` trên bucket đó (phía Google Android session đã đo đúng).
- 🔐 Vercel → Settings → Environment Variables → **Production**, phải CÓ: `GCP_PROJECT_NUMBER` = `1023373437508`, `GCP_WIF_POOL` = `vercel-oidc`, `GCP_WIF_PROVIDER` = `vercel` (và tên service account nếu code đọc biến riêng).
- Phải KHÔNG có: `GCS_MEDIA_BUCKET`, `GCP_MEDIA_SERVICE_ACCOUNT`, và không biến `GCP_*` nào mang giá trị có `-uat` (nếu có → video production sẽ chảy vào bucket UAT).
- Sau deploy production: Claude đăng thử MỘT clip ngắn bằng tài khoản test production (`qa.release.a@tappyai.com`), mở lại link video công khai, rồi xoá clip đó bằng chính tài khoản. Cần Huy báo "OK release" trước; ghi vào DB production.

## 3. Đăng nhập Google trên bản Play (PHẦN B-b)

Bản cài từ Play được Google ký lại bằng **App signing key**, vân tay khác khoá upload. Không có OAuth client Android khớp vân tay đó, nút «Tiếp tục với Google» có thể lỗi trên bản Play (Claude suy từ cách Google Sign-In hoạt động; chưa kiểm vì không xem được console).
1. 🔐 Play Console → TappyAI → **Test and release → App integrity → App signing** → mục **App signing key certificate** (KHÔNG phải Upload key) → copy **SHA-1** và **SHA-256**.
2. 🔐 Google Cloud Console (dự án `aerobic-lock-498409-u7`) → **APIs & Services → Credentials**. Trong «OAuth 2.0 Client IDs» xem đã có client loại **Android** cho `com.tappyai.app` chưa và vân tay của nó có trùng SHA-1 ở bước 1 không.
   - Chưa có/không trùng → **+ Create credentials → OAuth client ID** → Application type **Android** → Name: `TappyAI Android (Play signing)` → Package name `com.tappyai.app` → SHA-1 certificate fingerprint = SHA-1 bước 1 → **Create**. (Giữ nguyên client Web hiện có — Supabase và app dùng nó.)
3. 🔐 (Không bắt buộc cho FCM) Firebase Console → Project settings → app `com.tappyai.app` → **Add fingerprint** → dán SHA-1 rồi SHA-256 của App signing key.
4. Gửi Claude SHA đã dùng (chỉ vân tay, không phải khoá). Sau khi cài bản Play Internal: Huy bấm «Tiếp tục với Google» thử.

## 4. Biến AI (nhắc lại từ B0, bảng đầy đủ ở RELEASE-PLAN §2g)

Trước deploy production Claude kiểm TÊN biến: có `OPENAI_API_KEY`; KHÔNG có `LLM_PROVIDER` (giá trị `claude` gọi Anthropic đang hết credit); không có `HAIKU_FALLBACK`; `SERPER_CACHE_V2=1`.
B3 trong OWNER-TOMORROW còn nói đặt trần chi tiêu ở console.anthropic.com — vì AI chạy trên OpenAI, trần cần đặt ở **platform.openai.com → Settings → Limits** (đã sửa theo thực tế; Claude suy luận, Huy xác nhận).

## 5. Trang /privacy

Đã sửa trong code (vi + en) để khớp OpenAI; Huy duyệt chữ **trước** khi lên production. Sau khi duyệt, Data safety trên Play (PLAY-CONSOLE-PASTE mục A) phải khai OpenAI là bên nhận dữ liệu chat.

## 6. Chuỗi giữ chỗ «[XÁC NHẬN: …]» (E1) — ĐÃ XỬ LÝ 01/10
- Trang web / email / /privacy / /delete-account / trang xoá trong app: không có chuỗi «[XÁC NHẬN»; hai con số «30 ngày» chưa xác nhận đã BỎ (trang xoá: «…xác minh yêu cầu rồi xóa tài khoản»; nhật ký máy chủ: «giữ trong thời gian ngắn rồi tự động xóa»). Bản iOS còn chuỗi giữ chỗ do chép từ DRAFT (IOS-REQUESTS I-4).
