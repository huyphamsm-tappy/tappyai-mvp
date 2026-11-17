# BÁO CÁO UAT CUỐI — 60 ca, gói Promax, bản đã đóng băng `9d69e5d` (17–18/11/2026)

Chạy trên giao diện thật `localhost:3000` (UAT, tài khoản Promax), mỗi ca một lượt hỏi và một ảnh chụp: `docs/uat/uat-final-20261118/screens/` (69 ảnh; báo cáo nghiên cứu có thêm ảnh `qNN-report.jpg`). Câu hỏi: `docs/uat/UAT-FINAL-60-QUESTIONS-20261118.json` (bộ mới, không lặp bộ 16/11 và 17/11).
Chi phí đo: 2,37 USD cho 66 lượt (60 ca + 4 lượt phụ của hai ca nhiều lượt + 2 lần chạy lại), trong đó Serper 0,74 USD; 2 báo cáo Advanced 0,64 và 0,57 USD, 3 báo cáo Standard 0,09–0,11 USD.

**Nhãn bằng chứng:** ĐÃ XÁC MINH = tự đối chiếu được; KHÔNG XÁC MINH ĐƯỢC = số thời gian thực hoặc không có nguồn độc lập đúng thời điểm lúc chấm. Em tự chấm, anh nên xem ảnh các ca ghi ❌/⚠️.

## Kết luận ngắn

**Chưa đạt ngưỡng đóng băng 9/10 trên cả bốn trục.** Không có ca nào bị chứng minh sai dữ kiện, nhưng có 2 lượt không ra câu trả lời (lần đầu), 1 nguồn dẫn là link hỏng gắn nhãn "NASA", và 3 ca bố cục vỡ (danh sách hoặc bảng dính dòng, mất nội dung). Cả ba nhóm lỗi đều sửa được ở tầng kiến trúc, không phải thêm luật vào prompt.

| Trục | Điểm tự chấm | Lý do chính |
|---|---:|---|
| Đúng/sai dữ kiện | 8,7 | 0 dữ kiện bị chứng minh sai; 2 lượt không trả lời (ca 20, 46), 1 bảng mất 2 hàng (ca 41) |
| Nguồn thông tin | 8,3 | Ca 39 dẫn link hỏng ghi "NASA"; vài ca nguồn kém chính thống (ca 1, 40, 58); ca 56–58 tên nguồn trong danh sách là mục lục/tên miền |
| Bố cục | 8,0 | Danh sách hoặc bảng dính dòng ở ca 34, 41, 48; tiêu đề tiếng Anh trong báo cáo tiếng Việt (ca 58) |
| Hiểu câu hỏi và ngữ cảnh | 8,8 | Ghi nhớ người dùng bị nói ra (ca 13, 15, 47); ca 50 lượt 1 phản ứng như cấp cứu với một câu khai báo |
| Standard (ca 56–58) | 8,5 | Cấu trúc, trích dẫn [n], mục "chưa chắc chắn" tốt; nhãn nguồn thô, một tiêu đề tiếng Anh |
| Advanced (ca 59–60) | 8,7 | Bảng kịch bản tính bằng mã, gắn nhãn ước tính, 33–38 link, xuất Word/PDF/chia sẻ; chạy 4 phút |

## Lỗi tìm thấy (xếp theo mức nghiêm trọng)

