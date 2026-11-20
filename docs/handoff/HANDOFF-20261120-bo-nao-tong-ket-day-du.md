# BÀN GIAO 20/11/2026 — TỔNG KẾT ĐẦY ĐỦ BỘ NÃO TAPPY WEB (19–20/11) VÀ VIỆC CÒN LẠI

Người đọc: phiên Claude mới (tài khoản khác), và anh Huy. **Đọc hết file này trước khi làm gì.** Phiên cũ hết hạn mức tuần; mục tiêu, luật và mọi thứ đã làm nằm ở đây, đừng hỏi lại anh những điều đã chốt. Tài liệu này bổ sung (không thay) hai bàn giao cùng thư mục: `HANDOFF-20261119-brain-eval-rebuild.md` (làm lại bộ não có đo, 18–19/11) và `HANDOFF-20261120-web-viec-con-lai.md` (các việc web ngoài bộ não: gói, thanh toán, thông báo…). Hai file đó vẫn đúng cho phần của chúng.

---

## 0. Đọc nhanh

| Mục | Giá trị |
|---|---|
| Thư mục / nhánh | `D:\TappyAI-wt\wt-integration`, nhánh `feat/brain-r13-p1`. **CHỈ MỘT nhánh cho web**: không tạo nhánh hay worktree mới |
| Commit mới nhất lúc viết | `7a26233` (20/11/2026). Tag đóng băng cục bộ `brain-freeze-20261119` được dời theo commit cuối mỗi lượt sửa; lúc viết = `7a26233` |
| Đẩy GitHub / deploy | **CHƯA.** Mọi thứ chỉ có trên máy. Production vẫn là bản deploy 04/11. Anh Huy: làm xong hết rồi deploy MỘT lần, và deploy là anh quyết |
| Kiểm thử | Toàn bộ bộ test `src` xanh lúc 20/11 (khoảng 25.900 test, 0 lỗi); `tsc` sạch. Một test `src/lib/admin/breakGlassBoundary.test.ts` đôi khi đỏ khi chạy chung cả bộ và xanh khi chạy riêng (nhiễu tải, không liên quan) |
| Cơ sở dữ liệu thử (UAT) | `zdaprdfgpbpnxyofagmc` (KHÁC production `fwznnobrdctuskgrvuik`). Tài khoản UAT: `qa.admin.uat…` (gói Promax). **Hỏi phép anh trước mọi thao tác GHI vào DB UAT** |
| Máy chủ thử | `localhost:3000`, dựng từ một thư mục `git archive` của commit chọn (xem mục 7). Tắt cùng máy mỗi tối; bật lại bằng script, rồi lấy link đăng nhập một lần |
| Việc anh đang chờ nhất | Hai mục mới trong kế hoạch du lịch: **"Chỗ ở gợi ý"** và **"Món nên thử"** (mục 6, việc 1); PDF kế hoạch còn mất hình (việc 2) |

---

## 1. Mục tiêu và luật của anh Huy (đã chốt qua nhiều ngày — đừng hỏi lại)

**Mục tiêu sản phẩm**
1. Bộ não Tappy web: **hiểu đúng câu hỏi/ngữ cảnh, dùng đúng layout** (ưu tiên 1), bảo mật hệ thống và dữ liệu (2), tối ưu chi phí (3), và nhanh. Dừng kiểu "sửa chỗ này hỏng chỗ kia".
2. Model chính vẫn là Luna `gpt-6-luna`. Áp NGUYÊN LÝ kiến trúc của Anthropic/OpenAI (một vòng lặp tác tử mặc định; **mã giữ hạn cứng**, prompt nói cho model biết cùng hạn đó; mô tả công cụ chính xác; tham số model→công cụ chính xác), không đổi sang Claude, không cắt token/ngữ cảnh bừa. Chất lượng KHÔNG được giảm.
3. **Không vá từng ca / không chỉnh prompt cho một ca**: sửa theo loại lỗi, bằng quy tắc chung hoặc bằng mã. (Anh nhắc lại 20/11: "e vá từng case nên bị đúng không?" — câu trả lời đúng phải là: lỗi 4 người là trí nhớ tài khoản UAT bị nhiễm bởi chính các câu thử của mình, đã sửa bằng quy tắc chung; xem mục 4.)
4. **Giữ nguyên layout mới** (RFC-001 / mockup `D:\TappyAI-review-artifacts\TappyAI_Web_Mockups.html`, cờ `NEXT_PUBLIC_TAPPY_ANSWER_V4="1"`). Layout cũ đã tắt. Sáu nút gợi ý cũ đã ẩn (Tư vấn, Giải thích, Tìm quanh đây, Tappy Tối Nay, Lên kế hoạch trip, Theo dõi giá).
5. **Đối tác affiliate**: khách sạn = **Agoda** (không phải Booking.com), vé xe/tàu/máy bay = **Vexere**, mua sắm = **Lazada**; đối tác đứng trước; nền tảng khác chỉ để tham khảo (dòng "📎 Tham khảo thêm"). Có thể lấy giá realtime từ Agoda/Vexere.
6. So sánh 2 chủ thể = 2 thẻ + bảng; 3 chủ thể = 3 thẻ + bảng; mục liệt kê (lịch sử…) phải đủ thông tin mỗi mục; giọng nghiêm với lịch sử/chính trị.
7. Kế hoạch du lịch phải **đặc sắc**: "ấn tượng đầu tiên nên đặc sắc", chơi tới khuya (bar/pub/chợ đêm, trừ khi khách xin nhẹ hoặc đi cùng người già/trẻ nhỏ), trọn gói (đi lại + chỗ ở + giá + mẹo + dự toán), **không tự chốt số người/ngày/ngân sách** và cuối câu hỏi lại phần còn thiếu; kế hoạch ngắn "hôm nay rảnh" phải biết **giờ hiện tại** và gợi ý spa/ăn/cà phê hợp giờ.
8. Nhanh hơn: anh phàn nàn nhiều lần về tốc độ.
9. Nghiên cứu sâu: không được thua Haiku/Sonnet khi tốn hơn; bố cục đúng; nguồn đúng. Anh đã nói "báo cáo chuyên sâu mai a xử lý cũng được" nhưng 20/11 duyệt làm 4 hạng mục (soát trích dẫn, mô hình định lượng, phạm vi, số học — mục 3C).
10. Xong thì đóng băng, rồi **soạn 40 câu mới** (không dùng bộ đã tinh chỉnh) để đo thật. Tinh chỉnh trên đúng 45 câu cũ có thể làm điểm đẹp hơn thực tế — em đã thừa nhận với anh.

