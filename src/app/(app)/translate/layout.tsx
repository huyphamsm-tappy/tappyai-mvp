import { notFound } from 'next/navigation'
import { SHOW_TRANSLATE } from '@/lib/config/product'

// Translate is hidden (owner decision 18/11/2026, SHOW_TRANSLATE): the page and its API stay in the codebase, the route answers 404 until the flag is flipped back.
export default function TranslateLayout({ children }: { children: React.ReactNode }) {
  if (!SHOW_TRANSLATE) notFound()
  return children
}
