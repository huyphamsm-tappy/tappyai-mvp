# iOS ↔ web ↔ Android — đối chiếu toàn bộ (đêm 01→02/10/2026, build 98)

Nguồn đọc (chỉ đọc): mã Android `android/app/src/main` (nhánh iOS đã trộn rc), mã web `src/` (cùng cây), ảnh CI iOS (run 36874765143 và 36897648918/kế tiếp), ảnh Android ở `D:\TappyAI-backups\android-parity-evidence\`. **Ảnh web UAT ở `gs://tappyai-uat-evidence/` KHÔNG đọc được từ phiên này** (lệnh gcloud bị từ chối) ⇒ cột «web» dựa trên MÃ web, không phải ảnh: ghi «chưa kiểm bằng ảnh». Mọi công ước lượng ghi **«ước lượng»**.

Loại: **A** lỗi iOS · **B** production chưa có Phase 7 (tự hết khi web release) · **C** iOS thiếu tính năng so với web/Android. Ảnh hưởng: **Chặn** (không dùng được) / **Khó dùng** / **Mỹ thuật**.

## 1. Bảng tổng (sau build 98)

| Màn / luồng | iOS hiện có | Khác / thiếu | Loại | Ảnh hưởng | Trạng thái 98 | Công (ước lượng) |
|---|---|---|---|---|---|---|
| Đăng nhập (tài khoản) | Google, Zalo, email + mật khẩu, mã qua email, tạo tài khoản, khách; một cửa duy nhất | trước đây: phiên khách bị coi là tài khoản, «Đăng nhập» ở chat chỉ đổi tab, hết phiên im lặng | A | Chặn | **Sửa** (ảnh 67–69, 72 đã nhìn ở 97) | — |
| Zalo | nút xanh #0068FF; báo thân thiện | production chưa có `app_state` (I6) | **B** | Khó dùng | giữ báo lỗi; I16 xin cờ `auth.zaloApp` | 0,5 giờ iOS sau khi web có cờ |
| Hồ sơ / Tôi | thẻ ảnh + tên + thống kê + 3 hàng + Cài đặt; «Tài khoản» mở 7 mục | Android/web để 9 hàng phẳng; Huy chọn gọn | A→sửa | Mỹ thuật | **Gọn** (ảnh 70, 71 đã nhìn ở 97) | — |
| Chat — bong bóng, markdown | người dùng xanh #007AFF, Tappy chữ thường; hết `**` | web/Android: cùng màu chính | — | — | giữ | — |
| Chat — avatar | mascot tròn (thay emoji robot) | — | A | Mỹ thuật | **Sửa** (ảnh 67) | — |
| Chat — chip hành động | cuộn ngang, nhãn không cắt (`fixedSize`) | trước: «Lên kế hoạch tri…»; chip «Gần bạn ✕» ở trên cao | A | Mỹ thuật | **Sửa** (chưa nhìn ảnh có chip «Gần bạn», cần vị trí thật) | — |
| Chat — thanh hành động dưới câu trả lời | sao chép, chia sẻ, loa, thử lại, thích, không thích, báo | đủ như web/Android (đọc mã `MessageActionBar`) | — | — | giữ | — |
| Chat — thẻ hỏi 5 mảng, kế hoạch, địa điểm | có (ảnh 28–32, 48–58, 61 ở các đợt trước) | — | — | — | giữ | — |
| Chat khách 5 câu | server đếm; iOS chỉ chặn khi `anon_limit_reached` | production có thể trả 401 sớm hơn | B (chưa thử) | Khó dùng | — | — |
| Đồng ý chia sẻ dữ liệu với AI | sheet một lần + công tắc Cài đặt + chặn ở lớp mạng | web/Android chưa có | C (iOS **thêm**, Apple 5.1.2(i)) | Chặn duyệt | **Làm** (ảnh 78–80) | — |
| Khám phá (feed clip) | ảnh bìa dưới video, vòng tải, lỗi + «Thử lại», nút «+» góc phải trên, thời gian «49 ngày trước» | trước: vùng đen, «+» đè mô tả, «49n» | A | Khó dùng | **Sửa** (ảnh 84; **tiếng chưa nghe thật**) | — |
| Clip — tải chậm | đệm 4 s, ảnh bìa ngay | clip production 1,6–2 Mbps, moov đầu, Range OK (số đo I15) — **không do định dạng** | A (app) + gợi ý pipeline | Khó dùng | **Sửa phía app**; pipeline: I15 | HLS/720p: 1–2 ngày web (ước lượng) |
| Trang cá nhân người khác | lưới 3 cột đều, tỉ lệ 3:4, bo góc; nút «Theo dõi» 168 pt | trước: ảnh lệch ngoài mép, chồng nhau | A | Khó dùng | **Sửa** (ảnh 73) | — |
| Ưu đãi | tên đối tác một lần; dòng phụ = mô tả; chip không cắt | dữ liệu production: `title` = tên đối tác, không logo/banner ⇒ chữ cái đầu | A (+ dữ liệu) | Mỹ thuật | **Sửa** (ảnh 74) | logo thật: cần web gửi `logoImage` |
| Lá chắn lừa đảo | kiểm link; **thư viện 25 tình huống Bộ Công an** (dữ liệu chung với Android) + nguồn nổi bật + «Đọc cảnh báo gốc» + «TappyAI không phải cơ quan nhà nước» + khối **gọi 113** cố định | thiếu: kiểm tin nhắn (`analyze` chỉ có Phase 7), kiểm mã QR, lịch sử, chia sẻ kết quả (I19) | **B** (tin nhắn) / **C** (QR, lịch sử, chia sẻ) | Khó dùng | **Làm** (ảnh 75–77) | QR: ~1 ngày; tin nhắn: 0,5 ngày sau release; lịch sử + chia sẻ: 1 ngày (ước lượng) |
| Báo cáo / chặn | theo hợp đồng cuối server; ẨN khi `p8` thiếu | route cũ `POST /api/reports` không có | A (đã đổi) | Chặn duyệt App Store | **Đổi** (bài kiểm `SafetyTests`); cờ server phải bật (I7) | — |
| Scan văn bản, Ăn nhóm, Dịch, Bài viết mới | màn có; xem ảnh 81–85 | chưa kiểm chạy thật với dữ liệu server (cần iPhone + tài khoản) | ? | — | **ảnh** nếu CI chụp được; chạy thật ở HÀNG CHỜ của Huy | — |
| Cài đặt | tuỳ chọn (Thông báo, Bộ nhớ, **Chia sẻ dữ liệu với AI**, Ngôn ngữ, Giao diện); khác (Hướng dẫn, Điều khoản, Riêng tư, Bản quyền, Xoá TK) | Android không có dòng AI | C(iOS thêm) | — | giữ | — |
| Chủ đề sáng/tối | **mặc định theo hệ thống** (Sáng/Tối/Hệ thống) | **Android**: System/Light/Dark, mặc định theo hệ thống ✔ giống iOS. **Web**: mặc định **TỐI** trừ khi chọn Sáng (`localStorage.theme !== 'light'`) | khác web | Mỹ thuật | **Giữ theo Android** (chuẩn đã duyệt). Muốn «tối mặc định như web» chỉ đổi 1 dòng `ThemeManager` | 0,1 giờ |
| Xoá tài khoản | chỉ «App Store»; cờ server | cờ production TẮT (I10) | B | Chặn duyệt | giữ | — |
| Home | theo Android (L12) | — | — | — | giữ | — |
| Onboarding | theo Android | đề xuất 4 bước vs 2 bước | — | — | mặc định Android | — |
| Thông báo đẩy | có đăng ký | server chưa gửi cho iOS (I9) | B | — | không làm | — |
| Sign in with Apple | ẩn tới khi bật cờ | — | B | Chặn duyệt (4.8) | không làm | — |

