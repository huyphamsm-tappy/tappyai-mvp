# BÀN GIAO 20/11/2026 — Các việc còn lại của bản WEB (không gồm bộ não)

Người nhận: phiên làm việc kế tiếp và anh Huy. Đọc xong tài liệu này là biết: việc nào ĐÃ LÀM, việc nào ĐANG DỞ, việc nào CHƯA LÀM, và việc nào đang CHỜ ANH QUYẾT. Bộ não (cách Tappy hiểu và trả lời) có tài liệu riêng: `HANDOFF-20261119-brain-eval-rebuild.md`, không lặp lại ở đây.

---

## 0. Đọc nhanh

| Mục | Giá trị |
|---|---|
| Nhánh làm việc | `feat/brain-r13-p1`, thư mục `D:\TappyAI-wt\wt-integration` (CHỈ MỘT nhánh cho web, đừng tạo thêm nhánh/worktree) |
| Commit mới nhất lúc viết | `71e8377` (20/11/2026 09:13) |
| Tag đóng băng | `brain-freeze-20261119` (`7c1f9ac`) và `brain-freeze-20261117` (đã dời tới `b0fe4bf` ngày 18/11) |
| Đã đẩy lên GitHub / đã deploy | **CHƯA.** Tất cả chỉ có trên máy. Production vẫn là bản deploy 04/11. Anh Huy đã dặn: làm xong hết rồi mới deploy MỘT lần |
| Cơ sở dữ liệu thử (UAT) | `zdaprdfgpbpnxyofagmc` (KHÁC production `fwznnobrdctuskgrvuik`). Mọi migration của đợt này mới chỉ áp lên UAT |
| Máy chủ thử | `localhost:3000`, khởi động bằng cấu hình `wt-integration-uat-plans-3000` trong `.claude/launch.json`. Đã tắt cùng máy tối 18/11, cần bật lại. Sau khi bật, gửi một tin nhắn thử để biên dịch trước (tin đầu có thể chậm 8–14 giây vì chế độ phát triển, không phải lỗi) |

Việc ghi vào tệp chưa commit mà KHÔNG phải của đợt này (đừng xóa, của phiên khác): `docs/handoff/ANTHROPIC-VA-TAPPY-DIEU-AP-DUNG-20261119.md`, `docs/handoff/AUDIT-20261118-tappy-vs-anthropic-agent-blueprint.md`, `docs/handoff/HANDOFF-20261119-brain-eval-rebuild.md`, `docs/uat/UAT-15-*`, `docs/uat/uat15-20261118/`. Năm báo cáo audit của em nằm ở `docs/architecture-audit-20261118/` (chưa commit).

---

## 1. ĐÃ LÀM (web, ngoài bộ não)

Quy ước trạng thái: **Code** = đã viết và đã commit trên nhánh; **Test** = có test và test xanh; **UAT** = đã thử trên máy chủ thử với cơ sở dữ liệu thử; **Production** = chưa có mục nào.

| # | Việc | Code | Test | UAT | Ghi chú cho người sau |
|---|---|:-:|:-:|:-:|---|
| 1 | **Giá gói:** Pro (Coco) 9 USD/tháng, Promax (Tappy) 12 USD/tháng; không đổi gì khác | ✓ | ✓ | ✓ | File `src/lib/plans/subscriptionPrices.json` (VND = USD × 25.000; 3 tháng giảm 10%). Đã sửa 11 test giá và 13 test thanh toán cho đúng giá mới, có ghi chú lý do |
| 2 | **Nút 18+:** thay ô điền ngày sinh bằng MỘT nút "Tôi đủ 18 tuổi" | ✓ | ✓ | ✓ | Migration `20261202_age_adult_declaration.sql` (đã áp UAT). Chưa áp migration thì web **từ chối cho vào** (fail-closed, an toàn). Đã sửa chữ trong Điều khoản (§2), Chính sách riêng tư (mục 1.b9) và FAQ: **cần luật sư đọc lại**. Người bấm nhầm "dưới 18" chỉ gỡ được bằng hàm quản trị `admin_set_user_date_of_birth` |
| 3 | **Sửa đăng nhập** (Zalo, email, Google) | ✓ | ✓ | ✓ | Chống chuyển hướng sai sau đăng nhập (`returnTo.ts`), hiện thông báo lỗi rõ (`loginError.ts`), `auth/confirm` theo đúng thứ tự callback, thông báo chung khi đăng ký lỗi, giới hạn tần suất cho Zalo và hai route callback/confirm, biến Zalo đọc tại lúc gọi |
| 4 | **Thông báo:** có người trả lời bình luận, có người chia sẻ bài; đánh dấu đã đọc; số huy hiệu; tab mặc định | ✓ | ✓ | ✓ | `NotificationsView.tsx`, `emit.ts`, `socialNotices.ts`. Route chia sẻ có giới hạn 30 lần/phút/tài khoản và đã vào sổ đăng ký chi phí |
| 5 | **Scam Shield cập nhật hằng tuần** từ nguồn Bộ Công an | ✓ | ✓ | ✓ | Cron `0 3 * * 1` (thứ Hai 03:00 UTC) trong `vercel.json`, route `api/cron/scam-shield-sync`, bảng `scam_knowledge_versions` (migration `20261201`, đã áp UAT). Bảng đang **trống** cho tới lần chạy đầu và cần `CRON_SECRET`. Nếu bảng thiếu thì đọc về dữ liệu tĩnh (an toàn). Đã sửa vài lỗi báo nhầm của luật quét tin nhắn |
| 6 | **Ẩn tính năng Dịch và Xem bói** trên web | ✓ | ✓ | ✓ | Cờ `SHOW_TRANSLATE=false`, `SHOW_FORTUNE=false`; hai trang trả "không tìm thấy" khi cờ tắt |
| 7 | **Thanh toán không bao giờ phải hoàn tiền** | ✓ | ✓ | ✓ | Migration `20261203_payments_no_refund.sql` (đã áp UAT). Chuyển thiếu: tiền giữ trên đơn, màn hình báo còn thiếu bao nhiêu, bù cùng mã thì kích hoạt. Chuyển dư: phần dư đổi thành ngày dùng thêm theo đúng giá gói. Chuyển lần hai vào đơn đã trả, hoặc đơn Pip thứ hai: đổi thành ngày dùng thêm. Có email báo. Đã chạy thử thật: bắn webhook ký HMAC vào máy chủ thử |
| 8 | **Popup chọn ngôn ngữ có cờ trước khi đăng nhập** | ✓ | ✓ | ✓ | `LoginLanguageChooser.tsx` gắn ở `/login` và `/register`; cờ vẽ bằng SVG (emoji cờ trên Windows chỉ hiện chữ). Chỉ hiện một lần, không gửi gì lên máy chủ. Link chia sẻ công khai không bị chặn (có test canh) |
| 9 | **Thời tiết không dẫn người dùng sang trang nước ngoài** (Na Uy) | ✓ | ✓ | một phần | Hai công cụ thời tiết không còn trả đường link nguồn; câu trả lời chỉ nêu tên nguồn bằng chữ. Chưa hỏi lại một câu thời tiết thật sau khi sửa |
| 10 | **Dọn rác:** xóa các tài khoản test; thêm giới hạn cho route chia sẻ | ✓ | ✓ | ✓ | |
| 11 | **Kiểm toán chỉ-đọc** (kiến trúc, bộ não, chi phí, lỗ hổng, khuyến nghị) | ✓ | – | – | 5 báo cáo ở `docs/architecture-audit-20261118/`. Kết luận chính: chat dùng model `gpt-6-luna` của OpenAI, không phải Claude; Sonnet 5.5 chỉ chạy ở báo cáo nghiên cứu Advanced |
| 12 | **Kiểm tra nhanh các việc anh hỏi 18/11** (Messenger, bảo mật, nén clip, TVI, thông báo, chi phí) | – | – | – | Đã báo cáo ở `docs/uat/AUDIT-REPORT-20261118.md` (đã gửi anh). Không lặp lại ở đây |

