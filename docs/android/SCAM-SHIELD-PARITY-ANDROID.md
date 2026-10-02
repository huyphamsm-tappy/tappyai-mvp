# Lá chắn lừa đảo — Android đồng bộ 3 nền tảng (02/10/2026)

Nhánh `android/parity-2026-09-28-step1`. Hợp đồng chung: kiểm tra link · phân tích tin nhắn · quét QR · thư viện 25 tình huống · khối khẩn cấp 113 · chia sẻ kết quả.

## Bước 0 — hiện trạng thực tế (đọc code, không đoán)

| # | Tính năng | Android TRƯỚC | Phân loại | Android SAU |
|---|---|---|---|---|
| a | Kiểm tra link | Có (`/api/scam-shield/check`, bộ máy URL của server) | — | Giữ nguyên |
| b | Phân tích tin nhắn | Có, nhưng **mọi** tin đều gửi lên server/AI, không có khớp tĩnh, không hỏi đồng ý | C (thiếu) | Khớp tĩnh trên máy trước (bảng dấu hiệu 25 tình huống, port 1:1 từ `matchScenario` của web Phase 8); chỉ khi không khớp chắc mới hỏi «Gửi cho AI?» rồi gọi server |
| c | Quét QR | Có, nhưng **tải ảnh QR lên** `/api/scam-shield/qr` (trái quy tắc giải mã trên máy) | A (lỗi so với hợp đồng) | Giải mã **trên máy** bằng ZXing core 3.5.3 (đã có trong app); chỉ link giải mã đi kiểm tra link; QR không phải link → nêu loại + cảnh báo, không làm gì |
| d | Thư viện tình huống | Có, 25 tình huống Bộ Công an (`assets/scam_knowledge/bocongan2026.json`) | — | Giữ; 89 tình huống Phase 8 KHÔNG đưa vào |
| e | Khẩn cấp 113 | Có trong thẻ tri thức | — | Thêm khối cố định 113 + «TappyAI không phải cơ quan nhà nước» vào 2 thẻ kết quả mới |
| f | Chia sẻ kết quả | Chỉ lịch sử link | C | Nút chia sẻ văn bản thuần (tên thủ đoạn / loại mã + link canonical), KHÔNG kèm tin gốc hay nội dung mã |
| g | Giải thích | Có (dấu hiệu, việc nên/không nên) | — | Thẻ tình huống dùng lại `ScenarioDetail` (nguồn chính thức + hướng dẫn) |
| h | Mic/loa | Không có trên Android | C (hoãn) | Không làm (ngoài phạm vi khối này) |

Phía server (đọc `rc/web-uat` qua git): `/api/scam-shield/{check,analyze,qr,directory,share}`. Server production chưa có `matchScenario` (chỉ ở Phase 8) → loại **B**: phía Android tự mang bảng dấu hiệu (không đồng bộ qua server, đúng yêu cầu). `/api/scam-shield/qr` còn đó nhưng Android **không dùng nữa**.

## Quyền riêng tư (đã khoá bằng test nguồn `ScamLocalParityTest`)
- Không lưu nội dung tin nhắn, ảnh QR, số/tài khoản kẻ lừa đảo (không DB, không log, không analytics cho 2 thẻ cục bộ).
- Khớp tĩnh chạy offline, không token, không gọi mạng (`ScenarioMatcher` thuần, test cấm retrofit/okhttp/DataStore/Log).
- Tin có link, có ảnh chụp hoặc ô link → không trả lời từ bảng dấu hiệu, đi đường server như cũ.
- AI chỉ sau khi đồng ý (hộp thoại; ghi nhớ trong bộ nhớ của lần chạy này, không lưu đĩa). Tin chỉ là một link thì không hỏi (không dùng AI).
- Không thêm quyền CAMERA: ảnh QR lấy từ bộ chọn ảnh hệ thống. Quét camera trực tiếp → cần CameraX, để sau (POST-RELEASE-BACKLOG).

## Chủ đề
Mặc định: **Tối** (trước đây theo hệ thống). Công tắc Hệ thống/Sáng/Tối trong Cài đặt giữ nguyên. Nền cửa sổ khởi động cũng tối để không loé trắng. Ảnh đối chiếu (điện thoại đặt chế độ sáng, cài mới): `android/e2e/out/theme/BEFORE-597698b-system-light.png` (sáng) → `system-light-fresh-install-2.png` (tối).

## Kiểm chứng
- Test đơn vị mới: `ScenarioMatcherTest`, `QrCodesTest`, `ScamLocalParityTest`; cập nhật `AppearanceDefaultTest`, `ScamShieldFailClosedTest`, `ScamShieldV3Test`. Debug/Release/UAT đều xanh.
- E2E trên UAT: luồng `scam-shield-parity` (tin phạt nguội → «Giống thủ đoạn», 113, chia sẻ, không hỏi AI; tin bình thường → hỏi AI, «Không gửi» không gửi gì, «Đồng ý» → «An toàn», không gắn thủ đoạn; QR link `vietcombank-xacthuc-taikhoan.top` → «Nguy cơ cao 79» chỉ link đi kiểm tra; QR chữ; QR thanh toán; QR Wi-Fi chỉ hiện tên mạng; huỷ chọn ảnh không sập).
