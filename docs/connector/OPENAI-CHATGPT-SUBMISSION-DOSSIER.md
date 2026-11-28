# Tappy — OpenAI / ChatGPT (apps as plugins) submission dossier (DRAFT, NOT SUBMITTED; written 28/11/2026)

Owner decision (D5, 23/11/2026): Claude, ChatGPT and Cursor are approved hosts; the gateway already accepts ChatGPT's OAuth callback. This file is the ChatGPT side of the Anthropic dossier (`ANTHROPIC-DIRECTORY-SUBMISSION-DOSSIER.md`): same server, same nine read-only tools, a different portal and different rules.
Where: OpenAI developer portal (plugin submission; apps are now submitted as plugins). Sources, read 28/11/2026: developers.openai.com `apps-sdk/app-submission-guidelines`, `plugins/deploy/app-review`, `apps-sdk/deploy/submission`. The tail of the submission page was summarised by the fetch tool, not read verbatim: re-check field limits and the screenshot spec in the live portal before submitting. Nothing below was tested against the portal.

## 1. What the portal needs, and where Tappy stands

| Need | Rule (OpenAI) | Tappy |
|---|---|---|
| Who submits | Organization owner, or a member with the "Apps Management Write" role (`api.apps.write`); EU data-residency projects cannot submit MCP plugins | 🚧 owner decides which OpenAI organization/project submits; must be a global-residency project |
| Verified identity | Individual or business verification in the Platform dashboard; the verified name is shown as publisher | 🚧 **D4: legal entity name** (owner). Business verification takes the company name |
| Stable public HTTPS server | One MCP server per plugin; origin cannot change between versions | ✅ `https://www.tappyai.com/api/mcp` (keep the `www` origin forever) |
| Domain verification | Serve the challenge token as plain text at `/.well-known/openai-apps-challenge` on the MCP host | 🚧 route not built; it is a few lines once the portal issues the token (do it then) |
| Auth | OAuth with dynamic client registration is supported; no API keys or bearer tokens; no client secret in the package | ✅ OAuth 2.0 + DCR + RFC 9728 metadata (verified end to end in Claude.ai); ChatGPT callback approved at the consent screen |
| Display name / subtitle / description | name ≤ 30, subtitle ≤ 30, description ≤ 4,000; no generic names, no "MCP" in the name; **no comparisons, no unverifiable claims, no advertising of prices, free trials, discounts or promotions**; do not imply OpenAI made or endorses it | Proposed: name `Tappy`, subtitle `Vietnam places and hotel rates` (30 chars), description = the connector part of `APP-DIRECTORY-LISTING.md` **without** the "In the Tappy app" paragraph and without the word deals as a selling point (see section 2) |
| URLs (all four, HTTPS) | website, support, privacy policy, terms of service | `https://www.tappyai.com`, `https://www.tappyai.com/support`, `https://www.tappyai.com/privacy`, `https://www.tappyai.com/terms` (confirm each is live and in English too) |
| Logo | PNG/JPEG/WebP/SVG, square, ≥ 48 px, ≤ 5 MiB | ✅ `public/branding/otter-logo.png` (512×512); owner confirms |
| Screenshots | The three pages give no spec | 🚧 ask the portal; likely stills of ChatGPT answers using the connector |
| Test cases | 5 positive (prompt, tools triggered, expected behaviour), 3 negative; pass on ChatGPT web and mobile; demo video URL | 🚧 to write now that all nine tools have run on production (see the Anthropic dossier); demo video is the owner's |
| Reviewer account | Demo account with sample data, **no MFA, no email/SMS code, no magic link**, must not expire; entered in the dashboard, never in the package | 🚧 owner creates a dedicated Tappy account (email + password) and confirms sign-in works without a code from outside the company network |
| Tool annotations | readOnly/destructive/openWorld set explicitly and true to behaviour; `openWorldHint: true` for public or open-ended entities | 🚧 **check:** `src/lib/mcp/toolCatalog.ts` sets `openWorldHint: false` on the job-control tools; the nine launch tools must be reviewed one by one (places, hotels, shopping, deals, clips, coach, scam check read public, open-ended data, so `true` is the honest value) before any submission |
| Tool output | Only data needed for the request; no internal ids, timestamps, trace ids | 🚧 audit each of the nine tool results against this (the connector page already says logs hold no question text) |
| Privacy | Policy covers categories, purposes, recipients, retention, user controls; no undisclosed tracking | 🟡 `/privacy` section 7 exists; lawyer review still open; tracked affiliate links must be disclosed as such (they are, in the listing copy) |
| Publication countries | Allowlist of ISO codes | Owner decides; Vietnam is not named as blocked anywhere in the pages read |

## 2. Where Tappy is most likely to be rejected (read before spending time)

OpenAI's guidelines are stricter than Anthropic's on commerce. From the pages read:
1. **Commerce is allowed only for physical goods; services and subscriptions are not**, checkout must be on the merchant's own domain, and plugins must not link straight to transactional pages. Hotel rates (Agoda) and the coach booking link (Vexere) are services and the links go to booking pages. The pages do not mention affiliate links or travel explicitly; one prohibited category is "high-chargeback, fraud-prone, or abusive travel services". This is a real risk, not a certainty.
2. **No advertising**, and descriptions may not advertise discounts or promotions. `search_deals` returns partner offers with tracked links; it could be read as advertising.
3. **Third-party data needs authorization**; plugins that are "primarily unofficial connectors or pass-through layers" are not approved. Agoda/Vexere/Lazada are partners (needs the written terms in hand), but the places data comes from a search provider.
4. User-generated content shown outside Tappy (`search_clips`) is not addressed by those pages.

**Recommendation (owner decides):** submit a **smaller first version** to ChatGPT: `search_places`, `search_restaurants`, `search_attractions`, `check_scam` (and `search_shopping` if the owner is comfortable), and leave out `search_hotels`, `search_coach`, `search_deals` and `search_clips` until the commerce questions are answered. A rejection costs a review cycle; a smaller approved app can add tools later (changed tool definitions are re-scanned). This needs a way to expose a different tool subset to ChatGPT than to Claude: not built; a small change in the gateway's per-host catalog (decision needed before anyone builds it).

## 3. Steps once the owner has decided

1. Owner: D4 (entity, verification), which tools to submit to ChatGPT, publication countries, reviewer account, demo video.
2. Em: (the four formerly untested tools were run on production on 28/11/2026, all fine) review the annotations and tool output of every tool to be submitted, build the challenge route and, if chosen, the per-host tool subset; write the five positive and three negative test cases.
3. Owner submits in the portal; em prepares the field values above ready to paste.
