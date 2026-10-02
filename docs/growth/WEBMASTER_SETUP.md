# Webmaster setup — Cốc Cốc · Google Search Console · Bing Webmaster Tools · IndexNow · sameAs

**Status:** repository side DONE and tested; every step below that needs an account is an **owner action after the production deploy**. Nothing here has been submitted or verified externally. The machine-readable companion is `docs/growth/webmaster-checklist.json`.

## 0. Facts the checklist relies on (repository, verified by tests)

| Fact | Value | Pinned by |
|---|---|---|
| Canonical origin | `https://www.tappyai.com` (www — `FALLBACK_SITE_URL`, `SITE_URL`; set `NEXT_PUBLIC_SITE_URL` to exactly this in production) | `publicSurfaces.test.ts` |
| Apex → www | **not in the repo.** Vercel domain settings must redirect `tappyai.com` → `www.tappyai.com` (308). If the apex is the primary in Vercel instead, change `NEXT_PUBLIC_SITE_URL` — canonicals, sitemap, OG, IndexNow and the App Links host all follow that one variable. | owner check |
| `robots.txt` | allows `*`, disallows private paths, carries `Sitemap: https://www.tappyai.com/sitemap.xml` (Cốc Cốc discovers sitemaps from this line) | `seoSurfaces.test.tsx` |
| `sitemap.xml` | `/`, `/about`, `/scam-shield`, `/scam-shield/kich-ban` + 25, 5 hubs, `/extension`, `/extension/privacy`, `/how-to-use`, `/privacy`, `/terms`, `/startup`, newest ≤2000 listed `/r/*` | `publicSurfaces.test.ts` |
| Canonicals | one per page, bare path, no query | per-page tests |
| hreflang | **none by design** (no per-language URLs; SSR vi, client reconciles) — do not add | `SEARCH_DISCOVERY.md` S8 |
| Structured data | WebSite+SearchAction, Organization `@id`, AboutPage, BreadcrumbList, FAQPage (hubs), QAPage (`/r/*`), Article (scam pages), SoftwareApplication (`/extension`) | per-page tests |
| noindex | `/extension/welcome`, anonymous-owned `/r/*`, private metadata builder; everything else index,follow | tests |
| Association files | `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association`, `/.well-known/indexnow/<key>.txt` — all **404 until their env var is set** | `publicSurfaces.test.ts` |

## 1. Cốc Cốc (Vietnam's #2 search engine)

Repository side: **DONE** — Cốc Cốc reads the `Sitemap:` directive from robots.txt ("You can add the Sitemap directive to instruct our robots to use sitemap files in your robots.txt file", coccoc.com/search/console/en/submit-sitemap-to-coc-coc-search); `coccocbot` is allowed under `*`. No documented API, key file or verification tag exists — nothing else can be prepared in code, and nothing is invented.

Owner action (after deploy, ~10 min, no account documented, captcha form):
1. Open https://coccoc.com/search/console/en (or the vi console) → *Submit URL*.
2. Submit, one at a time: `https://www.tappyai.com/`, `/about`, `/scam-shield`, `/scam-shield/kich-ban`, `/food`, `/shopping`, `/travel`, `/entertainment`, `/spa`, `/extension`.
3. Confirm `https://www.tappyai.com/robots.txt` shows the `Sitemap:` line (it does in the repo).
4. Verify later with `site:tappyai.com` on coccoc.com/search.

## 2. Google Search Console

Repository side: **DONE** (table in §0). Owner action:
1. https://search.google.com/search-console → *Add property* → **Domain** property `tappyai.com` (covers www, apex, http/https).
2. DNS verification: add the TXT record Google shows (`google-site-verification=…`) at the DNS provider (Cloudflare — the same zone that hosts the email routing). Alternative if DNS is awkward: URL-prefix property `https://www.tappyai.com/` + HTML-tag method — then paste the tag's `content` value into a new `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` env and add it to `layout.tsx` metadata `verification.google` (not pre-wired: the domain method needs no code and is preferred).
3. *Sitemaps* → submit `https://www.tappyai.com/sitemap.xml`.
4. *URL Inspection* → *Request indexing* for: `/`, `/about`, `/scam-shield`, `/scam-shield/kich-ban`, `/extension`, one hub (`/food`), one scenario page (`/scam-shield/kich-ban/bca-2026-01`). Quota is limited; do not request more than ~10/day.
5. After T+7: *Pages* report → confirm the static set is "Indexed"; *Enhancements* → Breadcrumbs / FAQ / Sitelinks searchbox have no errors.
6. Validation queries: `AI_SEARCH_VALIDATION_PLAN.md` (Q1–Q35), starting with `site:tappyai.com` and Q31–Q33.

