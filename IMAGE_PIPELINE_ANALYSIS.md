# IMAGE_PIPELINE_ANALYSIS.md

**Scope:** Read-only trace of the complete image flow, from user query to rendered `<img>` in chat. No code changed. No fixes proposed.

---

# Executive Summary

The image pipeline is a 4-stage chain: **Provider search → per-place image resolution → AI text generation (markdown) → client-side render**. Every stage was read in full.

Three verified, code-backed failure points explain the symptoms ("no image", "wrong image", "duplicate image", "inconsistent image"):

1. **The OpenStreetMap fallback path returns zero image fields, ever.** Any Google Places failure (quota, timeout, network) silently drops the response into a shape that has no image resolution logic at all — not "tries and fails," but structurally incapable of producing `photo_url`.
2. **That imageless fallback result gets cached for 30 minutes**, using the same cache key a successful Google response would have used. One transient failure poisons every identical query for up to 30 minutes for every user.
3. **`fetchPlacePhotoByName` searches Serper by place name only — no address, no city, no disambiguation.** For chains (Highlands Coffee, Phở 24, The Coffee House) or common names, this is a name-collision search, not a place-specific search. This is the most direct, code-verified explanation for "wrong image" and "duplicate image" across different places in the same response.

The "max 3 images per response" and "copy the URL exactly" rules are enforced **only by LLM instruction-following** in promptBuilder.ts — there is no code-level cap, dedup, or URL validation anywhere in the pipeline. Any inconsistency at that layer is a probabilistic LLM behavior, not a deterministic bug, and is unverifiable from code alone.

---

# Complete Pipeline Diagram

```
User message ("quán bún bò ngon Quận 1")
        │
        ▼
src/app/api/chat/route.ts (POST handler)
        │  AI SDK streamText() with tool search_places
        ▼
src/lib/ai/tools/food.ts :: searchPlaces(query, location, type, lang, locationBias)
        │
        ├─ cache check (getCache) ── HIT → return cached result (may or may not have images)
        │
        ├─ MISS → GOOGLE_PLACES_API_KEY present?
        │     │
        │     ├─ YES → POST places.googleapis.com/v1/places:searchText (5s timeout)
        │     │     │
        │     │     ├─ SUCCESS (200 + places[]) ──▶ per-place image resolution (see below)
        │     │     │                                 ──▶ result = { source: 'Google Maps', results: [...with photo_url?] }
        │     │     │
        │     │     └─ FAIL (429 quota / network / timeout / non-200) ──▶ caught, result stays null
        │     │
        │     └─ NO KEY → result stays null
        │
        ├─ if result still null ──▶ searchPlacesOSM(query, location)
        │                             ──▶ result = { source: 'OpenStreetMap', results: [name,address,phone,maps_link] }
        │                             ──▶ NO photo_url FIELD EXISTS IN THIS SHAPE, EVER
        │
        ├─ Serper price/order enrichment (unconditional, both branches) — adds order_links/platform_links, NOT images
        │
        ├─ TappyAI community rating injection (Supabase reviews join by place_id)
        │
        ├─ setCache(cacheKey, result, 30 min) ── caches WHATEVER result is, imageless or not
        │
        ▼
tool result returned to AI SDK ──▶ fed to Claude as tool output
        │
        ▼
src/lib/ai/promptBuilder.ts :: reviewBlock (prompt instruction, not code)
        │  "IF result has photo_url → emit ![Ảnh địa điểm](photo_url) on its own line,
        │   max 3 images total in response, copy the value verbatim"
        │  ← this is the ONLY place the 3-image cap and no-dedup-check exist. It is a
        │    natural-language instruction to an LLM, not enforced by any code.
        ▼
Claude generates response text containing zero or more ![alt](url) markdown image tags
        │
        ▼
streamText() streams tokens back over the AI SDK data stream
        │  (applyLuxuryStreamFilter may rewrite text chunks if budget.max < 1,500,000 — 
        │   string-replaces luxury brand names only, does not touch image markdown)
        ▼
src/components/ChatInterface.tsx :: useChat() receives streamed message
        │
        ▼
src/components/ChatInterface.tsx :: formatMessage(content) [line 334]
        │  regex: /\n?!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)\n?/g
        │  replaces markdown image syntax with:
        │  <div><img src="${src}" ... onerror="this.closest('div').style.display='none'"/></div>
        ▼
dangerouslySetInnerHTML renders the <img> tag in the browser
        │  onerror hides the container if the URL 404s/CORS-fails at render time
        ▼
Image appears (or silently disappears) in the final chat bubble
```

