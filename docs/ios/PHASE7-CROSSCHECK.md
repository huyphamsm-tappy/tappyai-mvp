# Đối chiếu Phase 7: Android (rc/web-uat) và iOS — 01/10/2026

Nguồn: `origin/rc/web-uat` (đã chứa `5f1ce4e`; đầu nhánh lúc đọc `03358ed`), `docs/uat/ANDROID-REQUESTS.md` (R22–R29), `docs/ios/IOS-REQUESTS.md` của web (I-1…I-5), mã `android/app/src/main/java/com/tappyai/app/*`, mã iOS trong nhánh `ios/sync-2026-09-30`.
«Ảnh» = số ảnh CI đã mở. Không có ảnh = chưa kiểm bằng mắt.

| Mảng | Android làm gì | iOS | File iOS | Ảnh |
|---|---|---|---|---|
| Chat — thẻ hỏi 5 mảng | `AskCard.kt`, `ask/AskCardModel.kt` | **Có.** Mảng theo id câu hỏi (`dish`, `service`, `origin`, `activity`, `line`…) y như web; mặc định trung tính, không rơi về du lịch | `Chat/Model/AskCardModel.swift`, `Chat/UI/AskCardView.swift` | 28, 29, 31, 32 + 61 (Bay từ đâu) |
| — id mới R28 `dest`, `style`, `device` | cùng mô hình | **Có (test ghim).** Web cũng không gán mảng cho `dest`/`device` ⇒ tiêu đề trung tính; `style` = LOẠI nhiều lựa chọn | `AskCardV2Tests.testR28Ids` | chưa có ảnh |
| Chat — thẻ kế hoạch v2 | `TripPlanCard.kt`, `plan/*` | **Có** (ảnh qua manifest R22; giá «chưa có giá — hỏi quán») | `Chat/UI/PlanCardView.swift`, `Chat/Model/PlanCardModel.swift`, `Core/Share/PlanImageManifest.swift` | 48–53 |
| Chat — thẻ địa điểm | `PlaceCard.kt` (chip lọc, cuộn ngang, gập, nhãn nút) | **Có** (làm đêm 30/09) | `Chat/UI/PlaceCardView.swift`, `Chat/Model/PlaceDecisionModel.swift` | 56–58 |
| — không vẽ lại địa điểm đã có trong lịch trình | `TravelPlaceFilter.kt` | **MỚI hôm nay** | `Chat/Model/TravelPlaceFilter.swift` (+ nối ở `ChatMessageList.swift`) | chưa có ảnh (test đơn vị) |
| — không còn «**» trong câu trả lời/thẻ | `CardMarkdown.kt`, `MarkdownNormalize` | **MỚI hôm nay** (cổng duy nhất `ContentParser.parse`; 1:1 với `markdownNormalize.ts`) | `Chat/Model/MarkdownNormalize.swift` | chưa có ảnh (test đơn vị) |
| Chat — nút đặt/mua, link vé/khách sạn | `CommerceActionLabel.kt`, `ChatCtaButtons.kt`, thẻ mua sắm | **Có phần hiển thị**: nhãn nút do server quyết (`labelKey`), mở link NGUYÊN VĂN, báo sự kiện CCP; link vé máy bay nằm trong lời (markdown). Việc server điền số người/ngày là phía server | `Chat/Model/CommerceActionLabel.swift`, `CommerceHandoffReporter.swift`, `Chat/UI/ShoppingDecisionCardView.swift` | 56 (nút địa điểm); mua sắm chưa có ảnh |
| Chat — lặp một câu trả lời hai lần | `ReplyRepeat.kt` (cổng 0,8 Dice) | **Thiếu** (chưa làm) | — | — |
| Chat — hỏi vị trí đúng lúc | `LocationPrompt.kt` (đo trên Galaxy A12) | **Khác**: iOS tự nhớ lựa chọn của người dùng và không hỏi lại sau khi từ chối; chưa có luật «hỏi khi gửi / khi bấm nút quanh đây» | `Chat/UI/ChatViewModel.swift` (`locationCoordinator.requestOnce`) | — |
| Chat — chia sẻ công khai theo cờ | `SharePublicDialog.kt`, `flags.publicShare` | **Thiếu** (iOS không đọc cờ này; chỉ nút «Xem kế hoạch đầy đủ») | — | — |
| Chat — mic | `VoiceListeningScreen.kt` | **Có** (màn nghe mới theo mockup, dọn mic ở mọi đường thoát) | `Chat/UI/VoiceListeningView.swift`, `Chat/Model/VoiceScreen.swift`, `Chat/Data/VoiceInputManager.swift` | 63, 64, 65 (65 sau sửa: chưa mở lại) |
| Chat — lịch sử | `history/*` | **Có.** Danh sách + mở lại: thẻ bền, ảnh markdown, nguồn. Server chỉ lưu `{role, content}` (xem IOS-REQUESTS I11) | `Profile/UI/ChatHistoryView.swift`, `Chat/UI/ChatViewModel.swift` | 62 |
| Khám phá — feed | `explore/*` | **Có** | `Reviews/UI/ReviewsFeedView.swift` | 59 (App Store 05) |
| Khám phá — hub, category | `discovery/DiscoveryHubScreen`, `DiscoveryCategoryScreen` (trong tab Trang chủ) | **Thiếu** | — | — |
| Bài đăng và clip | `reviews/*`, `share/*` | **Có** (đăng ảnh/video/YouTube, 6 bố cục chia sẻ). Đăng video chưa có ảnh CI | `Reviews/UI/CreateReviewView.swift`, `Core/Share/*` | chia sẻ: 9–13 (đã có từ trước) |
| Tôi / Hồ sơ | `profile/*` | **Có** (hub, chỉnh sửa, QR, hồ sơ người khác) | `Profile/UI/ProfileMainView.swift`, `EditProfileView.swift`, `ProfileQRView.swift` | 16, 19; App Store 07 |
| Cài đặt | `account/SettingsScreen` | **Có**, giống Android; **khác có chủ ý**: không có dòng «Âm thanh thông báo Tappy» (kênh thông báo riêng Android) | `Profile/UI/SettingsView.swift` | 33–36 |
| Thông báo bật/tắt | `notifications/*` | **Có** màn cài đặt; chưa nhận push (server, I9) | `Profile/UI/NotificationsSettingsView.swift`, `Notifications/NotificationManager.swift` | chưa có ảnh |
| Home | `home/*` | **Có** (V3, theo L12) | `Home/UI/HomeView.swift`, `HomeSectionViews.swift` | 23–27, App Store 04 |
| ScamShield | `scamshield/*` | **Có** (kiểm link) | `UtilityTools/UI/ScamShield/ScamShieldView.swift` | App Store 06 |
| Bản đồ | `maps/*` (không có chỗ nào gọi màn này) | **Thiếu — và Android cũng không dùng** | — | — |
| Đăng nhập | Zalo (có `state`), Google, email, (Apple không có) | **Có**: Zalo (MOB-1 `app_state`, chặn liên kết lạ), Google, email OTP + mật khẩu, Apple (ẩn tới khi server bật) | `Auth/*` | 01, 15, 20–22, 47 |
| Xoá tài khoản | R26/R29: gõ XÓA → xoá ngay | **Có** + chữ web R29 (hôm nay) | `Profile/UI/AccountDeletionView.swift` | 44–46, 66 |
| Báo cáo / chặn | (Phase 8) | **Có** sau cờ `p8` (mặc định tắt) | `Safety/*` | 37–43 |

## Việc thiếu, theo mức ảnh hưởng người dùng (chưa làm trong lượt này)

1. **ReplyRepeat** — một câu trả lời lặp hai lần trong cùng tin (Android đo được trên máy thật). Cổng thuần, port 1:1 từ `replyRepeat.ts`; cần quyết định có làm không.
2. **Luật hỏi vị trí** (`LocationPrompt`), **cờ chia sẻ công khai** (`publicShare`), **Khám phá hub/category** — ảnh hưởng thấp hơn hoặc cần đặc tả (Huy đã loại hub/category và L14 ở lượt trước).
3. Ảnh CI cho: đăng video, thông báo, mua sắm, `dest`/`device`.

## Việc cần server/web

- Push tới iPhone (I9), Apple provider + thu hồi token khi xoá (I8), cờ báo cáo/chặn trên production (I7): vẫn như `IOS-REQUESTS.md`.
- Hai bài kiểm web đang đỏ vì nhánh iOS (I12).
