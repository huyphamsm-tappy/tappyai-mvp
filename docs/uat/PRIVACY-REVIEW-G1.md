# PRIVACY REVIEW — G1 Growth (danh bạ & query text đã lưu)

**Trạng thái: 🛑 CHƯA DUYỆT — chờ owner.**
Ngày: 2026-09-28 · Cây kiểm tra: `C:/wtrel` (== `origin/rc/web-uat` @ `380e0c9`) · Nguồn yêu cầu:
`docs/uat/DEPLOY-CHECKLIST.md` §7 "🔒 Privacy review REQUIRED before g1-growth merges".

Tài liệu này chỉ là **kiểm kê + đối chiếu**. Không sửa code, không chạm DB, không chạm prod. Mọi
kết luận dưới đây là đọc mã nguồn (file:line) trên RC; chỗ nào chưa đo được thì ghi rõ UNVERIFIED.

---

## 0. Kết luận nhanh

| Tính năng (§7 nêu tên) | Có trong RC không? | Kill switch trên prod không cần sửa code |
|---|---|---|
| **Contact sync** (`contact_identity_index`, `contact_matches`, `contact_sync_state`, `READ_CONTACTS`) | **KHÔNG.** Không có code, không có migration, không có permission. Bảng chỉ tồn tại trên DB audit (áp từ commit `254c28b`, không thuộc RC). | Không cần — tính năng không ship. (Nếu sau này đưa vào: hiện **không có flag nào**.) |
| **`query_texts`** (bảng lưu raw query) | **KHÔNG.** Không có code/migration nào trên RC tạo hoặc ghi bảng này. Chỉ có trên DB audit. | Không cần — không ship. |
| **Query text THỰC SỰ được lưu bởi RC** (xem §2): `shared_results.query` (G1), `user_events.metadata.query` (sự kiện `review_search`, web) | **CÓ.** | **KHÔNG có flag/env nào** — chỉ sửa code (hoặc không áp migration G1 — xem §5). |

Nói ngắn: nỗi lo §7 về *danh bạ* và *bảng `query_texts`* **không áp dụng cho bản phát hành này**
(chúng thuộc nhánh Phase 6 / `254c28b`, bị allowlist tới 2026-11-30 theo
`docs/uat/CONTAINMENT-TRIAGE-2026-09-25.md:61`). Nhưng RC **có** hai chỗ lưu văn bản câu hỏi của
người dùng mà §7 chưa nêu tên — đó là phần cần owner duyệt.

---

## 1. (a) Contact sync / truy cập danh bạ

### 1.1 Bằng chứng không có trên RC

- **Android — manifest nguồn:** `android/app/src/main/AndroidManifest.xml:14-30` chỉ khai báo
  `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`,
  `RECORD_AUDIO`, `POST_NOTIFICATIONS` (và *remove* `AD_ID`, `ACCESS_ADSERVICES_AD_ID`). Không có
  `READ_CONTACTS`. `android/app/src/debug/AndroidManifest.xml` cũng không có.