**Luật làm việc (cứng)**
- Sửa mã CHỈ bằng Edit/Write (cấm heredoc kể cả rỗng, `sed -i`, `python -c`, `echo >` lên mã nguồn). LF. Một hook an toàn đã chặn `sed -i` một lần. Tệp nháp ngoài repo thì được.
- Mọi chữ anh đọc (chat, tiến độ, ô wrap_up, nút) bằng **tiếng Việt**, ngắn, **trung thực**, tách nhãn ĐÃ ĐO / SUY LUẬN / CHƯA KIỂM. Anh không phải dev và đây là dự án AI đầu tiên: giải thích đơn giản, ít thuật ngữ. Không nói chắc điều chưa kiểm (đã sai nhiều lần; ví dụ 20/11 em viết nhầm "đổi nút thành tải HTML" trong khi chưa làm — chưa có nút Tải HTML).
- Tiếng Việt có dấu **không** được nằm trong chú thích/mã nguồn ngoài `src/lib/i18n` (test `webHardcodedUiStrings` đếm dòng, mốc 432). Chữ cho người dùng vào từ điển i18n (`src/lib/i18n/presentation.ts` dạng `[vi, en]` cho nhiều khóa mới). Chú thích mã bằng tiếng Anh/ASCII.
- **Một nhánh duy nhất**; chỉ commit CỤC BỘ; không push/deploy/đụng production; không sửa cây `g1-growth`; **giữ 10 cây worktree One Life** (game); thư mục nháp ở `D:\Claude\TappyAI-scratch\trees2` là thư mục thường (`git archive`), không phải worktree.
- Chỉ làm trên ổ **D** (không tạo gì Tappy trên C, trừ thư mục tạm của công cụ).
- Không in/đọc nội dung `.env*` hay tệp khóa (script nạp khóa trong tiến trình bằng `process.loadEnvFile`; kiểm khóa chỉ bằng script in đúng/sai). Không in khóa.
- Kỹ thuật tự quyết, **không hỏi anh phương án kỹ thuật**; chỉ hỏi quyền (tải, tài khoản, ghi DB), tiền, gu sản phẩm, riêng tư, production.
- Mỗi thay đổi = commit cục bộ + test + **thử phá (mutation)**; test cũ ghim luật cũ thì sửa có chủ đích và nói rõ. Chạy vitest bằng `--reporter=json --outputFile=<tệp ngoài repo>` rồi đọc `numFailedTests` TRƯỚC khi commit (một lần chuỗi `&&` sau `node -e` trả 0 làm commit lọt khi test đỏ). Sau khi chạy cả bộ: `git checkout -- docs/audit`.
- **Không chạy hai `next dev` cùng thư mục** (làm hỏng `.next`); đo bằng cổng/thư mục riêng. Không chạy hai lượt chat cùng lúc trên một máy chủ.
- CẤM dùng/dẫn nguồn từ sản phẩm AI khác (AIHAY là đối thủ).
- Báo cáo/ảnh gửi anh bằng `SendUserFile` với **đường dẫn đầy đủ** (anh xem trên điện thoại, không xem được trên PC). Anh vẫn xem trên Chrome PC khi cần (công cụ Claude in Chrome).
- Hỏi phép trước khi xóa thứ chưa được duyệt; chỉ lệnh nhỏ và đã duyệt (đã xóa `trees2` một lần ở lượt đóng băng đầu; thư mục `gate-*` sinh lại mỗi lần dựng server).

---

