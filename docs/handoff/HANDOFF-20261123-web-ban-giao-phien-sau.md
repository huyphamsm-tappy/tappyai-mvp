# Bàn giao phiên sau — bản web TappyAI (23/11/2026)

Đọc từ trên xuống. File này tổng hợp: mục tiêu, luật làm việc, nơi đặt mọi thứ, việc ĐÃ làm / ĐANG làm / CHƯA làm / ĐANG CHỜ. Mọi thứ liên quan đến bản web. (iOS/Android là việc riêng, chỉ nhắc ở mục 9.)

Mốc đóng băng hiện tại: tag `web-freeze-20261123` = commit `d984f8f` trên nhánh `feat/brain-r13-p1`. CHƯA push, CHƯA deploy, production CHƯA bị đụng bất kỳ điều gì.

---

## 1. Mục tiêu (anh Huy muốn gì)

1. Hoàn thiện và đóng băng bản web ở máy (đã xong, tag trên), rồi **deploy production MỘT lần** khi anh nói "UAT ổn".
2. Trên production: thanh toán gói qua SePay tự động; cổng MCP (cho AI khác gọi Tappy) bật được.
3. **Sau khi deploy** (anh chốt thứ tự): kết nối Claude và các AI khác, rồi nộp hồ sơ vào thư mục connector của Anthropic. Hiện anh nói rõ "để từ từ", không làm trước deploy.
4. Tappy là trợ lý AI đa dụng, thế mạnh dữ liệu Việt Nam (giá phòng Agoda thật, quán ăn, địa điểm, mua sắm, Vexere, Lazada, Scam Shield theo cảnh báo Bộ Công an).

Anh KHÔNG nói "deploy" hay "production" tới thời điểm này. Quyền production đã cấp trước đó ("Thêm quyền cho em": sao lưu, đọc trạng thái migration, áp migration thiếu theo thứ tự, đẩy nhánh/mở PR; anh tự merge) nhưng **hành động chờ câu "UAT ổn" của anh**. Mỗi bước production vẫn dừng hỏi lại.

## 2. Luật làm việc với anh Huy (bắt buộc)

- Anh không phải lập trình viên. **Viết tiếng Việt** cho mọi chữ anh đọc (chat, ô tóm tắt, nút, bước kế hoạch). Ngắn, trung thực, gắn nhãn **ĐÃ KIỂM / CHƯA KIỂM**.
- "Kỹ thuật là việc của em": tự làm bước kỹ thuật (kể cả bấm dashboard trên Chrome của anh), KHÔNG hỏi anh chọn phương án kỹ thuật. Chỉ hỏi: quyền (tải, tài khoản, production), tiền, gu sản phẩm, riêng tư.
- Làm tiếp từng lát, không hỏi lại từng bước; không giảm chất lượng; chỉ dừng khi việc quan trọng.
- Không bịa/khoe: không nói "tốt nhất", "độc quyền", "sánh ngang Haiku/Sonnet" khi chưa có bằng chứng (nghiên cứu sâu đo được Tappy 3,69 < Haiku 3,97 < Sonnet 4,72 theo Opus chấm; gpt-6-luna chấm cùng thứ hạng).
- Đối tác là THẬT: Agoda, Vexere, Lazada. Đừng hỏi lại anh những điều đã biết.
- Mascot ở hero trang chủ GIỮ NGUYÊN vị trí và ảnh, đừng đổi.
- Đừng cho user thấy nhóm "work/projects/goals" của bộ nhớ; không dùng/dẫn nguồn từ sản phẩm AI nào (cấm).
- Sửa mã **chỉ bằng công cụ Edit/Write** (không heredoc, không `sed -i`, không `python -c`). Kho là LF. Kiểm kết quả mọi Edit trước khi chạy test. Vitest: dùng `--reporter=verbose --silent=false` nếu cần thấy stdout.
- Không in tệp bí mật (`.env*`, `gradle.properties`, keystore). Kiểm tệp khoá chỉ bằng script in đúng/sai, KHÔNG `grep` nội dung.
- Git: chỉ `git -C <đường dẫn tuyệt đối>`; đồng bộ bằng `pull --ff-only`; không `stash` trần.
- Mọi thứ Tappy chỉ trên ổ **D:**. Không tạo cây/worktree/nhánh mới cho web: **chỉ một nhánh** `feat/brain-r13-p1` tại `D:\TappyAI-wt\wt-integration`.
- Giữ 10 cây worktree "One Life" (không đưa vào dọn).
- Nhớ luôn gửi báo cáo/tệp bằng SendUserFile kèm đường dẫn.

