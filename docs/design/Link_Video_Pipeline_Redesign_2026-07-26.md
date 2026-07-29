# Link Video Pipeline — Redesign

**Status:** DESIGN / PROPOSAL — awaiting owner approval. No code changed.
**Date:** 2026-07-26 · **Baseline:** production `79d05f3`
**Author scope:** design + platform investigation per owner's 6 requirements. Implementation
is a separate, approved step.

The three project principles apply in order: **Cost → Security → Stability.** No optimization
may sacrifice stability; "never a blank cell" is a stability guarantee, not a nice-to-have.

---

## 1. Current pipeline (evidence-based) and why it fails

**Ingest (client, on paste):** `detectSource()` recognizes only youtube/tiktok/facebook
([`reviews/new/page.tsx:35`](../../src/app/reviews/new/page.tsx)). **Instagram is not supported
at all.**

**Metadata resolution (client-time):**
- YouTube → deterministic `i.ytimg.com/vi/<id>/maxresdefault.jpg` (⚠ `maxresdefault` 404s for
  many videos incl. Shorts) ([`:466`](../../src/app/reviews/new/page.tsx)).
- TikTok → `/api/explore/oembed` (official oEmbed) — returns `thumbnail_url` or **null**.
- Facebook → `/api/explore/oembed` **OG-image scrape** — "may fail if page requires login"
  ([`oembed/route.ts:89`](../../src/app/api/explore/oembed/route.ts)).

**Storage (submit):** `payload.thumbnail = urlMeta?.thumbnail_url || ''`
([`reviews/new/page.tsx:554`](../../src/app/reviews/new/page.tsx)). Columns used:
`content_type='video'`, `source_type`, `source_url`, `media_url=source_url`, `thumbnail`.
`source_type` CHECK = `('upload','youtube','tiktok','facebook')`
([`add_explore_upgrade.sql:17`](../../supabase/migrations/add_explore_upgrade.sql)).

**Render:**
- Profile grid: `thumb = photos[0] || (video ? thumbnail : null)`; if falsy → shows `body`; if
  body also empty → **blank gray tile** ([`ProfileTab.tsx:428-434`](../../src/app/reviews/ProfileTab.tsx)).
- Feed/Explore + detail: `VideoPlayer`. YouTube = iframe hardcoded `mute=1` (no unmute path);
  TikTok/FB = thumbnail + external link, **no inline playback**
  ([`VideoPlayer.tsx:309,331`](../../src/components/explore/VideoPlayer.tsx)).

### Root failures
1. **Thumbnail can be empty and nothing guarantees a poster** → blank profile/Explore tiles.
2. **YouTube is permanently muted** — the feed's tap-to-unmute controls only the native
   `<video>`, never the iframe.
3. **TikTok/FB never play inline.** Instagram unsupported.
4. **Metadata is resolved once, client-side, at paste** — TikTok/IG CDN thumbnails **expire**,
   so a post that looked fine at creation goes blank later.

---

## 2. Platform capability matrix (official policy, knowledge cutoff 2026-05)

| Platform | Metadata w/o our own app-token | Thumbnail reliability | Muted-autoplay in feed | Programmatic unmute | True inline playback |
|---|---|---|---|---|---|
| **YouTube** | ✅ public oEmbed | ✅ **deterministic** (`hqdefault.jpg` always exists) | ✅ | ✅ **IFrame Player API** (`unMute()` on gesture) | ✅ full |
| **TikTok** | ✅ public oEmbed | ⚠️ oEmbed URL (can expire) | ❌ | ❌ | ⚠️ official embed (`/embed/v2/<id>`), **TikTok-controlled, tap-to-play** |
| **Facebook** | ❌ needs FB **App token** (current OG-scrape is best-effort) | ⚠️ unreliable | ⚠️ restricted | ❌ | ✅ `plugins/video.php` iframe (**public videos only**) |
| **Instagram** | ❌ needs FB/IG **App token** (`instagram_oembed`) | ⚠️ unreliable (login-wall) | ❌ | ❌ | ⚠️ `/p|reel/<id>/embed` iframe, **IG-controlled, tap-to-play** |

**The single architectural fact that drives everything:** only **YouTube** fits the app's
silent-autoplay-then-tap-unmute feed model. TikTok, Facebook and Instagram **cannot be
autoplayed with programmatic audio control** — their audio lives inside the platform's own
player. So the pipeline must be **two-tier**, not one-size-fits-all.

---

## 3. Redesigned pipeline

### 3.1 Two playback tiers

- **Tier A — YouTube (first-class inline):** autoplay muted in feed via the **IFrame Player
  API**; a tap unmutes through `player.unMute()` on the user gesture, mirroring native clip
  behavior. Same tap-to-unlock audio session the feed already uses for `<video>`.
