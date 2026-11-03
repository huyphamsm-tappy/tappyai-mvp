# Điều tra: `POST /api/notifications/subscribe` → HTTP 500 (2026-10-10)

**Phạm vi:** chỉ đọc log production và đọc code. Không gửi request thử, không gọi provider, không sửa route, không đổi flag/env. Không ghi IP, user agent, token hay dữ liệu người dùng (log CLI của Vercel cũng không trả IP/UA cho các bản ghi này). **Không sửa lỗi.** Baseline `8bc1f8c`.
**Kết luận ngắn:** **nguyên nhân gốc CHƯA xác định.** Có bằng chứng loại trừ một số giả thuyết và thu hẹp về nhóm "lỗi ghi DB ở bước upsert", nhưng dòng log lỗi thật (`[subscribe] Upsert error: <mã>`) đã hết hạn lưu (retention ~1 giờ) trước khi tôi lấy được.

## 1. Sự kiện đã quan sát (VERIFIED, nguồn: `vercel logs`, project `tappyai-mvp`, production)
| Quan sát | Số liệu | Thời điểm lấy |
|---|---|---|
| `POST /api/notifications/subscribe` → 500 | **29** trong khoảng 06:31Z–07:23Z (~52 phút); thêm **1** request cùng route → 200 | 2026-10-10 07:24–07:27Z |
| Mẫu 50 bản ghi đầu tiên (06:55–07:17Z) | 21 lần `POST …/subscribe → 500`, 1 lần `PATCH /api/profile → 500`, **10 lần `GET /api/notifications → 200`**, `GET /api/profile → 200`, `GET /api/messaging/threads → 200` | 07:21Z |
| Cùng cửa sổ, các route đã xác thực khác | `GET /api/notifications` 200 ×20 trong lát quét đầy đủ | 07:24–07:27Z |
| Quét lại sau đó | **0** request `/api/notifications/subscribe` trong 58 phút gần nhất (08:05–08:07Z) và 30 phút (08:11–08:12Z) | 08:05–08:12Z |
Các lỗi 500 xảy ra thành chuỗi trong một khoảng thời gian rồi dừng; không còn request nào để lấy log lỗi. Tôi đã chạy một bộ thăm dò chỉ-đọc nền (08:08Z, 8 phút gần nhất mỗi ~2,5 phút) để bắt lần xảy ra tiếp theo; nó chạy 12 chu kỳ đến 08:42Z (≈ 34 phút) và kết thúc với **0 hit**. Cùng hai lần quét độc lập (08:05–08:07Z và 08:11–08:12Z, đều 0 request), lỗi không tái diễn trong ít nhất ~34 phút sau 08:08Z. Hiện không có bản ghi lỗi nào để phân tích.

