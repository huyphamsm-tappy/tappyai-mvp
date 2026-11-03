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
  - tối đa 8000 token đầu ra cho mỗi bước của mô hình (03/11: đổi từ 4000, xem mục 4).

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
- **01/11, Owner: "Rà lại kiến trúc của web xem còn lỗi ko thì fix"** — 2 reviewer độc lập, chỉ đọc (phía server; phía giao diện và xuất tệp). Sửa các lỗi họ tìm ra, mỗi việc một commit, test đỏ trước:
  - **56558a6 — dán/kéo thả:** dán ô Excel (ảnh + chữ) không còn bị nuốt thành tệp đính kèm (`pastedAttachment`: chỉ đính kèm khi clipboard không có chữ và tệp đọc được); PDF quá 3 MB không che ảnh tốt thả cùng (`firstAttachable`); gợi ý thả đếm dragenter/dragleave (Safari không có relatedTarget nên nhấp nháy); chat đang trả lời thì không nhận tệp thả (vẫn chặn trình duyệt mở tệp).
  - **589e6cf — chặn nguồn AI đọc đủ dạng địa chỉ:** một object đơn (answerBox, knowledgeGraph, kết quả đọc trang) cũng được kiểm; thêm khóa link (href, sourceUrl, pageUrl, canonical, displayedLink, site, uri); địa chỉ không scheme/`//host`/dạng hiển thị "host › path" được hiểu đúng; bóc lớp bọc google.com/url?q=, r.jina.ai/, web.archive.org/web/…/, webcache; thêm tên miền AIHAY khác (.ai/.org/.app, ai-hay.com), AI Studio, duck.ai, đường dẫn /chat của Bing và Hugging Face; escape % hỏng không còn tắt chặn trang kho ứng dụng. Chỉ các lớp bọc đã biết mới bị bóc (URL trong query của site khác vẫn không có nghĩa).
  - **aa559b1 — hoàn lượt Nghiên cứu sâu:** khách rời trang SAU khi báo cáo đã bắt đầu phát chữ thì không hoàn lượt (trước đó đọc báo cáo rồi ngắt trước phần nguồn để lấy lại hạn mức). Rời trong lúc nghiên cứu (chưa có chữ nào) vẫn hoàn. Giới hạn của Owner duyệt 02/11 ("Có sửa luôn đi em") được thu hẹp theo hướng chống lạm dụng.
  - **561288d — nút mua:** người bán tên "Shop"/"Mall" không còn khớp "shopee" (chiều ngược lại cần tên ≥ 5 ký tự).
  - **ec5ccb9 — mệnh đề con số:** chỉ giờ giấc và tiền (17:30, 7h30, 9am, 20.000đ, 50k, 2 triệu, $30, €22, ¥500) bị bỏ; thời lượng ("2 tiếng") và chữ số trong tên ("Cầu Rồng 3D") giữ nguyên; mẹo "kiểm tra giờ/giá" chỉ thêm khi thật sự có giờ/giá bị bỏ.
  - **Đã biết, chấp nhận, không sửa:** (a) bữa ăn trùng quán trên một bộ não giữ tên và lời mô hình nhưng không còn dữ liệu địa điểm (đổi lấy việc bỏ ô trống chung); (b) tìm địa điểm cho nơi trong nước mà Maps không tìm thấy trong nước nhưng trùng tên nơi ở nước ngoài sẽ đặt tâm ở nơi đó (rủi ro thấp); (c) dòng không có tọa độ khi tìm ở nước ngoài được giữ; (d) mẹo "kiểm tra giờ/giá" viết bằng tiếng Việt cả với kế hoạch ngôn ngữ khác; (e) test nối dây của route chỉ kiểm thứ tự chuỗi.
