# Rà soát mã nguồn (Source Audit) cho Remote MCP Gateway — 11/11/2026

**Phạm vi:** chỉ đọc. Đối chiếu mã hiện có với `TAPPYAI_MULTI_AI_CONNECTORS_ARCHITECTURE_v2.1` và R13 mục 25 / 10.7 / 13.2 / 14.4 / 17.8 / ADR-CONN-001..022.
**Chủ sở hữu đã cho phép xây Gateway thật ngày 11/11/2026** (R13 yêu cầu quyền rõ ràng + audit trước; tài liệu này là phần audit).
**Không gọi API trả phí, không đọc giá trị `.env`, không sửa mã khi viết tài liệu này.**

## 0. Nhãn và cách đọc

- **VERIFIED** = đã đọc mã tại đường dẫn nêu, hoặc chạy lệnh đọc và thấy kết quả.
- **INFERRED** = suy ra từ mã đã đọc, chưa chạy/chưa thấy trực tiếp.
- **UNVERIFIED** = chưa kiểm được (cần môi trường, tài khoản, tài liệu chính thức mới nhất, hoặc đo thật).
- Quyết định theo từ vựng R13: **REUSE** (dùng nguyên) · **EXTEND** (thêm vào chỗ có sẵn) · **ADAPTER** (bọc mỏng quanh thứ có sẵn) · **NEW** (chưa có, phải xây).
- Mức bằng chứng theo connector doc §22.1: IMPLEMENTED / TESTED / VERIFIED / PRODUCTION VERIFIED. Không mục nào dưới đây đạt PRODUCTION VERIFIED cho MCP — chưa có gì của MCP chạy ở production.

## 1. Kiểm kê cây mã

| Mục | Giá trị | Nhãn |
|---|---|---|
| Worktree | `D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/pensive-neumann-90143f` (ổ D) | VERIFIED |
| Nhánh / HEAD | `claude/mcp-gateway-p0-6c5723` / `7934d2a` (cắt từ `feat/brain-r13-p1`, chưa đẩy lên đâu) | VERIFIED |
| `git status --short` lúc bắt đầu | sạch | VERIFIED |
| `node_modules` | worktree không có sẵn; để chạy test em tạo một junction trỏ tới `D:/TappyAI-wt/wt-integration/node_modules` (cùng `package-lock.json`, so md5 trùng). `node_modules` bị `.gitignore`, không vào commit | VERIFIED |
| Cây khác (production, Android, iOS, Merge Guard) | không đụng | VERIFIED |

## 2. Bản đồ phát hiện

