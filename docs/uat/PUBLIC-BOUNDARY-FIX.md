# Ranh giới Public / App — báo cáo sửa lỗi (2026-09-24)

```
> npm run whoami
  worktree : D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\g1-place-guard
  branch   : rc/web-uat
  commit   : d9f1c0b (+ local changes)
  supabase : zdaprdfgpbpnxyofagmc  ✅ audit/non-prod
  dev port : 3007
```

Thay đổi chưa commit lúc chạy lệnh trên chỉ gồm `docs/uat/*` (báo cáo này, evidence, findings). Chưa push, chưa deploy, không kết nối DB production.

**Commit (local, mỗi mục một commit):**

| Mục | Commit | Nội dung |
|---|---|---|
| 3 + 4 | `6900362` | Ranh giới `(app)`; 2 cổng chuyển khỏi layout gốc; ngôn ngữ trang public theo trình duyệt |
| 9 | `fb976c1` | Test chặn hồi quy `src/app/publicBoundary.test.ts` |
| 10a | `b6525e3` | Khôi phục 2 dòng CSS của e35a9b5 |
| 10b | `b0045ab` | "chưa có giá" không bao giờ được vẽ như giá (web + Android) |
| 10d | `d9f1c0b` | "1 days" → "1 day" |
| 10c | — | Chỉ sửa `.env.local`; file này bị gitignore nên không commit |

⚠️ Có một phiên Claude khác (làm Zalo) chạy song song trong **cùng worktree** này. Phiên đó đã commit `b7a9586` rồi rebase các commit của tôi lên trên, nên SHA đổi (`6900362`→`6900362`, `fb976c1`→`fb976c1`). Tôi đã kiểm bằng `git diff fb976c1 fb976c1`: khác biệt chỉ nằm ở 3 file Zalo của họ, nội dung của tôi không đổi.

---

## 1. Kiểm kê route vào được khi KHÔNG có tài khoản

Bằng chứng khả năng truy cập: chạy harness CDP ẩn danh trên từng route (`evidence/public-boundary-2026-09-24/web-before-fix/before_results.json`). Dự án không có `middleware.ts`.

**Trang công khai — đích chia sẻ và landing (sau sửa: nằm NGOÀI `(app)`)**

| Route | File |
|---|---|
| `/plan/[shareId]` + `opengraph-image` + `twitter-image` | `src/app/plan/[shareId]/page.tsx`, `opengraph-image.tsx`, `twitter-image.tsx` |
| `/r/[slug]` (kết quả công khai G1) | `src/app/r/[slug]/page.tsx` |
| `/reviews/[id]` (review, clip) | `src/app/reviews/[id]/page.tsx` |
| `/reviews/creator/[id]` | `src/app/reviews/creator/[id]/page.tsx` |
| `/users/[id]` (hồ sơ công khai; mã QR hồ sơ trỏ vào đây) | `src/app/users/[id]/page.tsx` |
| `/reviews` (feed Explore) | `src/app/reviews/page.tsx` |
| `/sound/[trackId]` (music đã ẩn; trả trang "không còn khả dụng") | `src/app/sound/[trackId]/page.tsx` |
| `/scam-shield`, `/scam-shield/kich-ban`, `/scam-shield/kich-ban/[id]` | `src/app/scam-shield/**` |
| Hub `/food` `/shopping` `/entertainment` `/travel` `/spa` | `src/app/(discovery)/[domain]/page.tsx` |
| `/about` `/how-to-use` `/privacy` `/terms` `/copyright` `/startup` `/delete-account` | `src/app/<tên>/page.tsx` |
| `/extension`, `/extension/privacy`, `/extension/welcome` | `src/app/extension/**` |
| `/controller` (trang public của Controller, có nút VI/EN riêng) | `src/app/controller/page.tsx` |
| Luồng đăng nhập: `/login`, `/register`, `/auth/zalo-finish`, `/age-check`, `/access-denied` | `src/app/<tên>/page.tsx` |
| `not-found`, `error`, `robots.txt`, `sitemap.xml` | `src/app/not-found.tsx`, `error.tsx`, `robots.ts`, `sitemap.ts` |
| OG / preview khác | `/api/oembed`; `src/app/r/[slug]/og.png` là file tĩnh, không phải route |

