# Domain 05 — Maps, Location, Explore, Recommendations (Android parity audit)

**Baseline:** current working tree (uncommitted included), audited 2026-07-26 against Web freeze `Web_V1_Platform_Freeze_2026-07-25` (Web commit `79d05f3`).

## Verdict

Explore and Recommendations are at parity; the Maps tab is a placeholder-map + favorites-list that is *broadly consistent* with a Web that has no map page at all — the real gap is **Location capability** (no permission, no provider), which costs Android the chat location-bias and the "Nearby" chat chip. Two freeze-doc claims (map rendering as a parity requirement; `/api/track` degrading recommendations) do not hold up against the actual code.

---

## IMPLEMENTED

- **[P3] Explore tab = Reviews feed — full parity.** Android `explore/ExploreTab.kt:7-9` renders `ReviewsNavHost()`. Web nav `nav.explore` → `/reviews` (`src/components/BottomNav.tsx:11`). Same target. The deleted `discovery/Discovery*.kt` files (working tree) were dead scaffolding; their removal does not regress Explore — Explore never routed through them.
- **[P3] Recommendations feed — parity.** `recommendations/RecommendationsViewModel.kt:45-61` fetches `GET api/recommendations` once, renders items + `explanation` chips + a `personalized` subtitle. Mirrors Web `src/app/recommendations/page.tsx:36,60` ("Cá nhân hóa theo sở thích của bạn" vs "Địa điểm nổi bật gần đây"). DTO `recommendations/data/RecommendationsDtos.kt:12-24` matches the Web route's JSON shape (`src/app/api/recommendations/route.ts`).
- **[P3] Saved-places list + detail — real, backed by `/api/favorites`.** `maps/data/MapsApi.kt:21-25` (`GET/DELETE api/favorites`), `MapsViewModel.kt` (load, client-side filter/query, optimistic remove). Detail sheet actions Open/Share/Remove all real (`MapsScreen.kt:396-416`).
- **[P3] OSM / search-URL substrate matches Web.** Web has **no embedded map library** (no leaflet/maplibre/mapbox/google.maps JS anywhere in `src/`); places come from OSM Overpass in AI tools and are surfaced as Google Maps **search** URLs (`src/lib/ai/tools/food.ts`, `src/lib/ai/promptBuilder.ts`). Android's `openPlaceInMaps`/`sharePlace` build the identical `google.com/maps/search/?api=1&query=` URL (`MapsScreen.kt:398,409`). No Places API, no billing, on either side. Consistent.

## MISSING

- **[P1] Location capability — absent entirely.** Manifest declares only `INTERNET` + `ACCESS_NETWORK_STATE` (`android/app/src/main/AndroidManifest.xml:14-15`); no `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`. No `FusedLocationProvider` anywhere in `android/app/src/main`. No `core:location` module exists (`android/core/` contains 12 modules, none is `location`) — `android/docs/Android_Architecture.md:42` *describes* a `core:location` `FusedLocationProviderClient` wrapper that was never built. Matches freeze §4.2 item 4.
  - **Downstream 1 — chat location bias lost.** Web `src/components/ChatInterface.tsx` calls `navigator.geolocation.getCurrentPosition` and sends `userLocation:{lat,lng,address}` to `/api/chat`, which biases `search_places` (`src/app/api/chat/route.ts`, `hasLocationBias: !!userLocation`). Android `chat/data/ChatRequest.kt` has **no** location field — the request cannot carry it, so Android chat place-search is never location-biased.
  - **Downstream 2 — "Nearby" chat chip missing.** Web renders `chat.chipNearby` ("📍 Nearby" / "📍 Tìm quanh đây", `dictionaries.ts`) which triggers geolocation before sending. No equivalent chip in Android chat.
  - **Downstream 3 — For-You city boost** depends on knowing the user's city; without location it relies solely on profile city.

## DIFFERENT BEHAVIOR

- **[P3] Android Maps "Map" pane renders a styled placeholder; Web has no map at all.** `maps/MapCanvas.kt:34-74` draws a grid + map-icon + `maps_preview_label` (no SDK/tiles/location). Freeze §4.2 **item 3** lists "Map rendering" as NEEDS-NATIVE (`maps/MapCanvas.kt:24 renders a styled placeholder. maps-compose is pinned but unapplied`). **Contradiction:** `MapsScreen.kt:65-71,183-190` documents that Web has **no maps page** — the Web counterpart to this data is the plain `/profile/favorites` list — and the pane's former layers/my-location FABs were deleted precisely because Web never had them. Building a real map would therefore *exceed* Web parity, not close a gap. Confirmed: Web `src/` has zero map-tile libraries. So the honest classification is "Android tab 4 = Maps is an approved divergence (freeze §6 / D4); a real tiled map is optional polish, not a parity requirement."
  - `maps-compose` **is** pinned in `android/gradle/libs.versions.toml:159` but is **not** referenced in `android/app/build.gradle.kts` dependencies (no `implementation(libs.maps.compose)`; no `play-services-location`/`play-services-maps`). Freeze "pinned but unapplied" verified.
- **[P3] Maps screen surfaces only *saved favorites*, never new-place search/discovery.** By construction (`MapsModels.kt:31-41`) every row is an existing favorite; the search bar filters the saved list client-side. Web has no REST place-search either (discovery is AI-chat-only), so this is consistent, but it means the Maps "search" is a local filter, not a discovery surface — worth noting for UAT expectations.

## BUGS

- **[P2] Freeze claim "`/api/track` missing ⇒ recommendations degrade" is not supported by the code.** Freeze §4.2 **item 6** says Android sending nothing to `/api/track` means "recommendations degrade for Android users." But `src/app/api/recommendations/route.ts:22-45` personalizes via `buildAIContext(user.id)` (preference profile + memory) + community-review aggregation + saved favorites — and `src/lib/ai/contextBuilder.ts` does **not** query `user_events` (the table `/api/track` writes to, `src/app/api/track/route.ts:105`). So the *recommendations endpoint specifically* does not consume the track signal; Android's missing `/api/track` does not degrade **this** feed. `/api/track` is still genuinely unwired on Android (no `api/track` caller in `android/app/src/main/java`), which is a real analytics/telemetry gap — just not the recommendations-quality gap the freeze asserts. **UNVERIFIED:** whether any *other* personalization surface reads `user_events`.

## REQUIRED BACKEND CONTRACTS

- **None new for parity.** All four surfaces reuse existing endpoints: `GET/DELETE /api/favorites` (Maps), `GET /api/recommendations` (Recs), `/reviews` feed (Explore), `/api/chat` (chat place search). 
- `/api/chat` **already accepts** an optional `userLocation:{lat,lng,address}` (`src/app/api/chat/route.ts`) — Android only needs to (a) add location permission + a provider and (b) add the `userLocation` field to `ChatRequest.kt`; no server change required.
- `/api/track` exists (`src/app/api/track/route.ts`, service-role write to `user_events`) and is uncalled by Android — wiring it is client-only, no contract change.
