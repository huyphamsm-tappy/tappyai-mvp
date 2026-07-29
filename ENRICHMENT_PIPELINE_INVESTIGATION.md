# ENRICHMENT_PIPELINE_INVESTIGATION.md

**Mode:** Incident investigation. Read-only. No code changed. No fixes proposed.
**Trigger:** QA reports both `photo_url` (images) and `tiktok_url` (TikTok review links) missing simultaneously after the OSM image-enrichment patch.
**Rule followed:** every claim below is either proven by a specific line of code, or explicitly marked `UNKNOWN` when it cannot be settled from code alone.

---

# 1. Pipeline Diagram

```
User message ("quán bún bò ngon Quận 1")
        │
        ▼
src/app/api/chat/route.ts :: POST()
        │  detectForcedTool(lastText) → likely 'search_places' for a place query (intent.ts:51)
        │  experimental_prepareStep forces toolChoice = search_places on step 0
        ▼
tool search_places .execute({ query, location, type })
        │
        ▼
src/lib/ai/tools/food.ts :: searchPlaces(query, location, type, lang, locationBias)
        │
        ├─ cache HIT → return cached value AS-IS (whatever shape/source it was cached with)
        │
        ├─ cache MISS → GOOGLE_PLACES_API_KEY present?
        │     │
        │     ├─ YES → POST places:searchText (5s timeout)
        │     │     ├─ SUCCESS → result = { source:'Google Maps', results:[ {..., tiktok_url, ...photo_url?} ] }
        │     │     └─ FAIL (quota/timeout/network/empty) → result stays null
        │     └─ NO KEY → result stays null
        │
        ├─ result still null → result = await searchPlacesOSM(query, location)
        │     └─ result = { source:'OpenStreetMap', results:[ {name,address,phone,maps_link,...photo_url?} ] }
        │        (patched: photo_url now attempted via fetchPlacePhotoByName + Promise.allSettled)
        │        (NOT patched, never present: tiktok_url — this field does not exist in this function's code, before or after the patch)
        │
        ├─ Serper price/order/platform-link enrichment (food.ts:251-309) — maps over `results`, spreads `...place` first
        ├─ TappyAI community rating injection (food.ts:312-346) — maps over `places`, spreads `...r` first
        ├─ setCache(cacheKey, result, 30 min)
        ▼
tool result JSON returned to the AI SDK, fed to Claude as the search_places tool output
        ▼
src/lib/ai/promptBuilder.ts :: reviewBlock (prompt instruction, not code)
        │  Rule 5: if a place object has 'photo_url' → emit ![Ảnh địa điểm](photo_url)
        │  Rule 6: if a place object has 'tiktok_url' → emit 🎵 [Xem review TikTok](tiktok_url)
        │  Neither rule is conditioned on the other, or on result.source
        ▼
Claude generates response text
        ▼
ChatInterface.tsx :: formatMessage() — regex converts ![alt](url) to <img>; tiktok is a plain markdown link, no special handling
        ▼
Final rendered chat message
```

---

# 2. Google vs OSM Comparison

| Field | Google path (`searchPlaces` success branch, food.ts:224-236) | OSM path (`searchPlacesOSM`, food.ts:108-129, post-patch) |
|---|---|---|
| `name` | ✅ from `displayName.text` | ✅ from OSM `tags.name`/`tags['name:vi']` |
| `address` | ✅ from `formattedAddress` | ✅ from OSM `addr:*` tags, or literal string `'Xem ban do'` if none exist |
| `place_id` | ✅ Google's `id` | ❌ **does not exist in OSM output — never did, patch or no patch** |
| `google_rating` | ✅ if `rating` present | ❌ **does not exist in OSM output** |
| `maps_link` | ✅ `googleMapsUri` or constructed fallback | ✅ constructed from `elat/elon` or generic search URL |
| `website_uri` | ✅ conditional, if Google returned one | ❌ **does not exist in OSM output** |
| `tiktok_url` | ✅ **unconditional static template string, always present for every place** (food.ts:232) | ❌ **does not exist anywhere in `searchPlacesOSM`'s code — confirmed by reading the full function body, both before and after this patch** |
| `photo_url` | ✅ conditional, via 3-source chain (og:image → Google Photos → Serper) | ✅ **conditional, via Serper only — this is what the recent patch added** |
| `phone` | ❌ not present in Google branch's output object | ✅ from OSM `tags.phone`/`contact:phone` |

**Critical asymmetry, proven by code:** `tiktok_url` is generated in exactly one place in the entire codebase — [food.ts:232](src/lib/ai/tools/food.ts:232), inside the Google-success branch's `.map()`. `searchPlacesOSM()` was never modified to add this field, by this patch or any prior one. **This gap is not new. It predates the image-enrichment patch entirely** — the patch touched only the `baseResults`→`results` photo-attachment block (lines 108-129), never the field set copied from `baseResults` (`name/address/phone/maps_link`), and never added anything resembling `tiktok_url`.

