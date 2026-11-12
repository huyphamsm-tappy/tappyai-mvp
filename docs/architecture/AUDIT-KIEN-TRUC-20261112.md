# Audit kiến trúc Tappy (web) — 12/11/2026

Nhánh `feat/brain-r13-p1` (HEAD `7906339`), cây `D:\TappyAI-wt\wt-integration`. Chỉ đọc: không sửa mã nào để viết tài liệu này.
Nhãn: **ĐO** = em đếm/đọc trực tiếp trong mã hoặc git ở phiên này; **SUY** = em suy ra từ bằng chứng (có thể sai); **CHƯA** = em chưa kiểm.

## 1. Tóm tắt (đọc phần này nếu chỉ có 1 phút)

1. Một câu hỏi của người dùng đi qua **một hàm `POST` dài 4.393 dòng** (`src/app/api/chat/route.ts`, dòng 225–4617, 207 import). **ĐO**
2. Trong hàm đó **ba thế hệ kiến trúc cùng sống**, nối với nhau bằng các biến `oneBrain`, `agentOn`, `agentV2`: (a) bộ định tuyến luật + hard filter + chấm điểm cũ ("Consultative V2/V3"), (b) "Một bộ não" (mô hình là bên duy nhất đọc câu hỏi), (c) agent runtime Luna (`TAPPY_AGENT=2`). Có 16 chỗ `!oneBrain` chặn mã cũ, 76 dòng nhắc `oneBrain`. **ĐO**
3. Kiến trúc đã được **đóng băng 4 lần rồi mở khóa** (tài liệu đóng băng dài 311 dòng, 8 mục, đa số là nhật ký sửa lỗi). Tài liệu kiến trúc đã thành một cuốn nhật ký vá. **ĐO**
4. 4 tuần qua: **741 commit, trong đó 265 là `fix` (36%)**; `route.ts` bị 115 commit chạm vào và phình từ 3.611 lên 4.617 dòng. **ĐO**
5. Điều anh yêu cầu hôm nay ("hiểu ngữ cảnh rồi tự chọn bố cục, đừng vá từng case") **đã được ghi trong mã ngày 28/10** (`oneBrain.ts`, dòng 3): "sửa cái gốc, tappy nó hiểu ngữ cảnh". Phần *hiểu* đã giao cho mô hình. Phần *kênh nói cho giao diện biết cần hiển thị gì* thì **chưa có hợp đồng có kiểu**: giao diện phải đoán từ marker, chú thích tạm và hình dạng văn bản. Đó là chỗ vá mù sinh ra. **ĐO (hiện trạng) + SUY (nguyên nhân)**

## 2. Bản đồ hệ thống (dòng mã không tính test)

| Tầng | Dòng | Ghi chú |
|---|---:|---|
| `src/lib` | 165.777 | trong đó `src/lib/ai` 67.533 |
| `src/app` (route + trang) | 52.925 | `api/chat/route.ts` một mình 4.617 |
| `src/components` | 29.258 | `ChatInterface.tsx` 2.702 |
| `src/lib/ai/consultative` | 18.352 | 98 tệp: luật, ý định, hard filter, thẻ, One Brain |
| `src/lib/ai/tools` | 9.508 | công cụ gọi bên ngoài (Serper, giá, thời tiết…) |
| `src/lib/ai/agent` | 8.103 | agent runtime Luna |
| `src/lib/ai/research` | 4.471 | nghiên cứu sâu (engine riêng) |

Quy mô kiểm thử: 1.760 tệp mã, **1.720 tệp test**. **ĐO**

## 3. Đường đi của một câu hỏi (web, chế độ chat)

Mốc dòng trong `route.ts` (**ĐO**):

