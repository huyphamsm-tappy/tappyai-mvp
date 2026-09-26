import { NextResponse } from 'next/server'

// 410 Gone — a route that existed and has been intentionally removed, so a caller learns the
// difference between "never existed" (404) and "withdrawn" (410) and stops retrying. Used to
// retire the music-reuse endpoints (F-024): the "use this sound" path let one user take audio from
// another user's clip, and the whole path is withdrawn. A clip still plays its OWN audio — that
// never went through these endpoints.
export function gone(feature: string): NextResponse {
  return NextResponse.json(
    { error: 'gone', message: `This feature has been removed.`, feature },
    { status: 410 },
  )
}
