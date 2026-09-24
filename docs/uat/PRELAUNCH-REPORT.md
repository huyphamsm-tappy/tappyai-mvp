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

## Part 3 — Đối soát migration

**Cách làm:**
- Liệt kê file migration có trên nhánh ship (`rc/web-uat`) mà `origin/main` (`842379b`, bản production) chưa có.
- Đối chiếu **object** mà mỗi file tạo ra với snapshot schema production `docs/audit/schema-baseline/prod-schema-only.sql` (09-17; đây là chuẩn mà chính checklist dùng).
- Không kết nối DB production. Nếu production đã đổi sau 09-17, bảng dưới cần kiểm lại bằng các câu check read-only trong checklist.

### Danh sách chuẩn: 16 file

| # | File | Làm gì | Bổ sung? | Rollback | Trên prod 09-17 | Việc cần làm |
|---|---|---|---|---|---|---|
| — | `20260905_chat_messaging_phase1` | bảng/RPC chat | có | file | **đã có** | chỉ verify |
| — | `20260906_phase6_messenger_reachability` | chat blocks/settings | có | file | **đã có** | chỉ verify |
| — | `20260915_review_shares` | `review_shares` | có | file | **đã có** | chỉ verify |
| G1 | `20260913_g1_growth_foundation` | `shared_results`, `anon_identity_map`, `fn_shared_result_bump` | có | file | thiếu | **apply — chặn launch** |
| 1 | `20260913_plan_shares` | `plan_shares` | có | file | thiếu | **apply — chặn launch** |
| P1 | `20260915_profile_public_presentation` | `profiles.bio`, `cover_url` | có | file | thiếu | apply (không chặn: code có đường dự phòng) |
| G2 | `20260918_g1b_share_ancestry` | `shared_results.parent_id`, `owner_is_anonymous` | có | file | thiếu | **apply — chặn launch (cùng G1)** |
| 2 | `20260920100000_commerce_providers` | bảng mới | có | không cần | thiếu | apply |
| 3 | `20260920110000_commerce_feed_items` | 2 bảng mới | có | không cần | thiếu | apply |
| 4 | `20260920_f028_…` | thay thân `set_user_date_of_birth` | không (REPLACE) | file | thiếu (thân cũ) | apply |
| 5 | `20260921_f032_…` | thay thân RPC admin (bảo mật) | không (REPLACE) | file | thiếu (thân cũ) | apply |
| 6 | `20260921_music_tracks_lockdown` | bỏ 4 policy, thu quyền | không (revoke) | file | thiếu | apply |
| 7 | `20260921_user_events_ga4_event_types` | nới constraint **nếu có** | có điều kiện | file | — | apply (**no-op trên prod**) |
| 8 | `20260921_user_events_shopping_search_event` | như #7 | có điều kiện | file | — | apply (**no-op trên prod**) |
| GR | `20260922_groups_avatar_url` | `groups.avatar_url` | có | file | thiếu | **apply — chặn launch** |
| ✗ | `20260922_music_soundhelix_attribution` | UPDATE dữ liệu `music_tracks` | — | không có | — | **BỎ QUA trên prod**: cần cột `license`/`source_url` (prod chưa có) → sẽ lỗi; Music đang ẩn |

Chi tiết check/apply/verify cho từng bước: `DEPLOY-CHECKLIST.md` §1 (đã viết lại) và §2 (thứ tự so với deploy).

### Vì sao checklist ghi 8 còn tôi đếm 16

**Checklist không sai tại thời điểm viết; chính nhánh đã thay đổi.**
- Checklist được tạo ở `33d9147` (09-21). Lúc đó nhánh chưa có:
  - 3 file mà `9f85cde` (Phase 7 Session A) thêm ngày 09-22: `profile_public_presentation`, `groups_avatar_url`, `music_soundhelix_attribution`;
  - 2 file G1 vào qua merge rc/web-uat ngày 09-24: `g1_growth_foundation` (`47f2d5e`), `g1b_share_ancestry` (`8a01877`).
  - Tôi đã kiểm bằng `git merge-base --is-ancestor`: cả 5 đều không nằm trong cây của `33d9147`.
- Ngược lại, 3 file chat/review_shares có trong `origin/main..HEAD` nhưng **đã có trên production** (áp tay ngày 09-15), vì production được sửa ngoài `main`.
- Tổng: 8 (checklist) + 5 (nhánh mới thêm) + 3 (đã có) = **16**. Trong đó 12 cần apply, 1 bỏ qua, 3 chỉ verify.

### `shared_results`: hỏng gì hôm nay, hỏng gì trên production

