# NGÀY THUÊ MAC — lập Xcode Cloud lần đầu (1–3 giờ)

Viết 02/10/2026 trên Windows, **không có Mac để thử**. Chỗ ghi **«chưa kiểm»** là em suy từ tài liệu Apple/kinh nghiệm chung, không phải từ màn hình em đã nhìn: nếu màn hình khác thì làm theo màn hình, rồi báo để sửa tờ này. Em chỉ **chạy thử phần script và archive trên máy macOS của GitHub** (xem mục 3) — phần bấm trong Xcode thì chưa ai thử.

## 1. Vì sao phải có Mac một lần

Xcode Cloud (dịch vụ build của Apple) chỉ cho **tạo workflow lần đầu bằng Xcode trên Mac**. Lập xong, mọi việc sau (đổi nhánh, đổi biến, bấm chạy) làm được trên web: App Store Connect → **Xcode Cloud**. Dự án của mình không có sẵn tệp `.xcodeproj` (sinh từ `project.yml` bằng XcodeGen), nên cần sinh nó trên Mac **một lần** để Xcode thấy dự án; sau đó Xcode Cloud tự sinh lại mỗi lần build nhờ `ios/ci_scripts/ci_post_clone.sh`.

## 2. Anh mang theo (viết ra giấy/để sẵn trước khi thuê)

1. **Apple ID của tài khoản Developer** (Team ID `6UAG75G2US`) + **iPhone** nhận mã 2 lớp.
2. **GitHub**: tài khoản `huyphamsm-tappy` và địa chỉ repo `https://github.com/huyphamsm-tappy/tappyai-mvp` (nhánh `ios/sync-2026-09-30`, hoặc nhánh anh chọn lúc phát hành).
3. **4 giá trị bí mật** (nằm ở `D:\secrects` — **KHÔNG gửi vào chat, KHÔNG dán vào tin nhắn/email**):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `TAPPY_API_BASE_URL` (phải là `https://www.tappyai.com`, không phải địa chỉ UAT, không có khoá bypass)
   - `GOOGLE_SERVICE_INFO_PLIST_BASE64` (một dòng chữ rất dài; đây là tệp Firebase đã mã hoá thành chữ)
4. **Cách đưa 4 giá trị sang Mac thuê an toàn**: chép vào **USB** (hoặc mở `D:\secrects` trên điện thoại/laptop của anh và gõ/dán từng giá trị trực tiếp vào ô «Value» của Xcode Cloud — ô đánh dấu Secret). Không đăng nhập email/Drive cá nhân trên Mac thuê; cuối buổi **rút USB**, đăng xuất Apple ID/GitHub trên Mac thuê, xoá thư mục repo.
5. (Nên) laptop/điện thoại có sẵn tờ này để làm theo.

## 3. Đã chạy thử từ Windows (để anh yên tâm)

- `ios/ci_scripts/ci_post_clone.sh` + `ci_post_xcodebuild.sh` có trong repo. Em chạy **đúng script đó** trên máy macOS của GitHub (job «ios-xcloud-dry-run», commit có `[xcloud-dry]`), rồi `xcodebuild archive` cùng lệnh; kết quả xanh/đỏ ghi ở báo cáo và `IOS-PROGRESS.md`. **Xanh nghĩa là:** script cài XcodeGen, sinh dự án, ghi cấu hình từ biến môi trường, từ chối nếu không trỏ production, ghi số build tăng dần, và dự án archive được. **Chưa chứng minh:** việc ký (Apple tự ký trên Xcode Cloud), việc bấm tạo workflow.
- Thông số: scheme **`TappyAI`**, bundle **`com.tappyai.ios`**, Team **`6UAG75G2US`**, quyền: Push Notifications, Sign in with Apple, Associated Domains (`applinks:www.tappyai.com`, `webcredentials:www.tappyai.com`), iOS tối thiểu 16, chỉ iPhone, ký **Automatic** (Xcode Cloud dùng **cloud-managed signing**).
- Số build do script đặt: `1000 + CI_BUILD_NUMBER` (build đầu của Xcode Cloud = 1001). Lớn hơn mọi build GitHub đã tải (số 100 hiện nay). Nếu GitHub Actions sau này vượt 1000, đặt biến `XCLOUD_BUILD_OFFSET` lớn hơn trong workflow.

## 4. Cấu hình Mac thuê (tối thiểu)

