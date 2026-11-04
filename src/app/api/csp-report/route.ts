import { NextRequest, NextResponse } from 'next/server'
import { clientIpKey } from '@/lib/security/rateLimit'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { createDedupe, violationKey, violationsOf } from '@/lib/security/cspReport'

// POST /api/csp-report - where the browser reports what the Report-Only policy (script-src without 'unsafe-inline') would have blocked.
// Public by nature (the browser sends it with no credentials), so: a small body, a per-caller cap, no echo, always 204. What is logged is the
// privacy-safe record from lib/security/cspReport.ts, once per distinct violation per instance.
export const runtime = 'nodejs'
const MAX_BODY_BYTES = 20_000
const firstTime = createDedupe()

export async function POST(req: NextRequest) {
  const done = new NextResponse(null, { status: 204 })
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return done
  if (!(await publicRateLimit(`csp-report:${clientIpKey(req)}`, 30, 60_000)).ok) return done
  let body: unknown
  try { body = JSON.parse((await req.text()).slice(0, MAX_BODY_BYTES)) } catch { return done }
  for (const v of violationsOf(body)) {
    if (firstTime(violationKey(v))) console.log(JSON.stringify({ type: 'tappyai_csp_violation', ...v }))
  }
  return done
}
