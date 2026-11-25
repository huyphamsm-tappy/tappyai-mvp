# Danh sách việc trước và trong ngày deploy bản web (lập 21/11/2026)

Nhánh `feat/brain-r13-p1` (cây `D:\TappyAI-wt\wt-integration`), khoảng 270 commit trước `main` (số đo theo `origin/main` cục bộ, chưa `fetch` lại). Chưa push, chưa deploy. Production chưa bị đụng.

Nhãn: **ANH** = chỉ anh làm được; **EM** = em làm, cần anh nói đồng ý; **CHỜ** = đợi điều kiện.

## Giai đoạn 0 — làm được ngay, không rủi ro
| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| 0.1 | Chứng chỉ HTTPS `media.tappyai.com` chuyển ACTIVE | CHỜ | DNS đã đúng, Google đang cấp. Em kiểm lại. |
| 0.2 | Đăng ký địa chỉ callback Zalo `https://www.tappyai.com/api/auth/zalo/callback` trong trang quản lý ứng dụng Zalo (nếu chưa) | ANH | Trên localhost Zalo báo lỗi -14003 vì chưa đăng ký localhost; production cần callback trên đúng tên miền. |
| 0.3 | Kiểm các cờ đã có trên Vercel Production có giá trị `true`: `REPORTS_ENABLED`, `USER_BLOCKS_ENABLED`, `MODERATION_ADMIN_ENABLED` | ANH/EM | Chỉ thấy TÊN biến, chưa đọc giá trị. |
| 0.4 | Quyết định bật thông báo tin nhắn: thêm `MESSAGE_NOTIFICATIONS_ENABLED=true` | ANH | Biến này CHƯA có trên Vercel Production (tắt). |

## Giai đoạn 1 — biến môi trường Vercel (Production, thêm trước khi deploy)
Em cầm tay anh từng cú bấm khi tới bước này (em không nhập khóa vào ô được).
| Nhóm | Biến |
|---|---|
| Thanh toán | `SEPAY_BANK_ACCOUNT`, `SEPAY_BANK_CODE` (=`BIDV`), `SEPAY_ACCOUNT_NAME` (=`PHAM DOAN HUY`), `SEPAY_WEBHOOK_HMAC_SECRET`, `BREVO_API_KEY`, `PAYMENTS_MAIL_FROM` (=`founder@tappyai.com`), `SUBSCRIPTIONS_ENABLED` (=`true`) |
| Clip (hạ tầng) | `GCS_VIDEO_SOURCE_BUCKET` (=`tappyai-video-src`), `GCS_VIDEO_DELIVERY_BUCKET` (=`tappyai-video-del`), `GCP_TRANSCODER_SERVICE_ACCOUNT`, `GCP_CDN_SERVICE_ACCOUNT`, `CDN_URL_MAP_NAME` (=`tappyai-video-map`), `VIDEO_CDN_HOST` (=`media.tappyai.com`), `VIDEO_CDN_KEY_NAME` (=`tappyai-video-key-1`), `VIDEO_CDN_COOKIE_DOMAIN` (=`.tappyai.com`), `VIDEO_CDN_SIGNING_KEY` (từ tệp khóa), `VIDEO_SPEECH_TRANSCRIBE_ENABLED` (=`true`) |
| Clip (cờ bật) | `EXPLORE_VIDEO_PIPELINE_ENABLED` — **để chưa đặt ở lần deploy đầu**, bật ở Giai đoạn 6 |
| Tin nhắn | `MESSAGE_NOTIFICATIONS_ENABLED` (nếu anh chọn bật ở 0.4) |
Chi tiết giá trị từng biến: `VIDEO-CDN-HUONG-DAN-HUY-20261121.md` và `HUONG-DAN-CAI-KHOA-20261121.md`.

## Giai đoạn 2 — cơ sở dữ liệu production (EM, cần câu "Thêm quyền cho em")
1. **Sao lưu** cơ sở dữ liệu production trước (kế hoạch sao lưu có trong tài liệu an toàn của đợt 1.2). Không áp migration khi chưa có bản sao lưu.
2. **Kiểm trạng thái hiện tại bằng lệnh chỉ đọc**: migration nào đã áp trên production. Em chưa biết chắc, vì UAT từng thiếu các bản an toàn cũ (20260928c, 20261009), có thể production cũng thiếu.
3. **Áp theo đúng thứ tự trong `supabase/MIGRATION_ORDER.txt`** bằng `scripts/release/apply-migration.sh` (từng tệp có tên, có chính sách APPLY/HOLD; `20261001e` giữ ngoài theo kế hoạch cũ). Các bản chắc chắn mới (chưa lên production theo ghi chép): `20261111`–`20261117` (clip), `20261118`–`20261121`, `20261201`–`20261208` (kể cả thanh toán không hoàn tiền, nhóm đi ăn, tự ẩn bài, ẩn bình luận). Mỗi tệp có tệp gỡ trong `supabase/migrations/rollback/`.
4. Kiểm sau mỗi tệp bằng câu truy vấn xác nhận ghi ở cuối từng migration.

## Giai đoạn 3 — mã nguồn lên `main`
| # | Việc | Ai |
|---|---|---|
| 3.1 | Chạy lại toàn bộ test + `next build` thật trong bản sao riêng, trên đúng commit sẽ deploy | EM |
| 3.2 | Rà bảo mật độc lập lần cuối trên toàn bộ phần thay đổi (khoảng 270 commit; hôm nay mới rà phần web của hôm nay) | EM (có thể dùng `/code-review`) |
| 3.3 | Đẩy nhánh lên GitHub và mở Pull Request vào `main` (main được bảo vệ: cần PR và 4 kiểm tra CI + quét bí mật + build thật) | EM, cần anh đồng ý đẩy |
| 3.4 | Anh xem PR, bấm gộp (merge). Vercel tự deploy khi gộp vào main | ANH |

