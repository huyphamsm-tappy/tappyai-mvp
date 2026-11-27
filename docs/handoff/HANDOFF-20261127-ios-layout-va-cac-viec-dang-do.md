# BÀN GIAO 27/11/2026 — iOS: đợt layout (bước 1–5 xong), TestFlight UAT, và các việc đang dở

Người đọc: phiên Claude mới. **Đọc hết file này trước khi làm gì.** Người dùng là anh Huy, chủ sản phẩm, không phải dân lập trình. Nói tiếng Việt, ngắn, thật, tách nhãn **ĐÃ KIỂM / SUY LUẬN / CHƯA KIỂM**. Kỹ thuật là việc của Claude, tự quyết; chỉ hỏi quyền, tiền, gu sản phẩm, riêng tư, production.

Luật cũ vẫn giữ: không push khi một lần chạy TestFlight đang chạy; không đổi tag đã gắn (chỉ tạo tag mới, đã có lần bị chặn khi đè); không `reset --hard`, không `push --force`, không xóa nhánh khi chưa hỏi; không đụng production, khóa, App Store Connect; mọi sửa mã bằng Edit/Write (đọc tệp trước khi sửa, kiểm kết quả từng Edit); tệp LF.

---

## 0. Đọc nhanh

1. Repo: `D:\TappyAI-wt\wt-ios-messenger`. Nhánh nền: `ios/consolidated-20261122` (đầu: `b1af3e2`, chưa đổi).
2. Đợt layout đã xong code cho **bước 1–5**, mỗi bước một nhánh xếp chồng, CI xanh ở đầu từng nhánh.
3. **Đang chạy:** một lần TestFlight UAT dispatch từ `ios/layout-buoc5-20261126` (run `45936650903`, commit `ac10689`), lúc viết file này còn `in_progress`. **Kiểm kết quả trước khi làm bất cứ việc gì push.**
4. Chưa merge đợt layout vào `ios/consolidated-20261122`. Chỉ merge sau khi anh Huy UAT xong và đồng ý.
5. Việc anh Huy đang chờ em trả lời: màn Gói (chọn gói nào hiện ra) và nút "Thêm chữ" (hiện lúc nào). Xem mục 4.

---

## 1. Chuỗi nhánh layout và tag

Plan: `D:\redesign\ios mockup\05-prompt-giao-ios\MERGE-PLAN-nhanh-ios-layout.md` (có bảng theo dõi, đã cập nhật đến bước 5).

| Bước | Nhánh | Commit cuối | Tag | Ghi chú |
|---|---|---|---|---|
| 1 | `ios/layout-buoc1-20261126` | `c8bf822` | `ios-layout-step1-20261126` | CI xanh (run 45856872926) |
| 2 | `ios/layout-buoc2-20261126` | `42b68a7` | `ios-layout-step2-final-20261126` = `42b68a7`; `ios-layout-step2b-20261126` = `6f62a61`; `ios-layout-step2-20261126` vẫn ở `6c4e054` (cũ, không đổi) | CI xanh |
| 3 | `ios/layout-buoc3-20261126` | `d98c580` | `ios-layout-step3-20261126` | CI xanh (run 45927106822) |
| 4 | `ios/layout-buoc4-20261126` | `d59ab5e` | `ios-layout-step4-20261127` | CI xanh (run 45931393406) |
| 5 | `ios/layout-buoc5-20261126` | `ac10689` (cuối); `24f1b0f` (bước 5 gốc) | `ios-layout-step5-20261127` = `24f1b0f`; `ios-layout-step5b-20261127` = `ac10689`; `ios-layout-uat-20261127` = `24f1b0f` | CI xanh (run 45935317055); TestFlight đang chạy (run 45936650903) |

Lưu ý tag: tag `ios-layout-uat-20261127` ở `24f1b0f`. Nếu UAT muốn chỉ bản mới nhất (`ac10689`), tạo tag mới, **không** chuyển tag cũ.

---