## 2. Bản đồ hệ thống (để làm việc nhanh)

- **Tuyến chat một bộ não**: `src/app/api/chat/route.ts` (rất lớn). Cờ `CONSULT_ONE_BRAIN`; model `gpt-6-luna`, Responses API; vòng công cụ tối đa 8 bước; `think_deeper` bật effort medium cho các bước sau; **thang effort**: sau `HEAVY_TURN_LOOKUPS=9` lần tra cứu → effort none; `TURN_DEADLINE_MS=110 s`; hạn nghiên cứu 270 s (`maxDuration` 300).
- **Prompt một bộ não**: `src/lib/ai/consultative/oneBrain.ts` (`ONE_BRAIN_CORE`, `PRESENT_PLAN_DESCRIPTION`, `THINK_DEEPER_DESCRIPTION`, dòng chế độ). Quy tắc chung nằm ở đây; **không** thêm quy tắc theo một ca.
- **Hiểu câu hỏi song song**: `src/lib/ai/answerV4/understand.ts` (`understandTurn`: intent, shape, needs_fresh_data) chạy BÊN CẠNH câu trả lời, trước đây chỉ dùng cho layout/ảnh; nay còn cấp **hạng lượt** cho lớp điều phối.
- **Lớp điều phối mỏng** (mới 19/11): `src/lib/ai/consultative/turnBudget.ts`: hạng light/lookup/plan; hạn tra cứu theo công cụ, tổng, thời gian (tính **từ lần tra đầu tiên**, không từ đầu lượt) và số **vòng** (plan = 1 vòng, light = 2, lookup = 3); báo cho model trong prompt (`TURN_BUDGET_PROMPT`) và mã chặn trong `finalSynthesisGuard` (route). Không có hạng thì giữ giới hạn cũ. Agent Runtime (`src/lib/ai/agent/*`) tồn tại nhưng **không** dùng cho web một bộ não.
- **Layout/khối**: `present_blocks` (profiles/compare/gallery/booking) khai báo bởi model, kiểm bởi `src/lib/presentation/declare.ts` (`mergePresentations` ghép nhiều lần gọi); `verifyDeclaredFacts` (`answerV4/factSense.ts`) cắt điểm không có nguồn; `ArticleAnswer`, `V206PlaceCard`, `TripTimeline` (kế hoạch).
- **Thẻ theo lời văn**: `src/lib/ai/consultative/proseRanking.ts` (`rankingFromProse`): thẻ = những mục câu trả lời **nêu tên** (in đậm hoặc chữ thường), theo thứ tự nêu; hai chi nhánh cùng tên chọn theo tên đường; chữ chung ("khách sạn", tên thành phố) không đủ để khớp.
- **Kế hoạch**: công cụ `present_plan` (route) + `planNight.ts` (mỗi ngày trừ ngày về có điểm ≥ 20:30, trừ khi `gentle: true`), `planCosts.ts` (**mã tự cộng** từ `costs_vnd`; model không viết tổng), `planPartnerLinks.ts` (khách sạn → trang Agoda + giá/đêm; xe khách/tàu → trang Vexere), một lần "gửi trả" duy nhất khi thiếu đêm hoặc thiếu `costs_vnd`; `planMarkdown.ts` + nút **Tải PDF**; nút **Chia sẻ liên kết** sao chép link `/plan/<id>`.
- **Trang chia sẻ công khai**: `src/app/plan/[shareId]/PlanBrochure.tsx` + `src/lib/plans/share/planShare.ts` (snapshot ≤ 56 KB; mới 20/11: thêm `costs`, `tips`, ngắn, không link).
- **Nghiên cứu sâu**: `src/lib/ai/research/*` (`deepResearch.ts` điều phối, `deepResearchDeps.ts` prompt/lược đồ, `thesisReport.ts` bộ phân tích → bộ viết → `releaseText/filterVerified`, `sectionRelease.ts`, `forecastModel.ts`, `arithmeticCheck.ts` mới, `evidenceCards.ts`…). Hiển thị: `ResearchCanvas.tsx`, `lib/chat/presentation.ts` (`footnotesOf`, `linkCitations`), PDF `lib/answerDoc/reportPdf*.ts`.
- **Tin tức**: `getNews` trong `src/lib/ai/tools/food.ts` (đã theo mục kinh tế/công nghệ/thể thao/thế giới, luôn có kết quả dự phòng).
- **Màn hình chat trống**: `components/chat/HomeGreeting.tsx` + `lib/chat/homeGreeting.ts` (một dòng chào theo giờ thiết bị, gọi tên từ profile; mascot lớn; không còn nút cảm xúc/câu hỏi gợi ý).

---

## 3. ĐÃ LÀM (19–20/11) — theo nhóm, kèm commit

Quy ước: **Code** (đã commit) / **Test** (có test, xanh) / **Chạy thật** (đã thấy trên giao diện thật, DB thử). Chưa có mục nào lên production.

