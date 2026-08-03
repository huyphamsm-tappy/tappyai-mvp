import type { OfficialEntity } from '../types'

export function findMatchingBrand(
  domain: string,
  directory: OfficialEntity[],
): OfficialEntity | null {
  const d = domain.toLowerCase()

  const exact = directory.find(e =>
    e.domains.some(ed => ed.toLowerCase() === d),
  )
  if (exact) return exact

  const brandMatch = directory.find(e => {
    const slug = e.brand.toLowerCase().replace(/\s+/g, '')
    return slug.length >= 4 && d.includes(slug) && !e.domains.some(ed => ed.toLowerCase() === d)
  })
  return brandMatch ?? null
}