**Trên audit, trước khi apply** (đo bằng probe có phiên đăng nhập, `docs/uat/evidence/migrations-2026-09-24.txt`):
- `POST /api/shared-results` (nút **"Public link"** trên web **và** Android) → **500**; server ghi `Could not find the table 'public.shared_results' in the schema cache`.
- `/r/<slug>` và oEmbed → 404 (không có dòng nào).
- Feed, sitemap và hub → 200 nhưng **âm thầm** không có kết quả chia sẻ nào.
- Liên kết danh tính ẩn danh (`anon_identity_map`) bị bỏ qua mà không báo lỗi.

**Trên production nếu thiếu 2 migration:** giống hệt audit, vì prod (09-17) không có cả hai bảng. Mọi người dùng bấm "Public link" đều gặp lỗi, và vòng tăng trưởng G1 (share-out, `/r/`, sitemap/IndexNow) không hoạt động.

**Có chặn launch không: CÓ**, vì code ship có nút này. Cách gỡ đơn giản: 2 migration đều chỉ bổ sung và có rollback. Chỉ cần apply **trước** khi deploy code (checklist §2).

### Đã apply 2 migration G1 lên audit và kiểm lại

- PRE-FLIGHT CHECK 2: `npm run whoami` → `supabase : zdaprdfgpbpnxyofagmc ✅ audit/non-prod`; script còn tự từ chối chạy nếu ref không phải audit.
- Mỗi file chạy trong `BEGIN … COMMIT` riêng:
  ```
  BEFORE: shared_results=false anon_identity_map=false fn_bump=false parent_id=false owner_is_anonymous=false
  APPLIED 20260913_g1_growth_foundation.sql
  APPLIED 20260918_g1b_share_ancestry.sql
  AFTER : shared_results=true anon_identity_map=true fn_bump=true parent_id=true owner_is_anonymous=true
          sr_rls=true aim_rls=true sr_policies=2 aim_policies=0 ; anon/authenticated grants: authenticated SELECT
  ```
- Kiểm chức năng sau apply: `POST /api/shared-results` → **201** (`/r/QNgw8uoghB`). `/r/<slug>`, `og.png`, `/api/shared-results/<slug>`, `feed.xml`, `sitemap.xml`, `/food` và oEmbed đều **200**; slug mới có trong sitemap (1 lần) và feed (2 lần).
- Cả 16 migration giờ đều có trên audit (kiểm read-only từng object).

### Phát hiện thêm (ngoài câu hỏi)

- **`groups.avatar_url` chặn launch.** `GET /api/group` select cột này; production chưa có cột, nên mọi nhóm sẽ trả 404. Checklist cũ không có mục này.
- **`music_soundhelix_attribution` sẽ lỗi trên production** (thiếu cột phụ thuộc). Checklist cũ xếp nó vào nhóm "demo/seed adjacent" nhưng không nói rõ là sẽ lỗi.
- **`profile_public_presentation`** thiếu trên production nhưng code có đường dự phòng. Tôi đã kiểm code (`src/app/api/profile/route.ts:46-65`); chưa chạy thử trên DB thiếu cột, nên phần này **UNVERIFIED** ở runtime.

## Part 4 — Rõ ràng về nhánh

### Nhánh nào sẽ ship, và vì sao lại thành như vậy

**`rc/web-uat` là nhánh ship.** Production = `main` @ `842379b` (09-11). Việc ship là PR #252 `rc/web-uat → main` (đang mở, chưa merge).

Diễn biến:
1. `rc/web-uat` ban đầu là ứng viên UAT web của G1 (`b496f4a`, 09-19).
2. Song song, `uat/phase7-regressions` gom các bản sửa UAT Phase 7, Session C (AI), hotfix bảo mật `8efcdb5` và phần ẩn Music.
3. Ngày 09-24, theo chỉ đạo của bạn, `rc/web-uat` được merge vào `uat/unified` (`3cbb10e`, cơ sở là phase7). Sau đó `rc/web-uat` được **fast-forward** lên `c7604c9` và push. Từ đó `uat/phase7-regressions` chỉ còn là tổ tiên; nó **không còn là nhánh ship**.
4. Sau đó, một phiên Claude khác (Zalo) commit và push thẳng lên `rc/web-uat`: `33b7690`, `e5488ae`, `b7a9586`. Phiên này làm việc **trong cùng worktree `g1-place-guard`**, và đã rebase các commit local của tôi.

Hiện tại:
- `origin/rc/web-uat` = `b7a9586`.
- `rc/web-uat` local có **13 commit chưa push** của phiên này: STEP-3, ranh giới public/app, brochure, PRELAUNCH 1–3 và 5.

### Mọi thay đổi trong tháng qua đã nằm trong nhánh ship chưa? — **CHƯA**

