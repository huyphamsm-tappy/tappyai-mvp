# TappyAI — Bàn giao UAT thủ công

Cập nhật **2026-09-25** (PRELAUNCH Part 7). Tài liệu này thay bản 2026-09-21: bản cũ ghi port 3000 và nhánh `uat/release-audit-2026-09`, cả hai đã lỗi thời.

**Bạn đang dùng bản nào?** Chạy lệnh dưới đây trong thư mục repo:

```bash
npm run whoami
```

Kết quả đúng phải có: `branch: rc/web-uat`, `supabase: zdaprdfgpbpnxyofagmc ✅ audit/non-prod`, `dev port: 3007`. Trên web, góc dưới bên trái có huy hiệu `audit dev · g1-place-guard · rc/web-uat @ <sha> · supabase: zdaprdfgpbpnxyofagmc` cho biết cùng thông tin này.

> Toàn bộ UAT chạy trên project Supabase **audit** (`zdaprdfgpbpnxyofagmc`). **Không có gì ở đây chạm vào production.** Guard `scripts/prodEnvGuard.mjs` chặn `dev`, `build` và `start` nếu thấy ref production.

---

## 1. Khởi động

### Web

Làm trong worktree `D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\g1-place-guard`:

```bash
npm run dev
```

- Server chạy ở **http://localhost:3007** và in `Ready` sau vài giây.
- Lần mở đầu tiên mỗi trang sẽ chậm vì Next biên dịch khi được gọi.
- `.env.local` đã trỏ sẵn vào audit. `NEXT_PUBLIC_APP_URL` và `NEXT_PUBLIC_SITE_URL` là `http://localhost:3007`. Không commit file này.
- Dừng server: Ctrl+C. Nếu server kẹt hoặc cache hỏng:

```bash
PORT=3007 npm run dev:reset -- --keep
```

  ⚠️ Phải truyền `PORT=3007`. Script reset mặc định dùng 3000, còn `npm run dev` chạy ở 3007.
- **Không chạy hai `next dev` cùng lúc trong cùng thư mục.** Cái thứ hai sẽ xoá CSS của cái đầu.

### Android (emulator, bản debug trỏ vào web local)

1. Mở Android Studio → Device Manager → chạy emulator (bản đã dùng: `Pixel_8_uat`, Android 15).
2. Web phải đang chạy ở :3007.
3. Build và cài (PowerShell, trong worktree):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uat\build-android-local.ps1
```

   Script lấy URL và anon key Supabase audit từ `.env.local`, không in ra. API trỏ vào `http://10.0.2.2:3007/`, là đường emulator dùng để tới localhost của máy bạn. Script **từ chối chạy** nếu `.env.local` không phải audit. Thêm `-NoInstall` nếu chỉ muốn build: APK nằm ở `android\app\build\outputs\apk\debug\app-debug.apk`.
4. Cài APK có sẵn bằng tay:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

   Muốn xoá sạch dữ liệu app để thử lần mở đầu:

```bash
adb shell pm clear com.tappyai.app.debug
```

- App id là `com.tappyai.app.debug`.
- **Máy thật** phải cùng mạng Wi-Fi. Chạy script với `-Port 3007` và sửa dòng `10.0.2.2` thành IP LAN của máy (hiện script chỉ hỗ trợ emulator).
- **iOS:** không build được ở đây (không có macOS) và **không được phát hành** (§6).

---

## 2. Tài khoản (chỉ có trên project audit)

Cả bốn tài khoản dùng chung mật khẩu **`TappyUAT!2026`**. Cả bốn đã khai 18+ (có `user_demographics`) và đã qua onboarding.

| Vai trò | Email | Trạng thái đã kiểm (đọc DB audit, 2026-09-25) | Dùng để |
|---|---|---|---|
| **User thường, có lịch sử** | `manual.uat.user@tappyai.com` | email đã xác nhận · 2 hội thoại · 3 review | Trải nghiệm người dùng quay lại |
| **User mới** | `manual.uat.fresh@tappyai.com` | đã xác nhận · 0 hội thoại | Màn hình trống, lần chạy đầu, quiz sở thích |
| **Pro** | `manual.uat.pro@tappyai.com` | đã xác nhận · gói `pro/active` · 11 hội thoại (do UAT của tôi tạo) | Hành vi Pro, không bị giới hạn quota miễn phí |
| **Admin** | `manual.uat.admin@tappyai.com` | đã xác nhận · `admin_roles.role = admin` · 1 review | Back office (`/admin`) |

