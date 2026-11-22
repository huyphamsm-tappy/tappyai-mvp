# Kết nối Tappy với các AI (cổng MCP): đã làm gì, mai anh làm gì (22/11/2026)

Nhãn: **ĐÃ KIỂM** = chạy test hoặc đọc mã thật; **CHƯA KIỂM** = chưa thử với AI thật; **SUY TỪ TÀI LIỆU** = em đọc tài liệu/nguồn web hôm nay, chưa thử bằng tài khoản thật.

## 1. Em đã làm xong hôm nay (trong mã, chưa deploy)
| Việc | Trạng thái |
|---|---|
| Thêm 4 AI mới vào cổng: **Cursor, Grok, DeepSeek, Meta** (cùng Claude, ChatGPT, Gemini = 7 AI). Một danh sách chung `HOST_PLATFORMS` thay cho 5 chỗ liệt kê lẻ (đăng ký client, kênh theo dõi liên kết, kho tác vụ, bảng hồ sơ, kiểu dữ liệu), cộng cột `host` của bảng `mcp_jobs` | ĐÃ KIỂM bằng test (tổng 405 test qua trong các nhóm liên quan, kiểm kiểu dữ liệu sạch) |
| Hồ sơ riêng cho từng AI mới (`src/lib/mcp/hostProfiles.ts`): ghi rõ điều đọc được và điều **chưa xác nhận**, gắn nhãn "chưa kiểm trên tài khoản thật" | SUY TỪ TÀI LIỆU |
| **Màn hình đồng ý OAuth** `/oauth/consent` (người dùng thấy AI nào xin quyền, quyền gì, bấm Cho phép/Từ chối; chưa đăng nhập thì đưa đi đăng nhập rồi quay lại; chỉ theo địa chỉ chuyển về là https, localhost hoặc `cursor://`) | ĐÃ KIỂM bằng test với Supabase giả; **CHƯA KIỂM** với máy chủ OAuth thật |
| Chữ trên màn hình đồng ý, 2 ngôn ngữ, nằm trong `src/lib/i18n/mcpConsent.ts` | ĐÃ KIỂM |
| **Lời Tappy tự giới thiệu với các AI khác** (`src/lib/mcp/tappyProfile.ts`): Tappy là ai, có gì mà AI khác không có (giá phòng Agoda hỏi trực tiếp lúc đó kèm link theo dõi, địa điểm/quán ăn/điểm tham quan Việt Nam, giá sản phẩm, lập lịch trình), khi nào nên gọi Tappy thay vì đoán; nhắc thêm trong app: tàu/xe Vexere, ưu đãi Lazada, Scam Shield, tiếng Việt. Mô tả từng công cụ cũng viết lại theo hướng đó. Danh mục công cụ lên bản `mcp-tools.v1.2` (chỉ đổi mô tả) | ĐÃ KIỂM bằng test (không nói "tốt nhất/duy nhất/đảm bảo"; "trực tiếp" chỉ dùng cho giá Agoda). **Anh cần đọc và duyệt lời này trước khi cổng đi thật** |
| **Nối công cụ khách sạn với Agoda thật**: dùng đúng bộ nối Agoda Lite mà chat đã dùng (`src/lib/ccp/tracking/mcpHotelSource.ts`), giá một đêm chưa gồm thuế phí, link theo dõi của Agoda. Chỉ chạy khi bật cờ `CCP_REALTIME_AGODA_LITE=1` và có đủ 2 khóa Agoda; thiếu ngày nhận/trả phòng thì không tìm và không bịa | ĐÃ KIỂM bằng HTTP giả; **CHƯA KIỂM** qua cổng với Agoda thật |
| Vexere (tàu/xe) và Lazada **chưa là công cụ** của cổng. Cổng chưa có công cụ tìm tàu xe; bộ nối Vexere đã có trong chat nhưng thêm công cụ mới là đổi hợp đồng nên chưa làm | Việc đề xuất tiếp theo |

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

## 2b. ĐÃ LÀM THẬT tối 22/11 trên UAT (cập nhật sau khi anh cho phép dùng Chrome; ĐÃ KIỂM bằng chuỗi thật)
Em đã chạy cả chuỗi như một AI Host thật (kịch bản `oauth-flow.cjs`, ứng dụng OAuth thử loại public + PKCE do em tạo trên UAT): authorize → màn hình đồng ý `/oauth/consent` → Cho phép → mã → token → gọi cổng.
- **OAuth Server của Supabase UAT đã bật** (Authentication → OAuth Server; đường dẫn đồng ý `/oauth/consent`). Công tắc **"Allow Dynamic OAuth Apps" CHƯA bật được** (tab Chrome không nhận bấm vì Chrome không vẽ trang lúc anh treo máy); vì thế `registration_endpoint` chưa có trong metadata, và Claude/ChatGPT (tự đăng ký client) chưa nối được. **Việc sáng mai: bật công tắc này rồi Save.**
- Máy chủ cấp quyền, màn hình đồng ý, đổi mã lấy token đều chạy đúng với Supabase thật. Cổng nhận token, `initialize` trả lời giới thiệu của Tappy, `tools/list` trả bộ công cụ với mô tả mới.
- Dữ liệu thật qua bộ nối của cổng: quán phở Hà Nội (địa chỉ, điểm Google), khách sạn Đà Lạt từ Agoda (giá một đêm khoảng 452.000–523.000đ, link theo dõi `cid=1974819`).
- **Ba phát hiện thật (và đã sửa trong mã):**
  1. Token Supabase luôn có `aud=authenticated` và `scope="openid profile"`: không gắn được vào địa chỉ của cổng và không mang được quyền riêng. Cổng cũ từ chối mọi token. Đã sửa: ràng buộc bằng **client đã đăng ký** (`MCP_OAUTH_CLIENTS`), quyền lấy từ mục đăng ký (mặc định đủ 4 quyền, có thể thu hẹp bằng `"scopes":[...]`).
  2. 🚨 **Bảo mật:** token đó cũng là phiên người dùng đầy đủ với mọi route khác của Tappy (`getRequestUser` nhận mọi token Supabase hợp lệ). Đã chặn: token có `client_id` không còn được coi là người dùng ở mọi route khác (`src/lib/auth/oauthClientToken.ts`), chỉ cổng MCP nhận. **Còn lại (do Supabase, không sửa được ở phía mình):** token này vẫn gọi được thẳng API dữ liệu của Supabase theo quyền RLS của người dùng nếu bị lộ; anh nên biết điều này trước khi mở cho người dùng thật.
  3. Màn hình đồng ý hiện "quyền không xác định: openid/profile" và lỗi "liên kết không hợp lệ" khi người dùng đã từng đồng ý (Supabase trả địa chỉ chuyển ngay ở lần gọi đầu rồi báo 400 ở lần hai). Đã sửa cả hai (hiện "biết tài khoản Tappy của bạn là ai" + danh sách việc kết nối làm được; chỉ gọi một lần mỗi yêu cầu).
