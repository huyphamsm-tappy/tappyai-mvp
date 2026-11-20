import { notFound } from 'next/navigation'
import { SHOW_VIET_CONTENT } from '@/lib/config/product'

// The content writer ("Viết") is hidden (owner decision 20/11/2026, SHOW_VIET_CONTENT): the page and its API stay in the codebase, the route answers 404 until the flag is flipped back.
export default function HiddenToolLayout({ children }: { children: React.ReactNode }) {
  if (!SHOW_VIET_CONTENT) notFound()
  return children
}
