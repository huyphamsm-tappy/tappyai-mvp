'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const W = 360, H = 580
const GROUND_Y = H - 70
const GRAVITY = 0.55
const JUMP_V = -13

interface Obstacle { x: number; y: number; w: number; h: number; type: 'cactus' | 'rock' }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number }
interface Cloud { x: number; y: number; w: number; speed: number }

export default function ChayVoTanPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead'>('idle')

  const gs = useRef({
    px: 80, py: GROUND_Y, vy: 0, ducking: false,
    score: 0, speed: 4.5, dist: 0, running: false, frame: 0,
    obstacles: [] as Obstacle[],
    particles: [] as Particle[],
    clouds: [
      { x: 80, y: 55, w: 70, speed: 0.4 },
      { x: 220, y: 35, w: 55, speed: 0.25 },
      { x: 310, y: 70, w: 60, speed: 0.35 },
    ] as Cloud[],
    nextObs: 90, groundOff: 0,
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const g = gs.current

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#0ea5e9'); sky.addColorStop(0.65, '#7dd3fc'); sky.addColorStop(1, '#bae6fd')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)

    // Sun
    ctx.shadowBlur = 28; ctx.shadowColor = '#fde68a'
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath(); ctx.arc(W - 55, 48, 24, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0

    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    g.clouds.forEach(c => {
      ctx.beginPath()
      ctx.ellipse(c.x, c.y, c.w / 2, 17, 0, 0, Math.PI * 2)
      ctx.ellipse(c.x - c.w * 0.28, c.y + 7, c.w * 0.28, 13, 0, 0, Math.PI * 2)
      ctx.ellipse(c.x + c.w * 0.28, c.y + 7, c.w * 0.28, 13, 0, 0, Math.PI * 2)
      ctx.fill()
    })

    // Ground
    const grd = ctx.createLinearGradient(0, GROUND_Y, 0, H)
    grd.addColorStop(0, '#4ade80'); grd.addColorStop(0.08, '#22c55e')
    grd.addColorStop(0.09, '#92400e'); grd.addColorStop(1, '#78350f')
    ctx.fillStyle = grd; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)

    // Ground dashes
    ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2; ctx.globalAlpha = 0.35
    const off = g.groundOff % 50
    for (let x = -off; x < W; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, GROUND_Y + 5); ctx.lineTo(x + 25, GROUND_Y + 5); ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Obstacles
    g.obstacles.forEach(o => {
      if (o.type === 'cactus') {
        const gr = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h)
        gr.addColorStop(0, '#16a34a'); gr.addColorStop(1, '#166534')
        ctx.fillStyle = gr; ctx.shadowBlur = 5; ctx.shadowColor = '#052e16'
        ctx.beginPath(); ctx.roundRect(o.x + 5, o.y, o.w - 10, o.h, [5, 5, 0, 0]); ctx.fill()
        ctx.beginPath(); ctx.roundRect(o.x, o.y + o.h * 0.28, 11, 7, 3); ctx.fill()
        ctx.beginPath(); ctx.roundRect(o.x + o.w - 11, o.y + o.h * 0.18, 11, 7, 3); ctx.fill()
        ctx.shadowBlur = 0
      } else {
        const gr = ctx.createRadialGradient(o.x + o.w / 2, o.y + o.h / 2, 2, o.x + o.w / 2, o.y + o.h / 2, 16)
        gr.addColorStop(0, '#94a3b8'); gr.addColorStop(1, '#334155')
        ctx.fillStyle = gr; ctx.shadowBlur = 8; ctx.shadowColor = '#0f172a'
        ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0.3, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
      }
    })

    // Particles
    g.particles.forEach(p => {
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill()
    })
    ctx.globalAlpha = 1

    // Character
    const onGround = g.py >= GROUND_Y - 1
    const t = g.frame * 0.18
    const charH = g.ducking ? 20 : 40
    const charY = g.py - charH

    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.beginPath(); ctx.ellipse(g.px, GROUND_Y + 3, 16, 5, 0, 0, Math.PI * 2); ctx.fill()

    if (g.ducking) {
      const bg = ctx.createLinearGradient(g.px - 22, charY, g.px + 22, g.py)
      bg.addColorStop(0, '#f97316'); bg.addColorStop(1, '#c2410c')
      ctx.fillStyle = bg; ctx.shadowBlur = 8; ctx.shadowColor = '#ea580c'
      ctx.beginPath(); ctx.ellipse(g.px, g.py - 10, 22, 12, 0, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
    } else {
      // Body
      const bg = ctx.createLinearGradient(g.px - 12, charY, g.px + 12, g.py)
      bg.addColorStop(0, '#f97316'); bg.addColorStop(1, '#c2410c')
      ctx.fillStyle = bg; ctx.shadowBlur = 8; ctx.shadowColor = '#ea580c'
      ctx.beginPath(); ctx.roundRect(g.px - 11, charY + 10, 22, 22, [4, 4, 6, 6]); ctx.fill()
      ctx.shadowBlur = 0
      // Head
      ctx.fillStyle = '#fcd34d'; ctx.beginPath(); ctx.arc(g.px, charY + 7, 13, 0, Math.PI * 2); ctx.fill()
      // Helmet rim
      ctx.fillStyle = '#f97316'
      ctx.beginPath(); ctx.roundRect(g.px - 13, charY + 3, 26, 5, 2); ctx.fill()
      // Visor
      ctx.fillStyle = 'rgba(56,189,248,0.7)'; ctx.beginPath(); ctx.ellipse(g.px + 3, charY + 9, 7, 5, 0.1, 0, Math.PI * 2); ctx.fill()
      // Legs
      const l1 = onGround ? Math.sin(t) * 8 : -4
      const l2 = onGround ? Math.sin(t + Math.PI) * 8 : 4
      ctx.fillStyle = '#1e40af'
      ctx.beginPath(); ctx.roundRect(g.px - 9, charY + 30 + l1, 8, 14, 4); ctx.fill()
      ctx.beginPath(); ctx.roundRect(g.px + 1, charY + 30 + l2, 8, 14, 4); ctx.fill()
      // Arms
      const arm = onGround ? Math.sin(t) * 7 : 0
      ctx.fillStyle = '#f97316'
      ctx.beginPath(); ctx.roundRect(g.px - 18, charY + 13 + arm, 8, 12, 4); ctx.fill()
      ctx.beginPath(); ctx.roundRect(g.px + 10, charY + 13 - arm, 8, 12, 4); ctx.fill()
    }

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(8, 8, 95, 30, 10); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'left'
    ctx.fillText(`🏃 ${g.score} m`, 16, 28)
    ctx.textAlign = 'left'
  }, [])

  const loop = useCallback(() => {
    const g = gs.current
    if (!g.running) { draw(); return }

    g.frame++; g.dist++
    g.speed = Math.min(11, 4.5 + g.dist / 350)
    g.score = Math.floor(g.dist / 4)
    g.groundOff += g.speed
    setScore(g.score)

    g.vy += GRAVITY; g.py += g.vy
    if (g.py >= GROUND_Y) { g.py = GROUND_Y; g.vy = 0 }

    g.obstacles.forEach(o => { o.x -= g.speed })
    g.obstacles = g.obstacles.filter(o => o.x > -60)
    g.nextObs--
    if (g.nextObs <= 0) {
      const type = Math.random() < 0.55 ? 'cactus' : 'rock'
      const h = type === 'cactus' ? 32 + Math.random() * 18 : 22
      const y = type === 'cactus' ? GROUND_Y - h : GROUND_Y - 90 - Math.random() * 30
      g.obstacles.push({ x: W + 10, y, w: type === 'cactus' ? 24 : 32, h, type })
      g.nextObs = 75 + Math.random() * 55
    }

    g.clouds.forEach(c => { c.x -= c.speed; if (c.x + c.w < 0) c.x = W + c.w })
    g.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.04 })
    g.particles = g.particles.filter(p => p.life > 0)

    const charH = g.ducking ? 20 : 40
    const charY = g.py - charH
    for (const o of g.obstacles) {
      const pad = 5
      if (g.px + 9 - pad > o.x && g.px - 9 + pad < o.x + o.w && charY + pad < o.y + o.h && g.py > o.y + pad) {
        g.running = false
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2
          g.particles.push({ x: g.px, y: g.py - charH / 2, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5 - 1, life: 1, color: ['#f97316', '#fcd34d', '#ef4444'][i % 3], r: 4 + Math.random() * 4 })
        }
        setPhase('dead')
        posthog.capture('game_over', { game: 'chay-vo-tan', score: g.score })
        draw(); return
      }
    }

    draw()
    rafRef.current = requestAnimationFrame(loop)
  }, [draw])

  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const g = gs.current
    Object.assign(g, { px: 80, py: GROUND_Y, vy: 0, ducking: false, score: 0, speed: 4.5, dist: 0, running: true, frame: 0, nextObs: 90, groundOff: 0, obstacles: [], particles: [] })
    setScore(0); setPhase('playing')
    posthog.capture('game_started', { game: 'chay-vo-tan' })
    rafRef.current = requestAnimationFrame(loop)
  }, [loop])

  const doJump = useCallback(() => {
    const g = gs.current
    if (!g.running) return
    if (g.py >= GROUND_Y - 1) {
      g.vy = JUMP_V
      for (let i = 0; i < 5; i++) g.particles.push({ x: g.px, y: g.py, vx: (Math.random() - .5) * 3, vy: Math.random() * 2 + 1, life: 1, color: '#86efac', r: 3 })
    }
  }, [])

  useEffect(() => {
    draw()
    const onKey = (e: KeyboardEvent) => {
      if (!gs.current.running) return
      if (e.code === 'Space' || e.key === 'ArrowUp') doJump()
      if (e.key === 'ArrowDown') gs.current.ducking = true
    }
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'ArrowDown') gs.current.ducking = false }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); cancelAnimationFrame(rafRef.current) }
  }, [draw, doJump])

  return (
    <div className="min-h-dvh bg-[#082f49] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-400 text-sm font-medium"><ChevronLeft size={18} /> Game</Link>
        <h1 className="text-white font-bold text-base">🏃 Chạy Vô Tận</h1>
        <div className="text-orange-400 font-bold text-base min-w-[4rem] text-right">{score} m</div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <div className="relative">
          <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border border-gray-800" style={{ maxWidth: '100%', maxHeight: '72vh', touchAction: 'none' }} />
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
              <div className="text-5xl mb-3">🏃</div>
              <p className="text-white text-xl font-bold mb-1">Chạy Vô Tận</p>
              <p className="text-gray-400 text-sm mb-6 text-center px-6">Nhảy qua cây xương rồng, né đá bay — chạy càng xa càng tốt!</p>
              <button onClick={startGame} className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Bắt đầu</button>
            </div>
          )}
          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">💥</div>
              <p className="text-white text-xl font-bold mb-1">Va chạm rồi!</p>
              <p className="text-orange-400 text-3xl font-black mb-6">{score} m</p>
              <button onClick={startGame} className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Chạy lại</button>
            </div>
          )}
        </div>
        <div className="flex gap-4">
          <button onPointerDown={doJump} className="w-28 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-xl font-bold select-none transition-colors">▲ Nhảy</button>
          <button
            onPointerDown={() => { gs.current.ducking = true }}
            onPointerUp={() => { gs.current.ducking = false }}
            onPointerLeave={() => { gs.current.ducking = false }}
            className="w-28 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-xl font-bold select-none transition-colors"
          >▼ Cúi</button>
        </div>
      </div>
    </div>
  )
}
