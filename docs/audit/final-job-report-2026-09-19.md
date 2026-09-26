# BÁO CÁO CUỐI — FINAL JOB (Consultative V1), 2026-09-19

Nhánh `merge/main-into-v3`, commit code cuối **`43d37d2`** (Phase 1 kết thúc ở `a4e0e7d`; `43d37d2` chỉ thêm 2 script audit). LOCAL — không push, không deploy.
Ngân sách: **70 lượt** (6 còn + 64 cấp mới). Kế hoạch: Phase 0+1 = 0 · Phase 2 = 40 + 12 rerun + 6 memory = 58 · dự phòng 12.
Cách đếm lượt: **1 lượt = 1 lần gọi model**. 8 lượt hỏi-rõ là server tự trả lời ($0, không gọi model) nên bộ 48 HTTP turn = 40 lượt.

---

## PHASE 0 — TRẢ LỜI (0 lượt)

### 0.1 Sửa số học chi phí — xác nhận đọc của owner

**48 turn là gì:** 40 câu eval (trong đó 6 câu là follow-up NẰM TRONG hội thoại của câu trước: F5→F4, F6→F1, S3→S2, T3→T2, P3→P2, E4→E3 ⇒ 40 câu = **34 hội thoại**) **+ 8 lượt trả lời sau hỏi-rõ** (F7b S5b S6b T5b P5b P7b E2b E5b) của 8 hội thoại trong cùng 34 đó. Không có follow-up nào ngoài bộ 40. Với thiết kế hỏi-rõ, 8 câu (F7 S5 S6 T5 P5 P7 E2 E5) trở thành lượt canned $0 và cần thêm 1 lượt trả lời để hội thoại kết thúc ⇒ 48 turn HTTP, 40 lượt gọi model (32 câu tìm ngay + 8 lượt trả lời sau hỏi-rõ).

**Tổng cùng bộ câu (đo từ sink, cùng giá, cùng script `costseg.mjs`; cả hai đều memory-cleared, server restart trước run — hit rate 73 % vs 71 %):**

| | Baseline final40 (`0662bb2`, 2026-09-18) | GATE B (`5f67dfc`) | Δ |
|---|---|---|---|
| Turn HTTP | 40 (1 canned) | 48 (9 canned) | +8 |
| Lượt gọi model | 39 | 39 | 0 |
| **Tổng $ / bộ** | **$1.1483** | **$1.2223** | **+6.4 %** |
| $ / câu (÷40) | $0.0287 | **$0.0306** | +6.6 % |
| $ / hội thoại (÷34) | $0.0338 | **$0.0359** | +6.4 % |
| $ / turn HTTP | $0.0287 | $0.0255 | −11 % (pha loãng bởi 8 turn $0 — **KHÔNG phải số chấp nhận**) |
| Serper credits | 232 | 197 | −15 % (số 259→197 ở báo cáo trước là GATE A → GATE B) |

⇒ **Đọc của owner đúng:** tổng chi +6.4–6.6 % và per-conversation $0.0287→$0.0306 (theo câu) / $0.0338→$0.0359 (theo 34 hội thoại). Báo cáo trước đã dán nhãn sai: "$0.0255/lượt" là per-HTTP-turn bị pha loãng bởi 8 turn miễn phí. Chi phí per-conversation **tăng**, không giảm; cái giảm là Serper (−15 % vs baseline, −24 % vs GATE A) và cái tăng là token uncached của mục 2 (gửi đủ 10 hàng).

Verified by: tính lại từ `docs/audit/eval/cost/usage-owner2.jsonl` (segment `final`) và `usage-owner3.jsonl` (segment `gateB`) bằng `costseg.mjs` (đo).

### 0.2 Những gì báo cáo trước thiếu

**(a) Mục 0.1 — phân loại 3 nhóm ràng buộc cứng + cap 2 hedge** (commit `d56b349`, chưa từng được báo cáo):

`src/lib/ai/consultative/hardConstraints.ts` — bảng đóng, exhaustive theo type `Hard` (thêm giá trị vào union mà không có dòng trong bảng = lỗi biên dịch):

```ts
export const HARD_GROUP: Record<Hard, HardGroup> = {
  quiet: 'EVIDENCE_REQUIRED', parking: 'EVIDENCE_REQUIRED', kids: 'EVIDENCE_REQUIRED', vegetarian: 'EVIDENCE_REQUIRED',
  outdoor: 'EVIDENCE_REQUIRED', private_room: 'EVIDENCE_REQUIRED', late_open: 'EVIDENCE_REQUIRED', view: 'EVIDENCE_REQUIRED',
  live_music: 'EVIDENCE_REQUIRED', wheelchair: 'EVIDENCE_REQUIRED',
  upscale: 'EVIDENCE_REQUIRED',        // thêm ở Phase 1.4 hôm nay
  air_con: 'ASSUME_PRESENT',
  delivery: 'ROW_FLAG_BACKED',
}
```
- `EVIDENCE_REQUIRED`: không có bằng chứng ⇒ gap ("mình chưa xác nhận được X, nên gọi hỏi trước").
- `ASSUME_PRESENT` (máy lạnh): không bằng chứng ⇒ KHÔNG gap; chỉ thành `contrary` khi text tìm được nói ngược ("không có máy lạnh", "nóng bức"…, regex `CONTRARY`).
- `ROW_FLAG_BACKED` (giao hàng): hàng dữ liệu tự vouch (`has_delivery`/`has_order`); gap khi không hàng nào có.
- Giá trị ngoài bảng ⇒ `hardGroupOf()` trả EVIDENCE_REQUIRED + `console.warn` MỘT lần/giá trị (`hard_unclassified`) — không silent.
- `classifyHardGaps(hard, attrs, {rows, texts}) → {gaps, contrary, assumed, rowBacked, unclassified}` — mỗi ràng buộc vào đúng 1 rổ; log `step: 'attributes'` in cả 5 rổ mỗi lượt tool.
- `evidenceNote(report, lang)` — câu lệnh cho model đi kèm tool result (`_tappy_evidence_note`) vì khối system được dựng TRƯỚC khi tool chạy.
- Cùng bảng nuôi 3 nơi: prompt note, heads-up server trong stream (`streamEnrichment.ts` `gapWords = HARD_GAP_WORDS`), atmosphere guard (`gapAttributes`).