## 3. Nơi đặt mọi thứ

| Thứ | Vị trí |
|---|---|
| Cây web (chỉ làm ở đây) | `D:\TappyAI-wt\wt-integration`, nhánh `feat/brain-r13-p1`, HEAD `d984f8f`, tag `web-freeze-20261123` (và `web-freeze-20261121` cũ) |
| Cây KHÁC, đừng nhầm | `D:\Claude\Projects\TappyAI\.worktrees\g1-growth` (nhánh `feat/g1-growth`, có thay đổi iOS chưa commit không liên quan web). Phiên này khởi động ở đây nhưng toàn bộ việc làm bằng đường dẫn tuyệt đối vào `wt-integration` |
| UAT | Supabase `zdaprdfgpbpnxyofagmc` (KHÁC production). Máy chủ UAT: cấu hình xem trước `wt-integration-uat-plans-3000` (cổng 3000) |
| Công cụ link đăng nhập UAT | `node D:\TappyAI-review-artifacts\uat-tools\make-login-link.mjs --list` rồi `<số>` (link 1 lần ~1 giờ, tạo ngay trước khi dùng) |
| Tài khoản UAT | 1–2 `tes***@tappyai.test`; 3 `uat***@example.com` (ĐÃ mua MoMo 23/11); 4 `uat-dbg-b-…@example.com` (dùng cho thử connector); 5 `uat***@example.test` (đã có MoMo). Mỗi tài khoản chỉ mua MoMo 1 lần → thử thanh toán lại cần tài khoản chưa mua (1, 2 hoặc 4) |
| Chuỗi bí mật webhook SePay | `D:\TappyAI-review-artifacts\secrets\sepay-webhook-secret.txt` (KHÔNG in; dùng cùng chuỗi ở Vercel `SEPAY_WEBHOOK_HMAC_SECRET` và SePay) |
| `.env.local` UAT | có `SEPAY_*` thật (VA `96247HUYPHAM1985`, BIDV, `PHAM DOAN HUY`), `KV_REST_*`, `MCP_*` (trỏ đường hầm cũ, vô hại), `CCP_REALTIME_AGODA_LITE=1`. Có bản sao lưu `.env.local.bak-before-*` |
| Tài liệu quan trọng | `docs/handoff/` (xem mục 10), `docs/connector/` |
| Bộ nhớ của Claude | `C:\Users\Admin\.claude\projects\D--Claude-Projects-TappyAI-tappyai-mvp\memory\` (đầu mục `MEMORY.md`: bản 23/11) |

## 4. ĐÃ LÀM (liên quan web)

### 4.1 Nền tảng (trước 21/11, tóm tắt)
Bộ não Consultative, báo cáo nghiên cứu sâu + PDF thiết kế, kế hoạch du lịch, Chỗ ở gợi ý, Món nên thử, Scam Shield tự lấy tin hằng tuần (cron thứ Hai 03:00 UTC, chỉ đọc `bocongan.gov.vn`), clip tự đăng (cờ tắt), nhắn tin/bình luận/chặn/báo cáo, bảng gói chính thức (Free/Trial/Coco/Tappy), hạn mức nghiên cứu sâu. Chi tiết: `HANDOFF-20261121-web-dong-bang-chuan-bi-ios.md`, `HANDOFF-20261120-bo-nao-tong-ket-day-du.md`.

### 4.2 Từ 21/11 tới 23/11
- **Kế hoạch migration production** + đã **diễn tập** (backup bằng script, kiểm schema `safety_private`): `KE-HOACH-AP-MIGRATION-PRODUCTION-20261122.md`, `scripts/release/sql/precheck-post-0930.sql`, `apply-migration.sh` (28c → APPLY) + test chính sách. Anh quyết: **KHÔNG áp `20261001e`**.
- **SePay tự động ĐÃ CHẠY THẬT trên UAT (23/11, ĐÃ KIỂM):** tạo đơn MoMo 25.000đ (tài khoản 3) → anh chuyển khoản qua VietQR (nội dung `TAPPYDE4XK4`) → SePay tự gọi webhook (nhật ký SePay: giao dịch #101881068, lần gửi #63628517, **200 OK**, HMAC hợp lệ) → web cấp gói đến 30/11/2026. Sửa mã: `src/lib/payments/sepay.ts` chấp nhận khớp theo `accountNumber` HOẶC `subAccount` (SePay chỉ báo trên tài khoản ảo VA). CHƯA kiểm: thư xác nhận (Brevo), bản ghi DB, mọi thứ trên production.
- **Cổng MCP** (`/api/mcp`, Streamable HTTP, cờ `MCP_GATEWAY=1`, bị khoá tắt ở production): OAuth 2.1 qua Supabase OAuth Server (đăng ký client động), duyệt client theo địa chỉ chuyển hướng (`clientApproval.ts`), màn đồng ý `/oauth/consent`, chặn token Host trên mọi route khác (`oauthClientToken.ts`), kho dùng chung + hạn mức chi tiêu, `mcpHotelSource.ts` (Agoda Lite thật), 5 công cụ tìm kiếm + 4 công cụ lịch trình dạng job. Đã chạy thật: Claude.ai (tài khoản Cá nhân, đường hầm tạm), OpenAI Playground/API (`gpt-6-luna`), Claude Haiku 5.5 qua API: giá Agoda thật Đà Lạt/Đà Nẵng, quán ăn Hội An, địa điểm Hà Nội…, Claude tự chọn Tappy mà không cần nhắc tên.
- **Sửa lỗi cổng:** tên thành phố Việt Nam thắng toạ độ; toạ độ (0,0) coi như không có vị trí (`gateway.ts` `resolveContext`, commit `4da877c`); `client-approval` đọc query qua hàm chung (`ceb13bb`).
- **Logo:** `serverInfo` trả `title: TappyAI`, `websiteUrl`, `icons` (con rái cá `/branding/otter-logo.png`) — commit `1a7414c`. Claude.ai chưa hiện logo cho connector tuỳ chỉnh (ĐÃ KIỂM).
- **Nội dung giới thiệu ĐÃ DUYỆT** (`ddb0eec`): đoạn model đọc trong `src/lib/mcp/tappyProfile.ts` trung lập (khi nào nên/không nên gọi Tappy; không giá, không tên đối thủ, không nhầm tính năng app với connector); `docs/connector/APP-DIRECTORY-LISTING.md` (tagline, mô tả ngắn/đủ, không giá) và `ABOUT-PAGE-COPY.md` (thêm phần so sánh nêu DeepSeek/ChatGPT/Claude/Grok/Gemini và mục Pricing: Free, Coco 225.000đ/tháng, Tappy 300.000đ/tháng). Tagline: "Ask about Vietnam. Decide with local data." Scam Shield mô tả: dùng cảnh báo công khai trên bocongan.gov.vn, Tappy rà soát hàng tuần, KHÔNG kết nối/xác minh với cơ sở dữ liệu của Bộ. Test khoá các quy tắc này.
- **Hồ sơ nộp Anthropic (nháp, CHƯA nộp)** `663ee77` và **checklist đưa MCP lên production** `3699da6` (mục 5/6 dưới).
- **Dọn sạch + đóng băng** (`d984f8f`): tắt đường hầm và máy chủ; xoá 6 app OAuth test ở Supabase UAT; xoá connector Claude.ai và `tappy-uat` ở Claude Code; xoá QR, link đăng nhập, thư mục scratch.
- **Kiểm trước đóng băng:** toàn bộ test app 28.234 qua; `vendorCacheRule` đôi khi hết 5 giây khi chạy cả bộ (chạy riêng qua); `tsc` sạch; 17 luật kiến trúc qua. **`next build` chưa chạy lại** ở mốc này.

### 4.3 Cập nhật 25/11/2026 — kiểm duyệt nội dung (commit `9242bc2`, SAU tag `web-freeze-20261123`)
Anh Huy yêu cầu: tuân thủ chặt pháp luật Việt Nam cho nền tảng, **không có nhân lực duyệt, máy duyệt hết**. Đã làm: cổng kiểm duyệt tự động `src/lib/safety/autoModeration/` (luật từ khoá tiếng Việt + một lần gọi mô hình nhỏ, 10 nhóm theo luật; lỗi/không xác định thì KHÔNG đăng; quá 10 lần bị chặn/ngày thì khoá đăng trong ngày; nhật ký không ghi nội dung) gắn vào: bài đánh giá/bài đăng, bình luận, tên+giới thiệu hồ sơ, tên nhóm và thông tin thành viên nhóm, kế hoạch chia sẻ, và ảnh (hồ sơ, bìa, đánh giá, nhóm). ĐÃ KIỂM trên UAT với mô hình thật (chặn đúng ~16 ca xấu, cho qua đúng các ca cảnh báo/tin báo/góp ý/giáo dục). Cờ `AUTO_MODERATION_ENABLED` (BẬT trừ khi đặt đúng `false`; test app ghim `false` ở `src/test/autoModeration.setup.ts`). `plans/share` có thêm giới hạn 20/giờ. Chi tiết, khung luật (từ nguồn thứ cấp, CẦN LUẬT SƯ) và các khoảng trống: **`docs/legal/VN-PLATFORM-COMPLIANCE-20261125.md`**.
**Khoảng trống lớn còn mở (hỏi anh/luật sư trước deploy):** xác thực số điện thoại để đăng bài (NĐ 147) chưa có; có cần giấy phép mạng xã hội không; công cụ xử lý yêu cầu gỡ bài của cơ quan chức năng 24 giờ/6 giờ chưa có (bàn duyệt admin nằm sau cờ tắt); chat AI và tin nhắn riêng (chữ) chưa lọc; ảnh tin nhắn và clip phụ thuộc quyền Moderations của khoá OpenAI; thêm một dòng vào chính sách quyền riêng tư; chưa đo tỷ lệ bỏ sót/chặn nhầm trên dữ liệu thật. **Công cụ gỡ bài theo yêu cầu cơ quan chức năng** (commit `83d83e7`): sổ `authority_takedowns` (migration `20261209`, CHƯA áp lên production, chưa diễn tập trên bản sao), API `/api/admin/takedowns`, cron `takedown-clock` (4 lần/ngày), cảnh báo; nằm sau `MODERATION_ADMIN_ENABLED`. Giao diện đã có (commit `f8befb0`, trang `/admin/moderation`, dưới bàn duyệt). 25/11: migration `20261209` ĐÃ áp lên DB **UAT** (anh Huy cho phép; production chưa) và `MODERATION_ADMIN_ENABLED=true` + `MODERATION_DIGEST_USER_IDS` đã đặt trong `.env.local` UAT (bản sao `.env.local.bak-before-takedown`). ĐÃ KIỂM: route trả 401 khi chưa đăng nhập và 403 với tài khoản thường, cron 401 khi không có bí mật. CHƯA kiểm một vòng ghi→gỡ bằng tài khoản quản trị thật (UAT chỉ có 1 tài khoản admin `man***@tappyai.com`). Chưa công bố đầu mối tiếp nhận. Chi tiết: `docs/legal/QUY-TRINH-GO-BAI-THEO-YEU-CAU-20261125.md`. Tag `web-freeze-20261123` KHÔNG gồm các thay đổi này: nếu anh muốn đóng băng lại, tạo tag mới (`web-freeze-20261125`) sau khi anh UAT.

### 4.5 Kiểm duyệt clip tự động (commit `d7510ea`, 25/11) — ĐÃ THỬ THẬT trên UAT
Không người duyệt: khung hình + lời nói (chuyển thành chữ) + chữ chèn đều qua bộ lọc luật Việt Nam (`src/lib/safety/autoModeration/videoAdapter.ts`); mọi ca trước đây chờ người duyệt → bị từ chối; ca trẻ em vẫn giữ khẩn cấp, không bao giờ đăng. Cờ `VIDEO_MODERATION_AUTOMATED` (bật trừ khi `false`); production cần `EXPLORE_VIDEO_PIPELINE_ENABLED=true`, `VIDEO_SPEECH_TRANSCRIBE_ENABLED=true` và hạ tầng clip (xem `VIDEO-CDN-HUONG-DAN-HUY-20261121.md`, chứng chỉ `media.tappyai.com`). Thử thật trên giao diện UAT (tài khoản 3, clip mp4 tạo ngay trong trình duyệt, tiếng đọc bằng giọng Windows): clip bình thường → "Sẵn sàng đăng" (decision approve, model `vn-filter-1+gpt-4o-mini-transcribe`); lời quảng cáo cờ bạc → từ chối (gambling 0,99); hình quảng cáo cờ bạc + tiếng bình thường → từ chối (gambling 0,99). Chưa thử: tiếng Việt thật, clip dài, hình nhạy cảm thật, phát qua CDN thật. File thử tạm trong `public/uat-tmp` đã xoá.

### 4.4 Thử thật trên UAT ngày 25/11 (máy chủ UAT thật, mô hình thật, DB UAT; không phải test mã)
Bài đăng thật qua `/api/reviews`: câu bình thường lên bài (200); khiêu dâm, tin đồn gây hoảng loạn (nước bị đầu độc), kêu gọi lật đổ/bạo loạn bị chặn (422 `content_blocked`). Ảnh thật qua `/api/reviews/upload`: ảnh thẻ món ăn lưu được (200); ảnh quảng cáo lừa đảo "làm nhiệm vụ nhận tiền" bị chặn (422); tài khoản bị chặn quá 10 lần/ngày bị khoá đăng (429 `moderation_locked`, đúng chủ ý). Bài thử đã xoá khỏi UAT. **Màn hình sổ gỡ bài chưa xem được với tài khoản quản trị thật:** cổng quản trị chỉ nhận email công ty (`@tappyai.com`, thử bằng tài khoản thường ra `access-denied?reason=not_corporate`), UAT chỉ có 1 admin (`man***@tappyai.com`, của anh Huy) và không dùng chung được; quyền admin tạm cấp cho tài khoản thử đã thu hồi. Clip: `EXPLORE_VIDEO_PIPELINE_ENABLED` đang tắt ở UAT nên chưa thử được kiểm duyệt clip.

## 5. ĐANG LÀM
Không có việc nào dở dang. Cây git sạch (HEAD `9242bc2` sau commit kiểm duyệt). Máy chủ UAT có thể đang chạy; đường hầm đang tắt.

## 6. CHƯA LÀM (theo thứ tự anh chốt)

### 6.1 Deploy production (chờ lệnh "UAT ổn" của anh)
Theo `KE-HOACH-MAI-UAT-SEPAY-20261122.md` (Phần 2) + `DANH-SACH-VIEC-TRUOC-DEPLOY-20261121.md` + `KE-HOACH-AP-MIGRATION-PRODUCTION-20261122.md`. Trình tự: (1) sao lưu DB; (2) đọc trạng thái migration, áp bản thiếu từng tệp theo `supabase/MIGRATION_ORDER.txt`, **không** `20261001e`; (3) biến Vercel Production (anh làm, em cầm tay): `SUBSCRIPTIONS_ENABLED=true`, `SEPAY_BANK_ACCOUNT=96247HUYPHAM1985`, `SEPAY_BANK_CODE=BIDV`, `SEPAY_ACCOUNT_NAME=PHAM DOAN HUY`, `SEPAY_WEBHOOK_HMAC_SECRET`, `BREVO_API_KEY`, `PAYMENTS_MAIL_FROM=founder@tappyai.com`, `CRON_SECRET`, khóa VAPID, `ACCOUNT_SELF_DELETE_ENABLED=false`, `USER_BLOCKS_ENABLED`… (đối chiếu danh sách giai đoạn 1); (4) chạy lại toàn bộ test + `next build` thật trong bản sao riêng trên đúng commit; rà bảo mật độc lập (khoảng 290 commit chưa rà đầy đủ; `/code-review`); (5) đẩy nhánh (cần anh đồng ý đẩy), mở PR vào `main` (main được bảo vệ: PR + 4 kiểm tra CI + quét bí mật + build), **anh merge**, Vercel tự deploy; (6) webhook SePay trên production: `https://www.tappyai.com/api/payments/sepay`, xác thực HMAC-SHA256, chuỗi trùng Vercel, tiền tố mã `TAPPY`, 6 ký tự; (7) kiểm nhanh sau deploy (đăng nhập Google/Zalo/email, chat, Deal, báo cáo, thanh toán thật gói rẻ nhất bằng tài khoản chưa mua MoMo); (8) bật clip (`EXPLORE_VIDEO_PIPELINE_ENABLED`) sau khi chứng chỉ `media.tappyai.com` ACTIVE.
Gỡ lỗi: Vercel Deployments → bản trước → Promote; tắt cờ tương ứng; bỏ `SUBSCRIPTIONS_ENABLED` để tắt bán gói (gói đã cấp không ảnh hưởng).
**Nhớ:** webhook SePay UAT `#74968` đang trỏ một đường hầm đã chết (vô hại cho tới lúc có tiền vào UAT); đổi/xoá khi lên production.

