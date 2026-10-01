# Lập Xcode Cloud lần đầu trên Mac thuê (1–3 giờ) — hướng dẫn cho người không phải dân dev

Viết ngày 01/10/2026 trên Windows, KHÔNG có Mac để thử. Chỗ nào ghi **«chưa kiểm»** là điều em suy ra từ tài liệu/kinh nghiệm chung, không phải từ giao diện đã nhìn thấy: nếu màn hình khác thì làm theo màn hình, và báo lại để sửa tờ này.

## Vì sao phải làm trên Mac

Trang Xcode Cloud trong App Store Connect của anh ghi «Get started in Xcode»: lần đầu **tạo workflow và nối kho mã phải làm trong Xcode trên Mac**. Sau khi lập xong, sửa workflow và bấm chạy build làm được ngay trên web App Store Connect.

## (a) Chuẩn bị trước khi thuê Mac (em làm trên Windows)

Thông tin dự án (đã kiểm trong mã):

| Mục | Giá trị |
|---|---|
| Kho mã | `huyphamsm-tappy/tappyai-mvp` (GitHub) — nhánh làm việc `ios/sync-2026-09-30` |
| Thư mục app | `ios/` |
| Bundle ID | `com.tappyai.ios` |
| Team ID | `6UAG75G2US` |
| Scheme | `TappyAI` |
| Quyền (entitlements) | Push Notifications (`aps-environment`), Sign in with Apple, Associated Domains (`applinks:www.tappyai.com`, `webcredentials:www.tappyai.com`) |
| Tối thiểu iOS | 16.0, chỉ iPhone |

**Điều quan trọng: tệp dự án `TappyAI.xcodeproj` KHÔNG nằm trong kho mã** (bị `.gitignore`), nó được SINH từ `ios/project.yml` bằng công cụ XcodeGen. Xcode Cloud chỉ thấy những gì có trong kho mã, nên có hai cách:

- **Cách 1 (em đề nghị): thêm kịch bản `ios/ci_scripts/ci_post_clone.sh`** để Xcode Cloud tự sinh dự án sau khi tải mã. Em chưa kiểm được Xcode Cloud có cho tạo workflow khi chưa thấy `.xcodeproj` hay không: **chưa kiểm**. Nếu Xcode không cho chọn dự án, dùng cách 2 chỉ để TẠO workflow.
- **Cách 2 (dự phòng):** trên Mac, chạy `xcodegen generate` rồi **commit tạm** `ios/TappyAI.xcodeproj` lên một nhánh riêng (ví dụ `ios/xcode-cloud`) và cho Xcode Cloud chạy trên nhánh đó. Cách này làm bẩn lịch sử, chỉ dùng khi cách 1 không qua.

Kịch bản mẫu em sẽ thêm vào kho (chưa thêm, vì chưa kiểm được trên Xcode Cloud; anh hoặc em thêm khi có Mac để thử ngay):

```bash
#!/bin/zsh
# ios/ci_scripts/ci_post_clone.sh — Xcode Cloud chạy sau khi tải mã.
set -euo pipefail
cd "$CI_PRIMARY_REPOSITORY_PATH/ios"
brew install xcodegen          # chưa kiểm: có sẵn Homebrew trên máy Xcode Cloud hay không
xcodegen generate
# Cấu hình chạy (đọc từ BIẾN MÔI TRƯỜNG BÍ MẬT đặt trong workflow, không nằm trong kho)
xc_url() { printf '%s' "${1%/}" | sed 's|//|/$()/|'; }
{
  echo "SUPABASE_URL = $(xc_url "$SUPABASE_URL")"
  echo "SUPABASE_ANON_KEY = $SUPABASE_ANON_KEY"
  echo "TAPPY_API_BASE_URL = $(xc_url "$TAPPY_API_BASE_URL")"
} > Config/Secrets.xcconfig
# Firebase: tệp plist không nằm trong kho; dựng lại từ biến bí mật dạng base64
printf '%s' "$GOOGLE_SERVICE_INFO_PLIST_BASE64" | base64 --decode > TappyAI/Resources/GoogleService-Info.plist
```