`src/lib/ai/consultative/hedgeCap.ts` — `capHedges(text, {max: 2})`: hedge = câu "chưa thấy bằng chứng / chưa xác nhận / chưa có thông tin rõ / kết quả chưa có mức giá…" (regex `HEDGE`). >2 ⇒ GỘP thành 1 câu giữ mọi chủ ngữ ("Mình chưa xác nhận được phòng riêng; mức giá…"), không bỏ thông tin. Chỉ gộp hedge có chủ ngữ đọc được (`subjectOf`); hedge không parse được giữ nguyên và đếm vào `unmergeable` (sửa `ef404dd` sau khi smoke thấy câu bị khâu vá lỗi). Câu pick không bao giờ bị đụng.

Tests: `hardConstraints.test.ts` (10 case: exhaustive union ↔ bảng ↔ gap words; EVIDENCE_REQUIRED có/không bằng chứng; private_room/wheelchair ngoài lexicon vẫn là gap; air_con không gap / contrary; delivery row flag; unclassified được log 1 lần; evidenceNote vi/en; back-compat), `hedgeCap.test.ts` (5 case: ≤2 giữ nguyên; 3 gộp giữ đủ chủ ngữ; hedge không parse được giữ nguyên; hedge trong câu pick không đếm; tiếng Anh). Live: F8 cold 1 lượt (item0) + GATE A/B F8 (hedge "chưa xác nhận được phòng riêng… nên gọi").

**(b) Mục 0.5 — danh sách test đang GHIM hành vi silent-skip / gap rỗng** (liệt kê, chưa sửa):
1. `consultative/candidate.test.ts:211` "drops entries with no usable name" — `candidate.ts` 0 console; drop không log.
2. `consultative/decisionExperience.test.ts:66` "ignores rows with no structured evidence"; `:113` "drops unranked rows once trimming applies" — không log.
3. `consultative/memoryTransientFilter.test.ts:7` "drops a transient timing…" — cố ý, không log.
4. `consultative/decisionFrame.ts` — 7 điểm filter/continue, 0 console (không có test đặt tên; cấu trúc).
5. `consultative/situationFrame.ts` — 2 điểm filter, 0 console.
6. `tools/placeType.test.ts` "drops what it cannot place" — ĐÃ surface (`_tappy_type_note`) + log; tên test cũ.
7. `account/demographics.test.ts:49,94,133` "drops/ignores gender / country outside set" — validation drop (bảo mật), cần kiểm từng chỗ có log.
8. `admin/denial.test.ts:86,95` "ignores a permission id the registry does not declare" — 0 console.
9. `ai/emptyPlaceRetrieval.test.ts:154` "drops the buttons of a venue suppressed…" — guard, log qua stats (chưa xác minh).
10. Bug ghim cũ đã sửa: `reviewAttributes.test.ts:42` từng ghim `wheelchair` KHÔNG phải gap.
11. Dòng prompt chết: `BANG CHUNG THIEU` luôn rỗng (đã bỏ ở batch 1).
12. `streamEnrichment` `gapWords` chỉ biết 7/12 hard (đã sửa 0.1).

**(c) Architecture guard đỏ từ mục 0 đến GATE B?** — **CÓ, và trả lời thẳng:** guard `no-vendor-sdk-imports` nằm TRONG suite mặc định (`scripts/architecture/controllerRules.test.ts` + `vendorCacheRule.test.ts` chạy `check.mjs` bên trong vitest). Nó đỏ từ commit `67a5e92` (mục 0.2, import type `@ai-sdk/provider`) đến `766d31a` (sau GATE B). Trong ngày, mỗi mục tôi chỉ chạy **vitest theo file liên quan + tsc**, KHÔNG chạy full suite ⇒ **các tuyên bố "green" theo từng mục trong job trước là không có căn cứ ở mức full-suite** (chúng chỉ đúng cho các file test được gọi tên). Full suite chỉ chạy 2 lần: sau GATE B (đỏ 3 test → sửa `766d31a`) và sau khi sửa (xanh). Hôm nay: full suite chạy trước Phase 2 (xanh, xem §Phase 1).

**(d) Tỉ lệ "hỏi mà không tìm" sau dọn dẹp:** ĐÃ ĐO từ log sẵn có (0 lượt) trên code cuối ngày hôm qua (`5f67dfc`): trong 54 lượt đầu-hội-thoại của câu ACTIONABLE (gateB 32 + gateB-rerun1/2 + gateB-mem 4 + smoke7a ×2, loại 8 câu N và 6 follow-up), số lượt **không gọi tool và kết bằng câu hỏi = 0/54**. Nghiên cứu V (F8 ×12, code sáng qua): 0/12. "8/8 clarify" đúng là đo mục 1, không đo bug này; con số bug này là 0/54 (định nghĩa: không tool call + reply kết thúc bằng "?"). Chưa đo trên code hôm nay — sẽ tính lại từ log Phase 2 (0 lượt).