---

# 3. Shared Enrichment Stages

Two enrichment passes run identically regardless of which branch (`Google Maps` or `OpenStreetMap`) produced `result`:

1. **Serper price/order/platform-link enrichment** (food.ts:251-309) — triggered by `isFood`/`isSpa`/`isEntertainment` regex on the query text, not by `result.source`. Re-maps `results` via `{ ...place, order_links: ... }` or `{ ...place, platform_links: ... }` — spreads existing fields first, so any `photo_url` or `tiktok_url` already on `place` survives this step untouched. **Verified: this stage does not strip either field.**
2. **TappyAI community rating injection** (food.ts:312-346) — joins against Supabase `reviews.place_id`. Re-maps via `{ ...r, tappy_rating: ... }` — spreads first, same conclusion. **Verified: this stage does not strip either field.** (Also note: since OSM results have no `place_id` at all, `placeIds` filter at line 316 (`places.filter(r => r.place_id)`) excludes every OSM place from this join entirely — harmless to photo/tiktok specifically, but confirms OSM places never had `place_id` to begin with, consistent with the missing-fields table above.)

**Conclusion for this section:** neither shared enrichment stage is a candidate for stripping `photo_url` or `tiktok_url`. Both stages are pure additive spreads. If a field disappears, it either (a) was never added by the branch that ran (`searchPlaces` vs `searchPlacesOSM`), or (b) was dropped by something outside code — the LLM's own text generation — which is addressed in Root Cause Candidates below.

Also checked and ruled out: `applyBudgetFilter` (budget.ts:133-178) only filters `r.search_results`, `r.price_search_results`, and `r.flights` arrays — it never touches `r.results` (the actual place array carrying `photo_url`/`tiktok_url`). Confirmed by reading the full function; no reference to `.results` (only `.search_results`) exists in `budget.ts`. `applyLuxuryStreamFilter` operates on already-generated streamed text, doing a literal brand-name string replacement — it cannot remove a field that doesn't exist in the text to begin with, and does not touch tool-call JSON at all.

---

# 4. Missing Fields

Comparing OSM's actual output (post-patch) against what the Google path — and by extension, promptBuilder's expectations — provides:

| Field promptBuilder can render | Present in OSM output? |
|---|---|
| `google_rating` (reviewBlock rule 1) | ❌ Never present |
| `tappy_rating` (reviewBlock rule 2, from Supabase join) | ❌ Never present (no `place_id` to join on) |
| `photo_url` (reviewBlock rule 5) | ✅ Present when Serper resolves an image (post-patch) |
| `tiktok_url` (reviewBlock rule 6) | ❌ **Never present — not implemented in `searchPlacesOSM` at all** |
| `website_uri` (used for spa/entertainment CTA buttons) | ❌ Never present |
| `place_id` (favorites, review-join, maps_link fallback construction) | ❌ Never present |

This table shows the OSM path has **always** been a significantly reduced-fidelity fallback compared to Google — missing rating, tappy_rating, tiktok_url, website_uri, and place_id, both before and after the current patch. The patch closed exactly one gap (`photo_url`) and did not touch, and was never scoped to touch, any of the others.

---

# 5. Root Cause Candidates (ranked by confidence)

## Candidate A — OSM fallback was triggered, and `tiktok_url` was never implemented for OSM (pre-existing gap, not caused by this patch)

**Confidence: Very High** for explaining the missing TikTok link specifically.

**Evidence:** `searchPlacesOSM()`'s full body (food.ts:54-129) contains no reference to `tiktok_url`, `tiktok.com`, or any construction resembling the Google branch's static template at line 232. This is a 100%-certain, structural absence — not conditional, not probabilistic, not something that could be "sometimes present." If QA's test query triggered the OSM branch for any reason (Google quota, timeout, network, missing key), the TikTok link's absence is fully and completely explained by this alone, independent of anything the recent patch did or didn't do.

**Whether this explains the missing images too, in the same test run:** partially. The patch was specifically written to make `photo_url` available on this exact path. Whether it actually resolved to a real URL in the QA run depends on whether `fetchPlacePhotoByName` found anything via Serper for the specific place names/addresses tested — this is data- and environment-dependent and **cannot be confirmed or denied from code alone.** Marked `UNKNOWN` below.

## Candidate B — `SERPER_API_KEY` unavailable or non-functional in the QA environment

**Confidence: Medium**

**Evidence for:** `fetchPlacePhotoByName` (common.ts:163-168) returns `null` immediately if `process.env.SERPER_API_KEY` is falsy — this would silently zero out every OSM-path image, consistent with "no images returned."

