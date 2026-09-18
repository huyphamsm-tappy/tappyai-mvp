# BÁO CÁO TỐI ƯU CHI PHÍ — /api/chat (2026-09-18)

Nhánh `merge/main-into-v3` @ `19a4463` (+ commit này). Chỉ commit local — không push, không deploy, không xoá.
Giữ nguyên: layout (prose + carousel, các trường card, thứ tự CTA, Tappy rating), thu thập dữ liệu (Serper-first, số
dòng, ảnh, link review, bán kính). Số liệu chi tiết: `docs/audit/cost-report.md`; dữ liệu thô `docs/audit/eval/cost/`.

## 1. Chi phí trước / sau (đo thật trên audit env, Haiku 4.5, mọi cờ ON)

| | trước | sau | thay đổi |
|---|---|---|---|
| Lượt có tool (tìm quán) | $0.0368 | **$0.0293** | −20 % |
| Lượt follow-up thường | $0.0142 | $0.0123 | −13 % |
| Follow-up trả lời được từ dữ liệu đã có (giờ/SĐT/địa chỉ) | $0.0113 | **$0** | −100 % |
| Chào hỏi / cảm ơn | ≈$0.003 | **$0** | −100 % |
| Trung bình mỗi lượt (bộ 40 câu) | $0.0300 | **$0.0247** | **−18 %** |
| Token input KHÔNG cache mỗi lượt có tool | ≈19 000 | ≈5 000 | −74 % |
| Tỉ lệ cache hit | 55 % | 73 % | |
| Ước tính tháng @1k lượt/ngày | ≈$900 | ≈$740 | |
| @10k lượt/ngày | ≈$9 000 | ≈$7 400 | |
| @100k lượt/ngày | ≈$90 000 | ≈$74 000 | |

Giá dùng: Haiku 4.5 $1/M input, $1.25/M cache write, $0.10/M cache read, $5/M output; Serper $0.001/credit
(`/maps` 3 credit); memory-extraction ≈$0.004/lượt (ước tính, chưa đo). "Trước/sau" tính ở trạng thái cache ấm.
Phần còn lại của hoá đơn giờ chủ yếu là **Serper (≈$0.005–0.010/lượt tìm)** và **lệnh trích memory (≈$0.004/lượt
có đăng nhập)** — hai mục cần quyết định của owner (xem mục 4).

## 2. Tỉ lệ đạt eval (40 câu, mọi cờ ON)

**34/40 — bằng baseline Step F (34/40).** 6 FAIL: S2 (mua sắm hỏi thay vì chọn — kết quả là bài listicle không có
giá), S5 (quà tặng: hỏi loại quà), T2 & T8 (`get_hotel_prices` trả 0 dòng trên audit env), T5 ("đi chơi ở đâu" — hỏi
thay vì tìm), T6 (G1 cắt hết câu ở lượt planning 2 lần search). Cải thiện so với Step F: T1 (planner đã LẬP kế hoạch
với ngày giả sử cuối tuần), E1 (có card, không ảnh inline), F6 (tìm lại theo tên + trả lời trung thực).
Lưu ý đo được: kết quả eval phụ thuộc **trạng thái memory** của user audit — sau ~30 lượt, model bắt đầu hỏi "bạn
muốn ăn gì" (F7, T4) vì memory đã có sở thích; xoá memory thì hai câu này đạt lại. Bảng chấm chi tiết:
`docs/audit/eval/consultative-40.md` (Step F) + `docs/audit/eval/runs-cost/` (lượt chạy sau tối ưu).

## 3. Đã thay đổi gì (mỗi mục 1 commit, test xanh, eval sau mỗi mục)

