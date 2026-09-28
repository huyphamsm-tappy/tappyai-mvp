# UAT tay nhanh — `uat.tappyai.com` (≤ 20 phút, xếp theo rủi ro)

**Code:** `rc/web-uat` @ `a6ae158` (commit docs có thể nằm trên). `uat.tappyai.com` tự deploy khi nhánh được push.
Chờ khoảng 3 phút sau khi push rồi mới test.

**Trước khi bắt đầu (1 phút):**
- Đăng nhập Vercel SSO.
- Dùng **tài khoản test**, không dùng tài khoản thật. UAT có thể đang dùng **Supabase production**, vì `NEXT_PUBLIC_SUPABASE_URL` là một biến dùng chung cho Production, Preview và Development.
- Web: Chrome desktop. Android: bản debug trỏ vào `https://uat.tappyai.com/`, máy để giao diện **tiếng Anh**.

Gõ đúng nguyên văn các câu dưới đây. Mỗi dòng ghi ✅ hoặc ❌; nếu ❌ thì chụp màn hình.

| # | Rủi ro | Nền tảng | Gõ | Đạt khi | ⏱ |
|---|---|---|---|---|---|
| 1 | 🔴 **Hết giờ ở lượt lập kế hoạch** (local đo 61–89 giây; từ bản có `maxDuration` 120 thì Vercel cắt ở 120 giây) | Web | `Đi Đà Nẵng 3 ngày 2 đêm cho 2 người, ngân sách 6 triệu` | Có **thẻ kế hoạch** trong vòng 120 giây (ghi lại số giây), không có bong bóng lỗi, không có dòng `[CTA_BUTTONS]{…` hiện ra dạng chữ | 2' |
| 2 | 🔴 Trả lời trước, hỏi sau | Web **và** Android | `rap phim nao gan q1` | Có thẻ rạp ngay. Có **đúng 1** câu hỏi và câu hỏi nằm **ở cuối** | 3' |
| 3 | 🔴 Chỉ hỏi trước khi thật sự mơ hồ | Web | `đi chơi ở đâu` | Hỏi "Bạn muốn làm gì?" kèm chip ăn uống / đi chơi / spa. Chưa hiện thẻ | 1' |
| 4 | 🔴 Tên quán bị mất hoặc bị đổi | Web | `Sinh nhật sếp, tiếp khách 8 người, phòng riêng, tầm 500k/người, Quận 1` | Câu đầu nêu **một nhà hàng** (không phải quán nhậu). Không khẳng định "có phòng riêng" (được phép nói "chưa xác nhận", "nên gọi hỏi") | 2' |
| 5 | 🟠 Khẳng định không có nguồn | Web | `Rạp chiếu phim IMAX ở TP HCM` | **Không** có câu "TP HCM không có rạp IMAX" hay "xác nhận không có". Chỉ nói "chưa xác nhận" và chỉ cách kiểm tra | 2' |
| 6 | 🟠 Giá / khoảng cách tự bịa | Web | `tim quan bun bo ngon o q1 duoi 80k` rồi `spa massage chan gan q1 duoi 300k` | Không khẳng định "giá dưới 80k" (chỉ "giá tham khảo tới 100k (chưa chắc dưới 80k)" hoặc "chưa có giá"). Spa không có "cách bạn X km" nếu thẻ không hiện khoảng cách | 3' |
| 7 | 🟠 Ngôn ngữ theo hội thoại | Android (giao diện tiếng Anh) | `rap phim nao gan q7`, sau đó `ok con cai nao gan hon` | Cả hai câu trả lời **bằng tiếng Việt** | 2' |
| 8 | 🟡 Nút đặt phòng | Android | `khach san o vung tau cuoi tuan nay cho 2 nguoi tam 1 trieu mot dem` | "Book on Trip.com" nằm **trên** "Open in Maps". Bấm vào thì mở trang Trip.com của đúng khách sạn đó | 2' |
| 9 | 🟡 Vé máy bay thiếu ngày | Web | `Vé máy bay Sài Gòn Hà Nội tuần sau rẻ nhất` | Tìm trước và đưa link (chưa có giá thật vì thiếu `TRAVELPAYOUTS_TOKEN`), rồi hỏi ngày ở cuối | 1' |
| 10 | 🟡 M4 sản phẩm | Web | `tiện mua máy sấy tóc Philips dưới 1 triệu` | Có thẻ sản phẩm. Không có câu "Bạn muốn mua món gì?" | 1' |

**Quan sát trong suốt các bước trên:** không có câu trả lời nào bị lặp đoạn (P1-a), và thẻ kế hoạch hiện đủ (P1-f).

Nếu #1 vẫn hết giờ ở 120 giây thì báo lại. Việc tăng tốc lượt lập kế hoạch nằm ở backlog sau launch (`docs/uat/POST-LAUNCH-BACKLOG.md` PL-001).
