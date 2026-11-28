# Tappy — Anthropic Connectors Directory submission dossier (DRAFT, NOT SUBMITTED; updated 27/11/2026 for the 9-tool production catalog)

Where: claude.ai/directory/manage → Submit new → MCP connector (any paid Claude plan can submit; the portal is run by the account owner).
Source of the field list: Anthropic's submission and review-criteria pages (read 23/11/2026). Anything marked 🚧 is not ready; do not submit until every 🚧 is closed.

## Hard blockers before submitting (🚧)

1. ✅ **Stable public HTTPS URL**: `https://www.tappyai.com/api/mcp` (note `www`; the bare domain redirects 308). Live on production since 27/11/2026: `MCP_GATEWAY=1`, OAuth Server on, shared store on, spend ceilings set. Metadata: `https://www.tappyai.com/.well-known/oauth-protected-resource`.
2. 🟡 **Data-source declaration (D3): wording approved by the owner 28/11/2026 (declare in full); rights confirmation stays with the owner and the lawyer.** Declared as:
   - **Hotels (`search_hotels`): proxied with permission.** Rates come from Agoda through Tappy's affiliate partnership (Agoda Lite API); links carry Tappy's Agoda partner id. 🚧 the owner confirms the partnership allows serving rates through a public listing (agreement text is not in this repository).
   - **Places, restaurants, attractions, shopping, coach page: third-party.** Results are retrieved live from a third-party search provider (Serper, which returns Google Search/Maps data) and ranked by Tappy; nothing is persisted beyond a 24-hour shared cache (hard expiry). 🚧 the owner confirms the provider terms allow this use; the lawyer reads the Maps-content caveat in `src/lib/ai/tools/serperCache.ts`.
   - **Deals (`search_deals`): proxied with permission.** Tappy's own table of partner offers (partner cards with tracked affiliate links) plus an Accesstrade offers feed for Lazada and Vexere. The Accesstrade feed has produced no rows yet (daily job under investigation, diagnostics table `cron_diagnostics` since 28/11/2026): until it does, deals show partner cards with no amounts, as stated in the honest limits below.
   - **Clips (`search_clips`): first-party.** Tappy users' public clips only; no author, no video file returned.
   - **Scam check (`check_scam`): first-party plus third-party lookups.** Tappy's Scam Shield rules and the scam warnings published on the public website of Vietnam's Ministry of Public Security (reviewed weekly; no connection to the Ministry's databases), plus third-party reputation and WHOIS/DNS lookups on the domain only. It never says "safe".
   Prerequisite wording for the portal: a free Tappy account (signed in on Tappy's own consent screen).
3. 🚧 **Company name, website and primary contact (D4)** — owner to provide; not invented here.
4. 🟡 **Public documentation**: `https://www.tappyai.com/connector` is live (setup for Claude/ChatGPT, tools and limits, link to privacy). Owner and lawyer read it before submission.
5. 🚧 **Icon**: Tappy otter logo `public/branding/otter-logo.png` (512×512); owner confirms.
6. 🚧 **Lawyer review** of `/privacy` section 7 and of the terms for user clips shown outside Tappy (clips are returned only if public, without author).
7. 🚧 **Reviewer test account on production**: Anthropic asks by email; the owner creates or approves it. No credentials in the portal.

## Already satisfied

- Nine read-only tools, each with `title` and annotations (`src/lib/mcp/toolCatalog.ts`, catalog v1.4): `search_places`, `search_restaurants`, `search_attractions`, `search_hotels` (needs check-in and check-out), `search_shopping`, `check_scam`, `search_deals`, `search_clips`, `search_coach`. Nothing writes, pays or books; names are well under 64 characters.
- The five itinerary tools (`create_itinerary` and four job tools) are hidden and not callable at launch (`MCP_JOBS_ENABLED` unset); definitions are kept in code. Do NOT list them in the portal.
- OAuth 2.0 through Supabase OAuth Server with dynamic client registration and RFC 9728 metadata; verified end to end in Claude.ai on production 27/11/2026. Only Claude, ChatGPT and Cursor callbacks are approved at the consent screen and the gateway.
- Production checks 27/11/2026 in Claude.ai: `check_scam`, `search_deals` (10 items; tracked links for Traveloka, Agoda, Booking.com, Vexere, Lazada, Shopee), `search_clips` (0 results is correct today), `search_coach` (one Vexere route page, no times or prices), `search_hotels` (Đà Nẵng, 15–17/12/2026: 10 hotels with Agoda prices, all links carry Tappy's Agoda `cid`).
- 🚧 Not yet run on production: `search_places`, `search_restaurants`, `search_attractions`, `search_shopping` (run on UAT 23/11/2026). Run them before ticking the confirmation.
- Specific errors with actionable messages; no tool reads conversation history, memory or user files.
- Privacy policy `https://www.tappyai.com/privacy` (section 7 covers the connector). Support `support@tappyai.com`.

## Listing fields (proposed)

**Server name (≤100):** `Tappy — Vietnam places, hotels, deals and scam check`

**One-liner (≤200):** `Vietnam places, restaurants, attractions, Agoda hotel rates, shop prices, partner deals, public clips, coach pages and a link scam check, from Tappy.`

**Description (≤2,000):** the Full description in `APP-DIRECTORY-LISTING.md`.

**Categories (1–5):** travel; local search / maps; shopping (choose from the portal's list).
**URL slug (permanent):** `tappy`
**Server URL:** `https://www.tappyai.com/api/mcp`
**Documentation URL:** `https://www.tappyai.com/connector`
**Privacy policy URL:** `https://www.tappyai.com/privacy`
**Support contact:** `support@tappyai.com`

**Primary use cases:** find places, restaurants and attractions in Vietnam; check hotel rates for given dates through Agoda; compare product prices from Vietnamese shops; see partner deals with tracked links; find public Tappy clips; get a coach (xe khách) booking page; check whether a link matches known scam patterns.
**Prerequisites:** a free Tappy account (sign-in on Tappy's own consent screen).
**Reads / writes:** reads only. Nothing is booked, paid or changed.
**Authentication:** OAuth 2.0 (Supabase OAuth Server, dynamic client registration). No Anthropic-held credentials.
**Data handling:** see blocker 2 (sources declared 28/11/2026; rights confirmation open). No health data. Partner links are tracked affiliate links and are disclosed as partner links. Logs hold tool, time, duration, result count and hashed install and account references, never the question text.

**Honest limits to state (do not overclaim):**
- Coach: one booking-page link; no times, prices or seats; coach only (no train or flight).
- Deals: partner links; no discount amounts unless the offer has them.
- Clips: public clips only; no author, no video file.
- Scam check: never says "safe"; "not recognised" does not mean safe.
- Hotel prices are per night before taxes and fees; availability is not confirmed.

**Test & launch:** the owner confirms every tool was run as a custom connector in Claude. Done on production 27/11/2026 for five of the nine (see above); run the other four first. Do not put credentials in the portal; Anthropic emails for test access.

**Compliance acknowledgments (7):** the owner ticks them personally after reading them: directory guidelines, first-party API use, financial transactions (Tappy does none), AI media generation (none), prompt injection, conversation data collection (none), public documentation.