### 6.2 Sau deploy: connector cho Claude và các AI khác
Checklist `docs/connector/MCP-PRODUCTION-READINESS-CHECKLIST.md` (đọc toàn bộ). Gồm: bật `MCP_GATEWAY=1` + thêm tên đó vào `CONSULT_PRODUCTION_ALLOW`; `MCP_RESOURCE_URL`, `MCP_RESOURCE_METADATA_URL`, `MCP_AUTH_SERVER_URL` (Supabase PRODUCTION), `MCP_ATTRIBUTION_SECRET` mới, hạn mức `MCP_POOL_*`, `KV_REST_*`, `CCP_REALTIME_AGODA_LITE=1`; **không** đặt `MCP_REDIRECT_RULES` (không bật loopback ở production); bật OAuth Server và đăng ký client động ở Supabase production (consent `https://<tên miền>/oauth/consent`); migration `20261121_mcp_jobs.sql` chỉ nếu giữ công cụ job.
**Cần anh chốt trước (D1–D5):** D1 tên miền connector (đề xuất `https://tappyai.com/api/mcp`, slug vĩnh viễn); D2 có ra công cụ lịch trình "job" không (nếu không: bỏ 4 công cụ khỏi danh mục và sửa dấu vân tay `e7568957…` trong `schemaConformance.test.ts` có chủ ý; nếu có: áp migration + `MCP_JOBS_ENABLED=1` + cron); D3 cách khai nguồn dữ liệu (Agoda là đối tác; địa điểm/mua sắm dùng nhà cung cấp tìm kiếm bên thứ ba — Anthropic đòi API của chính mình hoặc được phép trung chuyển); D4 tên pháp nhân/website/người liên hệ; D5 Host nào được duyệt lúc ra mắt (mặc định Claude, ChatGPT, Cursor; Gemini/Grok/DeepSeek/Meta chưa có quy tắc chuyển hướng đã xác nhận).
Cách thử lại luồng kết nối (đã làm 23/11): mở đường hầm (`ssh -R 80:localhost:3000 nokey@localhost.run`; loại `trycloudflare` Claude KHÔNG vào được; địa chỉ đổi khi nghẽn), đặt `MCP_RESOURCE_URL`/`MCP_RESOURCE_METADATA_URL` = `<đường hầm>/api/mcp` và `<đường hầm>/.well-known/oauth-protected-resource`, khởi động lại máy chủ; Claude.ai: chuyển sang tài khoản **Cá nhân** (tài khoản "Tappyai" gói Team khoá thêm connector) → Plugin → Add custom connector → URL `/api/mcp` → Continue/Thêm → bấm "Cho phép" trên màn đồng ý Tappy → trong chat dùng + → Plugins → bật Tappy.
OpenAI: Playground (`platform.openai.com/chat`) → công cụ MCP server, dán token truy cập (anh dán, em không gõ khoá). ChatGPT app: gói Go KHÔNG có chỗ thêm connector tuỳ chỉnh; cần Plus. Claude Code: anh tự chạy `/mcp` → Authenticate (đăng nhập qua trình duyệt).

