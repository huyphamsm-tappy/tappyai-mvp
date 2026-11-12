# Hợp đồng trình bày v1 (Presentation Contract) — 12/11/2026

Trạng thái: **lát 1 xong** (thư viện thuần + test, chưa nối vào giao diện, chưa lưu, chưa phát từ máy chủ). Nhánh `feat/brain-r13-p1`, chưa push.
Mã: `src/lib/presentation/contract.ts` · Test: `src/lib/presentation/contract.test.ts` (32 test).

## 1. Vì sao cần

Một câu trả lời là văn bản + những thứ văn bản không mang: thẻ địa điểm, lịch trình, thẻ chủ thể/lựa chọn/tin, báo cáo nghiên cứu. Hôm nay giao diện nhận chúng qua **ba kênh với ba luật khác nhau** (đo ở `AUDIT-KIEN-TRUC-20261112.md` mục 6):

| Kênh | Ví dụ | Lưu cùng tin nhắn? |
|---|---|---|
| Marker trong văn bản (8 loại) | `[TAPPY_PLAN]`, `[TAPPY_MEDIA]`, `[TAPPY_SHOPPING]`, `[TAPPY_PLACES]`, `[TAPPY_ASK]`… | Có |
| Chú thích tạm của luồng (9 loại) | `tappy.places.v1`, `tappy.research.v1`, `tappy.turn_status.v1`… | **Không** (tin nhắn lưu chỉ có `{role, content}`) |
| Hình dạng văn bản | ≥ 8.000 ký tự và ≥ 4 tiêu đề `##` → "báo cáo"; tên in đậm → chip | không cần |

Hệ quả đã gặp: thẻ quán mất khi tải lại, hai hội thoại có câu mở đầu giống nhau dùng chung thẻ (bộ nhớ khóa theo 160 ký tự đầu), nút Mẹo mất khi mở hội thoại đã lưu.

## 2. Hợp đồng v1 là gì

```ts
Presentation = { v: 1, blocks: PresentationBlock[] }   // tối đa 12 khối
PresentationBlock =
  | { id, type: 'places', view: PlacesLiveView }        // thẻ địa điểm (kiểu có sẵn)
  | { id, type: 'plan',   plan: TappyPlan }             // lịch trình (kiểu có sẵn)
  | { id, type: 'media',  media: MediaBlock }           // thẻ chủ thể / lựa chọn / tin (kiểu có sẵn, đã kiểm host)
  | { id, type: 'report', title, sourceCount }          // thẻ tóm tắt báo cáo; mở báo cáo đầy đủ ở ngăn riêng
```

- **Chỉ gom lại, không thêm kiểu mới.** Mỗi khối dùng đúng kiểu và bộ kiểm hợp lệ mà sản phẩm đã có (`sanitizeMediaBlock`, `parsePlan`, `readPlacesLiveView`).
- **Không bỏ kênh cũ.** Marker và chú thích vẫn chạy; `presentationFromMessage` đọc chúng vào hợp đồng.
- **Chưa có khối `shopping`, `ask`, `comparison`** (bảng so sánh hiện là bảng markdown trong văn bản). Thêm sau khi cần, mỗi loại một lát có test.
- **Chưa có `anchor`** (vị trí khối trong văn bản). Hiện vị trí do `placeAnchoring` quyết theo văn bản và tên; sẽ đưa vào hợp đồng khi có nhu cầu.

## 3. Hai hàm

- `parsePlan`-style **cửa duy nhất cho dữ liệu từ ngoài**: `parsePresentation(raw)` → `Presentation | null`.
  - Bỏ khối sai, giữ khối đúng, không bao giờ ném lỗi; id 1–64 ký tự và duy nhất; tối đa 12 khối; chỉ quét 200 phần tử đầu; chỉ mang các trường đã biết (không mang `onClick`, `html`, `__proto__`); giới hạn kích thước (lịch trình 60 KB, danh sách địa điểm 120 KB, tiêu đề báo cáo 160 ký tự, số nguồn 0–1000).
