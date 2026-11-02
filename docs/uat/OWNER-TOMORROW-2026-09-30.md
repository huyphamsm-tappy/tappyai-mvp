# VIỆC CỦA HUY — 30/09 (UAT tay một vòng, rồi release PHẦN B)

Một danh sách duy nhất, làm từ trên xuống. Không gõ mật khẩu / khoá vào chat; giá trị chỉ vào đúng file hoặc ô được nêu.
Chi tiết gốc (nếu cần tra): `RELEASE-PLAN-2026-09-29.md` §3, `RELEASE-GOVERNANCE.md` §3–§4, `PRODUCTION-VERIFICATION.md`.

---

## A. UAT AI tư vấn (sáng) — duyệt trang, rồi thử tay

1. **Mở trang duyệt UAT:** https://claude.ai/artifact/T1ENadG4ZVDHEbnJaaGRFU (riêng tư, đăng nhập claude.ai).
   - Đầu trang: bảng tổng 5 mảng + danh sách lỗi B còn ở ngách.
   - Mỗi câu: ảnh mobile thật, chi phí, mức lỗi A/B/C/D (nếu có). Bấm **Đạt / Không đạt** + ghi chú — trang tự lưu.
   - Trang ghi rõ: phần 59 câu + ý định chạy trên `fbb1c3c`, 15 kịch bản chạy trên `55e298e`; UAT bây giờ = `b01b53c`
     (thêm 2 sửa: ngân sách từ tên sản phẩm chép lại, lượt so sánh không bị chèn "Mình chọn") — kiểm: https://uat.tappyai.com/api/version.
2. **Thử tay trên điện thoại** (uat.tappyai.com, tài khoản test `manual.uat.*` — không dùng tài khoản thật), mỗi câu gõ
   tiếp các lượt trong ngoặc:
   - Ăn uống: `tối nay ăn gì ngon quận 1` → chọn nhanh → `không muốn đồ chiên` → `Lên kế hoạch chi tiết`
   - Mua sắm: `ốp UAG iPhone 17 Pro Max` → `không thích màu đen` → `xem thêm`
   - Mua sắm: `quà sinh nhật sếp nam thích cà phê dưới 500k` → `cái đó sếp có rồi` → `Lên kế hoạch chi tiết`
     (không được có giá bịa cho giấy gói / thiệp)
   - Du lịch: `cuối tuần đi đâu chơi gần sài gòn` → `2 ngày 1 đêm, gia đình 4 người, xe riêng, 5 triệu, thích núi`
     (phải ra một điểm đến ngoài thành phố, KHÔNG phải đường "Núi Thành") → `chỗ khác đi`
   - Vé máy bay: `vé máy bay sài gòn đi hà nội 15/10, 1 người, bay sáng` → có link **Xem giá trên Traveloka**, bấm thử
     (phải mở Traveloka đúng chặng + ngày) → `chốt, hướng dẫn đặt vé`
   - Giải trí: `karaoke nhóm bạn 6 người quận 3 tối nay` → `xem thêm` → `Lên kế hoạch chi tiết`
   - Spa: `mệt quá muốn thư giãn` → chọn nhanh → `Lên kế hoạch chi tiết`
3. Câu nào "Không đạt": ghi chú ngay trên trang (lượt nào, sai gì). Lead sửa đúng các câu đó, chụp lại, cập nhật trang.
4. **Duyệt xong** (một câu trong chat: "UAT AI đạt" hoặc danh sách câu không đạt) → là cổng 2 của RELEASE-GOVERNANCE §3.

## B. Release PHẦN B — các việc CHỈ Huy làm được (theo thứ tự)

0. **Vercel (quyết TRƯỚC khi release)** — team đã dùng 100% Function Storage (Hobby, tính theo đỉnh 30 ngày). Hiện KHÔNG bị chặn
   (`softBlock`/`blocked` rỗng), nhưng Hobby có thể chặn deploy khi vượt hạn mức, mà release cần 1 bản production mới.
   - **Owner chốt 30/09: KHÔNG nâng Pro — release trên Hobby.** Ngay trước deploy production, Claude kiểm lại (chỉ đọc API
     team: `softBlock`/`blocked`, deploy UAT gần nhất READY). **Bị chặn lúc release → DỪNG, báo Huy ngay** (production
     `f42ae4b` vẫn chạy): Huy quyết nâng Pro tạm, hoặc lùi release để dời sang Google Cloud.
   - Sau release: dời hosting sang Google Cloud (PL-HOSTING-GCP) là việc ưu tiên — phiên riêng.
   - **AI = GPT-6 Luna (owner 30/09, Anthropic hết credit):** `OPENAI_API_KEY` ĐÃ đặt cho Production + Preview (30/09, Claude, từ
     `D:\TappyAI-backups\openai-key.txt`). Ngay trước deploy production Claude kiểm TÊN biến (không đọc giá trị): có `OPENAI_API_KEY`,
     KHÔNG có `LLM_PROVIDER` (giá trị `claude` sẽ gọi Anthropic đang hết credit), không có `HAIKU_FALLBACK`. Bảng: RELEASE-PLAN §2g.
   - **Supabase — URL Configuration (chỉ xem, I6):** dashboard → Authentication → URL Configuration → Redirect URLs của
     production chỉ gồm các URL web của TappyAI + `tappyai://auth-callback` (Android) + `tappyai://auth/callback` (iOS);
     KHÔNG có mục `*`/`**` mở rộng. Chụp ảnh gửi Claude.