---

# Image Sources

## Source 1 — Official Website og:image

- **Entry point:** `src/lib/ai/tools/food.ts` line 201-204, inside `searchPlaces()`'s per-place `Promise.all` map.
- **Function:** `fetchOfficialWebsiteImage(websiteUri)` in `src/lib/ai/tools/common.ts` (line 58).
- **Input:** `websiteUri` — comes from Google Places `searchText` response field `places.websiteUri`. **Only exists if Google Places search succeeded.**
- **Output:** absolute image URL (resolved via `new URL(raw, websiteUri)`) or `null`.
- **Transformation:** fetches the site's HTML (bounded to 100KB or until `</head>`, 1.8s hard timeout), regex-extracts `og:image` meta content.
- **Cache:** none — explicitly live-only per code comment (Google ToS: business content must not be persisted).
- **Failure points (verified in code):**
  - No `websiteUri` at all → skipped entirely, falls through immediately (line 201: `if (websiteUri)`).
  - Non-HTML response, non-200, or `<head>` not found within 100KB → returns `null`.
  - 1.8s timeout — any slow site fails silently (`catch` returns `null`, logged as `website_image_failed`).
  - Malformed or relative `og:image` content that fails `new URL(raw, websiteUri)` → throws, caught, returns `null`.

## Source 2 — Google Places Photo (legacy endpoint)

