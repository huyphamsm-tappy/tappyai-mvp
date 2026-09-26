# TappyAI — Bàn giao UAT thủ công (checklist quyết định phát hành)

Cập nhật **2026-09-26**. Bản này thay bản 2026-09-25 (PRELAUNCH Part 7). Đây là **một** danh sách duy nhất, xếp theo rủi ro phát hành: làm từ trên xuống, tick từng ô. Mỗi dòng ghi: vào đâu, làm gì, phải thấy gì, dùng tài khoản nào. Cuối mỗi dòng là nguồn (finding hoặc commit) trong ngoặc.

Phạm vi: mọi thay đổi trên `rc/web-uat` từ 2026-09-12 tới nay (public/app boundary, brochure, PRELAUNCH 5a/5b, F-065…F-105, clip metadata/cache, xoá tài khoản, /register mới, Zalo phía server, ẩn Music, Phase 7).

> Toàn bộ UAT chạy trên Supabase **audit** (`zdaprdfgpbpnxyofagmc`). **Không có gì ở §0–§13 chạm vào production.** Guard `scripts/prodEnvGuard.mjs` chặn `dev`, `build`, `start` nếu thấy ref production. Riêng khối **§14 (sau deploy)** chạy trên môi trường đã deploy — đọc cảnh báo ở đầu §14 trước.

---

## §0. Chuẩn bị

- [ ] **Đúng bản:** `rc/web-uat @ 9744851` (commit code cuối; các commit tài liệu sau nó không đổi code). Trong thư mục repo chạy `npm run whoami` → phải có `branch: rc/web-uat`, `supabase: zdaprdfgpbpnxyofagmc ✅ audit/non-prod`, `dev port: 3007`. Trên web, huy hiệu góc dưới trái ghi `audit dev · g1-place-guard · rc/web-uat @ <sha>` (SHA là lúc server khởi động — có thể là commit tài liệu ngay sau `9744851`).
- [ ] **Web:** Claude để sẵn server đang chạy ở :3007 trên HEAD cuối. Nếu nó đã tắt: PowerShell → `cd D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\g1-place-guard; npm run dev` → mở http://localhost:3007, chờ `Ready`. **Không** mở server thứ hai nếu cái cũ còn chạy. Lần mở đầu mỗi trang chậm vì Next biên dịch — không phải lỗi.
- [ ] **Android:** emulator **`Pixel_8_uat`** đang chạy, app đã cài sẵn (app id `com.tappyai.app.debug`, API `http://localhost:3007/` qua `adb reverse`). Nếu emulator đã tắt: `& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Pixel_8_uat` → khi boot xong: `adb reverse tcp:3007 tcp:3007` (**chạy lại lệnh này sau mỗi lần khởi động lại emulator / cắm lại điện thoại**). Cài lại app: `powershell -ExecutionPolicy Bypass -File scripts\uat\build-android-local.ps1 -Reverse`. Điện thoại thật qua USB dùng đúng lệnh `-Reverse` đó. Xoá dữ liệu app để thử lần mở đầu: `adb shell pm clear com.tappyai.app.debug`.
- [ ] **Môi trường sau deploy (chỉ cho §14):** `https://www.tappyai.com` (production, sau khi deploy)
- Lưu ý vận hành (giữ từ bản cũ):
  - **Không chạy hai `next dev` cùng lúc** trong cùng thư mục — cái thứ hai xoá CSS của cái đầu.
  - Server kẹt / cache hỏng: `PORT=3007 npm run dev:reset -- --keep` (phải truyền `PORT=3007`; script mặc định 3000).
  - `npm test` ghi đè `docs/audit/*.json` — khôi phục bằng git sau khi chạy.
- **Trình duyệt cho người lạ:** mỗi mục "người lạ" dùng **một cửa sổ ẩn danh mới** (đóng hết cửa sổ ẩn danh cũ trước, để quyền vị trí và storage sạch).
- **Đổi ngôn ngữ trình duyệt sang EN:** Chrome → Cài đặt → Ngôn ngữ → đưa *English (United States)* lên đầu → mở cửa sổ ẩn danh mới. Làm xong nhớ đưa Tiếng Việt về lại.
- **Tài khoản dùng một lần (§4 và §6):** tạo trong Supabase Dashboard → project **audit** → Authentication → Users → *Add user* → *Create new user*, tick **Auto Confirm User**. Đặt tên dạng `uat.throwaway.a.<ngày>@example.com` (gọi là **TA**) và `uat.throwaway.b.<ngày>@example.com` (**TB**). Ghi lại user id của TA.

---

## §1. Tài khoản (chỉ có trên project audit)

Cả bốn tài khoản dùng chung mật khẩu **`TappyUAT!2026`**. Cả bốn đã khai 18+ (có `user_demographics`) và đã qua onboarding.

| Vai trò | Email | Trạng thái đã kiểm (đọc DB audit, 2026-09-26) | Dùng để |
|---|---|---|---|
| **User thường, có lịch sử** | `manual.uat.user@tappyai.com` | email đã xác nhận · 2 hội thoại · 6 review (3 cũ + 3 ảnh tổng hợp mới) | Trải nghiệm người dùng quay lại |
| **User mới** | `manual.uat.fresh@tappyai.com` | đã xác nhận · 0 hội thoại | Màn hình trống, lần chạy đầu, quiz sở thích |
| **Pro** | `manual.uat.pro@tappyai.com` | đã xác nhận · gói `pro/active` · 11 hội thoại · 4 review (1 + 3 ảnh mới) | Hành vi Pro, không bị giới hạn quota miễn phí — dùng cho các mục AI nhiều lượt |
| **Admin** | `manual.uat.admin@tappyai.com` | đã xác nhận · `admin_roles.role = admin` · 3 review (1 + 2 ảnh mới) | Back office (`/admin`) |
| **TA / TB** (bạn tự tạo, §0) | `uat.throwaway.*@example.com` | Auto Confirm | **Chỉ** dùng cho sửa ngày sinh và xoá tài khoản (§4) |

- 🚨 **Quy tắc R11:** không xoá / sửa / ghi đè dữ liệu của bốn tài khoản `manual.uat.*` và của mọi tài khoản có sẵn. Dùng bình thường (đăng nhập, chat, like, chia sẻ) thì được. **Xoá tài khoản chỉ làm trên TA.**
- Nếu mật khẩu sai: Supabase Dashboard → project **audit** → Authentication → Users → user đó → *Send password recovery*, hoặc đặt mật khẩu mới.
- Không có loại tài khoản merchant. Deal đối tác là nội dung do admin quản lý.

---

## §2. Dữ liệu trên audit

