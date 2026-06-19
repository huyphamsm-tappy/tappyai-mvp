'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const W = 360, H = 640
const R = 20
const COLS = 9
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316']
const COL_NAMES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange']

interface Bubble { x: number; y: number; color: string; row: number; col: number }

function hexToXY(row: number, col: number): { x: number; y: number } {
  const offsetX = (row % 2) * R
  return {
    x: R + col * R * 2 + offsetX,
    y: R + row * R * 1.73,
  }
}

function makeGrid(rows = 6): Bubble[] {
  const bubbles: Bubble[] = []
  for (let row = 0; row < rows; row++) {
    const cols = row % 2 === 0 ? COLS : COLS - 1
    for (let col = 0; col < cols; col++) {
      const { x, y } = hexToXY(row, col)
      bubbles.push({ x, y, color: COLORS[Math.floor(Math.random() * 4)], row, col })
    }
  }
  return bubbles
}

export default function BanBongPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead' | 'won'>('idle')

  const gs = useRef({
    bubbles: [] as Bubble[],
    bullet: null as { x: number; y: number; vx: number; vy: number; color: string } | null,
    aim: { angle: -Math.PI / 2 } as { angle: number },
    score: 0,
    running: false,
    shooterColor: COLORS[0],
    nextColor: COLORS[1],
    particles: [] as { x: number; y: number; vx: number; vy: number; r: number; life: number; color: string }[],
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const g = gs.current

    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#0c1a33')
    bg.addColorStop(1, '#1a0a2e')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Grid bubbles
    g.bubbles.forEach(b => {
      const gr = ctx.createRadialGradient(b.x - 5, b.y - 5, 2, b.x, b.y, R)
      gr.addColorStop(0, '#fff')
      gr.addColorStop(0.3, b.color)
      gr.addColorStop(1, b.color + '99')
      ctx.shadowBlur = 8
      ctx.shadowColor = b.color
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.arc(b.x, b.y, R - 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    })

    // Particles
    g.particles.forEach(p => {
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1

    // Aim line
    const SX = W / 2, SY = H - 50
    if (!g.bullet && g.running) {
      ctx.setLineDash([6, 6])
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(SX, SY)
      for (let i = 0; i < 5; i++) {
        const tx = SX + Math.cos(g.aim.angle) * (i + 1) * 60
        const ty = SY + Math.sin(g.aim.angle) * (i + 1) * 60
        ctx.lineTo(Math.max(R, Math.min(W - R, tx)), ty)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Bullet
    if (g.bullet) {
      const b = g.bullet
      const gr = ctx.createRadialGradient(b.x - 4, b.y - 4, 2, b.x, b.y, R)
      gr.addColorStop(0, '#fff')
      gr.addColorStop(1, b.color)
      ctx.shadowBlur = 14
      ctx.shadowColor = b.color
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.arc(b.x, b.y, R - 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // Shooter
    const sc = g.shooterColor
    const shgr = ctx.createRadialGradient(SX - 4, SY - 4, 2, SX, SY, R + 4)
    shgr.addColorStop(0, '#fff')
    shgr.addColorStop(1, sc)
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.beginPath()
    ctx.arc(SX, SY, R + 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = shgr
    ctx.shadowBlur = 16
    ctx.shadowColor = sc
    ctx.beginPath()
    ctx.arc(SX, SY, R + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Next bubble preview
    const nc = g.nextColor
    ctx.fillStyle = nc
    ctx.beginPath()
    ctx.arc(SX + R * 3 + 10, SY, R - 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '10px Inter'
    ctx.textAlign = 'center'
    ctx.fillText('next', SX + R * 3 + 10, SY + R + 12)
    ctx.textAlign = 'left'

    // Score
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 18px Inter'
    ctx.textAlign = 'center'
    ctx.fillText(String(g.score), W / 2, 24)
    ctx.textAlign = 'left'
  }, [])

  const findConnected = useCallback((bubbles: Bubble[], idx: number, color: string): number[] => {
    const visited = new Set<number>()
    const queue = [idx]
    while (queue.length) {
      const i = queue.shift()!
      if (visited.has(i)) continue
      visited.add(i)
      const b = bubbles[i]
      bubbles.forEach((nb, j) => {
        if (visited.has(j) || nb.color !== color) return
        const dist = Math.hypot(b.x - nb.x, b.y - nb.y)
        if (dist < R * 2.2) queue.push(j)
      })
    }
    return [...visited]
  }, [])

  const checkFloating = useCallback((bubbles: Bubble[]): number[] => {
    const connected = new Set<number>()
    const topBubbles = bubbles.map((b, i) => ({ b, i })).filter(({ b }) => b.y < R * 3)
    const queue = topBubbles.map(({ i }) => i)
    while (queue.length) {
      const i = queue.shift()!
      if (connected.has(i)) continue
      connected.add(i)
      const b = bubbles[i]
      bubbles.forEach((nb, j) => {
        if (connected.has(j)) return
        if (Math.hypot(b.x - nb.x, b.y - nb.y) < R * 2.2) queue.push(j)
      })
    }
    return bubbles.map((_, i) => i).filter(i => !connected.has(i))
  }, [])

  const spawnParticles = useCallback((x: number, y: number, color: string) => {
    const g = gs.current
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2
      const spd = Math.random() * 5 + 2
      g.particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 4 + Math.random() * 4, life: 1, color })
    }
  }, [])

  const shoot = useCallback((angle: number) => {
    const g = gs.current
    if (!g.running || g.bullet) return
    const speed = 12
    g.bullet = { x: W / 2, y: H - 50, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: g.shooterColor }
    g.shooterColor = g.nextColor
    g.nextColor = COLORS[Math.floor(Math.random() * COLORS.length)]
  }, [])

  const loop = useCallback(() => {
    const g = gs.current
    if (!g.running) { draw(); return }

    // Particles
    g.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life -= 0.04 })
    g.particles = g.particles.filter(p => p.life > 0)

    if (g.bullet) {
      const b = g.bullet
      b.x += b.vx; b.y += b.vy

      // Wall bounce
      if (b.x - R < 0) { b.x = R; b.vx = Math.abs(b.vx) }
      if (b.x + R > W) { b.x = W - R; b.vx = -Math.abs(b.vx) }

      // Top wall
      if (b.y - R < 0) {
        b.y = R
        // Snap to grid
        let row = 0
        let best = Infinity
        g.bubbles.forEach(bub => {
          const d = Math.hypot(b.x - bub.x, b.y - bub.y)
          if (d < best) { best = d; row = bub.row }
        })
        const newBub: Bubble = { x: Math.max(R, Math.min(W - R, b.x)), y: R, color: b.color, row: 0, col: 0 }
        g.bubbles.push(newBub)
        g.bullet = null

        const connected = findConnected(g.bubbles, g.bubbles.length - 1, b.color)
        if (connected.length >= 3) {
          connected.forEach(i => spawnParticles(g.bubbles[i].x, g.bubbles[i].y, b.color))
          g.score += connected.length * 10
          setScore(g.score)
          const removed = new Set(connected)
          g.bubbles = g.bubbles.filter((_, i) => !removed.has(i))
          const floating = checkFloating(g.bubbles)
          if (floating.length) {
            floating.forEach(i => spawnParticles(g.bubbles[i].x, g.bubbles[i].y, g.bubbles[i].color))
            g.score += floating.length * 5
            setScore(g.score)
            const fset = new Set(floating)
            g.bubbles = g.bubbles.filter((_, i) => !fset.has(i))
          }
        }

        if (g.bubbles.length === 0) {
          g.running = false
          setPhase('won')
          posthog.capture('game_won', { game: 'ban-bong', score: g.score })
        }
        // Check if bubbles reached bottom
        if (g.bubbles.some(bub => bub.y > H - 120)) {
          g.running = false
          setPhase('dead')
          posthog.capture('game_over', { game: 'ban-bong', score: g.score })
        }
      } else {
        // Check collision with grid
        const hit = g.bubbles.findIndex(bub => Math.hypot(b.x - bub.x, b.y - bub.y) < R * 1.9)
        if (hit !== -1) {
          // Snap bubble near the hit one
          const hitBub = g.bubbles[hit]
          const angle = Math.atan2(b.y - hitBub.y, b.x - hitBub.x)
          const sx = hitBub.x + Math.cos(angle) * R * 2
          const sy = hitBub.y + Math.sin(angle) * R * 2
          const snapped: Bubble = { x: Math.max(R, Math.min(W - R, sx)), y: Math.max(R, sy), color: b.color, row: 0, col: 0 }
          g.bubbles.push(snapped)
          g.bullet = null

          const connected = findConnected(g.bubbles, g.bubbles.length - 1, b.color)
          if (connected.length >= 3) {
            connected.forEach(i => spawnParticles(g.bubbles[i].x, g.bubbles[i].y, b.color))
            g.score += connected.length * 10
            setScore(g.score)
            const removed = new Set(connected)
            g.bubbles = g.bubbles.filter((_, i) => !removed.has(i))
            const floating = checkFloating(g.bubbles)
            if (floating.length) {
              floating.forEach(i => spawnParticles(g.bubbles[i].x, g.bubbles[i].y, g.bubbles[i].color))
              g.score += floating.length * 5
              setScore(g.score)
              const fset = new Set(floating)
              g.bubbles = g.bubbles.filter((_, i) => !fset.has(i))
            }
          }

          if (g.bubbles.length === 0) { g.running = false; setPhase('won'); posthog.capture('game_won', { game: 'ban-bong', score: g.score }) }
          if (g.bubbles.some(bub => bub.y > H - 120)) { g.running = false; setPhase('dead'); posthog.capture('game_over', { game: 'ban-bong', score: g.score }) }
        }
      }
    }

    draw()
    rafRef.current = requestAnimationFrame(loop)
  }, [draw, findConnected, checkFloating, spawnParticles])

  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const g = gs.current
    g.bubbles = makeGrid()
    g.bullet = null
    g.score = 0
    g.running = true
    g.particles = []
    g.shooterColor = COLORS[Math.floor(Math.random() * COLORS.length)]
    g.nextColor = COLORS[Math.floor(Math.random() * COLORS.length)]
    setScore(0)
    setPhase('playing')
    posthog.capture('game_started', { game: 'ban-bong' })
    rafRef.current = requestAnimationFrame(loop)
  }, [loop])

  useEffect(() => {
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const cx = (e.clientX - rect.left) * (W / rect.width)
    const cy = (e.clientY - rect.top) * (H / rect.height)
    const angle = Math.atan2(cy - (H - 50), cx - W / 2)
    const clamped = Math.max(-Math.PI + 0.2, Math.min(-0.2, angle))
    shoot(clamped)
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const cx = (e.changedTouches[0].clientX - rect.left) * (W / rect.width)
    const cy = (e.changedTouches[0].clientY - rect.top) * (H / rect.height)
    const angle = Math.atan2(cy - (H - 50), cx - W / 2)
    const clamped = Math.max(-Math.PI + 0.2, Math.min(-0.2, angle))
    shoot(clamped)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gs.current.running) return
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const cx = (e.clientX - rect.left) * (W / rect.width)
    const cy = (e.clientY - rect.top) * (H / rect.height)
    const angle = Math.atan2(cy - (H - 50), cx - W / 2)
    gs.current.aim.angle = Math.max(-Math.PI + 0.2, Math.min(-0.2, angle))
  }

  return (
    <div className="min-h-dvh bg-[#0c1a33] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-400 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-white font-bold text-base">🫧 Bắn Bóng</h1>
        <div className="text-cyan-400 font-bold text-base min-w-[3rem] text-right">{score}</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="rounded-2xl border border-gray-800"
            style={{ maxWidth: '100%', maxHeight: '72vh', cursor: 'crosshair' }}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onTouchEnd={handleTouchEnd}
          />
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
              <div className="text-5xl mb-3">🫧</div>
              <p className="text-white text-xl font-bold mb-1">Bắn Bóng</p>
              <p className="text-gray-400 text-sm mb-6 text-center px-6">Nhắm và chạm để bắn — ghép 3+ cùng màu</p>
              <button onClick={startGame} className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">
                Bắt đầu
              </button>
            </div>
          )}
          {(phase === 'dead' || phase === 'won') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">{phase === 'won' ? '🎉' : '💥'}</div>
              <p className="text-white text-xl font-bold mb-1">{phase === 'won' ? 'Thắng!' : 'Thua!'}</p>
              <p className="text-cyan-400 text-2xl font-black mb-6">{score} điểm</p>
              <button onClick={startGame} className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">
                Chơi lại
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