- **03/11, Owner: "Android … ra bugs, fix bugs nếu có" (UAT Android trên máy ảo, câu 10).** Lỗi thật của máy chủ, không phải của app: câu "lên kế hoạch Thái Lan 1 tuần cho 2 người" kết thúc bằng "Có lỗi xảy ra", không có chữ nào. Log: bước viết thẻ kế hoạch (`present_plan`) bị cắt ở trần 4000 token (`finish_reason: length`, `length_cut: true`), phần tham số JSON dài khoảng 6 500 ký tự tiếng Việt bị đứt giữa chuỗi (`AI_InvalidToolArgumentsError`, "Unterminated string"), lượt hỏi được hoàn lại. Sửa: `ONE_BRAIN_MAX_TOKENS` 4000 → 8000 (trần của một bước, không phải mục tiêu: câu trả lời ngắn không tốn thêm). **Đây là đổi một con số đã đóng băng; ghi ở đây và cập nhật 3 test canh.** Chưa xử lý: nếu vẫn bị cắt (kế hoạch dài hơn 8000 token) thì lượt vẫn lỗi; hướng cho Phase 9 là bắt lỗi này và cho mô hình viết lại gọn.

## 5. Đóng băng lần 2

Chủ sở hữu (01/11): "đóng băng kiến trúc web sau khi fix bugs nếu có". Mốc: commit gốc `ec5ccb9` (sau 2 reviewer độc lập và các sửa ở mục 4), thẻ `arch-freeze-20261102b`, nhánh sao lưu `backup/arch-freeze-20261102b`. Mục 1–3 vẫn đúng; mục này chỉ thêm các quy tắc ra đời sau lần đóng băng đầu. Test canh `architectureFreeze.test.ts` có thêm một khối cho các quy tắc này; một dòng đỏ ở đó là một thay đổi kiến trúc: cần Owner duyệt và một mục có ngày ở mục 4 trước.

1. **Nguồn:** không bao giờ đọc, liệt kê hay dẫn trang của sản phẩm AI khác (AIHAY và app, ChatGPT, Perplexity, Gemini, Claude, Copilot, Poe, Grok, DeepSeek chat, You.com, Phind, Meta AI, Character.AI, Mistral chat, Kimi, Qwen chat, duck.ai, AI Studio, Bing/Hugging Face chat). Chính sách là danh sách tên miền (`aiSourcePolicy.ts`), bọc MỌI công cụ của lượt chat ở lớp trong cùng, trước bọc vé web. Ghép dòng của Nghiên cứu sâu và bằng chứng Exa dùng cùng phép kiểm. Trang của chính một công ty AI (blog, thông cáo) vẫn là nguồn gốc.
2. **Địa điểm ở nước ngoài:** tìm kiếm đặt tâm ở tọa độ chính nơi đó (`centre_abroad`), guard địa lý giữ các dòng trong 80 km quanh tâm; tìm kiếm về Việt Nam vẫn bỏ dòng ngoài Việt Nam.
3. **Thẻ kế hoạch:** `present_plan` được mô tả bằng nguyên tắc (`PRESENT_PLAN_DESCRIPTION`, không địa danh/món/sản phẩm); `think_deeper` luôn áp dụng cho lịch trình, lịch hẹn và lời khuyên người dùng sẽ làm theo; điểm tham quan ngoài dữ liệu công cụ giữ lời mô hình (chỉ bỏ giờ và tiền); bữa ăn không có quán đã xác minh giữ tên và lời mô hình hoặc bị bỏ (không có ô chung); dòng kiểm tra giờ/giá ghi một lần cho cả kế hoạch.
4. **Hạn mức Nghiên cứu sâu:** hoàn lượt chỉ khi khách rời trước khi có chữ nào của báo cáo.

Ngoài các mục trên, phần giao diện và xuất tệp (PDF/Word dễ đọc, kéo thả/dán tệp, nút sao chép câu hỏi) hoàn tất ở mốc này.

## 6. Đóng băng lần 3