`/kiem-tra` **không có** trên nhánh này; nó nằm ở nhánh riêng `feat/scam-shield-public-utility`.

**Trang app mà khách vẫn mở được (sau sửa: nằm TRONG `(app)`)**
- Khách xem được: `/`, `/chat`, `/tools`, `/deals`, `/reviews/new`, `/profile`, `/scan`, `/translate`, `/currency`, `/split-bill`, `/boi/**`, `/game/**`, `/recommendations`, `/onboarding`, `/viet-content`.
- Bị chuyển về `/login` (login wall đúng chỗ): `/social`, `/profile/qr`, `/profile/settings`, `/planner`, `/group/new`, `/subscription`, `/admin`, `/service/[id]`.
- Trả 404 vì đã ẩn: `/marketplace`, `/music`.

## 2. Audit first paint khi đăng xuất (TRƯỚC khi sửa)

Mỗi route chạy trong một browser context mới (không cookie, không storage). Script gắn trước `navigator.geolocation` để đếm lời gọi (`evidence/…/web-before-fix/`).

| Cái gì chặn | Ở đâu | Route bị ảnh hưởng |
|---|---|---|
| Hộp xin vị trí (`getCurrentPosition` ×2 ở dev do StrictMode) | `src/components/LocationProvider.tsx` gắn trong **`src/app/layout.tsx` (layout gốc)** | **Mọi** route HTML ở mục 1 |
| Modal "Chọn ngôn ngữ / Choose your language" | `src/components/LanguagePicker.tsx` gắn trong layout gốc; chỉ `/controller` được miễn qua danh sách pathname | Mọi route trừ `/controller` |
| Age gate | Không có lúc mount. `/r/[slug]` có redirect age nằm **trong `useEffect`**, chỉ kích hoạt sau khi khách hỏi | — |
| Login wall | Không có trên trang public. `/service/[id]` redirect `/login`, nhưng đó là trang đặt dịch vụ (app) | — |

Trên Android Chrome (ảnh `evidence/brochure-2026-09-24/android_geoprompt.png`, `android_firstvisit_langmodal.png`), hai lớp này chồng lên nhau, rồi Chrome còn bật thêm thanh "Translate page?".

## 3. Ranh giới được vạch ở đâu

```
src/app/layout.tsx          ← bọc MỌI route. Không cổng nào. Có ghi chú 🚨 THE PUBLIC / APP BOUNDARY.
src/app/(app)/layout.tsx    ← CHỈ bọc route trong (app)/. Gắn <LocationProvider/> + <LanguagePicker/>
                              + một marker DOM ẩn [data-tappy-app-surface].
src/app/(app)/…             ← Home, chat, tools, deals, profile, planner, admin, onboarding, service,
                              reviews/new, … (chuyển bằng git mv, lịch sử giữ nguyên; URL không đổi).
src/app/<mọi thứ khác>      ← PUBLIC mặc định.
```

- **Trang mới tự đứng đúng phía mà không cần ai nhớ gì.** Một `page.tsx` mới đặt ở bất kỳ đâu ngoài `src/app/(app)/` sẽ không có layout `(app)`, nên không có cổng. Không có allowlist pathname, không có registry, không có config.
- **Chỉ trang app phải chủ động opt-in**, bằng cách nằm trong `(app)/`. Nếu quên đặt một trang app vào đó, hậu quả là trang app thiếu modal ngôn ngữ; không bao giờ ngược lại là trang public bị chặn. Tức là mặc định an toàn.
- `LanguagePicker` không còn đọc pathname nào (đã xoá `OWNS_ITS_LANGUAGE_CONTROL`). `/controller` nằm ngoài `(app)` nên modal không chạm tới được, theo cấu trúc chứ không theo danh sách.
- Age gate và login wall vẫn nằm trong các trang app vốn cần chúng. Test mục 9 cấm chúng xuất hiện lúc mount trên phía public.

