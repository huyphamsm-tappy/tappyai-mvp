# BÀN GIAO 16/11/2026 — Bộ não Tappy web: đã làm gì, đo gì, hợp nhất thế nào (CHƯA commit, CHƯA deploy)

Người đọc: phiên mới (Fable 5.2 ngày 17/11). Viết bằng tiếng Việt với Huy. Đọc hết file này trước khi làm gì.

## 1. Vị trí và trạng thái

- Cây làm việc DUY NHẤT của web: `D:\TappyAI-wt\wt-integration`, nhánh `feat/brain-r13-p1`, HEAD `4762c58` (12/11). Khoảng 174 mục chưa commit (công việc 13–16/11). Chưa push bao giờ.
- `origin/main` (`33cef8b`, production) đã nằm trọn trong HEAD. Production (Vercel, deploy 04/11) KHÔNG được đụng.
- Kiểm tra lần cuối 16/11: `npx tsc --noEmit -p .` sạch; vitest rộng 12.870 test qua (848 file).
- Không sửa cây `g1-growth`. Giữ nguyên 10 cây worktree One Life (game). Không tạo thêm worktree/nhánh (dò xung đột bằng `git merge-tree`).

## 2. Luật làm việc (Huy đã chốt, bắt buộc)

1. Sửa mã CHỈ bằng Edit/Write (hoặc file `.py` viết bằng Write rồi chạy). CẤM heredoc, `sed -i`, `python -c`, `echo >` để sửa/tạo file dự án. Shell chỉ để chạy, đọc, git.
2. File LF, không commit chuyển CRLF.
3. Mọi chữ Huy đọc phải là tiếng Việt (chat, tiến độ, nút, bước kế hoạch). Ngắn, trung thực, tách rõ ĐÃ KIỂM / CHƯA KIỂM.
4. Kỹ thuật là việc của em, KHÔNG hỏi Huy chọn phương án kỹ thuật. Chỉ hỏi: quyền (tải, tạo tài khoản), tiền, gu sản phẩm, riêng tư, production. Làm từng lát liên tục, chỉ dừng khi việc quan trọng. Huy chỉ UAT sản phẩm cuối.
5. Sửa theo nguyên tắc chung, KHÔNG vá từng case, KHÔNG chỉnh prompt cho từng câu. Không giảm chất lượng câu trả lời.
6. Không đụng kiến trúc nghiên cứu sâu và truy xuất thông tin.
7. Dữ liệu thật và realtime. Cấm dùng/dẫn nguồn từ sản phẩm AI khác (AIHAY là đối thủ).
8. Chỉ web (mobile theo sau). Không commit/push/deploy khi chưa được Huy nói.
9. Không in file khoá/.env (kiểm bằng script in đúng/sai). Không viết sha từ trí nhớ.
10. DB UAT = `zdaprdfgpbpnxyofagmc` (KHÁC production), nối bằng SUPABASE_DB_PASSWORD; hỏi phép trước mọi thao tác ghi. Tài khoản UAT trong memory.
11. Chạy test vitest thêm `--reporter=verbose --silent=false`. Sau mỗi Edit phải kiểm kết quả trước khi chạy test (Edit cần Read trước). Không chạy hai `next dev` trên cùng thư mục (làm hỏng `.next`).
12. Trong `ONE_BRAIN_CORE` (oneBrain.ts) cấm chữ có dấu tiếng Việt (có test canh).
13. Luôn gửi báo cáo cho Huy bằng SendUserFile kèm đường dẫn đầy đủ.
14. Chạy bộ UAT thì chạy đủ mọi ca, không đề nghị bỏ ca vì ngân sách.

## 3. Mục tiêu và đường đi

Huy: "Hợp nhất ở local, rồi chạy UAT lại một vòng, đạt ≥9/10 thì commit và đóng băng, còn deploy thì chưa." Hợp nhất KHÔNG được phá bộ não Tappy xây suốt một tháng. Sau đóng băng mới làm các chức năng khác.

## 4. Việc đã làm trong ngày 16/11 (đều chưa commit)