### 6.3 Nộp thư mục connector của Anthropic
`docs/connector/ANTHROPIC-DIRECTORY-SUBMISSION-DOSSIER.md` (trường đã điền sẵn, 🚧 những mục chưa sẵn sàng). Cổng nộp: `claude.ai/directory/manage` → Submit new → MCP connector. Cần URL HTTPS production ổn định cùng tên miền; trang tài liệu công khai; xem lại `/privacy` có bao phủ connector; tài khoản test cho reviewer (Anthropic gửi email xin, không dán khoá vào cổng); 7 ô cam kết tuân thủ do **chính anh** tick; logo tải lên ở cổng (Claude.ai không đọc logo từ server cho connector tuỳ chỉnh). Hồ sơ OpenAI (ChatGPT app) làm tương tự sau, cần gói Plus để thử.

### 6.4 Việc nhỏ còn mở
- Đưa copy About/Pricing lên web: trang `/about` là tiếng Việt qua từ điển i18n (`about.*`), bản đã duyệt là tiếng Anh → cần dịch + thêm khoá từ điển (và web đang đóng băng); anh hỏi hướng, chưa chốt.
- Thêm công cụ xe/tàu Vexere cho connector (hiện chỉ có trong app).
- Duyệt lại chữ giới thiệu theo thực tế khi lên production.
- Sửa tính đầy đủ báo cáo nghiên cứu sâu ("việc này để sau").
- Quy tắc chuyển hướng cho Cursor/Gemini/Grok/DeepSeek/Meta: CHƯA xác minh (chỉ Claude, ChatGPT, Cursor có mặc định; Cursor chưa thử thật).
- Đóng cứng đăng ký client động ở production (hiện bù bằng quy tắc duyệt theo địa chỉ chuyển hướng); cân nhắc tắt DCR.
- CAPTCHA đăng ký/đăng nhập (mã có sẵn, chưa bật; anh dặn để sau khi có người dùng); tự ẩn bình luận trên iOS/Android; chia sẻ clip.
- Chạy lại `next build` trên đúng commit trước khi deploy.
- Xác định test chập chờn thứ hai (lần chạy trước còn 1 đỏ không phải `vendorCacheRule`, chạy lại thì mất).