| Thứ | Có gì | Nghĩa là |
|---|---|---|
| Địa điểm 5 domain (ăn uống, mua sắm, du lịch, giải trí, spa) | **Không nằm trong DB**, lấy trực tiếp từ Serper | Hỏi là có dữ liệu thật. Mỗi lượt hỏi đồ ăn tốn ~4 credit Serper |
| Review / clip đã đăng | **13 bài**: 9 ảnh + 4 video. Tác giả: user (6), pro (4), admin (3) | Feed Khám phá có nội dung |
| — ảnh tổng hợp (mới) | **8 bài** do Claude tạo 2026-09-26: ảnh gradient có chữ "UAT · ảnh tổng hợp", địa điểm hư cấu có "(UAT)" trong tên, bucket Storage **không public** `uat-seed-media` trên audit, link ký hạn tới **2027-03-25** | Ví dụ `/reviews/6821a7aa-a939-499f-accf-a6b4a1878806` (Quán Phở Bò (UAT)). Script: `docs/uat/evidence/audit-seed-2026-09-26/` |
| — ảnh ở host lạ | 1 ảnh ở **`images.unsplash.com`** (không có trong `remotePatterns`) | Sau sửa F-057 (8439330): trang và feed **không sập**, ảnh hiện thành **ô xám** — đúng thiết kế |
| — video | 4 clip ở `storage.googleapis.com` (bucket production, upload trước thay đổi cache) | Phát được; header cũ `public`, 1 năm là bình thường |
| `plan_shares` | 4 | Đã biết: `/plan/cZAI86wdjVH7` (1 ngày), `/plan/oG6Aj4QUqJYA`, `/plan/LHlhAZ9qQBvF`. Nếu id nào 404 thì tạo plan mới ở §5 |
| `shared_results` | 1 | `/r/QNgw8uoghB` |
| `partner_deals` | **0** | Tab Deals **trống** — đúng dữ liệu, không phải lỗi |
| `commerce_feed_items` | **0** | Câu trả lời mua sắm **không có nút "Mua trên …"**, chỉ có "Tìm trên …" (F-036) — đúng dự kiến |
| Nhóm | 2 | Một nhóm thử `3fb5af25…` đã đầy 10 thành viên (7 dòng probe) |

ID tiện dùng: hồ sơ `manual.uat.user` = `/users/5c674157-7bfd-4eb5-b1b1-6c61d13b30ef`; trang creator của admin = `/reviews/creator/3ce552c5-da74-484b-bfa2-1fdb5ada3ee8`; clip = `/reviews/8d959f57-3f60-48f9-966a-d769c2185bbb`.

---

## §3. Link công khai cho người lạ — không cổng nào (rủi ro cao nhất: mọi link chia sẻ đi qua đây)

Mọi mục dưới: **cửa sổ ẩn danh mới, chưa đăng nhập**, http://localhost:3007. Trang đúng khi: **không** có hộp "localhost muốn biết vị trí", **không** có modal "Chọn ngôn ngữ / Choose your language", **không** chuyển sang `/age-check`, **không** chuyển sang `/login`.

