# Việc anh tự làm — bảo mật (2026-09-30)

> Đi kèm `SECURITY-AUDIT-2026-09-30.md`. Thứ tự đã sắp theo mức gấp. Ô ☐ để anh đánh dấu.
> Không có bước nào cần gửi mật khẩu/khoá cho ai; mọi thao tác là trên console của chính anh.

---

## 0. Trước / cùng release Phase 7

☐ **0.1 Áp migration H1+M1 (UPDATE) lên production** — không phụ thuộc code, có test + rollback.
Làm theo `D:\Claude\Projects\TappyAI\security-fixes-prod-apply.md` **Bước 3** (pre-flight → áp `supabase/migrations/20260927_owner_update_column_privileges.sql` → 2 câu kiểm → thử sửa tên/bio/avatar/ẩn bài/like/lưu/bình luận/follow).
Lý do: hôm nay đo trên DB audit, chủ bài vẫn tự sửa được `publication_state`/`is_verified`/bộ đếm của bài mình qua PostgREST (DB-1). Prod nhiều khả năng giống vậy.

☐ **0.2 Kiểm Apple IAP trên production có đang bật không** (quyết định API-1 có đang mở trên prod hay không):
1. Vercel → project **tappyai-mvp** → Settings → Environment Variables → lọc **Production**.
2. Có **`APPLE_IAP_KEY_ID` + `APPLE_IAP_ISSUER_ID` + `APPLE_IAP_PRIVATE_KEY`** không?
   - **Không có** ⇒ route trả 503 (đóng) — lỗ không khai thác được; để sửa sau release.
   - **Có** ⇒ ai có tài khoản Apple Developer (hoặc giao dịch Sandbox) lấy được Pro miễn phí. Báo tôi để tách riêng commit `fea7f38` thành hotfix; hoặc tạm **xoá 3 biến đó** khỏi Production + Redeploy (Pro chưa bán nên không ảnh hưởng ai).

## 1. Xác thực 2 lớp (2FA) — làm càng sớm càng tốt

Ưu tiên **khoá bảo mật / passkey**, sau đó **app TOTP** (Google Authenticator, 1Password, Authy). **Không** dùng SMS nếu có lựa chọn khác. Lưu **mã khôi phục** vào trình quản lý mật khẩu (không lưu trong repo/ổ D).

| ☐ | Dịch vụ | Đường dẫn |
|---|---|---|
| ☐ | **GitHub** | github.com → ảnh đại diện → Settings → **Password and authentication** → Two-factor authentication → Enable → chọn *Authenticator app* (hoặc *Passkey*). Sau đó: Settings → **Sessions** → thu hồi phiên lạ. |
| ☐ | **Vercel** | vercel.com → Account Settings → **Authentication** → *Two-Factor Authentication* → Enable (TOTP) + thêm Passkey. Team → Settings → **Security** → bật *Enforce 2FA for all members*. |
| ☐ | **Supabase** | supabase.com/dashboard → ảnh đại diện → **Account preferences** → *Multi-factor authentication* → Add new factor (TOTP). Organization → Settings → **Security** → *Require MFA to access organization*. |
| ☐ | **Google Cloud / Firebase** (cùng tài khoản Google) | myaccount.google.com → **Security** → *2-Step Verification* → bật; thêm **Passkey/Security key**. Nếu dùng Google Workspace: Admin console → Security → 2SV → Enforce. |
| ☐ | **Apple Developer / App Store Connect** | appleid.apple.com → **Sign-In and Security** → *Two-Factor Authentication* (bắt buộc với Developer — kiểm đang bật) → thêm **Security Keys** nếu có. App Store Connect → Users and Access → rà người có quyền Admin/Finance. |
| ☐ | **Google Play Console** | Dùng tài khoản Google đã bật 2SV ở trên. Play Console → **Users and permissions** → rà quyền; Settings → Developer account → *Account details* → kiểm email liên hệ. |
| ☐ | **OpenAI** | platform.openai.com → Settings → **Security** (hoặc Profile → *Multi-factor authentication*) → Enable. Organization → Members → rà. |
| ☐ | **Anthropic** | console.anthropic.com → Settings → **Security / Two-factor** → Enable (nếu dùng SSO Google thì 2SV của Google là lớp bảo vệ). Members → rà. |
| ☐ | **ACCESSTRADE** | pub.accesstrade.vn → Tài khoản → **Bảo mật** → bật xác thực 2 lớp nếu có; nếu không có 2FA: đặt mật khẩu dài duy nhất trong trình quản lý mật khẩu + bật thông báo đăng nhập/thay đổi thông tin thanh toán. |
| ☐ | **Email gốc** `huypham.sm@gmail.com` | Đây là chìa khoá khôi phục của mọi thứ trên: 2SV + passkey, rà *Third-party access* và *Recovery phone/email*. |

