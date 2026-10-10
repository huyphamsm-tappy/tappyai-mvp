# Phase 8 (Web) — Decision register và production evidence audit (2026-10-10)

**Trạng thái:** tài liệu quyết định. **Không có proposal nào được triển khai.** Không sửa `translate`, `scan`, Stripe routes, send path, `android/`, `ios/`, `supabase/migrations/`; không tạo migration; không đổi flag/env; không thêm logging production. Nhánh `p8/agent-runtime`, HEAD `74062fc` (trước tài liệu này: `751de1c`, `ac2ea17`, `74062fc`).
**Cập nhật 2026-10-10 (owner đã cho phép truy cập production CHỈ-ĐỌC, tối thiểu):** kết quả kiểm tra bằng chứng ở **DR-9** (bên dưới). Các trạng thái "MISSING" trong DR-6 là trạng thái *trước* lần kiểm tra này; trạng thái hiện hành nằm ở DR-9.

## 0. Cách đọc
| Nhãn | Nghĩa |
|---|---|
| **VERIFIED** | đọc/chạy được trong repo hoặc test; ghi rõ nguồn |
| **PROPOSED** | đề xuất, chưa triển khai, chưa được owner duyệt |
| **OWNER** | quyết định chỉ owner đưa ra được |
| **MISSING** | bằng chứng production không có trong repo |
| **RISK** | rủi ro còn lại: *accepted* (owner đã chấp nhận) hay *unresolved* (chưa) — hiện **chưa có rủi ro nào được owner ghi nhận là accepted** |

**Checkpoint (VERIFIED, không chạy lại vì không có thay đổi mã sau lần chạy cuối):** `git status` sạch trừ `artifacts/` (untracked, giữ nguyên); `npx tsc --noEmit` exit 0; `npx eslint src scripts supabase --ext .ts,.tsx,.mjs` 0 lỗi / 47 cảnh báo cũ; `npm test` 1143 files passed / 19 skipped, 18,754 tests passed, 1 expected fail, 84 skipped, 1 todo, 0 failed; required-suite gate OK (95 suites bắt buộc, 8 skip có chủ đích). Chạy trên chính `74062fc`.

**Trùng tên cần lưu ý:** "E1–E8" trong tài liệu này và `WEB-HANDOFF-NOTES.md` là *bằng chứng production*. "E2" trong `PHASE8-CLOSURE-MATRIX.md` (WP-04) là hạng mục *user_events* — ở đây gọi là **WP04-E2**.

---
## DR-1 · `translate` và `scan`: ngân sách ngày, burst, tách anonymous / signed-in
**Nguồn:** `SEC4-TRANSLATE-SCAN-PROPOSAL.md`, `SEC4-TRANSLATE-SCAN-SENSITIVITY.md`.

**Verified (code):** cả hai route ẩn danh, chỉ có `publicDailyRateLimit` 30 (translate) / 20 (scan) mỗi IP mỗi ngày VN; **không có burst, không có ngưỡng toàn cục**; refusal chưa dùng `rateLimitedResponse` nên khi store lỗi người dùng đọc câu "giới hạn ngày". Cap đầu vào: translate ≤ 2,000 ký tự / output ≤ 1,024 token; scan ≤ ~7.5 MB ảnh / output ≤ 2,048 token. Giá trong repo (`gpt-6-luna`, đọc 2026-09-30): input $0.125/M (mức cache-write, áp cho input không cache), output $0.50/M.

**Căn cứ chi phí (tính toán trên giả định, không phải đo đạc):** translate ≈ $0.00025 (điển hình) – $0.00077 (tối đa) mỗi request. scan ≈ $0.00103 – $0.00165 (ảnh 5,000 token) và $0.0023 – $0.0029 (ảnh 15,000 token). **Token của ảnh KHÔNG có trong repo** → chi phí/scan lệch 2.5×–4.3× giữa kịch bản thấp và cao.

