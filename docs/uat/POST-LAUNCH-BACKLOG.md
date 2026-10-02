# Backlog sau launch

Các việc chủ động hoãn đến sau launch. Mỗi mục ghi rõ vì sao chưa làm và làm xong thì đo bằng gì.

| ID | Việc | Ưu tiên | Ghi ngày |
|---|---|---|---|
| PL-001 | Tăng tốc lượt lập kế hoạch nhiều ngày (mục tiêu < 30 giây) | Cao | 2026-09-28 |

---

## PL-001 — Tăng tốc lượt lập kế hoạch nhiều ngày

**Quyết định của anh ngày 2026-09-28:** trước launch chỉ nâng `maxDuration` của `/api/chat` từ 60 lên 120 giây và nâng hạn chót của lượt từ 55 lên 110 giây. Project chạy Fluid compute (đã đọc cấu hình: `fluid: true`, thời gian chạy mặc định tối đa 300 giây), nên không phải đổi gói. Việc tăng tốc thật sự để sau launch.

**Số đo:**
- Lượt 3 ngày (c40 T1) mất 61–89 giây trên local. Bản gốc ngày 19/09 mất 46 giây.
- Bước bù P1-f (thêm 1 lần gọi model khi model chưa viết kế hoạch) xảy ra khoảng 1/3 số lượt. Nếu xảy ra, bước này cộng thêm 10–45 giây và không stream byte nào trong lúc chờ.

**Mục tiêu:** thẻ kế hoạch 3 ngày hiện đủ trong vòng **< 30 giây** (p90, đo trên Preview hoặc Production chứ không phải local).

**Hướng làm** (đo từng hướng, không làm gộp):
1. **Hiện thẻ kế hoạch sớm:** gửi phần khung trước (tiêu đề, danh sách ngày), rồi điền từng ngày dần vào. Người dùng thấy tiến độ thay vì một khoảng trống dài.
2. **Giảm dữ liệu tool đưa vào model:**
   - Kết quả tool đi vào ngữ cảnh model ở dạng gọn (chỉ các trường mà kế hoạch dùng).
   - Phần tóm tắt tool của bước bù (`toolResultDigest`) đang giới hạn 12.000 ký tự; giảm xuống và bỏ trường thừa.
3. **Bớt lần gọi bù:** tìm vì sao model "hứa lập kế hoạch rồi dừng" (P1-f) và sửa từ gốc, để bước bù chỉ còn là lưới an toàn.
4. **Gọi tool song song và giới hạn số bước** cho loại câu hỏi lập kế hoạch.
5. **Kiểm tra prompt cache** có trúng ở mọi bước của lượt lập kế hoạch hay không.

**Đo bằng:**
- Log `tappyai_plan_completion` (các kết quả `appended` / `timeout` / `no_time` và `ms`) và tổng thời gian của lượt trên Vercel.
- c40 T1 cùng 2–3 câu lập kế hoạch golden, chạy trước và sau, mỗi câu ít nhất 3 lần.

**Không làm:** hạ chất lượng kế hoạch để đổi lấy tốc độ, hoặc bỏ bước bù P1-f.

## PL-REVIEWS-PERF — /reviews: nội dung feed thật tới muộn hơn production (owner 29/09: xử lý sau launch)
Đo 29/09 (4G chậm 150 ms / 1,6 Mbps, CPU ×4): lần vẽ đầu đã sửa (FCP trung vị 4,0 → 2,6 s, commit 7e7dfe4 + 7ec6970), nhưng feed thật trên UAT tới ~5,8 s so với 3,1–7,3 s trên production. Việc cần làm:
1. Tách từ điển giao diện theo ngôn ngữ và theo khu vực (hiện mọi trang tải cả vi + en của admin, pháp lý, landing, hướng dẫn… — 110 KB nén). Lưu ý trang công khai hiển thị theo ngôn ngữ trình duyệt → không được nháy chữ khi tải lười.
2. Bắt đầu request feed trước khi hydrate (preload / server fetch trang đầu).
3. Tải lười `ExploreStage` (desktop) trên mobile — test `exploreStage.test.tsx` đang ghim import tĩnh, sửa cùng.
Bằng chứng + script đo: `gs://tappyai-uat-evidence/evidence/perf-reviews-2026-09-29/`, RELEASE-PROGRESS "/reviews LOAD TIME".