## 2. Giới hạn chi tiêu & cảnh báo (chống đốt tiền API)

☐ **Anthropic** console → Settings → **Limits**: đặt *monthly spend limit* + email cảnh báo 50% / 80%.
☐ **OpenAI** → Settings → **Limits**: *hard limit* + *soft limit* email.
☐ **Google Cloud** → Billing → **Budgets & alerts**: ngân sách tháng cho project có Places/Maps/Firebase, cảnh báo 50/90/100%. APIs & Services → Places API → **Quotas**: đặt trần request/ngày.
☐ **Serper** dashboard: bật cảnh báo hết credit (không tự nạp không giới hạn).

## 3. Sau release — đổi khoá (rotate)

Nguyên tắc chung cho mỗi khoá: **tạo khoá mới → thêm vào Vercel (Production + Preview) → Redeploy → kiểm tính năng → mới thu hồi khoá cũ**. Không rotate trong lúc đang release.

☐ **3.1 Khoá Google Places cũ `AIzaSyAl…NLcs`** (SEC-1 — từng nằm trong `.claude/settings.local.json`; chưa từng lên git)
1. Google Cloud Console → APIs & Services → **Credentials** → tìm khoá có 4 ký tự cuối `NLcs`.
2. Nếu khoá này **không** phải khoá đang dùng trong Vercel (`GOOGLE_PLACES_API_KEY` hiện bắt đầu `AIzaSyAB…`): **Delete** luôn.
3. Nếu còn dùng ở đâu: tạo khoá mới → *API restrictions*: chỉ **Places API (New)** → *Application restrictions*: IP (không áp được cho Vercel) nên dựa vào *quota* + *budget* (§2) → thay vào Vercel → Redeploy → xoá khoá cũ.
4. Xoá file `D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\funny-gauss-cdd1a8\.claude\settings.local.json` và `…\sleepy-feynman-e4b80e\.claude\settings.local.json` (hoặc xoá dòng chứa khoá) — 2 worktree cũ.

☐ **3.2 Token Travelpayouts** (H2 — nằm trong lịch sử git **public**, commit `22135f2`): travelpayouts.com → Profile → **API token** → *Regenerate* (hoặc đóng tài khoản nếu không dùng). Merge nhánh `chore/remove-travelpayouts` sau release.

☐ **3.3 Khoá Firebase Android** (M3, trong `android/app/google-services.json` — công khai theo thiết kế): Credentials → khoá đó → *Application restrictions* = **Android apps** (`com.tappyai.app`, `.debug`, `.staging` + SHA-1 chữ ký) → *API restrictions* = chỉ các API Firebase cần (FCM Registration, Installations). **Không** để khoá này gọi được Places/Maps.

☐ **3.4 Các khoá quan trọng khác — kế hoạch** (đổi lần lượt, mỗi tuần 1–2 khoá, sau release ổn định):