| Quyết định con | Lựa chọn | Recommendation | Trade-off | Cần owner |
|---|---|---|---|---|
| a. Ngân sách ngày **translate** | $1 / $5 / $10 → 1,303 / 6,518 / 13,037 call (cơ sở worst-case) | **không chọn số.** Quy tắc: `B ≥ call hợp lệ dự kiến/ngày × chi phí điển hình × hệ số an toàn` | thấp: user hợp lệ bị từ chối sớm; cao: chịu nhiều chi phí hơn nếu bị lạm dụng | chọn B hoặc nêu mức thiệt hại chấp nhận được |
| b. Ngân sách ngày **scan** | $1 / $5 / $10 → 606 / 3,032 / 6,064 call (ảnh 5k, worst) hoặc 344 / 1,724 / 3,449 (ảnh 15k, worst) | **không chọn số, và không chọn trước khi có token ảnh đo được.** Nếu owner buộc phải chọn sớm: dùng cột *ảnh 15k + output tối đa* (cận an toàn, không phụ thuộc giả định A4) và coi con số là trần chi phí | cận an toàn làm ceiling thấp hơn ~1.8× so với kịch bản base → từ chối sớm hơn | chọn B + chấp nhận cơ sở tính |
| c. Burst / client | translate 10/phút, scan 5/phút (cộng daily hiện có) | **PROPOSED**: 10/phút (tiền lệ `viet-content` 10/phút + 30/ngày) và 5/phút (phán đoán: chụp + upload ≥ 10 s) | burst thấp có thể chặn người dùng sau NAT chung | xác nhận 10 / 5 hoặc cho số khác |
| d. Tách anonymous / signed-in | (1) chung một ceiling; (2) ceiling riêng cho signed-in (hoặc miễn); (3) bắt đăng nhập cho cả hai tool | **PROPOSED (2)**: ceiling riêng, để kẻ lạm dụng ẩn danh không khoá cả thành viên | (1) đơn giản nhưng ceiling biến tấn công chi phí thành tấn công **khả dụng**; (2) cần thêm số + thiết kế; (3) đổi hợp đồng "tool ẩn danh" | chọn 1/2/3 và số cho ceiling signed-in |
| e. Store lỗi | fail-closed / fail-open sang in-process | **PROPOSED fail-closed** (route tốn tiền; D2 của owner đã áp cho route trả phí) + thông điệp mới "tạm thời không khả dụng" ở mọi locale | chặn mọi người dùng tool trong lúc store sập | xác nhận + duyệt wording đa ngôn ngữ |
| f. IPv6 | khoá theo /64 | **PROPOSED** (nếu không, mỗi địa chỉ IPv6 là bucket mới) | NAT/văn phòng dùng chung /64 hoặc IPv4 bị chia sẻ cho mọi người | xác nhận |

**Rủi ro:** *unresolved* — lạm dụng chi phí (không có ceiling), false-positive do CGNAT, ceiling bị đốt có chủ đích; ước lượng token ảnh sai.
**Thiếu thông tin:** E2 (lưu lượng/429 theo route), E3 (token thực tế gồm token ảnh, model đang chạy, reasoning), E1 (KV hoạt động).
**Điều kiện để chốt số scan:** có ≥ 1 bản ghi usage provider thật cho ảnh scan đại diện (hoặc dashboard cho thấy token/ảnh) **hoặc** owner chọn rõ cận an toàn (cột 15k).
**Trạng thái:** CHỜ OWNER; chưa triển khai; `KNOWN_GAP_BUDGET` vẫn 5.

---
## DR-2 · Send limiter: per-instance hay shared fail-open
**Nguồn:** `MESSAGE-SEND-LIMITER-AUDIT.md` §2, §6.
**Verified:** `rateLimit('messaging:send:<user>', 60, 60 s)` in-process; trần thực tế `60 × N instance`; không phụ thuộc store nên không có chế độ outage; chi phí/message khi flag thông báo tắt = 1 lookup + 1 insert (+ trigger `chat_touch_thread`); khi flag bật: fan-out tới 49 người nhận (bảng N=1/5/20/50 trong §6 của audit). Web giữ draft khi gửi lỗi nhưng chỉ hiện thông báo chung.

| Lựa chọn | Outage store | Trần lạm dụng | Chi phí thay đổi |
|---|---|---|---|
| A. Giữ per-instance (hiện tại) | 0% send lỗi | `60 × N` | không |
| B. Shared fail-closed | **100% send lỗi toàn nền tảng** khi store sập (DB vẫn khoẻ) | 60/phút | đổi route |
| C. Shared fail-open (về in-process) | 0% send lỗi | 60/phút khi khoẻ; `60 × N` khi sập | đổi route + **option mới** trên helper dùng chung (mặc định vẫn closed) |

**Recommendation (PROPOSED):** **A, không đổi**, cho đến khi E6 cho thấy lạm dụng thực (vượt 60 tin/phút/user) hoặc flag thông báo được bật. Nếu cần giới hạn chính xác: **C**. **B không khuyến nghị.** Khi flag bật, biện pháp chính cho fan-out là *collapse* (DR-4), không phải limiter.
**Thiếu:** E6 (giá trị `MESSAGE_NOTIFICATIONS_ENABLED`, số instance, sự kiện > 60/phút).
**Rủi ro:** *unresolved* — trần `60×N` không biết N (UNVERIFIED).
**Owner action:** chọn A / C; nếu C, chấp nhận cửa sổ degraded khi outage.
**Trạng thái:** CHỜ OWNER; send path **không đổi**.