## 4. Cổng vị trí và ngôn ngữ

- **Trang public render ngay:** không gọi geolocation, không mở modal.
- **Ngôn ngữ theo `Accept-Language`, không hỏi:**
  - Trang render phía server như `/plan` vốn đã theo header.
  - Trang render phía client nay mặc định theo `navigator.languages` (cũng là danh sách trình duyệt biến thành `Accept-Language`), chuẩn hoá bằng đúng hàm `normalizeLocale` của server (`src/lib/i18n/appSurface.ts`).
  - Trong app, mặc định vẫn là `'vi'` cho tới khi người dùng chọn ở modal (ADR-027 giữ nguyên).
  - Phía được xác định bằng marker DOM mà layout `(app)` render từ server, không dựa vào pathname.
  - Bằng chứng: harness EN cho `<html lang="en">` trên mọi trang public, nội dung tiếng Anh (`web-first-paint/_grid_final_en.png`).
- **Vị trí chỉ được xin khi có hành động cần nó:**
  - Trang public không còn chỗ nào xin.
  - Trong app, `LocationProvider` xin khi vào app, và chip "📍 Tìm quanh đây" xin khi bấm (mục 8).
- `/r/[slug]`: redirect age chuyển từ `useEffect` sang `useChat({ onError })`, nên chỉ có thể là phản hồi cho câu hỏi khách tự gửi.
- **Tác dụng phụ đã biết (không chặn):**
  - Trang public render phía client vẫn SSR bằng `'vi'`; khách EN thấy VI trong tích tắc rồi chuyển sang EN (y như người dùng đã lưu `en` từ trước).
  - Muốn SSR đúng ngôn ngữ thì phải đọc header ở layout gốc, và mọi route sẽ mất static rendering. Tôi không làm việc đó.

## 5. Chứng minh an toàn mặc định (route dùng thử)

- Tạo `src/app/uat-throwaway-public/page.tsx` (client component dùng `useTranslation`). **Không** thêm vào list, registry hay config nào: `grep -rn uat-throwaway src scripts next.config.mjs` chỉ trả về chính file đó.
- Harness, context mới, không đăng nhập:
  - `vi-VN`: `200`, `langModal=false`, `geoCalls=0`, không login wall, không age gate, `htmlLang=vi`.
  - `en-US`: tương tự, `htmlLang=en`, trang hiện `locale = en`.
  - Ảnh: `evidence/public-boundary-2026-09-24/throwaway-public-route-en.png`, `-vi.png`.
- Test chặn tự dò ra route mới: số test tăng từ 36 lên **37 passed** mà không phải sửa gì.
- **Đã xoá route dùng thử.** `curl /uat-throwaway-public` giờ trả `404`; git chưa từng theo dõi file này.

## 6. Bằng chứng web, trình duyệt sạch (SAU khi sửa)

- Cách chạy: Edge headless qua CDP; mỗi route một `BrowserContext` mới (không storage, không cookie, không đăng nhập); viewport 390×844.
- Chạy 2 lần: `Accept-Language: vi-VN` và `en-US`.
- Cột "Location prompt" là số lời gọi `getCurrentPosition` đếm được (VI/EN).
- Ảnh nằm trong `evidence/public-boundary-2026-09-24/web-first-paint/`; tổng hợp ở `_grid_final_vi.png` và `_grid_final_en.png`.

