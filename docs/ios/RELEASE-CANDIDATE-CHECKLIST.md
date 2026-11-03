# iOS — checklist ứng viên release cuối (02/10/2026)

Phạm vi: chỉ iOS. Web là nguồn tham chiếu. Không đụng AI Consultative (Luna 6.0, 35 câu mẫu). Mục việc Phase 8 ghi `DEFERRED TO PHASE 8`, không sửa.
Nhãn: `NO EVIDENCE` · `UNCERTAIN` · `LEGAL REVIEW NEEDED` · `BLOCKED — PRODUCTION DEPENDENCY` · `BLOCKED — WAITING FOR WEB EVIDENCE` · `MAC-ONLY — NOT EXECUTABLE ON WINDOWS`.

## 1. Chuỗi dữ liệu OpenStreetMap (OSM) → iOS

| Chặng | Bằng chứng |
|---|---|
| Nguồn OSM | Overpass và Nominatim được **server** gọi: `src/lib/ai/tools/food.ts`, `travel.ts`, `placesProvider.ts` (`PLACES_PROVIDER` mặc định `serper`, OSM là phương án dự phòng). iOS không gọi OSM: `ios/` không có bản đồ, tile, geocoder, routing; `ios/project.yml` chỉ có Supabase và Firebase |
| Server biến đổi | `src/lib/recommendation/buildEntity.ts:75` (`source === 'OpenStreetMap'` → provenance `osm`), `:95` (id `place:osm:<lat>,<lng>`); `marker.ts` `toPersisted` giữ tên, địa chỉ, giờ mở cửa, số điện thoại, ảnh nhà cung cấp |
| Phản hồi API | Khối `[TAPPY_PLACES]` JSON `{v:1, items:[…]}` (`marker.ts` `renderPlacesMarker`). Trường `id` của dòng OSM có tiền tố `place:osm:`. **Không có trường ghi nguồn OSM cho người dùng** trong `toPersisted` |
| Model iOS | `PlacesModels.swift` giải mã các trường trên; `source` trong `LiveCommerceObservedFacts` là của dữ liệu thương mại, không phải OSM |
| Giao diện iOS | `PlaceCardView.swift`: hiện `place.name`, `place.address`, `hoursLine` (giờ mở cửa), ảnh nếu có |
| Ghi nguồn hiện tại | **Không có** ở iOS (không có chuỗi OSM/attribution trong `ios/TappyAI`). `/privacy` liệt kê OSM là nhà cung cấp dữ liệu (`legal.ts`), không phải dòng ghi nguồn |
| Điều kiện của dữ liệu thật | Sản phẩm production có trả dòng OSM cho iOS hay không: **NO EVIDENCE** (chưa có request/response production) |

Phân loại (tài liệu OSMF: osmfoundation.org/wiki/Licence/Attribution_Guidelines; operations.osmfoundation.org/policies/tiles/ và /nominatim/):
- **Yêu cầu kỹ thuật:** chính sách tile chỉ áp dụng cho tile `tile.openstreetmap.org`; iOS không dùng → không áp dụng. Nominatim: giới hạn 1 yêu cầu/giây và User-Agent nhận diện: việc của server (WEB), `NO EVIDENCE` về việc server đã tuân thủ.
- **Yêu cầu giấy phép:** ODbL; OSMF chấp nhận "© OpenStreetMap contributors" và khuyến nghị "OpenStreetMap" kèm liên kết openstreetmap.org/copyright. Với kết quả geocoding, ghi nguồn riêng từng kết quả không bắt buộc nếu không tạo cơ sở dữ liệu phái sinh.
- **Diễn giải pháp lý:** thẻ địa điểm lấy từ Overpass có tạo "cơ sở dữ liệu phái sinh" hay không → `LEGAL REVIEW NEEDED`. Chưa kết luận iOS bắt buộc phải hiển thị ghi nguồn.
- Phân loại việc: `VERIFICATION GAP` (chưa có bằng chứng response production). Sửa iOS (dòng trong Cài đặt) chỉ làm nếu người am hiểu luật xác nhận là cần; chưa có bằng chứng đó.

## 2. Phân loại việc còn lại

| Việc | Loại | Evidence |
|---|---|---|
| Scam Shield khớp WEB | Đã sửa `ca2dd6d`; chờ ảnh | Xem mục 5 |
| Dải đen Khám phá | VERIFICATION GAP (chẩn đoán một lượt, run 37000177700) | `testExploreLayoutDiagnostic` |
| Phase 7 production: `/analyze`, `verdict`, `reason_vi`, báo cáo/chặn, push, Sign in with Apple, xoá tài khoản, 11 câu chat | `BLOCKED — PRODUCTION DEPENDENCY` | NO EVIDENCE từ production |
| Kiểm iPhone thật (đăng nhập, phiên, Apple, xoá tài khoản, push, báo cáo/chặn, Lá chắn, micro, chat cốt lõi) | VERIFICATION GAP; chưa chạy | Chỉ ghi khi đã chạy |
| Ô bắt buộc App Store Connect | RELEASE BLOCKER (việc của Account Holder) | Mục 3 |
| Ghi nguồn OSM trên iOS | `LEGAL REVIEW NEEDED` | Mục 1 |
| Thanh toán mới, đăng nhập xã hội mới, voice, sticker, media pipeline, Explore social/trending, voucher/affiliate, kiến trúc xoá tài khoản mới | `DEFERRED TO PHASE 8` | Không sửa |
| Mã chết `analyzeMessageDeeper` / `analyzeScamMessage` (không có đường vào giao diện) | NON-BLOCKER, dọn sau release | `ScamShieldViewModel.swift`, `UtilityToolsService.swift` |