### Giao diện chat (phiên 19–20/11, do phiên làm bộ não thực hiện; em chưa kiểm lại từng cái)

Đã commit và có trong nhánh: màn chat trống chỉ còn mascot lớn và một lời chào theo giờ, có tên lấy từ hồ sơ (`843e254`, `4f912ce`); nút "Tải PDF" cho kế hoạch du lịch (`3a6b8e4`, `6d8542d`); Lazada dẫn đầu thẻ sản phẩm và hàng link đối tác, Agoda/Vexere/Lazada lên đầu (`129dc23`); thẻ khách sạn dẫn đầu bằng trang Agoda của chính khách sạn, kèm giá/đêm và giờ kiểm (`109a3ea`, `68bc2f1`); ẩn 6 nút tắt cũ; link đối tác mở trang thật, không qua khung đọc (`6f59b49`); chip nguồn đếm đúng số nguồn (`29db36b`).

---

## 2. ĐANG DỞ (làm một phần hoặc chờ kiểm)

| # | Việc | Còn thiếu gì |
|---|---|---|
| D1 | **Mua gói thứ hai "cộng dồn"** | **[LÀM XONG 20/11, commit `058b873`, CHƯA UAT bằng tay]** Gói WEB còn hạn mua thêm gói CÙNG LOẠI (Coco: momo/coco; Tappy: promax1m/promax3m) thì cộng ngày vào hạn hiện tại (còn 10 ngày + 1 tháng = ~40 ngày; đã chứng minh trên Postgres thật). Vẫn từ chối (409 `already_active`, có lý do): gói mua qua cửa hàng (tránh tính tiền hai lần), gói dùng thử Pip, gói KHÁC loại (đang Coco mua Tappy). Màn hình mua ghi "số ngày được cộng vào hạn hiện tại" và tính ngày hết hạn từ hạn hiện tại; nút đổi thành "Mua thêm ngày". **Còn chờ anh quyết:** đang Coco còn hạn mà mua Tappy (nâng cấp) thì tính thế nào (hiện bị chặn vì cơ sở dữ liệu sẽ đổi cả quãng sang gói mới). Chưa làm trên Android/iOS |
| D2 | **Thanh toán thật** | Máy chủ thử đang dùng tài khoản ngân hàng giả (`0011223344`), khóa chữ ký giả. Webhook SePay thật chưa nối; chưa có `CRON_SECRET` và khóa SePay thật trên production. Cần anh đưa/đặt khóa thật (em không đọc hay in khóa) |
| D3 | **UAT của anh chưa làm** cho: nút 18+, popup cờ, thanh toán thiếu/dư (giao diện), thông báo, Scam Shield. Mọi thứ đã thử bằng máy và test, chưa qua tay anh |
| D4 | **Ứng dụng Android/iOS cho phần ẩn Dịch/Xem bói** | Code đã viết (commit `df0274a`) nhưng CHƯA biên dịch. Cần xem kết quả kiểm tra tự động của hai nền tảng |
| D5 | **Câu thời tiết thật sau khi bỏ link** | Chưa hỏi lại để xem câu trả lời |

---

## 3. CHƯA LÀM (theo thứ tự anh đã duyệt: web trước, mobile theo sau)

### 3.1 Tính năng và nội dung

| # | Việc | Ghi chú |
|---|---|---|
| T1 | **Tappy tự giải thích mọi tính năng** cho người không biết dùng | Anh đã yêu cầu. Cần danh mục tính năng (một nguồn duy nhất) và công cụ `explain_feature` cho Tappy gọi. Chưa bắt đầu |
| T2 | **Chia tiền và đi ăn chung (Group dining)** | Anh chưa UAT lần nào. Em đã tự tạo 4–5 tài khoản thử, kết quả ở `docs/uat/uat-final-20261118/groupdining/`. Còn thiếu/lỗi: bỏ phiếu, chốt quán, tính chia tiền cuối cùng (settle-up), rời nhóm/xóa nhóm, giới hạn độ dài chữ, đọc nhóm phải là thành viên. Cần sửa rồi UAT lại |
| T3 | **TVI: tệp kiến thức sâu về Việt Nam** (mọi lĩnh vực + thời gian thực) | Chương trình nhiều giai đoạn. Móc nối hiện có: `TVI_CAPTURE`, `TVI_READ` (bảng `20261120_tvi_core.sql`). Chưa có kế hoạch giai đoạn được duyệt |
| T4 | **Song ngữ Việt/Anh: chuỗi viết cứng trong giao diện** | Hai bộ chữ có đủ 4.174 khóa, cân bằng. Còn khoảng 432 dòng tiếng Việt viết thẳng trong mã (trần kiểm soát ở `webHardcodedUiStrings.test.ts`, chỉ được giảm, không được tăng). Thứ tự so với các việc khác CHƯA được anh chốt (xem mục 4) |
| T5 | **Liên kết tài khoản đăng nhập** (cùng một người dùng Zalo, Google, email → một tài khoản) | Chưa làm; hiện mỗi cách đăng nhập tạo tài khoản riêng |
| T6 | **Tạo ảnh/thiết kế hình** (ChatGPT Go có, Tappy chưa) | Anh bảo "để lần sau". Chưa bắt đầu |

### 3.2 Chi phí và hiệu năng ngoài bộ não

| # | Việc | Ghi chú |
|---|---|---|
| H1 | **Bật sổ chi phí** `ai_usage_events` | Migration `20261101_ai_usage_events.sql` chưa áp ở UAT; bật cờ `AI_USAGE_LEDGER`. Cần anh cho phép áp lên cơ sở dữ liệu nào. Không có sổ này thì không đối chiếu được hóa đơn |
| H2 | Làm cho trần Serper có hiệu lực, bật cache Serper tầng 2 | Số đo: Serper chiếm 50% chi phí. Giá trị trần cần anh quyết, và phải đo trước/sau để không giảm chất lượng. Anh đã dặn "không cắt lượt gọi, phải gọi đúng" |
| H3 | Hợp nhất bảng giá model (hiện hai bảng Claude lệch nhau 10 lần) | Chi tiết ở `TAPPY_COST_TOKEN_AUDIT.md` mục 5 |

### 3.3 An toàn và hạ tầng (từ báo cáo audit 18/11)

