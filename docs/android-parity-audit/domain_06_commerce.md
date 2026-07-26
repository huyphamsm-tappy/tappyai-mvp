# Domain 06 — Commerce (Bookings, Service Detail, Price Tracking, Deals)

**Baseline:** current working tree, branch `feat/backoffice-phase0` (uncommitted included). Web = source of truth, read from actual `src/`, not freeze-doc classifications.

## Verdict
Android is **at parity** with *current* Web for all four commerce surfaces (bookings list + service-detail booking create, review-from-booking, price-watch list/cancel, deals read). **No P0/P1 Android defects.** The only real gap is a Web-backend one (`inferFromBooking()` no-ops for Bearer callers → Android bookings never feed personalization, P2). **Major doc divergence:** the freeze package describes a DB-backed Deals rearchitecture (`partner_deals`, click counter, promo UI) that is **NOT in this tree** — current Web still ships the hardcoded `shopee-deals.ts`, so Android correctly mirrors it.

---

## IMPLEMENTED

- `[P2]` **Bookings list** — GET `/api/bookings`, DTO maps snake_case row → domain, status enum, VN-time review gate.
  EVIDENCE: Android `bookings/data/BookingsApi.kt:15`, `BookingDtos.kt:21-92`, `Booking.kt:58-67` ↔ Web `src/app/api/bookings/route.ts` GET (`select('*') … .limit(20)`).
- `[P2]` **Service-detail booking create** — POST `/api/bookings` body field-for-field identical; same required-field gate (date/name/phone).
  EVIDENCE: Android `servicedetail/data/ServiceDetailDtos.kt:32-51`, `ServiceDetailViewModel.kt:133-135` ("date/name/phone") ↔ Web `route.ts` POST (`if (!date || !name || !phone) → 400`).
- `[P2]` **Review-from-booking eligibility** — mirrors Web `place_id && date < todayVN && !reviewedPlaceIds.has(place_id)` verbatim, incl. UTC+7 "today" and conservative hide-on-error.
  EVIDENCE: Android `Booking.kt:45-67`, `BookingsViewModel.kt:27-96` ↔ Web `src/app/profile/bookings/page.tsx` (gate quoted in Android doc-comment).
- `[P2]` **Service-detail community reviews** — GET `/api/reviews?placeId=`, newest-3 "Lịch đặt của bạn" via client-side filter of the booking list.
  EVIDENCE: Android `ServiceDetailRepository.kt:35-68` ↔ Web `/service/[id]` server component + `BookingForm`.
- `[P2]` **Price-watch list** — GET `/api/price-watch`, snake_case DTO, triggered/active split, excludes cancelled.
  EVIDENCE: Android `pricetracking/data/PriceWatchDtos.kt:22-54`, `PriceTrackingApi.kt:18-19` ↔ Web `src/app/api/price-watch/route.ts` GET (`.neq('status','cancelled').limit(20)`).
- `[P2]` **Price-watch cancel** — DELETE with `{id}` body (`@HTTP(method="DELETE", hasBody=true)`); soft-cancel to `status:'cancelled'`.
  EVIDENCE: Android `PriceTrackingApi.kt:21-22`, `PriceWatchDtos.kt:35` ↔ Web `route.ts` DELETE (`.update({status:'cancelled'})`).
- `[P3]` **Deals read** — GET `/api/deals` → `{deals}`, HOT/MỚI badge + discount string, external-link cards, curated-count subtitle, MFS 3.10 disclosure footer.
  EVIDENCE: Android `deals/data/DealsApi.kt:8`, `DealsNetworkDtos.kt:11-30`, `DealsScreen.kt:96-176` ↔ Web `src/app/api/deals/route.ts` + `src/app/deals/DealsView.tsx:66-118`. DTO fields (title/category/discount/url/source/emoji/badge) match Web `Deal` (`src/lib/shopee-deals.ts:1-9`) 1:1.

## MISSING