## PL-AI-LUNA — AI tư vấn: lỗi còn sót sau ngưỡng release 30/09 (làm cùng đợt chuyển GPT-6 Luna + làm lại prompt)
Ngưỡng release (Huy 29/09): mỗi mảng ≥ 17/21 (TB 2 lượt replay), A = 0, B = 0 ở lượt chính. Đạt ngày 30/09 (replay 17:40Z + 17:48Z:
ăn uống 18,5 · mua sắm 17,5 · du lịch 17,5 · giải trí 18,5 · spa 20,5). Còn lại, theo mức:
- **B ở ngách (lượt "xem thêm / bác" sau nhiều lượt):**
  - SHOP-1 t6 "không thích màu đen": nói thật "chưa tìm thấy màu khác" nhưng vẫn viết "Mình chọn: <ốp Scout>" (listing không ghi màu).
  - SHOP-3 t6 "nặng quá, muốn nhẹ hơn": dữ liệu tìm kiếm không có laptop mới nhẹ < 20 triệu → khi thì nói thật, khi thì chọn lại
    Aspire Lite 14 ("Lite thường nhẹ") — suy đoán từ tên.
  - SHOP-2 t4 so sánh (1/4 lượt): chọn món thứ ba thay vì một trong hai món được hỏi; lượt so sánh này còn gọi search_products (10 Serper).
- **C:** lượt bác/xem thêm hết ứng viên nói thật + gợi ý nới điều kiện nhưng không có "Mình chọn" (FOOD-2 t6, SHOP-3 t6);
  TRAVEL-3 kế hoạch đôi khi mất link Traveloka — model chép sai URL /go/at dài ~500 ký tự → guard egress xoá. **Rút ngắn link /go/at**
  (id ngắn lưu server thay vì seal + chữ ký trong URL) sẽ bỏ hẳn lỗi này.
- **D:** 2 dòng "Mình chọn" trong một lượt (ENT-2 t2, FOOD-3 t6); thiếu dòng "còn N" / tiêu đề kế hoạch; mẹo 1 dòng thay vì 2–3;
  "~466.000đ+" (giá có nguồn nhưng viết kèm "~"); bộ chấm không nhận "Bạn xem giá trên [Traveloka](…)" (có ngoặc) là câu "xem giá trên Traveloka".
- **Dữ liệu:** Serper Shopping cho "laptop … nhẹ" trả phụ kiện / dịch vụ sửa → bộ lọc loại sản phẩm (af4f2cb, 5547faa) chặn được nhưng
  còn rất ít laptop thật; cần nguồn sản phẩm có thông số (trọng lượng, màu) — feed ACCESSTRADE sau khi có API key.
Bằng chứng: replay `scripts/consult/replay/out/scenarios-2026-09-29T17-*`, phân loại tay trong RELEASE-PROGRESS "AI tư vấn — kết quả cuối".

## PL-FLIGHT-ORIGIN-GPS — điểm đi của vé máy bay lấy từ vị trí người dùng (owner 30/09 đêm, R25)
- Đã làm trong release: thẻ hỏi vé máy bay có câu «Bay từ đâu?» (Từ TP.HCM / Hà Nội / Đà Nẵng / nơi khác) cùng khung thẻ hỏi mới; lời người
  dùng («từ Hà Nội…», «Hà Nội đi Đà Nẵng») vẫn được đọc trước. Hồ sơ KHÔNG có trường thành phố; trí nhớ chỉ giữ NƠI ĐÃ HỎI (điểm đến), không phải nơi ở.
  Còn lại: nếu người dùng bỏ qua câu này, link dùng TP.HCM làm giả định và câu trả lời nói rõ («bạn đổi ngay trên trang»).
- Để sau: đoán điểm đi từ GPS (thành phố có sân bay gần nhất trong ~60 km) để khỏi hỏi. Vì sao chưa làm: bộ định tuyến chỉ biết «có GPS hay
  không» (không có toạ độ) nên phải đổi chữ ký + thêm bảng thành phố; tự đặt điểm xuất phát chuyến bay theo vị trí là suy diễn riêng tư nên
  cần owner duyệt cách nói («Mình thấy bạn đang ở …, xuất phát từ đó nhé?»). Làm cùng đợt thẻ hỏi theo mảng du lịch.

