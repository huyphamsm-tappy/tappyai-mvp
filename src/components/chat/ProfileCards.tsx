'use client'
// 15/11 (owner's mockup, tabs 3 and 4: "bố cục và layout giống vậy... để Tappy hiểu ngữ cảnh và chọn layout"): ONE CARD PER SUBJECT when an answer compares or lists two or more - a picture, the name (with a link
// mark), a one-line subtitle, the key points each with a bold label, the names of the sources, and a button to the subject's profile in the panel beside the chat.
// Two feeds, ONE look, so the layout never depends on which feed an answer happened to have:
//   · the points the MODEL declared (contract 'profiles', through present_blocks): its own labelled facts and the names of its sources;
//   · the subjects the SERVER resolved from the question (the [TAPPY_MEDIA] entities, Wikipedia): the first sentences of the summary as the points, "Wikipedia" as the source.
// Which answers get cards is decided by the content (two or more subjects), never by a topic. VIEW ONLY. The picture and the profile are Wikipedia's public summary of the same name (the
// entity-profile route: honest match only, Wikimedia pictures only); a subject it does not know shows an initial. A card carries no link of the model's own.
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, UserRound } from 'lucide-react'
import { entityKey } from '@/lib/chat/entityChips'
import { fetchEntityProfiles, type WikiEntity } from '@/lib/chat/entityProfiles'
import type { ProfilePoint } from '@/lib/presentation/contract'
import { subjectKey } from '@/lib/answerDoc/subjectImages'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { useTranslation } from '@/lib/i18n/useTranslation'

export interface CardItem {
  name: string
  subtitle?: string
  points: readonly ProfilePoint[]
  sources?: readonly string[]
  /** a picture the server already resolved (an https Wikimedia address); else the one the profile lookup finds */
  image?: string
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
/** A logo or a drawing is shown whole on a light tile; a photograph fills the tile from the top (faces stay in). */
const isLogo = (src: string) => /logo|\.svg|emblem|flag_of|coat_of_arms/i.test(src)

/** The first sentences of a summary as plain points (no label): at most `max`, each cut at a word. Pure. */
export function pointsFromSummary(summary: string, max = 3, len = 210): ProfilePoint[] {
  const sentences = summary.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=\p{Lu}|\d)/u).map(s => s.trim()).filter(s => s.length >= 12)
  return sentences.slice(0, max).map(s => {
    if (s.length <= len) return { text: s }
    const cut = s.slice(0, len)
    const at = cut.lastIndexOf(' ')
    return { text: `${(at > len * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:–—-]+$/, '')}…` }
  })
}

