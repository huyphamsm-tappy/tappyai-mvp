import { indexNowKey } from '@/lib/discovery/indexNow'

// The IndexNow key file: `/.well-known/indexnow/<key>.txt` answers the key in
// plain text so the engines can verify the host owns the submissions. 404
// unless the key is configured AND the requested file name is that key —
// the route never confirms a guess. Env-gated like the App Links files.
export const dynamic = 'force-dynamic'

export function GET(_req: Request, { params }: { params: { key: string } }): Response {
  const key = indexNowKey()
  if (!key || params.key !== `${key}.txt`) return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } })
  return new Response(key, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400', 'X-Robots-Tag': 'noindex' } })
}
