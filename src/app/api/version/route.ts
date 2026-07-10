import { NextResponse } from 'next/server'

// Returns the currently-deployed commit SHA. A running client compares this to
// the SHA baked into its own bundle (NEXT_PUBLIC_BUILD_ID); a mismatch means a
// newer build has shipped and the tab is stale → VersionWatcher reloads. Must be
// dynamic + no-store so it never itself gets cached.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { v: process.env.VERCEL_GIT_COMMIT_SHA || 'dev' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
