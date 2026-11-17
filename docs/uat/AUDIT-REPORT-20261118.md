# BÁO CÁO AUDIT VÀ UAT 18/11/2026 — 7 việc anh giao

Nhánh `feat/brain-r13-p1`. Mọi mục dưới đây là **audit đọc code hoặc UAT, chưa sửa code** (trừ việc ẩn Dịch và Coi bói). Nhãn: ĐÃ XÁC MINH = đọc code hoặc chạy thật; SUY LUẬN = từ ghi chú cũ, chưa kiểm lại.

## Đã làm ngay: ẩn Dịch và Coi bói
- **Web** (`9df36d7`): cờ `SHOW_TRANSLATE` và `SHOW_FORTUNE` = false; hết lối vào ở danh sách công cụ, Home và thanh bên; `/translate` và `/boi/*` trả 404 (đã kiểm); `/api/config` báo hai cờ cho app.
- **iOS và Android** (`df0274a`): cờ native, danh sách công cụ, màn đích, deep link, test cập nhật. **Chưa biên dịch được ở đây**, cần xem CI native.
- Mã, màn hình và API giữ nguyên (ẩn, không xóa).

## 1. Inbox / Messenger — xong code, chưa xong để phát hành
- Có: tin chữ và ảnh trên web, Android, iOS; báo cáo tin nhắn; ảnh hết hạn 30 ngày; huy hiệu chưa đọc; phân quyền ổn (404 thay vì 403, người gửi lấy từ phiên).
- Chưa: cờ `MESSAGE_NOTIFICATIONS_ENABLED` tắt; chưa thử production và máy thật; chính sách khi quét ảnh lỗi chưa chốt (đang chặn, 503); chưa phát hành app; clip chưa làm; không kiểm duyệt chữ.
- Lỗ hổng: tạo cuộc trò chuyện hoặc nhóm (`threads` POST) **không có giới hạn tốc độ**.
- Còn lại theo thứ tự: quyết chính sách quét ảnh rồi thử một ảnh trên production; kiểm các migration 20261018 đến 20261110 đã áp; thêm giới hạn cho `threads`; chạy máy thật; phát hành app rồi mới bật cờ.

## 2. Bảo mật — xong các đợt chặn trước phát hành, chưa xong toàn bộ
- Đã xong và đã vào `main`: đợt 1 và 2 (tính phí nghiên cứu sâu, giới hạn theo dải IPv6, CSP báo cáo, chặn tiêm thuộc tính markdown), ghim GitHub Actions, khóa quyền cơ sở dữ liệu, bảo mật Messenger, xóa tài khoản, đồng ý dùng dữ liệu cho AI. Test canh: mọi route ghi phải từ chối ẩn danh; mọi route tốn tiền phải khai báo giới hạn.
- Phase 9, hai tuần qua chưa làm: nâng Next 14, `ai` 4, `zod` 3; CSP vẫn `'unsafe-inline'`; chưa có Play Integrity và App Attest; ba mục chưa kiểm.
- Lỗ hổng: `stripe/checkout` và `stripe/portal` không giới hạn tốc độ (trung bình); báo cáo, chặn và gửi tin chỉ giới hạn theo từng instance; dịch và quét chỉ có trần theo ngày.
- **149 commit trên nhánh này chưa được rà bảo mật** (`/api/mcp`, `/api/link-preview`, route thực thể, route video, cron mới). Không gộp lên production khi chưa rà.
- Việc của anh: hạn chế khóa Google Cloud, hạn mức cứng và 2FA OpenAI.

## 3. Nén clip — xong phần máy chủ, chưa chạy với người dùng thật
- Có: tải lên bằng URL ký, Google Transcoder ra HLS 720/480/360, kiểm duyệt khung hình và lời nói, phát qua CDN, dọn dẹp, cron đối soát, hơn 40 file test, kịch bản UAT thủ công. Mọi cờ tắt.
- Thiếu: production chưa có bucket, tài khoản dịch vụ, CDN, migration 20261111 đến 17; app Android và iOS chưa gộp và chưa chạy máy; **không client nào nén hay cắt trước khi tải** (trần 150 MB, 5 phút); không có webhook nên video kẹt có thể chờ tới một ngày.
- Anh cần cấp: đồng ý triển khai, tạo hạ tầng GCP và biến môi trường, rồi bật `EXPLORE_VIDEO_PIPELINE_ENABLED`.

## 4a. Scam Shield — công cụ chạy, nhưng **không có cập nhật hằng tuần từ Bộ Công an**
- Không có crawler, cron hay bảng nào. Dữ liệu là 25 kịch bản gõ tay một lần từ bài của Bộ Công an ngày 08/09/2026 (`verifiedAt` 15/09/2026, tức cũ hai tháng). Không có gì tự cập nhật.
- UAT 18 ca: bắt đúng mạo danh công an, giao hàng giả, việc làm giả, đầu tư và crypto, URL lừa đảo (HIGH 79), chặn tiêm lệnh, từ chối đầu vào xấu, không lộ dữ liệu.
- Lỗi: tin sạch chỉ nhắc "số tài khoản" bị báo HIGH; một thông báo thật của Bộ Y tế nói "không bao giờ yêu cầu chuyển khoản" bị báo MEDIUM (luật chuyển khoản không nhận ra phủ định); "tài khoản đã bị tố cáo" không tra được vì không có kho tài khoản bị báo cáo; hạn mức ẩn danh 10 lượt mỗi ngày không chặn trong lần chạy local (không có kho dùng chung); AI của công cụ này tắt.
- Muốn làm thật việc cập nhật hằng tuần: trình thu thập với danh sách host cho phép, bảng có phiên bản và trạng thái duyệt, route cron có bí mật và dòng `vercel.json`, `knowledge` đọc bản đã duyệt mới nhất rồi mới đến tệp tĩnh, bước người duyệt trước khi công bố, hiện "cập nhật lần cuối" trên giao diện.