### 0.3 Rulebook batch 1–2 — từng luật đã bỏ, gắn nhãn (owner quyết từng dòng; tôi không revert)

Batch 1 (`0311cde`, ĐANG có hiệu lực):

| # | Luật đã bỏ / đổi | Nhãn | Ghi chú |
|---|---|---|---|
| B1-1 | R7 (a)(b)(c) + "LUAT CUNG: TOI DA MOT cau hoi" (783 ký tự): (b) "gợi ý 2-3 lựa chọn rồi hỏi MỘT câu", (c) "THIẾU THÔNG TIN QUYẾT ĐỊNH (không biết mua gì/đi đâu) → hỏi" | **CONTRADICTION** | (b) mâu thuẫn hình dạng V1 (1 pick + 1 thay thế); (c) mâu thuẫn cổng actionability (mục 1) — hỏi nay là việc của server TRƯỚC model |
| B1-2 | R4 viết lại (498→470): "kết bằng khuyến nghị; hệ thống ĐÃ hỏi trước khi tìm; không hỏi trước khi tìm; không hỏi lại thứ đã biết; không hỏi 'bạn muốn loại nào'; tối đa 1 câu ở cuối" | **CONTRADICTION** (thay thế) | gom (a) của R7 + cap 1 câu vào 1 chỗ |
| B1-3 | R1b đoạn 'KHÔNG HỎI "bạn muốn ăn loại gì / thích loại nào?"…' (400 ký tự) | LENGTH-ONLY (trùng R4 mới) | cùng nội dung, khác chỗ |
| B1-4 | Khối đóng "TRƯỚC KHI GỬI – KIỂM TRA CÂU CUỐI: tối đa MỘT dấu hỏi…" (dynamic, cuối prompt) | LENGTH-ONLY (bản thứ 3 của cap 1 câu) | từng có tác dụng đo được (2026-09-15) TRƯỚC khi `clarificationGuard` chặn deterministic trên stream; nay guard đảm nhiệm |
| B1-5 | V1 block: dòng "LENH LUOT NAY (bat buoc)…" (bản 2 của lệnh search-now) | LENGTH-ONLY (trùng BUOC 1) | ~120 token |
| B1-6 | V1 block: dòng "BANG CHUNG THIEU: …" | DEAD (luôn rỗng vì dựng trước tool) | 0 rủi ro; thông tin nay đi theo `_tappy_evidence_note` |
| B1-7 | Header V1 không còn nêu "ghi đè R7(b)" | hệ quả của B1-1 | |

Batch 2 (`010128f`, ĐÃ REVERT bởi `5f67dfc` vì smoke T1 1/4 — không luật nào dưới đây đang bị bỏ):

| # | Luật | Nhãn | Ghi chú |
|---|---|---|---|
| B2-1 | Khối khách sạn: "nếu chưa rõ và cần thiết, hỏi 1 câu ngắn (bạn đi mấy người, thích gần biển hay trung tâm?)" → "giả sử hợp lý và nói rõ, KHÔNG hỏi trước khi tìm" | **CONTRADICTION** (ask instruction còn sót) | đáng giữ SỬA; mâu thuẫn trực tiếp với cổng mục 1 và luật 7 của V1 |
| B2-2 | Luật 14 provenance `price_search_results` rút gọn (chỉ chỉ sang khối DANH GIA BANG CHUNG) | LENGTH-ONLY | ≈300 ký tự |
| B2-3 | Câu về `order_search_results` (link trang riêng ShopeeFood/GrabFood) | OBSOLETE (tool không còn trả field này sau mục 5) | 0 rủi ro prose |
| B2-4 | "MINH BACH THUONG MAI (BAT BUOC với mua sắm): 1 dòng in nghiêng…" | LENGTH-ONLY (trùng dòng transparency ở khối MUA SAM) | nhưng là dòng NGƯỜI DÙNG thấy — owner quyết |
| B2-5 | Luật 18 (link nền tảng chính thức) rút gọn | LENGTH-ONLY | |
| B2-6 | Luật 5 (ảnh/link do hệ thống chèn) rút gọn câu TikTok | LENGTH-ONLY | |

**Ghi nhận:** "rulebook có được prompt-cache không?" là kiểm tra 0 chi phí lẽ ra phải đi TRƯỚC batch 1. Có — `systemShared` được cache (đọc 0.1×), nên 2 117 ký tự bỏ ở batch 1 ≈ −630 token cached ≈ **$0.00006/lượt đọc** (+ −$0.0008 mỗi lần ghi cache mới). Toàn bộ mục 7 mua ≈$0.0002/lượt với rủi ro prose thật (batch 2 revert). Batch 3 giữ nguyên trạng thái HỦY.

---

## PHASE 1 — RELEASE BLOCKERS (0 lượt; chỉ unit test)