### A. Sửa theo UAT của anh 19/11 (cuối ngày) — các lỗi hiển thị và chọn thẻ
| Việc | Commit | Chạy thật |
|---|---|---|
| Hai lần gọi `present_blocks` giờ **ghép** (trước: lần sau ghi đè lần đầu → mất thẻ nhân vật) | `6e0935d` | ✓ |
| Nhãn lặp trong thẻ/bảng ("Elon Musk: Doanh nghiệp - …") | `3aade91` | ✓ |
| Tin kinh tế rỗng → lấy theo mục + luôn có tin mới nhất | `8ca1556` | ✓ |
| Quán Tappy nêu tên mà không có thẻ (hai chi nhánh cùng tên; tên viết thường) | `8ca1556`, `ee05196`, `0a916d8` | ✓ một phần |
| Khách sạn: tra bằng `get_hotel_prices` (có giá + nút Agoda); offer Agoda không khớp hàng nào thành thẻ riêng; câu "Bấm nút đặt phòng để xem giá cuối cùng" | `8ca1556`, `ee05196` | ✓ |
| Thẻ khách sạn bị gán nhầm (Menora ↔ Sài Gòn) do chữ chung | `5560e9f` | ✓ |
| Bảng giá vỡ ("231." + hàng dính) do câu giải thích dính sau hàng cuối | `5dedcba` | không tái hiện lại sau sửa |
| Nút "Lưu địa điểm" hiện sai trên câu giá xăng/thời tiết/tin/vé | `746e411` | ✓ |
| Chip "Nguồn · N" đếm theo **trang** (không theo báo); ký tự `>` thô được tách | `5486f07`/`29db36b` | ✓ |
| Mô tả công cụ vận chuyển: ngày thật của chuyến, tàu chỉ khi có đường ray | `5486f07` | — |
| Test chuyển khoản đỏ → test lỗi thời (gói là dữ liệu **dẫn xuất** từ sổ cấp quyền chỉ ghi thêm); sửa cách dựng test, giữ nguyên mọi điều kiện kiểm | `820c7de` | ✓ 45/45 |

### B. Lớp điều phối + tốc độ + kế hoạch du lịch
| Việc | Commit | Ghi chú |
|---|---|---|
| Lớp điều phối mỏng (hạng lượt → hạn tra cứu) | `453765b` | báo trong prompt + mã chặn |
| Hạn thời gian tính từ **lần tra đầu** (lượt khởi động chậm 64 s trước đó bị cấm tra → "công cụ không hoạt động") | `bdcfdde` | **lỗi do chính lớp mới** |
| Số vòng tra cứu tối đa (plan 1, light 2, lookup 3) | `b223325`, `a611201` | một vòng tra thêm tốn ~15 s |
| Kế hoạch **trọn gói** (đi lại + chỗ ở + giá, dự toán từng khoản, 4–6 mẹo, giọng bạn rành chỗ đó); kế hoạch ngắn theo giờ hiện tại | `8ca1556` | ✓ |
| **Mỗi ngày có đêm** (≥ 20:30, bar/pub/chợ đêm/nhạc); chỉ miễn khi `gentle: true`; kiểm bằng mã, gửi trả 1 lần | `7c1f9ac` | ✓ (Quy Nhơn: Surf bar, cocktail bar) |
| Tổng dự toán do **mã cộng** từ `costs_vnd` (model không viết tổng) | `72644d8`, `bf4c332` | ✓ |
| Nút **Tải PDF** kế hoạch (cùng trang thiết kế của báo cáo, nhãn riêng "DU LỊCH") | `3a6b8e4`, `6d8542d` | ✓ tải được; **không có ảnh** |
| Kế hoạch "gửi trả" nếu có tổng tự viết thay vì `costs_vnd` | `bf4c332` | ✓ |
| **LỖI NẶNG do em gây rồi sửa 20/11**: `present_plan` ném lỗi "translate is not a function" trên server thật vì import từ module `'use client'`; test vitest không thấy. Đã đổi sang từ điển thường + **test canh ranh giới** `src/lib/ai/serverClientBoundary.test.ts` | `a7bef52` | ✓ |
| Không còn thẻ địa điểm "thừa" dưới thẻ kế hoạch (chỉ thẻ quán mà lời văn nêu tên) | `54b069a` | ✓ |
| **Không tự chốt số người/ngày/ngân sách**; giá theo từng người khi chưa biết số người; cuối câu hỏi lại phần còn thiếu; kế hoạch phải có chỗ ở + chặng đi (khách sạn từ `get_hotel_prices` kèm giá/đêm) | `54b069a`, `7a26233` | ✓ |
| Trí nhớ không còn đưa **số người** cho model (chỉ gợi ý phong cách) | `7a26233` | ✓ |
| Hàng liên kết: **Agoda/Vexere/Lazada** một dòng; nền tảng khác dòng "📎 Tham khảo thêm" | `9a26908` | ✓ |
| Khách sạn trong kế hoạch nhận trang Agoda + giá/đêm; xe khách/tàu nhận trang Vexere | `0ad3e20` | ✓ tàu; khách sạn **chỉ khi** tra giá trả về đúng khách sạn đó |
| **Chia sẻ kế hoạch = sao chép link trang công khai** (ảnh điểm, lịch trình, dự toán, mẹo) thay vì ảnh | `8c04950`, `becc5eb` | **chưa tự bấm thử trên giao diện** (cần đăng nhập thật) |
| Màn hình chat trống: mascot lớn + MỘT dòng chào theo giờ, gọi tên (từ đầu tiên trong profile) | `843e254`, `4f912ce` | ✓ (tên: tài khoản UAT chưa có tên nên chưa thấy) |