- Kiểm chứng sự thật trên thẻ: `src/lib/ai/answerV4/factSense.ts` (quote-first, cắt một phần, chế độ không tra cứu, nhận xét lời khuyên/định tính là đúng, làm tròn đồng); `presentation/declare.ts` lọc nhiễu link/ảnh khỏi bằng chứng (evidence 60k); `streamEnrichment.ts` timeout 10 giây, lỗi thì bỏ profiles+compare.
- Sổ link hệ thống: `systemLinkSupersede.ts` nhận `ask`, gọi lặp không có link thì giữ link cũ (sửa lỗi mất link Vexere ở Q15).
- `ProfileCards.tsx`: từ 3 mục mỗi mục ≤1 điểm thì hiện dạng bảng; phụ đề chỉ khi đúng ngôn ngữ người đọc.
- Nghiên cứu: `researchMemory.ts` giữ báo cáo + nguồn theo tab; `ResearchCanvas.tsx` + `presentation.ts` có danh sách nguồn bấm được; `reportView.ts` mặc định luôn bản tóm tắt trong chat (`NEXT_PUBLIC_REPORT_SUMMARY_VIEW`), báo cáo đầy đủ nằm ở PDF/trang báo cáo.
- `dongDecimals.ts`: số tiền đồng có phần thập phân thì làm tròn nguyên.
- `docMedia.ts`: thẻ Wikipedia chỉ tiếng Anh bị bỏ khi người đọc tiếng Việt.
- Prompt `oneBrain.ts` thêm các nguyên tắc chung: danh sách một con số thì dùng bảng; không nêu số chưa kiểm; tra địa điểm một lần cho mỗi loại; số tiền nguyên; dùng sở thích đã nhớ một cách lặng lẽ; quy tắc gọi tên nguồn (không đặt giữa câu dẫn và danh sách). Lỗi nguồn đứng trước danh sách tái hiện 3/5 → 0/5 sau khi thêm luật.
- Ảnh các điểm dừng lịch trình: `subjectImages.ts`, `oneBrainMedia.ts`, `TripTimeline.tsx` (`MAX_STOP_LOOKUPS=8`, annotation `stops`).
- Tài liệu UAT: `docs/uat/UAT-60-QUESTIONS-20261116.json`, `UAT-60-REPORT-20261116.md`, `docs/uat/uat60-20261116/` (ghi chú + 72 ảnh chụp), `LAYOUT-QUESTIONS-20261116.json`, `scripts/uat/layout-metrics.mjs`.
- Mã debug tạm (TMP_*) đã gỡ sạch.

## 5. Số đo