- **Tier B — TikTok / Facebook / Instagram (poster + on-demand embed):** in the feed and grid
  they render a **poster tile with a platform badge + play affordance** (never autoplay, never
  silent-video). Tapping opens the platform's **official embed** inline (TikTok `/embed/v2`,
  FB `plugins/video.php`, IG `/embed`) where the platform's own player owns audio — or an
  external-link fallback when the embed is unavailable (private/removed).

This is honest to each platform's policy: we do not fake sound we can't control, and we don't
leave a dead thumbnail.

### 3.2 Metadata resolution — server-side, at submit, with a fallback chain

Move resolution off the client and off paste-time. A single server resolver
(`POST /api/reviews/link/resolve`, or folded into `POST /api/reviews`) returns a **normalized
link descriptor**:

```
LinkMeta = {
  platform: 'youtube'|'tiktok'|'facebook'|'instagram',
  externalId: string,          // parsed video/post id
  embedUrl: string,            // the official inline-embed URL (tier decides usage)
  canPlayInline: boolean,      // false → external link only
  title?: string,
  author?: string,
  posterUrl: string,           // GUARANTEED non-empty (see 3.3)
  posterSource: 'provider'|'cached'|'generated'
}
```

**Fallback chain for `posterUrl` (the never-blank guarantee):**
1. Provider thumbnail — YouTube `hqdefault` (deterministic), or oEmbed `thumbnail_url`.
2. If a provider URL exists but is an **expiring CDN URL** (TikTok/IG), **copy it into our own
   Vercel Blob** at submit so it never rots. `[COST]` small storage, big reliability win;
   also removes hotlink/referrer leakage `[SEC]`.
3. If no provider thumbnail at all → **server-generated branded poster**: platform logo + title
   + author + play badge, rendered deterministically. Never an empty string.

`posterUrl` is therefore **always** a valid image. The DB `thumbnail` column is never stored
empty for a link post.

### 3.3 The never-blank guarantee (requirements #3 and #4)

Two layers of defense so a blank tile is structurally impossible:

1. **Data layer:** `thumbnail` is never persisted empty (3.2 chain). A migration backfills
   existing empty-thumbnail link posts with the generated/derived poster.
2. **Render layer:** a single shared `<LinkPoster>` component — used by the profile grid,
   Explore feed, and detail hero — that, given `{source_type, source_url, thumbnail, title,
   author}`, **always renders a non-empty tile**: image if present, else the branded
   platform-card fallback, always with a play badge for video. The current
   `thumb ? <Image/> : <body text>` branch is replaced so "no thumbnail" can no longer produce
   emptiness.

Centralizing in one component also fixes Explore (#4) and the detail page in the same change,
and neutralizes the latent duplicate-surface defects (`/profile/posts`, search results —
`12_Open_Items.md` B18).

### 3.4 Storage contract changes

- **`source_type` CHECK** → add `'instagram'` (drop + re-add constraint; migration ordered
  after `add_explore_upgrade.sql`).
- **Add `link_meta jsonb` (nullable)** on `reviews` for `{externalId, embedUrl, canPlayInline,
  author, posterSource, resolvedAt}` — mirrors the `partner_deals.metadata` pattern; keeps the
  render layer from re-parsing URLs. `thumbnail` stays the poster (backward-compatible).
- **Backfill migration:** for existing youtube posts recompute `hqdefault`; for empty-thumbnail
  tiktok/fb posts, generate the branded poster.

### 3.5 Ingest changes

- `detectSource()` gains Instagram (`instagram.com/(p|reel|reels)/…`).
- Paste-time only does light validation + shows a resolving state; **the authoritative resolve
  happens server-side at submit**, so the stored poster can't be a client-time expiring URL.
- SSRF guard (`isSafeHttpsUrl` + host allowlist) is retained and extended to IG hosts `[SEC]`.

---

## 4. Per-platform: what works, what doesn't, best UX (requirement #6)

### YouTube — ✅ full support
- **Works:** deterministic poster; inline autoplay-muted in feed; **tap-to-unmute via IFrame
  API**; correct in grid/Explore/detail.
- **Doesn't:** nothing material. (`maxresdefault` 404 is fixed by using `hqdefault`.)
- **Best UX:** treat exactly like a native clip — muted autoplay, tap for sound. First-class.

### TikTok — ⚠️ poster + tap-to-open embed
- **Works:** public oEmbed poster + title + author; official `/embed/v2/<id>` iframe plays
  inline on tap.
- **Doesn't:** no silent-autoplay in the feed; **no programmatic sound control** (TikTok's
  player owns audio); oEmbed thumbnail can expire (fixed by caching to Blob).
- **Best UX:** poster tile + TikTok badge + play button in feed/grid → tap opens the TikTok
  embed inline (its own controls, its own sound) with an "Open in TikTok" fallback.

