# PRELAUNCH — sửa lỗi và UAT (2026-09-24)

```
> npm run whoami
  worktree : D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\g1-place-guard
  branch   : rc/web-uat
  commit   : 4e70b02 (+ local changes)      ← lúc bắt đầu PRELAUNCH; SHA cuối cùng ở mục FINISH
  supabase : zdaprdfgpbpnxyofagmc  ✅ audit/non-prod
  dev port : 3007
```

Chưa deploy, chưa push. Không kết nối DB production. Mỗi mục một commit. Làm sau phần ranh giới public/app (`PUBLIC-BOUNDARY-FIX.md`).

---

## Part 1 — Quyết định đã chốt (áp dụng, không bàn lại) — commit `97b0ad1`

- **Số thẻ vẫn là 8 (3 thẻ trên màn hình đầu).** Đóng hạng mục Session D bằng **F-060 closed-not-a-bug**.
  - Số đo: 3 câu hỏi đồ ăn × 3 lần chạy (MAX_ITEMS 3 và 8). Lượt nào cũng gọi Serper 2 lần, 4 credit; model nhận cùng 10 địa điểm.
  - Evidence: `docs/uat/evidence/serper-credits-per-turn-2026-09-24.json`.
- **Music vẫn ẩn.** Không review bản quyền, không xoá code.
- **Không thiết kế lại prompt theo từng domain** trước launch.
- **DEPLOY-CHECKLIST**: 15,000 credit/ngày ≈ **3,750 lượt hỏi đồ ăn**, không phải ≈ 2,500.
  - Đo được 4 credit/lượt (`/maps` 3 + `/search` 1, theo trường `credits` do Serper trả về), 9/9 lượt. Con số cũ giả định 6.
  - Lượt có gọi `/images` hoặc `/shopping` thì tốn hơn; phần này **chưa đo**.

## Part 2 — Secret production trên đĩa

### 🚨 Sự cố trong chính phiên này, do tôi

Khi so sánh giá trị giữa các file, tôi đặt tên hàm PowerShell là `H`. Đây là alias sẵn có của `Get-History`, nên thông báo lỗi đã **in nguyên giá trị** ra output công cụ, và các giá trị đó giờ nằm trong transcript:
- `ANTHROPIC_API_KEY` (khoá production; audit cũng dùng khoá này);
- `SERPER_API_KEY`;
- `GOOGLE_PLACES_API_KEY`;
- **Supabase PAT "PAT1"** (`SUPABASE_ACCESS_TOKEN`, cấp tài khoản, quản trị được cả project production);
- URL Redis/KV có kèm mật khẩu và `KV_REST_API_READ_ONLY_TOKEN` (từ các file .bak production);
- 2 `VERCEL_OIDC_TOKEN` (đã hết hạn từ 08/2026).

Không có gì bị gửi tới dịch vụ bên ngoài, nhưng hãy coi các khoá trên là **đã lộ và phải rotate** (xem danh sách cuối Part 2). Ghi vào **F-061 (P0)**. Mọi phép so sánh sau đó chỉ in nhãn (`PAT1`, `ANT3`…) hoặc "giống/khác".

### Đính chính báo cáo PRE-REDESIGN

`.env.production.local` **không** chứa giá trị service-role, Stripe hay Zalo secret. Các biến `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` và `ZALO_APP_SECRET` có mặt nhưng **rỗng**; đó là cách `vercel env pull` ghi biến "sensitive". Service-role key production **thật** nằm trong `.env.local.PRODUCTION-DO-NOT-USE.bak`. Tôi đã sai khi viết điều ngược lại trong PRE-REDESIGN-AUDIT.

### Mọi file có credential production (chỉ đường dẫn và TÊN biến có giá trị)

Cách quét:
- `find_prod_secrets.ps1`: quét theo tên file, trên `D:\Claude`, junction `C:\Users\Admin\Claude`, Downloads, Desktop, Documents, `%TEMP%\claude`;
- `scan_content.ps1`: quét theo nội dung trong `D:\Claude\Projects\TappyAI`, tìm `sk_live_`/`rk_live_`, `whsec_`, `sbp_`, `sk-ant-api03-` và ref production.

