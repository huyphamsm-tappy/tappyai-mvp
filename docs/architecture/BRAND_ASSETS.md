# TappyAI — Brand Registry (Platform Capability)

> **Status:** Active · **Date:** 2026-07-31 · **Schema version:** 1 (2026-07-31)
> **Scope:** a shared **Brand Management capability** for the whole platform — not a Deals implementation. Deals is merely its first consumer.
> **Web implementation (reference):** `src/config/brandRegistry.ts` (data + resolution — platform-independent) · `src/components/ui/BrandLogo.tsx` (pure renderer) · `public/brands/` (assets) · `src/config/brandRegistry.validation.test.ts` (validator, CI-enforced) · first consumer: `src/app/deals/DealsView.tsx`
> Per parity governance (`docs/ios/13_PARITY_GOVERNANCE.md` §1), the Web implementation is the spec — native clients mirror THIS architecture, not a reinvention.

## 1. Position in the platform

The registry answers one question for every surface: *"given a partner name, what is the canonical brand — identity, official mark, and how may it be shown?"* Modules that consume (or will consume) it:

| Consumer | Status | Uses |
|---|---|---|
| **Deals** | live | logo tiles, partner resolution from admin-typed names |
| **Shopping / Food / Travel surfaces** | planned | partner attribution on offers/links |
| **Explore** | planned | branded content attribution |
| **AI Recommendations** | planned | brand identity in recommendation cards |
| **Affiliate Platform** | planned | canonical partner ids for tracking/payouts |
| **Merchant Center** | planned | partner self-service identity |
| **Admin CMS** | planned | manages the registry itself (§10) |
| **Ads Platform** | planned | advertiser identity (MPS §10.6 disclosure rules still apply) |

**Rule:** consumers import `resolveBrand` / `BRAND_REGISTRY` / `BrandId` — no module may define its own partner data, partner id strings, or logo paths. One brand, one entry, everywhere.

## 2. Source of truth

`BRAND_REGISTRY` in `src/config/brandRegistry.ts` — code-shipped, versioned with the repo, reviewed by PR. Zero imports from React/Next/feature modules, so the module is consumable by any code (server routes, client components, scripts) and portable 1:1 to native (§13–14). When the Admin CMS arrives (§10), the *data source* becomes DB-backed rows **in this same schema** merged over the shipped registry — the schema and contracts in this document remain the source of truth for what a brand record *is*.

## 3. Ownership

| Concern | Owner |
|---|---|
| Partner list, approvals (`approvedSince`), deprecations | **Product Owner** — every registry PR that adds/removes a partner requires Owner approval (this is also the licensing review gate, §9) |
| Schema, resolution/rendering contracts, validator | **Engineering** — changes bump the schema version (§5) and update this doc in the same PR |
| Brand asset files & provenance (`source` field) | Engineering executes, Owner approves; provenance is mandatory and machine-enforced |
| Future CMS-managed records | Back Office domain (`docs/backoffice/`), same Owner approval workflow expressed as a CMS action |

## 4. Lifecycle & approval workflow

```
PROPOSED   → PR adds asset + ONE registry entry (id, official asset, provenance in `source`)
VALIDATED  → npm run validate:brands green (CI job "Brand registry validation" blocks merge)
APPROVED   → Product Owner approves the PR; `approvedSince` records the date.
             ⚠️ V1 platform policy (promptBuilder rule 18) gates WHICH partners may appear
             at all — an entry never self-approves a partner (e.g. Amazon/eBay not in V1).
LIVE       → all consumers pick the brand up automatically (no per-consumer work)
DEPRECATED → see §6
```

### Adding a partner (the whole procedure)
1. Obtain the brand's **official** logo (press/brand page, the brand's own served asset, or a Wikimedia Commons brand file). Never redraw, never recolor. SVG preferred; PNG only if no public vector exists (≥200px source).
2. Drop it at `public/brands/<id>.svg|png` (kebab-case id) — or host on CDN and use the full `https://` URL (§10).
3. Add **one** registry entry (all fields, incl. `source` provenance). Optical `scale` is judged on screenshots (±0.1 band), never computed.
4. `npm run validate:brands` → PR → Owner approval. Done — Deals and every future consumer get the brand with no further changes.

### Replacing a logo (rebrand)
Replace the asset file **under the same name**, update the entry's `source` (and `logo` extension/`assetType` if the format changed). Same-name replacement propagates safely because assets are served with revalidation (§12) — never switch to `immutable` caching on stable names. Owner approves (it's a brand-presentation change).