## 2. Việc Android/web có mà iOS chưa có (loại C) — danh sách

1. Scam Shield: kiểm mã QR, lịch sử kiểm tra cục bộ, chia sẻ kết quả, kiểm tin nhắn (B) — I19.
2. Trang người khác: ảnh bìa (server không trả `cover_url`, I5).
3. Một số mục trong `ANDROID-REQUESTS.md` / `IOS-REQUESTS.md` còn mở: I6 (Zalo), I7 (bật cờ báo cáo/chặn), I8 (Apple), I9 (push), I10 (cờ xoá TK).
4. Cache đĩa cho clip đã xem (chưa làm; đã có đệm ngắn + ảnh bìa).

## 3. Cái làm ở build 98 theo mức

1. Chặn/sai chức năng: trạng thái đăng nhập, một cửa đăng nhập, hết phiên, đồng ý AI, báo cáo/chặn theo hợp đồng.
2. Chức năng quan trọng còn thiếu: thư viện 25 tình huống + 113, ảnh bìa/thử lại clip, tiếng clip (nút loa bật lại được).
3. Thanh tab/ô nhập/bong bóng/thẻ: avatar mascot, chip, vị trí «Gần bạn».
4. Mỹ thuật: lưới trang cá nhân, Ưu đãi, thời gian, nút «+».

## 4. Ảnh ghép (iOS cạnh Android và web UAT)

Thư mục `docs/ios/parity/`: 3 ảnh ghép (Ưu đãi, Hồ sơ của mình, Trang cá nhân người khác) — ảnh Android của phiên Android đã có **web UAT cạnh Android**, em thêm iOS bên trái. Các màn còn lại (Home, Chat trống, thẻ địa điểm/kế hoạch, Cài đặt, Khám phá, ScamShield, đăng nhập) **chưa ghép được**: không có ảnh web/Android cùng màn trong thư mục bằng chứng, và `gs://tappyai-uat-evidence` không đọc được từ phiên này. Dữ liệu iOS: máy chủ giả dựng **giống production hiện tại** (Ưu đãi) và dữ liệu giàu giống UAT (feed, hồ sơ). Xem `parity/README.md`. Khác biệt đã thấy ngoài bảng §1: trang cá nhân người khác web/Android có banner + 4 chỉ số + số đếm trên tab; iOS 3 chỉ số, không bìa (C, mỹ thuật, ~0,5 ngày — ước lượng).

## 5. Điều tự đoán / chưa kiểm

- Cột «web» là từ mã, không ảnh. Thời gian tới khung đầu trên iPhone: ước lượng.
- Chưa chạy thật trên iPhone: tiếng clip, mic, đăng nhập Google/email, đồng ý AI — nằm trong danh sách kiểm sáng mai.
- App Store Connect: tiện ích Chrome bị chặn đọc trang («Chrome blocked the extension») ⇒ **chưa kiểm**.