`C:\Users\Admin\Claude` là **junction** trỏ vào `D:\Claude`, nên mỗi file bên dưới xuất hiện hai lần nhưng thực chất là một.

| # | File | Nội dung production (tên biến có giá trị) | Xoá? |
|---|---|---|---|
| 1 | `tappyai-mvp\.env.production.local` | ref production (`NEXT_PUBLIC_SUPABASE_URL`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `BLOB_WEBHOOK_PUBLIC_KEY`, `VERCEL_OIDC_TOKEN`, `VERCEL="1"`. Có 26 tên rỗng (service-role, Stripe ×3, Zalo secret, Serper…) | **XOÁ.** Next tự nạp file này khi `build`/`start` |
| 2 | `tappyai-mvp\.env.production.tmp` | giống #1, thêm `NEXT_PUBLIC_SUPERTUX_*` | **XOÁ** |
| 3 | `tappyai-mvp\.env.vercel.prod.tmp` | giống #1 | **XOÁ** |
| 4 | `tappyai-mvp\.env.vercel.tmp` | ref production, anon key, `ANTHROPIC_API_KEY`, `VERCEL_OIDC_TOKEN` | **XOÁ** |
| 5 | `tappyai-mvp\.env.local.PRODUCTION-DO-NOT-USE.bak` | **`SUPABASE_SERVICE_ROLE_KEY` (production)**, **`SUPABASE_ACCESS_TOKEN` (PAT1)**, `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GOOGLE_PLACES_API_KEY`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`, anon key, `VERCEL_OIDC_TOKEN` | **XOÁ** |
| 6 | `tappyai-mvp\.env.local.bak-before-restore` | ref production, **`KV_REST_API_TOKEN`** (đọc/ghi), `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, anon key, `VERCEL_OIDC_TOKEN` | **XOÁ** |
| 7 | `tappyai-mvp\.claude\settings.local.json` | **Supabase PAT "PAT2"** (khác PAT1) cùng ref production, nằm trong 4 lệnh `Bash(...)` được allowlist | **Không xoá file**: gỡ 4 dòng allowlist đó, rồi thu hồi PAT2 |
| 8 | `tappyai-mvp\.env.local` (đã trỏ về **audit**) | **PAT1** (cùng token với #5) và `ANTHROPIC_API_KEY` production | **Không xoá**: gỡ dòng `SUPABASE_ACCESS_TOKEN`; đổi sang khoá Anthropic non-prod |
| 9 | `…\worktrees\g1-place-guard\.env.local` (audit, dùng cho UAT) | `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GOOGLE_PLACES_API_KEY`, đều **giống hệt production** | **Không xoá** (cần cho UAT). Nên cấp khoá non-prod riêng |
| 10 | `…\worktrees\audit-nonprod\.env.local` | `ANTHROPIC_API_KEY` production | như #9 |
| — | `tappyai-mvp\.next\` (cache dev cũ, 09-06) | ref production được inline vào build (không phải credential) | nên xoá cùng lúc |

Không tìm thấy khoá Stripe live (`sk_live_`/`rk_live_`) hay `whsec_` ở bất kỳ file nào.

### Đã có trong Vercel production chưa (để chắc xoá local không mất gì)

Lệnh `vercel env ls production` (CLI đã đăng nhập `huyphamsm-tappy`, project `tappyai-mvp`) chỉ đọc; giá trị hiện là "Encrypted".
- **Có trong Production:** `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `ZALO_APP_SECRET`, `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GOOGLE_PLACES_API_KEY`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`, `KV_REST_API_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `GOOGLE_CLIENT_SECRET`, `PLATFORM_OWNER_USER_ID`.
- **Không có trong danh sách:**
  - `SUPABASE_ACCESS_TOKEN`: PAT cá nhân dùng cho Supabase CLI, không phải biến runtime. Xoá #5 thì mất bản local này, nhưng PAT1 đã lộ và **phải thu hồi** dù sao.
  - `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`: có trong bản `vercel env pull` (#1, theo tên) nhưng không hiện trong `env ls`. Khả năng cao là tích hợp Blob store quản lý; **UNVERIFIED**.
  - `VERCEL_OIDC_TOKEN`: hệ thống tự cấp cho mỗi deployment; không cần giữ.
- **Giá trị có khớp không: UNVERIFIED, và cố ý không kiểm.** Muốn so giá trị thì phải pull bản giải mã về đĩa, tức tạo lại đúng loại file đang cần xoá. Production chạy bằng giá trị trong Vercel, không đọc các bản local này.

### Xoá — ⏸ BẠN phải tự chạy

Tôi **không được phép xoá vĩnh viễn file**, kể cả khi được yêu cầu (quy tắc an toàn của tôi). Lệnh chính xác, chạy trong PowerShell:

```powershell
Remove-Item -LiteralPath `
  'D:\Claude\Projects\TappyAI\tappyai-mvp\.env.production.local', `
  'D:\Claude\Projects\TappyAI\tappyai-mvp\.env.production.tmp', `
  'D:\Claude\Projects\TappyAI\tappyai-mvp\.env.vercel.prod.tmp', `
  'D:\Claude\Projects\TappyAI\tappyai-mvp\.env.vercel.tmp', `
  'D:\Claude\Projects\TappyAI\tappyai-mvp\.env.local.PRODUCTION-DO-NOT-USE.bak', `
  'D:\Claude\Projects\TappyAI\tappyai-mvp\.env.local.bak-before-restore'
Remove-Item -LiteralPath 'D:\Claude\Projects\TappyAI\tappyai-mvp\.next' -Recurse
```

Sau đó mở hai file sau và xoá tay:
- `tappyai-mvp\.claude\settings.local.json`: 4 mục `Bash(...)` có chứa `sbp_`;
- `tappyai-mvp\.env.local`: dòng `SUPABASE_ACCESS_TOKEN=`.

Chạy xong, bảo tôi; tôi sẽ chạy lại `find_prod_secrets.ps1` và `scan_content.ps1` để xác nhận còn 0 file.

### Guard mở rộng — commit `6320364`

`scripts/prodEnvGuard.mjs`, được gọi từ `next.config.mjs` ở **mọi** lệnh `next`:
- Từ chối `dev`, `build`, `start` khi **bất kỳ** giá trị env nào của process, **hoặc bất kỳ file env nào Next nạp** (`.env`, `.env.local`, `.env.development[.local]`, `.env.production[.local]`, đọc trực tiếp từ đĩa), chứa ref production. Thông báo nêu tên file/biến, không bao giờ nêu giá trị.
- Chỉ miễn cho build **thật** trên Vercel: cần `VERCEL=1` **và** `cwd` bắt đầu bằng `/vercel/`. Cần điều kiện thứ hai vì chính file pull #1 cũng chứa `VERCEL="1"`.
- `ALLOW_PROD_SUPABASE_IN_DEV=1` in **banner lớn mỗi lần khởi động**, nêu đích danh cái nó cho qua. Nếu không có gì production, banner nhắc gỡ override.
- Test: `scripts/prodEnvGuard.test.mjs`, 13 ca, đều đạt.

**Chứng minh** (bản sao `git archive` của `6320364`; không có credential; mạng bị chặn bằng preload `netblock.cjs`, thứ ghi lại mọi DNS/connect và chặn mọi thứ không phải loopback):
- Fixture duy nhất là `.env.production.local` chứa `NEXT_PUBLIC_SUPABASE_URL="https://fwznnobrdctuskgrvuik.supabase.co"` và `VERCEL="1"`, không có khoá nào.
- Log đầy đủ: `docs/uat/evidence/prod-guard-2026-09-24/`.

```
===== next build  -> exit status 1
   🛑 REFUSING TO START `next build` — this checkout points at the PRODUCTION Supabase project (fwznnobrdctuskgrvuik).
   Env files with the production ref: .env.production.local
   Variables with the production ref: NEXT_PUBLIC_SUPABASE_URL
   netlog: node-processes=1  remote-attempts=0  loopback-connects=0
===== next start  -> exit status 1
   🛑 REFUSING TO START `next start` — … Env files: .env.production.local · Variables: NEXT_PUBLIC_SUPABASE_URL
   netlog: node-processes=1  remote-attempts=0  loopback-connects=0
===== next dev  -> exit status 1
   🛑 REFUSING TO START `next dev` — … Env files with the production ref: .env.production.local
   netlog: node-processes=1  remote-attempts=0  loopback-connects=0
===== ALLOW_PROD_SUPABASE_IN_DEV=1  next start  -> exit status 1
   !!  ⚠️  ALLOW_PROD_SUPABASE_IN_DEV=1 — the production-database guard is OVERRIDDEN
   !!  🔴 PRODUCTION project fwznnobrdctuskgrvuik IS REFERENCED:   files: .env.production.local
   Error: Could not find a production build in the '.next' directory …   (bản sao chưa build — đúng như dự tính)
   netlog: node-processes=1  remote-attempts=0  loopback-connects=0
```

Ghi chú:
- `next dev` **không** nạp `.env.production.local` vào process.env, vậy mà vẫn bị từ chối nhờ quét file. Đây đúng là lỗ hổng mà guard cũ bỏ sót.
- Lần chạy đầu tiên không hợp lệ và tôi đã loại bỏ: đường dẫn preload bị nuốt dấu `\` nên exit 1 là do preload, không phải do guard. `next build` với cờ `-p` cũng không hợp lệ.
- **Giới hạn:** guard chỉ bảo vệ những checkout có `next.config.mjs` mới. Checkout gốc `tappyai-mvp` đang ở nhánh khác, nên với nó **việc xoá file mới là cách sửa thật**.

### Cần giá trị mới ở đâu khi rotate

**Service-role production (`SUPABASE_SERVICE_ROLE_KEY`):**
1. Vercel → tappyai-mvp → Env: `SUPABASE_SERVICE_ROLE_KEY`, đang đặt cho **Production VÀ Preview**. ⚠️ Nghĩa là mọi preview deployment đang chạy bằng service-role production (F-062).
2. Supabase dashboard (project `fwznnobrdctuskgrvuik`) → API keys. ⚠️ Nếu rotate bằng cách **đổi JWT secret kiểu cũ**, `anon` key cũng đổi theo. Khi đó phải cập nhật thêm:
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` trên Vercel (Production, Preview, Development);
   - `TAPPYAI_SUPABASE_ANON_KEY` trong build release Android (`android/app/build.gradle.kts`, nhúng vào APK/AAB) **và** cấu hình iOS. Tức là phải **phát hành lại app**, nếu không app đang cài sẽ mất kết nối.
   - Muốn tránh việc này: dùng API key kiểu mới của Supabase (secret key tách riêng), để rotate secret mà không đụng anon/publishable key.
3. File local: chỉ có #5 (sẽ xoá). Các script `scripts/audit/*`, `ingest-jamendo.mjs` và `safety/smoke-one-clip.mjs` đọc `.env.local` (audit); không cần đổi.
4. Không dùng ở: GitHub Actions (workflows không dùng secret nào), Supabase Edge Functions (không có), `infra/zalo-verify` (grep không thấy), app Android/iOS (không bao giờ nhúng service-role).

**Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`):**
1. Vercel Env: cả ba đặt cho **Preview VÀ Production**. ⚠️ Preview đang dùng Stripe production (F-062).
2. Stripe dashboard: roll secret key; với webhook endpoint thì tạo lại **signing secret** rồi cập nhật `STRIPE_WEBHOOK_SECRET`.
3. File local: không có (bản pull để rỗng).

**Cũng phải rotate vì đã lộ trong phiên này (F-061):**

| Khoá | Chỗ đặt giá trị mới |
|---|---|
| `ANTHROPIC_API_KEY` | Vercel (Prod, Preview, Dev) · `.env.local` của `g1-place-guard`, `audit-nonprod`, `tappyai-mvp` → nên dùng khoá non-prod riêng |
| `SERPER_API_KEY` | Vercel (Preview, Prod) · `g1-place-guard\.env.local` |
| `GOOGLE_PLACES_API_KEY` | Vercel (Prod, Preview) · `g1-place-guard\.env.local` |
| Supabase PAT1, PAT2 | Supabase → Account → Access Tokens (thu hồi; tạo mới nếu cần CLI) · xoá khỏi `tappyai-mvp\.env.local` và `settings.local.json` |
| Upstash KV/Redis (`KV_URL`, `REDIS_URL`, `KV_REST_API_*`) | Upstash console (reset password/token) → Vercel KV env (cả 3 môi trường) |