Các biến cần có (trong workflow Xcode Cloud, đánh dấu **Secret**): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TAPPY_API_BASE_URL` (phải là `https://www.tappyai.com`, KHÔNG phải địa chỉ UAT, KHÔNG có khoá bypass), `GOOGLE_SERVICE_INFO_PLIST_BASE64`. Giá trị lấy từ máy anh (`D:\secrects`) hoặc từ chỗ anh đã lưu; **đừng gửi nội dung vào chat**.
**Kiểm lại 02/10 (build 98): vẫn đúng với dự án hiện tại** — không có thư viện/đích mới; tệp tài nguyên mới `bocongan2026.json` và code đồng ý AI chỉ nằm trong thư mục `ios/TappyAI` nên `xcodegen generate` tự nhặt; biến môi trường không đổi. Số build mới nhất trên TestFlight là **97** (98 đang làm): đặt số build của Xcode Cloud **lớn hơn** số lớn nhất đã tải lên.
Số build: GitHub Actions dùng số lần chạy làm `CFBundleVersion`; Xcode Cloud có biến `CI_BUILD_NUMBER` (chưa kiểm cách chỉnh trong dự án XcodeGen) — số build phải **lớn hơn mọi số đã upload** lên TestFlight.

## (b) Trên Mac, từng bước bấm

Điều kiện: Mac có Xcode bản mới (từ App Store), đăng nhập **Apple ID của tài khoản Developer** (có thể cần mã 2 lớp), và truy cập được GitHub.

1. Mở Terminal, chạy: `git clone https://github.com/huyphamsm-tappy/tappyai-mvp.git` rồi `cd tappyai-mvp && git checkout ios/sync-2026-09-30` *(nếu repo đã khoá thì cần đăng nhập GitHub khi clone)*.
2. `brew install xcodegen` (nếu chưa có Homebrew: cài theo brew.sh), rồi `cd ios && xcodegen generate`. Có tệp `ios/TappyAI.xcodeproj`.
3. Mở `TappyAI.xcodeproj` bằng Xcode. Chờ nó tải thư viện (Supabase, Firebase) — vài phút.
4. Xcode → **Settings → Accounts**: đảm bảo tài khoản Developer có mặt, Team `6UAG75G2US`.
5. Trên thanh menu: **Product → Xcode Cloud → Create Workflow…** *(tên menu có thể khác, chưa kiểm)*.
6. Chọn sản phẩm/dự án **TappyAI**. Xcode hỏi **cấp quyền cho nguồn mã** — chọn GitHub, bấm **Grant Access**, đăng nhập GitHub trên trình duyệt hiện ra. **Nếu repo đã khoá (private): phải cấp quyền cho CẢ repo private; nếu thấy danh sách chỉ có repo công khai thì vào GitHub → Settings → Applications → Xcode Cloud → Configure và thêm repo.**
7. **Start Conditions:** chọn nhánh `ios/sync-2026-09-30` (hoặc nhánh sẽ dùng khi release); khuyên chỉ chạy khi có thay đổi trong `ios/` để tiết kiệm giờ.
8. **Environment:** chọn Xcode bản mới nhất ổn định, macOS mới nhất.
9. **Actions:** thêm **Archive** (iOS), cấu hình **Distribution preparation: App Store Connect**; phần **Post-actions:** **TestFlight (Internal Testing)** chọn nhóm nội bộ. Có thể thêm **Test** (scheme `TappyAI`, hiện có bộ `TappyAITests`). Bỏ Test lúc đầu nếu muốn tiết kiệm giờ.
10. **Environment variables (biến môi trường):** thêm 4 biến ở phần (a), mỗi cái đánh dấu **Secret**.
11. **Signing:** Xcode Cloud dùng **cloud-managed signing** (Apple ký thay): không cần chứng chỉ/hồ sơ riêng của GitHub. Nếu Xcode hỏi, chọn **Automatically manage signing** cho Xcode Cloud. *(chưa kiểm: có thể phải bật «Automatically manage signing» ở tab Signing & Capabilities của dự án trong lần đầu.)*
12. Bấm **Create Workflow / Save**, rồi **Start Build** một lần. Theo dõi trong Xcode (tab **Report**) hoặc trên web: App Store Connect → **Xcode Cloud**.
13. Build xong: bản xuất hiện ở **TestFlight** sau khi Apple xử lý (vài phút đến ~1 giờ); nếu hỏi **Missing Compliance**: trả lời đúng như hồ sơ mã hoá (xem `APPSTORE-SUBMISSION.md` mục mã hoá).

