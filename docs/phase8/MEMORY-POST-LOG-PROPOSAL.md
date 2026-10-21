# `/api/memory` POST — proposal: một dòng log có cấu trúc tại handler 404 (2026-10-10)

**Trạng thái: PROPOSAL, chưa review, chưa chấp thuận. Chưa sửa bất kỳ code nào** (route `memory/route.ts` và test giữ nguyên). Baseline `8bc1f8c`. Liên quan: `DECISION-REGISTER.md` DR-5, `MEMORY-POST-AUDIT.md` §4–§5.

## 0. Phát hiện làm thay đổi đề xuất (VERIFIED, 2026-10-10 07:21–08:05Z)
Log request production của Vercel (project `tappyai-mvp`) chỉ giữ **~1 giờ** (đo bằng cách hỏi các cửa sổ 30 phút/90 phút/2 giờ/… trước; bản ghi cũ nhất ≈ 52 phút). Dòng log `console.*` của hàm đi vào **cùng kho log đó**. Vì vậy:
1. **Một dòng log đơn lẻ KHÔNG giải quyết vấn đề retention.** Nó chỉ đáng giá nếu (a) có log drain/nơi lưu ngoài, hoặc (b) có người đọc trong vòng một giờ sau mỗi lần xảy ra.
2. Vercel **đã ghi** từng request `POST /api/memory → 404` (method, path, status, thời điểm, deployment) vào cùng kho log đó, không cần thêm mã. Dòng log mới chỉ bổ sung **phân loại thô** (xem §2), không bổ sung sự hiện diện của request.
Do đó đề xuất có hai tầng; chỉ tầng A là "một dòng log", tầng B là thứ thật sự tạo ra bằng chứng dài hạn.

## 1. Lựa chọn
| | Mô tả | Giải quyết retention? | Thay đổi mã production | Chi phí | Ghi chú |
|---|---|---|---|---|---|
| **A. Dòng log có cấu trúc** | handler 404 ghi 1 dòng `console.warn(JSON)` | **Không**, trừ khi có drain (hoặc có người xem trong ≤ 1 giờ) | có (thêm logging) | ~0 | thêm phân loại; không thêm sự hiện diện |
| **B1. Log drain** | Vercel đẩy log sang kho ngoài (Axiom, Datadog, bucket…) | **Có** | không | phụ thuộc gói Vercel và nhà cung cấp; **UNVERIFIED** gói hiện tại có cho phép drain không | không đổi mã; cấu hình ngoài repo, owner làm |
| **B2. Bộ đếm tổng hợp trong KV** | handler 404 tăng một bộ đếm theo ngày và theo nhóm (không dữ liệu cá nhân) | **Có** (giữ theo TTL do ta chọn, ví dụ 45 ngày) | có (thêm 1 lệnh KV, fire-and-forget) | 1 lệnh Redis mỗi lần bị gọi (≈ 0 khi không ai gọi) | phá nguyên tắc "404 trước mọi xử lý" ở mức nhỏ (xem rủi ro); phụ thuộc E1 (KV hoạt động) |
| **C. Chấp nhận rủi ro** | không đo | – | không | 0 | owner ghi "accepted" |

**Khuyến nghị (PROPOSED):** (1) nếu gói Vercel cho phép và owner muốn bằng chứng thật → **B1** (không đổi mã; khi đã có drain thì A không cần thiết); (2) nếu không có drain → **A chỉ có giá trị khi kèm quy trình vận hành** (owner chạy truy vấn log theo lịch, ví dụ mỗi giờ trong 24 giờ đầu sau deploy) — nếu không thể vận hành như vậy thì A không tạo ra bằng chứng và **C** (chấp nhận rủi ro, ghi bằng văn bản) trung thực hơn; (3) **B2 không khuyến nghị** vì làm đường 404 phụ thuộc KV. Đây là khuyến nghị, quyết định thuộc owner.

## 2. Thiết kế tầng A (nếu được duyệt) — danh sách trường chính xác
Một dòng, `console.warn(JSON.stringify({...}))`, **đúng các khóa sau và không khóa nào khác**:
| Trường | Giá trị | Nguồn | Vì sao cần |
|---|---|---|---|
| `type` | `"tappyai_memory_post_disabled"` | hằng số | lọc log |
| `route` | `"/api/memory"` | hằng số | – |
| `status` | `404` | hằng số | – |
| `origin` | `"own"` \| `"other"` \| `"none"` | so sánh host của header `Origin` (hoặc `Referer`) với host của site; **chỉ in nhãn, không in giá trị** | phân biệt bundle Web cũ (own) với script/bên ngoài (other/none) |
| `bodyBytes` | `"0"` \| `"lt1k"` \| `"lt16k"` \| `"gte16k"` | từ `content-length` đã bucket hoá; không đọc body | cuộc gọi cũ gửi mảng `messages` (kích thước vừa); thăm dò rỗng khác |
| `clientClass` | `"browser"` \| `"android-http"` \| `"ios-http"` \| `"script"` \| `"other"` | phân loại từ `User-Agent` trong bộ nhớ rồi **bỏ UA**; chuỗi thô không bao giờ được ghi | tách bundle cũ khỏi script/ứng dụng |
| `hasSession` | `true` \| `false` | chỉ kiểm tra **sự tồn tại** của cookie/Authorization, không đọc giá trị | phân biệt người dùng đã đăng nhập với thăm dò ẩn danh |
Thời điểm, deployment id, path, method đã có sẵn trong bản ghi request của Vercel nên **không** thêm vào dòng log.

