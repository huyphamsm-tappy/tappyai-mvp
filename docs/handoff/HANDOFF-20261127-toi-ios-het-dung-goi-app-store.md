# BÀN GIAO 27–28/11/2026 — iOS: lỗi đứng app, gói App Store, 7 lỗi UAT (BẢN ĐẦY ĐỦ)

Người đọc: phiên Claude mới. **Đọc hết file này trước khi làm gì.** Anh Huy là chủ sản phẩm, không phải dân lập trình. Nói tiếng Việt, ngắn, thật, tách nhãn **ĐÃ KIỂM / SUY LUẬN / CHƯA KIỂM**. Kỹ thuật là việc của Claude, tự quyết; chỉ hỏi quyền, tiền, gu sản phẩm, riêng tư, production. Mọi chữ anh đọc (chat, nút, bước kế hoạch) viết tiếng Việt.

Prompt dán vào phiên mới ở **mục 9**.

---

## 0. Luật (đã bị phạt vì quên, đừng quên)

1. **Không push khi một lần TestFlight đang chạy.** `ios.yml` có `concurrency … cancel-in-progress: true` cùng nhánh: một push chạm `ios/**` làm huỷ lần chạy đang dở (mất 2 lần TestFlight, build 289 và lần f4ff3bd). Bước "Archive + upload" của `ios.yml` **không chờ test**: bấm `workflow_dispatch` là tải bản lên TestFlight dù test hỏng → chỉ bấm khi CI (push) của đúng commit đã xanh. Đẩy tệp chỉ trong `docs/` thì không kích `ios.yml` (đã thử, không huỷ).
2. **Sửa mã CHỈ bằng Edit/Write** (đọc tệp bằng Read trước khi Edit, nếu không Edit báo lỗi và commit sau đó thiếu thay đổi). **Cấm heredoc / `python -` / `sed -i` để viết mã** (hệ thống chặn). Tệp LF.
3. Không đụng production, khoá, ví/tiền. **Không nhập mật khẩu hộ anh** (phiên App Store Connect hết hạn, anh phải tự đăng nhập). **Không gửi duyệt App Store khi anh chưa nói "gửi".**
4. Không đổi tag cũ, không `reset --hard`, không `push --force`, không xoá nhánh khi chưa hỏi.
5. Test đỏ → sửa mã hoặc ghi lý do duyệt (ví dụ danh sách link-out), **không làm yếu assertion**.
6. Chrome điều khiển được (nhóm tab `mcp__claude-in-chrome__*`) nhưng khi **màn hình PC khoá/tắt** thì chụp ảnh timeout ("renderer unresponsive"): không bấm mù vào trang chỉnh sửa App Store Connect.

---

## 1. Nhánh, bản dựng, CI (ĐÃ KIỂM lúc 28/11 03:33 UTC)

