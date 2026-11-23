# BÀN GIAO 23/11/2026 — iOS: bộ não theo web (đã đóng băng), bản 1.1.0 trên TestFlight, và việc tiếp theo

Người đọc: phiên Claude mới, không nhớ gì về hôm nay. **Đọc hết file này trước khi làm gì.** Người dùng là anh Huy: chủ sản phẩm, **không phải dân lập trình**, đây là dự án AI đầu tiên của anh. Nói tiếng Việt, ngắn, thật, tách nhãn **ĐÃ KIỂM / SUY LUẬN / CHƯA KIỂM**.

---

## 0. Đọc nhanh (10 dòng)

1. **Mục tiêu:** làm app iOS của TappyAI giống bản web (web là đặc tả), rồi phát hành lên App Store.
2. **Bản đang chạy cho người dùng thật (đã Apple duyệt, công khai):** build **214**, commit `4f2d698`, version 1.0.0. Tag `ios-prod-build214-4f2d698`.
3. **Nhánh làm việc iOS DUY NHẤT:** `ios/consolidated-20261122`, cây `D:\TappyAI-wt\wt-ios-messenger`. Đã gộp: build 214 + Messenger (#313) + audit bảo mật (#287) + clip Khám phá + toàn bộ phần "bộ não theo web".
4. **Bộ não iOS đã ĐÓNG BĂNG** theo web local `web-freeze-20261123`: tag `ios-brain-freeze-20261123` (commit `fce7147`). Đọc `docs/ios/IOS-BRAIN-FREEZE-20261123.md`.
5. **Bản 1.1.0 build 234 đã lên TestFlight** (commit `fce7147`, CI xanh 1.248 test). **Chưa nộp duyệt Apple**: nút "Submit for Review" là của anh Huy, Claude không bấm.
6. **Web mới (có bộ não mới) CHƯA lên production.** Production web = deploy 04/11 từ `main` `33cef8b`, không có mã bộ não mới. Nên bản iOS 234 với máy chủ production **chưa hiện** bộ não mới (viết sẵn để "sáng lên" khi web deploy).
7. **Đang làm dở:** cơ chế "bản thử trỏ vào web local" (commit `63a2545`, **mới ở máy, chưa push**). Cũng **chưa push**: `3a3fcda` (bàn giao) và `3b29cf2` (sửa 1 UI test Deal hỏng; UI test chỉ chạy khi dispatch hoặc commit có `[shots]`).
8. **Chờ anh Huy:** xem mục 7.
9. **Chưa làm:** các chức năng ngoài bộ não (nhóm ăn, lịch sử chat…), xem mục 6.
10. **Máy này không có Mac.** Swift chỉ biên dịch được trên CI (GitHub Actions macOS). Chưa có lần chạy CI xanh thì **không được ghi "PASS"**.

---

## 1. Luật làm việc (bắt buộc)

**Của dự án (`CLAUDE.md`):**
- Sửa mã **chỉ** bằng công cụ Edit/Write. Cấm heredoc, `sed -i`, `python -c`, `echo >` để viết mã. Shell chỉ để chạy, đọc, git.
- Tệp **LF** (`.gitattributes`). Không commit chuyển đổi CRLF.

**Của anh Huy (đã chốt nhiều lần, đừng hỏi lại):**
- **Kỹ thuật là việc của Claude.** Không hỏi anh chọn phương án kỹ thuật. Chỉ hỏi: quyền (tải, tạo tài khoản), tiền, gu sản phẩm, riêng tư, production. Hôm nay anh bực vì em hỏi câu khó trả lời ("cờ production bật hay tắt?"): **hãy tự quyết rồi làm, đừng hỏi những câu anh không biết trả lời.**
- **Từng bước một, báo từng bước** (anh dặn "từng bước 1"). Mỗi lát một commit.
- **Push lên GitHub phải hỏi trước, mỗi lần**, bằng một câu có/không dễ trả lời ("Push cho CI?"). Anh luôn trả lời "Push cho CI". Không push gộp nhiều lần.
- **Không đụng production** (Supabase production `fwznnobrdctuskgrvuik`; UAT là `zdaprdfgpbxyofagmc`, hai cái dễ nhầm). Không áp migration production, không deploy, không cấp gói/tạo tài khoản trên production.
- **Không đọc/in khóa, `.env`, tệp bí mật.** Không nhập khóa/mật khẩu vào ô hộ anh. Không tự tạo tài khoản.
- **Không bấm "Submit for Review" / không thao tác App Store Connect.** Không build TestFlight khi Apple đang duyệt một bản khác.
- **Cấm dùng/dẫn nguồn từ sản phẩm AI khác** (`AiSourcePolicy`, `safeWebURL` đã chặn).
- Mọi chữ anh đọc bằng **tiếng Việt** (chat, tóm tắt, nút, bước kế hoạch). Chú thích mã bằng tiếng Anh.
- **Không vá từng ca của bộ não, không chỉnh prompt để chữa một ca** (anh cấm 19/10 và 13/11). Bộ não là việc máy chủ; iOS chỉ gửi đúng và vẽ đúng.
- Chỉ làm trên ổ **D**. **Giữ nguyên 10 cây worktree One Life** (game; `D:\TappyAI-wt\wt-one-life-*`), kể cả `wt-one-life-ios` / nhánh `feat/one-life-ios-parity`.
- Dùng `git -C <đường dẫn tuyệt đối>`; công cụ shell hay reset thư mục làm việc.
- Báo cáo/ảnh gửi anh bằng `SendUserFile` với đường dẫn đầy đủ (anh xem trên điện thoại).

**Của CI/Swift (bài học hôm nay, mỗi cái từng làm CI đỏ):**
- Nhiều model có **bộ giải mã riêng với danh sách khóa cố định** (`ReviewComment`, `LivePlace`, `PlacesLiveView`…). Thêm trường mới mà quên thêm vào bộ giải mã = trường im lặng không bao giờ đọc được. **Luôn tìm `init(from:)` của kiểu đó.**
- `Int(Double)` **làm sập app** nếu số ngoài phạm vi. Mọi số từ máy chủ phải có chặn trên trước khi đổi sang `Int`.
- Trong ngữ cảnh `async`, `UIApplication.shared.open(url)` bị hiểu là bản `async` cần `await`; dùng dạng `open(_:options:completionHandler:)`.
- `TappyFont` chỉ có: largeTitle, title, headline, body, bodyEmphasis, callout, footnote, caption, button (không có `subheadline`).
- Kiểu dữ liệu: ảnh điểm dừng kế hoạch (`PlanCardModel.Stop.photoUrl`) là `URL?`, không phải `String?`.
- Test cũ ghim luật cũ (`ExternalPurchaseGuardTests` liệt kê mọi tệp mở được địa chỉ, duyệt Apple 3.1.1; `BrandRegistryTests` đếm thương hiệu…): đổi có chủ đích, ghi lý do, **không làm yếu**. Tệp mới mở link phải được duyệt rồi thêm vào danh sách kèm lý do.
- `URL(string:)` với chữ có dấu trả `nil` trên iOS cũ: dùng địa chỉ đã mã hóa trong test.

---

## 2. Bản đồ môi trường

| Thứ | Giá trị |
|---|---|
| Cây iOS | `D:\TappyAI-wt\wt-ios-messenger`, nhánh `ios/consolidated-20261122` (đang theo dõi `origin/...`, **trước 1 commit chưa push: `63a2545`**) |
| Cây web (đặc tả) | `D:\TappyAI-wt\wt-integration`, nhánh `feat/brain-r13-p1`, tag `web-freeze-20261123`. **Chỉ đọc**, không sửa, không tạo nhánh mới cho web |
| Cây `D:\Claude\Projects\TappyAI\.worktrees\g1-growth` | nhánh `feat/g1-growth`, có 13 tệp iOS **sửa dở không phải của việc này** (đồng ý chia sẻ dữ liệu với AI, quyền riêng tư). **Đừng đụng.** Dùng làm thư mục chạy lệnh `gh` |
| CI iOS | `.github/workflows/ios.yml`, tên "iOS". Chạy khi push nhánh `ios/**` (build + `TappyAITests` trên simulator, **không** ký, **không** tải lên). Job `testflight` chỉ chạy khi `workflow_dispatch` |
| Số build TestFlight | = `github.run_number` của lần chạy `workflow_dispatch` (build 234 = run #234) |
| Version | `ios/project.yml` `MARKETING_VERSION: "1.1.0"` (build 214 là 1.0.0). Apple đòi số version mới cho bản cập nhật |
| Lưu trữ nhánh cũ | `D:\TappyAI-backups\ios-old-branches-20261122\ios-local-only-branches.bundle` (4 nhánh chỉ có ở máy đã xóa: `backup/ios-windows-sprint-pre-rebase`, `wip/tappyai-ios-sprint-2026-09-17`, `ci/ios-build`, `release/v2-ios-rc`; khôi phục bằng `git bundle`) |
| Tag | `ios-prod-build214-4f2d698`, `ios-brain-freeze-20261123` (**cục bộ, chưa đẩy lên GitHub**), `ios-arch-freeze-20261102(b)` (cũ) |

**Nhánh iOS còn lại trên máy** (đã dọn 23 nhánh khác, mọi nhánh đã gộp đều xóa an toàn): `ios/consolidated-20261122` (làm việc), `feat/one-life-ios-parity` (game, giữ), `p8/scam-scenarios` (cây Scam Shield, việc khác). Trên GitHub các nhánh `ios/*` cũ **vẫn còn** (không đụng).

**Mẫu lệnh hay dùng:**
- Theo dõi CI sau push: tìm run theo `headSha`, rồi chạy nền `gh run watch <id> --exit-status --interval 30` (hệ thống tự báo khi xong, **đừng** poll). Đọc kết quả: `gh run view <id> --json status,conclusion,jobs`, log: `gh run view <id> --log` rồi `grep` `error:` và `Test Case .* failed`.
- Gửi TestFlight: `gh workflow run ios.yml --ref ios/consolidated-20261122` (**chỉ khi CI xanh đúng commit đó**, và anh đã đồng ý).

---

## 3. ĐÃ LÀM (có bằng chứng CI trừ khi ghi khác)

### 3.1 Gộp nhánh và dọn rác (22/11)
Bản 214 = `4f2d698` (đã xác minh bằng run #214: job TestFlight thành công). Các nhánh rải rác (`ios/explore-fixes-20261103`, `ios/explore-video`, `main`…) đã gộp vào `ios/consolidated-20261122`; 1 xung đột ở `CreateReviewViewModel.handlePhotoItems` đã giải (giữ cả quy tắc "xử lý ảnh ngoài luồng chính" của 214 và quy tắc "ảnh không đọc được thì không gửi nguyên bản kèm GPS" của audit bảo mật I-08). Đã xóa 23 nhánh iOS cục bộ (14 đã gộp, 5 có bản y hệt trên GitHub, 4 chỉ có ở máy đã sao lưu bằng bundle).

### 3.2 Audit rồi "bộ não theo web" (22–23/11), đóng băng
Chi tiết: `docs/ios/IOS-BRAIN-FREEZE-20261123.md`. Tóm tắt các lát (mỗi lát một commit, đều có test):
- **An toàn nội dung (Apple 1.2):** lý do báo cáo theo web (thêm "bạo lực", "thông tin sai", bỏ `sensitive`/`copyright`); nút **Bỏ chặn** trên hồ sơ người đã chặn; **chủ bài ẩn bình luận** (`POST /api/comments/{id}/hide`, đọc `hidden_at`/`hidden_by`; nút chỉ hiện khi `/api/config` có `p8.commentModeration`).
- **Thẻ khẩn cấp** (`tappy.safety.v1`, nút gọi `tel:`).
- **Khối trình bày** (`tappy.presentation.v1`: bảng so sánh, thẻ chủ thể, thư viện ảnh, câu hỏi chọn nhanh, thẻ đặt chỗ) + **ảnh chủ thể** (`tappy.subject_images.v1`, kể cả ảnh điểm dừng kế hoạch).
- **Kế hoạch du lịch:** "Chỗ ở gợi ý", "Món nên thử", nút link "Đặt chỗ", ảnh điểm dừng, **Tải PDF** (`PlanMarkdown` + bộ vẽ PDF báo cáo có sẵn; không có bìa/ảnh như web).
- **Chip "Nguồn · N"** (`AnswerSources`), **khung đọc nhanh** khi bấm link thường (`ReaderLinks` + `LinkReaderSheet` + `/api/link-preview`; máy chủ chưa có route (404) thì mở thẳng trang như cũ).
- **Giá khách sạn** (`stayOffer`), **khoảng giá quán** (`priceRangeText`, trước đây không bao giờ đọc được; `PriceBand` port `formatPriceBandText`).
- **Sửa lỗi dữ liệu:** mở chat cũ hơn 40 cuộc (phân trang `before`), lưu chat **không ghi đè tên** (`PUT` chỉ gửi `messages`), gỡ một thẻ trí nhớ **gửi đủ 5 nhóm** (máy chủ thay cả cột; bug phía web làm mất work/projects/goals đã được phiên web sửa trong `df45322`).
- **Thông báo hết lượt nghiên cứu sâu** (`x-tappy-deep-reset`), **vị trí mới cho câu "gần tôi"** (`NearMeRequest`, 10 giây, thất bại thì gửi không vị trí), **giọng điệu/độ dài thật sự gửi lên** (trước đây lưu rồi không gửi và gửi sai dạng chuỗi thay vì đối tượng).
- **Chặn sập app** vì số cực lớn từ máy chủ (`HugeNumberSafetyTests`).
- **Deal:** thêm Lazada và Vexere (sổ thương hiệu + logo từ web), chỉ hiện đối tác Accesstrade/Lazada/Agoda/Vexere (quyết định của anh 20/11 cho web), thẻ đối tác khi trang trống (`/api/deals/partners`).
- **Cài đặt:** "Xóa bộ nhớ đệm ảnh".

### 3.3 Cố ý KHÔNG làm (đã ghi trong freeze doc, kèm lý do)
Chip Wikipedia trên tên in đậm + ngăn kéo (bố cục màn rộng của web); bìa thiết kế + ảnh cho PDF kế hoạch; nhảy từ `[n]` tới dòng nguồn trong báo cáo nghiên cứu; "hỏi Tappy về clip này" (cần thêm nút ở màn clip: tính năng mới); thẻ "Chốt một lựa chọn" (cờ build `NEXT_PUBLIC_CONSULT_V3`); research canvas (iOS có thẻ nghiên cứu + biểu đồ + xuất MD/PDF/Word).

### 3.4 Phát hành 1.1.0
- `MARKETING_VERSION` 1.1.0; nháp "What's New" song ngữ + ghi chú người duyệt + checklist anh: `docs/ios/RELEASE-1.1.0-20261123.md` (chỉ ghi những gì người dùng thấy được với máy chủ HIỆN TẠI).
- CI xanh `fce7147` (run 45123065856, 1.248 test). Tag `ios-brain-freeze-20261123` gắn đúng commit đó.
- **TestFlight run #234** (`https://github.com/huyphamsm-tappy/tappyai-mvp/actions/runs/45124428669`): job "Archive + upload to TestFlight" **thành công** (job này tự chờ Apple xử lý rồi mới xanh); anh Huy xác nhận đã thấy build 234 trong TestFlight. **Kết quả cuối của cả lần chạy (đã đọc):** run tổng "cancelled" (job Build+Tests bị hủy sau khi job TestFlight đã xong; chưa rõ vì sao, **không ảnh hưởng bản đã tải lên**), nhưng trước khi bị hủy nó đã chạy **70 UI test (chụp màn hình): 69 qua, 1 hỏng**: `ScreenshotTests.testDealsProductionShaped` (chờ chữ của Shopee, mà Deal nay chỉ vẽ Accesstrade/Lazada/Agoda/Vexere). **Phát hiện quan trọng:** UI test **không chạy** khi push thường (điều kiện `github.event_name != 'push' || commit message có [shots]`), nên 1.248 test "xanh" ở các lần push trước KHÔNG gồm 70 UI test này; chỉ lần dispatch này mới chạy chúng. Cách sửa đã commit **chỉ ở máy** (`3b29cf2`, stub `ios/scripts/ui_stub_server.py` thêm Lazada/Vexere, test khẳng định Agoda+Lazada có, Shopee không; app không đổi). Muốn kiểm: push commit có `[shots]` trong thông điệp (đã có sẵn trong `3b29cf2`) rồi đọc kết quả UI test. Cảnh báo "Apple 90725" chỉ là thông báo SDK từ 4/2027, không phải lỗi.

### 3.5 Bản thử trỏ vào web local (dang dở, mục 4)

---

## 4. ĐANG LÀM DỞ

**"Bản thử" (`backend=test`) — commit `63a2545`, CHỈ Ở MÁY, CHƯA PUSH, CHƯA CHẠY.**
- Mục đích: anh muốn thấy **bộ não mới** trên iPhone trong lúc web mới chưa lên production. Bản 234 nói chuyện với production (web cũ) nên không hiện. Giải pháp: một bản TestFlight riêng trỏ vào web trên máy anh qua đường hầm Cloudflare.
- Đã sửa `.github/workflows/ios.yml`: thêm input `backend` (production mặc định | test) và `test_api_base_url`. Chế độ `test` chỉ nhận **đúng** `https://<tên>.trycloudflare.com` (đã thử địa chỉ xấu), đọc 2 bí mật **riêng** `TEST_SUPABASE_URL`/`TEST_SUPABASE_ANON_KEY` (thiếu = dừng, **không bao giờ** rơi về production), gọi thử `/api/config` của đường hầm, ghi cảnh báo "TEST BACKEND BUILD". Mặc định và các kiểm tra production giữ nguyên. YAML đã kiểm cú pháp bằng `js-yaml`; **nhánh `test` chưa từng chạy thật** (chạy là gửi một bản lên TestFlight), nên lần đầu có thể lộ lỗi nhỏ.
- Hướng dẫn cho anh: `docs/ios/TEST-BACKEND-BUILD.md`.
- **Việc của anh Huy trước khi chạy** (Claude không làm hộ): cài `cloudflared` (`winget install Cloudflare.cloudflared`; máy chưa có, tải về cần anh cho phép), chạy web local cổng 3000 cấu hình UAT, mở đường hầm (`cloudflared tunnel --url http://localhost:3000`), thêm 2 bí mật vào GitHub (giá trị Supabase **UAT**), rồi đưa địa chỉ đường hầm cho Claude.
- **Bước tiếp của phiên sau:** hỏi anh "Push cho CI?" (push workflow cũng chạy lại CI), đợi xanh; khi anh đưa địa chỉ đường hầm thì chạy `gh workflow run ios.yml --ref ios/consolidated-20261122 -f backend=test -f test_api_base_url=<địa chỉ>`; báo anh khi xong. **Bản thử không bao giờ được gắn vào phiên bản 1.1.0 hay nộp duyệt.**
- Lưu ý đã nói với anh: dự án UAT có thể chưa bật Google/Apple/Zalo → đăng nhập bằng email; địa chỉ đường hầm đổi mỗi lần mở lại và bị ghi cứng vào bản build; máy anh phải bật suốt lúc thử.

---

## 5. ĐANG CHỜ

| Chờ | Ai | Ghi chú |
|---|---|---|
| Anh thử bản 234 trên iPhone thật | Huy | **Chưa có phần nào của công việc này từng chạy trên thiết bị.** Với máy chủ production hiện tại chỉ thấy các điểm ở mục 3.4 (báo cáo + bỏ chặn, Deal, xóa cache ảnh, giọng điệu, "gần tôi", chip Nguồn, Tải PDF, gỡ thẻ trí nhớ). Thử gói Pro bằng mua thử sandbox của Apple trong TestFlight (production **chưa có** gói Promax/MoMo/Coco) |
| Anh tạo version 1.1.0 trong App Store Connect, gắn build 234, dán "What's New", **bấm Submit for Review (chọn Manual release)** | Huy | Claude không làm. Checklist trong `RELEASE-1.1.0-20261123.md` |
| Push 3 commit đang ở máy: `63a2545` (workflow bản thử), `3a3fcda` (file bàn giao này), `3b29cf2` (sửa UI test Deal, có `[shots]` nên push sẽ chạy 70 UI test) | Claude hỏi, Huy gật | Hỏi "Push cho CI?" một lần. Sau khi CI chạy xong, đọc cả kết quả UI test (xem mục 3.4). Nếu còn UI test hỏng thì sửa trước khi tin "xanh" |
| Anh trả lời: iOS có **ẩn Tỷ giá, Quét hóa đơn, Bói, Gợi ý** như web không? | Huy | Web đã ẩn 4 công cụ này (`lib/config/product.ts:121-141`), iOS vẫn hiện. Em khuyên ẩn (web là chuẩn) nhưng đó là bỏ chức năng người dùng đang có nên cần anh gật. Chưa trả lời. iOS đã ẩn đúng Dịch/Viết nội dung/Nhạc như web |
| Anh quyết có push `63a2545` (workflow bản thử) | Huy | Đã hỏi, chưa trả lời |
| Web mới deploy lên production | Huy | Việc trước deploy: `D:\TappyAI-wt\wt-integration\docs\handoff\DANH-SACH-VIEC-TRUOC-DEPLOY-20261121.md`. Khi web lên, bản iOS 234 "sáng lên" phần bộ não mới. Cần cả migration 20261111–20261208 và các cờ |
| Anh tạo sản phẩm IAP mới trong App Store Connect (gói Pip/MoMo/Coco/Tappy) + máy chủ nhận mã mới | Huy + web | Chặn việc "gói đăng ký iOS" |
| Áp migration `20261202_age_adult_declaration.sql` | Huy | Chặn nút 18+ một nút |

---

## 6. CHƯA LÀM — các chức năng ngoài bộ não (anh dặn: làm sau khi bộ não xong, "tham chiếu bản web")

Kết quả audit 23/11 (4 tác tử đọc mã web vs iOS; **CHƯA KIỂM lại bằng tay**, nhiều chỗ còn UNVERIFIED). Web là đặc tả: `D:\TappyAI-wt\wt-integration`. Quy tắc chung cho mọi màn mới: **ngủ khi máy chủ production chưa có** (production chưa có migration 20261111–20261208): nếu route trả 404/500 thì **ẩn mục đó, không hiện báo lỗi**; mọi trường mới đọc lỏng (`LenientDecoding.swift`); nhớ Apple 1.2 (nội dung người dùng: báo cáo/chặn), 5.1.1(v) (xóa tài khoản trong app), 3.1.1 (thanh toán chỉ qua IAP, **không hiện giá VND/SePay**).

### Thứ tự em đề xuất (tự bắt đầu, không cần hỏi)

**1. NHÓM ĂN (Group dining) — lệch lớn nhất.** iOS (`Features/GroupDining/*`, 775 dòng) chỉ có tạo, xem, vào nhóm, gợi ý (có AI consent), sao chép link, danh sách thành viên. Thiếu:
- **G1 (S) — SỬA TRƯỚC, sẽ vỡ ngay khi web lên:** `GroupService.fetchGroup` gọi **không `requiresAuth`**; web mới trả **401** nếu không có tài khoản. Đặt `requiresAuth: true`. Nâng model: `GroupRoom` chỉ giải mã `id,name,creatorId,status,suggestion,createdAt,members`; cần thêm lỏng `state` (`none|pending|creator|member`), `pendingRequests`, `suggestion_options`, `chosen_option`, `votes`, `bill`, `people`, `myKey`, `avatar_url` (và xử lý `creator_id` snake_case); `JoinGroupResponse` thêm `pending`; `GroupSuggestionResponse` thêm `options`.
- **G2 (S):** trạng thái `pending` = thẻ "chờ chủ nhóm duyệt" + nút **Rút lại** (`POST /api/group/{id}/leave`). Hiện iOS dùng chữ `group.joined.waiting` cục bộ (không phải trạng thái máy chủ).
- **G3 (M):** chủ nhóm duyệt từ `pendingRequests`: Duyệt/Từ chối (`POST /api/group/{id}/members {memberId, action: approve|decline|remove}`; `memberId` = **id dòng thành viên**, không phải id tài khoản), Xóa thành viên; lỗi `group_full` hiện tại chỗ.
- **G4 (S):** Rời nhóm (`POST .../leave`, lỗi `creator_cannot_leave`) và **Xóa nhóm** (`DELETE /api/group/{id}`, chỉ chủ nhóm `owner_only`), có xác nhận (Apple 5.1.1(v)).
- **G5 (M):** thẻ gợi ý 3 quán (`suggestion_options`: `{id(<=8), name, address?, rating?, why, maps_link?, photo_url?}`), giữ văn bản dự phòng.
- **G6 (M):** bỏ phiếu (`POST .../vote {optionId}` → `{ok, chosen, votes}`; 409 `already_decided` thì tải lại; đa số = hơn nửa người tham gia, tự chốt), chốt khi hòa (`POST .../choose {optionId}`, chỉ chủ nhóm, 409 `not_allowed_yet` trừ khi mọi người đã bỏ phiếu và không có đa số).
- **G7 (L):** chia bill (`PUT /api/group/{id}/bill {totalVnd, tipVnd?, items:[{name,amountVnd,forId}] (<=20), excluded:[key]}`; người PUT là **người trả tiền**, chỉ người đó sửa lại (403 `payer_only`), sửa xóa trạng thái đã trả; `PATCH {memberKey, paid}`; `DELETE`). `BillView.settlement` tính ở máy chủ (`shares`, `transfers`; kiểu chi tiết nằm ở `src/lib/group/splitBill.ts`, chưa đọc). Khóa chủ nhóm là `'leader'`, khóa thành viên là id dòng.
- G8 (S/M, tùy chọn) ảnh nhóm (`POST .../avatar`, multipart: CHƯA KIỂM). G9 (S): link mời mở đúng vào luồng chờ duyệt (xem `DeepLinkHandler`).
- Mã lỗi ổn định nằm ở trường `error`: `owner_only`, `not_a_member`, `group_full`, `already_decided`, `not_allowed_yet`, `payer_only`, `invalid_bill`, `invalid_state`, `member_not_found`, `creator_cannot_leave`, `invalid_option`, `no_members`, `too_many_requests`. Ghi theo máy chủ: mọi ghi cần tài khoản thật (khách bị từ chối). Phụ thuộc migration 20261204 (duyệt), 20261205 (phiếu), 20261206 (bill).

**2. LỊCH SỬ CHAT:** `Features/Profile/UI/ChatHistoryView.swift` (155 dòng) chỉ có danh sách phẳng trang đầu (`ProfileService.fetchConversations` không phân trang). Làm bản nhỏ nhất: phân đoạn Tất cả/Đã ghim/Đã lưu trữ, tìm theo tiêu đề (cục bộ), vuốt để ghim/lưu trữ/xóa (`PUT /api/conversations {id, pinned|archived|projectId}`, lạc quan có hoàn lại; thêm `is_pinned/is_archived/project_id` vào `ChatHistoryItem` và `UpdateConversationRequest`), cuộn vô hạn bằng `before` (đã có `ConversationPage.cursor` ở `ChatService`). Dự án (`/api/chat-projects` GET/POST/PUT/DELETE, tối đa 50, 409 `too_many_projects`), đổi tên, xuất `.md`, chọn nhiều: để sau. Migration 20261118 (ghim/lưu trữ) và 20261119 (dự án); máy chủ cũ lỗi thì ẩn thẻ Dự án / hoàn lại thay đổi. **Lưu ý:** web chỉ có ghim/lưu trữ/dự án trong bố cục máy tính (cờ `NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED`); trang lịch sử điện thoại của web chỉ là danh sách + xóa.

**3. Nhỏ, làm nhanh:**
- **Thông báo vi phạm + kháng nghị** trong app (`GET /api/moderation/decisions`, `POST .../{id}/appeal`; hiện iOS chỉ mở trang web `/profile/notices` bằng Safari; web trả 404 khi `MODERATION_ADMIN_ENABLED` tắt; Apple 1.2 ưu tiên đường kháng nghị trong app).
- **18+ một nút:** `POST /api/age-declaration {confirm18:true}` hoặc `{under18:true}`; thêm `ageDeclaration` vào bộ giải mã hồ sơ (`Chat/Model/AgeGate.swift:83-94`); dùng trong `AgeCheckView`/`AgeGatePrompts` thay vì hỏi ngày sinh. **Tối** đến khi áp migration `20261202` (route trả 503, đóng an toàn).
- **Mở link `/r/...`, `/plan/...`, `/scam-shield/...` trong app** (`DeepLinkHandler` hiện bỏ qua; Universal Link đã bật).
- Tìm bài/hashtag trong Khám phá (iOS chỉ tìm được người); danh sách "ai đã thích" (`GET /api/reviews/{id}/likes`); ảnh bìa + bộ đếm thứ tư trên hồ sơ công khai; chữ báo clip bị giữ/bị từ chối (Apple 1.2: kiểm đầu tiên).
- Thẻ "điểm đến" (`discovery_city`) và "tính cách" trong "Tappy biết gì"; tạo theo dõi giá (hiện chỉ xem/xóa); danh sách kế hoạch lấy 20 cuộc thay vì 40.
- Scam Shield: tin mới hằng tuần (`scam_knowledge_versions`, web chưa có JSON API đọc dữ liệu đã duyệt: cần thêm route web) + dòng "đã xác minh ngày…"; chia sẻ kết quả `/r/<slug>` (`POST /api/scam-shield/share`, tôn trọng `flags.publicShare`).
- Trang chủ: 14 ảnh chủ đề (`public/home/topics`) + trường `topic` của gợi ý: **chỉ khi** anh muốn Trang chủ iOS dùng gợi ý động của web (hiện iOS dùng bộ thẻ cố định 6 gợi ý theo Android). Đây là quyết định thiết kế Trang chủ.
- `booking/recheck`, `voice/tts`, `links/resolve`, Share Extension (`share-target`): thấp.

**4. Gói đăng ký (L) — CHẶN bởi anh + máy chủ:** web có 5 gói (`src/lib/plans/planConfig.ts`: pip=MoMo 7 ngày, momo=Coco 1 tháng, coco=Coco 3 tháng, promax1m/3m=Tappy). iOS `SubscriptionView.swift` chỉ có thẻ Free vs một "Pro", `ProductCatalog.swift` lỗi thời (còn `tappy_milo_6m`, `tappy_sunny_12m`, thiếu `tappy_promax_1m/3m`), không có `/api/payments/*`. Cần: sản phẩm IAP trong App Store Connect + máy chủ (`/api/iap/apple/verify`, danh sách `APPLE_PRO_PRODUCT_IDS`: CHƯA KIỂM có promax) nhận mã mới. Chỉ hiện giá StoreKit; **tuyệt đối không hiện giá SePay/VND**, không hướng người dùng iOS sang thanh toán web (Apple 3.1.1). Thử Pro = mua thử sandbox trong TestFlight.

**KHÔNG làm:** Marketplace và Business (web chỉ là trang trống / việc của người bán, rủi ro 3.1.1). Giữ ẩn Dịch/Viết nội dung/Nhạc (khớp web).

---

## 7. CÂU HỎI CÒN TREO VỚI ANH HUY (chỉ hỏi khi cần, mỗi lần một câu dễ trả lời)

1. Ẩn Tỷ giá/Quét/Bói/Gợi ý trên iOS giống web? (em khuyên ẩn)
2. Push `63a2545` (bản thử backend=test)?
3. Khi nào deploy web mới (quyết định của anh, không phải của Claude)?

---

## 8. CHƯA KIỂM / KHÔNG CHẮC (nói thẳng với anh)

- **Chưa từng chạy trên iPhone hay simulator bởi người.** CI chỉ chứng minh biên dịch + logic. Chưa xem giao diện thật, chưa mở ảnh chụp màn hình CI.
- **Chưa chạy iOS với web local.** Các phần phụ thuộc máy chủ mới (khối trình bày, thẻ khẩn cấp, ảnh chủ thể, chỗ ở/món, giá khách sạn, thông báo hết lượt, khung đọc link, ẩn bình luận) được thử bằng các khung dữ liệu mà mã web ghi ra, chưa thử với web thật.
- Giá trị thật các cờ trên Vercel production: chỉ anh xem được (dashboard), Claude không đọc.
- `decisionEvidenceId` (iOS gửi) so với `chatSessionId` (web dựa vào): độ bám ngữ cảnh khi hỏi tiếp có tương đương không: CHƯA KIỂM.
- Nhánh `test` của workflow chưa từng chạy; số test "1.248" đếm từ log (có thể lệch vài do cách chia suite).
- Hai chỗ lệch nhỏ chưa xử lý: iOS không gửi ngữ cảnh clip; nhãn nút Agoda/Vexere ở một số chỗ vẫn chung chung.
- Mọi điều ở mục 6 là từ đọc mã bằng tác tử; nhiều dòng ghi UNVERIFIED trong báo cáo gốc (nội dung `splitBill.ts`, route avatar nhóm, migration chưa kiểm production có áp chưa…).

---

## 9. Tệp tham chiếu

**iOS (cây `wt-ios-messenger`):** `docs/ios/IOS-BRAIN-FREEZE-20261123.md`, `docs/ios/RELEASE-1.1.0-20261123.md`, `docs/ios/TEST-BACKEND-BUILD.md`, `docs/ios/13_PARITY_GOVERNANCE.md` (web là nguồn chân lý), `docs/ios/APPSTORE-SUBMISSION.md` (hồ sơ nộp; **có chỉ thị đóng băng release 02/10 của anh**: chỉ build/nộp khi anh yêu cầu; hôm nay anh đã yêu cầu bản 1.1.0), `docs/ios/IOS-PROGRESS.md`, `docs/ios/IOS-REQUESTS.md`, `docs/ios/PARITY-AUDIT-2026-10-01.md`.
**Web (đặc tả, `D:\TappyAI-wt\wt-integration`):** `docs/handoff/HANDOFF-20261121-web-dong-bang-chuan-bi-ios.md` (bản đồ API và tính năng), `docs/handoff/HANDOFF-20261120-bo-nao-tong-ket-day-du.md` (kiến trúc bộ não), `docs/handoff/DANH-SACH-VIEC-TRUOC-DEPLOY-20261121.md`, mã nhóm ăn `src/app/api/group/**`, `src/lib/group/splitBill.ts`, `src/components/chat/workspace/HistorySidebar.tsx`, `src/app/api/conversations/route.ts`, `src/app/api/chat-projects/route.ts`, `src/app/api/age-declaration/route.ts`, `src/app/api/moderation/decisions`.
**Bàn giao cũ liên quan:** `D:\Claude\Projects\TappyAI\.worktrees\g1-growth\docs\handoff\HANDOFF-20261104-messenger-web-android-ios.md`, prompt cũ `C:\Users\Admin\Desktop\PROMPT-SESSION-MOI-20261121-ios.md`.

---

## 10. PROMPT dán vào phiên mới

> Anh là Huy, chủ sản phẩm TappyAI (không phải dân lập trình). Nói tiếng Việt, ngắn, thật, có nhãn ĐÃ KIỂM / CHƯA KIỂM. Kỹ thuật là việc của em, tự quyết, không hỏi anh những câu kỹ thuật hay câu anh không biết trả lời; chỉ hỏi quyền (tải, tài khoản), tiền, gu sản phẩm, riêng tư, production.
>
> **Việc: tiếp tục làm bản iOS của TappyAI theo bản web.** Đọc trước, theo thứ tự: `D:\TappyAI-wt\wt-ios-messenger\docs\handoff\HANDOFF-20261123-ios-brain-parity-release-1.1.0.md` (cả file), rồi `docs/ios/IOS-BRAIN-FREEZE-20261123.md`, `docs/ios/RELEASE-1.1.0-20261123.md`, `docs/ios/TEST-BACKEND-BUILD.md`. Nhánh duy nhất: `ios/consolidated-20261122` (cây `D:\TappyAI-wt\wt-ios-messenger`). Web local (đặc tả, chỉ đọc): `D:\TappyAI-wt\wt-integration`, tag `web-freeze-20261123`.
>
> **Trạng thái:** bộ não iOS đã đóng băng (đừng sửa các tệp giao thức chat nếu web không đổi). Bản 1.1.0 build 234 đã lên TestFlight, chờ anh thử và tự nộp duyệt (em không bấm Submit). Việc tiếp theo theo thứ tự: (0) đọc kết quả cuối run TestFlight #234; (1) nhóm ăn, bắt đầu bằng G1 `requiresAuth`; (2) lịch sử chat ghim/lưu trữ/tìm/tải thêm; (3) thông báo vi phạm trong app, 18+ một nút, mở link `/r` `/plan` trong app; (4) gói đăng ký chỉ khi anh tạo xong sản phẩm IAP.
>
> **Luật cứng:** sửa mã chỉ bằng Edit/Write (cấm heredoc/`sed -i`/`python -c`), tệp LF. Máy không có Mac: Swift chỉ biên dịch được trên CI, chưa có run xanh thì không ghi PASS. Mỗi lát một commit. **Hỏi "Push cho CI?" trước mỗi lần push**, đợi CI bằng `gh run watch` chạy nền, đọc log khi đỏ. Không đụng production, không đọc khóa, không tạo tài khoản, không bấm Submit/không đụng App Store Connect, không build TestFlight nếu anh chưa yêu cầu. Máy chủ production chưa có mã mới: mọi màn mới phải "ngủ" (ẩn khi 404/500, trường mới đọc lỏng). Giữ nguyên cây `g1-growth` và 10 cây One Life.
