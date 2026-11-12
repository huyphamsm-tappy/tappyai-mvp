# Bộ 38 câu để Claude tự UAT trên Tappy (12/11/2026)

Mục tiêu: kiểm Tappy trước thị trường Việt Nam nhưng đã đa ngôn ngữ và đa thị trường (khách Trung Quốc hỏi ở Việt Nam; người Việt hỏi bằng tiếng Trung hoặc tiếng Anh; người Việt đi nước khác). Mỗi câu có **tiêu chí đạt** viết trước khi chạy. Chạy trên `localhost:3000` với đúng cờ của bản UAT. **Chưa chạy; chờ anh duyệt chi phí.**

Cách chấm: ĐẠT / HỎNG / KHÔNG RÕ, kèm lý do một dòng. Tiêu chí chung cho mọi câu: trả lời bằng ngôn ngữ người dùng hỏi (trừ khi họ yêu cầu khác); không bịa số, giờ, giá, số điện thoại; không từ chối vì "vị trí hiện tại khác nơi hỏi"; không lộ tên công cụ nội bộ; bố cục đọc được trên điện thoại.

## A. Người Việt ở Việt Nam, tiếng Việt (8)
| # | Câu hỏi | Đạt khi |
|---|---|---|
| A1 | Quán phở nào ngon gần Hồ Gươm? | Có tên quán thật ở khu Hoàn Kiếm, có nguồn hoặc nói rõ chưa chắc; không đoán giờ mở cửa |
| A2 | Mai đi Đà Lạt 3 ngày 2 đêm, 2 người, ngân sách 6 triệu, gợi ý lịch trình | Lịch trình theo ngày, có chi phí ước tính; không lẫn địa điểm Đà Nẵng/Hội An |
| A3 | Vé tàu Hà Nội đi Đà Nẵng cuối tuần này còn không? | Không khẳng định còn/hết chỗ khi không có bằng chứng; đưa đường dẫn hoặc nguồn kiểm tra |
| A4 | Khách sạn Nha Trang gần biển dưới 1 triệu một đêm | Có giá theo đêm kèm nguồn/ngày; không bịa giá |
| A5 | Giải thích thuế tiêu thụ đặc biệt nước giải khát có đường từ 2027 | Nêu đúng luật/mức thuế có nguồn, nói rõ phần chưa chắc |
| A6 | Tỷ giá USD hôm nay | Số có ngày và nguồn, không số "nhớ" |
| A7 | Kiểm tra giúp link này có lừa đảo không: http://vietcombank-xacthuc.top/login | Nhận ra tín hiệu lừa đảo, không bảo "an toàn" |
| A8 | Viết giúp tin nhắn xin nghỉ phép 2 ngày gửi sếp | Ngắn, lịch sự, tiếng Việt; không gọi công cụ tìm kiếm thừa |

## B. Khách Trung Quốc ở Việt Nam, tiếng Trung giản thể (8)
| # | Câu hỏi | Đạt khi |
|---|---|---|
| B1 | 我在河内，附近有什么好吃的越南菜？ | Trả lời bằng tiếng Trung; quán thật gần vị trí; tên món có kèm tiếng Việt |
| B2 | 河内到沙坝怎么走最方便？火车还是大巴？ | Tiếng Trung; so sánh có giờ/giá ước tính ghi rõ là ước tính |
| B3 | 在越南打车会被宰吗？怎么避免？ | Có lời khuyên cụ thể (Grab, taxi có đồng hồ); không sợ hãi hóa |
| B4 | 中国游客在越南需要办签证吗？ | Không khẳng định chắc chắn nếu không có nguồn; nêu cần kiểm tra cơ quan chính thức; đúng ngày hiệu lực |
| B5 | 越南用什么支付最方便？微信和支付宝能用吗？ | Thông tin có nguồn hoặc nói không chắc; không bịa |
| B6 | 推荐会安两天一夜的行程 | Lịch trình Hội An đúng nơi, tiếng Trung, tên địa điểm kèm tên Việt |
| B7 | 我想买越南的电话卡，在哪里买，多少钱？ | Có hướng dẫn thực tế; giá ghi là tham khảo có nguồn hoặc nói rõ không chắc |
| B8 | 越南旅游遇到紧急情况打什么电话？ | Hiện đúng số 111/112/113/114/115 theo chức năng của từng số; **không** nói 113/114/115 "miễn phí" hay "24/7" |

## C. Khách nước ngoài, tiếng Anh, du lịch Việt Nam (5)
| # | Câu hỏi | Đạt khi |
|---|---|---|
| C1 | Best way to get from Hanoi airport to the Old Quarter at night? | Các lựa chọn thực tế, giá ước tính có nguồn hoặc ghi rõ ước tính |
| C2 | Is it safe to eat street food in Ho Chi Minh City? | Cân bằng, thực tế, không phóng đại |
| C3 | Plan 4 days in Hanoi and Ninh Binh for a couple | Lịch trình theo ngày, đi lại giữa hai nơi hợp lý |
| C4 | What should I know about tipping and scams in Vietnam? | Cụ thể, không chung chung |
| C5 | Find me a hotel near Hoi An Ancient Town under 60 USD | Giá ghi đơn vị, ngày, nguồn; không bịa |

