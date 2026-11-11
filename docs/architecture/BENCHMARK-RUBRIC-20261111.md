# Benchmark của Report Engine V2.1 — rubric và dữ kiện bắt buộc (M1, 11/11/2026)

Mục đích: biết một thay đổi của engine nghiên cứu sâu tốt hay tệ **trước khi** đưa lên UAT, thay vì đo vài câu rồi vá. Chủ sở hữu duyệt V2.1 và M1 ngày 11/11/2026. Mã: `src/lib/ai/research/benchmark/` (`benchmarkSet.ts`, `benchmarkScore.ts`) và bộ đo thật `liveMeasure.test.ts`.

## 1. Bộ 10 câu
| id | Loại | Câu hỏi |
|---|---|---|
| q01 | xu hướng | Xu hướng thị trường trà sữa tại Hà Nội |
| q02 | dự báo | Dự báo doanh thu trà sữa Việt Nam giai đoạn 2027–2029 và phân tích độ nhạy |
| q03 | xu hướng | Xu hướng thị trường cà phê tại TP.HCM |
| q04 | so sánh | So sánh Phúc Long, Highlands Coffee và Katinat về quy mô, doanh thu và chiến lược |
| q05 | giải thích | Thuế tiêu thụ đặc biệt đối với nước giải khát có đường từ 2027 ảnh hưởng thế nào đến quán trà sữa và cà phê? |
| q06 | xu hướng | Xu hướng giao đồ ăn trực tuyến tại Hà Nội và TP.HCM |
| q07 | dự báo | Dự báo doanh thu chuỗi cà phê và trà tại Việt Nam giai đoạn 2027–2029 và phân tích độ nhạy |
| q08 | xu hướng | Xu hướng thị trường xe điện tại Việt Nam năm 2026 *(ngoài F&B)* |
| q09 | dự báo | Dự báo thị trường thương mại điện tử Việt Nam giai đoạn 2027–2029 và phân tích độ nhạy *(ngoài F&B)* |
| q10 | rủi ro | Du lịch Việt Nam năm 2026: lượng khách quốc tế, xu hướng và rủi ro *(ngoài F&B)* |

Bảy câu F&B là miền của chủ sở hữu; ba câu ngoài F&B kiểm tra rằng engine tổng quát. **Cần chủ sở hữu duyệt hoặc thay câu hỏi.**

## 2. Sáu tiêu chí (0 đến 5 mỗi tiêu chí, trọng số của chủ sở hữu)
| Tiêu chí | % | Cách chấm | Neo điểm |
|---|---|---|---|
| Accuracy | 20 | **Người**: kiểm 5 con số chính với trang nguồn | 5 = cả 5 đúng; 3 = một sai hoặc mơ hồ; 1 = nhiều sai; 0 = bịa |
| Citation và Evidence Integrity | 20 | Tự động: tỷ lệ câu được nguồn xác nhận của Verifier ×5; **người** kiểm thêm 5 trích dẫn | 5 = tất cả khớp; 0 = trích dẫn không liên quan |
| Completeness | 15 | Tự động: tỷ lệ dữ kiện bắt buộc có trong báo cáo (câu dự báo: trung bình với 5 kiểm tra dự báo) | 5 = đủ |
| Source Quality | 15 | **Người**: tỷ lệ nguồn chính thức, sơ cấp so với SEO, tổng hợp; độ mới | 5 = chủ yếu chính thức và mới; 0 = chủ yếu SEO |
| Analytical và Decision Value | 20 | **Người**, trả lời 5 câu: tăng trưởng đến từ sản lượng hay giá? nhóm nào đóng góp nhiều nhất? nhóm nào mất thị phần? biến nào làm kết luận sai? người kinh doanh nên đổi quyết định gì? | 5 = trả lời đủ 5 câu có chứng cứ; 3 = 2–3 câu; 1 = chỉ liệt kê; 0 = không có |
| Efficiency và Conciseness | 10 | Tự động: 5 trừ 1 điểm cho mỗi 4 trang quá 8 (tối đa 3), 1 điểm cho mỗi 5 điểm lặp quá 5% (tối đa 2), 1 điểm nếu chi phí quá hạn mức tầng (0,15 Standard, 0,45 Advanced) | 5 = ≤ 8 trang, lặp ≤ 5%, trong hạn mức |