| # | Commit | Prose | Sửa gì | Verified by |
|---|---|---|---|---|
| 1.1 | `0e15a40` | YES (chỉ khi gate lẽ ra cắt) | `groundingGate.ts`: bold kết thúc bằng `:` = NHÃN, không bao giờ là tên quán (`isLabelHeading`; lexicon đóng cho nhãn không có dấu hai chấm: Lưu ý/Gợi ý/Mẹo/Tổng kết/Bữa…/Ngày N/Thời tiết…). Nhãn vẫn KẾT THÚC block phía trước, không bị cắt, không tính là quán grounded (reply chỉ còn nhãn vẫn nhận câu fallback). Cùng predicate áp cho `ungroundedNamesIn` (detector) và `historyCompaction` (từng liệt kê "**Lưu ý:**" vào "đã gợi ý"). | unit: 9 case mới (mỗi nhãn có `:`, `**Lưu ý**` không `:`, tên quán thật VẪN bị khớp/cắt, nhãn kết thúc block, chỉ nhãn ⇒ fallback, "Quán Gợi Ý Ngon" là quán) — **đỏ 9/9 trên gate cũ**, xanh sau; +2 case detector/compaction |
| 1.1 grep | — | — | 5 nơi parse bold: gate (sửa) · `ungroundedNamesIn` (sửa) · `historyCompaction` (sửa) · `referenceResolver.priorVenuesIn` (đã bỏ qua colon + lexicon nhãn — không đổi) · `placeMatch.proseHeaders` (anchor đặt ảnh/link; nhãn không khớp tên nào — vô hại, không đổi) · backstop `namesKnown` dùng `isGrounded` nên nhãn = "không biết" (không đổi); `pickedRecs` khớp TÊN HÀNG trong prose, không parse bold. | đọc code |
| 1.2 | `f5af6b3` | YES (chỉ câu bị guard cắt) | `placeClaimGuard.ts`: `splitClauses` bỏ qua dấu phân clause (" - ", " – ", " — ", ", ", " và ") nằm TRONG `**…**`; offender được xét trên clause đã che bold ⇒ tên chứa từ-khẳng-định ("**Cơm Tấm Sài Gòn - Giao Hàng Tận Nơi**") không bị cắt đôi, không bị coi là claim. `snippetPriceGuard.ts`: start/end marker của clause giá bỏ qua vị trí trong bold; "(" ")" trong tên không phải parenthetical giá. Atmosphere guard đã che bold từ 2026-09-18; money guard cắt câu/số, không cắt clause. | unit `boldNameClauseBoundary.test.ts` (10): tên " - ", " – ", " — "; case tái hiện E6 **đỏ trên guard cũ** (guard cũ trả nguyên câu kèm claim "có giao hàng" vì thấy từ đó trong TÊN); dấu ngoài tên vẫn split; ngoặc trong tên. Guard cũ với snippet-price: không tìm được case đỏ (luật residue đã dừng trước tên) — fix là hardening, test ghim bất biến. Suite guard 191 xanh. |
| 1.3 | `f8f896f` | YES (chỉ câu backstop/G1b trên follow-up) | `ConsultativeV1Context.referenced` (route đã resolve "chỗ đó/quán số 2/tên" → prior venues); `subjectOnly()` chặn cả V1 pick backstop lẫn G1b fallback: có referenced ⇒ chỉ được nêu hàng KHỚP quán đó, không có ⇒ không viết câu nào + log `skipped_referenced`. Lượt đầu không đổi. | unit `pickBackstop.test.ts` +3: hình P3 ⇒ không pick + log; hàng có quán ⇒ nêu đúng quán đó (không phải engine pick); lượt đầu như cũ — **đỏ 2/3 trên code cũ**; suite V1 stream/route 34 xanh |
| 1.4 | `52c5353` | YES (V1 ON; OFF byte-identical) | (i) route `rankForModel`: dưới V1 KHÔNG reorder `results`/`hotel_list` theo ranker (shopping và flag OFF không đổi). (ii) `modelPayload.ts` `modelChooses`: model đọc 10 hàng theo THỨ TỰ NHÀ CUNG CẤP, `_tappy_shortlist` + `_tappy_ranking` KHÔNG đi tới model, note nói rõ "không phải thứ tự ưu tiên". (iii) V1 block: luật 1 trỏ vào tool rows; bullet shortlist thay bằng "tự chọn cho tình huống, không chọn máy móc theo điểm; sang/xịn ⇒ không guest house/nhà nghỉ/hostel; không bằng chứng sang ⇒ nói chưa xác nhận". (iv) `situationFrame.ts`: ràng buộc cứng `upscale` (UPSCALE_RE dùng chung với mood fancy; "sang" động từ bị loại). (v) `hardConstraints.ts`: upscale = EVIDENCE_REQUIRED, attr `fancy`, gap word "mức sang trọng". (vi) `upscale.ts` `admitsForUpscale`: shortlist loại budget lodging (guest house, nhà nghỉ, hostel, dorm, motel, backpackers, homestay giá rẻ) CHỈ khi có `upscale`; mỗi loại trừ được log; shortlist nay được log (`step: shortlist`) vì không tới model nữa. | unit `upscale.test.ts` (22): cụm "sang chút / xịn hơn / sang trọng / đẹp hơn / fancy" ⇒ hard upscale; "sang Quận 1" không; ĐÚNG 10 hàng T8: ranker vẫn xếp guest house #1, shortlist với predicate route KHÔNG có guest house và The Poplar Resort = best_overall; không upscale ⇒ như cũ; model copy thứ tự provider + không engine field. `modelPayload.test` (OFF không đổi + case V1), route test đọc shortlist từ log. Suite chat/consultative/recommendation/tools 2 424 xanh. |
| 1.4 rating còn ảnh hưởng thứ tự ở đâu | — | — | (1) `rank.ts` scoring (rating 0..1 + reviewCount + distance + price + stars) → `_tappy_shortlist` role + engine Pick → **thẻ**: lead/`recommended` (liveView `primaryOf`), nhãn `popular` (vị trí 0 ≥ N đánh giá); **backstop server** (`pickName`/`engineFirst`, chỉ khi model không nêu quán); `_tappy_evidence_gap`. (2) Shopping: reorder + trim theo rank (không đổi; có decision card riêng). (3) Thứ tự nhà cung cấp (Google relevance — tự nó có trọng số rating). (4) `rank.ts:147` thưởng gần user (BUG-011). Model: KHÔNG còn. | đọc code |
| 1.5 | `a4e0e7d` | NO | Assertion compile-time giữa `JsonSchemaLike` và `JSONSchema7` của vendor là **rỗng** trong repo này: `@ai-sdk/provider` re-export `JSONSchema7` từ `json-schema`, mà `@types/json-schema` KHÔNG được cài ⇒ type vendor = `any` (đã thử thu hẹp type của hook: tsc không báo lỗi). Vì vậy: ghim hình dạng theo version (ai 4.3.19 / @ai-sdk/provider 1.1.3 / draft-07) trong file, giữ dòng assignability cho ngày có typings, và assert RUNTIME với schema THẬT do SDK sinh (`zodSchema(...).jsonSchema`, cùng conversion `tool()` dùng) — type/properties/required đúng hình dạng, `repairArgs` chạy trên schema thật đúng như unit test giả định. File nằm trong `providers/` (vendor import hợp lệ), guard 14/14. | unit (2) + tsc + reasoning về `any` |
| 0.2 follow-up | `766d31a` (hôm qua) | NO | import type vendor ngoài lớp provider → kiểu cấu trúc | full suite xanh |

