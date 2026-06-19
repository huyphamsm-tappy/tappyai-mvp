'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const W = 360, H = 600
const GRAVITY = 0.4
const JUMP_V = -11
const PLAT_W = 80, PLAT_H = 14
const PLAT_COUNT = 9
const SCROLL_TRIGGER = H * 0.4

interface Platform { x: number; y: number; w: number; type: 'normal' | 'moving'; vx?: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number }

function makePlatform(y: number): Platform {
  const moving = Math.random() < 0.25
  return {
    x: 20 + Math.random() * (W - PLAT_W - 40),
    y,
    w: PLAT_W + Math.random() * 20,
    type: moving ? 'moving' : 'normal',
    vx: moving ? (Math.random() > 0.5 ? 1.5 : -1.5) : 0,
  }
}

function initPlatforms(): Platform[] {
  const plats: Platform[] = [{ x: W / 2 - PLAT_W / 2, y: H - 80, w: PLAT_W + 40, type: 'normal' }]
  for (let i = 1; i < PLAT_COUNT; i++) {
    plats.push(makePlatform(H - 80 - i * (H / PLAT_COUNT)))
  }
  return plats
}

export default function NhayVoCucPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead'>('idle')
  const touchRef = useRef<{ x: number } | null>(null)

  const gs = useRef({
    px: W / 2, py: H - 100,
    vx: 0, vy: 0,
    platforms: [] as Platform[],
    cameraY: 0,
    score: 0,
    highest: H,
    running: false,
    particles: [] as Particle[],
    stars: Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5 + 0.5, blink: Math.random() * Math.PI * 2 })),
    tilt: 0,
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const g = gs.current
    const cam = g.cameraY

    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#020617')
    bg.addColorStop(0.5, '#0f0a2e')
    bg.addColorStop(1, '#1e1040')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Stars
    g.stars.forEach(s => {
      const sy = ((s.y - cam * 0.15) % H + H) % H
      const alpha = 0.4 + Math.sin(s.blink + g.score * 0.05) * 0.3
      ctx.globalAlpha = alpha
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(s.x, sy, s.r, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1

    // Platforms
    g.platforms.forEach(p => {
      const py = p.y - cam
      if (py < -PLAT_H || py > H + PLAT_H) return
      const gr = ctx.createLinearGradient(p.x, py, p.x, py + PLAT_H)
      const isMoving = p.type === 'moving'
      gr.addColorStop(0, isMoving ? '#f59e0b' : '#4ade80')
      gr.addColorStop(1, isMoving ? '#b45309' : '#16a34a')
      ctx.fillStyle = gr
      ctx.shadowBlur = 8
      ctx.shadowColor = isMoving ? '#f59e0b' : '#4ade80'
      ctx.beginPath()
      ctx.roundRect(p.x, py, p.w, PLAT_H, 7)
      ctx.fill()
      ctx.shadowBlur = 0
    })

    // Particles
    g.particles.forEach(p => {
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y - cam, p.r * p.life, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1

    // Character (little astronaut)
    const cx = g.px, cy = g.py - cam
    const jumping = g.vy < 0

    // Body
    const bodyGr = ctx.createRadialGradient(cx, cy, 2, cx, cy, 16)
    bodyGr.addColorStop(0, '#dbeafe')
    bodyGr.addColorStop(1, '#3b82f6')
    ctx.fillStyle = bodyGr
    ctx.shadowBlur = jumping ? 14 : 6
    ctx.shadowColor = '#3b82f6'
    ctx.beginPath()
    ctx.ellipse(cx, cy, 14, 16, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Helmet visor
    ctx.fillStyle = 'rgba(147,210,255,0.7)'
    ctx.beginPath()
    ctx.ellipse(cx + 2, cy - 6, 9, 7, 0.2, 0, Math.PI * 2)
    ctx.fill()

    // Legs
    const legOff = jumping ? -3 : Math.sin(Date.now() * 0.008) * 4
    ctx.fillStyle = '#1d4ed8'
    ctx.beginPath(); ctx.ellipse(cx - 5, cy + 14 + legOff, 4, 6, 0.3, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(cx + 5, cy + 14 - legOff, 4, 6, -0.3, 0, Math.PI * 2); ctx.fill()

    // Jetpack glow when jumping
    if (jumping) {
      ctx.shadowBlur = 20
      ctx.shadowColor = '#f97316'
      ctx.fillStyle = '#fdba74'
      ctx.beginPath()
      ctx.ellipse(cx, cy + 18, 5, 8 + Math.random() * 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.roundRect(W / 2 - 45, 12, 90, 30, 15)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 16px Inter'
    ctx.textAlign = 'center'
    ctx.fillText(`${g.score} m`, W / 2, 31)
    ctx.textAlign = 'left'
  }, [])

  const loop = useCallback(() => {
    const g = gs.current
    if (!g.running) { draw(); return }

    // Move platforms
    g.platforms.forEach(p => {
      if (p.type === 'moving') {
        p.x += p.vx!
        if (p.x < 10 || p.x + p.w > W - 10) p.vx! *= -1
      }
    })

    // Physics
    g.vy += GRAVITY
    g.vx += g.tilt * 0.5
    g.vx *= 0.88
    g.px += g.vx
    g.py += g.vy

    // Wall wrap
    if (g.px < -14) g.px = W + 14
    if (g.px > W + 14) g.px = -14

    // Platform collision (only when falling)
    if (g.vy > 0) {
      for (const p of g.platforms) {
        if (g.px + 12 > p.x && g.px - 12 < p.x + p.w &&
            g.py + 16 >= p.y && g.py + 16 <= p.y + PLAT_H + Math.abs(g.vy) + 2) {
          g.py = p.y - 16
          g.vy = JUMP_V
          // Jump particles
          for (let i = 0; i < 6; i++) {
            const a = Math.PI + (Math.random() - 0.5) * 1.2
            g.particles.push({ x: g.px, y: g.py + 16, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 1, color: p.type === 'moving' ? '#fcd34d' : '#86efac', r: 3 + Math.random() * 3 })
          }
          break
        }
      }
    }

    // Particles
    g.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.05 })
    g.particles = g.particles.filter(p => p.life > 0)

    // Camera scroll
    const screenY = g.py - g.cameraY
    if (screenY < SCROLL_TRIGGER) {
      const delta = SCROLL_TRIGGER - screenY
      g.cameraY -= delta
      const height = Math.round(-g.cameraY / 10)
      if (height > g.score) {
        g.score = height
        setScore(height)
      }
    }

    // Spawn new platforms
    const topY = g.cameraY
    while (g.platforms.length < PLAT_COUNT + 5) {
      const lowestY = Math.min(...g.platforms.map(p => p.y))
      g.platforms.push(makePlatform(lowestY - 60 - Math.random() * 40))
    }
    g.platforms = g.platforms.filter(p => p.y < topY + H + 100)

    // Fall off bottom
    if (g.py - g.cameraY > H + 50) {
      g.running = false
      setPhase('dead')
      posthog.capture('game_over', { game: 'nhay-vo-cuc', score: g.score })
      draw()
      return
    }

    draw()
    rafRef.current = requestAnimationFrame(loop)
  }, [draw])

  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const g = gs.current
    g.px = W / 2; g.py = H - 100
    g.vx = 0; g.vy = 0
    g.platforms = initPlatforms()
    g.cameraY = 0; g.score = 0; g.running = true; g.particles = []; g.tilt = 0
    setScore(0)
    setPhase('playing')
    posthog.capture('game_started', { game: 'nhay-vo-cuc' })
    rafRef.current = requestAnimationFrame(loop)
  }, [loop])

  useEffect(() => {
    draw()
    const onKey = (e: KeyboardEvent) => {
      if (!gs.current.running) return
      if (e.key === 'ArrowLeft') gs.current.tilt = -1
      if (e.key === 'ArrowRight') gs.current.tilt = 1
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') gs.current.tilt = 0
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      cancelAnimationFrame(rafRef.current)
    }
  }, [draw])

  const onTouchStart = (e: React.TouchEvent) => {
    touchRef.current = { x: e.touches[0].clientX }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchRef.current || !gs.current.running) return
    const dx = e.touches[0].clientX - touchRef.current.x
    gs.current.tilt = Math.sign(dx) * Math.min(Math.abs(dx) / 30, 2)
  }
  const onTouchEnd = () => {
    if (gs.current.running) gs.current.tilt = 0
    touchRef.current = null
  }

  return (
    <div className="min-h-dvh bg-[#020617] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-400 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-white font-bold text-base">🌙 Nhảy Vô Cực</h1>
        <div className="text-blue-400 font-bold text-base min-w-[4rem] text-right">{score} m</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <div
          className="relative"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="rounded-2xl border border-gray-800"
            style={{ maxWidth: '100%', maxHeight: '75vh', touchAction: 'none' }}
          />
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
              <div className="text-5xl mb-3">🌙</div>
              <p className="text-white text-xl font-bold mb-1">Nhảy Vô Cực</p>
              <p className="text-gray-400 text-sm mb-6 text-center px-6">Nghiêng / mũi tên trái-phải để di chuyển, rơi xuống là thua</p>
              <button onClick={startGame} className="bg-blue-500 hover:bg-blue-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">
                Bắt đầu
              </button>
            </div>
          )}
          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">🌌</div>
              <p className="text-white text-xl font-bold mb-1">Rơi xuống rồi!</p>
              <p className="text-blue-400 text-3xl font-black mb-6">{score} m</p>
              <button onClick={startGame} className="bg-blue-500 hover:bg-blue-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">
                Chơi lại
              </button>
            </div>
          )}
        </div>

        {/* Touch controls */}
        <div className="flex gap-8">
          <button
            onPointerDown={() => { gs.current.tilt = -2 }}
            onPointerUp={() => { gs.current.tilt = 0 }}
            onPointerLeave={() => { gs.current.tilt = 0 }}
            className="w-20 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-2xl font-bold select-none transition-colors"
          >◀</button>
          <button
            onPointerDown={() => { gs.current.tilt = 2 }}
            onPointerUp={() => { gs.current.tilt = 0 }}
            onPointerLeave={() => { gs.current.tilt = 0 }}
            className="w-20 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-2xl font-bold select-none transition-colors"
          >▶</button>
        </div>
      </div>
    </div>
  )
}
