# ENV-RELEASE-CHECKLIST — biến môi trường và việc console cho release (01/10/2026)

Tệp này gom các mục PHẦN B mới (từ báo cáo phiên Android `docs/android/OVERNIGHT-2026-10-01.md` và `PLAY-CONSOLE-PASTE.md`)
vào một chỗ. Nó **bổ sung** `OWNER-TOMORROW-2026-09-30.md` B0…B8, không thay thế. `docs/phase8/ENV-RELEASE-CHECKLIST.md`
chỉ có ở nhánh Phase 8 (đã đỗ) — tệp này mới là bản của rc.
🔐 = bước cần đăng nhập tài khoản của Huy. Claude KHÔNG đọc giá trị bí mật nào; chỉ kiểm TÊN biến khi anh yêu cầu.
Không có bước nào dưới đây được làm trước khi Huy báo "OK release".

## 1. Quyết định của Huy — TRƯỚC khi upload AAB lên Play

**`ACCOUNT_SELF_DELETE_ENABLED` (Production, mặc định TẮT).** Đổi chữ trong app, nên phải chốt trước khi dựng/gửi AAB.

| | Cờ TẮT | Cờ BẬT |
|---|---|---|
| Hàng trong Cài đặt → Khác | «Yêu cầu xóa tài khoản» | «Xóa tài khoản» |
| Bấm vào | hộp xác nhận → mở email tới hỗ trợ; KHÔNG xoá, KHÔNG đăng xuất | trang liệt kê dữ liệu bị xoá → gõ **XÓA** → xoá NGAY → đăng xuất |
| Tệp ảnh/video/âm thanh | người vận hành xoá theo runbook `docs/ops/ACCOUNT-DELETION.md` | cron 01:45 VN, trong 48 giờ |

- 🛑 **Kiểm D1/D2/D4 đã áp trên production TRƯỚC khi quyết bật cờ** (đo bằng SQL, chỉ đọc):
  - **D1** `20260911b_user_memory_auth_fk`: `user_memory.user_id` đổi `text → uuid` + khoá ngoại CASCADE tới `auth.users` (xoá cả hàng mồ côi). Kiểm: `select data_type from information_schema.columns where table_name='user_memory' and column_name='user_id'` phải là `uuid`.
  - **D2** `20260925_account_deletion_cascade_gaps`: hai khoá ngoại còn thiếu `decision_evidence_owner_id_fkey`, `anon_chat_usage_user_id_fkey` → CASCADE. Kiểm: `select conname from pg_constraint where conname in ('decision_evidence_owner_id_fkey','anon_chat_usage_user_id_fkey')` phải trả 2 hàng.
  - **D4** `20260925c_account_deletion_f096`: đổi hành động của các khoá ngoại còn lại (F-096: `confdeltype` từ `n` sang cascade) **và** tạo trigger `trg_enqueue_account_deletion` (xếp việc dọn tệp ảnh/video/âm thanh + thu hồi Google Lịch vào `account_deletion_jobs`). Kiểm: `select tgname from pg_trigger where tgname='trg_enqueue_account_deletion'` phải có 1 hàng.
  - Tất cả đều ĐÃ HOÃN ở bản release 29/09 (RELEASE-PLAN §1; cờ để TẮT) và có file rollback ở `supabase/migrations/rollback/`. Hệ quả nếu BẬT cờ khi chưa áp: (i) `auth.admin.deleteUser` có thể **thất bại** vì khoá ngoại không cascade → người dùng bấm xoá thấy lỗi «Chưa xóa được tài khoản» (tài khoản còn nguyên); (ii) bảng không cascade để lại **dữ liệu mồ côi**; (iii) không có trigger ⇒ **ảnh/video/âm thanh đã tải lên KHÔNG bị dọn** và cron `/api/cron/account-deletion-jobs` báo 500. Tức là không an toàn để bật cờ khi chưa áp cả ba — và cần backup trước khi áp (DEPLOY-CHECKLIST §0: production Free, không có backup tự động; D1 xoá hàng mồ côi).
- Google Play (https://support.google.com/googleplay/android-developer/answer/13327111): app cho tạo tài khoản trong app phải có
  đường xoá TRONG app **và** link web để yêu cầu xoá; email/biểu mẫu được chấp nhận cho phần web; vô hiệu hoá/đóng băng không tính.
  Một app chỉ mở email có nguy cơ bị từ chối ở khai báo Data deletion. **Đề xuất của Claude: BẬT.** (Đây là đề xuất, quyết định là của Huy.)
- Cách bật: 🔐 Vercel → tappyai-mvp → Settings → Environment Variables → thêm `ACCOUNT_SELF_DELETE_ENABLED` = `true`, môi trường **Production** → Save → redeploy production (biến chỉ có hiệu lực ở bản deploy mới).
- Cờ chỉ có giá trị đúng chữ `true`. Kiểm sau deploy: `GET /api/config` → `flags.accountSelfDelete: true`.

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

## 6. Chuỗi giữ chỗ «[XÁC NHẬN: …]» (E1, 01/10)

- **Trang người dùng web / email / /privacy / /delete-account / trang xoá trong app: KHÔNG còn chuỗi «[XÁC NHẬN» nào** (tìm toàn bộ `src/`, `public/`, `supabase/`: 0 kết quả). Chuỗi chỉ còn trong tài liệu: `docs/uat/DELETE-ACCOUNT-COPY-DRAFT.md` (dòng 10, 17, 22, 73, 84, 107, 114) và «CẦN HUY XÁC NHẬN» trong `docs/release/PLAY-LISTING.md`.
- Bản iOS thấy «[XÁC NHẬN: 30 ngày]» là **bản chép tay từ DRAFT trong app iOS** (không phải từ web) — phiên iOS phải thay trước khi build (IOS-REQUESTS I-4).
- Hai con số web đang hiển thị mà Huy **chưa duyệt / chưa đo** — cần Huy chốt chữ:
  1. `legal.delete.s1.p2` (đường email, cờ TẮT): hiện «…xóa tài khoản **trong vòng 30 ngày**.» Đề xuất: «…xóa tài khoản trong vòng 30 ngày kể từ khi xác minh xong.» (EN: «…within 30 days of verifying it.»)
  2. `legal.delete.s4.b3`: hiện «Nhật ký máy chủ … lưu **tối đa 30 ngày** rồi xóa.» — thời hạn **chưa đo** (Vercel/GCP). Đề xuất: bỏ con số, ghi «Nhật ký máy chủ dùng để vận hành dịch vụ được giữ trong thời gian ngắn rồi xóa tự động.» cho tới khi đo xong.
- Không sửa chữ ở đợt đóng băng này (cần Huy duyệt); chỉ liệt kê.
