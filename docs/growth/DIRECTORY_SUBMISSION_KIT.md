# Directory / ecosystem listing kit — TappyAI

**Status:** preparation only. **Nothing has been submitted.** Every listing below requires an owner account and a manual submission; none is automated from this repo (automating directory submissions is exactly the spam pattern the task forbids).

## Why this exists

Google states that "one of the factors used to determine quality is understanding if other prominent websites link or refer to the content" (google.com/search/howsearchworks/how-search-works/ranking-results). Wikidata's notability bar is "serious and publicly available references" (wikidata.org/wiki/Wikidata:Notability). An answer engine reconciles an entity across independent pages. Legitimate third-party listings are therefore the one free, controllable input into *reputation* — the layer no on-site change can produce. They are **ASSISTED** acquisition: some carry their own organic search (Product Hunt, AlternativeTo, G2), most are entity/backlink support.

## Canonical copy (use verbatim so every listing agrees — entity consistency)

| Field | Value |
|---|---|
| Name | TappyAI |
| URL | https://www.tappyai.com |
| Tagline (≤60) | vi: Chạm đến mọi dịch vụ – AI Agent cá nhân hóa · en: Touch Every Service – Your Personal AI Agent |
| One-liner (≤120) | A Vietnamese-first AI assistant for food, shopping, travel, entertainment and beauty, with Scam Shield for fraud checks. |
| Short (≤250) | TappyAI answers everyday questions in Vietnam — where to eat, what to buy, where to go, which spa — with one reasoned pick, the source and a link. Scam Shield checks suspicious links, QR codes and messages. Free; no sign-in to start. |
| Long | (use `/about` text: https://www.tappyai.com/about) |
| Category | AI assistant · Lifestyle · Local guide · Consumer |
| Pricing | Free |
| Logo | https://www.tappyai.com/branding/otter-logo.png |
| Social preview | https://www.tappyai.com/og/tappyai-v2.png |
| Founder | Huy Pham (linkedin.com/in/phạm-huy-313592253) |
| Contact | support@tappyai.com |
| Country | Vietnam |
| Languages | Vietnamese, English |
| Extension page | https://www.tappyai.com/extension |
| Story | https://www.tappyai.com/startup |

## Candidate directories

Verify each site's current terms at submission time; policies change. "Free" below means a free listing tier exists per the directory's public pages at the time of writing — not that every feature is free.

| Directory | Type | Free tier? | Organic discovery? | Acquisition or SEO/entity? | Automatable? | Owner effort | Worth it |
|---|---|---|---|---|---|---|---|
| Product Hunt | product launch community | yes | yes (launch day + long-tail search on PH) | ASSISTED acquisition + backlink | no (manual launch) | 1–2 h + launch day | **yes** — time after release, when the loop is live |
| AlternativeTo | software directory | yes | yes (search "alternatives to …") | ASSISTED + backlink | no | 30 min | yes |
| There's An AI For That | AI tool directory | free submission queue exists; paid fast-track | some | mostly entity/backlink | no | 20 min | yes (free queue only) |
| Futurepedia / AI tool aggregators | AI tool directories | free queue exists on several; paid options | some | entity/backlink | no | 20 min each | optional; pick 2–3, never mass-submit |
| G2 / Capterra | software review sites | free vendor profile | yes for B2B; weak for consumer VN | entity | no | 1 h | low priority (consumer product) |
| Crunchbase | company database | free basic profile | entity signal; used by answer engines for "who makes X" | entity | no | 30 min | **yes** |
| LinkedIn Company Page | official profile | free | entity + social | entity | no | 30 min | **yes** (then add to `ORGANIZATION_SAME_AS`) |
| GitHub (public repo for the **extension only**) | developer discovery | free | yes (GitHub search, Google) | ASSISTED for the extension; trust signal for reviewers | no (owner decision: what to open-source) | 1 h | optional — `extensions/browser` is self-contained plain JS; publishing it separately would not expose the web app |
| Hacker News "Show HN", r/SideProject, r/Vietnam | communities | free | yes, once | ASSISTED | **never automate** | 1 h | after release only; one honest post, no repeats |
| Wikidata | knowledge graph | free | entity | entity | no | — | **NOT ELIGIBLE YET** — needs independent references (Wikidata:Notability criterion 2); do not create |
| Google Business Profile | local listing | free | local | — | no | — | **NOT ELIGIBLE** — GBP requires a customer-visitable location or in-person service (support.google.com/business/answer/3038177); TappyAI is an online service. Do not create |
| Google Play / App Store | app stores | Play: one-time fee; App Store: annual fee | yes (store search + Google surfaces app listings) | TRUE store discovery once listed | no | owner | out of scope for this phase (Android release pipeline is a separate decision) |

## `sameAs` rule

Only after a profile is created by the owner and verified as official, add it to `ORGANIZATION_SAME_AS` (comma-separated https URLs). The Organization JSON-LD on `/`, `/about`, `/startup` then carries it. Never list a profile that does not exist.

## What NOT to do

- No mass submissions, no paid "featured" placements, no directories that require reciprocal links.
- No fake reviews, no self-reviews, no incentivised reviews.
- No "AI tool" directories that scrape and republish content without permission.
