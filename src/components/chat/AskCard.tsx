'use client'
// The consult ASK turn, redesigned (owner 30/09 — docs/design/ask-card/): mascot header, numbered steps, photo tiles
// for "what kind" (one or more), icon tiles for who / when / budget / area (one), a free-text line with an example,
// and one big "Tìm cho tôi". VIEW ONLY — the server's [TAPPY_ASK] contract is unchanged and the reply is the same
// plain sentence as before (composeAskAnswer); sending with nothing chosen sends "Tìm cho tôi". Dark in both themes,
// as the mockup.
import { useEffect, useMemo, useState } from 'react'
import * as Icons from 'lucide-react'
import type { AskQuestionView } from '@/lib/structuredContent/parseAsk'
import { ASK_AREA_TINT, ASK_HEADER, ASK_STEP_SUB, askAreaOf, askIconOf, askSendText, askStepKind, askStepMulti, askTileKey } from '@/lib/structuredContent/askCardModel'

type Manifest = Record<string, { status?: string; url?: string; replacement?: string }>
let manifestPromise: Promise<Manifest> | null = null
function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch('/api/plan-images/manifest').then(r => (r.ok ? r.json() : null)).then(j => (j?.images ?? {}) as Manifest).catch(() => ({}))
  return manifestPromise
}
/** key → https url, following at most 3 replacements (R22); anything else shows the same-name placeholder. */
function resolveImage(m: Manifest, key: string): string | null {
  let k = key
  for (let i = 0; i < 4; i++) {
    const e = m[k]
    if (!e) return null
    if (e.status === 'active' && typeof e.url === 'string' && e.url.startsWith('https://')) return e.url
    if (e.status === 'replaced' && e.replacement) { k = e.replacement; continue }
    return null
  }
  return null
}

const EN = { title: 'What are we looking for?', sub: 'Pick a few things, Tappy finds the rest.', example: 'e.g. quiet, nice view…', more: 'Or tell me anything else…', go: 'Find it for me', sending: 'Searching…' }
const EN_SUB: Record<string, string> = { type: 'Pick one or more', party: 'Pick your group', time: 'Pick a time', budget: 'Pick a price range', other: '' }

// Display only: a range like "3-5" never breaks at its hyphen (U+2011); the SENT text keeps the option as sent.
const label = (o: string) => o.replace(/(\d)-(\d)/g, '$1\u2011$2')

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Sparkles
  return <C className={className} aria-hidden="true" />
}

/**
 * 🚨 The first reply of a chat is saved and `router.replace`d to /chat/<id>, which REMOUNTS ChatInterface — measured on
 * UAT 30/09: a tile picked in the first seconds was gone. Same answer as the place card's liveViewCache: an in-memory,
 * session-only hand-off of the picks (nothing written anywhere), keyed by the questions, dropped on send.
 */
const draftCache = new Map<string, { chosen: Record<string, string | string[]>; free: string }>()
const askSignature = (qs: AskQuestionView[]) => JSON.stringify(qs.map(q => [q.id, q.q, q.options]))

