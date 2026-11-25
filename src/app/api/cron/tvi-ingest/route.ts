import { NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { fetchPublicPage } from '@/lib/security/safePageFetch'
import { robotsAwareFetch, sharedRobotsGate } from '@/lib/ai/consultative/researchLoop'
import { ingestOfficialTargets, tviIngestOn } from '@/lib/tvi/ingestOfficial'
import { OFFICIAL_TARGETS } from '@/lib/tvi/officialTargets'

export const runtime = 'nodejs'
export const maxDuration = 60

// TVI official-content ingestion cron (R13 §8, phase B): reads the owner-curated official pages, honours robots.txt on every hop, stages the facts they declare as candidates.
// OFF unless TVI_INGEST=1 (locked off in a production runtime). NOT scheduled in vercel.json.

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!tviIngestOn()) return NextResponse.json({ ok: true, skipped: 'flag_off' })

  const fetchPage = robotsAwareFetch(
    (url, signal, hopGate) => fetchPublicPage(url, { signal, decodeCompressed: true, userAgent: 'TappyAI/1.0 https://www.tappyai.com', ...(hopGate ? { hopGate } : {}) }),
    sharedRobotsGate(),
  )
  const run = await ingestOfficialTargets(OFFICIAL_TARGETS, { fetchPage: url => fetchPage(url) })
  return NextResponse.json({ ok: true, run })
}
