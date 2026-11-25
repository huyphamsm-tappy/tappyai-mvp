# BÀN GIAO 12/11/2026 — Web TappyAI: bộ não R13, báo cáo nghiên cứu sâu, bản UAT v206

Soạn lúc đóng phiên 12/11/2026 (chiều). Mọi mục ghi rõ **ĐÃ XÁC MINH** (có bằng chứng trong phiên này) hay **CHƯA XÁC MINH**. Không có khóa, token hay nội dung `.env` trong tài liệu này; khi cần kiểm khóa chỉ dùng script in đúng/sai (xem mục 8).

## 1. Mục tiêu và yêu cầu của chủ sở hữu (Huy)

Mục tiêu: một bản **web** cuối cùng, hoàn chỉnh để Huy UAT ở `http://localhost:3000/chat`, không chắp vá, gồm (a) kiến trúc nghiên cứu sâu mới (Standard/Advanced theo luận điểm), (b) các phần R13 còn là hàm được nối vào chat, (c) giao diện theo mockup `D:\redesign\TappyAI_Web_Mockups_v206.html` (sáu tab: Elon vs Sam, Tesla Fact, Thảo Điền, Đà Lạt Travel, Deep Research, Dự án Phú Quốc).

Yêu cầu và quyết định của Huy (nguyên tắc cứng, đừng đảo lại):
- **Chỉ MỘT nhánh cho web: `feat/brain-r13-p1`, thư mục `D:\TappyAI-wt\wt-integration`.** Không tạo nhánh hay worktree mới, không `start_session` với worktree. Đang làm web, chưa đụng app (iOS/Android).
- **Báo cáo nghiên cứu trong chat = thẻ tóm tắt**: ý chính gạch đầu dòng + **chỉ tổng số nguồn** + một nút mở báo cáo đầy đủ; không chép nguyên báo cáo, không danh sách nguồn/link trong chat, **không nút tải PDF** (Huy dặn hai lần: 11/11 và 12/11).
- Mọi chữ Huy đọc viết **tiếng Việt**; báo cáo trung thực: nói rõ n, "chưa chấm mù", điều gì chưa thấy bằng mắt; không tuyên bố đã xong khi chưa xem trên màn hình thật.
- Không vá từng case, không chỉnh prompt cho một câu; sửa tổng quát. Test viết trước, kiểm đột biến cho test bảo vệ quy tắc.
- Gói: Free = Luna, chỉ Chat, 300 câu/ngày, khách hỏi 5 câu rồi phải tạo tài khoản; Trial (pip) = đủ năng lực Pro, một lần; Pro 5 Standard + 5 Advanced/tháng, 500 câu/ngày; Promax 10 Standard + 15 Advanced, 500 câu/ngày; giữ thông điệp "không giới hạn" (trần chỉ chống DoS).
- **Không Luna trong đường báo cáo Standard/Advanced** (R13 4); riêng bước quét chính sách của Standard gọi Sonnet **một lần mỗi lượt — Huy duyệt giữ**, lệch R13 (Huy tự sửa tài liệu R13).
- Vexere: **làm trực tiếp (aid 380), không Accesstrade**. Agoda: chỉ cần link affiliate (cid 1974819, đã có) + Agoda Lite; API "Demand" không cần.
- Cho nối cổng MCP vào bản build (cờ tắt). Huy tự lo khóa Agoda/Vexere vào `.env.local`.
- Chưa push, chưa PR, chưa deploy. Production không được đụng.

## 2. Trạng thái Git (ĐÃ XÁC MINH lúc soạn)

