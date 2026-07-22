# device_context — Architecture Decision

**Scope:** Cross-platform `device_context` foundation for the Analytics platform. Infrastructure only — not a new analytics feature. Follows the frozen Analytics envelope architecture (§3 / §8A).

**The contract (15 fields, identical on Web/Android/iOS):**
`platform, os_name, os_version, browser_name, browser_version, device_type, manufacturer, device_model, screen_width, screen_height, pixel_ratio, color_scheme, locale, timezone, app_version`

> **Contract-growth validation (added pre-release):** `manufacturer`, `pixel_ratio`, and `color_scheme` were added to the contract **after** the initial 12, and required **zero migration, zero `/api/track` change, and zero envelope change** — only the detection module grew. This is the concrete payoff of the jsonb decision below: the device contract can evolve indefinitely without schema churn. `pixel_ratio` (`window.devicePixelRatio`) and `color_scheme` (`matchMedia(prefers-color-scheme)`) are free on Web; `manufacturer` is factual UA inference (e.g. iPhone → Apple) else `'unknown'`, filled natively on Android/iOS (`Build.MANUFACTURER` / `'Apple'`).

---

## 1. Chosen location

**A single, additive `device_context jsonb` column on `user_events`, holding the full 12-field object — with the existing flat envelope columns kept unchanged and now *projected from the same single detection*.**

Concretely:
- **Client:** one detection module (`src/lib/tracking/deviceContext.ts`) produces the full `DeviceContext`. `buildEnvelope()` attaches it as `device_context` **and** projects the flat fields (`platform`, `os_name`, `os_version`, `device_type`, `app_version`, `language`←`locale`) from that same object. → exactly one detection path.
- **Transport:** the envelope carries `device_context` as a nested object; `tracker.ts` already spreads `...buildEnvelope()`, so callers of `track()` are unchanged.
- **At rest:** `/api/track` writes the object verbatim to the new `device_context jsonb` column. The existing flat columns are still written exactly as before.

## 2. Why this location (and why the alternatives were rejected)

The real decision is **where the 6 genuinely-new fields** (`browser_name`, `browser_version`, `device_model`, `screen_width`, `screen_height`, `timezone`) live, since `platform/os_name/os_version/device_type/app_version` already exist as flat columns and `locale` ≈ the existing `language`. Three candidates:

### Rejected — (A) Add 6+ new flat columns
- **Con:** schema churn — every future context field is another migration; scatters one cohesive concept across ~13 columns with no object identity; gives Android/iOS no single contract to fill; widens every row for fields (`screen_width`, `device_model`, `browser_version`) that **no rollup or dimension queries**.
- Rejected because it optimizes for relational queryability that nothing needs, at the cost of long-term scalability (the requirement's stated priority).

### Rejected — (C) Embed inside the existing `metadata` jsonb
- **Con:** conflates **envelope context** with **per-event business properties**. This schema *already* established the separation — device fields (`platform`, `os_*`, `device_type`) live in dedicated flat columns precisely to keep them out of `metadata` (which holds `method`, `tool`, `place_category`, …). Folding `device_context` into `metadata` reverses that decision, risks key collisions with business props, and muddies privacy auditing/redaction (device signals mixed with event data).
- Its only advantage is "no migration." That is outweighed by breaking the envelope/properties boundary the architecture depends on.

### Chosen — (B) One additive `device_context jsonb` column
- **Pro:** it is *envelope infrastructure*, so it gets a top-level envelope element (its own column), consistent with how the envelope already treats device fields as first-class (not `metadata`).
- **Pro:** `jsonb` (not flat columns) → **future context fields need zero migration** — the scalability the requirement asked to optimize for.
- **Pro:** existing flat columns are **untouched** → `auth_daily_rollup`, `user_acquisition`, the activation cron, every dashboard/API keep working with **no change**.
- **Pro:** one cohesive object that Android/iOS fill **identically**; one privacy-auditable/redactable location for all device signals.
- **Accepted tradeoff:** the 5 overlapping fields are stored both flat (denormalized hot dimensions) and inside `device_context` (full record). This is **denormalization of values from one detection source**, not duplicated *logic* — the standard analytics pattern (indexed dimensions + full raw payload). Quantified in the Audit (§ payload growth): a few short strings per row, the necessary cost of backward-compatibility. An alternative that stores only the non-overlapping fields in the jsonb was considered and rejected because it splits the contract across columns+jsonb at rest, forcing every reader to merge two sources.

## 3. Compatibility

### Web
- Fully implemented. Every detectable field is populated from `navigator.userAgent`, `window.screen`, `navigator.language`, and `Intl…timeZone`. Undetectable **string** fields = `'unknown'`; undetectable **numeric** fields (`screen_width/height`) = `null` (a number cannot honestly hold the string `'unknown'`, and a fabricated `0` would imply a real 0×0 screen). No data is fabricated.
- `device_model` is `'unknown'` for typical desktop web (the Web platform does not expose it); a best-effort Android-UA model parse is included.

### Android (future)
- Android fills the **exact same 12-field `DeviceContext`** natively (Build.MODEL, Build.VERSION, `Locale`, `TimeZone`, `DisplayMetrics`, the app's own versionName, `platform='android'`) and posts it to `/api/track` under the same `device_context` key. No server or schema change is needed when Android ships — the column and ingestion already accept it. `platform`/`device_type`/etc. flat fields are likewise sent by the native tracker exactly as Web does.

### iOS (future)
- Identical story: iOS fills the same contract (`UIDevice`, `ProcessInfo.operatingSystemVersion`, `Locale`, `TimeZone`, `UIScreen`, bundle short-version, `platform='ios'`, `browser_name='unknown'` since there is no browser). Same endpoint, same column, no backend change.

### Backend as source of truth
- The device is the only truthful source for its own hardware/browser/screen, so `device_context` is client-supplied **by design**. The backend remains authoritative for the fields it already owns and continues to set them server-side: `user_id` (session), `country` (IP header — deliberately **not** in the contract), `created_at` (server timestamp). Server-side normalization/validation of `device_context` (e.g. clamping, platform allow-listing) can be added later as a purely additive layer **without any contract change**.

## 4. Backward compatibility
- **Callers:** unchanged — `track(event_type, metadata)` is identical; the envelope auto-attaches `device_context`.
- **Existing events / dashboards / APIs:** unchanged — they read the flat columns, which are still written.
- **Existing migrations:** untouched and still valid; this adds one new nullable column only.
- **Existing rows:** keep `device_context = NULL` (nullable); nothing breaks.
- **One minor, intentional normalization:** the flat `os_version` (and macOS version) now emit `'unknown'` instead of the previous empty string `''` for undetectable versions. No consumer reads `os_version` (verified — `user_acquisition` and the rollups do not), so this is safe and is the more honest value per the "unknown, never fabricate" rule.

## 5. Migration impact
- **One additive migration:** `supabase/migrations/20260714_device_context.sql` → `ALTER TABLE public.user_events ADD COLUMN IF NOT EXISTS device_context jsonb;`
- Nullable, `IF NOT EXISTS`, no default backfill, no index (nothing queries it relationally yet — a GIN index can be added additively later if segmentation queries need it), no RLS/policy/function change.
- **Ordering:** depends only on `20260713_analytics_envelope_foundation.sql` (already applied). Sorts after the activation migrations (`d` > `a`). It is a **new 6th pending migration** — not yet applied; it must be applied **before** the code deploys (the code writes to `device_context`; without the column the insert would error). This matches the current not-yet-released state (both code and migration are staged, neither live).
