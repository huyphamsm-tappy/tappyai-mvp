# Bộ biến Vercel để bật bộ não ở production (02/11/2026)

Mã deploy xong thì **chưa có gì đổi**: các cờ bị khóa ở production cho đến khi anh làm hai việc trong Vercel (Project → Settings → Environment Variables, môi trường **Production**): (1) đặt `CONSULT_PRODUCTION_ALLOW` = danh sách tên được mở; (2) đặt từng cờ đó = `1`. Cờ phía máy chủ có hiệu lực ngay khi bản deploy kế tiếp nhận biến (Vercel áp biến cho lần deploy mới; sau khi đổi biến cần Redeploy). Cờ `NEXT_PUBLIC_*` được nhúng lúc build, nên cần Redeploy.
Chi tiết cơ chế: `docs/architecture/ONE-BRAIN-FREEZE-20261102.md` mục 6.5. Bộ này là bộ đã đo ở UAT (`flags-uat.json`) **trừ** các cờ chỉ để đo hoặc cần quyết định riêng.

## 1. `CONSULT_PRODUCTION_ALLOW` (một biến, các tên cách nhau bằng dấu phẩy)
```
CONSULT_ONE_BRAIN,CONSULT_FINAL_SYNTHESIS,CONSULT_SEARCH_NOW_INTENT_GATE,CONSULT_KNOWLEDGE_TURN_TOOLS,CONSULT_ABORT_ABANDONED_FIRST_PART,CONSULT_READ_PAGE_LATE,CONSULT_CAPABILITY_LEVEL,CONSULT_UNWIND_S1A,CONSULT_UNWIND_S1B,CONSULT_UNWIND_S1C,CONSULT_UNWIND_S1D,CONSULT_UNWIND_S2A,CONSULT_UNWIND_S2B,CONSULT_UNWIND_S2C,CONSULT_UNWIND_S3A,CONSULT_UNWIND_S3B,CONSULT_UNWIND_S3C,CONSULT_UNWIND_S4A,CONSULT_UNWIND_S4B,CONSULT_UNWIND_S6A,CONSULT_UNWIND_S6B,CONSULT_UNWIND_S6C
```

## 2. Các cờ đặt bằng `1` (hoặc giá trị ghi bên cạnh), Production
| Biến | Giá trị |
|---|---|
| `CONSULTATIVE_V1` | `1` |
| `CONSULT_V2` | `1` |
| `CONSULT_ONE_BRAIN` | `1` |
| `CONSULT_FINAL_SYNTHESIS` | `1` |
| `CONSULT_ANSWER_ATTRIBUTION` | `1` |
| `CONSULT_GENERAL_ASSISTANT` | `1` |
| `CONSULT_SEARCH_NOW_INTENT_GATE` | `1` |
| `CONSULT_KNOWLEDGE_TURN_TOOLS` | `1` |
| `CONSULT_ABORT_ABANDONED_FIRST_PART` | `1` |
| `CONSULT_READ_PAGE_LATE` | `1` |
| `CONSULT_CAPABILITY_LEVEL` | `2` |
| `CONSULT_LUNA_FAST` | `0` |
| `CONSULT_UNWIND_S1A` … `S1D`, `S2A` … `S2C`, `S3A` … `S3C`, `S4A`, `S4B`, `S6A` … `S6C` | `1` (mỗi biến) |
| `NEXT_PUBLIC_CONSULT_ONE_BRAIN` | `1` (cần Redeploy) |
| `NEXT_PUBLIC_TAPPY_ANSWER_V4` | `1` (cần Redeploy) |
| `CCP_REALTIME_AGODA_LITE` | `1` (giá phòng thật từ Agoda, đã dùng ở UAT) |
| `LLM_RESPONSES_PROCESS_BUDGET_USD` | **bắt buộc** cho Suy nghĩ / Tự động-suy-nghĩ; bản UAT đặt `3` (trần chi tiêu của mỗi tiến trình, USD) — anh chọn số |