### C. Nghiên cứu sâu (anh duyệt 4 hạng mục 20/11)
| Việc | Commit | Kết quả |
|---|---|---|
| Soát trích dẫn/nguồn: dòng nguồn mất phần "— trang" vẫn nhận; dấu `[n]` không có nguồn bị bỏ; danh sách nguồn không in hai lần; ngày nguồn ngoài 2005..năm sau bị bỏ; số "N nguồn" = số **đã liệt kê** | `a7bef52`, `c67cbbb`, `29db36b` | ✓ trên 3 báo cáo thật |
| Mô hình kịch bản chỉ chạy khi đại lượng là **tiền** và đúng **chủ đề** câu hỏi (`measuresSubject`, `isMonetaryUnit`) | `c690221` | có test |
| Không thu hẹp chủ thể câu hỏi (gia đình trẻ = bố mẹ + con); phần chưa phủ ghi vào "điều chưa chắc" | `ad14189` | prompt |
| Người viết kiểm "hai số có thể cùng đúng không" (phần không lớn hơn tổng…) | `ad14189` | prompt, chưa có kiểm bằng mã giữa các câu |
| Câu phụ thuộc vào câu đã bị cắt ("Nhưng…", "Các số này…", "Xem mục 3.") bị cắt theo; đoạn mất ≥ 3/5 câu bỏ cả đoạn | `71e8377`, `ded0f6a` | ✓ hết câu cụt trong lỗi Opus nêu |
| **Kiểm số học bằng mã** (`arithmeticCheck.ts`): a/b kèm %, tăng giảm từ A lên B kèm %, điểm phần trăm; sai thì câu không hiện | `340e4f7` | có test + thử phá; **chưa chạy lại trên báo cáo thật** |
| Chip nguồn/PDF của nghiên cứu hiện số nguồn đã liệt kê | `29db36b` | ✓ |

### D. Khác
- Ẩn sáu nút cũ, hộp "đối tác mở trang riêng không qua khung đọc", đọc entities HTML (`6f59b49`); Lazada dẫn đầu thẻ sản phẩm (`129dc23`); thẻ khách sạn có giá Agoda + thời điểm kiểm (`68bc2f1`, `109a3ea`); `purchase_links` (mua sắm chỉ tìm link mua khi khách có ý mua, tiết kiệm ~9 credit/lần gọi: `b2c5f77`); `present_failed` (một lệnh `present_*` bị từ chối không làm hỏng cả lượt: `5dbcf08`, `9aacdbc`, `8278daf`); báo cáo nghiên cứu lớn hơn (`e785f93`, `91ba98b`; Advanced rút về cỡ cũ `ec715ab` vì chạm hạn 270 s).

---

## 4. Số đo (giao diện thật; người chấm Opus 5.5 chấm mù ảnh + chữ)

**UAT 45 câu (1101–1145), vòng d (bản `453765b`):** trung vị **40 s**, 90% dưới 88 s, chi phí chạy 2,08 USD; điểm đúng 3,76 / nội dung 3,22 / nguồn 3,28 / bố cục 3,31 (vòng a: 3,90/3,10/3,33/3,31) — **chênh nhau trong sai số người chấm (~0,3)**; 0 lỗi nặng. Mạnh: lịch sử/kiến thức/tư vấn; yếu: quán, khách sạn, mua sắm, kế hoạch. Mỗi sửa chỉ chạm 2–6 câu nên trung bình nhích ít.
**Chạy lại ca lỗi (15 câu) sau sửa quán/khách sạn/kế hoạch:** quán 1117–1119 tốt lên (+1); 1116/1120 xấu đi → đã sửa thêm (tên đường chọn chi nhánh, tên ngắn không đẻ thẻ); 1121 hết "chỉ 1 thẻ" sau khi sửa nhầm thẻ + hạn thời gian.
**Nghiên cứu sâu (4 báo cáo, thang 10):**
| | Opus V1 | Opus V2 | Opus V3 | ChatGPT V1→V2 | Gemini V1→V2 |
|---|---|---|---|---|---|
| Lãi suất-BĐS (nâng cao) | 6 | 6 | 5 | 7,4→7,0 | 7,0→7,5 |
| AI-lao động (nâng cao) | 6 | 5 | 6 | 7,5→6,8 | 7,8→7,2 |
| Xe điện (tiêu chuẩn) | 4 | 5 | 5 | 6,3→6,6 | 5,3→6,2 |
| Bảo hiểm (tiêu chuẩn) | 4 | 4 | 5 | 6,1→6,0 | 4,8→5,7 |
| Trung bình | 5,0 | 5,0 | 5,25 | 6,8→6,6 | 6,2→6,65 |
Ba người chấm xếp hạng giống nhau (nâng cao > tiêu chuẩn); Opus khắt hơn ~1–1,5 điểm. Lỗi lặp lại: số liệu mâu thuẫn **giữa các câu** (189.000 < 196.919 của VinFast; phí tăng/giảm theo tuổi), sai phép tính (đã có mã kiểm), nguồn gắn lệch ý, lệch phạm vi câu hỏi, mô hình kịch bản vô nghĩa (đã gate).
**Tốc độ kế hoạch du lịch (giao diện):** 65–97 s (trước 76–93 s); phân rã đo được: tra cứu ~3 đợt (đã gộp còn 1), viết kế hoạch ~23–31 s (3.400–3.900 token). Còn chậm.
**Chi phí:** UAT 45 câu ~2 USD; một báo cáo Standard ~0,10–0,12 USD, Advanced ~0,52–0,58 USD, 200–250 s. Chấm mù 4 báo cáo ~0,7 USD.

