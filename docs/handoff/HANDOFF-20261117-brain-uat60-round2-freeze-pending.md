# BÀN GIAO 17/11/2026 — Bộ não Tappy web: đã đóng gói, đã UAT vòng 2, CHƯA đóng băng

Người đọc: phiên Claude kế tiếp. Viết tiếng Việt với anh Huy. **Đọc hết file này, rồi HỎI LẠI anh Huy và chờ anh duyệt. Chưa được duyệt thì không sửa mã, không chạy đo tốn tiền, không commit.**

## 1. Mục tiêu (anh Huy chốt 17/11)

1. **Làm xong bộ não trước.** Phase 6, Phase 8, game One Life chỉ là tính năng của Tappy, làm ở bước sau. Không gộp chúng lúc này.
2. Hợp nhất ở local, UAT lại một vòng, **đạt từ 9/10 thì commit và đóng băng (gắn tag), KHÔNG deploy.**
3. Sau đóng băng mới làm các tính năng khác.

Trạng thái so với mục tiêu: bộ não đã đóng gói thành commit và có tag bản gốc; đã UAT vòng 2; **chưa gắn tag đóng băng** vì còn việc mở ở mục 6 và anh Huy chưa quyết.

## 2. Luật làm việc (bắt buộc)

1. Sửa mã CHỈ bằng Edit/Write (hoặc file `.py` viết bằng Write rồi chạy). CẤM heredoc, `sed -i`, `python -c`, `echo >` để sửa hay tạo file dự án. Shell chỉ để chạy, đọc, git.
2. File LF. Không commit chuyển CRLF.
3. Mọi chữ anh Huy đọc phải là tiếng Việt (chat, tiến độ, nút, bước kế hoạch). Ngắn, trung thực, tách rõ ĐÃ KIỂM và CHƯA KIỂM.
4. Kỹ thuật là việc của mình, KHÔNG hỏi anh chọn phương án kỹ thuật. Chỉ hỏi: quyền (tải, tạo tài khoản), tiền, gu sản phẩm, riêng tư, production.
5. Sửa theo nguyên tắc chung. KHÔNG vá từng case, KHÔNG chỉnh prompt cho từng câu. Không giảm chất lượng câu trả lời.
6. Không đụng kiến trúc nghiên cứu sâu và truy xuất thông tin (sửa bước kiểm sau khi viết thì được, đã làm hôm nay).
7. Dữ liệu thật và realtime. Cấm dùng hay dẫn nguồn từ sản phẩm AI khác.
8. Chỉ web. Chỉ MỘT nhánh cho web: `feat/brain-r13-p1` ở `D:\TappyAI-wt\wt-integration`. Không tạo worktree hay nhánh mới. Không sửa cây `g1-growth` (trừ file cấu hình cục bộ `.claude/launch.json`, git bỏ qua). Giữ nguyên 10 cây One Life.
9. Không commit, push, deploy khi anh chưa nói. Production (Vercel, deploy 04/11) KHÔNG được đụng. Commit cục bộ theo lát đã được anh cho phép trong ngày 17/11 cho việc "làm xong bộ não"; phiên mới phải hỏi lại.
10. Không in file khoá hay `.env`. Kiểm bằng script chỉ in đúng/sai. Không viết sha từ trí nhớ.
11. DB UAT = `zdaprdfgpbpnxyofagmc` (KHÁC production `fwznnobrdctuskgrvuik`). Hỏi phép trước mọi thao tác ghi.
12. Chạy vitest: dùng `--reporter=json --outputFile=<file ngoài repo>` rồi đọc số bằng node (lọc bằng grep từng làm mất dòng tổng kết). Sau mỗi Edit phải kiểm kết quả rồi mới chạy test. Edit file ngoài thư mục phiên cần Read trước.
13. Không chạy hai `next dev` trên cùng thư mục. Không chạy hai lượt chat UAT cùng lúc trên một máy chủ.
14. Trong `ONE_BRAIN_CORE` (oneBrain.ts) cấm chữ có dấu tiếng Việt.
15. Luôn gửi báo cáo cho anh bằng SendUserFile kèm đường dẫn đầy đủ.
16. Chạy UAT thì chạy đủ mọi ca, không đề nghị bỏ ca vì ngân sách; vượt trần tiền thì hỏi.
17. Sau khi chạy test, bốn file `docs/audit/*.json` bị ghi đè: trả lại bằng `git checkout -- docs/audit` trước khi commit.
18. Bash tool từ chối lệnh đọc `src/lib/ai/tools/food.ts` qua shell (file có địa chỉ email trong User-Agent): dùng Read/Grep cho file đó.