## 3. Bing Webmaster Tools

Repository side: **DONE** (same table; IndexNow built). Owner action:
1. https://www.bing.com/webmasters → *Add a site* → `https://www.tappyai.com` (or *Import from Google Search Console* once §2 is done — fastest, no second verification).
2. Verify: DNS CNAME/TXT, or XML file `BingSiteAuth.xml` in `public/` (not pre-created: the file contents are account-specific), or the meta tag (as in §2 step 2, env `NEXT_PUBLIC_BING_SITE_VERIFICATION` — not pre-wired).
3. *Sitemaps* → submit `https://www.tappyai.com/sitemap.xml`.
4. *IndexNow* → the tool shows the key it detects; it must equal `INDEXNOW_KEY` (§4). Test: *Submit URL* for `/about` and check *IndexNow insights*.
5. *URL Inspection* on the same URL list as §2 step 4.
6. After T+7: *Search performance*; after T+14: *AI Performance* (citations in Copilot / Bing AI summaries).

## 4. `INDEXNOW_KEY`

Implementation (audited, `src/lib/discovery/indexNow.ts`, tests `indexNow.test.ts`):
- env name `INDEXNOW_KEY`; accepted only if `/^[a-f0-9]{8,128}$/i` (protocol rule); lower-cased; **any other value = feature off** (never "partly on").
- key file: `GET /.well-known/indexnow/<key>.txt` → the key, `X-Robots-Tag: noindex`; 404 for any other name and when unset (the route never confirms a guess). `keyLocation` is sent in every submission, which the protocol allows instead of a root-level file.
- submission: only from the two share-creation routes, only when `owner_is_anonymous === false` (listed pages; noindex pages are never submitted), fire-and-forget, 5 s timeout, never throws, same-host URLs only, de-duplicated.
- no secret leakage: the key is a public verification token by design (the engines fetch the file); it is never logged and never in HTML.

Owner action:
1. Generate: `openssl rand -hex 16` (32 hex chars).
2. Vercel → Project → Settings → Environment Variables → `INDEXNOW_KEY` = that value, **Production only**. Leave Preview/Development unset.
3. Deploy.
4. Verify: `https://www.tappyai.com/.well-known/indexnow/<KEY>.txt` returns the key as text.
5. Verify behaviour: create one public share on production → Bing Webmaster Tools → *IndexNow insights* shows the `/r/<slug>` URL within minutes; or `curl -X POST https://api.indexnow.org/IndexNow -H 'Content-Type: application/json' -d '{"host":"www.tappyai.com","key":"<KEY>","keyLocation":"https://www.tappyai.com/.well-known/indexnow/<KEY>.txt","urlList":["https://www.tappyai.com/about"]}'` → 200/202.

## 5. `ORGANIZATION_SAME_AS`

Implementation (audited, `siteJsonLd.ts`, tests `browserFeeds.test.ts`): comma-separated; only `https://host/…` entries survive; empty → the `sameAs` key is absent (no empty array, no malformed JSON-LD); rendered on `/`, `/about`, `/startup`. No repository config or env currently holds a profile URL, so it stays empty — **no URL was invented**.

Legitimate candidates, to be added ONLY once each exists and is controlled by the owner:
- LinkedIn company page (`https://www.linkedin.com/company/<slug>`)
- Crunchbase organization (`https://www.crunchbase.com/organization/<slug>`)
- GitHub organization (`https://github.com/<org>`) — if §GitHub is done
- official Facebook page / TikTok / X / YouTube — only official, only if actively maintained

Syntax: `ORGANIZATION_SAME_AS=https://www.linkedin.com/company/tappyai,https://www.crunchbase.com/organization/tappyai` (Production). Never list a personal profile as the organization's.

## 6. Order of operations after deploy

1. Confirm apex→www redirect and `NEXT_PUBLIC_SITE_URL`. 2. Search Console (domain property) → sitemap → 7 URL inspections. 3. Bing (import from GSC) → sitemap → `INDEXNOW_KEY` set → IndexNow verified. 4. Cốc Cốc URL submissions. 5. Profiles → `ORGANIZATION_SAME_AS`. 6. T+7 validation plan.
