# Scam Shield — bảng thực tế web + HỢP ĐỒNG CHUNG cho web, Android, iOS (02/10/2026)

Người viết: phiên WEB. Đọc từ mã `rc/web-uat` (đường dẫn dưới đây là trong repo). Android và iOS đọc bằng git, KHÔNG checkout trong `C:\wtrel`.

## 1. Bảng thực tế trên WEB (trước → sau đợt này)
| Mục | Web trước | Web sau | Ghi chú |
|---|---|---|---|
| (a) Kiểm link | CÓ — `POST /api/scam-shield/check` | không đổi | Công cụ xác định (DNS, SSL, chuyển hướng, danh sách chặn, đối chiếu thư mục chính thức, có thể gồm Google Web Risk). Không AI, không tốn hạn mức câu hỏi. |
| (b) Kiểm TIN NHẮN (dán chữ) | CÓ — `POST /api/scam-shield/analyze` | không đổi | Quy tắc xác định + mọi link trong tin đi qua công cụ link + **AI theo bậc** (bậc 0 = chỉ link/không chữ: KHÔNG AI; bậc 1–2 = có AI). Tin KHÔNG được ghi log. |
| (c) Quét MÃ QR | CÓ nhưng ảnh bị **TẢI LÊN máy chủ** (`POST /api/scam-shield/qr`) | **Giải mã NGAY TRONG TRÌNH DUYỆT**, chỉ gửi link đã giải mã | Trái quy tắc riêng tư chung → sửa. Route `/qr` còn trên server cho khách cũ nhưng giao diện web không gọi nữa. |
| (d) Thư viện tình huống | CÓ — 25 tình huống Bộ Công an (`/scam-shield/kich-ban`, 5 nhóm) | không đổi | 89 tình huống Phase 8: CHƯA vào, đúng như quyết định. |
| (e) Số khẩn cấp 113 | CÓ — «Báo ngay cho Công an nơi gần nhất hoặc gọi 113» trong từng tình huống (thư viện) | không đổi | Không có khối 113 cố định trên kết quả kiểm tin nhắn/link. |
| (f) Chia sẻ kết quả | CÓ — `POST /api/scam-shield/share` (kết quả LINK → trang công khai `/r/<slug>`, dựng ở máy chủ từ kết quả kiểm link, KHÔNG có chữ của người dùng) | không đổi | Kết quả kiểm tin nhắn không có chia sẻ công khai. |
| (g) Giải thích | CÓ — tín hiệu có lời giải thích (song ngữ), lời khuyên «Không làm / Nên làm» | không đổi | |
| (h) Mic / đọc loa | KHÔNG | không đổi | |
| QR không phải link (thanh toán, Wi-Fi, danh bạ, SMS, email, vị trí, liên kết mở app, văn bản) | KHÔNG (báo lỗi «mã QR không chứa liên kết») | **CÓ** — hiện LOẠI mã + cảnh báo «TappyAI không tự thanh toán/kết nối/gọi/mở…» + nội dung đọc được | Không gửi gì lên máy chủ. |

Loại thiếu so với yêu cầu chung (nêu rõ để khỏi hiểu nhầm):
- **«Khớp tình huống tĩnh bằng `matchScenario` + khối nguồn + nút Đọc cảnh báo gốc»: KHÔNG có ở bản release** (loại **B** — nằm trong Phase 8, chưa vào). Hợp đồng hiện có trả «tín hiệu + loại thủ đoạn + lời khuyên», không trả «tên tình huống số N».
- **Không có chế độ «chỉ khớp tĩnh, không AI» ở server** cho tin nhắn có chữ: bậc 1–2 luôn gọi mô hình và trừ **1 câu hỏi AI** trong hạn mức chung (cùng quỹ với chat). Nếu app muốn chặn AI trước khi người dùng đồng ý chia sẻ dữ liệu với AI thì phải **không gọi** `/analyze` cho tin có chữ cho tới khi có đồng ý (link thuần vẫn gọi được: bậc 0 không AI).

