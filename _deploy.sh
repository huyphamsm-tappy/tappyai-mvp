#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock
git add src/app/api/chat/route.ts
git commit -m "feat: step 1.2 - offline/online intent detection, search_places override for offline shopping"
git push origin main
echo PUSH_DONE
