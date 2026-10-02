# P1 RESOLUTION + RELEASE GATE — báo cáo 2026-09-19 (nhánh `merge/main-into-v3`, code `b250124` → cuối job `8b0dc46`)

Ngân sách 79 lượt. **Đã dùng: A 0 · B 11 (8 kế hoạch + 3 từ buffer) · C 51 (40 gate + 6 rerun + 5 memory; E5 canned $0) → 62; còn 17.** Canned $0 không tính. Mỗi khẳng định ghi VERIFIED BY: unit / live / reasoning.

## 0. Kết luận trước

- **P1 đã có nguyên nhân thật và đã sửa (3 commit), re-test Android 11 lượt: mọi chu trình clarify → chip đều search, 0 lần hỏi lại.** Nguyên nhân KHÔNG phải `toolChoice` (giống nhau ở hai client). Chi tiết §1–§2.
- **Gate 40: raw 37/40** (❌ S4, S7, T2). Rerun 2×: S4 ✓⚠️ và T2 ⚠️✓ = biến thiên; **S7 ✗✗✗ = deterministic hôm nay**, nhưng **không phải regression của commit nào** (cùng hiện tượng đã có ở gate 38/40 trước — mục §7) ⇒ không có commit để revert; là lỗ hổng cũ của shopping (danh sách sản phẩm bị guard cắt, không có backstop pick). Zero tên quán bịa trong prose cuối; `late_open` (P8) và `upscale` (T8) pass. Memory lớn 6/6.
- **Acceptance "raw ≥ 38" KHÔNG đạt (37).** Go/no-go ở §10: **NO-GO theo đúng tiêu chí; GO có điều kiện nếu Owner chấp nhận S7 là lỗi shopping cũ** (mọi ❌ đều ở shopping/hotel-price; 5 vertical place đều 8/8 raw).

## 1. A.1 — Diff request Web vs Android, cùng hội thoại (0 lượt; `scripts/audit/capweb.mjs` + `capdiff.mjs`; env `AUDIT_MODEL_REQUEST_FILE` + `AUDIT_DRY_RUN=1`, commit `17ad235`; bản đầy đủ `docs/audit/eval/capture-diff-2026-09-19.md`, raw `capture-2026-09-19.jsonl`)

Hình dạng: "an gi ngon gio" → canned clarify → "dưới 100k/người". A = harness web (Pro audit user), B = app Android (guest) — đúng lúc tái hiện lỗi. **Mảng message: GIỐNG NHAU 3 lượt, cùng vai, cùng nội dung** (chỉ khác 2 ký tự: harness giữ `[FOLLOWUPS]…` ở cuối text canned, app đã lược; `compactHistory` lược cho model).

| Trường | Web (A) | Android (B) khi lỗi |
|---|---|---|
| `x-tappy-surface` | web | android |
| auth | Bearer (Pro) | không (guest) + `x-tappy-age-declared: 18plus` |
| **`userLocation`** | **10.7769, 106.7009, address "Quận 1, TP.HCM"** | **37.4220, −122.0840, address ""** — Mountain View, California = GPS mặc định emulator |
| system prompt | 12 706 ký tự / 114 dòng | 11 325 / 94 |
| chỉ có ở A | khối MEMORY 1 201 ký tự (Pro user có lịch sử: "KHONG BAO GIO hoi lai…", "Gan day da hoi ve…"), khối THONG TIN NGUOI DUNG (tên, nhóm tuổi), nhãn địa chỉ "Quận 1, TP.HCM" | — |
| chỉ có ở B | — | dòng toạ độ lat=37.42200, lng=−122.08400 |
| tools, systemShared (sha), turnIntent (`refinement`), forcedTool (null), v1/consultative chars | = | = |

**Kết luận A.1:** (1) **Toàn bộ lượt Android của job trước chạy với GPS California** — `adb emu geo fix` không có tác dụng trên image này; đã đổi sang `cmd location providers set-test-provider-location` (mock op cho uid shell) và xác minh `fused 10.7769,106.7009` trước mỗi lượt. Với "an gi ngon gio" + budget VND + toạ độ California, model hỏi nơi/món thay vì search. (2) Sau lần hỏi đầu, hai lần hỏi tiếp **bắt chước đúng format** của lượt canned clarify và của chính nó trong lịch sử (T12: "Để gợi ý đúng ý, mình cần biết: • Mấy người?"). (3) Khác biệt còn lại (memory block, nhãn địa chỉ) là khác client/tài khoản, không giải thích 4/5 vs 0/49. VERIFIED BY live (capture).

