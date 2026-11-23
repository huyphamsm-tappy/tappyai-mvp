# Tappy — Anthropic Connectors Directory submission dossier (DRAFT, NOT SUBMITTED)

Where: claude.ai/directory/manage → Submit new → MCP connector (any paid Claude plan can submit; the portal is run by the account owner).
Source of the field list: Anthropic's submission and review-criteria pages (read 23/11/2026). Anything marked 🚧 is not ready; do not submit until every 🚧 is closed.

## Hard blockers before submitting (🚧)

1. 🚧 **A stable public HTTPS server URL on Tappy's own domain** (for example `https://tappyai.com/api/mcp`). Today the gateway is locked off in production (`MCP_GATEWAY` off) and the only working URL is a temporary tunnel on the owner's PC that changes every few hours. The URL slug is permanent once published and Anthropic's reviewers test the live server. Needs: production deploy with `MCP_GATEWAY=1`, `MCP_RESOURCE_URL`, `MCP_RESOURCE_METADATA_URL`, `MCP_AUTH_SERVER_URL`, a shared store (`KV_REST_*`) for the spend pool and rate limit, Supabase OAuth Server enabled on production, and the production OAuth consent page.
2. 🚧 **Data-source status.** The directory requires that the server calls the submitter's own first-party APIs or ones it legitimately proxies. Hotels come from Agoda (partner, affiliate agreement) and the places/shopping tools use a third-party search provider. The owner must decide how this is declared in "Data handling" (first-party / proxied with permission / third-party) and confirm Tappy's right to resell that data to a directory listing.
3. 🚧 **Company name, website and primary contact** (legal entity) — owner to provide; not invented here.
4. 🚧 **Public documentation** for setup and usage (a help page is enough) — a connector section on `/how-to-use` or a page on `/about`; the English copy below is ready, the page is not published.
5. 🚧 **Icon** for the listing: the Tappy otter logo (`public/branding/otter-logo.png`, 512×512) is the intended file; confirm it is what the owner wants shown.

## Already satisfied

- Every tool has a `title` and `readOnlyHint` / `destructiveHint` annotations (`src/lib/mcp/toolCatalog.ts`); no tool writes, pays or books; names are well under 64 characters.
- Read and write are separate: the five search tools and the itinerary job tools are read-only/draft; no catch-all tool.
- OAuth 2.0 through Supabase OAuth Server with dynamic client registration and RFC 9728 metadata (verified end to end with Claude.ai on 23/11/2026).
- Errors are specific (`MARKET_UNSUPPORTED`, `SUPPORTED_MARKET_REQUIRED`, `PROVIDER_UNAVAILABLE`, …) with actionable messages.
- No tool reads conversation history, memory or user files.
- Privacy policy: `https://tappyai.com/privacy` (exists; check that it covers the connector's data before submitting).
- Support contact: `support@tappyai.com`.

## Listing fields (ready to paste)

**Server name (≤100):** `Tappy — Vietnam places, hotels and shop prices`

**One-liner (≤200):** `Vietnam places, restaurants, attractions, Agoda hotel rates and shop prices from Tappy, an AI built for Vietnam.`

**Description (≤2,000):** use the Full description in `APP-DIRECTORY-LISTING.md` (it has no pricing and no competitor names; that file is already the approved App Directory copy).

**Categories (1–5):** travel; local search / maps; shopping (choose from the portal's list).

**URL slug (permanent):** `tappy`

**Documentation URL:** 🚧 (see blocker 4)
**Privacy policy URL:** `https://tappyai.com/privacy`
**Support contact:** `support@tappyai.com`

**Primary use cases:** find places, restaurants and attractions in Vietnam; check hotel rates for given dates through Agoda; compare product prices from Vietnamese shops; draft a trip itinerary from those results.
**Prerequisites:** a free Tappy account (sign-in through Tappy's own consent screen).
**Reads / writes:** reads only (draft itineraries are returned to the assistant; nothing is booked, paid or changed).

**Authentication:** sign-in required; OAuth 2.0 (Supabase OAuth Server, dynamic client registration). No Anthropic-held client credentials needed.

**Data handling:** 🚧 (see blocker 2). No personal health data. No sponsored content (affiliate links to Agoda are tracked booking links and are disclosed as partner links).

**Test & launch:** the submitter must confirm that every tool was run through MCP Inspector or as a custom connector in Claude. Run on 23/11/2026 as a custom connector in Claude.ai: search_hotels (Đà Lạt, Đà Nẵng). 🚧 Re-run all five search tools and the itinerary job tools against the production URL before confirming. Do not put credentials in the portal; Anthropic emails for test access (a reviewer test account on production is needed).

**Compliance acknowledgments (7):** the owner ticks them personally after reading them: directory guidelines, first-party API use, financial transactions (Tappy does none), AI media generation (none), prompt injection, conversation data collection (none), public documentation.