## 3. KHÔNG đặt ở production
- `CONSULT_TRACE_DIAGNOSTICS`, `LEGACY_STREAM_TRACE`: chỉ để đo.
- `CONSULT_ONE_BRAIN_MEDIA`: ảnh sau câu trả lời, ghi chú trong mã là chỉ UAT localhost (tối đa 6 lần tìm ảnh mỗi lượt, tốn Serper); cần một quyết định riêng nếu muốn có ở production.
- `CONSULT_PARALLEL`, `PARALLEL_API_KEY`: Parallel là nhà xử lý dữ liệu mới. Mã **không cho** mở nó bằng `CONSULT_PRODUCTION_ALLOW`. Nghiên cứu sâu vẫn chạy với Serper khi không có Parallel (rẻ hơn, nguồn ít hơn bản đã đo). Muốn dùng: cập nhật trang `/privacy` và đồng ý dữ liệu AI trước, rồi sửa mã.
- `BENCH_*`, `CONSULT_CHAT_DOMAIN_AGREEMENT`, `CONSULT_THREAD_AWARE_ASK`: không dùng.
- `AI_USAGE_LEDGER`: chỉ đặt `1` **sau khi** anh chạy migration `20261101_ai_usage_events.sql`.

## 4. Gói bán (làm sau)
`SUBSCRIPTIONS_ENABLED` hiện không có (tắt). Khi tắt, mọi chế độ chạy cho mọi tài khoản và Nghiên cứu sâu chưa có hạn mức tháng; chưa có người dùng thật nên chưa thành vấn đề, nhưng cần xong trước chiến dịch.

## 5. Quay lại nếu có sự cố
Xóa `CONSULT_PRODUCTION_ALLOW` (hoặc chỉ gỡ `CONSULT_ONE_BRAIN` khỏi danh sách) rồi Redeploy: bộ não tắt từ bản deploy mới, chat chạy đường cũ.

## 6. Trạng thái đã đặt trên Vercel (02/11/2026)
31 biến ở mục 1–2 (trừ `CCP_REALTIME_AGODA_LITE`, cần khóa `AGODA_LITE_SITE_ID` và `AGODA_LITE_API_KEY` do chủ tự thêm) đã được lưu cho môi trường **Production**, kiểu Config, kèm `LLM_RESPONSES_PROCESS_BUDGET_USD=3`. Vercel chỉ áp biến cho bản deploy **mới**: bản này (tài liệu) tạo ra bản deploy đó. Chưa đặt: Parallel, `CONSULT_ONE_BRAIN_MEDIA`, `AI_USAGE_LEDGER`, `SUBSCRIPTIONS_ENABLED`.

### 6.1. Khóa OpenAI của production (02/11)
Lượt chat đầu tiên trên production (13:30) báo `Your API key has expired`: khóa `tappy-luna-test` của dự án OpenAI "TappyAI" được tạo 30/9 với hạn 30/10. Dòng log `tappyai_chat_mode` xuất hiện ở lượt đó, nghĩa là các cờ bộ não đã có hiệu lực. Chủ đã tạo khóa mới (không hết hạn, quyền Tất cả) và đặt vào `OPENAI_API_KEY` (Production) lúc ~13:45; bản này là bản deploy áp khóa đó. Khóa chỉ nằm trong Vercel (Sensitive), không có trong mã hay tài liệu. Khi tạo khóa OpenAI mới cho dự án, **không đặt ngày hết hạn ngắn** và ghi ngày hết hạn (nếu có) vào lịch nhắc.

### 6.2. Khóa Serper của production (02/11)
Sau khi khóa OpenAI chạy (14:07), chat trả lời bằng bộ não (`tappyai_one_brain_turn`, `gpt-6-luna`) nhưng công cụ tìm địa điểm trả về rỗng gần như ngay (`places_provider: serper` rồi `osm_fallback_used`, `no_google_result`, 0 dòng): khóa `SERPER_API_KEY` của production (thêm 13/6) bị Serper từ chối, không thấy yêu cầu nào trong nhật ký tài khoản Serper của chủ lúc đó. Chủ đã đặt khóa Serper đang dùng được vào `SERPER_API_KEY` (Production); bản này là bản deploy áp khóa đó. Khóa không có trong mã hay tài liệu.