1. **ACCESSTRADE (trước deploy)** — pub2.accesstrade.vn → menu tài khoản → trang API → copy **Access Key**.
   Tạo `D:\TappyAI-backups\accesstrade.txt` đúng 2 dòng:
   `ACCESSTRADE_API_KEY=<key>` và `ACCESSTRADE_FEED_ENDPOINT=https://api.accesstrade.vn/v1/datafeeds?campaign={campaign}&format=csv`.
   Báo lead "accesstrade.txt ready".
2. **File truy cập DB production (trước backup)** — supabase.com/dashboard/project/**fwznnobrdctuskgrvuik** → **Connect**
   → **Session pooler** (5432) → copy host vào `D:\TappyAI-backups\pghost.txt`. Tạo `D:\TappyAI-backups\pgpass` một dòng
   `<host>:5432:postgres:postgres.fwznnobrdctuskgrvuik:<mật khẩu DB>` (KHÔNG reset mật khẩu). Báo lead "pgpass ready".
3. **Trần chi tiêu API production (trước deploy)** —
   - console.anthropic.com → **Settings → Limits** (AI nay chạy trên OpenAI: đặt trần ở platform.openai.com → Settings → Limits) → đặt **monthly spend limit** cho org mà production dùng
     (đề xuất: mức anh chấp nhận cho tháng đầu; ước chi phí tư vấn ≈ $0,009/lượt → 900 lượt/tháng ≈ $8).
     Nếu UAT/replay và production chung org, 29/09 đã chạm giới hạn → nâng đủ cho cả hai.
   - serper.dev → Dashboard → kiểm số credit còn lại (code tự chặn ở 15.000 credit/ngày — `SERPER_DAILY_CREDIT_CEILING`).
   - vercel.com → team → **Settings → Billing → Spend Management** → bật trần + cảnh báo.
4. **2 tài khoản test production (trước smoke)** — Supabase **fwznnobrdctuskgrvuik** → Authentication → Users →
   **Add user → Create new user**: `qa.release.a@tappyai.com` và `qa.release.b@tappyai.com`, mật khẩu mạnh, tick
   **Auto Confirm User**. Mỗi tài khoản: cửa sổ ẩn danh → www.tappyai.com → đăng nhập → làm bước **ngày sinh 18+** → đăng
   xuất. Khi lead chạy `verify-prod.mjs`, anh tự gõ 2 mật khẩu ở dấu nhắc (RELEASE-PLAN §3 (e3) bước 5).
5. **Merge PR #252 — chỉ khi lead báo bị chặn** — https://github.com/huyphamsm-tappy/tappyai-mvp/pull/252 → kiểm head
   = SHA lead đưa → **Create a merge commit** (KHÔNG squash/rebase) → Confirm. Không xoá nhánh.
6. **Bật khách chat (ngay sau deploy, trước smoke)** — Supabase **fwznnobrdctuskgrvuik** (KHÔNG phải zdaprd…) →
   Authentication → **Sign In / Providers** → **Allow anonymous sign-ins = ON** → Save. Báo lead "anonymous ON".
7a. **Trước khi upload AAB — đọc `docs/uat/ENV-RELEASE-CHECKLIST.md` (01/10):** quyết cờ `ACCOUNT_SELF_DELETE_ENABLED` (đổi chữ trong app),
   biến `GCP_*` cho đăng video production (+ smoke 1 clip), vân tay App signing key → OAuth client Android cho Google login, trần chi tiêu OpenAI.
7. **Play Console — Internal testing** (khi lead đưa đường dẫn AAB vc10 build từ SHA release):
   play.google.com/console → TappyAI → App integrity → so SHA-256 upload key với số `build-aab.sh` in ra; App bundle
   explorer: vc10 chưa từng upload → Testing → **Internal testing → Create new release** → upload `app-release.aab` →
   tên `1.0.0 (10)` → ghi chú (RELEASE-PLAN §3 (d)) → **Start rollout to Internal testing** → cài trên điện thoại:
   đăng nhập, Home giống trước/sau đăng nhập, mở lại app vẫn đăng nhập, 1 lượt chat, Cài đặt có "Yêu cầu xóa tài khoản",
   nhận 1 thông báo. Đạt hết mới **Promote → Production** (app vẫn ẩn trên Play tới khi anh công khai).
8. **Sau release ổn định (cùng ngày)** — xoá `D:\TappyAI-backups\pgpass`, `pghost.txt`, `accesstrade.txt`.
   Hôm sau: Vercel → Logs → lọc `click-attributions-sweep` phải thấy 200 `ok:true` (R21).
