# iOS brain freeze — 23/11/2026

The iOS chat ("brain" client side) is frozen to the **local web build `web-freeze-20261123`** (branch `feat/brain-r13-p1`, `D:\TappyAI-wt\wt-integration`). The web build is not deployed yet; iOS is written to the web build as the specification and is built to also work against today's production server.

| | |
|---|---|
| Branch | `ios/consolidated-20261122` |
| Tag | `ios-brain-freeze-20261123` |
| Production iOS build (baseline) | 214 = commit `4f2d698` (tag `ios-prod-build214-4f2d698`) |
| Web reference | tag `web-freeze-20261123`. The chat brain files did not change between `web-freeze-20261121` and `web-freeze-20261123` (only `api/memory`). |
| CI | macOS build + unit tests green on the commit the tag points at (see the run named in the commit message of the tag's release notes). Not run on a device or against the local web server. |

## What the iOS client does like the web (all with tests)

- **Request:** `mode` (auto / deep), `x-tappy-surface: ios`, `x-tappy-caps: card`, location (a NEW fix for a "near me" question, never an older one; without a location when it fails), reply style as an object `{tone, length}`, attachments, age declaration, consent.
- **Annotations read:** places (with a hotel's reference price and the provider's price band), research, charts, doc media, progress, turn status, safety (emergency card), presentation blocks (table, subject cards, gallery, questions, booking), subject pictures.
- **Header read:** `x-tappy-deep-reset` (one fixed sentence when a report was asked for with none left).
- **Drawn:** article layout, plan card (stays, dishes, stop pictures, costs, tips, PDF, share link), shopping card, place cards, media cards, sources chip, quick-read sheet for ordinary links, emergency card.
- **Data rules:** an old chat opens (paging by `before`), a save sends messages only (a renamed title survives), a memory tag removal sends all five categories.
- **Safety (Apple 1.2):** the web's report reasons, unblock on a blocked profile, the owner hides a comment (only where the server reports `p8.commentModeration`).
- Every server value the app draws is re-checked with the web's own limits (one line, no control characters, no protocol marker, bounded sizes, https only, no address in a name, no integer conversion of an unbounded number).

## Written to work against today's production server too

Production web (deployed 04/11, `main` 33cef8b) has none of the new brain code. A new iOS build against it: the new frames never arrive (nothing is drawn), a missing `/api/link-preview` opens the link itself, a missing `/api/deals/partners` shows the plain empty state, the hide-comment button needs the server's flag, paging by `before` is ignored (same as before), a save without a title works.

## Left out on purpose

| Not done | Why |
|---|---|
| Wikipedia chips on bold names, side drawers | The web's wide-screen workspace layout (`NEXT_PUBLIC_WORKSPACE_V206`). On a phone iOS already has the server's subject cards and the declared subject cards with pictures. |
| Designed cover and photo gallery for the plan PDF | Export decoration; would change the PDF writer shared with the research report. |
| Jump from `[n]` to the source line in a research report | The web uses page anchors; the sources are listed on the research card. |
| "Ask Tappy about this clip" (`context: explore_clip`) | Needs a new button on the clip screen: a feature, not parity of the existing chat. |
| The web's "Chốt một lựa chọn" card | Behind the web build flag `NEXT_PUBLIC_CONSULT_V3`. The server already sends the question as lines plus tap chips to a client that does not declare the `ask` capability. |
| Research canvas | iOS shows the research card, charts and exports (Markdown, PDF, Word). |

## Not verified

No device run. No run against the local web server. The server-dependent parts (presentation blocks, safety card, subject pictures, stays and dishes, hotel price, deep-reset note, link reader, hide comment) were tested with the frames the web code writes, not with the web itself.

## Rule

A change to the chat protocol files (`StreamingClient`, `ContentParser`, `Presentation`, `SubjectImages`, `EmergencyCard`, `ChatService`, `ChatViewModel`, the plan and place models) after this tag needs the matching web change named in the commit message and this file updated in the same change.
