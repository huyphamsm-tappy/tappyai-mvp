# F-096 — Nội dung còn lại sau khi xoá tài khoản: phương án cho từng loại (2026-09-25)

**Chưa triển khai gì — chờ anh chọn.** Lời hứa hiện tại (`/delete-account`, `src/lib/i18n/legal.ts:141-152`):
xoá vĩnh viễn hồ sơ, lịch sử trò chuyện, bộ nhớ AI, nội dung đã lưu, tuỳ chọn, và *"các dữ liệu khác do bạn tạo và gắn với tài khoản"*;
chỉ giữ lại *"khi pháp luật hoặc nghĩa vụ kinh doanh chính đáng yêu cầu (vd. hồ sơ thanh toán, tuân thủ pháp lý)"*.

Đường xoá duy nhất: vận hành viên xoá user trong Auth → các khoá ngoại tự xử lý. Sau F-093, **mọi bảng dữ liệu riêng
của người dùng đã được xoá theo** (đo trên audit, 4 tài khoản thật trong transaction rollback + 1 user tổng hợp).
Những gì còn lại dưới đây là **cố ý giữ (SET NULL / không có FK) hoặc nằm ngoài database**.

Ba lựa chọn cho mỗi loại: **Xoá** · **Ẩn danh hoá** (giữ nội dung, bỏ mọi thứ nhận ra người đó) · **Đổi lời hứa** (nói thật là giữ lại).

---

## 1. ⭐ Trang kết quả chia sẻ công khai — `shared_results` (anh quan tâm nhất)

**Hôm nay:** `owner_id ON DELETE SET NULL` (`20260913_g1_growth_foundation.sql:44-46`, ghi chú: *"a deleted account withdraws nothing it chose to make public"*).
Sau khi xoá tài khoản, `/r/<slug>` **vẫn sống**: câu hỏi (đã làm sạch), toàn bộ kết quả, ảnh OG, bộ đếm lượt xem/hỏi.
Các bản chia sẻ lại của người khác trỏ tới nó qua `parent_id … ON DELETE SET NULL`.
Đã có sẵn cơ chế gỡ: `status='removed'` → trang trả not-found (`sharedResultStore.ts:130`, `src/app/r/[slug]/page.tsx:40`).

| lựa chọn | kết quả | cái giá |
|---|---|---|
| **Xoá** (đổi FK sang CASCADE) | hàng biến mất; link trả trang not-found hiện có; bản chia sẻ lại của người khác vẫn giữ nội dung của CHÍNH họ (payload đóng băng), chỉ mất liên kết cha | mất số liệu lan truyền (view/ask) của trang đó |
| Ẩn danh hoá (như hiện tại) | trang vẫn sống, không còn gắn chủ | trái lời hứa "nội dung khác do bạn tạo"; người dùng không có cách nào gỡ sau khi đã xoá tài khoản |
| Gỡ nhưng giữ số liệu (trigger: chủ bị xoá → `status='removed'` + xoá `payload`/`query`) | link chết như Xoá; giữ hàng rỗng để đếm funnel | thêm trigger; hàng rỗng vẫn là một bản ghi |
| Đổi lời hứa | giữ nguyên | nói thẳng "trang bạn đã chia sẻ công khai vẫn còn" — khó biện minh với người dùng đã xoá tài khoản |

**Đề xuất: Xoá (CASCADE).** Đơn giản nhất, khớp lời hứa, link đã có trang not-found. Ghi rõ trong lời hứa: bản xem trước
mà Facebook/Zalo đã lưu cache nằm ngoài tầm của chúng ta.

## 2. Tin nhắn chat giữa người dùng — `chat_messages.body`, `chat_threads.created_by`

**Hôm nay:** `sender_id ON DELETE SET NULL` (`20260905_chat_messaging_phase1.sql:86-88`: *"a deleted account must not silently rewrite the other participant's history into gaps"*).
Nội dung tin nhắn còn nguyên trong hộp thư của người kia, hiện là "không rõ người gửi". (Audit: 0 tin nhắn.)

| lựa chọn | kết quả |
|---|---|
| Xoá | cuộc trò chuyện của người KIA bị khoét lỗ — xoá dữ liệu của người khác |
| Ẩn danh hoá + thay nội dung (`body` → "Tin nhắn đã bị xoá") | giữ cấu trúc cuộc trò chuyện, không còn nội dung |
| **Ẩn danh hoá (như hiện tại) + đổi lời hứa** | tin nhắn đã gửi cho người khác vẫn ở chỗ họ, hiện là "tài khoản đã xoá" — giống Messenger/Zalo |

**Đề xuất: giữ ẩn danh hoá, đổi lời hứa** (thêm một câu: tin nhắn bạn đã gửi cho người khác vẫn nằm trong cuộc trò chuyện của họ, không gắn tên bạn).
"Lịch sử trò chuyện" trong lời hứa hiện nay là chat với AI (`conversations` — đã xoá theo CASCADE).