- Thư mục gốc làm việc: `D:\TappyAI-wt\wt-integration`; branch `feat/brain-r13-p1`; **HEAD `710b458397a5a3fba2a5ce129e37fa358f0eb589`**; **chưa có upstream** (chưa push bao giờ).
- `git status --short`: **sạch**, 0 tệp chưa theo dõi (lưu ý: chạy test sẽ làm 4 tệp `docs/audit/*.json` bị đổi: hoàn lại bằng `git checkout -- docs/audit`, đó là sản phẩm phụ của test, không phải thay đổi của anh/em).
- Số worktree trong repo: 26 (phần lớn có trước, kể cả 10 cây One Life Huy bảo GIỮ); stash: 23 (có trước, không phải của phiên này; không đụng).
- Thư mục phiên của em (`D:\Claude\Projects\TappyAI\.worktrees\g1-growth`, branch `feat/g1-growth`) có sẵn rất nhiều thay đổi chưa commit của việc khác (iOS, consent…): **không phải việc này, không đụng**. Dòng cấu hình tạm em thêm vào `.claude/launch.json` ở đó đã gỡ.
- Commit liên quan, từ cũ đến mới sau mốc `7934d2a` (31 commit; đọc `git log 7934d2a..HEAD`): nghiên cứu theo luận điểm (M3–M5: `d4d9cf9`…), chính sách gói, bỏ Luna khỏi đường báo cáo (`7934d2a`), kho hotline (`6f28429`), `7b2b702` hợp đồng R13 4.3/9.5/17.x, nối chat (`59a688e`), ngữ cảnh chuẩn (`78d697a`), Vexere (`243e27d`), cổng MCP ghép (`583bfbc` + 12 commit mcp), bố cục RFC-001 (`4ac5b07`), tóm tắt báo cáo + v206 đợt 1 (`ee8195e`), v206 giao diện (`f1b7fc3`), route hồ sơ thực thể (`0eca6cd`), kịch bản v206 + chip (`34897b5`), sửa helper (`710b458`).
- Nhánh MCP phụ `claude/mcp-gateway-p0-6c5723` và worktree của nó **đã xóa** (đã ghép hết vào nhánh web, ĐÃ XÁC MINH bằng `merge-base --is-ancestor`; commit cuối 7d142ad vẫn nằm trong HEAD).

## 3. Môi trường bản UAT (ĐÃ XÁC MINH lúc soạn)

- Máy chủ UAT đang chạy ở cổng 3000 (preview server id `3cf5cde6-…`, khởi động lúc ~15:16 12/11 từ HEAD hiện tại). Launcher: `node D:\TappyAI-review-artifacts\consultative-wave3\measure30\uat-localhost.cjs` (đọc khóa từ `.env.local` của `wt-integration` qua `process.loadEnvFile`, nhận cờ từ `flags-uat.json` cùng thư mục; **mọi cờ trong tệp đều vào môi trường, không có allow-list**). Cờ `NEXT_PUBLIC_*` chỉ đọc lúc khởi động ⇒ đổi cờ phải khởi động lại.
- Cờ đang bật (tên=giá trị; 66 cờ tổng, đây là phần liên quan): RESEARCH_ADMISSION, RESEARCH_ADVANCED, RESEARCH_SOURCE_DIVERSITY, RESEARCH_CONSOLIDATION, RESEARCH_FORECAST_MODEL, RESEARCH_FRESHNESS, RESEARCH_TIGHT_WRITE, RESEARCH_THESIS_REPORT, RESEARCH_PACKAGES, RESEARCH_CHART_RELEVANCE, RESEARCH_CONTRACTS, RESEARCH_STREAM_VERIFY (tất cả =1); ATTACHMENT_ONLY_POLICY, MARKET_GATE, SAFETY_EMERGENCY, HOTLINE_CLAIM_GUARD, VEXERE_DIRECT_AFFILIATE, CANONICAL_CONTEXT (=1); CCP_REALTIME_AGODA_LITE=1, TVI_CAPTURE=1; NEXT_PUBLIC_REPORT_LAYOUT=a, NEXT_PUBLIC_RESPONSE_PRESENTATION=1, NEXT_PUBLIC_WORKSPACE_V206=1, NEXT_PUBLIC_REPORT_SUMMARY_VIEW=1, NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED=true. **`MCP_GATEWAY` KHÔNG bật.** Mọi cờ mới đều tắt mặc định và bị khóa ở production trừ khi tên cờ nằm trong `CONSULT_PRODUCTION_ALLOW`.
- **Quy tắc máy chủ (đã trả giá):** KHÔNG chạy `next dev` thứ hai trên cùng thư mục (bộ đo chat ở cổng 3040 + UAT cổng 3000 đã làm hỏng `.next` ⇒ trang `/chat/<id>` báo `Cannot find module './vendor-chunks/posthog-js.js'`). Cách sửa đã dùng: dừng server, xóa `D:\TappyAI-wt\wt-integration\.next` (đã gitignore), khởi động lại, làm ấm bằng GET `/`, `/chat`, `/api/config` và `POST /api/chat` với body `{}` (400, không tốn câu hỏi). Máy chủ dev vừa khởi động thì vài yêu cầu đầu chậm/quá thời gian (đã thấy địa điểm trống và C5 quá hạn; chạy lại thì đạt: nguyên nhân là SUY LUẬN, chưa chứng minh).
- Sau khi xóa trang thử, `tsc` có thể báo lỗi từ `.next/types/...` của trang đã xóa: xóa `.next` khi server tắt rồi chạy lại.
- Chrome extension của Claude: **chưa bao giờ kết nối** trong phiên này, dù Huy nói đã đăng nhập (đã thử 4–5 lần; một lần thấy trình duyệt nhưng tab Agoda nằm ngoài nhóm). Không dựa vào nó.

