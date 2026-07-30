# TappyAI — Logo & Brand-Asset Migration Plan

**Status:** Planning / documentation only. **No code, no file renames, no reference changes were made producing this document.**
**Brand decision (owner, 2026-07-29):** the **Otter** is the official TappyAI brand identity. The legacy **infinity (∞)** mark is to be retired.
**Blocked on Design:** the icon-only and wordmark source assets do **not** exist yet and must be supplied by the design team. The current approved `otter-logo.png` (full lockup) remains the single source of truth until then. **Do not generate, crop, or derive logo assets.**

---

## Brand Identity v1.0

**Official Brand Identity**

- **Mascot:** Otter
- **Brand Icon:** Otter (icon-only)
- **Wordmark:** TappyAI
- **Full Logo:** Otter + TappyAI

**Legacy Infinity Logo**

- **Status: RETIRED**
- The legacy logo remains only for backward compatibility until the **Brand Identity Consolidation** project begins (see §9).

_This section is the official brand-identity reference for all future Web, Android, iOS, and Marketing work._

---

## 1. Target naming convention

Role-based names under `public/branding/` — the filename tells you where it's used.

| Target file | What it is | Primary uses |
|-------------|-----------|--------------|
| `public/branding/tappyai-icon.png` | **Icon-only** Otter (no wordmark) | App header, splash, push notification, PWA/home-screen icon, favicon, apple-touch-icon |
| `public/branding/tappyai-wordmark.svg` | **Wordmark** — the "TappyAI" text, vector | Landing / website / pitch deck where a clean text mark is needed |
| `public/branding/tappyai-logo.png` | **Full lockup** — icon + wordmark | Hero, press kit, media kit, Drive/marketing assets |
| `public/branding/founder.jpg` | Founder photo (not a logo) | Landing founder card |

> Convention: brand assets live only in `public/branding/`. Nothing brand-related stays at `public/` root or in ad-hoc locations.

---

## 2. Current asset inventory (what exists today)

| File | Depicts | Format / size | Status |
|------|---------|---------------|--------|
| `public/branding/otter-logo.png` | **Otter** full lockup (icon + "TappyAI") | PNG 1254² · 532 KB | ✅ Approved — **new brand** |
| `public/branding/founder.jpg` | Founder photo | JPEG 539×960 · 44 KB | ✅ Keep |
| `public/logo.png` | **Legacy ∞** full lockup + tagline + category icons | PNG | ⚠️ Legacy brand — still referenced |
| `public/logo.svg` | **Legacy ∞** full lockup (vector, identical design) | SVG 400×320 | 🗑️ Legacy brand — **UNUSED** (0 code references) |
| `public/icons/icon-{72,96,128,144,152,192,384,512}.png` | **Legacy ∞** (PWA icon set, 8 files) | PNG | ⚠️ Legacy brand — referenced by `manifest.json` |
| `public/feature-graphic.png` | Marketing feature graphic (Google Play / OG) | PNG | ℹ️ Not part of the logo system; verify it reflects the Otter brand |
| *(favicon)* | — | — | ❌ **Missing** — no `favicon.ico` and `metadata.icons` is unset |

**Two brands coexist in production today:** landing = Otter, app shell + PWA icons + notifications = legacy ∞.

---

## 3. Complete reference map (every current logo reference)