---
## DR-3 · Stripe `checkout` / `portal`: retire (404) hay giữ + anonymous refusal + rate limit
**Nguồn:** `STRIPE-ROUTES-REVIEW.md`, `SEC4-ROUTE-MATRIX.md` (mục 2026-10-10).
**Verified:** route chỉ 404 khi `SUBSCRIPTIONS_ENABLED` bật; mặc định tắt, `.env.local.example` = `false`, tài liệu release nói không đặt → route **chạy** (`flagGate.test.ts`: tắt ⇒ 401 cho khách chưa đăng nhập). Không có caller nào trong repo (Web/Android/iOS, tìm kiếm không sửa gì). Session ẩn danh vào được và tạo Stripe customer + `billing_customers` + Checkout/Portal session không giới hạn. Comment trong code: Stripe không onboard seller cá nhân Việt Nam.

| Lựa chọn | Mô tả | Trade-off |
|---|---|---|
| **P-A** retire | 404 vô điều kiện cả hai route (giống `/api/memory` POST) | đóng hoàn toàn bề mặt, rẻ, đảo ngược được; rủi ro: bản build/khách ngoài repo còn gọi (cần E4) |
| **P-1 + P-2** giữ có hạn chế | từ chối anonymous (403 `account_required`), limiter theo user 10/giờ mỗi route; thứ tự: flag → 401 → 403 → 429 → Stripe | giữ hành vi cho user đăng nhập; số 10/giờ là phán đoán; store sập ⇒ không ai mở được checkout |
| c. đặt `SUBSCRIPTIONS_ENABLED` | đóng route như hệ quả phụ | là quyết định thanh toán riêng, không phải của slice này |

**Recommendation (PROPOSED):** **P-A nếu** E4 cho thấy 0 traffic tới `/api/stripe/*` **và** owner xác nhận rail Stripe đã bỏ; **nếu không** thì P-1 + P-2. Không chọn khi chưa có E4.
**Đã xác minh thêm (DR-9/E4, 2026-10-10 07:23Z):** biến `SUBSCRIPTIONS_ENABLED` **không tồn tại** trong project Vercel ở cả production/preview/development, và `GET /api/config` của production trả `flags.subscriptions = false`. Theo mã (`subscriptionsEnabled()` chỉ bật với `1`/`true`) ⇒ **hai route Stripe đang chạy (không 404) trong production** *nếu bản deploy chứa hành vi flag này* (config có trường `flags.subscriptions` nên mã cổng flag có mặt). `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` tồn tại ở production **và** preview (loại sensitive, cập nhật 2026-06-19).
**Thiếu:** key Stripe có hiệu lực không (cần gọi Stripe — không làm); traffic 30 ngày tới `/api/stripe/*` (retention log ~1 giờ; trong ~52 phút quan sát: 0 request); số Stripe customer do session ẩn danh tạo (Stripe dashboard, owner).
**Rủi ro:** *unresolved* — bề mặt Stripe **mở cho session ẩn danh** trong production (suy ra từ mã + flag đã xác minh; chưa thử bằng request); Preview mang key production (F-062). Recommendation không đổi nhưng điều kiện "E4 = 0 traffic" chỉ còn thiếu số liệu traffic dài hạn, không còn thiếu giá trị flag.
**Trạng thái:** CHỜ OWNER; route **không đổi**; registry giữ `known-gap` (slice 5).

---
## DR-4 · Messenger notification collapse (D1–D10)
**Nguồn:** `MESSENGER-NOTIFICATION-COLLAPSE-PROPOSAL.md` §7–§7g, `MESSENGER-COLLAPSE-MIGRATION-REVIEW-PACKAGE.md` §3b, §8; draft ở `docs/phase8/drafts/messenger-collapse/` (ngoài `supabase/migrations/`, **chưa áp dụng**).
**Phạm vi bằng chứng (VERIFIED):** `notification_collapse_draft.test.ts` (19 test) nạp draft SQL nguyên văn vào Postgres thật với fixture *giống production* (roles, `auth.uid()`, cột `notifications` chính xác, RLS, `sender_id` nullable, policy block *đơn giản hoá*); 10 đột biến SQL bị bắt. `messagePushOptions.test.ts` chạy với thư viện `web-push` thật. Test đặc tả hành vi hiện tại của route/UI (không phải test của collapse). **KHÔNG được chứng minh:** PostgREST/pooler, quyền mặc định thật của Supabase, `safety_private.blocked_ids()` thật, schema/dữ liệu production, thay đổi route thật (chưa viết), test component Inbox cho UPDATE realtime.