| Dòng | Giai đoạn |
|---:|---|
| 235–264 | nhận phần đệm của request trước; hàng rào tin cậy đầu vào |
| 442 | **quyết định thế hệ**: `oneBrain = consultOneBrainOn() && !tappyAgentEnabled() && !clipRef` |
| 511 | agent runtime v2 (Luna) dùng chung các bước bên dưới, khác ở chỗ đánh dấu `agentV2` |
| 722–805 | cổng ý định lượt, hạn mức câu hỏi AI, hợp đồng lượt, tín dụng hỏi lại |
| 1011, 1332 | trạng thái bằng chứng quyết định (ADR-024) |
| 1051 | cổng 18+ (trước hạn mức và trước mọi lệnh gọi mô hình) |
| 1518 | "nhu cầu có cấu trúc" của Consultative V2 (gộp từ cả lịch sử) |
| 1898–1946 | hard constraints, Brief, đề xuất nới, shortlist |
| 2450 | lời dặn của One Brain (`ONE_BRAIN_CORE` + phần động) |
| 2588–3316 | khai báo công cụ (`search_places`, `web_search`, `get_flight_prices`, `present_plan`…) |
| 3726 | khối agent runtime có giới hạn |
| 4233–4320 | làm giàu ảnh sau mô hình |
| 4447–4503 | ghi một bản ghi chi phí khi byte cuối rời đi |

Mô hình thật (One Brain): đọc cả hội thoại, tự chọn công cụ, tối đa 8 bước (2 bước để viết), trần 8.000 token mỗi bước. Mã giữ lại: an toàn, trần chi phí, hạn mức, hiển thị thẻ cho những gì mô hình đã tra. **ĐO** (`ONE-BRAIN-FREEZE-20261102.md` mục 1, `oneBrain.ts`).

## 4. Ba thế hệ trong một hàm

- Bộ định tuyến luật cũ (`consultRouter.ts`, theo chính chú thích trong `oneBrain.ts` là "~180 pattern checks") **vẫn được import và gọi** (`route.ts` dòng 172, 547, 568, 589). Dưới One Brain nó bị né bằng guard, không bị gỡ. **ĐO**
- Mã đặc thù theo chủ đề vẫn nằm trong hàm: tìm phim (`wantsFilmTitles`), tìm chuyến bay trước (`planFlightPresearch`), câu trả lời đóng hộp (`cannedMovie`…), đều có `!oneBrain` đi kèm. **ĐO**
- 16 cờ "unwind" (`consultUnwind*`) tồn tại chỉ để gỡ dần từng mảnh luật cũ. **ĐO**
- Bản thân nhà phát triển ghi nhận rủi ro này: R13 đối chiếu 10/11 viết "rủi ro: route chat 4.500 dòng; làm từng bước có test". **ĐO**

**SUY:** vì chỉ một biến chọn thế hệ nên mỗi tính năng mới phải đúng trong 2–3 nhánh, và mỗi lỗi có thể nằm ở nhánh mà người đo không chạy.

## 5. Cờ: thực chất là nhiều sản phẩm khác nhau

- **214** biến môi trường khác nhau được đọc trong `src` (không tính test): 56 tên `CONSULT_*`, 29 `NEXT_PUBLIC_*`, 15 `LLM_*`, 10 `RESEARCH_*`, 5 `DEEP_RESEARCH_*`, 8 `TAPPY_*`. **ĐO**
- Quy tắc cũ: mọi cờ consult **TẮT** và **bị khóa ở production** trừ khi tên nằm trong `CONSULT_PRODUCTION_ALLOW` (`consultFlags.ts`). **ĐO**
- Bản UAT localhost mở khoảng **66–69 cờ** (`flags-uat.json`). **ĐO**
- Hệ quả (**SUY**): sản phẩm anh UAT ở cổng 3000, sản phẩm production mặc định (cờ tắt) và "bản R13 đầy đủ" là **ba hành vi khác nhau**. Trạng thái thật của production hiện nay em **CHƯA** kiểm (bộ nhớ ghi 31 biến Vercel đã lưu nhưng chưa hiệu lực sau lần deploy 02/11).
- R13 tại 10/11: 11 chương ở trạng thái "HÀM" (có mã + test, chưa nối vào đường chạy) và nhiều chương "MỘT PHẦN". Một phần đã được nối sau đó (đính kèm, cổng thị trường, khẩn cấp). **ĐO** (`R13-DOI-CHIEU-SAU-LAT-20261110.md`).