Chủ sở hữu (02/11): "đóng băng lại đi, mai anh UAT cả web lẫn Android". Mốc: tag `arch-freeze-20261102c`, nhánh sao lưu `backup/arch-freeze-20261102c`, trên commit đóng băng này. Sau đó thêm mục 4 bên dưới (năng lực `card`), nên **mốc cuối là tag `arch-freeze-20261102d`** (nhánh sao lưu `backup/arch-freeze-20261102d`). Từ mục 5 chỉ có thêm quy tắc giao diện sau (hai commit `ccefbc4`, `c14b75c`); phía máy chủ không đổi.

1. **Menu "+" của ô chat:** chỉ có **đính kèm** và **Nghiên cứu sâu**. Trả lời nhanh, Tìm web, Suy nghĩ không còn là mục menu: chế độ Tự động để mô hình tự chọn (ý Owner: người dùng cứ gõ, không biết bật chức năng). Máy chủ vẫn đọc cả năm chế độ.
2. **Menu theo gói như máy chủ (`lib/plans/tiers.ts`):** khách hoặc tài khoản không có gói đang hoạt động không thấy Nghiên cứu sâu; mọi gói trả tiền thấy. Gói đọc từ `/api/payments/me` chỉ khi cờ `SUBSCRIPTIONS_ENABLED` bật; cờ tắt, mất mạng hay trả lời lỗi nghĩa là chưa biết, và chưa biết thì giữ menu đủ (`deepResearchOffered`, `useDeepResearchOffered`). Nghiên cứu sâu đã chọn mà gói không có thì tự về Tự động.
3. **Android theo cùng quy tắc** (đóng băng riêng ở `docs/architecture/ANDROID-CHAT-FREEZE-20261102.md`). iOS theo web trên nhánh `ios/onebrain-20261102` (đợt 1 đến 8, ghi riêng).
4. **Bề mặt vẽ thẻ quyết định, mục bổ sung 02/11 (Owner: "iOS cứ tham chiếu web làm đúng theo, không cần hỏi lại"):** `rendersDecisionCard(surface, caps)` coi năng lực `card` trong `x-tappy-caps` là đủ để vẽ thẻ (cùng cách R10 của khối ASK). Danh sách `DECISION_CARD_SURFACES` giữ nguyên `web` và `android`; header `x-tappy-surface: ios` đơn thuần vẫn là không thẻ, nên bản iOS cũ đã phát hành không đổi hành vi. Bản iOS mới gửi `x-tappy-caps: card`. Test: `decisionSurface.test.ts` (hai ca mới). Chỉ có tác dụng khi deploy máy chủ.
5. **Mở khóa production theo tên, mục bổ sung 02/11 (Owner: "deploy bộ não lên web"):** các cờ `CONSULT_*` bị khóa TẮT trong môi trường production bằng mã (`consultFlags.ts`). Từ nay chủ mở **từng cờ** ở production bằng cách liệt kê **tên** trong biến `CONSULT_PRODUCTION_ALLOW` (tên cách nhau bằng dấu phẩy hoặc khoảng trắng; đúng chữ, phân biệt hoa thường, không dấu `*`, không tiền tố) **và** đặt chính cờ đó là `1`. Mặc định danh sách rỗng: deploy mã này không đổi hành vi nào; bỏ một tên khỏi biến là đóng cờ đó sau khi Redeploy (Vercel chỉ áp biến cho bản deploy mới), không cần đổi mã. Riêng `CONSULT_PARALLEL` (nhà xử lý dữ liệu mới) **không bao giờ** mở được bằng cách này, cho tới khi chủ quyết định trang quyền riêng tư và đồng ý dữ liệu AI. Khóa vẫn là mặc định ở mọi nơi mà biến không có. Test: `consultFlags.productionAllow.test.ts` (8 ca; đột biến "khớp tiền tố" bị bắt). Bộ cờ đề xuất cho production nằm ở `docs/cost/PRODUCTION-FLAGS-ONE-BRAIN.md`.