| # | Việc | Ghi chú |
|---|---|---|
| A1 | Đóng 10 route "chưa có giới hạn đầy đủ" (stripe checkout/portal, translate, scan, messages, report, block) | `src/lib/security/costRoutes/registry.ts`; xác nhận kho đếm chung (KV) trên production |
| A2 | Khi cờ gói tắt, người dùng có gói bị miễn hạn mức; trần chi phí ngày bị khóa ở production | `aiQuestionQuota.ts:267–276`, `costGate.ts`. Cần xem trạng thái cờ production trước |
| A3 | 4 tác vụ nền chưa có lịch trong `vercel.json`: `behavior-rollup`, `business-order-expiry`, `mcp-jobs` (cố ý), `moderation-snapshot-purge` | Xác minh có chạy ở nơi khác không, đặc biệt `moderation-snapshot-purge` |
| A4 | CI thiếu: build thử, quét bí mật, quét lỗ hổng thư viện, CI Android | `.github/workflows/` |
| A5 | CSP production còn `unsafe-inline` | Bản siết đang ở chế độ chỉ báo cáo |
| A6 | Đồng bộ cờ sản phẩm giữa web, Android, iOS | iOS có nhiều hằng cứng (`ProductFlags.swift`); Android chỉ mô hình hóa một cờ |
| A7 | Lệch số liệu hạn mức gói và trần chat Pro giữa chú thích và mã | `tiers.ts`, `chatCaps.ts:28` (mặc định 1000) so với `route.ts:1290` (chú thích 300) |

### 3.4 Ứng dụng di động (làm SAU web, theo đúng chỉ đạo)

Nút 18+, popup ngôn ngữ cờ, thông báo (iOS báo có thông báo nhưng người dùng không biết vào đâu xem), giá mới, thanh toán không hoàn tiền: đều chưa làm trên Android/iOS.

### 3.5 Đưa lên production (làm MỘT LẦN, sau khi xong hết, và chỉ khi anh cho phép)

Danh sách điều kiện cần có trước khi triển khai:
1. Áp migration lên production theo thứ tự: `20261201`, `20261202`, `20261203` (cùng các migration còn thiếu khác ở `supabase/MIGRATION_ORDER.txt`; script `scripts/release/apply-migration.sh` chỉ chạy được với production, và đã có test canh danh sách). **Chưa được phép áp.**
2. Đặt biến môi trường production (chỉ tên, KHÔNG ghi giá trị vào đâu cả): `CRON_SECRET`, `SUBSCRIPTIONS_ENABLED`, `SEPAY_BANK_ACCOUNT`, `SEPAY_BANK_CODE`, `SEPAY_ACCOUNT_NAME`, `SEPAY_WEBHOOK_HMAC_SECRET`, mail thanh toán (`BREVO_API_KEY`, `PAYMENTS_MAIL_FROM`).
3. Luật sư đọc lại chữ về tuổi (Điều khoản, Chính sách riêng tư, FAQ).
4. Xác nhận trạng thái cờ và model đang chạy trên production (cho tới nay chỉ biết production là bản deploy 04/11, chưa có mã bộ não mới).
5. Kiểm tra tự động hai nền tảng di động và UAT lần cuối.

---

## 4b. LÀM TIẾP 20/11 chiều–tối (sau các quyết định ở 4a)
- **D1 mở rộng (commit `fe10f1b`):** quyết định mới của anh: gói web còn hạn được **nâng cấp** (Coco → Tappy), **không hạ** (Tappy → Coco). Nâng cấp: tài khoản chuyển sang Tappy, ngày còn lại của Coco được giữ và cộng vào; nghiên cứu sâu theo mức Tappy (số lượt đã dùng trong tháng vẫn tính, hạn mức nâng lên). Đã chứng minh trên Postgres thật (Coco còn 10 ngày + Tappy 1 tháng ≈ 40 ngày, plan = promax1m). Màn hình mua ghi "gói sẽ được nâng lên Tappy…". Gói qua cửa hàng, gói dùng thử Pip, và hạ cấp vẫn bị từ chối (409 có lý do).
- **Sổ chi phí (H1) ĐÃ ÁP lên cơ sở dữ liệu thử `zdapr…`** (chỉ UAT; migration `20261101_ai_usage_events.sql`, 18 cột, bật RLS, anon/authenticated không có quyền). Đã bật cờ `AI_USAGE_LEDGER=1` trong `measure30\flags-uat-blocks.json` (chỉ máy thử); đã thấy 7 dòng ghi thật (~0,002 USD/câu hỏi cách dùng). Production CHƯA áp. Lưu ý nhỏ: cột `turn_type` đang ghi `legacy` cho lượt một bộ não (chưa sửa).
- **Khách (chưa đăng nhập):** giữ quy tắc anh chốt 11/11: hỏi 5 câu (`ANON_LIFETIME_LIMIT`), hết thì hiện thông báo "tạo tài khoản miễn phí" + nút "Đăng nhập để tiếp tục" (`ChatInterface.tsx` ~2434). Đã đọc mã, **chưa chạy thật trên giao diện** (bộ chạy chế độ khách hiện bị từ chối: lỗi của bộ chạy cũ). Nếu anh muốn bắt đăng nhập ngay ở câu thứ 5 (thay vì sau 5 câu) thì sửa `ANON_LIFETIME_LIMIT` thành 4.
- **T1 XONG (commit `7468ea8`, `fdcf064`): công cụ `explain_feature`.** Tappy tự giải thích tính năng, đọc từ MỘT nguồn: trang hướng dẫn chung `/how-to-use` (khớp với app di động bằng test) + danh mục tính năng chỉ có trên web `src/lib/i18n/features.ts` (tổng quan, nghiên cứu sâu, kế hoạch du lịch, AI Planner, gói và thanh toán, trí nhớ); số liệu (giá, hạn mức, 5 câu khách) lấy thẳng từ hằng số trong mã. Không khớp thì nói "chưa có trong danh sách" và liệt kê chủ đề, không bịa. Không gọi nhà cung cấp, không tốn tiền, không tính vào hạn mức tra cứu, đã đăng ký trong bảng ranh giới hành động, và là **công cụ duy nhất Free được giữ** (dòng chế độ Free đã thêm một ngoại lệ). Hai test canh bộ não ghim "danh sách công cụ" và "Free không có công cụ" đã sửa có chủ đích. Chạy thật trên giao diện (Promax): 4 câu hỏi kiểu người mới đều trả lời đúng, 11–17 s, ~0,002 USD/câu. **Chưa chạy thật cho tài khoản Free** (chỉ có test cấp route).
- Còn lại theo thứ tự anh chọn: **T2 chia tiền/đi ăn chung → T3 TVI**, rồi các mục 3.3 (an toàn/hạ tầng) và mobile.