---

## 5. Nguyên nhân gốc đã chứng minh + bài học

1. **Trí nhớ tài khoản UAT bị nhiễm** bởi các câu thử của chính mình: trang `/profile/tappy-knows` hiện "Hay đi với: gia đình 4 người", "thích biển yên tĩnh", "TP.HCM", chủ đề "relax Sài Gòn/Thanh Hóa/Quy Nhơn…". Model dùng nó như mặc định → "chốt 4 người". Đã sửa bằng quy tắc chung (mục 3B). **Anh nên tự bấm "Xóa bộ nhớ của Tappy" trên tài khoản UAT** (em không tự xóa: cần phép). Các lần đo sau khi xóa sẽ sạch hơn.
2. **Vitest không thấy ranh giới server/client**: server import hàm từ module `'use client'` → trên server là placeholder. Có test canh `serverClientBoundary.test.ts`; luôn kiểm trên **server thật** sau khi thêm import.
3. **Lớp điều phối của em từng làm hỏng một lượt** (hạn thời gian từ đầu lượt). Mọi hạn phải tính từ lúc lượt thật sự bắt đầu tra cứu.
4. **Ghim test = ghim luật cũ**: nhiều test cũ ghim chính hành vi anh phàn nàn (ví dụ thẻ "hay đi cùng: gia đình 4 người"); sửa có chủ đích và ghi lý do trong test.
5. Số "N nguồn" trên đầu báo cáo từng là số trang **đã đọc** (250) trong khi liệt kê 52: tách "đã đọc" khỏi "đã liệt kê".
6. Người chấm AI nhiễu ±0,3: đừng kết luận tiến bộ từ một vòng; dùng nhiều lượt hoặc nhiều người chấm.
7. Bộ chạy tự động đôi khi chụp ảnh trống hoặc không mở được báo cáo đầy đủ (không mở modal): chạy lại riêng câu đó.
8. Gán `ANTHROPIC_API_KEY=` rỗng trong bash làm máy chủ mất khóa → dùng `env -u ANTHROPIC_API_KEY` (script đã làm).

---

## 6. VIỆC CÒN LẠI (theo thứ tự ưu tiên) — **cập nhật thêm mục mới ở cuối mục này khi có**