- Repo iOS: `D:\TappyAI-wt\wt-ios-messenger`, nhánh **`ios/layout-buoc5-20261126`** (HEAD `a449f5a`, đã push). Chứa đợt layout bước 1–5 + mọi sửa 27/11. **Chưa merge** vào `ios/consolidated-20261122` (đầu `b1af3e2`); chỉ merge khi anh UAT xong và đồng ý.
- GitHub: `huyphamsm-tappy/tappyai-mvp`. Số build = `github.run_number` của `ios.yml`.
- **Build 306** (commit `1bcebf0`) đã lên TestFlight: danh sách chat dựng sẵn + cửa sổ 60 tin, màn Gói 5 gói, thông tin nhanh thực thể, thẻ lựa chọn, biểu ngữ chủ đề, ảnh Wikipedia hồ sơ, "Hỏi cụ thể hơn".
- **Build 310** (run `46005299277`, commit `6f35ff3` = `4245cfc` + tệp bàn giao): job "Archive + upload to TestFlight" **thành công** → bản đã lên TestFlight (Apple có thể cần thêm vài phút xử lý). Job "Build + TappyAITests" của lần chạy này bị **cancelled** (hết thời gian của bước chụp ảnh giao diện), nhưng test đơn vị của đúng mã đó **xanh** ở build 309 (run `46003527896`, commit `4245cfc`). Build 310 có thêm 7 lỗi UAT mục 4.
- Phiên mới: kiểm `gh run list --repo huyphamsm-tappy/tappyai-mvp --workflow ios.yml --limit 5 --json number,databaseId,event,status,conclusion,headSha` trước khi làm gì push.
- Mọi lệnh hay dùng:
  - Kết quả một run: `gh run view <id> --repo huyphamsm-tappy/tappyai-mvp --json status,conclusion,jobs --jq '.conclusion,(.jobs[]|"\(.name): \(.status) \(.conclusion)")'`
  - Log lỗi: `gh run view <id> --repo … --log > <scratchpad>\ci.txt`, rồi tìm `error:` và `Test Case .* failed` (lọc nhiễu Firebase).
  - Bấm TestFlight: `gh workflow run ios.yml --repo huyphamsm-tappy/tappyai-mvp --ref ios/layout-buoc5-20261126` (chỉ khi CI push xanh và không có run TestFlight đang chạy).
  - Chờ nền: vòng `until [ "$(gh run view <id> … --json status --jq .status)" = "completed" ]; do sleep 30; done` chạy `run_in_background`.

---

## 2. Lỗi đứng app — toàn bộ câu chuyện

**Triệu chứng (anh báo nhiều lần):** hỏi vài câu rồi màn Chat đứng, phải thoát app vào lại; câu thứ hai hay đứng nhất.

**Bằng chứng (ĐÃ KIỂM):**
- Log chẩn đoán trên iPhone: stream máy chủ kết thúc bình thường (done=true), nhưng `main thread stalled` và không bao giờ "answered again". Ngăn xếp luồng chính trên iPhone nằm trong SwiftUI đo chữ (`Text.sizeThatFits` qua `LayoutProxy.explicitAlignment`), lần khác trong `LazyStack.measureEstimates`.
- **Workflow `iOS freeze hunt` tái hiện được trên máy giả lập GitHub:** với `LazyVStack` luồng vẽ kẹt >60 giây (câu chữ thường, bài có cấu trúc, 14 thẻ quán, không cần thẻ quán); với `VStack` dựng sẵn thì không kẹt. Hai lần đầu "kẹt" trùng lúc bài thử truy vấn giao diện, nên một phần có thể là cách đo.
- Trên máy giả lập GitHub phông chữ tải chậm: đợt chậm 8–12 giây rồi tự hồi (ngăn xếp `libFontParser`); đó là nhiễu của môi trường, không phải lỗi app.

**Đã sửa (SUY LUẬN là nguyên nhân chính; CHƯA KIỂM trên iPhone):**
- `ios/TappyAI/Features/Chat/UI/ChatMessageList.swift`:
  - `ChatRowsContainer` dựng sẵn (`VStack`), không dùng `LazyVStack` trừ khi launch arg `-uitest-lazy-list`; `ChatListMode.window = 60` tin gần nhất, nút **"Xem tin cũ hơn"** (`chat-show-earlier`) thêm 60; chỉ số tin giữ đúng (`Array(messages.enumerated()).suffix(shownRows)`).
  - `selectable()` luôn `.textSelection(.disabled)` (không bật chọn chữ lúc câu kết thúc); `MarkdownBlocksView` bỏ `.textSelection(.enabled)` ở đoạn/gạch đầu dòng/số (còn ở khối code).
  - Cuộn xuống cuối khi thêm tin: không hiệu ứng, trong `DispatchQueue.main.async`. Mũi tên lên/xuống (`jumpButtons`) giữ nguyên (anh yêu cầu).
  - `ChatFlowLayout` (chip) đo mỗi chip một lần (`Cache`).
