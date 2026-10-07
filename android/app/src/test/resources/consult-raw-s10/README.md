# Consult V2 — §10 real UAT run (web "AI tư vấn ổn định", b01b53c, 30/09)

From the private bucket `gs://tappyai-uat-evidence/evidence/s10-2026-09-30/scenarios-55e298e/raw/`:
TRAVEL-1/2 t7 (trip plans with `[TAPPY_PLAN]`), ENT-1 t7 and FOOD-1 t7 (plan turns in headings),
TRAVEL-3 t2 (flight — `Xem giá trên <hãng>` links via `/go/at`). `a:` tool-result payloads are
trimmed to `a:[]` and Google photo `token=` values replaced by `token=REDACTED`; every other frame
is byte-for-byte. Used by `ConsultS10RawReplayTest`.
