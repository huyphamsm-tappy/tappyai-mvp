# GitHub Actions: phút chạy, và điều gì xảy ra khi ẩn repo (01/10/2026)

Nguồn: trang Billing của Huy (đọc bằng trình duyệt, chỉ đọc) + lịch sử chạy Actions của repo (API chỉ đọc, 1.000 lần chạy gần nhất = 28/09 → 01/10, tức ~2,9 ngày) + đọc `.github/workflows/*.yml`.

## 1. Số thật hôm nay

- Gói: **GitHub Free**, $0/tháng. Phút Actions đã tính vào hạn mức: **0 / 2.000** (repo đang **Public** nên Actions miễn phí, không trừ hạn mức).
- Tháng 10 (mới ngày 01): tiêu thụ gộp **$20,49**, được giảm toàn bộ **−$20,49** (do repo public) ⇒ phải trả **$0**. Nghĩa là chỉ riêng ngày 01/10 đã dùng lượng Actions trị giá $20,49 theo giá niêm yết.
- Không thấy hạn mức chi tiêu (spending limit/budget) nào được đặt trên trang Overview; mục «Budgets and alerts» em chưa mở (chưa kiểm).
- Repo: Public, 1 sao, 0 fork, không webhook, không GitHub Pages, không deploy key, không environment.

## 2. Ai tiêu bao nhiêu (cửa sổ 28/09 → 01/10, ~2,9 ngày; thời gian chạy thực của mỗi lần)

| Workflow | Máy | Lần chạy | Trung bình/lần | Phút/ngày | Chạy khi nào |
|---|---|---|---|---|---|
| Regression Gate (web) | Linux | 337 | 5,2 phút | ~591 | mọi lần đẩy VÀ mọi PR (cả nhánh `ios/**`: 49 lần) |
| iOS (build + test + ảnh) | **macOS** | 38 | 16 phút (đủ bộ 32 phút) | ~206 | đẩy nhánh `ios/**` khi đổi `ios/**` hoặc `ios.yml`; chạy tay (TestFlight) |
| Architecture Guard | Linux | 338 | 0,8 | ~89 | mọi lần đẩy + PR |
| Merge Guard | Linux | 281 | 0,5 | ~51 | mọi lần đẩy + PR vào rc |
| ios-appstore-shots | **macOS** | 4 | 11,8 | ~16 | đẩy khi đổi tệp của nó |
| ios-profile-check | macOS → Linux | 2 | 0,5 | ~0,4 | đẩy khi đổi tệp của nó |

Một lần chạy iOS đầy đủ (32 phút): build 4,5 · test đơn vị 4,5 · mở máy ảo ~2 · **ảnh chụp UI 18 (56%)** · còn lại ~3.

Nếu repo **private** (hạn mức 2.000 «phút tính»; macOS ×10, Linux ×1):

| | Phút thực/ngày | Phút thực/tháng (30 ngày, nhịp như vừa rồi) | Phút TÍNH/tháng | So với 2.000 |
|---|---|---|---|---|
| Linux (web) | ~730 | ~21.900 | 21.900 | gấp ~11 lần |
| macOS (iOS) | ~223 | ~6.700 | ~67.000 | gấp ~33 lần |

⇒ Ở nhịp hiện tại, hạn mức tháng hết trong **chưa đầy một ngày** (chỉ riêng iOS: ~2.060 phút tính/ngày). Hết hạn mức mà không đặt ngân sách thì Actions dừng; đặt ngân sách thì tính tiền theo giá niêm yết (macOS ~$0,08/phút ⇒ một lần chạy iOS đầy đủ ≈ $2,5). Đây là ước lượng từ 3 ngày bận rộn, không phải trung bình cả tháng; số lần chạy thật còn tuỳ nhịp làm việc.

## 3. Đã giảm (đúng phạm vi iOS/CI; không sửa luật kiến trúc, không bỏ test)