- Công cụ chẩn đoán: màn Nâng cấp → kéo cuối → **Copy Diagnostics**. Tệp: `Core/Logging/DiagnosticSnapshot.swift` (120 dòng, lưu qua lần mở app), `MainThreadStallWatch.swift` (canh luồng chính, **chạy thêm 90 giây sau khi nhận xong**, ghi `main thread stalled` + `stall stack`), `StallStackSampler.swift` (SIGUSR2, đọc ngăn xếp luồng chính từ luồng khác; ảnh `TappyAI` ở bản release, `TappyAI.debug.dylib` ở bản debug), dòng `chat list: reply drawn index=… chars=…`, `chat list: streaming=…`.
- Bài thử tìm lỗi: `ios/TappyAIUITests/ChatFreezeUITests.swift` (3 bài `testDefaultPlain/Article/Full`, mỗi bài 2 lượt hỏi), máy chủ giả `ios/scripts/ui_stub_server.py` chế độ `chat: stream` (`shape`: full/places3/none/noactions, `kind`: plain/article/alt), workflow `.github/workflows/ios-freeze-hunt.yml`. **Chạy:** đẩy một commit có `[hunt]` trong lời nhắn (workflow_dispatch không gọi được vì tệp chưa ở nhánh mặc định); mỗi bài một `xcodebuild`, nhật ký ứng dụng được in và tải lên artifact `ios-freeze-hunt`. Timeout bước = 40 phút (6 bài đã vượt, hiện 3 bài). Bài hay hỏng vặt vì "không có tiêu điểm bàn phím" và vì swipe >20s do font chậm: đọc nhật ký ứng dụng (`diag-<test>.log`) rồi mới kết luận.

**Việc tiếp theo cho lỗi đứng:** chờ anh báo kết quả build 306/310. Nếu còn đứng: lấy Copy Diagnostics, đọc `stall stack` (hàm của app nằm ở các dòng `TappyAI+0x…`/tên Swift), sửa đúng chỗ, chạy hunt (`[hunt]`), rồi mới TestFlight. Nếu không đứng nữa: ghi nhận, đóng việc.

---

## 3. Gói App Store (IAP)

App Store Connect app id **`6816654420`** (TappyAI, iOS 1.0.0 Ready for Distribution), nhóm đăng ký **"TappyAI Subscriptions" (id 22502849)**. Gói cũ `com.tappyai.ios.pro.monthly` (Approved, đang bán) **không đụng**.

| Gói | Product ID | Loại | Apple ID (id trang) | Giá VND đặt | Giá web |
|---|---|---|---|---|---|
| MoMo 7 ngày | `tappy_pip_1w` | Non-Renewing | 6839901499 (`/non-renewing-subscriptions/…`) | 25.000 | 25.000 |
| Coco 1 tháng | `tappy_momo_1m` | Auto-Renewable 1 tháng | 6839901326 (`/subscriptions/…`) | 225.000 | 225.000 |
| Coco 3 tháng | `tappy_coco_3m` | Auto-Renewable 3 tháng | 6839901453 | 599.000 | 607.500 |
| Tappy 1 tháng | `tappy_promax_1m` | Auto-Renewable 1 tháng | 6839901162 | 299.000 | 300.000 |
| Tappy 3 tháng | `tappy_promax_3m` | Auto-Renewable 3 tháng | 6839901487 | 799.000 | 810.000 |

