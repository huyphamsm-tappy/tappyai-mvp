# BÀN GIAO 26/11/2026 (ghi 25/11 đêm) — iOS: UAT vòng 1, build #256 trên TestFlight, việc làm tiếp

Người đọc: phiên Claude mới. **Đọc hết file này, rồi đọc `HANDOFF-20261123-ios-brain-parity-release-1.1.0.md` (luật làm việc mục 1 vẫn đúng hoàn toàn).** Người dùng là anh Huy, chủ sản phẩm, không phải dân lập trình. Nói tiếng Việt, ngắn, thật, tách nhãn **ĐÃ KIỂM / SUY LUẬN / CHƯA KIỂM**. Kỹ thuật là việc của Claude, đừng hỏi anh câu kỹ thuật.

## 0. Đọc nhanh

1. Nhánh iOS duy nhất: `ios/consolidated-20261122`, cây `D:\TappyAI-wt\wt-ios-messenger`. Đã push tới `09a4ffc`; CI xanh trên đúng commit đó (lần chạy lại, lần đầu bị hủy vì runner, không phải lỗi mã).
2. **TestFlight build #256** = `09a4ffc` (run `45662179140`): job tải lên xanh; anh Huy đang UAT vòng 1 bản này. Bản công khai trên App Store vẫn là build 214 (1.0.0); 1.1.0 chưa nộp duyệt (anh tự nộp, Claude không bấm).
3. **Việc anh dặn cho ngày mai, chưa làm:** (a) nộp duyệt Apple + sản phẩm IAP (việc của anh); (b) xóa toàn bộ tài khoản test và clip trên bản iOS (cần anh đưa danh sách email + phạm vi clip; xem mục 5); (c) sửa tiếp theo ảnh chụp UAT của anh.
4. **Luật mới học trong ngày (quan trọng):**
   - **Không push khi một lần chạy TestFlight (`workflow_dispatch`) đang chạy**: push làm hủy nó (build #244 bị hủy như vậy). Chỉ push khi job "Archive + upload" đã xanh, hoặc đợi xong.
   - Một lần chạy CI "cancelled" mà không có bước nào chạy = runner lỗi, dùng `gh run rerun <id>`, không phải lỗi mã.
   - **Kiểm kết quả mọi lần Edit.** Có lần Edit ProductFlags không áp dụng (chưa Read tệp) làm CI đỏ.
   - Web để **phiên web** sửa; Claude iOS chỉ lo iOS (anh dặn 25/11). Không sửa `wt-integration`.
   - Không có Mac: Swift chỉ biên dịch trên CI. Chưa có CI xanh thì không ghi PASS. Nhiều thay đổi UI hôm nay CHƯA ai xem trên máy thật.

## 1. Trạng thái bản #256 (CHƯA kiểm bằng mắt, CI chỉ chứng minh biên dịch + logic)

Đã có trong #256 (theo thứ tự việc):
- Nhóm ăn G1–G8: `requiresAuth`, trạng thái chờ duyệt + rút lại, chủ nhóm duyệt/từ chối/xóa, rời/xóa nhóm, 3 thẻ gợi ý + bình chọn + chốt khi hòa, chia bill (server tính), ảnh nhóm.
- Lịch sử chat theo cấu trúc web (nhóm theo ngày giờ VN, ghim, lưu trữ, tìm bỏ dấu kể cả đ, xem thêm); **nút Lịch sử + Cuộc trò chuyện mới ngay trên màn Chat** (sheet).
- Thông báo vi phạm + kháng nghị trong app; chuông có số đỏ trên mọi tab (trừ Khám phá) mở thẳng Hộp thư; hộp thư mở tab Thông báo khi chỉ có thông báo chưa đọc.
- Ẩn Quét/Tỷ giá/Coi bói/Gợi ý cho bạn như web. Link `/r`, `/plan`, `/scam-shield` mở trang. Tìm bài viết (place/nội dung/hashtag). Danh sách ai đã thích. Tạo link kết quả Scam Shield (cờ `flags.publicShare`). Thẻ "Điểm đến" trong Tappy biết gì.
- Clip có tiếng ngay (không chạm thêm); vuốt ngang đổi tab Theo dõi/Dành cho bạn/Mới nhất; thẻ chia sẻ kế hoạch 7 ngày × 8 điểm.
- Đính kèm chat: Chụp ảnh / Chọn ảnh / Chọn tệp (ảnh + PDF), mỗi picker một view riêng.
- **Chat**: giống ChatGPT (một khung bo tròn: +, chữ, mic, nút gửi tròn), bỏ hàng nút gợi ý + nút emoji, màn trống = mascot + câu chào theo giờ như web (có tên); **theo Cài đặt → Giao diện (sáng/tối/hệ thống)**, màu tối = web `#0A0F1C`, màu sáng = web light. Câu hỏi gợi ý SAU câu trả lời **giữ nguyên** (anh dặn giữ).
- **Trang chủ** theo web: chào → ô hỏi thật → 5 thẻ "Hỏi Tappy thử" (bộ sinh + chọn ảnh/mascot port từ web) → công cụ → tiếp tục; bỏ banner/Scam Shield/video/hàng danh mục.
- Ưu đãi: thẻ đối tác lên trước, luôn tải; deal lỗi không giấu thẻ đối tác. Chia tiền: tip không âm, làm tròn .5 như web. Scam Shield: hotline bấm gọi, bỏ câu lặp INCONCLUSIVE.
- **Logo mới**: icon app (cắt bỏ viền trắng, cùng hình), logo chia sẻ + đăng nhập thay bằng `otter-logo.png` của web (512px). `OtterMark` (thẻ chia sẻ) giữ nguyên.
- Hàng danh sách bấm được cả chiều ngang (contentShape, 24 hàng/14 tệp).
- "Đọc nhanh": lọc đoạn giống CSS/JS (lỗi CNBC). Thẻ kế hoạch: bỏ nút "Xem kế hoạch đầy đủ trên Tappy" (link vẫn ở bảng chia sẻ).
- **Nhắc cập nhật** (`Core/AppUpdate`): hỏi App Store, hộp thoại "Có bản mới" (Để sau = 24 giờ); màn ép cập nhật khi `flags.iosMinVersion` > bản đang chạy (**trường này CHƯA có trong `/api/config`, phiên web cần thêm**). Chỉ có tác dụng sau khi bản mới công khai trên App Store.

## 2. Phát hiện UAT + điều tra (cho phiên sau)

- **Ảnh mô tả trong câu trả lời + thẻ kế hoạch kiểu mới của web** phụ thuộc cờ web. Anh đã kiểm Vercel Production: **không có** `NEXT_PUBLIC_WORKSPACE_V206`, `NEXT_PUBLIC_RESPONSE_PRESENTATION`, `NEXT_PUBLIC_PRESENT_BLOCKS`, `CONSULT_ONE_BRAIN_MEDIA`, `CONSULT_PRESENT_BLOCKS`, `CONSULT_PLAN_V2` (tắt). `CONSULT_PRODUCTION_ALLOW` có (giá trị ẩn). `SERPER_API_KEY` có. Muốn có ảnh/khối mới: phiên web tạo biến + thêm tên vào `CONSULT_PRODUCTION_ALLOW` + build lại web. iOS đã có mã vẽ (`tappy.subject_images.v1`, doc_media, presentation blocks); thử lại khi web bật.
- Thẻ kế hoạch iOS = kiểu brochure (hero "TAPPY PLAN"), **khác** TripTimeline v206 của web (tab ngày + chip giờ + ảnh điểm). Khi web bật V206 thì đối chiếu lại iOS.
- Thông báo đẩy hằng ngày: lịch cron có đủ trong `vercel.json`; nghi ngờ cao: tin FCM gửi chỉ có `data`, không có khối `notification/apns` nên iPhone có thể không hiện banner (`fcm.ts`); cần khóa APNs trên Firebase + `GoogleService-Info.plist`. **Việc của phiên web**; anh cần xem Vercel Cron logs, Supabase `notification_subscriptions`, cột `push_status`.
- Web: lịch sử chat chỉ "đi kèm khung chat" ở bản máy tính (cờ `NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED`); trên điện thoại web cũng nằm trong Hồ sơ. `/chat` desktop không có đường vào thông báo nếu thiếu `SHELL_REF`. Route `/api/link-preview` chưa lọc CSS (`scriptLike`).
- Lệch giao diện web↔iOS còn lại (báo cáo tác tử 25/11): màu xanh nút `#0062CC` vs `#007AFF` (chat đã đổi, phần còn lại chưa), nền chung `#F5F7FA/#0A0F1C`, bo góc `lg`=16, biểu tượng tab (Khám phá = la bàn), chấm đỏ nên ở Khám phá theo web, Hồ sơ nên gom "Tài khoản" 1 hàng, nhóm ăn thiếu dòng "Nhóm riêng tư…" và tiêu đề "Yêu cầu chờ duyệt (n)". Các thẻ con trong câu trả lời (kế hoạch/quán/bảng) dùng token thích ứng, ra `#1C1C1E` ở tối, chưa đúng `#111827`; thẻ kế hoạch có bảng màu riêng nên có thể vẫn tối khi chat ở chế độ sáng.

## 3. Việc làm tiếp (đề xuất thứ tự)

1. Đọc ảnh/ghi chú UAT mới của anh, sửa theo đó (mỗi sửa một commit; Hỏi trước khi push? — anh đã cho phép đẩy nhánh `ios/consolidated-20261122` + gửi TestFlight trong phiên 25/11; giữ cách làm: push → CI xanh → `gh workflow run ios.yml --ref ios/consolidated-20261122`).
2. Kiểm chat chế độ sáng (thẻ con, thẻ kế hoạch, markdown), composer, câu chào, hộp thư, chuông.
3. Đồng bộ màu/bo góc còn lại với web (mục 2).
4. Khi anh đưa danh sách: xóa tài khoản test/clip (mục 5).
5. Chờ anh: sản phẩm IAP (gói Pip/MoMo/Coco/Tappy) → làm màn gói đăng ký iOS; migration `20261202` → 18+ một nút (chưa làm, chạm cổng tuổi, cần dự phòng khi route 503).
6. Chưa làm từ audit: mở link mời nhóm vào luồng chờ duyệt (G9), chuông thêm vào tab Khám phá, chip Wikipedia/ngăn kéo, "hỏi Tappy về clip".

## 4. Lệnh hay dùng

- Theo dõi CI sau push: `gh run list --repo huyphamsm-tappy/tappyai-mvp --workflow ios.yml --branch ios/consolidated-20261122 --event push --limit 1 --json databaseId,headSha`, rồi `gh run watch <id> --exit-status --interval 30` chạy nền. Đọc lỗi: `gh run view <id> --log` lưu ra tệp rồi tìm `\.swift:[0-9]+:[0-9]*: error` và `: error: -\[`.
- TestFlight: `gh workflow run ios.yml --repo huyphamsm-tappy/tappyai-mvp --ref ios/consolidated-20261122` (chỉ khi CI xanh đúng commit; số build = run_number của lần dispatch). Chạy `gh` từ thư mục `D:\Claude\Projects\TappyAI\.worktrees\g1-growth` (cây này có 13 tệp iOS sửa dở KHÔNG phải của việc này: đừng đụng).
- Mẫu dùng tác tử: giao tác tử đọc-chỉ để điều tra, hoặc giao tác tử sửa theo vùng tệp riêng (không commit), Claude xem lại, commit từng việc. Tác tử không biên dịch được: CI là nơi duyệt.

## 5. Xóa tài khoản test + clip (CHƯA LÀM, cần anh)

Bản iOS nói chuyện với **Supabase production** (`fwznnobrdctuskgrvuik`; UAT là `zdaprdfgpbxyofagmc`, đừng nhầm). Claude không có và không dùng khóa production. Đề xuất: Claude viết tệp SQL (phần 1 chỉ SELECT liệt kê tài khoản/clip/bình luận; phần 2 xóa trong một giao dịch, chỉ đúng email anh ghi) để anh tự chạy trong Supabase SQL editor; clip còn nằm trong Storage nên phải xóa tệp riêng. Cần anh đưa: danh sách email tài khoản test; "các clip hiện có" = toàn bộ clip hay chỉ của tài khoản test. Đối chiếu cấu trúc bảng bằng migration trong `wt-integration/supabase/migrations` trước khi viết. Hoặc anh dùng "Xóa tài khoản" trong app (cờ `accountSelfDelete`).

## 6. Prompt dán vào phiên mới

> Anh là Huy, chủ sản phẩm TappyAI (không phải dân lập trình). Nói tiếng Việt, ngắn, thật, nhãn ĐÃ KIỂM/CHƯA KIỂM. Kỹ thuật là việc của em, tự quyết; chỉ hỏi quyền, tiền, gu sản phẩm, riêng tư, production. **Việc: tiếp tục bản iOS TappyAI sau UAT vòng 1.** Đọc trước: `D:\TappyAI-wt\wt-ios-messenger\docs\handoff\HANDOFF-20261126-ios-uat-vong1.md` (cả file) rồi `HANDOFF-20261123-ios-brain-parity-release-1.1.0.md` mục 1 (luật). Nhánh `ios/consolidated-20261122`, cây `D:\TappyAI-wt\wt-ios-messenger`. Web do phiên web lo, không sửa `wt-integration`. Bản TestFlight #256 anh đang thử; em chờ ảnh/ghi chú của anh rồi sửa từng việc, mỗi việc một commit. Luật cứng: sửa mã chỉ bằng Edit/Write (đọc tệp bằng Read trước khi Edit, kiểm kết quả mỗi Edit), tệp LF; không có Mac nên chưa có CI xanh thì không ghi PASS; KHÔNG push khi một lần chạy TestFlight đang chạy; không đụng production/khóa/App Store Connect/nút Submit; giữ cây `g1-growth` và 10 cây One Life.
