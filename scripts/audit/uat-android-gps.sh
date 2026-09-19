#!/bin/bash
# UAT (2026-09-20) — put the emulator at Quận 1 (10.7769, 106.7009) and prove it.
# `adb emu geo fix` does NOT take on the Pixel_8_uat image (measured 2026-09-19: the fused provider stayed
# at 37.42,-122.08 = Mountain View after three fixes). The test-provider path does. Run this BEFORE the
# first Android turn and again after any emulator restart; the real proof is the GPS column of
# `node scripts/audit/uatturns.mjs docs/audit/uat/2026-09-20 --md` after the first model turn.
A="${ADB:-$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe}"; D="${DEVICE:-emulator-5554}"
MSYS_NO_PATHCONV=1 "$A" -s "$D" shell "appops set 2000 android:mock_location allow" >/dev/null 2>&1
MSYS_NO_PATHCONV=1 "$A" -s "$D" shell "cmd location providers add-test-provider gps" >/dev/null 2>&1
MSYS_NO_PATHCONV=1 "$A" -s "$D" shell "cmd location providers set-test-provider-enabled gps true" >/dev/null 2>&1
MSYS_NO_PATHCONV=1 "$A" -s "$D" shell "cmd location providers set-test-provider-location gps --location 10.7769,106.7009 --accuracy 5" >/dev/null 2>&1
"$A" -s "$D" shell pm grant com.tappyai.app.debug android.permission.ACCESS_FINE_LOCATION >/dev/null 2>&1
echo "fused now: $(MSYS_NO_PATHCONV=1 "$A" -s "$D" shell "dumpsys location" | grep -o 'Location\[fused [0-9.,-]*' | head -1)"
echo "expected : Location[fused 10.776900,106.700900  — if it still says 37.42,-122.08 do NOT start UAT"