**Tuyệt đối không ghi:** request body, header Cookie/Authorization/giá trị token, IP, `User-Agent` thô, user id, query string, email, bất kỳ trường nào của `messages`. Không `JSON.stringify(req)` hay spread header.

**Giới hạn lưu lượng của chính dòng log:** kẻ tấn công có thể spam POST để tràn log; đề xuất lấy mẫu trong tiến trình (tối đa 1 dòng/phút/instance, các lần còn lại bị bỏ; số lần bị bỏ không ghi). Việc này đồng thời không làm thay đổi trạng thái 404.

## 3. Retention, chi phí, quyền truy cập
* **Retention:** ~1 giờ trên project này (VERIFIED, mục 0), cho cả dòng log mới lẫn bản ghi request sẵn có. Dài hơn chỉ khi B1.
* **Chi phí:** dòng log ≈ 200 byte mỗi lần ghi; số lần dự kiến ≈ 0. Không có chi phí provider/model. B2: ≤ 1 lệnh Redis mỗi lần bị gọi. B1: chi phí/gói của nhà cung cấp drain (**UNVERIFIED**).
* **Quyền truy cập:** thành viên team Vercel (dashboard hoặc `vercel logs`, như phiên kiểm tra này). Không có công cụ công khai. Nếu B1: quyền của kho ngoài (owner xác định).
* **Truy vấn sau triển khai:** dashboard Logs lọc `tappyai_memory_post_disabled`; CLI không lọc theo path/`--query` đáng tin (đã kiểm: `--query` **không** khớp path), nên dùng `vercel logs … --json` rồi lọc `type` phía client.

## 4. Rủi ro riêng tư và vận hành
| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Rò dữ liệu cá nhân qua log | thấp nếu giữ đúng danh sách trường | allow-list tĩnh + test khóa chính xác; test cấm chuỗi `cookie`, `authorization`, `messages`, IP-regex, email-regex trong đầu ra |
| UA là dấu vân tay | thấp | chỉ giữ nhãn lớp, bỏ UA thô |
| Log tràn do spam | trung bình | lấy mẫu 1 dòng/phút/instance |
| Thay đổi hành vi 404 | thấp | dòng log nằm sau việc xây response; bọc try/catch, không bao giờ ném; test cũ ("POST không chạm LLM/extraction/memory store/session lookup") giữ nguyên, thêm test "không đọc giá trị cookie/body" |
| Bằng chứng giả an toàn (không có dòng nào do log đã hết hạn 1 giờ) | **cao** | điều kiện VERIFIED yêu cầu drain hoặc kiểm tra theo lịch; "không thấy dòng" ≠ "không có caller" |
| B2 làm 404 phụ thuộc KV | trung bình | fire-and-forget, nuốt lỗi; nhưng giữ tính "không công việc" yếu hơn |

## 5. Acceptance tests (viết cùng thay đổi nếu duyệt; chưa viết)
1. POST (mọi caller/body) vẫn `404` rỗng, không gọi LLM/extraction/memory store/session lookup (test hiện có giữ nguyên).
2. Dòng log có **đúng** tập khóa ở §2; giá trị thuộc tập cho phép; không có chuỗi từ body/cookie/IP/email/UA.
3. Gọi với cookie/Authorization/body chứa chuỗi đánh dấu → chuỗi đó không xuất hiện trong đầu ra console.
4. Lấy mẫu: 100 lần gọi trong 1 phút ghi ≤ 1 dòng; vẫn trả `404` cho cả 100.
5. Lỗi khi ghi log (console ném) không đổi response `404`.
6. Đột biến: ghi body, ghi UA thô, bỏ lấy mẫu, bỏ try/catch — mỗi cái làm test fail.

## 6. Điều kiện để tuyên bố "rủi ro đã đóng" (không đổi so với register)
Nguồn log giữ ≥ 30 ngày (B1) **hoặc** quan sát theo lịch đủ một release, GET `/api/memory` > 0 trong cùng cửa sổ (kiểm tra bộ lọc), và 0 POST từ client thật; hoặc owner ghi "accepted". Cho tới lúc đó rủi ro **MỞ**.

## 7. Cần owner quyết định
1. Chọn A / B1 / B2 / C (khuyến nghị: B1 nếu khả thi, nếu không thì A kèm kiểm tra theo lịch hoặc C).
2. Nếu A: duyệt danh sách trường §2 (đặc biệt `clientClass`, `hasSession`, `origin`) và mức lấy mẫu.
3. Gói Vercel hiện tại có cho phép log drain không, và ai là người vận hành kho ngoài.