- `[P3]` **In-app price-watch create** — Android has no POST affordance (comment: "created via chat"). This is **parity**: Web's `/profile/price-watches` page also only lists + cancels; creation is the chat `save_price_watch` tool, not the UI.
  EVIDENCE: Android `PriceTrackingApi.kt:14` (no POST) ↔ Web `src/app/profile/price-watches/page.tsx:34-53` (fetch GET + DELETE only), `src/app/api/chat/route.ts:347` (`save_price_watch` tool inserts to `price_watches`).
  **Doc contradiction:** freeze `03_Backend.md:96` lists `/api/price-watch` as **GET/DELETE only** — imprecise; the route has a live **POST** (`route.ts` POST, max-10 guard, 429). Functionally moot for UI parity.
  **UNVERIFIED (cross-domain):** if Android Chat is the "TEXT-ONLY MVP" (canonical arch directive) with no `save_price_watch` tool, then Android users cannot create a watch by *any* path (no UI, no chat tool) while Web can via chat. Confirm in the Chat-tools domain audit; out of scope here.
- `[P3]` **Deals click counter** — `POST /api/deals/[id]/click` NOT wired on Android. This is **parity with current tree**: the route **does not exist** in `src/app/api/deals/` (only `route.ts`), and deals carry no `id` field. Freeze `11_Android_Migration.md` item 10 describes it as a migration TODO tied to the un-merged `partner_deals` rearchitecture.
  EVIDENCE: `find src/app/api/deals` → `route.ts` only; Android `DealDto` (`DealsNetworkDtos.kt:12-20`) has no `id`.

## DIFFERENT BEHAVIOR

- `[P3]` **Deals bottom-nav vs Home quick-action** — Web tab 4 = Deals; Android reaches Deals from a Home quick-action (`DealsRoute.kt`/`DealsScreen.kt`). **Approved, documented divergence** (freeze `11_Android_Migration.md:88, 252` D4). Not a bug.

## BUGS

- None found in Android commerce code. (Deals link-rot memory `project_bug14_deals_link_rot.md` — the un-committed URL/Baemin fix is also absent from this tree's `shopee-deals.ts`, but Android fetches the pool live from `/api/deals`, so any link correctness is a Web/backend concern, not an Android-side defect.)

## REQUIRED BACKEND CONTRACTS

- `[P2]` **`inferFromBooking()` no-ops for Bearer callers** — a real Web-backend gap (freeze `03_Backend.md:96,149-150; §3.1`, verified in `src/app/api/bookings/route.ts`). The helper builds a fresh cookie-scoped `createClient()` (not the Bearer-authed `supabase` from `getRequestUser`), so its `user_preferences` upsert is RLS-blocked and swallowed for Android callers. **Impact:** Android bookings **insert fine** (insert uses the Bearer-authed client), but they **never update `inferred_preferences`** → personalization signal is silently lost only for native/Bearer users. Android cannot fix this client-side; needs the helper to accept the request-scoped client. No Android change required beyond awareness.
- `[P3]` **Bookings pagination — BLOCKED, confirmed.** Web GET is a hard `.limit(20)` with no cursor/offset params; Android `BookingsApi.kt` comment notes "limit 20, no pagination params." Neither platform paginates; not a divergence and not client-fixable. Matches freeze "BLOCKED".

---

### Doc-vs-reality notes (flagged for synthesis)
1. Freeze `07_Features.md:59-62`, `04_Database.md §1.6`, `11_Android_Migration.md:176` describe **DB-backed `partner_deals`** with click counter + promo UI (discount badge / countdown / copyable voucher chip) and claim `shopee-deals.ts` **DELETED**. **In this tree none of that is true:** `src/lib/shopee-deals.ts` is present and is the deals source; `/api/deals/route.ts` calls `getShopeeDeals()`; zero `partner_deals`/`partnerDeals`/`getActiveDeals` refs in `src`; no `/api/deals/[id]/click` route. The rearchitecture is un-merged relative to `feat/backoffice-phase0`. **Audit against current Web ⇒ Android Deals is at parity; the promo-UI/click-counter migration items are N/A to this baseline.**
2. Freeze `03_Backend.md:96` "`/api/price-watch` GET/DELETE" omits the live **POST** create route.