- **Entry point:** `food.ts` lines 206-217, same `Promise.all` map, runs only if Source 1 returned nothing.
- **Two-step call:** (a) legacy `maps.googleapis.com/maps/api/place/details/json?place_id=...&fields=photos` (2.5s timeout) to get a `photo_reference`, then (b) `fetchPlacePhoto(placeId, photoRef)` in `common.ts` line 25, which hits either the new API media endpoint or legacy photo endpoint depending on the reference format (3s timeout).
- **Input:** `placeId` (from the same search response) + `photo_reference`.
- **Output:** absolute photo URL or `null`.
- **Cache:** none — explicitly live-only per Maps ToS comment.
- **Failure points (verified, and previously proven in this project's own testing):**
  - The field mask on the initial `searchText` call (`SEARCH_FIELD_MASK`, food.ts line 166) explicitly **excludes** `places.photos` with a code comment stating "key is restricted to old Places API only — new API silently returns 0 photos." This means the New API path for this source contributes nothing by design.
  - The legacy `place/details` call depends on Google Places billing/quota being healthy. This project's own prior investigation (`Google_Cloud_Support_Case.md`, still present in the repo state) documented live `429 RESOURCE_EXHAUSTED` responses with an enforced daily limit of 100, and separately a `REQUEST_DENIED — must enable Billing` error on this exact legacy endpoint. Both are real, reproduced failures, not hypothetical.
  - 2.5s + 3s timeouts stacked sequentially per place (if reached) — slow but does fall through cleanly to Source 3 on any failure (wrapped in `try/catch`, line 217: `/* skip on timeout or error, fall through to Serper */`).

## Source 3 — Serper Image Search (by name)

- **Entry point:** `food.ts` line 219-220, last resort in the per-place chain.
- **Function:** `fetchPlacePhotoByName(placeId, placeName)` in `common.ts` line 163.
- **Input:** **`placeName` only.** No address, no city, no location parameter is passed to the Serper query (`body: JSON.stringify({ q: placeName, gl: 'vn', hl: 'vi', num: 5 })`, common.ts line 174).
- **Output:** via `pickEmbeddableImageUrl()` (common.ts line 139) — filters out likely logos/icons (width/height < 300px or title/domain contains "logo"/"icon"/"favicon"), then prefers a `gstatic.com`/`googleusercontent.com`/`ggpht.com`/`bing.com` thumbnail (not hotlink-blocked), falling back through 3 more tiers before returning `null`.
- **Cache:** none — explicitly live-only per code comment (Serper doesn't own the returned images).
- **Failure points (verified in code):**
  - **No address/city disambiguation in the query** — for any place name that is not unique (chain brand, generic name like "Highlands Coffee", "Phở Thìn", "The Coffee House"), the Serper image search has no way to know which specific branch/location the user asked about. It returns whatever ranks highest for the bare name. **This is a structural design gap, not an intermittent failure** — it happens on every call to this function, for every non-unique name.
  - `placeName` empty → skipped, returns `null` (line 219: `if (!placeName) return null`).
  - No `SERPER_API_KEY` → skipped, returns `null` (common.ts line 165).
  - 4s timeout, non-200 response, or zero `images` in the response → returns `null`.
  - All 5 candidate images filtered out as logo/icon-like → `pickEmbeddableImageUrl` falls back to the unfiltered pool (line 142: `pool = filtered.length > 0 ? filtered : images`) rather than returning `null` — meaning a logo CAN still be shown if literally every result looks like a logo.

## Source 4 — Community-uploaded photos

**Unknown — requires further verification.** No code path was found in `food.ts`, `common.ts`, or `promptBuilder.ts` that reads user-uploaded review photos (the `reviews.photos` column referenced in `src/app/api/reviews/route.ts`) back into the `search_places` tool's `photo_url` field. Community photos appear to be stored and displayed only on review-specific UI (not traced in this investigation, out of the stated image-pipeline scope of `searchPlaces`). If the user expects community photos to appear in chat responses, that link does not exist in the code read so far.

## Source 5 — OpenStreetMap fallback (searchPlacesOSM)

- **Entry point:** `food.ts` line 244 — `if (!result) result = await searchPlacesOSM(query, location)`.
- **Triggered when:** `GOOGLE_PLACES_API_KEY` is missing, OR the Google `searchText` call throws/times out, OR it returns non-200, OR it returns 200 with an empty `places` array.
- **Output shape (food.ts line 108-118):** `{ name, address, phone, maps_link }` — **there is no `photo_url` field anywhere in this function.** It was never added; `fetchOfficialWebsiteImage`, `fetchPlacePhoto`, and `fetchPlacePhotoByName` are never called from `searchPlacesOSM`.
- **This is the single most consequential finding in this analysis:** every place returned via the OSM fallback is structurally guaranteed to have no image, regardless of whether that place actually has a website, a Google listing, or a discoverable Serper image. It's not that the fallback tries and fails — it never tries.

---

# Data Flow

```
places.googleapis.com response field   →  food.ts result field       →  promptBuilder field read   →  markdown emitted
--------------------------------------    -------------------------     -------------------------     ----------------
places.id                               →  place_id                    →  (used for maps_link         →  (not shown directly)
                                                                            fallback + review join)
places.displayName.text                 →  name                        →  place name in prose         →  plain text
places.formattedAddress                 →  address                     →  address in prose            →  plain text
places.rating + userRatingCount         →  google_rating (string)      →  google_rating                →  **bolded rating line**
places.googleMapsUri                    →  maps_link                   →  maps_link                    →  CTA button URL
places.websiteUri                       →  website_uri (conditional)   →  website_uri                  →  CTA button URL (spa/ent.)
(derived, see Image Sources above)      →  photo_url (conditional)     →  photo_url                    →  ![Ảnh địa điểm](url)
(derived, static template string)       →  tiktok_url                  →  tiktok_url                   →  🎵 TikTok link line
Supabase reviews.rating (aggregated)    →  tappy_rating (conditional)  →  tappy_rating                 →  TappyAI rating line
```

Every field downstream of `photo_url` in this table is a **conditional spread** (`...(photoUrls[idx] ? { photo_url: photoUrls[idx] } : {})`, food.ts line 234) — if the value is falsy, the key does not exist in the object at all, not even as `null`. promptBuilder's instruction ("Neu khong co photo_url → khong them bat ky dong anh nao") depends on the LLM correctly reading field absence — there is no code-level guarantee the LLM won't hallucinate a `photo_url` it wasn't given, though the instruction does explicitly forbid fabrication.

---

# Cache Flow

Single cache layer: **in-memory `Map`** in `common.ts` (`getCache`/`setCache`), per Vercel serverless instance — not shared across instances, not Redis, not Supabase-backed.

- **Key:** `'places:' + query.toLowerCase().trim() + ':' + location.toLowerCase().trim() + ':' + type + locationBiasRoundedTo2Decimals`
- **TTL:** 30 minutes (food.ts line 348).
- **What gets cached:** the **entire** `searchPlaces()` return value, whichever branch produced it — Google success with images, Google success without images (all 3 sources failed), or OSM fallback with zero image capability. **The cache does not distinguish between these cases.**
- **Verified failure mode:** if the Google `searchText` call fails once (quota hit, timeout, transient network error) for a given query+location+type combination, the resulting OSM (imageless) response is cached for 30 minutes under that exact key. Every user issuing the same or a normalized-identical query within that window receives the cached imageless result, even if Google Places has since recovered. This directly explains **inconsistent image behavior across time** for what looks like "the same" query — the outcome depends on which request happened to be a cache miss.
- Eviction: simple FIFO once `cache.size > 300` (`common.ts` line 13-16) — deletes the oldest-inserted key (`Map` iteration order), not the least-recently-used one, and not based on the entry's own TTL.

No cache exists at the individual-place level — caching is scoped to the whole query result, so a single place's image failure inside an otherwise-successful 8-place batch is baked into the cached blob for that entire query.

---

# Every Transformation

1. **Google raw place → intermediate object** (food.ts, `placesData.map`): extracts `id`, `displayName.text`, `formattedAddress`, `rating`, `websiteUri` — straightforward field renaming, no image logic here.
2. **Per-place image resolution → `photoUrls[idx]`** (food.ts, parallel `Promise.all`): the 3-source chain described above, index-aligned with `placesData` by array position (not by `place_id` — relies on `Promise.all` preserving input order, which it does by spec, so this specific alignment is not a bug, just worth noting as a design dependency).
3. **Result assembly** (food.ts line 224-236): merges `placesData[idx]` fields with `photoUrls[idx]` via conditional spread into the final `results[]` array.
4. **Enrichment pass** (food.ts line 258-306): re-maps `results` again to attach `order_links`/`platform_links` — this creates a **new array via `.map()`**, but spreads `...place` first (line 271: `{...place, order_links: ...}`), so `photo_url` survives this transformation intact. Verified, not assumed.
5. **Rating injection pass** (food.ts line 332-341): another `.map()` over `places`, again spreading `...r` first — `photo_url` again survives.
6. **AI prose generation**: the LLM reads the final JSON tool result and, per promptBuilder's `reviewBlock` rule 5, is instructed to emit `![Ảnh địa điểm](photo_url)` verbatim on its own line, immediately after the place name, capped at 3 total images in the response. **This is the only transformation step with no code-level enforcement** — it is entirely dependent on the model following a natural-language instruction correctly, every time, across however many places are in the result.
7. **Markdown → HTML** (ChatInterface.tsx `formatMessage`, line 336-339): regex-replaces `![alt](https://...)` with a `<div><img ...></div>` block. Requires the URL to start with `http://` or `https://` and contain no whitespace or `)` — any URL violating this (none observed in the traced sources, but not exhaustively proven impossible) would fail to match and render as literal broken markdown text instead of an image.
8. **Browser render**: `dangerouslySetInnerHTML` injects the HTML; `onerror` on the `<img>` hides the whole container if the URL fails to load client-side (404, CORS, hotlink block that slipped through `isBlockedHost`'s hardcoded list).

---

# Every Possible Failure Point

| # | Location | Failure | Verified how |
|---|---|---|---|
| 1 | `food.ts:149` | `GOOGLE_PLACES_API_KEY` env var missing/unset in a given deploy target | Confirmed key exists only in `.env.production.local`/`.env.vercel.prod.tmp`, not `.env.local` — deploy-target-specific, consistent with expected setup but worth flagging as a config dependency |
| 2 | `food.ts:167-178` | `searchText` 5s timeout or non-200 (quota, auth, malformed request) | Prior support case in this repo documents live 429s with enforced 100/day limit |
| 3 | `food.ts:244` | OSM fallback triggered → **zero image fields possible, structurally** | Read full `searchPlacesOSM` body, confirmed no photo_url anywhere |
| 4 | `common.ts:58-98` | og:image: no websiteUri, non-HTML, 1.8s timeout, malformed og:image content | Read full function body |
| 5 | `food.ts:166` | Google Photos: `places.photos` deliberately excluded from field mask (New API) | Explicit code comment + field mask string |
| 6 | `food.ts:206-217` | Google Photos: legacy details call fails on quota/billing | Prior documented 429/REQUEST_DENIED errors in this project |
| 7 | `common.ts:163-190` | Serper: **name-only query, no address/city disambiguation** | Read function body, confirmed `q: placeName` with no location parameter |
| 8 | `common.ts:132-137` | Serper: logo/icon filter can still admit a logo if all 5 results look like logos | Explicit fallback-to-unfiltered-pool logic |
| 9 | `food.ts:348` | 30-min cache stores imageless (OSM or all-sources-failed) results indiscriminately | Read `setCache` call, no conditional on result quality |
| 10 | `common.ts:13-16` | Cache eviction is insertion-order FIFO, not TTL/LRU-aware — can evict a fresh, valid cached image result while an older-but-not-yet-expired imageless one survives | Read eviction logic |
| 11 | promptBuilder.ts rule 5 | 3-image cap and "no fabrication" are LLM instructions only — no code enforces them | Read full `reviewBlock` string, confirmed no corresponding code-side truncation/validation exists in `route.ts` or `food.ts` |
| 12 | ChatInterface.tsx:337 | Regex requires `https?://` with no internal whitespace/`)` — any URL violating this silently fails to render as an image | Read regex, cross-checked all 3 image source outputs (all appear to always produce compliant absolute URLs, but not proven exhaustively for every Serper CDN edge case) |
| 13 | ChatInterface.tsx:339 | Client-side `onerror` hides broken images silently — a URL that resolved fine server-side but 404s/CORS-fails at render time (e.g., a hotlink-protected host that slipped past the hardcoded `HOTLINK_BLOCKED_HOSTS` list) disappears with no user-visible error and no server-side signal | Read `onerror` handler |
| 14 | food.ts (index alignment) | `photoUrls[idx]` alignment with `placesData[idx]` depends on `Promise.all` preserving array order across async resolution | Confirmed correct by JS spec, listed as a dependency, not a bug |

---

# Root Cause Candidates

## 1. Highest probability — OSM fallback has zero image capability, and Google Places is documented to intermittently fail

**Why:** This is the only failure point that is both (a) structurally guaranteed to produce zero images for 100% of affected places, not probabilistic, and (b) confirmed to be actually triggered in production by this project's own prior investigation (documented `429 RESOURCE_EXHAUSTED` quota errors on the exact `searchText` endpoint this code calls, with an enforced limit of 100/day). Every time Google Places search fails for any reason, the entire response silently downgrades to a shape that was never designed to carry images.

**Files involved:** `src/lib/ai/tools/food.ts` (lines 149-244, 54-125)

**Evidence:** `searchPlacesOSM` return object (food.ts line 108-123) contains only `name`, `address`, `phone`, `maps_link` — grep-confirmed no `photo_url` string appears anywhere in the function. Combined with `Google_Cloud_Support_Case.md` (present in this repo) documenting live reproduction of quota exhaustion on this exact endpoint.

## 2. High probability — 30-minute cache amplifies every transient failure into a sustained one

**Why:** Even if Google Places only fails occasionally, caching that failure's output for 30 minutes under the same key any successful call would use means one bad request corrupts every identical request for up to half an hour, for every user. This turns an intermittent backend issue into a reliably reproducible "no image" report from users hitting popular/common queries during that window.

**Files involved:** `src/lib/ai/tools/food.ts` (line 348), `src/lib/ai/tools/common.ts` (lines 1-18)

**Evidence:** `setCache(cacheKey, result, 30 * 60 * 1000)` executes unconditionally after the OSM-fallback branch has already run — no check on `result.source` or presence of `photo_url` before caching.

## 3. High probability — Serper name-only search causes wrong/duplicate images for non-unique place names

**Why:** This is the most direct explanation for "wrong image" and "duplicate image" specifically (as opposed to "no image," which candidates 1-2 explain). Any place whose name collides with another business — a chain, a common Vietnamese food-stall name, a generic name like "Coffee House" — has no way to be disambiguated by this query, because the query is the name alone.

**Files involved:** `src/lib/ai/tools/common.ts` (lines 163-190, `fetchPlacePhotoByName`)

**Evidence:** `body: JSON.stringify({ q: placeName, gl: 'vn', hl: 'vi', num: 5 })` — `placeName` is the sole query term; no `address`, `location`, or city parameter is concatenated in, despite both being available in the calling scope (`food.ts` has `location` and `address` in context at the call site but does not pass them into this function).

## 4. Medium probability — LLM non-determinism at the markdown-generation step

**Why:** The 3-image cap, "don't fabricate photo_url," and "copy the value exactly" rules exist only as natural-language instructions to the model (promptBuilder.ts `reviewBlock`). LLMs following formatting instructions across a variable-length list of tool results are not deterministic — this class of failure (skipping an image that exists, emitting more than 3, subtly altering a URL character during generation) is plausible and would produce symptoms indistinguishable from a pipeline bug, but **cannot be confirmed or ruled out by reading code alone** — it requires either logging actual model outputs against actual tool results, or live testing.

**Files involved:** `src/lib/ai/promptBuilder.ts` (reviewBlock, lines 164-172), `src/app/api/chat/route.ts` (streamText call)

**Evidence:** No code path exists in `route.ts`, `food.ts`, or `ChatInterface.tsx` that counts, deduplicates, or validates image URLs against the original tool result before or after the LLM generates text. Confirmed by full read of all three files — this is an absence of evidence used as evidence of absence, appropriately caveated.

**Status: Unknown — requires further verification.** Would need production log analysis (comparing tool-call JSON to the actual streamed response text) to confirm whether this occurs and how often.

## 5. Low probability — Timeout stacking causing slow/failed resolution under load

**Why:** Per-place image resolution can sequentially attempt up to three network calls (1.8s + 2.5s + 3s + 4s worst case ≈ 11.3s) before giving up, run in parallel across up to 8 places via `Promise.all`. Under `maxDuration = 60` (route.ts line 15) and with other tool calls potentially queued in the same request (planning mode allows up to 8 `maxSteps`), this is a plausible but not verified contributor to occasional failures under specific timing/load conditions. No evidence of this actually occurring was found (no timeout-pattern logs were reviewed as part of this code-only investigation).

**Files involved:** `src/lib/ai/tools/common.ts` (timeout values across all 3 fetch functions), `src/app/api/chat/route.ts` (line 15, 154)

**Status: Unknown — requires further verification.** Would need to inspect actual `tappyai_photo_debug` log output (the code already logs `step` and timing-relevant fields at every stage) from production to confirm whether timeouts are actually being hit at meaningful frequency.

## 6. Low probability — Client-side render failure (hotlink block slipping past the filter, malformed URL)

**Why:** `isBlockedHost` in `common.ts` uses a hardcoded list of 6 host substrings. Any hotlink-protected CDN not on that list (or a Serper thumbnail from an unlisted host) would pass the filter, get embedded in markdown, and only fail at actual browser render time via the `onerror` handler — invisible server-side, so nothing in the logs would flag it as a failure. This is architecturally possible but only explains images that were resolved by the pipeline and then failed to display — not the more common "no image at all" symptom.

**Files involved:** `src/lib/ai/tools/common.ts` (lines 110-111, `HOTLINK_BLOCKED_HOSTS`), `src/components/ChatInterface.tsx` (line 339, `onerror`)

**Status: Unknown — requires further verification.** Would need real Serper response samples showing thumbnail/image hosts outside the current filter list to confirm this actually happens.

