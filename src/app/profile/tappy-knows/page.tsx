'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw, Trash2, Brain, MapPin, Users, Clock, Sparkles, UtensilsCrossed, Heart, X, Pencil, Check } from 'lucide-react'

type Memory = {
  location_base: string | null
  companions: string | null
  timing: string | null
  personality: string | null
  preferences: {
    food?: string[]
    spa?: string[]
    entertainment?: string[]
    shopping?: string[]
    avoid?: string[]
  }
  budget: Record<string, { min: number; max: number }>
  history: string[]
  updated_at?: string
}

function fmtVND(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + ' triệu'
  return (n / 1000).toFixed(0) + 'k'
}

function BudgetLabel({ range }: { range: { min: number; max: number } }) {
  if (range.min > 0) return <>{fmtVND(range.min)}–{fmtVND(range.max)}</>
  return <>dưới {fmtVND(range.max)}</>
}

function TagList({ items, color = 'primary', editing, onRemove }: { items: string[]; color?: string; editing?: boolean; onRemove?: (i: number) => void }) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300',
    orange: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    purple: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    green: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  }
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((t, i) => (
        <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${colorMap[color] ?? colorMap.primary}`}>
          {t}
          {editing && onRemove && (
            <button type="button" onClick={() => onRemove(i)} aria-label={`Xóa ${t}`} className="hover:text-red-500 transition-colors">
              <X size={11} />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

function RemoveBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-500 transition-colors">
      <X size={13} />
    </button>
  )
}

function MemoryCard({ icon: Icon, label, children, iconColor = 'text-primary-500' }: {
  icon: React.ElementType; label: string; children: React.ReactNode; iconColor?: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={15} className={iconColor} />
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      {children}
    </div>
  )
}

function countFacts(m: Memory) {
  let n = 0
  if (m.location_base) n++
  if (m.companions) n++
  if (m.timing) n++
  if (m.personality) n++
  const prefs = m.preferences || {}
  for (const v of Object.values(prefs)) if (v && v.length) n += Math.min(v.length, 3)
  n += Object.keys(m.budget || {}).length
  n += Math.min((m.history || []).length, 5)
  return n
}

export default function TappyKnowsPage() {
  const [memory, setMemory] = useState<Memory | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const fetchMemory = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/memory')
      if (res.ok) {
        const d = await res.json()
        setMemory(d.memory ?? null)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMemory() }, [])

  const handleClear = async () => {
    if (!confirmClear) { setConfirmClear(true); return }
    setClearing(true)
    try {
      await fetch('/api/memory', { method: 'DELETE' })
      setMemory(null)
      setCleared(true)
      setConfirmClear(false)
    } finally {
      setClearing(false)
    }
  }

  const [editing, setEditing] = useState(false)

  // Correct memory: apply an optimistic change locally, then persist via PATCH.
  // Reverts to the server copy on failure.
  const patchMemory = async (patch: Partial<Memory>, next: Memory) => {
    const prev = memory
    setMemory(next)
    try {
      const res = await fetch('/api/memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('patch failed')
    } catch {
      setMemory(prev) // revert
    }
  }

  const removeField = (field: 'location_base' | 'companions' | 'timing' | 'personality') => {
    if (!memory) return
    patchMemory({ [field]: null }, { ...memory, [field]: null })
  }
  const removeTag = (cat: keyof Memory['preferences'], idx: number) => {
    if (!memory) return
    const list = (memory.preferences[cat] || []).filter((_, i) => i !== idx)
    const preferences = { ...memory.preferences, [cat]: list }
    patchMemory({ preferences }, { ...memory, preferences })
  }
  const removeHistory = (topic: string) => {
    if (!memory) return
    const history = (memory.history || []).filter(h => h !== topic)
    patchMemory({ history }, { ...memory, history })
  }
  const removeBudget = (cat: string) => {
    if (!memory) return
    const budget = { ...memory.budget }
    delete budget[cat]
    patchMemory({ budget }, { ...memory, budget })
  }

  const prefs = memory?.preferences || {}
  const budgetEntries = Object.entries(memory?.budget || {})
  const factCount = memory ? countFacts(memory) : 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/profile" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            ←
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">🧠 Tappy biết gì về bạn</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Tappy học từ mỗi cuộc trò chuyện để phục vụ bạn tốt hơn</p>
          </div>
          {memory && !cleared && (
            <button
              onClick={() => setEditing(e => !e)}
              className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${editing ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              {editing ? <><Check size={14} /> Xong</> : <><Pencil size={14} /> Chỉnh sửa</>}
            </button>
          )}
          <button
            onClick={fetchMemory}
            disabled={loading}
            className={`${memory && !cleared ? '' : 'ml-auto '}p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40`}
          >
            <RefreshCw size={16} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-gray-300" />
          </div>
        ) : cleared || !memory ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-600">
            <Brain size={44} className="mx-auto mb-3 opacity-40" />
            <p className="font-semibold text-gray-500 dark:text-gray-400">
              {cleared ? 'Đã xóa bộ nhớ' : 'Tappy chưa nhớ gì về bạn'}
            </p>
            <p className="text-sm mt-1">Chat với Tappy để Tappy bắt đầu học về bạn</p>
            <Link
              href="/"
              className="inline-flex mt-4 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              Bắt đầu chat
            </Link>
          </div>
        ) : (
          <div className="space-y-4">

            {/* Fact count banner */}
            <div className="card p-4 bg-gradient-to-r from-primary-500 to-accent-500 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Brain size={24} />
                </div>
                <div>
                  <p className="font-bold text-lg">{factCount} điều Tappy nhớ về bạn</p>
                  <p className="text-sm opacity-80">
                    {memory.updated_at
                      ? `Cập nhật ${new Date(memory.updated_at).toLocaleDateString('vi-VN')}`
                      : 'Cập nhật tự động sau mỗi cuộc chat'}
                  </p>
                </div>
              </div>
            </div>

            {/* Location */}
            {memory.location_base && (
              <MemoryCard icon={MapPin} label="Khu vực" iconColor="text-blue-500">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-gray-900 dark:text-white">{memory.location_base}</p>
                  {editing && <RemoveBtn onClick={() => removeField('location_base')} label="Xóa khu vực" />}
                </div>
              </MemoryCard>
            )}

            {/* Companions + Timing */}
            {(memory.companions || memory.timing) && (
              <div className="grid grid-cols-2 gap-3">
                {memory.companions && (
                  <MemoryCard icon={Users} label="Hay đi với" iconColor="text-purple-500">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{memory.companions}</p>
                      {editing && <RemoveBtn onClick={() => removeField('companions')} label="Xóa" />}
                    </div>
                  </MemoryCard>
                )}
                {memory.timing && (
                  <MemoryCard icon={Clock} label="Thời gian hay đi" iconColor="text-amber-500">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{memory.timing}</p>
                      {editing && <RemoveBtn onClick={() => removeField('timing')} label="Xóa" />}
                    </div>
                  </MemoryCard>
                )}
              </div>
            )}

            {/* Personality */}
            {memory.personality && (
              <MemoryCard icon={Sparkles} label="Phong cách" iconColor="text-pink-500">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{memory.personality}</p>
                  {editing && <RemoveBtn onClick={() => removeField('personality')} label="Xóa phong cách" />}
                </div>
              </MemoryCard>
            )}

            {/* Food preferences */}
            {prefs.food && prefs.food.length > 0 && (
              <MemoryCard icon={UtensilsCrossed} label="Ẩm thực yêu thích" iconColor="text-orange-500">
                <TagList items={prefs.food} color="orange" editing={editing} onRemove={(i) => removeTag('food', i)} />
              </MemoryCard>
            )}

            {/* Spa + Entertainment */}
            {(prefs.spa?.length || prefs.entertainment?.length) ? (
              <MemoryCard icon={Heart} label="Giải trí & Thư giãn" iconColor="text-pink-500">
                {prefs.spa && prefs.spa.length > 0 && (
                  <div className="mb-1">
                    <span className="text-xs text-gray-400 dark:text-gray-500">Spa</span>
                    <TagList items={prefs.spa} color="purple" editing={editing} onRemove={(i) => removeTag('spa', i)} />
                  </div>
                )}
                {prefs.entertainment && prefs.entertainment.length > 0 && (
                  <div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">Giải trí</span>
                    <TagList items={prefs.entertainment} color="blue" editing={editing} onRemove={(i) => removeTag('entertainment', i)} />
                  </div>
                )}
              </MemoryCard>
            ) : null}

            {/* Shopping */}
            {prefs.shopping && prefs.shopping.length > 0 && (
              <MemoryCard icon={Sparkles} label="Mua sắm" iconColor="text-green-500">
                <TagList items={prefs.shopping} color="green" editing={editing} onRemove={(i) => removeTag('shopping', i)} />
              </MemoryCard>
            )}

            {/* Avoid */}
            {prefs.avoid && prefs.avoid.length > 0 && (
              <MemoryCard icon={UtensilsCrossed} label="Không thích / Kiêng" iconColor="text-red-400">
                <TagList items={prefs.avoid} color="red" editing={editing} onRemove={(i) => removeTag('avoid', i)} />
              </MemoryCard>
            )}

            {/* Budget */}
            {budgetEntries.length > 0 && (
              <MemoryCard icon={Sparkles} label="Ngân sách thường dùng" iconColor="text-green-500">
                <div className="mt-2 space-y-1.5">
                  {budgetEntries.map(([cat, range]) => (
                    <div key={cat} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">{cat}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          <BudgetLabel range={range} />
                        </span>
                        {editing && <RemoveBtn onClick={() => removeBudget(cat)} label={`Xóa ngân sách ${cat}`} />}
                      </div>
                    </div>
                  ))}
                </div>
              </MemoryCard>
            )}

            {/* History */}
            {memory.history && memory.history.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Chủ đề hay hỏi Tappy
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {memory.history.slice(-8).reverse().map((h, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                    >
                      {h}
                      {editing && (
                        <button type="button" onClick={() => removeHistory(h)} aria-label={`Xóa ${h}`} className="hover:text-red-500 transition-colors">
                          <X size={11} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Clear memory */}
            <div className="card p-4 border border-red-100 dark:border-red-900/30">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Xóa bộ nhớ</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Tappy sẽ quên tất cả và bắt đầu lại từ đầu với bạn.
              </p>
              {confirmClear ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleClear}
                    disabled={clearing}
                    className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {clearing ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    Xác nhận xóa
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-semibold text-gray-600 dark:text-gray-300 transition-colors"
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors"
                >
                  <Trash2 size={13} />
                  Xóa bộ nhớ của Tappy
                </button>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
