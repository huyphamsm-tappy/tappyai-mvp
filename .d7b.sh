#!/bin/bash
cd /c/wtrel
export REPLAY=1 REPLAY_SUITE=scenarios,realTyping STYLE_LUNA6=1
echo "B2 start $(date -u +%H:%M:%S)" > .d7b.log
npx vitest run scripts/consult/replay --project app > .d7b.out 2>&1
echo "B2 end $(date -u +%H:%M:%S)" >> .d7b.log
ls -dt scripts/consult/replay/out/* | head -2 >> .d7b.log
echo DONE >> .d7b.log