## 4c. T2 NHÓM ĂN CHUNG / CHIA TIỀN — LÀM XONG 20/11 tối (commit `51c9f8b`, `f032a62`, `36096e9`, `7b1785f` và sửa nhỏ sau đó; CHƯA push/deploy)
Anh chốt: mỗi người 1 phiếu (đổi được); **tự chốt khi một quán được HƠN NỬA số người tham gia** (trưởng nhóm + thành viên đã duyệt); chia tiền **chia đều, sửa tay được, có món riêng**; **nhóm là riêng tư: cần tài khoản Tappy VÀ được trưởng nhóm chấp nhận**.
- **Riêng tư:** mở link chỉ gửi YÊU CẦU (`group_members.status='pending'`, trigger ép mọi dòng do người dùng tự thêm thành `pending`); trưởng nhóm chấp nhận/từ chối/xóa qua `POST /api/group/[id]/members`; chỉ trưởng nhóm + thành viên đã duyệt đọc nhóm; người lạ/đang chờ chỉ thấy tên nhóm; `GET /api/group` cần đăng nhập. Tối đa 10 thành viên + 30 yêu cầu chờ.
- **Làm sạch:** cắt độ dài chữ (`clipField`), tạo nhóm chặn trùng trong 1 phút + 10 nhóm/giờ, **rời nhóm / rút yêu cầu** (`POST .../leave`), **xóa nhóm** (`DELETE /api/group/[id]`).
- **Gợi ý = 3 thẻ quán THẬT:** tìm quán theo khu vực và sở thích của các thành viên được phép mô tả (`searchPlaces`), mô hình chỉ CHỌN trong các quán tìm được và nói lý do (không thêm quán; trả lời hỏng thì lấy quán đánh giá cao nhất), lưu `groups.suggestion_options` + bản chữ cho app di động.
- **Bỏ phiếu:** `POST .../vote` (hơn nửa thì chốt ngay), `POST .../choose` (trưởng nhóm chọn CHỈ khi mọi người đã bỏ phiếu mà không quán nào hơn nửa), "Gợi ý lại" xóa phiếu và quán đã chốt.
- **Chia tiền:** `PUT/PATCH/DELETE .../bill`: người trả nhập tổng + tip + ai cùng chia + món riêng; tiền lẻ đồng dồn về người trả; người trả đánh dấu ai đã trả lại. Người trong nhóm được gọi bằng KHÓA MỜ (`leader` / id dòng thành viên), không lộ id tài khoản.
- **Cơ sở dữ liệu:** 3 migration mới `20261204_group_join_approval`, `20261205_group_suggestion_votes`, `20261206_group_bills` (+ rollback) — **ĐÃ ÁP lên cơ sở dữ liệu thử `zdapr…`, CHƯA áp production** (đã ghi vào `MIGRATION_ORDER.txt`; test thứ tự chạy khi dựng theo tên tệp, vì vậy chốt ép `pending` dùng trigger thay vì chính sách).
- **Kiểm:** test Postgres thật (33), test API/giao diện (cả bộ `src` xanh), **UAT sáu tài khoản thử trên cơ sở dữ liệu thử: 43/43 qua** (gồm tìm quán thật, truy cập cơ sở dữ liệu trực tiếp bằng người lạ/đang chờ/thành viên); tài khoản thử đã xóa. Ảnh giao diện: `eval-runs\GROUP-UAT-20261120\screens`.
- **Còn lại / lưu ý:** (1) **App Android/iOS chưa cập nhật:** `POST join` giờ trả `pending: true` (chưa vào nhóm ngay) và `GET /api/group` cho người lạ chỉ trả `{state, id, name}`; app cần màn hình "chờ duyệt", thẻ quán, bỏ phiếu, chia tiền. (2) Người trả tiền là thành viên có tài khoản; dòng thành viên cũ không có tài khoản (trước khi bắt đăng nhập) không bỏ phiếu/không chia tiền. (3) Chưa có thông báo đẩy cho trưởng nhóm khi có yêu cầu mới. (4) Em lỡ dùng `sed -i` một lần để thêm kiểu trả về cho một dòng của `bill/route.ts` (trái luật; kết quả đúng, đã kiểm lại tệp), các lần sau chỉ dùng Edit/Write.

## 4d. TVI GIAI ĐOẠN A — mã XONG 20/11 đêm (commit `cf5b565`, cục bộ; CHƯA chạy ghi trên UAT)
- **Đã làm:** `src/lib/tvi/maintain.ts` (cờ `TVI_MAINTAIN`, mặc định TẮT, khóa ở production): nâng ỨNG VIÊN đủ bằng chứng lên ACTIVE (một nguồn nhà cung cấp cho địa chỉ/điện thoại/website/giờ mở cửa → PARTIALLY_VERIFIED; hai nguồn độc lập → VERIFIED), hết hạn hiệu lực → EXPIRED; tranh chấp chỉ ĐẾM (kho chưa có bước chuyển cho nó). `src/lib/tvi/coverage.ts`: báo cáo độ phủ chỉ gồm số đếm. Đường chạy `GET /api/cron/tvi-maintain` (khóa bí mật cron, cờ, KHÔNG xếp lịch trong vercel.json), mỗi lượt tối đa 200 dữ kiện.
- **Kiểm:** 110 test liên quan xanh, cả bộ `src` xanh (sau khi cập nhật số cron 26→27 trong cronAuth.test), tsc sạch, đột biến bắt được 2 lỗi cố ý.
- **Chạy thử khô trên UAT (chỉ đọc):** 8.721 dữ kiện đang chờ, tất cả có bằng chứng nhà cung cấp và còn tươi ⇒ cổng sẽ nâng cả 8.721 (≈44 lượt × 200).
- **Lưu ý hành vi:** khi `TVI_READ` bật, nhãn `verification` trong `known_facts` đổi từ UNVERIFIED sang PARTIALLY_VERIFIED cho các dữ kiện đã nâng; không đổi dữ liệu nào khác. **Chưa chạy ghi trên cơ sở dữ liệu thử — chờ anh cho phép.**

## 4e. TVI GIAI ĐOẠN B — khung nạp nội dung chính thức XONG, nhưng KHÔNG CÓ DỮ LIỆU để nạp (20/11 đêm)
- **Đã làm (cục bộ, sau cờ `TVI_INGEST`, tắt + khóa ở production):** `src/lib/tvi/ingestOfficial.ts` (đọc trang chính thức bằng bộ tải an toàn + robots.txt, lấy địa chỉ/điện thoại/giờ mở cửa/giá vé VND từ dữ liệu có cấu trúc schema.org của ĐÚNG tên địa điểm, kiểm giá trị hợp lý, lưu ỨNG VIÊN dưới thực thể `attraction`, gắn trang làm bằng chứng GOVERNMENT/OFFICIAL_BUSINESS, từ chối chuyển hướng sang host khác, không lưu đoạn văn), `officialTargets.ts` (danh sách duyệt tay, ĐANG RỖNG), `GET /api/cron/tvi-ingest`. Giá vé một nguồn KHÔNG tự nâng (giữ chính sách cổng: cần nguồn thứ hai hoặc người duyệt). Không dùng mô hình để đọc trang (không tốn tiền, không bịa).
- **Kiểm:** 12 test + 3 test đường chạy, đột biến bắt 2 lỗi cố ý, cả bộ `src` xanh (một test không liên quan `identityConsistency` rớt một lần do chuỗi ngẫu nhiên trùng "308", chạy riêng 3 lần xanh).
- **ĐÃ ĐO — kết quả quan trọng:** thăm dò 10 địa chỉ trang chính thức: 5 không vào được, 5 vào được nhưng **không trang nào có dữ liệu schema.org về địa điểm** (0 khối giờ/địa chỉ/điện thoại). Nên bộ nạp xác định hiện **không thu được dữ kiện nào** từ các trang chính thức Việt Nam đã thử. Muốn có dữ kiện phải để MÔ HÌNH đọc chữ trên trang (tốn tiền, có rủi ro trích sai, cần người duyệt mẫu) — việc này cần anh duyệt.

