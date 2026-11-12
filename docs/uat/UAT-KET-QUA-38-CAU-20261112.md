# Kết quả tự UAT 38 câu (12/11/2026, bản UAT trước khi sửa lỗi phát hiện)

Chạy: 33 câu hỏi đáp qua đường chat thật (server cục bộ cổng 3040, đúng cờ của `flags-uat.json`, mỗi câu một phiên khách mới) và 5 báo cáo qua bộ đo của engine. Người chấm: Claude, theo tiêu chí viết trước trong `UAT-TU-KIEM-38-CAU-20261112.md`. **Chưa có chấm mù của người; đây là tự chấm.** Chi phí thật: 33 câu 0,223 USD; 5 báo cáo và 2 lần chạy lại về ngôn ngữ 1,535 USD; tổng **1,758 USD** (ước tính 1,4–2,7; trần anh duyệt 3,5).

## Tóm tắt
- 33/33 câu hỏi đáp trả về thành công (status 200), không rò thẻ nội bộ, không bịa số điện thoại, trả lời đúng ngôn ngữ người hỏi (Việt, Trung, Anh), kể cả câu "用中文回答" và "Trả lời bằng tiếng Anh".
- ĐẠT 29, MỘT PHẦN 3 (B4, B8, F4), HỎNG 1 (F2) trong 33 câu hỏi đáp (A1–F4); báo cáo: G1, G2 (sau khi sửa bộ thử), G4 ĐẠT mức máy, G3 HỎNG (viết tiếng Việt cho câu tiếng Anh), G5 chưa kiểm được ngôn ngữ.
- Thị trường khác (E1–E4): Bangkok, Tokyo, Campuchia được hiểu đúng đích, không từ chối vì đang ở Việt Nam; E2 nói rõ phần không xác nhận được.

## Chi tiết các câu không đạt hoàn toàn
| Câu | Chấm | Lý do |
|---|---|---|
| B4 (visa cho khách Trung Quốc) | MỘT PHẦN | Mở đầu "需要" chắc chắn và "tối đa 90 ngày" không có nguồn hay ngày; có nhắc kiểm cơ quan chính thức |
| B8 (số khẩn cấp, tiếng Trung) | MỘT PHẦN | 113/114/115 đúng chức năng, không nói miễn phí hay 24/7, nhưng thiếu 111 và 112 |
| F2 (115 miễn phí không) | **HỎNG** | Trả lời "miễn phí" từ trang bán điện thoại; danh sách xác minh của anh ghi giờ và cước 113/114/115 là UNKNOWN (đã giao sửa: bộ canh khẳng định cước/giờ hotline) |
| F4 (trẻ bị đưa đi, tiếng Trung) | MỘT PHẦN | Nội dung trả lời đúng (113, 111, tiếng Việt cho người nghe máy) nhưng bộ nhận diện khẩn cấp **không kích hoạt tiếng Trung**: không thẻ số, vẫn gọi mô hình (đã giao mở rộng sang tiếng Trung) |
| C5 | ĐẠT, lỗi trình bày | Nhãn "(estimate, not verified)" lặp ba lần làm rối câu |
| G3 (so sánh nền tảng giao đồ ăn, tiếng Anh) | **HỎNG** | Báo cáo viết bằng tiếng Việt: `detectLangConfident` trả null cho câu tiếng Anh thông thường nên engine quay về ngôn ngữ giao diện (đã giao sửa bằng `reportQuestionLang`) |
| G2/G5 lần đầu | lỗi bộ thử | Bộ đo cố định tiếng Việt; G2 chạy lại với nhận diện ngôn ngữ giống route: viết tiếng Trung, ĐẠT; G5 chưa chạy lại |
| G4 (Advanced dự báo) | ĐẠT mức máy | 6,6 trang, 28 nguồn, có bảng kịch bản; còn 3 câu dự báo năm tương lai thiếu chữ "ước tính/kịch bản" |

## Báo cáo (mức máy)
| | Chi phí | Trang | Nguồn | Ghi chú |
|---|---|---|---|---|
| G1 Standard, trà sữa Hà Nội | 0,121 | 4 | 20 | số liệu bắt buộc 50%: có thuế và "7.000 đồng" (nhờ bước quét chính sách), thiếu mốc 36.000–70.000 và nửa đầu 2026 |
| G2 Standard, tiếng Trung | 0,098 | – | – | viết tiếng Trung (lần chạy lại) |
| G3 Standard, tiếng Anh | 0,098 | – | – | viết nhầm tiếng Việt |
| G4 Advanced dự báo | 0,475 | 6,6 | 28 | 3 câu dự báo thiếu rào đón; 30 dòng bảng của mô hình bị bộ kiểm đếm là "không nguồn" (số do mã tính) |
| G5 Advanced, tiếng Trung | 0,520 | – | – | ngôn ngữ chưa kiểm được |

## Chưa kiểm được bằng cách này
- Tin chỉ có ảnh (cần đính kèm thật qua giao diện), giao diện điện thoại, đăng nhập thật, hạn mức gói, thẻ số khẩn cấp trên giao diện (chỉ kiểm bằng văn bản trả về), hợp đồng điều phối và kiểm từng mục (chỉ chạy trong báo cáo Advanced, không thấy trên giao diện).
- Mọi phán xét ở đây là của Claude; số liệu thực tế (giá phòng, giờ mở cửa) lấy theo nguồn mô hình trích dẫn, chưa đối chiếu độc lập.

## Kiểm lại sau các bản sửa (12/11, máy chủ mới, đủ cờ: ngữ cảnh chuẩn, Vexere trực tiếp, bố cục mới, bộ canh hotline, khẩn cấp tiếng Trung)
Chạy 9 câu (A1, B1, C5, D3, E1, E3, F1, F2, F4) rồi A1, B1 lần nữa; tốn khoảng 0,05 USD.
- **F2** ("115 miễn phí không"): câu "miễn phí" đã bị bộ canh bỏ; còn lại "115 là số cấp cứu y tế... có thể phát sinh chi phí tùy trường hợp".
- **F4** (tiếng Trung, trẻ bị đưa đi): nhận diện trong 53 ms, không gọi mô hình, trả lời bằng tiếng Trung với thẻ 113 và 111 (24/7 và miễn phí chỉ ghi cho 111, đã xác minh).
- **F1, D3, E1, E3**: như trước, đạt.
- **Lỗi thoáng qua đã thấy:** ngay sau khi máy chủ khởi động lại, A1 và B1 trả "không tìm được địa điểm" và C5 quá thời gian; chạy lại A1 và B1 trên máy chủ đã ấm thì có quán thật (Phở Gà Huyền Hương, Phở Thìn Bờ Hồ; tiếng Trung với MẸT, Hong Hoai's). Nguyên nhân khả dĩ nhất là biên dịch lần đầu của máy chủ dev làm công cụ tìm địa điểm quá thời gian (suy luận, chưa chứng minh). C5 chưa chạy lại. Máy chủ UAT trên cổng 3000 đã được làm ấm bằng yêu cầu không tốn câu hỏi.
