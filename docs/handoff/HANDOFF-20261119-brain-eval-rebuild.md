# BÀN GIAO 19/11/2026 — Làm lại bộ não Tappy web theo kiến trúc Anthropic, có đo (phiên 18–19/11)

Người đọc: phiên Claude mới. Viết tiếng Việt với anh Huy. **Đọc hết file này trước khi làm gì.** Phiên cũ hết ngữ cảnh; mục tiêu và luật nằm ở đây, đừng hỏi lại anh những gì đã chốt.

## 1. Mục tiêu anh Huy đã chốt (nguyên ý)

1. Làm lại phần ĐIỀU KHIỂN của bộ não Tappy web cho đủ bốn yếu tố: **hiểu đúng câu hỏi và ngữ cảnh và dùng đúng layout** (ưu tiên 1), **bảo mật hệ thống và dữ liệu** (2), **tối ưu chi phí** (3), và nhanh. Dừng kiểu "sửa chỗ này hỏng chỗ kia".
2. Áp dụng **nguyên lý** kiến trúc Anthropic (không đổi sang Claude; Luna `gpt-6-luna` vẫn là model chính). Anh dặn: đừng cắt token/ngữ cảnh bừa; để model gọi đúng thông tin cần; tối ưu **tiền mỗi lượt đạt**, không phải tiền mỗi token.
3. **Không đòi hoàn hảo: đạt trên 80% là đóng băng**; phần còn lại sửa khi có người dùng. Nếu tốt hơn thì càng tốt.
4. **Giữ nguyên toàn bộ layout và bố cục mới (mockup RFC-001)**; tắt layout cũ. Không đổi hợp đồng giao diện (`present_blocks`, `present_plan`, các khung annotation).
5. Chất lượng KHÔNG được giảm: mỗi thay đổi một commit, qua cổng eval, tụt thì hoàn lại.
6. Xong thì **đóng băng kiến trúc**, rồi **soạn 20 câu UAT mọi lĩnh vực, chạy trên giao diện thật, chụp ảnh từng câu, GỬI ẢNH QUA ĐIỆN THOẠI** (SendUserFile từng ảnh; anh xem bằng điện thoại, không xem được trên PC).
7. **Xong hết rồi mới dọn rác một lần**: xóa `D:\Claude\TappyAI-scratch\trees2` (khoảng 6 GB, có bản sao `.env.local`).

## 2. Luật làm việc (bắt buộc)

- Sửa mã CHỈ bằng Edit/Write (cấm heredoc, `sed -i`, `python -c`, `echo >`). File LF. Mọi chữ anh đọc bằng tiếng Việt, ngắn, trung thực, tách nhãn ĐÃ ĐO / SUY LUẬN / CHƯA KIỂM. Không nói chắc khi chưa kiểm (đã sai vài lần: xem mục 7).
- **MỘT nhánh duy nhất** cho web: `feat/brain-r13-p1` @ `D:\TappyAI-wt\wt-integration`. KHÔNG tạo nhánh hay worktree mới. Các thư mục nháp ở `D:\Claude\TappyAI-scratch\trees2` là thư mục thường bung bằng `git archive`, không phải worktree.
- Chỉ commit CỤC BỘ, không push, không deploy, không đụng production. Không sửa cây `g1-growth`. Giữ 10 cây One Life.
- **Không đụng kiến trúc nghiên cứu sâu và truy xuất thông tin** (chỉ đo; chi phí nghiên cứu cần anh cho phép riêng).
- Không in/đọc nội dung `.env*` (các bộ chạy nạp khóa bằng `process.loadEnvFile` trong tiến trình). Không ghi DB, không áp migration. Dữ liệu eval ghi tệp cục bộ.
- Kỹ thuật tự quyết, không hỏi anh phương án kỹ thuật; chỉ hỏi quyền, tiền, gu sản phẩm, riêng tư, production. Anh nói rõ: đừng đặt trần ngân sách làm mục tiêu, cần RA KẾT QUẢ; báo số tiền đã chi sau mỗi chặng.
- Test: mỗi thay đổi có test và **thử phá** (mutation) trước khi giữ; test cũ ghim luật cũ thì sửa có chủ đích và nói rõ. Chạy vitest dùng `--reporter=json --outputFile=<tệp ngoài repo>`.
- Bộ eval khóa: không sửa chữ câu hỏi/rubric sau khi khóa (đổi = v2). **Holdout 10 câu giữ KÍN** (ngoài repo, chỉ nhìn dòng tổng, không chỉnh theo từng câu).
- Nhiễu giữa các lần chạy lớn (một lần 30 câu: "Tốt" dao động 43–70%) → một lần chạy không đủ kết luận thay đổi nhỏ; dùng mốc đầy đủ 3 lần và bài thử nhắm đúng ca hỏng.

