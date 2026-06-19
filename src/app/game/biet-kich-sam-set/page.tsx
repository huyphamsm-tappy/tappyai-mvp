'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Zap, Shield, Crosshair } from 'lucide-react'
import type { GamePhase } from './GameCanvas'

const GameCanvas = dynamic(() => import('./GameCanvas'), { ssr: false })

export default function BietKichSamSetPage() {
  const [phase, setPhase] = useState<GamePhase>('start')
  const [score, setScore] = useState(0)
  const [runKey, setRunKey] = useState(0)

  const handleEnd = useCallback((p: GamePhase, s: number) => {
    setScore(s)
    setPhase(p)
  }, [])

  const startGame = () => {
    setScore(0)
    setRunKey(k => k + 1)
    setPhase('playing')
  }

  return (
    <div className="min-h-dvh bg-gray-950 flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2 shrink-0">
        <Link href="/game" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-white font-bold text-base leading-tight">Biệt Kích Sấm Sét ⚡</h1>
          <p className="text-white/50 text-xs">Side-scrolling run &amp; gun</p>
        </div>
      </div>

      {/* Game area */}
      <div className="relative flex-1 flex flex-col items-center px-2 pb-2">
        {/* Canvas always rendered while playing */}
        <div className={`w-full max-w-xl ${phase !== 'playing' ? 'opacity-20 pointer-events-none' : ''}`}>
          <GameCanvas playing={phase === 'playing'} onEnd={handleEnd} runKey={runKey} />
        </div>

        {/* Overlays */}
        {phase === 'start' && (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="bg-gray-900/95 border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <div className="text-center mb-5">
                <div className="text-5xl mb-2">⚡</div>
                <h2 className="text-white text-2xl font-black">Biệt Kích<br />Sấm Sét</h2>
                <p className="text-white/50 text-xs mt-1">Tiêu diệt kẻ thù • Vượt qua màn chơi</p>
              </div>

              {/* Controls */}
              <div className="space-y-2 mb-5">
                <p className="text-white/60 text-xs font-semibold uppercase tracking-wide">Điều khiển</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/5 rounded-xl p-2.5">
                    <p className="text-white/40 mb-1">Desktop</p>
                    <p className="text-white/80">← → / A D: Di chuyển</p>
                    <p className="text-white/80">↑ / W / Space: Nhảy</p>
                    <p className="text-white/80">Z / X / Ctrl: Bắn</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-2.5">
                    <p className="text-white/40 mb-1">Mobile</p>
                    <p className="text-white/80">Nút bên dưới</p>
                    <p className="text-white/80">◀ ▶: Di chuyển</p>
                    <p className="text-white/80">JUMP / FIRE: Nhảy / Bắn</p>
                  </div>
                </div>
              </div>

              {/* Objectives */}
              <div className="flex gap-2 mb-5">
                <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 flex-1">
                  <Crosshair size={14} className="text-emerald-400 shrink-0" />
                  <span className="text-emerald-300 text-xs">Diệt Lính: 100đ</span>
                </div>
                <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2 flex-1">
                  <Zap size={14} className="text-yellow-400 shrink-0" />
                  <span className="text-yellow-300 text-xs">Diệt Turret: 200đ</span>
                </div>
                <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 flex-1">
                  <Shield size={14} className="text-red-400 shrink-0" />
                  <span className="text-red-300 text-xs">Boss: 500đ</span>
                </div>
              </div>

              <button
                onClick={startGame}
                className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-bold text-lg py-3.5 rounded-2xl transition-all shadow-lg shadow-emerald-500/30"
              >
                Bắt đầu ▶
              </button>
            </div>
          </div>
        )}

        {phase === 'gameover' && (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="bg-gray-900/95 border border-red-500/20 rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center">
              <div className="text-5xl mb-2">💀</div>
              <h2 className="text-red-400 text-2xl font-black mb-1">Game Over</h2>
              <p className="text-white/50 text-sm mb-4">Nhiệm vụ thất bại — thử lại nhé!</p>
              <div className="bg-white/5 rounded-2xl py-4 px-6 mb-5">
                <p className="text-white/40 text-xs mb-1">Điểm số</p>
                <p className="text-white text-4xl font-black">{score.toLocaleString()}</p>
              </div>
              <button
                onClick={startGame}
                className="w-full bg-red-500 hover:bg-red-400 active:scale-95 text-white font-bold text-lg py-3.5 rounded-2xl transition-all shadow-lg shadow-red-500/30 mb-3"
              >
                Chơi lại 🔄
              </button>
              <Link href="/game" className="block text-white/40 text-sm hover:text-white/70 transition-colors">
                ← Về trang Game
              </Link>
            </div>
          </div>
        )}

        {phase === 'victory' && (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="bg-gray-900/95 border border-yellow-500/20 rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center">
              <div className="text-5xl mb-2">🏆</div>
              <h2 className="text-yellow-400 text-2xl font-black mb-1">Chiến Thắng!</h2>
              <p className="text-white/50 text-sm mb-4">Nhiệm vụ hoàn thành — xuất sắc!</p>
              <div className="bg-white/5 rounded-2xl py-4 px-6 mb-5">
                <p className="text-white/40 text-xs mb-1">Điểm số cuối</p>
                <p className="text-yellow-300 text-4xl font-black">{score.toLocaleString()}</p>
              </div>
              <button
                onClick={startGame}
                className="w-full bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-gray-900 font-bold text-lg py-3.5 rounded-2xl transition-all shadow-lg shadow-yellow-500/30 mb-3"
              >
                Chơi lại 🔄
              </button>
              <Link href="/game" className="block text-white/40 text-sm hover:text-white/70 transition-colors">
                ← Về trang Game
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Touch controls – always visible (hidden on wide screens with keyboard) */}
      {phase === 'playing' && (
        <div className="shrink-0 bg-gray-900/80 border-t border-white/5 px-4 pt-3 pb-5 flex items-center justify-between gap-3 select-none">
          {/* D-pad */}
          <div className="flex gap-2">
            <button
              id="btn-left"
              className="w-16 h-16 bg-white/10 active:bg-white/25 border border-white/10 rounded-2xl flex items-center justify-center text-white text-2xl font-bold transition-colors touch-none"
            >
              ◀
            </button>
            <button
              id="btn-right"
              className="w-16 h-16 bg-white/10 active:bg-white/25 border border-white/10 rounded-2xl flex items-center justify-center text-white text-2xl font-bold transition-colors touch-none"
            >
              ▶
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              id="btn-jump"
              className="w-16 h-16 bg-emerald-500/20 active:bg-emerald-500/50 border border-emerald-500/30 rounded-2xl flex flex-col items-center justify-center text-emerald-400 transition-colors touch-none"
            >
              <span className="text-lg">↑</span>
              <span className="text-xs font-bold leading-none">JUMP</span>
            </button>
            <button
              id="btn-shoot"
              className="w-16 h-16 bg-red-500/20 active:bg-red-500/50 border border-red-500/30 rounded-2xl flex flex-col items-center justify-center text-red-400 transition-colors touch-none"
            >
              <span className="text-lg">🔥</span>
              <span className="text-xs font-bold leading-none">FIRE</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