- Tôi **không tự thử lại mật khẩu**, vì tôi không được đăng nhập bằng mật khẩu. Tôi chỉ đăng nhập bằng magic link admin.
- Nếu mật khẩu sai, đặt lại trong Supabase Dashboard → project **audit** → Authentication → Users → user đó → *Send password recovery*, hoặc đặt mật khẩu mới.
- Không có loại tài khoản merchant. Deal đối tác là nội dung do admin quản lý.

---

## 3. Dữ liệu trên audit

Số liệu đọc chỉ-đọc ngày 2026-09-25:

| Thứ | Có gì | Nghĩa là |
|---|---|---|
| Địa điểm của 5 domain (ăn uống, mua sắm, du lịch, giải trí, spa) | **Không nằm trong DB**, lấy trực tiếp từ Serper | Hỏi là có dữ liệu thật. Mỗi lượt hỏi đồ ăn tốn khoảng 4 credit Serper |
| Review / clip | **5 bài**: 1 ảnh + 4 video. Tác giả: user (3), pro (1), admin (1) | Feed Khám phá có nội dung. Thử báo cáo bài của người khác bằng một tài khoản khác |
| Plan share / public result | `plan_shares` 4, `shared_results` 1 | Các link `/plan/<id>` và `/r/<slug>` mở được |
| Deal đối tác (`partner_deals`) | **0** | Tab Deals sẽ **trống**. Đây là đúng dữ liệu, không phải lỗi |
| `commerce_feed_items` | **0** | Câu trả lời mua sắm **không có nút "Mua trên …"**, chỉ có "Tìm trên …" (F-036) |
| Nhóm | 1 | |

---

## 4. Danh sách bấm thử, theo mức rủi ro (làm từ trên xuống)

### A. Các sửa của đợt này: xác nhận trước, vì đây là thứ mới nhất

- [ ] **Ranh giới public/app** (`PUBLIC-BOUNDARY-FIX.md`): mở cửa sổ ẩn danh mới vào `/plan/<id>`, `/r/<slug>`, `/reviews`, `/scam-shield`, `/about`. Trang **không** được hỏi vị trí, không hiện modal chọn ngôn ngữ, không có cổng tuổi, không bắt đăng nhập. Ngôn ngữ theo trình duyệt (thử cả EN).
- [ ] Ngược lại, **phía app** (`/`, `/chat`, `/profile`) vẫn phải hỏi ngôn ngữ và vị trí như cũ.
- [ ] **Chia sẻ lịch trình trên Android (F-070)**: Chat → "Lên lịch trình 1 ngày ở Đà Lạt cho 2 người" → 📤 Chia sẻ lịch trình. Sheet phải hiện link `…/plan/<id>` trong vài giây, không kẹt ở "Đang tạo…". Link luôn là `www.tappyai.com/…` (F-078), nên hãy mở cùng id trên `http://localhost:3007/plan/<id>`.
- [ ] **Android, share từ thanh dưới tin nhắn có thẻ địa điểm**: phải ra brochure gợi ý có tiêu đề là câu bạn hỏi, không phải chỉ đoạn văn. *Chưa ai bấm thử trên thiết bị.*
- [ ] **Ngân sách không đi theo sang chủ đề mới (F-069, 5a)**: "Tư vấn tai nghe chống ồn dưới 2 triệu" → "Lên lịch trình 1 ngày ở Vũng Tàu cho 2 người". Kế hoạch **không** được nhắc "2 triệu". Tương tự "trưa nay ăn gì dưới 100k" → "tư vấn điện thoại Samsung" không được mang 100k.
- [ ] **Quận người dùng nêu (5b)**: "Quán phở ngon ở Quận 3" → mọi thẻ có địa chỉ ở Quận 3 (Xuân Hòa, Nhiêu Lộc, Bàn Cờ, Võ Thị Sáu). "Cà phê yên tĩnh ở Bình Thạnh" → mọi thẻ ở Bình Thạnh.
- [ ] **"98-99%" không phải tiền**: "iPhone 15 Pro Max cũ pin 98-99%" không được ra ngân sách 98k.
- [ ] **Brochure**: không có chip "chưa có giá". Ở tiếng Anh, dòng tổng ghi "1 day · 1 stop" (không phải "1 days").

### B. Năm domain cốt lõi (đăng nhập user thường)

