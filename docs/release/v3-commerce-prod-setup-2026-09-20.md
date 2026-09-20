# V3 commerce — production setup checklist (owner làm tay, 2026-09-20)

Session không có kênh ghi vào prod (Vercel CLI bị policy chặn, Supabase CLI không cài, PAT trong `.env.local` đã hết hạn — HTTP 401). Mọi bước dưới đây là owner tự làm; mỗi bước có câu verify.

## A. Supabase prod (`fwznnobrdctuskgrvuik`) — Dashboard → SQL Editor
1. **Backup trước**: Dashboard → Database → Backups: xác nhận có "Daily backups" (Pro) hoặc PITR bật. Nếu KHÔNG có backup nào — dừng, bật backup trước.
2. Mở [`v3-commerce-prod-apply-pack-2026-09-20.sql`](v3-commerce-prod-apply-pack-2026-09-20.sql), dán **nguyên file** vào SQL Editor → Run. Pack = 2 migration nguyên văn (`20260920100000_commerce_providers.sql`, `20260920110000_commerce_feed_items.sql`) + `update … dmx active=false`, trong 1 transaction.
   - Chỉ tạo MỚI: 3 bảng (`commerce_providers`, `commerce_feed_items`, `commerce_feed_runs`), 1 index, 1 trigger function, 17 row seed. Không ALTER/DROP bất kỳ object nào có sẵn. `main` đang chạy không đọc 3 bảng này (đã grep `origin/main`: 0 tham chiếu) ⇒ không ảnh hưởng người dùng hiện tại. Chạy 2 lần được (đã chứng minh trên project AUDIT).
3. Chạy 3 câu VERIFY ở cuối pack: kỳ vọng `providers=17, active_providers=16, dmx_off=true`; row dmx `active=false`; `feed_items=0, feed_runs=0`.
4. Nếu cần gỡ: [`v3-commerce-prod-rollback-2026-09-20.sql`](v3-commerce-prod-rollback-2026-09-20.sql) — chỉ drop đúng các object pack tạo.
5. Bật lại DMX sau này (không deploy): `update public.commerce_providers set active = true where provider_id = 'dmx';`

## B. Vercel env (project tappyai) — Dashboard → Settings → Environment Variables
6. **Đọc trước** (không đổi gì): ghi lại theo TÊN các biến đang có ở Production và Preview, đặc biệt `GOOGLE_PLACES_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `PLACES_PROVIDER` (kỳ vọng: CHƯA có). Câu hỏi 4 ngày: key Google prod có phải `…LKXQ` (sha256[:8] `32640e98`)? Bản `vercel env pull` ngày 08/09 (môi trường Development) chứa đúng key này; Production chưa xác nhận được từ máy này — owner so 4 ký tự cuối trên dashboard.
7. **Thêm** `PLACES_PROVIDER` = `serper` cho **Production** và **Preview** (không cần Development). Code: biến UNSET ⇒ mặc định `serper` (`src/lib/ai/tools/placesProvider.ts`, `PLACES_PROVIDER_DEFAULT`); giá trị lạ ⇒ log `tappyai_config_error` và vẫn về `serper` — fail-safe, không bao giờ rơi sang Google.
8. `GOOGLE_PLACES_API_KEY`: **chưa xoá**. Sau khi (7) có hiệu lực, key chỉ còn được đọc khi `PLACES_PROVIDER=google` (`food.ts:712`, `common.ts:85`) và cron price-check không dùng nó ⇒ **an toàn để xoá**, nhưng giữ 1 tuần để có đường lùi (`PLACES_PROVIDER=google` + key) nếu Serper sự cố. Owner quyết.
9. Env mới **cần** để áp trần (đã có default trong code, chỉ thêm khi muốn đổi): `CHAT_IP_BURST_PER_MINUTE` (30), `CHAT_USER_BURST_PER_MINUTE` (20), `PRO_DAILY_CHAT_CAP` (300), `SERPER_DAILY_CREDIT_CEILING` (15000).
10. **Affiliate — còn thiếu (không có giá trị nào trên máy này; KHÔNG bịa):**
    - `ACCESSTRADE_PUBLISHER_ID` (Production + Preview) — publisher id Accesstrade của TappyAI; thiếu ⇒ mọi Tier 1 (Lazada, CellphoneS, Trip.com, Vexere, Klook, TikTok Shop) phát link DIRECT, không tracked, không lỗi.
    - `ACCESSTRADE_API_KEY` + `ACCESSTRADE_FEED_ENDPOINT` (mẫu `https://api.accesstrade.vn/v1/datafeeds?campaign={campaign}&format=csv`) — thiếu ⇒ cron `/api/cron/feed-ingest` ghi `blocked_no_credentials`, không có gì hỏng.
    - `TRAVELPAYOUTS_TOKEN` — thiếu ⇒ máy bay không bao giờ có giá (trả lời trung thực + link route có ngày).
    - Traveloka + Vietnam Airlines (Tier 1 theo owner): KHÔNG phải env — là 2 row trong `commerce_providers`: `update public.commerce_providers set network='accesstrade', campaign_id='<id 10–25 chữ số>' where provider_id in ('traveloka','vietnamairlines');` hoặc `network='template', wrapper_template='https://…{url}…'`. Tới khi điền: app log ERROR `deeplink_enabled_without_wrapper` và phát link direct.