| Route | Loads logged out | First paint (screenshot) | Location prompt | Language modal | Login wall | Age gate |
|---|---|---|---|---|---|---|
| /plan/cZAI86wdjVH7 | ✅ 200 | final_vi_plan.png · final_en_plan.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /plan/…/opengraph-image | ✅ 200 (ảnh) | final_vi_plan_og.png · final_en_plan_og.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /r/uat2609nosuchslug | ✅ 404 đúng¹ | final_vi_r_missing.png · final_en_r_missing.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /reviews/62116a0d… (review ảnh) | ❌ **500**, F-057 (có từ trước, không liên quan) | final_vi_review_photo.png · final_en_review_photo.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /reviews/8d959f57… (clip) | ✅ 200 | final_vi_review_clip.png · final_en_review_clip.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /reviews/creator/3ce552c5… | ✅ 200 | final_vi_creator.png · final_en_creator.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /users/5c674157… | ✅ 200 | final_vi_user_profile.png · final_en_user_profile.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /reviews (feed Explore) | ⚠️ 200 nhưng hiện màn lỗi trên mobile, F-057 | final_vi_explore_feed.png · final_en_explore_feed.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /scam-shield | ✅ 200 | final_vi_scam_shield.png · final_en_scam_shield.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /scam-shield/kich-ban | ✅ 200 | final_vi_scam_kb.png · final_en_scam_kb.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /scam-shield/kich-ban/bca-2026-01 | ✅ 200 | final_vi_scam_kb_item.png · final_en_scam_kb_item.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /food | ✅ 200 | final_vi_hub_food.png · final_en_hub_food.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /travel | ✅ 200 | final_vi_hub_travel.png · final_en_hub_travel.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /about | ✅ 200 | final_vi_about.png · final_en_about.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /how-to-use | ✅ 200 | final_vi_how_to_use.png · final_en_how_to_use.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /privacy | ✅ 200 | final_vi_privacy.png · final_en_privacy.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /terms | ✅ 200 | final_vi_terms.png · final_en_terms.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /copyright | ✅ 200 | final_vi_copyright.png · final_en_copyright.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /startup | ✅ 200 | final_vi_startup.png · final_en_startup.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /extension | ✅ 200 | final_vi_extension.png · final_en_extension.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /extension/privacy | ✅ 200 | final_vi_extension_privacy.png · final_en_extension_privacy.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /extension/welcome | ✅ 200 | final_vi_extension_welcome.png · final_en_extension_welcome.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /delete-account | ✅ 200 | final_vi_delete_account.png · final_en_delete_account.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /sound/uat2609-nosuch | ✅ 200 (trang "không còn khả dụng") | final_vi_sound.png · final_en_sound.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /uat2609-no-such-page | ✅ 404 đúng² | final_vi_not_found.png · final_en_not_found.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /controller | ✅ 200 | final_vi_controller.png · final_en_controller.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /access-denied | ✅ 200 | final_vi_access_denied.png · final_en_access_denied.png | ❌ (0/0) | ❌ | ❌ | ❌ |
| /login | ✅ 200 | final_vi_login.png · final_en_login.png | ❌ (0/0) | ❌ | N/A (chính là trang đăng nhập) | ❌ |
| /register | ✅ 200 | final_vi_register.png · final_en_register.png | ❌ (0/0) | ❌ | N/A (chính là trang đăng ký) | ❌ |
| /age-check | ✅ 200 | final_vi_age_check_page.png · final_en_age_check_page.png | ❌ (0/0) | ❌ | ❌ | N/A (chính là trang age-check) |
| /auth/zalo-finish (không tham số) | ✅ 200 → /login | final_vi_auth_zalo_finish.png · final_en_auth_zalo_finish.png | ❌ (0/0) | ❌ | N/A (callback đăng nhập thất bại thì quay về /login) | ❌ |

¹ `/r/<slug>` có dữ liệu thật: **đã kiểm** sau khi apply 2 migration G1 lên audit (PRELAUNCH Part 3).
- `/r/QNgw8uoghB` → 200; không hộp xin vị trí, không modal, không cổng nào; VI `htmlLang=vi`, EN `htmlLang=en` (`final_vi_r_real.png` · `final_en_r_real.png`).
- Ghi nhận, chỉ báo cáo: phần nhãn của trang `/r` vẫn là tiếng Việt với khách EN (trang render theo ngôn ngữ của nội dung).
² Trang 404 và trang lỗi hiện tiếng Việt, nền sáng với khách EN: F-058 (P3, mở).