**Gate trước Phase 2 (commit `a4e0e7d`, 0 lượt):** full web `npm test` **713 file / 13 591 test xanh, required-suite gate OK** (47 suite bắt buộc chạy, kể cả `|db|`); architecture guard 14/14 (nằm trong suite mặc định — không cần thêm); `tsc -p tsconfig.json --noEmit` 0; control-byte guard sạch; Android `:app:testDebugUnitTest` **730/730** (không đổi source Android, chạy để đủ gate).

---

## PHASE 2 — SINGLE GATE (56 lượt: 40 + 8 rerun + 6 memory + 2 rerun memory)

Server `audit-owner3` :3101 trên `audit-nonprod` @ `43d37d2` (mọi cờ ON), restart trước gate (Serper cache lạnh), memory xoá, bearer mint mới; run dirs `docs/audit/eval/runs-owner3/finalGate{,-rerun1,-rerun2,-mem,-mem-rerun1,-mem-rerun2}`, sink segment `finalGate*`.

### 2.1 Điểm thô, danh sách fail deterministic, lớp T8

| | Baseline chấm lại | GATE B (hôm qua) | **FINAL (hôm nay)** |
|---|---|---|---|
| **Raw ✅+⚠️ / 40** | 34 | 36 | **38** |
| ❌ lần 1 | 6 | T2 T8 P3 E6 | **T1, P8** |
| Rerun 2× mỗi câu ❌ | — | T2 ✓✓ P3 ✓✓ E6 ✓✓ T8 ✗✗ | **T1 ✓✓ · P8 ✗✓** |
| **Fail deterministic (✗✗ khi rerun)** | — | T8 | **KHÔNG CÓ** |
| 8 hội thoại hỏi-rõ (lượt trả lời) | — | 8/8 | 6/8 lần 1 (S5b ❌ nước hoa NAM cho bạn gái; E2b ❌ câu pick bị cắt) → rerun: S5b ✓✓, E2b ✓(⚠️)✓(⚠️) — biến thiên |
| Memory lớn (6) | 6/6 | 4/4 | **5/6** (F8 ❌ không nêu pick) → rerun F8 ✓✓ — biến thiên; 0 câu hỏi do memory |
| Lớp T8 | — | ❌ | **✅** — "Resort Phú Quốc … sang chút" ⇒ **Ocean Bay Resort & Spa** (4.7⭐/3 176), không guest house (1/1 live + 22 unit test) |
| Hỏi-mà-không-tìm (câu actionable, lượt đầu) | — | 0/54 | **0/49** |

**Chấp nhận:** raw 38 ≥ 36 ✓ · fail deterministic = 0 ✓ · lớp T8 đạt ✓. **Không revert fix nào.**