| Việc | Tiết kiệm ước tính |
|---|---|
| `ios-appstore-shots`: chỉ chạy tay hoặc khi thông điệp commit có `[appstore-shots]` (còn lại job bị bỏ qua, không dùng máy) | ~16 phút macOS/ngày = ~160 phút tính/ngày |
| `ios-profile-check`: chuyển sang Linux (`openssl smime` thay `security cms`), chỉ chạy tay hoặc khi có `[profile-check]` | ~0,4 phút macOS/ngày (nhỏ), nhưng không còn tốn macOS khi bấm lại |
| Cả hai có `concurrency` + `cancel-in-progress` (lần mới huỷ lần cũ) | tránh chạy chồng khi đẩy liên tiếp (vài phút/lần) |
| Đã có sẵn từ trước: iOS CI chỉ chạy khi đổi `ios/**` hoặc `ios.yml` (docs không chạy); concurrency huỷ lần cũ; job TestFlight chỉ chạy tay | — |

**Đề xuất cần Huy quyết (chưa làm, vì đổi cách nghiệm thu):** bước «UI tests (screenshots)» chiếm 18/32 phút. Chỉ chạy khi chạy tay / PR / thông điệp commit có `[shots]` thì mỗi lần đẩy còn ~12 phút (−56%): ~−200 phút tính/lần. Đổi lại ảnh CI không có sẵn ở mỗi commit.

**Đề xuất cho phiên WEB (em không sửa):** Regression Gate + Architecture Guard + Merge Guard chiếm ~730 phút Linux/ngày. (1) Chạy khi `pull_request` vào rc/main, bỏ chạy `push` trùng PR (337 lần = 140 PR + 197 đẩy; ước tính −40% ≈ −290 phút/ngày); (2) bỏ chạy cho nhánh `ios/**` / `luna/**` hoặc dùng `paths-ignore` cho `ios/**` — nhưng một số bài kiểm web đọc mã Swift (i18n, parity) nên cần giữ khi `ios/**` đổi, chỉ trên PR; (3) `concurrency` + `cancel-in-progress` ở cả ba workflow; (4) cache `node_modules` (5,2 phút/lần: phần cài đặt thường chiếm 1–2 phút).

## 4. Khi ẩn repo (public → private): điều gì có thể hỏng

Đã đọc cấu hình; mục không chắc ghi «chưa kiểm».

- **Branch protection của `main`** đang yêu cầu 4 kiểm tra (`Test suite`, `Types, lint, SQL grants`, `AI architecture rules`, `Brand registry validation`). Gói **Free + repo private không áp dụng branch protection/ruleset** — luật vẫn hiện nhưng có thể không còn được GitHub thực thi (chưa kiểm sau khi ẩn). Hệ quả: có thể gộp PR mà không qua kiểm tra. Cách xử: trả phí gói Team (~$4/người/tháng) hoặc giữ kỷ luật tay.
- **Actions**: chạy được nhưng bị giới hạn phút (mục 2). Secrets (`APPSTORE_PROFILE_BASE64`, `GOOGLE_SERVICE_INFO_PLIST_BASE64`, …) giữ nguyên.
- **Vercel**: kết nối GitHub của Vercel thường vẫn hoạt động khi repo thành private, nhưng nếu ứng dụng Vercel được cấp quyền «chỉ các repo công khai» hoặc bị hạn chế repo thì phải cấp lại (chưa kiểm — cần xem GitHub → Settings → Applications → Vercel → Repository access). Dự án Vercel đang dùng gói nào cũng cần kiểm: gói Hobby có thể giới hạn dùng thương mại (chưa kiểm).
- **Ứng dụng bên thứ ba / tích hợp**: em không đọc được danh sách ứng dụng GitHub cài đặt từ giao diện lần này (chưa kiểm); API cho thấy 0 webhook và 0 deploy key.
- **GitHub Pages / Releases**: không có Pages (404); Releases chưa kiểm.
- **Xcode Cloud**: chưa kết nối repo nào (trang Xcode Cloud của Huy trống); không có gì để hỏng.
- **Liên kết trong mã/tài liệu** tới `github.com/huyphamsm-tappy/tappyai-mvp/...`: chỉ nằm trong `docs/` (PR, runbook) — người ngoài sẽ thấy 404, người có quyền vẫn mở được. Không có liên kết công khai trong mã chạy của app (`git grep` chỉ thấy docs; chưa quét kỹ mọi thư mục `android/`, `ios/`, `public/`).
- **Tải thư viện qua git**: Swift Package (`firebase-ios-sdk`) và các gói npm lấy từ repo KHÁC nên không ảnh hưởng.
- **Những gì đã từng công khai** (lịch sử commit, fork, bản sao): ẩn repo **không thu hồi**. Mọi khoá/secret từng nằm trong lịch sử phải coi là đã lộ và cần xoay khoá nếu có (chưa kiểm repo có từng commit khoá hay không).

