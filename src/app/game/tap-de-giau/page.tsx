'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const SAVE_KEY = 'tappyai_idle_v1'

interface FloatPop { id: number; x: number; y: number; val: number; life: number }

interface UpgradeDef {
  id: string; name: string; emoji: string; desc: string
  baseCost: (owned: number) => number
  effect: (owned: number) => { cpc?: number; pps?: number }
}

const UPGRADES: UpgradeDef[] = [
  {
    id: 'finger', name: 'Ngón Tay Nhanh', emoji: '👆', desc: '+1 xu/chạm',
    baseCost: n => Math.floor(15 * Math.pow(1.5, n)),
    effect: n => ({ cpc: n * 1 }),
  },
  {
    id: 'wallet', name: 'Ví Tiền Thần', emoji: '👛', desc: '+3 xu/chạm',
    baseCost: n => Math.floor(80 * Math.pow(1.6, n)),
    effect: n => ({ cpc: n * 3 }),
  },
  {
    id: 'mine', name: 'Mỏ Vàng', emoji: '⛏️', desc: '+2 xu/giây',
    baseCost: n => Math.floor(60 * Math.pow(1.55, n)),
    effect: n => ({ pps: n * 2 }),
  },
  {
    id: 'dragon', name: 'Rồng Vàng', emoji: '🐉', desc: '+10 xu/giây',
    baseCost: n => Math.floor(400 * Math.pow(1.7, n)),
    effect: n => ({ pps: n * 10 }),
  },
  {
    id: 'star', name: 'Sao May Mắn', emoji: '⭐', desc: '+50 xu/giây',
    baseCost: n => Math.floor(2500 * Math.pow(1.8, n)),
    effect: n => ({ pps: n * 50 }),
  },
]

const MAX_OWNED = 20

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as { coins: number; owned: Record<string, number> }
  } catch { return null }
}

function calcStats(owned: Record<string, number>) {
  let cpc = 1, pps = 0
  for (const u of UPGRADES) {
    const n = owned[u.id] ?? 0
    const eff = u.effect(n)
    if (eff.cpc) cpc += eff.cpc
    if (eff.pps) pps += eff.pps
  }
  return { cpc, pps }
}