**Evidence against (reason for only Medium, not High):** the same `SERPER_API_KEY` already powers `serperSearch()`, which feeds `price_search_results`/`order_search_results`/`platform_links` on **every** search_places response, Google or OSM, food/spa/entertainment — a pre-existing, presumably-already-verified-working feature. If the key were entirely absent or invalid, that breakage would be far more visible (missing prices/order links across the board, not just missing images), and QA's report does not mention that. This makes "key totally missing" less likely than a narrower failure (e.g., Serper images specifically declining to return results for these particular queries) — but neither can be confirmed or ruled out from code. **UNKNOWN — requires checking the QA environment's actual env vars and/or live response logs, which this investigation does not have access to.**

## Candidate C — OSM/Overpass itself returned no elements, so `searchPlacesOSM` exited before the patch's photo-attachment code ever ran

**Confidence: Low-Medium**

**Evidence:** [food.ts:106](src/lib/ai/tools/food.ts:106) — `if (!overpassData) return { note, google_maps_search, results: [] }` — this early return happens **before** `baseResults`/the photo-resolution block (which starts at line 108). If both configured Overpass endpoints failed or timed out, this path returns an empty `results` array with no places at all. In that scenario, there would be no images and no TikTok links, trivially — but also no place names/addresses to show, which would more likely read to a tester as "no places found" rather than "places found but missing images/TikTok links." Whether QA's test actually showed named places or an empty list **is not stated in the QA report as summarized here — UNKNOWN.**

## Candidate D — The AI (LLM) received correct tool data but did not render the `photo_url`/`tiktok_url` markdown correctly

**Confidence: Low-Medium, unverifiable from code**

**Evidence:** Both rendering rules (reviewBlock rules 5 and 6, promptBuilder.ts:170-171) are natural-language instructions to the model, with no code-level enforcement, count, or validation anywhere in `route.ts` or `ChatInterface.tsx` (confirmed by re-reading both files — no post-processing step exists that would inject or strip these markdown lines). It is architecturally possible for the model to have received a tool result containing `photo_url` and/or `tiktok_url` and simply not emitted the corresponding markdown line for either field in one specific response — this is a known, previously-flagged class of failure (LLM instruction-following non-determinism) and **cannot be confirmed or ruled out without inspecting the actual tool-call JSON and the actual generated text for this specific QA run, which is not available to this investigation.**

## Candidate E — `search_places` tool was never invoked at all for this query

**Confidence: Low**

**Evidence:** `detectForcedTool` (intent.ts:51) reliably matches `search_places` for typical place-seeking Vietnamese queries (nhà hàng, quán ăn, cafe, spa, etc.), and `experimental_prepareStep` (route.ts:158-169) forces that tool on step 0 whenever `forcedTool` is set or `locationIntent === 'offline'`. For this to be the cause, QA's exact input text would need to fall outside every one of these regex patterns, which is possible for an unusual phrasing but cannot be assessed without knowing QA's literal test input. **UNKNOWN — requires the exact QA test message.**

---

# 6. Final Conclusion

**Why are both images and TikTok review links missing at the same time?**

The only cause proven with certainty, directly from code, is: **`searchPlacesOSM()` has never generated a `tiktok_url` field, in any version of this codebase including before the recent image-enrichment patch.** If the QA test's query triggered the OSM fallback (which requires a Google Places failure — quota, timeout, missing key, or network error — none of which the recent patch touches or could have caused, since the patch's diff is entirely contained within `searchPlacesOSM`'s own body, after the point where Google's branch has already failed), the missing TikTok link is fully explained and requires no further investigation: it was never implemented for this path.

The missing images are **not explained with the same certainty.** The patch specifically added `photo_url` resolution to this exact path via the existing Serper-based `fetchPlacePhotoByName`. Whether that resolution actually produced a URL in this specific QA run depends on data the codebase alone cannot supply an answer for — whether Serper found a usable image for the specific place names/addresses tested, and whether `SERPER_API_KEY` was valid and reachable in that environment. Both are `UNKNOWN` from code and would require inspecting either the live QA environment's configuration or the actual `tappyai_photo_debug` log output from that specific test run (per the existing `serper_skip`/`serper_not_ok`/`serper_result`/`serper_error` log steps already present in `common.ts`, none of which this investigation has access to).

**Single unifying explanation supported by code, stated precisely:** both symptoms are consistent with — and most simply explained by — the OSM fallback path having been triggered for this test. That path has a pre-existing, complete absence of `tiktok_url` (fully proven), and an image-resolution step whose success is conditional on live Serper behavior that cannot be verified from source code alone (image absence is plausible but `UNKNOWN`, not proven). Candidates B through E remain possible but are either lower-confidence or entirely unverifiable without additional information not available to a code-only investigation: the exact QA input text, the QA environment's env vars, or the raw response/log output from that specific test run.