## PL-KV-SPLIT — UAT (Preview) và production dùng CHUNG một kho KV → tách kho riêng cho từng môi trường (owner 30/09)
- Hiện `KV_URL` / `KV_REST_API_URL` / `KV_REST_API_TOKEN` / `REDIS_URL` trên Vercel là một bộ cho **Production, Preview, Development**.
  Kho này giữ bộ đếm lượt hỏi (Pro 300/ngày, free 15/ngày, burst), giới hạn tốc độ, cache Serper, … → một lượt test nặng trên UAT dùng
  chung hạ tầng với production; muốn "trả lượt" cho tài khoản test trên UAT phải ghi vào kho của production (30/09 KHÔNG làm).
- Việc: tạo kho KV riêng cho Preview (Upstash/Vercel KV), đặt biến riêng cho Preview + Development, giữ Production nguyên; kiểm key prefix
  theo môi trường; smoke: đếm lượt trên UAT không đổi số của production. Làm SAU release, trước đợt test lớn tiếp theo.

## PL-OPENAI-KEY — tạo key OpenAI PRODUCTION trước khi key test hết hạn (owner 30/09, GẤP theo lịch)
- Release 30/09 chạy GPT-6 Luna bằng `OPENAI_API_KEY` = **key TEST hạn 30 ngày** (`D:\TappyAI-backups\openai-key.txt`, đặt cho
  Production + Preview ngày 30/09) → hết hạn khoảng **30/10/2026**. Key hết hạn = MỌI tính năng AI trên production lỗi (không còn dự phòng
  Haiku: Anthropic hết credit, `HAIKU_FALLBACK` tắt).
- Việc: tạo key production (tổ chức/dự án riêng, giới hạn chi tiêu + cảnh báo), thay trên Vercel Production + Preview, redeploy, smoke 1 câu
  chat + ScamShield. Làm **trước 25/10** (đặt nhắc lịch).

## PL-HOSTING-GCP — đánh giá dời hosting web từ Vercel sang Google Cloud (owner 30/09: CHỈ GHI, CHƯA LÀM)
Bối cảnh: 30/09 Vercel báo team `huyphamsm-tappys-projects` dùng 100% Function Storage (10 GB, Hobby, tính theo đỉnh 30 ngày).
Đã làm ngay: build chỉ `rc/web-uat` + `main` (`scripts/vercel-ignore.mjs`), xoá 6 bản Preview cũ, retention đang 30 ngày.
**Phương án:** Next.js standalone trong container → **Cloud Run** (min-instances 1 cho production để tránh cold start), **Cloud CDN** +
HTTPS Load Balancer trước Cloud Run cho tĩnh/ISR, **Cloud Scheduler** gọi 14 cron hiện tại (thay `vercel.json crons`, giữ bearer
`CRON_SECRET`), **Secret Manager** cho env, **Cloud Build** (hoặc GitHub Actions) build theo nhánh; UAT = service Cloud Run thứ hai.
**Chi phí (ước, cần đo):** Cloud Run ~ theo vCPU-giây + RAM; 1 instance tối thiểu 1 vCPU/1 GiB chạy liên tục ≈ vài chục USD/tháng
mỗi môi trường; Load Balancer ≈ 18 USD/tháng + egress; trừ vào credit GCP hiện có. So với Vercel Pro 20 USD/thành viên/tháng.
**Công sức (ước):** 3–5 ngày: Dockerfile standalone + cache ISR/`revalidate` (Vercel làm hộ), middleware/edge chạy trên Node,
`next/image` (cần loader hoặc Cloud CDN), domain + SSL (www, uat), preview theo nhánh (tự dựng), log/alert (Cloud Logging).
**Rủi ro:** ISR/`revalidateTag` và cache dữ liệu Next chạy nhiều instance cần cache dùng chung (hiện dựa vào hạ tầng Vercel);
`@vercel/*` (KV, analytics, OG `@vercel/og`?) phải thay; header `x-vercel-*` mà code đọc (`clientIp()` ưu tiên `x-vercel-forwarded-for`,
`x-vercel-protection-bypass` cho UAT) phải đổi sang header của Load Balancer; cold start; mất rollback một chạm.
**Mất so với Vercel:** preview URL tự động mỗi nhánh, Deployment Protection + bypass cho UAT, rollback/promote tức thì, edge network
và image optimization có sẵn, Speed Insights, cron trong `vercel.json`, log theo deployment.
**Đề xuất:** release trên Vercel (nâng Pro nếu Hobby chặn), đo chi phí thật 1 tháng, rồi mới quyết dời.