## 2. Những gì đã làm trong đợt layout (theo bước)

**Bước 1 — nền tảng + kế hoạch du lịch** (`DesignSystem/Components/AnswerCard.swift`, `Features/Chat/UI/PlaceCarousel.swift`, `PlaceCardsSection.swift`, `TripAnswerView.swift`, `Model/TripAnswerModel.swift`)
- Vỏ thẻ `AnswerCard`, quy tắc ảnh (có ảnh thì hiện, đang tải thì khung xám, lỗi/không có thì ẩn), `AnswerAccordion`, `AnswerChip`.
- Carousel thẻ quán (280 pt), thẻ tổng quan chuyến đi, lịch trình theo ngày (tab dính khi cuộn, bottom sheet từng mục), accordion chỗ ở/món ăn/mẹo.

**Bước 2 — bộ vẽ văn bản + trạng thái luồng** (`Model/MarkdownPresentation.swift`, `Model/AnswerDocument.swift`, `UI/UnreadableMessageView.swift`, `UI/MarkdownBlocksView.swift`)
- Khối bảng có tiêu đề (dòng ngắn kết thúc «:» ngay trên) và chú thích (dòng ngắn ngay dưới).
- Cột đầu ghim của bảng; các hàng cao bằng nhau (đo chiều cao bằng `MarkdownRowHeightKey`).
- Đánh số tiêu đề cấp 2 khi có từ 2 mục trở lên.
- Tin không hiển thị được: «Tin nhắn này chưa hiển thị được.» + Thử lại + Sao chép.
- `AnswerDocument.repaired`: tách tiêu đề `##` dính vào cuối câu trước khi phân tích (bỏ qua code block và chữ có `#` như «C#»).
- Chữ trạng thái luồng theo bản giao (`chat.turnIncomplete`, `chat.turnInterrupted`, `chat.streamLost`), có nút «Trả lời lại» khi ngắt giữa chừng.

**Bước 3 — khối khai báo** (`Model/PresentationRules.swift`, `UI/PresentationBlocksView.swift`)
- Hồ sơ ≥3 mục mỗi mục 1 điểm → bảng 2 cột; ảnh hồ sơ 104 pt bên trái.
- Thư viện ảnh theo số ảnh: 1 rộng, 2 cạnh nhau, 3 = 1 lớn + 2 nhỏ.
- Khối so sánh và hồ sơ của model lùi khi câu trả lời có thẻ quán hoặc có bảng markdown.

**Bước 4 — nghiên cứu sâu** (`Model/ResearchReportModel.swift`, `UI/ReportPage.swift`, `UI/ResearchCardView.swift`)
- Thẻ tiến trình khi đang viết chỉ vẽ bước đã xong và đang chạy; không có %, không có ước lượng phút.
- Thất bại: dòng «Lượt hỏi này đã được hoàn lại…» và nút Thử lại (dùng `onRegenerate` của tin).
- Thẻ tóm tắt: đoạn đầu ≤1600 ký tự (bỏ tiêu đề `#`, bỏ link, bỏ `[n]`), «Nguồn: N», các nút Xem báo cáo đầy đủ / Tải PDF / Chia sẻ.
- Trang báo cáo bốn tab: Tóm tắt, Nội dung (mục lục + accordion theo `##`), Dữ liệu (biểu đồ + bảng), Nguồn.
- Lịch sử: báo cáo dài (≥8000 ký tự, ≥4 mục `##`) được nhận ra từ văn bản.

**Bước 5 — mua sắm, hoàn thiện** (`Features/Chat/Model/PresentationRules.swift`, `ChatMessageList.swift`, `Core/Networking/...`)
- Nút hành động dưới câu trả lời không lặp lại link đã có trên thẻ quán (so khóa địa chỉ bỏ query/fragment).
- Test: khung lạ (`tappy.sponsored.v1`, `tappy.turn.v1`) không vẽ gì, không che khung đứng sau.
- Thẻ mua sắm có sẵn logic "mục được chọn lên đầu" (`ShoppingDecisionCardView`).

**Test** mới cho các bước: `MarkdownPresentationTests`, `PresentationRulesTests`, `ResearchReportModelTests`, `LayoutStep2CopyTests`, `LayoutStep5Tests`, `TripAnswerModelTests`, `ClipTranscoderTests` (nếu còn), `ExploreVideoAssetIdTests`, `ChatStreamTransportTests`, `ChatParserStressTests`, `ChatDiagnosticsTests`, `ChatStreamRecoveryTests`.

---

## 3. Chưa làm / chưa kiểm — ghi rõ

- **Chưa kiểm trên máy thật:** toàn bộ đợt layout (chỉ CI biên dịch + unit test). Ảnh trước/sau: chưa có.
- **Dynamic Type XXL, sáng/tối:** chưa kiểm.
- **Đối chiếu 4 câu mẫu (Hà Giang, Elon, so sánh, kinh tế):** chưa có dữ liệu thô để đối chiếu từng ký tự.
- **AnswerDocument:** là lớp bọc trên bộ phân tích cũ (`MarkdownBlocks`), không viết bộ phân tích riêng. Quyết định ghi lại để tránh làm hỏng test đang xanh; nếu anh muốn đúng nghĩa, phải làm thành việc riêng.
- **Cột đầu ghim:** làm bằng cách đo chiều cao hàng; chưa thấy trên máy.
- **Thẻ thất bại:** chưa có "Hỏi cụ thể hơn" (chỉ có Thử lại).
- **Mục "Mở đầu"** (phần trước `##` đầu tiên của báo cáo) và tên các tab trang báo cáo: là chữ viết cứng, chưa vào bảng dịch đầy đủ.
- **Rà "không bịa":** mới rà bằng từ khóa (không có câu chào, chip mùa, số liệu, ảnh minh họa), chưa đọc hết từng chuỗi.
- **Build TestFlight:** đang chạy (run `45936650903`). Chưa có kết quả.

---

## 4. Việc đang chờ anh Huy quyết (em đã hỏi, chưa có trả lời)

1. **Màn Gói (Subscription):**
   - Web hiện 4 gói đang bán: Pip (7 ngày, 1 USD / 25.000đ), MoMo (30 ngày), Coco (90 ngày), Tappy (30 và 90 ngày). Milo và Sunny không còn bán (`SALE_PLAN_IDS` chỉ gồm 5 gói trên).
   - iOS hiện đang là "TappyAI Pro" một gói, giá cố định, không khớp web.
   - Anh đã đồng ý: khai trên App Store đúng 5 sản phẩm theo web, loại **Non-Renewing Subscription**, không dùng thử miễn phí.
   - Product ID: `tappy_pip_1w`, `tappy_momo_1m`, `tappy_coco_3m`, `tappy_promax_1m`, `tappy_promax_3m`.
   - Anh đã bảo "khai gói không tự gia hạn 1 đô cho 7 ngày". **Việc này anh tự làm trên App Store Connect**, Claude không làm được.
   - Sau khi anh khai xong: đổi `ProductCatalog` và màn Gói để gọi đúng product ID, hiện tên/hạn mức/giá App Store (không hiện giá VND, không có link mua web: quy định 3.1.1).
   - Free: không cần khai sản phẩm; app vẫn cho dùng miễn phí.
2. **Nút "Thêm chữ" (overlay clip):** hiện chỉ sau khi clip xử lý xong, trong dòng "đã tải lên" dưới video (`CreateReviewView.swift`, điều kiện `vm.videoAssetId != nil, vm.exploreAPI != nil`). Web đặt trình chỉnh chữ ngay dưới khung xem trước. Anh chưa trả lời: có nên hiện luôn từ khi chọn clip không?

Hỏi anh đúng một câu cho mỗi việc, không kèm lý do dài.

---

## 5. Các lỗi UI đã báo và trạng thái (từ UAT 26/11)

- Đứng app khi đọc stream: đã thêm watchdog 25 giây, khôi phục câu trả lời đã lưu, log chẩn đoán (lưu qua lần mở app, copy được ở nút "Copy Diagnostics" cuối màn Nâng cấp). **Nguyên nhân gốc chưa tìm ra** — chờ anh gửi nội dung chẩn đoán khi đứng lần sau.
- Clip không phát: đã sửa (lỗi lấy nhầm mã chủ bài thay vì mã clip; có test). Chưa kiểm trên máy.
- Clip tải lên lâu: đã thêm nén khi file > 50 MB (xuất 720p; chất lượng dưới 50 MB giữ nguyên). Chưa kiểm trên máy. Web chưa nén, anh đã cho phép nhưng chưa có yêu cầu gửi phiên web (em đã soạn nội dung yêu cầu trong hội thoại).
- Tiếng clip khác khi đang soạn bài: đã dừng clip Khám phá khi mở màn đăng bài.
- Thẻ quán không có ảnh: đã thu gọn khung trống. Nguyên nhân ảnh không tải chưa xác định.

---

## 6. Lệnh hay dùng

- Kiểm CI theo nhánh: `gh run list --repo huyphamsm-tappy/tappyai-mvp --workflow ios.yml --branch <nhánh> --limit 3 --json databaseId,headSha,status,conclusion,event`
- Đọc kết quả một run: `gh run view <id> --repo huyphamsm-tappy/tappyai-mvp --json conclusion,jobs --jq '.conclusion, (.jobs[] | "\(.name): \(.conclusion)")'`
- Đọc log lỗi: `gh run view <id> --repo ... --log > <scratchpad>\ci.txt` rồi tìm `error: -\[` và `Test Case .* failed`.
- Dispatch TestFlight (chỉ khi CI xanh đúng commit và không có run TestFlight đang chạy): `gh workflow run ios.yml --repo huyphamsm-tappy/tappyai-mvp --ref <nhánh>`.
- Đường dẫn hay dùng: `D:\redesign\ios mockup\05-prompt-giao-ios\` (plan và từng bước), `D:\redesign\ios mockup\04-nhan-xet-va-doi-chieu\00-DOI-CHIEU-TOAN-BO-MOCKUP.md` (GIỮ/CHỈNH/BỎ), `D:\TappyAI-review-artifacts\deploy\IOS-LAYOUT-DUNG-CHUNG-TUNG-BUOC-20261126.md` (dữ liệu web), `D:\TappyAI-wt\wt-integration\src\lib\plans\planConfig.ts` (gói và product ID).

---

## 7. Prompt dán vào phiên mới

> Anh là Huy, chủ sản phẩm TappyAI (không phải dân lập trình). Nói tiếng Việt, ngắn, thật, nhãn ĐÃ KIỂM/SUY LUẬN/CHƯA KIỂM. Kỹ thuật là việc của em, tự quyết; chỉ hỏi quyền, tiền, gu sản phẩm, riêng tư, production.
>
> **Việc: tiếp tục iOS sau đợt layout (bước 1–5 đã code xong).** Đọc trước: `D:\TappyAI-wt\wt-ios-messenger\docs\handoff\HANDOFF-20261127-ios-layout-va-cac-viec-dang-do.md` (cả file). Kiểm trước: kết quả TestFlight run `45936650903` (nhánh `ios/layout-buoc5-20261126`). Sau đó: chờ anh Huy trả lời hai câu ở mục 4 (màn Gói, nút Thêm chữ); khi có trả lời thì làm. Anh Huy sẽ tự khai sản phẩm IAP trên App Store Connect.
>
> Luật: không push khi TestFlight đang chạy; không đổi tag cũ, chỉ tạo tag mới; không reset --hard, không push --force; sửa mã bằng Edit/Write; chữ cho người dùng tiếng Việt; không đụng production.

---

Ghi chú cho phiên sau: file này nằm trong repo iOS và sẽ được commit cùng nhánh bước 5 nếu anh Huy đồng ý. Em chưa commit file này.
