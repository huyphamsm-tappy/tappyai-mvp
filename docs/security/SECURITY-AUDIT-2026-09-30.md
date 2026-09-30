# TappyAI — Rà soát bảo mật 2026-09-30

> **Nhánh:** `security/hardening-2026-09-30` (worktree `D:\TappyAI-wt\wtsec`), tách từ `origin/rc/web-uat` @ `55e298e`, **không upstream, không push**. Không merge vào rc/main, không deploy.
> **Production:** không chạm dưới bất kỳ hình thức nào (không gọi API prod, không đọc DB prod, không đổi khoá).
> **DB audit/UAT:** chỉ đọc **catalog** (schema, policy, quyền, hàm) trong phiên `SET default_transaction_read_only = on` + `BEGIN READ ONLY` — không đọc một dòng dữ liệu người dùng nào. Mọi tái hiện tấn công chạy **LOCAL**: PostgreSQL 17 nhúng (`embedded-postgres`) + test route với mock.
> **Gọi model thật: 0 lần — chi phí $0.** Toàn bộ ca tiêm lệnh chạy bằng replay/model giả lập.
> Không có secret nào trong tài liệu này (khoá chỉ ghi 8 ký tự đầu + 4 cuối).

## 0. Tóm tắt cho anh

**Không có phát hiện mức Nghiêm trọng đang ảnh hưởng người dùng ngay.** Có **3 mục mức Cao** cần anh quyết:

| # | Mức | Vấn đề | Trạng thái | Khi nào |
|---|---|---|---|---|
| **DB-1** | 🟠 Cao | `reviews`: chủ bài tự **INSERT/UPDATE mọi cột** qua PostgREST (tự đăng bài đang bị giữ, tự gắn `is_verified`, thổi bộ đếm). Đo trên **DB audit hôm nay**: vẫn mở. Migration sửa đã có trong rc từ 27–28/09 nhưng **chưa áp ở đâu cả** (nhiều khả năng prod cũng vậy). | Sẵn migration | `20260927` (UPDATE) **trước/cùng release** — không phụ thuộc code. `20260928` (INSERT) **ngay sau** khi code rc lên prod |
| **MOB-1** | 🟠 Cao | App Android + iOS **nhận phiên đăng nhập từ bất kỳ link** `tappyai://auth-callback#access_token=…&refresh_token=…` mà không kiểm là app vừa bắt đầu đăng nhập ⇒ gửi cho nạn nhân một link `https://www.tappyai.com/auth/confirm?…&platform=android` (magic link **của kẻ xấu**) là app nạn nhân lặng lẽ chuyển sang tài khoản kẻ xấu; mọi chat/vị trí/trí nhớ sau đó nằm trong tài khoản kẻ xấu. | Đề xuất (cần sửa app) | **Ngay sau release** (bản app kế tiếp) |
| **API-1** | 🟠 Cao | `/api/iap/apple/verify`: `originalTransactionId` bịa ⇒ Apple API 404 ⇒ rơi xuống nhánh “JWS client gửi” **không kiểm bundleId/môi trường/sản phẩm** ⇒ giao dịch Apple thật của **app khác** hoặc **mua Sandbox miễn phí** cấp Pro (300 câu AI/ngày). Một thuê bao thật còn cấp Pro cho **vô số tài khoản**. | **Đã sửa** trên nhánh (`fea7f38`), 8 ca tấn công đỏ trên code cũ / xanh trên code mới | Pro chưa bán ⇒ sau release; **nhưng nếu prod đã có `APPLE_IAP_*` thì lỗ đang mở** — xem checklist mục 3 |

Các mục Trung bình đã **sửa trên nhánh** (mỗi sửa có test): SSRF mù qua endpoint Web Push, ảnh nhóm còn GPS, `/api/viet-content` không có trần/ngày, báo cáo vi phạm giả mạo người báo cáo, thổi điểm xếp hạng Explore, ScamShield bỏ sót tiêm lệnh tiếng Việt, kiểm lại dung lượng upload. Các mục Trung bình **cần anh quyết** (thiết kế): trang `/r/<slug>` hiển thị nội dung do người dùng tự ghi dưới thương hiệu TappyAI, media trên GCS vẫn mở sau khi xoá/ẩn bài, link tĩnh trong snippet bên thứ ba lọt qua bộ lọc egress, Next.js 14.

**Đề xuất cho release Phase 7:** chỉ **áp migration `20260927_owner_update_column_privileges.sql`** (không phụ thuộc code, đã có test, có rollback) cùng release; mọi sửa code trên nhánh này để **sau release** như anh yêu cầu.

---

## 1. Tổng hợp phát hiện

Mức: 🔴 Nghiêm trọng · 🟠 Cao · 🟡 Trung bình · 🟢 Thấp. “Khi sửa”: **TR** = trước release · **SR** = ngay sau release · **ĐBM** = trong đợt bảo mật.

| ID | Mức | Vấn đề | Trạng thái | Khi sửa |
|---|---|---|---|---|
| DB-1 | 🟠 | `reviews`/`profiles` INSERT/UPDATE mọi cột qua PostgREST (H1/M1 cũ) — **vẫn mở trên DB audit** | migration có sẵn, chưa áp | TR (UPDATE) / SR (INSERT) |
| MOB-1 | 🟠 | Chèn phiên đăng nhập qua deep link (Android + iOS), token đi qua custom scheme | đề xuất | SR |
| API-1 | 🟠 | Apple IAP: JWS app khác / Sandbox / dùng chung giao dịch cấp Pro | **đã sửa** `fea7f38` | SR (hotfix nếu prod có `APPLE_IAP_*`) |
| WEB-2 | 🟡 | SSRF mù: endpoint Web Push tuỳ ý (route + PostgREST) | **đã sửa** `eb4f037` | SR |
| WEB-3 | 🟡 | `/r/<slug>`: “câu trả lời của TappyAI” lấy từ `conversations.messages` do client ghi ⇒ giả mạo nội dung + link lừa đảo trên tappyai.com | đề xuất | ĐBM (cần anh quyết) |
| AI-2 | 🟡 | Bộ lọc link coi **mọi URL trong JSON kết quả công cụ** (kể cả snippet web bên thứ ba) là “server cấp” ⇒ link tĩnh lừa đảo có thể hiện ra (không mang được dữ liệu riêng tư) | ghi nhận bằng `it.fails` | ĐBM |
| AI-1 | 🟡 | Nội dung không tin cậy (lịch Google, chú thích clip, trí nhớ, ngữ cảnh chia sẻ) nằm trong **system prompt** (có fence) | đề xuất | ĐBM |
| COST-1 | 🟡 | `/api/viet-content`: không cần tài khoản, model “smart”, không trần/ngày | **đã sửa** `a823bd4` | SR |
| DB-2 | 🟡 | `content_reports` INSERT `WITH CHECK (true)`: giả N người báo cáo, tự đánh `VERIFIED` | **migration mới** `b6a1821` | SR |
| UP-1 | 🟡 | Ảnh đại diện nhóm lưu nguyên EXIF/GPS | **đã sửa** `d178adf` | SR |
| UP-2 | 🟡 | GCS công khai: xoá/ẩn/hạn chế bài **không** thu hồi ảnh/video; link cũ mở mãi | đề xuất | ĐBM |
| UP-4 | 🟡 | Ảnh tải lên **trước 24/09** (trước R-2) có thể còn GPS trong bucket | cần quét | SR |
| MOB-2 | 🟡 | Android: SDK supabase-kt (mặc định) có thể lưu phiên **không mã hoá** song song với Keystore, file đó không bị loại khỏi backup | cần xác minh trên máy | SR |
| DEP-1 | 🟡 | Next.js 14.2.35 (dòng 14 hết hỗ trợ; 1 critical + vài high — đa số chỉ self-host) | kế hoạch | ĐBM |
| WEB-1 | 🟡 | CSP còn `'unsafe-inline'` + cookie phiên Supabase JS đọc được ⇒ XSS bất kỳ = chiếm tài khoản | đã biết (L4) | ĐBM |
| SCAM-1 | 🟢 | ScamShield bắt 1/7 biến thể “bỏ qua hướng dẫn…” tiếng Việt | **đã sửa** `4608230` | SR |
| DB-3 | 🟢 | `review_interactions` ghi giá trị tuỳ ý qua PostgREST ⇒ thổi xếp hạng Explore | **migration mới** `bd95f7c` | SR |
| UP-3 | 🟢 | Hoàn tất upload trực tiếp không kiểm lại dung lượng thật | **đã sửa** `936e9c8` | SR |
| SEC-1 | 🟢 | Khoá Google Places `AIzaSyAl…NLcs` từng nằm trong `.claude/settings.local.json` — **chưa từng vào git**; còn trong 2 file settings cục bộ + 2 transcript | đổi khoá | SR |
| API-3 | 🟢 | `/api/users/search`: tra đúng email/SĐT ⇒ lộ “có tài khoản”, mỗi lần quét tới 25 trang `auth.users` | đề xuất | ĐBM |
| COST-2/3 | 🟢 | Giới hạn trong bộ nhớ (explore/process, group suggest, TTS); farm phiên ẩn danh | đề xuất | ĐBM |
| WEB-4 | 🟢 | `/r/<slug>/og.png` fetch ảnh https tuỳ ý (edge), chặn IP nội bộ chưa đủ | đề xuất | ĐBM |
| MOB-3..5 | 🟢 | APK UAT nhúng `VERCEL_BYPASS_SECRET`; WebView YouTube chèn HTML qua videoId; iOS ATS `localhost`; SwiftPM không khoá phiên bản | đề xuất | ĐBM |
| DB-4..7 | 🟢 | `user_events` chủ tự sửa; bình luận bài `is_hidden` vẫn công khai; quyền bảng thừa cho anon trên bảng nội bộ (RLS vẫn chặn); pgvector trong schema `public`; token OAuth lưu thô | đề xuất | ĐBM |
| (cũ) H2, M3 | 🟠/🟡 | Token Travelpayouts trong lịch sử git public; giới hạn khoá Firebase | chờ anh | SR |

