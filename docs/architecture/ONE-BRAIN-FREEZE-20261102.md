# Đóng băng kiến trúc chat "một bộ não", ngày 02/11/2026

**Owner yêu cầu:** "đóng băng kiến trúc hiện tại".

**Mốc đóng băng:**
- Nhánh `integration/canonical-20261020`.
- Tag `arch-freeze-20261102` đặt trên commit sửa lỗi rà soát ngày 02/11.
- Nhánh dự phòng `backup/arch-freeze-20261102`.

**Canh bằng test:**
- Test canh là `src/lib/ai/consultative/architectureFreeze.test.ts`.
- Test đó đỏ nghĩa là kiến trúc đã đổi. Không sửa test cho qua: cần Owner duyệt, rồi thêm một mục mới có ngày vào cuối tài liệu này.

## 1. Kiến trúc được đóng băng

### 1.1. Một bộ não (`CONSULT_ONE_BRAIN`)

Mô hình trả lời là bên **duy nhất** đọc câu hỏi.

- **Mô hình tự quyết:** nó đọc cả cuộc trò chuyện, có mọi công cụ, và tự quyết tra gì, có hỏi lại không, viết dài bao nhiêu.
- **Không có trong code:**
  - bộ định tuyến luật;
  - từ khóa theo sản phẩm, ngôn ngữ hay cửa hàng;
  - nhánh riêng cho từng câu hỏi.
- **Code vẫn giữ:** an toàn, trần chi tiêu, lượt hỏi, và hiển thị thẻ cho những gì mô hình đã tra.
- **Giới hạn của một lượt:**
  - 8 bước, trong đó 2 bước để viết;
  - tối đa 4000 token đầu ra.

### 1.2. Năm chế độ

Chế độ đọc từ trường `mode` của request. Thiếu hoặc giá trị lạ thì là **Chat**; app di động và client cũ không gửi `mode` nên chạy Chat.

| Chế độ | Cách chạy |
|---|---|
| `auto` (web mặc định) | Bắt đầu như Chat. Chỉ khi mô hình **tự gọi** `think_deeper` thì các bước sau mới chuyển sang Responses API, effort medium. Không từ khóa nào quyết định việc này. |
| `chat` | Mô hình tự chọn độ sâu tra web. Nhanh: 1 lần tìm, 1 lần đọc trang. Kỹ: 3 lần tìm, 3 lần đọc, có tìm bù. |
| `web` | Tìm web. |
| `think` | Suy nghĩ ở effort medium. |
| `deep` | Nghiên cứu sâu: lập kế hoạch, tìm theo bước (Serper, thêm Parallel nếu bật cờ), vòng bù, viết báo cáo có nguồn, tải md/docx/pdf. |

### 1.3. Hạng gói (server ép, client chỉ ẩn nút)

| Hạng | Gói | Chế độ | Nghiên cứu sâu mỗi tháng |
|---|---|---|---|
| free | khách, Pip | chỉ Chat | 0 |
| pro | MoMo (trial), Coco, các gói cũ Milo/Sunny | mọi chế độ | 10 |
| promax | Tappy (`promax1m`, `promax3m`) | mọi chế độ | 69 |

- **Gói đang bán:** `pip`, `momo`, `coco`, `promax1m`, `promax3m`.
- **Đang tắt:** việc ép hạng và đếm Nghiên cứu sâu nằm sau cờ `SUBSCRIPTIONS_ENABLED`, hiện chưa bật.

### 1.4. Thời gian

- `maxDuration = 300` giây, chỉ dành cho Nghiên cứu sâu: nghiên cứu tối đa 120 giây, bước viết dừng ở giây 270.
- Mọi lượt khác kết thúc ở hạn của lượt, `TURN_DEADLINE_MS` = 110 giây. Luồng trả lời nhận tín hiệu `turnSignal`: dừng khi khách rời đi **hoặc** khi hết hạn.
- Thời gian chờ của Responses API (`LLM_RESPONSES_TIMEOUT_MS`, mặc định 60 giây) là thời gian **im lặng**: được đặt lại mỗi khi có dữ liệu mới, không giới hạn tổng độ dài câu trả lời.

## 2. Các sửa lỗi trong đợt rà soát 02/11 (2 reviewer độc lập, chỉ đọc)

1. **Nghiên cứu sâu lỗi vẫn bị tính lượt.**
   - **Lỗi:** `textStream` của AI SDK bỏ qua phần `error`, nên báo cáo viết hỏng vẫn được coi là xong và không hoàn lượt.
   - **Sửa:** đọc `fullStream` (hàm `writtenText`). Báo cáo rỗng tính là `write_failed`, và lượt được hoàn.
2. **Câu trả lời dài bị cắt ở giây 60.** Thời gian chờ đổi sang thời gian im lặng.
3. **Lượt Chat/Suy nghĩ/Tự động có thể chạy tới 300 giây.** Thêm `turnSignal`, đưa giới hạn về 110 giây.
4. **Trang "sorry" hay trang consent của Google bị nhận là nguồn.** Mọi chuyển hướng tới trang Google khác đều được coi là trang chặn bot: tạm dừng, không lưu.
5. **Hoàn tác migration `20261102` khi còn đơn Tappy chưa thanh toán.**
   - **Lỗi:** đơn đó sẽ được trả tiền mà không cấp gói.
   - **Sửa:** tệp hoàn tác từ chối chạy cho tới khi các đơn đó hết hạn.

## 3. Rủi ro đã biết, chờ Owner quyết (không sửa trong đợt đóng băng)

- **Khi `SUBSCRIPTIONS_ENABLED` còn tắt:** mọi người, kể cả khách, đều chọn được Nghiên cứu sâu và Suy nghĩ, mỗi lần chỉ tốn 1 lượt hỏi. Phải bật cờ này cùng lúc với lần deploy có một bộ não.
- **Thứ tự deploy:** chạy migration `20261102` **trước** khi deploy mã có gói Tappy. Nếu không, đơn Tappy lỗi 500 và webhook cửa hàng lặp lại.
- **Sổ chi phí ghi sai chế độ khi chưa đặt ngân sách Responses:** sổ chi phí và log vẫn ghi `think`/`auto_think` dù lượt đã bị hạ về Chat. Nguyên nhân là chưa đặt `LLM_RESPONSES_PROCESS_BUDGET_USD`.
- **Nghiên cứu sâu không dừng khi khách đóng trang.** Nó chạy tới hết và vẫn tốn khoảng 0,012 USD.

## 4. Nhật ký thay đổi kiến trúc sau đóng băng

(Trống. Mỗi thay đổi ghi theo dạng: ngày, Owner duyệt gì, commit, và dòng nào của test canh đã đổi.)