## 3. App Store Connect — mỗi dòng: nguồn Apple · bằng chứng Tappy cần · trạng thái · chủ

Chủ mọi ô nhập liệu là Account Holder (Huy). Em không điền, không quyết thay.

| Mục | Nguồn Apple | Bằng chứng Tappy cần | Trạng thái | Chủ |
|---|---|---|---|---|
| App Privacy | developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy: phải khai trước khi nộp, gồm dữ liệu do bên thứ ba trong app thu thập; cần URL chính sách riêng tư | `PrivacyInfo.xcprivacy`; `APPSTORE-SUBMISSION.md` §4; Firebase Messaging, Supabase, nhà cung cấp AI | Trống (`APPSTORE-SUBMISSION.md` §1b) | Huy |
| Age Rating | …/reference/age-ratings-values-and-definitions: bắt buộc; có mục nội dung do người dùng tạo, nhắn tin/chat, truy cập web tự do. upcoming-requirements: cập nhật câu trả lời từ 31/01/2026 | Báo cáo/chặn theo cờ máy chủ (bản 106 có), nội dung người dùng đăng, chat AI | Trống | Huy |
| DSA trader status | …/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements: khai khi phân phối ở bất kỳ nước EU nào; nếu là trader, địa chỉ, số điện thoại, email hiện công khai | Danh sách quốc gia phân phối; Tappy có là trader hay không | Trống. `LEGAL REVIEW NEEDED` (trang Apple vừa nói phải khai khi nộp, vừa nói không phân phối ở EU thì không là trader — UNCERTAIN) | Huy |
| Content Rights | …/reference/app-information: phải có đủ quyền với nội dung bên thứ ba | `SOURCES-AND-CONTENT-RIGHTS.md` | Trống. `LEGAL REVIEW NEEDED` | Huy + người am hiểu luật |
| Ảnh màn hình | …/reference/screenshot-specifications: 1–10 ảnh; 6.9" là kích thước chính, 6.5" (1284×2778) được co lên nếu không có 6.9"; không kênh alpha | Bộ 9 ảnh trong `D:\TappyAI-backups\appstore-screenshots\` (bỏ `05-explore.png`), cần kiểm không alpha | Chưa tải lên (ASC khe 6.5″, `APPSTORE-SUBMISSION.md` §1b); ảnh 05 chờ chẩn đoán | Huy |
| Mô tả, từ khoá, subtitle, URL hỗ trợ | …/reference/app-information | `APPSTORE-SUBMISSION.md` §2 | Trống | Huy |
| App Review Information | …/reference/app-review-information: liên hệ (tên, email, số điện thoại quốc tế) bắt buộc; tài khoản demo bắt buộc nếu app đòi đăng nhập, không được hết hạn; ghi chú ≤ 4000 byte | `APPSTORE-SUBMISSION.md` §5; tài khoản demo trên production do anh tạo | Trống; **không tạo tài khoản từ phiên này** | Huy |
| Xuất/nén mã hoá | …/manage-app-information/overview-of-export-compliance: khai nếu app dùng mã hoá; `ITSAppUsesNonExemptEncryption` trong Info.plist bỏ qua câu hỏi mỗi lần nộp | Giá trị trong `Info.plist` (`APPSTORE-SUBMISSION.md` §1b ghi đã có `false`) | Cần xác nhận tay trong Info.plist: UNCERTAIN cho đến khi đọc lại | Huy + em |
| Giá, quốc gia | Trang Apple về giá/quốc gia: **NO EVIDENCE** (đường dẫn đã thử trả "Page Not Found") | — | Trống | Huy |
| Mac / Vision Pro | **NO EVIDENCE** từ trang Apple đã đọc | Đề xuất bỏ tick (`APPSTORE-SUBMISSION.md` §1c) | Trống | Huy |
| Yêu cầu SDK | developer.apple.com/news/upcoming-requirements: Xcode 26 trở lên từ 28/04/2026 | `ios.yml` có bước chặn Xcode < 26 (commit 67ab936); run 36996673948 dùng Xcode 26.6 | Có | Em |

## 4. Phiên Mac ngắn — thứ tự làm (MAC-ONLY — NOT EXECUTABLE ON WINDOWS)

Chi tiết từng bước nằm ở `MAC-DAY-CHECKLIST.md` và `XCODE-CLOUD-SETUP.md`. Tóm tắt:
1. Mở dự án: `cd ios && xcodegen generate`, mở `TappyAI.xcodeproj`.
2. Kiểm `xcodebuild -version` ≥ 26.
3. Resolve packages (Supabase `from 2.0.0`, Firebase `from 11.0.0`); commit `Package.resolved` nếu muốn dựng lại giống nhau. Hiện không có trong repo; **chỉ là blocker nếu build không lặp lại được**, mà workflow đã build xanh nhiều lần.
4. Signing: kiểm Team `6UAG75G2US`, bundle ID `com.tappyai.ios`, capability Push, Sign in with Apple, Associated Domains.
5. App Store Connect: bản 1.0, chọn build, điền các ô mục 3 (Huy).
6. TestFlight: build qua job `Archive + upload to TestFlight` (chạy tay trong `ios.yml`).
7. Xcode Cloud (tuỳ chọn): tạo workflow trong Xcode theo `XCODE-CLOUD-SETUP.md`.
8. GitHub Actions macOS: chạy workflow "iOS" thật, kiểm artifact.
9. Sau phiên Mac: Windows → `git push` → Actions macOS → build/test/archive/ký/upload TestFlight.