1. **Hai lượt không ra chữ (ca 20 lịch trình Đà Lạt, ca 46 "2 days in Hanoi")**, ảnh `q20.jpg`, `q46.jpg`: có thẻ địa điểm rồi hiện "Mình gặp trục trặc khi trả lời". Nhật ký: ca 46 chạm trần 110 giây của một lượt (9 lần gọi công cụ, mô hình chưa viết chữ nào, kết thúc `error`); ca 20 dừng ở giây 59 với `finishReason tool-calls`, 0 chữ, 10 lần gọi công cụ. **Chạy lại cả hai: đều xong** (79 giây, 69 giây, đủ lịch trình, 27–28 link). Lỗi chập chờn ở lượt có nhiều công cụ; nguyên nhân gốc của ca 20 chưa tìm ra. Phần giữ chỗ cho bước viết hiện tính theo số bước, không theo thời gian.
2. **Danh sách và bảng dính dòng (ca 34, 41, 48)**, ảnh `q34.jpg`, `q41.jpg`, `q48.jpg`: mô hình bỏ xuống dòng giữa các mục; ca 34 gộp "Thuốc giảm đau", "Đi khám", "Đi cấp cứu ngay" thành một đoạn (dấu hiệu cấp cứu bị chôn); ca 41 mất 2 hàng của bảng (còn 2 hàng, đáng lẽ 4); ca 48 gộp 4 món thành một bullet. Gốc chung: không có bước chuẩn hóa văn bản trước khi vẽ.
3. **Nguồn hỏng (ca 39)**: "[NASA](https://translate.google.com/translate?u=)". Công cụ tìm web trả về các kết quả proxy Google Translate với tham số bị cắt (cũng gặp ở ca 10 và 26, nhật ký `host translate.google.com robots_disallowed`); mô hình dẫn nó như một nguồn.
4. **Nhãn sai ngôn ngữ**: ca 48 (tiếng Pháp) chèn "(chưa xác minh)" bằng tiếng Việt; ca 58 (báo cáo tiếng Việt) có mục "What is doubtful".
5. **Ghi nhớ người dùng bị nói ra**: ca 13 "Bạn không thích chỗ ồn nên…", ca 47 "我按你之前说的偏好" (đúng thứ luật bảo không được nói ra). Ghi nhớ này đến từ các lượt UAT cũ của tài khoản.
6. **Ca 50 lượt 1** ("Mình bị dị ứng hải sản"): đáp như cấp cứu phản vệ và hỏi "đang có triệu chứng không?" hai lần trong một câu trả lời, trong khi người dùng chỉ khai báo.
7. **Nhỏ**: ca 24 link Vexere gắn ngày 24/11 trong khi hỏi "cuối tuần" (21–22/11); ca 3 nguồn thời tiết là trang chủ met.no, không phải trang dự báo; ca 1 dẫn webgia.com (trang tổng hợp) thay vì Petrolimex; ca 40 nguồn là trang học sinh (VietJack, Tuyển sinh 247), không phải bách khoa hay sách giáo khoa; ca 56–58 nhiều nhãn nguồn là "MỤC LỤC", "NĂM 2025" hoặc tên miền.

## Điểm tốt (có bằng chứng)

- **Số liệu thời gian thực có nguồn chính chủ và thời điểm:** tỷ giá (Vietcombank, ca 2), Bitcoin (Coinbase, ca 4, kèm so với 7 ngày trước và nói rõ VND chỉ là ước tính), vàng SJC kèm quy đổi giá thế giới 1 lượng = 37,5 g (ca 5), VN-Index đóng cửa (ca 6), xăng (ca 1), thời tiết có ngày (ca 3).
- **Hiểu ngữ cảnh nhiều lượt:** ca 49 nhớ bố mẹ lớn tuổi (ít đi bộ, nghỉ trưa, xe riêng), thẻ kế hoạch có địa chỉ thật; ca 50 không gợi ý hải sản và giữ cảnh báo dị ứng; ca 52 (PDF) đọc đúng 6 rủi ro và nói rõ cái nào chỉ là suy luận; ca 53 nói thẳng chưa xác minh được quán trong clip thay vì bịa.
- **Từ chối đúng:** ca 55 (xâm nhập wifi) từ chối và đề xuất cách hợp pháp; ca 54 (SMS lừa đảo) có bước cụ thể và nguồn cơ quan nhà nước.
- **Tính toán đúng:** ca 38, 267.645.116 đồng, khớp 200 triệu × 1,06⁵.
- **Ngôn ngữ:** ca 46 (Anh), 47 (Trung), 48 (Pháp), 45 (Hàn) đúng ngôn ngữ người hỏi.
- **Ảnh:** ca 51 nhận đúng món (gà nướng bổ ép kèm rau, đồ chua, nước chấm); khớp ảnh gốc.
- **Báo cáo nghiên cứu:** 5/5 xong; 0 số nguồn thô lộ ra, 0 câu dính; Standard 16–20 link, Advanced 33–38 link; mỗi báo cáo có mục điều chưa chắc chắn và đối chiếu số liệu mâu thuẫn giữa nguồn (ca 57, 58, 59).

## Bảng 60 ca

Ký hiệu: ✅ ổn; ⚠️ lỗi nhẹ; ❌ lỗi rõ. Nội dung là kết quả đọc câu trả lời và ảnh.

