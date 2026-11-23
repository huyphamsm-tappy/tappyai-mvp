# Đóng băng web 23/11/2026 (tag `web-freeze-20261123`)

Nhánh `feat/brain-r13-p1`, cây `D:\TappyAI-wt\wt-integration`. CHƯA push, CHƯA deploy, production chưa đụng. Thay cho mốc `web-freeze-20261121` (mốc cũ giữ nguyên).

## Có gì mới từ mốc 21/11
- **SePay**: luồng tự động đã chạy thật trên UAT (23/11/2026): tạo đơn MoMo 25.000đ → chuyển khoản qua VietQR → SePay tự gọi webhook (nhật ký SePay: giao dịch #101881068, 200 OK, chữ ký HMAC hợp lệ) → web cấp gói đến 30/11/2026. Webhook chấp nhận khớp theo số tài khoản hoặc tài khoản ảo (`96247HUYPHAM1985`). CHƯA kiểm: thư xác nhận, bản ghi DB, production.
- **Cổng MCP (connector cho AI khác)**: `/api/mcp`, OAuth 2.1 qua Supabase OAuth Server, duyệt client theo địa chỉ chuyển hướng, màn đồng ý, chặn token Host trên mọi route khác. Chạy thật với Claude.ai (đường hầm tạm), OpenAI Playground/API, Claude Haiku API: 5 công cụ tìm kiếm ra dữ liệu thật (giá Agoda, quán ăn, địa điểm, mua sắm). Sửa lỗi toạ độ 0,0 (tên thành phố Việt Nam được ưu tiên).
- **Nội dung giới thiệu** đã duyệt: `docs/connector/` (App Directory, About page, hồ sơ nộp Anthropic nháp, checklist đưa MCP lên production). Đoạn model đọc trong `src/lib/mcp/tappyProfile.ts` trung lập, không giá/đối thủ.
- Logo `serverInfo.icons` đã gắn, nhưng Claude.ai chưa hiện cho connector tuỳ chỉnh.

## Kiểm tra trước khi đóng băng
- Toàn bộ test app: 28.234 qua; 1 test (`vendorCacheRule`) hết thời gian 5 giây khi chạy song song, chạy riêng thì qua (chập chờn do tải). `tsc` sạch; 17 luật kiến trúc qua.
- `next build` KHÔNG chạy lại ở mốc này (lần gần nhất ở mốc 21/11).

## Đã dọn
Đường hầm, máy chủ UAT, 6 app OAuth test trên Supabase UAT, connector "Tappy" trên Claude.ai, mục `tappy-uat` của Claude Code, mã QR và link đăng nhập tạm, thư mục scratch tải về.
Còn lại có chủ ý: webhook SePay UAT (`#74968`) vẫn trỏ vào một đường hầm đã chết — đổi về `https://www.tappyai.com/api/payments/sepay` khi lên production; `.env.local` UAT còn `MCP_*` trỏ đường hầm cũ (vô hại).

## Việc sau deploy (anh đã chốt thứ tự)
1. Deploy production (kế hoạch: `KE-HOACH-MAI-UAT-SEPAY-20261122.md`, `KE-HOACH-AP-MIGRATION-PRODUCTION-20261122.md`).
2. Sau đó kết nối Claude và các AI khác, nộp Anthropic: `docs/connector/MCP-PRODUCTION-READINESS-CHECKLIST.md` (cần anh chốt D1–D5) và `ANTHROPIC-DIRECTORY-SUBMISSION-DOSSIER.md`.
3. ChatGPT app cần gói Plus; Claude Code cần anh chạy `/mcp`.
4. Việc còn mở khác: duyệt lời giới thiệu, đưa copy About/Pricing lên web (cần dịch tiếng Việt vào từ điển i18n), thêm công cụ xe/tàu Vexere cho connector, sửa chậm "nghiên cứu sâu" (hoãn).
