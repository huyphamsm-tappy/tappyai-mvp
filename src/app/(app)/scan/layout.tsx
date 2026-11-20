import { notFound } from 'next/navigation'
import { SHOW_SCAN } from '@/lib/config/product'

// The scanner ("Quét") is hidden (owner decision 20/11/2026, SHOW_SCAN): the page and its API stay in the codebase, the route answers 404 until the flag is flipped back.
export default function HiddenToolLayout({ children }: { children: React.ReactNode }) {
  if (!SHOW_SCAN) notFound()
  return children
}