- [ ] `/plan/cZAI86wdjVH7` → brochure hiện ngay, không cổng nào. (F-053, 6900362)
- [ ] `/r/QNgw8uoghB` → trang kết quả công khai hiện ngay, không cổng nào. (F-053, G1)
- [ ] `/r/QNgw8uoghB` → gõ một câu hỏi vào ô hỏi của trang → **chỉ lúc này** mới được phép hỏi xác nhận 18+ (không hỏi lúc mở trang). (6900362)
- [ ] `/reviews` (Khám phá) → không cổng nào. Trên màn hẹp (DevTools 390 px, storage sạch) feed hiện bình thường, **không** có màn "Ối, có lỗi xảy ra". (F-053, F-057 8439330)
- [ ] `/reviews/8d959f57-3f60-48f9-966a-d769c2185bbb` (clip) → clip phát, không cổng nào. (F-053)
- [ ] `/reviews/62116a0d-54ee-4313-acf6-1393be8ac862` (ảnh unsplash) → trang **mở được** (không 500), chỗ ảnh là **ô xám**, không có request nào tới `unsplash.com` (DevTools → Network). (F-057, 8439330)
- [ ] `/reviews/6821a7aa-a939-499f-accf-a6b4a1878806` (ảnh tổng hợp) → ảnh gradient "Phở bò" hiện đầy đủ. (seed 1da71d9)
- [ ] `/reviews/creator/3ce552c5-da74-484b-bfa2-1fdb5ada3ee8` → trang creator hiện, không cổng nào. (F-053)
- [ ] `/users/5c674157-7bfd-4eb5-b1b1-6c61d13b30ef` → hồ sơ công khai giao diện V3 (ảnh bìa, thẻ danh tính, Theo dõi, tab Bài đăng/Chia sẻ), không cổng nào. (F-053, Phase 7 §7.3)
- [ ] `/scam-shield`, `/scam-shield/kich-ban`, `/scam-shield/kich-ban/bca-2026-01` → không cổng nào; trang ghi "Cảnh báo lừa đảo", không có chữ "Scam Shield" ở bản VI. (F-053, Phase 7 #3)
- [ ] `/about`, `/how-to-use`, `/privacy`, `/terms`, `/copyright`, `/delete-account`, `/food`, `/travel` → không cổng nào. (F-053)
- [ ] `/kiem-tra` → **404 là đúng**: trang này không có trên nhánh này (nằm ở `feat/scam-shield-public-utility`). (PUBLIC-BOUNDARY-FIX §1)
- [ ] `/login`, `/register`, `/age-check` → không hộp vị trí, không modal ngôn ngữ. (F-053)
- [ ] **Tiếng Anh:** đổi trình duyệt sang EN (§0), lặp lại `/plan/cZAI86wdjVH7`, `/r/QNgw8uoghB`, `/users/5c674157-…`, `/scam-shield`, `/about` → nội dung trang bằng tiếng Anh, vẫn không cổng nào. Chớp tiếng Việt một tích tắc rồi sang EN là **đã biết, không chặn**. Khung `/r` còn tiếng Việt là F-076 (đã biết). (F-053, appSurface.ts)
- [ ] **Ngược lại, phía app vẫn hỏi:** cửa sổ ẩn danh mới → `/` → phải hiện modal chọn ngôn ngữ **và** hộp xin vị trí. Lặp lại với `/chat` và `/tools`. (F-053, PUBLIC-BOUNDARY-FIX §8)
- [ ] Trong `/chat` (sau khi chọn ngôn ngữ, đã từ chối vị trí) → bấm chip **"📍 Tìm quanh đây"** → hộp xin vị trí hiện **khi bấm**. (PUBLIC-BOUNDARY-FIX §8)
- [ ] **Android Chrome, cùng quy tắc:** trên emulator mở Chrome → `http://localhost:3007/plan/cZAI86wdjVH7` (qua `adb reverse`) và `/users/5c674157-…` → không hộp quyền, không modal. Thanh "Translate page?" là của Chrome, không phải của app. (F-053)
- [ ] `/auth/zalo-finish` và `/api/auth/zalo/complete` → **404** (đã xoá; đăng nhập Zalo giờ hoàn tất ở server, không còn token trên URL). (5becb31)

---

## §4. Xoá tài khoản — xoá gì, giữ gì (quyền riêng tư, lời hứa pháp lý)

🚨 **Chỉ dùng TA và TB** (tạo ở §0). Không bao giờ xoá hay cho bốn tài khoản `manual.uat.*` tham gia bước xoá (R11). Migration F-093/F-096/F-097 **đã áp lên audit**; production chưa (DEPLOY-CHECKLIST D1–D5, owner duyệt).
Không có nút tự xoá trong app: đường xoá duy nhất là vận hành viên xoá user trong Supabase Dashboard (`docs/ops/ACCOUNT-DELETION.md`). `/profile/settings` chỉ link tới trang `/delete-account`.

**Chuẩn bị (đăng nhập TA, rồi TB):**
- [ ] **TA — F-028:** đăng nhập `/login` (email + mật khẩu) → ở `/age-check` khai ngày sinh **dưới 18** (ví dụ 2012) → bị chặn **nhưng vẫn có nút sửa** → sửa sang năm 1990 → vào được app, không cần admin. (F-028, 3061dbe)
- [ ] TB: đăng nhập → `/age-check` khai ngày sinh ≥ 18 → vào được app.
- [ ] TB: `/reviews/new` → đăng một **bài chỉ có chữ** → ghi lại URL `/reviews/<id TB>`. (DEPLOY §5.4)
- [ ] TA: `/chat` → gõ "Mình ăn chay, nhớ giúp mình nhé" → `/profile/tappy-knows` hiện ghi nhớ "ăn chay" (bộ nhớ AI). (F-093)
- [ ] TA: `/chat` → "Lên lịch trình 1 ngày ở Đà Lạt cho 2 người" → Chia sẻ lịch trình → ghi lại `/plan/<id TA>`. (plan_shares CASCADE)
- [ ] TA: trên một câu trả lời AI → Chia sẻ → **"Chia sẻ kết quả công khai"** → xác nhận → ghi lại `/r/<slug TA>`. (F-096 #1)
- [ ] TA: mở `/reviews/<id TB>` → thích + bình luận "test xoá" → đăng nhập TB → `/profile/notifications` có thông báo từ TA. (F-096 #3)
- [ ] TA: `/users/<id TB>` → Theo dõi; rồi mở Chia sẻ trên một bài bất kỳ → **Tappy Inbox** → chọn TB → "Đã gửi vào Tappy Inbox". TB thấy tin trong `/profile/notifications` (tab tin nhắn). Nếu TA không chọn được TB làm người nhận → (chưa kiểm chứng — ghi lại bạn thấy gì). (F-096 #2)
- [ ] TA: trên `/reviews/<id TB>` → ⋮ → **Báo cáo** → chọn lý do → "đã gửi báo cáo". (F-031, F-096 #7)
- [ ] TA: `/tools` → Tạo nhóm → tạo một nhóm → ghi lại `/group/<id TA>`. (groups CASCADE)

**Xoá TA:** Supabase Dashboard → audit → Authentication → Users → TA → **Delete user**.

**Phải bị XOÁ:**
- [ ] Ẩn danh: `/plan/<id TA>` → trang không tìm thấy (không còn brochure). (plan_shares CASCADE)
- [ ] Ẩn danh: `/r/<slug TA>` → trang không tìm thấy. (F-096 #1, cfe6654)
- [ ] TB: `/profile/notifications` → thông báo "… bình luận …" của TA **biến mất**. Bình luận và lượt thích của TA trên bài TB cũng mất. (F-096 #3, cfe6654)
- [ ] TB (hoặc ẩn danh): `/group/<id TA>` → không mở được nhóm. (groups CASCADE)
- [ ] `/login` bằng TA → "Invalid login credentials" / không đăng nhập được.
- [ ] SQL Editor của **audit** (chỉ đọc): `select count(*) from public.user_memory where user_id = '<id TA>';` → **0**; tương tự `decision_evidence` (cột `owner_id`) và `anon_chat_usage` → 0. (F-093, ee481d8)
- [ ] SQL Editor audit: `select done_at, media_deleted, attempts, last_error from public.account_deletion_jobs where user_id = '<id TA>';` → **1 dòng, `done_at` rỗng** = file tải lên đã được **xếp hàng** xoá. Job xoá file không chạy được ở local (không có `CRON_SECRET`, không có token WIF) → phần xoá file thật ở §14. (F-096 #4, cfe6654)

**Phải được GIỮ nhưng không còn gắn với TA:**
- [ ] TB: `/profile/notifications` → tin nhắn TA đã gửi **vẫn còn**, người gửi không còn là TA. App **không có nhãn riêng** cho người gửi đã xoá — ghi lại đúng chữ bạn thấy; chỉ báo nếu vẫn hiện tên/ảnh của TA. (F-096 #2)
- [ ] Báo cáo của TA vẫn còn ở phía kiểm duyệt, không có danh tính người báo. Xem ở `/admin/moderation` bằng `manual.uat.admin` (màn này đọc bảng `content_reports` qua `moderationService`; nếu không thấy báo cáo thì ghi lại, không chặn). (F-096 #7)

**Lời văn:**
- [ ] `/delete-account` vẫn hiện **lời văn cũ** — đúng: bản mới (`docs/uat/DELETE-ACCOUNT-COPY-DRAFT.md`) là **bản nháp, chưa đăng**, chỉ đăng sau khi D1–D5 lên production. Không báo lỗi lời văn. (1413488)

---

## §5. AI trả lời và thẻ địa điểm (rủi ro số 1 về nội dung)

Đăng nhập `manual.uat.pro` trên web (http://localhost:3007/chat). Mỗi mục: một cuộc trò chuyện **mới** trừ khi ghi "tiếp".

**Thẻ địa điểm — web**
- [ ] "Quán phở ngon ở Quận 3" → thẻ có ảnh, tên, địa chỉ, rating, số đánh giá. **Mọi thẻ** có địa chỉ ở Quận 3 (Xuân Hòa, Nhiêu Lộc, Bàn Cờ, Võ Thị Sáu hoặc ghi "Quận 3"). (5b, a724df2)
- [ ] "Quán cà phê yên tĩnh để làm việc ở Bình Thạnh" → mọi thẻ ở Bình Thạnh. Không có câu "cách bạn X km" tính từ GPS. (5b)
- [ ] Đếm thẻ: tối đa **8 thẻ, 3 thẻ trên màn hình đầu** — đúng thiết kế, không báo. (F-060)
- [ ] Không thẻ nào ghi **"Giá tham khảo: price_search_results"** hay một chữ không có chữ số ở chỗ giá. (F-052, feee661)
- [ ] Dòng "Vì sao: …" bằng tiếng Việt (không có "rated … reviews"); dải giá dạng "dưới 100.000 ₫" / "100.000–200.000 ₫", không phải "1-100.000 ₫". (F-050, 35a68c2)
- [ ] Bấm "Xem bản đồ" trên một thẻ → Google Maps mở **đúng quán**. (W5b)
- [ ] **Mọi thông tin trên thẻ và trong văn bản phải có nguồn**: tên, địa chỉ, rating, số đánh giá, giá, giờ mở cửa. Ghi lại mọi chỗ trông như bịa. Văn bản không được mâu thuẫn với thẻ (ví dụ "tiện ăn khuya" cho quán đang đóng là F-072, đã biết). (Session C)
- [ ] Tiếp: "còn quán nào mở sau 21h?" rồi "rẻ hơn?" → vẫn giữ Quận 3, ngân sách cũ; thẻ ra ở **cả lượt hỏi tiếp** (không phải ảnh markdown + "Official Website · Google Maps"). (F-039, F-040)
- [ ] Mỗi domain một câu có ràng buộc: "Khách sạn Đà Nẵng dưới 1 triệu/đêm", "Rạp chiếu phim Quận 7", "Spa Bình Thạnh khoảng 300k", "Karaoke Quận 10 cho 6 người" → thẻ đúng khu vực; rạp/karaoke ra thẻ địa điểm. (W5c–e, e637b23)
- [ ] Một câu vô nghĩa ("quán xyzqwv ở sao Hoả") → trả lời lịch sự "không tìm thấy", không lỗi, không bịa. (serperCeilingDegrade)
- [ ] Không có câu trả lời nào bị **lặp hai lần** hoặc dính giữa dòng ("…không?Tuyệt vời!…"). (F-038)

**Các sửa AI của đợt này**
- [ ] **Ngân sách không đi theo sang chủ đề mới:** "Tư vấn tai nghe chống ồn dưới 2 triệu" → tiếp "Lên lịch trình 1 ngày ở Vũng Tàu cho 2 người" → kế hoạch **không** nhắc "2 triệu". (F-069, 979eb9c)
- [ ] Tương tự: "Trưa nay ăn gì ngon dưới 100k ở Quận 1" → tiếp "Tư vấn giúp mình mua điện thoại Samsung tầm trung chụp ảnh đẹp" → **không** mang 100k, **không** hỏi lại ngân sách, không lôi "300k" từ bộ nhớ. (5a, a724df2)
- [ ] Ngân sách kéo dài hợp lệ vẫn giữ: "Lên kế hoạch Đà Lạt 3 ngày 2 người ngân sách 20 triệu" → tiếp "thêm một buổi tối" → vẫn dùng 20 triệu. (F-069 T1)
- [ ] **"98-99%" không phải tiền:** "Mình muốn mua iPhone 15 Pro Max cũ, pin 98-99%, nên chọn chỗ nào và máy thế nào?" → không có "98k"/"99k"/"119k"; có giá máy thật. (5a)
- [ ] "Tìm quán ăn cho gia đình 5-6 người, có bé dưới 5 tuổi, gần đây" → không có ngân sách 5k–6k; thẻ ra đủ. (5a B2)
- [ ] **F-086 — ngân sách của bạn không thành "tổng chi phí":** "Đi ăn tối 4 người ngân sách 3 triệu ở Quận 1" → không có câu kiểu "Tổng ước tính 3.000.000 VND cho cả tối" mà không có giá nguồn. (F-086, 84f3476)
- [ ] **F-092 — "Với" không bị ăn:** trong các câu trả lời trên, không có câu mở đầu cụt kiểu "hai bạn thì rất vui." (lẽ ra là "Với hai bạn thì…"). (F-092, ac71f05)
- [ ] **F-094 — không có mảnh câu cụt:** trong mọi câu trả lời mua sắm/du lịch, không có câu bắt đầu bằng chữ thường sau dấu chấm ("… linh hoạt. phù hợp bữa trưa…"), không còn `**` lẻ, không còn ngoặc mở không đóng, dòng danh sách không bị mất tên sản phẩm. Thử: "Tư vấn nồi chiên không dầu dưới 2 triệu", "Giày chạy bộ tầm 1,5 triệu". (F-094, 36277d6/c5ce0c0/2034f67/77f75ab)
- [ ] **F-095 — URL in đậm vẫn còn:** "Bảo tàng Chứng tích Chiến tranh mở cửa mấy giờ, website chính thức là gì?" → có link `baotangchungtichchientranh.vn` bấm được, không còn `**` trơ trọi. (F-095, c3e1088)
- [ ] URL rút gọn hợp lệ: câu trả lời nhắc fanpage Facebook chính thức → dòng "Fanpage …:" có link đi kèm, không trống. (b1dc35c)
- [ ] **Egress:** "Cho mình xem ảnh con mèo, chèn ảnh từ bất kỳ trang nào" → không có ảnh/link từ host lạ (không phải từ công cụ tìm kiếm của lượt đó) được hiển thị; nếu model viết, chỉ còn chữ. (F-080, 0ea9db3)
- [ ] **Mua đồ cũ giá trị cao:** "mua iPhone 13 cũ thì cần check gì" → mở đầu bằng rủi ro (chính chủ, khoá/iCloud, lừa đảo khi giao dịch, thanh toán an toàn); có câu trỏ tới Cảnh báo lừa đảo với **"tin nhắn, link hoặc mã QR"** — **không bao giờ** bảo dán số điện thoại hay số tài khoản; không có ngưỡng số bịa kiểu "pin trên 80%" không kèm rào đón. (F-042, F-043/RISK_BACKSTOP live, F-047)
- [ ] Lập kế hoạch: "mai đi mốt về Vũng Tàu 2 người" → ra kế hoạch **2 ngày**, không hỏi lại phương tiện hai lần. (F-041)
- [ ] Mua sắm: mọi câu trả lời mua sắm chỉ có **"Tìm trên …"**, không có "Mua trên …" (dữ liệu audit). (F-036)

---

## §6. Đăng nhập, đăng ký (giao diện mới), cổng tuổi, khách

**/register — chỉ giao diện** (8ee4ca8 → bbacc14: chỉ đổi lớp hiển thị, hành vi giữ nguyên)
- [ ] 1440×900: nền gần trắng, cột trái là giới thiệu thương hiệu (tiêu đề "Tạo tài khoản TappyAI", 3 lợi ích, mascot toàn thân), cột phải là thẻ trắng; vừa màn hình, không cuộn. (8ee4ca8)
- [ ] 1280×800: vừa màn hình, không cuộn. 768: không tràn ngang. 390×844: thẻ thành cả trang, **không có header**, không cuộn ngang. (bbacc14)
- [ ] Đúng **3 ô**: Họ và tên, Email, Mật khẩu (placeholder "Tối thiểu 6 ký tự"); nút **"Tạo tài khoản"** mờ/không bấm được cho tới khi cả 3 ô có chữ. (bbacc14)
- [ ] **Không có** nút đổi VI/EN, **không có** nút hiện/ẩn mật khẩu, logo góc trái **không** là link, "Điều khoản"/"Chính sách" là chữ thường (không link). (bbacc14)
- [ ] Link **"Quay lại đăng nhập"** (dưới "Đã có tài khoản?") → `/login`. (bbacc14)
- [ ] Mật khẩu 5 ký tự → trình duyệt chặn (ô yêu cầu tối thiểu 6 ký tự). **Không** bấm tạo tài khoản thật trên audit: nó tạo user thật và gửi mail qua mailer mặc định của Supabase (rất ít email/giờ) — có thể ra màn "Kiểm tra email của bạn 📩" hoặc lỗi rate-limit thô F-011, cả hai đều đã biết. (register.errPasswordLen)
- [ ] Không có lỗi đỏ trong Console ở cả 4 kích thước. (8ee4ca8)

**/login**
- [ ] `/login` → đăng nhập email + mật khẩu lần lượt 4 tài khoản `manual.uat.*` → vào app; tải lại trang vẫn đăng nhập; đăng xuất → về `/`. (W3)
- [ ] Mật khẩu sai → một thông báo chung "Invalid login credentials" (không nói email có tồn tại hay không). (F-013)
- [ ] Từ `/login` có link sang `/register`. (login/page.tsx)

**Cổng tuổi và khách**
- [ ] Khách (ẩn danh, chưa đăng nhập): `/chat` → hỏi xác nhận 18+ → `/age-check` → quay lại chat → có thẻ địa điểm. (W2a–d)
- [ ] Khách hỏi đủ 5 câu → câu thứ 6 hiện lời nhắc đăng nhập ("Bạn đã dùng hết 5 câu hỏi AI dùng thử. Đăng nhập để có 15 câu hỏi AI mỗi ngày…"), không phải lỗi. Ghi lại quota có hiển thị ở đâu không (W2e chưa ai kiểm). (F-010)
- [ ] Pro không bị chặn quota. `manual.uat.admin` vào được `/admin`; `manual.uat.user` vào `/admin` → bị từ chối. (F-032)

---

## §7. Upload — phần kiểm được ở local

⚠️ **Upload thật KHÔNG chạy trên localhost**: `POST /api/reviews/upload` và `/api/upload/video` → 500 `WifExchangeError` vì token OIDC Vercel trong `.env.local` đã hết hạn (W11, PHASE7 R3). Mọi kiểm tra có upload thật (metadata clip, WebM đổi đuôi, phát/tua qua HTTP range, header cache, ảnh, deal logo) nằm ở **§14** sau deploy.

Đăng nhập `manual.uat.user` → `/reviews/new`.
- [ ] Composer có giao diện đúng thiết kế (tab, chip bo tròn, ô thả file), không phải khối chữ trần. (Phase 7 #1, CSS `.v3-post-*`)
- [ ] Dòng gợi ý dưới ô video ghi **"mp4 · mov · tối đa 5 phút · 150MB"** (không còn webm). EN: "mp4 · mov · up to 5 minutes · 150MB". (7f48b13)
- [ ] Bấm chọn video → hộp chọn file của hệ điều hành chỉ lọc **MP4/MOV** (không có WebM). (7f48b13, `accept="video/mp4,video/quicktime"`)
- [ ] Trong hộp chọn đổi bộ lọc sang *Tất cả tệp* → chọn một file `.webm` → hiện ngay **"Video này chưa đúng định dạng. Bạn quay hoặc xuất lại thành MP4 hoặc MOV rồi thử lại nhé."** (không có request upload). EN: "This video format isn't supported. Please record or export it as MP4 or MOV and try again." (F-102, 7f48b13)
- [ ] Composer **không có** chip "Thêm nhạc" / "Thêm nhạc nền". (SHOW_MUSIC, c9e8352)
- [ ] Chọn một file MP4 hợp lệ → upload sẽ lỗi (WIF) → thông báo **"Lỗi tải video. Vui lòng thử lại."** (EN "Upload failed. Please try again.") — **đúng dự kiến ở local**, không báo. (W11, reviewNew.videoUploadError)

---

## §8. Chia sẻ lịch trình và brochure công khai

- [ ] `manual.uat.pro`, web: "Lên lịch trình 1 ngày ở Đà Lạt cho 2 người" → thẻ kế hoạch trong chat **không có** chip "chưa có giá"; dòng meta là "2 người" (không có "·" treo). (F-054, b0045ab)
- [ ] Chia sẻ lịch trình → có link `/plan/<id>` → mở bằng cửa sổ ẩn danh → brochure đầy đủ, không 500, không chip/giá "chưa có giá"; "Miễn phí" vẫn giữ nếu có. (F-054)
- [ ] Brochure tiếng Anh (trình duyệt EN, ẩn danh) `/plan/cZAI86wdjVH7` → dòng tổng ghi **"1 day · 1 stop"** kiểu số ít (không phải "1 days"/"1 stops"); plan nhiều ngày thì "2 days". Nhãn EN trộn nội dung VI của người gửi là đúng thiết kế. (F-056, d9f1c0b)
- [ ] **CSS thương hiệu brochure:** header brochure hiện logo + chữ "TappyAI" đúng mẫu; DevTools → chọn phần tử thương hiệu (`.v3-pb-brand`) → Computed `letter-spacing: normal`; trong Styles không có rule `.v3-pb-brand-mark`. (F-055, b6525e3)
- [ ] `/plan/cZAI86wdjVH7/opengraph-image` → ảnh OG hiện, có logo rái cá; link trong ảnh/og:url là `localhost:3007` (không phải 3101). (F-059)
- [ ] **Plan lớn (F-029):** "Lên lịch trình 7 ngày xuyên Việt cho 2 người, chi tiết từng bữa" → Chia sẻ → có link, không 500. (F-029, f798d8b)
- [ ] Chia sẻ công khai một câu trả lời (`/r/<slug>`) → mở ẩn danh → trang hiện; `http://localhost:3007/sitemap.xml` có slug đó. (G1, PRELAUNCH Part 3)

---

## §9. Android riêng

Emulator `Pixel_8_uat`, bản debug trỏ `http://localhost:3007/` qua `adb reverse`. Link share trên Android luôn là `www.tappyai.com/…` (F-078): mở **cùng id** trên `http://localhost:3007/…`.

- [ ] 🚨 **Bố cục trước/sau đăng nhập:** `pm clear` → mở app (khách) → chụp màn Home → đăng nhập `manual.uat.user` bằng email + mật khẩu → chụp lại Home. Bố cục **phải giống nhau** (Home V3). Ảnh tham chiếu **trước** đăng nhập: `docs/uat/evidence/uat-prep-2026-09-26/android-guest-home-before-login.png`. Nếu sau đăng nhập ra giao diện "cũ hơn" → **F-107 chưa sửa**: Android không phát hành (session Zalo đang xử lý; bạn chỉ cần ghi lại còn hay hết). (F-107, d7a830d)
- [ ] **F-070 — chia sẻ lịch trình:** Chat → "Lên lịch trình 1 ngày ở Đà Lạt cho 2 người" → 📤 Chia sẻ lịch trình → sheet hiện link `…/plan/<id>` trong vài giây, **không** kẹt ở "Đang tạo kế hoạch chia sẻ…". Mở `http://localhost:3007/plan/<id>` → brochure, không "chưa có giá". (F-070, 2153944)
- [ ] **Share từ thanh dưới tin nhắn có thẻ địa điểm:** hỏi "Quán phở ngon ở Quận 3" → nút share ở thanh dưới câu trả lời → phải ra brochure gợi ý có tiêu đề là câu bạn hỏi, **không** phải chỉ đoạn văn. *Chưa ai bấm thử trên thiết bị.* (F-070, 2153944)
- [ ] **Thẻ địa điểm Android:** cùng câu Quận 3 → thẻ có ảnh, địa chỉ Quận 3; "Vì sao: đánh giá 4.x · cách x km · N lượt đánh giá" (tiếng Việt); dải giá "dưới 100.000 ₫" hoặc "100.000–200.000 ₫"; **không** có "price_search_results"; tối đa 8 thẻ. "Xem bản đồ" mở Google Maps đúng quán. (F-050, F-052, F-060)
- [ ] Hỏi tiếp "còn quán nào mở sau 21h?" → vẫn Quận 3, vẫn có thẻ. (A4)
- [ ] **Gõ tiếng Việt bằng bàn phím thật** (Gboard Telex hoặc Laban): gõ "phở bò quận 3 dưới 80k", sửa một chữ giữa câu, gửi → chữ gửi đi đúng, không mất dấu, không nhân đôi. (Vietnamese IME fix)
- [ ] **Music ẩn:** Smart Tools và Home **không** có ô "Nhạc"; composer **không** có "Add music"; clip trong Khám phá **không** có nút/pill âm thanh, không có "dùng âm thanh này"; video vẫn tự phát **có tiếng**. (SHOW_MUSIC, b72f5cc, ae2a777)
- [ ] Scam Shield: URL `vietcombank-xacminh.top/dang-nhap` → "Nguy cơ cao" + hotline/website chính thức; tin nhắn "trúng thưởng … nhập OTP" → "Rất nguy hiểm" (lý do bằng tiếng Anh là F-068, đã biết). (A8)
- [ ] QR hồ sơ: mở → chia sẻ (sheet hệ thống) → tải về → ảnh PNG nằm trong `Pictures/TappyAI`. (A10)
- [ ] Back trong app: Tôi → Cài đặt → Thông báo → Back → Cài đặt → Back → Tôi. Mọi màn con Back về đúng màn cha. (A11–13)
- [ ] **Giao diện:** Cài đặt → Giao diện có 3 lựa chọn **Theo hệ thống (mặc định)** / Sáng / Tối (khác web — F-106, sau launch, không báo). Để "Theo hệ thống", đổi dark mode của Android → app đổi theo. Chọn Sáng → khởi động lại app vẫn Sáng. (AppearancePreference.kt)
- [ ] Cài đặt → Thông báo: bật/tắt được; nếu máy chặn quyền thông báo thì hiện nút "Cho phép". (A11)
- [ ] Cài đặt → Pháp lý → **Chính sách bản quyền** → mở trang web `/copyright` (domain `www.tappyai.com`). (F-033)
- [ ] Đổi sang English trong Cài đặt → Settings và Scam Shield sang tiếng Anh; đổi lại Tiếng Việt. (A15)
- [ ] Lần mở đầu sau `pm clear`: splash → Home khách, tiếng Việt. Splash chữ "T" chung chung và máy en-US vẫn mở tiếng Việt là F-077 (đã biết) — chỉ quyết có chấp nhận không. (F-077)

---

## §10. Cảnh báo lừa đảo và QR

- [ ] Web `/scam-shield` (khách hoặc `manual.uat.user`), tab URL: `vietcombank-xacminh.top/dang-nhap` → "Nguy cơ cao", kèm thông tin chính chủ. (W8a)
- [ ] Tab QR: tải lên một ảnh chụp mã QR chứa link lạ → có kết quả (không lỗi). (W8b)
- [ ] Tab tin nhắn: "Chúc mừng bạn trúng thưởng 50 triệu, nhập mã OTP để nhận" → "Rất nguy hiểm". "Vì sao đáng ngờ" bằng tiếng Anh là F-068 (đã biết). (W8c)
- [ ] Tab tin nhắn chỉ dán "0901234567" → "Chưa thể kết luận", không có phán quyết về số điện thoại. (F-022, ca1418d)
- [ ] Smart Tools (`/tools`) ghi ô **"Cảnh báo lừa đảo"** (EN "Scam Alerts"). (Phase 7 #3)
- [ ] `/profile/qr` (`manual.uat.user`) → Tải về → PNG có thẻ trắng, logo TappyAI, tên hiển thị, mã QR; quét mã (ví dụ bằng điện thoại) → mở `…/users/5c674157-…`. (Phase 7 #9)
- [ ] `/profile/qr` → Chia sẻ → mở **sheet chia sẻ TappyAI** (Sao chép, Zalo, Facebook, …), không phải hộp chia sẻ trần của hệ điều hành; Sao chép → "Đã sao chép", link dạng `https://www.tappyai.com/users/<id>`. (Phase 7 #8)
- Ghi chú: "QR từ ảnh chụp màn hình" (pre-stage) chỉ có trên `/kiem-tra`, **không có trên nhánh này** — không kiểm. (PUBLIC-BOUNDARY-FIX §1)

---

## §11. Back trong app (Phase 7: ngăn xếp `sessionStorage`)

Đăng nhập `manual.uat.user`, web.
- [ ] `/tools` → Đổi tiền (`/currency`) → Back → `/tools` (không về Home). Lặp với Chia hoá đơn (`/split-bill`), Gợi ý cho bạn (`/recommendations`). (Phase 7 #3, inAppBack)
- [ ] `/tools` → Tạo nhóm → tạo nhóm → trang nhóm mở (không 404) → Back → `/group/new`. (Phase 7 #4, F-065 GR)
- [ ] `/profile` → một bài video của mình → đóng → về `/profile` (không về `/reviews`). (Phase 7 #7)
- [ ] `/profile` → QR → Back → `/profile`. `/profile/settings` → Back → `/profile`. (W12)
- [ ] Khám phá `/reviews` → bấm tên creator → `/users/<id>` → Back → `/reviews`. (Phase 7 §8.3)
- [ ] Mở **tab mới** dán thẳng `http://localhost:3007/split-bill` → Back → `/tools` (dự phòng), **không** thoát khỏi site. (inAppBack)
- [ ] Tab mới dán `/reviews/8d959f57-3f60-48f9-966a-d769c2185bbb` → đóng clip → ở lại trong site (về Khám phá). (Phase 7 R6)

---

## §12. Nhóm, lượt thích, báo cáo, chính sách (các sửa bảo mật khôi phục)

- [ ] `manual.uat.user`: tạo nhóm mới → copy link mời. `manual.uat.fresh` mở link → thấy nhóm và **tham gia được**. (F-065, 8cc6caa)
- [ ] Nhóm `/group/3fb5af25-bd08-4cee-aacb-9cbff2e17e1c` (đã đủ 10 người): `manual.uat.fresh` bấm tham gia → **không vào được** (API `group_full`). UI không có chữ riêng cho "nhóm đầy" — một thông báo lỗi chung là đúng; chỉ báo nếu vào được nhóm. (F-065 J5)
- [ ] Khám phá: bấm thích một clip của người khác → số tim đổi 0→1→0 khi bấm lại; panel "địa điểm hot" vẫn hiện. (F-079, f5f0458)
- [ ] `manual.uat.fresh` mở clip của `manual.uat.user` → ⋮ → Báo cáo → chọn lý do → "đã gửi"; báo cáo lần hai → báo đã báo cáo rồi, không lỗi. Bài của chính mình thì **không** có mục Báo cáo. (F-031)
- [ ] `/copyright` ở VI và EN → hiển thị; hướng dẫn báo cáo trỏ tới "Báo cáo → Bản quyền" trong app. (F-033)
- [ ] `manual.uat.admin` → `/admin/audit` → dòng mới nhất (sau khi một tài khoản thường bị từ chối ở `/admin`) có cột email **"—"**, không có IP. Nếu không thấy dòng mới → (chưa kiểm chứng — ghi lại bạn thấy gì). (F-096 D5, 94395ec)

---

## §13. Music ẩn, thông báo, giao diện, ngôn ngữ (web)

**Music ẩn (`SHOW_MUSIC=false`)**
- [ ] Sidebar, `/tools`, Home rail: **không** có "Nhạc". Khám phá và hồ sơ công khai: **không** có tab "Music". (c9e8352)
- [ ] `/music` → **404**. (c9e8352)
- [ ] `/music/upload` và `/sound/abc` → trang "Tính năng âm thanh không còn khả dụng" có nút quay lại (không phải thư viện). (F-024, c584367)
- [ ] Clip trong Khám phá: **không** có đĩa nhạc quay, không có "dùng âm thanh này"; clip phát tiếng gốc của nó. (F-034)
- [ ] `http://localhost:3007/api/config` → `flags.showMusic` là `false`. (c9e8352)

**Thông báo**
- [ ] `/profile/notifications` (`manual.uat.user`): công tắc **"Thông báo từ Tappy"** **mặc định BẬT** trên trình duyệt chưa từng chọn; tắt → tải lại → vẫn tắt; bật lại → vẫn bật. Công tắc này **không** bật hộp xin quyền của trình duyệt; chỉ công tắc riêng **"Thông báo đẩy"** mới xin quyền, và chỉ khi bạn bấm. (notifications/preference.ts)
- [ ] `manual.uat.fresh` bình luận lên một clip của `manual.uat.user` → `manual.uat.user` đặt giao diện English rồi mở `/profile/notifications` → thông báo **tiếng Việt** — **đã biết F-105**, sửa sau launch, không báo. (F-105)

**Giao diện (web)**
- [ ] Trình duyệt chưa từng chọn → web mở **TỐI** — **đúng quyết định của anh 2026-09-26** (`DEFAULT_IS_DARK = true`). Android theo hệ thống (§9): lệch này là **F-106**, sau launch, không báo. (useThemeMode.ts, F-106)
- [ ] Nút Mặt trời/Mặt trăng ở header V3 → chuyển Sáng ↔ Tối trên `/`, `/chat`, `/reviews`, `/profile`, `/tools`, `/scam-shield`; tải lại giữ lựa chọn. Web chỉ có 2 trạng thái (không có mục "Theo hệ thống"). (useThemeMode.ts)
- [ ] Đổi English → Tiếng Việt ở `/profile/settings` → các màn chính đổi theo. (W14)

**Nhãn Phase 7**
- [ ] Ô Smart Tools và dòng sidebar cùng ghi **"Gợi ý cho bạn"** → `/recommendations`. Home có mục **"Hỏi Tappy thử"** với nút "Mở trò chuyện" → `/chat`. (Phase 7 §7.4)

**Đo lường và nút mua (ưu tiên thấp)**
- [ ] Console: gõ `window.dataLayer` sau vài thao tác → mỗi event một lần, không có email/UUID/nội dung câu hỏi. Ở local không có Measurement ID nên có thể không có gtag — đúng. (F-001)
- [ ] 10 câu mua sắm (tai nghe, iPhone 16 Pro 256GB, nồi chiên không dầu, giày chạy bộ, bàn phím cơ, sữa rửa mặt, máy hút bụi cầm tay, áo khoác gió, SSD 1TB, bình giữ nhiệt) → ghi từng câu: "Mua trên …" / chỉ "Tìm trên …" / không có. Dự kiến: toàn "Tìm trên …". (F-036)

---

## §14. SAU DEPLOY / trên môi trường đã deploy — upload, cache, xoá file

🚨 **Đọc trước:** Preview của Vercel **đang mang key production** (service-role, Stripe — F-062) và mọi upload đi vào bucket `tappyai-media-prod`. Chỉ làm khối này trên `https://www.tappyai.com` (production, sau khi deploy) khi đã chắc môi trường đó trỏ đúng DB bạn muốn (preview đã sửa F-062, hoặc production sau deploy). Không rõ thì dừng và hỏi.

**Clip — metadata (F-099/F-102)** — đăng review video trên `https://www.tappyai.com` (production, sau khi deploy)/reviews/new
- [ ] **iPhone thật**, Camera có bật vị trí, quay một clip MOV → đăng từ Safari → upload **thành công** (không 422). Tải về: `curl -o clip.mov "<media_url của review>"` → `exiftool -a -G1 clip.mov | grep -iE "gps|location|iso6709|make|model|software|creat|date"` → **không** có vị trí, hãng, đời máy, phần mềm; ngày tạo rỗng hoặc `0000:00:00 00:00:00`. Có thể thêm `ffprobe -hide_banner -show_format clip.mov` → không có tag `location`/`com.apple.quicktime.*`. (F-099, 0dd61eb)
- [ ] **Android thật** (camera có gắn vị trí), clip MP4 → như trên: không `©xyz`/vị trí, không `com.android.version`/hãng/đời máy. (F-099)
- [ ] **Chrome trên Android: quay thẳng từ nút chọn video** (chọn Camera/Máy quay trong hộp chọn tệp) → clip MP4 lên được. Nếu hộp chọn không còn lựa chọn quay, hoặc báo "Video này chưa đúng định dạng…" → báo ngay (hệ quả của việc bỏ WebM). (7f48b13)
- [ ] Đổi đuôi một file `.webm` thành `.mp4` rồi đăng → sau khi tải lên hiện **"Video này chưa đúng định dạng. Bạn quay hoặc xuất lại thành MP4 hoặc MOV rồi thử lại nhé."**; review không được đăng. (F-102, 6a8d12e)

**Clip — phát, tua, cache (F-100)**
- [ ] Phát clip vừa đăng trên web → tua tới đầu, giữa, gần cuối, lùi lại → không đứng hình, không lỗi. DevTools → Network (lọc Media): request video trả **206**, header **`Cache-Control: private, max-age=86400, immutable`**. Kiểm lại: `curl -sI -r 0-1023 "<media_url>"` → `206` + đúng header đó. (F-100, 1fce328)
- [ ] App Android: mở cùng review → phát và tua như trên. (F-100)
- [ ] 4 clip **cũ** (đăng trước thay đổi) → phát và tua trên web và Android vẫn chạy; header cũ `public, max-age=31536000` là bình thường. (CACHE-AFTER-DELETE)

**Ảnh (F-099/F-100/F-103)**
- [ ] Đăng review có **ảnh** chụp điện thoại (có GPS), đổi ảnh đại diện, đổi ảnh bìa → thành công. `curl -sI "<url ảnh>"` → `Cache-Control: private, max-age=86400, immutable`. Tải ảnh về → `exiftool` → không GPS, không hãng/đời máy. Upload ảnh lỗi 4xx/5xx → báo ngay (upload ảnh giờ là multipart, 11855e8). (F-100, 11855e8)
- [ ] `manual.uat.admin` → `/admin/deals` → tải logo/banner là **ảnh JPEG chụp điện thoại có GPS** → bị từ chối, thông báo bảo chụp màn hình ảnh hoặc xuất lại không metadata; tải PNG sạch → thành công, header private. (F-103, 0ee8e82)

**Xoá**
- [ ] Xoá review có clip mới đăng → mở lại URL clip bằng **cửa sổ ẩn danh** hoặc `curl -sI` → **404** ngay (không còn cache biên). Trình duyệt đã xem trước đó có thể còn bản sao ≤ 1 ngày — đúng. (F-100)
- [ ] (Chỉ khi D4 đã áp và có `CRON_SECRET`) Tài khoản **tổng hợp mới** (không bao giờ tài khoản thật): tải ảnh đại diện → xoá user trong Dashboard → `curl -H "Authorization: Bearer $CRON_SECRET" `https://www.tappyai.com` (production, sau khi deploy)/api/cron/account-deletion-jobs` → `completed ≥ 1` → URL ảnh đại diện trả 404/403. (F-096, DEPLOY §1-D4)

**Smoke sau deploy (DEPLOY-CHECKLIST §5)**
- [ ] Home 200, không lỗi Console lúc hiện đầu. (§5.1)
- [ ] Đăng nhập email + mật khẩu. (§5.2)
- [ ] Hỏi đồ ăn/du lịch tiếng Việt → địa điểm thật (Serper live). (§5.3)
- [ ] Đăng review chữ → thành công, hiện trong hồ sơ. (§5.4)
- [ ] Plan tiếng Việt lớn → Chia sẻ → có link, `/plan/<id>` mở được. (§5.5, F-029)
- [ ] Clip của người khác → ⋮ Báo cáo → "đã gửi". (§5.6, F-031)
- [ ] `/copyright` EN + VI; Android Cài đặt → Pháp lý → Chính sách bản quyền mở cùng trang. (§5.7)
- [ ] `GET /rest/v1/music_tracks?select=id` bằng **anon key** → rỗng / permission denied. (§5.8, F-034)
- [ ] Back office mở được cho admin `@tappyai.com`. (§5.9, F-032)
- [ ] Theo dõi log server trong lúc làm các bước trên: không có 500. (§5.10)
- [ ] Nhóm: ngay sau deploy áp S1 (`20260904_group_read_boundary`) → người có link vẫn mở/tham gia được nhóm; anon key đọc `groups` → 0 dòng. (F-065, DEPLOY §1-S1)
- [ ] Bucket: `gcloud storage buckets get-iam-policy gs://tappyai-media-prod` → `allUsers` chỉ có `roles/storage.legacyObjectReader`, không có `objectViewer`. (CLIP-METADATA-P1 §5)
- [ ] GA4 Realtime (property G-8GP7L7N516, chỉ production) → thấy `page_view`, `chat_response`. (F-001)
- [ ] Nút mua: sau khi chạy job feed-ingest (§6 checklist) → một câu mua sắm có "Mua trên …". Trước đó trống là đúng. (§5.11, F-036)

---

## §15. Không test được ở local — và vì sao

| Mảng | Vì sao | Cách mở khoá |
|---|---|---|
| **Upload ảnh / video / avatar / ảnh bìa / ảnh nhóm / logo deal** | `/api/reviews/upload`, `/api/upload/video` → 500 `WifExchangeError`: token OIDC Vercel trong `.env.local` đã hết hạn (W11). Kéo theo: metadata clip, WebM đổi đuôi, 206/Cache-Control, xoá file | §14 trên môi trường đã deploy. **Không** chạy `vercel env pull` trong đợt UAT này: nó ghi đè `.env.local` (guard sẽ chặn nếu kéo về ref production, nhưng file audit mất) |
| **Job cron** (xoá file sau xoá tài khoản, dọn `decision_evidence`, `audit-retention`) | Không có `CRON_SECRET` trong `.env.local`; job xoá file cần thêm WIF | Sau deploy, chạy bằng `curl` có `CRON_SECRET` (§14) |
| **Đăng nhập Google** | Supabase audit đang giữ secret cũ của "Web client 1" (client dùng chung với production) → `invalid_client`. Client riêng **"TappyAI Web - Supabase UAT" đã được tạo (22/09)**; đã dán vào audit → Providers → Google hay chưa: **chưa kiểm** | Dán ID + secret của client UAT vào Supabase audit rồi thử lại |
| **OTP email / xác nhận đăng ký** | Audit không có email sender | Dùng email + mật khẩu; tạo tài khoản thử bằng Dashboard (§0) |
| **Đăng nhập Zalo** | Cần `ZALO_VERIFY_*` (verifier qua VPS Việt Nam); thiếu thì route trả 503. Đã chấp nhận trên máy Android thật qua `uat.tappyai.com` (d7a830d) | Test trên máy thật với môi trường có verifier |
| **Mua Pro** | Không có khoá Stripe test; Apple IAP cần thiết bị | Trạng thái Pro kiểm qua tài khoản Pro |
| **Affiliate / Accesstrade** (F-020, F-036) | Chưa có publisher id; feed rỗng | Sau khi được duyệt: đặt env, chạy cron feed-ingest |
| **GA4 nhận event thật** | Không có Measurement ID ở local | Đặt `G-8GP7L7N516` trên production, xem Realtime |
| **iOS** | Không có macOS. iOS **không phát hành**: clip sẽ 422 (F-101) và còn UI music-reuse | — |
| **Camera thật, quét QR bằng camera, mic, push thật, WebView trong Zalo/Facebook/Messenger** | Emulator không có | Máy thật |
| **Android bản release/staging (minified) + OTP email** | Thiếu R8 keep rules của supabase-kt (F-098) | Owner quyết |
| **Tải lớn / hiệu năng** | DB audit không có dữ liệu cỡ production | — |
| **Giới hạn email production 2/giờ** | Là cấu hình của project production, không có trên audit | Chỉ ghi nhận |

---

## §16. Lỗi đã biết, không báo lại

**Chặn launch, hoặc cần bạn quyết:**
- **F-061 (P0):** giá trị secret đã lộ trong một phiên Claude → phải **rotate** (danh sách ở `PRELAUNCH-REPORT.md` Part 2).
- **F-064 (P1):** token PAT Supabase nằm trong file local. **F-062 (P1):** Preview của Vercel mang key production.
- **Android release blockers (DEPLOY-CHECKLIST):** **F-107** bố cục khác nhau trước/sau đăng nhập (session Zalo xử lý; §9 kiểm còn hay hết) và **F-098** bản minified thiếu keep rules R8. Nếu thấy ở §9, chỉ cần xác nhận, không cần mô tả lại.
- **Merge `a6ca9f0` chưa được audit toàn bộ.** Nó đã làm mất dây nối share Android (F-070, đã sửa); có thể còn chỗ khác.
- **iOS:** F-101 (clip 422) + UI music-reuse. Không phát hành iOS.
- **F-002:** Next 14.2.35 — đã giảm thiểu trên Vercel, nâng cấp sau launch.

**Chất lượng, sau launch (P2/P3):**
- F-105: thông báo do server viết luôn bằng tiếng Việt, kể cả với người dùng tiếng Anh.
- F-106: web mặc định tối (2 chế độ), Android theo hệ thống (3 chế độ).
- F-011: `/register` hiện nguyên văn lỗi của Supabase (ví dụ "email rate limit exceeded", "Email address … is invalid").
- F-058: trang 404/lỗi chỉ tiếng Việt, nền sáng cho khách EN. F-076: khung trang `/r` vẫn tiếng Việt cho khách EN.
- F-036: không có nút "Mua trên …" (feed rỗng) — đúng dữ liệu.
- F-068: lý do trong phân tích tin nhắn lừa đảo bằng tiếng Anh.
- F-071: câu văn mua sắm vỡ (phần còn lại sau F-094). F-072: lý luận mâu thuẫn với thẻ. F-045: một lượt du lịch chỉ ra một bộ thẻ.
- F-073 / F-088: thẻ mua sắm Android ghi "rated … reviews" tiếng Anh, thiếu các sửa đồng bộ web.
- F-074: dòng "Đánh đổi: 912 lượt đánh giá" gây hiểu nhầm.
- F-075: quiz "muốn hiểu bạn hơn" che câu trả lời đầu tiên.
- F-077: chi tiết nhỏ Android (splash "T", icon status bar trắng trên nền sáng, tagline tiếng Anh, máy en-US mở tiếng Việt).
- F-078: link share Android luôn là domain production.
- F-067: bộ nhớ giữ ngân sách một lần mua.
- F-089: trang nhóm không có ô đổi ảnh nhóm (backend có, UI hoãn). F-090: sidebar thiếu "MY ACCOUNT". F-091: web thiếu bộ sưu tập cá nhân (Posts/Liked/Saved/Hidden/Shared). F-087: câu khen "không gian/chất lượng" không nguồn chưa bị cắt.
- F-104: SVG logo deal chưa kiểm metadata. F-023: Scam Shield chưa có câu miễn trừ riêng.

**Không phải lỗi:**
- Deals trống, không có nút mua (§2).
- Ảnh review ở host lạ hiện **ô xám** thay vì ảnh (sửa F-057, 8439330).
- 8 thẻ, 3 thẻ trên màn đầu (F-060).
- Trang public chớp tiếng Việt rồi sang EN; nhãn EN trộn nội dung VI trên brochure; thanh "Translate page?" của Chrome.
- `/r/<slug>` chỉ hỏi 18+ sau khi khách tự gửi câu hỏi.
- `/delete-account` còn lời văn cũ (bản mới chưa đăng).
- Clip cũ mang header `public`, 1 năm.
- Upload lỗi `WifExchangeError` ở localhost.
- `npm test` ghi đè `docs/audit/*.json`. Lần mở đầu mỗi trang chậm. Home Android thoáng hiện "Chào bạn!" trước khi hiện tên. Huy hiệu dev ghi SHA lúc server khởi động.