## PL-AI-OWNER-UAT-30-09 — góp ý của Huy trên trang duyệt mục 10 (không chặn release)
- **SPA-2 lượt 7** ("nói lên kế hoạch mà sao ko thấy làm cái broche"): kế hoạch spa / ăn uống / giải trí / mua sắm chỉ là văn bản —
  thẻ kế hoạch `[TAPPY_PLAN]` hiện chỉ có ở du lịch (quyết định Q-R16). Làm thẻ kế hoạch cho cả 5 mảng cùng R22 (thẻ v2 + manifest ảnh).
- **T5b lượt 1** (Không đạt, không ghi chú): "đi chơi ở đâu" → thẻ hỏi; lượt 2 (trả lời "3–5 người") AI lại hỏi thêm "chơi gì" (C).
  Khi user đã trả lời một phần thẻ hỏi, chọn luôn với giả định rõ ràng thay vì hỏi tiếp.
- **ENT-3 lượt 7** ("ủa cái") và **T4 lượt 1** ("câu này "): ghi chú bị cắt dở — hỏi lại Huy.
Nguồn: kho `verdicts` của https://claude.ai/artifact/T1ENadG4ZVDHEbnJaaGRFU (chỉ bản ghi ngày 30/09 — các bản ghi không hậu tố `-t<n>`
là đánh giá cũ 28/09 của trang trước, đã xử lý ở vòng C1/C2).

## PL-SECURITY-30-09 — từ báo cáo bảo mật `docs/security/SECURITY-AUDIT-2026-09-30.md` (Huy 30/09: ghi, làm sau release)
- **WEB-3 `/r/<slug>`:** trang công khai hiển thị "câu trả lời của TappyAI" lấy từ `conversations.messages` do client ghi → ai cũng dựng
  được trang tappyai.com giả nội dung + link lừa đảo. Cần Huy chọn: (a) server ký HMAC câu trả lời nó sinh, chỉ chia sẻ bản có chữ ký;
  (b) tạm: chỉ biến thành link các host nền tảng quen, còn lại chữ thường + nhãn "Nội dung do người dùng chia sẻ".
- **UP-2 media GCS không thu hồi** khi ẩn / xoá / hạn chế bài — link ảnh/video cũ mở mãi. Làm cùng Phase 8 (signed URL).
- **UP-4 quét GPS** ảnh đã tải lên **trước 24/09** (trước R-2) trong bucket production; xoá EXIF hàng loạt.
- **DEP-1 nâng Next.js 15** (14.2.35 hết hỗ trợ; 1 critical + vài high, đa số chỉ ảnh hưởng self-host).
- **Đổi khoá Google** còn nằm trong 2 file settings của worktree cũ + transcript trên máy (danh sách trong báo cáo) — xoay khoá rồi xoá file.

## PL-PLAN-CARD-RACE — thẻ địa điểm của tin nhắn KẾ HOẠCH chuyến đi do cuộc đua song song quyết định (01/10)
Lượt kế hoạch lấy trước khách sạn + quán ăn + điểm tham quan + thời tiết SONG SONG (`route.ts` ~2625); tin nhắn chỉ mang MỘT khối thẻ và `setPlacesRecommendations` là «bộ đầu tiên không rỗng thắng» (`toolResultSplit.ts`). Cùng một câu «Lên kế hoạch đi Đà Nẵng 3 ngày 2 đêm…» hai lần chạy trên UAT cho hai kết quả: một lần thẻ khách sạn (nút «Đặt phòng trên Trip.com»), một lần chỉ thẻ quán ăn/điểm tham quan. Link đặt phòng đã nằm ở tin nhắn CHỐT khách sạn ngay trước đó, nên không phải lỗi mất link; nhưng thứ tự không xác định. Đề xuất: chọn thứ tự cố định (khách sạn đã chốt → thẻ quán/điểm tham quan) hoặc gộp hai khối. Chưa sửa vì đã đóng băng và là quyết định sản phẩm.

## Backlog ghi thêm 01/10 (khối hoàn chỉnh của Huy, mục E5) — chỉ ghi, chưa làm

