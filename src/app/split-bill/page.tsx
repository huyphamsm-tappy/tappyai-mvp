'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, Plus, Minus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'

const TIP_PRESETS = [0, 5, 10, 15, 20]

function fmt(n: number) {
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 0 })
}

interface Person {
  id: number
  name: string
  amount: string
}

export default function SplitBillPage() {
  const [total, setTotal] = useState('')
  const [people, setPeople] = useState(2)
  const [tip, setTip] = useState(0)
  const [customTip, setCustomTip] = useState('')
  const [mode, setMode] = useState<'equal' | 'custom'>('equal')
  const [persons, setPersons] = useState<Person[]>([
    { id: 1, name: 'Người 1', amount: '' },
    { id: 2, name: 'Người 2', amount: '' },
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
    setPersons(prev => [...prev, { id: nextId++, name: `Người ${prev.length + 1}`, amount: '' }])
  }
  function removePerson(id: number) {
    if (persons.length <= 2) return
    setPersons(prev => prev.filter(p => p.id !== id))
  }
  function updatePerson(id: number, field: 'name' | 'amount', val: string) {
    setPersons(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p))
  }

  function syncPeopleCount(n: number) {
    setPeople(n)
    if (mode === 'equal') return
    setPersons(prev => {
      if (n > prev.length) {
        const added = Array.from({ length: n - prev.length }, (_, i) => ({
          id: prev.length + i + 1,
          name: `Người ${prev.length + i + 1}`,
          amount: '',
        }))
        return [...prev, ...added]
      }
      return prev.slice(0, n)
    })
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-3">
        <Link href="/" className="p-1.5 -ml-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
        </Link>
        <h1 className="font-bold text-gray-900 dark:text-white">🧮 Chia tiền</h1>
      </div>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* Total + people */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm space-y-4">
          <div>
            <label className="text-xs text-gray-400 dark:text-gray-500 mb-1.5 block">Tổng tiền hóa đơn (đ)</label>
            <input
              type="number"
              inputMode="numeric"
              value={total}
              onChange={e => setTotal(e.target.value)}
              placeholder="Nhập tổng tiền..."
              className="w-full text-2xl font-black text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3 border border-gray-100 dark:border-gray-700 outline-none focus:ring-2 focus:ring-primary-500/40 placeholder-gray-300 dark:placeholder-gray-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 dark:text-gray-500 mb-2 block">Số người</label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => syncPeopleCount(Math.max(2, people - 1))}
                className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Minus size={16} className="text-gray-600 dark:text-gray-300" />
              </button>
              <span className="text-2xl font-black text-gray-900 dark:text-white w-10 text-center">{people}</span>
              <button
                onClick={() => syncPeopleCount(Math.min(20, people + 1))}
                className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Plus size={16} className="text-gray-600 dark:text-gray-300" />
              </button>
              <span className="text-sm text-gray-400">người</span>
            </div>
          </div>
        </div>

        {/* Tip */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <label className="text-xs text-gray-400 dark:text-gray-500 mb-2 block">Tip / phụ thu (%)</label>
          <div className="flex gap-2 flex-wrap">
            {TIP_PRESETS.map(t => (
              <button
                key={t}
                onClick={() => { setTip(t); setCustomTip('') }}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${tip === t && customTip === '' ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
              >
                {t === 0 ? 'Không' : `${t}%`}
              </button>
            ))}
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                value={customTip}
                onChange={e => { setCustomTip(e.target.value); setTip(-1) }}
                placeholder="Tự nhập"
                className="w-24 px-3 py-1.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-none outline-none focus:ring-2 focus:ring-primary-500/40 placeholder-gray-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              {customTip && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>}
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-2xl bg-gray-100 dark:bg-gray-800 p-1 gap-1">
          <button
            onClick={() => setMode('equal')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${mode === 'equal' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Chia đều
          </button>
          <button
            onClick={() => setMode('custom')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${mode === 'custom' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Chia theo món
          </button>
        </div>

        {/* Result — equal split */}
        {mode === 'equal' && (
          <div className="bg-gradient-to-br from-primary-500 to-accent-500 rounded-3xl p-6 shadow-lg shadow-primary-500/20 text-white">
            {totalNum > 0 ? (
              <>
                <p className="text-white/70 text-sm">Mỗi người trả</p>
                <p className="text-4xl font-black mt-0.5">{fmt(perPerson)} đ</p>
                {activeTip > 0 && (
                  <p className="text-white/60 text-xs mt-2">
                    (Bao gồm {activeTip}% tip · Tổng: {fmt(grandTotal)} đ)
                  </p>
                )}
                <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <p className="text-white/50">Hóa đơn</p>
                    <p className="font-semibold">{fmt(totalNum)} đ</p>
                  </div>
                  <div>
                    <p className="text-white/50">Tip</p>
                    <p className="font-semibold">{fmt(totalNum * activeTip / 100)} đ</p>
                  </div>
                  <div>
                    <p className="text-white/50">Tổng</p>
                    <p className="font-semibold">{fmt(grandTotal)} đ</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-white/60">Nhập tổng tiền để tính</p>
            )}
          </div>
        )}

        {/* Custom split */}
        {mode === 'custom' && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm space-y-3">
            <p className="text-xs text-gray-400 dark:text-gray-500">Nhập số tiền từng người đã gọi</p>
            {persons.map((p, idx) => (
              <div key={p.id} className="flex items-center gap-2">
                <input
                  value={p.name}
                  onChange={e => updatePerson(p.id, 'name', e.target.value)}
                  className="w-24 text-sm font-medium bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-primary-500/40"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={p.amount}
                  onChange={e => updatePerson(p.id, 'amount', e.target.value)}
                  placeholder="Số tiền..."
                  className="flex-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/40 placeholder-gray-300 dark:placeholder-gray-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">đ</span>
                {persons.length > 2 && (
                  <button onClick={() => removePerson(p.id)} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors">
                    <Trash2 size={15} />
                  </button>
                )}
                {idx === persons.length - 1 && persons.length < 20 && (
                  <button onClick={addPerson} className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-primary-500 transition-colors">
                    <Plus size={15} />
                  </button>
                )}
              </div>
            ))}

            {/* Custom result */}
            {customTotal > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
                {persons.map(p => {
                  const pAmt = parseFloat(p.amount) || 0
                  const pShare = customGrand > 0 ? pAmt * (1 + activeTip / 100) : 0
                  return (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">{p.name}</span>
                      <span className="font-bold text-gray-900 dark:text-white">{fmt(pShare)} đ</span>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between text-sm font-bold pt-2 border-t border-gray-100 dark:border-gray-800 text-primary-600 dark:text-primary-400">
                  <span>Tổng (sau tip)</span>
                  <span>{fmt(customGrand)} đ</span>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 pb-2">
          Số tiền chỉ mang tính tham khảo, làm tròn để dễ trả.
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