- `presentationFromMessage({ content, annotations, recalledPlaces })` → `{ text, presentation }`: đọc marker và chú thích vào một hợp đồng, trả văn bản đã bỏ marker mà hợp đồng sở hữu (`[TAPPY_PLAN]`, `[TAPPY_MEDIA]`; marker hỏng cũng bị bỏ, không lộ ra).
  - Thứ tự khối cố định: report, media, plan, places. Id `type-n` ổn định.
  - Khối `report` chỉ khi văn bản đã là báo cáo (không phải khi nghiên cứu đang chạy). Số nguồn = max(số link trên thẻ nghiên cứu, số nguồn báo cáo tự liệt kê).
  - Kết quả luôn qua `parsePresentation` nên **idempotent**: parse lại không đổi gì.

## 4. Đã kiểm (ĐO)

32 test đạt. Gồm: 10 giá trị không phải hợp đồng, từng loại khối, khối sai không làm mất khối đúng, id trùng, giới hạn số khối, host thẻ không cho phép, kích thước, trường thừa, không ném lỗi với giá trị độc hại (vòng lặp, getter ném lỗi, mảng 1 triệu phần tử), và đọc từ từng kênh cũ. Đột biến (bỏ bước kiểm thẻ media) làm 2 test đỏ.

## 5. CHƯA làm (các lát sau; mỗi lát một commit, test đỏ trước, sau cờ, mặc định TẮT)

| Lát | Việc | Vì sao chưa làm / cần quyết |
|---|---|---|
| 2 | **Giao diện đọc hợp đồng**: `ChatInterface` dùng `presentationFromMessage` thay cho các lệnh `parse*/read*/recall*` rải rác (hiện 13 lệnh), vẫn giữ kết quả y hệt khi cờ tắt | Chạm `ChatInterface.tsx` (2.700 dòng). Cần test song song "cờ tắt = y hệt" và so ảnh trang thử `/dev/v206`. |
| 3 | **Lưu cùng tin nhắn**: thêm trường `presentation` vào tin nhắn lưu (`conversations.messages` là JSON) để thẻ không mất khi tải lại | **Cần quyết:** Android/iOS đọc `content`; trường thêm có bị bỏ qua an toàn không (chưa đọc mã hai app). Google Places cấm lưu nội dung địa điểm (xem chú thích `EMIT_PLACES_ANNOTATION`): khối `places` có được lưu không? |
| 4 | **Máy chủ phát hợp đồng** thay cho chú thích tạm; chú thích cũ giữ song song một thời gian | Chạm `route.ts` (hàm POST 4.400 dòng) và `streamEnrichment.ts`; cần đo không đổi hành vi. |
| 5 | Khối mới: `shopping`, `comparison`, `anchor` | Khi có nhu cầu đo được. |
| 6 | Thay heuristic hình dạng văn bản (≥ 8.000 ký tự → báo cáo) bằng cờ do máy chủ nêu trong khối `report` | Sau lát 4. |

## 6. Việc ĐO được nhưng chưa làm: bộ đo "câu hỏi → khối"

Hợp đồng chỉ đảm bảo giao diện vẽ đúng thứ được mô tả. **Việc mô hình/công cụ chọn đúng khối cho câu hỏi và ngữ cảnh** (T02, T04, T06, T09, T15) vẫn cần UAT chấm mù có trần chi phí do anh duyệt.

## 7. Quy tắc giữ khi làm tiếp

- Một nhánh `feat/brain-r13-p1` ở `D:\TappyAI-wt\wt-integration`; sửa mã chỉ bằng Edit/Write; LF; test viết trước, kiểm đột biến cho test bảo vệ quy tắc; không push/PR/deploy; không đụng production, Android, iOS.
- Cờ mới: TẮT mặc định, khóa ở production, test "cờ tắt = hành vi cũ".