## 2. HỢP ĐỒNG (Android và iOS dùng ĐÚNG những route này; web KHÔNG đổi server)
Gốc: `https://www.tappyai.com` (UAT: `https://uat.tappyai.com`). Cần đăng nhập: KHÔNG (khách được dùng). Lỗi luôn là mã HTTP không phải 2xx kèm `{error, message}`.
### 2.1 Kiểm link — `POST /api/scam-shield/check`
- Body: `{ "url": "<chuỗi ≤ 2048>" }`. Tên miền trần (`vietcombank.com.vn`) được nhận; thiếu dấu chấm hoặc không phân tích được → 400.
- 200: `CheckResult` = `{ inputType, url, risk:{score 0–100, confidence, level}, evidence:{…}, officialMatch:{brand, website, hotline?}|null, actions:[{code,label_vi,label_en,…}], checkedAt, cached }`. `risk.level` ∈ `SAFE | LOW | MEDIUM | HIGH | CRITICAL | INCONCLUSIVE` (INCONCLUSIVE = «chưa đủ thông tin»). Hiển thị: an toàn / nghi ngờ / nguy hiểm / chưa đủ thông tin theo `level`; lý do ngắn lấy từ `evidence` + `actions`; nguồn đối chiếu lấy từ `officialMatch`.
- Lỗi: 400 `invalid_input`; 400 `private_url` (địa chỉ nội bộ bị từ chối); 429 `rate_limit` (10 lần/phút/IP) hoặc `daily_limit`; 500 `check_failed`.
- Giới hạn ngày: **30 lần (có tài khoản) / 10 lần (khách)**, tính chung cho kiểm link (và route QR cũ); chia sẻ có hạn mức ngày riêng theo IP (`share_daily_limit`, 429).
- App KHÔNG tự mở link. Nút «Đừng mở» / «Mở thận trọng» là của app (mở bằng trình duyệt, sau khi người dùng xác nhận).
### 2.2 Kiểm TIN NHẮN — `POST /api/scam-shield/analyze`
- Body: `{ text?: ≤ 8000 ký tự thô (tin được cắt còn 4000 ký tự), url?: ≤ 2048, imageBase64?: ảnh chụp tin (JPEG/PNG/WebP/GIF ≤ 5 MB), mimeType? }` — ít nhất MỘT trong text/url/imageBase64. **Với app: chỉ gửi `text`/`url`; ảnh chụp tin là tính năng riêng, không cần ở v1.**
- 200: `MessageAnalysisResult` = `{ inputType, risk:{level,score,confidence}, scamType|null, attackGoal|null, signals:[{type,severity,explanation,source:'rule'|'ai'|'url'}], requestedActions[], detectedEntities:{urls,phoneNumbers,emails,organizations,platforms}, urlChecks[], advice:{doNot:[{code,label_vi,label_en}], doNow:[…]}, reasoningSummary, analysis:{tier 0–3, aiStatus:'used'|'not_needed'|'quota_exhausted'|'unavailable'|'failed', …}, analyzedAt }` + trường hạn mức khi có AI. Cùng thang `risk.level` với kiểm link.
- Tin bình thường: `risk.level` thấp/SAFE, không tín hiệu. Test đã có phía server (`analyze/route.test.ts`, `message/__tests__`); e2e UAT 02/10 xem mục 4.
- Lỗi: 400 `invalid_input`/`invalid_image`; 429 `rate_limit` (6 lần/phút/IP) hoặc hết hạn mức AI (`aiStatus: quota_exhausted`, vẫn trả kết quả quy tắc); 403/503 khi tài khoản bị hạn chế.
- **Riêng tư:** tin KHÔNG được ghi log, KHÔNG lưu DB; chỉ có dòng nhật ký hình dạng (độ dài, bậc). Tin có chữ (không chỉ link) được gửi tới OpenAI để phân tích.
### 2.3 Quét QR — GIẢI MÃ TRÊN MÁY
1. Giải mã trên máy (web: gói `qr` chạy trong trình duyệt; Android/iOS: thư viện sẵn của nền tảng). **Không gửi ảnh.**
2. Phân loại bằng văn bản đã giải mã (web: `src/lib/scam-shield/qr/payload.ts` — **chép đúng logic**): `http(s)://…` hoặc tên miền trần → `url`; `000201…` (VietQR/EMVCo) hoặc `momo:`/`zalopay:`/`vnpay:`/`vietqr:`… → thanh toán; `WIFI:` → Wi-Fi; `BEGIN:VCARD`/`MECARD:` → danh bạ; `tel:` → số điện thoại; `smsto:`/`sms:` → SMS; `mailto:`/`MATMSG:` → email; `geo:` → vị trí; mọi scheme khác (`intent:`, `market:`, `javascript:`, `data:` …) → liên kết mở app; còn lại → văn bản.
3. `url` → gọi `POST /api/scam-shield/check {url}` (mục 2.1) và hiển thị như kiểm link. Mọi loại khác: hiện LOẠI + cảnh báo («không tự thanh toán / không tự kết nối Wi-Fi / không tự gọi / không tự mở…») + nội dung đọc được (cắt 500 ký tự); **không tự thực hiện hành động nào, không gọi máy chủ**.
4. Quyền camera/ảnh có lời giải thích vi/en; từ chối không làm app sập (cho chọn ảnh).
5. Route cũ `POST /api/scam-shield/qr` (nhận ảnh) vẫn còn nhưng **KHÔNG dùng nữa** ở bản mới của cả ba nền tảng.
### 2.4 Chia sẻ — `POST /api/scam-shield/share { url, locale? }` → `{ slug, url, host, level }` (kết quả kiểm LINK; trang công khai `/r/<slug>`; không có chữ người dùng). Tin nhắn thì chia sẻ bằng **văn bản thường** do app dựng (mức + lý do ngắn), KHÔNG kèm nội dung tin gốc nếu người dùng không chọn.
### 2.5 Thư viện — `GET /api/scam-shield/directory` (danh sách tổ chức/tên miền chính thức, có cache 1 giờ). Thư viện 25 tình huống chạy bằng trang web `/scam-shield/kich-ban` (dữ liệu tĩnh trong mã web; app không có API riêng; đồng bộ qua server: backlog).
### 2.6 Giới hạn chi phí
Kiểm link/QR-link: không token. Tin nhắn có chữ: 1 câu hỏi AI/lần trừ vào hạn mức chung (khách ít hơn tài khoản; xem `quota` trong phản hồi). Burst: 10/phút (link), 6/phút (tin).

## 3. Sửa đổi phía WEB đợt này
- QR giải mã trong trình duyệt (mới: `qr/clientDecode.ts`, `qr/payload.ts`, `scamQr` i18n; giao diện mới hiện thẻ «Mã QR này không chứa đường link web»). Server KHÔNG đổi.
- `/privacy`: thêm đoạn Scam Shield (link → dịch vụ kiểm tra; tin có chữ → OpenAI; QR đọc trên thiết bị, ảnh không tải lên; không lưu tin/ảnh/số của kẻ lừa đảo).

## 4. Bằng chứng UAT (xem `docs/uat/DEBT-RESULTS-2026-10-01.md` cuối tệp và báo cáo của phiên) — điền sau khi chạy.
