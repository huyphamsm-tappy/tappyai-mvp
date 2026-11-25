# TVI (kho tri thức có nguồn gốc) — hiện trạng đo thật và đề xuất giai đoạn kế — 20/11/2026

Nguồn: kiến trúc R13 mục 8; mã `src/lib/tvi/*`; migration `20261120_tvi_core.sql`; số đo từ cơ sở dữ liệu thử (UAT, chỉ đọc) và nhật ký máy chủ thử (1.206 lượt tìm địa điểm). Nhãn: ĐÃ ĐO / SUY LUẬN.

## 1. Đã có (ĐÃ ĐO)
- Lõi kho: thực thể, dữ kiện, phiên bản bất biến, trạng thái vòng đời, nhật ký sự kiện, bằng chứng, nguồn. Chỉ service-role đọc/ghi.
- Ghi (`TVI_CAPTURE`): sau khi `search_places` trả lời, lưu địa chỉ, số điện thoại, website, giờ mở cửa hằng tuần của từng quán thành dữ kiện **ỨNG VIÊN**, kèm tham chiếu nguồn và mã băm (không lưu đoạn văn nguồn).
- Đọc (`TVI_READ`): bù trường mà lần gọi này không trả về, kèm ngày đọc và độ tươi.
- Hàm cổng bằng chứng (`evidenceGate.ts`) viết xong và có test, **chưa nối** vào đường nào.
- Cả ghi và đọc đang **tắt ở production** (chờ Pháp lý xác nhận được lưu gì từ nhà cung cấp tìm kiếm: R13 §21 mục 48) và bật ở máy thử.

## 2. Số đo trên cơ sở dữ liệu thử (ĐÃ ĐO)
- **2.728 địa điểm**, chỉ một loại thực thể (`place`); nhiều nhất Singapore 196, Phú Quốc 170, Huế 170, Đà Lạt 163, Đà Nẵng 136, Hà Nội 115.
- **8.721 dữ kiện**: địa chỉ 2.726, giờ mở cửa 2.244, điện thoại 2.162, website 1.589; 8.740 phiên bản; chỉ 19 dữ kiện đổi giá trị (có phiên bản thứ hai).
- **100% dữ kiện còn ở trạng thái ỨNG VIÊN / CHƯA KIỂM CHỨNG**: chưa cái nào được nâng lên ACTIVE; **chỉ một nguồn** (nhà cung cấp địa điểm).
- Từ 10/11 đến 19/11 (9 ngày) kho đầy lên nhờ các lượt thử của chính chúng ta, chưa có người dùng thật.

## 3. Kho đang giúp được bao nhiêu (ĐÃ ĐO trên 1.206 lượt tìm địa điểm)
- Kho có dữ kiện của các quán xuất hiện ở **1.138/1.206 lượt (94%)**.
- Nhưng nó chỉ **bù được chỗ thiếu ở 13 lượt (1,1%)**, tổng 18 hàng và 19 dữ kiện, vì nhà cung cấp trả đủ trường ở hầu hết lần gọi.
- **SUY LUẬN:** kho dữ kiện theo quán **không thay được lượt tìm kiếm trả phí**: câu hỏi "quán bún bò nào ngon ở Huế" cần danh sách và xếp hạng, kho chỉ có dữ kiện của một quán đã biết tên. Muốn giảm chi phí Serper (chiếm khoảng 50% chi phí), kho phải trả lời được **câu hỏi về một sự thật cụ thể** mà hiện nay phải tra web.

## 4. Đề xuất các giai đoạn (SUY LUẬN, chờ anh duyệt phạm vi)
**Giai đoạn A — đo và củng cố (nhỏ, không đổi hành vi bộ não):**
1. Nối `evidenceGate` vào đường ghi để dữ kiện đủ bằng chứng được nâng lên ACTIVE/đã kiểm chứng, dữ kiện quá hạn được đánh dấu cũ (tác vụ nền, có test).
2. Báo cáo độ phủ định kỳ (số thực thể, dữ kiện theo loại, tỷ lệ ACTIVE, độ tươi) từ nhật ký + kho.

**Giai đoạn B — nội dung có thẩm quyền, chọn MỘT lĩnh vực đầu (cần anh chọn):** dữ kiện chính thức, ổn định, hay bị hỏi, nguồn rõ (cơ quan nhà nước, ban quản lý di tích, trang chính thức của đơn vị). Ứng viên: (1) điểm tham quan: giá vé, giờ mở, ngày nghỉ; (2) thủ tục và quy định cho khách: thị thực, SIM, thuế, giấy phép; (3) lịch lễ hội, ngày nghỉ, giờ giao thông cấm; (4) bảng giá tham chiếu (xăng, vàng, cước taxi).
- Nạp có kiểm soát: đọc trang bằng bộ tải an toàn, mô hình trích dữ kiện, cổng bằng chứng quyết định, người duyệt mẫu; mỗi dữ kiện có nguồn, ngày, hạn hiệu lực.

**Giai đoạn C — công cụ tra kho cho bộ não (đụng bộ não đã đóng băng, cần anh duyệt riêng):** công cụ kiểu `explain_feature` nhưng cho sự thật về Việt Nam: tra kho trước, trúng thì trả dữ kiện kèm nguồn và ngày, trật thì tra web như cũ. Đo trên bộ 40 câu mới: tỷ lệ trúng, chất lượng, chi phí; **chỉ khi chứng minh được mới giảm lượt gọi Serper** (đúng điều kiện của R13 §17).

**Giai đoạn D — thời gian thực:** dữ kiện tính theo giờ/ngày (giá, thời tiết, lịch) vẫn đi qua nhà cung cấp trực tiếp; kho chỉ lưu nhịp cập nhật và nguồn, không thay thế.

## 5. Điều cần anh quyết trước khi làm giai đoạn B
1. Lĩnh vực đầu tiên (gợi ý: điểm tham quan, vì dữ liệu đang hỏi nhiều và có thể đối chiếu với trang chính thức).
2. Những loại nguồn được phép lưu (chỉ cơ quan/đơn vị chính thức? có cả báo chí?), và việc Pháp lý đã xác nhận lưu dữ kiện từ nhà cung cấp tìm kiếm chưa (đến lúc đó ghi/đọc vẫn tắt ở production).
3. Có cho giai đoạn C thêm một công cụ vào bộ não không (anh duyệt như đã duyệt `explain_feature`).
