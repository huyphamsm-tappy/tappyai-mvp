# Tappy — Cursor listing notes (28/11/2026; research only, nothing submitted)

Owner decision (D5, 23/11/2026): Cursor is an approved host and the gateway already accepts Cursor's OAuth callback.

## What was found (public web, 28/11/2026)
- Cursor documents a curated MCP directory (cursor.com docs, MCP directory page) with one-click install and OAuth built in. Secondary sources say a server that is not listed can be requested. **No official, step-by-step submission process was found in the search results**; the exact way to be listed is unverified.
- There is also a community site, cursor.directory, where servers are listed per server with an HTTP configuration. How to submit there was not confirmed either.
- Several web pages announce that a server was "featured on cursor.store" and ask the owner to "claim a listing". These look like spam; do not act on any such email or page.

## What works today without any listing
Cursor users can already add Tappy by URL: server `https://www.tappyai.com/api/mcp`, OAuth sign-in on Tappy's own consent screen (the Cursor callback is approved). The public documentation page is `https://www.tappyai.com/connector`.

## Next step
The owner (or em with the owner's go-ahead) checks the Cursor docs page and cursor.directory for the current submission route, then reuses the listing copy in `APP-DIRECTORY-LISTING.md` and the source declaration in `ANTHROPIC-DIRECTORY-SUBMISSION-DOSSIER.md` (D3). Cursor is a coding tool: expect it to care about install config and tool descriptions, not commerce rules.