## 6. Giao diện: bố cục được quyết định ở đâu

Mô hình không có cách có kiểu để nói "hãy hiển thị thứ này như một bảng so sánh / dòng thời gian / thẻ". Giao diện suy ra từ ba kênh trộn lẫn (**ĐO**):

| Kênh | Ví dụ | Được lưu cùng tin nhắn? |
|---|---|---|
| Marker trong văn bản (8 loại) | `[TAPPY_PLAN]`, `[TAPPY_MEDIA]`, `[TAPPY_SHOPPING]`, `[TAPPY_PLACES]`, `[TAPPY_ASK]`… | **Có** |
| Chú thích của luồng (9 loại) | `tappy.places.v1`, `tappy.research.v1`, `tappy.turn_status.v1`, `tappy.doc_media.v1`… | **Không**: tin nhắn lưu chỉ có `{role, content}` |
| Hình dạng của văn bản | bảng markdown → hộp dữ liệu; `>` → callout; tên in đậm → chip thực thể; **văn bản ≥ 8.000 ký tự và ≥ 4 tiêu đề `##` → "báo cáo"** (`looksLikeReport`) | không cần |

Hệ quả đã gặp (**ĐO**, từ mã và từ trang thử hôm nay):
- Thẻ địa điểm biến mất khi tải lại hội thoại, nên có bộ nhớ trong tab khóa theo **160 ký tự đầu của câu trả lời** (`liveViewCache`) → hai hội thoại có câu mở đầu giống nhau dùng chung thẻ (đã ghim bằng test `it.fails`).
- Nút "Mẹo" mất khi mở hội thoại đã lưu vì thứ tự effect cha/con (đã sửa hôm nay, `edaff0d`).
- `ChatInterface.tsx` gánh tất cả: 2.702 dòng, 90 import, 43 `useState`, 25 `useEffect`, 22 `useRef`, và 13 hàm `parse*/read*/recall*/remember*` cho các kênh trên.

**SUY:** đây là gốc của việc "sửa xong thẻ này lại hỏng thẻ kia": cùng một ý định hiển thị đi qua 3 kênh với 3 quy tắc sống còn khác nhau, và không có một chỗ nào kiểm chung.

## 7. Số liệu vá (git, từ 15/10)

- **741 commit**: 275 `feat`, **265 `fix`**, 68 `test`, 55 `docs`, 24 `chore`, 8 `refactor`. **ĐO**
- Từ 28/10 (ngày One Brain ra đời) đến 12/11: 486 commit. Đỉnh: 83 commit ngày 01/11, 82 ngày 02/11. **ĐO**
- Tệp bị sửa nhiều nhất: `route.ts` 114, `streamEnrichment.ts` 51, `deepResearchDeps.ts` 50, `deepResearch.ts` 36, `consultFlags.ts` 30, `ChatInterface.tsx` 30, `oneBrain.ts` 29. **ĐO**
- `route.ts`: 115 commit, +1.411 / −418 dòng; 3.611 → 4.617 dòng. **ĐO**
- Hạ tầng làm việc: 1.256 nhánh, 26 worktree, 567 tệp markdown trong `docs`, 17 ADR. **ĐO**

## 8. Vì sao dậm chân (nhận định, nhãn SUY)