UAT20 (21 tin, đường khách/API), bộ đo ngoài repo `D:\TappyAI-review-artifacts\consultative-wave3\measure30\`:

| Bản | Chi phí | Thời gian | Ghi chú |
|---|---|---|---|
| 12/11 gốc | 0,220 USD | 402 s | |
| 13/11 + cap12 | 0,211 USD | 370 s | câu mua sắm mất link (iPhone/S25: 13→5) |
| 16/11 cờ hôm nay | 0,256 USD | 624 s | 21/21 trạng thái 200; trả lời trung bình ~2.522 chữ; quán gần đây ngắn hơn vì địa chỉ/giờ/đánh giá chuyển vào thẻ; chậm hơn vì thêm bước công cụ/present_blocks/kiểm chứng |
| 16/11 + cap12 | 0,209 USD | 490 s | −18% tiền, −21% thời gian; đa số câu ngang; C2#2 iPhone vs S25 ngắn hơn (3.685 vs 6.357 chữ, link 7 vs 13) |

Kết quả nằm ở `runs\UAT20-NOW-20261116\` và `runs\UAT20-NOW-CAP12-20261116\` (`results.json`). Cờ: `flags-uat-blocks.json` (hôm nay), `flags-uat-blocks-cap12.json`, `flags-uat-cap12.json` (13/11). Runner: `run-uat20-flags.mjs` (cổng 3040, `--flags --out --max-usd`, tự dọn máy chủ), `uat-localhost.cjs` (cổng 3000).

Từ log cũ (608 lượt): lượt không công cụ ~4 s, ~0,0006 USD; lượt có công cụ ~22 s, ~0,0064 USD, Serper chiếm 75% chi phí, ~7 lần Serper mỗi lượt. `CONSULT_REQUEST_CAP` + `CONSULT_REQUEST_CAP_PER_TURN=12` mặc định TẮT; KHÔNG bật ở production (từ chối Serper ngoài lượt chat, làm hỏng theo dõi giá).

Trạng thái UAT 60 câu: báo cáo ở `docs/uat/UAT-60-REPORT-20261116.md`. Còn chưa sửa: nguồn dạng chữ ở câu trả lời realtime và vài mục nhỏ trong báo cáo.

## 6. Bản đồ nhánh web (em tự xác định từ git, 16/11)

- Nhánh chính = `feat/brain-r13-p1`. Không nhánh nào khác là "bộ não".
- Dòng chưa gộp có code web: Phase 8 (`p8/subscriptions`, `p8/news-feeds`, `p8/scam-scenarios`, `sec/phase8-hardening`, `phase8-master`) — gói đăng ký, bản tin, kịch bản lừa đảo, củng cố bảo mật, ~71 commit ngoài main, rẽ nhánh từ 26/09, chưa gộp vào đâu; `feat/ccp-mvp`; `integration/phase6-release`; consultative tháng 9 (`feat/consultative-d1-d2-r1-r2-d3`); `integration/scam-shield-v3`; `feat/v3-qr-profile`; game One Life (stage-memories, social-cover); vài nhánh wip.
- Thử gộp bằng `git merge-tree --write-tree` (số conflict thô, gốc chung cũ nên bị thổi phồng): p8/subscriptions 178, p8/news-feeds 160, p8/scam-scenarios 161, sec/phase8-hardening 160, ccp-mvp 135, phase6-release 34. File thuộc bộ não bị đụng: Phase 8 mỗi nhánh 2 file, ccp-mvp 5 file, phase6-release 0.
- CHƯA xác định: tính năng Phase 8/CCP nào đã được viết lại trong HEAD dưới dạng khác (so theo file/chức năng: plans/subscriptions, news feeds, scam scenarios, CCP).
- Danh sách file chỉ có ở p8/subscriptions (chưa có trong HEAD) nằm nhiều ở: supabase/migrations (22 + 22 rollback), src/lib/telemetry, explore, media, p8, features, auth/social, security, tracking, stickers, images, src/app/business.

## 7. Kế hoạch hợp nhất (Huy đồng ý hướng "backup trước, xoá phần cũ sau")

Bước 0 — an toàn (xin Huy gật đầu trước khi commit):
- Tạo nhánh sao lưu `backup/brain-20261116` bằng ảnh chụp chỉ mục tạm (không đổi nhánh đang làm); làm mới patch/tar.
- Commit cục bộ bộ não thành khoảng 5 commit theo mảng logic; tag `brain-baseline-20261116`. KHÔNG push. Khi cần an toàn ổ D, xin phép đẩy riêng tag + nhánh (không PR, không deploy).

Bước 1 — kiểm trước, chỉ đọc: với từng dòng ứng viên, (a) nội dung đã có trong HEAD dưới dạng khác chưa, (b) conflict/chồng lấn với file não, (c) quyết định thứ tự và phần bỏ.

Bước 2 — gộp theo lát nhỏ, mỗi lát một commit, bản của mình thắng khi xung đột; mã đến từ nhánh khác nằm sau cờ mặc định TẮT; tsc + vitest xanh sau mỗi lát. File não cần canh: `src/app/api/chat/route.ts`, `consultative/oneBrain.ts`, `streamEnrichment.ts`, `ChatInterface.tsx`, `plans/tiers.ts`, `memoryService.ts`, `presentation/*`, `answerV4/*`. Thứ tự đề xuất: phase6-release → Phase 8 tách theo tính năng (đăng ký, bản tin, kịch bản lừa đảo, bảo mật; chỉ lấy file không đụng não) → CCP (kỹ nhất) → game One Life sau cùng hoặc để riêng. Migration mới chỉ áp lên DB UAT sau khi hỏi Huy.

Bước 3 — UAT sau hợp nhất, ngưỡng: UAT20 21/21 trạng thái 200, chi phí ≤ +20% và thời gian ≤ +30% so với hôm nay (0,256 USD/624 s); bộ bố cục so ≥9/10, gallery ≥8/10; bộ 60 câu 0 câu bị chứng minh sai; nghiên cứu sâu (Standard/Advanced) đúng bậc, nguồn bấm được. Hụt ngưỡng ở lát nào → quay về tag. Đạt ≥9/10 → commit, tag đóng băng. KHÔNG deploy.

Bước 4 — chỉ sau khi đóng băng và có bộ đếm cho thấy mã cũ không còn chạy mới nghĩ tới xoá bộ luật cũ (kế hoạch riêng, backup trước).

## 8. Việc còn mở (không thuộc hợp nhất nhưng đã hứa)

- Chia sẻ báo cáo: nút chia sẻ chỉ biết thẻ quán/lịch trình/văn bản thường nên báo cáo chỉ hiện tiêu đề + một dòng ("0 nút hành động · 0 ảnh"). File: `MessageActionBar.tsx`, `shareArtifact.ts`, `SharePreview.tsx`, `renderCardImage.ts` (`/logo.svg` logo cũ). Cần loại "báo cáo" + logo mới. CHƯA làm.
- Lượt có clip: điều kiện chọn bộ não trong `route.ts` (~dòng 442, 510, 521) đều tắt khi có clip nên chạy đường nền cũ. CHƯA kiểm kỹ; khi hợp nhất, clip thành một loại ngữ cảnh vào One Brain.
- Câu Obama ra tiếng Nhật: cần chạy lại đoạn hội thoại đa ngôn ngữ có ghi vết; hướng sửa = một quyết định ngôn ngữ mỗi lượt dùng chung.
- Nhãn "karaoke", nút "Đặt chỗ" ở di tích: ghi vết dữ liệu nhà cung cấp; thẻ mang loại hình đã kiểm, nút theo loại hình.
- Câu cụt / lộ "nguồn 144" trong báo cáo: ghi vết bước kiểm sau khi viết; hướng sửa = trích dẫn không khớp thì chặn cả câu, không cắt giữa câu.
- Bản xem trực tiếp "báo cáo đang được viết": Huy có thể muốn rút thành thẻ tiến độ; chờ anh quyết.
- Có thể đề nghị Huy dọn ~150 cuộc chat test trong tài khoản UAT.
- Quyết bằng dữ liệu: có thêm `CONSULT_REQUEST_CAP=1` + `CONSULT_REQUEST_CAP_PER_TURN=12` vào bộ cờ UAT cuối không (không dành cho production).
- Cờ Vercel `CONSULT_ONE_BRAIN`, `NEXT_PUBLIC_CONSULT_ONE_BRAIN`, `CONSULT_PRODUCTION_ALLOW` (có ở Production từ 2/11): Vercel đòi mã email để xem giá trị, việc của Huy; chưa cần khi chưa deploy.
- Máy chủ UAT cổng 3000 đang tắt; bật lại khi Huy muốn thử tay.
- Mỗi lần chạy đo tốn tiền: trần 1 USD cho việc đo đã được Huy duyệt (đo từng chặng + hội thoại đa ngôn ngữ); hỏi lại nếu vượt.

## 9. Prompt cho phiên mới (dán nguyên văn)

```
Em là kỹ sư chính của Tappy web. Đọc kỹ trước khi làm gì: (1) file D:\TappyAI-wt\wt-integration\docs\handoff\HANDOFF-20261116-brain-uat60-merge-plan.md, (2) memory MEMORY.md của dự án. Làm việc ở cây D:\TappyAI-wt\wt-integration, nhánh feat/brain-r13-p1, KHÔNG tạo worktree/nhánh mới, KHÔNG đụng production, KHÔNG commit/push/deploy khi anh Huy chưa nói. Luật cứng: chỉ Edit/Write để sửa mã (cấm heredoc, sed -i, python -c, echo >), LF, viết tiếng Việt cho mọi chữ anh đọc, ngắn và trung thực (ĐÃ KIỂM/CHƯA KIỂM), sửa theo nguyên tắc chung không vá từng case, không đụng kiến trúc nghiên cứu sâu/truy xuất thông tin, kỹ thuật tự quyết không hỏi anh.

Nhiệm vụ: đào thật chi tiết rồi làm luôn. 
A. Bước 1 của mục 7 (kiểm chỉ đọc): với từng nhánh ứng viên (phase6-release, p8/*, sec/phase8-hardening, feat/ccp-mvp, consultative tháng 9, scam-shield-v3, qr-profile, One Life) xác định phần nào chưa có trong HEAD, phần nào HEAD đã viết lại, chồng lấn với file não, rồi chốt thứ tự gộp. Báo anh bằng một file ngắn (SendUserFile).
B. Xin anh gật đầu bước 0 (nhánh backup/brain-20261116 + commit cục bộ vài commit + tag brain-baseline-20261116, không push), rồi gộp từng lát theo mục 7, tsc + vitest xanh sau mỗi lát, bản của mình thắng, mã nhánh khác sau cờ mặc định TẮT.
C. Xen vào các việc mục 8 theo thứ tự: chia sẻ báo cáo + logo mới, clip vào One Brain, câu Obama đa ngôn ngữ, nhãn karaoke/nút Đặt chỗ ở di tích, câu cụt trong báo cáo.
D. UAT lại đúng ngưỡng ở mục 7 bước 3 (UAT20, bố cục, 60 câu, nghiên cứu sâu); trần chi phí đo 1 USD đã được duyệt, vượt thì hỏi. Đạt ≥9/10 thì commit + tag đóng băng, vẫn KHÔNG deploy.
Cuối mỗi chặng báo anh bằng tiếng Việt, tách rõ đã kiểm/chưa kiểm, kèm đường dẫn file đầy đủ.
```
