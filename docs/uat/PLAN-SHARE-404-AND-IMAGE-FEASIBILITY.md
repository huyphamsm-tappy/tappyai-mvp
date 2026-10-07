# UAT3 P1 — "shared plan link 404s" + sharing the brochure as an image (2026-09-27)

## 1. The 404 — a local-environment artefact, not a code bug

Measured on :3007 (rc/web-uat) against the audit database, with a throwaway account:

| step | result |
|---|---|
| `POST /api/plans/share` (a small Đà Lạt plan) | 200, `{"id":"wU3HqJM6DfBS","url":"http://localhost:3007/plan/wU3HqJM6DfBS"}` |
| `GET http://localhost:3007/plan/wU3HqJM6DfBS` | **200**, the brochure renders (title present, `og:url` = the same localhost URL) |
| `GET https://www.tappyai.com/plan/wU3HqJM6DfBS` | 404 — the plan lives in the **audit** DB, production has never seen it |
| `POST https://www.tappyai.com/api/plans/share` | **404 — production does not have the plan-share route at all** (it runs an older build) |

Why the owner's link was `tappyai.com/plan/<id>`: the **Android** app always builds share links on the canonical
origin — `TappyShare.CANONICAL_ORIGIN = "https://www.tappyai.com"` (`TappyShare.planShareUrl`, F-078) — while the plan
was minted on :3007/audit. The web client builds the link from the server's configured site origin, which on this
machine produced `http://localhost:3007/…` (inferred from the URL the app returned; env values were not read).

**What must be true on production** (DEPLOY-CHECKLIST §4e): `NEXT_PUBLIC_SITE_URL` (and `NEXT_PUBLIC_APP_URL`) =
`https://www.tappyai.com`, and the release that contains `/plan/[shareId]` + `/api/plans/share` deployed. Then a plan
shared from either client opens on production. Verify after deploy: share a plan from the web and from Android, open
both links in a signed-out browser → the brochure, not "Không tìm thấy trang".

## 2. Sharing the brochure as an IMAGE (owner request) — feasibility only, NOT implemented

What exists already: every published plan has a server-rendered card at `/plan/<id>/opengraph-image`
(`planOgCard.tsx`, Satori/`next/og`): **1200×630 PNG, ~122 KB; 2.1 s first render, 0.42 s warm** on :3007.
The web share menu can already attach an image file to the OS share sheet (`ShareMenu` → `navigator.share({files})`).

| option | what the recipient gets | work | cost | latency |
|---|---|---|---|---|
| **A. Share the existing OG card as the image + the link as text** | a 1200×630 teaser card (title, days, stops, TappyAI mark) and the link below it | Android: fetch the PNG → cache file → `ACTION_SEND` with `FileProvider` URI + `EXTRA_TEXT` link (Zalo keeps both; Facebook keeps the image, drops the text). Web mobile: `navigator.share({ files: [png], text: url })` (Android Chrome, iOS Safari); desktop: "Lưu ảnh" + "Sao chép link". ≈ 0.5–1 day incl. tests | none new: the card is already rendered and CDN-cacheable per URL | +0.4–2 s before the share sheet opens (fetch/render); can be pre-fetched when the menu opens |
| **B. A tall, full-brochure image** (every day and stop, photos) | the whole itinerary as one picture | new Satori template (tall canvas, per-day sections, photo tiles), size limits, text wrapping for Vietnamese; ≈ 1.5–2 days | Vercel function time per render (~1–3 s), photo fetches; cache per plan id | 2–4 s cold; 400 KB–1 MB image |

Constraints that hold for both: Facebook's share dialog cannot take an image from the web (only the OS share sheet
can); Zalo desktop has no share URL at all (copy/save only); an image cannot be updated after it is sent, while the
link always shows the current brochure — so the link should stay alongside the image. Recommendation: **A** (reuses
what is built and measured), B only if the teaser card is not enough. Waiting for the owner's choice.