- **PL-MOVIES** — danh sách phim đang chiếu thật. Hiện: câu trả lời trung thực + 5 link trang phim đang chiếu chính thức (CGV, Galaxy, Lotte, BHD, Beta), không nêu tên phim. Cách làm: nguồn có cấu trúc (API/feed của cụm rạp hoặc TMDB «now playing» cho VN) + code kiểm; chi phí đo thật khi chọn nguồn.
- **PL-FLIGHT-PRICES** — danh sách chuyến bay kèm giá. Hiện: link điền sẵn chặng + ngày + số người (Trip.com, Traveloka qua ACCESSTRADE), không có giá. Nguồn khả dĩ: Travelpayouts (đã có trong code, giá theo người, cache), Amadeus/Skyscanner partner API; cần chọn nguồn và giấy phép hiển thị giá.
- **PL-PERMISSIONS-DEFAULT** — quyền Mic/GPS/thông báo «mặc định bật»: hệ điều hành bắt buộc hộp hỏi, không ép được; web đã có công tắc Micrô mặc định BẬT (Cài đặt). Phần native (công tắc trong app Android/iOS, xin quyền đúng lúc kèm lý do) chưa làm.
- **PL-VOICE-NATIVE** — màn Mic mới (mockup `D:\TappyAI-backups\designoiceoice-mockup.png.png`: mascot vẫy tay, «Tôi đang lắng nghe...», nút tròn giữa có vòng sóng tím, Hủy/Gửi, khung chữ dưới với câu mẫu mờ bị chữ nhận diện thay thế). Hành vi tắt mic: tắt hẳn khi Hủy/Gửi/Quay lại/đổi màn/xuống nền/lỗi/60 giây không có chữ; câu mẫu KHÔNG BAO GIỜ được gửi; Gửi mờ khi chữ rỗng. Cần làm trên Android + iOS (web đã làm).
- **PL-FCM-TOKEN** — token FCM bị ghi đè giữa Android và iOS (cùng người dùng hai máy): khoá bảng token theo `(user_id, provider, token)` hoặc thêm cột `platform`. Server chỉ gửi FCM **data-only** cho Android; iOS cần khối APNs (`apns` payload + `aps.alert`).
- **PL-DELETE-EMAIL-DEADLINE** — thời hạn trả lời luồng xoá tài khoản bằng email khi cờ TẮT: trang đang ghi «trong vòng 30 ngày» và «nhật ký máy chủ lưu tối đa 30 ngày» — **cả hai là giá trị chưa được Huy xác nhận / chưa đo** (DELETE-ACCOUNT-COPY-DRAFT đánh dấu [XÁC NHẬN]).
- **PL-CLIENT-STRINGS (D6)** — chữ do CLIENT dựng (không sửa đợt này, liệt kê ở `docs/uat/STYLE-LUNA6-REVIEW.md`): tiêu đề/phụ đề thẻ hỏi theo mảng (`ASK_HEADER` web `askCardModel.ts`, bản port Android/iOS), «Những lựa chọn sát nhất mình tìm được» + «Chưa có phương án nào vượt hẳn…» (`i18n/w5/shoppingDecision.ts`), nhãn nút. Cần viết lại cùng giọng ở đợt có build native.
- **PL-HISTORY-CARDS (A5)** — mở lại lịch sử chat mất thẻ/ảnh/link: lịch sử chỉ lưu `{role, content}` trong `conversations.messages`; thẻ địa điểm chỉ sống trong bộ nhớ tab (`liveViewCache.ts`) vì điều khoản Google Places cấm lưu nội dung Places. Hướng làm: lưu **chỉ place_id / id sản phẩm** theo (hội thoại, lượt) ở server và dựng lại thẻ khi mở lịch sử bằng Place Details (được phép lưu place_id); cần cả client Android/iOS đọc phần dựng lại. Chưa làm vì cần sửa app native.
- **PL-CHAT-TITLE (A6)** — tiêu đề chat là câu đầu tiên của hội thoại (đặt ở client khi lưu); khi người dùng tiếp tục hội thoại cũ «Quán cafe view đẹp» sang chủ đề khác, tiêu đề không đổi. Đổi thành tiêu đề theo chủ đề cần sửa client (3 nền tảng).
- **PL-TOUR-KLOOK (B)** — «tour khám phá Hội An» đang ra khách sạn. Cần luồng tour/hoạt động: nhận ý định → link tìm kiếm Klook (đã duyệt ACCESSTRADE) đúng từ khoá. URL tìm kiếm Klook chưa kiểm được (Cloudflare 403 với công cụ) — cần mở bằng trình duyệt thật để chốt cú pháp.
- **PL-XE-KHACH** — «vé xe khách» không có link: Vexere chỉ có trang chủ (depth 0). Cần dò cú pháp tìm tuyến của Vexere/Futa trước khi hiện link.
- **Gác lại từ khối A/B/C của 01/10 và lý do:** A5, A6 (cần native); tour/Klook, xe khách (chưa kiểm được cú pháp link); thẻ «ăn phở Bắc» vẫn tiêu đề trung tính (đổi thành «Hôm nay ăn gì nhỉ?» cần id báo mảng trong hợp đồng thẻ → đụng cả hai app).

