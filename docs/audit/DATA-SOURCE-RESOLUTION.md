# P0 Data Source Resolution — Traveloka · Vexere · Moveek (Web)

Date: 2026-10-04 · Worktree `D:/TappyAI-wt/wtp7` · branch `p7/web-subscription` @ `0612687` · committed with the Web baseline `feat(web): finalize phase 7 web baseline` (04/10) · **not pushed**.
Status (unchanged by the cleanup): Traveloka = affiliate ready / API access pending · Vexere = affiliate ready / API access pending · Moveek = official data access not established. Real UAT has not been possible: no provider credentials exist.
Scope: Web only. Agent / Luna / routing / Consultative architecture: **FROZEN — untouched.** Android/iOS: 0 files changed.

## Verdict

| Provider | Affiliate | API | Data | Access | Production | Status |
|---|---|---|---|---|---|---|
| **Traveloka** | ✅ APPROVED (ACCESSTRADE → Partnerize, campaign 6654251588167732819) — tracked deep links only | Official, **partner-only**: Traveloka Partners Network "Loka" API (Product / Booking / Reference APIs) | ❌ none today (fare, seats, schedule) | ❌ no partner account, no credentials | Deep links live; data — no | **STATE B — READY / ACCESS PENDING (commercial approval)** |
| **Vexere** | ✅ APPROVED (ACCESSTRADE, campaign 5222734619328835827, Tier 1) — tracked route/date links only | Official but **private**: "Tích hợp hệ thống - API" / AMS / White Label (registration, no public docs) | ❌ none today (trips, fare, seats, pickup/dropoff) | ❌ no agreement, no credentials | Deep links live; data — no | **STATE B — READY / ACCESS PENDING (commercial approval)** |
| **Moveek** | ❌ no programme (also none for CGV / Galaxy / Lotte / Ticketbox) | ❌ no official API or feed published | ❌ showtime per cinema, ticket price, seats | ❌ only a commercial contact | Level 1 only: now-showing titles via search snippets + film metadata (existing) | **STATE C — NOT AVAILABLE via any official programmatic source** |

**Stop condition hit:** the first two providers require commercial approval and their credentials cannot be obtained from the repo or environment, and the third has no official channel. Per the brief, nothing was guessed and no undocumented endpoint was used. Only the provider-neutral contract and adapter port were built.

## 1. Credential audit (names only — no values read or printed)

| Env name | Where | State |
|---|---|---|
| `ACCESSTRADE_PUBLISHER_ID` | g1-place-guard `.env.local` (audit/UAT env) | set |
| `ACCESSTRADE_API_KEY`, `ACCESSTRADE_FEED_ENDPOINT` | — | **not set** (owner) → `feedIngest.ts` returns `blocked_no_credentials` |
| Any Traveloka / Vexere / Moveek data credential | — | **none exists anywhere** |

`.env.local.example` declares only `ACCESSTRADE_PUBLISHER_ID=`. `docs/commerce/AFFILIATE_STATUS.md` confirms that the affiliate approvals are link programmes, and lists "Vietjet, CGV, Ticketbox, GrabFood, ShopeeFood — no programme".

## 2. Official documentation (verified 2026-10-04)

**Traveloka**
- https://developer.travelokapartnersnetwork.com: "You need to be registered as a partner in order to access our APIs". It lists Product APIs (content / rates), Booking APIs and Reference APIs, with a testing environment available after registration. Flights are not explicitly listed in the public portal; the solutions page lists flights, hotels and bus.
- https://www.travelokapartnersnetwork.com: onboarding is registration → NDA → commercial agreement. Contact: `partnersnetwork@traveloka.com`, or the partner form https://traveloka.sg.larksuite.com/share/base/form/shrlg7CyVohw5GHPRXwt8LdPCCW.
- https://www.traveloka.com/vi-vn/p/affiliate: banners, widgets and tracking links only. **No data.**

**Vexere**
- https://daily.vexere.com offers "Tài khoản đặt vé trực tuyến - AMS", "Tích hợp hệ thống - API" and "White Label" behind "Đăng kí ngay". No public API docs or terms.
- blog.vexere.com/he-thong-ams-danh-cho-dai-ly: AMS covers 300+ operators and 3,000+ routes. Contact: Ms. Nguyễn Thắm, 0989 664 246.

**Moveek**
- https://moveek.com/about-us: Moveek resells the partner cinemas' products. It publishes no API, feed or affiliate programme. Contact: `thailuu@moveek.vn` (CÔNG TY TNHH MONET).
- CGV / Galaxy / Lotte: no official API or affiliate programme was found. Scraping them is forbidden by the brief and was not done.