## 7. Android — không giả định

- **`/plan/*`, `/r/*`, `/reviews/*`, `/users/*`, `/scam-shield`, hub: KHÔNG có màn hình native nào.** Chúng chỉ là trang web mở trong trình duyệt.
- **Deep link native hiện có** (`android/app/src/main/AndroidManifest.xml`):
  - `tappyai://auth-callback` (quay về sau OAuth);
  - `tappyai://group` (mời vào nhóm, cần tài khoản);
  - nhận chia sẻ văn bản (`SEND` / `PROCESS_TEXT`);
  - `activity-alias .PublicLinkActivity` cho `https://<host>/r/*`: **TẮT mặc định** (`tappy_app_links_enabled=false`). Khi bật, nó mở chính trang web trong Custom Tab.
- Bằng chứng không có native handler: `pm query-activities -a VIEW -d https://www.tappyai.com/r/AbCdEf1234` → **1 activity: `com.android.chrome/…IntentDispatcher`**.
- **Web-in-browser (Chrome trên emulator Pixel_8_uat).**
  - Dùng origin mới `http://127.0.0.1:3007` nên storage và quyền đều sạch.
  - 7 trang public đều không có hộp xin vị trí và không có modal: `evidence/public-boundary-2026-09-24/android/web-in-chrome_01…07.png` (dải tổng hợp `_strip_web-in-chrome.png`).
  - Thanh "Translate page? Vietnamese→English" trên `/plan` là giao diện của Chrome, do nội dung plan là tiếng Việt.
  - Lần chụp đầu gặp ANR "Chrome isn't responding" vì máy ảo vừa khởi động (load avg 6.8). Tôi đã đóng dialog đó và chụp lại.
- **Link mở từ app nhắn tin.**
  - Emulator có Google Messages. Tôi giả lập một SMS đến bằng `adb emu sms send` (chỉ trong máy ảo, không gửi tin thật).
  - Bản xem trước OG hiển thị đúng; bấm link thì mở trong **Chrome** (`ChromeTabbedActivity`); brochure sạch (`android/_pair_messages.png`, `messages_*.png`).
  - Mở trong WebView của Zalo/Facebook/Messenger: **UNVERIFIED**. Emulator không cài các app đó, và cài từ Play Store cần đăng nhập tài khoản Google. Ở mức web, trang không gọi geolocation và không mở modal, nên kết quả không phụ thuộc engine.
- App Android native: task này **không đổi** code onboarding (không có diff onboarding/auth dưới `android/`; thay đổi Android duy nhất là mục 10b).

## 8. Hồi quy onboarding của app

| App page | Language selection | Location request |
|---|---|---|
| `/` (Home) — web, context mới | ✅ modal hiện (`web-app-onboarding/app_home_first_visit.png`) | ✅ xin khi vào (`geo=2`) |
| `/chat` — web | ✅ modal hiện (`app_chat_first_visit.png`) | ✅ xin khi vào (`geo=2`) |
| `/chat` — bấm "📍 Tìm quanh đây" sau khi chọn ngôn ngữ | — (đã chọn, modal đóng) | ✅ xin **khi bấm**: `geo 2 → 3` (`app_chat_after_near_me_tap.png`) |
| `/tools` | ✅ (`app_tools_first_visit.png`) | ✅ (`geo=2`) |
| `/onboarding` | ✅ (`app_onboarding_first_visit.png`) | ✅ (`geo=2`) |
| `/` — Android Chrome thật, cùng origin 127.0.0.1 | ✅ `android/app-home_first_visit_2_language.png` | ✅ hộp xin quyền **thật** của Chrome: `android/app-home_first_visit_1.png` |

Dữ liệu gốc: `web-app-onboarding/onboarding_results.json` (mọi trang app đều có `appMarker: true`). Ở dev, `geo=2` vì StrictMode chạy effect hai lần.