Test canh có thêm hai khối (menu và mục 6 của tài liệu này); một dòng đỏ ở đó là một thay đổi kiến trúc: cần Owner duyệt và một mục có ngày ở mục 4 trước.

## 7. Đóng băng lần 4 (03/11/2026) — để phát hành

Chủ sở hữu (03/11): "kiến trúc bộ não cho tappy hiện tại đóng băng tại đây, không cần phát triển thêm lúc này … rà lại bản web, nếu có bug thì fix, sau đó đóng băng … android và ios tham chiếu web để làm bộ não … việc phát triển tiếp sẽ làm trong phase 9, trước mắt phát hành sản phẩm đã". Mốc: tag `arch-freeze-20261103`, trên nhánh `exp/deep-research-20261102`.

1. **Nghiên cứu sâu = bản V1 có sửa Giai đoạn 1.** Kiểm tra khoảng trống nhìn thấy **mọi** bước (trước đó chỉ 31–37%); bước viết nhận các phần của câu hỏi; không còn chữ tiếng Anh dự phòng trong bảng. Ba thay đổi này **bật sẵn**, đã có bài test phát lại 24 vết (`traceReplay.test.ts`) chứng minh không mất phát hiện nào giữa các bước nghiên cứu.
2. **Mọi thứ khác của Nghiên cứu sâu mới đều TẮT mặc định và bị khóa ở production:** `DEEP_RESEARCH_V2` (vòng bù nhiều lượt + phê bình ngữ nghĩa + trần chi phí gọi mô hình), `DEEP_RESEARCH_WRITER_EFFORT` (mặc định `medium`), `DEEP_RESEARCH_WRITER_MODEL=haiku55` (mặc định Luna; sản phẩm hiện chỉ dùng Luna), và năm cờ cắt chi phí `DEEP_RESEARCH_LEAN_*`. Không cờ nào mở được ở production nếu chủ không liệt kê tên trong `CONSULT_PRODUCTION_ALLOW` (mục 6.5). Đây là **mã thử nghiệm của Phase 9**, nằm sẵn trong cây để khỏi mất, không phải thứ được phát hành.
3. **Phase 9 (phát triển tiếp, chưa làm):** Research Brain V2 (thiết kế ở `docs/handoff/deep-research-20261103/THIET-KE-RESEARCH-BRAIN-V2-20261103.md` và mục 12 năm khóa), thử người viết kiểu Claude trên bằng chứng đã đóng băng, đa mô hình, cắt chi phí. Mọi thay đổi ở đó là thay đổi kiến trúc: cần Owner duyệt và một mục có ngày ở mục 4.
4. **Android và iOS tham chiếu web** (không tự phát minh hành vi bộ não): hạng gói, năm chế độ, thẻ quyết định, nguồn bị chặn, thời gian, trần token. Hai app đóng băng riêng ở `ANDROID-CHAT-FREEZE-20261102.md` và `IOS-CHAT-FREEZE-20261102.md`.
5. **Rà soát 03/11:** `tsc` sạch, `next lint` 0 lỗi, toàn bộ test web xanh ở mốc đóng băng (1562 tệp, 25 216 ca, lần chạy cuối). Một ca chập chờn đã thấy một lần khi cả bộ chạy song song: `agentResearchWS2.route.test.ts`, "provider ERROR and fallback ERROR"; nó xanh khi chạy riêng, khi chạy cả thư mục chat và ở hai lần chạy toàn bộ sau đó. Nguyên nhân chưa tìm ra (mô hình giả bị dùng hết bước, nghi chạy chậm khi máy tải nặng); ghi ở đây để không bị coi là lỗi mới, việc tìm gốc để Phase 9.

Test canh: khối "architecture freeze, fourth" trong `architectureFreeze.test.ts` (cờ mới TẮT mặc định, người viết mặc định là Luna, mục 7 có mặt).
