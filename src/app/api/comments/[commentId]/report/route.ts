import { NextRequest } from 'next/server'
import { handleReport } from '@/lib/safety/userReports'

// POST /api/comments/{commentId}/report — report a comment. Behind REPORTS_ENABLED (404 while off). See lib/safety/userReports.ts.
export async function POST(req: NextRequest, { params }: { params: { commentId: string } }) {
  return handleReport(req, 'comment', params.commentId)
}
