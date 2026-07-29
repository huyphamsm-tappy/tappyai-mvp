# 10 · Required Store Assets

Everything Google Play needs, with exact specs. **None of these marketing assets exist in the repo yet** — they must be produced. The in-app launcher icon does exist (adaptive vector), but the store's high-res icon is a separate PNG.

> Brand note: the current app icon is an **adaptive icon** — white "**T**" on a solid blue background (`ic_launcher_foreground.xml` + `ic_launcher_background.xml`). Keep store assets visually consistent with it (same blue, same mark) unless you intend a rebrand. Per project convention, mascot/brand artwork is owner-owned — this doc specifies requirements, it does not generate final art.

---

## 1. High-res app icon (required)
| Spec | Value |
|---|---|
| Size | **512 × 512 px** |
| Format | **32-bit PNG** (with alpha) |
| Content | The TappyAI mark (white "T" on blue), matching the in-app adaptive icon. No rounded-corner baking — Play applies masking. |
| Max file size | 1 MB |
> Source of truth for the mark: `app/src/main/res/drawable/ic_launcher_foreground.xml` + background color in `values/ic_launcher_background.xml`. Export a 512px PNG from the same artwork so store and device icons match.

## 2. Feature graphic (required)
| Spec | Value |
|---|---|
| Size | **1024 × 500 px** |
| Format | PNG or JPEG (no alpha) |
| Content | App name "TappyAI" + a short VI tagline (e.g. "Trợ lý AI thuần Việt"). Keep text away from edges; avoid tiny text. Do not embed a fake device frame that misrepresents the UI. |
| Notes | Shown at the top of the listing and in some placements. Must not imply features the app lacks. |

## 3. Phone screenshots (required — minimum 2, up to 8)
| Spec | Value |
|---|---|
| Count | **2–8** (recommend 5–6) |
| Format | PNG or JPEG (no alpha) |
| Aspect | 16:9 or 9:16; each side between **320 px and 3840 px**; keep a consistent portrait size (e.g. **1080 × 2400**). |
| Localization | Provide a set for **vi-VN** (default) and optionally **en-US**. Text in screenshots should match the locale. |

**Recommended screens to capture (all exist and were verified running):**
1. **Home launchpad** — greeting + quick actions + For You / Fortune.
2. **Chat with AI** — a real assistant reply (ideally showing suggestion buttons / a place answer).
3. **Explore / Discovery** — category grid.
4. **Reviews feed** — a review with photo, like/comment.
5. **Maps** — place on map + detail sheet.
6. **Fortune (Tarot)** — with the "for entertainment only" line, or **Settings** showing light/dark + language.

> Capture from the **release** build with real content. You may add short caption overlays, but the underlying UI must be genuine (no mocked-up features). Avoid showing the dev-only Design System Showcase screen.

## 4. Tablet / large-screen screenshots (recommended, not required)
The app declares `resizeableActivity` and has responsive, width-capped layouts. If you want the "Designed for tablets/large screens" treatment:
| Spec | Value |
|---|---|
| 7-inch | up to 8 images |
| 10-inch | up to 8 images |
| Aspect / size | Same rules; use a tablet/foldable or resized emulator. |

## 5. Promo video (optional)
- A YouTube URL (not an uploaded file). Optional; skip for first launch if not ready.

---

## Text assets (from other docs — for one place)
| Asset | Limit | Source |
|---|---|---|
| App title (VI/EN) | 30 chars | [01](01_play_store_listing.md) |
| Short description | 80 chars | [01](01_play_store_listing.md) |
| Full description | 4000 chars | [01](01_play_store_listing.md) |
| Release notes | 500 chars/locale | [09](09_versioning_release_notes.md) |

---

## Asset production checklist
- [ ] 512×512 PNG icon exported from the app's own mark (blue/white "T").
- [ ] 1024×500 feature graphic (VI tagline).
- [ ] 5–6 phone screenshots, vi-VN set (release build, real content).
- [ ] (Optional) en-US screenshot set.
- [ ] (Optional) tablet screenshots.
- [ ] All images: correct dimensions, no alpha where disallowed, under size limits.
- [ ] No screenshot shows placeholder/dev screens or misrepresents functionality.
- [ ] Store icon visually matches the on-device launcher icon.
