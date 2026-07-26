# Android Deals — Parity Implementation Spec

**Status:** DRAFT — read-only research, no code changed.
**Source of truth:** Web PRODUCTION worktree `.claude/worktrees/cool-vaughan-b3c7ff/` (branch `main`).
**Android baseline:** primary working tree `android/`.
**Blocker check:** NONE. The `/api/deals/[id]/click` route, the `increment_deal_click` RPC, and the `partner_deals` table already exist and are deployed on prod. No backend work required.

---

## 0. TL;DR of the gap

The Web deals model was completely rewritten (Bug #14 V1) from a hardcoded "shopee-deals" pool into admin-managed `partner_deals` rows. **The Android app still mirrors the OLD, now-nonexistent model.** Every Android field (`discount`, `emoji`, `source`, `badge` = "HOT"/"MỚI") is stale; the prod API no longer returns any of them. Android is currently deserializing a payload whose fields (`title`, `category`, `url`) partially overlap by luck, while `discount`/`emoji`/`source`/`badge` silently default to empty and the card renders wrong.

Additionally Android is missing three promo affordances the Web card has: **discount badge**, **endAt countdown**, **copyable voucher chip**, and the **click-counter POST** fired on card open.

---

## 1. Web data contract (PROD)

### 1.1 GET `/api/deals`
Evidence: `src/app/api/deals/route.ts:11-15`, `src/lib/deals/partnerDeals.ts:93-106`.

- Method/path: `GET /api/deals?country=VN` (query `country`, uppercased, default `VN`). No auth (public).
- `force-dynamic`, never cached.
- Response body: `{ "success": true, "deals": PartnerDeal[] }`.
- Ordering: server sorts by `display_order` asc; RLS filters to active + in-date-window rows only.
- Degrades to `deals: []` on any server error.

### 1.2 `PartnerDeal` public shape (the ONLY fields exposed)
Evidence: `src/lib/deals/partnerDeals.ts:10-27`, mapper `toPublic()` lines 57-75. Internal fields (`is_active`, timestamps, `affiliate_code`, `click_count`, raw `metadata`) are NEVER returned.

| JSON field (camelCase) | Type | Notes |
|---|---|---|
| `id` | string | deal id — used in the click POST path |
| `partnerSlug` | string | |
| `partnerName` | string | display source name ("via {partnerName}") + logo fallback initial |
| `partnerType` | string | |
| `category` | string | VN category label, e.g. "Điện tử", "Mua sắm" (drives the pill color) |
| `title` | string | |
| `description` | string \| null | short line, may be null |
| `officialUrl` | string | external link target (opened in new tab) |
| `bannerImage` | string \| null | not rendered by current Web card, but part of the contract |
| `logoImage` | string \| null | rendered as the 48px logo; falls back to `partnerName[0]` initial |
| `isFeatured` | boolean | not currently rendered on the Web card |
| `discountLabel` | string \| null | red badge text (e.g. "-50%"); badge shown ONLY when non-null |
| `voucherCode` | string \| null | copyable voucher chip; shown ONLY when non-null |
| `endAt` | string \| null | ISO-8601 timestamp; drives the countdown |

`discountLabel`/`voucherCode` are whitelisted out of `metadata.promotion` server-side (`readPromotion()` lines 49-55); clients never see raw metadata.

### 1.3 POST `/api/deals/[id]/click`
Evidence: `src/app/api/deals/[id]/click/route.ts:11-19`.

- Method/path: `POST /api/deals/{id}/click`.
- Body: none. Response: `{ "success": true }` (always 200, even on failure — best-effort).
- Calls SECURITY DEFINER RPC `increment_deal_click(p_deal_id)` (+1 popularity counter, no analytics/cookies/user data).
- **When fired:** on card click/open, alongside opening the link. Web fires it in the `<a onClick>` with `fetch(..., { method: 'POST', keepalive: true }).catch(()=>{})` — fire-and-forget, must NEVER block or gate the link opening. Evidence: `DealsView.tsx:151`.

---

## 2. Web UI affordances (PROD)
Evidence: `src/app/deals/DealsView.tsx`, `src/lib/deals/countdown.ts`.

Card = one big external link (`<a target="_blank" rel="noopener noreferrer">`). Elements:
1. **Logo** 48px rounded; if `logoImage` null → orange box with `partnerName[0]` uppercase initial. (lines 154-159)
2. **Title** (1 line, ellipsized) + **discount badge**: red pill `bg-red-500 text-white`, rendered only when `discountLabel != null`, text = `discountLabel`. (lines 162-173)
3. **Category pill** colored per `CATEGORY_COLORS` map (11 VN categories; fallback gray). (lines 174-177)
4. **Countdown** from `promoCountdown(endAt, now)` (`countdown.ts:12-20`):
   - `hoursLeft <= 0` or no/invalid endAt → `none` (render nothing).
   - `hoursLeft <= 24` → `soon` → "🔥 Ending Soon" / "🔥 Sắp hết hạn" (`deals.endingSoon`).
   - `> 24h` → `days` with `days = max(1, round(hoursLeft/24))` → `deals.dayLeft` (1) or `deals.daysLeft {count}` with a clock icon. (lines 178-186)
5. **Description** (optional, 1 line). (lines 187-189)
6. **Voucher chip** (only when `voucherCode != null`): dashed orange chip `Mã: <CODE>` + copy icon. Tapping it **copies to clipboard** and shows a check for 1.5s; it calls `preventDefault()` + `stopPropagation()` so it never opens the link or fires the click POST. (lines 191-204, `copyVoucher` 136-144)
7. **"via {partnerName}"** subline (`deals.viaSource`). (line 205)
8. **External-link chevron** icon. (lines 208-211)
9. **Click POST** fired in the card's `onClick` (see 1.3).

Page chrome: title + Tappy mascot + today's date; a subtitle count line (`deals.subtitle {count}`); loading spinner; empty state (`deals.empty`); footer hint + MFS-3.10 commercial-disclosure block. A `DealNotifyButton` (web push opt-in via `usePushNotifications`) sits in the header — **web-push only; out of scope for this Android parity gap** (Android push is tracked separately).

### 2.1 Web i18n keys (source strings)
Evidence: `src/lib/i18n/w3/deals.ts`.

| key | en | vi |
|---|---|---|
| `deals.title` | Today's deals | Deal hôm nay |
| `deals.empty` | No deals yet. Check back soon! | Chưa có ưu đãi nào. Quay lại sau nhé! |
| `deals.subtitle` | Tappy hand-picks the {count} best deals — refreshed every day at 7:30 AM | Tappy chọn lọc {count} ưu đãi tốt nhất — cập nhật mỗi ngày lúc 7:30 sáng |
| `deals.viaSource` | via {source} | via {source} |
| `deals.dayLeft` | 1 day left | Còn 1 ngày |
| `deals.daysLeft` | {count} days left | Còn {count} ngày |
| `deals.endingSoon` | 🔥 Ending Soon | 🔥 Sắp hết hạn |
| `deals.voucherLabel` | Code | Mã |
| `deals.copyCode` | Copy code | Sao chép mã |
| `deals.codeCopied` | Copied! | Đã sao chép! |
| `deals.footerHint` | Deals change daily • Turn on notifications to get them at 7:30 AM | Deals thay đổi mỗi ngày • Bật thông báo để nhận lúc 7:30 sáng |
| `deals.disclosure*` | (3-part commercial disclosure) | (already present on Android as single `deals_disclosure`) |

---

## 3. Current Android implementation (BASELINE — stale)
Files under `android/app/src/main/java/com/tappyai/app/deals/`.

- **`Deal.kt`** (domain): fields `title, category, discount, url, source, emoji, badge` — comment explicitly says "mirrors `src/lib/shopee-deals.ts`" (dead file on prod). ALL of `discount/source/emoji/badge` are stale; no `id`, `partnerName`, `logoImage`, `discountLabel`, `voucherCode`, `endAt`.
- **`data/DealsNetworkDtos.kt`**: `DealDto(title, category, discount, url, source, emoji, badge)` — deserializes the OLD shape; new fields silently absent.
- **`data/DealsApi.kt`**: `@GET("api/deals") suspend fun getDeals(): DealsResponseDto`. Correct endpoint; wrong DTO.
- **`data/RealDealsRepository.kt`**: `safeApiCall { api.getDeals().deals.map { it.toDomain() } }`.
- **`data/DealsRepository.kt`** / **`DealsModule.kt`**: clean interface + Hilt binding; no changes needed structurally.
- **`DealsViewModel.kt`**: loads once into `UiState<List<Deal>>` (Loading/Empty/Success/Error) + `retry()`. No click firing.
- **`DealsScreen.kt`**: `DealCard` renders `emoji` (headline), title + `badge` pill (HOT=red/MỚI=blue, comment refs dead `DealsView.tsx:24-27`), `discount` (green text), `category · via source`, external-open icon. Tap opens `deal.url` via `LocalUriHandler`. **No** discount badge from `discountLabel`, **no** countdown, **no** voucher chip, **no** logo image, **no** click POST.
- **`DealsRoute.kt`**: nested-NavHost route `Main`; no change needed.
- **Strings**: `res/values/strings_deals.xml` + `res/values-vi/strings_deals.xml` already have `deals_title`, `deals_subtitle` (with `%1$d`), `deals_disclosure`, error/empty, `deals_category_source_format` (`%1$s · via %2$s`), `deals_opens_externally_description`. Missing all promo keys.
- **Image loading:** app already has Coil via `TappyImage` (`core/designsystem/.../TappyImage.kt:29`) — reuse it for the logo; the `:app` module or `:core:designsystem` dependency already transitively provides it (Deals screen already uses design-system components).

---

## 4. Implementation plan (concrete, reuse-first)

### 4.1 DTO — `data/DealsNetworkDtos.kt`
Replace `DealDto` fields to match the prod contract (all `@Serializable`, nullable-with-default for optionals):
```
@Serializable
data class DealDto(
    val id: String = "",
    val partnerSlug: String = "",
    val partnerName: String = "",
    val partnerType: String = "",
    val category: String = "",
    val title: String = "",
    val description: String? = null,
    val officialUrl: String = "",
    val bannerImage: String? = null,
    val logoImage: String? = null,
    val isFeatured: Boolean = false,
    val discountLabel: String? = null,
    val voucherCode: String? = null,
    val endAt: String? = null,
)
```
Keep `DealsResponseDto(val deals: List<DealDto> = emptyList())`. (The API also returns `success: Boolean`; ignore it — kotlinx ignores unknown keys if the Json is `ignoreUnknownKeys = true`, which the shared network module already sets; keep `success` unmapped.)

### 4.2 Domain — `Deal.kt`
```
data class Deal(
    val id: String,
    val partnerName: String,
    val category: String,
    val title: String,
    val description: String?,
    val officialUrl: String,
    val logoImage: String?,
    val discountLabel: String?,
    val voucherCode: String?,
    val endAt: String?,   // ISO-8601, or null
)
```
Drop `emoji`, `discount`, `source`, `badge`. Update `toDomain()` accordingly. (`partnerName` replaces `source`; `officialUrl` replaces `url`.) Optionally carry `bannerImage`/`partnerSlug`/`isFeatured` only if a future card variant needs them — not required for parity, recommend omitting to keep the domain lean.

### 4.3 Countdown — port `countdown.ts` to Kotlin (pure, reusable, testable)
New file `deals/PromoCountdown.kt` mirroring `src/lib/deals/countdown.ts` exactly:
```
sealed interface PromoCountdown {
    data object None : PromoCountdown
    data object Soon : PromoCountdown
    data class Days(val days: Int) : PromoCountdown
}
fun promoCountdown(endAtIso: String?, nowMs: Long): PromoCountdown {
    if (endAtIso.isNullOrBlank()) return None
    val endMs = runCatching { Instant.parse(endAtIso).toEpochMilli() }.getOrNull() ?: return None
    val hoursLeft = (endMs - nowMs) / 3_600_000.0
    if (hoursLeft <= 0) return None
    if (hoursLeft <= 24) return Soon
    return Days(max(1, Math.round(hoursLeft / 24.0).toInt()))
}
```
Add a JVM unit test mirroring the three branches (regression test — permanent per standing rule).

### 4.4 Click endpoint — API + repository
- `DealsApi.kt`: add
  ```
  @POST("api/deals/{id}/click")
  suspend fun postDealClick(@Path("id") id: String): retrofit2.Response<Unit>
  ```
- `DealsRepository.kt`: add `suspend fun recordClick(dealId: String)`.
- `RealDealsRepository.kt`: implement best-effort, swallow all errors (never surface to UI):
  ```
  override suspend fun recordClick(dealId: String) {
      runCatching { api.postDealClick(dealId) }
  }
  ```
  (No `safeApiCall` needed — result is intentionally ignored, matching Web's `.catch(()=>{})`.)

### 4.5 ViewModel — `DealsViewModel.kt`
Add `fun onDealOpen(deal: Deal)` that (a) launches `repository.recordClick(deal.id)` fire-and-forget on `viewModelScope`, then (b) the screen opens the URL. Order per Web: fire the POST, open the link regardless of the POST result. Do not block the open on the network call.

### 4.6 UI — `DealsScreen.kt` `DealCard`
Rework the card to match Web affordances:
- **Logo**: `TappyImage(url = deal.logoImage, ...)` in a 48dp rounded box; when null, orange box with `deal.partnerName.firstOrNull()?.uppercase()`.
- **Title row**: title (maxLines 1, ellipsize) + red badge pill showing `deal.discountLabel` ONLY when non-null (replace the dead HOT/MỚI badge logic).
- **Category pill**: keep the existing `tappyCategoryColors` mapping; map the VN category label to a color (reuse existing category-color helper if one exists, else a small when-map matching the Web `CATEGORY_COLORS` set: Điện tử→blue, Mua sắm→orange, Ăn uống→green, Du lịch→purple, Vận chuyển→sky, Tiết kiệm→yellow, Thời trang→pink, Làm đẹp→rose, Gia dụng→teal, Sách→indigo, Siêu thị→emerald, fallback gray).
- **Countdown**: from `promoCountdown(deal.endAt, System.currentTimeMillis())` → `Soon` shows `deals_ending_soon`; `Days(1)` shows `deals_day_left`; `Days(n)` shows `deals_days_left` with count + a clock icon; `None` renders nothing.
- **Description**: optional 1-line.
- **Voucher chip**: only when `deal.voucherCode != null`. Dashed orange chip `deals_voucher_label: <code>` + copy icon. On tap, copy to clipboard (`ClipboardManager` / `LocalClipboardManager.current.setText(AnnotatedString(code))`) and show a 1.5s "copied" check state. This tap must NOT open the deal or fire the click POST (own clickable, not the row's).
- **"via {partnerName}"** subline using `deals_via_source`.
- **Row tap** → `viewModel.onDealOpen(deal)` then `uriHandler.openUri(deal.officialUrl)`.
- `LazyColumn` key: change `key = { it.url }` → `key = { it.id }`.

### 4.7 String resources (add to BOTH `values/strings_deals.xml` and `values-vi/strings_deals.xml`)
Existing `deals_subtitle`, `deals_disclosure`, `deals_category_source_format` stay. Add:

| name | en | vi |
|---|---|---|
| `deals_ending_soon` | 🔥 Ending Soon | 🔥 Sắp hết hạn |
| `deals_day_left` | 1 day left | Còn 1 ngày |
| `deals_days_left` | %1$d days left | Còn %1$d ngày |
| `deals_voucher_label` | Code | Mã |
| `deals_copy_code` | Copy code | Sao chép mã |
| `deals_code_copied` | Copied! | Đã sao chép! |
| `deals_via_source` | via %1$s | qua %1$s |

Note: current Android reuses `deals_category_source_format` ("%1$s · via %2$s"). If the redesigned card splits category (pill) from source (subline) like Web, add `deals_via_source` and keep or retire the combined format. Keep `%1$d` in `deals_subtitle` (Android plural-agnostic, matches Web `{count}`).

### 4.8 No changes needed
`DealsRoute.kt`, `DealsModule.kt` (DI), `DealsRepository` binding, ViewModel state machine shell, error/empty states.

---

## 5. Verification checklist (for the implementer)
- Build `:app`.
- Unit test `promoCountdown` (none/soon/days boundaries: 0h, 24h, 25h, invalid, null) — permanent regression test.
- Manual/device: card renders logo (or initial fallback), discount badge only when present, countdown branch correct, voucher chip copies without opening link, row tap opens `officialUrl` AND fires `POST /api/deals/{id}/click` (verify counter increments or network log shows the POST).
- Product UAT: WAITING FOR PRODUCT OWNER.