## 7. ĐANG CHỜ (anh làm hoặc quyết)

| Chờ gì | Ai |
|---|---|
| Lệnh "UAT ổn" + đồng ý đẩy nhánh/mở PR; anh merge | Anh |
| Biến môi trường Vercel Production (em cầm tay từng cú bấm; em không nhập khoá hộ) | Anh |
| Chốt D1–D5 (mục 6.2) | Anh |
| Đăng ký callback Zalo `https://www.tappyai.com/api/auth/zalo/callback` | Anh |
| Chứng chỉ HTTPS `media.tappyai.com` chuyển ACTIVE (DNS đã đúng, Google đang cấp; em kiểm chỉ đọc) | Chờ hệ thống |
| Khóa OpenAI hiện thiếu quyền Moderations (cần cấp) | Anh |
| Khóa API Accesstrade (deal giảm giá), link LinkedIn | Anh |
| Quyết định thông báo buổi sáng cho mọi người dùng (hiện chỉ người đã bật thông báo đẩy) và có bật `MESSAGE_NOTIFICATIONS_ENABLED` | Anh |
| Nâng ChatGPT lên Plus nếu muốn thử ChatGPT app; chạy `/mcp` ở Claude Code | Anh |
| Số đo tốc độ trả lời production (`scripts/perf/latencyReport.mjs` sau khi có log `tappyai_usage`) | Sau deploy |

