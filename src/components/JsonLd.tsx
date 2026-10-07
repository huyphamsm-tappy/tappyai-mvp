import { serializeJsonLd } from '@/lib/security/jsonLd'

/**
 * The ONLY way the app renders structured data. Never write `application/ld+json` with
 * `JSON.stringify` inline — see `serializeJsonLd` for the script-breakout it allows.
 * Server component: no hooks, safe in any page.
 */
export default function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
}