1. **Kế hoạch du lịch: hai mục riêng "Chỗ ở gợi ý" và "Món nên thử"** (anh đã xem ChatGPT mục 3–4 và Gemini: ChatGPT = 2 thẻ khách sạn (tên, vì sao hợp, địa chỉ, số điện thoại) + 4 thẻ món; Gemini = bảng món (món, đặc điểm, quán + địa chỉ + giờ mở, mức giá) + bảng so sánh chuyến bay/chỗ ở có **giá mỗi đêm cho đúng ngày** + biểu đồ chi phí + một tệp HTML tự chứa). Làm: thêm trường `stays` (2–3 khách sạn từ `get_hotel_prices`: tên, lý do, giá/đêm, trang Agoda) và `dishes` (món, quán thật từ `search_places`, giá) vào `present_plan`; vẽ ở `TripTimeline`, trang `/plan/<id>` (snapshot còn dư ~56 KB), và PDF. Giữ nguyên hợp đồng giao diện cũ (trường mới là tùy chọn).
2. **PDF kế hoạch mất hình**: nhúng ảnh cho từng điểm (cần lấy ảnh từ máy chủ vì tải thẳng từ trình duyệt có thể bị chặn CORS; hoặc dùng ảnh khóa `diem-…` từ `/api/plan-images`). Nếu không làm được, báo anh rõ. Cân nhắc nút **"Tải HTML"** (một tệp HTML đẹp, tự chứa như của Gemini): **chưa làm** (em từng nói nhầm là đã đổi).
3. **Xác nhận nút "Chia sẻ liên kết"** trên giao diện thật (đăng nhập thật; bấm; mở link `/plan/<id>`; xem phần dự toán + mẹo mới). Em mới chỉ có test.
4. **Nghiên cứu sâu tiêu chuẩn còn yếu (4–5/10 Opus):** mâu thuẫn số liệu giữa các câu (chưa có kiểm bằng mã), gắn nguồn lệch, thiếu bảng so sánh thật sự khi câu hỏi là "so sánh"; bài bảo hiểm thiếu bố mẹ/thai sản; bài xe điện thiếu doanh số toàn thị trường theo năm. Hướng: kiểm "phần ≤ tổng" cùng một chủ thể bằng mã (từ các `Figure` đã có trong `deepResearch.ts`), kiểm câu–nguồn (nguồn nói về bảo hiểm nhân thọ không dùng cho bảo hiểm sức khỏe), bảng so sánh bắt buộc khi câu hỏi có "so sánh".
5. **Tốc độ**: kế hoạch 65–97 s. Hướng đã đo: (a) một vòng tra cứu (đã làm); (b) giảm độ dài JSON kế hoạch (đã dặn gọn); (c) cân nhắc chạy `think_deeper` cùng bước tra cứu (hiện nó chiếm một bước riêng ~3–7 s); (d) cache tra cứu giữa các lượt.
6. **Đo lại thật sự**: soạn **40 câu mới** (không trùng 45 câu cũ), chạy giao diện thật, chấm mù, **gửi ảnh từng câu qua điện thoại**; báo số đã chi. Sau khi anh **xóa trí nhớ UAT**. Rồi chạy lại 4 câu nghiên cứu để xem mã kiểm số học có loại câu nào (nhật ký `thesisReport`).
7. Khách sạn: nếu tra giá không trả về đúng khách sạn trong kế hoạch thì chưa có nút Agoda (chỉ có trang chủ ở hàng "Liên kết đối tác"). Cân nhắc gọi `get_hotel_prices` với **tên khách sạn** hoặc lấy Agoda theo `hotelId` (đã có `propertyRefs` trong `agodaLite.ts`).
8. Hàng liên kết của khối `booking` trong `PresentationBlocks.tsx` vẫn ghi "Liên kết đối tác" cho mọi nền tảng; đổi theo luật Agoda/Vexere/Lazada vs "Tham khảo thêm".
9. Câu hỏi "một người nổi tiếng" hiện hiện lưới ảnh, chưa phải thẻ nhân vật — chưa hỏi anh gu (đã hỏi một lần, chưa trả lời).
10. Lớp điều phối đầy đủ theo hạng câu hỏi: mới là giới hạn; chưa có "kế hoạch lượt" tách riêng (cố ý: nguyên tắc Anthropic là một vòng lặp, mã giữ hạn).
11. **Bảo mật** (từ bàn giao 19/11, chưa làm): nối `urlGrants` vào luồng phát hành link, thử nội dung web độc hại thật, trần chi tiêu thống nhất.
12. **Dọn rác** (làm MỘT lần khi xong hết, hỏi anh): `D:\Claude\TappyAI-scratch\trees2` (các thư mục `gate-*` có bản sao `.env.local`; tháo junction `node_modules` bằng `cmd //c rmdir` trước khi xóa; `gate-owner*` đang chạy máy chủ thì tắt trước).
13. **Đóng băng** chính thức: anh quyết; tag `brain-freeze-20261119` đang dời theo commit mới nhất, sau khi anh duyệt thì **tag cố định** (đặt tên mới, ví dụ `brain-freeze-<ngày>-final`) và KHÔNG dời nữa. Deploy: một lần, anh quyết.

*(Thêm việc mới dưới đây khi có):*
- 

---

## 7. Cách chạy (UAT trên giao diện thật)

