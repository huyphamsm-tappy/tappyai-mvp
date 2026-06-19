'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const SYMBOLS = ['🔮', '⭐', '🌙', '☀️', '🌊', '🔥', '💫', '🌸', '🍀', '🦋', '🎴', '🌺']

interface Card { id: number; sym: string; flipped: boolean; matched: boolean }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function makeCards(): Card[] {
  return shuffle([...SYMBOLS, ...SYMBOLS].map((sym, i) => ({ id: i, sym, flipped: false, matched: false })))
}

export default function LatThePage() {
  const [cards, setCards] = useState<Card[]>([])
  const [flipped, setFlipped] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [time, setTime] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'won'>('idle')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lockRef = useRef(false)

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  const startGame = useCallback(() => {
    stopTimer()
    setCards(makeCards())
    setFlipped([])
    setMoves(0)
    setTime(0)
    lockRef.current = false
    setPhase('playing')
    posthog.capture('game_started', { game: 'lat-the' })
    timerRef.current = setInterval(() => setTime(t => t + 1), 1000)
  }, [stopTimer])

  useEffect(() => () => stopTimer(), [stopTimer])

  const flip = useCallback((id: number) => {
    if (lockRef.current || phase !== 'playing') return
    setCards(prev => {
      const card = prev.find(c => c.id === id)
      if (!card || card.flipped || card.matched) return prev
      if (flipped.length === 1 && flipped[0] === id) return prev

      const next = prev.map(c => c.id === id ? { ...c, flipped: true } : c)

      if (flipped.length === 0) {
        setFlipped([id])
        return next
      }

      // Second card
      const firstId = flipped[0]
      const first = next.find(c => c.id === firstId)!
      const second = next.find(c => c.id === id)!
      setMoves(m => m + 1)

      if (first.sym === second.sym) {
        const matched = next.map(c => (c.id === firstId || c.id === id) ? { ...c, matched: true } : c)
        setFlipped([])
        const allDone = matched.every(c => c.matched)
        if (allDone) {
          stopTimer()
          setPhase('won')
          setTime(t => {
            posthog.capture('game_won', { game: 'lat-the', moves: moves + 1, time: t })
            return t
          })
        }
        return matched
      } else {
        lockRef.current = true
        setTimeout(() => {
          setCards(c => c.map(card => (card.id === firstId || card.id === id) ? { ...card, flipped: false } : card))
          setFlipped([])
          lockRef.current = false
        }, 900)
        return next
      }
    })
  }, [flipped, phase, moves, stopTimer])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const matched = cards.filter(c => c.matched).length / 2

  return (
    <div className="min-h-dvh bg-gradient-to-b from-violet-950 to-indigo-950 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <Link href="/game" className="flex items-center gap-1 text-violet-300 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-white font-bold text-base">🃏 Lật Thẻ</h1>
        <div className="text-violet-300 font-bold text-sm text-right">
          <div>{fmt(time)}</div>
          <div className="text-xs text-violet-400">{moves} bước</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-3 py-4 gap-4">
        {/* Progress */}
        {phase === 'playing' && (
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i < matched ? 'bg-violet-400' : 'bg-white/20'}`} />
              ))}
            </div>
            <span className="text-violet-300 text-xs">{matched}/12</span>
          </div>
        )}

        {/* Card grid */}
        {phase !== 'idle' ? (
          <div className="grid grid-cols-4 gap-2.5">
            {cards.map(card => (
              <button
                key={card.id}
                onClick={() => flip(card.id)}
                className="relative transition-all duration-300"
                style={{ width: 72, height: 72, perspective: 800 }}
              >
                <div style={{
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.4s',
                  transform: (card.flipped || card.matched) ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  width: '100%', height: '100%', position: 'relative',
                }}>
                  {/* Back */}
                  <div style={{ backfaceVisibility: 'hidden', position: 'absolute', inset: 0 }}
                    className="rounded-2xl bg-gradient-to-br from-violet-700 to-indigo-800 border border-violet-500/40 flex items-center justify-center shadow-lg">
                    <div className="text-2xl opacity-40">✦</div>
                  </div>
                  {/* Front */}
                  <div style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', position: 'absolute', inset: 0 }}
                    className={`rounded-2xl flex items-center justify-center text-3xl shadow-lg border transition-colors ${card.matched ? 'bg-gradient-to-br from-emerald-600 to-teal-700 border-emerald-400/50' : 'bg-gradient-to-br from-violet-500 to-purple-600 border-violet-400/50'}`}>
                    {card.sym}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 py-8">
            <div className="text-6xl">🃏</div>
            <div>
              <p className="text-white text-2xl font-black text-center mb-1">Lật Thẻ Ghi Nhớ</p>
              <p className="text-violet-300 text-sm text-center">Lật 2 thẻ — ghép đôi cho hết 12 cặp</p>
            </div>
            <button onClick={startGame} className="bg-violet-500 hover:bg-violet-400 text-white font-bold px-10 py-3.5 rounded-2xl text-base transition-colors">
              Bắt đầu
            </button>
          </div>
        )}

        {/* Won state */}
        {phase === 'won' && (
          <div className="text-center space-y-2">
            <div className="text-4xl">🎉</div>
            <p className="text-white text-xl font-bold">Xuất sắc!</p>
            <p className="text-violet-300 text-sm">{moves} bước · {fmt(time)}</p>
            <button onClick={startGame} className="bg-violet-500 hover:bg-violet-400 text-white font-bold px-8 py-3 rounded-2xl mt-2 transition-colors">
              Chơi lại
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
