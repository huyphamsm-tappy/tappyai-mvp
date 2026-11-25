'use client'
// Layout slice 3 (14/11/2026, NEXT_PUBLIC_PRESENT_BLOCKS): draws the blocks the model declared (compare table, ask options, booking handoff) from the checked frame (presentation/read.ts).
// VIEW ONLY. The model's words are plain text. A booking is a real link the partner layer produced for the tool result the booking points at; this component never builds a URL.
import { Fragment, useState } from 'react'
import { ExternalLink, Plane, BedDouble, Bus, Ticket, Sparkles, ShoppingBag } from 'lucide-react'
import type { PresentationFrame } from '@/lib/presentation/read'
import type { BookingKind } from '@/lib/presentation/contract'
import { ACCESSTRADE_WRAPPER_HOSTS } from '@/lib/ccp/tracking/wrapperHosts'
import ProfileCards from '@/components/chat/ProfileCards'
import GalleryBlock from '@/components/chat/GalleryBlock'
import { subjectKey } from '@/lib/answerDoc/subjectImages'
import type { WikiEntity } from '@/lib/chat/entityProfiles'

const L = {
  vi: { pick: 'Tappy chọn', partner: 'Liên kết đối tác', login: 'Cần đăng nhập trên trang đối tác', app: 'Mở trong ứng dụng của đối tác', book: (m: string) => `Đặt qua ${m}`, openProfile: 'Xem hồ sơ Tappy', sources: 'Nguồn' },
  en: { pick: "Tappy's pick", partner: 'Partner link', login: 'Needs a login on the partner site', app: "Opens in the partner's app", book: (m: string) => `Book with ${m}`, openProfile: 'View Tappy profile', sources: 'Sources' },
}

const ICON: Record<BookingKind, typeof Plane> = { flight: Plane, hotel: BedDouble, transport: Bus, ticket: Ticket, activity: Sparkles, product: ShoppingBag }

const isWrapper = (url: string): boolean => { try { return (ACCESSTRADE_WRAPPER_HOSTS as readonly string[]).includes(new URL(url).hostname) } catch { return false } }

export default function PresentationBlocks({ frame, onSend, disabled, lang = 'vi', onOpenProfile, look, eyebrow, subjectImages, galleryImages, profilesNote }: {
  frame: PresentationFrame
  onSend: (text: string) => void
  /** an older answer: its options send nothing */
  disabled?: boolean
  lang?: string
  /** a subject card's profile, opened beside the chat; absent = no side panel in this layout, so the cards have no profile button */
  onOpenProfile?: (profile: WikiEntity) => void
  /** workspace v206 look: the heading of a card group / table as the mockup's mono caps eyebrow (needs the `v206-ed` wrapper above it) */
  look?: boolean
  /** the number in front of that eyebrow ("1."), when the page has two or more such headings */
  eyebrow?: string
  /** pictures the server found for subjects Wikipedia cannot illustrate, by subject key (answerDoc/subjectImages) */
  subjectImages?: ReadonlyMap<string, string>
  /** the pictures the server found for a declared gallery, by caption key (answerDoc/subjectImages) */
  galleryImages?: ReadonlyMap<string, string>
  /** a line under the subject cards' heading (what they rest on) */
  profilesNote?: string
}) {
  const t = lang === 'en' ? L.en : L.vi
  const [sent, setSent] = useState<string | null>(null)
  const locked = !!disabled || sent !== null
  return (
    <div className="mt-3 space-y-3">
      {frame.presentation.blocks.map(b => {
        if (b.type === 'compare') {
          return (
            <Fragment key={b.id}>
            {look && b.title && <h3 className="v206-h" data-testid="block-eyebrow">{eyebrow && <span className="v206-hnum">{eyebrow}</span>}{b.title}</h3>}
            <section data-block="compare" data-compare className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              {!look && b.title && <h3 className="px-4 pt-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{b.title}</h3>}
              <div data-scroll className="overflow-x-auto px-2 pb-2 pt-2">
                <table className="w-full min-w-[320px] border-collapse text-left text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className="w-[28%] p-2" />
                      {b.columns.map((c, i) => (
                        <th key={i} scope="col" data-pick={b.pick === i ? 'true' : undefined}
                          className={`p-2 align-bottom font-semibold ${b.pick === i ? 'rounded-t-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'text-gray-900 dark:text-gray-100'}`}>
                          {c}
                          {b.pick === i && <span className="mt-0.5 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">{t.pick}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri} className="border-t border-gray-100 dark:border-gray-800">
                        <th scope="row" className="p-2 align-top text-xs font-medium text-gray-500 dark:text-gray-400">{r.label}</th>
                        {r.cells.map((cell, ci) => (
                          <td key={ci} className={`p-2 align-top text-gray-800 dark:text-gray-100 ${b.pick === ci ? 'bg-emerald-50/60 dark:bg-emerald-950/40' : ''}`}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            </Fragment>
          )
        }
        if (b.type === 'gallery') {
          return <GalleryBlock key={b.id} shots={b.items.map(i => ({ caption: i.caption, src: galleryImages?.get(subjectKey(i.caption)) }))} />
        }
        if (b.type === 'profiles') {
          return <ProfileCards key={b.id} title={b.title} items={b.items} onOpenProfile={onOpenProfile} look={look} eyebrow={eyebrow} fallbackImages={subjectImages} note={profilesNote} label={{ open: t.openProfile, sources: t.sources }} />
        }
        if (b.type === 'ask') {
          return (
            <section key={b.id} data-block="ask" className="space-y-3">
              {b.questions.map((q, qi) => (
                <div key={qi}>
                  <p className="mb-1.5 text-sm font-medium text-gray-800 dark:text-gray-100">{q.text}</p>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(o => (
                      <button key={o} type="button" disabled={locked} aria-pressed={sent === o}
                        onClick={() => { if (locked) return; setSent(o); onSend(o) }}
                        className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-default disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )
        }
        if (b.type === 'booking') {
          const link = frame.links[b.id]
          if (!link) return null
          const Icon = ICON[b.kind]
          return (
            <section key={b.id} data-block="booking" className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300"><Icon size={20} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{b.title}</p>
                {b.detail && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{b.detail}</p>}
                {link.handoff === 'merchant_login' && <p className="text-[11px] text-amber-700 dark:text-amber-300">{t.login}</p>}
                {link.handoff === 'app' && <p className="text-[11px] text-amber-700 dark:text-amber-300">{t.app}</p>}
                {isWrapper(link.url) && <p className="text-[11px] text-gray-400 dark:text-gray-500">{t.partner}</p>}
              </div>
              <a href={link.url} target="_blank" rel="noopener noreferrer sponsored" data-cta-type="booking"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-400 px-3.5 py-2 text-xs font-bold text-gray-900 hover:bg-amber-300">
                {t.book(link.label)}<ExternalLink size={13} aria-hidden="true" />
              </a>
            </section>
          )
        }
        return null
      })}
    </div>
  )
}