| ID | Quyết định | Recommendation (PROPOSED) | Trade-off / rủi ro | Bằng chứng hiện có | Owner action |
|---|---|---|---|---|---|
| D1 | Khi nào đánh dấu đã đọc | Chỉ sau khi trang đầu tải thành công (hiện mount là gọi, kể cả khi tải lỗi) | cần đổi `ThreadView` | đặc tả hiện trạng (test đột biến bị bắt); hành vi mới **chưa có test** | duyệt |
| D2 | Tuần tự hoá send/read | advisory lock theo (recipient, thread) + unique index một row unread | hash 64-bit: va chạm chỉ gây chờ | draft suite: 20 emit song song = 1 row; race hai chiều; property run không deadlock | duyệt |
| D3 | Push: Topic / tag / TTL / throttle | Web Push only: Topic = hash base64url 32 ký tự (`message:<id>` làm `web-push` **ném lỗi**), TTL 24 h, urgency normal, `tag` trong service worker; throttle DB 10 phút/(recipient,thread) | Topic chỉ thay push chưa giao (máy offline); push gửi *sau* commit nên push lỗi vẫn "ăn" cửa sổ; `send.ts` dùng chung → option phải mặc định không đổi; FCM/APNs không đổi | `messagePushOptions.test.ts`; throttle với đồng hồ giả trong draft suite | duyệt + xác nhận **10 phút** (đã là tham số) |
| D4 | Số đếm ở đâu | trong payload `data.count`, không trong title (title server-side chỉ có tiếng Việt) | client phải render "(N)" theo locale | thiết kế; chưa có test Web | duyệt |
| D5 | Sender NULL & retry | NULL được đếm (`IS DISTINCT FROM`), actor NULL + title "TappyAI"; đếm *suy ra* nên retry không tăng | hàng không có tên/avatar lúc đó | draft suite (đột biến bị bắt) | duyệt |
| D6 | Store lỗi / thất bại có giới hạn | collapse **không** dùng KV; `lock_timeout` 2 s + `statement_timeout` 3 s làm thuộc tính hàm; 1 retry; rồi INSERT suy biến không push; send luôn 200 | count có thể lệch đến lần emit sau | draft suite (55P03 trong ~2 s, không rò setting; INSERT suy biến 1 row) | duyệt |
| D7 | "Mark all read" | đọc notification message = đọc thread: `mark_notifications_read` dời cursor chat cùng lock | đọc 1 row theo id cũng xoá badge Messenger của thread; cần đổi `/api/notifications/read` | draft suite (mark-all, theo id, id người khác, row bị sửa `threadId`) | duyệt |
| D8 | Attribution của row gộp | người gửi của tin **mới nhất**, đơn điệu | bị block ⇒ policy RESTRICTIVE ẩn row đến khi có tin mới của người khác; xoá tài khoản ⇒ cleanup xoá row, emit sau mở lại | draft suite (chỉ với policy đơn giản hoá) | duyệt |
| D9 | `created_at` hay `updated_at` | **bump `created_at`** = thời điểm tin mới nhất; `data.firstMessageAt` giữ tin đầu; không thêm `updated_at` | `created_at` của row `message` không còn là thời điểm tạo; DTO Android/iOS **chưa kiểm** | draft suite; repo không có consumer coi nó bất biến cho loại này | duyệt + (application phase) xác nhận DTO mobile |
| D10 | Đồng hồ read route | route gọi `mark_thread_read` (giờ DB, `GREATEST`); chặn cursor lùi | client vẫn tự ghi `chat_reads` được (RLS) → chữa ở emit kế tiếp (self-heal) | draft suite; hiện trạng đặc tả bằng test (đồng hồ lambda, không đơn điệu) | duyệt |

**Điều kiện trước khi triển khai (PROPOSED):** owner duyệt D1–D10; chạy pre-check §6 của package trên từng DB (**E7**); cửa sổ triển khai và rollback đã duyệt; đổi 4 chỗ Web (send truyền `created_at` + RPC, read route, `/api/notifications/read`, `ThreadView`) cùng `send.ts`/service worker, viết lại các test đặc tả thành test hành vi; Android/iOS xử lý type `message` **trước** khi bật flag.
**Rủi ro:** *unresolved* — chưa có test qua PostgREST; giao push sau commit (at-most-once mỗi cửa sổ); `data` do chính người nhận sửa được (hậu quả chỉ với chính họ).
**Trạng thái:** CHỜ OWNER; không migration, không route đổi.

---
## DR-5 · `/api/memory` POST: log drain, một dòng log trong handler 404, hay chấp nhận rủi ro
**Nguồn:** `MEMORY-POST-AUDIT.md` §3–§5.
**Verified:** POST trả 404 rỗng trước mọi xử lý (`016b996`); GET/PATCH/DELETE không đổi; repo không có caller POST (Web, Android, iOS; lịch sử git không từng có); `docs/ios/04_API_CONTRACT.md` ghi sai "POST writes/updates" (**chưa sửa**, chuyển giao sang application phase).
**Rủi ro còn lại:** *unresolved* — caller ngoài repo hoặc bundle Web cũ; 404 im lặng nên chỉ log nền tảng mới trả lời. **Không tuyên bố đóng rủi ro.**