| # | Chủ đề | Kq | Ghi chú |
|---:|---|:--:|---|
| 1 | xăng RON 95-V | ⚠️ | Giá, ngày, giờ cập nhật rõ; nguồn là webgia.com (tổng hợp). Số: KHÔNG XÁC MINH ĐƯỢC độc lập |
| 2 | USD Vietcombank | ✅ | Mua tiền mặt/chuyển khoản/bán, bảng, nguồn VCB. Số: KHÔNG XÁC MINH ĐƯỢC độc lập |
| 3 | thời tiết Hà Nội cuối tuần | ⚠️ | Lời khuyên theo ngày hợp picnic; nguồn là trang chủ met.no |
| 4 | Bitcoin | ✅ | Giá, -13,9% 7 ngày, nguồn Coinbase, VND ghi là ước tính |
| 5 | vàng SJC so với thế giới | ✅ | Hai giá, công thức quy đổi, chênh lệch, bảng, nói rõ chỉ tham khảo |
| 6 | VN-Index | ✅ | Mức đóng cửa, ghi rõ không phải số trực tiếp |
| 7 | tin nóng thế giới | ✅ | 3 tin có link; ngày chỉ ghi chung ở đầu |
| 8 | tin công nghệ VN | ✅ | 4 tin có ngày, link VnExpress, "vì sao đáng chú ý" |
| 9 | tuyển Việt Nam trận gần nhất | ✅ | Thắng Đài Bắc 2–0 ngày 11/11; nói trận hôm nay chưa có kết quả |
| 10 | Ngoại hạng Anh cuối tuần | ✅ | Bảng lịch giờ Việt Nam, tâm điểm, nguồn có ngày đăng |
| 11 | nhạc Việt nghe nhiều | ✅ | Bảng top 5 từ Spotify (Kworb), ghi rõ tuần chốt 12/11 |
| 12 | bún chả Hoàn Kiếm | ⚠️ | Chỉ một quán gợi ý cho một câu hỏi mở; có nguồn |
| 13 | buffet hải sản 8 người | ⚠️ | Tính ngân sách đúng (4.784.000đ); nói ra ghi nhớ "không thích chỗ ồn" |
| 14 | bánh flan | ✅ | Định lượng, các bước, mẹo chống rỗ, nguồn; thẻ chủ thể bánh flan |
| 15 | ăn sáng Huế | ⚠️ | 3 quán theo Google Maps; nhắc "tránh chỗ ồn" từ ghi nhớ |
| 16 | một ngày ăn ở Hội An | ✅ | Theo bữa, món + quán, có nguồn |
| 17 | Bà Nà Hills vé và giờ cáp treo | ✅ | Bảng giá, giờ 08:00–22:00, nguồn Sun World. Giá: KHÔNG XÁC MINH ĐƯỢC độc lập |
| 18 | gym có hồ bơi Cầu Giấy | ✅ | 2 chỗ, nguồn chính chủ, nhắc hỏi gói có gồm bơi |
| 19 | bệnh viện nhi TMH Sài Gòn | ✅ | Nhi Đồng 1/2, số gọi, nguồn bệnh viện |
| 20 | lịch trình Đà Lạt | ❌ | Lần đầu không ra chữ (lỗi 1); chạy lại xong, 27 link |
| 21 | vé máy bay HN–SGN 25/11 | ✅ | Giá tham khảo có nguồn, link đối tác; hỏi một chiều/khứ hồi |
| 22 | khách sạn Nha Trang | ✅ | Giá Agoda đúng ngày, bảng, link kiểm tra lại giá |
| 23 | Singapore visa và chi phí | ✅ | Miễn visa, SG Arrival Card (ICA), bảng chi phí ghi là ước tính |
| 24 | SG đi Vũng Tàu | ⚠️ | Hợp lý; link Vexere gắn ngày 24/11 trong khi hỏi cuối tuần |
| 25 | Phú Quốc hay Côn Đảo | ✅ | Có chọn, nói chỗ nguồn không thống nhất, thẻ chủ thể |
| 26 | tai nghe chống ồn | ✅ | 2 mẫu, giá, nguồn, thẻ sản phẩm |
| 27 | tủ lạnh 300 lít | ✅ | Mẫu cụ thể, giá, thẻ; hỏi ngân sách |
| 28 | điện thoại chụp ảnh 10 triệu | ✅ | Bảng listing, so với giá chính hãng, hỏi lại tình trạng |
| 29 | máy giặt bền | ✅ | Bảo hành động cơ 10 năm nói đúng phạm vi |
| 30 | MacBook Air M4 | ✅ | Bảng giá theo nơi bán, ghi chênh lệch |
| 31 | bảo hiểm thất nghiệp | ✅ | 4 điều kiện, nguồn Báo Chính phủ |
| 32 | đăng ký kết hôn | ✅ | Giấy tờ, cổng dịch vụ công; thiếu lệ phí |
| 33 | vượt đèn đỏ xe máy | ✅ | 4–6 triệu và trừ 4 điểm: ĐÃ XÁC MINH (NĐ 168/2024) |
| 34 | đau lưng văn phòng | ❌ | Nội dung đúng, bố cục dính dòng (lỗi 2) |
| 35 | thiếu vitamin D | ✅ | Không chẩn đoán, nguồn NHS và MedlinePlus |
| 36 | lãi tiết kiệm 12 tháng | ✅ | Bảng 8 ngân hàng, nói hai nguồn lệch nhau. Số: KHÔNG XÁC MINH ĐƯỢC |
| 37 | trả góp 0% | ✅ | Phân tích tổng tiền, nguồn Apple |
| 38 | lãi kép | ✅ | 267.645.116 đồng: ĐÃ XÁC MINH |
| 39 | bầu trời xanh | ❌ | Giải thích đúng; nguồn "NASA" là link hỏng (lỗi 3) |
| 40 | Bạch Đằng 938 | ⚠️ | Đúng, nguồn trang học sinh |
| 41 | so sánh làm việc Nhật–Hàn | ❌ | Bảng mất 2 hàng, thẻ quốc gia là mô tả địa lý (lỗi 2) |
| 42 | SQL top 5 | ✅ | Mã đúng, ghi chú SQL Server |
| 43 | REST và GraphQL | ✅ | Thẻ + bảng + kết luận nhất quán |
| 44 | caption quán cà phê | ✅ | Đúng giọng, không dữ kiện bịa |
| 45 | dịch tiếng Hàn | ✅ | Bản dịch lịch sự |
| 46 | "2 days in Hanoi" | ❌ | Lần đầu không ra chữ (lỗi 1); chạy lại xong, 28 link |
| 47 | tiếng Trung: món ăn TP.HCM | ⚠️ | Đúng ngôn ngữ; nói "theo sở thích bạn nói trước" (lỗi 5) |
| 48 | tiếng Pháp: món Việt | ⚠️ | Danh sách dính dòng, "(chưa xác minh)" tiếng Việt (lỗi 2, 4) |
| 49 | đa lượt Đà Nẵng cùng bố mẹ | ✅ | 3 lượt nhất quán, thẻ kế hoạch |
| 50 | đa lượt dị ứng hải sản | ⚠️ | Lượt 2–3 đúng; lượt 1 quá mức (lỗi 6) |
| 51 | ảnh món ăn | ✅ | Nhận đúng, calo ghi là ước tính |
| 52 | PDF rủi ro | ✅ | 6 rủi ro, phân biệt đã nêu và suy luận |
| 53 | clip | ✅ | Nói thẳng chưa xác minh quán |
| 54 | SMS ngân hàng lạ | ✅ | "Đừng bấm", bước tự kiểm tra |
| 55 | xâm nhập wifi | ✅ | Từ chối, gợi ý hợp pháp |
| 56 | Standard: cà phê VN | ⚠️ | 16 nguồn, mục chưa chắc; nhãn nguồn "MỤC LỤC", tên miền |
| 57 | Standard: thương mại điện tử | ✅ | 19 nguồn, nêu mâu thuẫn giữa nguồn |
| 58 | Standard: xe máy điện | ⚠️ | 20 nguồn; mục "What is doubtful" bằng tiếng Anh; một số nguồn bán lẻ |
| 59 | Advanced: điện mặt trời Bình Dương | ✅ | 8 mục, bảng kịch bản Thấp/Cơ sở/Cao, 261 nguồn thu thập |
| 60 | Advanced: chuỗi cà phê specialty | ✅ | 10 mục, bảng kịch bản tính bằng mã, ghi "không có số liệu specialty" |

