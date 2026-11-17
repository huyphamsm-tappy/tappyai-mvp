# Báo cáo 17/11/2026 — Kiểm các nhánh trước khi hợp nhất (chỉ đọc, chưa sửa gì)

Cây: `D:\TappyAI-wt\wt-integration`, nhánh `feat/brain-r13-p1`, HEAD `4762c58`, 174 mục chưa commit. Không commit, không tạo nhánh, không đụng production.

## 1. Kết luận ngắn

- Bộ não chỉ có ở nhánh đang làm. Không nhánh nào khác mang mã bộ não mới hơn.
- Việc gộp thật sự chỉ còn 3 dòng: **Phase 6**, **Phase 8**, **game One Life**. Các nhánh khác hoặc đã nằm trong HEAD, hoặc là mã cũ mà HEAD đã thay.
- File não bị đụng khi gộp: Phase 6 = 0 file; Phase 8 = 2 file (`route.ts`, `ChatInterface.tsx`) cộng 1 file nhánh sửa một phía (`memoryService.ts`); One Life = 0 file.
- Phase 8 là khối rất lớn: khoảng 330 file web và 22 migration mà HEAD chưa có.

## 2. Từng nhánh

| Nhánh | Commit riêng | Xung đột khi gộp thử | Đụng file não | Kết luận |
|---|---|---|---|---|
| `feat/chat-workspace-p1`, `feat/explore-video-p1`, `perf/cost-cache`, `integration/canonical-20261020`, `exp/deep-research-20261102`, `rc/web-uat`, `feat/g1-growth` | 0 | – | – | Đã nằm trọn trong HEAD. Không làm gì. |
| `integration/phase6-release` (19/09) | 25 | 34 file (web 17, Android 14) | 0 | Gộp. Lát đầu tiên. |
| `phase8-master` (27/09) | 51 | 159 file (web 101) | 2 | Nền của cả Phase 8. Gộp theo tính năng. |
| `sec/phase8-hardening` | nền + 9 | 160 | 2 | 9 bản sửa bảo mật cho Phase 8, đi cùng nền. |
| `p8/subscriptions` | nền + 20 | 178 | 2 | HEAD đã viết lại phần lớn (xem mục 3). Chỉ lấy phần còn thiếu. |
| `p8/scam-scenarios` | nền + 2 | 161 | 2 | HEAD đã có thư viện kịch bản Bộ Công an. Chỉ so lại rồi lấy phần thiếu. |
| `p8/news-feeds` | nền + 1 | 160 | 2 | HEAD chưa có bản tin. Gộp sau cờ tắt. |
| `feat/ccp-mvp` (13/09) | 30 | 133 | 5 | KHÔNG gộp. CCP trong HEAD mới hơn (60 file so với 35 của nhánh, sửa gần nhất 12/11). |
| `feat/consultative-d1-d2-r1-r2-d3` (11/09) | 29 | 109 | 5 | KHÔNG gộp. Đây là bộ luật tư vấn cũ mà bộ não hiện tại đã thay. |
| `integration/scam-shield-v3`, `feat/v3-qr-profile` (06/09) | 23, 25 | 79, 82 | 5 | KHÔNG gộp. Giao diện V3 đã lên theo đường khác; phần còn lại trùng với Phase 6. |
| `feat/vietnam-intelligence` (06/11) | 1 | 0 | 0 | 9 file khung. HEAD đã có `src/lib/tvi`. Cần so thêm trước khi quyết. |
| One Life web: `feat/one-life-stage-memories-luna` | 23 | 6 file | 0 | Nhánh này chứa đủ 11 nhánh One Life web khác. Gộp sau cùng, 3 migration. |
| One Life Android/iOS | 1 mỗi nhánh | – | – | Mobile, ngoài phạm vi đợt này. Giữ nguyên. |

## 3. Phase 8 và Phase 6: cái gì HEAD đã có, cái gì chưa

HEAD đã có (viết lại hoặc đã chuyển sang từ trước):
- Gói và thanh toán: `src/lib/plans`, `src/lib/payments`, migration `20261011_p8_payments`, `20261015_p8_subscriptions`, Apple IAP.
- Thư viện kịch bản lừa đảo: `src/lib/scam-shield/knowledge/bocongan2026.ts` và trang `/scam-shield/kich-ban`.
- Chặn người dùng, tự xoá tài khoản, đồng ý dữ liệu AI, Messenger web (bản tháng 11).

HEAD chưa có:
- Phase 6: đồng bộ danh bạ, vị trí tài trợ (`src/lib/ads`), lớp quản trị dữ liệu, công tắc tắt theo tính năng, lớp đo lường; 5 migration.
- Phase 8: đăng nhập mạng xã hội và liên kết tài khoản, sticker, thử thách/radar/tranh luận/đăng lại ở Explore, voucher và duyệt cửa hàng, gán nhãn dữ liệu AI, hệ sự kiện và telemetry, giọng nói thành chữ, dọn tài khoản đã xoá, chế tài người dùng, màn hình gói (`/subscription`), bản tin; 22 migration.

## 4. Thứ tự gộp em chốt

1. Bước 0: nhánh sao lưu, commit bộ não thành vài commit, tag `brain-baseline-20261116`.
2. Phase 6 (không đụng não).
3. Phase 8 theo từng tính năng, mỗi tính năng một commit: bảo mật và chế tài → dọn tài khoản → đăng nhập mạng xã hội → Explore → sticker → voucher và cửa hàng → dữ liệu AI → sự kiện và telemetry → giọng nói → màn hình gói còn thiếu → bản tin.
4. One Life web.
5. `feat/vietnam-intelligence` nếu so xong thấy còn giá trị.

Luật áp cho mọi lát: file não giữ bản của mình; mã mới nằm sau cờ mặc định tắt; chỉ lấy file web, bỏ file Android/iOS; tsc và vitest xanh mới sang lát sau; migration chỉ áp lên DB UAT sau khi anh cho phép.

## 5. Đã kiểm / chưa kiểm

ĐÃ KIỂM (bằng git, trên commit HEAD):
- Số commit riêng, gốc chung, số file xung đột của từng nhánh (`git merge-tree`).
- File nào chỉ có ở nhánh, file nào hai bên cùng sửa, cho Phase 6 và ba nhánh p8.
- Các nhánh p8 đều dựng trên `phase8-master`; One Life `stage-memories-luna` chứa 11 nhánh One Life khác.
- CCP trong HEAD nhiều file hơn và mới hơn nhánh `feat/ccp-mvp`.

CHƯA KIỂM:
- Xung đột với 174 mục chưa commit. Số trên đo với commit HEAD; em đo lại sau bước 0.
- Mức trùng thật giữa `p8/subscriptions`, `p8/scam-scenarios` với bản HEAD đã viết lại (mới so theo tên file và từ khoá, chưa so từng hàm).
- `feat/vietnam-intelligence` so với `src/lib/tvi`.
- 22 migration Phase 8 có chạy được trên DB UAT hiện tại không.
- Chưa chạy tsc hay vitest hôm nay (chưa sửa gì).

## 6. Cần anh quyết

- Cho phép bước 0: tạo nhánh `backup/brain-20261116`, commit cục bộ, gắn tag. Không push.
- Phase 8 có ~330 file web và 22 migration. Em đề xuất vẫn gộp đủ, tất cả sau cờ tắt. Nếu anh muốn bỏ hẳn tính năng nào (ví dụ vị trí tài trợ, sticker, đồng bộ danh bạ) thì nói trước để em khỏi mang vào.
