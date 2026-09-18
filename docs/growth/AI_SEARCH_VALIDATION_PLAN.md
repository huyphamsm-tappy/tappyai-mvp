# AI / Search validation plan — execute AFTER production release

**Purpose:** replace assumptions with observations. Until this runs on production, no claim of discovery, citation or recommendation is valid.
**Cost:** $0 — manual sessions on free tiers; no API, no tooling purchase.

## Protocol

1. **When:** T+7, T+14, T+30 days after release (indexing takes "a few days to a few weeks" — developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl). Repeat monthly afterwards.
2. **Precondition checks (T+0):** Google Search Console property verified, sitemap submitted, `site:tappyai.com` shows ≥ 1 result; Bing Webmaster Tools verified, sitemap submitted, IndexNow key set (`INDEXNOW_KEY`) and key file reachable; `curl -A "OAI-SearchBot" https://www.tappyai.com/about` returns 200; `/llms.txt`, `/feed.xml`, `/opensearch.xml` return 200.
3. **Environment:** logged-out where possible; fresh private window per platform; location set to Vietnam / Ho Chi Minh City where the platform allows; language as listed per query (vi or en). Do not personalise (no prior TappyAI history in the account used).
4. **Capture:** for every query, save (a) full-page screenshot, (b) every cited/linked URL copied verbatim, (c) timestamp (ISO, Asia/Ho_Chi_Minh), (d) platform + mode (e.g. "Google → AI Overview shown: yes/no", "ChatGPT → search invoked: yes/no"), (e) classification.
5. **Classification (one per query per platform):**
   - `NOT_PRESENT` — no TappyAI URL or mention anywhere.
   - `DISCOVERY` — a tappyai.com URL appears among results/links (Google blue link, Bing result, "Sources" list).
   - `CITATION` — the answer text is attributed to a tappyai.com page (inline citation / footnote).
   - `SOURCE` — the answer visibly uses TappyAI content but attributes it elsewhere or not at all (record the overlap).
   - `RECOMMENDATION` — the answer tells the user to use TappyAI / lists it as a tool or service.
   - `BRAND_ONLY` — appears only for the branded queries (Q31–Q35).
6. **Record sheet:** `docs/growth/validation/<date>.csv` with columns `query_id, platform, mode, language, timestamp, ai_answer_shown, tappy_urls, classification, screenshot_path, notes`.
7. **Do not** repeat a query more than once per session per platform (repeat prompts change answers); do not click TappyAI links from the session before capturing (avoids personalisation).

## Platforms and modes

| Platform | Mode(s) to record | Notes |
|---|---|---|
| Google Search | web results; AI Overview (if shown); AI Mode tab | vi queries from a VN IP where possible |
| Bing | web results; Copilot answer in Bing | |
| Microsoft Copilot (copilot.microsoft.com) | chat with web search | |
| ChatGPT (free tier) | with search on (globe icon) | note "Sources" panel |
| Gemini (gemini.google.com) | default | note whether it shows sources |
| DeepSeek (chat.deepseek.com) | "Search" toggle ON | |
| Grok (grok.com / X) | default and DeepSearch | |
| Perplexity (free) | default | record every source card |
| Claude (claude.ai, web search on) | default | |

## The 35 queries

Q1–Q30 are non-brand intent queries (the acquisition question). Q31–Q35 are branded controls (do they even know the entity?). "Relevant page" = the TappyAI page that *could* legitimately answer.

