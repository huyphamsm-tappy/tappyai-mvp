# iOS — nhật ký tiến độ (phiên ios/sync-2026-09-30)

Worktree: `D:\TappyAI-wt\wtios` (dời từ `C:\wtios` ngày 30/09 vì ổ C: đầy). Nhánh `ios/sync-2026-09-30`
(từ `origin/rc/web-uat` fbb1c3c + merge `ci/ios-build-rc`). Không push lên rc/web-uat. Cache/phụ thuộc đặt trên D:.
Không có máy Mac: mọi thay đổi Swift CHƯA được biên dịch — CI (`.github/workflows/ios.yml`) là nơi biên dịch đầu tiên.

## Cụm 1 — hợp đồng chat + đăng nhập (đang làm)
| Việc | Trạng thái |
|---|---|
| `chatSessionId` (UUID mỗi chat, giữ khi mở lại từ lịch sử) | code + test viết, chưa build |
| Header `x-tappy-surface: ios`, `x-tappy-caps: ask` | code viết; server chưa nhận "ios" → IOS-REQUESTS |
| `[TAPPY_ASK]` parser + thẻ hỏi nhanh; `[TAPPY_PLAN]` đã có sẵn | code + test viết |
| Đăng nhập email + mật khẩu, Khách | code viết |
| Hub "Tôi" 9 mục + khoá khách | CHƯA |
| Đã lưu / Viết content / 18+ / Gợi ý / Onboarding theo mockup | CHƯA |
| Hồ sơ (ảnh bìa, tab Đã chia sẻ), đăng ảnh/video/YouTube | CHƯA |
| Ảnh chia sẻ mẫu 1/6/7, TikTok nhận file | CHƯA |
| FCM | CHƯA |
| Chuỗi quyền + PrivacyInfo | CHƯA |
| UI test simulator + ảnh chụp CI | CHƯA |
