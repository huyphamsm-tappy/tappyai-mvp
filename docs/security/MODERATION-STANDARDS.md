# Tiêu chuẩn kiểm duyệt báo cáo (01/10/2026)

Nhánh `sec/user-blocks-slice` (worktree `D:\TappyAI-wt\wtblock`). CHƯA push, CHƯA áp lên production, CHƯA merge. Dành cho phiên bảo mật duyệt độc lập và cho Huy duyệt chữ + ngưỡng.

Nguyên tắc Huy đặt ra: **báo cáo không phải bản án.** Nhiều báo cáo không tự động gỡ, ẩn, phạt hay khoá ai. Báo cáo chỉ vào hàng chờ; một người xem xét theo Quy tắc cộng đồng bằng chữ, rồi mới quyết.

## 1. Cái gì dùng lại, cái gì mới
| Đã có trên rc (dùng lại, KHÔNG viết lại) | Mới |
|---|---|
| `moderation_queue` + `moderation_actions` (migration m09), `account_status` (đình chỉ/khoá mà các route đang đọc), `audit_log` băm chuỗi, RBAC admin, trang `/admin/moderation`, hàm `suspendUser` / `banUser` / `revokeAllSessions` / `guardMutationTarget`, `emitNotification` | bảng `moderation_decisions` (sổ strike bất biến), `moderation_appeals` (kháng nghị), trigger đưa `user_reports` vào hàng chờ, `communityRules.ts` (bảng quy tắc + thang hình phạt), trang `/community-guidelines`, trang `Thông báo vi phạm`, màn hình duyệt (desk), 5 route |
Phase 8 (23f157d) **không** được mang vào: bảng `reports` và `account_sanctions` của họ trùng khái niệm với hàng chờ và `account_status`. Ý tưởng được giữ: báo cáo vào hàng chờ bằng trigger; sổ chỉ-thêm; xử phạt chiếu xuống `account_status`.

## 2. Sơ đồ ngắn
```
người dùng báo cáo → user_reports (bình luận/người dùng) hoặc content_reports (bài/clip)
                  → hàng chờ moderation_queue (priority theo lý do; KHÔNG làm gì khác)
người duyệt mở /admin/moderation (cờ MODERATION_ADMIN_ENABLED) → đọc nội dung + ngữ cảnh + strike còn hiệu lực
   → chọn: Không vi phạm | Ẩn tạm (chỉ bài, chờ) | Cảnh cáo | Gỡ + 1 strike | Hạn chế N ngày | Khoá
   → ghi sổ (moderation_decisions) → áp tác động bằng hàm có sẵn → thông báo cho người bị xử lý → cập nhật trạng thái báo cáo
người bị xử lý → "Thông báo vi phạm" → kháng nghị một lần (30 ngày) → người duyệt: giữ nguyên | đảo ngược
```

