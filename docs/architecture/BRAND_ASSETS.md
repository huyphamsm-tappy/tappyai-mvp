# TappyAI — Partner Brand Assets & BrandLogo Pattern

> **Status:** Active · **Date:** 2026-07-31 · **Scope:** Web (implemented), Android & iOS (normative for any future native Deals surface)
> **Web implementation (reference):** `src/config/brandRegistry.ts` (data — platform-independent) · `src/components/ui/BrandLogo.tsx` (pure renderer) · `public/brands/` (assets) · `src/config/brandRegistry.validation.test.ts` (validator) · `src/app/deals/DealsView.tsx` (consumer)
> Per parity governance (`docs/ios/13_PARITY_GOVERNANCE.md` §1), the Web implementation is the spec — a native Deals page reuses THIS architecture, not a reinvention.

## 1. Asset organization

- **One folder:** `public/brands/` (native: the platform's bundled-asset equivalent — Android `res/drawable`/asset dir, iOS asset catalog — mirroring the same kebab-case names).
- **One file per partner**, kebab-case id: `shopee.svg`, `shopeefood.png`, `tiktok-shop.png`, `grab.svg`, `be.svg`, `agoda.svg`, `booking.svg`. Remote CDN URLs are also valid `logo` values (§5).
- **SVG preferred; PNG only when the brand publishes no public vector** (source ≥200px so it stays crisp at 2–3× DPR in a 48px tile). Never inline logo markup in components.
- Variant choices are deliberate and recorded in each entry's `source` field: Shopee = official *vertical* lockup (fits a square tile), Booking.com = official "B." icon (wordmark illegible at 48px), TikTok Shop = official white lockup (brand standard) on a dark tile.

## 2. Registry schema (platform-independent — mirror this exactly on Android/iOS)

Single source of truth: `BRAND_REGISTRY` in `src/config/brandRegistry.ts` — pure data + pure functions, no React/Next imports, so the schema ports 1:1 to Kotlin/Swift.

| Field | Type | Meaning |
|---|---|---|
| `id` | string (kebab-case, = registry key) | Stable identifier. Duplicate ids are structurally impossible (validated). |
| `displayName` | string | Exact display/alt name ("Booking.com", "TikTok Shop"). |
| `aliases` | string[] | Extra admin spellings; id + displayName always resolve without listing them. |
| `logo` | string | Local `/brands/<id>.<ext>` **or** full `https://` CDN URL — renderers treat both identically. |
| `background` | `'light' \| 'dark'` | Tile background the OFFICIAL mark is designed for. `dark` = the lockup is light/white by brand standard (TikTok Shop); the tile supplies the background, the mark is never recolored. |
| `scale` | number (0.8–1.15) | **Optical** size correction on the renderer's inner box. Judged by eye on screenshots, never computed; pixels never stretched. |
| `category` | `'shopping' \| 'food-delivery' \| 'transport' \| 'travel'` | Partner grouping. |
| `officialWebsite` | https URL | The brand's canonical site. |
| `assetType` | `'svg' \| 'png'` | Must match the logo file extension (validated). |
| `source` | string | Provenance of the exact asset file — licensing traceability (§4). Mandatory. |
| `approvedSince` | ISO date | When the Owner approved this partner for Deals. An entry does **not** approve a partner (V1 platform policy, promptBuilder rule 18). |

**Resolution contract (identical on every platform):** normalize free-text partner names by stripping diacritics + punctuation and lowercasing ("TikTok Shop" → `tiktokshop`), then look up in an index built once from ids + displayNames + aliases. Unknown names resolve to `null` — callers keep their own fallback (§3). Strict `BrandId` types are derived from the registry (`keyof typeof BRAND_REGISTRY` on Web; enum/sealed types on native) — no hand-written string literals.

**Rendering contract (any platform):** fixed square tile (no layout shift) → inner box = 72% of tile × `scale` (clamped ≤1.15) → logo fitted with aspect ratio preserved (`object-contain` semantics), centered, transparent background, never stretched or cropped; lazy/async loading; descriptive alt/`contentDescription` ("<displayName> logo") with a decorative escape hatch when adjacent text already names the partner. The renderer holds **zero** brand knowledge — `BrandLogo` is a pure function of a resolved `BrandDefinition`.

## 3. Fallback priority (identical on every platform)

```
1. BRAND_REGISTRY entry           → official curated logo (always wins for known partners)
2. deal.logoImage from the API    → per-deal image an admin attached
3. partner-initial letter tile    → last resort for partners not yet in the registry
```

The API (`GET /api/deals`) is unchanged — `logoImage` stays in the contract; the registry simply outranks it client-side for known partners. A native client consuming the same API applies the same 1→2→3 chain. Unknown brands are a **graceful** state, never an error.

## 4. Logo licensing considerations

- **Official, publicly available artwork only** — the brand's press/brand-resource page, the brand's own served site assets, or Wikimedia Commons brand files. The exact provenance of every asset is recorded in its entry's `source` field (enforced non-empty by the validator).
- **Never redraw, trace, or recolor a mark; never alter proportions.** The only permitted adjustments are uniform scaling and the tile behind it.
- Usage context is **nominative**: identifying the partner a deal links to. Logos must not imply endorsement beyond the partnership, and the Deals page's existing commercial-nature disclosure stays.
- V1 platform policy gates which partners may appear at all (promptBuilder rule 18 — e.g. Amazon/eBay are not approved V1 platforms). `approvedSince` records the Owner's approval date; a registry entry alone approves nothing.
- If a partner rebrands, replace the asset file (same name — see cache note §7) and update `source`; all platforms pick it up with no code change.

## 5. Future Admin CMS path (no BrandLogo change required)

`logo` accepts a **full `https://` CDN URL** today — the renderer does not distinguish local from remote. The upgrade path when partner management moves to the Back Office:

1. Admin uploads a logo through the Back Office → stored in blob storage (same Vercel Blob pipeline the app already uses for media) → gets a CDN URL.
2. A `brand_partners` table (or config endpoint) serves rows in **exactly this registry schema**; the client merges them over the shipped registry (DB row wins by `id`).
3. `BrandLogo` and the resolution/rendering contracts are untouched — only the registry's *data source* changes from module constant to fetched config.

Until that exists, the registry is code-shipped and changes go through PR + validator + Owner approval — which is also the licensing review gate (§4).

## 6. Asset validation (CI-enforced)

`npm run validate:brands` → `src/config/brandRegistry.validation.test.ts` (also part of `npm test`, and a dedicated job in `.github/workflows/architecture-guard.yml` — **CI fails on any error**). Invariants:

- no duplicated ids (id must equal its registry key; keys are unique by construction)
- no duplicate resolution keys across ids, displayNames, and aliases (would make resolution order-dependent)
- local logo paths must live under `/brands/` with no traversal; remote must be `https://`
- only supported extensions (`svg`, `png`), and the extension must match `assetType`
- every local asset file exists and is non-empty
- `scale` within the renderer's optical band (0.8–1.15)
- provenance/governance fields filled (`source`, `officialWebsite` https, `approvedSince` ISO date)

## 7. Cache strategy

- **Serving today (Vercel, `public/` static assets):** served with an `ETag`; clients revalidate and get cheap `304 Not Modified` responses. Correctness-first: a **rebrand replaces the file under the same name** and every client picks it up on next revalidation — no stale-logo risk, no code change. This applies equally to SVG (`image/svg+xml`) and PNG (`image/png`).
- **Why NOT `immutable` yet:** long-term `Cache-Control: public, max-age=31536000, immutable` requires content-addressed filenames (`shopee.<hash>.svg`); with stable-by-brand names it would freeze a rebrand into caches for a year. If asset traffic ever warrants it, adopt hashed filenames via the registry (`logo` already carries the full path, so only the registry entry changes) **plus** a `headers()` rule for `/brands/:path*` in `next.config.mjs` — in that order, never `immutable` on stable names.
- **CDN-hosted logos (§5)** follow the CDN's own policy; Vercel Blob URLs are content-addressed and therefore safe for long-term caching by construction.
- **In-app:** logos are plain `<img>` (browser HTTP cache; no service worker in this app). Native ports use their standard image caches (Coil/Kingfisher) keyed by URL — which is exactly why a rebrand should keep the same URL only when served with revalidation, or change the URL when using content-addressed storage.

## 8. Audit record (2026-07-31, branch `feat/deals-brand-logos`)

All 7 partners verified on a production build + Vercel Preview: correct current-brand artwork · no cropping/stretching · centered · crisp at DPR ≥2 · dark-mode legible (no vanishing marks, no halos) · 320/375/390/430px = zero overflow, zero clipping, uniform 48×48 tiles · CLS 0 · Lighthouse accessibility 89 = **identical to production baseline** (both failing audits — `color-contrast`, `meta-viewport` — pre-exist this feature) · `image-alt` audit passing · all 7 cards keyboard-focusable · optical balance re-tuned by screenshot (Be/Booking 0.92, Grab 1.05, Agoda 1.1).