## 3. Thông báo đã gửi cho người khác — `notifications` (`actor_id SET NULL`)

**Hôm nay:** tên và trích dẫn **nằm ngay trong chữ**, không chỉ trong `actor_id`:
`title: commenterName + ' binh luan review cua ban'`, `body: '"' + body.slice(0, 60) …` (`src/app/api/reviews/[id]/comments/route.ts:160-166`).
Bình luận gốc bị xoá theo tài khoản, nhưng 60 ký tự của nó và tên người viết vẫn nằm trong thông báo của người nhận.

**Đề xuất: Xoá** (`actor_id ON DELETE CASCADE`). Thông báo là thứ tạm thời, giá trị thấp, và chứa tên + trích dẫn; ẩn danh hoá
đòi viết lại chữ theo từng loại thông báo.

## 4. File đã tải lên — ảnh đại diện, ảnh bìa, ảnh/video review, ảnh nhóm (GCS)

**Hôm nay:** file nằm trong bucket GCS **công khai**, khoá có user id (`src/lib/media/uploadRoute.ts:48`), cache `public, max-age=31536000, immutable`
(`src/lib/media/providers/gcs.ts:59`). Không có đường nào xoá file khi xoá tài khoản (hàng DB trỏ tới file đã mất, file thì còn,
ai có URL vẫn tải được). Storage của Supabase trên audit: không có bucket.

**Đề xuất: Xoá** — một job xoá theo tiền tố khoá của user khi tài khoản bị xoá. Cần thêm: cách kích hoạt (xoá tài khoản là thủ công,
nên đơn giản nhất là một bước trong quy trình vận hành + script), và ghi nhận rằng bản đã nằm trong cache CDN/trình duyệt có thể sống đến hết hạn cache.

## 5. Nhạc do người dùng tải lên — `music_tracks.uploaded_by SET NULL` (+ file âm thanh)

Nhạc đang ẩn trên cả 3 nền tảng. **Đề xuất: Xoá (CASCADE + xoá file) — quyết trước khi mở lại nhạc**, không chặn launch.
`music_track_reports.reporter_id` và `music_usage.user_id` (SET NULL): báo cáo vi phạm và số lượt dùng — **ẩn danh hoá như hiện tại** là đúng; nêu trong lời hứa.

## 6. Quảng cáo — `ads.attribution_events.user_id SET NULL`, `ads.advertisers.owner_user_id SET NULL`

Schema `ads` có trên audit nhưng **không có code nào trên rc dùng** (Phase 6, xem CONTAINMENT-TRIAGE §E). Nếu bật: `user_id` bị null nhưng
`anon_id` và `session_id` vẫn còn và vẫn nối được về thiết bị. **Đề xuất: ẩn danh hoá đầy đủ** (null cả `anon_id`/`session_id` khi xoá)
— làm cùng lúc với việc đưa Phase 6 vào; nhà quảng cáo là hồ sơ doanh nghiệp, giữ.

## 7. Hồ sơ kiểm duyệt về người dùng — `moderation_actions.target_user_id`, `moderation_queue.reported_by/assigned_to/resolved_by` (SET NULL)

Quyết định kiểm duyệt về một người còn lại sau khi người đó xoá tài khoản, không gắn id; `reason`/`notes` là chữ tự do và có thể nhắc tên.
**Đề xuất: ẩn danh hoá (như hiện tại) + đổi lời hứa** — hồ sơ an toàn/tuân thủ là đúng loại "nghĩa vụ chính đáng" mà §4 đã nói;
thêm quy tắc cho kiểm duyệt viên: không ghi tên thật vào `notes`.

## 8. `audit_log` — email, IP, user-agent của người thực hiện

**Hôm nay:** không có FK; 28 hàng trên audit, **tất cả** thuộc tài khoản không còn trong `auth.users`: 27 `rbac.access_denied`
(email + IP + UA), 1 `user.date_of_birth.corrected` (có `before_state`/`after_state` — tức là **ngày sinh**).
Bảng là một **chuỗi băm**: `row_hash` băm cả `actor_email`, `ip_address`, `user_agent` (`20260807_audit_chain.sql:119-155`),
nên **sửa tại chỗ để ẩn danh sẽ làm gãy kiểm tra chuỗi** (`fn_verify_audit_chain`) cho chính hàng đó.

**Đề xuất (thời hạn + ẩn danh):**
- **Giữ chuỗi 12 tháng**, sau đó cắt phần đầu kèm một điểm neo (lưu `row_hash` của hàng cuối bị cắt) để kiểm tra chuỗi vẫn sạch.
- **Không lưu PII vào hàng chuỗi nữa** (cho hàng mới): chuyển `actor_email`/`ip_address`/`user_agent` sang một bảng phụ khoá theo id hàng;
  chuỗi băm một **digest có muối** của chúng. Khi xoá tài khoản — hoặc sau **90 ngày** với IP/UA — xoá hàng phụ, chuỗi vẫn đúng.
  `actor_email` không cần lưu: `actor_id` đủ khi tài khoản còn tồn tại.
