'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const W = 360, H = 600
const PAD_W = 80, PAD_H = 12, PAD_Y = H - 40
const BALL_R = 8
const BRICK_COLS = 8, BRICK_ROWS = 6
const BRICK_W = W / BRICK_COLS - 4, BRICK_H = 22
const BRICK_PAD = 4

const BRICK_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4',
]

interface Brick { x: number; y: number; hp: number; maxHp: number; color: string }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number }

function makeBricks(): Brick[] {
  const bricks: Brick[] = []
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      const hp = BRICK_ROWS - r
      bricks.push({
        x: BRICK_PAD / 2 + c * (BRICK_W + BRICK_PAD) + 2,
        y: 60 + r * (BRICK_H + BRICK_PAD),
        hp, maxHp: hp,
        color: BRICK_COLORS[r % BRICK_COLORS.length],
      })
    }
  }
  return bricks
}

export default function DapGachPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead' | 'won'>('idle')

  const gs = useRef({
    padX: W / 2,
    bx: W / 2, by: PAD_Y - BALL_R - 1,
    vx: 3, vy: -5,
    bricks: [] as Brick[],
    particles: [] as Particle[],
    score: 0,
    running: false,
    launched: false,
    shake: 0,
  })

  const spawnParticles = useCallback((x: number, y: number, color: string) => {
    const g = gs.current
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2
      const spd = Math.random() * 4 + 1
      g.particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1,
        color,
        r: Math.random() * 4 + 2,
      })
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const g = gs.current

    const sx = g.shake > 0 ? (Math.random() - 0.5) * g.shake * 4 : 0
    const sy = g.shake > 0 ? (Math.random() - 0.5) * g.shake * 4 : 0

    ctx.save()
    ctx.translate(sx, sy)

    // BG
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#0f0f23')
    bg.addColorStop(1, '#1a0a2e')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Bricks
    g.bricks.forEach(b => {
      const pct = b.hp / b.maxHp
      ctx.globalAlpha = 0.3 + pct * 0.7
      const gr = ctx.createLinearGradient(b.x, b.y, b.x, b.y + BRICK_H)
      gr.addColorStop(0, b.color)
      gr.addColorStop(1, b.color + '99')
      ctx.fillStyle = gr
      ctx.shadowBlur = 6
      ctx.shadowColor = b.color
      ctx.beginPath()
      ctx.roundRect(b.x, b.y, BRICK_W, BRICK_H, 5)
      ctx.fill()
      if (b.maxHp > 1) {
        ctx.globalAlpha = 0.9
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 10px Inter'
        ctx.textAlign = 'center'
        ctx.fillText(String(b.hp), b.x + BRICK_W / 2, b.y + BRICK_H / 2 + 4)
        ctx.textAlign = 'left'
      }
      ctx.shadowBlur = 0
    })
    ctx.globalAlpha = 1

    // Particles
    g.particles.forEach(p => {
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1

    // Paddle
    const padGr = ctx.createLinearGradient(g.padX - PAD_W / 2, 0, g.padX + PAD_W / 2, 0)
    padGr.addColorStop(0, '#818cf8')
    padGr.addColorStop(0.5, '#a78bfa')
    padGr.addColorStop(1, '#818cf8')
    ctx.fillStyle = padGr
    ctx.shadowBlur = 12
    ctx.shadowColor = '#8b5cf6'
    ctx.beginPath()
    ctx.roundRect(g.padX - PAD_W / 2, PAD_Y, PAD_W, PAD_H, 6)
    ctx.fill()
    ctx.shadowBlur = 0

    // Ball
    const ballGr = ctx.createRadialGradient(g.bx - 2, g.by - 2, 1, g.bx, g.by, BALL_R)
    ballGr.addColorStop(0, '#fff')
    ballGr.addColorStop(1, '#c4b5fd')
    ctx.fillStyle = ballGr
    ctx.shadowBlur = 10
    ctx.shadowColor = '#a78bfa'
    ctx.beginPath()
    ctx.arc(g.bx, g.by, BALL_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Score
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.roundRect(W / 2 - 45, 10, 90, 32, 16)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 18px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${g.score}`, W / 2, 31)
    ctx.textAlign = 'left'

    ctx.restore()
  }, [])

  const loop = useCallback(() => {
    const g = gs.current
    if (!g.running) { draw(); return }

    if (g.shake > 0) g.shake--

    // Particles
    g.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.04 })
    g.particles = g.particles.filter(p => p.life > 0)

    if (!g.launched) { g.bx = g.padX; draw(); rafRef.current = requestAnimationFrame(loop); return }

    // Ball movement
    g.bx += g.vx
    g.by += g.vy

    // Wall bounce
    if (g.bx - BALL_R < 0) { g.bx = BALL_R; g.vx = Math.abs(g.vx) }
    if (g.bx + BALL_R > W) { g.bx = W - BALL_R; g.vx = -Math.abs(g.vx) }
    if (g.by - BALL_R < 0) { g.by = BALL_R; g.vy = Math.abs(g.vy) }

    // Paddle bounce
    if (g.by + BALL_R >= PAD_Y && g.by - BALL_R <= PAD_Y + PAD_H &&
        g.bx >= g.padX - PAD_W / 2 && g.bx <= g.padX + PAD_W / 2) {
      g.vy = -Math.abs(g.vy)
      const rel = (g.bx - g.padX) / (PAD_W / 2)
      g.vx = rel * 5
      const spd = Math.sqrt(g.vx * g.vx + g.vy * g.vy)
      const maxSpd = 8
      if (spd > maxSpd) { g.vx *= maxSpd / spd; g.vy *= maxSpd / spd }
    }

    // Fall off
    if (g.by > H + 20) {
      g.running = false
      setPhase('dead')
      posthog.capture('game_over', { game: 'dap-gach', score: g.score })
      draw()
      return
    }

    // Brick collision
    for (let i = g.bricks.length - 1; i >= 0; i--) {
      const b = g.bricks[i]
      if (g.bx + BALL_R < b.x || g.bx - BALL_R > b.x + BRICK_W) continue
      if (g.by + BALL_R < b.y || g.by - BALL_R > b.y + BRICK_H) continue

      const fromTop = Math.abs(g.by + BALL_R - b.y)
      const fromBot = Math.abs(b.y + BRICK_H - (g.by - BALL_R))
      const fromLeft = Math.abs(g.bx + BALL_R - b.x)
      const fromRight = Math.abs(b.x + BRICK_W - (g.bx - BALL_R))
      const minD = Math.min(fromTop, fromBot, fromLeft, fromRight)
      if (minD === fromTop || minD === fromBot) g.vy = -g.vy
      else g.vx = -g.vx

      b.hp--
      if (b.hp <= 0) {
        spawnParticles(b.x + BRICK_W / 2, b.y + BRICK_H / 2, b.color)
        g.bricks.splice(i, 1)
        g.score += (BRICK_ROWS - Math.floor(i / BRICK_COLS)) * 10
        g.shake = 3
        setScore(g.score)
      }
      break
    }

    if (g.bricks.length === 0) {
      g.running = false
      setPhase('won')
      posthog.capture('game_won', { game: 'dap-gach', score: g.score })
      draw()
      return
    }

    draw()
    rafRef.current = requestAnimationFrame(loop)
  }, [draw, spawnParticles])

  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const g = gs.current
    g.padX = W / 2; g.bx = W / 2; g.by = PAD_Y - BALL_R - 1
    g.vx = 3; g.vy = -5
    g.bricks = makeBricks()
    g.particles = []; g.score = 0; g.running = true; g.launched = false; g.shake = 0
    setScore(0)
    setPhase('playing')
    posthog.capture('game_started', { game: 'dap-gach' })
    rafRef.current = requestAnimationFrame(loop)
  }, [loop])

  useEffect(() => {
    draw()
    const onKey = (e: KeyboardEvent) => {
      const g = gs.current
      if (!g.running) return
      if (e.key === 'ArrowLeft' || e.key === 'a') g.padX = Math.max(PAD_W / 2, g.padX - 18)
      if (e.key === 'ArrowRight' || e.key === 'd') g.padX = Math.min(W - PAD_W / 2, g.padX + 18)
      if (e.key === ' ') { e.preventDefault(); g.launched = true }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); cancelAnimationFrame(rafRef.current) }
  }, [draw])

  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const tx = (e.touches[0].clientX - rect.left) * (W / rect.width)
    gs.current.padX = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, tx))
    gs.current.launched = true
  }

  return (
    <div className="min-h-dvh bg-[#0f0f23] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-400 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-white font-bold text-base">🧱 Đập Gạch</h1>
        <div className="text-violet-400 font-bold text-base min-w-[3rem] text-right">{score}</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-2">
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="rounded-2xl border border-gray-800 touch-none"
            style={{ maxWidth: '100%', maxHeight: '72vh' }}
            onTouchMove={onTouchMove}
            onTouchStart={onTouchMove}
            onPointerMove={e => {
              if (!gs.current.running) return
              const canvas = canvasRef.current!
              const rect = canvas.getBoundingClientRect()
              const tx = (e.clientX - rect.left) * (W / rect.width)
              gs.current.padX = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, tx))
            }}
            onClick={() => { gs.current.launched = true }}
          />
          {(phase === 'idle') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
              <div className="text-5xl mb-3">🧱</div>
              <p className="text-white text-xl font-bold mb-1">Đập Gạch</p>
              <p className="text-gray-400 text-sm mb-6 text-center px-6">Di chuyển chuột / ngón tay để điều khiển thanh chắn</p>
              <button onClick={startGame} className="bg-violet-500 hover:bg-violet-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">
                Bắt đầu
              </button>
            </div>
          )}
          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">💥</div>
              <p className="text-white text-xl font-bold mb-1">Bóng rơi mất!</p>
              <p className="text-violet-400 text-2xl font-black mb-6">{score} điểm</p>
              <button onClick={startGame} className="bg-violet-500 hover:bg-violet-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">
                Chơi lại
              </button>
            </div>
          )}
          {phase === 'won' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">🎉</div>
              <p className="text-white text-xl font-bold mb-1">Thắng rồi!</p>
              <p className="text-violet-400 text-2xl font-black mb-6">{score} điểm</p>
              <button onClick={startGame} className="bg-violet-500 hover:bg-violet-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">
                Chơi lại
              </button>
            </div>
          )}
          {phase === 'playing' && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
              <p className="text-white/40 text-xs">Chạm / di chuột để điều khiển • Nhấn để bắn</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
