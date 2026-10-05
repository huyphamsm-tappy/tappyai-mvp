# Real `/api/chat` streams of the Web FINAL Agent (TAPPY_AGENT=1)

Captured 2026-10-05 from the Web final `a43948d41684386a46857077b02b6f413e025d1f` (`docs/audit/CONSULTATIVE-FINAL-HANDOFF.md`),
production build served locally with `next start`, `TAPPY_AGENT=1`, AUDIT environment (real Luna + Serper), request exactly as Android sends it
(`x-tappy-surface: android`, `x-tappy-caps: ask`, `chatSessionId`, `userLocation` for the place turns, Bearer of an audit test account).

Used by `AgentFinalReplayTest`. Frames are byte-for-byte what the route wrote, except that each `a:` (tool-result) payload is replaced by
`a:{"trimmed":true}` — Android never reads `a:` and the payloads are provider data. No key, token or session value is in these files (scanned).

| File | Turn |
|---|---|
| `A_general.raw.txt` | "Xin chào, bạn là ai?" — no tool, one model call |
| `B_local_discovery.raw.txt` | "tìm 3 quán phở ngon gần đây" (GPS) — `search_places`; progress `searching` → `found` → `finishing`, preliminary then decision places frame |
| `C_follow_up_carried.raw.txt` | "quán số 2 mở tới mấy giờ?" (same session) — answered from the carried card, no tool |
| `D_trip_plan.raw.txt` | "Lên kế hoạch đi Đà Nẵng 3 ngày 2 đêm cho 2 người" — `get_trip_data` bundle + a complete `[TAPPY_PLAN]` |
| `E_flight.raw.txt` | "vé máy bay từ Sài Gòn đi Quy Nhơn ngày mai bao nhiêu?" — booking hand-off only, fare "chưa xác minh được" |
| `limit-429.json` | the real body of the 429 an audit account got after its 10th question of the day |