---

## 2. Các mục “đã biết” anh yêu cầu xác nhận

### 2.1 Khoá Google trong `.claude/settings.local.json` (SEC-1) — 🟢 Thấp
- `.claude/` nằm trong `.gitignore:43`; `git log --all` trên **1.387 ref** (mọi nhánh + **mọi PR ref của GitHub** `refs/pull/*`, fetch hôm nay) **không có commit nào** chứa file này hay chuỗi khoá ⇒ **chưa từng lên GitHub**.
- File settings chính hiện **đã sạch**. Khoá (`AIzaSyAl…NLcs`, dùng cho `places.googleapis.com/v1/places:searchText`) **vẫn còn** trong: `tappyai-mvp/.claude/worktrees/funny-gauss-cdd1a8/.claude/settings.local.json`, `…/sleepy-feynman-e4b80e/.claude/settings.local.json` (đều bị git ignore) và 2 file transcript Claude cục bộ.
- Khoá này **khác** khoá `GOOGLE_PLACES_API_KEY` trong `.env.local` (`AIzaSyAB…`).
- **Kế hoạch:** sau release, tạo khoá mới có giới hạn API (Places API (New) only) + giới hạn IP/referrer, thay trong Vercel, xoá khoá cũ; xoá 2 file settings worktree cũ. Chi tiết: `OWNER-CHECKLIST.md` §4.

### 2.2 Nhánh `fix/security-medium-low` (88af224) — ✅ đánh giá tốt, đã gộp vào nhánh này
- Gộp sạch (`a2c107f`). Test DB thật: **48/48** (L3 bình luận bài bị giữ, L1 click deal, H1 cột UPDATE/INSERT) — không suite nào bị skip.
- Hai lỗi do rc đi trước nhánh (đã sửa trên nhánh này): manifest thứ tự migration thiếu 4 migration mới (`e6c9feb`); cron mới `click-attributions-sweep` chưa dùng helper so sánh constant-time (`bbca6ce`).
- Ghi chú L3: bình luận của bài **chủ tự ẩn** (`is_hidden`) vẫn đọc công khai — hàm `review_comments_readable` chỉ xét `publication_state` (DB-5, Thấp).
- Migration `20260928b`, `20260928c` vẫn **chưa áp** ở đâu.

### 2.3 `/go/at` — ✅ bản sửa 020ff56 đúng; **không** phải open redirect
- Link được ký HMAC-SHA256 trên `(u, p, a, h)` (`src/lib/ccp/tracking/clickLink.ts:64-89`), host đích bắt buộc `go.isclix.com` + https, `u` không được chứa `sub1`; đích bên trong deep link do code dựng từ nhà cung cấp trong registry và qua `checkCommerceUrl` (`src/lib/ccp/resolver/resolve.ts:67-96`).
- Test route mới `src/app/go/at/route.test.ts` (`1df21bc`): link không ký / đổi đích / host giả dạng `go.isclix.com.evil.example` / đổi provider / chữ ký cắt ngắn ⇒ về trang chủ, không ghi gì. Xoay `x-forwarded-for` **không** được thêm lượt — **đỏ trên route trước 020ff56, xanh bây giờ**.
- Còn lại (🟢): link không hết hạn (ai có link của người khác có thể tạo attribution dưới danh tính niêm phong của họ); limiter vẫn theo instance (M4).

### 2.4 GCS công khai, bài ẩn/hạn chế, EXIF
- Bucket phục vụ công khai (`gcsPublicUrl` = `storage.googleapis.com/<bucket>/<key>`, `src/lib/media/providers/gcs.ts:78`). Ẩn/hạn chế bài chỉ đổi cột DB; **xoá bài** (`src/app/api/reviews/[id]/route.ts:116-133`) chỉ xoá dòng — **object vẫn còn, link cũ vẫn mở** (UP-2). Chỉ job xoá tài khoản mới dọn media.
- EXIF/GPS: ảnh review/avatar/cover bị xoá metadata từ R-2 (24/09); video + thumbnail bị server từ chối nếu còn metadata (F-099, 26/09); **ảnh đại diện nhóm bị sót — đã sửa** (UP-1). Ảnh tải lên **trước 24/09** chưa được xử lý (UP-4) ⇒ cần quét bucket.

---

## 3. Chi tiết phát hiện

### DB-1 · 🟠 `reviews` / `profiles`: chủ dòng sửa được mọi cột (H1/M1 — vẫn mở)
- **Bằng chứng (DB audit, catalog, chỉ đọc):** `has_table_privilege('authenticated','public.reviews','INSERT'|'UPDATE') = true`; policy `INS[all]: uid = user_id`, `UPD[all]: uid = user_id`; không có grant theo cột. Cột sửa được gồm `publication_state`, `safety_state`, `is_verified`, `like_count`, `view_count`, `save_count`, `comment_count`, `completion_rate`, `watch_time_avg`. `profiles` tương tự (`follower_count`, `following_count`, `onboarded`).
- **Tái hiện LOCAL:** `supabase/tests/owner_update_column_privileges.test.ts`, `supabase/tests/reviews_insert_revoke.test.ts` (đã có, xanh); ma trận mới `supabase/tests/rls_cross_user_matrix.test.ts` dựng **đúng schema audit** và cho thấy chủ vẫn tự INSERT được `reviews` (`insertOwnByA = ok:1`).
- **Sửa:** `supabase/migrations/20260927_owner_update_column_privileges.sql` (không phụ thuộc code) và `20260928_revoke_reviews_insert.sql` (**chỉ sau** khi code `12681d6` — POST /api/reviews ghi bằng service role — chạy trên prod). Thứ tự + lệnh kiểm: `D:\Claude\Projects\TappyAI\security-fixes-prod-apply.md` Bước 3–4.
- **Khi:** 20260927 **trước/cùng release**; 20260928 **ngay sau release**.

### MOB-1 · 🟠 Chèn phiên qua deep link (Android + iOS)
- **Luồng:** `/auth/confirm?token_hash=…&type=magiclink&platform=android|ios` xác thực OTP rồi **redirect token phiên** tới `tappyai://auth-callback#access_token=…&refresh_token=…` (`src/app/auth/confirm/route.ts:55-62`; Zalo đi cùng đường). Android `AuthRepository.handleOAuthRedirectIntent` (`android/features/auth/src/main/java/com/tappyai/features/auth/data/AuthRepository.kt:295-310`) và iOS (`ios/TappyAI/Features/Auth/AuthRepository.swift:92-95`) **nhập phiên từ fragment vô điều kiện** — không kiểm có lần đăng nhập nào đang chờ, không kiểm `state`, và thay luôn phiên đang đăng nhập.
- **Tấn công:** kẻ xấu xin magic link cho **email của chính họ**, đổi `platform=android`, gửi link `https://www.tappyai.com/auth/confirm?…` cho nạn nhân (“mở trong app để nhận ưu đãi”). App nạn nhân mở ra đã ở tài khoản kẻ xấu; nạn nhân tiếp tục chat (địa chỉ, lịch, sở thích), đăng ảnh… ⇒ kẻ xấu đọc được hết trong tài khoản của mình. Ngoài ra custom scheme không độc quyền: app độc hại khai cùng `tappyai://` có thể nhận token (Android hiện hộp chọn; iOS không xác định).
- **Chưa tái hiện trên thiết bị** (không build app trong phiên này); luồng code rõ ràng ở 3 file trên.
- **Sửa (đề xuất):** (1) app tạo `state` ngẫu nhiên khi bấm đăng nhập, gửi kèm, server trả lại trong fragment, app chỉ nhập phiên khi `state` khớp và còn hạn (≤10 phút); (2) nếu đang đăng nhập tài khoản khác ⇒ hỏi xác nhận, không thay âm thầm; (3) dài hạn: App Links/Universal Links đã xác minh (`https://www.tappyai.com/auth/…`) thay custom scheme, hoặc PKCE code thay vì token trong URL.
- **Khi:** ngay sau release (bản app kế tiếp, cả 2 nền tảng).

### API-1 · 🟠 Apple IAP cấp Pro cho giao dịch không phải của TappyAI — **đã sửa**
- **Code cũ:** `src/app/api/iap/apple/verify/route.ts` — khi `getSubscriptionStatuses` lỗi (id bịa ⇒ 404) thì dùng `signedTransactionInfo` client gửi; `jws.ts` chỉ chứng minh “Apple ký”. Không kiểm `bundleId`, `environment`, `productId`, không khớp `originalTransactionId`; không ràng buộc một giao dịch ↔ một tài khoản. `jws.ts` ghim root G3 nhưng không kiểm OID/độ dài chuỗi/hạn chứng chỉ/thuật toán — root G3 cũng neo cả chứng chỉ **nhà phát triển** (WWDR G6).
- **Sửa (`fea7f38`):** `src/lib/apple-iap/transactionPolicy.ts` (bundle, môi trường, sản phẩm Pro, khớp id, bị thu hồi); verify: id phải là số, áp policy, **409** nếu giao dịch đã gắn tài khoản khác; notifications: kiểm phong bì + giao dịch; `jws.ts`: đúng 3 chứng chỉ, OID `1.2.840.113635.100.6.11.1` (leaf) và `1.2.840.113635.100.6.2.1` (intermediate), còn hạn, chỉ ES256.
- **Tái hiện LOCAL:** `src/app/api/iap/apple/appleIapPolicy.test.ts` — 8 ca tấn công **đỏ trên route cũ**, xanh sau sửa; `src/lib/apple-iap/jws.test.ts` dựng chuỗi 3 cấp kiểu Apple (5 ca mới).
- **Lưu ý:** iOS chưa gửi `appAccountToken` ⇒ ràng buộc “ai đăng ký trước giữ”. Nên thêm `appAccountToken = user.id` khi mua (StoreKit 2) và kiểm ở server.