Tổng điểm = Σ (điểm/5 × trọng số), ra thang 100; thiếu một tiêu chí thì không có tổng, chỉ có điểm từng phần kèm phần trọng số đã phủ (`weightedTotal`).

**Giới hạn:** phần tự động chỉ đo cái mã đo được trung thực. Đúng sai của con số, chất lượng nguồn và giá trị quyết định **do người chấm**, không đoán bằng mã. Mục "mục có thể lạc đề" chỉ là gợi ý để người kiểm (nó cũng đánh dấu cả mục "Giá cả" hợp lệ).

## 3. Dữ kiện bắt buộc (BẢN NHÁP, chờ chủ sở hữu duyệt; ghi ở `benchmarkSet.ts`, trạng thái `draft`)
- **q01:** (1) dòng tiền dịch lên vùng 36.000–70.000 đồng (nửa đầu 2026); (2) thuế tiêu thụ đặc biệt 8% từ 2027; (3) làn sóng trà sữa 7.000 đồng ở Hà Nội kèm tên thương hiệu; (4) có số liệu nửa đầu 2026. *Căn cứ: bản Claude mẫu.*
- **q02:** (1) thuế 8% (2027) và 10% (2028) đưa vào phân tích; (2) mức nền kèm lý do các nguồn lệch (định nghĩa, phạm vi); (3) kịch bản thấp/cơ sở/cao cho 2027–2029; (4) độ nhạy theo sản lượng và giá; (5) dòng tiền dịch lên vùng giá cao làm cơ sở giả định giá. Cộng 5 kiểm tra dự báo: kịch bản, ba năm, độ nhạy, hòa vốn, giả định gắn nhãn.
- **q03:** ≥ 3 chuỗi lớn; số liệu năm 2026; mức giá một ly. *Cấu trúc.*
- **q04:** nêu cả ba thương hiệu; doanh thu bằng số kèm năm; số cửa hàng; chiến lược hoặc định vị.
- **q05:** 8% (2027), 10% (2028); ngưỡng đường 5 g/100 ml; nói rõ phạm vi áp dụng cho đồ uống pha tại quán chưa rõ; tác động tới giá hoặc sản lượng.
- **q06:** ShopeeFood và GrabFood; thị phần bằng số; hoa hồng hoặc chiết khấu; số liệu 2026.
- **q07:** kịch bản 2027–2029; độ nhạy; mức nền và phạm vi; gắn nhãn giả định.
- **q08–q10 (ngoài F&B):** chỉ kiểm cấu trúc (có tên đối tượng chính, có số liệu 2026, có số lớn kèm đơn vị, có rủi ro hoặc chính sách). **Chủ sở hữu cần bổ sung dữ kiện cụ thể** vì em không thể biết sự thật của ngày hôm nay ở các chủ đề này.

Mỗi dữ kiện là mẫu trên văn bản đã bỏ dấu và hạ chữ thường, nên khác dấu hoặc khác hoa thường không ảnh hưởng.

## 4. Chạy
```
RUN_LIVE_RESEARCH_MEASURE=1 BENCH_CAP_USD=6.5 MEASURE_OUT=<thư mục> \
  MEASURE_TIERS=standard:q02,advanced:q03,standard:q04,advanced:q04,... \
  npx vitest run --project app src/lib/ai/research/liveMeasure.test.ts --reporter=verbose --silent=false
```
`BENCH_CAP_USD` là trần chi của cả tiến trình: chạm trần thì các lượt còn lại bị bỏ qua. Mỗi lượt ghi `bench` (điểm tự động) vào JSON.

## 5. Độ tin cậy của chính phép đo
- Mỗi cấu hình mới chạy 1 lượt: **không đủ để nói tới tỷ lệ lỗi**. 0 lỗi trong n lượt chỉ cho giới hạn trên khoảng 3/n (n = 50 cho khoảng 6%; cần khoảng 150 lượt cho 2%). Cổng trước UAT: 50 lượt mỗi tầng với yêu cầu không có lỗi im lặng và mọi lỗi có mã; tỷ lệ dưới 2% chỉ được tuyên bố khi tích lũy đủ lượt, ưu tiên lấy từ nhật ký UAT thật.
- Phương sai giữa các lượt lớn (đã thấy: số bước bổ sung từ 4 đến 12 trên cùng câu hỏi), nên một lượt không đủ để so hai cấu hình; điểm mốc cần ghi rõ n.
