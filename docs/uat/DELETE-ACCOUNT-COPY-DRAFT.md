# /delete-account — bản nháp lời văn mới (CHỜ ANH DUYỆT, CHƯA ĐĂNG)

Nguồn hiện tại: `src/lib/i18n/legal.ts` (EN dòng 123–156, VI dòng 296–329), trang `src/app/delete-account/page.tsx`.
Mục tiêu: mỗi câu khớp đúng việc hệ thống làm sau F-093 / F-096 / F-097 (các migration D1–D5 trong DEPLOY-CHECKLIST).
**Chỉ đăng sau khi D1–D5 đã áp lên production** — đăng trước là hứa điều chưa làm.

Mục 1 (cách gửi yêu cầu) và mục 5 (hỗ trợ) **giữ nguyên**. Thay mục 2, 3, 4; thêm mục mới "Dữ liệu được giữ lại nhưng không còn gắn với bạn".
Khi triển khai, trang phải đổi số bullet (hiện `bullets('legal.delete.s3.b', 6)`) — tôi sẽ làm cùng lúc, không đổi style.

⚠️ Hai chỗ cần anh điền/xác nhận, đánh dấu **[XÁC NHẬN]**: thời hạn xử lý yêu cầu, và thời hạn giữ log máy chủ (chưa đo được — không đoán).

---

## 2. What Happens Next / Điều gì diễn ra sau đó

**EN**
> Our support team receives your request and verifies that it came from the owner of the account. Once verified, we delete your account **[XÁC NHẬN: within 30 days]**. Deleting the account removes your data from our database at once; the photos, videos and audio you uploaded are removed from our file storage within 48 hours after that.
>
> If you do not have an email app set up on your device, you can send the request yourself to the support address at the bottom of this page.

**VI**
> Bộ phận hỗ trợ tiếp nhận yêu cầu và xác minh rằng yêu cầu đến từ chủ tài khoản. Sau khi xác minh, chúng tôi xóa tài khoản của bạn **[XÁC NHẬN: trong vòng 30 ngày]**. Khi tài khoản bị xóa, dữ liệu của bạn được xóa khỏi cơ sở dữ liệu ngay; ảnh, video và âm thanh bạn đã tải lên được xóa khỏi kho lưu trữ tệp trong vòng 48 giờ sau đó.
>
> Nếu thiết bị của bạn chưa cài ứng dụng email, bạn có thể tự gửi yêu cầu tới địa chỉ hỗ trợ ở cuối trang này.

*Cơ sở:* cascade chạy trong cùng lệnh xoá; job xoá tệp chạy hằng ngày (01:45 giờ VN) và thử lại nếu lỗi → "48 giờ" là mức an toàn cho một lần chạy trượt.

## 3. What Deletion Removes / Những dữ liệu sẽ bị xóa

**EN** — *Deletion permanently removes:*
1. Your account and profile, including your name, profile photo, cover photo and bio.
2. Your chats with TappyAI and your AI memory.
3. Your saved places, favourites, preferences, price watches and plans.
4. The reviews, comments and likes you posted, including their photos and videos.
5. The result pages you shared publicly — their links stop working.
6. The photos, videos and audio you uploaded, removed from our file storage.
7. Groups you created, and your place in groups created by others.
8. Notifications you caused in other people's inboxes (for example "… commented on your review").
9. Your Google Calendar connection — we also revoke TappyAI's access at Google.

**VI** — *Việc xóa sẽ loại bỏ vĩnh viễn:*
1. Tài khoản và hồ sơ của bạn, gồm tên, ảnh đại diện, ảnh bìa và phần giới thiệu.
2. Các cuộc trò chuyện với TappyAI và bộ nhớ AI.
3. Địa điểm đã lưu, mục yêu thích, tùy chọn cá nhân, theo dõi giá và kế hoạch.
4. Các đánh giá, bình luận và lượt thích bạn đã đăng, kèm ảnh và video.
5. Các trang kết quả bạn đã chia sẻ công khai — đường link sẽ không còn mở được.
6. Ảnh, video và âm thanh bạn đã tải lên, được xóa khỏi kho lưu trữ tệp của chúng tôi.
7. Các nhóm bạn đã tạo, và tư cách thành viên của bạn trong nhóm do người khác tạo.
8. Các thông báo bạn tạo ra trong hộp thư của người khác (ví dụ "… đã bình luận đánh giá của bạn").
9. Kết nối Google Lịch — chúng tôi đồng thời thu hồi quyền truy cập của TappyAI tại Google.

