#!/bin/bash
cd /c/wtrel
export REPLAY=1 REPLAY_SUITE=scenarios,realTyping
for run in A1 A2 B; do
  if [ "$run" = "B" ]; then export STYLE_LUNA6=1; else unset STYLE_LUNA6; fi
  echo "=== $run start $(date -u +%H:%M:%S)" >> .d7.log
  npx vitest run scripts/consult/replay --project app >> .d7.$run.out 2>&1
  echo "=== $run end $(date -u +%H:%M:%S) exit $?" >> .d7.log
  ls -dt scripts/consult/replay/out/* | head -1 >> .d7.log
done
echo DONE >> .d7.log