### Facebook — ⚠️ poster + iframe (public only), metadata needs a token for reliability
- **Works:** `plugins/video.php` iframe embeds **public** videos inline without an app token.
- **Doesn't:** metadata/thumbnail is unreliable without a **FB App token** (current OG-scrape
  fails on login-walled pages); private videos can't embed; no programmatic sound.
- **Best UX:** if resolvable → poster + FB badge → tap plays the `plugins/video.php` iframe; if
  not → branded poster + "Open in Facebook". **Owner decision:** provision a FB App
  token to make metadata reliable, or accept best-effort + generated poster.

### Instagram — ⚠️ new; poster + tap-to-open embed, metadata needs a token
- **Works:** `/p|reel/<id>/embed` iframe plays inline on tap.
- **Doesn't:** `instagram_oembed` metadata requires a **FB/IG App token**; OG-scrape is
  aggressively login-walled; no autoplay, no programmatic sound.
- **Best UX:** same Tier-B pattern as TikTok. **Owner decision:** same token question as FB;
  without a token Instagram still works via the generated poster + embed-on-tap, just with
  weaker auto-metadata.

---

## 5. Requirement coverage

| # | Owner requirement | How the design meets it |
|---|---|---|
| 1 | Paste links from all supported platforms | `detectSource` + resolver extended to YouTube/TikTok/Facebook/**Instagram** (§3.5, schema §3.4) |
| 2 | Full metadata + thumbnail, else fallback | Server-side resolver with a 3-step poster fallback chain, thumbnails cached to Blob (§3.2) |
| 3 | Profile never blank | Data-layer (never store empty) + render-layer (`<LinkPoster>` always non-empty) double guarantee (§3.3) |
| 4 | Explore displays correctly | Same shared `<LinkPoster>` + two-tier playback used by feed, grid, detail (§3.1, §3.3) |
| 5 | Inline playback + audio per official policy | Capability matrix (§2) + two-tier model (§3.1); YouTube programmatic unmute, others platform-controlled |
| 6 | Report possible / not-possible / best UX | §2 matrix + §4 per-platform |

---

## 6. What is genuinely NOT possible (be honest)

- **Silent-autoplay-then-unmute feed behavior for TikTok / Facebook / Instagram.** Their embeds
  do not expose programmatic audio; this is a platform policy limit, not our code. → Tier B.
- **Reliable Facebook/Instagram auto-metadata without an App token.** oEmbed for both requires a
  FB app token; unauthenticated scraping is login-walled. → owner provisions a token, or we
  accept generated posters.
- **Guaranteed inline playback for private/removed videos on any platform.** → external-link
  fallback (never a dead tile).

---

## 7. Cost / Security / Stability review

- **Cost:** oEmbed is free; YouTube posters are zero-cost deterministic. Caching TikTok/IG
  posters to Blob is small storage that prevents repeated fetches and broken images. No new
  paid-API dependency. `[COST]`
- **Security:** keep `isSafeHttpsUrl` + host allowlist; extend to IG. Any FB/IG token is a
  server-only secret. Embeds use only the official iframe endpoints keyed by parsed external id
  — never arbitrary user-supplied HTML. `[SEC]`
- **Stability:** the never-blank guarantee and external-link fallbacks are defensive by
  construction; a resolver failure degrades to a generated poster, never to emptiness. `[STAB]`

---

## 8. Proposed implementation phases (for approval — not started)

1. **Schema + resolver:** add `instagram` to the enum, add `link_meta`, build the server-side
   resolver + poster-fallback chain + Blob caching. Backfill migration for existing posts.
2. **Render unification:** the shared `<LinkPoster>` (grid/Explore/detail) — closes the
   never-blank guarantee and fixes `/profile/posts` + search in one place.
3. **YouTube Tier A:** IFrame Player API with tap-to-unmute integrated into the feed audio
   session.
4. **Tier B embeds:** TikTok `/embed/v2`, FB `plugins/video.php`, IG `/embed` on tap, with
   external-link fallback.
5. **Verification:** live test each platform (public + private/removed), profile + Explore +
   detail, on mobile Safari + Chrome; add regression tests for the resolver + poster fallback.

---

## 9. Decisions needed from owner before implementation

1. **Provision a Facebook/Instagram App token** for reliable metadata? (Yes → best FB/IG
   metadata; No → generated-poster fallback, still functional.)
2. **Cache external thumbnails into our own Blob storage?** (Recommended for reliability; small
   storage cost.)
3. **Instagram scope now or later?** (Design supports it; it adds one enum value + host
   allowlist + embed branch.)
4. **Confirm the two-tier model** (YouTube autoplay-with-sound; TikTok/FB/IG poster→tap→embed)
   as the accepted UX, given the platform limits in §6.

**Live verification of the FB/IG token requirement and the TikTok/IG embed behavior is
recommended during Phase 1** before committing to the token decision — the policies above are
from official documentation and should be confirmed against live endpoints at build time.
