# Kết nối Tappy với các AI (cổng MCP): đã làm gì, mai anh làm gì (22/11/2026)

Nhãn: **ĐÃ KIỂM** = chạy test hoặc đọc mã thật; **CHƯA KIỂM** = chưa thử với AI thật; **SUY TỪ TÀI LIỆU** = em đọc tài liệu/nguồn web hôm nay, chưa thử bằng tài khoản thật.

## 1. Em đã làm xong hôm nay (trong mã, chưa deploy)
| Việc | Trạng thái |
|---|---|
| Thêm 4 AI mới vào cổng: **Cursor, Grok, DeepSeek, Meta** (cùng Claude, ChatGPT, Gemini = 7 AI). Một danh sách chung `HOST_PLATFORMS` thay cho 5 chỗ liệt kê lẻ (đăng ký client, kênh theo dõi liên kết, kho tác vụ, bảng hồ sơ, kiểu dữ liệu), cộng cột `host` của bảng `mcp_jobs` | ĐÃ KIỂM bằng test (tổng 405 test qua trong các nhóm liên quan, kiểm kiểu dữ liệu sạch) |
| Hồ sơ riêng cho từng AI mới (`src/lib/mcp/hostProfiles.ts`): ghi rõ điều đọc được và điều **chưa xác nhận**, gắn nhãn "chưa kiểm trên tài khoản thật" | SUY TỪ TÀI LIỆU |
| **Màn hình đồng ý OAuth** `/oauth/consent` (người dùng thấy AI nào xin quyền, quyền gì, bấm Cho phép/Từ chối; chưa đăng nhập thì đưa đi đăng nhập rồi quay lại; chỉ theo địa chỉ chuyển về là https, localhost hoặc `cursor://`) | ĐÃ KIỂM bằng test với Supabase giả; **CHƯA KIỂM** với máy chủ OAuth thật |
| Chữ trên màn hình đồng ý, 2 ngôn ngữ, nằm trong `src/lib/i18n/mcpConsent.ts` | ĐÃ KIỂM |

## 2. Điều em đọc được về từng AI (SUY TỪ TÀI LIỆU, chưa thử thật)
| AI | Có nối được không | Ghi chú quan trọng |
|---|---|---|
| **Claude** | Có (kết nối từ xa, Streamable HTTP, OAuth) | Cần địa chỉ công khai; thử riêng từng nơi dùng (web, desktop, di động) |
| **ChatGPT** | Có, tùy gói (Pro hạn chế, Business/Enterprise đầy đủ), chỉ trên web | Công cụ không chỉ-đọc cần kiểm riêng |
| **Gemini** | Ứng dụng: tài liệu cũ ghi chỉ Mỹ, 18+, tiếng Anh. API: có | **Không được nói là dùng được ở Việt Nam** khi chưa kiểm |
| **Cursor** | Có: máy chủ từ xa, Streamable HTTP, OAuth do Cursor lo, cấu hình trong `mcp.json` | Có hai địa chỉ chuyển hướng OAuth (app máy tính và web agents); diễn đàn báo lỗi khi địa chỉ tài nguyên có dấu `/` cuối: phải thử |
| **Grok (xAI)** | Có **qua API** (nhà phát triển thêm `{type: mcp, server_url}`); **không** phải kết nối cài sẵn cho người dùng | Chưa xác nhận app Grok cho thêm máy chủ MCP |
| **DeepSeek** | **Chưa tìm thấy tài liệu chính thức** nói app DeepSeek nhận kết nối MCP từ xa | Chỉ có công cụ dành cho lập trình viên (nguồn thứ ba). Thường dùng DeepSeek qua Cursor/Claude Code, lúc đó tính theo hồ sơ của ứng dụng đó. **Đừng ghi là hỗ trợ DeepSeek** |
| **Meta** | **Chưa xác nhận.** Nguồn thứ ba nói trợ lý Muse nối được máy chủ MCP tùy chỉnh; chưa đọc tài liệu Meta | Meta có máy chủ MCP riêng (Facebook, Instagram, WhatsApp, Ads) nhưng đó là Meta làm máy chủ, không phải nơi dùng máy chủ của mình. Llama API chưa có xác nhận |

Kết luận thật: **chắc chắn nối được trong thực tế**: Claude, ChatGPT (tùy gói), Cursor, Grok (qua API). **Chưa chắc**: Gemini ở Việt Nam, DeepSeek, Meta. Em đã đưa cả bảy vào mã để sẵn sàng, nhưng sẽ không tuyên bố hỗ trợ khi chưa thử thật.

