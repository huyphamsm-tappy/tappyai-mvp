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
