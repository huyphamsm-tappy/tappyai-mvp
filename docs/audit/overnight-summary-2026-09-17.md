# TỔNG KẾT OVERNIGHT JOB — 2026-09-17 → 18

Nhánh cuối: **`merge/main-into-v3`**, commit cuối **`999045b`** (worktree `.claude/worktrees/g1-place-guard`).
Chỉ commit local — **không push, không deploy, không đụng production, không xoá gì**. Nhật ký chi tiết từng bước:
`docs/audit/overnight-2026-09-17.md`.

## 1. Đã làm gì (theo từng bước)

| Bước | Kết quả | Commit |
|---|---|---|
| 0 — Bảo vệ việc chưa commit | 18 nhánh `wip/<worktree>-2026-09-17` cho mọi worktree bẩn; **381** tag `archive/<nhánh>-2026-09-17` cho mọi đầu nhánh | tags/branches |
| A — Merge `feat/affiliate-cross-platform` | Xong; 20 file conflict giải quyết (Android data layer giữ thiết kế stream của CCP + `toShareView()`; iOS đổi tên model share → `SharePlacesView`; web giữ quota toàn cục V3 + `placesBudget` của CCP) | `28e1d7d` |
| B — Merge `integration/v3-canonical` | Xong | `2dba2e3` |
| C — Gom `wip/*` | Gộp `tappyai-v3-canonical`, `cool-vaughan` (trừ profile-v2 — xem mục 5), `v3-phase4-design`; **`g1-growth` không gộp** (hệ share thứ hai + quota Zalo theo ngày mâu thuẫn với trial trọn đời) — patch để ở `docs/audit/overnight/stepC/`. Migration `review_shares` đã đóng gói SQL + rollback, **chưa apply** lên audit (classifier chặn) — script `scripts/audit/applyMigrationAudit.mjs` sẵn cho owner | `a6ca9f0` `1e7b77e` `d303a91` |
| D — Layout | Web: carousel ngang (mọi card, filter ở trên). Android: carousel `PlaceCards` từ frame `8:`, header `x-tappy-surface: android`, guest 18+ + `x-tappy-age-declared`, GPS có xin quyền, nút Đăng nhập khi `auth_required`, guest debug-only. Serper: chuẩn hoá location + 1 retry khi không có `priceLevel` (upstream ngẫu nhiên) | `2cfa09d` `780c35f` `eb1c2d2` `d9f3961` |
| E — AI CONSULTATIVE V1 | Cờ `CONSULTATIVE_V1` (mặc định OFF, OFF = byte-identical). Thiết kế `docs/audit/consultative-v1-design.md`; module: khung tình huống, resolver tham chiếu + tìm lại theo tên, guard "mình đã kiểm tra", thuộc tính từ bằng chứng, hình dạng prose, lọc memory tạm thời, prompt ghi đè R1(a)/R1b/R2/R7(b)/giới hạn 3 dòng, shortlist 3→5. **Sửa detector ngôn ngữ (áp dụng cả khi OFF): tiếng Việt không dấu = tiếng Việt** | `8ad917a` |
| F — Eval + Release gate | 40 câu web + 10 Android, mọi cờ ON, audit env. **Web 34/40 PASS, Android 6/10** (3/4 FAIL Android đã có fix sau khi chụp). 11 commit sửa theo đo đạc, gồm 1 bug ngoài V1: **"ở Quận 1" bị hiểu là "quán" ⇒ từ chối card entertainment ⇒ ảnh/link inline** trên cả web lẫn Android | `dc8293e`…`16af9e8`, `6eabd3b` |
| G — Kế hoạch dọn dẹp | `docs/audit/cleanup-plan-2026-09-18.md`: 396 nhánh (KEEP 12 · KEEP-until-merged 18 · ARCHIVE 236 · DELETE-after-tag 130), 91 worktree (KEEP 6 · DELETE dir 21 · ARCHIVE 64), launch.json/hook/APK/AVD. **Không xoá gì** | `999045b` |

## 2. Test

- Web (vitest): **13 356 passed / 68 skipped / 699 file** — xanh ở commit `16af9e8` (các commit sau chỉ là docs + copy script).
- `tsc -p tsconfig.json`: sạch.
- Android unit: **727 / 0** (lần cuối chạy ở Step D; Step E/F không sửa Android).
- iOS: **chưa compile** (không có Mac) — đổi tên model share ở Step A cần build trên Xcode.
- Ngân sách LLM/search: **95 / 120** lượt (8 Step D, 87 Step F).

## 3. Ảnh chụp

- Step A (sau merge, guest, cờ ON): `docs/audit/overnight/stepA/web-after-A-guest-flags-on.png`
- Step D: `docs/audit/overnight/stepD/web-guest-flags-on-carousel.png`; Android `android-guest-00…05-*.png` (prompt GPS,
  khai báo 18+, prose trên, carousel, trang 2, cuối).
- Step F Android (10 lượt, 27 ảnh): `docs/audit/eval/android/<id>-1-bottom|2-top|3-mid.png` — `F4-*` là luồng guest
  mới: prompt vị trí → khai báo 18+ → tự gửi lại.
- Kết quả từng lượt web: `docs/audit/eval/runs/<id>.json` (prose, tool call, rows, shortlist, frame `8:`).

## 4. Eval — tỉ lệ đạt và điều đã sửa