Trên Android, 7 trang public được mở **trước** trong cùng origin mà không có hộp xin quyền nào. Hộp xin quyền đầu tiên chỉ xuất hiện khi vào Home. Đây là bằng chứng ranh giới đúng ngay trong một phiên duyệt thật.

## 9. Test chặn hồi quy: đã đỏ trước khi xanh

**Test:** `src/app/publicBoundary.test.ts`.
- Tự dò mọi route entry (`page`, `layout`, `template`, `not-found`, `error`, `loading`, `default`, `opengraph-image`…) nằm ngoài `(app)`. Không có danh sách để duy trì.
- Đi theo toàn bộ đồ thị import bằng TypeScript AST (gồm cả `import()` động và `require`).
- **Fail** khi gặp một trong các điều sau:
  - `LocationProvider`, `LanguagePicker` hoặc layout `(app)` có thể tới được từ route public, kể cả từ layout gốc;
  - trong một effect React hoặc lúc load module: `navigator.geolocation`, hoặc redirect tới `/login`, `/register`, `/age-check` (theo helper cùng module thêm một tầng);
  - trong module server: `redirect()` tới các trang đó.
- Gọi trong event handler hoặc callback của request vẫn hợp lệ (ví dụ "near me", "like").
- Luồng đăng nhập (`login`, `register`, `auth`) chỉ được miễn quy tắc login wall. Miễn trừ này an toàn: quên cập nhật thì test đỏ, không lọt.
- Ngoài ra có neo: `/plan`, `/r`, `/reviews/[id]`, `/users/[id]`, `/scam-shield` phải còn là public.

**Chứng minh** (log đầy đủ trong `evidence/public-boundary-2026-09-24/guard-test-*.log`):

```
# 1) Cố tình tái tạo đúng lỗi merge: thêm lại 2 cổng vào src/app/layout.tsx
+import LocationProvider from '@/components/LocationProvider'
+import LanguagePicker from '@/components/LanguagePicker'
+        <LocationProvider />
+        <LanguagePicker />
vitest exit=1
      Tests  2 failed | 34 passed (36)
     × the (app) layout is the one place the first-visit gates are mounted
     × src/app/layout.tsx mounts no location gate, language modal, age gate or login wall
  ✗ location gate (LocationProvider)
      via src\app\layout.tsx → src\components\LocationProvider.tsx
  ✗ in useEffect: asks for location (navigator.geolocation)
      in src\app\layout.tsx → src\components\LocationProvider.tsx
  ✗ language modal (LanguagePicker)

# 2) Thêm vào brochure một effect tự gọi geolocation + router.replace('/login') (không qua component cổng nào)
vitest exit=1
      Tests  3 failed | 33 passed (36)
     × src/app/plan/[shareId]/page.tsx mounts no location gate, language modal, age gate or login wall
  ✗ in useEffect: asks for location (navigator.geolocation)
      in src\app\plan\[shareId]\page.tsx → …\PlanBrochure.tsx → …\PlanBrochureShare.tsx
  ✗ in useEffect: redirects to a wall: router.replace('/login')

# 3) Hoàn tác cả hai
vitest exit=0
 Test Files  1 passed (1)
      Tests  36 passed (36)
```

Giới hạn (nói thẳng):
- Test là phân tích tĩnh. Một cổng gọi gián tiếp qua hàm ở **module khác** bên trong effect sẽ không bị bắt.
- Lớp bảo vệ thứ hai là harness runtime ở mục 6, hiện chạy tay bằng script trong scratchpad, **chưa nằm trong CI**.

## 10. Brochure

- **10a**: 2 dòng CSS của e35a9b5 đã khôi phục đúng từng ký tự (`b6525e3`).
  - Computed style: `letter-spacing: normal`, không còn rule `.v3-pb-brand-mark`.
  - So pixel trước/sau: **0 pixel khác** ở 375px và 1280px (`evidence/brochure-2026-09-24/10a_header_before_after.png`).
