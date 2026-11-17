import { notFound } from 'next/navigation'
import { SHOW_FORTUNE } from '@/lib/config/product'

// Fortune telling (/boi, /boi/tarot, /boi/tu-vi, /boi/cung-hoang-dao) is hidden (owner decision 18/11/2026, SHOW_FORTUNE): the pages and their modules stay in the codebase,
// every route under /boi answers 404 until the flag is flipped back.
export default function BoiLayout({ children }: { children: React.ReactNode }) {
  if (!SHOW_FORTUNE) notFound()
  return children
}
