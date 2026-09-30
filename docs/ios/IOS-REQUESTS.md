# iOS — yêu cầu chờ làm (từ web / owner)

Sổ việc cho iOS khi phiên iOS bắt đầu lại (iOS hiện chưa build được trên máy này — không có macOS). Mỗi dòng: việc,
nguồn đặc tả, ca kiểm. Web là chuẩn (00_README §1); Android là bản tham chiếu đã chạy.

| # | Việc | Đặc tả | Kiểm |
|---|---|---|---|
| I-1 | **Thẻ hỏi nhanh `[TAPPY_ASK]` thiết kế mới (owner 30/09)** — mascot kính lúp + tiêu đề/dòng phụ theo mảng; câu đánh số 1/2/3 + dòng phụ; câu LOẠI = ô có ảnh, **chọn nhiều**; câu ai đi / khi nào / ngân sách / khác = ô icon, chọn một; ô «Hoặc nói thêm ý khác…» có nút gửi; nút «Tìm cho tôi» luôn bật (không chọn gì → gửi đúng `Tìm cho tôi`); sau gửi khoá thẻ. Nền tối cả hai theme. **Server KHÔNG đổi; tin gửi đi KHÔNG đổi dạng** (`A, B · C · D`). Ảnh ô qua manifest `GET /api/plan-images/manifest` (R22), thiếu ảnh → ảnh giữ chỗ gradient theo mảng + icon. Theo Native Design Principle: bố cục/hành vi giống; control dùng SwiftUI gốc (icon SF Symbols tương đương bảng lucide). | `docs/design/ask-card/README.md` §0–§5 (R23 + R23.1); mockup `docs/design/ask-card/ask-card-mockup.png`; mascot `docs/design/ask-card/tappy-mascot-search.png`; bảng chuẩn web `src/lib/structuredContent/askCardModel.ts` | chép các ca của `src/lib/structuredContent/askCardModel.test.ts` (câu hỏi thật router gửi cho 5 mảng) + `src/components/chat/AskCard.test.tsx` (chọn nhiều / chọn một / gửi 1 lần / gửi rỗng) sang XCTest; ảnh chụp 5 mảng cạnh mockup |