- **Android — manifest release đã merge** (build 2026-09-28 11:58, `versionCode="10"`):
  `android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml:20-70`
  — thêm từ thư viện: `WAKE_LOCK`, `c2dm.RECEIVE`, `ACCESS_ADSERVICES_ATTRIBUTION`,
  `BIND_GET_INSTALL_REFERRER_SERVICE`, `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. **Không có
  `READ_CONTACTS`** trong biến thể release.
  (Đề nghị owner xác nhận lần cuối trên đúng file AAB upload lên Play: `aapt2 dump permissions`/
  "App bundle explorer → Permissions" — merged manifest trong `build/` là bằng chứng mạnh nhưng không
  phải chính artifact đã ký.)
- **Android — code:** không có `ContactsContract`, `ACTION_PICK` danh bạ, hay tham chiếu tới
  `READ_CONTACTS` ở bất kỳ đâu trong `android/`.
- **Web:** không có `navigator.contacts` / Contact Picker API trong `src/` hay `public/`.
- **iOS:** không có `CNContact` / `NSContactsUsageDescription` trong `ios/`.
- **DB/migration:** `grep` toàn repo — `contact_identity_index`, `contact_matches`,
  `contact_sync_state`, `contact_sync_touch_updated_at` chỉ xuất hiện trong tài liệu
  (`docs/uat/DEPLOY-CHECKLIST.md:842-845, 879-890`, `docs/uat/inventory.md:76,115`,
  `docs/uat/CONTAINMENT-TRIAGE-2026-09-25.md:61`) và evidence. **Không có** file
  `supabase/migrations/*.sql` nào tạo chúng; không có dòng code `src/` nào đọc/ghi chúng.
- **Nguồn gốc:** commit `254c28b` ("Phase 6 Discovery/Monetization + Contact Sync", 4 migration) —
  `git merge-base --is-ancestor 254c28b HEAD` → **không phải tổ tiên của RC**. G1 (`47f2d5e`,
  `8a01877`) **có** trong RC nhưng hai commit này không đụng danh bạ.

### 1.2 Hệ quả

| Hạng mục | Kết quả |
|---|---|
| Thu gì | Không thu gì. |
| Lưu ở đâu | Không. (Bảng tồn tại **chỉ trên DB audit** — lệch schema, đã ghi nhận ở §7, không xoá.) |
| Retention / RLS | N/A trên RC. Trên audit: `contact_identity_index` RLS bật, 0 policy (service-role only) — `docs/uat/inventory.md:76`. |
| Màn hình đồng ý | Không có — và không cần vì không có quyền. |
| Flag | Không có flag. Không cần cho bản này. |

### 1.3 Điều kiện nếu sau này ship Contact Sync (ghi lại để không mất)
Khi nhánh `254c28b` được đưa vào (quyết định Phase 6, hạn 2026-11-30), phải có **trước khi merge**:
prominent disclosure trong app *trước* hộp thoại `READ_CONTACTS` + đồng ý chủ động; khai báo Data
safety "Contacts"; điều khoản privacy policy; xác minh định danh được **hash** at-rest; retention +
xoá khi thu hồi quyền / xoá tài khoản; **một kill switch** (flag server qua `/api/config` + guard
phía server) để tắt không cần phát hành app mới. Và **không** được áp các bảng này lên prod trước đó.

---

## 2. (b) Lưu văn bản câu hỏi (query text)

### 2.1 `shared_results.query` — G1 "Liên kết công khai" (CÓ trong RC)

| Hạng mục | Chi tiết |
|---|---|
| **Thu gì** | Câu hỏi của người dùng cho câu trả lời được chia sẻ, **sau khi "generalize"**: `resolveShareSource` lấy `source.question` từ hội thoại của chính owner (`src/lib/share/shareRequest.ts:80`) → `generalizeQuery()` (`src/lib/share/publicSanitizer.ts:92-104`) = `redactPii()` (regex email/SĐT/CCCD/số dài/địa chỉ ngôi thứ nhất, `publicSanitizer.ts:40-63`) + xoá cụm "cho vợ tôi", ngân sách, "gần nhà tôi"… (`:72-90`); cắt 200 ký tự (`publicSanitizer.ts:295`, `sharedResult.ts:71`). Kèm `payload` (câu trả lời đã sanitize), `domain`, `locale`, `owner_id`, `parent_id`, `owner_is_anonymous`, bộ đếm view/ask. Scam-share: `query` là câu **sinh từ server** chỉ chứa host+path (`src/lib/share/scamSharePayload.ts:36,50,65-76,112`) — không có query string của URL. |
| **Khi nào** | Chỉ khi người dùng bấm xác nhận "Tạo liên kết công khai": web `POST /api/shared-results` (`src/app/api/shared-results/route.ts:29-86`, insert tại `:59`), Android `SharedResultApi.kt:20-23`. Ẩn danh chỉ được share *con* từ một trang `/r/` (`sharePolicy.ts`, `SHARE_DAILY_LIMIT_ANON=3`). |
| **Lưu ở đâu** | `public.shared_results.query TEXT NOT NULL` — `supabase/migrations/20260913_g1_growth_foundation.sql:48` (bảng `:40-62`), bổ sung ancestry ở `20260918_g1b_share_ancestry.sql`. Migration G1/G2 **chưa áp lên prod** (DEPLOY-CHECKLIST §1 hàng G1/G2). |
| **Ai đọc được** | **CÔNG KHAI — theo thiết kế.** Server đọc bằng service-role và chiếu các cột public gồm `query` (`src/lib/share/sharedResultStore.ts:68,84,105`); hiển thị trên `/r/<slug>`, `GET /api/shared-results/<slug>`, ảnh OG, sitemap, và gửi IndexNow cho trang của tài khoản thật (`route.ts:68`). Qua PostgREST: chỉ owner SELECT được hàng của mình (`20260913…sql:74-76`); anon không có policy/grant (`:90-93`). |
| **Retention** | **Vĩnh viễn.** Không có cron/TTL. "Thu hồi" (`DELETE /api/shared-results/[slug]`, `src/app/api/shared-results/[slug]/route.ts:28`) chỉ đặt `status='removed'` — hàng + `query` vẫn nằm trong DB. **Không có UI nào gọi DELETE** (chỉ có API; `grep` web + Android). Xoá tài khoản: FK hiện là `ON DELETE SET NULL` (`20260913…sql:45`) → trang công khai **sống sót** sau khi xoá tài khoản; migration **D4** `20260925c_account_deletion_f096.sql:10` đổi sang CASCADE nhưng đang ⚠️ chờ owner duyệt. |
| **Màn hình đồng ý** | Có hộp xem trước bắt buộc trước khi tạo. Web `src/components/share/SharePreviewDialog.tsx:103-145`, copy `src/lib/i18n/share.ts:67-76,98` — "Người khác sẽ thấy gì", "Đây là bản công khai đã ẩn thông tin cá nhân. Chỉ khi bạn xác nhận, liên kết mới được tạo.", "Không bao gồm: tên, số điện thoại, email, địa chỉ nhà, trí nhớ và lịch sử trò chuyện của bạn.", nút "Tạo liên kết công khai"; hiển thị nguyên văn câu hỏi đã rút gọn (`SharePreviewDialog.tsx:124-125`). Android `SharePublicDialog.kt`, copy `android/app/src/main/res/values-vi/strings_chat.xml:287-301` (giống web). Người dùng sửa được **tiêu đề**, **không** sửa được câu hỏi. |
| **Flag / env** | **Không có.** Không có hằng số trong `src/lib/config/product.ts`, không có trong `/api/config` (`src/app/api/config/route.ts:48-54` chỉ có showProUpgrade/showAppConnections/showScamShield/showMusic…), không có `BuildConfig`/`ProductFlags.kt` cho share. Entry point web chỉ phụ thuộc `conversationId` (`src/components/chat/MessageActionBar.tsx:373`). |

### 2.2 `user_events.metadata.query` — sự kiện `review_search` (web) — CÓ trong RC (có từ trước G1)

| Hạng mục | Chi tiết |
|---|---|
| **Thu gì** | **Nguyên văn** chuỗi tìm kiếm bài đánh giá: `track('review_search', { query: q })` — `src/app/reviews/page.tsx:755`. |
| **Lọc** | `/api/track` chỉ loại sự kiện nếu metadata *trông giống* email/SĐT (`src/app/api/track/route.ts:41,50`) và xoá theo **tên khoá** (`ANALYTICS_FORBIDDEN_KEYS`, `src/lib/account/userDataClassification.ts:191-195` — `query` không nằm trong danh sách) tại `route.ts:128-129`. Văn bản tự do khác (tên, địa chỉ, bệnh…) **đi qua nguyên vẹn**. |
| **Lưu ở đâu** | `public.user_events.metadata` (JSONB). Có user_id nếu đăng nhập, hoặc chỉ `anon_id` nếu khách. `review_search` là event hợp lệ (`track/route.ts:21`). |
| **GA4** | **Không** gửi query: map `review_search → search {search_type:'reviews'}`, `params: []` (`src/lib/analytics/ga4.ts:143`). |
| **Android** | **Không** gửi query: `analytics.track("search", mapOf("search_type" to "reviews"))` — `android/.../reviews/ui/ReviewSearchViewModel.kt:92-94`. |
| **Ai đọc được** | RLS `"Users manage own events"` `auth.uid() = user_id` (`supabase/migrations/20260627_user_memory.sql:29-32`) → người dùng chỉ đọc hàng của mình; hàng ẩn danh (user_id NULL) chỉ service-role. Được đọc bởi `signalCollector` (`src/lib/preferences/signalCollector.ts:54`) và admin analytics. |
| **Retention** | **Vĩnh viễn.** Không có cron nào xoá `user_events` (`vercel.json` crons; `grep` `.from('user_events')…delete` = 0). Comment `20260713_user_acquisition_dimension.sql:7` nhắc "90-day retention" của raw user_events **nhưng không có gì thực thi**. Xoá tài khoản: CASCADE theo `user_id` (`20260911b_user_memory_auth_fk.sql:459`); hàng ẩn danh không bao giờ bị xoá. |
| **Màn hình đồng ý** | Không có màn hình riêng. Chỉ có privacy policy: "…các trang bạn xem, **nội dung bạn tìm kiếm**…" (`src/lib/i18n/legal.ts:219-220`; EN `:34`). |
| **Flag / env** | **Không có.** |

Ghi chú liên quan (không lưu query mới, nhưng cần biết):
- `chat_search` có **consumer** đọc `metadata.query` (`src/app/api/cron/behavior-rollup/route.ts:26`,
  `signalCollector.ts:118-123`) nhưng **không còn emitter** nào trên web/Android trong RC → không có
  dữ liệu mới. Nếu ai đó thêm lại emitter, query sẽ chảy vào đây mà không cần review.
- G1 `query` event (`src/lib/analytics/g1Events.ts:65-71`) chỉ mang `domain/result_id/is_follow_up/
  surface` — **không** mang văn bản. `page_view` chỉ gửi `pathname` (`src/hooks/useTrack.ts:21`); GA4
  `page_location` bỏ query string (`ga4.ts:12-13,58`). Share Target / `SearchAction` đưa câu hỏi qua
  URL `/chat?q=` (`src/lib/discovery/siteJsonLd.ts:75`) — không vào DB nhưng có thể nằm trong access
  log của Vercel (UNVERIFIED về thời gian giữ log).
- `anon_identity_map` (G1, `20260913…sql:102-116`; ghi ở `src/lib/analytics/g1Ingestion.ts:59`):
  không phải query text nhưng là **liên kết định danh** anon_id → user_id; service-role only, CASCADE
  khi xoá user, không TTL.

### 2.3 Ngoài phạm vi G1 nhưng là "query text đã lưu" (để owner biết đầy đủ)
- **Lịch sử chat** `conversations.messages` (`src/app/api/conversations/route.ts:24,38`) — toàn bộ
  câu hỏi + trả lời của người dùng đăng nhập; RLS theo owner; giữ tới khi người dùng xoá/xoá tài
  khoản. Đã được privacy policy nêu ("Lịch sử trò chuyện", `legal.ts:209,227`). Không phải thay đổi
  của G1.
- `decision_evidence` — có TTL sweep (migration D3, owner đã duyệt 2026-09-25).

---

## 3. Đối chiếu Google Play User Data policy

| Yêu cầu Play | Danh bạ | Query text (`shared_results.query`, `review_search`) |
|---|---|---|
| **Prominent disclosure + affirmative consent** (bắt buộc với dữ liệu nhạy cảm như Contacts; và với dữ liệu người dùng dùng theo cách người dùng không ngờ tới) | N/A — không có quyền/không thu. ✅ | `shared_results`: có hộp xem trước + nút xác nhận chủ động ✅; copy **không nói** trang được **lập chỉ mục công khai trên Google/Bing (IndexNow, sitemap)**, **không nói** nó tồn tại vĩnh viễn và **không nói** cách gỡ ⚠️. `review_search` (web): không có disclosure riêng — chấp nhận được với dữ liệu "App activity" thông thường nếu privacy policy + Data safety đủ; Android không gửi query nên không liên quan tới Play. |
| **Data safety form** | Không khai "Contacts". ✅ (đúng vì app không thu) | Phải khai **App activity → "Other user-generated content"** (câu hỏi/nội dung chia sẻ công khai) và **"In-app search history"** nếu tính cả phía web/Android backend; mục đích (App functionality / Analytics), "không chia sẻ", có đường xoá. **UNVERIFIED** — repo không chứa bản khai Data safety hiện tại; owner phải đối chiếu trong Play Console. |
| **Privacy policy** | Không nhắc danh bạ ✅ (đúng). | Có "nội dung bạn tìm kiếm" (`legal.ts:219`) ✅. **Thiếu**: tính năng chia sẻ công khai `/r/…` (câu hỏi đã rút gọn + câu trả lời trở thành trang công khai, có thể được máy tìm kiếm lập chỉ mục); thời hạn lưu trữ; cách gỡ trang đã chia sẻ; việc trang chia sẻ còn tồn tại sau xoá tài khoản (cho tới khi D4 được áp). `legal.ts:258` ("Chỉ người dùng đã đăng nhập mới có thể truy cập … lịch sử trò chuyện của chính mình") không sai nhưng dễ gây hiểu nhầm khi một phần đã được công khai. |
| **Xoá dữ liệu / account deletion** | N/A | `shared_results` sống sót khi xoá tài khoản (SET NULL) cho tới khi áp **D4**. Không có UI thu hồi share. `user_events` ẩn danh không bao giờ bị xoá. |

---

## 4. Khoảng trống (gaps) — cần owner quyết

1. **G-1 (P1) Không có kill switch** cho chia sẻ công khai và cho `review_search.query`. Muốn tắt
   trên prod phải sửa code và deploy (web) — và với Android build `versionCode 10`, nút share công
   khai trong app chỉ tắt được bằng cách làm server trả lỗi (xem §5).
2. **G-2 (P1) Retention vô hạn** cho `shared_results` (kể cả hàng `removed`) và `user_events`
   (kể cả `metadata.query`). Không TTL/cron. Comment "90-day retention" không được thực thi.
3. **G-3 (P1) Trang chia sẻ sống sót sau xoá tài khoản** cho tới khi migration **D4**
   (`20260925c_account_deletion_f096`) được owner duyệt và áp.
4. **G-4 (P2) Không có UI thu hồi** trang `/r/…` (API `DELETE` có, không có nút trên web/Android);
   thu hồi chỉ soft-delete, `query` vẫn còn trong DB.
5. **G-5 (P2) Sanitizer là regex** — `generalizeQuery` không bảo đảm loại hết PII (tên người, tình
   trạng sức khoẻ, địa chỉ không ở ngôi thứ nhất…). Người dùng *thấy* bản rút gọn trước khi xác nhận
   (giảm rủi ro), nhưng không sửa được câu hỏi — chỉ sửa được tiêu đề.
6. **G-6 (P2) Disclosure của hộp chia sẻ thiếu**: không nói trang có thể được **Google/Bing lập chỉ
   mục** (sitemap + IndexNow), không nói lưu vĩnh viễn, không nói cách gỡ.
7. **G-7 (P2) Privacy policy thiếu** mục "chia sẻ công khai", thời hạn lưu, cách gỡ.
8. **G-8 (P2) `review_search` web lưu nguyên văn query** vào `user_events` trong khi GA4 và Android
   cố ý không gửi — bất nhất với chính sách "analytics không lưu query text" mà §7 mô tả. Chỉ lọc
   email/SĐT.
9. **G-9 (P3) Data safety** — cần owner xác nhận bản khai trong Play Console có "App activity /
   user-generated content" + "search history"; repo không có bản khai để đối chiếu.
10. **G-10 (P3) Consumer `chat_search.query` còn sống** (behavior-rollup, signalCollector) — bẫy tương
    lai: thêm emitter là query text lại chảy vào DB mà không qua review.
11. **Lệch schema audit ↔ RC** (`contact_*`, `query_texts` chỉ có trên audit) — đã ghi nhận §7; đừng
    lấy audit làm bằng chứng cho prod và đừng áp các bảng đó lên prod.

---

## 5. Cách tắt trên prod (kill switch)

| Tính năng | Kết luận |
|---|---|
| Contact sync | **Không có flag — và không cần**: RC không có code, không có migration, release manifest không có `READ_CONTACTS`. Giữ nguyên: **không** áp bất kỳ migration `contact_*` nào lên prod. |
| `query_texts` | **Không có flag — không cần**: RC không có code/migration. **Không** áp bảng này lên prod. |
| Chia sẻ công khai (`shared_results.query`) | **KHÔNG có flag/env nào** (`src/lib/config/product.ts`, `/api/config`, Android `ProductFlags.kt`/`BuildConfig` đều không có). Chỉ sửa code mới tắt được. **Cách duy nhất không sửa code:** **không áp** migration §1-G1 `20260913_g1_growth_foundation` (+ G2) lên prod → mọi `POST /api/shared-results` trả 500 "Could not find the table" và không có gì được lưu (DEPLOY-CHECKLIST §1 hàng G1 đã đo trên audit). Tác dụng phụ: nút "Liên kết công khai" (web + Android) hiện lỗi thay vì ẩn; `/r/…`, sitemap dùng fallback. Đây là tắt bằng *thiếu schema*, không phải flag. |
| `review_search` query trong `user_events` | **KHÔNG có flag/env nào.** Chỉ sửa code (xoá `{ query: q }` ở `src/app/reviews/page.tsx:755`, hoặc thêm `query` vào `ANALYTICS_FORBIDDEN_KEYS`). |

Đề xuất (chưa làm — cần owner đồng ý vì là thay đổi code): thêm một flag server `SHOW_PUBLIC_SHARE`
(product.ts + `/api/config` `flags.showPublicShare` + guard 404/403 trong 3 route
`/api/shared-results*`, `/api/scam-shield/share`) để tắt cả web và bản Android đã phát hành mà không
cần build app mới; và thêm `query` vào `ANALYTICS_FORBIDDEN_KEYS`.

---

## 6. Owner cần làm / quyết

- [ ] Duyệt hoặc từ chối việc lưu `shared_results.query` công khai, vĩnh viễn (G-2, G-6).
- [ ] Quyết retention cho `shared_results` (kể cả hàng `removed`) và `user_events`.
- [ ] Duyệt & áp **D4** trước khi public share lên prod (G-3).
- [ ] Quyết có cần kill switch trước launch không (G-1) — nếu có, cho phép sửa code theo §5.
- [ ] Cập nhật privacy policy (G-7) và hộp chia sẻ (G-6).
- [ ] Đối chiếu Data safety trong Play Console (G-9).
- [ ] Xác nhận quyền trên chính AAB upload (không có `READ_CONTACTS`).

**Trạng thái: CHƯA DUYỆT — chờ owner.**