*Cơ sở (kiểm chứng):* F-093 probe 4 tài khoản + user tổng hợp → 0 dòng còn lại; F-096 E2E audit (`evidence/f096-2026-09-26/e2e-db-rolled-back.json`): trang chia sẻ, thông báo, nhóm → 0, job xoá tệp + thu hồi token được xếp hàng. Mục 6 và 9: code + test xong; **chứng minh ở mức bucket chờ bucket không-production** (xem báo cáo).
*Lưu ý mục 7:* nhóm bạn tạo bị xoá cùng toàn bộ thành viên của nhóm (hành vi hiện tại, `groups.creator_id` CASCADE).

## 3b. (MỚI) Kept, but no longer linked to you / Được giữ lại nhưng không còn gắn với bạn

**EN**
> Some things you shared with other people belong to their record as well, so they stay without your name or account attached:
> - **Messages you sent to other people** stay in their conversation and are shown as coming from a deleted account.
> - **Reports and moderation decisions** about content or accounts are kept for safety and legal compliance, without a link to your account.

**VI**
> Một số nội dung bạn đã gửi cho người khác cũng thuộc về lịch sử của họ, nên được giữ lại nhưng không còn tên hay tài khoản của bạn:
> - **Tin nhắn bạn đã gửi cho người khác** vẫn nằm trong cuộc trò chuyện của họ và hiển thị là từ một tài khoản đã xóa.
> - **Báo cáo vi phạm và quyết định kiểm duyệt** liên quan đến nội dung hoặc tài khoản được giữ để bảo đảm an toàn và tuân thủ pháp luật, không còn liên kết với tài khoản của bạn.

## 4. Data We May Retain / Dữ liệu có thể được lưu lại

**EN**
> We keep a limited amount of information after deletion, only where the law or a legitimate obligation requires it:
> - **Payment records** held by our payment provider, for as long as tax and accounting law requires.
> - **Security logs of administrative actions**, kept for up to 12 months. The IP address and browser information in them are deleted after 90 days, and these logs do not store email addresses.
> - **Server logs** used to keep the service running, kept for **[XÁC NHẬN: số ngày]** and then deleted.
>
> Some copies are outside our control and may remain for a while:
> - A photo or video that someone already viewed can stay on their own device — in their browser or app — for up to one day.
> - Videos uploaded before **[NGÀY TRIỂN KHAI]** may remain reachable through their old link for up to one year, because copies of them were stored in Google's network before we changed how videos are stored, and we cannot recall those copies.
> - A link preview that a social network or messaging app saved when someone shared your page can remain until that service refreshes it.

**VI**
> Chúng tôi chỉ giữ lại một lượng thông tin hạn chế sau khi xóa, khi pháp luật hoặc nghĩa vụ hợp pháp yêu cầu:
> - **Hồ sơ thanh toán** do đơn vị xử lý thanh toán lưu giữ, trong thời hạn luật thuế và kế toán yêu cầu.
> - **Nhật ký bảo mật về các thao tác quản trị**, lưu tối đa 12 tháng. Địa chỉ IP và thông tin trình duyệt trong nhật ký được xóa sau 90 ngày, và nhật ký không lưu địa chỉ email.
> - **Nhật ký máy chủ** dùng để vận hành dịch vụ, lưu trong **[XÁC NHẬN: số ngày]** rồi xóa.
>
> Một số bản sao nằm ngoài tầm kiểm soát của chúng tôi và có thể còn trong một thời gian:
> - Ảnh hoặc video mà người khác đã xem có thể còn trên chính thiết bị của họ — trong trình duyệt hoặc ứng dụng — tối đa một ngày.
> - Video tải lên trước **[NGÀY TRIỂN KHAI]** có thể vẫn mở được qua đường link cũ tối đa một năm, vì bản sao của chúng đã được lưu trong mạng của Google trước khi chúng tôi thay đổi cách lưu video, và chúng tôi không thể thu hồi các bản sao đó.
> - Bản xem trước đường link mà mạng xã hội hoặc ứng dụng nhắn tin đã lưu khi ai đó chia sẻ trang của bạn có thể còn cho tới khi dịch vụ đó làm mới.

---

### Đối chiếu: mỗi câu ↔ cơ chế