## 4f. ĐO TVI: có tiết kiệm / chính xác không (20/11 đêm; không đụng bộ não, không sửa mã)
- **Độ đúng khi KHÔNG có Serper (ĐÃ ĐO, 60 quán lấy ngẫu nhiên, 60 lượt Serper trả phí):** 57/60 quán tìm lại được; trên 189 trường so được, kho **khớp 188 (99,5%)**, lệch 1 (giờ mở cửa). Địa chỉ 57/57, điện thoại 49/49, website 36/36, giờ mở 46/47. Kết quả: `eval-runs\TVI-ACCURACY-20261120\result.json`. **Giới hạn:** chuẩn so sánh là chính nhà cung cấp đó (đo độ cũ, không phải sự thật tuyệt đối) và tuổi dữ kiện chỉ 0–8 ngày (trung vị 3) nên chưa nói được về độ trôi sau nhiều tháng.
- **Thời gian (ĐÃ ĐO):** một lượt Serper bản đồ ≈ 1,7 giây; đọc kho cả 60 quán ≈ 1 giây (~16 ms/quán).
- **Tiết kiệm (ĐÃ ĐO trên 797 lượt UAT thật, 27,87 USD):** 0 câu là câu hỏi một sự thật về một quán (cùng lắm vài câu nghiên cứu sâu trúng chữ nhầm). 77% lượt có `web_search` (5.665 lần gọi), 36% có `search_places` (2.721 lần). `web_search` kho không thay được. Trần lý thuyết nếu xóa HẾT `search_places` ≈ 4,1 USD/27,87 (≈15%), nhưng các lượt đó là tìm danh sách/xếp hạng nên kho không thay được; mức thực ≈ 1% (số đo trước: kho bù được 13/1.206 lượt).
- **Kết luận (SUY LUẬN):** kho trả lời ĐÚNG khi có dữ kiện, nhưng câu hỏi thật của người dùng gần như không thuộc loại kho trả lời được, nên **không tiết kiệm đáng kể**; không làm giai đoạn C. Cần lưu ý thêm: ghi chú trong `serperPlaces.ts` nói dữ liệu Maps/Serper chỉ cache 24 giờ theo điều khoản; lưu lâu dài trong kho TVI là đúng điều Pháp lý phải xác nhận (R13 §21 mục 48).

## 4g. A1 — đóng 10 route "chưa đủ giới hạn" (20/11 đêm; commit cục bộ, chưa deploy)
- **Đã làm:** thêm giới hạn dùng kho đếm chung (`publicRateLimit`, kho chung khi đã cấu hình, trong tiến trình khi chưa; hỏng thì từ chối) cho: `stripe/checkout` (5/phút/người), `stripe/portal` (10/phút), `translate` (burst 10/phút/IP, đứng trước hạn mức ngày + trần toàn cục đã có), `scan` (burst 5/phút/IP, tương tự), `messaging/threads/[id]/messages` (60/phút/người, cùng giới hạn cũ nhưng chuyển sang kho chung), `users/[id]/block` (30/phút, cùng giới hạn cũ), `reviews/[id]/report` (20/10 phút/người), và 3 route báo cáo comment/user/message (60/10 phút/IP, đứng trước giới hạn riêng của `handleReport`). Số lỗ hổng đã ghi (`KNOWN_GAP_BUDGET`) từ 10 về **0**; mỗi route có test hợp đồng giới hạn (đếm đúng, khóa đúng, chia sẻ giữa các instance, cửa sổ đúng, kho hỏng thì từ chối và báo "store_unavailable").
- **Kiểm:** cả bộ `src` 26.095 test xanh, tsc sạch; đột biến (tắt giới hạn của `stripe/checkout` và `scan`) làm 12 test đỏ.
- **CHƯA kiểm / lưu ý:** "kho đếm chung có cấu hình trên production không" vẫn chưa xác minh được (em không đọc biến môi trường production); khi chưa có kho chung các giới hạn này chỉ đếm theo từng instance. Giá trị giới hạn là đề xuất của em (dễ đổi), anh có thể chỉnh. Không đổi hành vi bộ não.

## 4h. A7, A3, T4 (20/11 đêm; commit cục bộ, chưa deploy; production chưa đụng)
- **A7 (`5888258`):** chỉ sửa chú thích cho khớp mã: trần Pro là **1000 lượt/ngày** (anh quyết 01/11), nghiên cứu sâu Pro **5 Standard + 5 Advanced**, Tappy **10 + 15** mỗi tháng. Giá trị trong mã không đổi.
- **A3 (`cd7cbc4`):** xếp lịch hằng ngày trong `vercel.json` cho `moderation-snapshot-purge` (xóa ảnh chụp kiểm duyệt > 60 ngày; 404 khi cờ tắt) và `business-order-expiry` (đóng đơn chờ > 72 giờ). **Cố ý KHÔNG xếp lịch:** `behavior-rollup` (ghi vào bộ nhớ người dùng = đầu vào bộ não), `mcp-jobs`, `tvi-ingest`, `tvi-maintain`. Số cron 22 → 24 (cập nhật `outbox.test.ts` có chú thích). Có hiệu lực khi deploy.
- **T4 (đợt 1):** trang nhóm ăn chung (`group/[id]/page.tsx`, 25 dòng) và khung bình luận bài đánh giá (`ReviewCommentButton.tsx`, 17 dòng) đã chuyển sang bộ chữ và được niêm phong; ngân sách của nhóm giữ nguyên giá trị lưu (tiếng Việt) và chỉ dịch nhãn (`src/lib/group/budgets.ts`). Trần chuỗi viết cứng 432 → **385**. Còn lại nhiều nhất: `ChatInterface.tsx` 54, `BookingForm.tsx` 26, `service/[id]/page.tsx` 15, `BookingReviewButton.tsx` 13, `DealsView.tsx` 11 (các tuyến `api/*` và cron là chữ phía máy chủ, cần xử lý riêng theo ngôn ngữ người nhận).

