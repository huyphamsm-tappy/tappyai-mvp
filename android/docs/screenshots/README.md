# Feature Screenshots

Canonical reference screenshots — one (or a small set) per feature, captured on the emulator
(`TappyAI_Test`, pixel-density 420, phone width). Used for fast UI review and internal docs.

| File | Screen |
|---|---|
| `home.png` | Home launchpad (greeting, quick actions, empty states) |
| `chat.png` | Chat tab (seeded conversation, composer) |
| `discovery.png` | Explore tab = Discovery hub (search, 5 domain groups, For You empty) |
| `maps.png` | Maps (search, filter chips, map canvas placeholder, list/map) |
| `profile.png` | Profile landing (identity placeholder, Account section) |
| `notifications-off.png` | Notifications, push toggle **off** |
| `notifications-on.png` | Notifications, push toggle **on** ("What you'll receive" revealed) |

## Convention

- Capture at the feature's **Runtime Verification** step, once build + runtime pass.
- One screenshot per meaningful state (add `-<state>` suffix, e.g. `notifications-on`), not per screen variant.
- Post-auth screens are reached via the temporary force-auth toggle used for runtime verification
  (`AppNavHostViewModel`), then that toggle is reverted before the final build — the UI shown is
  identical to a real session.

## Refresh

Re-capture with the app on the target screen:

```bash
adb exec-out screencap -p > android/docs/screenshots/<name>.png
```