## 3. Trạng thái code (nhánh feat/brain-r13-p1, chưa push)

Tag: `brain-baseline-20261116`, `brain-freeze-20261117` (b0fe4bf = bản đo nền). Commit sau tag (cũ → mới):

| Commit | Nội dung | Trạng thái |
|---|---|---|
| 4b69275 | docs: bộ eval brain-eval-v1 khóa (dev-30, rubric, kế hoạch, thiết kế Giai đoạn 1) | giữ |
| ba3b926 | dự trữ thời gian (S2) | đã thay bằng 2422377 (không kích hoạt lần nào); hàm cũ bị xóa |
| feaa47e | biến `CONSULT_AUTOTHINK_EFFORT` (none/low/medium, mặc định medium = không đổi) để đo | giữ |
| 2422377 | **thang effort**: các bước sau `think_deeper` giữ medium, hạ về `none` sau 9 lần tra cứu (`HEAVY_TURN_LOOKUPS`) | giữ, qua cổng |
| c67dc7d | thẻ quán gập sau "Xem thêm N chỗ" khi câu trả lời đã nêu tên quán (`PlaceDecision collapsed`) | giữ; chưa giảm cờ "khối trùng" |
| a6fda56 | mua sắm kết bằng lựa chọn một dòng, giữ chip `[FOLLOWUPS]`, không hỏi ngược (anh chọn "cách 2, kiểu ChatGPT") | giữ; câu hỏi thừa 16% → 3% |
| 176e39c | thẻ sản phẩm/quán giữ bảng so sánh do model khai báo (chỉ ẩn khi `cmpNode` đã có bảng) | mới, chưa qua cổng |

## 4. Số đo (giao diện thật, người chấm Opus 5.5 chấm mù ảnh + chữ)

**Đo nền (b0fe4bf, 90 lượt = 30 câu × 3 lần):** "Tốt, tính cả lỗi loại thẳng" 58% (nhiễu 43–70%); "Rất tốt" (chặt) 47%; "Dùng được" 83%; 6 khung đỏ + 5 thẻ trần (hầu hết kế hoạch); khối trùng/lệch 37%; câu hỏi thừa 16%; hard-fail 18%; trung vị 51 s, 32% lượt >60 s; chi phí 0,0198 USD/lượt (Serper 68%), **0,042 USD mỗi lượt đạt**; holdout 40% (chỉ tổng).
**Bài thử 11 lượt kế hoạch (D30, D26, D24):** effort medium 4/11 hỏng, trung vị 116 s · low 2/11, 56 s · none 1/11, 62 s (nhưng tụt chất lượng địa điểm/tư vấn khi dùng cho MỌI lượt) · **thang effort 0/11, 70 s, nội dung 3,38**.
**Cổng 30 câu (r1):** thang effort: content 3,51, 0 lượt không có câu trả lời; S5 (thẻ gập + bỏ câu hỏi): content 3,60, câu hỏi thừa 3%, khối trùng 40% (không giảm).
**Bảo mật:** 11/11 thăm dò đạt (SSRF, lộ system prompt, chèn lệnh, link lạ, lừa đảo OTP, đòi khóa, ép lặp công cụ, hạn mức khách, thân quá lớn); CHƯA thử nội dung web độc hại thật.
**Sonnet 5.5 thuần (+web_search gốc) vs Tappy, 12 câu:** 3,22 vs 2,98; Tappy hơn ở nguồn dẫn (2,92 vs 2,25), thua ở đầy đủ và rõ ràng; Sonnet+web ~0,13 USD/lượt vs Tappy ~0,027 → model Luna KHÔNG phải giới hạn chính.
**Nghiên cứu sâu (3 báo cáo qua giao diện):** Standard ~86–99 s, ~0,12 USD; Advanced 251 s, 0,607 USD (khớp mốc cũ).
**Đã chi:** khoảng 25–30 USD API trong phiên 18–19/11 (OpenAI từng hết credit, anh đã nạp; Anthropic dùng cho người chấm và nghiên cứu sâu).

## 5. Nguyên nhân gốc đã chứng minh (không phải đoán)