| # | Hạng mục | Hiện có | Quyết định | Nhãn |
|---|---|---|---|---|
| A | SDK MCP | Không có `@modelcontextprotocol/sdk` trong `package.json` lẫn `node_modules` | NEW (xem mục 3) | VERIFIED |
| B | Hợp đồng connector | `src/lib/mcp/connectorContract.ts` (+test, commit `7500587`): 6 tool, `admitToolCall`, `connectorLocation`, `shapeResult`, `spendPoolKeys`. Là hàm thuần, **không có cổng/endpoint/OAuth** | REUSE (nền của skeleton) | VERIFIED |
| C | Cổng vào Streamable HTTP | Không có route MCP. Route chat `maxDuration = 300` (chat/route.ts:210), cron `60` | NEW (route mỏng) | VERIFIED |
| D | OAuth / danh tính | Chỉ có `getRequestUser` (cookie Supabase hoặc `Bearer <supabase-jwt>` kiểm bằng `auth.getUser(token)`). `auth-js` cài sẵn có kiểu `AuthOAuthServerApi` (`supabase.auth.oauth`) | ADAPTER (xem mục 4) | VERIFIED có kiểu; **UNVERIFIED** dự án Supabase đã bật OAuth server chưa |
| E | Dịch vụ cho tool places / restaurants / attractions | `searchPlaces()` — `src/lib/ai/tools/food.ts:1100` (query, location, type, lang, locationBias, budget, opts); có cache 30 phút, single-flight, `PlacesBudget`; gọi Serper (trả phí) | ADAPTER | VERIFIED |
| F | Dịch vụ cho tool shopping | `searchProducts()` — `src/lib/ai/tools/shopping.ts:263` (query, lang, opts). Lớp cắt/xếp hạng/loại hàng nằm **trong `chat/route.ts:2961`** (không import được) | ADAPTER cho phần lấy dữ liệu; EXTEND (tách lớp lọc khỏi route) cho phần còn lại | VERIFIED |
| G | Dịch vụ cho tool hotels | `getHotelPrices()` — `src/lib/ai/tools/travel.ts:441` (location, checkIn, checkOut, maxBudget, lang). Lớp bọc (ngân sách Serper, xếp hạng) nằm trong `chat/route.ts:3191` | ADAPTER + EXTEND như F | VERIFIED |
| H | Dịch vụ cho `create_itinerary` | **Không có dịch vụ độc lập.** `get_trip_data` ghép hotel + attraction + food nhưng nằm trong `src/lib/ai/agent/index.ts:176` dính chặt vào runtime chat; phần soạn lịch trình do Luna (LLM). R13 cấm gọi Writer nội bộ theo mặc định | NEW (thành phần ghép ứng viên, không có prose) | VERIFIED |
| I | Market Capability Gate | `src/lib/market/marketGate.ts`: `evaluateGate`, `DEFAULT_REGISTRY` (vn, 6 vertical). Thuần; **chưa nối vào route nào** (tự ghi trong đầu tệp) | REUSE | VERIFIED |
| J | Context Resolver | Quy tắc vị trí nằm ở `connectorContract.connectorLocation` (explicit > last-known được phép > home market > none; IP không phải đầu vào). Không có "Global Context Resolver" dùng chung cho web | REUSE (đã đủ cho MCP) | VERIFIED |
| K | FinOps — chặn chi phí theo tài khoản | `src/lib/ai/cost/costGate.ts`: `reserveTurnCost` → `settle` / `release`, INCRBY nguyên tử trên `incrDailyCounter` (Upstash), **fail-closed** khi store hỏng, cờ `AI_COST_GATE` khóa ở production | EXTEND (cùng cơ chế, khóa/khóa-tên khác) | VERIFIED |
| L | FinOps — `spendGate.ts` | Là cổng **đo benchmark** (`BENCH_SPEND_GATE`, trần cứng 0,10 / 0,65 USD, gắn qua `AsyncLocalStorage`). **Không phải** hồ ngân sách runtime. Connector doc đoán nó là "Spend Gate" — đoán đó sai | KHÔNG dùng cho MCP | VERIFIED |
| M | `BudgetReservationStore` (R13 13.2) | **Không tồn tại** trong mã (grep toàn `src`: 0 kết quả). Cơ chế đặt trước hiện có là `costGate` + `incrDailyCounter` | NEW nhỏ trên nền K (xem mục 6) | VERIFIED |
| N | Trần Serper toàn cục | `SERPER_DAILY_CREDIT_CEILING` (mặc định 15 000/ngày VN) trong `serperClient.ts`, dùng chung mọi kênh | REUSE (là lớp bảo vệ "provider/global" mà R13 yêu cầu vẫn áp lên MCP) | VERIFIED |
| O | Giới hạn tần suất phân tán | `distributedRateLimit` (cửa sổ trượt Upstash, **fail-closed**, khóa có tiền tố môi trường `production:`/`preview:`/`local:`), `kvCounter.incrDailyCounter` | REUSE | VERIFIED |
| P | Gói/quyền lợi | `plans/tiers.ts` (`tierOf`: free/pro/promax), `plans/entitlement.ts` (`getEntitlement(supabase, user)` đọc `subscriptions` theo RLS). Không có "UserPlanQuota" tên đó; quota hạn mức báo cáo nằm ở `tiers.ts` | REUSE | VERIFIED |
| Q | Hàng đợi / worker ASYNC | **Không có hàng đợi bền.** Upstash chỉ dùng làm bộ đếm. `cron/outbox-drain` chạy **mỗi ngày một lần** (có chú thích tự nói không phải gần-thời-gian-thực). Không có bảng job | NEW (chọn công nghệ = quyết định của chủ) | VERIFIED |
| R | Chống cào dữ liệu (spatial/temporal) | Không có. Duy nhất `rateLimit` theo IP/khóa | NEW | VERIFIED |
| S | Định hình phản hồi | `connectorContract.shapeResult` (allowlist trường, Top-K, trần byte). Lớp làm sạch chung: `ai/security/outputSanitizer.ts`, `toolResultFence.ts` | REUSE + ADAPTER (ánh xạ dòng kết quả → DTO) | VERIFIED |
| T | Gán nguồn / link ngắn | `/go/at` + `ccp/tracking/clickLink.ts` chỉ cho **một** loại: deep link ACCESSTRADE đã ký, ghi `commerce_click_attributions`. Chưa có `/go/<id>?ch=claude_mcp`; nhận dạng giao dịch được tách (identity niêm phong trong link, `openIdentity`) | EXTEND (sau, không thuộc skeleton) | VERIFIED |
| U | Telemetry | Log JSON `tappyai_*` có sẵn; sổ chi phí ledger không có cột kênh/connector | EXTEND | INFERRED |
| V | TVI | `src/lib/tvi/`: `tviStore.ts` chỉ **ghi** (stage/promote/attach/retire qua RPC), `evidenceGate.ts`. Đường **đọc** TVI cho bên ngoài chưa có; `captureTviFromPlaces` chỉ chạy khi `TVI_CAPTURE=1` | DEFER (skeleton không lộ TVI) | VERIFIED |
| W | Cờ & khóa production | `lockedInProduction(env, name)` trong `config/consultFlags.ts:76`; mẫu cờ `xxxOn(env)` ở `ai/research/deepResearchState.ts` ("đúng '1' VÀ không bị khóa") | REUSE | VERIFIED |
| X | Cổng kiến trúc | `scripts/architecture/check.mjs` (+ `businessDataBoundary.test.ts`): cấm tạo client service-role ngoài `src/lib/supabase/admin.ts`, cấm kiến thức nhà cung cấp LLM ngoài lớp `ai/llm` | REUSE — skeleton phải qua cổng này | VERIFIED |
| Y | Đại lý Agoda / Vexere | `commerce.ts`, `commerceRailAgoda.test.ts`, `consultative/leanConsultPrompt.ts` có nhắc Agoda; **khóa API chưa có** (chủ sẽ đưa 12/11) | UNWIRED theo yêu cầu | VERIFIED có tham chiếu; khóa UNVERIFIED |