## 5. Xcode Cloud (chỉ nghiên cứu)

- Giao diện App Store Connect của Huy có mục «Xcode Cloud» riêng; trang giới thiệu ghi «Get started in Xcode»: **lần đầu tạo workflow và kết nối repo phải làm trong Xcode trên Mac**. Sau đó có thể sửa workflow và bấm chạy build ngay trên web («edit your workflows and launch builds directly from the web»).
- Apple cho 25 giờ/tháng tính theo giờ tính toán (Huy cần xác nhận hạn mức thật trong tài khoản; em chưa thấy con số trong giao diện).
- Không có Mac ⇒ không thể làm xong việc chuyển. Ngoài ra mất: ảnh App Store/ảnh CI bằng máy ảo + máy chủ giả (Xcode Cloud không chạy `ui_stub_server.py`/chụp ảnh theo cách hiện tại), ký thủ công bằng secret (Xcode Cloud dùng ký tự động của Apple, bỏ được bước hồ sơ ký nhưng đổi cách làm), các kiểm tra bảo vệ production trong `ios.yml`.
- **Đề nghị: chưa chuyển.** Làm lại gần như từ đầu, cần Mac, và không thay được phần ảnh chụp. Cân nhắc lại khi có Mac.

## 6. Bước bấm cho Huy

**Trước khi ẩn**
1. Quyết định mục 3 (đề xuất: chạy ảnh UI theo yêu cầu) và ngân sách Actions: GitHub → Settings (tài khoản) → Billing and licensing → **Budgets and alerts** → đặt ngân sách Actions (ví dụ $20/tháng) để không bị chặn bất ngờ hoặc tính tiền ngoài ý muốn.
2. Vercel: vercel.com → dự án → Settings → **Git** → ghi lại repo đang kết nối. GitHub → Settings → Applications → **Installed GitHub Apps** → Vercel → Configure → xem «Repository access».
3. Nhờ phiên WEB giảm phút Linux (mục 3) trước hoặc ngay sau khi ẩn.
4. Quyết định về branch protection (mục 4).

**Ẩn repo (Huy tự bấm)**
GitHub → repo `tappyai-mvp` → **Settings** → **General** → kéo xuống **Danger Zone** → **Change repository visibility** → **Change to private** → gõ tên repo để xác nhận.

**Sau khi ẩn (kiểm)**
1. Mở repo ở cửa sổ ẩn danh: phải báo 404.
2. Vercel → dự án → **Deployments**: đẩy một thay đổi nhỏ hoặc bấm **Redeploy** → phải build được. Nếu báo lỗi quyền truy cập repo: GitHub → Settings → Applications → Vercel → Configure → thêm repo vào danh sách.
3. GitHub → **Actions**: mở một workflow gần nhất; chạy nhẹ (ví dụ `ios-profile-check` bằng thông điệp `[profile-check]`) → phải chạy; mở lại trang Billing xem «Actions minutes» bắt đầu tăng.
4. GitHub → repo → Settings → **Branches**: xem luật bảo vệ `main` còn hiện/ còn thực thi không.
5. Xcode/TestFlight không phụ thuộc repo công khai; job TestFlight vẫn dùng secret như cũ (chưa chạy để kiểm, theo quy định không chạy trước khi Huy báo release Phase 7).