## 2. Nguyên nhân thật và fix (không đụng architecture lock, không đổi SDK — A.3)

| Commit | Cơ chế | Test |
|---|---|---|
| `fb74e9c` | **Few-shot imitation (A.2)** — `collapseClarifyTurns()` (actionability.ts): mọi canned clarify ĐÃ được trả lời bị bỏ khỏi lịch sử model, request + answer thành MỘT user message ("an gi ngon gio — dưới 100k/người"); áp cho mọi lượt sau, không chỉ lượt kế. UI transcript và memory extractor giữ thread thật. **Vị trí tách:** `route.ts` `modelMessages = compactHistory(collapseClarifyTurns(trimmedMessages)…)`; `trimmedMessages` thô vẫn đi vào extractor. Directive `afterClarify` đổi lời (không nói "câu hỏi của bạn"). Dry-run capture sau fix: model nhận `[{user: "an gi ngon gio — dưới 100k/người"}]`, không assistant turn. | `collapseClarify.test.ts` 7 (shape E2E, lượt sau, clarify chưa trả lời giữ nguyên, reply thường không gộp, parts-array không gộp, wiring) |
| `ad1f073` + `ede55d6` | **Câu hỏi chọn ở cuối reply (rule 4b)** — B3 kết "Bạn muốn massage body … hay foot massage?" ⇒ intent gate đọc câu rộng kế tiếp là *câu trả lời* (`clarification_response`) ⇒ bỏ qua clarify gate, không directive, model hỏi. `proseShape` rule 4b: sau pick, câu cuối hỏi người dùng CHỌN/nêu ("… hay …?", "muốn … gì/nào/thêm/khác?", "Bạn chọn cái nào…?") bị bỏ, kể cả có emoji sau dấu hỏi; lời mời ("Bạn muốn đặt bàn trước không?") giữ. Gate 40 hôm nay: fired 3 lần. | `proseShape.test.ts` +2 (+fixture cap cập nhật) |
| `8b0dc46` | **Câu rộng KHÁC domain giữa session (B4/B9, 2/2)** — need profile chỉ nhận task-switch khi có danh từ địa điểm; "cuoi tuan di choi dau" sau food giữ domain food, budget/GPS của thread làm gate thấy "actionable" ⇒ không canned clarify, không directive ⇒ model hỏi. `turnStartsNewConsultation()` so domain của lượt đứng một mình với domain thread; khác ⇒ intent gate `new_consultation`, clarify gate chấm lượt đơn (`scope:'turn'`), frame chỉ đọc lượt đó. Không bao giờ bắn trên chip trả lời / refinement / follow-up / cùng domain. | `ownDomainSwitch.test.ts` 6 |

Kèm: capture env-gated (`17ad235`), A.4 (`5ee5998`). Suite `src/lib/ai` + `api/chat` 3 852 pass; `tsc` sạch. VERIFIED BY unit + live (§4).

## 3. A.4 — Card #1 = pick của model hoặc là LỖI (commit `5ee5998`)

- `picked` trên wire chỉ chứa venue model NÊU (prose order). Fill theo engine-order chỉ bổ sung card 2–3 ở client, không bao giờ được trình bày như pick.
- Reply có bold venue mà KHÔNG khớp row nào ⇒ `console.error tappyai_cards_error pick_unmatched` (headers + rows) + payload `pickUnmatched: true`; web render như tập không xếp hạng (không "#1", không lead) + `data-pick-unmatched`. Chỉ khi có rows (không bắn trên lượt không tool — sửa `ad1f073`). Android bỏ qua key (ignoreUnknownKeys) — follow-up. VERIFIED BY unit (cardsPickedByProse +2, PlaceDecision +1) + live (gate: `pick_unmatched:false` mọi lượt có card; B5 `picked:1`).

**Kiểm kê fallback im lặng còn lại trên đường render:**