## 4i. BẢNG GÓI MỚI — anh chốt 20/11 đêm (commit cục bộ; chỉ đổi trong gói, KHÔNG đổi bộ não; production chưa đụng)
- **Con số:** Free **300 câu/ngày**; Trial (MoMo, 7 ngày, 25.000đ, một lần duy nhất) **đủ tính năng như Coco**; Coco **9 USD/tháng, 15 lượt báo cáo/tháng, 1000 câu/ngày**; Tappy **12 USD/tháng, 30 lượt báo cáo/tháng, 1000 câu/ngày**. Giá và Free 300 đã đúng sẵn trong mã; **đã đổi:** trần ngày của gói trả phí 500 → **1000** (`PAID_DAILY_CEILING`), báo cáo từ 5+5 / 10+15 → **một kho duy nhất 15 / 30** (`DEEP_RESEARCH_MONTHLY`).
- **Bỏ khái niệm Standard/Advanced khỏi mọi chữ người dùng thấy** (màn hình gói, thư thanh toán, lời giải thích của Tappy). Bỏ hẳn hai hạn mức riêng và hàm tính của chúng; mỗi báo cáo trừ đúng 1 lượt từ một kho, bất kể độ sâu (hệ số trừ nặng/nhẹ: anh chọn trừ như nhau; cờ phân loại `RESEARCH_*` vẫn tắt/khóa ở production, nếu sau này bật Advanced thì chi phí cao hơn mà vẫn trừ 1 lượt: cần xem lại).
- **Hết lượt báo cáo:** Tappy KHÔNG từ chối nữa: câu hỏi chạy bằng chế độ **Suy nghĩ** (trả lời kỹ), kèm một "dữ kiện gói" cho mô hình (hết N lượt, ngày có lại là mùng 1 tháng sau theo giờ Việt Nam) để nói MỘT câu ngắn đúng ngôn ngữ người dùng. Câu từ chối cũ chỉ còn là đường dự phòng khi hai báo cáo cùng lúc tranh lượt cuối. **Lưu ý:** đây là một dòng dữ kiện mới đưa vào ngữ cảnh mô hình ở đúng lượt hết lượt (không đổi prompt lõi, không đổi công cụ); nếu anh muốn tuyệt đối không có dòng nào, đổi sang hiện thông báo phía giao diện.
- **Test:** cả bộ `src` 26.099 xanh, tsc sạch; đột biến (tắt việc chuyển sang Suy nghĩ) làm 2 test đỏ. Các test canh phải đổi có chủ ý: `architectureFreeze.test.ts` (ghim số báo cáo 10/25 → 15/30, đây là SỐ GÓI không phải mã bộ não), các test ghim 500/ngày → 1000, test e2e "lượt thứ 11 bị từ chối" → "chạy Suy nghĩ".
- **KIỂM THẬT TRÊN CHROME CỦA ANH (20/11 đêm, máy thử cổng 3000, tài khoản thử @example.test đã xóa sau khi xong):** (1) màn hình gói: Trial 25.000đ/7 ngày, Coco 225.000đ **15 lượt**, Tappy 300.000đ **30 lượt**, không còn chữ Standard/Advanced. Máy chủ cũ đang chạy còn hiện "10 lượt" (bản dựng cũ), khởi động lại mới đúng. (2) **Lỗi thật tìm thấy và đã sửa:** xin "báo cáo ngắn … xuất ra file" thì Tappy viết báo cáo nhưng KHÔNG có nút tải (thanh tải chỉ hiện với báo cáo ≥ 8.000 ký tự, ≥ 4 mục). Nay người dùng nói "xuất ra file / tải về PDF…" thì có thanh Markdown/Word/PDF dưới câu trả lời (`lib/chat/fileRequest.ts`); đã bấm thử: PDF 58,9 KB và Markdown 3,2 KB được tạo (chặn lưu thật). Tên tệp lấy từ dòng tiêu đề viết hoa thay vì câu mở đầu. (3) **Hết lượt báo cáo:** tạm hạ giới hạn Coco xuống 1 (không commit), chạy 1 báo cáo thật rồi hỏi tiếp: Tappy KHÔNG báo lỗi, trả lời bằng Suy nghĩ, kèm ghi chú cố định "Bạn đã dùng hết lượt Nghiên cứu sâu của tháng này nên Tappy trả lời ở chế độ Suy nghĩ. Lượt mới có từ 01/12/2026." (đúng cả khi chat mới chuyển sang /chat/<id>). **Đã bỏ dòng "dữ kiện gói" cho mô hình** (lần chạy thật cho thấy mô hình lúc nhắc lúc quên): giờ máy chủ gửi header `x-tappy-deep-reset` và trang vẽ ghi chú, nên bộ não KHÔNG nhận thêm gì.
- **CHƯA làm / chưa kiểm:** (1) Android/iOS chưa cập nhật chữ "15 lượt" và ghi chú (web trước); (2) trần ngầm theo cửa sổ giờ cho Tìm web/Suy nghĩ (như OpenAI): em quyết định KHÔNG làm vì đã có trần 300 (Free) / 1000 (trả phí) câu mỗi ngày + giới hạn mỗi phút, thêm trần giờ chỉ làm tăng nguy cơ chặn nhầm người dùng thật; (3) ĐÃ SỬA SAU KHI ANH DUYỆT (20/11 đêm): Tappy từng mở đầu "mình chưa thể đính kèm tệp tải xuống trực tiếp" dù nút tải có bên dưới. Nay chỉ ở lượt người dùng XIN FILE, máy chủ thêm MỘT dòng vào ngữ cảnh mô hình (`fileExportNoteFor`, `lib/chat/fileRequest.ts`: có nút tải Markdown/Word/PDF, đừng nói không gửi được tệp, viết trọn tài liệu); mọi lượt khác không thêm gì, prompt lõi không đổi. Đã chạy lại đúng câu cũ trên Chrome: báo cáo bắt đầu thẳng bằng tiêu đề, không còn câu "chưa thể đính kèm", có thanh tải; (4) ảnh chụp màn hình không chụp được ở Chrome (cửa sổ không ở tiền cảnh), em kiểm bằng nội dung trang.

## 4j. T4 đợt 2 + các mục 1–5 anh giao (20/11 đêm; commit cục bộ, chưa deploy)
- **T4 đợt 2:** màn đặt chỗ (form, nút chia sẻ, nút đánh giá), thanh nút dưới câu trả lời, trang lỗi, hồ sơ người sáng tạo, thanh tìm kiếm và vài chuỗi lẻ của chat chuyển sang bộ chữ (`lib/i18n/w2/{bookings,chatbar,shell,chatui}.ts`); 7 tệp được niêm phong; trần chuỗi viết cứng **385 → 303**. Phần còn lại KHÔNG còn là chữ giao diện cần dịch: tuyến máy chủ/cron (chữ phía máy chủ theo ngôn ngữ người nhận), danh sách tên ngôn ngữ viết bằng chính ngôn ngữ đó, ký hiệu "đ", khóa danh mục đọc từ dữ liệu, và các trang máy chủ (`service/[id]/page.tsx`, `not-found.tsx`) chưa có cách lấy ngôn ngữ phía máy chủ.
- **1. Thông báo cho trưởng nhóm:** có người xin vào nhóm → một thông báo trong hộp thư (và đẩy nếu có đăng ký), tên người đó + tên nhóm, không kèm ngân sách/khẩu vị/khu vực; một lần cho mỗi yêu cầu mới; giới hạn 20 yêu cầu/10 phút/người. Đã chạy thật trên cơ sở dữ liệu thử (1 thông báo, không lộ trường riêng tư, bấm lần hai không thêm); đẩy tới thiết bị CHƯA thử (không có thiết bị đăng ký).
- **2. Nút Tải HTML:** thêm cạnh Markdown/Word/PDF ở thanh tải, thẻ nghiên cứu, khung báo cáo. Đã thử trên Chrome thật: tệp `.html` 4,3 KB.
- **3. Thời tiết thật (D5):** hỏi "Thời tiết Đà Lạt cuối tuần này" trên Chrome thật: trả lời cụ thể từng ngày, ghi nguồn Open-Meteo và ngày cập nhật, không có link.
- **4. H3 bảng giá:** `turnUsd` nay đọc đúng bảng giá Claude trong `providers/claude.ts` (Haiku 5.5 0,10/0,50; Sonnet 5.5 2/10), trước đó lượt ghi không nêu model bị tính cao gấp 10. Chỉ là số ghi nhật ký/sổ; không cổng hay trần nào đọc nó (chỉ `semanticCheck` dùng làm số dự phòng).
- **5. CI (A4):** thêm `.github/workflows/supply-chain.yml`: quét bí mật (`scripts/scanSecrets.mjs`, tự viết, chặn), `next build` thật (chặn) và `npm audit` (CHỈ BÁO CÁO: hiện 1 nghiêm trọng `next` + 10 cao `ai`/`@ai-sdk`/`zod`, đều cần nâng bản lớn mà anh đã hoãn sang Phase 9). **`next build` thật tìm ra lỗi chặn deploy** trong `api/mcp/route.ts` (tham số tùy chọn): đã sửa; build thử trong bản sao riêng chạy được (216 trang, 1 phút 38 giây). CI Android để sau (anh dặn chưa làm mobile).
- **Phát hiện khác:** `scripts/release/apply-migration.sh` chưa liệt kê 3 migration nhóm 20261204–06 (test `applyMigrationPolicy` đỏ nếu chạy riêng thư mục `scripts/`): đã thêm (APPLY, áp ngay trước lần deploy duy nhất). Các lần "chạy cả bộ" trước chỉ chạy thư mục `src/`; lần này chạy toàn bộ `vitest run`.