| # | Query | Lang | Intent | TappyAI relevant page | What would count as RECOMMENDATION |
|---|---|---|---|---|---|
| Q1 | tối nay ăn gì ở Sài Gòn | vi | food, undecided | `/food` | "dùng TappyAI để hỏi…" |
| Q2 | What should I eat tonight in Ho Chi Minh City? | en | food | `/food` | lists TappyAI as a tool |
| Q3 | quán bún bò ngon quận 1 mở cửa tối | vi | food, specific | `/food` example / a public `/r/*` | cites a `/r/*` answer |
| Q4 | Best places to eat near District 1 | en | food | `/food` | |
| Q5 | nhà hàng hẹn hò lãng mạn ở TP.HCM | vi | food, occasion | `/food` | |
| Q6 | I need a restaurant for a date in HCMC | en | food, occasion | `/food` | |
| Q7 | cà phê yên tĩnh để làm việc ở Đà Nẵng | vi | food/work | `/food` example | |
| Q8 | quán chay ngon gần Hồ Gươm | vi | food | `/food` example | |
| Q9 | cuối tuần này đi đâu chơi ở Sài Gòn | vi | entertainment/travel | `/entertainment` | |
| Q10 | What should I do in Ho Chi Minh City this weekend? | en | entertainment | `/entertainment` | |
| Q11 | lịch trình 3 ngày Đà Lạt cho cặp đôi | vi | travel plan | `/travel` example / `/r/*` | cites a plan page |
| Q12 | Help me plan a 3 day trip to Vietnam | en | travel plan | `/travel` | |
| Q13 | khách sạn gần biển Nha Trang tầm 1 triệu/đêm | vi | travel, budget | `/travel` example | |
| Q14 | đi Phú Quốc tháng 10 có gì cần lưu ý | vi | travel, timing | `/travel` example | |
| Q15 | laptop khoảng 20 triệu để làm việc văn phòng | vi | shopping, budget | `/shopping` example | |
| Q16 | máy hút bụi robot dưới 8 triệu nên mua loại nào | vi | shopping | `/shopping` example | |
| Q17 | điện thoại pin trâu tầm 6 triệu | vi | shopping | `/shopping` example | |
| Q18 | Compare shopping options for a robot vacuum under 8 million VND | en | shopping compare | `/shopping` | |
| Q19 | kem chống nắng cho da dầu loại nào tốt | vi | shopping/beauty | `/shopping` example | |
| Q20 | spa massage thư giãn ở quận 7 | vi | spa | `/spa` example | |
| Q21 | Where should I go for a spa in HCMC? | en | spa | `/spa` | |
| Q22 | tiệm nail uy tín gần Cầu Giấy | vi | spa/beauty | `/spa` example | |
| Q23 | link này có phải lừa đảo không | vi | scam check intent | `/scam-shield` | "dùng Scam Shield / TappyAI để kiểm tra" |
| Q24 | how to check if a link is a scam in Vietnam | en | scam check | `/scam-shield` | |
| Q25 | kiểm tra link lừa đảo miễn phí | vi | scam tool search | `/scam-shield` | tool listed |
| Q26 | tin nhắn trúng thưởng có phải lừa đảo không | vi | scam message | `/scam-shield` | |
| Q27 | AI assistant for daily life in Vietnam | en | product discovery | `/about` | TappyAI named |
| Q28 | trợ lý AI tiếng Việt cho ăn uống mua sắm du lịch | vi | product discovery | `/about` | TappyAI named |
| Q29 | Chrome extension to ask AI about selected text | en | extension discovery | `/extension` | extension named |
| Q30 | tiện ích Chrome kiểm tra link lừa đảo | vi | extension/scam | `/extension`, `/scam-shield` | |
| Q31 | TappyAI | — | brand | `/`, `/about` | entity card / correct description |
| Q32 | TappyAI là gì | vi | brand | `/about` | |
| Q33 | What is TappyAI? | en | brand | `/about` | |
| Q34 | TappyAI Scam Shield | — | brand+feature | `/scam-shield` | |
| Q35 | TappyAI extension | — | brand+extension | `/extension` | |

## Success thresholds (pre-registered, so the result cannot be re-framed later)

- **Indexing** (Google, Bing): by T+14, `site:tappyai.com` returns `/`, `/about`, the five hubs, `/scam-shield`, `/extension`. If not, the problem is indexing, not content.
- **Branded entity** (Q31–Q33): by T+30, Google/Bing return `/about` or `/` first; at least one AI assistant describes TappyAI correctly (matches `/about`). If an assistant describes it wrongly, that is the first fix (the entity layer).
- **Non-brand discovery** (Q1–Q30): any `DISCOVERY` or `CITATION` by T+30 is a positive signal to be recorded, **not** a claim to be extrapolated. Zero at T+30 is the expected baseline for a new domain and is not a failure of the technical layer.
- **Recommendation**: report the count of `RECOMMENDATION` outcomes as-is. Do not build a strategy on a single occurrence.

## Attribution cross-check

For the same window, pull `computeGrowthMetrics().acquisition.firstQueriesBySource` for `geo_google`, `bing_search`, `geo_chatgpt`, `browser_extension`, `browser_search`, `pwa_shortcut`. A platform that "cites" TappyAI in the manual test but sends zero first queries is a citation, not a channel.