- `before_state`/`after_state` chứa dữ liệu nhạy cảm (ngày sinh): chỉ lưu dạng đã che (vd. năm sinh / "đã đổi").
- Hàng cũ (trước thay đổi): giữ tới hết 12 tháng rồi cắt theo neo — không sửa tại chỗ.
Lý do không chọn "giữ mãi": log bảo mật không cần email/IP của người đã rời đi quá thời gian điều tra sự cố; lý do không chọn "xoá ngay khi xoá tài khoản": sẽ gãy chuỗi và mất dấu vết điều tra.

## 9. Tài khoản nhân viên không xoá được — có phải cố ý không?

**Có, cố ý, có ghi trong code:**
- `moderation_actions.actor_id` **không cascade** — *"a moderator's decision must OUTLIVE the report… the same rule `user_notes` follows"* (`20260821_m09_moderation_queue.sql:105-114`).
- `user_notes.author_id` NO ACTION (`20260821_m08_user_notes.sql:48,87`), `platform_settings.updated_by` NO ACTION.
- `platform_owner.user_id` **RESTRICT** — *"deleting the Owner's profile must fail loudly rather than silently leaving the platform ownerless"* (`20260803_platform_owner.sql:43-45`).

Nên hệ quả "nhân viên có hồ sơ kiểm duyệt thì không xoá được" là **cố ý** (trách nhiệm giải trình). Cái thiếu là **quy trình**:
**Đề xuất:** giữ ràng buộc; thêm runbook nghỉ việc/xoá tài khoản nhân viên — thu hồi quyền, và nếu người đó yêu cầu xoá dữ liệu cá nhân thì
chuyển các hàng sang một "tài khoản hệ thống kiểm duyệt" thay vì xoá lịch sử quyết định. Người dùng thường không bị ảnh hưởng.

## 10. Ngoài database (chưa kiểm hết — UNVERIFIED trừ khi ghi khác)

| nơi | tình trạng | đề xuất |
|---|---|---|
| GA4 | code **không gửi** `user_id`/email (`src/lib/analytics/ga4.ts:14`) — đã kiểm | không cần làm gì |
| Stripe | `billing_customers` bị xoá theo, **khách hàng + hoá đơn trên Stripe vẫn còn** | giữ — hồ sơ thanh toán, lời hứa §4 đã nêu |
| Google Calendar | hàng `user_integrations` xoá theo, nhưng **quyền OAuth ở phía Google không bị thu hồi** khi xoá tài khoản (chỉ khi người dùng tự ngắt) | Xoá: gọi thu hồi token trước khi xoá user |
| `auth.audit_log_entries` (log đăng nhập của Supabase: email, IP) | 0 hàng trên audit; prod chưa kiểm | thời hạn 90 ngày, dọn định kỳ |
| Cloud Logging | log có user id | thời hạn mặc định của GCP; ghi vào lời hứa |

## 11. Liên quan — xoá QUÁ tay (dữ liệu của người khác)

`groups.creator_id ON DELETE CASCADE`: người tạo nhóm xoá tài khoản → **cả nhóm và hàng của mọi thành viên khác** mất theo.
Bình luận/lượt thích của người khác trên review của người bị xoá cũng mất theo review. Không trái lời hứa, nhưng anh nên biết.
**Đề xuất:** nhóm — chuyển quyền tạo nhóm cho thành viên lâu nhất thay vì xoá cả nhóm (quyết sau launch).

---

## Tóm tắt đề xuất

| # | loại | đề xuất |
|---|---|---|
| 1 | trang chia sẻ công khai | **Xoá** (CASCADE) |
| 2 | tin nhắn đã gửi người khác | giữ ẩn danh hoá, **đổi lời hứa** |
| 3 | thông báo chứa tên + trích dẫn | **Xoá** (CASCADE trên `actor_id`) |
| 4 | file tải lên (GCS) | **Xoá** (job theo tiền tố user) |
| 5 | nhạc tải lên | Xoá — trước khi mở lại nhạc |
| 6 | quảng cáo (chưa dùng) | ẩn danh hoá đầy đủ khi bật Phase 6 |
| 7 | hồ sơ kiểm duyệt | giữ ẩn danh hoá, **đổi lời hứa** |
| 8 | audit_log | 12 tháng + neo; PII sang bảng phụ, IP/UA 90 ngày; che before/after nhạy cảm |
| 9 | nhân viên không xoá được | **cố ý**; thêm runbook, không đổi ràng buộc |
| 10 | Google Calendar token | thu hồi khi xoá tài khoản |

Nếu anh chọn "đổi lời hứa" cho 2 và 7, câu cần thêm vào §4 của `/delete-account` (vi + en) — tôi soạn khi anh duyệt.