- **PL-COPY-PREMIUM (sau release, KHÔNG làm bây giờ)** — chữ «Premium», «không giới hạn», «Pro» mâu thuẫn khi bật gói trả phí mới (30 câu/ngày): `v3.premium.*` (khung thanh bên, hiện cho mọi người), `v3.top.plan`, `v3.profile.premium`, `v3.history.premiumTitle`, `profile.upgradePro`, `sub.*` cũ, iOS SubscriptionView, trang admin userAnalytics. Danh sách và chữ đề xuất: `docs/payments/COPY-CONFLICTS-FOR-WEB.md` trên nhánh `p8/subscriptions` (chỉ đọc). Riêng `publicResult.softGate` (sai ngay ở bản release) đã sửa 02/10.

## Thêm 02/10 (Huy ghi nhận, KHÔNG làm trước release)
- Cắt phút CI (Regression Gate chạy hai lần mỗi push)
- App Links: `assetlinks.json`
- Nút Chặn / Báo cáo trên web (hiện chỉ có API + app)
- Lịch sử chat giữ ảnh và thẻ; tiêu đề chat
- Tour sang Klook; link xe khách
- Nén clip trước khi tải lên
- FCM cho iOS
- Email tóm tắt hàng chờ kiểm duyệt
- Chuyển `docs/audit` sang GCS
- Scam Shield: khớp tình huống tĩnh (`matchScenario`) + 89 tình huống Phase 8; đồng bộ thư viện qua server; đồng ý trước khi gửi AI trên web
- Chữ pháp lý: nhờ người am hiểu luật Việt Nam xem lại (docs/uat/LEGAL-TEXT-REVIEW-2026-10-02.md)

## Ảnh thẻ hỏi / thẻ kế hoạch (02/10, Huy duyệt; nhánh `assets/ask-card-images`)
- **Ảnh riêng cho 3 ô còn thiếu** (bowling, món Nhật/Hàn, âm nhạc) và **tách 3 ô mua sắm** (trung tâm / chợ / đồ công nghệ đang dùng chung ảnh trung tâm thương mại vì cùng khoá `diem-mua-sam`): cần ảnh riêng + sửa bảng gán ô trên CẢ 3 nền tảng (`askCardModel.ts`, Android `AskCardModel.kt`, iOS `AskCardModel.swift`) + build lại Android và iOS.
- **Hero (16:9) để sau:** cần quyết (1) server chọn khoá hero thế nào (hiện không nơi nào ghi `hero_image`), (2) đổi tiền tố khoá `entertainment-`→`giai-tri-`, `shopping-`→`mua-sam-` (và thống nhất `-01` hay `-1`), (3) thẻ kế hoạch trong chat web vẽ hero (hiện chưa), (4) ảnh còn thiếu: giải trí 4, mua sắm 10, spa 7, ăn uống 5, du lịch 1 (và bản trùng giải trí số 0/2). Ảnh nguồn ở `D:\THIETKE PLAN`, bản đã xem: chưa đổi tên theo khoá.
- **Android UAT không tải được ảnh từ uat.tappyai.com**: Coil dùng máy khách HTTP riêng, không có `DeploymentProtectionInterceptor` (chỉ máy khách API có); sửa = cho Coil dùng cùng máy khách (build lại UAT). iOS không có bypass. Bản release trỏ www.tappyai.com nên không bị.