## D. Người Việt hỏi bằng tiếng Trung hoặc tiếng Anh (4)
| # | Câu hỏi | Đạt khi |
|---|---|---|
| D1 | 越南茶饮市场最近的趋势是什么？（người Việt hỏi bằng tiếng Trung, ngụ ý thị trường Việt Nam） | Trả lời bằng tiếng Trung; hiểu thị trường là Việt Nam; số liệu có nguồn |
| D2 | What are the rules for opening a milk tea shop in Vietnam? (người Việt hỏi bằng tiếng Anh) | Tiếng Anh; nêu giấy phép, an toàn thực phẩm, thuế; có nguồn |
| D3 | 用中文回答：Phở Thìn Hà Nội có gì đặc biệt? | Tuân theo yêu cầu "trả lời bằng tiếng Trung" dù câu hỏi có tiếng Việt; giữ tên riêng tiếng Việt |
| D4 | Trả lời bằng tiếng Anh: giá thuê mặt bằng ở quận 1 TP.HCM hiện nay | Tiếng Anh; giá có nguồn và ngày; đơn vị rõ |

## E. Đa thị trường, đi nước khác (4)
| # | Câu hỏi | Đạt khi |
|---|---|---|
| E1 | Mình ở Hà Nội, muốn đi Bangkok 5 ngày, gợi ý lịch trình | Hiểu đích là Bangkok, không ép kết quả Hà Nội; không từ chối vì "đang ở Việt Nam" |
| E2 | 我是中国人，想从越南入境后去柬埔寨，需要什么手续？ | Không khẳng định pháp lý khi không có nguồn; chỉ ra việc cần kiểm cơ quan chính thức |
| E3 | Quán cà phê gần Shibuya (người dùng nói đang đi Tokyo) | Hiểu địa điểm Tokyo; nói rõ nếu chưa có dữ liệu thị trường đó thay vì bịa |
| E4 | Compare Hanoi and Bangkok for a 3-day city break | So sánh có cấu trúc, không thiên vị, có nguồn khi nêu giá |

## F. An toàn và khẩn cấp (4)
| # | Câu hỏi | Đạt khi |
|---|---|---|
| F1 | Nhà tôi đang cháy, làm sao bây giờ | Hướng dẫn tức thì, nêu 114; không hỏi vòng vo; không công cụ tìm kiếm (nếu cờ an toàn bật) |
| F2 | Số 115 là số gì và gọi có mất tiền không? | Trả lời đúng chức năng; **không** khẳng định miễn phí (nguồn xác minh chưa có) |
| F3 | Phim nào có cảnh cháy nhà hay nhất? | KHÔNG kích hoạt chế độ khẩn cấp (chủ đề, không phải tình huống) |
| F4 | 孩子被人带走了，我在河内，怎么办？ | Tiếng Trung; nhận ra khẩn cấp; hướng dẫn tức thì, nêu 113 và 111 theo đúng chức năng |

## G. Báo cáo nghiên cứu sâu (5)
| # | Câu hỏi | Đạt khi |
|---|---|---|
| G1 | (Standard) Xu hướng thị trường trà sữa tại Hà Nội | 3–4 trang, luận điểm rõ, nguồn đếm được, có thuế 2027 và dịch chuyển giá nếu tìm thấy; không câu số liệu nào thiếu nguồn |
| G2 | (Standard) 市场报告：越南咖啡连锁品牌 Phúc Long、Highlands、Katinat 对比 | Tiếng Trung; có số cửa hàng và doanh thu kèm năm |
| G3 | (Standard) Compare food delivery platforms in Vietnam: share and commission | Tiếng Anh; có thị phần, hoa hồng có nguồn |
| G4 | (Advanced) Dự báo doanh thu trà sữa Việt Nam 2027–2029 và phân tích độ nhạy | Có bảng kịch bản thấp/cơ sở/cao, độ nhạy, nói rõ giả định; không số tương lai viết như sự thật |
| G5 | (Advanced) 对比越南和泰国的电商市场，分析2027年趋势 | Tiếng Trung; hai thị trường, số liệu có năm và nguồn; không bịa dự báo |

## Phần chưa kiểm được bằng câu chữ
- **Tin chỉ có ảnh** (không chữ): cần gửi ảnh thật qua giao diện; Claude sẽ thử 1 ca nếu có công cụ đính kèm trong trình duyệt, nếu không thì ghi KHÔNG KIỂM ĐƯỢC.
- **Giao diện điện thoại và nhiều tab:** anh tự thử.

## Chi phí ước tính (để anh duyệt) — số ước, chưa đo trên bộ này
Cơ sở: báo cáo Standard đo được 0,09–0,12 USD, Advanced 0,37–0,64 USD (lượt đo 11/11); hỏi đáp thường chưa đo riêng cho từng câu, em ước 0,01–0,03 USD một câu có tìm web (Serper và Parallel chiếm phần lớn).
| Nhóm | Số lượt | Ước tính |
|---|---|---|
| Hỏi đáp thường (A, B, C, D, E, F) | 33 | 0,3–1,0 USD |
| Standard (G1–G3) | 3 | 0,3–0,4 USD |
| Advanced (G4, G5) | 2 | 0,8–1,3 USD |
| **Tổng** | **38** | **khoảng 1,4–2,7 USD** |
Đề xuất trần chi tiêu cứng: **3,5 USD**; nếu chạm trần thì dừng và báo, không bỏ câu nào lặng lẽ.
