# UAT3 — downloadable QR card to the approved design (2026-09-27)

Rendered with the shipped `renderBrandedQrCard` (bundled as-is, run on @napi-rs/canvas in a scratch dir), for
two throwaway audit users; each exported PNG decoded with OpenCV `QRCodeDetector` (`decode.log`):

| size | user 1 (vi) | user 2 (en) |
|---|---|---|
| full 1200×2062 | OK | OK |
| phone screen (card 540 px wide) | OK | OK |
| small print (card 413 px ≈ 3.5 cm @300 dpi, code ≈ 2.3 cm) | OK | OK |
| small print + Gaussian blur | OK | OK |
| 300 px wide | OK | OK |

The decoded URLs, opened on :3007 (`/users/<id>`), return 200 with each user's own name ("UAT P0 1" / "UAT P0 2").

**Found while testing — pre-existing encoder bug, fixed in the same commit:** `src/lib/qr/qrcode.ts` (since
`66c84ee`) wrote the SECOND copy of the format information transposed. Before the fix OpenCV decoded **none** of
its codes — not the card, not a bare matrix for "HELLO". The on-screen web QR used the same encoder. Phone camera
apps may have tolerated it (they can read copy 1 alone); that was not measured. Regression test:
`src/lib/qr/qrFormatInfo.test.ts` (fails 3/3 on the old encoder, passes on the fix). Android uses ZXing and is unaffected.

Not on the card, by owner decision: @username, App Store / Google Play badges (no public listing), handwriting,
skyline, paw prints.
