# iOS: làm trên Windows, build trên máy macOS của CI (02/10/2026)

Mục tiêu: Windows viết mã và kiểm tĩnh → `git push` → GitHub Actions (macOS) build, test, ký, tải lên TestFlight. Xcode Cloud là phương án dự phòng riêng của Apple, KHÔNG phải GitHub Actions.

## Lệnh nào chạy ở đâu

| Việc | Lệnh | Chạy được trên Windows? | Có sẵn trong repo? |
|---|---|---|---|
| Kiểm tĩnh (chuỗi, plist, cú pháp script, không lộ khoá) | `python ios/scripts/static_check.py` | **CÓ** (đã chạy 02/10: tất cả PASS) | Có (`ios/scripts/static_check.py`) |
| Sinh dự án Xcode | `xcodegen generate` (trong `ios/`) | MAC-ONLY — NOT EXECUTABLE ON WINDOWS | Có `ios/project.yml`; CI chạy bước này |
| Build cho simulator | `xcodebuild build …` | MAC-ONLY — NOT EXECUTABLE ON WINDOWS | Có, workflow `iOS` |
| Test đơn vị Swift (`TappyAITests`) | `xcodebuild test -only-testing:TappyAITests` | MAC-ONLY — NOT EXECUTABLE ON WINDOWS | Có, workflow `iOS` |
| Test giao diện + ảnh | `xcodebuild test … TappyAIUITests` | MAC-ONLY | Có (commit có `[shots]`, hoặc chạy tay) |
| Máy chủ giả cho test giao diện | `python ios/scripts/ui_stub_server.py` | Cú pháp kiểm được trên Windows; dùng thật cần simulator | Có |
| Archive + ký + tải lên TestFlight | job `Archive + upload to TestFlight` trong `ios.yml` | MAC-ONLY (chạy tay: workflow_dispatch) | Có |
| Chờ App Store Connect xử lý build | `ios/scripts/asc_wait_for_build.py` | Cú pháp kiểm được; chạy thật cần khoá API (bí mật) | Có |
| Xcode Cloud: tạo workflow, nối kho mã | Xcode trên Mac | MAC-ONLY — cần một phiên Mac | Có `ios/ci_scripts/*.sh`; chưa tạo workflow |
| Khoá/chứng chỉ/profile ký | Apple Developer + secret GitHub | Không cần Mac để đặt secret; ký thật chạy trên máy macOS của CI | Tên secret có sẵn (không đọc được giá trị) |

## Còn thiếu (đề xuất, chưa làm)

1. Ghim phiên bản Xcode: `ios.yml` dùng `macos-latest`, không chọn Xcode (log run 36996673948: Xcode 26.6). Apple đòi Xcode 26+ từ 28/04/2026 (https://developer.apple.com/news/upcoming-requirements/).
2. Không có cache cho Swift packages và không có `Package.resolved` trong repo: phiên bản Supabase/Firebase trôi trong khoảng `from: "2.0.0"` / `"11.0.0"`.
3. Chưa có bước `static_check.py` trong CI (thêm một dòng, chạy được trên Linux).
4. Chưa tạo workflow trong Xcode Cloud (cần Mac).