**Cách kiểm:**
- `git cherry rc/web-uat <nhánh>` trên mọi nhánh local và remote có commit từ 2026-08-24.
- Loại bỏ commit nào đã có trên `rc/web-uat` dưới cùng tiêu đề (vào bằng merge hoặc cherry-pick có chỉnh sửa).
- Còn **241 commit** không có trên `rc/web-uat` theo cả patch-id lẫn tiêu đề: `docs/uat/evidence/branch-containment-2026-09-24.txt`.
- Tiêu đề khác chưa chắc là thiếu nội dung, vì có thể đã được làm lại theo cách khác. Chỗ nào tôi đã kiểm nội dung thì ghi rõ.

| Nhánh | Chưa có trên rc | Nội dung | Đánh giá |
|---|---|---|---|
| **`integration/v3-foundation`** (09-03) | 9 | **Bản sửa bảo mật V3 Phase 0–3:** ranh giới đọc nhóm (`558ba49`), chặn egress của model (`66e4c46`), throttle oracle tài khoản (`a3c342a`), thu hồi integration tại provider (`fc115b7`), các finding Phase 0 để lại (`a711181`), `/api/chat` bỏ thao tác đặc quyền (`2caff4b`) | 🚨 **F-065 (P1).** Đã kiểm nội dung: `20260904_group_read_boundary.sql` **không có** trên rc. Cả rc lẫn production (09-17) vẫn để `groups`/`group_members` là `SELECT TO public USING (true)`, tức ai có anon key cũng đọc được mọi nhóm và mọi thành viên. Các file test egress/clientIp/contentProcessor cũng không có. Các bản còn lại: **UNVERIFIED** (code liên quan có mặt nhưng khác bản gốc) |
| `integration/phase6-release` (09-19) | 19 | Phase 6: Inbox DoD, Contact Sync (Android), kill switch phía server, sửa deep link Messenger, test ranh giới tin cậy | chưa merge; phần migration chat đã có trên production từ 09-15 |
| `phase8-master` (09-24) | 9 | Phase 8 (Tasks 01/04/07/12/17) | cố ý tách riêng, không thuộc bản phát hành này |
| `feat/scam-shield-public-utility` | 1 | `/kiem-tra` | cố ý tách riêng; bạn chưa quyết |
| `wip/*-2026-09-17` (15 nhánh) | 1–151 | Snapshot công việc chưa commit của 15 worktree, chụp khi hợp nhất 09-17 | ba snapshot đã được merge (cool-vaughan, v3-canonical, v3-phase4); **15 cái này chưa**. Đáng chú ý: `wtandroid` (10 sửa Android 08-23: Deals DTO, bàn phím composer, F03 "khách ẩn danh không được tạo việc trả phí định kỳ", màn đăng nhập có mascot…), `tappy-business-p0` (checkpoint năng lực Business), `ios-sprint` (151 commit, 07-26→; iOS không thuộc bản này) |
| `feat/ccp-mvp`, `feat/consultative-…`, `integration/scam-shield-v3`, `feat/v3-scam-shield-ui`, `feat/v3-qr-profile` | 20–30 | Phần lớn là cùng một chồng commit perf/consultative từ 08-10 (B2–B7…) | nhiều khả năng đã được làm lại trên mainline; **UNVERIFIED** |

### STEP-3 (`ccee15b`) có tới được nhánh ship không

- **Có, trên `rc/web-uat` local**, dưới dạng `e687225`, sau khi phiên Zalo rebase. Bằng chứng: `git patch-id` của hai commit giống hệt nhau (`f18d0ed0b261`).
- **Chưa có trên origin**: `origin/rc/web-uat` = `b7a9586`. Nó chỉ lên origin khi `rc/web-uat` được push; tôi không push.

### Hai dòng để giữ lại

```
Nhánh:  rc/web-uat   (worktree D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\g1-place-guard)
Lệnh:   cd D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\g1-place-guard ; npm run whoami ; npm run dev   → http://localhost:3007
```

### Nói gì với các phiên khác (F-066)

> "Nhánh ship duy nhất là `rc/web-uat`. **Không làm việc trực tiếp trong worktree `g1-place-guard`** khi đang có phiên khác mở nó. Hãy tạo worktree và nhánh riêng từ `rc/web-uat` (`git worktree add ../<tên> -b <tên> rc/web-uat`), chạy `npm run whoami` đầu tiên, rồi mở PR/merge vào `rc/web-uat` khi xong. Không rebase và không push commit không phải của mình. Không force-push. Không push `main`."

Lý do (đo được trong phiên này): hai phiên cùng dùng một worktree. Phiên kia đã rebase các commit chưa push của tôi. Nếu phiên kia push, nó sẽ đẩy luôn **13 commit chưa được bạn duyệt** của tôi lên origin.