| Reference | File · line | Points at | Migrate to |
|-----------|-------------|-----------|-----------|
| `LOGO = '/branding/otter-logo.png'` | `src/components/landing/config.ts:13` | Otter full | → rename source to `tappyai-logo.png` **or** point to `tappyai-icon.png` for header/footer (design call) |
| Landing header `<Image src={LOGO}>` | `src/components/landing/LandingHeader.tsx:21` | via `LOGO` | (follows `config.LOGO`) |
| Landing footer `<Image src={LOGO}>` | `src/components/landing/LandingFooter.tsx:22` | via `LOGO` | (follows `config.LOGO`) |
| Org JSON-LD `logo: ${SITE_URL}${LOGO}` | `src/app/startup/page.tsx` (organizationJsonLd) | via `LOGO` | (follows `config.LOGO`) |
| App header `<Image src="/logo.png">` | `src/components/Header.tsx:73` | Legacy ∞ | → `tappyai-icon.png` |
| Onboarding `<Image src="/logo.png">` | `src/app/onboarding/page.tsx:50` | Legacy ∞ | → `tappyai-icon.png` |
| Push notification `icon` | `src/lib/notifications/send.ts:31` | Legacy ∞ | → `tappyai-icon.png` |
| Push notification `badge` | `src/lib/notifications/send.ts:32` | Legacy ∞ | → `tappyai-icon.png` (monochrome variant ideal for badge) |
| PWA icons (8 entries) | `public/manifest.json:11–18` | Legacy ∞ `/icons/*` | → regenerate `/icons/*` from Otter icon |
| Founder photo | `src/components/landing/LandingContact.tsx:30` | `founder.jpg` | (stays) |
| OG / feature graphic | `src/components/landing/config.ts:14` (`OG_IMAGE`) | `feature-graphic.png` | verify brand; out of logo-system scope |

**Not brand references (do not touch — flagged to avoid false positives):**
- `middleware.ts:77` — route matcher regex that *excludes* `favicon.ico` and image extensions (routing only).
- `src/lib/ai/tools/common.ts:138` — `LOGO_ICON_KEYWORDS = ['logo','icon','favicon']`, used to filter logo/icon images out of AI search results (not a file reference).

---

## 4. Migration mapping (current → target)

| Current | → Target | Depends on |
|---------|----------|-----------|
| `branding/otter-logo.png` | `branding/tappyai-logo.png` | none (rename/move of existing approved asset) |
| *(none yet)* | `branding/tappyai-icon.png` | 🎨 **Design team** — icon-only Otter |
| *(none yet)* | `branding/tappyai-wordmark.svg` | 🎨 **Design team** — wordmark SVG |
| `logo.png` (∞) | **retire** → app refs point to `tappyai-icon.png` | `tappyai-icon.png` exists |
| `logo.svg` (∞) | **delete** (unused) | confirm zero refs (already confirmed) |
| `icons/icon-*.png` (∞) | **regenerate** from Otter icon (same 8 sizes) | `tappyai-icon.png` exists + resize step |
| *(missing)* favicon | **add** Otter favicon + `metadata.icons` | `tappyai-icon.png` exists |

---

## 5. Unused / legacy assets to retire

