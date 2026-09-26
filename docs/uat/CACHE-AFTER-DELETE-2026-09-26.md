# Does a deleted file stop being served? — measured 2026-09-26

Owner-approved probe on a temporary public bucket `gs://tappyai-media-cachetest` (project
`aerobic-lock-498409-u7`; `allUsers` = `legacyObjectReader` only; anonymous LIST → 403/401; two
synthetic 8-byte objects). Bucket deleted afterwards → 404. `tappyai-media-prod` not touched.
Evidence: `docs/uat/evidence/cache-after-delete-2026-09-26/` (`probe.mjs`, `probe.log`, `timeline.txt`,
`summary.txt`, `bucket-lifecycle.log`).

## What was done
1. Upload `s300` (`Cache-Control: public, max-age=300`) and `s86400` (`public, max-age=86400`).
2. Fetch each public URL 8× over ~25 s from this host (Node `fetch` keeps no cache of its own).
   Every response 200 with an `Age` header climbing 0 → 22 s: served from Google's shared edge cache.
3. Conditional GET with the ETag → **304** for both.
4. Delete both objects at 03:04:01Z. Then every 30 s for 35 minutes: the plain URL, and a cache-busted
   URL (`?cb=<timestamp>`) that cannot be in any cache.

## Results (measured)

| object | after deletion — plain URL | cache-busted URL |
|---|---|---|
| `s300` (max-age 5 min) | 200 on 4 of 68 polls, **last at +257 s (Age 289 s)**; 404 from then on | 404 every time |
| `s86400` (max-age 1 day) | **200 on 46 of 68 polls, still at the end (+2028 s, Age 2059 s and climbing)** | 404 every time |

The 200s alternate with 404s: some Google edge nodes held the copy and some did not. The `Age` values
continue the warm-phase clock, i.e. the same cached copy kept being served.

## Answers
1. **Does a deleted object keep serving for the full max-age?** Yes — measured for 5 minutes (served
   until its cached age reached the max-age, never after). For one day: **derived, not measured** from
   the same mechanism, the 35-minute evidence (still serving, Age still climbing) and the GCS docs
   ("caches respect `max-age`; stale objects are not served"): a deleted clip can stay reachable through
   its old URL for **up to one day** (new uploads, `1318b95`) or **up to one year** (clips uploaded
   before, stamped `max-age=31536000`) — at any edge that fetched it recently.
2. **Edge cache or only clients that already fetched it?** **Google's own shared edge cache.** The
   prober had no client cache, the origin was already 404 (cache-busted requests), and the old URL
   still answered 200. Anyone who has the URL can get the deleted file from such an edge, not only
   people who watched it before. (Viewers' browsers/apps add their own copies on top, same max-age.)
3. **Can we force it to stop?** **Not with GCS's built-in caching** — its docs list cache invalidation
   as unsupported; Cloud CDN supports it. Object versioning, re-uploading clean bytes to the same key,
   or rewriting the object's `Cache-Control` do not evict a copy an edge already holds. The options:
   - **`Cache-Control: private, max-age=86400`** for new clips: shared caches (Google's edge) may not
     store it at all; only the viewer's own device does. Deletion then takes effect at our side at once;
     device copies still live ≤ 1 day. Cost: every first view per device goes to GCS (no edge hit) —
     somewhat higher latency for viewers far from asia-southeast1; egress billing is per byte served
     either way (whether edge hits are billed differently: not verified).
   - **Shorter `public` max-age** (e.g. 1 h): bounds the window to that, more re-downloads.
   - **Cloud CDN in front** (load balancer + backend bucket): real invalidation; ~$18/month minimum plus
     CDN egress; infrastructure work (the post-launch "private serving" item).
   - **Waiting out the TTL** — the only option for copies already cached under the old 1-year header.

## What the 1-day change does to bandwidth and playback
- **Playback:** nothing changes within a day; the bytes are identical and `immutable` still tells the
  browser not to revalidate during that day.
- **Bandwidth:** after a day a browser must re-check. A conditional GET costs a 304 with no body
  (measured above). A `<video>` element may instead re-download the file (the reason one year was chosen:
  a 43.6 MB clip was measured re-downloaded after its old 1-hour expiry). Worst case: one extra full
  download per viewer per clip per day they come back to it — against one per hour under GCS's default header (before the one-year fix) and
  one per year after it. Most clips are watched once, so the realistic increase is small.

## Consequence for /delete-account
A deleted clip **can** remain reachable for up to 24 hours (new uploads) and we cannot force it sooner
with the current setup — the copy must say so (draft updated). For clips uploaded before `1318b95`:
up to a year, unless the owner chooses `private` caching or Cloud CDN. Decision needed before the copy
is published.
