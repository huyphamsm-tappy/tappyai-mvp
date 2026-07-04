export function normalizeSearch(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase()
}