Chấm từng câu (✅ / ⚠️ = đạt có ghi chú / ❌): F1 ✅ (chọn theo khoảng cách 0.1 km — model tự chọn, "danh gia cao nhất" sai + không dấu ⚠️) · F2 ⚠️ (2 quán thay thế) · F3 ✅ · F4 ✅ · F5 ✅ · F6 ⚠️ (1 dòng không dấu) · F7 ✅ hỏi-rõ · F8 ⚠️ (2 lần search, câu hỏi cuối, 3 hedge) · S1 ⚠️ (2 mảnh câu sau guard) · S2 ✅ · S3 ✅ · S4 ⚠️ (prose chỉ còn dòng see-card — xem lỗi mới §4) · S5 ✅ · S6 ✅ · S7 ⚠️ (hỏi "ưu tiên") · S8 ⚠️ (mảnh mồ côi) · T1 ❌→✓✓ · T2 ⚠️ (backstop + hỏi cuối + "**Agoda" mảnh) · T3 ✅ · T4 ✅ (⚠️ 2 thay thế + mảnh) · T5 ✅ · T6 ⚠️ (pick bị cắt, `**Thay thế:**` còn nguyên = 1.1 hoạt động) · T7 ⚠️ · T8 ✅ (⚠️ "tiện ích cao cấp" không bằng chứng; hotel path không có hard-gap) · P1 ⚠️ (2 thay thế, hỏi cuối) · P2 ✅ (⚠️ 2 thay thế) · P3 ✅ (**1.3 hoạt động** — tìm theo tên, không backstop sai) · P4 ✅ · P5 ✅ · P6 ⚠️ (claim "chất lượng cao/cặp đôi yêu thích") · P7 ✅ · P8 ❌→✗✓ · E1 ✅ (Bùi Viện cho nhóm — chọn theo tình huống) · E2 ✅ · E3 ✅ (Acoustic Bar cho nhạc sống) · E4 ⚠️ · E5 ✅ · E6 ⚠️ (claim không bằng chứng; khu vực) · E7 ⚠️ (phim từ kiến thức model) · E8 ✅.

**P8 — cần nói rõ dù không "deterministic" theo luật 2/2:** "Spa nào mở khuya sau 22h ở Quận 3" — 2/3 lần hôm nay model chọn Massage Cổ Phong Q3 (đóng 22:00, 12 190 đánh giá) và viết "đóng cửa lúc 22:00 vừa đúng với nhu cầu khuya"; 1/3 chọn đúng Charm Spa Garden (00:00). GATE B (còn shortlist) P8 ✅. Quy cho **1.4**: không còn shortlist, model nghiêng về số đánh giá; đồng thời `late_open` là EVIDENCE_REQUIRED đọc review-attribute, KHÔNG đọc `opening_hours` của hàng ⇒ heads-up "chưa thấy bằng chứng về giờ mở khuya" xuất hiện trong khi hàng ghi rõ "mở đến 00:00". Đề xuất (chưa làm): `late_open` ⇒ ROW_FLAG_BACKED qua `opening_hours` (đóng ≥ 23:00 hoặc qua đêm) + loại khỏi shortlist quán đóng trước giờ user nêu — cùng cơ chế `admitsForUpscale`. Owner quyết: giữ 1.4 (T8 đạt, E1/E3 chọn theo tình huống) và sửa P8 ở job sau, hay revert 1.4.

### 2.2 Differentiation metric (`scripts/audit/diffmetric.mjs`, 0 lượt, 40 câu trả lời của finalGate)

| | FINAL | GATE B |
|---|---|---|
| Quán nêu tên có trong hàng tool (trung bình / câu trả lời) | **2.30** | 2.50 |
| **Bịa tên quán** (tên in đậm không có trong hàng của lượt này/lượt cha) | **0** sau soát tay | 0 |
| Thực thể không-quán từ kiến thức model | 3 tên phim ở E7 (lượt không tool) | 3 (E7) |
| Sự kiện realtime dùng trong câu trả lời (0–6: giá · khoảng cách/khu vực · giờ · link đặt/CTA · bằng chứng review · ảnh card) — trung bình | **3.98** | 4.05 |
| Phân bố số sự kiện | 0:2 · 1:5 · 2:5 · 3:3 · 4:2 · **5:11 · 6:12** | 0:1 1:3 2:6 3:4 4:4 5:13 6:9 |
| Tỉ lệ dùng: giá / khoảng cách / giờ / link / review / ảnh | 47 % / 57 % / 60 % / 88 % / 75 % / 70 % | 40 / 57 / 60 / 95 / 82 / 70 |
| **TƯ VẤN** (pick + đánh đổi hoặc hợp ràng buộc) / CHỈ CHỌN / LIỆT KÊ / KHÔNG QUÁN | **18 / 11 / 6 / 5** | 23 / 6 / 7 / 4 |

Đọc: 29/40 câu (72 %) có lựa chọn nêu tên với dữ liệu thật; 23/40 dùng ≥5 loại sự kiện realtime — đây là thứ model không có tool không thể viết. ADVISES giảm 23→18 so với GATE B vì model tự chọn viết ngắn hơn về đánh đổi (PICKS tăng 6→11); metric là proxy nội bộ, đo bằng regex trên prose (không chạy ChatGPT/Gemini). "Bịa tên quán = 0" sau soát tay: script gắn cờ 2 span in đậm ở S3 ("Phuương án 2", "Gợi ý") là nhãn, không phải tên.

### 2.3 Unit cost model (`scripts/audit/unitcost.mjs`; giá Haiku 4.5: $1/M uncached, $1.25/M cache write, $0.10/M cache read, $5/M out; Serper $0.001/credit; memory extraction đo thật)

**(a) Theo LOẠI LƯỢT — finalGate (cold: Serper cache lạnh; "cold/warm" của prompt cache = lượt ghi cache ≥10k token = prompt hình dạng mới)**