1. `think_deeper` được gọi ở 100% lượt → mọi bước sau chạy effort medium (500–3.500 token suy nghĩ ở ~100 token/s = 5–35 s mỗi bước) + hạn cứng `TURN_DEADLINE_MS = 110 s` (`route.ts`) → lượt kế hoạch hết giờ, luồng bị ngắt khi chưa có chữ, khung đỏ "Mình gặp trục trặc". Hạ effort cho MỌI lượt làm tụt địa điểm/tư vấn → dùng thang effort.
2. Commit `0e5e19e` (17/11 tối) ẩn bảng so sánh model khai báo khi có thẻ → chữ nói "giá trong bảng" mà trang không có bảng (D18). Đã sửa ở 176e39c.
3. Cờ `NEXT_PUBLIC_TAPPY_ANSWER_V4` (layout bài 19/10) bật song song RFC-001: tắt cờ KHÔNG giải quyết "hai thiết kế song song" (đã đo) nhưng anh yêu cầu tắt → đã tắt trong `flags-uat-blocks.json`.
4. `search_products` ở chế độ links mở tới ~14 lần Serper mỗi lần gọi (link đối tác/ảnh/trang bán); trung bình 2,3 lần gọi/lượt mua sắm → 38 Serper, 0,0497 USD. Không có truy vấn trùng (cache trong lượt vô ích). Chi phí do chính sách "mọi sự kiện có nguồn" và độ chính xác lời gọi, không cắt bừa.
5. Thẻ không khớp lời khuyên (khách sạn D28, sản phẩm D18, giá lệch): thẻ dựng từ thứ hạng công cụ, chữ do model chọn.
6. Ghi chú bộ đo: D25 ("Sa Pa 2 ngày, đi bằng gì và ở đâu") bị phạt "thiếu lịch trình" 5/5 lần nhưng câu hỏi không đòi lịch trình → bộ khóa v1 quá chặt; báo cả hai cách tính ở số cuối, sửa ở v2.
7. Lời nhắc đã CÓ sẵn câu gọi công cụ song song (`oneBrain.ts` dòng 42); độ song song thấp do phụ thuộc giữa các bước.

## 6. Đang chạy và việc còn lại

