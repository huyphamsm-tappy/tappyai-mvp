# Provider capability matrix — booking first, affiliate separate

**Verified 06 Oct 2026.** Primary criteria: (1) can Tappy obtain **realtime data** itself, (2) can Tappy send the user into the **relevant booking context** with a dynamic deeplink. Affiliate status is a separate monetisation column and never changes a provider's rank.

Levels: **BEST** = Tappy realtime data + dynamic deeplink · **GOOD** = dynamic deeplink, the provider page loads live data after the click · **LIMITED** = deeplink works, context weak/static · **BLOCKED** = a realtime API exists but Tappy has no access (adapter/interface ready).

No provider is BEST today: Tappy holds no realtime data from any provider. Where an adapter exists it is **flag OFF** (`CCP_REALTIME_<P>`), and the page-level deeplink answers until access is granted.

| Provider | Best data source today | Realtime API | Tappy realtime adapter | Best deeplink (verified) | Final user destination | Affiliate (separate) | Level |
|---|---|---|---|---|---|---|---|
| Trip.com | none (no API access) | none audited | — | Flights: route, depart + return date, passengers, cabin. Hotels: property with stay | Live fare list / hotel page with the stay | ACCESSTRADE approved, tracked | GOOD |
| Traveloka (flights) | none | Partner/LOKA API — approval-gated | skeleton, `unsupported` until schema | `flight/fullsearch?ap=&dt=&ps=&sc=` (return date dropped by merchant) | Live fare list for the route/date | ACCESSTRADE→Partnerize approved, tracked | GOOD · **BLOCKED** (API) |
| Traveloka (hotels) | none | same | skeleton | hotel landing / discovered property page | Hotel page, dates chosen on page | as above | LIMITED · **BLOCKED** |
| Vexere | none | "Tích hợp hệ thống - API"/AMS — private, no public docs | skeleton, `unsupported` | discovered route page + `?date=` | Live trip list for the date | ACCESSTRADE approved, tracked | GOOD (with route page) / LIMITED (landing) · **BLOCKED** |
| Agoda | none yet | Search API 2.0 (rates + availability, `landingUrl` via `metaSearch`) — account pending | **full** (search + recheck), flag OFF | `search?city=<id>[&selectedproperty=<id>]&checkin&checkout&adults&rooms&los` (needs Agoda ids; Đà Lạt = 15932 verified) | Agoda search/property with the stay applied | Pending (domain not verified) | GOOD · **BLOCKED** (API access) |
| Booking.com | none yet | Demand API (`/accommodations/search`, `/availability`) — Partner Centre access not verified | **full** (search + availability recheck), flag OFF | public `searchresults?ss&checkin&checkout&group_adults&no_rooms` | Results for destination/dates/guests | not activated (CJ) | GOOD · **BLOCKED** (API access) |
| Vietnam Airlines | none | none audited | — | book-tickets page (route/date not accepted) | Empty booking form | ACCESSTRADE approved (host `www.vietnamairlines.com` only) | LIMITED |
| Vietjet | none | none audited | — | homepage widget | Homepage | none | LIMITED |
| Klook | none | none audited | — | activity page | Activity page, package/date on page | ACCESSTRADE approved, tracked | GOOD (detail) |
| Lazada | ACCESSTRADE datafeed exists but `ACCESSTRADE_API_KEY` not set and display rights OFF (D7) | datafeed (retail) — not travel fares | — | product / catalogue page | Product page (login at checkout) | approved, tracked | GOOD (detail) · feed **BLOCKED** |
| Shopee | none | none audited | — | product page / `search?keyword=` | Login wall for guests | Pending (Smartlink) | LIMITED |
| TikTok Shop | none | none audited | — | `shop.tiktok.com/vn/pdp/…` discovered | Product page | approved but only product-feed links credited → direct | LIMITED |
| CellphoneS | datafeed as above (key not set) | — | — | discovered product page / `catalogsearch/result?q=` | Product page, Smember login at checkout | approved, tracked | GOOD (detail) |
| Điện Máy Xanh | inactive by owner decision | — | — | product page | /cart (guest) | pending | inactive |
| CGV | none | none (no public API) | — | film page | Film page; login before seats | none | LIMITED |
| Galaxy · Lotte · BHD · Beta | none | none (no public API) | — | now-showing list; film page when discovered | Chain's film list / film page | none | LIMITED |
| Ticketbox | none | none audited | — | `search?q=` | Event list with dates and "from" prices; login before tickets | none | GOOD (search) |
| GrabFood · ShopeeFood | none | none | — | restaurant page | Page; ordering in app/login | none | LIMITED |

## What is implemented vs waiting
- **Implemented now:** normalized contract, Agoda + Booking.com adapters (search, recheck), flags/credentials gating, location-id namespaces (`providerRefs.<provider>`), fallback chain, chat integration at `attachCommerceLinks`, web recheck link + `POST /api/booking/recheck`, fixtures and E2E tests.
- **Waiting for provider access (BLOCKED, live access only):** Agoda (account approval, API key, endpoint + auth scheme), Booking.com (Partner Centre rights, token, affiliate id), Traveloka (partnership agreement + docs), Vexere (API agreement + docs), ACCESSTRADE datafeed key.
- **Not done by design:** no scraping, no private endpoints, no auth/bot-protection bypass, no mocks in production code.