export default function ProfileCards({ title, items, onOpenProfile, onOpenName, label, look, eyebrow, fallbackImages, note }: {
  title?: string
  /** workspace v206 look: the title as the mockup's mono caps eyebrow (inside a `v206-ed` wrapper), numbered by `eyebrow` ("1.") */
  look?: boolean
  eyebrow?: string
  /** pictures the server found for subjects Wikipedia cannot illustrate, by subjectKey(name): used only when the subject has no Wikipedia picture */
  fallbackImages?: ReadonlyMap<string, string>
  /** a line under the title that says what the cards rest on (e.g. "reference only: no place data behind them") */
  note?: string
  items: readonly CardItem[]
  /** opens a subject's profile (the Wikipedia profile found for its name) beside the chat */
  onOpenProfile?: (profile: WikiEntity) => void
  /** opens a subject by its name when no profile was found (the older side panel, from what the server resolved) */
  onOpenName?: (name: string) => void
  label: { open: string; sources: string }
}) {
  const { locale } = useTranslation()
  const names = useMemo(() => items.map(i => i.name), [items])
  const [profiles, setProfiles] = useState<ReadonlyMap<string, WikiEntity>>(new Map())
  useEffect(() => {
    let live = true
    fetchEntityProfiles(names).then(m => { if (live) setProfiles(m) }, () => { /* no pictures: initials */ })
    return () => { live = false }
  }, [names])
  // 16/11 (UAT 60, question 5: six bank cards, each one line "12 months: 5.4%"): a card is for a subject that has more than one thing to say. Three or more subjects that each carry ONE line are a
  // table in disguise (a rate, a price, a score per name): they are drawn as one table, whatever the feed. Decided by the content, never by a topic.
  if (items.length >= 3 && items.every(i => i.points.length <= 1)) {
    return (
      <section data-block="profiles" data-flat className="my-3">
        {title && (look
          ? <h3 className="v206-h" data-testid="block-eyebrow">{eyebrow && <span className="v206-hnum">{eyebrow}</span>}{title}</h3>
          : <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>)}
        {note && <p data-testid="profiles-note" className="mb-2 font-mono text-[11.5px] text-amber-700 dark:text-amber-300">{note}</p>}
        <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700/70">
          <table data-testid="profiles-table" className="w-full text-left text-[14.5px] leading-snug text-gray-800 dark:text-gray-200">
            <tbody>
              {items.map(item => {
                const p = item.points[0]
                return (
                  <tr key={item.name} data-profile-row className="border-t border-gray-200 first:border-t-0 dark:border-gray-700/70">
                    <th scope="row" className="px-3 py-2.5 align-top font-semibold text-gray-900 dark:text-gray-50">
                      {item.name}
                      {item.subtitle && <span className="mt-0.5 block font-mono text-[12px] font-normal text-gray-500 dark:text-gray-400">{item.subtitle}</span>}
                    </th>
                    <td className="px-3 py-2.5 align-top">
                      {p ? <>{p.lead && <strong className="font-semibold">{p.lead}: </strong>}{p.text}</> : null}
                      {item.sources && item.sources.length > 0 && <span className="mt-1 block font-mono text-[11.5px] text-gray-400 dark:text-gray-500">{label.sources}: {item.sources.join(', ')}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    )
  }
  return (
    <section data-block="profiles" className="my-3 space-y-3">
      {title && (look
        ? <h3 className="v206-h" data-testid="block-eyebrow">{eyebrow && <span className="v206-hnum">{eyebrow}</span>}{title}</h3>
        : <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>)}
      {note && <p data-testid="profiles-note" className="font-mono text-[11.5px] text-amber-700 dark:text-amber-300">{note}</p>}
      {items.map(item => {
        const profile = profiles.get(entityKey(item.name)) ?? null
        const open = profile && onOpenProfile ? () => onOpenProfile(profile) : onOpenName ? () => onOpenName(item.name) : null
        const web = fallbackImages?.get(subjectKey(item.name))
        const image = item.image ?? profile?.image ?? (web && isSafeHttpsUrl(web) ? web : null)
        // 16/11: the profile's own one-line description only when it is in the reader's language (an English line under a Vietnamese name is a mismatch)
        const subtitle = item.subtitle ?? (profile?.description && profile.lang === (locale === 'en' ? 'en' : 'vi') ? profile.description : undefined)
        return (
          <article key={item.name} data-profile-card className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700/70 dark:bg-gray-900/60">
            <div className={`h-[104px] w-[104px] shrink-0 overflow-hidden rounded-xl ${image && isLogo(image) ? 'bg-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
              {image
                // eslint-disable-next-line @next/next/no-img-element -- a Wikimedia picture, host checked by entityProfiles / mediaHosts
                ? <img src={image} alt={item.name} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none' }} className={isLogo(image) ? 'h-full w-full object-contain p-2' : 'h-full w-full object-cover object-top'} />
                : <div aria-hidden="true" className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-500/20 to-violet-500/20 text-2xl font-semibold text-primary-700 dark:text-primary-200">{initials(item.name) || <UserRound size={28} />}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="flex items-center gap-1 text-lg font-semibold leading-tight text-gray-900 dark:text-gray-50">
                    {open
                      ? <button type="button" onClick={open} className="text-left hover:underline" data-testid="profile-name">{item.name}</button>
                      : <span>{item.name}</span>}
                    {open && <ArrowUpRight size={14} aria-hidden="true" className="shrink-0 text-primary-500" />}
                  </h4>
                  {subtitle && <p className="mt-0.5 font-mono text-[12px] text-gray-500 dark:text-gray-400">{subtitle}</p>}
                </div>
                {open && (
                  <button type="button" onClick={open} data-testid="profile-open"
                    className="shrink-0 rounded-lg border border-primary-500/40 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-500/20 dark:text-primary-200">
                    {label.open}
                  </button>
                )}
              </div>
              <ul className="mt-2.5 space-y-1.5 text-[14.5px] leading-snug text-gray-800 dark:text-gray-200">
                {item.points.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500/70" />
                    <span>{p.lead && <strong className="font-semibold">{p.lead}: </strong>}{p.text}</span>
                  </li>
                ))}
              </ul>
              {item.sources && item.sources.length > 0 && (
                <p className="mt-2.5 font-mono text-[11.5px] text-gray-400 dark:text-gray-500">{label.sources}: {item.sources.join(', ')}</p>
              )}
            </div>
          </article>
        )
      })}
    </section>
  )
}
