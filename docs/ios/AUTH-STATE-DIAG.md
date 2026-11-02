# Chẩn đoán trạng thái đăng nhập iOS (01/10/2026, build TestFlight 93)

Mức chắc chắn: **đọc từ mã** (đã có) vs **chưa thử trên máy thật** (ghi rõ từng chỗ). Chưa có ảnh CI cho phần này (xem cuối).

## 1. App quyết định «đã đăng nhập hay chưa» ở đâu

| Chỗ | Việc |
|---|---|
| `Core/Session/SessionStore.swift` | Nguồn duy nhất: `state` = `.unknown / .anonymous / .onboarding / .authenticated`. Mọi màn hình hỏi `session.state.isAuthenticated`. |
| Keychain `auth.tokens` | Token (JWT + refresh) lưu ở đây. `bootstrap()` đọc lúc mở app. |
| Supabase SDK | Giữ phiên riêng; `AuthRepository.reconcileOnLaunch()` đối chiếu sau khi mở app. |
| Máy chủ | Chat coi người dùng là KHÁCH khi `!user || user.is_anonymous` (`src/app/api/chat/route.ts:678`). |

## 2. Gốc lỗi (từ mã)

**Gốc 1 — phiên khách bị coi là phiên tài khoản (loại A, lỗi iOS).** App xin một phiên *khách* (`POST /api/auth/anonymous`), đưa vào SDK và lưu Keychain như phiên thật. `bootstrap()` và `reconcileOnLaunch()` coi **bất kỳ token nào = đã đăng nhập**, không đọc cờ `is_anonymous` trong JWT. Hậu quả từ lần mở app thứ hai: máy nghĩ «đã đăng nhập» (nút người trên-trái ra «Đăng xuất», không có nút Đăng nhập), còn máy chủ vẫn coi là khách (chat/hồ sơ trả về trạng thái khách «Cần đăng nhập»). Đó là kiểu «nửa chừng» anh thấy: Đăng xuất trong khi đang là khách.

**Gốc 2 — nút «Đăng nhập để tiếp tục» trong chat chỉ đổi sang tab Cá nhân (loại A).** `ChatView` gọi `router.switchTo(.profile)`; muốn đăng nhập phải bấm thêm lần nữa ở thẻ Hồ sơ. Mỗi chỗ có một cửa đăng nhập riêng.

**Gốc 3 — phiên tài khoản hết hạn thì im lặng thành khách (loại A).** Khi không làm mới được token, `logout()` chạy ngầm: không thông báo, không xin lại phiên khách (chỉ xin lúc mở app sau) nên tin nhắn tiếp theo không có token → thẻ «Cần đăng nhập» ngay tin đầu. Mọi lỗi xác thực lạ (403, hết hạn…) cũng bị gộp thành «Cần đăng nhập».

**Chưa chứng minh được (cần máy thật / anh xác nhận):**
- Hồ sơ «Huy Phạm» ra «Theo dõi», 0 người theo dõi: logic `isSelf` đúng khi trạng thái đúng. Nếu anh thật sự đã đăng nhập xong ở bản 93 thì còn nguyên nhân khác chưa thấy; nếu phiên Google chưa hoàn tất (hộp thoại supabase.co rồi quay lại) thì app vẫn là khách và hiển thị đúng như thấy. **Cần anh cho biết: lúc đó anh đã đăng nhập xong ở bản 93 chưa, hay dùng phiên của bản 50?**
- Giả thuyết «Keychain đổi khoá giữa bản 50 và 93»: dịch vụ Keychain lấy theo bundle id (`com.tappyai.ios`), khoá `auth.tokens` — không thấy đổi trong mã; chưa kiểm lịch sử git (công cụ kiểm bị lỗi lúc làm). Phiên cũ không đọc được thì app rơi về khách, không báo gì (nay có thông báo, xem dưới).
- Production thiếu Phase 7: chat khách trên production có thể trả 401 thay vì 403/giới hạn (**loại B**, chưa thử vì không gọi production).

## 3. Máy trạng thái (sau khi sửa)

| Tình huống | App hiển thị |
|---|---|
| Mới mở, chưa có token | Khách; xin phiên khách; nút trái-trên = Đăng nhập; Hồ sơ = thẻ Đăng nhập |
| Có token **khách** (is_anonymous) | **Khách** (trước đây: «đã đăng nhập») |
| Có token tài khoản | Đã đăng nhập; Hồ sơ đầy đủ; nút trái-trên = Đăng xuất |
| Token tài khoản hết hạn, làm mới được | Như đã đăng nhập (êm) |
| Token tài khoản hết hạn, **không** làm mới được | Về khách + hộp thoại «Phiên đăng nhập đã hết, vui lòng đăng nhập lại» (nút Đăng nhập / Đóng) + xin lại phiên khách |
| Token có nhưng tải hồ sơ lỗi | Vẫn đã đăng nhập (hồ sơ rỗng), không văng về khách |
| Đăng xuất | Khách; xin phiên khách mới |
| Đăng nhập lại | Hộp thoại tắt, trạng thái tài khoản, thông báo xoá |
| Chat bị chặn «cần đăng nhập» → đăng nhập xong | Quay đúng chỗ đó, **gửi lại tin đang giữ** |

