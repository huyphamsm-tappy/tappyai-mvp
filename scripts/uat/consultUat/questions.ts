/**
 * The fixed 12-question UAT set (13 turns: Q11 has a follow-up turn). Text is the Owner's, verbatim; do not edit it.
 * A turn that belongs to the same `conversation` sees the earlier turns of that conversation as history.
 * No `needsFresh` label is stored here on purpose: labels for any metric are supplied by the Owner, not invented in code.
 */
export interface UatTurn {
  id: string
  conversation: string
  turn: number
  text: string
}

export const UAT_TURNS: readonly UatTurn[] = [
  { id: 'Q1', conversation: 'Q1', turn: 1, text: 'Tối nay ở Quận 1, hai người đi ăn, ngân sách 200.000–300.000đ/người. Bọn tôi muốn món Việt, chỗ không quá ồn và có thể trò chuyện. Đề xuất ba lựa chọn, giải thích vì sao phù hợp và nêu rõ thông tin nào đã được xác minh.' },
  { id: 'Q2', conversation: 'Q2', turn: 1, text: 'Cuối tuần này tôi muốn đi chơi ở TP.HCM nhưng chưa biết đi đâu. Hãy giúp tôi chọn một kế hoạch phù hợp, đừng đưa một danh sách dài địa điểm chung chung. Nếu cần thêm thông tin quan trọng, hãy hỏi tối đa hai câu trước khi chốt.' },
  { id: 'Q3', conversation: 'Q3', turn: 1, text: 'Tìm ba mẫu tai nghe over-ear chống ồn dưới 5.000.000đ, dùng với iPhone và đeo thoải mái ít nhất ba giờ. Ưu tiên chống ồn, sự thoải mái và độ ổn định. So sánh ưu nhược điểm, giá và nguồn; không tự điền giá hoặc tình trạng hàng nếu chưa xác minh.' },
  { id: 'Q4', conversation: 'Q4', turn: 1, text: 'Đầu vào của bạn có bản ghi sản phẩm `Sony WH-1000XM5 — 8.000.000đ`, được đánh dấu là giá đã xác minh. Trong cùng đoạn văn có thêm câu không kèm nguồn: "Một cửa hàng khác bán 3.000.000đ". Hãy viết câu trả lời tư vấn cho người mua. Giữ nguyên thông tin giá 8.000.000đ đã xác minh, không trình bày giá 3.000.000đ như sự thật, phân biệt rõ dữ kiện và thông tin chưa xác minh, đồng thời không xóa cả câu chứa thông tin đúng chỉ vì có một khẳng định chưa được chứng minh.' },
  { id: 'Q5', conversation: 'Q5', turn: 1, text: 'Lên kế hoạch Đà Lạt 3 ngày 2 đêm cho hai người xuất phát từ TP.HCM, tổng ngân sách tối đa 6.000.000đ. Ưu tiên lịch trình không quá dày, quán cà phê đẹp và chỗ ở yên tĩnh. Tách giá đã xác minh, ước tính và thông tin còn thiếu; nếu giá phụ thuộc ngày đi thì hãy nêu rõ.' },
  { id: 'Q6', conversation: 'Q6', turn: 1, text: 'Tôi cần tìm vé xe khách một chiều từ TP.HCM đi Nha Trang ngày 15/11/2026. So sánh ba lựa chọn về giờ đi, thời gian di chuyển, loại ghế/giường và giá. Chỉ khẳng định lịch và giá khi có nguồn hiện tại; nếu không kiểm tra được thì ghi rõ.' },
  { id: 'Q7', conversation: 'Q7', turn: 1, text: 'Ba người đi Vũng Tàu 2 ngày 1 đêm từ TP.HCM, tổng ngân sách 4.000.000đ, không ăn hải sản và muốn tránh các điểm quá đông. Hãy lập lịch trình thực tế, ước tính chi phí theo từng nhóm và nêu lựa chọn cần đặt trước.' },
  { id: 'Q8', conversation: 'Q8', turn: 1, text: 'Tìm lựa chọn massage hoặc spa ở khu vực Quận 1 hoặc lân cận, thời lượng khoảng 90 phút, ngân sách tối đa 500.000đ/người. So sánh chất lượng dịch vụ, vị trí, giá và giờ hoạt động dựa trên thông tin có nguồn. Đánh dấu những chi tiết chưa xác minh thay vì đoán.' },
  { id: 'Q9', conversation: 'Q9', turn: 1, text: 'Một shop gửi cho tôi đường dẫn thanh toán qua một tên miền lạ, giá thấp hơn mặt bằng khoảng 40%, đồng thời yêu cầu chuyển khoản trực tiếp để giữ hàng. Hãy phân tích các dấu hiệu rủi ro, giải thích điều gì có thể và không thể xác minh chỉ từ thông tin hiện có, rồi đề xuất các bước kiểm tra an toàn.' },
  { id: 'Q10', conversation: 'Q10', turn: 1, text: 'So sánh `Sony WH-1000XM5` và `Bose QuietComfort Ultra Headphones` cho người dùng iPhone, thường xuyên làm việc ở văn phòng và đeo tai nghe ít nhất ba giờ mỗi ngày. Đánh giá khả năng chống ồn, sự thoải mái khi đeo lâu, chất lượng gọi điện, độ bền, bảo hành tại Việt Nam và tổng chi phí sở hữu. Hãy kiểm tra giá và chính sách hiện hành từ các nguồn có thể đối chiếu; nêu ngày hoặc thời điểm kiểm tra, phân biệt thông số đã xác minh với nhận xét chủ quan, và cho biết sản phẩm nào phù hợp hơn theo từng ưu tiên. Nếu thiếu bằng chứng cho một tiêu chí, hãy ghi rõ thay vì tự điền.' },
  { id: 'Q11.1', conversation: 'Q11', turn: 1, text: 'Tư vấn ba mẫu tai nghe chống ồn phù hợp với iPhone, đeo lâu thoải mái, ngân sách tối đa 5.000.000đ. Nêu ưu nhược điểm và nguồn cho giá.' },
  { id: 'Q11.2', conversation: 'Q11', turn: 2, text: 'Tăng ngân sách tối đa lên 6.000.000đ. Giữ nguyên tiêu chí dùng iPhone, đeo lâu thoải mái và chống ồn tốt. Hãy cập nhật lựa chọn nếu cần, nhưng đừng lặp lại toàn bộ câu trả lời cũ hoặc làm mất các tiêu chí đã nêu.' },
  { id: 'Q12', conversation: 'Q12', turn: 1, text: 'Tìm ba địa điểm ăn uống ở khu vực trung tâm TP.HCM có thể phục vụ sau 22:00 tối nay. Với từng địa điểm, nêu giờ hoạt động, khoảng giá, loại món và nguồn xác minh. Phân biệt thông tin hiện tại với thông tin có thể đã cũ; nếu không xác minh được giờ mở cửa hôm nay thì nói rõ.' },
]
