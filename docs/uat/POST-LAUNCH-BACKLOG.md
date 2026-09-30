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