- URL trang: `https://appstoreconnect.apple.com/apps/6816654420/distribution/subscriptions/<appleId>` (gói tự gia hạn), `…/non-renewing-subscriptions/<appleId>` (Pip), nhóm: `…/subscription-groups/22502849`.
- Cả 5 đang **Prepare for Submission**, bán 175 quốc gia, giá đặt theo cơ sở Việt Nam (VND); nước khác Apple tự quy đổi.
- Tên theo web: stored id `pip` = **MoMo** 7 ngày; `momo`/`coco` = **Coco**; `promax*` = **Tappy**; "Pip" là gói Free. Giá web nằm ở `wt-integration/src/lib/plans/subscriptionPrices.json` (USD 1/9/24,3/12/32,4; VND 25.000/225.000/607.500/300.000/810.000).
- **Tên + mô tả hiển thị đã điền:** MoMo 7 ngày (Việt "MoMo 7 ngày — Gói dùng thử 7 ngày, mua một lần, không tự gia hạn"; Anh "MoMo 7 days — 7-day trial pack, one-time purchase, no renewal"), Coco 1 tháng (chỉ Việt: "Coco 1 tháng — Gói 1 tháng, tự gia hạn hàng tháng").
- **Chưa điền:** Coco 1 tháng (Anh: "Coco 1 month — 1 month, renews monthly"), Coco 3 tháng, Tappy 1 tháng, Tappy 3 tháng (Việt + Anh; mẫu: "Coco 3 tháng — Gói 3 tháng, tự gia hạn mỗi 3 tháng", "Tappy 1 tháng — Gói 1 tháng, tự gia hạn hàng tháng"…). Giới hạn: tên ≤35, mô tả ≤55 ký tự.
- **Chưa làm:** ảnh chụp màn hình duyệt (Review Information) cho từng gói; Add for Review. Gói không tự gia hạn đầu tiên phải gửi duyệt **cùng một phiên bản app mới** (tạo phiên bản 1.1.0, chọn build đã có gói, rồi thêm 5 gói vào bài nộp). Việc này gửi công khai cho Apple → chỉ làm khi anh nói "gửi", sau khi anh xác nhận build nào.
- Mẹo thao tác Chrome ASC: hộp chọn ngôn ngữ là `select` gốc: **click vào rồi gõ tên ngôn ngữ ("Vietnamese", "English (U.S.)") + Enter** (form_input không cập nhật trạng thái React); các ô nhập lấy `ref` bằng `find` (toạ độ đổi theo cỡ cửa sổ); chọn giá: ô Price có thanh tìm, mức "See Additional Prices" chỉ hiện sau khi tìm; mức gần nhất nằm trong danh sách chuẩn (299.000, 599.000, 799.000…). Tab group có thể đổi sau khi Chrome khởi động lại (gọi `tabs_context_mcp` lấy tabId mới).
- **Phiên Chrome ASC đã hết hạn (đang ở trang login)**: anh phải đăng nhập lại.
- Web đã merge: PR #349 (xác nhận Pip kiểu không tự gia hạn: ngày hết hạn = ngày mua + 7, một lần/tài khoản, cùng giao dịch gửi lại không cộng thêm) và #351 (`/api/subscription` trả `pipUsed`; khách = true). Anh nói đã deploy production (Claude chưa tự kiểm). App ẩn gói 7 ngày khi máy chủ không gửi `pipUsed=false` (`SubscriptionStatusResponse.offersPipPack`). Máy chủ chỉ xử lý **Pip** là không tự gia hạn; 4 gói còn lại đi đường tự gia hạn cũ (`transactionPolicy.ts`).
- Mã iOS: `Core/Payments/ProductCatalog.swift` (5 gói `salePlans`, tên MoMo/Coco/Tappy), `StoreKitProvider.availableProducts()/purchase(productId:)`, `Features/Profile/UI/SubscriptionView.swift` (hàng gói, Pip "mua một lần, không tự gia hạn"). Test `SubscriptionPriceTests`. Test `ExternalPurchaseGuardTests` cấm mọi tham chiếu `/api/payments`, `/api/iap` trong app trừ danh sách được duyệt: **không gọi `/api/payments/me` từ app** (đã bị CI chặn một lần).

---

## 4. 7 lỗi anh báo tối 27/11 (có PDF kèm)

