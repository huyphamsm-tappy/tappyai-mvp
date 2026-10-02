import { openSearchXml } from '@/lib/discovery/browserFeeds'

// Static OpenSearch description; discovered through <link rel="search"> in the root layout.
export const dynamic = 'force-static'
export const revalidate = 86400

export function GET(): Response {
  return new Response(openSearchXml(), {
    status: 200,
    headers: { 'Content-Type': 'application/opensearchdescription+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  })
}
