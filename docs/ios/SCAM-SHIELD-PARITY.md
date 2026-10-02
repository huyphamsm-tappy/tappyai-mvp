# Lá chắn lừa đảo — đồng bộ 3 nền tảng: phần iOS (02/10/2026)

Nguồn đọc (chỉ đọc, `git show origin/rc/web-uat` @ 0b6bba2, không checkout `C:\wtrel`): `src/app/api/scam-shield/{check,analyze,qr,directory,share}`, `src/lib/scam-shield/message/*`, `knowledge/*`. Android: `android/app/src/main/java/com/tappyai/app/scamshield/*` + `assets/scam_knowledge/bocongan2026.json`.

## 1. Bảng thực tế iOS — trước / sau (build kế tiếp)

| # | Tính năng | iOS trước (build 100) | iOS sau | Loại nếu thiếu |
|---|---|---|---|---|
| a | Kiểm **link** | có (`/api/scam-shield/check`) | giữ + nút **«Đừng mở» / «Mở thận trọng»** (hỏi lại trước khi mở, không tự mở), kết quả chia sẻ được | — |
| b | Kiểm **tin nhắn** | **thiếu** | **có**: đọc NGAY TRÊN MÁY với 25 tình huống (khớp theo từ khoá, không mạng); «giống tình huống …» + dấu hiệu + khối nguồn + «Đọc cảnh báo gốc» + «TappyAI không phải cơ quan nhà nước»; không khớp ⇒ «chưa nhận ra thủ đoạn quen thuộc» + lời khuyên chung; tin bình thường ⇒ «chưa thấy dấu hiệu» (không bao giờ «an toàn»). Nút «Phân tích sâu hơn bằng AI» → `POST /api/scam-shield/analyze` **chỉ sau khi đồng ý chia sẻ dữ liệu với AI** | A/C đã làm; phần AI sâu: **B** (route `analyze` chưa có trên production — app báo «chưa có trên máy chủ hiện tại», kết quả tại máy vẫn dùng được) |
| c | Quét **mã QR** | **thiếu** | **có**: camera (AVFoundation) hoặc chọn ảnh (Vision + CIDetector), **giải mã trên máy**; link ⇒ chỉ đường link đi kiểm link; Wi-Fi/danh bạ/điện thoại/SMS/email/thanh toán/ví tiền mã hoá/chữ ⇒ NÊU LOẠI + CẢNH BÁO, không tự làm gì; quyền camera vi/en, từ chối ⇒ vẫn chọn ảnh | C đã làm |
| d | Thư viện tình huống | 25 tình huống (build 100) | giữ | 89 tình huống Phase 8 KHÔNG đưa vào |
| e | Số khẩn cấp 113 | có, cố định | giữ | — |
| f | Chia sẻ kết quả | thiếu | **có** (link / tin nhắn): chữ thường, **không kèm nội dung tin nhắn gốc** | — |
| g | Giải thích | có ở kết quả link | + «Vì sao Tappy nghĩ vậy» (14 dấu hiệu bằng chữ thường) cho tin nhắn | — |
| h | Mic / đọc loa | không (web/Android có nút loa ở vài chỗ) | không làm | C, không chặn |

## 2. Hợp đồng server iOS dùng (không đổi server)

- **Link** (có sẵn, cả production): `POST /api/scam-shield/check {url}` → `{url, risk{level,score,confidence}, evidence, actions[], officialMatch?, cached}`.
- **Tin nhắn (AI, tuỳ chọn)**: `POST /api/scam-shield/analyze {text}` (iOS KHÔNG gửi ảnh/`imageBase64`/`url`) → `{risk{level,score,confidence}, signals[{type,severity,explanation,source}], advice{doNot[],doNow[]}, reasoningSummary, analysis{tier,aiStatus}, quota}`. Giới hạn: burst 6/IP/cửa sổ; 1 câu hỏi AI từ **cùng quỹ chat** (khách 5 trọn đời, tài khoản theo ngày); lỗi 429 `rate_limit`, 400 `invalid_input`, 500 `analyze_failed`. Server **không ghi nội dung tin nhắn** (chỉ hình dạng).
- **QR**: iOS **không** gọi `POST /api/scam-shield/qr` (route đó nhận ẢNH). Giải mã tại máy, chỉ gửi link đã giải mã tới `/check`.
- `/api/scam-shield/analyze` được tính là **đường AI**: lớp mạng của app từ chối nó nếu chưa đồng ý chia sẻ dữ liệu với AI (`AIConsentStore.aiPaths`).

## 3. Riêng tư (kiểm bằng test)

- Đọc tin nhắn tại máy: **không có yêu cầu mạng** (`testReadingAMessageSendsNothing`).
- Mã QR không phải link: **không có yêu cầu mạng**; link: **một** yêu cầu tới `/check`, thân chỉ `{"url": …}` (`testAQRLinkSendsOnlyTheLinkText…`).
- «Để sau» ở màn đồng ý AI: không gửi gì (`testTheDeeperAnalysisSendsNothing…`).
- Không lưu nội dung tin nhắn, không lưu ảnh QR, không lưu số/tài khoản kẻ lừa đảo, không ghi log nội dung.
- Khớp tại máy dùng từ khoá (không phải `matchScenario` của web, hàm đó chưa có trên rc/web-uat 0b6bba2): **đề nghị web/Android thống nhất bảng luật** — bảng của iOS nằm ở `ScamMessageMatcher.rules` (số `officialNumber` của Bộ Công an).

## 4. Chủ đề (cùng đợt)

Mặc định **Tối** như web; công tắc «Giao diện: Theo hệ thống / Sáng / Tối» ở Cài đặt (đã có), nhớ lựa chọn; màn khởi động tối để không loé trắng. Ảnh tối + sáng 9 màn: CI run kế tiếp (`100`–`117`).

## 5. Danh sách test thêm (sáng mai, iPhone)

1. Mở app lần đầu / sau cài lại: giao diện **tối**. Cài đặt → Giao diện → Sáng / Theo hệ thống → đổi ngay, thoát mở lại vẫn nhớ.
2. Lá chắn → «Tin nhắn»: dán `Bưu phẩm Trung thu của bạn bị giữ, quét mã QR để thanh toán phí 15.000đ` ⇒ «giống tình huống: Mã QR giả».
3. Dán `Nộp phạt nguội tại http://nopphat-gov.xyz trong 24h` ⇒ «Giả thông báo phạt nguội» + «Kiểm tra link».
4. Dán tin bình thường (`Đơn hàng đã giao thành công`, `Mai họp 9h`) ⇒ «Chưa thấy dấu hiệu…» (không báo nhầm, không «an toàn»).
5. Tin lạ nhưng đáng ngờ ⇒ «Chưa nhận ra thủ đoạn…» → «Phân tích sâu hơn bằng AI» → hộp đồng ý AI (Đồng ý/Để sau). **CHỜ WEB RELEASE**: nếu production chưa có route `analyze`, app báo «chưa có trên máy chủ hiện tại» (không phải lỗi).
6. Lá chắn → «Mã QR»: «Chọn ảnh có mã QR» (ảnh chụp màn hình QR) ⇒ link vào kiểm link; «Quét bằng camera» ⇒ hộp xin quyền camera (có chữ giải thích); thử **Không cho phép** ⇒ vẫn chọn ảnh được, có nút «Mở Cài đặt».
7. QR chữ/Wi-Fi ⇒ hiện LOẠI + cảnh báo, không tự mở/kết nối.
8. Kết quả link: «Đừng mở» / «Mở thận trọng» (hỏi lại) / «Chia sẻ kết quả».