## 3. Việc sáng mai (anh ngồi máy; em hướng dẫn từng bước)
Thứ tự có phụ thuộc. Làm trên **UAT** trước (Supabase `zdapr...`), không đụng production.

| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| 1 | Bật **OAuth Server** của Supabase UAT: Authentication → OAuth Server, bật; đặt đường dẫn đồng ý là `/oauth/consent`; bật cho phép đăng ký client động nếu có | Anh (em chỉ chỗ bấm, mở sẵn trang) | Cần anh đăng nhập Supabase UAT. Chưa biết giao diện có đủ tùy chọn, **CHƯA KIỂM** |
| 2 | Đặt biến môi trường trong `.env.local` (UAT) cho cổng: `MCP_GATEWAY=1`, `MCP_RESOURCE_URL` (địa chỉ https công khai của `/api/mcp`), `MCP_AUTH_SERVER_URL` (địa chỉ máy chủ OAuth Supabase), `MCP_OAUTH_CLIENTS` (danh sách client_id → AI, ví dụ `{"<id>": {"host": "cursor"}}`), `MCP_ATTRIBUTION_SECRET` (chuỗi bí mật ngẫu nhiên, em tạo, anh không cần nhập) | Em chuẩn bị tệp lệnh như lần SePay; anh chạy | `MCP_GATEWAY` bị khóa tắt ở production; chỉ chạy ở UAT/local |
| 3 | Mở đường hầm cloudflared cho `/api/mcp` (địa chỉ https công khai) | Em (như hôm nay) | Máy phải bật, địa chỉ đổi mỗi lần |
| 4 | Thử nối với **Cursor trước** (dễ nhất, chỉ cần dòng cấu hình `mcp.json`, anh là người dùng Cursor): đăng ký client, đi qua màn hình đồng ý, gọi thử `search_places` | Anh + em | Kiểm hai địa chỉ chuyển hướng và địa chỉ tài nguyên không có dấu `/` cuối |
| 5 | Nối **Claude** (kết nối tùy chỉnh, cần gói được hỗ trợ), rồi **ChatGPT** (tùy gói, chỉ web) | Anh (tài khoản của anh), em cầm tay | Mỗi bên đăng ký một client riêng, ghi vào `MCP_OAUTH_CLIENTS` |
| 6 | **Grok:** thử gọi API xAI với `server_url` trỏ vào cổng, kèm token | Anh cung cấp khóa xAI (anh tự nhập), em viết lệnh thử | Cần khóa xAI; chỉ làm nếu anh có |
| 7 | DeepSeek, Meta, Gemini: **chỉ ghi nhận đã đọc tài liệu**, chưa thử | — | Chưa có chỗ cắm thử được; làm khi anh có tài khoản/bề mặt phù hợp |
| 8 | Khách sạn (Agoda): nối khi có khóa và client; hiện để trống | Chờ khóa Agoda | Không bịa dữ liệu |
| 9 | Tác vụ lập lịch hành trình dài (`mcp_jobs`): áp bản `20261121_mcp_jobs` lên UAT, bật `MCP_JOBS_ENABLED=1` | Em (áp migration UAT, hỏi anh trước) | Bản này đang bị hoãn ở production; **tệp chưa từng áp ở đâu**, nay đã sửa cột `host` cho đủ 7 AI |

## 4. Điều chưa thể làm hôm nay và vì sao
- **Bật OAuth Server** và **đăng ký client ở từng AI** cần tài khoản đăng nhập của anh ở Supabase UAT, Claude, ChatGPT, Cursor, xAI; em không tự làm thay.
- **Không thử được với AI thật** khi chưa có OAuth Server và địa chỉ công khai.
- **Production:** cờ cổng bị khóa tắt và chưa có cấu hình nào; đừng bật khi chưa thử xong trên UAT.

## 5. Rủi ro đã thấy (để anh biết)
- Hồ sơ của 4 AI mới dựa trên tìm kiếm web hôm nay (có cả nguồn thứ ba); sai khác với thực tế là có thể. Mỗi hồ sơ ghi sẵn mục "phải kiểm trước khi tuyên bố".
- Màn hình đồng ý chỉ cho chuyển về https, localhost hoặc `cursor://`; nếu một AI dùng kiểu địa chỉ khác (ví dụ ứng dụng di động riêng) thì sẽ bị từ chối và phải thêm có kiểm soát.
- Mỗi AI mới thêm vào danh sách là một quyền gọi vào Tappy (đọc dữ liệu địa điểm, tốn chi phí tìm kiếm): hạn mức chi tiêu theo AI (`MCP_POOL_*`) đã có sẵn từ trước và áp cho cả bảy.