## C. Upstash KV (rate limit + trần Serper toàn cục)
11. Biến limiter đọc (đọc `KV_REST_API_*` TRƯỚC, rồi `UPSTASH_REDIS_REST_*`): `KV_REST_API_URL` = `https://<db-name>-<id>.upstash.io`, `KV_REST_API_TOKEN` = token REST (chuỗi `A…` dài ~60–100 ký tự). Bản pull Development 08/09 đã CÓ cả 2 (URL …h.io); ghi chú P1-5 trong code nói Production cũng có theo TÊN — owner xác nhận lại trên dashboard trước khi tạo mới.
12. Nếu chưa có: `console.upstash.com` → Redis → **Create Database** → Name `tappyai-ratelimit` → Type **Regional** → Region: chọn **cùng vùng với Vercel Functions của project** (Vercel → Settings → Functions → Region; mặc định `iad1` Washington ⇒ Upstash **US-East-1 N. Virginia**; nếu đã chuyển sang `sin1` ⇒ **AP-Southeast-1 Singapore** — latency tính từ FUNCTION, không từ người dùng VN) → TLS on → Create → tab **REST API** → copy `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN` → dán vào Vercel là `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Production + Preview) → **Redeploy** (env mới cần deployment mới: Deployments → ⋯ → Redeploy).
13. **Verify limiter dùng store phân tán**: (a) Upstash console → database → Metrics: "Commands" tăng ngay sau 1 lượt chat trên `www.tappyai.com`; (b) bắn 31 request/phút anonymous vào `/api/chat` từ 1 IP ⇒ request 31 trả 429 và Vercel Logs có `{"type":"tappyai_rate_limit","limit":"chat_ip_burst","scope":"distributed"}` — nếu `scope":"instance"` là chưa nối. Request bị 429 không tốn model.
14. **Nếu không làm**: mọi trần (30/phút/IP, 20/phút/tài khoản, Pro 300/ngày, Serper 15.000 credit/ngày) chỉ đếm **per-instance** — mỗi lambda một bộ đếm, script lạm dụng nhân N instance; trần Serper toàn hệ không có hiệu lực thật.

## D. Sau A–C
15. Merge `merge/main-into-v3` → main theo release workflow (KHÔNG push thẳng); sau deploy: `curl -sL https://www.tappyai.com/api/version`; chạy kịch bản G trong `docs/audit/autorun-2026-09-20.md`.
