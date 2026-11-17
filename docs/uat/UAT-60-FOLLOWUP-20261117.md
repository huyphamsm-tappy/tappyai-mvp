# BÁO CÁO TIẾP THEO 17/11/2026 — xử lý các việc mở của bộ não (sau UAT vòng 2)

Nhánh `feat/brain-r13-p1`, 3 commit cục bộ mới (`7600e19`, `9de8d81`, `e579bd1`). Chưa push, chưa deploy, chưa gắn tag đóng băng.
Kiểm: `tsc` sạch; vitest app: 27.269 qua, 0 hỏng, 95 bỏ qua. Chi phí đo trong lượt này khoảng 0,6 USD (ca 60 Advanced 0,53 USD, ba ca còn lại vài xu).

## Từng việc

| Việc | Kết luận | Đã kiểm | Chưa kiểm |
|---|---|---|---|
| 2. "nguồn 34" còn lộ | **Không phải lỗi lộ số.** Văn bản lưu là "do nguồn [34] cung cấp": chữ "nguồn" và dấu trích dẫn [34] đã được đánh số lại đúng (cùng số 34 với các câu khác). Bộ đo của em dùng chữ trên trang nên ghép nhầm chữ "nguồn" với con số trên chip. Đã sửa bộ đo (bỏ chip trước khi dò). | Đọc văn bản lưu trong DB UAT; chạy lại ca 60: 0 chỗ lộ, 0 câu dính, 31 link | Câu "do nguồn [34]" hơi thừa chữ, không sai |
| 3. Ca 52 PDF | **Lỗi ở bộ chạy**: đường dẫn tệp tương đối nên trình duyệt không tìm thấy tệp. App đọc PDF đúng. Đã sửa. | Chạy lại: tóm tắt đúng cả 5 ý của PDF (ngân sách 3,2 tỷ, dời ngày ra mắt, 4 kỹ sư, công ty Bình Minh, rủi ro cổng thanh toán, chị Lan) | |
| 4. Ca 16 không ảnh món | Sửa: câu hỏi cách làm một món ăn hiện thẻ chủ thể (ảnh + mô tả Wikipedia) của món đó. Chỉ áp cho món ăn; how-to nói về địa danh, công cụ, khái niệm vẫn không có thẻ. | Test mới + thử đột biến (đỏ khi đảo điều kiện); chạy lại ca 16 trên giao diện: có ảnh bún riêu cua | |
| 5. Dàn ý Advanced thất bại | Log: cả hai lần thử đều trả về không có mảng `sections`. Đã làm: lần thử thứ hai được nhắc rõ trường nào bị từ chối; log ghi hình dạng câu trả lời bị từ chối (tên trường và kiểu, không giá trị). | Test đơn vị; lần chạy lại dàn ý thành công (5 mục) | **Chưa chứng minh bản nhắc có tác dụng**: lần chạy lại không gặp lỗi nên chưa thử được trên mô hình thật |
| 6. Ca 53 sau sửa link Maps | Link Maps sạch ("Mở tìm kiếm trên Google Maps"), không còn chữ vỡ; nói thẳng chưa xác minh được quán, không bịa giá. | Ảnh `fix1-53/screens/q53.jpg` | |
| 6. Thẻ chia sẻ báo cáo, trang `/r/...` | | | **CHƯA KIỂM** |
| 7. Free 14 câu còn lại | Bộ đo vẫn chỉ ghi dòng mời Pro; nội dung chưa đọc | | **CHƯA KIỂM** (cần máy chủ bật cờ bảng gói) |

## Đối chiếu số liệu với nguồn ngoài (tìm kiếm web, chỉ một số mốc)

- Passport: lệ phí 100.000 đồng; miễn qua VNeID mức 2 từ 15/8/2026 đến 28/2/2027 — **đúng chủ trương**, nguồn có điều kiện thêm (tích hợp giấy tờ, nộp online toàn trình), câu trả lời đã nêu điều kiện.
- Nồng độ cồn ô tô (NĐ 168/2024, Điều 6): 6–8 triệu và trừ 4 điểm, 30–40 triệu và tước GPLX 22–24 tháng — **khớp**. Mức giữa 18–20 triệu và trừ 10 điểm: tìm kiếm không nêu rõ, em chưa xác nhận bằng nguồn.
- MacBook Air M4: Apple công bố tối đa 18 giờ phát video — **khớp**.
- **Dell XPS 13 DX13260 "20 giờ theo hãng công bố" (ca 50 lượt 2): SAI.** Dell công bố khoảng 17 giờ phát video; con số gần 20 giờ là kết quả thử của một trang đánh giá. Câu trả lời gán cho hãng một mức hãng không công bố, và đó là gốc của việc hai lượt UAT nói ngược nhau. Chưa sửa: đây là lỗi nội dung của mô hình; theo luật không vá từng ca, cần cách chung để chặn gán số cho "hãng công bố" khi nguồn không nói vậy.
- Lãi tiết kiệm 12 tháng 6,8–7% ngày 16/11/2026: không tìm được bảng đúng ngày; các nguồn gần nhất 7,2–7,8% (tháng 6–8). **Không kết luận được.**
- Giá vàng, tỷ giá, ETH, Brent, thời tiết: số thời gian thực, em không có nguồn độc lập đúng thời điểm để kiểm lại. **CHƯA KIỂM.**

## Phát hiện mới (chưa sửa)