| Chỗ | Có thể đổi thứ tự / thay thế lựa chọn của model? | Trạng thái |
|---|---|---|
| Fill 3 card khi model nêu <3 (web `placesRenderOrder`, Android `renderOrder`) | Card #2/#3 lấy engine order; badge "#2/#3" không phân biệt "được nêu" vs "fill" | Thiết kế; không đụng #1 |
| `ranked` flag / "🔥 Phổ biến" / "#1" | gắn vào card ở vị trí 0 bất kể vì sao nó ở đó | web: tắt khi `pickUnmatched`; Android chưa |
| **`recommended` + "Vì sao: rated · reviews"** (`derivePick` của ENGINE, `fromToolResult.ts:261`) | **Có** — lý do/badge gắn vào entity engine chọn, không phải model; nếu khác pick của model, "Vì sao" xuất hiện trên card không phải #1 (B5/B6/T13 trùng nên không thấy) | **Chưa sửa — báo cáo**; đề xuất: chỉ gắn reasons vào `picked[0]` |
| Eligibility / slot admission (domain boundary) | Có thể LOẠI row model đã chọn (ví dụ "quận"→"quán" đã sửa) ⇒ pick biến mất khỏi card | Nay ⇒ `pick_unmatched` nếu không còn gì khớp; nếu còn alternative thì pick mất im lặng ⚠️ |
| `recommendationsGroundedInProse` (marker TAPPY_PLACES cũ, flag) | Chỉ giữ chỗ prose nêu, thứ tự theo prose | Nhất quán với model |
| `shortlistShopping` (card shopping) | Cắt về decision set; card shopping riêng, `recommended` theo engine | Như trên (shopping) |
| Filter chips / `withResolvedPhotos` | Lọc tập con / thay ảnh, không đổi thứ tự | — |

## 4. B — Android re-test (APK `43d37d2` không đổi; backend :3101 @ `5ee5998` → `ade55d6`/`ede55d6` → `8b0dc46`; GPS Quận 1 xác minh mỗi lượt; guest 18+)

| # | Lượt | Search? | toolCalls | Card #1 | Hỏi lại? | Ghi chú |
|---|---|---|---|---|---|---|
| B1 | "an gi ngon gio" → canned → chip "dưới 100k/người" | ✓ | 1 | Béo Ơi Quán (= pick, 0.9 km, `centeredOnUser:true`) | không | prose "100-200k/người vừa vặn ngân sách" với budget <100k ⚠️ (P2, §8) |
| B2 | "di choi dau toi nay" → canned → chip "200–500k/người" | ✓ | 1 | Timezone Vincom (pick; `picked:3`) | không | |
| B3 | "spa nao thu gian" (actionable, không clarify) | ✓ | 1 | Hyan Spa (pick) | không | reply kết bằng "…hay foot massage?" ⇒ sửa 4b |
| B4 | "cuoi tuan lam gi" (cùng session B3) | ✗ | 0 | — | **hỏi** (menu + "bạn muốn ăn gì?") | intent đọc là trả lời câu hỏi B3 ⇒ sửa 4b + `8b0dc46` |
| B5 | "khach san da nang co view bien, sang chut" (switch spa→hotel) | ✓ | 1 | Meliá Vinpearl (pick, `picked:1`) | không | frame `[view,upscale]`, không carry spa ✓ (b250124 giữ); kết "Bạn chọn cái nào hợp hơn? 🏨" ⇒ sửa `ede55d6` |
| B6 | "resort phu quoc sang chut cho 2 nguoi" (upscale) | ✓ | 1 | Ocean Bay (pick) | không | hedge còn "view" carry từ B5 (cùng domain hotel, đổi thành phố ≠ switch) ⚠️; "Gia tham khảo" typo model |
| B7 | "goi y them" | **search lại** | 1 | Thiên Thanh (pick mới) | không | gap `b40dc8a` — §6 |
| B8 | chat mới: "toi nay an gi" → canned → chip "dưới 100k/người" | ✓ | 1 | Quán Bụi Central (pick) | không | "100–600k/người nằm trong tầm" ⚠️ (P2) |
| B9 | "cuoi tuan di choi dau" (cùng session B8) | ✗ | 0 | — | **hỏi** ("Bạn thích chơi gì?") | ⇒ sửa `8b0dc46` |
| B10a | chat mới: "toi nay an gi" → chip | ✓ | 1 | Nhà Hàng Ngon (pick, 0.1 km) | không | |
| B10b/c | "cuoi tuan di choi dau" (cùng session) → **canned clarify `scope:'turn'` $0** → chip "dưới 200k/người" | ✓ | 1 | Karaoke MEI (pick, 0.7 km) | không | **B4/B9 đã sửa, verified live** |

Sau 3 fix: 0 lượt hỏi lại; mọi chu trình clarify→answer search (B1, B2, B8, B10a, B10c = 5/5). Crash: 0. Ảnh card #1: có ở mọi lượt có card.

