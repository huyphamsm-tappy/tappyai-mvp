# Screenshots — capture guide

Screenshots are organized **by feature**: `screenshots/<feature>/<screen>.<desktop|mobile>.png`.

> ⚠️ **Why this folder is a guide, not pre-filled:** the browser-automation tooling used to build
> this baseline returns screenshots **inline** (for viewing/verification) and cannot write full-page
> PNG files to a repo path (`save_to_disk` produced no readable file). The **authoritative design
> measurements are read directly from source** (see `../README.md` §1 — exact tokens, not estimated).
> This folder is the place to drop the visual references, captured by the owner or a headless tool.

## How to capture (per screen in `../README.md` §2)
- **Desktop:** viewport width **1440px**, full page.
- **Mobile:** viewport width **390px** (iPhone 12/13/14), full page.
- **Theme:** the app shell + Reviews are **dark-first** — capture in the default (dark) theme; add a
  `.light` variant only where the light/dark toggle materially changes the screen (Home, Profile, Deals).
- Log in first (most screens are auth-gated). URLs are in `../README.md` §2/§6.

## Suggested folders (mirror the feature groups)
```
screenshots/
  auth/            login · register · onboarding · zalo-finish
  home/            home
  chat/            chat-new · chat-conversation
  reviews/         feed · post-detail · create-post · creator-profile · user-profile · comment-drawer · share-modal · sound-sheet
  deals/           deals · service-detail · subscription · split-bill
  profile/         me · account · edit · history · bookings · favorites · preferences · price-watches · tappy-knows · integrations · notifications · settings · posts
  tools/           music · scan · translate · currency · game · viet-content
  fortune/         boi-hub · tarot · tu-vi · cung-hoang-dao
  states/          loading-skeleton · error · not-found · language-picker
```

Naming: `feed.desktop.png`, `feed.mobile.png`, `home.mobile.light.png`, etc.