## 4. Đã hoàn thành (ĐÃ XÁC MINH bằng test + tsc trong phiên; "đã thấy bằng mắt" ghi riêng ở mục 6)

1. **Nghiên cứu sâu V2.1 (M1–M5)**: bộ đo 10 câu + rubric; thẻ bằng chứng (`evidenceCards.ts`); người phân tích → dàn ý → bộ viết → **giữ chữ đến khi mã kiểm** (`thesisReport.ts`, `releaseText`); quét chính sách bằng Sonnet cho Standard (cờ thesis). Đo máy (n nhỏ, CHƯA chấm mù): Standard ≈3 trang/11–18 nguồn/≈0,11 USD (trước 11–12 trang/≈100 nguồn); Advanced 5–7 trang/29–36 nguồn/0,45–0,52 USD. Tài liệu: `docs/architecture/BENCHMARK-M5-KET-QUA-20261111.md`, mục cuối `docs/architecture/ONE-BRAIN-FREEZE-20261102.md`.
2. **Gói và hạn mức** (`src/lib/plans/tiers.ts`, `src/lib/config/product.ts`): hai bộ đếm Standard/Advanced riêng; khách 5 câu; trần 300/500 ngày.
3. **Không Luna trong đường báo cáo**: thử lại 1 lần trên Claude rồi lỗi + hoàn lượt; kế hoạch vượt Standard mà hết Advanced ⇒ thông báo rõ, không chạy engine Luna (`deepResearchResponse.ts`, `reportFallback`).
4. **Kho hotline R13 §10.5** (`src/lib/safety/emergencyPayload.ts`): 111 (2 chức năng), 112, 113, 114, 115 theo báo cáo xác minh của Huy; giờ/miễn phí chỉ ở 111, 112.
5. **Nối chat (sau cờ)**: tin chỉ có đính kèm; cổng thị trường; khẩn cấp (bộ nhận diện vi/en/zh, thẻ chỉ khi GPS trong Việt Nam); `HOTLINE_CLAIM_GUARD` (bỏ khẳng định "miễn phí/24-7" cho 113/114/115, nhớ số gần nhất qua câu và mẩu stream); `reportQuestionLang` (câu hỏi tiếng Anh ⇒ báo cáo tiếng Anh).
6. **R13 4.3 hợp đồng điều phối** (chỉ quan sát/ghi log), **9.5 kiểm từng mục**, **bộ chấp nhận §17** (30 test), **hợp đồng ngữ cảnh chuẩn + bốn lớp ngôn ngữ** (`src/lib/context/`, cờ CANONICAL_CONTEXT; tổng quát hóa kiểm trên 30 câu mới: 80,0% trước khi sửa).
7. **Vexere trực tiếp** (`src/lib/config/vexereDirect.ts`, `src/lib/ccp/tracking/vexereDirect.ts`, cờ VEXERE_DIRECT_AFFILIATE; doc `docs/commerce/AFFILIATE_STATUS.md` mục 4b). Link xe khách/tàu/trang chủ/trang vé máy bay mang `aid=380` + utm; không bọc Accesstrade.
8. **Cổng MCP** đã ghép (cờ tắt): `src/lib/mcp/**` (38 tệp), `src/app/api/mcp`, `/go/m`, `/.well-known/oauth-protected-resource`, cron `mcp-jobs`; migration `20261121_mcp_jobs.sql` **chưa áp** và ghi `DEFER` trong `scripts/release/apply-migration.sh`. Chưa có OAuth thật, Host thật, khóa, công cụ khách sạn thật.
9. **Giao diện (RFC-001 + v206)**: khung workspace (rail, lịch sử hai dòng, tab, dự án, ngăn đã lưu), thanh sản phẩm 80 px, tiêu đề cuộc trò chuyện, thẻ quán kính tối (`V206PlaceCard.tsx`), timeline lịch trình có tab ngày (`TripTimeline.tsx`), ngăn Mẹo và ngăn hồ sơ địa điểm, **chip thực thể + cột hồ sơ Wikipedia bên phải** (`/api/entity-profile`, `src/lib/entity/wikiProfile.ts`, `useEntityChips.ts`), đề mục số mono, hộp dữ liệu, báo cáo mở dạng dossier (`ResearchCanvas.tsx`), thẻ tóm tắt báo cáo trong chat (`ReportInChat.tsx`), trang tổng quan dự án (`ProjectOverview.tsx`). Tài liệu đối chiếu: `docs/uat/V206-GAP-TABLE-20261112.md` (37 dòng), `docs/uat/V206-SCENARIO-CHECK-20261112.md`.
10. **Tự UAT 38 câu** (`docs/uat/UAT-TU-KIEM-38-CAU-20261112.md`, kết quả `UAT-KET-QUA-38-CAU-20261112.md`; công cụ ngoài repo: `D:\TappyAI-review-artifacts\consultative-wave3\measure30\run-uat38.mjs`, `uat38-cases.json`): 29 đạt, 3 một phần (B4 visa chắc chắn không nguồn; B8 thiếu 111/112; F4 trước khi có zh), 1 hỏng (F2 "115 miễn phí", đã sửa và kiểm lại). Chi phí thật ≈2,3 USD (trần Huy duyệt 3,5).