## 8. Bẫy và bài học (đã gặp)

- UAT ≠ production: DB UAT `zdapr…`, production là project khác; `apply-migration.sh` chỉ dùng cho production và Claude không tự chạy; mọi ghi UAT/production xin phép trước.
- Hai máy chủ `next dev` trên cùng thư mục làm hỏng `.next` (lỗi `vendor-chunks/posthog-js`): xoá `.next` rồi chạy lại; chỉ một máy chủ UAT cổng 3000.
- Chrome của anh: ảnh chụp màn hình hay hết thời gian khi cửa sổ nền/khoá; dùng `find` + `get_page_text` + JS (`javascript_tool`) và bấm thật khi cần; công tắc Radix không bật bằng JS.
- Đường hầm `localhost.run` miễn phí tự đổi địa chỉ khi nghẽn: mỗi lần đổi phải cập nhật `MCP_RESOURCE_*`, khởi động lại máy chủ, sửa webhook SePay và thêm lại connector.
- Màn đồng ý OAuth: Supabase trả chuyển hướng ở lần gọi chi tiết đầu và 400 ở lần hai → chỉ gọi một lần mỗi authorization id.
- Token OAuth của Host KHÔNG được coi là phiên người dùng: `isOAuthClientToken` chặn mọi route khác `/api/mcp`.
- Khoá dịch vụ (service role) chỉ được dùng trong `src/lib/supabase/admin.ts` (luật kiến trúc).
- Test canh gác: `searchParams.test` (đọc query qua `searchParam`), `webHardcodedUiStrings` (chữ tiếng Việt nằm trong `src/lib/i18n`), `publicBoundary`, `costRoutes`, `acceptance178`, dấu vân tay công cụ `mcp-tools.v1.2`.
- Script Windows: `curl` với tiếng Việt trong Git Bash làm hỏng UTF-8 → dùng script node; `pkill` không có → PowerShell `Stop-Process` theo cổng; chạy cả bộ test sinh lại `docs/audit/*.json` → `git restore docs/audit` sau mỗi lần.
- Tệp `\u…` viết bằng Write có thể thành ký tự thô: quét ký tự ẩn/bidi.