- **Dữ kiện thật từ lần chạy thử 02/10:** máy macOS của GitHub dùng **Xcode 26.6**; script `ci_post_clone.sh` chạy **5 giây** (XcodeGen 2.46.0 có sẵn), `xcodebuild archive` xong sau **~5,6 phút**, in `ARCHIVE SUCCEEDED`, bundle `com.tappyai.ios`, phiên bản 1.0.0, build 1001, API production. Trên Xcode Cloud, chọn Xcode ở Environment (mục 9) **cùng đời với 26.x**; chưa kiểm Xcode Cloud đã có đời đó chưa — nếu chưa, chọn đời mới nhất có và báo em log nếu biên dịch đỏ.
- macOS đủ mới để chạy **Xcode phiên bản mới nhất trên App Store** (dự án build bằng Xcode mới của GitHub `macos-latest`; **chưa kiểm** số phiên bản tối thiểu cụ thể — Apple đòi ít nhất Xcode 15 để dùng Xcode Cloud). Hỏi nhà cho thuê: «cài sẵn Xcode mới nhất, có Homebrew không?». 
- Ổ trống ≥ 40 GB, mạng ổn định, màn hình đủ lớn, đăng nhập được Apple ID của anh.
- Thuê **theo giờ**, tối thiểu 3 giờ (dư để lỡ bước). Không cần cắm iPhone, không cần giả lập.

## 5. Từng bước (đánh dấu ✅ khi thấy đúng)

### Bước A — chuẩn bị (10–20 phút)
1. Mở **Terminal**. Nếu `brew --version` báo không thấy: cài Homebrew theo https://brew.sh (copy lệnh một dòng trên trang đó). *Đạt:* hiện số phiên bản.
2. `git clone https://github.com/huyphamsm-tappy/tappyai-mvp.git` rồi `cd tappyai-mvp` và `git checkout ios/sync-2026-09-30`. *Đạt:* `git branch` có dấu `*` ở nhánh đó. *Lỗi hay gặp:* repo private hỏi mật khẩu → dùng GitHub Personal Access Token (vào GitHub → Settings → Developer settings → Tokens; **không** dùng mật khẩu thường). Sau khi khoá repo (mục 9), bước này luôn cần đăng nhập.
3. `brew install xcodegen` rồi `cd ios && xcodegen generate`. *Đạt:* có tệp `ios/TappyAI.xcodeproj`. *Lỗi:* «xcodegen: command not found» → mở Terminal mới; «No such file project.yml» → bạn đang ở sai thư mục (phải ở `ios`).
4. Mở `TappyAI.xcodeproj` bằng Xcode. Chờ nó tải thư viện (Supabase, Firebase) — vài phút, thanh trên cùng ghi «Resolving packages». *Đạt:* không còn vòng quay; xuất hiện scheme **TappyAI** ở góc trên.
5. Xcode → **Settings → Accounts**: thêm Apple ID (+ mã 2 lớp). *Đạt:* thấy team 6UAG75G2US với vai trò Admin/Account Holder. *Lỗi:* «No team» → Apple ID sai; đăng nhập đúng tài khoản Developer.

