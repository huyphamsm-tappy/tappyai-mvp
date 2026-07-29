# IMAGE_PIPELINE_VERIFICATION.md

**Scope:** Read-only verification of the image pipeline's actual execution behavior, logging, and cache dynamics. No code changed. No fixes proposed. Every claim below is tied to a specific line in the codebase; anything not directly provable from code is explicitly marked unmeasurable.

---

# Current Execution Flow

`searchPlaces()` in [food.ts:140](src/lib/ai/tools/food.ts:140) executes in this exact order:

```
1. cacheKey computed from query+location+type+locationBias  → getCache(cacheKey)
   └─ HIT → log 'cache_hit', return cached value immediately. Function exits here. (line 143-147)

2. MISS → log 'fn_entry' with hasKey (line 150)

3. if (GOOGLE_PLACES_API_KEY exists):
      try:
        POST places:searchText, raced against a 5s timeout (line 167-178)
        if resp.ok AND d.places has length > 0:
           → log 'places_textsearch_new' (line 182-186)
           → result = { source: 'Google Maps', results: [...] }   ← image resolution happens HERE
        else:
           → log 'tappyai_places_debug' with httpStatus + errorMessage (line 238)
           → result stays null
      catch (exception or timeout):
           → log 'tappyai_places_debug' with error string (line 241)
           → result stays null
   else (no key):
      → no additional log beyond fn_entry's hasKey:false
      → result stays null

4. if (result is still null):
      → result = await searchPlacesOSM(query, location)   ← NO LOGGING INSIDE THIS CALL AT ALL

5. Serper price/order enrichment (unconditional on result existing) — no image logic

6. TappyAI community rating injection — no image logic

7. setCache(cacheKey, result, 30 min) — unconditional, no branching on result.source or image presence

8. return result
```

**The fallback trigger itself (step 4) has zero dedicated logging.** There is no `console.log` call between line 243 and line 244, and `searchPlacesOSM` (lines 54-125) contains no `console.log` anywhere in its body — confirmed by reading the full function.

---

# Fallback Conditions

`searchPlacesOSM()` is invoked whenever `result` is still `null` after the Google block, which happens under exactly these conditions, all verified against the code:

