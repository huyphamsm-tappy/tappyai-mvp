'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, Plus, Minus, Trash2, Calculator, Coins, Users, Percent, Split, Utensils, Info, Receipt } from 'lucide-react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import TappyPresence from '@/components/v3/TappyPresence'
import { useTranslation } from '@/lib/i18n/useTranslation'
import AskTappyButton from '@/components/chat/AskTappyButton'

const TIP_PRESETS = [0, 5, 10, 15, 20]
/** The people range the stepper and the custom list have always enforced. Named once, applied in the same two places. */
const MIN_PEOPLE = 2
const MAX_PEOPLE = 20

function fmt(n: number) {
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 0 })
}

interface Person {
  id: number
  name: string
  amount: string
}

export default function SplitBillPage() {
  const { t } = useTranslation()
  const [total, setTotal] = useState('')
  const [people, setPeople] = useState(2)
  const [tip, setTip] = useState(0)
  const [customTip, setCustomTip] = useState('')
  const [mode, setMode] = useState<'equal' | 'custom'>('equal')
  const [persons, setPersons] = useState<Person[]>([
    { id: 1, name: t('splitBill.personDefaultName', { n: '1' }), amount: '' },
    { id: 2, name: t('splitBill.personDefaultName', { n: '2' }), amount: '' },
  ])
  let nextId = persons.length + 1

  const activeTip = customTip !== '' ? parseFloat(customTip) || 0 : tip
  const totalNum = parseFloat(total.replace(/[^0-9.]/g, '')) || 0
  const grandTotal = totalNum * (1 + activeTip / 100)
  const perPerson = people > 0 ? grandTotal / people : 0

  const customTotal = useMemo(() => {
    return persons.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  }, [persons])
  const customGrand = customTotal * (1 + activeTip / 100)

  function addPerson() {
    setPersons(prev => [...prev, { id: nextId++, name: t('splitBill.personDefaultName', { n: String(prev.length + 1) }), amount: '' }])
  }
  function removePerson(id: number) {
    if (persons.length <= 2) return
    setPersons(prev => prev.filter(p => p.id !== id))
  }
  function updatePerson(id: number, field: 'name' | 'amount', val: string) {
    setPersons(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p))
  }

  /**
   * Resize the by-item list to exactly `n` people. Existing rows keep their names and amounts;
   * growth appends default-named rows, shrinkage drops rows from the end. Ids continue from the
   * highest existing id so a row removed earlier can never be re-issued as a duplicate key.
   */
  function fitPersons(n: number) {
    setPersons(prev => {
      if (n > prev.length) {
        const maxId = prev.reduce((m, p) => Math.max(m, p.id), 0)
        const added = Array.from({ length: n - prev.length }, (_, i) => ({
          id: maxId + i + 1,
          name: t('splitBill.personDefaultName', { n: String(prev.length + i + 1) }),
          amount: '',
        }))
        return [...prev, ...added]
      }
      return prev.slice(0, n)
    })
  }

  function syncPeopleCount(n: number) {
    setPeople(n)
    if (mode === 'equal') return
    fitPersons(n)
  }

  // UAT 2026-09-12: the stepper only kept the by-item list in step while ALREADY in by-item mode,
  // so 2 → 5 in equal mode followed by "Chia theo món" still showed two rows. Entering the mode
  // now fits the list to the current count first.
  function enterCustomMode() {
    fitPersons(people)
    setMode('custom')
  }

  const customActive = customTip !== ''

  return (
    // `v3-theme` brings the shared tokens to a page that keeps its own back-bar and bottom nav.
    <div className="v3-theme v3-sb-page min-h-dvh pb-24">
      <div className="v3-sb-topbar sticky top-0 z-30 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="-ml-1.5 flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2" aria-label={t('splitBill.title')}>
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
          <span className="text-[15px] font-semibold">{t('splitBill.title')}</span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-5 sm:px-6 sm:py-7" data-sb-main>
        {/* ── Hero ── */}
        <section className="v3-sb-hero" aria-labelledby="sb-hero-title" data-sb-hero>
          <div className="v3-sb-stars" aria-hidden="true" />
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-4">
                <span className="v3-sb-brand flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl sm:h-16 sm:w-16" aria-hidden="true">
                  <Calculator size={30} strokeWidth={2.1} />
                </span>
                <div className="min-w-0">
                  <p className="v3-sb-hero-muted text-[12.5px] font-bold uppercase tracking-[0.08em]">{t('splitBill.heroEyebrow')}</p>
                  <h1 id="sb-hero-title" className="text-[26px] font-extrabold leading-tight tracking-[-0.01em] sm:text-[34px]">{t('splitBill.title')}</h1>
                  <p className="v3-sb-hero-muted mt-1 text-[14px] sm:text-[16px]">{t('splitBill.heroSubtitle')}</p>
                </div>
              </div>
              {/* Three facts about this page: the people range, the free tip field, the two modes. */}
              <ul className="mt-6 flex flex-wrap gap-2.5" data-sb-chips>
                <li className="v3-sb-chip" data-tone="blue"><span className="v3-sb-chip-icon" aria-hidden="true"><Users size={14} /></span>{t('splitBill.chipPeople', { min: String(MIN_PEOPLE), max: String(MAX_PEOPLE) })}</li>
                <li className="v3-sb-chip" data-tone="emerald"><span className="v3-sb-chip-icon" aria-hidden="true"><Percent size={14} /></span>{t('splitBill.chipTip')}</li>
                <li className="v3-sb-chip" data-tone="violet"><span className="v3-sb-chip-icon" aria-hidden="true"><Split size={14} /></span>{t('splitBill.chipModes')}</li>
              </ul>
            </div>

            {/* The scene: a calculator plate, coins, a receipt-shaped bubble carrying the subtitle,
                and Tappy (the owner's default `wave` pose). Illustration only. */}
            <div className="relative mx-auto h-[220px] w-full max-w-[340px] flex-shrink-0 sm:h-[250px] md:w-[42%] md:max-w-[400px]" aria-hidden="true" data-sb-scene>
              <span className="v3-sb-calc" style={{ width: '38%', height: '72%', right: '8%', top: '0%' }} />
              <span className="v3-sb-coin" style={{ width: 40, height: 40, left: '6%', top: '14%' }}>$</span>
              <span className="v3-sb-coin" style={{ width: 30, height: 30, left: '2%', top: '46%' }}>$</span>
              <span className="v3-sb-coin" style={{ width: 34, height: 34, left: '12%', top: '70%' }}>$</span>
              <span className="v3-sb-bubble" style={{ right: '0%', top: '4%', maxWidth: '46%', zIndex: 2 }}>{t('splitBill.heroSubtitle')}</span>
              <div className="v3-sb-mascot absolute inset-x-0 bottom-0 flex justify-center">
                <TappyPresence pose="wave" size={210} aura="calm" className="max-w-[200px] sm:max-w-[230px]" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Total ── */}
        <section className="v3-sb-card p-4 sm:p-5" data-sb-total>
          <label htmlFor="sb-total" className="flex items-center gap-3 text-[14px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
            <span className="v3-sb-card-icon" aria-hidden="true"><Coins size={17} /></span>
            {t('splitBill.billTotalLabel')}
          </label>
          <div className="v3-sb-field mt-3 min-h-[64px]">
            <input
              id="sb-total"
              type="number"
              inputMode="numeric"
              value={total}
              onChange={e => setTotal(e.target.value)}
              placeholder={t('splitBill.billTotalPlaceholder')}
              className="v3-sb-input px-4 text-[26px] sm:text-[30px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="v3-sb-field-unit text-[18px]" aria-hidden="true">₫</span>
          </div>
        </section>

        {/* ── People ── */}
        <section className="v3-sb-card p-4 sm:p-5" data-sb-people>
          <p id="sb-people-label" className="flex items-center gap-3 text-[14px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
            <span className="v3-sb-card-icon" aria-hidden="true"><Users size={17} /></span>
            {t('splitBill.peopleLabel')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="v3-sb-stepper" role="group" aria-labelledby="sb-people-label">
              <button
                type="button"
                onClick={() => syncPeopleCount(Math.max(MIN_PEOPLE, people - 1))}
                disabled={people <= MIN_PEOPLE}
                aria-label={t('splitBill.decrease')}
                className="v3-sb-step"
                data-sb-dec
              >
                <Minus size={20} aria-hidden="true" />
              </button>
              <span className="v3-sb-step-value text-[24px] tabular-nums" aria-live="polite" data-sb-count>{people}</span>
              <button
                type="button"
                onClick={() => syncPeopleCount(Math.min(MAX_PEOPLE, people + 1))}
                disabled={people >= MAX_PEOPLE}
                aria-label={t('splitBill.increase')}
                className="v3-sb-step"
                data-sb-inc
              >
                <Plus size={20} aria-hidden="true" />
              </button>
            </div>
            <span className="text-[15px]" style={{ color: 'var(--v3-fg-secondary)' }}>{t('splitBill.peopleUnit')}</span>
          </div>
        </section>

        {/* ── Tip ── */}
        <section className="v3-sb-card p-4 sm:p-5" data-sb-tip>
          <p id="sb-tip-label" className="flex items-center gap-3 text-[14px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
            <span className="v3-sb-card-icon" aria-hidden="true"><Percent size={17} /></span>
            {t('splitBill.tipLabel')}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-labelledby="sb-tip-label">
            {TIP_PRESETS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => { setTip(preset); setCustomTip('') }}
                aria-pressed={tip === preset && customTip === ''}
                className="v3-sb-seg min-h-[48px] px-3 text-[14px]"
              >
                {preset === 0 ? t('splitBill.tipNone') : `${preset}%`}
              </button>
            ))}
            {/* The free-form percentage this page has always had: typing here overrides the preset. */}
            <div className="relative">
              <label htmlFor="sb-tip-custom" className="sr-only">{t('splitBill.tipCustomLabel')}</label>
              <input
                id="sb-tip-custom"
                type="number"
                inputMode="decimal"
                value={customTip}
                onChange={e => { setCustomTip(e.target.value); setTip(-1) }}
                placeholder={t('splitBill.tipCustomPlaceholder')}
                data-active={customActive}
                className="v3-sb-seg-input min-h-[48px] w-full px-3 pr-8 text-center text-[14px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              {customTip && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold" style={{ color: 'var(--v3-accent)' }} aria-hidden="true">%</span>}
            </div>
          </div>
        </section>

        {/* ── Mode ── */}
        <section className="v3-sb-card p-4 sm:p-5" data-sb-mode>
          <p id="sb-mode-label" className="flex items-center gap-3 text-[14px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
            <span className="v3-sb-card-icon" aria-hidden="true"><Split size={17} /></span>
            {t('splitBill.modeLabel')}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="sb-mode-label">
            <button type="button" role="radio" aria-checked={mode === 'equal'} onClick={() => setMode('equal')} className="v3-sb-seg min-h-[52px] px-3 text-[14.5px]" data-sb-mode-equal>
              <Users size={17} aria-hidden="true" />
              {t('splitBill.modeEqual')}
            </button>
            <button type="button" role="radio" aria-checked={mode === 'custom'} onClick={enterCustomMode} className="v3-sb-seg min-h-[52px] px-3 text-[14.5px]" data-sb-mode-custom>
              <Utensils size={17} aria-hidden="true" />
              {t('splitBill.modeCustom')}
            </button>
          </div>
        </section>

        {/* ── Result — equal split ── */}
        {mode === 'equal' && (
          <section className="v3-sb-result p-5 sm:p-7" aria-live="polite" aria-labelledby="sb-result-title" data-sb-result>
            <p id="sb-result-title" className="v3-sb-result-muted flex items-center gap-2 text-[14px] sm:text-[15px]">
              <Calculator size={16} aria-hidden="true" />
              {t('splitBill.resultTitle')}
            </p>
            {totalNum > 0 ? (
              <>
                <p className="mt-2 break-all text-[40px] font-black leading-none tracking-[-0.02em] tabular-nums sm:text-[56px]" data-sb-per-person>{fmt(perPerson)} đ</p>
                {activeTip > 0 && (
                  <p className="v3-sb-result-muted mt-3 text-[13.5px]" data-sb-includes-tip>
                    {t('splitBill.includesTip', { tip: String(activeTip), total: fmt(grandTotal) })}
                  </p>
                )}
                <div className="v3-sb-result-rule mt-5 grid grid-cols-3 gap-2 pt-5 text-center" data-sb-breakdown>
                  <div className="v3-sb-result-cell">
                    <p className="v3-sb-result-muted text-[12px]">{t('splitBill.billLabel')}</p>
                    <p className="mt-0.5 text-[14px] font-bold tabular-nums sm:text-[15px]">{fmt(totalNum)} đ</p>
                  </div>
                  <div className="v3-sb-result-cell">
                    <p className="v3-sb-result-muted text-[12px]">{t('splitBill.tipShortLabel')}</p>
                    <p className="mt-0.5 text-[14px] font-bold tabular-nums sm:text-[15px]">{fmt(totalNum * activeTip / 100)} đ</p>
                  </div>
                  <div className="v3-sb-result-cell">
                    <p className="v3-sb-result-muted text-[12px]">{t('splitBill.totalLabel')}</p>
                    <p className="mt-0.5 text-[14px] font-bold tabular-nums sm:text-[15px]">{fmt(grandTotal)} đ</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[24px] font-extrabold leading-tight sm:text-[30px]" data-sb-empty>{t('splitBill.emptyPrompt')}</p>
            )}
          </section>
        )}

        {/* P4-12 — the tool result carries into the assistant (DD-004). A split used to
            dead-end here; now the number can become a conversation ("where should we eat
            for that?"). Only offered once there is a real result to carry. */}
        {mode === 'equal' && totalNum > 0 && (
          <AskTappyButton
            kind="result"
            variant="block"
            subject={t('splitBill.bridgeSubject', { amount: fmt(perPerson), people: String(people) })}
          />
        )}

        {/* ── Custom split — each person's own items ── */}
        {mode === 'custom' && (
          <section className="v3-sb-card p-4 sm:p-5" data-sb-custom>
            <p className="flex items-center gap-3 text-[14px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
              <span className="v3-sb-card-icon" aria-hidden="true"><Receipt size={17} /></span>
              {t('splitBill.customHint')}
            </p>
            <ul className="mt-3 space-y-2">
              {persons.map((p, idx) => (
                <li key={p.id} className="v3-sb-row flex flex-wrap items-center gap-2 p-2.5 sm:flex-nowrap">
                  <label htmlFor={`sb-name-${p.id}`} className="sr-only">{t('splitBill.personName')}</label>
                  <input
                    id={`sb-name-${p.id}`}
                    value={p.name}
                    onChange={e => updatePerson(p.id, 'name', e.target.value)}
                    className="v3-sb-row-input min-h-[44px] w-[38%] min-w-[110px] rounded-xl px-3 text-[14px] font-semibold sm:w-32"
                  />
                  <label htmlFor={`sb-amount-${p.id}`} className="sr-only">{t('splitBill.amountPlaceholder')}</label>
                  <input
                    id={`sb-amount-${p.id}`}
                    type="number"
                    inputMode="numeric"
                    value={p.amount}
                    onChange={e => updatePerson(p.id, 'amount', e.target.value)}
                    placeholder={t('splitBill.amountPlaceholder')}
                    className="v3-sb-row-input min-h-[44px] min-w-0 flex-1 rounded-xl px-3 text-[15px] font-semibold tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true">đ</span>
                  {persons.length > MIN_PEOPLE && (
                    <button type="button" onClick={() => removePerson(p.id)} aria-label={t('splitBill.removePerson', { name: p.name })} className="v3-sb-icon-btn" data-danger="">
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                  {idx === persons.length - 1 && persons.length < MAX_PEOPLE && (
                    <button type="button" onClick={addPerson} aria-label={t('splitBill.addPerson')} className="v3-sb-icon-btn" data-sb-add>
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {customTotal > 0 && (
              <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: 'var(--v3-border)' }} data-sb-custom-result>
                {persons.map(p => {
                  const pAmt = parseFloat(p.amount) || 0
                  const pShare = customGrand > 0 ? pAmt * (1 + activeTip / 100) : 0
                  return (
                    <div key={p.id} className="flex items-center justify-between text-[14px]">
                      <span style={{ color: 'var(--v3-fg-secondary)' }}>{p.name}</span>
                      <span className="font-bold tabular-nums" style={{ color: 'var(--v3-fg)' }}>{fmt(pShare)} đ</span>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between border-t pt-3 text-[15px] font-bold" style={{ borderColor: 'var(--v3-border)', color: 'var(--v3-accent)' }}>
                  <span>{t('splitBill.totalAfterTip')}</span>
                  <span className="tabular-nums">{fmt(customGrand)} đ</span>
                </div>
              </div>
            )}
          </section>
        )}

        <p className="v3-sb-note flex items-center justify-center gap-2 px-4 pb-2 text-center text-[13px]" data-sb-disclaimer>
          <Info size={15} className="flex-shrink-0" aria-hidden="true" />
          {t('splitBill.disclaimer')}
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