| # | Mục | Kết quả |
|---|---|---|
| 1 | Thứ tự prompt thân thiện cache | Prompt đã static-first sẵn; thêm **breakpoint cache thứ 2 ở message user cuối** (`claude.ts`) ⇒ bước 2 của lượt có tool đọc lại phần prefix từ cache. Hit rate 55 % → 73 %. Ghi nhận: prefix tĩnh có 4 biến thể vì bộ tool đổi theo lượt (bỏ `search_products` khi intent offline…) — không đổi vì đó là cơ chế chất lượng. |
| 2 | Xoá luật bị V1 ghi đè | Đã làm (R1(a), R1b 1..3, R2, R7(b) — chỉ khi cờ ON, OFF giữ nguyên byte) rồi **REVERT** vì pass 40 câu tụt 30/40; chạy lại sau revert không hồi, xoá memory mới hồi ⇒ nguyên nhân là memory, không phải mục này. Vẫn giữ revert: tiết kiệm chỉ ≈150 token đã cache (≈$0.00002/lượt), không đáng rủi ro. |
| 3 | Luật theo vertical | **Không áp dụng** — rủi ro hơn mô tả: phần luật theo vertical nằm trong prefix ĐÃ CACHE ($0.10/M), tiết kiệm ≤ $0.0012/lượt (~4 %) nhưng nhân số nhánh cache và làm mất luật ở lượt đa lĩnh vực (planner cần food+stay+attraction+transport). |
| 4 | Payload tool cho model = shortlist 3–5 + trường cần | **Áp dụng** (`modelPayload.ts`): model đọc ≤5 dòng (shortlist ∪ top), bỏ lat/lng/giờ 7 ngày/ảnh; card vẫn đủ 8–10 dòng (dựng từ kết quả đầy đủ TRƯỚC khi cắt). Tool result 8–10k → 4.5–6k token. Bẫy đã gặp & sửa: cắt trước bước "carve" làm bộ thu ảnh mất photo ⇒ 5 lệnh `/images` mỗi lượt (bắt được nhờ Serper meter). |
| 5 | Cache Serper 6–24h qua restart | **Không áp dụng** — rủi ro hơn mô tả: (a) code hiện ghi rõ không lưu dữ liệu Maps quá 30 phút vì điều khoản Google Places — lưu bền 6–24h là quyết định pháp lý của owner; (b) `open_now` tính lúc fetch ⇒ cache 24h sẽ nói "đang mở" của hôm qua trừ khi đổi cách lưu (đổi thu thập dữ liệu); (c) cần bảng Supabase (DDL owner apply). Ước tính giảm Serper: bằng tỉ lệ (query, location) lặp lại giữa các user trong TTL — trong eval này 0 vì 40 câu đều khác nhau. |
| 6 | Nén lịch sử | **Áp dụng** (`historyCompaction.ts`): reply cũ của bot giữ câu chọn + tên quán in đậm (≤420 ký tự); 3 message cuối + mọi lượt user giữ nguyên; resolver V1 và ADR-024 không đổi (đọc reply cuối/đọc server). Tiết kiệm 0 trên mẫu (thread ngắn), chặn tăng ở thread dài. |
| 7 | maxTokens | 3072 → **2048** cho lượt có tool (max đo được 821); planning 4096, ảnh 1024 giữ nguyên. Không đổi chi phí, chỉ chặn trả lời chạy dài. |
| 8 | Bỏ qua model | **Áp dụng** (`cannedReply.ts`): chào/cảm ơn/ok/bye ⇒ trả lời sẵn; follow-up hỏi giờ/SĐT/địa chỉ của MỘT quán mà lượt trước đã nêu ⇒ trả lời từ dữ liệu đã có (449 ms, $0). Câu hỏi thiếu dữ liệu vẫn đi model (có thể tìm lại theo tên). Quota vẫn trừ như cũ (quyết định sản phẩm). |

Sửa thêm trong lúc chạy: tên quán in đậm có dấu gạch ("Tám Riêu - Phan Xích Long") không còn bị cắt đôi khi bỏ mệnh
đề không có bằng chứng; dòng "1.2.3." (list bị guard cắt rỗng) bị loại.

Instrumentation (chỉ bật khi có env `AUDIT_USAGE_LOG_FILE`, không chạy ở production): đếm lệnh Serper theo
endpoint + ghi mỗi lượt một dòng JSON (usage, Serper, kích thước từng phần prompt). Script: `scripts/audit/costrep.mjs`.

## 4. Cần owner quyết định
1. **Cache Serper bền 6–24h** (mục 5): có chấp nhận lưu dữ liệu Maps qua Serper dài hơn 30 phút không (điều khoản)?
   Nếu có: lưu bản ghi thô + tính `open_now` lúc đọc, bảng Supabase `tool_cache` (DDL), TTL theo endpoint.
2. **Memory extraction** ≈$0.004/lượt đăng nhập (≈13 % chi phí sau tối ưu): chỉ chạy khi lượt có thông tin mới
   (`worthExtract` hiện đã lọc một phần) hoặc gộp 1 lần/phiên?
3. **Bộ tool theo lượt** tạo 4 nhánh cache: giữ (chất lượng) hay thống nhất bộ tool + chặn ở execute?
4. `get_hotel_prices` trả 0 dòng trên audit env (T2/T8) — kiểm key/config.
5. Mục 2 (xoá luật bị V1 ghi đè) — muốn áp dụng lại không (đã có test, byte-identical khi OFF)?
6. Quota với câu chào/follow-up trả lời sẵn: vẫn trừ 1 câu (như hiện tại) hay miễn?
7. Các FAIL ngoài phạm vi: shopping listicle (S2), quà tặng (S5), "đi chơi ở đâu" (T5), G1 ở lượt planning (T6).

## 5. Test & trạng thái máy
- Web **13 374 passed / 68 skipped (703 file)**, `tsc` sạch, Android unit **727 / 0**. Ngân sách LLM: **93 / 120**.
- Backend audit đang chạy `:3101` cấu hình **`audit-flags-on`** (mọi cờ ON), worktree `audit-nonprod` ở commit cuối.
- APK debug build lại (trỏ `10.0.2.2:3101`) và đã cài trên `emulator-5558`; emulator đang chạy.
- Hướng dẫn UAT: `docs/audit/uat-checklist.md`.
