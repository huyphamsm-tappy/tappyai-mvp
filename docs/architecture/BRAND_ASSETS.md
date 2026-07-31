# TappyAI — Partner Brand Assets & BrandLogo Pattern

> **Status:** Active · **Date:** 2026-07-31 · **Scope:** Web (implemented), Android & iOS (normative for any future native Deals surface)
> **Web implementation (reference):** `src/components/ui/BrandLogo.tsx` + `public/brands/` + `src/app/deals/DealsView.tsx`
> Per parity governance (`docs/ios/13_PARITY_GOVERNANCE.md` §1), the Web implementation is the spec — a native Deals page reuses THIS architecture, not a reinvention.

## 1. Asset organization

- **One folder:** `public/brands/` (native: the platform's bundled-asset equivalent — Android `res/drawable`/asset dir, iOS asset catalog — mirroring the same kebab-case names).
- **One file per partner**, kebab-case key: `shopee.svg`, `shopeefood.png`, `tiktok-shop.png`, `grab.svg`, `be.svg`, `agoda.svg`, `booking.svg`.
- **SVG preferred; PNG only when the brand publishes no public vector** (source ≥200px so it stays crisp at 2–3× DPR in a 48px tile). Never inline logo markup in components.
- Variant choices are deliberate and recorded: Shopee = official *vertical* lockup (fits a square tile), Booking.com = official "B." icon (wordmark illegible at 48px), TikTok Shop = official white lockup (brand standard) on a dark tile.

## 2. Registry pattern (single source of truth)

One `PARTNERS` record — an entry is `{ name, logo, tile?, scale?, aliases? }`:

- `name` — display/alt name ("Booking.com").
- `logo` — asset path.
- `tile` — `'light'` (default shared neutral tile) or `'dark'` for lockups designed for dark backgrounds (TikTok Shop). The tile supplies the background the official mark requires; the mark itself is never recolored.
- `scale` — **optical** size correction (multiplier on the inner logo box, clamped ≤1.15). Solid square marks read heavier than wordmarks at equal pixel size → they get `<1`; airy wordmarks get slightly `>1`. Normalize how big a logo *looks*, never stretch pixels.
- `aliases` — extra admin spellings.

Resolution is a **normalized-name lookup** (strip diacritics + punctuation, lowercase: "TikTok Shop" → `tiktokshop`) built once from keys + names + aliases. **No switch statements, no per-brand components.** Adding a partner = one asset file + one entry. Native ports implement the same registry shape and the same normalization.

Rendering contract (any platform): fixed square tile (no layout shift) → inner box = 72% of tile × `scale` → logo fitted with aspect ratio preserved (`object-contain` semantics), centered, transparent background, never stretched or cropped; lazy/async loading; descriptive alt/`contentDescription` ("<Name> logo") with a decorative escape hatch when adjacent text already names the partner.

## 3. Fallback priority (identical on every platform)

```
1. PARTNERS registry entry        → official curated logo (always wins for known partners)
2. deal.logoImage from the API    → per-deal image an admin attached
3. partner-initial letter tile    → last resort for partners not yet in the registry
```

The API (`GET /api/deals`) is unchanged — `logoImage` stays in the contract; the registry simply outranks it client-side for known partners. A native client consuming the same API applies the same 1→2→3 chain.

## 4. Logo licensing considerations

- **Official, publicly available artwork only** — the brand's press/brand-resource page, the brand's own served site assets, or Wikimedia Commons brand files. Recorded sources for the current set: Shopee/Grab/Agoda/Booking.com via Wikimedia Commons brand files; Be via be.com.vn's own theme asset; ShopeeFood via shopeefood.vn's served logo; TikTok Shop via TikTok's seller-center CDN.
- **Never redraw, trace, or recolor a mark; never alter proportions.** The only permitted adjustments are uniform scaling and the tile behind it.
- Usage context is **nominative**: identifying the partner a deal links to. Logos must not imply endorsement beyond the partnership, and the Deals page's existing commercial-nature disclosure stays.
- V1 platform policy gates which partners may appear at all (see `promptBuilder` rule 18 — e.g. Amazon/eBay are not approved V1 platforms). A logo in the registry does not approve a partner.
- If a partner rebrands, replace the asset file (same name) — the registry and all platforms pick it up with no code change.

## 5. Audit record (2026-07-31, branch `feat/deals-brand-logos`)

All 7 partners verified on a production build + Vercel Preview: correct current-brand artwork · no cropping/stretching · centered · crisp at DPR ≥2 · dark-mode legible (no vanishing marks, no halos) · 320/375/390/430px = zero overflow, zero clipping, uniform 48×48 tiles · CLS 0 · Lighthouse accessibility 89 = **identical to production baseline** (both failing audits — `color-contrast`, `meta-viewport` — pre-exist this feature) · `image-alt` audit passing · all 7 cards keyboard-focusable.
