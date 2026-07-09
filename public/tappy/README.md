# Tappy mascot assets

Drop the **exported** category icons from the official brand sheet here as
**transparent PNG**. The `<TappyMascot variant="..." />` component
(`src/components/TappyMascot.tsx`) loads `/tappy/<variant>.png` and falls back to
an emoji until the file exists — so nothing breaks while assets are pending.

## Required files (exact names)

| File | Brand-sheet icon | Used for |
|------|------------------|----------|
| `overview.png`       | Tổng quan (otter waving)        | General chat avatar + welcome hero |
| `places.png`         | Địa điểm (magnifying glass)     | "searching a place" state |
| `food.png`           | Ẩm thực (bowl)                  | Food tab |
| `travel.png`         | Du lịch (camera + plane)        | Travel tab |
| `shopping.png`       | Mua sắm (bags)                  | Shopping tab |
| `deals.png`          | Deal / Ưu đãi (%)               | Deals |
| `delivery.png`       | Giao hàng (scooter)             | (reserved) |
| `entertainment.png`  | Giải trí (headphones)           | Entertainment tab |
| `aitools.png`        | Công cụ AI (laptop)             | AI tool pages |
| `recommendations.png`| Gợi ý (shield)                  | Recommendations |

*(Optional: `spa.png` — the sheet has no spa icon yet; without it the Spa tab
uses `overview.png`.)*

## Format spec

- **PNG, transparent background.**
- Square canvas, mascot centred.
- Export at **3×** so it stays crisp on retina: **288×288 px** is ideal
  (min 192×192). One file per variant is enough — the component scales it down
  to the display size (24–128 px).
- Keep the brand style: 3D, rounded, #007AFF / #FF9500, Tappy always smiling.

## Notes

- SVG is also accepted (rename the component's `.png` to `.svg` if you export
  vectors) — but these are 3D renders, so **PNG @3× is the realistic format**.
- Do NOT put the app logo here — this folder is the AI **mascot** only.