### WEB-2 · 🟡 SSRF mù qua endpoint Web Push — **đã sửa** (`eb4f037`)
- `endpoint` là URL server POST tới mỗi khi có thông báo; route lưu không kiểm, và policy `notification_subscriptions` FOR ALL cho chủ ghi thẳng qua PostgREST. `src/lib/notifications/pushEndpoint.ts` chỉ cho host dịch vụ push của trình duyệt (FCM, Mozilla, Apple, WNS), https cổng mặc định; kiểm ở route **và lúc gửi** (`send.ts`) — endpoint lạ ⇒ coi như 410, tự tắt dòng.
- Test: `src/app/api/notifications/subscribe/route.test.ts` (7 URL tấn công gồm `169.254.169.254`, host giả dạng, cổng lạ, userinfo) + `src/lib/notifications/send.test.ts` (dòng ghi thẳng PostgREST không bao giờ được gọi tới). 332/332 test thông báo xanh.

### WEB-3 · 🟡 Trang công khai `/r/<slug>` hiển thị nội dung do người dùng tự viết
- `resolveShareSource` lấy câu trả lời từ `conversations.messages` (`src/lib/share/shareRequest.ts:67-86`); cột này **do client ghi nguyên văn** (`PUT /api/conversations`, `src/app/api/conversations/route.ts:52`, và PostgREST). `renderPublicMarkdown` biến **mọi** URL https thành link bấm được (`src/lib/share/renderPublicMarkdown.ts:22-23`); ảnh https tuỳ ý cũng được giữ (`isStorableImageUrl`).
- **Hệ quả:** bất kỳ tài khoản nào cũng dựng được trang `www.tappyai.com/r/…` trông như “TappyAI trả lời” với nội dung + link lừa đảo (ví dụ “Scam Shield: link này an toàn”). Không XSS (đã escape, C1 đã sửa).
- **Hướng sửa (cần anh chọn):** (a) server lưu bản ký HMAC của mỗi câu trả lời nó sinh ra, chỉ cho chia sẻ bản có chữ ký hợp lệ (đúng nhất); (b) tạm thời: trang công khai chỉ biến thành link các host trong danh sách nền tảng quen (Maps, Shopee, Booking…), còn lại hiện chữ thường + nhãn “Nội dung do người dùng chia sẻ”.

