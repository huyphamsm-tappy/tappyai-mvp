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
- ~~Sổ chi phí ghi sai chế độ khi chưa đặt ngân sách Responses~~: đã sửa 02/11 (mục 4).
- ~~Nghiên cứu sâu không dừng khi khách đóng trang~~: đã sửa 02/11 (mục 4).

## 4. Nhật ký thay đổi kiến trúc sau đóng băng

- **02/11, Owner duyệt "Có sửa luôn đi em"** (2 rủi ro ở mục 3). Không đổi dòng nào của test canh.
  - **Nghiên cứu sâu dừng khi khách rời trang:** route nối tín hiệu của request vào `stop` (`deepResearchResponse`). Thân trả lời bị hủy cũng kích hoạt `stop`. Lệnh gọi mô hình đang chạy bị bỏ (`createDeepResearchDeps({ signal })`). Vòng chạy dừng ở bước đang làm, không viết tiếp, kết thúc `client_gone` và **hoàn lượt** (cả lượt hỏi lẫn lượt Nghiên cứu sâu).
  - **Sổ chi phí ghi đúng chế độ thật:** `ledgerMode()`. Khi chưa đặt `LLM_RESPONSES_PROCESS_BUDGET_USD`, lượt Suy nghĩ ghi `chat`, lượt Tự động có bật suy nghĩ ghi `auto`.
- **02/11, Owner duyệt "Duyệt, chọn (a)"** (5 lỗi từ UAT in lịch sử chat). Cả 5 là lớp mã server/thẻ quanh mô hình, không đổi lời dặn mô hình, không thêm từ khóa.
  - **48ef618 — bỏ bù ngày về:** `guardPlanItems` có `topUpReturnDay`; một bộ não truyền `false`, ngày về giữ đúng như mô hình viết (trước đó mã bù chỗ của nơi khác → địa chỉ Sài Gòn lọt vào lịch Nhật).
  - **fa72364 — hạn mức tìm địa điểm:** `PLACES_BUDGET_ONE_BRAIN = 6` lượt/câu (trước 3/3 → chặn tìm "bar pub về đêm").
  - **de930fe — nút mua trên thẻ mua sắm:** chỉ dẫn đầu bằng link của đúng cửa hàng của dòng đó; link cửa hàng khác chỉ giữ khi cùng dung lượng; trang tìm kiếm luôn giữ.
  - **365cd7f — thẻ lịch trình:** luôn chia tab theo ngày như thiết kế (bỏ biến thể "mọi ngày một trang" 29/10).
  - **2160573 — thẻ địa điểm mang lời câu trả lời:** tên in đậm đứng đầu dòng → phần còn lại của dòng (lời mô hình, giữ số, bỏ link) thành dòng "Vì sao" trên **mọi** thẻ được nêu; vẫn chỉ thẻ đầu được chọn. Không thêm lệnh gọi mô hình.
  - **Cùng lời phàn nàn "hỏi Nhật ra địa chỉ Việt Nam", lớp thứ hai (đo lại localhost sau 48ef618):** tìm địa điểm với nơi ở nước ngoài ("Tokyo, Japan") bị bỏ tọa độ vì ngoài Việt Nam rồi rơi về tâm TP.HCM. `placeCoordinates` nay lấy dòng trong Việt Nam trước như cũ; không có dòng nào trong Việt Nam thì lấy tọa độ của chính nơi đó.