## 5. A.5 — 11 câu thiếu distance vì không centred on GPS (report only)

Đếm lại trên `finalGate` (+4 rerun/mem): không phải 11 mà **10 có rows & không có `distance_km`**: **7 shopping** (không có khái niệm khoảng cách) + **3 place/destination: P1 "Spa … ở Đà Nẵng", T1 "Đi Đà Nẵng…", T6 "Hội An…" — cả 3 đều NÊU điểm đến** ⇒ centre theo destination là đúng. **Nhóm "không nêu vùng mà vẫn không dùng GPS" = 0** (các rerun/mem: chỉ T1 lặp, có vùng). ⇒ kết quả không sai, chỉ thiếu hiển thị khoảng cách (đề xuất "cách trung tâm <dest>" ở báo cáo trước).

## 6. A.6 — "gợi ý thêm" search lại + hotel enrich 8 để hiện 3 (report only; VERIFIED BY sink `costseg`)

- Hotel turn: Serper `maps 2 + search 1 + images 8 = 15 credit` ($0.015) + 2 LLM call (~$0.02–0.04). Food turn từ /maps có thumbnail ⇒ `images 0` (4–7 credit). Nguyên nhân 8 ảnh: `selectPlacesNeedingEnrichment` **cố ý** bổ sung chỗ không được nêu tới `PHOTO_ENRICHMENT_LIMIT` (8) để card không trống; row hotel Serper không có thumbnail ⇒ 8 image call. **Lãng phí: 5 credit ($0.005) + 1–3 s wall/lượt hotel.** Fix ≈ nửa ngày: giới hạn `rest` theo `CARDS_SHOWN` (3) khi client render card; 5 card sau fold không ảnh cho tới khi mở (hoặc lazy ở lượt sau).
- "gợi ý thêm": lặp lại toàn bộ lượt tool: **15 credit + 2 LLM call ≈ $0.03–0.05/lượt** (B7, turn 6 job trước) trong khi rows đã có ở lượt trước. Fix: evidence store cho place rows theo turn (như `decision_evidence` của shopping, ADR-024) + canned "chỗ khác" từ rows đã lưu; ≈ 1–2 ngày.

## 7. C — Gate 40 trên `8b0dc46` (flags ON, memory sạch, cold; `runs-owner3/preGate*`)

**Raw 37/40** (✅+⚠️). Theo vertical: Food 8/8 · Shopping 6/8 · Travel 7/8 · Spa 8/8 · Entertainment 8/8.

| ❌ | Lỗi | Rerun 1 | Rerun 2 | Kết luận |
|---|---|---|---|---|
| S4 "Robot hút bụi cho nhà có chó, 5-7 triệu" | hỏi "Ưu tiên chính?" không search (`toolCalls 0`) | ✅ pick Ecovacs T5 Max | ⚠️ pick Roborock Q7 TF 2.5tr ("rất hợp ngân sách" 5–7tr ⇒ sai) + hỏi | biến thiên 1/3 |
| S7 "Máy lọc không khí phòng ngủ 20m2" | "mình gợi ý:" rồi TRỐNG — không pick | ✗ (giống) | ✗ (giống) | **deterministic 3/3** — xem dưới |
| T2 "khach san da nang gan bien duoi 1tr/dem" | mở bằng câu hỏi "Bạn sẽ ở bao nhiêu đêm?", liệt kê 3, không pick | ⚠️ pick M Hotel dòng đầu, kết bằng hỏi | ✅ pick M Hotel | biến thiên 1/3 |

**S7 — không phải regression của commit nào (không có commit để revert):** rows Serper cho query này là tiêu đề chung ("Máy lọc không khí", "Máy lọc không khí phòng ngủ"), model viết danh sách với spec/giá ⇒ guard (spec/giá/attribution) cắt các dòng sản phẩm; ở **finalGate (38/40) cùng hiện tượng** — danh sách cũng bị cắt sạch, chỉ sống sót câu "Mình nghiêng về **Daikin**…" nên được chấm pass. Hôm nay 3/3 model không viết câu pick riêng ⇒ ❌. Probe offline (0 lượt) chạy cùng prose qua filter ở `43d37d2` và `8b0dc46` cho cùng kết quả cắt. Lỗ hổng cũ: shopping không có backstop pick khi body còn chữ (`consultative_v1_pick_backstop kind:shopping` chỉ bắn khi body ngắn — S4 rerun2 có). Fix đề xuất (không làm): backstop shopping khi không còn câu pick sau guard, lấy entity `recommended`/đầu tiên của card.