## 3. Vị trí và trạng thái

- Cây: `D:\TappyAI-wt\wt-integration`, nhánh `feat/brain-r13-p1`, HEAD `7c4c5bf`. Chưa push bao giờ. `origin/main` (`33cef8b`) nằm trọn trong HEAD.
- Nhánh sao lưu `backup/brain-20261116` (`5f67ddc`): ảnh chụp cây làm việc sáng 17/11 trước khi commit.
- Tag `brain-baseline-20261116` (`0720418`): bản gốc bộ não (279 file của 13–16/11 thành 6 commit).
- Chưa commit: hai thư mục kết quả lượt chạy đầu `docs/uat/uat60-20261117-run1/` và `docs/uat/uat-free-20261117-run1/` (để lại, chưa xoá; hỏi anh có giữ không).
- Kiểm lần cuối 17/11 (sau `dc71679`): `npx tsc --noEmit -p .` sạch; `npx vitest run --project app`: 27.266 qua, 0 hỏng, 95 bỏ qua.
- Máy chủ UAT cổng 3000 đang chạy lúc bàn giao, với cờ bảng gói bật (mục 7). Có thể đã tắt khi phiên mới bắt đầu.

## 4. Đã làm ngày 17/11 (đều đã commit cục bộ)

Sau tag bản gốc, theo thứ tự:

| Commit | Nội dung |
|---|---|
| `3fea253` | Lượt hỏi từ clip Explore chạy trên One Brain (clip là một khối ngữ cảnh; tìm quán vẫn thu về quán của clip). Test M có thử đột biến. |
| `3793313` | Một quyết định ngôn ngữ mỗi lượt (`replyLanguage.ts` trả thêm `named`); bộ dò đọc hết câu rồi mới quyết; chữ chỉ tiếng Việt có thì chốt tiếng Việt. Sửa lỗi câu Obama ra tiếng Nhật. |
| `cf0f3fd` | Loại hình chính của nhà cung cấp đứng đầu `place_types`; link đặt chỗ chỉ là "Đặt chỗ" khi tìm ăn uống, spa, giải trí. |
| `d249126` | Công cụ giá vàng, thời tiết, dự báo trả `source_url`, được cấp quyền như nguồn tham khảo, nên câu realtime có link nguồn. |
| `47f258b` | Chia sẻ báo cáo: tiêu đề, ý chính, số nguồn; logo mới `/branding/otter-logo.png`; ẩn dòng "0 nút · 0 ảnh". |
| `d60caf7` | Trí nhớ: số người của một buổi đi chơi không phải đặc điểm của người dùng. Kèm bộ chạy UAT, bộ đọc chi phí, bộ câu Free. |
| `137d488`, `41d3ab7` | Báo cáo nghiên cứu: "nguồn N" viết bằng chữ được coi là trích dẫn, trên mọi đường viết kể cả dòng chảy. |
| `fa6be08` | Dòng mời gói Pro dưới mọi câu trả lời Free, chỉ khi cờ bảng gói bật (`ProUpsellNote.tsx`). |
| `dc71679`, `7c4c5bf` | Link Maps không vỡ khi tên quán có ngoặc (`encodeQuery.ts`); báo cáo, kết quả và ảnh UAT. |

Việc khác trong ngày:
- Kiểm chỉ đọc các nhánh trước hợp nhất: `docs/handoff/BAO-CAO-20261117-kiem-nhanh-truoc-hop-nhat.md`. Kết luận: không nhánh nào mang mã bộ não mới hơn; việc gộp thật chỉ còn Phase 6, Phase 8 (khoảng 330 file web, 22 migration), One Life; KHÔNG gộp bốn nhánh tháng 8–9. Anh đã hoãn toàn bộ phần này.
- UAT vòng 2: báo cáo `docs/uat/UAT-60-REPORT-20261117.md`. Promax 60 ca (59 có trả lời), Free 15 câu đúng cả 5 quy định. Chi phí đo cả ngày khoảng 3,36 USD trên trần 4,5 USD anh duyệt.

## 5. Quyết định sản phẩm của anh Huy trong ngày 17/11

- Khách chưa đăng nhập: **giữ 5 câu**, câu thứ 6 phải đăng nhập hoặc tạo tài khoản (`ANON_LIFETIME_LIMIT = 5`).
- Lời mời gói Pro: **dưới mọi câu trả lời Free**. Câu chữ: "Dùng gói Pro để có câu trả lời thông minh hơn và dữ liệu chính xác hơn."
- Vòng UAT chính chạy gói Promax; Free chỉ cần 15 câu.
- Free = chỉ năng lực model, không công cụ (có hiệu lực khi `SUBSCRIPTIONS_ENABLED=1`).