## 5. Kiểm thử (bằng chứng; KHÔNG tuyên bố PASS ngoài những gì ghi ở đây)

- Lần chạy toàn bộ `npx vitest run --project app` cuối cùng **trước** khi thêm các bản sửa chip/helper: 26403 đạt, 2 lỗi (chính sách migration — đã sửa bằng DEFER; `controllerRules` quá giờ). Lần chạy toàn bộ **sau** v206 scenarios: 7 lỗi, trong đó 5 là test chậm khi máy bận (guard kiến trúc, `attrContextEgress`, `research.test` định giờ), **1 lỗi thật** (guard `searchParams` do route mới — đã sửa ở `710b458`), 1 test định giờ. Sau sửa: `scripts/architecture` + `research.test.ts` + `attrContextEgress` chạy riêng (khi tắt server dev): 90 đạt; `searchParams.test` + route/lib entity: 35 đạt; `tsc --noEmit` sạch (sau khi xóa `.next`).
- **CHƯA chạy lại toàn bộ bộ test sau commit `710b458`** ⇒ phiên mới nên chạy `npx vitest run --project app` khi **tắt server dev** (để các test định giờ không chậm), rồi `git checkout -- docs/audit`.
- Test hay chậm/định giờ (đạt khi chạy riêng, dùng cờ `--reporter=verbose --silent=false` nếu cần thấy stdout): `scripts/architecture/controllerRules.test.ts`, `businessDataBoundary.test.ts`, `src/app/api/chat/attrContextEgress.route.test.ts`, `src/components/chat/MediaBlocks.test.tsx`, `src/components/**/departmentSwitcherRemoved`, `src/lib/ai/agent/runtime/research.test.ts` ("several pages in ONE call" <110 ms), `src/lib/media/video/overlay/renderPng.test.ts`.
- Đã dùng quy trình: test trước, kiểm đột biến cho quy tắc an toàn. Ghi chú thành thật: vài agent viết mã trước rồi chạy test (không có lượt đỏ thật) và bù bằng đột biến; một agent dùng `sed` thử đột biến trên file nguồn (trái CLAUDE.md, đã hoàn tác và kiểm diff).

## 6. CHƯA XÁC MINH / chưa thấy bằng mắt (phiên mới phải kiểm trước khi sửa)