`docs/audit/eval/consultative-40.md` có bảng chấm từng lượt theo C1–C9 (hiểu tình huống · chọn rõ · lý do có
bằng chứng · đánh đổi · chính xác · không tìm giả · layout · ngôn ngữ · không mảnh vụn).

- **Web 34/40** — 6 FAIL: T2, T8 (`get_hotel_prices` trả 0 dòng trên audit env), T1 (planner hỏi hoạt động thay vì
  lập kế hoạch), T6 (G1 cắt hết câu ở lượt 2 lần search), S5, T5 (hỏi thay vì giả sử rồi tìm).
- **Android 6/10** — S1 (prose shopping mất câu chọn — guard shopping cũ), T1 (như web), P2 (hỏi thời lượng thay vì
  chọn — đã thêm luật), E1 (bug "ở Quận 1" — đã sửa, web chạy lại có card).
- Đã sửa trong đêm (đều có test): bằng chứng mang theo ở lượt follow-up (trước đó G1 cắt 4/11 câu); câu "chưa thấy bằng
  chứng về X" và "kết quả chưa có giá" do server viết khi model im lặng; câu chọn giữ quyết định, chỉ bỏ mệnh đề không có
  bằng chứng; anaphora ("Quán có … yên tĩnh"); mảnh vụn/emoji mồ côi/dòng chỉ có link; V1 kích hoạt theo tình huống
  (trước đó "Đi date với gấu…" bị đọc là `inform/web_search` nên V1 im); khách sạn/chuyến đi không có ngày → giả sử cuối
  tuần tới rồi gọi tool; không bao giờ giả sử ĐỐI TƯỢNG ("mua gì bây giờ" từng bị đoán là đồ ăn); memory không biến một
  buổi thành thói quen ("như sở thích trước đây", "5 người như thường lệ"); "đều dưới 80k" khi không có giá → bỏ.
- Tìm lại theo tên hoạt động thật (F6, P3, E4, Android F5): `tappyai_tool_called query=<tên quán>` rồi hoặc có số liệu
  hoặc "mình không tìm thấy".

## 5. Quyết định còn chờ owner

1. **Ranker**: có cho thuộc tính (yên tĩnh/view…) và price band tham gia xếp hạng không? Tối nay KHÔNG đổi ranker vì
   đổi thứ tự = đổi dữ liệu card (guardrail). Model chọn trong shortlist và nói lý do; card giữ thứ tự engine.
2. **Pick lên đầu carousel**: không làm (cùng lý do). Badge `#1` vẫn là pick của engine.
3. **profile-v2 (cool-vaughan, 26 file)**: không gộp vì route profile thiếu hợp đồng DOB #251; bản sao ở
   `docs/audit/overnight/stepC/profile-v2-notmerged/`.
4. **g1-growth**: không gộp (hệ share thứ hai, quota Zalo/ngày ≠ trial trọn đời) — patch ở `stepC/`.
5. **Migration `review_shares`**: apply lên audit bằng `scripts/audit/applyMigrationAudit.mjs` (từ chối mọi ref không
   phải audit). Chưa apply ⇒ `/api/reviews/shared` trên audit trả `500 load_failed`.
6. **Hotel provider trên audit env**: `get_hotel_prices` trả 0 dòng ở mọi lượt — kiểm key/config.
7. **Planner**: giai đoạn "hỏi hoạt động" của trip planner có nên nhường cho V1 "giả sử rồi làm" không?
8. **Prose shopping**: card đã chọn (NÊN CHỌN) nhưng prose không nêu tên — áp hình dạng V1 cho shopping?
9. **Chi phí V1**: khối prompt ≈ **700–820 token/lượt** (đo thật; thiết kế ước 250–350), không thêm LLM call, không
   thêm Serper call — Haiku ≈ $0.0008/lượt. Bật cờ hay không là quyết định của owner.
10. Nhãn CTA do model viết ("Tìm phòng trên Haisanhoanggia" cho quán hải sản) — cờ `SERVER_AUTHORED_CTA` có sẵn, đang OFF.

## 6. Còn gì trước khi release

- Compile iOS trên Mac (Step A đổi tên model share).
- Apply migration `review_shares` (audit trước, prod sau) + rollback đi kèm.
- Bật `CONSULTATIVE_V1` trên audit rồi chạy lại 4 lượt Android FAIL (S1, T1, P2, E1) + 6 lượt web FAIL sau khi chốt
  mục 5.6–5.8 (còn 25 lượt trong ngân sách).
- Khắc phục các mục "Open" cuối `consultative-40.md` (thousands-separated listing, re-search theo thành phố, G1 trên
  lượt 2 search…).
- Merge `merge/main-into-v3` → `main` chỉ sau khi owner duyệt (release workflow v2 — không push thẳng main).
- Dọn dẹp theo `cleanup-plan-2026-09-18.md` (khi owner muốn; tối nay không xoá gì).

## 7. Trạng thái máy khi dừng

- Dev server audit **:3101 đang chạy** (launch `audit-flags-on`, worktree `audit-nonprod` detached ở `16af9e8`+docs) —
  tắt bằng preview_stop hoặc để tiếp tục UAT.
- Emulator `emulator-5558` (`Pixel_8_uat`) đang chạy, app debug đã `pm clear` một lần (guest identity thứ 2 đã dùng 5/5).
- Bearer audit user hết hạn sau 1 giờ — `node scripts/audit/remint.mjs` để lấy lại (không in secret).