| # | Lỗi | Trạng thái |
|---|---|---|
| 1 | Hồ sơ chỉ xem được từng clip | **Đã sửa:** `MyPostsView.openCollection` mở tab Đã thích/Đã lưu/Đã chia sẻ như một dãy clip (tải tối đa 20 clip quanh clip bấm bằng `ReviewsService.fetchReview`, mở qua `ClipSeedStore`). **Chưa làm:** Yêu thích ở `Features/Discovery/UI/FavoritesView.swift` (vẫn mở `reviewDetail` từng clip). |
| 2 | Liên kết đối tác chỉ là chữ xanh dài | **Đã sửa:** `Features/Chat/Model/PartnerLinks.swift` tách 2 dòng "🔗 Liên kết đối tác:" / "📎 Tham khảo thêm:" (web `systemLinkLines`) khỏi chữ; `UI/PartnerLinkTiles.swift` vẽ ô (icon xe/giường/giỏ), thứ tự **Vexere → Agoda → Lazada → khác**, "Tham khảo thêm" dạng chip; gắn ở `AssistantBubble` (tham số `partnerLinks`, `moreLinks`, chỉ hiện khi câu xong). Test `PartnerLinksTests`. Đã duyệt 3.1.1 trong `ExternalPurchaseGuardTests`. |
| 3 | PDF kế hoạch không ảnh, bố cục xấu | **Đã sửa:** `Model/TripPdfRenderer.swift` (A4 thiết kế: dải tiêu đề tối, ảnh 58pt cạnh từng điểm dừng có ảnh, chỗ ở, món ăn, bảng chi phí + tổng, mẹo, "TappyAI · n / tổng"), `PlanPdf.dataWithPictures` tải ảnh trước (tối đa 24, 8 giây, ≤3 MB, thu nhỏ). **CHƯA xem PDF bằng mắt trên máy.** PDF báo cáo nghiên cứu sâu (`writeReportPdf`) vẫn chữ thuần, chưa ảnh. File PDF anh gửi (Quy Nhơn 5 ngày) đã đọc: chỉ chữ gạch đầu dòng. |
| 4 | Nguồn hiện cả danh sách | **Đã sửa:** `ResearchCardView` chỉ hiện "Nguồn · N" (khoá `chat.sources.title`), bấm xổ danh sách, nhãn `chat.research.sources` nằm trong danh sách (test `ResearchCardModelTests` đòi khoá này trong tệp). |
| 5 | Toyota: không ảnh/nguồn, 2 thẻ Shopee lạc đề (66.290đ, 494k) | **Một nửa:** `ShoppingDecisionView` lọc thẻ không có `config`, không `specs`, không `image` (thẻ chỉ có người bán + giá). **Phần thiếu ảnh/nguồn là dữ liệu máy chủ → phiên web.** |
| 6 | iPhone Duo: ảnh sai, không link mua | **Chưa sửa ở app** (ảnh là markdown do mô hình nhúng; link Lazada do máy chủ gắn) → phiên web: lọc ảnh theo sản phẩm, gắn link Lazada, ưu tiên Lazada cho mua sắm. |
| 7 | Đưa gói subscription lên App Store | **Chưa làm** (xem mục 3; chờ anh đăng nhập ASC và nói "gửi"). |

**Nội dung nhờ phiên web (anh dán):** (a) câu hỏi kiểu mua xe/điện thoại: ảnh nhúng lệch sản phẩm (ví dụ "iPhone Duo" ra ốp lưng) và không có link Lazada/chỗ mua; (b) câu Toyota 7 chỗ: không ảnh, không nguồn mô tả, và khối `[TAPPY_SHOPPING]` chứa 2 thẻ Shopee không tên/không cấu hình (66.290đ, 494k) không liên quan; (c) luật anh: vé xe/tàu ưu tiên Vexere, khách sạn Agoda, mua sắm Lazada (web `systemLinkLines` đã xếp partner trước).

