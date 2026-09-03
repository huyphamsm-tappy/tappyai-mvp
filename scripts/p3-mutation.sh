#!/usr/bin/env bash
# P3 mutation harness: remove a protection, prove the suite notices, put it back.
# A security test that still passes with the guard deleted is not a security test.
set -u

run_mutation () {
  local name="$1" file="$2" test="$3"; shift 3
  cp "$file" "$file.bak"
  "$@"
  if npx vitest run "$test" >/dev/null 2>&1; then
    echo "NOT DETECTED  | $name"
  else
    echo "detected      | $name"
  fi
  mv "$file.bak" "$file"
}

RL=src/lib/security/rateLimit.ts
SE=src/lib/ai/streamEnrichment.ts
CP=src/lib/explore/contentProcessor.ts

run_mutation "M1 clientIp trusts leftmost XFF again" "$RL" src/lib/security/__tests__/clientIpTrust.test.ts \
  perl -0pi -e "s/const platform =/const platform = normalizeIpAddress((req.headers.get('x-forwarded-for')||'').split(',')[0]) ??/" "$RL"

run_mutation "M2 clientIp skips IP validation" "$RL" src/lib/security/__tests__/clientIpTrust.test.ts \
  perl -0pi -e "s/const nearest = normalizeIpAddress\(hops\[hops.length - 1\]\)/const nearest = hops[hops.length - 1]/" "$RL"

run_mutation "M3 clientIp prefers client XFF over platform header" "$RL" src/lib/security/__tests__/clientIpTrust.test.ts \
  perl -0pi -e "s/normalizeIpAddress\(req.headers.get\('x-vercel-forwarded-for'\)\)/normalizeIpAddress((req.headers.get('x-forwarded-for')||'').split(',')[0])/" "$RL"

run_mutation "M4 buffered path stops stripping un-owned images" "$SE" src/lib/ai/security/imageEgressBoundary.test.ts \
  perl -0pi -e "s/return stripUnownedImages\(withoutTikTok, owned\)/return (withoutTikTok)/" "$SE"

run_mutation "M5 ownership oracle always says owned" "$SE" src/lib/ai/security/imageEgressBoundary.test.ts \
  perl -0pi -e "s/isOwnedImageUrl\(url, owned\) \? whole : alt/whole/" "$SE"

run_mutation "M6 live gate becomes a pass-through" "$SE" src/lib/ai/security/imageEgressBoundary.test.ts \
  perl -0pi -e "s/export function releasableLiveText\(text: string, endOfStream = false\): string \{/export function releasableLiveText(text: string, endOfStream = false): string { if (1) return text;/" "$SE"

run_mutation "M7 live gate stops holding a forming token" "$SE" src/lib/ai/security/imageEgressBoundary.test.ts \
  perl -0pi -e "s/if \(endOfStream \|\| stripped.length - open <= FORMING_IMAGE_LIMIT\) return stripped.slice\(0, open\)/if (false) return stripped.slice(0, open)/" "$SE"

run_mutation "M8 contentProcessor stops fencing" "$CP" src/lib/explore/contentProcessorBoundary.test.ts \
  perl -0pi -e "s/fenceUntrusted\('explore_content', value.slice\(0, limit\)\)/value.slice(0, limit)/" "$CP"

run_mutation "M9 contentProcessor stops capping input length" "$CP" src/lib/explore/contentProcessorBoundary.test.ts \
  perl -0pi -e "s/fenceUntrusted\('explore_content', value.slice\(0, limit\)\)/fenceUntrusted('explore_content', value)/" "$CP"

run_mutation "M10 category validator accepts anything" "$CP" src/lib/explore/contentProcessorBoundary.test.ts \
  perl -0pi -e "s/typeof value === 'string' && \(CATEGORIES as readonly string\[\]\).includes\(value\)/typeof value === 'string'/" "$CP"