## 4k. Ngày 20–21/11: ẩn mục, Deals, ô chat, bảo mật F12/DoS, tự ẩn khi bị báo cáo, ảnh không hết hạn (commit cục bộ, chưa deploy)
- **Ẩn mục + Deals:** Viết, Gợi ý cho bạn, Tỷ giá, Quét ẩn khỏi thanh trái và Smart Tools (cờ `SHOW_*` = false, đường dẫn 404). Trang Deals chỉ giữ Accesstrade/Lazada/Agoda/Vexere (`lib/deals/partnerAllowlist.ts`; thẻ đối tác Agoda + Lazada thêm vào `affiliatePartners.ts`, chỉ hiện khi có link có theo dõi).
- **Ô chat:** cuộn được câu dài, câu dài tự thu gọn sau khi gửi (`CollapsibleUserText`), đọc tệp .txt/.md/.csv/.json/.log ngay trên trình duyệt (`lib/chat/textFile.ts`; cắt theo chỗ còn lại của tin nhắn, đọc đúng UTF-8 khi bị cắt giữa ký tự). Banner Khám phá của Tappy nằm trong hàng đầu giữa logo và chuông (`ShellHeader`); chữ câu chào màu vàng `#ffc83d`.
- **Bảo mật (21/11):** middleware không gọi máy chủ xác thực khi không có cookie phiên; `reviews/feed` có giới hạn 120/phút và kẹp phân trang; trần kích thước body khi đọc (translate, track, mcp, csp-report, webhook Stripe/SePay); log chẩn đoán trình duyệt chỉ chạy ở môi trường dev; bỏ địa chỉ cá nhân ở mã phía trình duyệt; bỏ `reason` khỏi phản hồi lỗi chia sẻ; `maxDuration` 30 giây cho các route công khai chậm. **CHƯA làm (cần anh hoặc quyết định):** CAPTCHA/giới hạn đăng nhập–đăng ký–OTP ở Supabase Auth (bảng điều khiển Supabase, khóa Turnstile đã có ở Vercel), trần ngày toàn cục cho các route tải URL ngoài, xác minh kho KV production.
- **Tự ẩn khi bị báo cáo:** migration `20261207_auto_hold_reported_posts.sql` (CHƯA áp lên UAT): 3 người báo khác nhau (bạo lực/nội dung nhạy cảm), 5 người (quấy rối); spam/bản quyền/sai lệch/khác không bao giờ tự ẩn; bài ở trạng thái tạm giữ cho tới khi người kiểm duyệt bấm "không vi phạm" (route decide đã sửa để một phán quyết ở bất kỳ báo cáo nào của bài đều gỡ), báo cáo trước phán quyết không tính lại. Chưa có tự ẩn bình luận (bảng bình luận chưa có cột ẩn).
- **Ẩn bình luận (anh duyệt 21/11):** migration `20261208_comment_hiding.sql` (ĐÃ ÁP UAT, kèm phụ thuộc `20260928c` và `20261009` cũng đã áp UAT): chủ bài ẩn/hiện bình luận dưới bài mình (`POST /api/comments/[id]/hide`, nút con mắt trong ngăn bình luận); 3 người báo khác nhau (nhạy cảm/bạo lực/thù ghét/tình dục/tự hại) hoặc 5 (quấy rối) thì tự ẩn tạm, người kiểm duyệt bấm "không vi phạm" ở bất kỳ báo cáo nào của bình luận đó thì hiện lại. Ẩn do chủ bài chỉ chủ bài bỏ được; ẩn do hệ thống chỉ người kiểm duyệt bỏ. Đã thử trực tiếp trên UAT (2 người: chưa ẩn; 3 người: ẩn + một dòng hàng chờ đánh dấu giữ).
- **Cộng dồn quota (anh duyệt 21/11):** `lib/plans/deepCarryover.ts` + route SePay: báo cáo nghiên cứu sâu còn dư của gói cũ cộng một lần vào tháng sau của gói mới; ngày đã cộng dồn sẵn trong DB. CHƯA phủ Apple IAP và cấp gói thủ công.
- **Clip trên UAT:** tải lên + Transcoder chạy được (clip 19 MB, 3:54 xong ~30 giây); bị chặn ở kiểm duyệt vì khóa OpenAI của UAT chỉ thấy MỘT model (`gpt-6-luna`) → gọi `/v1/moderations` bị 403; cần thêm model `omni-moderation-latest` vào danh sách model cho dự án OpenAI. Ladder HLS hạ còn 2,0/0,8/0,4 Mbps (trước đó clip 19 MB sinh 61 MB).
- **Hạ tầng clip, kế hoạch chi phí (anh chốt 21/11: tiết kiệm, hợp lý, chưa có user, đang có hỗ trợ Google Cloud):** giữ trần 5 phút; tối đa 2 mức chất lượng (720 + 360, `transcodeConfig.ts`); KHÔNG đưa clip đang phát vào kho lạnh theo tuổi. Khi số clip lên tới vài nghìn thì bật Autoclass (mặc định Nearline, `gcloud storage buckets update gs://<bucket> --enable-autoclass`, không dùng `SetStorageClass` theo tuổi) cho bucket phát và bucket nguồn. Khi hết hỗ trợ Google Cloud: đo chi phí thật rồi cân nhắc Bunny Stream/Cloudflare R2 (phát qua `VIDEO_CDN_HOST`, nên đổi nhà phát chủ yếu là cấu hình). Chưa làm: xóa bản HLS ở thư mục tạm `vstg/` sau khi đăng (trùng với bản phát; cần chốt chính sách khôi phục sau khi gỡ), chuyển file gốc sang kho lạnh.
- **Thử giao diện thật với 3 tài khoản thử (21/11, Chrome, UAT; đã dọn hết dữ liệu và tài khoản):** báo cáo bài (đúng hộp thoại, vào `content_reports` + hàng chờ ưu tiên 3 cho bạo lực), báo cáo bình luận (vào `user_reports`, đúng hộp "Báo cáo bình luận"), chặn người dùng (hộp xác nhận đúng, ghi `user_blocks` + `chat_blocks`; sau chặn: bài của người bị chặn biến mất khỏi feed, gửi tin vào cuộc trò chuyện cũ bị từ chối), Messenger 2 tài khoản (theo dõi lẫn nhau mới nhắn được: luật `mutual_follow` mặc định; tin nhắn hiện bên kia kèm chấm chưa đọc, thông báo tin nhắn, thông báo theo dõi), nút ẩn bình luận của chủ bài (hiện cả ở trang bài viết và ngăn bình luận của feed). **Lỗi tìm ra và đã sửa:** (1) menu "⋯" (Báo cáo/Chặn) mở xuống dưới bị tràn khỏi màn hình ở cuối trang, và trong ngăn bình luận bị che bởi hộp cuộn → nay mở lên khi hết chỗ và vẽ ở `document.body` (`SafetyMenu.tsx`); (2) nút "Nhắn tin" báo lỗi không nói lý do → nay nói cần theo dõi nhau và chưa chặn nhau; (3) nút ẩn bình luận thiếu ở trang bài viết. **Chưa sửa/ghi nhận:** đăng nhập Zalo trên localhost báo lỗi -14003 "URI chuyển hướng không hợp lệ" (ứng dụng Zalo chưa đăng ký `http://localhost:3000/api/auth/zalo/callback`; trên production cần đã đăng ký `https://www.tappyai.com/api/auth/zalo/callback`); đăng nhập Google chuyển đúng sang Google (chưa hoàn tất vì cần tài khoản thật); email bằng đường liên kết một lần chạy; đường dẫn trực tiếp tới bài của người đã chặn vẫn mở được.
- **Ảnh Messenger:** không còn hết hạn 30 ngày; chỉ bật lại bằng biến `CHAT_MEDIA_RETENTION_DAYS` (số ngày ≥ 1). Ảnh đã bị xóa trước đây không phục hồi được.
- **SePay:** KHÔNG thấy khóa thật ở `.env.local` UAT (vẫn tài khoản giả) và KHÔNG có `SEPAY_*`, `BREVO_API_KEY`, `PAYMENTS_MAIL_FROM`, `SUBSCRIPTIONS_ENABLED` trong danh sách biến Production của Vercel (chỉ đối chiếu tên). Chỉ có `CRON_SECRET`.