- **Công cụ tìm kiếm chưa chạy được qua cổng ở máy local:** cổng bắt buộc có **kho đếm dùng chung (Redis/Upstash)** cho giới hạn tốc độ và ngân sách (mất kho thì từ chối, đúng thiết kế), mà UAT local chưa có. Trả `PROVIDER_UNAVAILABLE`. **Việc sáng mai: tạo một cơ sở dữ liệu Upstash miễn phí cho UAT (tài khoản của anh) và đặt `KV_REST_API_URL` / `KV_REST_API_TOKEN`; đặt thêm 6 giới hạn chi `MCP_POOL_*_USD` (số tạm, ví dụ ngày 5, host 3, cài đặt 2, người dùng 1, công cụ 1, mỗi yêu cầu 0,1).**
- Đã đặt trong `.env.local` (UAT, có bản sao `.env.local.bak-before-mcp`): `MCP_GATEWAY=1`, `MCP_RESOURCE_URL` và `MCP_RESOURCE_METADATA_URL` (theo địa chỉ hầm **hôm nay**, sẽ hỏng khi hầm đổi), `MCP_AUTH_SERVER_URL`, `MCP_OAUTH_CLIENTS` (ứng dụng thử gắn vào host `cursor`), `MCP_ATTRIBUTION_SECRET`. Ứng dụng OAuth thử tên "Tappy local OAuth test" nằm ở Supabase UAT → Authentication → OAuth Apps; xóa được khi không cần.

## 3. Việc sáng mai (anh ngồi máy; em hướng dẫn từng bước)
Thứ tự có phụ thuộc. Làm trên **UAT** trước (Supabase `zdapr...`), không đụng production.
**Các bước 1–3 dưới đây đã làm xong một phần tối 22/11 (xem mục 2b); phần còn lại: công tắc đăng ký động, kho Upstash, giới hạn chi, rồi nối AI thật.**

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

## 4b. Kiểm giả thuyết "người chấm Opus thiên vị Haiku/Sonnet" (22/11/2026, ĐÃ KIỂM)
Chấm lại đúng các báo cáo nghiên cứu sâu cũ (3 câu 801–803, cùng thang điểm, cùng thứ tự ẩn A/B/C, hai thứ tự mỗi câu) bằng người chấm **khác họ**: OpenAI `gpt-6-luna` (script `judge-research-luna.mjs` ở thư mục đo, kết quả `eval-runs/judge-research-c-luna.json`).
| Người chấm | Tappy | Haiku | Sonnet | Hạng nhất |
|---|---|---|---|---|
| Opus 5.5 (cũ) | 3,69 | 3,97 | 4,72 | Sonnet 6/6 |
| gpt-6-luna (mới) | 3,39 | 3,83 | 4,36 | Sonnet 6/6 |
Thứ hạng giống nhau ở cả 6 lượt: Sonnet > Haiku > Tappy. Khoảng cách với Haiku không thu hẹp (0,28 → 0,44), với Sonnet gần như giữ nguyên (1,03 → 0,97). Chỗ thiếu ổn định ở cả hai người chấm là **độ đầy đủ** (Tappy 3,33; Haiku 4,33; Sonnet 4,83–5). Giới hạn: chỉ 3 câu, 6 lượt chấm, một người chấm ngoài họ, báo cáo chạy ngày 19/11. Vì vậy lời giới thiệu **không** nói "sánh ngang"; muốn nói thì phải sửa độ đầy đủ rồi đo lại với ít nhất 10 câu và hai người chấm khác họ.

## 5. Rủi ro đã thấy (để anh biết)
- Hồ sơ của 4 AI mới dựa trên tìm kiếm web hôm nay (có cả nguồn thứ ba); sai khác với thực tế là có thể. Mỗi hồ sơ ghi sẵn mục "phải kiểm trước khi tuyên bố".
- Màn hình đồng ý chỉ cho chuyển về https, localhost hoặc `cursor://`; nếu một AI dùng kiểu địa chỉ khác (ví dụ ứng dụng di động riêng) thì sẽ bị từ chối và phải thêm có kiểm soát.
- Mỗi AI mới thêm vào danh sách là một quyền gọi vào Tappy (đọc dữ liệu địa điểm, tốn chi phí tìm kiếm): hạn mức chi tiêu theo AI (`MCP_POOL_*`) đã có sẵn từ trước và áp cho cả bảy.