## 2. Commit production (đối chiếu)
* Deployment đang phục vụ: `dpl_96JRXTrLyaYwEjCmVvwT5vSpbj2J`, target production, tạo **2026-10-07 06:33:40Z**. Metadata của deployment **không có thông tin git** (CLI không trả `githubCommitSha`).
* **Suy luận (độ tin cậy cao, không phải bằng chứng trực tiếp):** commit là **`f9f2b12`** (merge PR #265, 2026-10-07 06:33:15Z — sớm hơn 25 giây), khớp ghi chú dự án "Web prod f9f2b12".
* Đối chiếu code: `git diff f9f2b12 HEAD` cho `notifications/subscribe/route.ts`, `pushEndpoint.ts`, `socialWriteAccess.ts`, `getRequestUser.ts` **rỗng** ⇒ phân tích dưới đây trên code nhánh này áp dụng cho production (với điều kiện suy luận commit đúng).

## 3. Những chỗ route có thể trả 500 (VERIFIED, đọc code)
1. `error` từ `upsert` vào `notification_subscriptions` ⇒ `500 {error:'save_failed'}`, log `console.error('[subscribe] Upsert error:', error.code ?? error.message)` — **chỉ ghi mã lỗi** (cố ý, để không lộ credential).
2. Mọi ngoại lệ trong `try` ⇒ `500 {error:'server_error'}`, log `[subscribe] Error: <ngoại lệ>`. Gồm: `req.json()` lỗi (thân rỗng/sai định dạng), `getRequestUser` ném lỗi.
Mọi nhánh khác trả mã khác 500: không có phiên ⇒ 401; phiên ẩn danh ⇒ 403; dữ liệu sai (kể cả `provider:'fcm'` token không hợp lệ, hoặc `provider:'apns'` rơi vào nhánh web push thiếu `endpoint/keys`) ⇒ **400**.

## 4. Ai gọi route này (VERIFIED trong code; danh tính 29 request là UNKNOWN)
* **Web:** `usePushNotifications.subscribe()` chỉ POST khi người dùng bấm nút; luồng tự động chỉ gọi `…/subscribe/reconcile`, không POST subscribe. Web **không** tự thử lại.
* **Android:** `NotificationSubscriptionApi` POST `{token, provider:"fcm"}` (tự động theo đăng ký FCM).
* **iOS:** `NotificationManager.uploadToken` POST `{provider:"apns", token}` — route không xử lý `apns`, nên cho **400**, không phải 500.
* Log CLI không có UA/IP, và tôi không cố lấy chúng ⇒ **không biết 29 request đến từ client nào**. Suy luận: việc có 29 lần trong ~52 phút không khớp với bấm nút Web thông thường; gợi ý (không chắc) một client native tự đăng ký lặp lại, hoặc một người dùng bấm nhiều lần.

## 5. Giả thuyết, bằng chứng và độ tin cậy
| # | Giả thuyết | Ủng hộ | Chống lại | Độ tin cậy |
|---|---|---|---|---|
| H1 | **Lỗi DB ở upsert** (route trả `save_failed`), ví dụ vi phạm unique `23505` trên chỉ mục `notification_subscriptions_one_owner_per_credential`, hoặc mã DB khác | chỉ nhánh này (và catch) cho 500; 29/30 lỗi, tức xác định theo trạng thái chứ không ngẫu nhiên; migration `20260830` được áp dụng **thủ công từng phần** (đầu file ghi "safe to apply section by section") nên trạng thái production thực tế có thể lệch | chưa thấy mã lỗi nào | **trung bình** cho nhóm "lỗi ghi DB"; **thấp** cho từng mã cụ thể |
| H2 | Trạng thái migration production không đồng bộ: có chỉ mục unique nhưng **thiếu trigger** chuyển quyền sở hữu ⇒ tài khoản thứ hai đăng ký cùng credential gây `23505` | khớp mô tả "chỉ mục là backstop… biến double-claim thành lỗi lớn" | chưa kiểm được schema production (E7) | **thấp** |
| H3 | Ngoại lệ trong `try` do thân request rỗng/sai (`req.json()`) | có thể xảy ra với client không chuẩn | cả Web lẫn Android đều gửi JSON hợp lệ | **thấp** |
| H4 | Sự cố xác thực (`getRequestUser` ném lỗi) | gây `server_error` | cùng lúc `GET /api/notifications`, `/api/profile`, `/api/messaging/threads` đều trả **200** cho người dùng đã xác thực ⇒ xác thực đang hoạt động | **rất thấp** |
| H5 | Nguyên nhân chung với `PATCH /api/profile → 500` (cùng là ghi có xác thực qua RLS, ví dụ sự cố ghi DB/RLS/timeout) | hai lỗi ghi cùng khoảng thời gian | chỉ **một** lỗi profile trong mẫu; không biết mã lỗi | **thấp, suy đoán** |
| – | Lỗi do chính nhánh này | – | không có thay đổi nào ở route và phụ thuộc giữa `f9f2b12` và HEAD | loại trừ |

## 6. Dữ liệu còn thiếu và cách lấy (chỉ-đọc)
| Thiếu | Cách lấy |
|---|---|
| Dòng log lỗi `[subscribe] Upsert error: <mã>` hoặc `[subscribe] Error: …` | Dashboard Vercel → Logs → Path `/api/notifications/subscribe`, Status 500 → mở request → xem dòng log của hàm. Phải làm **trong vòng ≤ 1 giờ** sau lần xảy ra (retention). Hoặc `vercel logs -p tappyai-mvp --environment production --since 30m --json` rồi lọc phía client theo `requestPath` (đừng dùng `--query`, không lọc theo path) |
| Trạng thái schema production | owner chạy chỉ-đọc: `SELECT indexname FROM pg_indexes WHERE tablename='notification_subscriptions';` · `SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='public.notification_subscriptions'::regclass AND NOT tgisinternal;` · `SELECT provider, enabled, count(*) FROM notification_subscriptions GROUP BY 1,2;` (không chọn cột `subscription_data`) |
| Client nào gọi | log drain có User-Agent đã ẩn danh, hoặc kiểm tra thiết bị đang test (iOS build 142 / Android) trong khung giờ 06:31–07:23Z (13:31–14:23 giờ Việt Nam) |
| Commit production chắc chắn | Vercel dashboard → Deployment → Source (CLI không trả); hoặc `/_next` build id so với build của `f9f2b12` |

## 7. Liên hệ và việc không làm
* Liên hệ với thiết kế push của DR-4: nếu đăng ký push thất bại trên production thì mọi quyết định về throttle/Topic/TTL chỉ có ý nghĩa với thiết bị đã đăng ký thành công; số thiết bị đăng ký thực tế chưa biết (E7).
* **Không sửa gì.** Không thêm logging, không đổi route. Nếu owner muốn sửa sau khi có mã lỗi, cần quyết định riêng.
