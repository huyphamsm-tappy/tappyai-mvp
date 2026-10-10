# Launcher icon — provenance and composition

**Source of truth:** `store/launcher-logo-approved-1024.webp` — the FINAL APPROVED TappyAI logo as supplied by the
owner on 2026-10-10 (1024x1024 RGBA, transparent background, SHA-256
`f4ea602f0804461708406333262e6ec67de8d9e234adc29940794c549c15c0b0`). Its visible pixels are identical to
`app/src/main/res/drawable-nodpi/tappyai_logo.png` (the transparent-RGB values differ only where alpha = 0).
It is NOT the older tile `share_otter_mark.png` / `store/icon-512.png` (blue rounded square).

**Derived resource:** `app/src/main/res/drawable-nodpi/ic_launcher_foreground.png` — 648x648 (108dp @ 6x) canvas.
The approved image is only scaled (LANCZOS, factor 0.4346) and translated; nothing is removed or recoloured. Its
minimum enclosing circle over pixels with alpha >= 128 (centre 508,472, radius ~456 px of the source) is centred on
the canvas with radius 33dp, i.e. exactly the adaptive-icon safe zone, so no mask can cut the mascot, the bubble,
the sparkles or the wordmark. The soft outer glow (alpha < 128) may be clipped by a mask; that is intended.

**Background layer:** `drawable/ic_launcher_background.xml`, solid white (the approved image is presented on white).

**Not provided (needs design):** a monochrome themed-icon layer (Android 13+) and a one-colour notification
silhouette — neither can be derived faithfully from the approved artwork. Notifications keep the legacy
monochrome glyph `drawable/ic_stat_notification.xml`; it is not the mascot.
