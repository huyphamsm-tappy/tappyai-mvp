import type { PlacesMarkerPayload } from '@/lib/recommendation/marker'

// Places from the PERSISTED marker only (already filtered by `mayPersist`, so
// a Google-sourced row carries identifiers and app-derived values, never
// Places content). Rendered plainly and server-side; nothing is fetched.
export default function PublicPlacesList({ places, locale }: { places: PlacesMarkerPayload; locale: 'vi' | 'en' }) {
  const items = places.items.filter(i => i.name)
  if (items.length === 0) return null
  return (
    <ol className="mt-4 space-y-3">
      {items.map((p) => (
        <li key={p.id} className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
          <div className="flex items-start gap-3">
            {p.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" loading="lazy" className="h-16 w-16 flex-shrink-0 rounded-xl object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {p.recommended ? '⭐ ' : ''}{p.name}
              </p>
              {p.address && <p className="text-sm text-gray-600 dark:text-gray-400">{p.address}</p>}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {typeof p.rating === 'number' && <span>★ {p.rating.toFixed(1)}{p.ratingCount ? ` (${p.ratingCount})` : ''}</span>}
                {p.openingHours && <span> · {p.openingHours}</span>}
              </p>
              {p.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.actions.slice(0, 3).map((a) => (
                    <a
                      key={a.url}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      data-cta-type={a.kind}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs font-medium"
                    >
                      {a.platform ?? (locale === 'en' ? a.kind : a.kind)}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
