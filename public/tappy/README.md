# Tappy Core Pose Library

**Owner owns all art. Claude owns code/component/wiring only — never redesigns.**

Everything in the app maps to these **18 canonical poses** (18 poses → 100+
situations). Drop each exported PNG here as `/public/tappy/<pose>.png`.
`<TappyMascot pose="..." />` (`src/components/TappyMascot.tsx`) loads it and
falls back to 🤖 until the file exists — nothing breaks while art is pending.

## The 18 poses

| # | file | used for (examples) |
|---|------|---------------------|
| 01 | `welcome.png`        | onboarding / welcome hero / splash |
| 02 | `wave.png`           | **default AI avatar** / overview / chat-default |
| 03 | `thinking.png`       | chat thinking · loading-ai · hero-thinking |
| 04 | `searching.png`      | places · AI search · loading-search · empty-search · chat-searching |
| 05 | `food.png`           | Food tab · loading-food · empty-food |
| 06 | `travel.png`         | Travel tab · loading-travel · empty-travel |
| 07 | `shopping.png`       | Shopping tab · loading-shopping · empty-shopping |
| 08 | `deals.png`          | Deals · new-deal notification · empty-deals |
| 09 | `entertainment.png`  | Entertainment tab |
| 10 | `aitools.png`        | AI tool pages (scan/translate/currency…) |
| 11 | `recommendation.png` | Recommendations · recommendation notification |
| 12 | `success.png`        | success · celebrate · thumbsup |
| 13 | `sorry.png`          | error · confused · retry |
| 14 | `reading.png`        | hero-reading |
| 15 | `phone.png`          | notification · new-message |
| 16 | `speaking.png`       | chat speaking / TTS |
| 17 | `delivery.png`       | delivery |
| 18 | `spa.png`            | Spa tab |

## Phases (don't wait for all 18)

- **Phase 1 (13 poses — ships the whole AI experience):**
  `welcome, wave, thinking, searching, food, travel, shopping, deals,
  entertainment, aitools, recommendation, success, sorry`
- **Phase 2 (5 poses):** `reading, phone, speaking, delivery, spa`

## Format (one file per pose)

- **PNG, transparent background, 288×288 px (3×).** One file per pose — the
  component scales it to any display size (24–128). Do **not** export per-size files.
- Fallback is 🤖 (never SVG — SVG would break the 3D character).

## Do NOT put here

App logo · nav icons · product/merchant/payment icons. This folder is the AI
**mascot** only.