Khác: zero tên quán bịa trong prose cuối (gate cắt "Ecovacs T5 Max" ở S4-rerun2 khi rows chỉ có 1 — đúng; "**Mình chọn MẸT Hội An**" T6 bị cắt dù là row thật vì bold gồm cả "Mình chọn" ⇒ false positive 1 câu, fragment "Sau đó ghé…" ⚠️). `late_open` P8 ✓ (Sả Spa mở đến 23:30, row-backed). `upscale` T8 ✓ (Ocean Bay, không guest house). ⚠️ đáng chú ý: F7b/E6 "band 100–200k/100–500k vừa ngân sách <100k/100k" (P2 budget-band overclaim, §8); S5b/S6b/S8 fragment sau guard (dòng bắt đầu bằng khoảng trắng, thiếu tên); S6b 3 alternative; T4 "gia đình đi đâu" chọn nhà hàng.

**Memory lớn (seedmem, 6):** F7 ✓ (memory unblock → search), F8 ⚠️ (pick Izakaya Unatoto dạng list), S2 ⚠️ (pick "Laptop HP" chung chung, nói rõ thiếu cấu hình), T4 ✓ (kết bằng tự hỏi thời tiết ⚠️), P5 ✓, E5 canned ✓ ⇒ 6/6 raw.

**Differentiation metric** (`diffmetric` preGate vs finalGate): ADVISES/PICKS/LISTS = **23/6/6** (trước 18/11/6; advise+pick 29 = 29), factsAvg **3.9** (trước 3.98); fact share price 0.42 · distance 0.53 · hours 0.57 · link 0.88 · reviews 0.80 · photo 0.70. **Cost cold:** $1.2037 / 48 turn = $0.0251/turn; /34 conversation = **$0.0354** (trước $0.0353); hit-rate 71 %.

## 8. Ghi nhận mới (không chặn, chưa sửa)

- **P2 budget-band overclaim** (B1, B8, F7b, E6, S4-rerun2): model nói band giá "vừa ngân sách" khi band vượt (100–200k với <100k) hoặc thấp hơn hẳn; `budget_gap/contrary` không kiểm quan hệ band ↔ budget. Đề xuất: guard so `price_range_text` với `need.budget` ⇒ sửa câu hoặc hedge.
- Đổi thành phố cùng domain (Đà Nẵng → Phú Quốc) không phải task switch ⇒ hard `view` carry (B6).
- Lời mời cuối ("Bạn muốn đặt bàn trước không?") vẫn làm intent gate đọc lượt kế là clarification_response — 4b cố ý không cắt; theo dõi.
- `tappyai_cards_error` không bắn trên lượt không tool (đã sửa) — Android chưa render `pickUnmatched`.

## 9. F — Credential (F.1 tuân thủ: không in giá trị nào)

- **F.2 Vercel:** `vercel whoami` **bị policy của session từ chối chạy** (2 lần) ⇒ không xác định được CLI có cài/đăng nhập không; **dừng, không đăng nhập, không mở browser.** Key prod: variable `GOOGLE_PLACES_API_KEY` (đọc ở `food.ts:704`, `common.ts:85`); giá trị prod **không đọc được**. Hai env local (audit `.env.local`, `v3-phase4-design/.env.local`): cùng một key, last-4 `LKXQ`, sha256[:8] `32640e98`. Ghi nhớ: Vercel `env pull` trả RỖNG cho biến Sensitive (memory) ⇒ ngay cả CLI cũng có thể không cho fingerprint.
- **F.3 gcloud:** `gcloud auth list` **bị từ chối chạy** ⇒ dừng, không auth.
- **F.4 Prod có Google Places sống không?** Không đo trực tiếp được (prod `/api/chat` yêu cầu đăng nhập: 401 `auth_required` cho anonymous — 1 request thử, 0 model call; không đăng nhập). **Điều chắc chắn (VERIFIED BY reasoning trên `origin/main` = `842379b`, đúng bản `/api/version` đang chạy):** prod HÔM NAY chạy `main`, pipeline place = **Google → OSM, KHÔNG có Serper `/maps`**. Vậy dù key prod sống hay chết, **mọi con số của các job này (Serper-first trên V3) đến từ pipeline KHÁC pipeline người dùng thật đang gặp** — kết luận suy yếu: giá/khoảng cách/giờ (fact share), guard field Serper, cost/credit, differentiation metric đều là của bản V3 chưa deploy, không mô tả prod hiện tại. Sau khi deploy V3, prod = Google (nếu key sống) → Serper → OSM: **nếu key prod sống, prod lật sang Google-first CHƯA ĐO** (row field khác, $32/1000 vs $3/1000). **Xác nhận khuyến nghị flag-off Google cho release:** hiện **CHƯA có flag** — call chạy hễ `GOOGLE_PLACES_API_KEY` tồn tại; cách tắt = bỏ biến khỏi env production (Owner, Vercel) hoặc thêm kill-switch (không tự làm). Khi tắt: bỏ 1 call 403 (~100–400 ms) mỗi 10 phút/instance (breaker), 0 credit tiết kiệm nếu key đang chết, tiết kiệm $29/1000 nếu key sống; mất: field Google (photo_names, place_types) mà mọi guard/eval hiện không dựa vào; pipeline prod = pipeline đã đo.
- **F.5 Ảnh card: MỞ.** Node 80/80, Playwright headless 180/180, Android OK — lỗi Owner thấy không tái hiện; giữ retry `=w400-h300`; **cần Owner mở Network tab trên chính trình duyệt của mình**. Không làm thêm.