| Khoá | Nơi đổi | Ảnh hưởng khi đổi | Ưu tiên |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` (prod) | Supabase → Project Settings → API → chuyển sang **API keys mới (sb_secret_…)**, tạo secret key mới → Vercel → Redeploy → *disable* JWT legacy | Mọi route server; làm lúc ít người dùng | Cao — có bản sao trên ổ đĩa (L5) |
| Mật khẩu DB prod | Supabase → Database → Reset password | Chỉ công cụ/psql của anh | Cao (L5) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Console → API keys → tạo mới → Vercel → xoá cũ | Chat/AI | Trung bình |
| `SERPER_API_KEY`, `GOOGLE_PLACES_API_KEY` | Dashboard tương ứng | Tìm kiếm/địa điểm | Trung bình |
| `CRON_SECRET` | Tự sinh 32+ byte ngẫu nhiên → Vercel | Cron (Vercel tự gửi header) | Thấp |
| `CCP_ATTRIBUTION_SECRET` | Tự sinh ≥ 32 ký tự | **Link `/go/at` cũ hết hiệu lực** (chỉ mất gắn sub1, người dùng vẫn tới merchant) | Thấp |
| `VAPID_PRIVATE_KEY` | Sinh cặp mới | **Mọi đăng ký Web Push cũ mất** — chỉ đổi khi có lý do | Thấp |
| Apple `.p8` (IAP, ASC API) | App Store Connect → Users and Access → Keys | IAP verify, CI TestFlight | Thấp — file `.p8` đang ở `D:\secrects` ⇒ chuyển vào trình quản lý mật khẩu |
| `VERCEL_BYPASS_SECRET` (UAT) | Vercel → Deployment Protection → Protection Bypass | APK UAT cũ mất quyền vào preview | Khi APK UAT đã phát tán rộng |
| Zalo, LINE, Google OAuth client secret | Console tương ứng | Đăng nhập mạng xã hội | Thấp |
| KV/Upstash token | Vercel Storage | Rate limit (fail-closed khi sai ⇒ đổi cẩn thận) | Thấp |

☐ **3.5 Dọn secret trên ổ đĩa** (L5): trong `D:\Claude\Projects\TappyAI\tappyai-mvp\` có `.env.production.local`, `.env.production.tmp`, `.env.vercel.prod.tmp`, `.env.vercel.tmp`, `.env.local.PRODUCTION-DO-NOT-USE.bak`, `.env.local.bak-before-restore` ⇒ chuyển giá trị cần giữ vào trình quản lý mật khẩu rồi xoá file. `.env.production.local` còn khiến `next build/start` ở thư mục đó **trỏ thẳng PROD**.

## 4. Sau release — branch protection (GitHub)

☐ github.com/<owner>/<repo> → Settings → **Rules → Rulesets** → *New branch ruleset*:
- Target: `main` và `rc/web-uat`.
- ☑ Restrict deletions · ☑ Block force pushes · ☑ Require a pull request before merging (1 approval nếu có người review; nếu làm một mình: vẫn bật PR để có CI) · ☑ Require status checks to pass (chọn job regression/typecheck/build) · ☑ Require linear history (tuỳ chọn).
- Bypass list: chỉ tài khoản của anh (để hotfix khẩn cấp).
☐ Settings → **Code security**: bật *Secret scanning* + *Push protection* (repo public = miễn phí) — chặn push có khoá ngay từ đầu. Bật *Dependabot alerts* + *Dependabot security updates*.
☐ Settings → **Actions → General**: *Workflow permissions* = Read repository contents; bỏ “Allow GitHub Actions to create and approve pull requests”.

## 5. Sau release — gộp nhánh bảo mật

☐ Khi anh cho phép: review nhánh `security/hardening-2026-09-30` (22 commit: 6 của `fix/security-medium-low` + 16 mới, xem báo cáo §11) → merge vào rc → full test → build → deploy.
☐ Rồi áp migration theo thứ tự (mỗi cái đều có pre-flight + câu kiểm + rollback):
1. `20260928_revoke_reviews_insert.sql` — **chỉ sau** khi code POST /api/reviews (service role) đã chạy trên prod.
2. `20260928b_revoke_increment_deal_click_public.sql` — sau khi code deal click (service role) lên prod.
3. `20260928c_review_comments_publication_boundary.sql`.
4. `20260930_content_reports_insert_check.sql` — không phụ thuộc code.
5. `20260930b_review_interactions_bounds.sql` — không phụ thuộc code.
☐ Kiểm lại trên prod bằng 2 truy vấn chỉ-đọc (SQL Editor):
```sql
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
 where schemaname='public' and (qual='true' or with_check='true');
select table_name, privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name in ('reviews','profiles','content_reports') and grantee='authenticated';
```

## 6. Sau release — media & quyền riêng tư

☐ **Quét GPS trong ảnh cũ** (UP-4, ảnh tải lên trước 24/09): cho phép tôi viết script **chỉ đọc** liệt kê object `reviews/`, `avatars/`, `covers/` trong bucket prod và báo object còn EXIF/GPS (không sửa gì) — hoặc anh tự chạy. Sau đó quyết xử lý lại/xoá metadata.
☐ **Quyết hướng cho media của bài đã xoá/ẩn/hạn chế** (UP-2): (a) xoá object khi xoá bài; (b) bucket private + signed URL; (c) giữ nguyên.
☐ **Quyết hướng cho trang `/r/<slug>`** (WEB-3): (a) ký câu trả lời phía server; (b) tạm chỉ hiện link nền tảng quen + nhãn “do người dùng chia sẻ”.

## 7. App di động (bản kế tiếp sau release)

☐ Duyệt sửa **MOB-1** (nhận phiên qua deep link phải có `state` do app tạo + hỏi khi đổi tài khoản) cho cả Android và iOS.
☐ Kiểm **MOB-2** trên 1 máy Android đã đăng nhập: `adb shell run-as com.tappyai.app ls shared_prefs` — nếu thấy file của supabase-kt chứa phiên ⇒ báo tôi.
☐ iOS: thêm `appAccountToken = user.id` khi mua StoreKit 2 (để server ràng buộc giao dịch ↔ tài khoản).