export default function IdleClickerPage() {
  const [coins, setCoins] = useState(0)
  const [owned, setOwned] = useState<Record<string, number>>({})
  const [pops, setPops] = useState<FloatPop[]>([])
  const [started, setStarted] = useState(false)
  const [shake, setShake] = useState(false)
  const coinsRef = useRef(0)
  const ownedRef = useRef<Record<string, number>>({})
  const idRef = useRef(0)
  const saveTimer = useRef<ReturnType<typeof setInterval>>()
  const tickTimer = useRef<ReturnType<typeof setInterval>>()

  const stats = calcStats(owned)

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return Math.floor(n).toString()
  }

  const save = useCallback(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ coins: Math.floor(coinsRef.current), owned: ownedRef.current }))
    } catch {}
  }, [])

  const start = useCallback(() => {
    const saved = loadSave()
    if (saved) {
      coinsRef.current = saved.coins
      ownedRef.current = saved.owned
      setCoins(saved.coins)
      setOwned(saved.owned)
    }
    setStarted(true)
    posthog.capture('game_started', { game: 'tap-de-giau' })
  }, [])

  useEffect(() => {
    if (!started) return
    tickTimer.current = setInterval(() => {
      const { pps } = calcStats(ownedRef.current)
      if (pps > 0) {
        coinsRef.current += pps / 10 // called every 100ms
        setCoins(Math.floor(coinsRef.current))
      }
    }, 100)
    saveTimer.current = setInterval(save, 5000)
    return () => {
      clearInterval(tickTimer.current)
      clearInterval(saveTimer.current)
      save()
    }
  }, [started, save])

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    const { cpc } = calcStats(ownedRef.current)
    coinsRef.current += cpc
    setCoins(Math.floor(coinsRef.current))

    let cx = 180, cy = 280
    if ('touches' in e) {
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      cx = e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? cx
      cy = e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? cy
      cx -= rect.left - rect.width / 2 + 180
      cy -= rect.top - rect.height / 2 + 280
    } else {
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      cx = e.clientX - rect.left + rect.width / 2
      cy = e.clientY - rect.top + rect.height / 2
    }

    const id = ++idRef.current
    setPops(prev => [...prev.slice(-20), { id, x: cx + (Math.random() - 0.5) * 60, y: cy - 20, val: cpc, life: 1 }])
    setShake(true)
    setTimeout(() => setShake(false), 80)
  }, [])

  useEffect(() => {
    if (pops.length === 0) return
    const timer = setInterval(() => {
      setPops(prev => prev.map(p => ({ ...p, life: p.life - 0.05 })).filter(p => p.life > 0))
    }, 50)
    return () => clearInterval(timer)
  }, [pops.length])

  const buyUpgrade = useCallback((uid2: string) => {
    const u = UPGRADES.find(u => u.id === uid2)!
    const n = ownedRef.current[uid2] ?? 0
    if (n >= MAX_OWNED) return
    const cost = u.baseCost(n)
    if (coinsRef.current < cost) return
    coinsRef.current -= cost
    const newOwned = { ...ownedRef.current, [uid2]: n + 1 }
    ownedRef.current = newOwned
    setCoins(Math.floor(coinsRef.current))
    setOwned({ ...newOwned })
  }, [])

  const resetGame = useCallback(() => {
    if (!confirm('Xóa toàn bộ tiến trình?')) return
    coinsRef.current = 0; ownedRef.current = {}
    setCoins(0); setOwned({})
    try { localStorage.removeItem(SAVE_KEY) } catch {}
  }, [])

  if (!started) return (
    <div className="min-h-dvh bg-gray-950 flex flex-col items-center justify-center">
      <div className="w-full max-w-sm px-4">
        <Link href="/game" className="text-gray-400 flex items-center gap-1 mb-6 text-sm"><ChevronLeft size={16} /> Quay Lại</Link>
        <div className="text-center">
          <div className="text-7xl mb-4">💰</div>
          <h1 className="text-white text-3xl font-black mb-2">Tap Để Giàu</h1>
          <p className="text-gray-400 text-sm mb-6">Chạm để kiếm xu, nâng cấp để giàu nhanh hơn.<br />Tiến trình tự lưu mỗi 5 giây!</p>
          <button onClick={start} className="bg-yellow-500 hover:bg-yellow-400 text-white font-black px-10 py-4 rounded-3xl text-xl transition-all active:scale-95 shadow-lg shadow-yellow-500/30">
            {loadSave() ? '▶ Tiếp Tục' : '🚀 Bắt Đầu'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh bg-gray-950 flex flex-col items-center pb-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/game" className="text-gray-400 hover:text-white"><ChevronLeft size={22} /></Link>
          <h1 className="text-white font-bold text-lg flex-1">💰 Tap Để Giàu</h1>
          <button onClick={resetGame} className="text-gray-600 text-xs">Reset</button>
        </div>

        {/* Coin display */}
        <div className="text-center py-2">
          <div className="text-yellow-400 text-5xl font-black tabular-nums">{fmt(coins)}</div>
          <div className="text-yellow-600 text-sm mt-1">xu</div>
          <div className="text-gray-500 text-xs mt-1">{stats.cpc} xu/chạm · {stats.pps}/giây</div>
        </div>

        {/* Click area */}
        <div className="relative flex justify-center py-4">
          {pops.map(p => (
            <div
              key={p.id}
              className="absolute pointer-events-none text-yellow-300 font-black text-lg"
              style={{ left: p.x - 20, top: p.y - p.life * 40, opacity: p.life, transform: `scale(${0.8 + p.life * 0.4})`, zIndex: 10 }}
            >+{p.val}</div>
          ))}
          <button
            onClick={handleClick}
            onTouchStart={e => { e.preventDefault(); handleClick(e) }}
            className={`relative w-44 h-44 rounded-full select-none transition-transform ${shake ? 'scale-95' : 'scale-100 active:scale-95'}`}
            style={{ background: 'radial-gradient(circle at 35% 35%, #fbbf24, #d97706)', boxShadow: '0 0 40px rgba(251,191,36,0.4), inset 0 -6px 0 rgba(0,0,0,0.2)' }}
          >
            <span className="text-7xl select-none">💰</span>
          </button>
        </div>

        {/* Upgrades */}
        <div className="px-4 space-y-2">
          <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Nâng Cấp</h2>
          {UPGRADES.map(u => {
            const n = owned[u.id] ?? 0
            const cost = u.baseCost(n)
            const canBuy = coins >= cost && n < MAX_OWNED
            const eff = u.effect(n + 1)
            return (
              <button
                key={u.id}
                onClick={() => buyUpgrade(u.id)}
                disabled={!canBuy || n >= MAX_OWNED}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all ${canBuy ? 'bg-gray-800 border-yellow-500/40 hover:bg-gray-750 active:scale-98' : 'bg-gray-900 border-gray-800 opacity-60'}`}
              >
                <div className="text-2xl w-10 text-center">{u.emoji}</div>
                <div className="flex-1 text-left">
                  <div className="text-white text-sm font-semibold">{u.name}</div>
                  <div className="text-gray-400 text-xs">
                    {n >= MAX_OWNED ? 'Đã tối đa' : u.desc}
                    {n > 0 && n < MAX_OWNED && <span className="text-gray-500"> → {eff.cpc ? `+${eff.cpc} cpc` : ''}{eff.pps ? `+${eff.pps} pps` : ''}</span>}
                  </div>
                </div>
                <div className="text-right">
                  {n < MAX_OWNED ? (
                    <>
                      <div className="text-yellow-400 text-sm font-bold">{fmt(cost)} xu</div>
                      <div className="text-gray-500 text-xs">Cấp {n}/{MAX_OWNED}</div>
                    </>
                  ) : (
                    <div className="text-green-400 text-xs font-bold">MAX</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <p className="text-gray-700 text-xs text-center mt-4">Tiến trình tự lưu mỗi 5 giây</p>
      </div>
    </div>
  )
}