export default function AskCard({ questions, onSend, disabled, lang = 'vi' }: {
  questions: AskQuestionView[]
  onSend: (text: string) => void
  disabled?: boolean
  lang?: string
}) {
  const en = lang === 'en'
  const area = useMemo(() => askAreaOf(questions), [questions])
  const head = en ? EN : ASK_HEADER[area]
  const sig = useMemo(() => askSignature(questions), [questions])
  const [chosen, setChosen] = useState<Record<string, string | string[]>>(() => draftCache.get(sig)?.chosen ?? {})
  const [free, setFree] = useState(() => draftCache.get(sig)?.free ?? '')
  const [sent, setSent] = useState(false)
  const [manifest, setManifest] = useState<Manifest>({})
  useEffect(() => { let live = true; loadManifest().then(m => { if (live) setManifest(m) }); return () => { live = false } }, [])
  // The draft is written IN the tap handler, not in an effect: a tap landing in the same instant as the remount updates
  // an instance that unmounts before its effects run (UAT 30/09: 1 of 6 first taps lost that way).
  const draft = () => draftCache.get(sig) ?? { chosen, free }

  const locked = !!disabled || sent
  const send = () => {
    if (locked) return
    setSent(true)
    const d = draft()
    draftCache.delete(sig)
    onSend(askSendText(questions, d.chosen, d.free))
  }
  const toggle = (q: AskQuestionView, o: string, multi: boolean) => {
    const d = draft(), c = d.chosen
    const cur = Array.isArray(c[q.id]) ? (c[q.id] as string[]) : []
    const next = multi ? { ...c, [q.id]: cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o] } : { ...c, [q.id]: c[q.id] === o ? '' : o }
    draftCache.set(sig, { chosen: next, free: d.free })
    setChosen(next)
  }
  const typeFree = (v: string) => { draftCache.set(sig, { chosen: draft().chosen, free: v }); setFree(v) }
  const isOn = (q: AskQuestionView, o: string) => { const v = chosen[q.id]; return Array.isArray(v) ? v.includes(o) : v === o }

  return (
    <div data-ask-card data-ask-area={area} aria-busy={sent || undefined}
      className="mt-3 w-full max-w-[520px] overflow-hidden rounded-[22px] border border-[#1d2b4f] bg-gradient-to-b from-[#0f1a3a] to-[#0a1226] text-white shadow-[0_8px_30px_rgba(0,0,0,.35)]">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tappy/mascot-search.png" alt="" width={62} height={69} className="h-[69px] w-[62px] shrink-0 select-none" draggable={false} />
        <div className="min-w-0">
          <p className="text-[19px] font-bold leading-tight">{head.title}</p>
          <p className="mt-1 text-[13px] leading-snug text-[#8fa6d6]">{head.sub}</p>
        </div>
      </div>

      {questions.map((q, i) => {
        const kind = askStepKind(q)
        const multi = askStepMulti(kind)
        const n = q.options.length
        // README §1: photo tiles 2 columns on a narrow phone, 3 on a wide screen (3 choices: always 3; 4: 2×2 / one row).
        const cols = kind === 'type' ? (n === 3 ? 'grid-cols-3' : n === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2') : (n === 2 ? 'grid-cols-2' : n === 3 ? 'grid-cols-3' : 'grid-cols-4')
        const sub = en ? EN_SUB[kind] : ASK_STEP_SUB[kind]
        return (
          <fieldset key={q.id} disabled={locked} className="border-t border-[#172345] px-4 py-3.5" data-ask-step={q.id} data-ask-kind={kind}>
            <legend className="sr-only">{q.q}</legend>
            <div className="mb-3 flex items-start gap-3" aria-hidden="true">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-[14px] font-bold">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold leading-tight">{q.q}</p>
                {sub && <p className="mt-0.5 text-[12.5px] text-[#8a9bc2]">{sub}</p>}
              </div>
            </div>
            <div className={`grid ${cols} gap-2.5`}>
              {q.options.map(o => {
                const on = isOn(q, o)
                const ring = on ? 'border-[#3b82f6] shadow-[0_0_0_1px_#3b82f6,0_0_16px_rgba(59,130,246,.45)]' : 'border-[#22304f] hover:border-[#35507f]'
                const base = `relative border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa] disabled:cursor-default ${ring}`
                const tick = on && (
                  <span className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#3b82f6] ring-2 ring-[#0b1430]"><Icons.Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /></span>
                )
                const icon = askIconOf(o, kind, q.q)
                if (kind === 'type') {
                  const key = askTileKey(o)
                  const img = key ? resolveImage(manifest, key) : null
                  const [t1, t2] = ASK_AREA_TINT[area]
                  return (
                    <button key={o} type="button" aria-pressed={on} data-ask-option={q.id} data-image-key={key ?? ''} onClick={() => toggle(q, o, multi)}
                      className={`${base} overflow-hidden rounded-2xl bg-[#101b35]`}>
                      {tick}
                      <div className="relative aspect-[4/3] w-full"
                        style={img ? undefined : { background: `radial-gradient(120% 90% at 30% 15%, ${t1}, ${t2} 70%, #0b1226)` }}>
                        {img
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                          : <Icon name={icon} className="absolute left-1/2 top-[38%] h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-white/30" />}
                        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-[#0b1226] via-[#0b1226]/75 to-transparent px-2.5 pb-2 pt-6">
                          <Icon name={icon} className={`h-4 w-4 shrink-0 ${on ? 'text-[#93c5fd]' : 'text-[#7fa7ff]'}`} />
                          <span className="min-w-0 text-[13px] font-medium leading-tight">{label(o)}</span>
                        </div>
                      </div>
                    </button>
                  )
                }
                // Mockup: four choices stack icon over label; two or three sit icon-beside-label in one row.
                const shape = n >= 4 ? 'min-h-[68px] flex-col justify-center gap-1.5 px-1 py-2.5' : 'min-h-[48px] flex-row justify-center gap-2 px-2 py-2'
                return (
                  <button key={o} type="button" aria-pressed={on} data-ask-option={q.id} onClick={() => toggle(q, o, multi)}
                    className={`${base} flex items-center rounded-xl ${shape} ${on ? 'bg-[#11254f] text-[#dbeafe]' : 'bg-[#101b35] text-[#dbe4f7]'}`}>
                    {tick}
                    <Icon name={icon} className={`h-5 w-5 ${on ? 'text-[#60a5fa]' : 'text-[#9fb3dc]'}`} />
                    <span className={`text-[12.5px] leading-tight ${n >= 4 ? 'text-center' : ''}`}>{label(o)}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        )
      })}

      <div className="border-t border-[#172345] px-4 pb-4 pt-3.5">
        <div className="flex items-center gap-2.5 rounded-2xl border border-[#22304f] bg-[#0d1731] py-2 pl-3 pr-2 focus-within:border-[#3b82f6]">
          <Icons.MessageCircleMore className="h-5 w-5 shrink-0 text-[#7fa7ff]" aria-hidden="true" />
          <label className="min-w-0 flex-1">
            <span className="sr-only">{en ? EN.more : 'Hoặc nói thêm ý khác'}</span>
            <input id="ask-free-text" value={free} onChange={e => typeFree(e.target.value)} disabled={locked}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
              placeholder={en ? EN.more : 'Hoặc nói thêm ý khác…'}
              className="w-full bg-transparent text-[14px] text-white placeholder:text-[#8494b8] focus:outline-none disabled:opacity-60" />
            <span className="block truncate text-[11.5px] text-[#5f6f96]">{head.example}</span>
          </label>
          <button type="button" data-ask-send-inline onClick={send} disabled={locked} aria-label={en ? EN.go : 'Gửi'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2563eb] disabled:opacity-50">
            <Icons.Send className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
        <button type="button" data-ask-send onClick={send} disabled={locked}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#3b82f6] text-[16px] font-semibold shadow-[0_6px_20px_rgba(37,99,235,.45)] transition-opacity disabled:opacity-60">
          {sent ? <Icons.Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Icons.Sparkles className="h-5 w-5" aria-hidden="true" />}
          {sent ? (en ? EN.sending : 'Đang tìm…') : (en ? EN.go : 'Tìm cho tôi')}
        </button>
      </div>
    </div>
  )
}