## 3. SDK MCP và giao thức

- **VERIFIED:** repo không có SDK MCP. Phụ thuộc liên quan hiện có: `next 14.2.35`, `ai 4.3.19`, `zod 3.25.76`, `@supabase/supabase-js 2.108.2`.
- **INFERRED:** Streamable HTTP ở chế độ *không trạng thái* (mỗi `POST` là một JSON-RPC request, trả JSON thường, không SSE, không session) chạy được trong route handler Next 14 trên Vercel — không cần máy chủ luôn bật. Chưa chạy thử trên Vercel, nên độ dài tối đa/streaming/hủy-theo-ngắt-kết-nối là **UNVERIFIED** (connector doc 18.2 yêu cầu đo).
- **Quyết định cho skeleton:** *không* thêm phụ thuộc (cần đổi `package.json` + `package-lock.json`, đòi mạng và quyết định của chủ về phiên bản giao thức). Gateway cài tay tập con tối thiểu của JSON-RPC 2.0: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`; các phương thức khác trả `-32601`. Tasks (`io.modelcontextprotocol/tasks`) **không** được quảng bá. Đây là phần **cố ý chưa đầy đủ**; chuyển sang SDK chính thức là việc của Phase 1/2 sau khi chủ chọn phiên bản giao thức. *Phiên bản giao thức em đặt trong skeleton là hằng số có thể đổi, chưa kiểm với Host nào.*

## 4. OAuth và ánh xạ danh tính

**Hiện trạng (VERIFIED):** danh tính web/Android là Supabase Auth; `getRequestUser` xử lý cookie hoặc `Bearer` JWT. Client trả về là client **theo người dùng** (anon key + JWT) nên RLS chạy. `createAdminClient()` (service-role) chỉ được dựng ở `supabase/admin.ts` (cổng kiến trúc ép).

**Hệ quả cho MCP:**

1. Token của Host **không phải** JWT phiên web. Cần một token riêng có `aud` = URL tài nguyên của Gateway, scope theo tool, gắn `install_id`. `auth-js` có kiểu `oauth` server API → khả năng dùng chính Supabase làm authorization server (**UNVERIFIED**: chưa biết dự án đã bật; thiết lập là thay đổi cấu hình ngoài phạm vi chỉ-đọc).
2. Ánh xạ bắt buộc: `Host principal` → `VerifiedClaims { host, installId, userId|null, principalId }` (đã có trong `connectorContract`). `userId` chỉ được điền từ claim `sub` của token **đã xác thực**, **không bao giờ** từ id mà Host tự khai; `principalId` ẩn danh là giá trị sinh phía server, không phải IP, không phải nhãn `claude`.
3. Cấm: dùng service-role để "tìm user thay Host"; cấm trả `userId` ra Host. Dữ liệu theo người dùng (entitlement) chỉ đọc bằng client **theo token đã xác thực** (RLS), hoặc đọc qua một đường đã duyệt.
4. **Quyết định của skeleton:** bắt tay OAuth (đăng ký client, authorize, token, refresh, thu hồi) **KHÔNG làm** — SDK không có để dùng lại và Supabase OAuth server chưa xác nhận. Thay vào đó: một cổng `TokenVerifier` (interface) mà route gọi trên **mỗi** request; bản mặc định **luôn từ chối** (fail-closed → `AUTH_REQUIRED`), có kèm điểm nối để cắm bộ xác thực thật. Test dùng bộ xác thực giả. Route cũng trả `WWW-Authenticate` trỏ metadata tài nguyên để Host tìm được authorization server sau này (chỉ là header, chưa có endpoint).

## 5. Ánh xạ sáu tool tới dịch vụ có sẵn (danh sách cố định)

| Tool | Dịch vụ nội bộ (cố định) | Loại | Deadline & chế độ | Nhận xét |
|---|---|---|---|---|
| `search_places` | `searchPlaces(query, location, type=undefined…)` (food.ts) | ADAPTER | SYNC | trả hàng Serper/OSM → ánh xạ vào DTO |
| `search_restaurants` | `searchPlaces(..., type='restaurant')` | ADAPTER | SYNC | cùng dịch vụ, khác `type` |
| `search_attractions` | `searchPlaces(..., type='attraction')` | ADAPTER | SYNC | `agent/index.ts:118` đã dùng đúng `type: 'attraction'` |
| `search_shopping` | `searchProducts(query, lang)` (shopping.ts) | ADAPTER | SYNC | `merchantLinks:false` mặc định (không tốn thêm tín dụng) |
| `search_hotels` | `getHotelPrices(location, checkIn, checkOut, max, lang)` (travel.ts) | ADAPTER | SYNC | **không** hứa còn phòng; giá là tham khảo |
| `create_itinerary` | *chưa có dịch vụ* — job NEW | NEW | ASYNC | đòi lưu trữ bền (mục 7) |

Nguyên tắc: Gateway chỉ gọi hàm trong bảng, qua một `ServiceRegistry` đóng (không nhận tên hàm từ Host, không truy cập DB/nhà cung cấp trực tiếp). `searchPlaces` có thể tốn tín dụng Serper → **mọi** lần gọi đi qua đặt trước ngân sách (mục 6) trước khi dispatch.
Chưa kiểm chứng thực tế (cần chạy trả phí, ngoài quyền): độ trễ p50/p95 của từng dịch vụ, nên deadline SYNC ở skeleton là **giá trị giữ chỗ bảo thủ, không phải SLA** (connector doc 13.3: không tuyên bố 3/5/8 giây trước khi đo).

## 6. Hồ chi tiêu ngoài (MCP_EXTERNAL) trên động cơ ngân sách có sẵn

- **Phát hiện chính (VERIFIED):** "`BudgetReservationStore`" của R13 chưa tồn tại. Cơ chế thật là `costGate` (đặt trước cận trên → settle/release) trên `incrDailyCounter`. `spendGate` là cổng đo benchmark, không dùng.
- **Thiết kế skeleton (EXTEND, không động tới động cơ Web/App):** thêm `src/lib/mcp/spendPool.ts` dùng **cùng** `incrDailyCounter` nhưng với khóa tiền tố `mcp:` (đã định sẵn trong `spendPoolKeys`). Đặt trước cận trên trên *tất cả* tầng theo thứ tự hồ → host → install → principal → tool; tầng nào vượt thì hoàn lại những tầng đã cộng, từ chối `BUDGET_EXCEEDED`; store hỏng (`scope: 'store_down'`) → hoàn lại và `fail-closed`. **Không đọc/ghi** khóa `ai:cost:u:*` của Web/App, và Web/App không đọc `mcp:*` (test khóa chặt điều này).
- **Hạn chế đã biết:** `incrDailyCounter` khi *không có* store cấu hình đếm theo tiến trình (`scope:'instance'`, ghi rõ "NOT PRODUCTION SAFE"). Với MCP, `instance` bị coi là **không đủ** → fail-closed ngoài môi trường dev/test. (Quyết định: skeleton coi `instance` hợp lệ chỉ khi `NODE_ENV !== 'production'`.)
- **Các con số trần (ngày/host/principal/tool/mỗi yêu cầu): chủ sở hữu quyết định** — skeleton để mặc định rất thấp, tính theo USD nhỏ, đọc từ biến môi trường `MCP_POOL_*` (không đưa vào mã giá trị thật).
- `UNKNOWN_OUTCOME` (R13 13.2 bước 6): `costGate.settle` hiện chỉ cộng/trừ chênh lệch; chưa có trạng thái "không rõ kết quả". Skeleton: khi dispatch đã đi mà lỗi/hết hạn → **giữ nguyên đặt trước** (không hoàn), ghi log `unknown_outcome`. EXTEND thật sự cho ledger là việc sau.

## 7. ASYNC / job bền

- **Không có** bảng job, hàng đợi hay worker (VERIFIED). Redis ở đây là bộ đếm, không phải hàng đợi bền (đúng cảnh báo 13.7).
- Skeleton cài **hợp đồng** (port `JobStore`) và bốn tool dự phòng `create_itinerary_job / get_itinerary_job_status / get_itinerary_job_result / cancel_itinerary_job`: ID khó đoán (`crypto.randomUUID`), mọi lần đọc/hủy kiểm chủ sở hữu bằng `principalId` (đã có `resourceOwner` trong `admitToolCall`), kết quả hợp lệ MCP (`job_id`, `status`, `created_at`, `poll_after_ms`, `expires_at`).
- **Lưu trữ bền = chưa có** → bản mặc định của `JobStore` luôn trả `PROVIDER_UNAVAILABLE` (fail-closed); chỉ có bản trong bộ nhớ dùng cho test. Chọn công nghệ (bảng Supabase + cron/worker, Cloud Run Jobs, hay hàng đợi ngoài) cần chủ quyết (chi phí, vận hành). Cũng cần migration → **ngoài phạm vi chỉ-đọc**, chưa làm.
- MCP Tasks: **không quảng bá** (chưa có Host nào đã kiểm; schema Draft theo connector doc).

## 8. Hồ sơ nền tảng (Claude / ChatGPT / Gemini) — kiểm từng cái, không tuyên bố ngang nhau

Em **không** kiểm tài liệu chính thức mới nhất ở đợt này (nằm ngoài một lần đọc mã; connector doc 4.1 yêu cầu kiểm lại ngay trước khi triển khai). Mọi dòng dưới đây là **UNVERIFIED** — là mốc tham chiếu từ connector doc (10/11/2026):

| Nền tảng | Mốc từ connector doc | Nhãn | Điều cần chứng minh trước khi phát hành |
|---|---|---|---|
| Claude | Remote MCP, Streamable HTTP, OAuth, cần endpoint công khai (máy dev không đủ) | UNVERIFIED | từng bề mặt (Web/Desktop/Mobile) khám phá + gọi tool, luồng OAuth, giới hạn thời gian |
| ChatGPT | Pro: kết nối MCP tùy chỉnh read/fetch; Business/Enterprise: đủ; chỉ Web; refresh-token, ảnh chụp schema | UNVERIFIED | đủ điều kiện tài khoản, hành vi `readOnlyHint`, quy trình cập nhật schema |
| Gemini Apps (Connected Apps) | điều kiện Mỹ/tiếng Anh/tuổi 18+ … **không** coi là có ở Việt Nam | UNVERIFIED | điều kiện địa lý tại thời điểm phát hành |
| Gemini API (Interactions API) | Streamable HTTP (không SSE), quy tắc đặt tên server snake_case | UNVERIFIED | hành vi mô hình đích |

Skeleton chỉ có **một** "hồ sơ" cấu hình mỏng (nhãn host + hằng số deadline/kích thước phản hồi), không có logic nghiệp vụ riêng từng nền tảng, và **chưa đăng ký connector ở bất kỳ Host nào**. Tên server cho Gemini dùng snake_case (`tappyai_mcp`) vì không tốn gì.

## 9. Xuất bản schema

- Connector doc 12.4 / 25.6 ghi rõ ví dụ đầu vào **chỉ minh họa**, schema cuối "chờ Source Audit". Hiện chưa có schema JSON được duyệt. Skeleton cài schema **bản nháp v0.1** suy ra từ ví dụ 12.4 và `connectorContract` (INFERRED): `query` (bắt buộc), `location_query`, `latitude`/`longitude`, `preferred_language`, `currency`, `search_radius_meters`, `limit` (tối đa = `maxResults` của tool); `additionalProperties:false`. Gắn nhãn phiên bản `mcp-tools.v0.1-draft`, chưa được chủ/Phase 1 chốt.
- Chính sách đổi schema: chỉ thêm trường tùy chọn; Host có thể đã chụp schema cũ (ChatGPT) — chưa có quy trình phát hành.
- **Chú ý (không khớp):** `connectorContract.CONNECTOR_TOOLS.create_itinerary.dtoFields` có `pollAfterSeconds`, còn R13/connector doc ghi `poll_after_ms`, `job_id`, `created_at`. Skeleton dùng tên theo R13 (snake_case, mili-giây) cho tool công khai và ghi chú lệch này; xem mục 12.

## 10. Chống cào dữ liệu

- **Chưa có gì** (VERIFIED). Skeleton làm lớp tối thiểu, thuần, kiểm thử được: ô lưới địa lý thô (làm tròn vĩ/kinh độ ~0,05°), bộ đếm ô khác nhau + danh mục khác nhau theo cửa sổ thời gian theo `principalId`, mức rủi ro Normal/Suspicious/Elevated → **giảm độ sâu kết quả** hoặc từ chối `ABUSE_RESTRICTED` ở mức High. Không thu hồi token tự động. Ngưỡng ở đây là **giá trị giữ chỗ chưa hiệu chỉnh** (connector doc 10.3: phải hiệu chỉnh với hành trình du lịch hợp lệ) → UNVERIFIED về độ chính xác; chưa nối vào kho bền (đếm trong bộ nhớ → chưa dùng được ở production nhiều instance).

## 11. Gán nguồn (attribution)

- Có hạ tầng click ký-niêm-phong cho ACCESSTRADE (`/go/at`); **không** có link ngắn `/go/<id>?ch=…` cho MCP. Skeleton **không** tạo link ngắn: mọi DTO chỉ mang `url` gốc đã allowlist; trường `attribution` chưa có. Nguyên tắc F-002 (nguồn ≠ danh tính giao dịch) được giữ vì không có định danh người dùng nào đi vào link. Làm link ngắn = Phase sau, EXTEND `/go`.

## 12. Điểm lệch / rủi ro / hồi quy

1. **Tên R13 ≠ mã:** "BudgetReservationStore", "UserPlanQuota", "TappyRetrievalAdapter.ts", "Global Context Resolver" không tồn tại dưới các tên đó (VERIFIED bằng grep). Không dựng "bản sao" theo tên.
2. **Dịch vụ hotels/shopping dính vào `chat/route.ts`** (4000+ dòng): tách ra là rủi ro hồi quy cho Web/Android/iOS → skeleton chỉ gọi các hàm `searchProducts`/`getHotelPrices`/`searchPlaces` ở **tầng dưới** đã export, không sửa route chat.
3. **Chi phí Serper dùng chung:** hồ MCP chỉ là sổ cái tách riêng; tài khoản Serper vật lý là một → `SERPER_DAILY_CREDIT_CEILING` toàn cục vẫn phải thắng. Một tool MCP có thể ăn trần chung và làm Web hết tín dụng — chỉ ngăn được bằng trần MCP nhỏ hơn trần chung (quyết định số của chủ).
4. **Cache dùng chung:** `searchPlaces` có cache trong tiến trình (30 phút) không phân biệt kênh; một lần trúng cache MCP không tốn tiền nhưng cũng cho thấy dữ liệu đã có từ truy vấn người dùng khác — khớp tinh thần "cache cho ẩn danh" nhưng chưa phân tích riêng tư (UNVERIFIED).
5. **`searchPlaces` không nhận `AbortSignal`** (VERIFIED: chữ ký không có) → hủy theo ngắt kết nối chỉ ở mức "ngừng chờ" (Promise.race với hạn), không hủy được lời gọi Serper đang bay. Connector doc 13.4 chấp nhận "best-effort" nhưng phải ghi `unknown_outcome` và giữ đặt trước.
6. **Hồ sơ riêng tư:** DTO của `search_*` chứa `address`, tọa độ không có (không nằm trong allowlist). Log phải rút gọn truy vấn (đã có `logSafeText`).
7. **Lệch tên trường** `pollAfterSeconds` (contract hiện có) vs `poll_after_ms` (R13) — sửa trong `connectorContract` là thay đổi hợp đồng đã có test; để skeleton dùng bộ ánh xạ riêng và đề xuất đồng bộ ở Phase 1.

## 13. Kế hoạch triển khai skeleton (Stage 2) — những gì audit ủng hộ

| Làm | Không làm (và lý do) |
|---|---|
| Cờ `MCP_GATEWAY` (đúng `"1"` và không bị `lockedInProduction`) | Không bật cờ ở bất kỳ môi trường nào |
| Route `POST /api/mcp` (JSON-RPC tối thiểu, không trạng thái) trả 404 khi cờ tắt | Không SSE, không session, không Tasks |
| Registry 6 tool + 4 tool job dự phòng, schema nháp v0.1, annotation đúng | Không đăng ký với Host, không publish schema |
| Allowlist dịch vụ cố định + adapter (`searchPlaces`, `searchProducts`, `getHotelPrices` được tiêm vào, test dùng giả) | Không gọi Serper/nhà cung cấp trong test; không nối Agoda/Vexere (chưa có khóa) |
| `TokenVerifier` fail-closed mặc định; ánh xạ claims→principal | Không viết OAuth server (SDK/Supabase chưa xác nhận) |
| Hồ `MCP_EXTERNAL` trên `incrDailyCounter`, đặt trước nhiều tầng, fail-closed | Không sửa `costGate`/Web/App; không migration |
| Deadline, chuẩn hóa lỗi (bộ mã 17 của connector doc), DTO allowlist, `JobStore` port | Không hàng đợi/worker bền (chủ chọn công nghệ) |
| Chống cào tối thiểu thuần (nếu thời gian cho phép) | Không hiệu chỉnh ngưỡng thật |

## 14. Việc chủ phải quyết / cung cấp

1. **Phiên bản giao thức MCP + có dùng SDK chính thức không** (đổi `package.json`).
2. **Bộ xác thực OAuth:** dùng Supabase OAuth server (cần bật + cấu hình) hay tự dựng? Ai đăng ký connector ở từng Host.
3. **Số trần hồ MCP** (ngày/tháng, theo Host, theo principal, theo tool, mỗi yêu cầu) — nhỏ hơn trần Serper chung.
4. **Công nghệ job bền** cho `create_itinerary` (cần migration + worker).
5. **Khóa Agoda/Vexere** (12/11) — mới nối sau khi có; không bịa.
6. **Chốt schema tool** (bản nháp v0.1 là suy luận).
7. Kiểm lại tài liệu chính thức từng nền tảng và đo độ trễ thật (cần ngân sách đo có kiểm soát) trước Phase 4.
