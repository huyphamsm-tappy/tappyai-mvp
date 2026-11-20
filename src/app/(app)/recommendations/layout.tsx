import { notFound } from 'next/navigation'
import { SHOW_RECOMMENDATIONS } from '@/lib/config/product'

// Recommendations ("Gợi ý cho bạn") is hidden (owner decision 20/11/2026, SHOW_RECOMMENDATIONS): the page and its API stay in the codebase, the route answers 404 until the flag is flipped back.
export default function HiddenToolLayout({ children }: { children: React.ReactNode }) {
  if (!SHOW_RECOMMENDATIONS) notFound()
  return children
}