- **Chưa ai thấy bản UAT trên tài khoản thật đã đăng nhập** ngoài Huy. Các màn hình chỉ được agent kiểm trên trang thử dùng dữ liệu giả ở cổng 3000 (kịch bản 1 ở 1586/1366/834; 2, 3, 4, 6 chủ yếu ở 1586; báo cáo mở ở 1586), ảnh bị thu nhỏ (~0,4×). **Chưa thấy**: trang dự án trong khung thật, chip trong câu trả lời thật của mô hình, mockup đặt cạnh sản phẩm ở 1366/834, huy hiệu gói PRO, huy hiệu/nút Mẹo trên tiêu đề, cuộn khôi phục khi đổi hội thoại, báo cáo ở 375/768 bằng mắt (chỉ đo DOM).
- Huy báo (ảnh 12/11 14:01, build ee8195e): "nó có khác cái gì đâu" ⇒ giao diện v206 đợt 1 quá nhẹ; đã làm tiếp ở `f1b7fc3`, `34897b5` nhưng **Huy chưa xác nhận bản mới**. Chờ ảnh/phản hồi của Huy trên bản `710b458`.
- Wikipedia: tên trùng nghĩa nhưng có mô tả vẫn có thể ra trang khác nghĩa (rủi ro đã biết); ảnh dùng `thumb.wikimedia.org` (lệch với yêu cầu ban đầu `upload.wikimedia.org`; đo thật 12/11); cache bộ nhớ tại chỗ.
- Vexere: chưa biết họ có ghi nhận `aid=380` (cần báo cáo hoa hồng bên Vexere). Link vé máy bay chỉ là trang `https://vexere.com/vn/ve-may-bay.vi` (không có cú pháp theo chặng đã kiểm chứng).
- Agoda: `.env.local` của `wt-integration` lần cuối em kiểm (booleans) vẫn **chỉ có** `AGODA_LITE_SITE_ID` (đúng 1974819) và `AGODA_LITE_API_KEY`; ba biến `AGODA_DEMAND_*` trống. Huy nói đã điền key; em chưa kiểm lại sau câu đó. Huy xác nhận Demand API không cần.
- Bộ nhận diện khẩn cấp: precision/recall là **trong mẫu** (cùng tay viết luật); câu mới viết độc lập lần đầu: tiếng Trung chỉ bắt 5/13 ca khẩn cấp (đã sửa luật rồi đưa vào bộ hồi quy). Người ở Việt Nam không bật GPS chỉ nhận hướng dẫn chung (không có số).
- Chưa chấm mù báo cáo mới so với Claude/bản cũ; số liệu bắt buộc q01 Standard 0–75% qua ~14 lượt (tìm nguồn của Standard còn thiếu mốc 36.000–70.000 đ và số nửa đầu 2026 ở nhiều lượt).
- MCP: `MCP_GATEWAY` chưa bật thử trực tiếp; OAuth/Host/hàng đợi bền chưa thật; `crimeInProgress` của thẻ khẩn cấp chưa được route truyền từ câu nói (mặc định theo nhóm).

## 7. Giả thuyết đã bị bác / bài học