## 4a. Anh Huy đã quyết (20/11, buổi chiều) — thay cho các mục cùng tên ở 4
1. **Mua gói khi còn gói:** mua thêm thì CỘNG DỒN ngày (ví dụ còn 10 ngày, mua thêm 1 tháng → cộng thành hơn 1 tháng). Đã làm (D1).
2. **Phí SePay thật KHÔNG đưa vào giá bán.** (Chưa nói về trần Free 300 lượt/ngày và giới hạn gói dùng thử: giữ giá trị hiện tại cho tới khi anh nói.)
3. **"Tạo ảnh/thiết kế ảnh" để SAU** (chưa làm, không đưa lên trước tối ưu chi phí).
4. **Sổ chi phí `ai_usage_events`:** anh chưa hiểu, đã được giải thích; chờ anh quyết có áp lên cơ sở dữ liệu thử không.
5. **Thứ tự làm các việc tính năng: (1) Tappy tự giải thích tính năng → (2) chia tiền/đi ăn chung → (3) TVI.**
6. **Tối ưu chi phí/độ trễ: thuộc bộ não Tappy, KHÔNG đụng vào** (bộ não đã đóng băng).

## 4. Việc đang CHỜ ANH QUYẾT (bản cũ, xem 4a để biết mục đã quyết)

1. Thanh toán (D1): cho mua gói khi còn gói đang hoạt động, và cộng dồn như thế nào.
2. Phí SePay thật cộng vào giá hay không; trần Free 300 lượt/ngày; giới hạn gói dùng thử.
3. Có đưa "tạo ảnh" lên trước phần tối ưu chi phí không (đang để sau).
4. Có áp migration sổ chi phí (H1) lên cơ sở dữ liệu thử không.
5. Thứ tự các việc 3.1 (giải thích tính năng, chia tiền đi ăn chung, TVI): anh muốn việc nào trước.
6. Chỉ giữ được khi đo không giảm chất lượng: mọi tối ưu chi phí/độ trễ (H2…).

---

## 5. Luật làm việc anh đã chốt (bắt buộc)

- Viết tiếng Việt, giải thích bằng lời thường (anh không phải lập trình viên).
- KHÔNG vá từng ca riêng lẻ, KHÔNG chỉnh prompt cho một câu; sửa ở cấu trúc.
- Không bao giờ giảm chất lượng câu trả lời để tiết kiệm.
- Việc kỹ thuật là việc của em, không hỏi anh chọn phương án kỹ thuật. Chỉ hỏi: quyền (tải, tài khoản), tiền, gu sản phẩm, riêng tư, production.
- Commit chỉ trên nhánh cục bộ. Không push, không gộp, không deploy nếu anh chưa nói rõ.
- Chỉ làm trên ổ D. Chỉ MỘT nhánh cho web (`feat/brain-r13-p1`).
- Sửa mã CHỈ bằng công cụ Edit/Write, không dùng shell để viết tệp nguồn. Tệp dùng xuống dòng LF.
- Cơ sở dữ liệu: chỉ UAT. Không bao giờ đọc/ghi production. Không in khóa, mật khẩu, token. Hỏi phép trước khi ghi vào cơ sở dữ liệu thử.
- Không chạy hai máy chủ `next dev` trên cùng một thư mục (làm hỏng bộ nhớ `.next`).

## 6. Cách thử nhanh

- Bật máy chủ: cấu hình `wt-integration-uat-plans-3000`. Link đăng nhập một lần: `node uat-link.mjs` trong `D:\TappyAI-review-artifacts\consultative-wave3\measure30\`.
- Chạy bộ thử giao diện thật: `node scripts/uat/uat60-run.mjs <câu hỏi.json> <thư mục ra> <từ> <đến>` (đăng nhập tài khoản thử Promax, từ chối mọi dự án không phải UAT). Số giây trong kết quả đã bị cộng thêm 4,3 giây chờ cố định.
- Tài khoản thử tạm: `node scripts/uat/throwaway-accounts.mjs create|delete` (địa chỉ `@example.test`, xóa sau khi dùng).
- Áp một migration lên UAT: cần tập lệnh áp từng tệp một giao dịch, chỉ nhận UAT; hiện nằm trong thư mục tạm của phiên, không trong repo. Tạo lại khi cần, hỏi phép anh trước.
- Test: `npx vitest run --project app` (toàn bộ) và `npx vitest run --project db supabase/tests/p8_*` (thanh toán trên PostgreSQL thật). Lần kiểm 20/11: hai tệp thanh toán đạt 59/59.
- Sau mỗi lần chạy toàn bộ test, chạy `git checkout -- docs/audit` (một test ghi đè thư mục đó).

## 7. Đã biết nhưng chưa xử lý (đừng bị bất ngờ)

- Test `noBlobWrites.test.ts` thỉnh thoảng đỏ khi cả bộ chạy cùng lúc (quá thời gian), chạy riêng thì xanh.
- Tệp `.env.local` của UAT có thêm các giá trị thanh toán GIẢ (tài khoản `0011223344`, khóa chữ ký ngẫu nhiên); không dùng cho production.
- Ghi chú về kiểm soát chi phí: trần chi tiêu tiến trình `LLM_RESPONSES_PROCESS_BUDGET_USD` chỉ tính OpenAI và theo từng instance.