| Lựa chọn | Mô tả | Trade-off |
|---|---|---|
| 1. Truy vấn log Vercel hiện có | CLI/Dashboard (câu lệnh chính xác ở §5 của audit) | không đổi mã; **retention phụ thuộc gói** (ghi chú dự án: không có Pro; gói thực tế UNVERIFIED) — nếu < 30 ngày thì không kết luận được |
| 2. Log drain | đẩy log sang kho ngoài ≥ 1 release | đo được dài hạn; cần hạ tầng/chi phí/cấu hình, ngoài repo |
| 3. Một dòng log có cấu trúc trong handler 404 | không body, không user id | thay đổi mã production (thêm logging) → cần duyệt; đo từ lúc deploy; dòng log không đổi hành vi |
| 4. Chấp nhận rủi ro | ghi nhận hậu quả chỉ là 404 vô hại, không còn lệnh gọi LLM | rẻ nhất; owner phải ghi rõ "accepted" |

**Kết quả lựa chọn 1 (đã thử 2026-10-10 07:21–07:30Z, chỉ-đọc): KHÔNG ĐỦ.** Log request production của Vercel chỉ giữ **~1 giờ** (bản ghi cũ nhất lấy được ≈ 52 phút trước; mọi cửa sổ ≥ 90 phút trước đều 0 bản ghi) — xem DR-9/E5. Truy vấn 30 ngày không thể trả lời. Trong ~52 phút còn lại không có request `/api/memory` nào (cả GET) nên cũng không có tín hiệu kiểm chứng bộ lọc từ chính route này (bộ lọc được kiểm bằng route khác).
**Recommendation (PROPOSED), sau kết quả trên:** lựa chọn 1 đã dùng hết khả năng; để có bằng chứng thật cần **3** (một dòng log có cấu trúc trong handler 404, một release, không body/user id) **hoặc** **2** (log drain). Khuyến nghị **3** vì nhỏ, đảo ngược được và không cần hạ tầng ngoài — nhưng nó là thay đổi mã production (thêm logging) nên **chưa làm; cần owner duyệt**. **4** (chấp nhận rủi ro) vẫn là lựa chọn hợp lệ nếu owner ghi nhận bằng văn bản.
**Điều kiện VERIFIED:** có nguồn log giữ ≥ 30 ngày (log drain) hoặc ≥ 1 release quan sát bằng dòng log mới, GET `/api/memory` > 0 trong cùng cửa sổ, và 0 POST từ client thật; hoặc owner ghi "accepted".
**Trạng thái:** MỞ; 404 giữ nguyên; route **không sửa**.

---
## DR-6 · Định nghĩa bằng chứng production E1–E8
Bảng dưới là **định nghĩa** (cái gì cần, lấy ở đâu, khi nào VERIFIED). Trạng thái *hiện hành* của từng E sau lần kiểm tra chỉ-đọc 2026-10-10 nằm ở **DR-9**; không E nào đạt VERIFIED đầy đủ.

