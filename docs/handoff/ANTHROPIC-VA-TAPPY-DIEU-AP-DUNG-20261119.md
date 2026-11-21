# Cách Anthropic tư vấn xây AI agent so với Tappy: điều áp dụng được (19/11/2026)

Nguồn đối chiếu chi tiết: `docs/handoff/AUDIT-20261118-tappy-vs-anthropic-agent-blueprint.md` và `docs/architecture-audit-20261118/`. File này chỉ chốt: cái gì Tappy đã có, cái gì đã làm trong phiên 18–19/11, cái gì đáng làm tiếp và cái gì KHÔNG nên bê nguyên. Không chép nguyên xi Anthropic; mỗi mục dựa trên số đo của Tappy.

## 1. Bảng đối chiếu (12 nguyên lý)

| Nguyên lý Anthropic | Tappy hiện tại | Trạng thái sau phiên này |
|---|---|---|
| Dừng có điều kiện, luôn có bước viết cuối | Có bước viết cuối (`finalWrite`); thang effort cho lượt nặng | ĐÃ CÓ. Thêm 19/11: lời gọi `present_*` bị từ chối không còn giết cả lượt (thành `present_failed`), danh sách chi phí kế hoạch không còn bắt buộc |
| Gọi công cụ song song | Prompt và `parallelTools` đã bật | ĐÃ CÓ |
| Kiểm chứng: trích nguyên văn, bỏ khẳng định không nguồn | `factSense.ts`, cổng giá/giờ | ĐÃ KHỚP |
| Tách nội dung không đáng tin khỏi chỉ dẫn | Khối dữ liệu có nhãn, `toolResultFence`, đọc link chỉ từ kết quả công cụ | ĐÃ KHỚP (chưa thử trang web độc hại thật) |
| Bộ công cụ nhỏ, không chồng chéo | 15 công cụ đều được dùng | ĐÃ ỔN |
| Bộ eval nhỏ cố định, LLM chấm, kiểm nhiều lần | Đã có `brain-eval-v1` (30 dev + 10 holdout, chấm mù, 3 lần) | ĐÃ CÓ. Bài học: nhiễu ±14 điểm, không dùng làm vòng lặp từng lát |
| Effort cố định trong lượt, đổi effort làm mất cache | `think_deeper` là công cụ, gọi ở ~100% lượt; sau 9 lần tra cứu effort hạ về none | MỘT PHẦN |
| Trần chi phí theo lượt, ghi usage | Có ghi usage; trần Serper có mã nhưng tắt mặc định | MỘT PHẦN |
| Cache đầu vào ≥ 80% | Lượt nặng ~66% | CHƯA |
| Ngữ cảnh gọn, cắt kết quả công cụ cũ | Lượt nặng ~127 nghìn token vào | CHƯA |
| Mô tả công cụ chính xác, độ chính xác lời gọi | `search_products` mở tới ~14 credit Serper mỗi lần (liên kết đối tác) | CHƯA |
| Prompt "đúng độ cao", ít luật sinh từ từng ca | 58 luật, ~40 KB | CHƯA |
| Chọn model theo vai, câu dễ đi model rẻ | Một model (Luna) cho mọi lượt chat | CHƯA |

## 2. Điều đáng áp dụng cho Tappy (theo giá trị trên rủi ro)

1. **Bật trần chi Serper/Parallel theo lượt và trần chi Anthropic** (R2, R6 trong audit): mã đã có và có test, đang tắt. An toàn tiền, không đổi chất lượng khi trần đặt rộng. Cần Owner chọn mức trần.
2. **Mô tả công cụ + `purchase_links` cho `search_products`** (nguyên lý "gọi đúng, không phình"): chính sách này đã được Owner duyệt 09/10 cho Agent Runtime, chưa áp cho One Brain. Đổi lại: giảm ~12% chi phí trung bình (lượt mua sắm 0,045 so với 0,016 USD), nhưng thẻ sản phẩm có thể mất nút mua khi model không khai báo ý định mua. **Quyết định của Owner** (tiền đối tác liên kết).
3. **Gộp `think_deeper` vào bước tra cứu đầu** (R18): bỏ một vòng gọi mỗi lượt. Phải đo mù vì đổi hành vi suy luận.
4. **Cache đầu vào** cho chat (đưa phần ổn định lên đầu prompt, giữ effort ổn định trong lượt): đo cache trước (R9), rồi mới sửa.
5. **Cắt tỉa ngữ cảnh chở lại qua các bước** (R17): sau R9.
6. **Rút gọn prompt**: gỡ từng lớp, mỗi lần một lớp, có cổng đo. Báo Owner trước khi gỡ.
7. **Chọn model theo vai**: để sau, cần số đo chất lượng của model rẻ trên câu dễ.

## 3. Không nên bê nguyên

- Kiến trúc đa agent con song song kiểu "orchestrator-worker" cho chat thường: tốn gấp nhiều lần token, Tappy chat đã chạy một vòng ~0,02 USD mỗi lượt. Chỉ hợp cho nghiên cứu sâu (đã có).
- Đổi sang model Claude cho chat: phép so Sonnet 5.5 + web cho thấy chênh nhỏ (3,22 so với 2,98 trên 5), model không phải nút thắt chính.
- Tự động hóa chấm mù làm cổng cho từng lát nhỏ: nhiễu lớn hơn hiệu quả.