## 6. Việc còn mở (chưa làm hoặc dang dở)

Thuộc bộ não, cần xong trước khi đóng băng:
1. **Số liệu chưa đối chiếu nguồn ngoài.** Vòng 2 mới kiểm phần tính toán và độ nhất quán giữa hai lượt. Ca 50 lượt 2 hai lần chạy nói ngược nhau về pin MacBook Air M4 so với Dell XPS 13. Cần đối chiếu các mốc số liệu chính bằng tìm kiếm web rồi mới chấm trục dữ liệu.
2. **Còn 1 chỗ lộ số nguồn** trong báo cáo Advanced sau bản sửa: "Mốc 2025 (81,68) do nguồn 34 cung cấp" (ảnh `docs/uat/uat60-20261117/recheck60/screens/q60-report.jpg`). Chưa truy ra gốc. Nghi: ghi chú của mô hình kịch bản (`forecastModel.ts`, các trường `note`) không đi qua bước phát hành, hoặc chữ "nguồn" ở dạng Unicode tách dấu nên biểu thức không khớp. Chưa xác minh giả thuyết nào.
3. **Ca 52 (PDF) chưa kiểm được.** Bộ chạy gắn tệp bằng `DOM.setFileInputFiles` nhưng khay đính kèm không hiện và câu hỏi không gửi đi (ảnh `docs/uat/uat60-20261117/attach/screens/q52.jpg`). Ca ảnh (51) cùng cách gắn thì chạy. Chưa biết lỗi ở tệp PDF tự in, ở bộ chạy hay ở app.
4. **Ca 16 (bún riêu) không có ảnh món ăn** ở cả hai lượt: lỗi bố cục, chưa sửa.
5. Bước lập dàn ý của báo cáo Advanced thất bại 1 trong 3 lần chạy (`"ev":"thesis","ok":false`); báo cáo vẫn ra bằng đường viết dự phòng nhưng không qua bước kiểm từng câu. Chưa điều tra.
6. Chưa kiểm trên giao diện thật: thẻ chia sẻ báo cáo, trang liên kết công khai `/r/...` của báo cáo, ca 53 sau bản sửa link Maps.
7. Free: mới mở ảnh của một câu (giá vàng). Nội dung 14 câu còn lại chưa đọc (bộ đo lúc đó bắt nhầm dòng mời Pro; đã sửa bộ đo, chưa chạy lại).
8. Trong câu trả lời tiếng Nhật còn nhãn giao diện tiếng Việt "Tappy chọn" trên thẻ (nhãn theo ngôn ngữ app, không theo ngôn ngữ lượt).
9. Hai bản sửa `3793313` và `cf0f3fd` có test mới nhưng chưa thử đột biến.

Đã hứa từ trước, chưa làm:
10. Bản xem trực tiếp "báo cáo đang được viết": anh có thể muốn rút thành thẻ tiến độ; chờ anh quyết.
11. Dọn các cuộc chat thử trong tài khoản UAT (vòng 2 thêm khoảng 130 cuộc); xoá tài khoản Free dùng thử `uat.p0.1794888082772.1@example.test` (file ghi tài khoản nằm ở thư mục nháp của phiên 17/11, có thể đã mất; xoá bằng khoá quản trị UAT nếu anh cho phép).
12. Quyết bằng dữ liệu: có thêm `CONSULT_REQUEST_CAP=1` + `CONSULT_REQUEST_CAP_PER_TURN=12` vào bộ cờ UAT cuối không (không dành cho production).
13. Cờ Vercel `CONSULT_ONE_BRAIN`, `NEXT_PUBLIC_CONSULT_ONE_BRAIN`, `CONSULT_PRODUCTION_ALLOW`: việc của anh, chưa cần khi chưa deploy.

Hoãn theo ý anh (không làm lúc này): gộp Phase 6, Phase 8, One Life; xoá bộ luật cũ.

## 7. Cách chạy lại UAT

- Máy chủ UAT: dùng `preview_start` với cấu hình trong `D:\Claude\Projects\TappyAI\.worktrees\g1-growth\.claude\launch.json`:
  - `wt-integration-uat-blocks-3000`: bộ cờ Promax (`flags-uat-blocks.json`).
  - `wt-integration-uat-plans-3000`: thêm `SUBSCRIPTIONS_ENABLED=1` (`flags-uat-blocks-plans.json`), dùng cho Free; Promax vẫn chạy được.
  - Cả hai xoá biến `ANTHROPIC_API_KEY` thừa hưởng từ app trước khi chạy, để khoá trong `.env.local` có hiệu lực. Thiếu bước này thì nghiên cứu sâu lỗi 401.
  - Log: `D:\TappyAI-review-artifacts\consultative-wave3\measure30\logs\uat-3000.log`.