**ĐANG CHẠY NỀN (có thể đã xong khi bạn đọc):** mốc đo đầy đủ M1 trên commit `176e39c` (30 câu × 3 + holdout 10, giao diện thật, rồi chấm mù 100 lượt; ~2,5 giờ, ~8 USD). Kết quả ở `D:\TappyAI-review-artifacts\eval-runs\`: `UI-m1-r1`, `UI-m1-r2`, `UI-m1-r3`, `UI-m1-holdout`, `judge-ui-m1.json`, nhật ký `m1-driver.log`. Đọc bằng `eval-summarize-ui.mjs --runs UI-m1-r1,UI-m1-r2,UI-m1-r3 --holdout UI-m1-holdout --judge judge-ui-m1.json` (trong `measure30`). Nếu tiến trình chết giữa chừng thì chạy lại `measure30\scripts\ui-milestone.sh` (đã sao lưu ở đó).

Việc còn lại theo thứ tự:
1. Đọc kết quả M1, so với đo nền (số ở mục 4). Báo anh bằng tiếng Việt, thẳng thắn, kèm số tiền.
2. Nếu "Tốt, tính cả lỗi loại thẳng" chưa tới 80%: lát tiếp theo theo số đo, KHÔNG vá từng ca:
   - rà **mô tả công cụ** (`web_search`, `search_products`, `search_places`) để model gọi đúng từ lần đầu; đo số vòng gọi;
   - lỗi loại thẳng ở **mua sắm** (giá/thông số không nguồn, thiếu bảng) và **kế hoạch** (thiếu visa, thiếu thời tiết, thiếu lịch);
   - **chi phí** `search_products`: chỉ tìm link đối tác cho đúng sản phẩm câu trả lời nêu tên (không đặt trần cứng);
   - thẻ lệch lời khuyên; markdown thô, nhãn không hợp (GrabFood cho coworking, "Lưu địa điểm" dưới câu không phải địa điểm);
   - bảo mật: nối `urlGrants` vào luồng phát hành link, thử nội dung web độc hại thật, trần chi tiêu thống nhất;
   - rút prompt 58 luật và thử gỡ từng lớp phụ — báo anh TRƯỚC khi gỡ.
3. Đạt cổng (≥80% "Tốt tính cả lỗi loại thẳng" trên dev và holdout [chỉ dòng tổng]; ≤2% lượt không có câu trả lời/khung lỗi; bảo mật 100%; tiền mỗi lượt đạt thấp hơn 0,042 USD; trung vị thấp hơn 51 s) → xin anh gắn **tag đóng băng**, vẫn KHÔNG deploy.
4. **UAT 20 câu mọi lĩnh vực** (câu mới, không dùng bộ khóa), giao diện thật, chụp ảnh từng câu (`ui-eval-run.mjs` đã chụp 2 ô 1280×2000), **gửi từng ảnh qua điện thoại** bằng SendUserFile kèm một dòng nhận xét mỗi câu.
5. **Dọn rác một lần**: xóa `D:\Claude\TappyAI-scratch\trees2` (có `.env.local` sao chép).

## 7. Bài học trung thực của phiên (đừng lặp lại)

- Đã nói chắc điều chưa kiểm: "không có bước viết dành riêng" (sai, có `finalWriteStream`), "prompt thiếu câu gọi song song" (sai), "mã bị mất/layout bị đổi" (thực ra máy chủ trơn thiếu cờ), "dự trữ thời gian sẽ sửa lỗi" (không kích hoạt lần nào). Kiểm bằng log/mã trước khi kết luận.
- Bộ chạy API che lỗi giao diện (khung đỏ không nằm trong phần chữ) → chấm trên GIAO DIỆN THẬT mới đúng.
- Máy chủ UAT mở bằng `next dev` trơn thiếu cờ layout/nghiên cứu, và `.env.local` bật `SUBSCRIPTIONS_ENABLED` (khách thành Free không công cụ) → luôn mở bằng bộ cờ UAT. Gán `ANTHROPIC_API_KEY=` rỗng trong bash làm máy chủ mất khóa; dùng `env -u ANTHROPIC_API_KEY`.
- Không chạy hai `next dev` cùng thư mục; không chạy hai lượt chat cùng lúc trên một máy chủ; hạn mức khách 5 câu theo địa chỉ, nằm trong bộ nhớ máy chủ (khởi động lại giữa nhóm).

## 8. Bản đồ công cụ (ngoài repo)

`D:\TappyAI-review-artifacts\consultative-wave3\measure30\`: `ui-eval-run.mjs` (chạy câu hỏi qua giao diện thật, ảnh 2 ô + chữ + log từng lượt), `eval-judge-ui.mjs` (chấm mù ảnh+chữ, Opus 5.5), `eval-summarize-ui.mjs`, `eval-judge.mjs` (chấm chữ), `security-probe.mjs` (11 thăm dò), `sonnet-web-arm.mjs`, `gen-ui-cases.mjs`, `ui-dev-30x3.json`, `ui-holdout-10.json`, `ui-stress-plan.json`, `uat-localhost.cjs` (máy chủ cổng 3000 với `UAT_FLAGS=flags-uat-blocks.json`, `MEASURE_REPO=<thư mục>`), `scripts\*.sh` (cổng nhẹ, mốc, thí nghiệm). Kết quả ở `..\..\eval-runs\`. Bộ eval khóa ở repo `docs/eval/brain-eval-v1/` (MANIFEST.json có hash); holdout ở `D:\TappyAI-review-artifacts\eval-holdout\holdout-10.json` (KHÔNG đọc từng câu).

## 9. Prompt cho phiên mới (dán nguyên văn)

```
Em là kỹ sư chính của Tappy web, tiếp tục công việc của phiên trước. Đọc kỹ trước khi làm gì: (1) D:\TappyAI-wt\wt-integration\docs\handoff\HANDOFF-20261119-brain-eval-rebuild.md (mục tiêu, luật, số đo, việc còn lại), (2) memory MEMORY.md của dự án (mục "18/11 đêm LÀM LẠI BỘ NÃO CÓ ĐO"). Làm việc ở D:\TappyAI-wt\wt-integration, nhánh feat/brain-r13-p1; KHÔNG tạo nhánh hay worktree mới; chỉ commit cục bộ; không push, không deploy, không đụng production, không đụng kiến trúc nghiên cứu sâu, không đổi layout/bố cục mới (RFC-001) hay hợp đồng giao diện.

Mục tiêu anh Huy đã chốt: hiểu đúng câu hỏi + đúng layout, bảo mật, tối ưu chi phí, nhanh; đạt trên 80% ("Tốt, tính cả lỗi loại thẳng") thì đóng băng; chất lượng không được giảm; mỗi thay đổi một commit qua cổng eval, tụt thì hoàn lại; áp NGUYÊN LÝ Anthropic (đúng thông tin, không cắt token bừa), Luna vẫn là model chính. Xong thì UAT 20 câu mọi lĩnh vực chụp ảnh GỬI QUA ĐIỆN THOẠI, rồi dọn D:\Claude\TappyAI-scratch\trees2 một lần.

Việc đầu tiên: kiểm xem mốc đo M1 (mục 6 của file bàn giao) đã xong chưa; đọc kết quả, so với đo nền, báo anh bằng tiếng Việt thẳng thắn (đã đo / suy luận / chưa kiểm, kèm số tiền); rồi làm tiếp theo mục 6 mà không hỏi lại những điều đã chốt. Luật cứng: chỉ Edit/Write để sửa mã (cấm heredoc, sed -i, python -c, echo >), LF, mọi chữ anh đọc là tiếng Việt, không nói chắc khi chưa kiểm, không in .env*, gửi báo cáo bằng SendUserFile kèm đường dẫn đầy đủ.
```
