# iOS — nhật ký tiến độ (phiên ios/sync-2026-09-30)

Worktree: `D:\TappyAI-wt\wtios` (dời từ `C:\wtios` ngày 30/09 vì ổ C: đầy). Nhánh `ios/sync-2026-09-30`
(từ `origin/rc/web-uat` fbb1c3c + merge `ci/ios-build-rc`). Không push lên rc/web-uat. Cache/phụ thuộc đặt trên D:.
**Không có máy Mac: mọi thay đổi Swift CHƯA được biên dịch** — CI (`.github/workflows/ios.yml`, chạy trên push nhánh `ios/**`)
là lần biên dịch đầu tiên. Bảng dưới chỉ ghi "PASS" khi có ảnh chụp CI; chưa có run nào thì trạng thái là "code viết".

Việc cần Huy đăng nhập: `docs/ios/IOS-REQUESTS.md` §3 (một lần). Yêu cầu server/Apple: cùng file.

## Cụm 1 — hợp đồng chat, đăng nhập, màn theo mockup, push, quyền riêng tư

| Việc | Trạng thái | Commit |
|---|---|---|
| `chatSessionId` (UUID v4 chữ thường mỗi chat, lưu theo id lịch sử để mở lại giữ nguyên) | code + test (`ChatContractTests`) | 679d6a0 |
| Header `x-tappy-surface: ios`, `x-tappy-caps: ask` | code + test; server chưa nhận `ios` → REQUESTS I1 | 679d6a0 |
| `[TAPPY_ASK]` parser + thẻ hỏi nhanh (`AskCardView`); `[TAPPY_PLAN]` đã có sẵn từ trước | code + test | 679d6a0 |
| Đăng nhập email + mật khẩu, nút Khách, "nhận mã qua email" giữ làm phụ | code | a6ed6d1 |
| Hub "Tôi": đúng 9 dòng, thẻ khách, dòng khoá "Cần đăng nhập" | code | 88af7fa |
| Đã lưu (hero, chip Tất cả/Địa điểm/Bài viết/Video, 2 thẻ đếm, thẻ rỗng, mascot) | code | 7cf0413 |
| Viết content (hero, logo FB/TikTok/IG, "Thử gợi ý", tone có icon, độ dài có mô tả, nút gradient, kết quả + Copy tất cả/Viết lại) | code | 5082932 |
| Cổng 18+ thành màn riêng (Ngày/Tháng/Năm) — chat + Gợi ý | code | fed7740 |
| Gợi ý cho bạn (hero, thẻ ảnh/xếp hạng/sao/hoạt động/đánh giá); "Hỏi Tappy về chỗ này" trước đây KHÔNG gửi gì — nay gửi thật qua `router.chatSeed` | code | 5324c00 |
| Onboarding: header + thanh 2 đoạn + "Bước 1/2" (giống Android: 2 bước) | code | (cụm này) |
| Ảnh bìa (tải lên/gỡ) trong Sửa hồ sơ; hồ sơ người khác có tab Bài đăng / Chia sẻ | code | 4574fe7 |
| Hồ sơ của mình 5 bộ sưu tập (Bài viết/Đã thích/Đã lưu/Đã ẩn/Đã share) | ĐÃ CÓ sẵn (`MyPostsView`) | — |
| Đăng ảnh / video / YouTube | ĐÃ CÓ sẵn (`CreateReviewView`, link provider theo `/api/config`) | — |
| Cài đặt → Chính sách: mở trang web `/privacy` | ĐÃ CÓ sẵn (`LegalPageView` = web view của `/privacy`) | — |
| Push qua Firebase Cloud Messaging (`provider: "fcm"`); không có plist thì push tắt, app vẫn chạy | code; cần Huy làm REQUESTS §3 | (cụm này) |
| Chuỗi xin quyền camera/ảnh/vị trí/micro (vi+en, khớp `/privacy`) + `PrivacyInfo` thêm Device ID (FCM) | code + test | (cụm này) |
| UI test simulator + ảnh chụp từng màn + ghép cạnh ảnh Android (artifact `ios-screenshots`) | code; **chưa có run nào** | (cụm này) |

## Chưa làm (cụm 2)
- Ảnh chia sẻ theo mẫu 1/6/7 (thẻ review/clip/gợi ý sáng 1080×1920, ảnh kế hoạch tối, QR hồ sơ), màn chia sẻ mẫu #6, "Lưu về máy",
  TikTok nhận FILE ảnh/video, ghi lịch sử chia sẻ (`POST /api/reviews/{id}/share`).
- Giao diện câu trả lời tư vấn theo khung mới — CHỜ Luna (không làm).
- Build TestFlight sau khi cụm 2 xong và CI xanh.

## Ghi chú kỹ thuật
- Ảnh Android dùng để ghép là ảnh HIỆN TRẠNG 28/09 đã commit (`docs/uat/evidence/android-parity/step1-hientrang`), không phải bản
  cuối; ảnh Android cuối nằm ngoài git (GCS). Ghi rõ trên từng ảnh ghép.
- Hook `-uitest-route` chỉ có trong build DEBUG (`App/UITestLaunch.swift`), archive Release không chứa.
- Chưa dịch: DM (tin nhắn riêng), Smart Tools hub, Games (Android có, iOS chưa từng có) — ngoài phạm vi prompt.
