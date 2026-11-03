# Mọi chỗ gọi AI/LLM NGOÀI chat chính (02/10/2026, nhánh final/scam)

Chỉ LIỆT KÊ để chủ sản phẩm quyết định. Mục 1–3 là hai việc chủ đã yêu cầu tắt (đã tắt, giữ mã sau cờ). Các mục còn lại **không bị cắt**.

**Cách ước chi phí (ƯỚC, chưa đo):** bảng giá mô hình mặc định `gpt-6-luna` trong mã (`src/lib/ai/llm/providers/openai.ts`): vào 0,10 USD / 1 triệu token, ra 0,50 USD / 1 triệu token (có cache vào 0,01). Số token là giả định theo prompt đọc trong mã, không phải số đo. Với giá này một lệnh gọi nhỏ chỉ cỡ 0,0001–0,0006 USD; chi phí đáng kể chỉ khi nhân với số người dùng/cron. Mọi vai trò `fast`/`smart`/`vision` đều trỏ cùng model trừ khi env `LLM_FAST_MODEL` / `LLM_SMART_MODEL` / `LLM_VISION_MODEL` đặt khác (tôi không đọc env Preview/Prod).

| # | Chỗ gọi | File:dòng | Khi nào chạy | Vai trò / giới hạn | Ước chi phí mỗi lần | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | **ScamShield — phân tích tin nhắn** | `src/lib/scam-shield/message/ai/analyzer.ts:86` (gọi từ `message/index.ts`) | Người dùng bấm «Phân tích ngay» với tin có chữ (tầng 1–2) | `fast`/`smart`; trừ 1 «câu hỏi AI» chung; burst 6/phút/IP | vào ~1.500 + ra ~350 token ≈ **0,0003 USD** + 1 lượt hạn mức | **TẮT** (cờ `SCAM_SHIELD_AI_ENABLED`, mặc định off). Không còn gọi, không trừ hạn mức |
| 2 | **ScamShield — đọc chữ từ ảnh chụp tin nhắn (OCR vision)** | `analyzer.ts:112` | Tải ảnh chụp ở tab tin nhắn | `vision`; ảnh ≤ 5 MB | ≈ 0,0002–0,0005 USD | **TẮT** cùng cờ; server trả `400 screenshot_unavailable`; web ẩn nút tải ảnh (cờ web `NEXT_PUBLIC_SCAM_SHIELD_AI_ENABLED`) |
| 3 | **Bài viết mới — dán link YouTube: AI tự viết mô tả + hashtag** | `src/app/(app)/reviews/new/page.tsx` (`triggerUrlAI`) → `POST /api/explore/process` → `src/lib/explore/contentProcessor.ts:81` | Mỗi lần dán/sửa link YouTube đã hợp lệ (sau debounce) | `fast`, ≤ 200 token ra; 20 lần/phút/user; chỉ tài khoản thật 18+ | ≈ **0,0001 USD** | **TẮT** (client `NEXT_PUBLIC_POST_LINK_AI_ENABLED`, server `EXPLORE_LINK_AI_ENABLED`, mặc định off; server từ chối mọi yêu cầu có `title`). Tiêu đề/ảnh bìa vẫn lấy từ oEmbed; mô tả để trống; hashtag người dùng tự gõ (lỗi «##» đã sửa) |
| 4 | Bài viết mới — tải VIDEO/ẢNH: AI viết chú thích + hashtag + khu vực | `page.tsx` (bước «ai-process») → `POST /api/explore/process` → `contentProcessor.ts:61/81/99` | Sau khi tải video lên xong (không chặn đăng) | `fast`; nếu không có chú thích/tiêu đề thì dùng **vision** trên ảnh bìa; 20/phút/user | caption có sẵn ≈ 0,0001; vision ≈ 0,0002–0,0004 | **CÒN** (chưa cắt; chỉ sửa «##» cho hashtag) |
| 5 | Smart Tools — Dịch (`/translate`) | `src/app/api/translate/route.ts:48` | Bấm dịch; không cần tài khoản | `smart`, ≤ 1024 token ra, văn bản ≤ 2000 ký tự; **30/ngày/IP** | ≤ ~0,0006 USD | CÒN |
| 6 | Smart Tools — Quét chữ từ ảnh (`/scan`) | `src/app/api/scan/route.ts:39` | Tải ảnh lên trang quét; không cần tài khoản | **vision**, ≤ 2048 token ra; **20/ngày/IP** | ≈ 0,0003–0,001 USD | CÒN (đường vision đắt nhất cho khách) |
| 7 | Smart Tools — Viết content (`/viet-content`) | `src/app/api/viet-content/route.ts:81` | Bấm tạo caption | `smart`, ≤ 900 token ra; **30/ngày/IP** | ≈ 0,0005 USD | CÒN |
| 8 | Nhóm ăn uống — gợi ý địa điểm cho nhóm | `src/app/api/group/[id]/suggest/route.ts:49` | Chủ nhóm bấm «gợi ý» | `smart`, ≤ 1024 token ra; chỉ chủ nhóm | ≈ 0,0006 USD | CÒN |
| 9 | Bộ nhớ «Tappy biết gì về bạn» — trích xuất | `src/lib/memory/memoryService.ts:263` (gọi từ `/api/chat/route.ts:2875`, `/api/memory` POST) | Sau lượt chat khi cổng bộ nhớ cho phép; hoặc bấm trong trang hồ sơ | `fast`, ≤ 500 token ra | ≈ 0,00015 USD / lượt | CÒN (nằm trong lượt chat nhưng là lệnh gọi riêng) |
| 10 | Cron — thông báo deal hằng ngày | `src/app/api/cron/deal-notifications/route.ts:49` | 00:30 UTC mỗi ngày, **1 lệnh/người dùng đã đăng ký push** | `fast`, ≤ 200 | ≈ 0,0001 × số người | CÒN |
| 11 | Cron — bản tin buổi sáng | `src/app/api/cron/morning-brief/route.ts:150` | 01:00 UTC mỗi ngày, 1 lệnh/người dùng | `fast`, ≤ 150 | ≈ 0,0001 × số người | CÒN |
| 12 | Cron — tổng kết tuần | `src/app/api/cron/weekly-recap/route.ts:101` | Chủ nhật 13:00 UTC, 1 lệnh/người dùng | `fast`, ≤ 150 | ≈ 0,0001 × số người | CÒN |
| 13 | Cron — theo dõi giá | `src/app/api/cron/price-check/route.ts:95` | 06:00 UTC mỗi ngày, 1 lệnh/mục đang theo dõi (kèm 1 lượt tìm kiếm Serper) | `fast`, ≤ 80 | ≈ 0,00008 USD + Serper | CÒN |
| 14 | Cổng an toàn nội dung — quan sát ảnh bìa bài (vision) | `src/lib/safety/evidence/modalities.ts:235` (qua `publishDecision`) | Khi tạo/sửa bài **nếu** `CONTENT_SAFETY_GATE_ENABLED=true` (nếu không thì không chạy) | **vision**, ≤ 300 | ≈ 0,0002–0,0004 USD / bài | Phụ thuộc cờ (tôi không đọc giá trị env Preview/Prod: **chưa xác minh** đang bật hay không) |

Không phải LLM (để khỏi nhầm): kiểm link/QR/danh sách chặn của ScamShield, nhận diện 25 tình huống, Serper/Places/thời tiết, xếp hạng đề xuất.

## Tiền tiết kiệm được đợt này
- **Phân tích tin nhắn ScamShield:** ≈ 0,0003 USD + 1 lượt hạn mức AI mỗi lần kiểm tra (ước lượng theo giá, **chưa đo** — không có số liệu dùng thật trong phiên này; nhật ký máy chủ có `usage` mỗi lượt khi bật AI nên có thể đo lại nếu bật cờ thử).
- **Dán link YouTube:** ≈ 0,0001 USD mỗi lần dán hợp lệ (≤ 1 lần/10 giây nhờ debounce).
- Với giá Luna hiện tại số tiền tuyệt đối nhỏ; lợi ích chính là **loại bỏ rủi ro pháp lý «An toàn»**, loại việc tiêu hạn mức AI chung của người dùng cho một kiểm tra miễn phí, và loại việc gửi nội dung tin nhắn tới OpenAI.

## Cờ mới (đều mặc định TẮT; không cần đặt gì để giữ trạng thái hiện tại)
| Env | Phạm vi | Tác dụng khi `true` |
|---|---|---|
| `SCAM_SHIELD_AI_ENABLED` | server | ScamShield gọi lại mô hình cho tin nhắn + đọc ảnh chụp (đường cũ, trừ hạn mức AI) |
| `NEXT_PUBLIC_SCAM_SHIELD_AI_ENABLED` | build web | Hiện lại nút «Tải ảnh chụp màn hình» ở tab tin nhắn (cần cờ server cùng bật) |
| `NEXT_PUBLIC_POST_LINK_AI_ENABLED` | build web | Trang «Bài viết mới» dán link YouTube lại xin AI viết mô tả/hashtag |
| `EXPLORE_LINK_AI_ENABLED` | server | `/api/explore/process` lại phục vụ yêu cầu có `title` (luồng link) |