Làm cho mỗi domain ăn uống, mua sắm, du lịch, giải trí và spa:

- [ ] Hỏi tự nhiên bằng tiếng Việt, có kèm ràng buộc (quận, giá, số người).
- [ ] **Mọi thông tin trên thẻ phải có nguồn**: tên, địa chỉ, rating, số đánh giá, giá, giờ mở cửa. Ghi lại mọi chỗ trông như bịa. Đây là rủi ro số 1.
- [ ] Văn bản không được mâu thuẫn với thẻ, ví dụ khen "tiện ăn khuya" cho quán đang đóng (F-072).
- [ ] Hỏi tiếp vài lượt ("còn quán nào mở sau 21h?", "rẻ hơn?"): ràng buộc cũ vẫn phải giữ.
- [ ] Hỏi một câu vô nghĩa: phải trả lời "không tìm thấy" một cách lịch sự, không lỗi, không bịa.
- [ ] "Xem bản đồ" phải mở đúng quán trên Google Maps.

### C. Lịch trình và chia sẻ

- [ ] Lịch trình nhiều ngày, tiếng Việt dài → Chia sẻ → mở link bằng cửa sổ ẩn danh: brochure đầy đủ, không 500.
- [ ] Chia sẻ public một câu trả lời (`/r/<slug>`) → mở ẩn danh.

### D. Cảnh báo lừa đảo (web + Android)

- [ ] URL giả (ví dụ `vietcombank-xacminh.top/dang-nhap`) → "Nguy cơ cao", kèm thông tin chính chủ.
- [ ] QR (web: tải ảnh QR lên).
- [ ] Tin nhắn "trúng thưởng … nhập OTP" → "Rất nguy hiểm". ⚠️ Mục "Vì sao đáng ngờ" hiện ra **tiếng Anh**. Lỗi này đã biết (F-068), không cần báo lại.

### E. Đăng nhập, cổng tuổi, khách

- [ ] Đăng nhập bằng email + mật khẩu cho cả 4 tài khoản, rồi đăng xuất.
- [ ] Khách: khai 18+ → có 5 câu hỏi dùng thử. Câu thứ 6 phải là lời nhắc đăng nhập, không phải lỗi. **Chưa ai kiểm quota khách hiển thị ra sao** (W2e).
- [ ] Pro không bị chặn quota. Admin vào được `/admin`; một tài khoản không phải `@tappyai.com` thì không vào được.

### F. Android riêng

- [ ] Lần mở đầu (`pm clear`): splash → Home. Hiện splash là chữ "T" chung chung, và máy tiếng Anh vẫn mở tiếng Việt (F-077). Hãy quyết định có chấp nhận không.
- [ ] Gõ tiếng Việt bằng bàn phím thật (Gboard/Laban): gõ, sửa, gửi.
- [ ] Khám phá: video tự phát, có tiếng, không có nút "dùng âm thanh này".
- [ ] QR hồ sơ: mở, chia sẻ, tải về (ảnh vào thư mục `Pictures/TappyAI`).
- [ ] Back trong app luôn về đúng màn hình cha.

### G. Giao diện, ngôn ngữ, thông báo (web + Android)

- [ ] Sáng / Tối / Theo hệ thống, trên mọi màn chính. Android sáng: icon status bar đang bị trắng trên nền trắng (F-077).
- [ ] Đổi sang English rồi về Tiếng Việt.
- [ ] Bật/tắt thông báo, tải lại trang, trạng thái phải được giữ.

### H. GA4 funnel (F-001): mỗi event bắn một lần, không có PII

- Trên localhost: sau mỗi thao tác, gõ `window.dataLayer` trong console.
- Trên GA4: DebugView, chỉ làm được sau khi đặt ID thật trên bản deploy.

| Event | Cách gây ra | Chỉ được có các param |
|---|---|---|
| `page_view` | Chuyển trang | `page_path` (bỏ query; UUID chat thành `/chat/_id`) |
| `chat_opened` | Mở chat mới | (không có), **một lần** |
| `chat_response` | Hỏi AI | `feature` |
| `recommendation_click` | Bấm thẻ | `domain` |
| `affiliate_click` | Bấm nút mua (cần commerce link) | `domain, provider, tracked` |
| `shopping_search_click` | Bấm "Tìm trên …" | `domain: shopping`, `platform` |
| `search` | Tìm review | `search_type: reviews` |
| `report_submitted` | Báo cáo review | `reason` |
| `scam_check` | Kiểm tra lừa đảo | `check_type`, `risk_level` |
| `login` / `sign_up` | Đăng nhập / đăng ký | `method` (+ `is_first_login`) |

