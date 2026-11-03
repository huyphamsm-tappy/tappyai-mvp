import { NextRequest } from 'next/server'
import { handleReport } from '@/lib/safety/userReports'

// POST /api/users/{id}/report — report a user. Behind REPORTS_ENABLED (404 while off). See lib/safety/userReports.ts.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handleReport(req, 'user', params.id)
}