---

## 5. Danh sách việc anh Huy làm (sáng 28/11)

1. **Đăng nhập lại App Store Connect trong Chrome**; để màn hình PC sáng.
2. **Cập nhật TestFlight (build 310) và thử**, báo kết quả: hỏi nhiều câu liền (có câu thẻ quán, câu dài); kế hoạch du lịch → tải PDF (ảnh, bố cục); câu có "Liên kết đối tác" (ô đối tác, thứ tự); nghiên cứu sâu ("Nguồn · N"); Hồ sơ → Đã thích → vuốt qua nhiều clip; màn Gói (5 gói); "Xem tin cũ hơn" nếu hội thoại dài. Nếu còn đứng: Copy Diagnostics ngay, dán cho Claude.
3. **Nói "gửi"** nếu muốn Claude điền nốt tên/mô tả, chụp ảnh duyệt và gửi duyệt 5 gói; chọn build.
4. **Gửi phiên web** nội dung mục 4 (lỗi 5, 6).
5. **Cho phép merge** nhánh layout vào `ios/consolidated-20261122` sau khi UAT xong.

---

## 6. Việc Claude làm tiếp (theo thứ tự)

1. Kiểm `gh run list …` (build 310 đã lên chưa, có run nào đang chạy không). Đọc kết quả UAT của anh.
2. Nếu anh báo còn đứng → mục 2 "Việc tiếp theo".
3. Nếu anh đã đăng nhập ASC và nói "gửi" → mục 3 (điền 4 gói + EN còn thiếu, ảnh duyệt cho 5 gói, tạo phiên bản/ chọn build, Add for Review). Không tự gửi khi anh chưa nói.
4. Sửa nốt: `FavoritesView` mở dãy clip; xem PDF kế hoạch trên máy thật rồi chỉnh bố cục theo ý anh; thêm ảnh/bố cục cho PDF nghiên cứu sâu (nếu anh muốn).
5. Mục cũ còn mở: bản dịch EN đầy đủ cho vài chữ cố định (chữ Việt viết thẳng trong `PartnerLinkTiles`, `SubscriptionView` periodLabel, `MediaBlocksView`), đo hiệu năng hội thoại rất dài (cửa sổ 60 là con số em chọn), Dynamic Type XXL / sáng-tối, đối chiếu 4 câu mẫu (Hà Giang, Elon, so sánh, kinh tế).
6. Khi anh UAT xong: merge nhánh vào `ios/consolidated-20261122` (hỏi anh), tạo tag mới (không đổi tag cũ).

---

## 7. Tệp chính đã đụng 27/11 (để tìm nhanh)

`Features/Chat/UI/ChatMessageList.swift` (container, cửa sổ 60, partner tiles, chọn chữ), `MarkdownBlocksView.swift`, `MediaBlocksView.swift` (thông tin nhanh thực thể `/api/entity-facts`, thẻ `options`, biểu ngữ `topic`), `PresentationBlocksView.swift` (ảnh Wikipedia `/api/entity-profile` + ô chữ cái), `ResearchCardView.swift` (nguồn gập, "Hỏi cụ thể hơn" qua `Notification.Name.chatFocusComposer`), `ReportPage.swift` (chữ "Mở đầu" qua `chat.report.intro`), `TripAnswerView.swift`/`PlanCardView.swift` (PDF mới), `Model/PartnerLinks.swift`, `Model/TripPdfRenderer.swift`, `Model/PlanPdf.swift`, `Model/EntityFacts.swift`, `Model/MediaBlock.swift` (options, topic), `Model/ShoppingDecisionView.swift`, `Reviews/UI/MyPostsView.swift`, `Core/Payments/*`, `Core/Logging/*`, `Resources/Localizable.xcstrings` (khoá mới `chat.research.refine`, `chat.report.intro`). Test mới: `EntityFactsAndOptionsTests`, `PartnerLinksTests`, `PlanPdfTests` (phần thiết kế), `SubscriptionPriceTests` (gói), `ChatFreezeUITests`.