| loại | n | uncached in | cache write | cache read | out | Serper cr | LLM uncached $ | LLM cached $ | memory $ | Serper $ | **tổng $** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 hỏi-rõ (server) | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **$0** |
| T2 tìm + trả lời | 36 | 3 634 | 12 075 | 40 439 | 703 | 5.22 | $0.0072 | $0.0191 | $0.0002 | $0.0052 | **$0.0317** |
| ├ T2 cold (prompt mới) | 12 | 4 734 | 26 497 | 28 544 | 742 | 7.0 | $0.0084 | $0.0360 | $0.0001 | $0.0070 | **$0.0515** |
| └ T2 warm | 24 | 3 084 | 4 864 | 46 387 | 684 | 4.33 | $0.0065 | $0.0107 | $0.0002 | $0.0043 | **$0.0218** |
| T3 follow-up từ kết quả đã có (server) | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **$0** |
| T4 chat không tool (LLM) | 3 | 3 | 13 321 | 13 859 | 395 | 0 | $0.0020 | $0.0180 | 0 | 0 | **$0.0200** |
| ├ T4 cold | 2 | 3 | 17 403 | 10 394 | 452 | 0 | | | | | **$0.0251** |
| └ T4 warm | 1 | 3 | 5 157 | 20 788 | 282 | 0 | | | | | **$0.0099** |
| T2 rerun (warm Serper, n=4+4) | 8 | 5–6k | 5.6–10.8k | 42–47k | 1.3k | 6.8–7.8 | | | | | $0.0314–0.0381 (T1 planner 5 tool nặng kéo lên) |

Ghi chú: "T3" trong bộ 40 chỉ có 1 (F5 — giờ mở đã nêu ở lượt trước ⇒ server trả lời); các follow-up khác (F6, P3, E4) tìm lại theo tên = T2, (S3, T3) không tool = T4.

**(b) Theo HỘI THOẠI (finalGate, đo, cold Serper) — 34 hội thoại, tổng $1.2015**

| profile | quan sát | $/hội thoại (đo) | thành phần |
|---|---|---|---|
| A: câu actionable → 1 lượt tìm | 20/34 (59 %) | **$0.0325** | 1×T2 |
| B: câu rộng → hỏi-rõ + tìm | 8/34 (24 %) | **$0.0284** | T1 $0 + T2 (F7 .0470 · S5 .0190 · S6 .0248 · T5 .0211 · P5 .0268 · P7 .0201 · E2 .0507 · E5 .0174) |
| C: A/B + 1 follow-up | 6/34 (18 %) | **$0.0542** | F1 .0665 · F4 .0463 · S2 .0682 · T2 .0319 · P2 .0698 · E3 .0427 |
| Trung bình | | **$0.0353** | = $1.2015 / 34 |

**(c) COLD vs WARM.** Eval chạy Serper lạnh + 12/36 lượt T2 là prompt hình dạng mới (ghi cache 26k). Production: rulebook chung (≈12k token) cached và dùng chung mọi user; dynamic block (~2–5k) ghi mỗi lượt. Số nên dùng cho mô hình tài chính: **T2 warm đo được $0.0218/lượt** (n=24) — KHÔNG phải $0.0317 (trộn cold) hay $0.0178 (warm-projected = giả định không ghi cache nào, không đạt được vì dynamic block luôn ghi). Giả định để giữ warm: Anthropic prompt cache TTL 5 phút ⇒ cần ≥1 request/5 phút liên tục (~288 lượt/ngày rải đều, hoặc traffic theo cụm); dưới mức đó mỗi lượt đầu sau 5 phút trả $0.033 ghi cache (chênh cold−warm ≈ $0.030). Serper: mỗi T2 tốn 4.3 credit warm-provider (5.2 trung bình) — Serper cache in-process chỉ giúp cùng câu trong cùng process.

**(d) Dự phóng tháng (warm, mix quan sát A 59 % / B 24 % / C 18 %; C = T2 warm + follow-up trung bình $0.0142 [3/6 tìm lại T2 warm, 2/6 T4 warm, 1/6 T3 $0])**

| | $/hội thoại | 1 000 hội thoại/tháng | 10 000 | 100 000 |
|---|---|---|---|---|
| Warm (dùng cho tài chính) | ≈ **$0.0246** | **$25** | **$246** | **$2 460** |
| Cold đo được (trần) | $0.0353 | $35 | $353 | $3 530 |

(chưa gồm: memory extraction $0.0002/lượt đã tính trong tổng; TTS/vision; phí Serper theo gói — $0.001/credit là giả định của mọi báo cáo trước.)

**(e) 3 driver chi phí lớn nhất (finalGate, theo tỉ trọng $):** ① **cache WRITE 49 %** (26k token ở lượt prompt mới + ~4.9k dynamic block mỗi lượt, giá 1.25×) · ② **Serper 16 %** (5.2 credit/T2) · ③ **uncached input 11 %** ≈ output 11 % (tool result 10 hàng nén + văn bản bước 1 ≈ 3–4.7k token) · cache read 12.5 % · memory 0.6 %.
**Tiết kiệm rẻ nhất tiếp theo (mô tả, KHÔNG làm):** với lượt T2 warm, 4.9k token ghi cache ≈ dynamic system (~2k) + đuôi hội thoại/tool result bước 1 (~3k) — phần đuôi được ghi ở 1.25× nhưng chỉ được đọc lại ở bước 2 của cùng lượt (và ở follow-up 18 % hội thoại). Bỏ breakpoint cache trên đuôi message (giữ breakpoint rulebook + dynamic system) ⇒ đuôi gửi thẳng 1.0× thay vì ghi 1.25× + đọc 0.1× ⇒ tiết kiệm ≈ 0.15 × 3k ≈ $0.0005/lượt T2 (~2 %), 0 rủi ro prose; cần đo lại vì bước 2 hiện đọc đuôi từ cache. Lớn hơn nhưng không "rẻ": giảm 26k cache write ở prompt mới bằng cách ổn định hình dạng dynamic block (ít biến thể) — đó là kỹ thuật, không phải cắt thông tin.

