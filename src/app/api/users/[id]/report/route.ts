import { NextRequest } from 'next/server'
import { handleReport } from '@/lib/safety/userReports'
import { clientIpKey } from '@/lib/security/rateLimit'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'

// POST /api/users/{id}/report — report a user. Behind REPORTS_ENABLED (404 while off). See lib/safety/userReports.ts.
// SEC4 slice 5: a shared-store cap per IP in front of the handler (which also keeps its own per-user cap): every report can alert the moderators.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const rl = await publicRateLimit(`report:${clientIpKey(req)}`, 60, 600_000)
  if (!rl.ok) return rateLimitedResponse(req, rl, 'user_report')
  return handleReport(req, 'user', params.id)
}