## Cách sửa đề xuất (tầng kiến trúc, chờ anh duyệt)

1. **Chuẩn hóa văn bản trước khi vẽ:** tách mục danh sách và hàng bảng bị dính dòng ở lớp xử lý (một hàm, có test) thay vì dặn mô hình. Sửa ca 34, 41, 48 và mọi lỗi cùng loại.
2. **Lọc kết quả tìm web:** bỏ hoặc mở gói các kết quả proxy `translate.google.com/translate`; không để chúng thành nguồn.
3. **Giữ chỗ cho bước viết theo thời gian:** khi lượt đã quá khoảng 70–80 giây mà chưa có chữ nào, chặn công cụ và buộc viết. Hiện chỉ giữ theo số bước.
4. **Nhãn theo ngôn ngữ trả lời:** đưa nhãn "chưa xác minh" và tên mục "điều chưa chắc" qua bảng chuỗi theo ngôn ngữ.
5. Ghi nhớ bị nói ra và ca 50 lượt 1: cần xem nguyên nhân kỹ hơn trước khi chọn cách sửa (không muốn vá bằng prompt).

## Chưa kiểm

- Số thời gian thực: không có nguồn độc lập đúng thời điểm; các số trong ca 1–6, 17, 36 giữ nhãn KHÔNG XÁC MINH ĐƯỢC.
- Gói Free (không công cụ): không chạy lượt này.
- Ca 20, 46: lỗi không ra chữ chỉ thấy 2/60; chạy lại thì ổn nên chưa có tỷ lệ thật.
- Không kiểm xuất file Word/PDF/chia sẻ của hai báo cáo Advanced trong vòng này (đã kiểm ở vòng trước).