## Giai đoạn 4 — webhook SePay (làm ngay trước hoặc ngay sau deploy)
Tạo webhook ở SePay (menu **Tích hợp WebHooks**): địa chỉ `https://www.tappyai.com/api/payments/sepay`, xác thực **HMAC-SHA256**, chuỗi bí mật trùng `SEPAY_WEBHOOK_HMAC_SECRET`. ANH.

## Giai đoạn 5 — kiểm nhanh trên production ngay sau deploy (anh + em)
1. Trang chủ, đăng nhập: Google, Zalo, email.
2. Chat một câu thường, một câu nghiên cứu sâu (xem hạn mức hiển thị đúng).
3. Trang Deals: thấy thẻ Vexere, Agoda, Lazada.
4. Báo cáo một bài thử, chặn một tài khoản thử, ẩn một bình luận.
5. Thanh toán: tạo mã QR gói rẻ nhất, chuyển khoản số tiền nhỏ thật, xem webhook SePay (tab Lịch sử gửi) báo thành công, gói được cấp, có thư xác nhận.
6. Cài đặt: nút xóa bộ nhớ đệm ảnh chạy.

## Giai đoạn 6 — bật clip (sau khi 0.1, IAM, DNS đều xong)
1. Chứng chỉ ACTIVE; mở `https://media.tappyai.com/` thấy 403/404 (chưa có chữ ký) là đúng.
2. Thêm `EXPLORE_VIDEO_PIPELINE_ENABLED=true` trên Vercel, Redeploy.
3. Đăng một clip thử bằng tài khoản của anh: tải lên, nén, kiểm duyệt (có thể chờ người duyệt), đăng, **phát được trên máy khác** (đây là chỗ CDN và cookie ký chưa từng được thử thật).
4. Có sự cố: xóa biến đó, tắt ngay.

## Kế hoạch gỡ lỗi (nếu có sự cố sau deploy)
- Web: Vercel, tab Deployments, chọn bản trước, **Promote to Production** (quay lại tức thì).
- Cơ sở dữ liệu: dùng tệp rollback từng migration (chỉ khi cần, mỗi tệp có ghi hệ quả).
- Tính năng: tắt cờ tương ứng trên Vercel, Redeploy.
- Thanh toán: bỏ `SUBSCRIPTIONS_ENABLED` để tắt bán gói, không ảnh hưởng người dùng đã có gói.

## Bổ sung 21/11 chiều (sau vòng UAT người dùng mới)
- **Scam Shield tự lấy tin hằng tuần (ĐÃ KIỂM bằng chạy thật):** cron `/api/cron/scam-shield-sync` chạy thứ Hai 03:00 UTC (10:00 giờ Việt Nam), đọc chuyên mục "Cảnh báo tội phạm" của bocongan.gov.vn. Chạy thử với kho tạm trong bộ nhớ: đọc được 12 bài trong danh sách, 3 bài cảnh báo lừa đảo mới nhất (10, 11, 18/11/2026) đều qua chính sách tự duyệt. Điều kiện để chạy trên production: (1) đã áp migration `20261201_scam_knowledge_versions.sql`; (2) `CRON_SECRET` có trên Vercel; (3) cờ AI của bộ nhập (`SCAM_SHIELD_SYNC_AI`) để tắt cũng được. Chỉ đọc 1 nguồn (Bộ Công an); các nguồn khác chưa đọc được từ mạng của dự án. Trên UAT bảng có 0 dòng vì cron chỉ chạy trên Vercel.
- Cron thông báo buổi sáng của Tappy chỉ gửi cho người đã bật thông báo đẩy (cần khóa VAPID + `CRON_SECRET` trên production). Đang chờ anh quyết: cho vào hộp thư mọi người dùng đang hoạt động hay không.
- Số đo tốc độ trả lời: sau deploy, xuất log `tappyai_usage` và chạy `node scripts/perf/latencyReport.mjs logs.txt --by=intent`.
- Chân trang trang chủ: nút Google Play, App Store đã bật mặc định (hai gian hàng đã công khai); nút tắt: `NEXT_PUBLIC_PLAY_LISTING_LIVE=0`, `NEXT_PUBLIC_APP_STORE_URL=off`. Liên kết mạng xã hội trong `src/lib/share/storeListing.ts` (LinkedIn chờ link).
- Thông báo "bạn bè đăng bài" mặc định bật; tắt bằng `FRIEND_POST_NOTIFICATIONS_ENABLED=false`.
- Ảnh logo Vexere và Lazada mới (web + Android); app Android cần bản phát hành mới mới có logo.

## Chưa kiểm / rủi ro còn lại (nói thẳng)
- Phát clip qua CDN thật (cookie ký, tên miền, bộ nhớ đệm) chưa từng được thử.
- Thanh toán thật (khóa SePay thật, webhook thật, email Brevo) chưa thử.
- Đăng nhập Zalo và Google hoàn tất trên tên miền thật chưa thử.
- Hơn 200 commit chưa được rà bảo mật độc lập đầy đủ.
- App Android và iOS chưa cập nhật theo các thay đổi này (anh dặn web trước); cần kiểm app cũ vẫn chạy với API mới (giá gói, hạn mức nghiên cứu sâu, báo cáo bình luận).
- Chưa làm: CAPTCHA đăng ký/đăng nhập (anh dặn để sau khi có người dùng), tự ẩn bình luận trên iOS/Android, chia sẻ clip.