## 4b. Chia tiền và đi ăn chung — phần đang có chạy trơn, nhưng thiếu nhiều
- UAT với 5 tài khoản tạo mới, qua giao diện và API: tạo nhóm, vào bằng link, nhập sở thích, gợi ý AI, máy tính chia tiền đều chạy; ẩn danh bị từ chối; chặn sửa chéo; XSS không chạy.
- **Chưa có trong code:** bình chọn và chốt quán, mã mời, rời nhóm, xóa nhóm, xóa thành viên, quyết toán ai nợ ai, VAT, chia theo món thật, chia sẻ kết quả.
- Lỗi: thành viên ghi nhớ bằng `localStorage` (đổi máy thì mất); chủ nhóm không nhập được sở thích của mình và không tạo lại gợi ý; giới hạn 5 gợi ý mỗi phút không chặn trong lần chạy; không giới hạn độ dài tên (5.000 và 100.000 ký tự được nhận); ai có link đều đọc được ngân sách, chế độ ăn, khu vực của mọi thành viên; gợi ý hiện `##` và `**` thô; máy tính nuốt dấu âm, hiểu sai "1.234.567" và "1e9", tổng các phần lệch (33.333 x 3 = 99.999); vào nhóm không tồn tại báo 500.
- 5 tài khoản thử trong UAT chưa xóa (chờ anh cho phép): `uat.p0.1794930256011.1` đến `.5@example.test`.

## 5. TVI (kiến thức Việt Nam) — chạy một phần, chưa nối vào chat
- Là kho **dữ kiện địa điểm** (giờ mở cửa, giá vé, giá món, địa chỉ, điện thoại, đóng cửa, website), 8 bảng, chỉ server ghi. Chưa phải "kiến thức sâu về Việt Nam".
- Nối ở một chỗ: trong công cụ tìm địa điểm (lưu sau mỗi lần tìm, đọc lại để điền chỗ trống). Không có trong lõi chat, không có công cụ TVI, không đứng trước web search. Cờ bật ở UAT, khóa ở production.
- **Không phải đòn bẩy chi phí như hiện tại:** thẻ quán cần điểm, ảnh, link mà TVI không lưu; kết quả đã cache; khoản tốn lớn là khoảng 51 truy vấn mỗi báo cáo nghiên cứu sâu. Hiện còn thêm một lần gọi cơ sở dữ liệu tối đa 1,5 giây.
- Muốn thành đòn bẩy cần: công cụ trả lời từ kho trước khi gọi Serper, mở rộng loại dữ kiện, chỉ dùng dữ kiện còn mới, đo tỷ lệ trúng; và cần luật pháp duyệt việc lưu dữ kiện lấy từ Serper/Google.

## 6. Thông báo — không phải lỗi, là thiếu chỗ cho thấy
- Web: thích, bình luận, theo dõi tạo thông báo ở tab "Thông báo" của Inbox. Tin nhắn chỉ tạo khi bật cờ (đang tắt). **Chia sẻ không tạo thông báo; người viết bình luận gốc không nhận gì khi có người trả lời.**
- Inbox luôn mở ở tab Tin nhắn nên thông báo thích và bình luận nằm ở tab thứ hai; tham số `?tab=` không được đọc.
- iOS: chấm đỏ nằm ở tab Hồ sơ, danh sách nằm sau biểu tượng chuông (một ô nhỏ trong bốn ô). Đây là lý do anh thấy "có thông báo" mà không biết vào đâu.
- Sửa nhỏ nhất: mở Inbox ở tab Thông báo khi có thông báo chưa đọc, thêm chuông có số ở đầu Hồ sơ iOS, thêm thông báo trả lời bình luận, sửa tiêu đề bình luận thiếu dấu.

## 7. Tối ưu chi phí — làm được một phần
- Đã có: cache Serper (trong bộ nhớ và Upstash 24 giờ), gộp lượt gọi trùng, trần 8 lần Serper mỗi lượt, trần 8 bước, 8.000 token đầu ra, 110 giây, ngân sách USD toàn tiến trình, hạn mức theo gói, Free không công cụ, Haiku cho Standard, cache lời nhắc hệ thống (trúng khoảng 64%).
- Chưa: dữ liệu đưa vào mô hình 65 nghìn token trung vị (mô hình trả lời chiếm khoảng 69% chi phí lượt); `think_deeper` gọi trên 57/64 lượt (đã đo); bước `think_deeper` riêng; cache V2 và Upstash đọc-ghi chưa bật ở UAT; chưa áp migration sổ cái chi phí.
- Giá đã đo: chat khoảng 0,014 USD, Standard 0,09 đến 0,11 USD, Advanced 0,57 đến 0,64 USD.
- Kế hoạch an toàn chất lượng (mỗi bước chấm mù trước khi áp): đo tách lượt có nghĩ và không nghĩ; siết mô tả `think_deeper`; cắt dữ liệu trang; bật cache V2; áp migration sổ cái. **Không đụng** mô hình trả lời và mức suy luận ở bước viết.

## Việc cần anh quyết
1. Xóa hay giữ 5 tài khoản thử và các nhóm thử trong UAT.
2. Làm tiếp: chia tiền và đi ăn chung (bình chọn, chốt quán, quyết toán), Scam Shield cập nhật hằng tuần, sửa thông báo, hay chi phí; thứ tự nào.
3. Lượt nghiên cứu hoặc lịch trình chạm trần 110 giây: giữ nguyên hay hạ mức suy luận khi lượt chậm.
4. Chính sách khi quét ảnh Messenger lỗi, và có triển khai hạ tầng clip hay không.
