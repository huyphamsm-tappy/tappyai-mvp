# `dev:reset` — Local Development Reset Utility

A permanent developer utility that restores a **completely clean, verified local
development environment** with a single command. It is not a feature, migration, or
refactor — it only manages the local dev environment.

## Usage

```bash
npm run dev:reset          # reset + verify, then STOP (leaves a clean environment)
npm run dev:reset:keep     # reset + verify, then KEEP the dev server running
# custom port:
PORT=4000 npm run dev:reset
```

Implemented as a single pure-Node script — [`scripts/dev-reset.mjs`](../scripts/dev-reset.mjs).
**No extra dependencies.** Cross-platform (Windows / macOS / Linux). Requires **Node 18+**
(uses the built-in global `fetch`).

## What it does (expected behaviour)

| Step | Action |
|---|---|
| **1. Stop** | Stops only the process **listening on the dev port** (default 3000). Uses `netstat`+`taskkill` on Windows, `lsof`+`kill` on macOS/Linux. **It never kills unrelated apps** — it is scoped strictly to the dev port. |
| **2. Clean** | Deletes only the two build caches: `.next` and `node_modules/.cache`. |
| **3. Verify deps** | Quick integrity check (`node_modules` present + `npm ls --depth=0`). Reinstalls **only if** real corruption is detected (`missing` / `invalid` / `UNMET`). Peer-dependency warnings are ignored. Never reinstalls unnecessarily. |
| **4. Fresh server** | Starts a fresh `npm run dev`, waits until it responds, and reports the `Ready in …` time. Fails fast if it can't start within 90 s. |
| **5. Health check** | Verifies **Home**, **Chat**, and **Reviews** return `200` and render the `TappyAI` marker, one API endpoint (`/api/suggested-prompts`) responds, and scans the dev-server output for compile/runtime errors. |

Then, by default, it **stops the server it started** and exits `0` (healthy) or `1` (a
health check failed). With `--keep` (`dev:reset:keep`) it leaves the verified server
running so you can start developing immediately.

### Example output

```
[dev:reset 1] Stopping dev processes
  ✓ stopped process on :3000 (PID 21164)
[dev:reset 2] Cleaning caches
  ✓ removed .next
  ✓ node_modules\.cache already absent
[dev:reset 3] Verifying dependencies
  ✓ dependency tree OK
  ✓ no reinstall needed
[dev:reset 4] Starting fresh dev server
  ✓ server up (1597ms)
[dev:reset 5] Health check
  ✓ Home loads (200)
  ✓ Chat loads (200)
  ✓ Reviews loads (200)
  ✓ API /api/suggested-prompts responds (200)
  ✓ no server errors in dev output
  ✓ stopped process on :3000 (PID 17496)
✔ Environment reset & verified healthy. Run `npm run dev` to start developing.
```

## When to use it

- The dev server is stuck, showing stale content, or Fast Refresh has gone weird.
- After switching branches with large dependency or route changes.
- After an interrupted/crashed dev run, or an orphaned process is holding port 3000.
- When you want a one-shot confidence check that the local environment is clean and healthy.

## When **NOT** to use it

- **In CI or production** — it is a local developer convenience only.
- **To fix runtime/data issues** — it does not touch the database, Supabase, env vars,
  or application state. (Reminder: local place-search running on the free OSM fallback is a
  known **missing-API-keys** configuration matter — see the environment investigation — not
  something a reset fixes.)
- **As a substitute for `npm install`** after intentionally changing `package.json` — it only
  reinstalls on detected corruption, not on intended dependency changes.
- **When you have uncommitted work in `.next`/cache you somehow rely on** — those are deleted.

## Safety guarantees

It **never** deletes or modifies: `node_modules` (beyond its `.cache`), `package-lock.json`,
git files, environment files (`.env*`), or any application/business/API/database code. Process
termination is strictly limited to whatever is listening on the dev port.