| Condition | Where in code | Logged? |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` missing/empty | `if (key)` at line 152 is false, block never runs | Only indirectly — `fn_entry` logs `hasKey: false` |
| Network error / DNS failure on fetch | thrown inside the `try`, caught at line 240 | Yes — `tappyai_places_debug` with `error: String(e)` |
| Request exceeds 5s (`Promise.race` timeout) | same catch as above (`Promise.race` rejects with `Error('timeout')`) | Yes — same log, `error` string will read `"Error: timeout"` |
| Invalid/revoked API key (Google returns 401/403) | `resp.ok` is false → else branch, line 238 | Yes — `httpStatus` + `errorMessage` logged |
| Quota exceeded (429 `RESOURCE_EXHAUSTED`) | same else branch, `resp.ok` false | Yes — same log, `httpStatus: 429` and Google's error message captured |
| Malformed request (400) | same else branch | Yes — same log |
| Valid 200 response but `d.places` is empty/undefined | `d.places?.length` is falsy → else branch at 237 | Yes — logged, but `errorMessage` will be `null` since there's no error object in a valid-but-empty response; only `httpStatus: 200` distinguishes this from a real error |
| `JSON.parse`/`.json()` throws on malformed response body | caught at line 240 | Yes |

Every one of these conditions **does** produce a log line via either line 238 or line 241 — the gap is not "silent failures," it's that **none of these logs are tagged as "fallback occurred"** or carry a request-correlation ID, so reconstructing "how often did OSM get used" requires inference across separate untagged log lines (see Existing Logging, below).

---

# Existing Logging

Every log line in the image-relevant path, verbatim source and trigger condition:

| Log `type`/`step` | File:Line | Fires when |
|---|---|---|
| `tappyai_tool_called` / `cache_hit` | [food.ts:145](src/lib/ai/tools/food.ts:145) | Cache hit — function returns before any Google/OSM logic runs |
| `tappyai_tool_called` / `fn_entry` | [food.ts:150](src/lib/ai/tools/food.ts:150) | Every cache miss, before Google is attempted. Carries `hasKey` |
| `tappyai_photo_debug` / `places_textsearch_new` | [food.ts:182-186](src/lib/ai/tools/food.ts:182) | Only on Google success (200 + non-empty `places`) |
| `tappyai_places_debug` (no `step`) | [food.ts:238](src/lib/ai/tools/food.ts:238) | Google responded but not ok, or ok with empty `places` |
| `tappyai_places_debug` (no `step`) | [food.ts:241](src/lib/ai/tools/food.ts:241) | Exception/timeout during the Google call |
| `tappyai_photo_debug` / `api_skipped`, `api_result`, `api_exception` | [common.ts:28,41,49](src/lib/ai/tools/common.ts:28) | Inside `fetchPlacePhoto` (Google legacy photo endpoint) — per-place |
| `tappyai_photo_debug` / `website_image_failed` | [common.ts:95](src/lib/ai/tools/common.ts:95) | Inside `fetchOfficialWebsiteImage` on any failure — per-place |
| `tappyai_photo_debug` / `serper_skip`, `serper_not_ok`, `serper_result`, `serper_error` | [common.ts:166,179,185,188](src/lib/ai/tools/common.ts:166) | Inside `fetchPlacePhotoByName` — per-place, and `serper_result` is the only one of these that logs on the SUCCESS path too (includes `hasUri` boolean) |

**Confirmed absent:**
- No log line anywhere states "falling back to OSM" or "OSM fallback triggered."
- No log line exists inside `searchPlacesOSM` itself (entry, success, or failure of that function).
- No log line captures the final `result.source` value (`'Google Maps'` vs `'OpenStreetMap'`) after it's assembled.
- No request-correlation ID (trace ID, request ID) ties `fn_entry` to its eventual outcome log — in a concurrent production environment with multiple simultaneous chat requests, these JSON lines interleave in the raw log stream with no field to group them back into a single call.
- No log captures whether the final `photoUrls[idx]` array for a given call had 0, some, or all slots filled — i.e., no "image success rate per call" signal exists even on the success path.

---

# Cache Behaviour

Verified against [common.ts:1-18](src/lib/ai/tools/common.ts:1) and [food.ts:140-348](src/lib/ai/tools/food.ts:140):

**Does the cache store OSM fallback results?**
Yes, unconditionally. Line 348 — `setCache(cacheKey, result, 30 * 60 * 1000)` — runs regardless of whether `result.source` is `'Google Maps'` or `'OpenStreetMap'`, and regardless of whether any place in `result.results` has a `photo_url`. There is no `if` branch anywhere between the OSM fallback (line 244) and the cache write (line 348) that inspects `result.source` or image presence.

**Does it distinguish Google result vs OSM result?**
Not at the cache-key level. The `cacheKey` (line 142) is built purely from `query + location + type + locationBias`, none of which reflect the outcome. Whichever result (Google-success or OSM-fallback) is computed first for a given key occupies that cache slot for 30 minutes; the object itself does carry a `source` field internally (`'Google Maps'` or `'OpenStreetMap'`, set at line 225 and line 120 respectively), so the *data* isn't blind to its own origin — but no code reads that field to decide caching behavior, TTL, or whether to cache at all.

**Does it distinguish image-present vs no-image result?**
No. There is no field in the cache key or any conditional on `photoUrls` before the write at line 348. A Google-success result where all 8 places happen to fail all 3 image sources is cached identically (same 30-min TTL, same unconditional write) to one where every place got an image.

**Can one failed lookup poison later requests?**
Yes, directly provable: if request A for a given `(query, location, type, locationBias)` combination hits the OSM fallback (e.g., a transient Google 429), the imageless OSM result is written to `cache` under that exact key. Request B, arriving with the identical `(query, location, type, locationBias)` within the next 30 minutes, hits `getCache(cacheKey)` at line 143, gets the cached OSM result, and returns it at line 146 — **without ever attempting Google again**, even if Google's quota/network issue has already resolved by the time request B arrives.

**Eviction behavior:** [common.ts:13-16](src/lib/ai/tools/common.ts:13) — once the module-level `Map` exceeds 300 entries, the single oldest-inserted key (via `Map.keys().next().value`, i.e. insertion order, not last-access or remaining-TTL order) is deleted to make room for the new one. This means a freshly-cached, image-complete result can be evicted before its 30-minute TTL expires if 300 other distinct queries are cached first, while an older but not-yet-expired imageless result elsewhere in the map survives simply because it was inserted more recently than the evicted one. This is a real mechanism in the code, though its practical frequency depends on production query diversity, which is not measurable from code alone.

**Scope:** the cache is a plain in-memory `Map` (line 3), meaning it is local to a single Vercel serverless function instance. It does not persist across cold starts and is not shared across concurrently running instances — so the "poisoning" window in practice is bounded by both the 30-minute TTL and that specific instance's lifetime, whichever is shorter. This is a real code fact but its practical impact on aggregate user-facing failure rate cannot be quantified without Vercel's internal instance-routing data, which is outside this codebase.

---

# What Can Be Measured

Using only what currently exists in the code, from raw log inspection (e.g., manually reading Vercel's function log output for a time window):

- **Cache hit occurrences** — countable via `cache_hit` log lines.
- **Cache miss occurrences** — countable via `fn_entry` log lines.
- **Google raw success occurrences (per cache miss)** — countable via `places_textsearch_new` log lines.
- **Google raw failure occurrences, with a reason** — countable via the two `tappyai_places_debug` log lines (238 has `httpStatus`/`errorMessage`, 241 has a raw error string, including distinguishing timeout via the string `"timeout"`).
- **Approximate OSM fallback rate** — derivable ONLY by subtraction: `(count of fn_entry) − (count of places_textsearch_new)` over the same time window, since nothing directly tags the OSM path. This is an approximation, not a direct measurement, and assumes every `fn_entry` without a matching `places_textsearch_new` fell through to OSM (which is true per the code, but not verifiable per-request due to the missing correlation ID).
- **Per-place image source outcomes** — countable via the `tappyai_photo_debug` sub-steps inside `common.ts` (e.g., `serper_result` includes `hasUri: true/false`), but only for places that reached that stage (i.e., not OSM-routed places, which never call these functions at all).

All of the above require someone to actually pull raw logs from Vercel's dashboard or CLI (`vercel logs`) and manually grep/count JSON lines by `type`/`step`. **No code in this repository parses, aggregates, stores, or displays any of these log lines anywhere.** The admin analytics page ([admin/analytics/page.tsx](src/app/admin/analytics/page.tsx)) queries only `reviews`, `review_interactions`, and `profiles` tables for social/content metrics (uploads, views, hashtags, DAU, engagement rate) — it has no query, table, or code path touching `search_places`, Google/OSM outcomes, cache behavior, or image resolution at all. Confirmed by reading the full data-fetching block of that file.

---

# What Cannot Be Measured

- **Google success rate** as a persisted metric — only reconstructable by manual log archaeology over whatever retention window Vercel's raw logs offer (no log drain to Sentry/Datadog/Logtail/Axiom or similar was found anywhere in the repo — grep for all four found zero matches).
- **Google failure rate broken down by cause** (quota vs timeout vs network vs invalid key) — the raw data exists per-line in logs, but nothing aggregates it into a rate or dashboard.
- **OSM fallback frequency** — only approximable by the subtraction method above, and only if someone manually does it; not automatic, not real-time, not historical beyond log retention.
- **Cache hit rate** — same limitation; raw counts exist in logs, no aggregation.
- **Image success rate** (what fraction of places in a successful Google response actually got a `photo_url`) — **not logged at all.** The `photoUrls` array is computed (food.ts line 194-222) and used to build `results`, but its fill-rate (how many of the N places got a non-null image) is never logged, counted, or exposed anywhere.
- **Correlation between a single user-facing chat response and which pipeline path served it** — no request/trace ID links `fn_entry` → outcome → final `result.source` → what the LLM actually rendered. Even with perfect log aggregation, reconstructing "this specific user's broken image was caused by X" is not possible with the current logging shape; only aggregate rates would be derivable, and only if aggregation tooling were added.

---

# Updated Root Cause Ranking

## 1. OSM fallback structurally cannot produce images — **Confidence: Very High**

The mechanism is not probabilistic — it is a direct, unconditional consequence of reading `searchPlacesOSM()`'s full return shape (lines 108-123), which contains no `photo_url` field or any call to the three image-resolution functions. Every single time this path is taken, 100% of returned places have zero possibility of an image, by construction, not by chance. This project's own prior investigation (the `Google_Cloud_Support_Case.md` still present in the repo) independently documented live, reproduced `429 RESOURCE_EXHAUSTED` responses from the exact `searchText` endpoint this code calls, with an enforced 100/day limit — meaning the trigger condition for this path is not hypothetical, it has already been observed occurring in this project. What remains genuinely unmeasured is *frequency* in current production traffic (see What Cannot Be Measured) — but the causal mechanism itself, and evidence that its trigger condition has occurred at least once, are both fully proven.

## 2. Cache amplification of the OSM/failure state — **Confidence: Very High (as a mechanism), but strictly dependent on #1**

Proven directly by code: no conditional exists between the OSM fallback and the unconditional `setCache` call. This does not independently cause image loss — it requires a Google failure (→ #1) to first occur — but it converts a single transient failure into a sustained, repeatable one for up to 30 minutes for every user issuing an identical query, on the same serverless instance. This is a force-multiplier on #1, not a separate root cause.

## 3. Serper name-only image search (wrong/duplicate images for non-unique names) — **Confidence: High**

Structurally confirmed: `fetchPlacePhotoByName` (common.ts line 163) queries Serper with `q: placeName` alone — no address or location parameter, despite both being available in the calling scope at `food.ts`. This is a permanent design property of the function, not an intermittent failure, so it deterministically produces ambiguous results for any chain or common business name. This explains "wrong image" and "duplicate image" specifically — a distinct symptom category from "no image," which #1/#2 explain.

## 4. LLM non-determinism in the 3-image-cap/no-fabrication instruction — **Confidence: Low-Medium, unverifiable from code**

Unchanged from the prior investigation: no code enforces the cap, dedup, or URL fidelity — it is 100% dependent on the model correctly following a natural-language instruction across a variable number of tool results, every time. This remains genuinely unknown without production log analysis comparing tool-call JSON to actual streamed text, which is outside what this codebase can answer on its own.

## 5. Timeout stacking under concurrent/planning-mode load — **Confidence: Low**

The mechanism exists (timeouts of 1.8s/2.5s/3s/4s can stack sequentially per place, up to 8 places in parallel, within a 60s route-level `maxDuration`), but no log line or evidence was found confirming this is actually hit at meaningful frequency in production. Downgraded from "possible" to "low confidence" specifically because nothing in the logging (per Existing Logging, above) would even surface this pattern if it were happening — it's unmeasurable in both directions.

## 6. Client-side render failures from hotlink hosts slipping past the filter — **Confidence: Low**

Mechanism exists (`HOTLINK_BLOCKED_HOSTS` is a hardcoded 6-entry list; anything outside it passes through), but no evidence was found — and none was sought, since this requires actual Serper response samples, not code reading — that this occurs at any meaningful rate. Unchanged from prior investigation.

---

# Final Conclusion

**Which issue should be fixed first to maximize the probability of solving missing/wrong images?**

The OSM fallback's structural inability to produce any image (`root cause #1`). This is the only candidate that is simultaneously: (a) fully deterministic — not a probability, a guarantee, every time it triggers — (b) independently confirmed to have its trigger condition (Google Places quota/auth/network failure) actually occur in this project's own documented production history, and (c) the sole explanation for total image absence across an entire response, as opposed to per-place gaps.

The cache amplification issue (`root cause #2`) is real and severe, but it is a multiplier on #1, not an independent cause — it has nothing to amplify without a Google failure occurring first. Fixing the cache behavior alone, without addressing OSM's image-void, would only shrink the blast radius of each failure back down from "every identical query for 30 minutes" to "one query" — it would not restore images to any of the affected responses, since OSM still cannot produce them.

The Serper name-collision issue (`root cause #3`) is a separate, equally real mechanism, but it explains a different symptom (wrong/duplicate image, not missing image) and does not compound with #1/#2 the way #2 compounds with #1.

Given the stated goal is "missing/wrong images" as a combined symptom set, and given that "missing" is the more structurally severe failure (total loss vs. a mismatched-but-present image), the highest-leverage single fix target — based strictly on what the code proves, not on measured frequency, since frequency is currently unmeasurable per the sections above — is the OSM fallback path's complete lack of image resolution capability.