### Bước B — tạo workflow (30–60 phút)
6. Thanh menu: **Product → Xcode Cloud → Create Workflow…** (tên có thể khác trong bản Xcode của anh — chưa kiểm). Chọn **TappyAI** (sản phẩm/ứng dụng).
7. Xcode hỏi **cấp quyền cho kho mã**: chọn **GitHub**, bấm **Grant Access**, trình duyệt mở → đăng nhập GitHub → cho phép. *Repo công khai:* chỉ cần cho phép. *Repo private:* trên GitHub vào Settings → Applications → **Xcode Cloud** → **Configure** → thêm đúng repo `tappyai-mvp`. *Đạt:* Xcode báo đã kết nối.
8. **Start Conditions** (khi nào chạy): chọn **chạy tay + khi có thay đổi ở nhánh** `ios/sync-2026-09-30` (hoặc nhánh phát hành). Khuyên: **chỉ chạy tay** lúc đầu để khỏi tốn giờ miễn phí.
9. **Environment**: Xcode = **Latest Release**, macOS = **Latest Release**. Ở mục **Environment Variables** thêm **4 biến** (bấm +, đánh dấu **Secret**): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TAPPY_API_BASE_URL`, `GOOGLE_SERVICE_INFO_PLIST_BASE64`. Dán giá trị từ USB. *Lỗi hay gặp:* dán thừa dấu cách/xuống dòng → build dừng với chữ «not production» hoặc «placeholder» (do script kiểm).
10. **Actions**: bỏ «Build» mặc định nếu có, thêm **Archive – iOS** (scheme TappyAI, **Distribution Preparation: App Store Connect**). Thêm **Post-Action → TestFlight (Internal Testing)** và chọn nhóm nội bộ của anh. (Hành động **Test** bỏ trống lúc đầu để tiết kiệm giờ.)
11. **Signing**: để **Automatically manage signing / cloud-managed**. *Lỗi hay gặp:* «No profiles» → mở developer.apple.com/account → Identifiers → `com.tappyai.ios` đã bật Push, Sign in with Apple, Associated Domains (đã bật 01/10); nếu thiếu, bật rồi chạy lại.
12. Bấm **Create Workflow / Save**.

### Bước C — chạy thử một lần (30–60 phút)
13. Xcode → mở panel **Report navigator** (biểu tượng cuối của thanh trái) → **Cloud** → chọn workflow → **Start Build**. Hoặc trên web: App Store Connect → **Xcode Cloud** → workflow → Start Build.
14. Chờ. *Đạt (theo thứ tự):* «Clone» xanh → «Post-Clone Script» xanh (xem log: dòng `post-clone: generated …TappyAI.xcodeproj`, `CFBundleVersion = 1001`, `API host … www.tappyai.com`) → «Archive» xanh → «TestFlight» xanh. Vài phút sau build **1001** xuất hiện trong TestFlight.
15. Nếu **Post-Clone Script đỏ**: đọc dòng cuối log. Thường là: (a) biến Secret thiếu/sai → sửa ở Environment; (b) `brew` không có → cài Homebrew ở máy build là việc của Apple, nếu chữ báo «Homebrew is not on this machine» → báo em, em chuyển sang tải XcodeGen bản nhị phân (chưa kiểm); (c) `xcodegen` lỗi → đưa em dòng lỗi.
16. Nếu **Archive đỏ** với lỗi ký: kiểm lại bước 11. Nếu lỗi biên dịch: đưa em log (em đã archive thử xanh trên GitHub nên thường là khác môi trường).

### Bước D — cất việc
17. Đổi Start Conditions về cách anh muốn (chỉ chạy tay là an toàn).
18. **Đăng xuất** Apple ID và GitHub khỏi Mac thuê; xoá thư mục `tappyai-mvp`; rút USB; trả Mac.

## 6. Sau khi lập xong (làm trên web, không cần Mac)

App Store Connect → **Xcode Cloud**: xem các lần build, **Start Build**, sửa workflow (nhánh, biến môi trường, hành động). Chỉ **tạo mới** workflow hoặc **thêm sản phẩm** mới mới cần Xcode.

## 7. 25 giờ miễn phí mỗi tháng — ước lượng

Một lần «Archive + TestFlight» ước chừng **25–40 phút máy** (ước lượng từ GitHub: build ~5 phút, archive+tải ~12–25 phút, cộng cài thư viện) ⇒ 25 giờ ≈ **35–60 lần/tháng**. Số thật chỉ biết sau lần chạy đầu (xem trong App Store Connect → Xcode Cloud → **Usage**). Giờ miễn phí kèm gói Developer; nếu hết, Apple bán thêm gói giờ — **không** tự mua.

## 8. Mất gì so với GitHub Actions → nên giữ cả hai

| | GitHub Actions (đang dùng) | Xcode Cloud |
|---|---|---|
| Ảnh App Store chụp bằng UI test, máy chủ giả | Có (`ios-appstore-shots`, `ui_stub_server.py`) | **Không** |
| Ảnh CI để nhìn/so sánh | Có | Không |
| Kiểm hồ sơ ký, kiểm Firebase | Có (`ios-profile-check`) | Không cần (Apple ký) |
| Ký | Thủ công bằng secret | Do Apple quản lý |
| Chặn build trỏ nhầm UAT, cảnh báo cờ production | Có | Có (script `ci_post_clone.sh` chặn host ≠ production; **không** có cảnh báo cờ) |
| Chi phí khi repo private | macOS tính **gấp 10** phút | 25 giờ/tháng miễn phí |
| Build + TestFlight | Có (chạy tay) | Có |

**Đề nghị:** Xcode Cloud lo **build + TestFlight** (rẻ khi repo private); GitHub Actions chỉ chạy tay cho **ảnh App Store** và kiểm tra UI khi cần (tốn phút khi repo private nên chạy ít).

## 9. KHI NÀO KHOÁ REPO

Chỉ khi **cả ba** xong: (1) Xcode Cloud đã chạy **xanh** một lần ở bước 14; (2) repo đã cấp quyền cho Xcode Cloud với **repo private** (bước 7 ghi chú private) — thử bằng cách khoá rồi bấm Start Build lại một lần; (3) iOS đã báo «build mới xong» và ảnh App Store cuối đã chụp. Sau khoá, mỗi lần chạy GitHub Actions macOS tính gấp 10 phút (xem `ACTIONS-MINUTES.md`).

## 10. Giới hạn thời gian: 1–3 giờ

Bước A ≈ 15 phút · B ≈ 45 phút · C ≈ 45 phút (chờ build) · D ≈ 5 phút. Nếu quá 2 giờ mà bước 14 chưa xanh: **dừng**, chụp log, trả Mac, đưa log cho em xem rồi hẹn lại (thuê tiếp tốn thêm). Chưa chắc/chưa kiểm: tên menu chính xác, có Homebrew trên máy build Xcode Cloud, số giờ máy thật.