## 9. iOS/Android (nhắc ngắn)
Web là đặc tả cho iOS. Prompt phiên iOS có sẵn: `PROMPT-SESSION-MOI-20261121-ios.md`, bàn giao `HANDOFF-20261121-web-dong-bang-chuan-bi-ios.md`. App cũ cần kiểm vẫn chạy với API mới (giá gói, hạn mức nghiên cứu sâu, báo cáo bình luận). Đây là phiên riêng; phiên web không đụng `ios/`.

## 10. Tài liệu cần đọc, theo thứ tự
1. File này.
2. `DONG-BANG-WEB-20261123-MCP-SEPAY.md` (tóm tắt mốc đóng băng).
3. `KE-HOACH-MAI-UAT-SEPAY-20261122.md`, `DANH-SACH-VIEC-TRUOC-DEPLOY-20261121.md`, `KE-HOACH-AP-MIGRATION-PRODUCTION-20261122.md` (deploy).
4. `docs/connector/MCP-PRODUCTION-READINESS-CHECKLIST.md`, `ANTHROPIC-DIRECTORY-SUBMISSION-DOSSIER.md`, `APP-DIRECTORY-LISTING.md`, `ABOUT-PAGE-COPY.md`; `KET-NOI-AI-MCP-VIEC-SANG-MAI-20261122.md` (nền kỹ thuật MCP).
5. `HANDOFF-20261121-web-dong-bang-chuan-bi-ios.md`, `HUONG-DAN-CAI-KHOA-20261121.md`, `VIDEO-CDN-HUONG-DAN-HUY-20261121.md`.

## 11. Prompt gợi ý cho phiên mới
> Đọc `D:\TappyAI-wt\wt-integration\docs\handoff\HANDOFF-20261123-web-ban-giao-phien-sau.md` rồi các tệp ở mục 10. Làm việc chỉ ở `D:\TappyAI-wt\wt-integration` (nhánh `feat/brain-r13-p1`, tag `web-freeze-20261123`). Kiểm root/branch/HEAD/`git status` trước khi sửa. Nói tiếng Việt, ngắn, gắn nhãn ĐÃ KIỂM/CHƯA KIỂM. Chưa deploy gì khi anh chưa nói "UAT ổn". Hỏi anh hôm nay làm việc nào trong mục 6, và các mục 7 đã có kết quả chưa.
