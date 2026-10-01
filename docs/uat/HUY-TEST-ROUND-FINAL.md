# DANH SÁCH LUỒNG HUY TEST VÒNG CUỐI (01/10) — cờ STYLE_LUNA6 và ACCOUNT_SELF_DELETE_ENABLED: xem dòng «Cờ trên UAT» trong RELEASE-PROGRESS
Tài khoản test, iPhone Safari, uat.tappyai.com. «Đạt» = thấy đúng như cột phải.

| # | Gõ gì | Đạt = thấy gì |
|---|---|---|
| 1 | Trình duyệt mới → chat | chọn ngôn ngữ trước; gõ «đói quá, trưa nay ăn gì?» → thẻ hỏi hiện, KHÔNG có cửa sổ «Tappy muốn hiểu bạn hơn!» đè lên; trả lời xong cửa sổ mới hiện |
| 2 | «Mùa này đi du lịch ở đâu» | thẻ hỏi có câu KIỂU điểm đến (Biển/Núi/Thành phố/Nước ngoài); chọn «Biển · 3N2Đ · TP.HCM» → đề xuất điểm đến ngoài TP.HCM, không ra điểm tham quan trong TP.HCM |
| 3 | «Tối nay có phim gì hay» | trả lời KHÔNG liệt kê rạp, nói chưa có danh sách phim đã kiểm, 1 link trang CGV; «Tui hỏi phim mà có hỏi rạp đâu» → vẫn không ra thẻ rạp |
| 4 | karaoke tối nay → «2 người · Quận 1» → «Tìm quận 3 á» | thẻ chỉ là quán karaoke (không bảo tàng); chữ nói thật chưa có quán ở Quận 3 |
| 5 | «Muốn mua kính cường lực cho iphone» → «iPhone 17 · Cường lực mà» | thẻ hỏi nói về kính cường lực (không «chọn iPhone nào»); kết quả là kính cường lực, không có thẻ điện thoại; không câu «tìm trên Shopee» do Tappy tự viết |
| 6 | «Lập kế hoạch đi quy nhơn 2 ngày 1 đêm cho 1 người» → trả lời thẻ | không có khối quảng cáo tour/số điện thoại, không link googleusercontent in thành chữ |
| 7 | «bay từ HCM» | thẻ hỏi «Bay đến đâu?» (không phải tour); chọn «Đến Đà Nẵng · Cuối tuần này · 2 người» → link Trip.com + Traveloka điền sẵn TP.HCM→Đà Nẵng, ngày, **2 người** |
| 8 | Chat → bấm Mic | màn Mic mới (mascot, «Tôi đang lắng nghe...», nút tím, Hủy/Gửi); câu mẫu mờ KHÔNG gửi được; nói xong chữ hiện thế chỗ câu mẫu |
| 9 | Mic: thoát bằng Hủy / Gửi / Quay lại / chuyển app / đợi 60 giây | thanh địa chỉ Safari KHÔNG còn chấm cam / biểu tượng mic (CHƯA kiểm trên iPhone thật) |
| 10 | Cài đặt | có công tắc «Micrô» (mặc định bật), tắt thì nút Mic trong chat biến mất |
| 11 | «Lên kế hoạch đi Đà Nẵng 3 ngày 2 đêm tuần sau cho 2 người, ngân sách 10 triệu, bay từ TP.HCM, thích biển và ăn hải sản» | tin kế hoạch có khối thẻ KHÁCH SẠN (nút đặt phòng) |
| 12 | Mở lại lịch sử chat | CÒN MẤT thẻ/ảnh/link — đã biết, PL-HISTORY-CARDS (cần app native), không phải lỗi mới |
| 13 | «quán phở ngon quận 1» → «xem thêm» | thẻ + link bản đồ như trước (hồi quy) |
| 14 | **XOÁ TÀI KHOẢN — CHỈ tài khoản test, KHÔNG dùng tài khoản thật.** Đăng nhập `manual.uat.fresh@tappyai.com` (hoặc tài khoản tạo mới @tappyai.com) → Cài đặt → cuối mục «Khác» | hàng chữ thường «Xóa tài khoản» là hàng CUỐI mục «Khác», KHÔNG đỏ, KHÔNG nằm cạnh «Đăng xuất» (Đăng xuất ở khung riêng bên dưới); bấm → màn cảnh báo |
| 15 | Trang xoá: đọc chữ cảnh báo | «Xóa tài khoản vĩnh viễn? Toàn bộ dữ liệu của bạn sẽ bị xóa ngay và không thể khôi phục: lịch sử chat, địa điểm đã lưu, bài đăng, ảnh và clip.» + câu «Gõ XÓA để xác nhận.» Tài khoản test KHÔNG có gói ⇒ KHÔNG thấy đoạn «Gói trả phí và credit còn lại sẽ mất…». (Tài khoản có gói thử bằng `manual.uat.pro@tappyai.com` — chỉ NHÌN chữ, đừng xoá nó: phải thấy đoạn gói, gồm «Tappy không hoàn lại phần chưa dùng» và «không tự hủy gói trên App Store hoặc Google Play») |
| 16 | Gõ sai chữ (ví dụ «XOA1») | nút «Xóa vĩnh viễn tài khoản» mờ, không bấm được |
| 17 | Gõ đúng XÓA → bấm xoá (tài khoản test) | màn «Tài khoản của bạn đã được xóa», bị đăng xuất; đăng nhập lại cùng email → tài khoản MỚI trống (chat, địa điểm đã lưu đã mất) |
| 18 | Mở lại trang xoá / bấm xoá lần hai khi đã đăng xuất | chuyển về đăng nhập, không lỗi trắng trang |
| 19 | /delete-account (trang công khai, link cho Google Play) | nói xoá trong app (Cài đặt → Khác) hoặc email support@tappyai.com; không còn chữ «30 ngày» chưa xác nhận |
| 20 | /privacy (vi + en) | ghi OpenAI (không Anthropic), có Upstash, Brevo, wttr.in, Overpass |
| 21 | 7 chuỗi câu hỏi phần A của OWNER-TOMORROW-2026-09-30 | như hướng dẫn trong tệp đó |
| 22 | Giọng văn (nếu cờ BẬT trên UAT) | câu trả lời chốt ít mở bằng «Mình hiểu bạn…», vẫn nêu giả định, không có «Chắc chắn rồi/tuyệt vời», đùa nhẹ không quá 1/3 số câu và KHÔNG đùa ở chuyện sức khoẻ/lừa đảo; xưng «mình/bạn» |