- **10b**: "chưa có giá" không bao giờ thành giá nữa (`b0045ab`).
  - Web: `lib/plans/planPrice.ts`, áp tại `parsePlan` (thẻ chat, Planner, payload chia sẻ) và `toPlanShareSnapshot`. Đường đọc của snapshot chiếu lại, nên các dòng đã lưu như `cZAI86wdjVH7` cũng sạch; mini preview và ảnh OG dùng cùng snapshot.
  - Android: `chat/PlanPrice.kt` trong `ChatResponseParser` (thẻ chat, Planner, ShareArtifact).
  - Quy tắc: giữ khi có chữ số hoặc là "Miễn phí"/"Free"; bỏ sentinel, "$$", "Liên hệ", chuỗi rỗng.
  - Kèm theo: header thẻ trước đây ra "2 người ·" khi không có ngân sách thật; giờ ghép nối đúng thành "2 người".
  - Kiểm các trường khác: địa chỉ và link để trống khi không có (không dùng sentinel), `people` là số. Không trường nào khác mắc cùng lỗi.
  - Bằng chứng:
    - HTML `/plan` có **0** lần "chưa có giá", "Miễn phí" vẫn còn (`10b_before_after.png`);
    - thẻ chat thật (phiên magic-link `manual.uat.pro`) không có chip sentinel, meta "2 người";
    - Android `PlanPriceTest` 3/3.
- **10c**: `.env.local`: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` (và `AUDIT_BASE_URL`, cũng trỏ cổng chết) → `http://localhost:3007`.
  - `og:url` và `twitter:image` giờ ở :3007; ảnh OG có lại logo rái cá (`og_image_after_10c.png`).
  - **Production không bị ảnh hưởng**: `git check-ignore -v .env.local` → `.gitignore:44:.env*`; file không bao giờ được commit hay deploy; production đọc env của Vercel.
  - RUNBOOK §0 vẫn ghi 3101. Mục đó do owner quản, nên tôi không sửa.
- **10d**: một dòng trong `fill()` (`d9f1c0b`). `curl -H 'Accept-Language: en-US'` → "1 day" (4 lần), 0 lần "1 days".
- **Chỉ báo cáo, không đổi** (theo chỉ thị):
  - nhãn tiếng Anh trộn nội dung tiếng Việt của plan (nhãn theo ngôn ngữ người xem, nội dung là của người gửi);
  - plan này không có ảnh (quy tắc ảnh của 21f7833);
  - badge dev ghi SHA lúc server khởi động.

## Finding mới (`findings.json`)

| ID | Mức | Trạng thái | Tóm tắt |
|---|---|---|---|
| F-053 | P1 | fixed | Link chia sẻ bị hộp xin vị trí và modal ngôn ngữ chặn |
| F-054 | P2 | fixed | Sentinel "chưa có giá" hiện như giá (web + Android) |
| F-055 | P3 | fixed | Merge 1e7b77e làm mất CSS brand của e35a9b5 |
| F-056 | P3 | fixed | "1 days" |
| **F-057** | **P1** | **open** | Ảnh review ở host `next/image` không cho phép → `/reviews/<id>` trả **500**, feed Explore trên mobile hiện màn lỗi. Có từ trước; hiện gặp do seed audit dùng `images.unsplash.com` |
| F-058 | P3 | open | 404/error tiếng Việt, nền sáng cho khách EN |
| F-059 | P3 | fixed (chỉ local) | Link chia sẻ và OG local trỏ :3101 |

## Chưa kiểm được và lý do

- **WebView trong Zalo/Facebook/Messenger**: không có app trên emulator; cài cần đăng nhập Google.
- **`/r/<slug>` có dữ liệu thật**: chưa có bảng `shared_results` trên audit (PRELAUNCH Part 3).
- **iOS**: không có macOS; code iOS không bị đổi trong task này.
- **Build production với route group mới**: chạy ở health check cuối phiên (PRELAUNCH FINISH).