| # | Bằng chứng cần lấy | Nguồn / cách lấy (không lộ bí mật) | Điều kiện đánh dấu VERIFIED | Phụ thuộc |
|---|---|---|---|---|
| **E1** | KV Production cấu hình **và đang trả lời** | (a) `vercel env ls production` thấy tên `KV_REST_API_URL`/`KV_REST_API_TOKEN`; (b) Upstash console → Data Browser: có key tiền tố `production:` với dấu vết hoạt động gần đây (một DB dùng chung mọi môi trường, key được gắn tiền tố môi trường — `envKeyPrefix`); (c) log Vercel production có dòng `tappyai_rate_limit` với `reason=limit_exceeded` mà **không** có `store_unavailable` kéo dài | **cả (a) và (b)**; (c) bổ trợ. Chỉ thấy tên biến **không** đủ (vụ 29/57 biến Production pull ra rỗng) | mọi tuyên bố "covered"; DR-1, DR-2, DR-3 |
| **E2** | Số request, 429 và `X-RateLimit-Reason` theo route ≥ 7 ngày sau release | Vercel Logs lọc `tappyai_rate_limit` (không chứa key) + status 429 theo path | có số liệu ≥ 7 ngày liên tục cho từng route liệt kê trong `WEB-HANDOFF-NOTES.md` | DR-1 (burst, false-positive CGNAT) |
| **E3** | Usage provider cho translate/scan: token vào/ra/**ảnh**, model thực tế, reasoning | dashboard provider + liệt kê env `LLM_PROVIDER`, `LLM_SMART_MODEL`, `LLM_VISION_MODEL`, `LLM_*_REASONING` do người có quyền thực hiện | ≥ 1 mẫu ảnh scan đại diện có token ảnh đo được và giá thực | DR-1 (**chặn việc chọn ngân sách scan**) |
| **E4** | Giá trị `SUBSCRIPTIONS_ENABLED` Production & Preview; key Stripe hợp lệ; traffic `/api/stripe/*` 30 ngày | `vercel env ls`/dashboard (giá trị với biến không nhạy cảm); `GET /api/config` của site (trường `subscriptions`, phản ánh env lúc *build*); Stripe dashboard; log Vercel | giá trị flag đọc trực tiếp + 30 ngày log traffic | DR-3 |
| **E5** | Số `POST /api/memory` 30 ngày và User-Agent | câu lệnh ở `MEMORY-POST-AUDIT.md` §5 | như DR-5 | DR-5 |
| **E6** | `MESSAGE_NOTIFICATIONS_ENABLED`; số instance đỉnh; sự kiện > 60 tin/phút/user | env listing; log/metrics Vercel | giá trị flag + số liệu instance + 7 ngày log | DR-2, DR-4 |
| **E7** | Kích thước bảng `notifications`, có row `type='message'` không, policy, `statement_timeout` của role | 6 truy vấn chỉ-đọc ở §6 của review package, owner chạy | kết quả từng truy vấn cho từng DB (audit và production) | DR-4 |
| **E8** | Pre-check migration `20261018` và cửa sổ triển khai | `MIGRATION-20261018-DEPLOYMENT-REVIEW.md` | pre-check đã chạy + cửa sổ được duyệt | migration `20261018` |

---
## DR-7 · Hạng mục BLOCKED (giữ nguyên; không làm gì thêm)
| Hạng mục | Nguồn trong repo | Cần từ owner | Trạng thái |
|---|---|---|---|
| **SF8** (audit_log privilege / PII retention) | `SF8-AUDIT-LOG-PRIVILEGE-DEPENDENCY-AUDIT.md`; `PHASE8-CLOSURE-MATRIX.md` WP-04 ("PASS có điều kiện SF8 = F-096") | xác nhận định nghĩa SF8 và quyết định chính sách | BLOCKED |
| **WP04-E2** (user_events) | `E2-USER-EVENTS-WRITER-AUDIT.md`; closure matrix WP-04: UNVERIFIED | nêu yêu cầu E2 thực sự | BLOCKED |
| **8C / 8D / 8E** | `WEB-ONLY-CHECKPOINT0.md` D1; `PHASE7-CLOSEOUT.md` | chỉ ra màn hình/mockup Web (repo nói đây giống thiết kế Android Home; Home V3 Web bị khoá) | BLOCKED |
| **Realtime Translation** | `PHASE8-BACKLOG.md` B-TR-1; Checkpoint0 D2 | tài liệu kiến trúc, hoặc xác nhận stub là toàn bộ phạm vi | BLOCKED |
| **OpenAI Ads** | `PHASE8-BACKLOG.md` B-ADS-1; Checkpoint0 D3 | tài liệu tham chiếu + quyết định chính sách/pháp lý; không có provider/credential | BLOCKED |
| **Migration `20261018`** | `MIGRATION-20261018-DEPLOYMENT-REVIEW.md` | duyệt pre-check (E8) + cửa sổ triển khai | CHƯA ÁP DỤNG |
| **Messenger media** | – | quyết định bắt đầu | HOÃN |

---
## DR-8 · Sổ rủi ro còn lại (chưa rủi ro nào được owner "accepted")
| Rủi ro | Trạng thái | Quyết định liên quan |
|---|---|---|
| Lạm dụng chi phí `translate`/`scan` (không burst, không ceiling) | unresolved | DR-1 |
| Ceiling biến tấn công chi phí thành tấn công khả dụng | unresolved (nếu áp ceiling) | DR-1d |
| Trần `60×N` của send limiter; N không biết | unresolved | DR-2 |
| Stripe routes mở cho session ẩn danh (flag production đã xác minh tắt ⇒ route chạy) | unresolved; flag VERIFIED, hiệu lực key và traffic dài hạn MISSING | DR-3 |
| Caller ngoài repo / bundle cũ của `POST /api/memory` | unresolved | DR-5 |
| KV production: biến + resource Upstash "Available" đã xác minh; hoạt động của key tiền tố `production:` chưa chứng minh | unresolved (một phần) | E1 |
| Log request production chỉ giữ ~1 giờ ⇒ mọi E cần lịch sử (E2, E4 traffic, E5, E6) không lấy được từ Vercel logs | unresolved | DR-5, DR-9 |
| Quan sát ngẫu nhiên khi đọc log: `POST /api/notifications/subscribe` trả 500 ở 29/30 request trong ~52 phút; `PATCH /api/profile` 500 một lần (chưa điều tra, ngoài phạm vi) | unresolved, cần owner xem xét | DR-9 |
| Collapse: chưa test qua PostgREST; push at-most-once mỗi cửa sổ; policy block/cleanup mới test bằng bản đơn giản hoá | unresolved | DR-4 |
| Thanh tra ratchet: "đã phát hiện lời gọi limiter" ≠ phủ toàn bộ đường provider; danh sách tín hiệu hữu hạn (xem `SEC4-ROUTE-MATRIX.md`) | documented, unresolved | – |
| Doc iOS `04_API_CONTRACT.md` sai về POST memory | handoff, chưa sửa | DR-5 |

---
## DR-9 · Kết quả kiểm tra bằng chứng production CHỈ-ĐỌC (2026-10-10, 07:21Z–07:30Z)
**Quyền và công cụ thực tế:** Vercel CLI 54.18.2 đã đăng nhập (account `huyphamsm-tappy`, team `huyphamsm-tappys-projects`, project `tappyai-mvp`, domain production `www.tappyai.com`). Không có connector/công cụ nào trong phiên cho Upstash, Supabase, Stripe hay dashboard provider LLM ⇒ các bằng chứng cần chúng **không lấy được và không cố vượt quyền**. Cố ý **không** trích credential KV từ env để truy vấn Redis, **không** thử POST vào route production, **không** gọi Stripe/model.
**Cách làm và giới hạn:** (1) `vercel env ls --format json` trong một thư mục scratch ngoài repo — chỉ in *tên biến, target, loại, ngày cập nhật*, không lấy giá trị (lệnh `vercel link` tự tạo `.env.local` chứa token OIDC; **đã xoá, chưa đọc**); (2) một request `GET https://www.tappyai.com/api/config`, chỉ in trường `flags.subscriptions`; (3) `vercel logs` theo lát 2 phút, lọc **phía client**, chỉ in số đếm theo (method, path chuẩn hoá, status) — không in IP, user agent, id, body. **Bài học:** `vercel logs --query` **không** lọc theo path (truy vấn đối chứng với `/api/notifications` trả 0 dù có traffic) ⇒ các truy vấn `--query` ban đầu (memory/stripe/translate/scan, "30 ngày") **không có giá trị làm bằng chứng**; chỉ số liệu lọc client-side bên dưới được dùng. Một lát 2 phút chạm trần 50 bản ghi ⇒ có thể thiếu bản ghi trong lát đó.

| # | Bằng chứng đã kiểm | Nguồn · thời điểm (UTC) | Kết quả | Trạng thái | Còn thiếu để VERIFIED |
|---|---|---|---|---|---|
| **E1** | (a) biến KV; resource Upstash | `vercel env ls` 07:23:00; `vercel integration list` 07:27 | `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL` có ở **production + preview + development**, loại encrypted, cập nhật 2026-08-13; resource `upstash-kv-lime-engine` (Upstash for Redis) trạng thái **Available**, gắn `tappyai-mvp` | (a) **VERIFIED** | (b) hoạt động của key tiền tố `production:` — cần Upstash console/credential: **MISSING**. Dòng log `tappyai_rate_limit`: 0 trong ~55 phút (07:27:54–07:29:46) — không kết luận được (bản deploy production có thể chưa có dòng log này). **E1 tổng thể: PARTIAL, chưa VERIFIED** |
| **E2** | số request/429/reason theo route | `vercel logs` 07:24–07:30 | retention ~1 giờ (xem E5); 0 dòng `tappyai_rate_limit` | **BLOCKED** (retention) | nguồn log dài hạn hoặc metrics ≥ 7 ngày |
| **E3** | env `LLM_*`; key provider; usage | `vercel env ls` 07:23 | **không có biến `LLM_*` nào** ⇒ mặc định trong mã của nhánh này áp dụng (`LLM_PROVIDER` rỗng ⇒ `openai`, model mặc định `gpt-6-luna`, reasoning `none`) — *commit đang chạy production chưa xác minh*; có `OPENAI_API_KEY` (2 mục) và `ANTHROPIC_API_KEY` | env: **VERIFIED** (tên vắng); usage/token ảnh: **MISSING** | dashboard provider: token vào/ra/ảnh ≥ 1 mẫu scan thật. **Vẫn chặn ngân sách scan** |
| **E4** | flag `SUBSCRIPTIONS_ENABLED`; key Stripe; traffic | `vercel env ls` 07:23:00; `GET /api/config` 07:23:11; `vercel logs` 07:24–07:27 | biến **không tồn tại** ở mọi target; `flags.subscriptions = false` trên production. `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` có ở production + preview (sensitive, cập nhật 2026-06-19). Traffic `/api/stripe/*` và `/api/webhooks/stripe`: **0 request** trong ~52 phút quan sát | flag: **VERIFIED (off)**, hai nguồn độc lập; key có mặt: **VERIFIED (tên)**; key hợp lệ: **MISSING**; traffic 30 ngày: **BLOCKED** (retention) | Stripe dashboard (customers/checkout sessions do anonymous tạo, 30 ngày) — owner |
| **E5** | `POST /api/memory` 30 ngày | `vercel logs` 07:21–07:27 | log chỉ giữ **~1 giờ**: bản ghi cũ nhất ≈ 06:31Z khi hỏi lúc 07:24Z; cửa sổ ≥ 90 phút trước = 0 bản ghi; trong ~52 phút không có request `/api/memory` (kể cả GET) | **BLOCKED** (retention); rủi ro **MỞ** | log drain hoặc dòng log trong handler 404 (cần duyệt) |
| **E6** | `MESSAGE_NOTIFICATIONS_ENABLED`; instance; >60 tin/phút | `vercel env ls` 07:23:00 | biến **không tồn tại** ⇒ flag tắt (mã yêu cầu đúng chuỗi `'true'`) | flag: **VERIFIED (off)**; số instance & sự kiện >60: **MISSING/BLOCKED** | metrics Vercel (instances), log dài hạn |
| **E7** | `notifications`: kích thước, row `message`, policy, timeout | – | không có công cụ/quyền DB; không thử | **MISSING** | owner chạy 6 truy vấn chỉ-đọc (package §6) trên từng DB |
| **E8** | pre-check migration `20261018` + cửa sổ | – | không thử | **MISSING** | pre-check + cửa sổ được duyệt |

**Quan sát ngẫu nhiên (ngoài phạm vi, không điều tra):** trong ~52 phút, `POST /api/notifications/subscribe` trả **500 ở 29/30 request** (1 request 200); `PATCH /api/profile` trả 500 một lần trong mẫu 50 bản ghi đầu. Lỗi đăng ký push ảnh hưởng trực tiếp tới tiền đề của thiết kế push ở DR-4. Cần owner quyết định có điều tra (bản deploy production khác nhánh này nên chưa suy ra được nguyên nhân).

**Hệ quả cho các quyết định:** DR-3 — thiếu một mảnh (flag) đã có; DR-5 — lựa chọn 1 đã dùng hết, chuyển sang 3/2/4; DR-1b — vẫn chặn bởi E3; DR-2 — E6 chỉ biết flag tắt (trần fan-out chỉ là lý thuyết khi flag tắt).

---
## Bảng tóm tắt
| Quyết định | Recommendation | Owner action | Bằng chứng cần | Blocker | Trạng thái |
|---|---|---|---|---|---|
| DR-1a translate: ngân sách ngày | không chọn số; dùng quy tắc `B` | chọn B (1/5/10 → 1,303 / 6,518 / 13,037) | E2, E3 | thiếu lưu lượng | CHỜ OWNER |
| DR-1b scan: ngân sách ngày | không chọn số; nếu phải chọn dùng cận 15k-ảnh | chọn B + cơ sở | **E3 (token ảnh)** | không có token ảnh đo được | CHỜ OWNER / BỊ CHẶN bởi E3 |
| DR-1c burst | 10 / 5 mỗi phút | xác nhận hoặc đổi | E2 | – | CHỜ OWNER |
| DR-1d tách anonymous/signed-in | ceiling riêng cho signed-in | chọn 1/2/3 + số | E2 | – | CHỜ OWNER |
| DR-1e/f store lỗi, IPv6 | fail-closed; khoá /64 | xác nhận + wording | E1 | – | CHỜ OWNER |
| DR-2 send limiter | giữ per-instance (A); C nếu có lạm dụng | chọn A/C | E6 | – | CHỜ OWNER |
| DR-3 Stripe | P-A nếu owner xác nhận rail Stripe đã bỏ (traffic dài hạn chưa đo được); không thì P-1+P-2. Flag production đã xác minh **tắt** ⇒ route đang chạy | chọn; xem Stripe dashboard | E4 còn thiếu: key hợp lệ, traffic 30 ngày (retention log ~1 giờ) | không đo được traffic dài hạn | CHỜ OWNER (flag VERIFIED) |
| DR-4 D1–D10 | duyệt thiết kế v3 như §8 package | duyệt/đổi từng D | E7 (+ test PostgREST sau) | cần duyệt trước migration; mobile chưa xử lý type | CHỜ OWNER |
| DR-5 memory POST | log Vercel đã thử: **không đủ** (retention ~1 giờ) → dòng log 1 release (3) hoặc log drain (2); hoặc chấp nhận (4) | chọn 2/3/4 | E5 | retention log ~1 giờ | MỞ (404 giữ nguyên; route chưa sửa) |
| DR-6/DR-9 E1–E8 | xem DR-9 | cấp quyền Upstash/Stripe/provider/DB hoặc tự chạy truy vấn | E1(b), E2, E3 usage, E4 traffic/key, E5, E6 instances, E7, E8 | không có công cụ ngoài Vercel; retention log ~1 giờ | E1 PARTIAL · E2 BLOCKED · E3 PARTIAL · E4 PARTIAL (flag VERIFIED) · E5 BLOCKED · E6 PARTIAL (flag VERIFIED) · E7 MISSING · E8 MISSING |
| SF8, WP04-E2, 8C/8D/8E, Realtime Translation, OpenAI Ads | giữ BLOCKED | cung cấp spec / quyết định | tài liệu nguồn | không có spec | BLOCKED |
| Migration `20261018` | không áp dụng | duyệt pre-check + cửa sổ | E8 | – | CHƯA ÁP DỤNG |
| Messenger media | hoãn | – | – | – | HOÃN |