## 8. Bẫy đã gặp

- `ChatRowsContainer.eagerRows` đặt static trong kiểu generic → "generic parameter could not be inferred"; đã chuyển ra `ChatListMode`.
- Test `testLinkOutsLiveOnlyInReviewedFiles` đòi mọi tệp mở link (`Link(destination`, `UIApplication.shared.open`) phải nằm trong danh sách duyệt 3.1.1 ở `ExternalPurchaseGuardTests` (kèm lý do).
- `__pycache__/ui_stub_server.cpython-312.pyc` được git theo dõi: sau khi `py_compile` phải `git checkout -- ios/scripts/__pycache__`.
- Build số = run number; dispatch trong khi push đang chạy → số build nhảy.
- Nguồn thật của "đứng" khác nhau giữa iPhone (đo chữ/bố cục) và máy giả lập (LazyStack): đừng kết luận chỉ từ một bên.
- Điểm mạnh chưa tận dụng: bài thử `iOS freeze hunt` chạy ~15–30 phút/lần, tốn phút macOS; chỉ chạy khi cần.

---

## 9. Prompt dán vào phiên mới

> Anh là Huy, chủ sản phẩm TappyAI (không phải dân lập trình). Nói tiếng Việt, ngắn, thật, tách nhãn ĐÃ KIỂM / SUY LUẬN / CHƯA KIỂM. Kỹ thuật là việc của em, tự quyết; chỉ hỏi quyền, tiền, gu sản phẩm, riêng tư, production.
>
> **Việc:** tiếp tục iOS sau tối 27/11. Đọc trước, cả file: `D:\TappyAI-wt\wt-ios-messenger\docs\handoff\HANDOFF-20261127-toi-ios-het-dung-goi-app-store.md` (nhánh `ios/layout-buoc5-20261126`, HEAD a449f5a; build 310 đã tải lên TestFlight).
>
> **Làm theo thứ tự:** (1) Chạy `gh run list --repo huyphamsm-tappy/tappyai-mvp --workflow ios.yml --limit 5` xem trạng thái build 310 và có run nào đang chạy không (đừng push khi TestFlight đang chạy). (2) Hỏi anh kết quả thử TestFlight: app còn đứng không? Nếu còn: xin Copy Diagnostics, đọc `stall stack`, sửa, chạy `iOS freeze hunt` (commit có `[hunt]`), rồi TestFlight một lần. (3) Nếu anh đã đăng nhập App Store Connect trong Chrome và nói "gửi": điền nốt tên/mô tả 4 gói còn thiếu + bản tiếng Anh Coco 1 tháng, ảnh duyệt cho 5 gói, tạo phiên bản và Add for Review — chỉ khi anh nói "gửi". (4) Làm nốt: Yêu thích mở dãy clip, xem PDF kế hoạch mới và chỉnh theo ý anh, PDF nghiên cứu sâu có ảnh nếu anh muốn. (5) Lỗi 5, 6 (Toyota/iPhone ảnh sai, thiếu link Lazada) là việc phiên web: chỉ nhắc anh gửi nội dung ở mục 4 của bàn giao.
>
> **Luật:** không push khi TestFlight đang chạy (ios.yml huỷ lần chạy cũ, đã mất 2 lần); sửa mã chỉ bằng Edit/Write (cấm heredoc/`python -`), đọc tệp trước khi Edit; không đụng production; không nhập mật khẩu hộ anh; không gửi duyệt App Store khi anh chưa nói "gửi"; không đổi tag cũ, không reset --hard, không push --force; không làm yếu test, chỉ ghi lý do duyệt; Chrome không chụp được khi màn hình PC khoá — không bấm mù vào App Store Connect.
