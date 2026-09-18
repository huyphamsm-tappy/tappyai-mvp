import { atomFeedXml, FEED_MAX } from '@/lib/discovery/browserFeeds'
import { listPublicSharedResults } from '@/lib/share/sharedResultStore'

// Atom feed of the newest LISTED public results. ISR-cached like the sitemap;
// one indexed read per hour at most; the store lists status=public and
// owner_is_anonymous=false only, so nothing noindex can appear here.
export const revalidate = 3600

export async function GET(): Promise<Response> {
  let results: Awaited<ReturnType<typeof listPublicSharedResults>> = []
  try {
    results = await listPublicSharedResults({ limit: FEED_MAX })
  } catch {
    // An empty feed beats a 500; the entries return at the next revalidation.
  }
  return new Response(atomFeedXml(results), {
    status: 200,
    headers: { 'Content-Type': 'application/atom+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600, s-maxage=3600' },
  })
}