1. **Thiếu một hợp đồng trình bày có kiểu và được lưu.** Mô hình hiểu (One Brain làm việc đó), nhưng điều nó "muốn hiển thị" không có chỗ để nói ra một cách có kiểu. Giao diện đoán, nên mỗi câu hỏi mới lộ một kẽ hở.
2. **Một hàm, ba thế hệ, hai trăm cờ.** Không ai (kể cả em) kiểm được hết các tổ hợp. Mỗi sửa lỗi an toàn trong một nhánh thì nhánh khác có thể lệch.
3. **Cổng chấp nhận không phủ bố cục.** Bộ đo mù 30 ca đo chất lượng nội dung; không có bộ đo nào hỏi "với câu này, mô hình chọn đúng loại khối chưa, và giao diện vẽ đúng chưa". Nên vòng lặp thật là: anh nhìn ảnh, phát hiện, sửa.
4. **Quy trình ghi lại bằng nhật ký thay vì thiết kế.** Đóng băng 4 lần rồi mở khóa từng lát; tài liệu thiết kế không thể tách khỏi lịch sử sửa.

## 9. Hướng đề xuất (không phải vá; mỗi mục cần anh duyệt trước khi làm)

| # | Việc | Mục đích | Cổng nghiệm thu |
|---|---|---|---|
| A | **Hợp đồng trình bày có kiểu, một kênh, lưu cùng tin nhắn**, máy chủ kiểm trước khi gửi (`blocks`: văn bản, so sánh, mốc thời gian, thẻ địa điểm, báo cáo, bảng…). Mô hình (hoặc mã dựng từ kết quả công cụ) nêu loại khối; giao diện chỉ vẽ theo loại. Marker và chú thích hiện có được **đọc vào** hợp đồng này, không bỏ đột ngột. | Chấm dứt việc đoán; thẻ không biến mất khi tải lại; không còn khóa 160 ký tự. | Test hợp đồng + trang thử `/dev/v206` chạy qua đúng hợp đồng |
| B | **Chọn một đường chạy chuẩn (One Brain)** và gỡ dần các nhánh `!oneBrain` / `agentV2` / luật cũ theo từng lát, mỗi lát đo mù không tệ hơn. | Còn một hành vi để hiểu. | Bộ đo 30 ca + chấm mù |
| C | **Cắt `route.ts` thành các giai đoạn thuần** (đầu vào → cổng → ngữ cảnh → công cụ → chốt → làm giàu → phát), mỗi giai đoạn một tệp có test; không thêm tính năng trong lúc cắt. | Kiểm được từng khúc; dừng phình. | `architectureFreeze.test.ts` giữ nguyên xanh |
| D | **Bộ đo chọn khối**: câu hỏi → khối mô hình chọn (chấm mù), tách khỏi test vẽ giao diện. Đây mới là chỗ đo "hiểu ngữ cảnh → bố cục". | Có số, hết vòng lặp nhìn ảnh. | UAT model thật có trần chi phí anh duyệt |
| E | **Quản lý cờ**: mỗi cờ có chủ và ngày; cờ đã thắng thì thành mặc định rồi xóa; cờ thua thì xóa. | 214 → số quản lý được. | Danh sách cờ trong tài liệu, kiểm bằng test |
| F | **Dọn nhánh/worktree** (giữ 10 cây One Life theo dặn của anh). | Bớt nhiễu. | Danh sách xóa do anh duyệt |

Thứ tự em đề nghị: **A trước** (nó trả lời trực tiếp câu "nó hiểu ngữ cảnh thì tự biết dùng layout nào"), **D song song** (để có số), rồi B, C, E, F. Không bước nào cần đụng production hay app.

## 10. Em chưa kiểm (đừng coi là đã rõ)

- Hành vi thật của production hiện giờ (cờ nào đang hiệu lực).
- Chất lượng trả lời của mô hình theo từng loại câu hỏi (cần UAT có trần chi phí).
- Android và iOS (chỉ biết qua tài liệu đóng băng, chưa đọc mã).
- Em không đọc hết 98 tệp `consultative`, 8.103 dòng `agent`, và 4.471 dòng `research`; những mục ở trên về các khu đó chỉ dựa vào tên tệp, chú thích đầu tệp và tài liệu đóng băng.
- Con số "ba thế hệ" dựa vào cấu trúc biến trong `route.ts` và chú thích; em chưa chạy từng nhánh để xác nhận nhánh nào thực sự được kích hoạt trên bản UAT.