### Deprecating a partner
1. Product Owner ends the partner's live content first (e.g. Deals rows) via admin.
2. Remove the registry entry + asset in a PR (Owner-approved). Resolution then returns `null` and every consumer **gracefully falls back** (§8) — deprecation can never crash or blank a surface; stale references degrade to the letter tile.
3. History stays in git (entry, provenance, approval date) — no tombstone field needed at current scale. If audit requirements ever demand in-registry tombstones, add an optional `deprecatedSince` field via the schema-versioning process (§5).

## 5. Versioning

- **Data changes** (add/replace/deprecate a partner) — ordinary PRs; no version bump; git history is the audit log.
- **Schema changes** (fields, resolution semantics, rendering contract) — bump the **schema version** in this doc's header, update the validator and both native mapping sections (§13–14) in the same PR. Native ports declare which schema version they mirror; a version bump generates parity tasks per `13_PARITY_GOVERNANCE.md` §4.
- Current: **schema version 1** (2026-07-31).

## 6. Registry schema (v1 — platform-independent, mirror exactly)

| Field | Type | Meaning |
|---|---|---|
| `id` | string (kebab-case, = registry key) | Stable identifier — the canonical partner id for EVERY module (affiliate tracking, ads, CMS). Duplicate ids structurally impossible (validated). |
| `displayName` | string | Exact display/alt name ("Booking.com", "TikTok Shop"). |
| `aliases` | string[] | Extra admin spellings; id + displayName always resolve without listing them. |
| `logo` | string | Local `/brands/<id>.<ext>` **or** full `https://` CDN URL — renderers treat both identically. |
| `background` | `'light' \| 'dark'` | Tile background the OFFICIAL mark is designed for; the tile supplies it, the mark is never recolored. |
| `scale` | number (0.8–1.15) | **Optical** size correction, judged by eye on screenshots; pixels never stretched. |
| `category` | `'shopping' \| 'food-delivery' \| 'transport' \| 'travel'` | Partner grouping (extend the union via schema versioning). |
| `officialWebsite` | https URL | Canonical brand site. |
| `assetType` | `'svg' \| 'png'` | Must match the logo extension (validated). |
| `source` | string | Provenance of the exact asset file — licensing traceability. Mandatory. |
| `approvedSince` | ISO date | Owner approval date for surfacing this partner. |

**Resolution contract:** normalize free text (strip diacritics + punctuation, lowercase: "TikTok Shop" → `tiktokshop`) → Map lookup over ids + displayNames + aliases, built once. Unknown → `null`, always graceful (§8). Strict ids: `BrandId = keyof typeof BRAND_REGISTRY` on Web; enum/sealed types natively — never hand-written string literals.

**Rendering contract:** fixed square tile (zero layout shift) → inner box = 72% × `scale` (clamped ≤1.15) → aspect-preserved contain-fit, centered, transparent background, never stretched/cropped; lazy/async loading; descriptive alt/`contentDescription` ("<displayName> logo") with a decorative escape hatch. The renderer holds zero brand knowledge.

## 7. Localization (future — multilingual brand names)

Brand names are proper nouns and are **not localized in v1** ("Shopee" is "Shopee" in every UI language) — a single `displayName` is correct today, consistent with ADR-016's proper-noun rule on the AI side. If a future market requires localized brand names (e.g. official CJK names), the versioned extension is an optional `localizedNames?: Record<LangCode, string>` field: resolution adds those values to the normalized index, renderers pick `localizedNames[uiLocale] ?? displayName`, and the validator checks the new keys for collisions. Documented here so the extension is additive (schema v2), not a redesign. Not implemented — no current need.

## 8. Fallback priority (identical on every platform)

```
1. BRAND_REGISTRY entry           → official curated logo (always wins for known partners)
2. content's own image (e.g. deal.logoImage from the API)
3. partner-initial letter tile    → last resort; also the deprecation path (§4)
```

Unknown brands are a **graceful** state, never an error. Consumer APIs are unchanged by this capability — the registry outranks per-content images client-side for known partners.

## 9. Logo licensing considerations

- **Official, publicly available artwork only** — brand press/brand-resource pages, the brand's own served assets, or Wikimedia Commons brand files. Exact provenance recorded per entry in `source` (validator-enforced non-empty).
- **Never redraw, trace, or recolor a mark; never alter proportions.** Only uniform scaling and the tile behind it.
- Usage is **nominative** (identifying the partner content links to); no implied endorsement; commercial-nature disclosures on consuming surfaces stay.
- V1 platform policy gates partner eligibility (promptBuilder rule 18). `approvedSince` records the Owner's decision; an entry alone approves nothing.

## 10. Remote CDN support & Admin CMS path (no renderer change)

