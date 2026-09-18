# Layout follow-up — guest on web, real local backend (2026-09-17)

Question: "Tìm quán ăn tối ngon gần Quận 1 cho 2 người". Guest (18+ declared through
`POST /api/age-declaration`, DOB 1990-01-01), no GPS, `x-tappy-surface: web` only (what the web
client sends). Server: audit worktree on :3101 against the non-prod Supabase project. Captures are
full-page headless Chrome (1280×2600) with every `<img>` verified `complete && naturalWidth > 0`.

| Build | Flags | File | Photos |
|---|---|---|---|
| tag `layout-approved-2026-09-17` (`f6712b8`) | OFF | `premerge-web-guest-chat-reply.png` / `.txt` | 4/4 |
| merged `968472e` | OFF | `merged-web-guest-chat-reply.png` / `.txt` / `.stream.txt` | 4/4 |
| merged `968472e` | all three ON | `merged-web-guest-chat-reply-flags-on.png` / `.txt` / `.stream.txt` | 4/4 |

## 1. Field-by-field card comparison (pre-merge vs merged, flags OFF)

| Field | Pre-merge | Merged | Verdict |
|---|---|---|---|
| Photo | rendered ×3 | rendered ×3 | same |
| Name | ✓ | ✓ | same |
| Rating (star + value) | ✓ | ✓ | same |
| Review count "(N đánh giá)" | ✓ | ✓ | same |
| Address, phone | ✓ | ✓ | same |
| Distance | absent | absent | same — guest sends no `userLocation`; `distance_km` exists only when the search is centred on the user (BUG-011 D2). Not a regression |
| Price level line ("100-200 N ₫") | shown on 3/3 | absent on 3/3 | **provider data, not a merge regression — see §2** |
| Open status ("đang mở/đang đóng" + hours) | ✓ | ✓ | same |
| Category tags | ✓ | ✓ | same |
| "Vì sao: rated · reviews" (pick) | ✓ | ✓ | same |
| Review link (TikTok / YouTube CTA) | ✓ | ✓ | same (TikTok present only when the enrichment finds one — varies per venue) |
| CTAs (Xem bản đồ, ShopeeFood, GrabFood, Website, Gọi, Đặt món) | ✓ | ✓ | same |
| "Xem tất cả trên bản đồ", filters, follow-up chips | ✓ | ✓ | same |

## 2. Why the price line differs — provider, not code

- The card's price text is `priceRangeText`, which comes ONLY from Serper `/maps` `priceLevel`
  (`serperPlaces.ts:309 put('price_range_text', rec.priceLevel)`); Google Places never sets it.
- Files on that path are untouched by the merge: `serperPlaces.ts`, `common.ts` (cache),
  `buildEntity.ts`, `liveView.ts`, `marker.ts`, `PlaceDecision.tsx`. `food.ts` changed one field
  (`count: inScope.length`, main #248). `git diff f6712b8 968472e --name-only` confirms.
- Merged code carries the field when the provider supplies it: an API replay on a fresh merged
  server returned tool rows **10/10 with `price_range_text`** and the `8:` frame **8/8 with
  `priceRangeText`** (`merged-rows-fresh.json`).
- The provider is the variable. Two direct Serper `/maps` probes minutes apart, same `ll`
  (`@10.7769,106.7009,14z`, HCMC), same venues:
  - `q = "quán ăn ngon Quận 1 Ho Chi Minh"` → **18/20** rows with `priceLevel` (`serper-probe-now.txt`)
  - `q = "quán ăn ngon Quận 1, TP HCM"` → **0/20** (`serper-probe-now-2.txt`)
  The model chooses the `location` string per turn, so any build can land on either. The
  response is then held in the in-process 30-min cache, which is why consecutive runs on one
  server agree with each other.
- Same pattern in the earlier V3 capture `capture-v3/run2.json` (pre-merge code): Hải Sản Hoàng
  Gia had no `price_range_text` there while 54 other rows did.

## 3. Merged build with all three flags ON

`PLACE_GUARD_ATTRIBUTION_V2=1 SNIPPET_PRICE_GUARD_V2=1 MEDIA_PLACEMENT_V2=1` (added to the audit
`.env.local` for the run, removed afterwards).

- Pick sentence present: "Mình chọn **Vua Chả Cá** cho bạn 👍 …" — yes.
- Leading-space fragment: none (v1 OFF runs on the merged build produced " Chuyên hải sản…" /
  " Hoặc nếu muốn…" in 3 of 5 runs; pre-merge tag produced "Hai lựa chọn khác…:" followed by nothing).
- Guard telemetry: `place_claim v2 sentences_removed 0 / 18, attribution L1:2 L2:4,
  pick_attributable:true`; `snippet_price v2 claims 0`.
- Layout unchanged vs flags OFF: same carousel, same fields, same CTAs, filters and chips;
  photos 4/4. Price line absent for the same provider reason (that run's rows had none —
  `8: items 8 priceRangeText: -` in the captured stream).

## 4. Notes

- `lh3.googleusercontent.com` intermittently answered the headless browser with `429` (HTML) →
  `ERR_BLOCKED_BY_ORB` → the card's `onError` hides the `<img>`. Two early merged captures had
  photos hidden for that reason; the kept captures all loaded 4/4 (no retry was needed on the
  final runs). Not a code difference.
- Google Places (new API) returns `403 The caller does not have permission` on the audit key;
  Serper Maps is the provider on both builds (`tappyai_places_debug provider: serper_maps`).