## 10. A.7 — Map footer (report only; quyết định sản phẩm của Owner)

Hôm nay: `https://maps.google.com/maps?q=<query> <location>` = Google Maps TÌM query, tập kết quả khác 8 row người dùng vừa đọc ("quận 1" lặp 2 lần trong q). Để mở đúng tập của mình: (a) **Google Maps không có URL cho danh sách địa điểm tuỳ ý**; gần nhất là directions với ≤10 waypoint (vẽ tuyến, không phải pin) — không phù hợp; (b) **màn hình bản đồ trong app**: web Leaflet + OSM tile (miễn phí) ≈ 1–2 ngày, Android osmdroid (miễn phí) hoặc Maps SDK (cần key/billing) ≈ 2–3 ngày; payload đã có toạ độ row; (c) ảnh Static Maps 8 marker ($2/1000, cần key) — chỉ là ảnh; (d) 0 chi phí: đổi nhãn CTA thành "Tìm trên Google Maps" cho trung thực.

## 11. D — Đề xuất bộ MULTI-TURN (sau release, chưa xây)

6 kịch bản × 2–4 lượt, chạy qua harness (không cần emulator), chấm như gate: (1) rộng → canned clarify → chip → phải search, card #1 = pick (3 lượt, 1 model run); (2) task switch có hard (food có `parking` → hotel `view`): frame không carry (2 run); (3) follow-up fact "quán này mở mấy giờ / giữ xe không" (canned hoặc re-search theo tên, không search rộng) (2 run); (4) "gợi ý thêm" (đếm toolCalls, cùng bộ rows) (2 run); (5) câu rộng khác domain giữa session → canned `scope:'turn'` → chip → search (3 lượt, 2 run); (6) session dài 8 lượt trộn 3 domain (frame/window, cache hit, không hỏi lại) (8 run). **≈ 17 model run ≈ $0.45/lần chạy**, ~8 phút; thêm 5 câu vào `eval40.mjs` dạng thread (đã có cơ chế `parent`).

## 12. E — Release readiness

- **NO-GO theo tiêu chí đã đặt** (raw 37 < 38; S7 deterministic dù là lỗi cũ). **Nếu Owner chấp nhận S7 là lỗ hổng shopping cũ (không phải regression) thì phần còn lại đạt:** zero deterministic regression, zero tên bịa, late_open/upscale pass, Android 11/11 không hỏi lại, memory 6/6, cost không đổi.
- **Ship UNVERIFIED:** prod Google key (fingerprint không đọc được) và pipeline prod sau deploy (Google-first nếu key sống); ảnh card trên trình duyệt Owner; TikTok tap trên Android; Android `pickUnmatched` không render; iOS.
- **Owner tự làm:** Vercel env prod (fingerprint + quyết định bỏ `GOOGLE_PLACES_API_KEY` hoặc yêu cầu kill-switch), GCP console (key …LKXQ restriction), quyết S7 (backstop shopping) và P2 budget-band, A.7.

## 13. Lượt: A 0 · B 11 · C 51 · **tổng 62/79, còn 17**. Sink `docs/audit/eval/cost/usage-owner3.jsonl` (segment `android-retest @5ee5998`, `preGate @8b0dc46`, `preGate-rerun1/2`, `preGate-mem`).