`logo` accepts a full `https://` URL **today** — local vs remote is invisible to renderers. CMS upgrade path: admin uploads via Back Office → blob storage (existing Vercel Blob pipeline) → CDN URL → a `brand_partners` table (or config endpoint) serving rows **in this exact schema**, merged over the shipped registry (DB row wins by `id`). Resolution, rendering, and every consumer are untouched — only the registry's data source changes. Until then, registry PRs are the CMS, which keeps the Owner-approval and licensing gates intact.

## 11. Asset validation (CI-enforced)

`npm run validate:brands` → `src/config/brandRegistry.validation.test.ts` (also inside `npm test`; dedicated job in `.github/workflows/architecture-guard.yml` — **CI fails on any error**): duplicate ids · duplicate resolution keys across ids/names/aliases · path validity (local `/brands/` traversal-safe, or `https://`) · supported extensions matching `assetType` · local files exist and non-empty · `scale` within 0.8–1.15 · provenance/governance fields filled.

## 12. Cache strategy

- **Today (Vercel `public/` statics):** `ETag` + revalidation → cheap `304`s; a same-name rebrand propagates on next revalidation. Applies to SVG and PNG alike.
- **Never `immutable` on stable names.** Long-term `max-age=31536000, immutable` requires content-addressed filenames (`shopee.<hash>.svg`); adopt via the registry (`logo` carries the path) + a `headers()` rule for `/brands/:path*` — in that order, only if traffic warrants.
- **CDN logos (§10):** follow the CDN's policy; Vercel Blob URLs are content-addressed → safe for long-term caching by construction.
- **Native:** standard image caches (Coil/Kingfisher) keyed by URL — same rule: stable URL only with revalidation, or content-addressed URLs.

## 13. Native Android mapping (schema v1)

Bundle assets under the same kebab-case names; mirror the schema and contracts:

```kotlin
// core module (suggested: core:brand — pure Kotlin, no Android UI deps),
// consumed by features:deals / features:discovery / core:ai the same way
// Web consumers import from src/config/brandRegistry.ts.
enum class BrandBackground { LIGHT, DARK }
enum class BrandCategory { SHOPPING, FOOD_DELIVERY, TRANSPORT, TRAVEL }

data class BrandDefinition(
  val id: String,                 // = registry key, kebab-case
  val displayName: String,
  val aliases: List<String>,
  val logo: String,               // bundled asset name or https URL
  val background: BrandBackground,
  val scale: Double,              // 0.8..1.15, optical
  val category: BrandCategory,
  val officialWebsite: String,
  val assetType: String,          // "svg" | "png" (vector drawable | png natively)
  val source: String,
  val approvedSince: String,      // ISO date
)
// Resolution: the same normalize (strip diacritics/punctuation, lowercase)
// + Map index over ids/displayNames/aliases; unknown → null → fallback chain §8.
// Rendering: fixed-square tile composable; inner box = 72% × scale; ContentScale.Fit;
// contentDescription = "$displayName logo".
```

## 14. Native iOS mapping (schema v1)

```swift
// Suggested home: a BrandRegistry type in the shared core layer (09_IOS_
// ARCHITECTURE_BLUEPRINT.md), assets in the catalog under the same ids.
enum BrandBackground: String, Codable { case light, dark }
enum BrandCategory: String, Codable { case shopping, foodDelivery = "food-delivery", transport, travel }

struct BrandDefinition: Codable {
  let id: String
  let displayName: String
  let aliases: [String]
  let logo: String                // asset name or https URL
  let background: BrandBackground
  let scale: Double               // 0.8...1.15, optical
  let category: BrandCategory
  let officialWebsite: String
  let assetType: String           // "svg" | "png" (PDF/vector asset | png natively)
  let source: String
  let approvedSince: String       // ISO date
}
// Same normalized-name resolution, same nil-→-fallback, same tile rendering
// contract (72% × scale inner box, aspect-fit, accessibilityLabel "<name> logo").
```

`Codable` conformance is deliberate: the same struct decodes future CMS-served rows (§10) unchanged.

## 15. Audit record (2026-07-31, branch `feat/deals-brand-logos`)

All 7 partners verified on a production build + Vercel Preview: correct current-brand artwork · no cropping/stretching · centered · crisp at DPR ≥2 · dark-mode legible (no vanishing marks, no halos) · 320/375/390/430px = zero overflow, zero clipping, uniform 48×48 tiles · CLS 0 · Lighthouse accessibility 89 = **identical to production baseline** (both failing audits — `color-contrast`, `meta-viewport` — pre-exist this feature) · `image-alt` audit passing · all 7 cards keyboard-focusable · optical balance tuned by screenshot (Be/Booking 0.92, Grab 1.05, Agoda 1.1) · CI "Brand registry validation" job green on the pushed commit.