- **`public/logo.svg`** — zero references. Safe to delete once the migration commits (keep in git history).
- **`public/logo.png`** — becomes unused *after* the 4 app references (Header, onboarding, push icon+badge) are repointed. Delete last.
- **`public/icons/icon-*.png` (legacy ∞)** — replaced by Otter-derived icons of the same names/sizes (so `manifest.json` needs no path change, only the image contents).
- **`feature-graphic.png`** — retain, but verify it shows the Otter brand (it's a Google Play / OG marketing graphic, not part of the logo set).

---

## 6. Blocked on Design (cannot proceed until provided)

1. **`tappyai-icon.png`** — icon-only Otter (transparent or on brand background), high-res square. *Required by app header, onboarding, push, PWA icons, favicon.*
2. **`tappyai-wordmark.svg`** — the "TappyAI" wordmark as clean vector (brand font + white/orange colors).
3. **(optional) monochrome badge icon** — for the notification `badge` (Android renders badges as a silhouette; a flat monochrome mark reads best).

Until #1 exists, none of the app-shell / PWA / favicon migration can execute — the app stays on the legacy ∞ mark.

---

## 7. Migration checklist (phased)

### Phase 0 — Prereqs (blocked on Design)
- [ ] Receive `tappyai-icon.png` (icon-only Otter) from design.
- [ ] Receive `tappyai-wordmark.svg` from design.
- [ ] (optional) Receive monochrome badge icon.

### Phase 1 — Establish `public/branding/` naming (low risk, otter already approved)
- [ ] Add `branding/tappyai-logo.png` (= current `otter-logo.png`, renamed) and update `config.LOGO`.
- [ ] Add `branding/tappyai-wordmark.svg` (once received); wire wherever a vector wordmark is wanted.
- [ ] Keep `branding/founder.jpg`.

### Phase 2 — Migrate the app shell to the Otter icon (app-wide; needs Phase 0 #1)
- [ ] `Header.tsx:73` `/logo.png` → `/branding/tappyai-icon.png` (keep 120×40 sizing? icon-only is square → adjust to square box + wordmark text, mirroring the landing pattern).
- [ ] `onboarding/page.tsx:50` `/logo.png` → `/branding/tappyai-icon.png`.
- [ ] `notifications/send.ts:31` icon → `/branding/tappyai-icon.png`; `:32` badge → monochrome badge icon.

### Phase 3 — PWA icons + favicon (needs Phase 0 #1)
- [ ] Regenerate `public/icons/icon-{72..512}.png` from the Otter icon (same filenames/sizes → `manifest.json` unchanged). Keep the `512` "maskable" purpose with correct safe-area padding.
- [ ] Add favicon: `src/app/icon.png` (Next convention) or `public/favicon.ico`, and optionally `apple-icon.png`; set `metadata.icons` in `layout.tsx`.

### Phase 4 — Retire legacy
- [ ] Delete `public/logo.svg` (already unused).
- [ ] Delete `public/logo.png` (after Phase 2 repoints all 4 refs — verify zero remaining refs with a grep gate).
- [ ] Verify `feature-graphic.png` reflects the Otter brand; regenerate if it still shows ∞.

### Phase 5 — Verify
- [ ] `grep` gate: no remaining references to `/logo.png` or `/logo.svg`.
- [ ] Build · TypeScript · Lint · Tests.
- [ ] Visual: app header, onboarding, landing header/footer/hero, PWA install icon, favicon, notification icon — all show the Otter, no broken images, no distortion (`object-contain`, aspect preserved).
- [ ] Deploy Preview → verify → then production.

---

## 8. Risks & notes
- **App-wide, not landing-only.** Phases 2–4 touch app code (Header, onboarding, notifications, manifest, favicon) — must be its own task with full build/verify, **not** folded into a "landing" change.
- **`config.LOGO` currently drives 3 landing surfaces** (header, footer, JSON-LD). Decide whether landing header/footer should use the **full logo** or the **icon** (the full lockup embeds "TappyAI", which duplicates the adjacent wordmark text at small sizes — see the existing flag).
- **Notification `badge`** should be a monochrome silhouette, not the full color icon.
- **`icon-512` is `purpose: "any maskable"`** — the Otter version needs safe-area padding so it isn't clipped on Android adaptive icons.
- **Favicon is currently missing** — a quick win independent of the rest.
- Do **not** touch the `zalo_verifier*.html` files or `middleware.ts` matcher — unrelated to branding.

---

## 9. Future Project — Epic: Brand Identity Consolidation

**Status:** Documentation only. **No implementation authorized at this time.** No application migration until this epic is formally scheduled by the Product Owner.

**Objectives**
- Replace all remaining legacy logo references.
- Standardize branding assets.
- Consolidate Web, Android, iOS, and Marketing assets.
- Regenerate PWA icons.
- Update Splash Screen.
- Update Notifications.
- Update Favicon.
- Update Manifest.
- Remove legacy assets after migration verification.

**Tracks**
- **Web** — execution detail is the phased checklist in §7 (Phases 0–5).
- **Android** — app launcher icon, splash, notification icon/badge, adaptive (maskable) icon.
- **iOS** — app icon set, launch screen.
- **Marketing** — press/media kit, store feature graphics (`feature-graphic.png`), OG images, Drive assets.

**Entry criteria:** design delivers `tappyai-icon.png` (icon-only) and `tappyai-wordmark.svg`; Product Owner authorizes the epic.
**Exit criteria:** zero references to the legacy `logo.png` / `logo.svg` / infinity PWA icons; every surface shows the Otter; legacy assets removed after verified migration.

_No implementation. Documentation only._