| câu | cơ chế | trạng thái |
|---|---|---|
| hồ sơ, chat AI, bộ nhớ AI, mục lưu, tùy chọn, theo dõi giá, kế hoạch | FK CASCADE (F-093 D1/D2 + sẵn có) | kiểm chứng trên audit |
| đánh giá, bình luận, lượt thích + ảnh/video | CASCADE qua `profiles`/`auth.users`; file → job xoá tệp | DB kiểm chứng; file chờ bucket |
| trang chia sẻ công khai | `shared_results.owner_id` CASCADE (D4) | kiểm chứng trên audit |
| tệp tải lên | job `account-deletion-jobs` theo tiền tố user | code + test; chờ bucket |
| nhóm đã tạo / tư cách thành viên | CASCADE sẵn có | kiểm chứng |
| thông báo trong hộp thư người khác | `notifications.actor_id` CASCADE (D4) | kiểm chứng trên audit |
| Google Lịch | token được bắt khi xoá, thu hồi bởi job | code + test (Google stub) |
| tin nhắn cho người khác | `chat_messages.sender_id` SET NULL | có sẵn |
| kiểm duyệt | `moderation_*` SET NULL / giữ | có sẵn |
| nhật ký bảo mật 12 tháng / IP+trình duyệt 90 ngày / không email | D5 + cron `audit-retention` | kiểm chứng trên audit |
| nhật ký máy chủ | Vercel/GCP — chưa đo | **[XÁC NHẬN]** |

---

### Cập nhật 2026-09-26 — cache sau khi xoá (ĐO 35 phút, `evidence/cache-after-delete-2026-09-26/`)
- **Một URL đã bị xoá vẫn có thể mở được qua cache biên dùng chung của Google cho tới hết `max-age` của file.** Đo: file max-age=300 còn được phục vụ tới +257 s sau khi xoá rồi dừng; file max-age=86400 vẫn được phục vụ ở 46/68 lần gọi tới hết 35 phút đo. Không có cách buộc dừng: cache tích hợp của GCS **không hỗ trợ vô hiệu hoá** (tài liệu GCS). Suy ra (không đo): clip upload từ nay (max-age 1 ngày) có thể còn mở được tới **1 ngày** sau khi xoá; clip upload trước `6c19924` (max-age 1 năm) tới **1 năm** nếu đã được xem gần đây.
- Hệ quả cho lời văn: **không được hứa gỡ ngay.** Mục 4 phải nói rõ: "bản sao có thể vẫn mở được qua đường link cũ tối đa 24 giờ". Với clip cũ: **[XÁC NHẬN]** — hoặc đổi Cache-Control clip cũ trước khi đăng lời văn (bản đã nằm trong cache biên vẫn sống tới hết hạn cũ), hoặc ghi "tối đa một năm với video tải lên trước <ngày>".
- Nếu muốn xoá có hiệu lực ngay tại phía Google: dùng `private, max-age=86400` (cache biên không được lưu, chỉ thiết bị người xem) hoặc Cloud CDN (có vô hiệu hoá) — xem `CACHE-AFTER-DELETE-2026-09-26.md`.

### Cập nhật 2026-09-26 (sau quyết định của anh) — video cache `private` (`2a1ce82`)
- Video tải lên từ nay mang `Cache-Control: private, max-age=86400, immutable` → cache biên dùng chung của Google **không được lưu**; xoá có hiệu lực tại Google ngay. Cửa sổ còn lại = **bản đã tải về thiết bị người xem** (trình duyệt/ứng dụng), tối đa 1 ngày. Lời văn mục 4 đã đổi đúng như vậy.
- **Video tải lên trước thay đổi này** (max-age 1 năm, public) — bản đã nằm trong cache biên sống tới hết hạn cũ, **tối đa 1 năm, không thu hồi được**. Job `scripts/ops/clean-existing-clips.mts --fix-cache-control` chỉ đổi header của object; **không** xoá được bản đã nằm trong cache. Vì vậy câu "video tải lên trước [NGÀY]" phải giữ.
- ~~[XÁC NHẬN — ảnh]~~ → anh chọn (b) 2026-09-26: ảnh/ảnh đại diện/ảnh bìa đi đường server giờ cũng mang `private, max-age=86400, immutable` (upload multipart); câu "ảnh tối đa một giờ" đã bỏ. ⚠️ Còn sót: ảnh tải lên TRƯỚC thay đổi này vẫn mang header mặc định `public, max-age=3600` trên từng object — header không tự đổi, nên mỗi lần một tài khoản cũ bị xoá sau này, ảnh cũ của họ vẫn có thể mở được qua link cũ tối đa 1 giờ. Chọn một: (i) đổi header ảnh cũ (chỉ PATCH metadata, không đụng nội dung — có thể gộp vào job dọn ảnh cũ sau launch), hoặc (ii) thêm "ảnh tải lên trước [NGÀY] — tối đa một giờ" vào câu video cũ. Cho tới khi làm (i), lời văn hiện tại thiếu đúng một giờ đó cho ảnh cũ.
- Điền **[NGÀY TRIỂN KHAI]** = ngày `2a1ce82` lên production.