Mọi số ở (a)–(e): cold/warm ghi rõ từng dòng; số lượt đứng sau: finalGate 48 turn (40 model), rerun 8, mem 6+2.

---

## PHASE 3 — UAT PREP (0 lượt)

- Backend :3101 (`audit-owner3`, mọi cờ ON) trên `audit-nonprod` @ `43d37d2`, warm 400, memory audit ĐÃ XOÁ (trạng thái mặc định; câu 19 của checklist hướng dẫn seed rồi xoá).
- APK debug build 17:06 từ `43d37d2` (source Android không đổi từ `766d31a`), cài `emulator-5554` (`Pixel_8_uat`, có cửa sổ), `pm clear` identity guest, app mở tới màn đăng nhập, 0 FATAL logcat.
- `docs/audit/uat-checklist.md`: thêm dòng 20–24 (4 fix + lớp "sang/xịn") và câu 15–19 (upscale ×3, follow-up đúng quán, tên có gạch, 6 câu rộng phải hỏi đúng 1 lần, hội thoại memory lớn); commit tham chiếu cập nhật.

---

## 4. Lỗi mới thấy khi chấm (KHÔNG sửa — luật "không patch on top" sau gate; owner quyết cho job sau)

1. **Bold kết thúc bằng "?" bị gate coi là tên quán** (S4: `**Ưu tiên chính của bạn là gì?**` ⇒ cắt cả phần sau, prose chỉ còn see-card line). Cùng lớp 1.1; fix 1 dòng: `isLabelHeading` thêm `?`/`？`.
2. **P8 / `late_open`**: xem §2.1.
3. **Hotel path không có hard-gap / atmosphere guard**: `classifyHardGaps` và `extractAttributes` chỉ chạy cho `search_places` ⇒ T8 "đầy đủ tiện ích spa & resort cao cấp" không bị hedge/cắt. Đề xuất: chạy cùng pipeline cho `get_hotel_prices` (hotel_list).
4. **Backstop "alternatives_only" bỏ sót câu bắt đầu bằng khoảng trắng + bold** (E2b lần 1: " **Galaxy Cinema…** cũng gần" đứng một mình sau khi pick bị cắt) — regex ALT không có "cũng"; cân nhắc coi câu chỉ có "cũng/hoặc" là alternative.
5. **Câu "bạn có muốn… không?" cuối reply** (F7-mem, T4-mem, P1, P5b, P7b, S2-mem) — trong hạn "1 câu ở cuối" nhưng thường vô ích; lớp có sẵn.
6. **F7b "giá 100–200k/người (vừa vặn ngân sách)" với ngân sách "dưới 100k"** — band của hàng đúng, kết luận sai; snippet-price guard chỉ kiểm giá có bằng chứng, không kiểm phép so sánh với ngân sách.
7. **S5b lần 1 chọn nước hoa NAM cho "bạn gái"** — shopping engine (rating-first, chưa đổi ở 1.4) + model không kiểm giới; 2 rerun chọn đúng. Lớp: shopping chưa có "class-of-product vs situation" như `admitsForUpscale`.

## 5. Quyết định mở cho owner
1. **P8/late_open** (giữ 1.4 + sửa `late_open` ROW_FLAG_BACKED ở job sau — đề xuất của tôi — hay revert 1.4).
2. Rulebook batch 2: 6 dòng ở §0.3 — giữ bỏ dòng nào (B2-1 tôi đề nghị sửa thật; còn lại LENGTH-ONLY, không đáng).
3. 7 lỗi §4 — có mở job sửa không.
4. Mục 2 payload A/B/C, mục 3 `referrerPolicy="no-referrer"`, key Google Places prod, `passengers` cap 9 — vẫn chờ từ báo cáo trước.
5. Shopping: có áp "model tự chọn" (1.4) cho `search_products` không (hiện shopping vẫn shortlist + reorder server-side).

## 6. Lượt đã dùng
Phase 0: 0 · Phase 1: 0 · Phase 2: 40 (gate) + 8 (rerun T1/P8/S5b/E2b ×2) + 6 (memory) + 2 (rerun F8 memory) = **56** · Phase 3: 0. **Còn 14/70.** Không vượt.

## 7. Verified by what — tóm tắt
- Unit test: 1.1 (11 case mới, 9 đỏ→xanh trên code cũ), 1.2 (10, case E6 đỏ→xanh), 1.3 (3, 2 đỏ→xanh), 1.4 (22 + 3 sửa), 1.5 (2 runtime + reasoning về `any`), full web 713 file/13 591, Android 730.
- Live: finalGate 48 turn + 8 rerun + 6 memory + 2 rerun memory (đều trên `43d37d2`, audit env, cờ ON); T8 lớp đạt 1/1 live.
- Reasoning only: 1.5 assignability (vendor type = `any`), "warm-projected" $0.0178, dự phóng tháng, tiết kiệm tiếp theo §2.3(e), giả định TTL cache 5 phút.
- Đo từ log (0 lượt): 0.1 số học, 0.2(d) 0/54 và 0/49, 2.2 metric, 2.3 bảng chi phí.
