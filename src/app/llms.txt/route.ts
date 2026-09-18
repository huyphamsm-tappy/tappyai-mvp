import { llmsTxt } from '@/lib/discovery/llmsTxt'

// Static, cached, text/plain. See src/lib/discovery/llmsTxt.ts for what it is
// and — more importantly — what it is not (no claim of AI-engine appearance).
export const dynamic = 'force-static'
export const revalidate = 86400

export function GET(): Response {
  return new Response(llmsTxt(), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