**ACCESSTRADE publisher API** (https://developers.accesstrade.vn)
- `/v1/datafeeds` is a retail product feed (the Lazada example).
- `/v1/offers_informations` covers coupons; `/v1/campaigns` lists campaigns.
- **No travel fare, bus seat or showtime data is documented.** Even with the API key, ACCESSTRADE does not unlock fares.

## 3. Exact capabilities today

| | Traveloka | Vexere | Moveek |
|---|---|---|---|
| Tracked booking link | ✅ hotel landing + dated flight fullsearch (L2) | ✅ dated route link (L4) | ❌ (film links from the registry only, no tracking) |
| Live fare | ❌ | ❌ | — |
| Seats / availability | ❌ | ❌ | ❌ |
| Schedule / trips | ❌ | ❌ | — |
| Showtime per cinema | — | — | ❌ |
| Ticket price | — | — | ❌ |
| What the user sees | "Hiện Tappy chưa xác minh được giá realtime." + tracked link | same | now-showing titles (UNVERIFIED) + "chưa xác minh suất chiếu/giá vé" |

## 4. Code changed (Web only, new files only)

- `src/lib/providers/travelData.ts` (new):
  - Normalized contracts: `FlightResult`, `BusResult`, `CinemaShowtimeResult` (exact field lists from the brief; durations as `duration_min`).
  - `SourceStatus` = VERIFIED / UNVERIFIED / STALE / UNAVAILABLE, with field TTLs: fare 15 min, availability 5 min, showtime 6 h, ticket price 1 h.
  - Strict untrusted-input normalizers: an invalid value is dropped, never repaired. A fare without a valid currency counts as no fare. A provider can never upgrade a record to VERIFIED without a valid, non-future timestamp.
  - `allowedBookingUrl`: https only, no userinfo, host must be in the provider's own CCP `allowedHosts`. Moveek has no registry entry, so no host is allowed for it.
  - `claimable*` gates: only these let a number be stated as current.
  - `fareSentence`: only "Giá hiện tại là X" when the fare is VERIFIED and fresh; otherwise "Hiện Tappy chưa xác minh được giá realtime."
  - `callProvider`: a bounded port with a 6 s timeout that never throws and never leaks error text. With no mapping it returns `UNAVAILABLE/access_pending` plus the official channel.
  - `reuseCarried`: follow-ups reuse carried results, or request one refresh of the same query. **Never a plan rerun.**
  - `PROVIDER_ACCESS`: official channel and env **names** per provider.
- `src/lib/providers/travelData.test.ts` (new): 29 tests.
- **Not changed:** agent loop, tools, routing, Luna, Consultative, UI, subscription, Android, iOS. The module is not yet wired into `get_flight_prices` / `get_movie_showtimes`. Wiring it is a single tool-level step once a provider mapping exists, and wiring it now would change agent behaviour for zero data.

## 5. Tests

`npx vitest run src/lib/providers/travelData.test.ts` → **29/29 passed.**

Per-provider cases: valid, unavailable (no access), stale, malformed (record, batch and non-array), missing fare, fare without currency, missing availability, invalid booking URL (foreign host, http, userinfo, `javascript:`, cross-provider host), timeout, provider error (message not leaked), and a false VERIFIED claim.

Context reuse: reuse a fresh subset; stale → one same-query refresh; nothing matching → `none_matching`; UNVERIFIED never becomes a price claim.

Security: no credential-like fields in results; env names only.

Regression: `tsc --noEmit` clean. Architecture lock + consultative architecture + agent + CCP: **209/209 passed.**

## 6. Real UAT — **ACCESS BLOCKED**

| Provider | What is missing | Who must provide it | Access needed | What the docs say | Code ready |
|---|---|---|---|---|---|
| Traveloka | partner account + API credentials + docs | **Owner (Huy)** applies; Traveloka TPN approves | TPN partner (flights + bus product APIs), sandbox, then production | partner registration required; NDA → commercial agreement | contract, validation, allowlist, port, tests |
| Vexere | API agreement + key + docs | **Owner** registers at daily.vexere.com / calls 0989 664 246 | "Tích hợp hệ thống - API" (search trips, fare, seats, pickup/dropoff) | registration form only, no public docs | same |
| Moveek | any official data channel | **Owner** → `thailuu@moveek.vn`, or a cinema chain | showtime + price + seats feed with redistribution rights | none published | contract only; adapter intentionally absent |

## 7. Latency / cost

- Latency: there are no provider calls today, so 0 ms added. The port caps any future call at 6 s.
- Cost: $0. No paid provider added and no API purchased (the brief forbids it before access is audited). Traveloka and Vexere pricing is commercial and unknown until the agreements.

## 8. Security review

- Credentials: none exist. Future credentials are read server-side only, by name (`TRAVELOKA_TPN_*`, `VEXERE_API_*`). They are never sent to the client, the agent, logs or tool results; results structurally contain no request/header/token fields (tested).
- Provider content is treated as untrusted: types, ranges, ID charset, ISO dates, currency whitelist, list bounds (20) and string lengths are all enforced.
- Booking URLs: CCP allowlist, https only, no userinfo.
- No scraping and no undocumented endpoints. Search-found endpoints are not treated as approved APIs.

## 9. Remaining blockers → exact next actions (owner)

1. **Traveloka:** submit the TPN partner form (Lark link above) or email `partnersnetwork@traveloka.com`. Ask for flights + bus product/rate APIs, the sandbox, and the terms on caching/redistribution of fares. Sign the NDA → commercial agreement.
2. **Vexere:** register "Tích hợp hệ thống - API" at https://daily.vexere.com, or call Ms. Nguyễn Thắm (0989 664 246). Ask for the API docs, a sandbox key, and display/redistribution terms.
3. **Moveek:** email `thailuu@moveek.vn` about a showtime/price data partnership. Otherwise, approach chains individually. Until then, keep the Level 1 behaviour.
4. When the docs and a sandbox key arrive, implement **only** the provider → contract mapping (a `fetchRecords` per provider), put the credentials in Vercel server env, run real UAT against the sandbox, then wire it into the existing tool. No agent change.
5. Optional (does not unlock fares): set `ACCESSTRADE_API_KEY` to list approved campaigns programmatically.