## 3. Từng yêu cầu của Huy
| # | Yêu cầu | Thực hiện | Còn thiếu |
|---|---|---|---|
| 1 | Báo cáo ≠ gỡ; nhóm nghiêm trọng ưu tiên; ẩn tạm chỉ khi người duyệt bấm; người báo chỉ ẩn cho chính mình | Trigger chỉ INSERT vào hàng chờ (test: 100 báo cáo → 100 dòng chờ, bình luận/bài/tài khoản không đổi). Priority 3 cho child_safety, self_harm, violence, sexual; mục tiêu 24 giờ; quá hạn hiện nhãn «Quá hạn». «Ẩn tạm» là nút của người duyệt (chỉ bài). `GET /api/reports/mine` trả mã đối tượng đã báo để app tự ẩn cho riêng người báo | **App chưa ẩn cục bộ** (cần sửa app, không bắt build lại bây giờ). **Chưa có cảnh báo chủ động** (email/push) khi quá hạn — chỉ hiện trên màn hình duyệt |
| 2 | Quy tắc cộng đồng (trang vi/en) | `/community-guidelines`: 10 nhóm (là gì, 3 ví dụ, mức nghiêm trọng, hình phạt tối đa, hạn xem xét), ngoại lệ lợi ích công cộng, báo cáo xử lý thế nào, thang hình phạt, kháng nghị. Viết bằng lời của mình, không chép TikTok. Dòng đầu ghi «bản đề xuất, chờ chủ sản phẩm duyệt chữ» | **Huy duyệt chữ.** **Nhờ người am hiểu luật Việt Nam xem lại, kể cả việc gỡ nội dung theo yêu cầu của cơ quan chức năng** (trang chưa nói gì về việc này). Hộp «Quy tắc cộng đồng» của Android hiện trỏ Điều khoản: đề nghị trỏ `/community-guidelines` ở bản sau |
| 3 | Hình phạt bậc thang, strike theo nhóm + tính năng, hết hạn, sổ bất biến | Mục 5 bên dưới. Sổ: người duyệt, thời điểm, nhóm, tính năng, mức, hình phạt, mã nội dung, lý do, hạn strike; không UPDATE/DELETE/TRUNCATE (kể cả service role); kết quả kháng nghị nằm ở bảng kháng nghị | Ngưỡng là **đề xuất, Huy duyệt** |
| 4 | Thông báo cho người bị xử lý; API trạng thái cho người báo; người bị báo không biết ai báo | Thông báo hệ thống (vi + en): nội dung nào, nhóm nào, hình phạt, hạn, cách kháng nghị — không kèm nội dung chữ hay người báo. `GET /api/reports/mine` → 4 trạng thái: `received`, `in_review`, `actioned`, `no_violation`. Hàng chờ/sổ/kháng nghị không có quyền đọc nào cho client | App chưa dùng API này (hợp đồng đã ghi trong ANDROID-REQUESTS / IOS-REQUESTS) |
| 5 | Kháng nghị một lần | `moderation_appeals` UNIQUE(decision_id); 30 ngày; app: `/profile/notices`; email: người duyệt ghi nhận hộ (`POST /api/admin/moderation/appeals`). Giải quyết một lần; người duyệt khác người quyết nếu có hai người (ghi `same_reviewer`; `MODERATION_APPEAL_DIFFERENT_REVIEWER=true` để bắt buộc). Đảo ngược: bài hiện lại, bình luận phục hồi từ ảnh chụp, gỡ hạn chế/khoá nếu không còn quyết định nào khác, strike không còn được tính | Hiện chỉ có Huy ⇒ `same_reviewer = true` sẽ được ghi. Ảnh chụp bình luận bị gỡ giữ tối đa 60 ngày rồi xoá (`moderation_purge_snapshots`) — **chưa gắn cron**, cần chạy tay hoặc gắn lịch |
| 6 | Chống lạm dụng báo cáo | Một người một lần/đối tượng (UNIQUE), 10 lần/10 phút. Người báo có ≥ 5 báo cáo và ≥ 80% bị bác → xếp CUỐI hàng (priority 0), vẫn được xem; mức nghiêm trọng không bị hạ. Màn hình duyệt hiện «người báo: N báo cáo, M bị bác» | Cảnh cáo người báo sai là việc người duyệt làm tay (chọn «Cảnh cáo», nhóm Spam) — chưa có nút riêng |
| 7 | Xoá tài khoản | Sổ và báo cáo ở lại **ẩn danh**: `subject_user_id`, `reviewer_id`, `queue_id`, người kháng nghị đặt NULL khi tài khoản bị xoá. **P8-4 không lặp lại**: cơ chế chặn sửa của sổ cho phép CHÍNH XÁC phép đặt NULL đó (test DB trên Postgres nhúng và trên DB audit thật: xoá người bị phạt + người duyệt đều thành công) | Người **đang bị khoá** không đăng nhập được nên không tự xoá được trong app; yêu cầu xoá qua email sẽ do người vận hành xử lý. **Cách xử lý giữ định danh tối thiểu (ví dụ băm email) trong thời hạn khoá để chống lách: CHƯA làm — cần quyết định pháp lý/quyền riêng tư** |

## 4. Quyền và ai là người duyệt
- Màn hình: `https://www.tappyai.com/admin/moderation` (production, sau khi bật cờ) hoặc `https://uat.tappyai.com/admin/moderation`. Vào bằng tài khoản có vai trò admin của Controller; trang và mọi route kiểm quyền ở máy chủ (test tĩnh + test từ chối 401/403 cho cả bốn route).
- Quyền theo hành động (dùng lại quyền có sẵn): không vi phạm = `moderation.report.dismiss`; ẩn tạm / cảnh cáo / gỡ bài = `moderation.content.hide`; gỡ bình luận và giải quyết kháng nghị = `moderation.content.delete`; hạn chế = `users.account.suspend`; khoá = `users.account.ban`. Vai trò moderator không có `delete`, nên moderator chưa gỡ được bình luận hay giải quyết kháng nghị.
- **Ai là người duyệt do Huy chỉ định.** Hiện chỉ Huy (owner) có đủ quyền. Thêm người: Controller → Quản trị → Vai trò (RBAC).

## 5. Thang hình phạt — ĐỀ XUẤT, HUY DUYỆT (một chỗ sửa: `src/lib/safety/communityRules.ts`)
| Nhóm | Mức mặc định → tối đa | Hình phạt tối đa | Mục tiêu xử lý |
|---|---|---|---|
| Spam | 1 → 2 | hạn chế | 72 giờ |
| Quấy rối và bắt nạt | 2 → 3 | khoá | 48 giờ |
| Thù ghét | 2 → 3 | khoá | 48 giờ |
| Nhạy cảm / tình dục | 2 → 3 | khoá | **24 giờ** (ưu tiên) |
| Bạo lực và tự hại | 2 → 3 | khoá | **24 giờ** (ưu tiên) |
| Lừa đảo và thông tin sai gây hại | 2 → 3 | khoá | 48 giờ |
| Mạo danh | 2 → 2 | hạn chế | 48 giờ |
| Bản quyền và quyền riêng tư | 1 → 3 | khoá | 48 giờ |
| Hàng / dịch vụ trái pháp luật | 2 → 3 | khoá | 48 giờ |
| An toàn trẻ em | 3 → 3 | khoá | **24 giờ** (ưu tiên) |