**Lỗi hay gặp:**
- *«No such project/workspace»* hoặc không thấy scheme: dự án chưa được sinh — kịch bản `ci_post_clone.sh` chưa chạy hoặc đặt sai thư mục (phải nằm trong `ios/ci_scripts/`, cùng thư mục chứa `.xcodeproj`; chưa kiểm). Dùng cách 2.
- *«Code signing»/«No profiles»*: bật cloud-managed signing; kiểm Team ID; kiểm App ID `com.tappyai.ios` đã có đủ Push, Sign in with Apple, Associated Domains (đã làm 01/10).
- *Thiếu tệp `GoogleService-Info.plist`*: biến `GOOGLE_SERVICE_INFO_PLIST_BASE64` chưa đặt hoặc kịch bản không chạy. App vẫn build được nhưng không có push.
- *Số build trùng*: Apple từ chối upload; tăng số build.
- *Hết giờ*: xem mục (e).
- *Repo private mà Xcode Cloud không đọc được*: cấp lại quyền ở GitHub như bước 6.

## (c) Sau khi lập: làm gì trên web

App Store Connect → **Xcode Cloud** (mục riêng trên thanh trên cùng): xem build, bấm **Start Build**, sửa workflow (nhánh bắt đầu, hành động, biến môi trường). Việc **lập lần đầu** và **thêm/đổi dự án** vẫn cần Xcode.

## (d) Mất gì so với GitHub Actions — nên giữ cả hai không

| | GitHub Actions (đang dùng) | Xcode Cloud |
|---|---|---|
| Ảnh App Store/ảnh kiểm UI, máy chủ giả | Có (`ios-appstore-shots`, `ui_stub_server.py`) | **Không có** theo cách hiện tại |
| Kiểm hồ sơ ký, kiểm cấu hình Firebase | Có | Không cần (ký do Apple) |
| Ký | Thủ công bằng secret | Do Apple quản lý |
| Chặn build trỏ nhầm UAT, cảnh báo cờ production | Có (bước tự viết) | Cần viết lại trong `ci_post_clone.sh` |
| Test đơn vị | Có | Có (hành động Test) |
| Chi phí | macOS tính 10 lần phút nếu repo private | 25 giờ/tháng của tài khoản Developer (số này em chưa thấy trong giao diện của anh) |

**Đề nghị:** giữ Xcode Cloud cho **build + TestFlight** (rẻ khi repo private) và giữ GitHub Actions chỉ cho phần Xcode Cloud không làm được (**ảnh App Store, kiểm UI**) chạy tay khi cần.

## (e) 25 giờ/tháng: ước lượng

Số thật chưa có (chưa chạy trên Xcode Cloud). Ước lượng từ GitHub Actions: build ≈ 4,5 phút, test đơn vị ≈ 4,5 phút, archive + upload ≈ 12–25 phút ⇒ **một lần build + test + TestFlight khoảng 25–35 phút**. 25 giờ = 1.500 phút ⇒ khoảng **40–60 lần/tháng** (ước lượng thô). Tính theo giờ tính toán, máy Xcode Cloud nhanh hơn/chậm hơn runner GitHub: chưa kiểm.

## (f) Anh mang theo

1. Đăng nhập **Apple Developer** (Apple ID đang dùng + điện thoại nhận mã 2 lớp).
2. Đăng nhập **GitHub** (`huyphamsm-tappy`) + **địa chỉ repo** `https://github.com/huyphamsm-tappy/tappyai-mvp`.
3. File **giá trị các biến bí mật** (4 biến ở mục (a)), cất ở `D:\secrects` (mang theo bằng USB hoặc mở từ nơi lưu của anh, **không gửi vào chat, không dán vào tin nhắn**).
4. Đã thuê Mac có Xcode; mạng ổn định.

## (g) Chưa chắc / chưa kiểm

Xcode Cloud có cho lập workflow khi dự án phải được sinh bằng XcodeGen; Homebrew có trên máy Xcode Cloud; đúng tên menu và thứ tự màn hình trong Xcode hiện hành; cách đặt `CURRENT_PROJECT_VERSION` từ `CI_BUILD_NUMBER`; con số 25 giờ và thời gian chạy thật. Em đã đọc trang giới thiệu Xcode Cloud trong App Store Connect của anh nhưng chưa thấy màn tạo workflow (cần Xcode).