- **01/11 (theo lịch phiên), Owner mở đóng băng: "không đóng băng nữa, sửa đi em"** (UAT xem PDF trước/sau sửa). Bốn việc, mỗi việc một commit, mỗi việc có test đỏ trước. Test canh `architectureFreeze.test.ts` không đổi dòng nào.
  - **205945e — tệp Nghiên cứu sâu:** PDF in bằng trình duyệt dùng Georgia (không có chữ tiếng Việt, trình duyệt ghép glyph từng chữ) → nay Segoe UI/Noto Sans 16 px, giãn dòng 1,75, đệm đoạn/mục/ô bảng. Word không có style nào (Word dùng cỡ mặc định rất nhỏ, không giãn dòng) → nay Calibri 11 pt, giãn dòng ~1,4, tiêu đề có cỡ, ô bảng có đệm.
  - **1c9b03a — kéo thả/dán tệp vào khung chat:** quy tắc nút đính kèm tách thành `composerAttachment.ts`; nút, kéo thả vào khung chat và dán ảnh vào ô nhập cùng dùng. Giới hạn như cũ (PNG/JPEG/WEBP/GIF, PDF ≤ 3 MB).
  - **b2340fa — cấm nguồn từ sản phẩm AI khác (AIHAY…):** `aiSourcePolicy.ts` giữ danh sách tên miền (dữ liệu, không phải từ khóa câu hỏi). Mọi công cụ của lượt chat được bọc trong cùng, trước bọc vé web: đọc trang AI bị từ chối; dòng kết quả có địa chỉ AI bị bỏ trước khi bộ đọc, bộ giữ link (chỉ giữ link công cụ đã trả) hay mô hình thấy. Ghép dòng của Nghiên cứu sâu và bằng chứng Exa dùng cùng phép kiểm. Trang chủ của chính một công ty (blog, thông cáo) vẫn là nguồn gốc, không bị chặn.
  - **1b99e67 — chất lượng thẻ kế hoạch:** mô tả công cụ `present_plan` và hai trường của một điểm dừng (`PRESENT_PLAN_DESCRIPTION`, `PRESENT_PLAN_FIELD_NOTES` trong `oneBrain.ts`) nay nói nguyên tắc chung của một kế hoạch đáng đi theo: chủ đề từng ngày, ngày gói trong một khu, địa điểm cụ thể + món/việc nên thử, vì sao có trong kế hoạch, ở bao lâu và đi từ điểm này sang điểm kia thế nào, không ô trống "nghỉ ngơi", mẹo thực tế đưa vào phần mẹo. `think_deeper` nói rõ kế hoạch/lịch trình/lời khuyên người dùng sẽ làm theo LUÔN cần suy nghĩ. Không nêu địa danh, món, sản phẩm. Các guard trên thẻ không đổi.
  - **Đo lại 10 câu kế hoạch (khóa Serper mới) — 3 lỗi còn lại, Owner duyệt "sửa 2 và 3, 1 dò nguyên nhân rồi sửa":**
    - **5bf0cfa — ô bữa ăn chung:** `mealSlot` biến bữa ăn thành "Bữa ăn gần chỗ ở / Chọn một quán gần chỗ ở khi tới nơi…" khi quán đã dùng (mô hình nêu hai lần) hoặc mô hình không ghi tên, và bỏ lời mô hình. Trên một bộ não nay giữ tên và lời mô hình (bỏ mệnh đề có con số), không giữ dữ liệu địa điểm (không địa chỉ, place_id, link, ảnh, giá); không có cả tên lẫn lời thì bỏ ô. Luật ăn chay và các route khác giữ nguyên.
    - **547e1f7 — dòng "kiểm tra giờ mở cửa và giá vé":** ghi **một lần** cho cả kế hoạch dưới dạng mẹo (`CHECK_HOURS_AND_FEES`), không lặp trên từng điểm; không thêm nếu mô hình đã viết hoặc không có con số nào bị bỏ. Đổi một assertion của `planSightOneBrain.test.ts` (dòng này nằm ở mô tả điểm → nay nằm ở mẹo của kế hoạch); các assertion giá/link/place_id/không chữ số/không nhãn giữ nguyên.
    - **Singapore/Bali trả 0 dòng — nguyên nhân gốc:** `guardPlaceGeography` (route) bỏ MỌI dòng có địa chỉ ngoài Việt Nam (luật R13 29/09 cho sản phẩm chỉ Việt Nam; log `place_geography … dropped 10, reasons foreign×10`). Tìm kiếm đã đặt tâm đúng ở tọa độ chính nơi đó (02/11) nên dòng trả về đúng nhưng bị loại hết. Sửa: tìm kiếm có tâm ở nước ngoài ghi `centre_abroad` vào kết quả (`food.ts`); guard giữ dòng trong 80 km quanh tâm đó (dòng xa, ví dụ cùng tên ở châu lục khác, vẫn bị bỏ `too_far`). Tìm kiếm về Việt Nam vẫn bỏ dòng ngoài Việt Nam như cũ.
  - **`think_deeper` nêu thêm hai trường hợp (sau đợt đo 10 câu kế hoạch):** lời khuyên người dùng sẽ làm theo, và thông tin mới/hiện tại (giá, tin, sự kiện) hoặc điều mô hình không chắc. Vẫn là nguyên tắc chung, không địa danh/sản phẩm/ngôn ngữ; giữ giới hạn cũ (không gọi cho chào hỏi, câu nối tiếp ngắn, một sự kiện đơn).
  - **Sao chép câu hỏi đã gửi:** bong bóng câu hỏi của người dùng không có thanh thao tác như câu trả lời nên không có nút sao chép. Thêm `UserMessageCopy` dưới mỗi câu hỏi, sao chép đúng nguyên văn người dùng gõ (không bỏ dấu markdown, không bỏ link). Kèm `ai-hay.vn` và trang app AIHAY trên kho ứng dụng vào danh sách cấm nguồn (`443719e`).
  - **Thẻ kế hoạch giữ lời mô hình quanh con số (`planItemGuard.ts`, `withoutFigureClauses`):** điểm tham quan không có trong dữ liệu công cụ vẫn bị bỏ giá/link/địa chỉ; trước đây chỉ một chữ số trong mô tả là cả mô tả bị thay bằng "Giờ mở cửa và giá vé cần kiểm tra lại…" (UAT: Mỹ Khê, Chùa Linh Ứng, Cầu Rồng đọc giống hệt nhau). Trên một bộ não nay chỉ các mệnh đề có con số bị bỏ, phần còn lại giữ nguyên rồi thêm đúng dòng kiểm tra đó; mô tả toàn con số vẫn thành dòng kiểm tra đơn.
