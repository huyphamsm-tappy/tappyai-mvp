'use client'
// Gives ONE answer's render its entity chips (hooks cannot live in the message list's map, so the answer is wrapped in this render-prop scope).
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useEntityChips, type EntityChips } from './useEntityChips'
import { ENTITY_CHIP_ATTR } from '@/lib/chat/entityChips'

export function chipNameOf(target: EventTarget | null): string | null {
  const el = target as (HTMLElement & { closest?: (s: string) => HTMLElement | null }) | null
  const chip = el && typeof el.closest === 'function' ? el.closest(`[${ENTITY_CHIP_ATTR}]`) : null
  return chip?.getAttribute(ENTITY_CHIP_ATTR) ?? null
}

/** A click on a chip opens its profile; any other click goes where it went before. */
export function chipClick(chips: EntityChips, fallback: (e: MouseEvent<HTMLDivElement>) => void) {
  return (e: MouseEvent<HTMLDivElement>) => {
    const name = chipNameOf(e.target)
    if (name && chips.open(name)) { e.preventDefault(); return }
    fallback(e)
  }
}

/** Enter or Space on a focused chip does the same as a click. */
export function chipKeyDown(chips: EntityChips) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const name = chipNameOf(e.target)
    if (name && chips.open(name)) e.preventDefault()
  }
}

export default function EntityChipsScope({ text, enabled, exclude, children }: { text: string; enabled: boolean; exclude?: readonly string[]; children: (chips: EntityChips) => ReactNode }) {
  const chips = useEntityChips(text, enabled, exclude)
  return <>{children(chips)}</>
}
