import { headers } from 'next/headers'
import { normalizeLocale } from '@/lib/i18n/requestLocale'
import { planBrochureStrings } from '@/lib/i18n/planBrochure'
import { BRAND } from '@/lib/share/openGraph'

/**
 * A wrong or withdrawn plan link. Rendered by `notFound()` in the page, so the
 * response is a real HTTP 404 — this is only what the status carries.
 */
export default function PlanShareNotFound() {
  const s = planBrochureStrings(normalizeLocale(headers().get('accept-language')?.split(',')[0]))
  return (
    <div className="v3-theme dark v3-pb" data-plan-brochure-missing>
      <header className="v3-pb-bar">
        <a href="/" className="v3-pb-brand" aria-label={BRAND.name}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local SVG, no pipeline needed */}
          <img src="/logo.svg" alt="" aria-hidden="true" width={26} height={26} className="v3-pb-brand-mark" />
          <span>TAPPY</span>
        </a>
      </header>
      <main className="v3-pb-empty">
        <h1>{s.notFoundTitle}</h1>
        <p>{s.notFoundBody}</p>
        <a href="/" className="v3-pb-share">{s.notFoundCta}</a>
      </main>
    </div>
  )
}
