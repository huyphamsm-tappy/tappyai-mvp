import { NextRequest } from 'next/server'
import { handleReport } from '@/lib/safety/userReports'

// POST /api/messaging/messages/{id}/report — report a message in a conversation the caller is in. Behind REPORTS_ENABLED (404 while off).
// Same handler as comment and user reports (lib/safety/userReports.ts): one table (user_reports), one writer, one reviewer ping.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handleReport(req, 'message', params.id)
}