Tất cả công cụ đo nằm NGOÀI repo: `D:\TappyAI-review-artifacts\consultative-wave3\measure30\`. Kết quả ở `D:\TappyAI-review-artifacts\eval-runs\`.

- **Bật máy chủ trên một commit** (cổng 3000; dừng máy chủ cũ, `git archive` ra `D:\Claude\TappyAI-scratch\trees2\gate-<nhãn>`, nối `node_modules`, chạy `uat-localhost.cjs` với cờ UAT): `bash scripts/start-owner-server.sh <commit> <nhãn>` (chạy trong `measure30`, mất ~3–5 phút; lệnh có thể báo "chạy nền" vì chờ biên dịch trang đầu — cứ kiểm `curl http://localhost:3000/api/config` ra 200).
- **Link đăng nhập một lần cho anh** (tài khoản UAT, Promax, DB thử): `node uat-link.mjs` (in đúng một link; tự từ chối nếu không phải DB thử).
- **Chạy câu hỏi qua giao diện thật** (trình duyệt không đầu, chụp ảnh 2 ô 1280×2000 + chữ + log từng lượt, mở báo cáo đầy đủ cho nghiên cứu): `node ui-eval-run.mjs <câu hỏi.json> <thư mục kết quả> <id đầu> <id cuối>`. Bộ câu: `ui-final-45.json` (ids 1101–1145; 1141–1145 là nghiên cứu), `ui-owner-plan.json` (câu của anh). Mỗi lượt một lúc, không chạy hai lượt song song.
- **Chấm mù** ảnh + chữ, 5 tiêu chí (đúng, nội dung, nguồn, bố cục, lỗi nặng): `node judge-uat.mjs --run <results.json> --out <judge.json> [--max-usd N]` (Opus 5.5, tốn tiền, khóa nạp trong tiến trình); tóm tắt `node summarize-final.mjs <thư mục> <judge>`.
- **Chấm mù nghiên cứu sâu**: `node build-blind-pack.mjs` (ra `blind-pack.json`, `BO-CHAM-MU-CHATGPT-GEMINI-20261119.txt` để anh dán cho ChatGPT/Gemini; khóa đối chiếu `blind-key.json`), rồi `node judge-solo.mjs --max-usd 4` (Opus; nhớ `max_tokens` lớn vì mô hình suy nghĩ). Các bản vòng 1–3 được giữ (`blind-pack-round1/2.json`, `BO-CHAM-MU-VONG1/2-…`).
- **Nhật ký máy chủ**: `measure30\logs\uat-3000.log` (JSON từng dòng; `tappyai_usage`, `tappyai_one_brain_turn`, `tappyai_turn_budget_refused`, `tappyai_plan_night_retry`…). Bật vết thô từng lượt bằng biến `TAPPY_AUDIT_TRACE=1` khi **khởi động** máy chủ (ghi văn bản thô của model vào log; chỉ trên máy thử).
- **Test**: trong `D:\TappyAI-wt\wt-integration` chạy `npx tsc --noEmit -p .` rồi `npx vitest run <đường dẫn> --reporter=json --outputFile=<tệp ngoài repo>`; đọc `numFailedTests`. Test DB (`supabase/tests/p8_*`) chạy bằng Postgres nhúng, tự khởi.
- **Claude in Chrome** (Chrome của anh) dùng để mở link đăng nhập và chụp màn hình khi cần; trình duyệt tích hợp không cần dùng. Trên Chrome, tệp `file://` bị chặn; không dùng `python -m http.server` (bị trình phân loại an toàn chặn).

**Bẫy khi chạy**: `.env.local` bật `SUBSCRIPTIONS_ENABLED` (khách thành Free không công cụ) nên máy chủ phải mở bằng bộ cờ UAT (script đã làm); gói Free = chỉ năng lực model, không công cụ; hạn mức khách 5 câu theo địa chỉ, nằm trong bộ nhớ máy chủ.

---

## 8. Danh sách báo cáo/ảnh đã tạo (đọc khi cần số đo gốc)

`D:\TappyAI-review-artifacts\eval-runs\`: `BAO-CAO-UAT-CUOI-20261119.md`, `BAO-CAO-UAT-VONG-D-20261119.md`, `BAO-CAO-SUA-LOI-VONG-E-20261119.md`, `BAO-CAO-NGHIEN-CUU-SAU-CHAM-MU-20261119.md`, `BAO-CAO-NGHIEN-CUU-VONG2-20261120.md`, `CAU-HOI-NGHIEN-CUU-SAU.txt` (4 câu nguyên văn cho ChatGPT/Gemini), các thư mục `FINAL-a…FINAL-s` (kết quả + ảnh từng câu), `judge-final-*.json`, `judge-blind-opus*.json`, `OWN-*` (câu kế hoạch của anh). Báo cáo ChatGPT/Gemini của anh dán nằm trong hội thoại cũ (điểm đã tổng hợp ở mục 4).

Tài liệu trong repo (một số chưa commit, **đừng xóa**): `docs/handoff/ANTHROPIC-VA-TAPPY-DIEU-AP-DUNG-20261119.md` (so sánh kiến trúc Anthropic/OpenAI với Tappy), `docs/handoff/AUDIT-20261118-tappy-vs-anthropic-agent-blueprint.md`, `docs/architecture-audit-20261118/`.

---

## 9. Những điều CHƯA KIỂM / không chắc (nói thẳng với anh)

- Nút "Chia sẻ liên kết" và trang `/plan/<id>` với phần dự toán/mẹo mới: **chưa tự bấm/mở trên giao diện thật** (chỉ có test).
- Mã kiểm số học: có test và thử phá, **chưa chạy trên một báo cáo thật** (chưa biết nó loại bao nhiêu câu).
- Nút Tải PDF: tải được và đọc được chữ; **chưa xem được giao diện đẹp hay không** (máy không có công cụ vẽ PDF thành ảnh; anh xem giúp).
- Điểm "tốt hơn" giữa các vòng nằm trong sai số của người chấm AI.
- Chưa chạy bộ UAT 45 câu đầy đủ sau TẤT CẢ sửa đổi của 20/11 (chỉ chạy lại các nhóm ca lỗi).
- Thang đo vẫn là bộ 45 câu em đã tinh chỉnh; cần 40 câu mới để biết độ tổng quát.

---

## 10. Prompt cho phiên mới

Xem tệp `PROMPT-SESSION-MOI-20261120-bo-nao.md` cùng thư mục (dán nguyên văn vào phiên mới).