### I. Đếm nút mua (F-036), làm trước launch

- Chạy 10 câu mua sắm khác nhau (tai nghe, iPhone 16 Pro 256GB, nồi chiên không dầu, giày chạy bộ, bàn phím cơ, sữa rửa mặt, máy hút bụi cầm tay, áo khoác gió, SSD 1TB, bình giữ nhiệt).
- Với mỗi câu, ghi lại: có nút **"Mua trên …"** / chỉ có **"Tìm trên …"** / không có gì.
- Với dữ liệu audit hiện tại, kết quả dự kiến là toàn "Tìm trên …".

---

## 5. Không test được trên localhost

| Mảng | Vì sao | Cách mở khoá |
|---|---|---|
| **Upload ảnh/video/avatar** | `POST /api/reviews/upload` → 500 `WifExchangeError`: token OIDC Vercel trong `.env.local` đã hết hạn (W11) | Chạy `vercel env pull` lại (token sống khoảng 12 giờ), hoặc test trên preview |
| **Đăng nhập Google / OTP email / Zalo** | OAuth client Google chưa tạo mới; không có email sender | Dùng email + mật khẩu (§2) |
| **Mua Pro** | Không có khoá Stripe test; Apple IAP cần thiết bị | Trạng thái Pro đã test được qua tài khoản Pro |
| **Affiliate / Accesstrade (F-020, F-036)** | Chưa có publisher id; feed rỗng | Sau khi được duyệt: đặt env và chạy cron feed-ingest |
| **GA4 nhận event thật** | Không có Measurement ID ở local | Đặt `G-8GP7L7N516` trên production và xem Realtime |
| **iOS** | Không có macOS | — |
| **Quét QR bằng camera, mic, push thật, WebView trong Zalo/Messenger** | Emulator | Dùng máy thật |
| **Tải lớn / hiệu năng** | DB không có dữ liệu cỡ production | — |

---

## 6. Lỗi đã biết, không báo lại

**Chặn launch, hoặc cần bạn quyết:**

- **F-061 (P0)**: giá trị secret đã lộ trong phiên Claude. Phải **rotate** (danh sách ở `PRELAUNCH-REPORT.md` Part 2).
- **F-064 (P1)**: token PAT Supabase nằm trong file local. **F-062 (P1)**: Preview của Vercel mang key production.
- **F-065 (P1)**: các sửa bảo mật của `integration/v3-foundation` chưa vào nhánh ship. Bảng `groups`/`group_members` đang cho **ai cũng đọc được**.
- **F-057 (P1)**: một ảnh review từ host không được `next/image` cho phép làm `/reviews/<id>` trả 500 và có thể làm sập feed.
- **Merge `a6ca9f0` chưa được audit toàn bộ.** Nó đã làm mất dây nối share trên Android (F-070, đã sửa); có thể còn mất chỗ khác.
- **iOS** vẫn còn UI music-reuse. Không được phát hành iOS.

**Chất lượng (P2/P3):**

- F-068: lý do trong phân tích tin nhắn bằng tiếng Anh.
- F-071: câu văn mua sắm bị vỡ.
- F-072: lý luận mâu thuẫn với thẻ.
- F-073: thẻ mua sắm Android ghi "rated … reviews".
- F-074: dòng "Đánh đổi: 912 lượt đánh giá" gây hiểu nhầm.
- F-075: quiz sở thích che câu trả lời đầu tiên.
- F-076: `/r` vẫn tiếng Việt cho khách EN.
- F-077: các chi tiết nhỏ trên Android.
- F-078: link share Android luôn là domain production.
- F-067: memory giữ ngân sách một lần mua.
- F-045: một lượt du lịch chỉ ra một bộ thẻ.
- F-043: ngưỡng số trong câu trả lời rủi ro cao.
- F-058: trang 404 chỉ có tiếng Việt.

**Không phải lỗi:**

- Deals trống, không có nút mua (§3).
- `npm test` ghi đè `docs/audit/*.json`. Khôi phục bằng git sau khi chạy.
- Lần mở đầu mỗi trang chậm vì Next đang biên dịch.
- Home Android thoáng hiện "Chào bạn!" trước khi hiện tên.
