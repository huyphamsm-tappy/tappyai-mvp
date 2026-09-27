# UAT3 — location prompt (d059ae1) and push registration (7ba545d), Galaxy A12, 2026-09-27

Physical phone SM-A127F / Android 12, debug build against `localhost:3007` + audit; one throwaway account
(deleted afterwards: auth 0, rows 0, queue 0). Samsung Keyboard untouched.

| check | result | evidence |
|---|---|---|
| First send with no permission | ONE system prompt; the message ("quan an ngon quan 1") is sent AFTER the prompt closed (dismissed = not allowed) | `01-prompt-first-send.jpg`, `02-after-dismiss.jpg`, `thread-user-turns.json` |
| 5 consecutive place turns after the refusal | **0 prompts**, 5/5 messages reached the server (6/6 with the first) | `five-turns.log`, `10-p1…14-p5.jpg`, `thread-user-turns.json` |
| "quan an ngon gan day" with no location | the turn goes out; the reply asks for the district in the chat | `15-near-no-gps.jpg` |
| 📍 "Tìm quanh đây" chip (explicit) | prompt shown again; after "Không cho phép" the chip prompt is still sent | `16-nearby-chip-prompt.jpg`, `thread-user-turns.json` |
| FCM before sign-in | 0 subscribe calls, 0 errors (was 400/401 at every start-up) | `fcm-guest-phase.log` |
| FCM after sign-in | `POST /api/notifications/subscribe` → 200; `notification_subscriptions` row provider=fcm, enabled=true | `fcm-after-signin.log` (DB row checked in the session) |

**New finding, NOT fixed:** turn 7's stored reply holds two slightly different versions of the same clarify text
back to back (`finding-duplicated-reply-turn7.json`). Replaying the same turn against `/api/chat` (alone, and with the
same 12-message history) produced a single reply both times, so it is not deterministic; parked for the P1 queue.
