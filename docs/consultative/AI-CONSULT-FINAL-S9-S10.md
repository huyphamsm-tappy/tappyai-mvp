# AI TƯ VẤN — BẢN CUỐI: mục 9 (tiêu chí đo được) và mục 10 (chạy thật, bằng chứng, duyệt)

Nguyên văn yêu cầu của Huy (phiên 28–29/09), giữ lại để các phiên sau đối chiếu. Bổ sung 29/09: vé máy bay theo Q10 (không cần nguồn giá; đạt khi không bịa giá, có link Traveloka qua ACCESSTRADE điền sẵn chặng + ngày, có sub1, ghi "xem giá trên Traveloka"). Quyết định giữ/bỏ = trung bình 2 lượt replay.

9. TIÊU CHÍ ĐO ĐƯỢC (kiểm tự động trên câu trả lời thật, báo THEO TỪNG MẢNG) 
###
- Nhận diện ý định: bộ ≥ 100 câu đời thường (≥ 20 câu/mảng, có karaoke, bida, nail, gội đầu, ăn khuya, câu nói vòng, không dấu) kiểm offline ở bước router → 100% đúng mảng, 0 câu bị trả "không có chức năng".
- Câu đầu thiếu thông tin → ≥ 90% là lượt HỎI (2–3 câu có nút), 0 Serper.
- Lượt CHỐT: đúng 1 lựa chọn chính, ≤ 2 phương án khác, có dòng số lựa chọn còn lại khi còn.
- Hỏi thêm / xem thêm / so sánh: 0 Serper; so sánh luôn chọn một.
- Nhiều lượt: không lặp cái đã bác, giữ đúng thông tin đã nói, câu tiếp nối hiểu đúng ngữ cảnh.
- Kế hoạch chi tiết: đủ các phần của mảng (kiểm từng tiêu đề), ≥ 2 mẹo địa phương có căn cứ, có phép tính chi phí.
- Chi phí: theo mục 2 và mục 7.


### 10. CHẠY THẬT, BẰNG CHỨNG, DUYỆT 
###
Khi tiêu chí tự động đạt trên replay: chạy thật trên UAT MỘT lượt đầy đủ: 59 câu tôi đã duyệt + một phần bộ ý định + 15 kịch bản nhiều lượt, MỖI MẢNG 3 KỊCH BẢN (hỏi → trả lời câu hỏi → hỏi thêm → "A hay B" → xem thêm → bác → lên kế hoạch chi tiết), có kịch bản karaoke nhóm bạn và kịch bản spa/làm đẹp.
PASS chỉ khi có ẢNH CHỤP THẬT trên UAT (ghi SHA); unit test, replay, điểm model tự chấm KHÔNG phải PASS. Model chấm trượt câu nào phải trích NGUYÊN VĂN đoạn sai.
Cập nhật trang UAT cùng link, NHÓM THEO 5 MẢNG: ảnh TOÀN BỘ hội thoại thật (mọi lượt, bản mobile), chi phí thật từng lượt, kết quả tiêu chí đo được, nút Đạt/Không đạt + ghi chú (lưu lại để bạn đọc). Bảng tổng theo mảng: số câu hỏi trước khi tư vấn, số câu còn liệt kê, số câu từ chối sai, chi phí trung bình/lượt, dự phóng 900 lượt/tháng — HAI CỘT chất lượng và chi phí so với lượt 59 câu trước. Ảnh không hiện thì chuyển sang trang tĩnh trên GCS (public-read chỉ thư mục evidence). CHỈ gửi tôi link khi tiêu chí tự động đạt ở CẢ 5 MẢNG.
Kết luận đạt do TÔI duyệt. Sau khi tôi duyệt: sửa các câu "Không đạt", chụp lại đúng các câu đó, cập nhật trang.


### 