Bậc: cảnh cáo (không strike) → gỡ nội dung + 1 strike → hạn chế N ngày (mặc định 7, tối đa 30; không đăng/bình luận, vẫn xem được) → khoá vĩnh viễn.
- Strike hết hạn: **mức 1 sau 90 ngày, mức 2 sau 180 ngày, mức 3 không hết** (đề xuất).
- Gợi ý (không tự áp): **3 strike còn hiệu lực cùng nhóm + cùng tính năng → xem xét hạn chế; 5 strike còn hiệu lực tổng → xem xét khoá**; mức 3 có thể khoá thẳng (đề xuất).
- Luật cứng trong máy chủ: không vượt hình phạt tối đa của nhóm; **khoá chỉ khi mức 3 hoặc đủ 5 strike còn hiệu lực** (không phải vì số báo cáo); hạn chế 1–30 ngày; mọi quyết định phải có lý do ≥ 10 ký tự.
- Kháng nghị: 30 ngày, một lần mỗi quyết định.

## 6. Cờ và thứ tự áp
Cờ `MODERATION_ADMIN_ENABLED` (mặc định TẮT ⇒ các route mới 404, trang `/profile/notices` 404, trang `/admin/moderation` vẫn là hàng chờ cũ). Cờ `REPORTS_ENABLED` (báo cáo bình luận/người dùng + `GET /api/reports/mine`). Thứ tự migration trên production: `20261001_user_blocks` → `20261001b_user_reports` → `20261001c_commerce_providers_cinemas` (đã có ở rc) → `20261001d_moderation_standards`. Chi tiết, kiểm sau áp và rollback: PHẦN B (`docs/uat/ENV-RELEASE-CHECKLIST.md` §1d).

## 7. Kiểm thử đã chạy
- DB (Postgres nhúng + schema production): 12 test — 100 báo cáo không đổi gì; ưu tiên theo lý do và người báo kém tin cậy; không client nào đọc hàng chờ/sổ/kháng nghị; sổ không UPDATE/DELETE/TRUNCATE; một quyết định cuối cho mỗi mục hàng chờ; ảnh chụp chỉ khi gỡ và xoá được; **xoá tài khoản bị phạt/người duyệt/người kháng nghị thành công**; kháng nghị một lần; rollback.
- DB audit thật (UAT, tài khoản tạm đã xoá): 12 báo cáo → 12 dòng chờ, bình luận còn nguyên, child_safety priority 3, client bị 42501 trên 3 bảng, sổ chặn sửa/xoá, kháng nghị thứ hai bị từ chối, xoá người bị phạt + người duyệt thành công và sổ ở lại ẩn danh.
- Route/đơn vị: quyền theo hành động, cờ tắt = 404, người không phải admin bị 401/403 ở cả bốn route, trang được bảo vệ, bốn kết quả của kháng nghị, gỡ hạn chế chỉ khi không còn quyết định khác, ghi nhận người duyệt trùng, thông báo không lộ nội dung/người báo, audit không chứa nội dung/người báo, chỉ chủ quyết định mới kháng nghị được, trạng thái báo cáo chỉ 4 giá trị và chỉ của chính người gọi.

## 8. Rủi ro lớn và việc cần Huy
1. **Ngưỡng và chữ**: tất cả là đề xuất; chữ trang quy tắc cần Huy duyệt và người am hiểu luật VN xem (kể cả yêu cầu gỡ nội dung của cơ quan chức năng).
2. **Một người duyệt duy nhất** ⇒ kháng nghị do chính người quyết xem lại; Apple 1.2 đòi xử lý trong 24 giờ: cần người và quy trình thật (chưa có cảnh báo chủ động).
3. Bình luận bị gỡ là xoá thật (ảnh chụp giữ 60 ngày để phục hồi) — cron dọn ảnh chụp chưa gắn.
4. Đảo ngược khoá/hạn chế gỡ trạng thái `account_status` kể cả khi nó do thao tác tay khác tạo ra (không phân biệt được nguồn).
5. Người đang bị khoá + yêu cầu xoá qua email: cần chính sách giữ định danh tối thiểu (xem mục 3, dòng 7).
6. App Android/iOS chưa có màn hình trạng thái báo cáo / Thông báo vi phạm / ẩn cục bộ — hợp đồng đã ghi, không cần build lại để server bật.