### AI-2 · 🟡 Link tĩnh trong nội dung bên thứ ba lọt bộ lọc egress
- `applyPlaceEnrichmentStreamFilter` gom **mọi** URL trong khung `a:` (JSON kết quả công cụ) làm “được phép” (`src/lib/ai/streamEnrichment.ts:3193`, P3-F4). Snippet web / tên quán / review do bên thứ ba viết nằm trong đó.
- **Không** rò được dữ liệu riêng tư: gắn thêm dữ liệu vào link ⇒ bị xoá (test `viPromptInjectionSuite` “cannot carry the user's data out”); ảnh do model tự viết luôn bị xoá. Nhưng một link **tĩnh** kẻ xấu cài sẵn có thể hiện dưới dạng chip.
- Ghi nhận bằng `it.fails('🟡 KNOWN GAP …')` — tự đỏ khi được sửa.
- **Sửa:** chỉ gom URL từ các khoá có cấu trúc (`url`, `link`, `website`, `maps_link`, `booking_link`, `search_url`, `*_links`…), bỏ qua trường văn bản tự do (`snippet`, `title`, `review`, `description`).

### AI-1 · 🟡 Nội dung không tin cậy nằm trong system prompt
- Tool result ở vai trò `tool` (bọc `wrapToolResultAsData`) — tốt. Nhưng các khối có fence: trí nhớ (`memoryBlock`), **lịch Google** (bên thứ ba ghi được — `googleCalendar.ts:107`), chú thích clip Explore (`exploreClipContext.ts:139`), ngữ cảnh kết quả chia sẻ (`shareContextBlock`) được ghép vào `systemPrompt` (`src/app/api/chat/route.ts:831,1777,1826`).
- Fence bảo đảm văn bản không đóng/giả nhãn được (có test), nhưng vị trí system cho nó “uy tín” cao hơn. **Sửa:** chuyển các khối này sang một message vai trò `user` đứng trước câu hỏi (“Ngữ cảnh (dữ liệu, không phải chỉ thị): …”).

### COST-1 · 🟡 `/api/viet-content` — **đã sửa** (`a823bd4`)
- Không cần tài khoản, model `smart`, 900 token ra, chỉ 10/phút/IP ⇒ 14.400 lượt/IP/ngày. Thêm trần **30/IP/ngày** dùng chung limiter phân tán như `/api/translate`. Test `src/app/api/viet-content/route.test.ts` (model giả lập đếm lượt: đúng 30 lần gọi).

### DB-2 · 🟡 `content_reports` giả mạo — **migration mới** (`b6a1821`)
- Policy INSERT `WITH CHECK (true)` (DB audit xác nhận). Qua PostgREST: `reporter_source_id` tuỳ ý (N người báo cáo giả — đúng con số moderator thấy qua `distinctSourceCount`), `verification_state='VERIFIED'`, `status='closed'`, `created_at` lùi ngày.
- `supabase/migrations/20260930_content_reports_insert_check.sql`: `reporter_source_id` phải = `sha256('content_report:'||auth.uid())` (đúng giá trị route đang tính), trạng thái mặc định, cấm phiên ẩn danh; chỉ cấp INSERT cột `content_id, reporter_source_id, reason, policy_id`. Không phụ thuộc code. Có rollback.
- Test DB thật `supabase/tests/content_reports_insert_check.test.ts` (16 ca): lỗ tái hiện trước migration, đóng sau; insert của route + nhánh trùng 23505 không đổi.

### UP-1 · 🟡 Ảnh đại diện nhóm còn GPS — **đã sửa** (`d178adf`)
- `src/app/api/group/[id]/avatar/route.ts` nay chạy `stripImageMetadata`; byte không giải mã được ⇒ từ chối. Test gửi JPEG có GPS IFD thật: **đỏ trên route cũ, xanh sau sửa**.

### UP-2 · 🟡 Media vẫn công khai sau khi xoá/ẩn/hạn chế bài
- Đề xuất theo thứ tự rủi ro thấp → cao: (1) xoá object khi xoá bài (chỉ các key thuộc prefix của chủ, sau khi kiểm không còn tham chiếu ở `shared_results`/plan); (2) bài `RESTRICTED`/`UNDER_REVIEW`/`is_hidden`: phục vụ qua route proxy kiểm quyền hoặc **signed URL** ngắn hạn (V4, 10–60 phút) và chuyển bucket sang private; (3) thêm cron dọn object mồ côi (session upload không hoàn tất).

### UP-4 · 🟡 Ảnh cũ trước R-2
- Cần quét bucket (chỉ đọc) bằng `findIdentifyingMetadata` (đã có trong `src/lib/media/clipMetadata.ts`) và xử lý lại/xoá metadata các object còn GPS. Việc này chạm bucket prod ⇒ anh chạy hoặc cho phép riêng (`OWNER-CHECKLIST.md` §6).

### MOB-2 · 🟡 Phiên Android có thể nằm song song ở chỗ không mã hoá
- App tự lưu token vào `EncryptedSharedPreferences` (Keystore) và loại khỏi backup (`backup_rules.xml`, `data_extraction_rules.xml`) — tốt. Nhưng `install(Auth)` (`android/features/auth/.../di/SupabaseModule.kt:49-56`) để mặc định `autoSaveToStorage`/`SessionManager` của supabase-kt 3.0.3, vốn ghi phiên (có refresh token) vào SharedPreferences thường; file đó **không** bị loại khỏi backup (`allowBackup="true"`).
- **Chưa xác minh trên thiết bị.** Kiểm: `adb shell run-as com.tappyai.app ls shared_prefs` sau khi đăng nhập. Nếu đúng: đặt `sessionManager` dùng `EncryptedTokenStorage` hoặc `autoSaveToStorage = false`, và loại file khỏi backup.

### DEP-1 · 🟡 Thư viện
- **npm (web):** 22 cảnh báo sau sửa (4 thấp, 7 TB, 10 cao, 1 nghiêm trọng). Nghiêm trọng = `next@14.2.35` (DoS Image Optimizer, request smuggling trong rewrites, cache ảnh không giới hạn — **chủ yếu ảnh hưởng self-host**, Vercel tự xử lý tầng này; bản vá chỉ có ở 15.5.x/16.x = nâng cấp lớn). Phần lớn “cao” còn lại là công cụ dev (`eslint-config-next`, `glob` CLI, `brace-expansion`, `vitest`) hoặc phụ thuộc bắc cầu không chạy với dữ liệu người dùng (`js-yaml` trong eslint, `undici` trong jsdom, `jsondiffpatch` trong `ai`). **Đã nâng `sharp` 0.35.3 → 0.35.5** (`3819e43`, libvips/libheif; sharp xử lý mọi ảnh upload).
  - Nâng tiếp an toàn (không đổi major) — chạy `npm audit fix` rồi full test: `dompurify` (qua posthog-js), `qs`, `nanoid`, `fflate`, `brace-expansion`, `browserslist`, `vitest` 4.1.11.
  - Kế hoạch lớn (ĐBM): Next 14 → 15.5 (kèm React 19, `eslint-config-next`, `postcss`), `ai` 4 → bản mới.
- **Android (Gradle):** tra OSV cho 21 thư viện trực tiếp (OkHttp 4.12.0, Retrofit 2.11.0, Ktor 3.0.2, supabase-kt 3.0.3, Coil 2.7.0, Media3 1.5.0, security-crypto, Room, Firebase BoM 33.7.0, …) — **0 lỗ hổng đã biết**. Giới hạn: không có JDK/Gradle trên máy nên chưa quét cây phụ thuộc bắc cầu (`./gradlew dependencies` + OWASP dependency-check khi có JDK).
- **iOS (SwiftPM):** chỉ `supabase-swift` `from: "2.0.0"` (`ios/project.yml:27-30`), **không commit `Package.resolved`** ⇒ mỗi lần build CI lấy bản 2.x mới nhất (không tái lập, rủi ro chuỗi cung ứng). Đề xuất commit `Package.resolved`.

### WEB-1 · 🟡 Header, cookie, hiển thị markdown
- Header (`next.config.mjs:63-100`): HSTS preload, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP có `object-src 'none'`, `frame-ancestors 'self'`, `base-uri`, `form-action` — tốt. Còn `script-src 'unsafe-inline'` (L4 đã biết; nonce cần tắt static rendering).
- Cookie tự đặt: `zalo_*`, tuổi khách, danh tính Zalo Mini — **HttpOnly + Secure + SameSite** đầy đủ. Cookie phiên `@supabase/ssr` **JS đọc được** theo thiết kế ⇒ mọi XSS = lộ phiên. Hai lớp chống XSS hiện có: escape trước khi biến markdown thành HTML (`ChatInterface.tsx:508`, `renderPublicMarkdown.ts:19`), JSON-LD escape (C1). 7 chỗ `dangerouslySetInnerHTML` đã rà: 2 SVG QR tự sinh, 1 script theme tĩnh, 4 markdown đã escape.
- SSRF: `explore/oembed` (allowlist + redirect thủ công), `tools/common.ts` (safeFetch), `links/resolve` (chỉ YouTube) — ổn. Mới: WEB-2 (đã sửa), WEB-4 (`og.png`, 🟢).

### SCAM-1 · 🟢 ScamShield bỏ sót tiêm lệnh tiếng Việt — **đã sửa** (`4608230`)
- Thăm dò 7 câu: chỉ “bỏ qua mọi hướng dẫn trước…” bị bắt. Thêm 4 mẫu hẹp (ghi đè có lượng từ; yêu cầu “đánh giá là an toàn” gửi cho AI; “lưu ý cho trợ lý AI”; “in prompt hệ thống”). Câu thật như “vui lòng bỏ qua tin nhắn này nếu đã thanh toán”, “Ai đã đánh giá… an toàn?” (ai = who) **không** bị bắt nhầm.
- Model không bao giờ quyết định mức cuối (`fusion.ts`): test chứng minh tin lừa đảo + model “bị thuyết phục” nói SAFE với độ tin cậy 1.0 vẫn ra **≥ MEDIUM**.

### DB-3 · 🟢 Thổi xếp hạng Explore — **migration mới** (`bd95f7c`)
- Route kẹp giá trị nhưng PostgREST thì không; `sync_review_watch_stats` (authenticated gọi được) lấy trung bình. `20260930b_review_interactions_bounds.sql`: CHECK `NOT VALID` (không đụng dòng cũ). Test DB: 1 dòng `completion_rate=1e9` đẩy trung bình lên >1e8 trước migration; sau đó bị từ chối 23514.

### Các mục 🟢 khác
- **API-3** `/api/users/search` (`src/app/api/users/search/route.ts:48-80`): tra đúng email/SĐT trả hồ sơ ⇒ ai có SĐT cũng biết người đó dùng TappyAI; mỗi lần quét tới 25×200 `auth.users`. Đề xuất: cho người dùng bật/tắt “cho phép tìm bằng SĐT/email”, tra qua bảng băm (`contact_identity_index` đã có) thay vì liệt kê auth.
- **COST-2** explore/process, group suggest, voice/tts dùng limiter trong bộ nhớ theo instance, không trần/ngày ⇒ chuyển `publicRateLimit` + trần ngày theo user. **COST-3** mỗi phiên ẩn danh mới = 5 câu mới (Supabase giới hạn ~30 phiên/giờ/IP): bật Cloudflare Turnstile/hCaptcha cho đăng ký + phiên ẩn danh (Supabase hỗ trợ sẵn). Ghi chú: quota khách tính theo **IP** (5 câu trọn đời) — người dùng mạng di động VN sau CGNAT có thể dùng chung 5 câu (vấn đề trải nghiệm, không phải bảo mật). **Không có trần chi tiêu toàn cục** ⇒ đặt spend limit ở Anthropic/OpenAI console (checklist).
- **WEB-4** `og.png` (`src/app/r/[slug]/og.png/route.tsx:31-50`): fetch ảnh https tuỳ ý từ payload do người dùng kiểm soát; chặn `localhost/127./10./192.168.` nhưng thiếu `172.16/12`, `169.254`, IPv6, tên miền trỏ IP nội bộ. Edge runtime không có mạng nội bộ ⇒ Thấp; dùng `safeFetch`/`urlGuard`.
- **MOB-3** APK flavor `uat` nhúng `VERCEL_BYPASS_SECRET` (`android/app/build.gradle.kts:389`; release để rỗng — đúng): ai có APK UAT vào được preview UAT. Đổi bypass secret khi APK UAT bị chia sẻ rộng.
- **MOB-4** `youtubeEmbedHtml` ghép `videoId` vào HTML (`android/.../ReviewVideoSurface.kt:275-283`), regex `([^&?/]+)` cho phép `"<>` ⇒ chèn HTML/JS trong WebView (JS bật, không có JS bridge, không đọc file) ⇒ giới hạn `[A-Za-z0-9_-]{6,20}`.
- **MOB-5** iOS release giữ ngoại lệ ATS `localhost` (`ios/TappyAI/Resources/Info.plist:84-95`) — bỏ ở Release; SwiftPM không khoá (DEP-1).
- **DB-4** `user_events` FOR ALL cho chủ ⇒ tự sửa/xoá/bịa sự kiện analytics của mình (làm bẩn số liệu). **DB-5** bình luận của bài `is_hidden` vẫn công khai. **DB-6** 22 bảng nội bộ (ví dụ `admin_roles`, `audit_log`, `platform_owner`) vẫn cấp quyền bảng cho `anon/authenticated` — RLS không policy nên đọc/ghi đều bị chặn (ma trận xác nhận), nên REVOKE cho chắc. **DB-7** pgvector cài trong schema `public` (Supabase khuyên `extensions`). `user_integrations` lưu access/refresh token OAuth dạng thô, chủ đọc được qua PostgREST ⇒ khi có XSS là lộ token Google Calendar/Zalo; cân nhắc mã hoá (pgsodium/Vault) và bỏ quyền SELECT cột token.

---

## 4. Bí mật (mục 1)

- **Lịch sử git:** bộ quét kiểu gitleaks (Python, 19 luật: Anthropic/OpenAI/Google/AWS/GitHub/Stripe/Slack/JWT/Supabase/Upstash/Postgres URL/PEM/generic entropy…) chạy trên **20.622 blob** duy nhất từ **1.387 ref** (mọi nhánh + mọi PR ref GitHub). Kết quả thật: chỉ (1) token Travelpayouts cũ trong commit `22135f2` (H2 — **chưa thu hồi**, nhánh `chore/remove-travelpayouts` chưa merge) và (2) khoá Firebase trong `android/app/google-services.json` (M3 — công khai theo thiết kế, cần giới hạn). Các khớp khác là dữ liệu test (JWT `{"sub":"1234567890"}`, `postgres:postgres@127.0.0.1`, mẫu PEM trong `.env.local.example`/workflow).
- **App Android:** `BuildConfig` release chỉ có URL + anon key Supabase + Google Web Client ID (công khai theo thiết kế); `VERCEL_BYPASS_SECRET` rỗng ở release, có ở flavor `uat` (MOB-3). **iOS:** không hard-code; anon key qua xcconfig/CI; JWT lưu **Keychain** (`KeychainStore.swift`).
- **Biến `NEXT_PUBLIC_*`** (25 biến dùng trong code): URL site/app, URL + anon key Supabase, GA4, PostHog key/host, VAPID **public** key, cờ tính năng, thông tin build, URL extension/SuperTux — **không có secret**.
- **Trên đĩa (không phải git):** các file `.env.production.local` … trong `tappyai-mvp` (L5 cũ, vẫn còn); `.env.local` của worktree `audit-nonprod` chứa mật khẩu DB audit (dùng cho phiên này, chỉ đọc).

## 5. Quyền dữ liệu Supabase (mục 3)

**Nguồn:** catalog DB audit (90 quan hệ `public`: 87 bảng + 3 view; 101 policy; 61/194 hàm SECURITY DEFINER), đọc chỉ-đọc 2026-09-30. Tất cả 87 bảng **bật RLS**; 3 view analytics không cấp quyền cho anon/authenticated; **mọi hàm SECURITY DEFINER đều ghim `search_path`**; 23 hàm definer gọi được từ client, đã đọc thân các hàm nhạy cảm (`decision_evidence_*`, `review_likers`, `plan_share_public`, `chat_*`) — đều giới hạn theo `auth.uid()` hoặc trả dữ liệu công khai.

**Test LOCAL “A không đọc/sửa được dữ liệu B”:** `supabase/tests/rls_cross_user_matrix.test.ts` nạp **đúng schema audit** (`supabase/tests/fixtures/audit_schema_2026-09-30.sql`, chỉ cấu trúc) vào PostgreSQL nhúng, gieo 1 dòng của B trong **54 bảng có cột chủ sở hữu**:
- A **không** UPDATE / DELETE / INSERT-thay-B được ở **54/54** bảng.
- A và anon **chỉ đọc** được dòng của B ở 5 bảng công khai theo thiết kế: `profiles` (không có cột email), `reviews` (đã đăng, không ẩn), `review_comments`, `comment_reactions`, `user_follows`.
- Đối chứng dương: chủ đọc được dòng của mình ở 36 bảng, tự tạo ở 27 bảng ⇒ kết quả “bị chặn” là thật, không phải harness hỏng.
- Giới hạn: kiểm **hàng** của người khác; lỗi **cột** trên hàng của chính mình (DB-1, DB-2, DB-3) có test riêng.

**Service role** — 92 file dùng `createAdminClient`/service key: 33 admin (sau `requireAdmin`/RBAC), 14 cron (sau `CRON_SECRET`), 7 controller (outbox/audit), webhook Stripe + Apple (sau chữ ký), và các chỗ người dùng: `account/delete` (xoá auth user), `auth/claim-anonymous` (chuyển dữ liệu giữa 2 uid đã xác thực), `auth/zalo/callback` + `integrations/*/callback` (tạo phiên/lưu token sau OAuth), `chat` (ghi trí nhớ/lịch sử sau turn), `reviews` POST (H1-INSERT: server quyết cột nhạy cảm), `reviews/[id]/like|comments` (đọc chủ bài để gửi thông báo, mốc like), `group` + `group/[id]/join` (đếm thành viên, không liệt kê), `users/search` (tra auth theo email/SĐT — API-3), `profile` (cập nhật metadata auth của chính user), `onboarding`, `track` (ghi analytics có kiểm schema), `notifications/*` (gửi push), `stripe/*` (bảng `billing_customers` chỉ service), `iap/*`, `deals/[id]/click` (L1), `go/at` (ghi attribution), `health` (đếm 1 bảng), `share/sharedResultStore` (đọc kết quả công khai), `memoryService`/`savePriceWatch`/`googleCalendar` (cron tiêm client), `commerce/*` (cấu hình nhà cung cấp), `music` (catalog). Không file `'use client'` nào import service role; `admin.ts` có `import 'server-only'` (L2, trên nhánh này).

Bảng đầy đủ từng bảng: **Phụ lục A**.

## 6. API routes (mục 4)

163 route handler (`src/app/**/route.ts`). Kiểm kê tự động toàn bộ (xác thực, rate limit, service role, kiểm đầu vào, fetch ra ngoài, gọi AI, tham số id), rồi **đọc tay** các nhóm rủi ro: mọi route không cần đăng nhập, các route `[id]` ghi/xoá hoặc dùng service role, các route gọi AI, webhook/IAP, upload, `/go/at`, `/auth/*`. **32 route admin** chỉ được xác nhận bằng quét (có `requireAdmin`/RBAC) — **chưa đọc tay**; **15 cron** được test guard `cronAuth.test.ts` kiểm mã nguồn. Các route khác ghi “chưa đọc tay từng dòng” trong phụ lục.
- **IDOR (mục đọc tay):** route sửa/xoá theo id đều `.eq('user_id', user.id)` hoặc dựa RLS (ma trận §5 xác nhận RLS); route dùng service role theo id chỉ đọc cột công khai.
- **Webhook có kiểm chữ ký:** Stripe (`constructEvent`), Apple (JWS — nay chặt hơn, API-1). **Không có** webhook ACCESSTRADE (đối soát qua pull feed) và **không có** Google Play RTDN (Android chưa có IAP). Cron: 15/15 + backfill fail-closed, so sánh constant-time.
- **Rate limit theo IP thật:** `clientIp()` ưu tiên `x-vercel-forwarded-for`/`x-real-ip`, chỉ lấy hop **phải nhất** của XFF (`src/lib/security/rateLimit.ts:95-110`); kiến trúc có guard `no-adhoc-forwarded-ip`.
- **Kiểm đầu vào:** chat/scam-shield/marketing dùng zod; phần lớn còn lại kiểm `typeof` thủ công (L7 cũ).

Bảng route → kết luận → mức: **Phụ lục B**.

## 7. Bảo mật AI — Rule of Two (mục 5)

[A] nhận nội dung không tin cậy · [B] truy cập dữ liệu riêng tư · [C] kênh ra ngoài (link/ảnh hiển thị, truy vấn model tự viết, hành động).

| Tính năng | [A] | [B] | [C] | Chân bị cắt / nhận xét |
|---|---|---|---|---|
| Chat tư vấn (`/api/chat`) | ✅ web/news/Places/review/lịch Google/ngữ cảnh chia sẻ | ✅ trí nhớ, lịch, nhãn vị trí, lịch sử | ⚠️ link/ảnh; truy vấn `web_search`/`search_*` do model viết → Serper/Google; `save_price_watch` | **[C] cắt bằng code:** ảnh do model viết luôn bị xoá, link phải là bản sao đúng của URL công cụ trả về/đã hiện (không gắn thêm dữ liệu được) — P3-F2/F4 + suite mới. Còn: AI-2 (link tĩnh), truy vấn tìm kiếm có thể mang ngữ cảnh riêng tư tới Serper/Google (bên thứ ba, không phải kẻ tấn công quan sát được) — đề xuất lọc PII khỏi query. Hành động duy nhất chỉ ghi vào tài khoản của chính user. |
| Hỏi Tappy trên clip Khám phá | ✅ tên quán/địa chỉ/caption do người đăng clip viết | ✅ như chat | ⚠️ như chat | Như chat; caption bị fence `explore_clip` nhưng nằm trong system (AI-1). |
| “Hỏi tiếp” từ kết quả chia sẻ `/r/` | ✅ nội dung người chia sẻ tự ghi (WEB-3) | ✅ của người hỏi | ⚠️ như chat | Như chat. |
| ScamShield | ✅ tin nhắn (chắc chắn thù địch) | ❌ | ❌ (chỉ ra kết luận) | 2 chân. Model không quyết định mức cuối; sàn deterministic; tiêm lệnh = tín hiệu nguy hiểm (SCAM-1). |
| Viết content | nội dung của chính user | ❌ | ❌ | 1 chân. Chi phí: COST-1. |
| Dịch / Quét ảnh | ảnh/chữ bất kỳ | ❌ | ❌ | 1 chân. |
| Tóm tắt trí nhớ (`memoryService`) | ✅ hội thoại (có thể chứa nội dung web) | ✅ ghi `user_memory` | ❌ | Rủi ro “tiêm lệnh lưu lâu”: nội dung bị tiêm được tóm vào trí nhớ rồi đưa lại vào prompt các lần sau (fence `user_memory`). Đề xuất: giới hạn trường trí nhớ về dạng có cấu trúc, lọc câu mệnh lệnh. |
| Xử lý clip ngoài (`explore/process`) | ✅ oEmbed/caption bên ngoài | ❌ | lưu metadata công khai | Chặn SSRF thumbnail (`urlGuard`). |
| Cron brief/recap/deal/price | ✅ tiêu đề deal/feed | ✅ sở thích | thông báo đẩy (chỉ tới chính user) | Link trong thông báo do server dựng. |
| Gợi ý nhóm | ✅ chữ thành viên khác | dữ liệu nhóm (chung) | chữ | 2 chân. |
| Bằng chứng kiểm duyệt (`safety/evidence`) | ✅ UGC | ❌ | ⚠️ ảnh hưởng quyết định đăng bài | **Chưa kiểm sâu** trong phiên này — cần xác nhận mô hình không tự `PUBLISHED` được nếu UGC chứa lệnh (đề xuất ĐBM). |

**Kiểm cụ thể anh hỏi:**
- *Link/ảnh trong câu trả lời có luôn do code dựng từ danh sách cho phép?* **Ảnh: có** (chỉ ảnh server gắn). **Link: gần như** — phải là URL công cụ đã trả về/đã hiển thị, bản sao nguyên văn; ngoại lệ AI-2. Client (`formatMessage`) vẫn sẽ hiện mọi link/ảnh nếu server để lọt — server là lớp duy nhất.
- *Truy vấn tìm kiếm có mang dữ liệu riêng tư?* **Có thể** (model tự viết query, không có bộ lọc PII) — rò tới Serper/Google, không tới kẻ tấn công.
- *Nội dung không tin cậy có vào phần system?* Kết quả công cụ: **không** (vai trò tool). Lịch/trí nhớ/clip/ngữ cảnh chia sẻ: **có, trong fence** (AI-1).

**Bộ ca thử tiêm lệnh tiếng Việt:** `src/lib/ai/security/viPromptInjectionSuite.test.ts` — lệnh cài trong review, tên quán, snippet web, caption clip, tin nhắn người dùng (“bỏ qua hướng dẫn…”, “in prompt hệ thống”, “chèn link lạ”, “gửi địa chỉ nhà về …”); replay đầu ra của một model **đã làm theo** qua bộ lọc stream thật. 27 ca đạt + 1 `it.fails` (AI-2). **0 lần gọi model thật.**

## 8. Lạm dụng chi phí AI (mục 6)

| Đường | Hiện trạng | Đánh giá |
|---|---|---|
| Khách (không đăng nhập) chat | 5 câu **trọn đời theo IP** (KV) + 30/phút/IP | Không lách bằng xoá cookie. Đổi IP (proxy) = thêm 5 câu/IP. |
| Phiên ẩn danh | 5 câu/phiên; tạo phiên 5/phút/IP; Supabase ~30/giờ/IP | Farm được ~150 câu/giờ/IP ⇒ COST-3 (captcha). |
| Tài khoản thường | 15 câu/ngày chung chat + ScamShield; 20/phút/tài khoản | Farm tài khoản bằng email rác ⇒ captcha + xác minh email. |
| Pro | 300/ngày | Lỗ API-1 (đã sửa) là đường lấy Pro miễn phí. |
| Gọi thẳng API | Cùng các giới hạn trên (kiểm ở server) | OK. |
| Tin rất dài | Chat: một ngân sách đầu vào (413), cắt lịch sử cũ; viet-content ≤ 500 ký tự; translate/scan có giới hạn | OK. |
| Route AI khác | viet-content (đã thêm trần ngày), translate/scan (trần ngày), explore/process, group suggest, TTS (chỉ theo instance) | COST-2. |
| Trần toàn cục | **Không có** | Đặt spend limit ở console nhà cung cấp model + cảnh báo. |

## 9. Upload (mục 8)

- **Server kiểm:** ảnh qua route (review, avatar, cover, nhóm) — kiểm magic byte (không tin MIME client), trần dung lượng, **xoá EXIF/GPS bằng re-encode** (nhóm: nay mới có). Video/thumbnail/ảnh deal tải thẳng GCS: server cấp key (không cho client chọn), khoá kích thước qua `X-Upload-Content-Length`, lúc hoàn tất kiểm content-type, **metadata nhận dạng** (GPS, thiết bị, XMP) và nay **dung lượng thật** (UP-3). SVG chỉ cho ảnh deal (admin).
- **Signed URL (đề xuất UP-2):** đọc: V4 signed URL ngắn hạn cho media của bài không công khai, bucket private; ghi: đã dùng resumable session do server cấp (tương đương signed upload).

## 10. App di động (mục 9)

| Hạng mục | Android | iOS |
|---|---|---|
| Lưu token | Keystore (`EncryptedTokenStorage`), loại khỏi backup — nhưng xem MOB-2 | Keychain |
| Deep link | `tappyai://auth-callback` + `tappyai://group` (custom scheme — chiếm được); `https://…/r/` App Link `autoVerify` | `tappyai://auth/callback` custom scheme |
| Nhận phiên qua deep link | **MOB-1** | **MOB-1** |
| Thành phần exported | Chỉ `MainActivity` (launcher, SEND/PROCESS_TEXT chỉ điền sẵn chat, không tự gửi) + alias App Link; service/provider `exported=false` | — |
| WebView | SuperTux (JS, không file, host cố định), YouTube (MOB-4) | YouTube `WKWebView` |
| Mạng | Không cleartext | ATS mặc định; ngoại lệ `localhost` (MOB-5) |

---

## 11. Thay đổi trên nhánh `security/hardening-2026-09-30`

| Commit | Nội dung | Test |
|---|---|---|
| `a2c107f` | Gộp `fix/security-medium-low` (M4, M2, L1, L2, L6, L3) | 48 test DB |
| `e6c9feb` | Manifest thứ tự migration + 4 migration mới của rc | `migrationOrder.test.ts` |
| `d178adf` | UP-1 ảnh nhóm xoá EXIF/GPS | `group/[id]/avatar/route.test.ts` (đỏ trên code cũ) |
| `eb4f037` | WEB-2 allowlist endpoint Web Push (route + lúc gửi) | subscribe + send tests |
| `a823bd4` | COST-1 trần ngày viet-content | `viet-content/route.test.ts` |
| `b6a1821` | DB-2 migration `20260930_content_reports_insert_check` | `content_reports_insert_check.test.ts` (PG thật) |
| `fea7f38` | API-1 Apple IAP (policy, 409, OID/chuỗi/hạn/ES256) | `appleIapPolicy.test.ts` (8 ca đỏ trên code cũ), `jws.test.ts` |
| `4608230` | SCAM-1 mẫu tiêm lệnh tiếng Việt + bộ ca thử AI | `viPromptInjectionSuite.test.ts` |
| `936e9c8` | UP-3 kiểm dung lượng lúc hoàn tất | `uploadCompletion.test.ts` |
| `1df21bc` | Test `/go/at` (xác nhận 020ff56) | `go/at/route.test.ts` (đỏ trên route trước 020ff56) |
| `3819e43` | sharp 0.35.5 | media suites |
| `06fbeca` | Ma trận RLS A↔B trên schema audit | `rls_cross_user_matrix.test.ts` |
| `bd95f7c` | DB-3 migration `20260930b_review_interactions_bounds` | `review_interactions_bounds.test.ts` (PG thật) |
| `bbca6ce` | Cron R21 dùng helper constant-time | `cronAuth.test.ts` |
| `2dbd2bf` | `20260928c` REVOKE nêu tên anon/authenticated (guard ADR-019); typecheck suite | `check:sql-grants` 0 lỗi |

**Migration mới, chưa áp ở đâu** (đều có rollback, pre-flight, idempotent, không phụ thuộc code): `20260930_content_reports_insert_check.sql`, `20260930b_review_interactions_bounds.sql`. Cùng với các migration cũ chưa áp: `20260927`, `20260928`, `20260928b`, `20260928c`.

**Chạy lại bằng chứng:**
```bash
npx vitest run supabase/tests/rls_cross_user_matrix.test.ts supabase/tests/content_reports_insert_check.test.ts supabase/tests/review_interactions_bounds.test.ts
npx vitest run src/app/api/iap src/lib/apple-iap src/app/api/notifications src/lib/notifications src/app/go/at src/app/api/viet-content src/lib/ai/security/viPromptInjectionSuite.test.ts
```
Kết quả toàn bộ test / typecheck / lint của nhánh: **§12**.

## 12. Kiểm tra toàn nhánh

Trên máy local, nhánh ở `2dbd2bf`:

| Kiểm | Kết quả |
|---|---|
| `npx vitest run` (toàn repo) | **16.011 đạt**, 1 expected-fail (AI-2), 70 skip (15 file có điều kiện môi trường), 2 lỗi = `cronAuth` guard (do rc thêm cron R21 sau L6) → **đã sửa** `bbca6ce`, chạy lại xanh |
| 46 suite PostgreSQL thật (`supabase/tests`) + `cronAuth` | **1.067/1.067 đạt, 0 skip** (không suite nào bị skip im lặng vì cổng bận) |
| `tsc --noEmit` (binary thật `node_modules/typescript/bin/tsc`) | 0 lỗi |
| `next lint` | 0 lỗi (chỉ cảnh báo có sẵn) |
| `npm run architecture:check` | 15/15 luật đạt |
| `npm run check:sql-grants` (ADR-019) | 0 lỗi (4 lỗi của `20260928c` đã sửa ở `2dbd2bf`) |
| `next build` (biến public giả, không secret, không trỏ prod) | **thành công**, 197/197 trang; `.next/static` không chứa tên biến bí mật phía server |
| Gọi model thật | **0 lần, $0** |

---

## Phụ lục A — RLS từng bảng (DB audit, 2026-09-30)

Cột “Quyền bảng”: S I U D cho anon / authenticated ở mức bảng (quyền theo cột ghi riêng). “A đọc B / A sửa·xoá·chèn-thay B / anon đọc”: kết quả thật của `rls_cross_user_matrix.test.ts` (n/a = bảng không có cột chủ sở hữu). Policy: `uid` = `auth.uid()`, `(R)` = RESTRICTIVE, `[all]` = mọi vai trò.

| Bảng | RLS | Quyền bảng anon / auth (S I U D) | Policy | A đọc B | A sửa·xoá·chèn-thay B | anon đọc | Nhận xét |
|---|---|---|---|---|---|---|---|
| `account_deletion_jobs` | bật | ···· / ···· | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `account_status` | bật | ···· / ···· | SEL[auth]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `activation_daily_rollup` | bật | YYYY / YYYY | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `admin_permissions` | bật | YYYY / YYYY | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `admin_roles` | bật | YYYY / YYYY | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `anon_chat_usage` | bật | YYYY / YYYY | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `anon_identity_map` | bật | ···· / ···· | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `audit_log` | bật | YYYY / YYYY | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `audit_log_anchor` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `audit_log_client` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `auth_daily_rollup` | bật | YYYY / YYYY | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `billing_customers` | bật | ···· / Y··· | SEL[auth]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `bookings` | bật | YYYY / YYYY | ALL[all]: (uid = user_id) | không | chặn | không | Chủ tự đặt status tuỳ ý (không ảnh hưởng người khác) |
| `chat_blocks` | bật | ···· / YY·Y | DEL[all]: (blocker_id = uid)<br>INS[all]: (blocker_id = uid)<br>SEL[all]: (blocker_id = uid) | không | chặn | không | Theo chủ sở hữu |
| `chat_messages` | bật | ···· / YY·· | INS[all]: (chat_is_participant(thread_id) AND (sender_id = uid) AND…<br>SEL[all]: chat_is_participant(thread_id) | không | chặn | không | Theo chủ sở hữu |
| `chat_participants` | bật | ···· / Y··· | SEL[all]: chat_is_participant(thread_id) | không | chặn | không | Theo chủ sở hữu |
| `chat_reads` | bật | ···· / YYY· | INS[all]: ((user_id = uid) AND chat_is_participant(thread_id))<br>SEL[all]: (user_id = uid)<br>UPD[all]: (user_id = uid) | không | chặn | không | Theo chủ sở hữu |
| `chat_reports` | bật | ···· / YY·· | INS[all]: ((reporter_id = uid) AND (NOT COALESCE(((auth.jwt() ->> '…<br>SEL[all]: (reporter_id = uid) | không | chặn | không | Theo chủ sở hữu |
| `chat_settings` | bật | ···· / Y··· | SEL[all]: true | n/a | n/a | n/a | Công khai theo thiết kế |
| `chat_threads` | bật | ···· / Y··· | SEL[all]: chat_is_participant(id) | n/a | n/a | n/a | Theo chủ sở hữu |
| `cohort_metrics` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `comment_reactions` | bật | YYYY / YYYY | DEL[all]: (uid = user_id)<br>INS[all]: (uid = user_id)<br>SEL[all]: true<br>UPD[all]: (uid = user_id) | có (công khai) | chặn | có (công khai) | Công khai theo thiết kế |
| `commerce_click_attributions` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `commerce_feed_items` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `commerce_feed_runs` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `commerce_providers` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `contact_identity_index` | bật | ···· / ···· | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `contact_matches` | bật | ···· / Y··Y | DEL[all]: (owner_user_id = uid)<br>SEL[all]: (owner_user_id = uid) | không | chặn | không | Theo chủ sở hữu |
| `contact_sync_state` | bật | ···· / Y··· | SEL[all]: (user_id = uid) | không | chặn | không | Theo chủ sở hữu |
| `content_reports` | bật | YYYY / YYYY | INS[auth]: true | n/a | n/a | n/a | DB-2: INSERT WITH CHECK(true) → giả reporter_source_id / VERIFIED — migration 20260930 (mới) |
| `conversations` | bật | YYYY / YYYY | ALL[all]: (uid = user_id) | không | chặn | không | WEB-3: chủ ghi messages tuỳ ý — là nguồn trang /r/ công khai |
| `daily_snapshots` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `decision_evidence` | bật | ···· / ···· | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `department` | bật | YYYY / YYYY | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `department_membership` | bật | YYYY / YYYY | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `event_outbox` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `favorites` | bật | YYYY / YYYY | ALL[all]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `governed_events` | bật | ···· / ···· | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `group_members` | bật | YYYY / YYYY | DEL[auth]: (uid = user_id)<br>INS[auth]: (uid = user_id)<br>SEL[auth]: fn_group_participant(group_id) | không | chặn | không | Theo chủ sở hữu |
| `groups` | bật | YYYY / YYYY | ALL[all]: (uid = creator_id)<br>SEL[auth]: fn_group_participant(id) | không | chặn | không | Theo chủ sở hữu |
| `marketing_campaigns` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `marketing_consent` | bật | ···· / ···· | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `message_feedback` | bật | YYYY / YYYY | ALL[all]: (uid = user_id)<br>ALL[all]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `moderation_actions` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `moderation_queue` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `music_categories` | bật | YYYY / YYYY | SEL[all]: is_active | n/a | n/a | n/a | Công khai theo thiết kế |
| `music_followed` | bật | YYYY / YYYY | DEL[all]: (uid = user_id)<br>INS[all]: (uid = user_id)<br>SEL[all]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `music_providers` | bật | YYYY / YYYY | SEL[all]: true | n/a | n/a | n/a | Công khai theo thiết kế |
| `music_saved` | bật | YYYY / YYYY | DEL[all]: (uid = user_id)<br>INS[all]: (uid = user_id)<br>SEL[all]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `music_track_reports` | bật | YYYY / YYYY | INS[all]: (uid = reporter_id) | không | chặn | không | Theo chủ sở hữu |
| `music_tracks` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `music_usage` | bật | YYYY / YYYY | INS[all]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `notification_deliveries` | bật | ···· / ···· | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `notification_subscriptions` | bật | YYYY / YYYY | ALL[all]: (uid = user_id) | không | chặn | không | WEB-2: chủ ghi endpoint tuỳ ý qua PostgREST — đã chặn lúc gửi (eb4f037) |
| `notifications` | bật | YYYY / YYYY | SEL[all]: (uid = user_id)<br>UPD[all]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `organization` | bật | YYYY / YYYY | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `partner_deal_translations` | bật | YYYY / YYYY | SEL[all]: (EXISTS ( SELECT 1 FROM partner_deals d WHERE (d.id = par… | n/a | n/a | n/a | Công khai theo thiết kế |
| `partner_deals` | bật | YYYY / YYYY | SEL[all]: (is_active AND ((start_at IS NULL) OR (start_at <= now())… | n/a | n/a | n/a | Công khai theo thiết kế |
| `place_photos` | bật | YYYY / YYYY | SEL[all]: true | n/a | n/a | n/a | Công khai theo thiết kế |
| `plan_shares` | bật | ···· / YY·Y | DEL[auth]: (owner_id = uid)<br>INS[auth]: ((owner_id = uid) AND (COALESCE(((auth.jwt() ->> 'is_anon…<br>SEL[auth]: (owner_id = uid) | không | chặn | không | Theo chủ sở hữu |
| `platform_owner` | bật | YYYY / YYYY | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `platform_owner_recovery` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `platform_settings` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `price_watches` | bật | YYYY / YYYY | ALL[all]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `profiles` | bật | YYYY / YYYY | INS[all]: (uid = id)<br>INS[all]: (uid = id)<br>SEL[all]: true<br>SEL[all]: (uid = id)<br>SEL[all]: true<br>SEL[all]: (uid = id)<br>UPD[all]: (uid = id)<br>UPD[auth]: (id = uid)<br>UPD[all]: (uid = id) | có (công khai) | chặn | có (công khai) | M1: UPDATE mọi cột của mình (follower_count…) — migration 20260927 CHƯA áp; SELECT công khai (không có email) |
| `query_texts` | bật | ···· / ···· | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `review_comments` | bật | YYYY / YYYY | DEL[all]: (uid = user_id)<br>INS[all]: (uid = user_id)<br>SEL[all]: true | có (công khai) | chặn | có (công khai) | L3: đọc công khai cả bình luận của bài bị giữ — migration 20260928c CHƯA áp |
| `review_interactions` | bật | YYYY / YYYY | ALL[all]: (uid = user_id) | không | chặn | không | DB-3: chủ tự ghi watch_seconds/completion_rate tuỳ ý → thổi xếp hạng qua sync_review_watch_stats |
| `review_likes` | bật | YYYY / YYYY | DEL[all]: (uid = user_id)<br>INS[all]: (uid = user_id)<br>SEL[all]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `review_milestones` | bật | YYYY / YYYY | SEL[all]: true | n/a | n/a | n/a | Công khai theo thiết kế |
| `review_saves` | bật | YYYY / YYYY | ALL[all]: (uid = user_id)<br>DEL[all]: (uid = user_id)<br>INS[all]: (uid = user_id)<br>SEL[all]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `review_shares` | bật | YYYY / YYYY | DEL[auth]: (uid = user_id)<br>INS[auth]: ((uid = user_id) AND (COALESCE(((auth.jwt() ->> 'is_anony…<br>SEL[auth]: ((uid = user_id) AND (COALESCE(((auth.jwt() ->> 'is_anony… | không | chặn | không | Theo chủ sở hữu |
| `reviews` | bật | YYYY / YYYY | DEL[all]: (uid = user_id)<br>INS[all]: (uid = user_id)<br>SEL[all]: (uid = user_id)<br>SEL[all]: (NOT is_hidden)<br>SEL(R)[anon,auth]: ((publication_state IS NULL) OR (publication_state = 'PUB…<br>UPD[all]: (uid = user_id) | có (công khai) | chặn | có (công khai) | H1: INSERT + UPDATE mọi cột của dòng mình (publication_state, is_verified, bộ đếm) — migration 20260927/20260928 CHƯA áp |
| `services` | bật | YYYY / YYYY | SEL[all]: (is_active = true) | n/a | n/a | n/a | Công khai theo thiết kế |
| `shared_results` | bật | ···· / Y··· (UPDATE cột: status,updated_at) | SEL[auth]: (owner_id = uid)<br>UPD[auth]: (owner_id = uid) | không | chặn | không | Theo chủ sở hữu |
| `subscriptions` | bật | YYYY / YYYY | SEL[all]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `system_health_log` | bật | YYYY / YYYY | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `user_acquisition` | bật | YYYY / YYYY | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `user_demographics` | bật | ···· / ···· (UPDATE cột: city,country,education_level,gender,gend) | INS[auth]: (uid = user_id)<br>SEL[auth]: (uid = user_id)<br>UPD[auth]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `user_events` | bật | YYYY / YYYY | ALL[all]: (uid = user_id)<br>INS[all]: (uid = user_id)<br>SEL[all]: (uid = user_id) | không | chặn | không | DB-4: chủ INSERT/UPDATE/DELETE sự kiện analytics của mình (làm bẩn số liệu) |
| `user_follows` | bật | YYYY / YYYY | DEL[all]: (uid = follower_id)<br>INS[all]: (uid = follower_id)<br>SEL[all]: true | có (công khai) | chặn | có (công khai) | Công khai theo thiết kế |
| `user_integrations` | bật | YYYY / YYYY | ALL[all]: (uid = user_id) | không | chặn | không | Token OAuth (access/refresh) lưu thô, chủ đọc được qua PostgREST (XSS → lộ token Google/Zalo) |
| `user_memory` | bật | YYYY / YYYY | ALL[all]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `user_memory_fk_cleanup_log` | bật | ···· / ···· | — (chỉ service role) | n/a | n/a | n/a | Chỉ service role |
| `user_notes` | bật | ···· / ···· | — (chỉ service role) | không | chặn | không | Chỉ service role |
| `user_preferences` | bật | YYYY / YYYY | ALL[all]: (uid = user_id)<br>ALL[all]: (uid = user_id) | không | chặn | không | Theo chủ sở hữu |
| `vouchers` | bật | YYYY / YYYY | SEL[all]: (is_active = true) | n/a | n/a | n/a | Công khai theo thiết kế |

## Phụ lục B — API routes

| Route | Phương thức | Xác thực | Rate limit | Service role | Kết luận | Mức |
|---|---|---|---|---|---|---|
| `/.well-known/apple-app-site-association` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/.well-known/assetlinks.json` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/.well-known/indexnow/[key]` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/account/delete` | POST | đăng nhập | — | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/admin/analytics/activation` | GET | admin | có | — | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/analytics/auth` | GET | admin | có | — | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/analytics/growth` | GET | admin | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/analytics/users` | GET | admin | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/audit` | GET | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/deals` | GET,POST | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/deals/[id]` | DELETE,PATCH | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/deals/upload` | POST | admin | có | — | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/home/snapshot` | GET | admin | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/marketing/campaigns` | GET,POST | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/marketing/campaigns/[id]` | GET,PATCH | admin | — | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/marketing/campaigns/[id]/activate` | POST | admin | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/media/wif-check` | GET | admin | có | — | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/moderation` | GET | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/moderation/[id]/resolve` | POST | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/notifications/broadcast` | POST | admin+CRON_SECRET | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/notifications/send` | POST | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/org/memberships` | DELETE,GET,PATCH,POST | admin | có | — | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/rbac/roles` | GET,POST | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/rbac/roles/[id]` | DELETE | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/security/sessions` | GET | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/security/sessions/[sessionId]` | DELETE | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/security/sessions/force-logout` | POST | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/settings` | GET | admin | có | — | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/users` | GET | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/users/[id]` | GET | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/users/[id]/ban` | POST | admin | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/users/[id]/date-of-birth` | POST | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/users/[id]/notes` | GET,POST | admin+internal? | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/users/[id]/suspend` | POST | admin | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/users/[id]/unban` | POST | admin | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/admin/users/[id]/unsuspend` | POST | admin | có | có | quét: có requireAdmin/RBAC trước service role (chưa đọc tay) | — |
| `/api/age-declaration` | POST | không | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/auth/anonymous` | POST | đăng nhập | có | — | COST-3: mỗi phiên ẩn danh mới = 5 câu mới (Supabase giới hạn ~30 phiên/giờ/IP) | Thấp |
| `/api/auth/claim-anonymous` | POST | đăng nhập | có | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/auth/zalo` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/auth/zalo/callback` | GET | không | — | có | MOB-1: cùng kênh trả phiên về app qua custom scheme | Cao |
| `/api/bookings` | GET,POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/chat` | POST | đăng nhập+internal? | phân tán | có | Quota chung (15/ngày, khách 5 theo IP), burst phân tán, cắt input; egress link/ảnh do server lọc | — |
| `/api/comments/[commentId]/reactions` | DELETE,POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/commerce/handoff` | POST | không | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/config` | GET | không | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/conversations` | DELETE,GET,POST,PUT | đăng nhập | — | — | WEB-3: client ghi nguyên messages (nguồn của trang /r/ công khai) | TB |
| `/api/cron/account-deletion-jobs` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/analytics-snapshot` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/audit-retention` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/behavior-rollup` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/click-attributions-sweep` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/deal-notifications` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/decision-evidence-sweep` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/feed-ingest` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/lunch-reminder` | GET | CRON_SECRET | — | — | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/marketing-retention` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/morning-brief` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/outbox-drain` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/price-check` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/travel-reminder` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/cron/weekly-recap` | GET | CRON_SECRET | — | có | CRON_SECRET fail-closed (so sánh constant-time: nhánh medium-low L6) | — |
| `/api/deals` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/deals/[id]/click` | POST | không | — | — | L1: thổi số click — đã sửa ở fix/security-medium-low (gộp vào nhánh này) | Thấp |
| `/api/explore/oembed` | GET | không | — | — | Allowlist host + redirect thủ công | — |
| `/api/explore/process` | POST | đăng nhập | có | — | COST-2: gọi AI, giới hạn trong bộ nhớ 20/phút/người, không trần/ngày | Thấp |
| `/api/favorites` | DELETE,GET,POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/group` | GET,POST | đăng nhập | — | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/group/[id]/avatar` | POST | đăng nhập | — | — | UP-1: lưu ảnh còn EXIF/GPS — ĐÃ SỬA (d178adf) | TB |
| `/api/group/[id]/join` | POST | đăng nhập | — | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/group/[id]/suggest` | POST | đăng nhập | có | — | COST-2: gọi AI, giới hạn trong bộ nhớ theo instance | Thấp |
| `/api/health` | GET | không | — | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/iap/apple/notifications` | POST | chữ ký | — | có | API-1: không kiểm bundle/môi trường — ĐÃ SỬA (fea7f38) | Cao |
| `/api/iap/apple/verify` | POST | đăng nhập+internal? | — | có | API-1: JWS app khác / Sandbox / otid dùng chung cấp Pro — ĐÃ SỬA (fea7f38) | Cao |
| `/api/integrations` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/integrations/google-calendar` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/integrations/google-calendar/callback` | GET | đăng nhập | — | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/integrations/zalo` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/integrations/zalo/callback` | GET | đăng nhập | — | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/links/resolve` | POST | không | có | — | Chỉ gọi youtube oembed (không SSRF) | — |
| `/api/memory` | DELETE,GET,PATCH,POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/message-feedback` | DELETE,POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/messaging/threads` | GET,POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/messaging/threads/[id]/messages` | GET,POST | đăng nhập | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/messaging/threads/[id]/read` | POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/music/categories` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/music/providers` | GET | không | — | — | 410 Gone (F-024) | — |
| `/api/music/tracks` | GET,POST | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/music/tracks/[id]` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/music/tracks/[id]/report` | POST | không | — | — | 410 Gone (F-024) | — |
| `/api/music/tracks/search` | GET | không | — | — | 410 Gone (F-024) | — |
| `/api/notifications` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/notifications/backfill` | POST | CRON_SECRET | — | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/notifications/marketing-consent` | GET,PUT | đăng nhập | có | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/notifications/read` | POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/notifications/subscribe` | DELETE,POST | đăng nhập | — | — | WEB-2: endpoint Web Push tuỳ ý → SSRF mù — ĐÃ SỬA (eb4f037, kiểm cả lúc gửi) | TB |
| `/api/notifications/subscribe/reconcile` | POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/oembed` | GET | không | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/onboarding` | POST | đăng nhập+internal? | — | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/plan-images/manifest` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/plans/share` | POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/preferences` | GET,POST,PUT | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/preferences/profile` | GET,POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/price-watch` | DELETE,GET,POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/profile` | GET,PATCH,POST | đăng nhập+chữ ký | — | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/qr/entry` | GET | không | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/rates` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/recommendations` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/reviews` | GET,POST | đăng nhập+internal? | có | có | DB-1 (H1): reviews INSERT/UPDATE mọi cột qua PostgREST vẫn mở trên DB audit — migration 20260927/20260928 chưa áp | Cao |
| `/api/reviews/[id]` | DELETE,GET,PATCH | đăng nhập | — | — | UP-2: xoá bài không xoá ảnh/video GCS (link cũ vẫn mở) | TB |
| `/api/reviews/[id]/comments` | DELETE,GET,POST | đăng nhập | có | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/reviews/[id]/interact` | POST | đăng nhập | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/reviews/[id]/like` | POST | đăng nhập | — | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/reviews/[id]/likes` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/reviews/[id]/report` | POST | đăng nhập | — | — | DB-2: route đúng, nhưng PostgREST ghi thẳng content_reports giả người báo cáo — migration 20260930 (chưa áp) | TB |
| `/api/reviews/[id]/save` | POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/reviews/[id]/share` | POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/reviews/feed` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/reviews/liked` | GET | đăng nhập+internal? | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/reviews/mine` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/reviews/saved` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/reviews/shared` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/reviews/upload` | POST | đăng nhập+chữ ký | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/scam-shield/analyze` | POST | đăng nhập | phân tán | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/scam-shield/check` | POST | đăng nhập | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/scam-shield/directory` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/scam-shield/qr` | POST | đăng nhập | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/scam-shield/share` | POST | đăng nhập | phân tán | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/scan` | POST | không | phân tán | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/shared-results` | POST | đăng nhập | phân tán | — | WEB-3: “câu trả lời” công khai lấy từ conversations do client ghi → giả mạo nội dung + link trên tappyai.com/r/ | TB |
| `/api/shared-results/[slug]` | DELETE,GET | đăng nhập | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/shared-results/preview` | POST | đăng nhập | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/social/connections` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/sound/[trackId]` | GET | không | — | — | 410 Gone (F-024) | — |
| `/api/sound/[trackId]/follow` | DELETE,POST | không | — | — | 410 Gone (F-024) | — |
| `/api/sound/[trackId]/play` | POST | không | — | — | 410 Gone (F-024) | — |
| `/api/sound/[trackId]/save` | DELETE,POST | không | — | — | 410 Gone (F-024) | — |
| `/api/stripe/checkout` | POST | đăng nhập | — | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/stripe/portal` | POST | đăng nhập | — | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/subscription` | GET | đăng nhập | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/suggested-prompts` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/track` | POST | đăng nhập+internal? | có | có | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/translate` | POST | không | phân tán | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/upload/audio` | POST | không | — | — | 410 Gone (F-024) | — |
| `/api/upload/video` | POST | đăng nhập+internal? | có | — | UP-3: không kiểm lại dung lượng khi hoàn tất — ĐÃ SỬA (936e9c8) | Thấp |
| `/api/users/[id]` | GET | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/users/[id]/follow` | POST | đăng nhập | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/users/search` | GET | đăng nhập | — | có | API-3: tra cứu CHÍNH XÁC email/SĐT → lộ việc có tài khoản + quét tới 25 trang auth.users mỗi lần | Thấp |
| `/api/version` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/viet-content` | POST | không | phân tán | — | COST-1: không có trần/ngày (14.400 lượt/IP/ngày) — ĐÃ SỬA (a823bd4) | TB |
| `/api/voice/language` | POST | đăng nhập | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/api/voice/tts` | POST | đăng nhập | có | — | COST-2: giới hạn trong bộ nhớ theo instance | Thấp |
| `/api/webhooks/stripe` | POST | chữ ký | — | có | Kiểm chữ ký Stripe (constructEvent) | — |
| `/api/zalo/mini/verify` | POST | không | có | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/auth/callback` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/auth/confirm` | GET | không | — | — | MOB-1: platform=android|ios đẩy token phiên qua custom scheme; app nhận phiên không cần đăng nhập đang chờ | Cao |
| `/feed.xml` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/games/supertux` | GET | chữ ký | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/go/at` | GET | không | có | có | Không phải open redirect (HMAC + host allowlist); RL theo IP nền tảng đúng (020ff56) — test 1df21bc. Link không hết hạn (Thấp) | — |
| `/llms.txt` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/og/tappyai-v1.png` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/opensearch.xml` | GET | không | — | — | Quét tự động không thấy dấu hiệu; chưa đọc tay từng dòng | — |
| `/r/[slug]/og.png` | GET | không | — | — | WEB-4: fetch ảnh https tuỳ ý (edge) từ payload do người dùng kiểm soát; chặn IP nội bộ chưa đủ | Thấp |