## 4. Đã sửa (mã)

1. `JWTClaims` đọc `sub` + `is_anonymous`; `SessionStore.bootstrap/didAuthenticate` và `AuthRepository.reconcileOnLaunch` không coi phiên khách là tài khoản.
2. **Một** cửa đăng nhập: `AppRouter.requestLogin()` → màn đăng nhập phủ toàn màn hình từ khung ứng dụng; chat, Hồ sơ, hàng khoá, biểu tượng người trái-trên đều dùng nó (không đổi tab). Sau đăng nhập: `loginCompleted` → chat gửi lại tin đã gõ; Hồ sơ tải lại.
3. Hết phiên: `SessionStore.expire()` + thông báo + xin phiên khách mới.
4. Màn đăng nhập: Google và Zalo ngang hàng, nền trắng viền mảnh, chữ đậm theo màu chính, logo từng bên (Zalo xanh `#0068FF` chữ trắng — như web/Android; bỏ nút cam chữ đen). Thứ tự: Apple (khi bật), Google, Zalo, hoặc, email + mật khẩu, mã qua email, tạo tài khoản, khách.
5. Hộp thoại «TappyAI muốn sử dụng supabase.co để đăng nhập» là hộp thoại **hệ thống** của `ASWebAuthenticationSession`, không tắt được bằng mã. Em thêm một dòng giải thích dưới nút Google. Chưa bật `prefersEphemeralWebBrowserSession` vì mất đăng nhập Google nhớ sẵn của Safari (mỗi lần gõ lại) — nếu anh muốn đổi thì nói. Tên miền đẹp hơn (đăng nhập qua `auth.tappyai.com` thay vì supabase.co) là việc Supabase/máy chủ → **ghi cho anh**: bật «custom domain» của Supabase (gói trả phí).
6. **Zalo trên production hiện tại:** app gửi `app_state` (MOB-1/I6) mà production **chưa biết** → máy chủ vẫn chạy luồng cũ, kết thúc ở trang web `/auth/confirm` chứ không quay về `tappyai://`. Hệ quả: hộp trình duyệt hệ thống dừng ở trang web (anh bấm Hủy thì đóng); nếu có quay lại mà không kèm state, app từ chối. Nay mọi lỗi Zalo hiện một dòng «Đăng nhập bằng Zalo trong ứng dụng chưa dùng được. Bạn tạm dùng Google hoặc email nhé.», màn không bị kẹt, Google/email không ảnh hưởng. **Chưa thử trên production** (không gọi). Hết hẳn khi web phát hành I6.
7. Khách chat: 5 câu trọn đời do **máy chủ** đếm (`ANON_LIFETIME_LIMIT = 5`, `anon_limit_reached`). iOS không tự chặn; chỉ hiện thẻ chặn khi máy chủ trả hết lượt / 401. «Tiếp tục với tư cách Khách» chỉ đóng màn hình (phiên khách đã có sẵn).

## 5. Test

- `AuthStateMachineTests` (đơn vị): claims, phiên khách khi mở app, phiên khách của SDK, đăng nhập → đăng xuất → đăng nhập lại, phiên khách không đè tài khoản, hết hạn không làm mới được (có/không thông báo, xin phiên khách), đăng nhập xoá thông báo, tin đang giữ chỉ gửi lại sau đăng nhập đúng loại lỗi.
- UI (`ScreenshotTests`): «Đăng nhập để tiếp tục» mở màn đăng nhập tại chỗ (ảnh 67, 68), Hồ sơ khách + không «Đăng xuất» (ảnh 69).
- **Chưa chạy trên CI** tại thời điểm viết; ảnh 67–69 chưa nhìn → ghi «chưa kiểm».

## 6. Việc của anh
- Cho biết lúc thấy lỗi anh đã đăng nhập xong ở bản 93 chưa.
- Quyết định có bật `prefersEphemeralWebBrowserSession` cho Google không (mất «nhớ đăng nhập» ở Safari).
- Sau khi CI xanh và anh cho phép: cài bản TestFlight mới, thử đăng nhập Google / email, mở chat khách, bấm «Đăng nhập để tiếp tục».