- "Lỗi `/chat` 500 do thiếu cờ": **sai**. Nguyên nhân: `researchContracts.ts` nhập `node:crypto` lọt vào bundle trình duyệt; test đơn vị không thấy. Đã có guard `src/lib/ai/research/clientBundleSafe.test.ts`. **Luôn khởi động server thật sau khi ghép.**
- "Chạy server đo 3040 song song UAT 3000 an toàn": **sai** (hỏng `.next`).
- "Báo cáo vừa stream xong nên giữ đầy đủ trong chat" (quyết định của agent bố cục sáng 12/11): **sai so với yêu cầu Huy** — đã sửa (thẻ tóm tắt). Đừng đảo lại.
- "Tìm theo ngành hàng + nguyên liệu giúp Standard tìm thuế tiêu thụ đặc biệt bằng Haiku": **không** (0/3); cách hiệu quả là Sonnet viết truy vấn (đã làm).
- "Dùng tài liệu RFC-001 ở Downloads (23 KB)": **sai**; bản đầy đủ nằm ở `D:\redesign\` (83 KB + wireframes 84 KB).
- Em đã từng nói "đã làm hết" khi chưa kiểm: **không tái diễn**; chỉ nói điều có bằng chứng.

## 8. Quy tắc làm việc (bắt buộc)

- `CLAUDE.md` của repo: sửa mã **chỉ bằng Edit/Write** (không heredoc, `sed -i`, `python -c`, `echo >` cho mã); LF; không commit CRLF. Shell chỉ để chạy, đọc, git.
- Tiếng Việt cho mọi chữ Huy đọc; báo cáo ngắn, đọc được trên điện thoại; đánh số quyết định có mặc định đề nghị.
- Kiểm tệp khóa/`.env` **chỉ bằng script in đúng/sai** (mẫu: `C:\Users\Admin\AppData\Local\Temp\claude\7190622050b208d0\c0181c08-8bfb-46bd-92ca-f8c43834471f\scratchpad\envnames.mjs`, `agodasite.mjs`). Không in, không sao chép giá trị. Không đọc trang API/khóa trong tài khoản đối tác (Agoda) — chỉ site id.
- Không push/PR/deploy, không áp migration, không sửa production, không đụng app (iOS/Android), PR #267, Merge Guard, các cây One Life.
- Mỗi cờ mới: tắt mặc định, khóa ở production, test cờ tắt = hành vi cũ.
- Chi phí đo: Huy duyệt trần trước khi chạy đo tốn tiền; không bỏ câu nào lặng lẽ; báo số thật.
- Agent con làm trong cùng thư mục, KHÔNG commit; lead (em) kiểm lại test + tsc rồi commit theo đường dẫn tường minh.
- Không hứa "đã khớp mockup" nếu chưa so ảnh cạnh nhau cùng độ rộng.

## 9. Việc tiếp theo (đúng thứ tự)

1. Đọc mục 1–8 này, `docs/uat/V206-SCENARIO-CHECK-20261112.md`, `docs/uat/V206-GAP-TABLE-20261112.md`, mục cuối `docs/architecture/ONE-BRAIN-FREEZE-20261102.md`, và bộ nhớ `memory/MEMORY.md` (đầu trang).
2. Kiểm trạng thái thực: `git -C D:\TappyAI-wt\wt-integration status --short` (kỳ vọng sạch), `git log --oneline -3` (kỳ vọng HEAD `710b458`), `git branch --show-current`.
3. Tắt server dev, xóa `.next` nếu cần, chạy `npx tsc --noEmit -p .` và **toàn bộ** `npx vitest run --project app`; chạy riêng lại các test định giờ ở mục 5; hoàn `docs/audit`. Báo số thật.
4. Khởi động lại UAT cổng 3000 (launcher mục 3), làm ấm, rồi **chờ ảnh/phản hồi của Huy** về bản `710b458`; sửa theo đúng ảnh của Huy (ưu tiên chip + cột hồ sơ, thẻ quán, lịch sử, tab dự án). Với mỗi lần sửa: so ảnh cạnh mockup cùng độ rộng (mockup phục vụ qua một máy chủ tĩnh tạm, ví dụ `python -m http.server` trên thư mục `D:\redesign` bằng cấu hình `preview_start`, rồi gỡ).
5. Xử lý các quyết định đang mở của Huy: (a) Vexere trực tiếp đã bật ở UAT; **trước khi lên production** cần đặt biến + đưa tên cờ vào `CONSULT_PRODUCTION_ALLOW` và xem báo cáo hoa hồng; (b) khóa Agoda: kiểm lại booleans sau khi Huy dán; (c) MCP: chỉ bật `MCP_GATEWAY` trên localhost nếu Huy muốn thử; migration vẫn DEFER; (d) câu visa B4 và `crimeInProgress` nếu Huy muốn.
6. Chỉ sau khi Huy duyệt: chấm mù báo cáo, push/PR (chưa được phép).

## 10. Rủi ro chính

- Giao diện v206 phụ thuộc dữ liệu thật; mockup có nhiều thành phần giả (Evidence Verified, Gate PASS, banner đối tác, mẹo TVI, hồ sơ có bằng chứng): **không làm giả**, liệt kê trong bảng đối chiếu.
- Hai chương trình affiliate Vexere dùng cùng tham số `aid`: không bao giờ gắn cả hai vào một link.
- Test định giờ gây lỗi giả khi server dev đang chạy: chạy khi tắt server.
- Cây `D:\Claude\Projects\TappyAI\.worktrees\g1-growth` (cwd của phiên cũ) có thay đổi chưa commit của việc khác: đừng commit nhầm từ đó.
- Chi phí đã tiêu (ước từ số đo từng lượt, không phải hóa đơn): M2 ≈1,6; M3–M5 ≈4,8; quét chính sách + tự UAT ≈2,6 USD.

## 11. Bộ nhớ liên quan (đọc nhanh)

`C:\Users\Admin\.claude\projects\D--Claude-Projects-TappyAI-tappyai-mvp\memory\`: `project_uat_build_2026-11-12.md`, `feedback_one_branch_for_web_2026-11-12.md`, `feedback_second_dev_server_corrupts_next_cache_2026-11-12.md`, `project_report_engine_v21_m5_done_2026-11-11.md`.