- Bộ chạy: `node scripts/uat/uat60-run.mjs <file câu hỏi> <thư mục ra> <từ> <đến>`.
  - Mặc định đăng nhập `qa.admin.uat` (Promax) bằng link một lần tạo từ khoá quản trị UAT; `UAT_AS=guest` chạy vai khách (tự gửi xác nhận 18 tuổi); `UAT_AS=<địa chỉ>@example.test` chạy tài khoản dùng thử.
  - Dùng trình duyệt `chrome-headless-shell.exe` có sẵn trong `%LOCALAPPDATA%\ms-playwright` (bản `chrome.exe` đầy đủ trên máy này không khởi động được).
  - Hỗ trợ: hội thoại nhiều lượt, chế độ nghiên cứu sâu, gắn ảnh, gắn PDF (chưa chạy được), clip Explore.
  - Các thao tác này ghi vào dự án UAT; anh đã cho phép trong ngày 17/11, phiên mới phải hỏi lại.
- Chi phí: `node scripts/uat/uat-cost.mjs <log> <N lượt cuối>`.
- Tạo tài khoản dùng thử: `UAT_BASE_URL=http://localhost:3000 node scripts/uat/throwaway-accounts.mjs create 1 <file ngoài repo>`.
- Khung trình duyệt của app giữ cookie riêng: đăng nhập ở Chrome hay thiết bị khác không có tác dụng với nó.

## 8. Số đo tham chiếu

- Vòng 2 Promax: 62 lượt, 1,25 USD, trung vị 39 giây mỗi lượt; nghiên cứu Standard 82–88 giây và khoảng 0,12 USD, Advanced 227–277 giây và 0,29–0,56 USD.
- Trung bình khoảng 0,02 USD mỗi lượt chat thường qua giao diện (thấp hơn con số 0,05 USD ghi trong báo cáo 16/11).
- UAT20 đường API ngày 16/11: 0,256 USD và 624 giây cho 21 tin (bộ cờ hôm đó).

## 9. Prompt cho phiên mới (dán nguyên văn)

```
Em là kỹ sư chính của Tappy web. Đọc kỹ trước khi làm gì: (1) file D:\TappyAI-wt\wt-integration\docs\handoff\HANDOFF-20261117-brain-uat60-round2-freeze-pending.md, (2) báo cáo D:\TappyAI-wt\wt-integration\docs\uat\UAT-60-REPORT-20261117.md, (3) memory MEMORY.md của dự án. Làm việc ở cây D:\TappyAI-wt\wt-integration, nhánh feat/brain-r13-p1. KHÔNG tạo worktree hay nhánh mới, KHÔNG đụng production, KHÔNG commit/push/deploy, KHÔNG sửa mã và KHÔNG chạy đo tốn tiền khi anh Huy chưa duyệt.

Việc đầu tiên: đọc xong thì tóm tắt lại cho anh bằng tiếng Việt (mục tiêu, trạng thái, các việc còn mở ở mục 6 theo thứ tự em định làm, ước chi phí đo), nêu rõ những gì cần anh cho phép (commit cục bộ, tiền đo, thao tác ghi vào dự án UAT), rồi DỪNG và chờ anh duyệt.

Sau khi anh duyệt: làm các việc mở của bộ não ở mục 6 (đối chiếu số liệu với nguồn ngoài, chỗ lộ số nguồn còn lại, ca PDF, ảnh món ăn, dàn ý Advanced thất bại, các mục chưa kiểm trên giao diện), tsc + vitest xanh sau mỗi lát, rồi UAT lại các ca liên quan. Đạt từ 9/10 thì xin anh gắn tag đóng băng; vẫn KHÔNG deploy. Phase 6, Phase 8, One Life để sau đóng băng.

Luật cứng: chỉ Edit/Write để sửa mã (cấm heredoc, sed -i, python -c, echo >), LF, mọi chữ anh đọc là tiếng Việt, ngắn và trung thực (ĐÃ KIỂM / CHƯA KIỂM), sửa theo nguyên tắc chung không vá từng case, không đụng kiến trúc nghiên cứu sâu và truy xuất, kỹ thuật tự quyết không hỏi anh, gửi báo cáo bằng SendUserFile kèm đường dẫn đầy đủ.
```