1. **Chip chủ thể nhận nhầm nghĩa.** Ở ca 52, tên công ty "Bình Minh" in đậm trong bản tóm tắt tài liệu thành chip 📍 mở hồ sơ Wikipedia (rất có thể là địa danh trùng tên). Máy chủ tra theo tên, không xét nghĩa; theo thiết kế "không mô hình, không tốn tiền". Cần quyết định cách chặn (ví dụ không vẽ chip trên câu trả lời về tài liệu người dùng đính kèm, hoặc thêm bước xét nghĩa như thẻ chủ thể đã có).
2. Câu "do nguồn [34] cung cấp" thừa chữ "nguồn" cạnh dấu trích dẫn.

## Cập nhật cuối ngày 17/11 (sau "làm tiếp")

- **Lỗi gán số cho "hãng công bố"**: thêm luật chung vào lõi One Brain (`c1981f8`). Ca 50 chạy lại: số Dell 20 giờ được ghi cho Tom's Guide (đo thử), không ghi cho hãng. Mới một lần chạy.
- **Chip nhầm nghĩa**: có bước xét nghĩa (`2a0aa4d`, `f2bf5ee`), chỉ tài khoản đăng nhập. Ca 52 chạy lại: "công ty Bình Minh" hết chip. Chưa thấy trên giao diện một chip đúng còn hiện.
- **Thử đột biến `3793313`, `cf0f3fd`**: loại hình chính của quán (đảo thứ tự → test đỏ), nút "Đặt chỗ" trên di tích (bỏ nhánh → test đỏ), nhánh `named` của chữ viết riêng (bỏ nhánh → test KHÔNG đỏ: khoảng hở). Đã thêm test, đột biến lại thì đỏ.
- **Nhãn "Tappy chọn" trong câu tiếng Nhật**: em thử cho nhãn theo ngôn ngữ câu trả lời rồi hoàn lại. Cả khung thẻ quán ("Bản đồ", "Lưu", "Xem hồ sơ"…) theo ngôn ngữ giao diện; đổi riêng một nhãn làm lệch. **Giữ nguyên: giao diện theo ngôn ngữ app, nội dung theo ngôn ngữ câu hỏi.**
- **Thẻ chia sẻ báo cáo**: đã mở trên giao diện thật: có tiêu đề, ý chính, "Nguồn: 22". Tốt.
- **Trang công khai `/r/...`**: tìm ra 3 lỗi: dòng "# tiêu đề" in nguyên dấu thăng, dấu trích dẫn "[1][2]" in nguyên trong ngoặc, bảng in thành hàng dấu gạch đứng. Đã sửa bộ vẽ (`renderPublicMarkdown.ts`: tiêu đề, số trích dẫn nhỏ nâng lên, bảng), test mới gồm cả chống chèn mã. Kiểm lại trang thật: 0 dấu "#", 0 "[n]" thô, 37 số nâng lên. Báo cáo Standard không có bảng nên bảng mới chỉ có test đơn vị.
- **Free**: đọc 4/14 ảnh (tỷ giá, quán phở, lãi kép, iPhone/Galaxy). Không công cụ, nói thẳng không tra được tỷ giá và giờ mở cửa; lãi kép 119.101.600 đồng đúng; có dòng mời Pro. Câu quán phở hỏi lại khu vực thay vì gợi ý từ hiểu biết sẵn: hơi yếu. 10 câu còn lại chưa đọc.

## Nguồn mặc định cho số thời gian thực (anh yêu cầu chiều 17/11)

Công cụ mới `get_market_rate` (One Brain), kết quả luôn kèm tên nguồn, trang nguồn, thời điểm, và phần trăm thay đổi do mã tính:

| Loại | Nguồn mặc định | Ghi chú |
|---|---|---|
| Tỷ giá | Vietcombank (nguồn cấp dữ liệu công khai của chính ngân hàng) | Một ngân hàng, không phải tỷ giá trung tâm hay trung bình; cache 5 phút theo yêu cầu của họ |
| ETH và tiền mã hoá | Coinbase (giá spot công khai, kèm giá cách đây 7 ngày) | Quy đổi VND là ước tính từ tỷ giá chuyển khoản Vietcombank, có ghi rõ |
| Dầu Brent, WTI | Báo giá hợp đồng tương lai (Yahoo Finance) | Có thể trễ vài phút; xin xem rủi ro điều khoản ở dưới |
| Thời tiết | Giữ nguyên công cụ dự báo hiện có (Open-Meteo; thời tiết hiện tại wttr.in) | |
| Vàng | Giữ vang.today (tổng hợp SJC, PNJ, DOJI) | Trang SJC chính chủ bị Cloudflare chặn truy cập tự động |

Đã kiểm trên giao diện thật (ca 2, 4, 6, 3): tỷ giá EUR từ Vietcombank 27.880 đồng, ETH 1.828 USD giảm 14,2% so với tuần trước từ Coinbase, Brent 92,16 USD giảm 0,3% từ Yahoo Finance. Một lỗi tự bắt khi đo: lấy "giá đóng cửa trước" với range 5 ngày cho ra -4,2% (sai, là giá trước khoảng 5 ngày); đã sửa về range 1 ngày (-0,7% khớp), có test canh.

## Việc còn lại trước khi đóng băng

Đối chiếu nguồn ngoài cho phần thời gian thực; lỗi gán số cho "hãng công bố"; chip nhầm nghĩa; thẻ chia sẻ và `/r/...`; Free 14 câu; thử đột biến cho `3793313` và `cf0f3fd`; nhãn "Tappy chọn" trong câu tiếng Nhật; dọn chat/tài khoản thử; hai thư mục `run1` chưa commit. Em chưa chạy chấm lại 9/10 nên **chưa xin gắn tag**.
