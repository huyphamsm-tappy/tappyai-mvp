# R13 đối chiếu với mã sau 13 lát (10/11/2026)

Nhánh `feat/brain-r13-p1`, cây `D:\TappyAI-wt\wt-integration`. Nguồn: `TappyAI_Master_Architecture_v3.0_Revision13_FINAL.md` (Downloads). Chưa push/PR/deploy. Mọi tính năng mới sau cờ TẮT, khóa trên production.

Ký hiệu: **XONG** = có mã + test và đã nối vào đường chạy (sau cờ) · **HÀM** = có mã + test nhưng CHƯA nối vào route/giao diện · **MỘT PHẦN** · **CHƯA** · **KHÔNG ĐỤNG** = đã có sẵn trong mã từ trước, chưa kiểm lại theo R13.

| Chương | Trạng thái | Ghi chú |
|---|---|---|
| 3.2 Thứ tự xử lý, 3.3–3.5 Context/Geo/Canonical Context Contract | KHÔNG ĐỤNG / CHƯA | Route hiện có đọc ý định và ngữ cảnh theo cách cũ; hợp đồng ngữ cảnh chuẩn R13 chưa dựng. |
| 3.2.3 Tin chỉ có đính kèm | HÀM (`attachments/policy.ts`) | Chưa nối: tin chỉ có ảnh vẫn đến mô hình không kèm tác vụ ngầm. |
| 3.2.4 Chuẩn hóa yêu cầu MCP ngoài | HÀM (`mcp/connectorContract.ts`) | Chỉ hợp đồng, không có cổng. |
| 4.1 Vai trò đa mô hình | XONG (sau cờ) | Luna có sẵn; Haiku 5.5 (Standard, gói việc), Sonnet 5.5 (Advanced lead) thêm, giá + hình dạng yêu cầu đo với API. |
| 4.2 Admission / Controller / Standard / Advanced | XONG (sau cờ) | Đồ thị gói việc phụ thuộc **tường minh** chưa dùng trong engine (dùng các vòng bổ sung nối tiếp). Ngưỡng là mặc định, chưa đo. |
| 4.3 Hợp đồng điều phối (WorkPackageAssignment/Result, ResearchGapRequest, khóa theo Context Version) | MỘT PHẦN | Luật duyệt gap, kiểm đồ thị và kiểm kết quả gói việc có (HÀM); đối tượng giao việc đầy đủ, ngân sách/đặt chỗ theo gói và khóa Context Version chưa. |
| 4.4 Vòng công cụ có trạng thái | KHÔNG ĐỤNG | Agent runtime hiện có. |
| 5.1–5.4 Provider Registry theo năng lực | CHƯA | Source Audit quyết REUSE/EXTEND/NEW. |
| 5.5 Market & Capability Gate, 6 Mô hình thị trường | HÀM (`market/marketGate.ts`) | Có kiểm theo Market+Vùng/Thành phố+Vertical+Capability+Action, phạm vi cụ thể thắng, thất bại đóng; `DEFAULT_REGISTRY` chỉ phản ánh hành vi hôm nay (Việt Nam). Chưa có bảng dữ liệu. |
| 7 Ngôn ngữ, bản địa hóa | KHÔNG ĐỤNG | Có phát hiện ngôn ngữ cũ; bốn lớp ngôn ngữ R13 chưa dựng. |
| 8.1–8.4 TVI lõi (bảng, vòng đời, staging) | XONG (sau cờ) | Migration `20261120` mới áp lên TEST. `TVI_CAPTURE` bật ở UAT cục bộ. |
| 8.5–8.6 Nguồn thẩm quyền, đánh giá dữ kiện | HÀM (`tvi/evidenceGate.ts`) | Chưa nối vào đường đọc (kho không thay lần gọi Serper: đã ghi trong tài liệu đóng băng). |
| 8.7 Lắp dossier xác định | HÀM (`research/dossier.ts`) | Chuẩn hóa, gộp trùng và phát hiện bài chép lại, xếp hạng BM25, nhóm dữ kiện, trạng thái bằng cổng §8.6, đóng gói theo ngân sách (không cắt dữ kiện quan trọng). Engine chưa dùng (bước của nó trả phát hiện, chưa phải dữ kiện); chưa đo mục tiêu <50 ms. |
| 9.1 Hợp đồng đầu ra work-package / Haiku / Sonnet | HÀM (`research/workPackageContract.ts`) | `WorkPackageResult` kiểm như dữ liệu không đáng tin: danh tính, phiên bản giao việc, nguồn/dữ kiện nằm trong gói nguồn của chính việc đó. `SynthesisResponse` có cấu trúc claim chưa dựng. Engine chưa dùng. |
| 9.2 Verifier độc lập | MỘT PHẦN (`claimVerifier.ts`) | Chỉ kiểm **con số và id trích dẫn**, không kiểm nghĩa; mới ghi nhật ký. |
| 9.3 Mâu thuẫn bằng chứng | HÀM (`conflictMetadata.ts`) | Dữ liệu có cấu trúc, ghi nhật ký; giao diện chưa hiển thị. |
| 9.4 Sửa có giới hạn | HÀM | `nextRepairAction` có; engine vẫn dùng sửa V2 (theo các phần của câu hỏi), chưa chạy lại Verifier sau mỗi lần sửa. |
| 9.5 Kiểm từng phần khi stream | CHƯA | |
| 10.2 Tool Permission Gateway | KHÔNG ĐỤNG | `gateTools` hiện có, chưa kiểm theo R13. |
| 10.3 Chống prompt injection nhiều lớp | KHÔNG ĐỤNG | Hàng rào `fenceUntrusted` có sẵn và được dùng trong nghiên cứu. |
| 10.4 Truy xuất an toàn SSRF | KHÔNG ĐỤNG | 20 tệp đã nhắc SSRF. |
| 10.5 An toàn theo ngữ cảnh | HÀM (`safety/emergencyPayload.ts`) | **Kho đường dây nóng RỖNG**, chờ Chủ sở hữu; chưa có bộ phân loại, kho episode, văn bản, giao diện. |
| 10.6 Bảo mật đầu ra | KHÔNG ĐỤNG | |
| 10.7 Danh tính MCP, OAuth | HÀM (hợp đồng) | Không có OAuth server. |
| 11 CSDL, RLS, cư trú dữ liệu | MỘT PHẦN | Bảng TVI chỉ cho service-role; còn lại không đụng. |
| 12 Bộ nhớ đệm | KHÔNG ĐỤNG | |
| 13 Gói, hạn mức, kinh tế đơn vị | MỘT PHẦN | Tiểu hạn mức Advanced (ĐỀ XUẤT); chặn chi phí theo ngày có nhưng NGỦ theo ý Chủ sở hữu; hồ chi tiêu MCP chỉ khóa. Sổ chi phí chưa có cột mô hình. |
| 14 Độ tin cậy | MỘT PHẦN | TVI không bao giờ làm hỏng lượt; việc nền bền vững (MCP) chưa. |
| 15 Quan sát | MỘT PHẦN | Nhật ký mới: admission, verification, conflicts, tier. |
| 16 Hiệu năng / benchmark | CHƯA | Chưa đo Standard vs Advanced vs engine cũ (Chủ sở hữu tự UAT). |
| 17 Kiểm thử chấp nhận | MỘT PHẦN | Mỗi lát có test đơn vị; bộ chấp nhận theo chương chưa dựng. |
| 24 Đa phương thức, camera | HÀM (chính sách) | Còn: cấu trúc tệp Office, bom giải nén, OCR, Vision theo nhà cung cấp, camera, giao diện ba nền tảng. |
| 25 Cổng MCP ngoài | HÀM (hợp đồng) | Cổng thật chờ Source Audit + Chủ sở hữu cho phép (ADR-CONN-019). |

## Việc còn lại có thể làm mà không cần Chủ sở hữu
- Nối `attachments/policy`, `marketGate`, `emergencyPayload` vào route/giao diện sau cờ (rủi ro: route chat 4.500 dòng; làm từng bước có test).
- Dựng các đối tượng hợp đồng 4.3, lắp dossier xác định 8.7, kiểm từng phần khi stream 9.5.
- Dựng bộ chấp nhận theo 17.x cho phần đã có.

## Việc cần Chủ sở hữu
Xem `docs/handoff/VIEC-CAN-HUY-SANG-11-11-20261110.md` (ở cây g1-growth).
