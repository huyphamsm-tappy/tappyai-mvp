'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const W = 360
const H = 640
const GRAVITY = 0.35
const FLAP = -7.5
const PIPE_W = 52
const PIPE_GAP = 155
const PIPE_SPEED = 2.4
const PIPE_INTERVAL = 95 // frames

interface Pipe { x: number; topH: number; scored: boolean }

export default function RongBayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead'>('idle')

  const gs = useRef({
    y: H / 2, vy: 0, score: 0,
    pipes: [] as Pipe[],
    frame: 0,
    running: false,
    particles: [] as { x: number; y: number; vx: number; vy: number; r: number; life: number; color: string }[],
    bgOffset: 0,
    wingAngle: 0,
  })

  const flap = useCallback(() => {
    const g = gs.current
    if (!g.running) return
    g.vy = FLAP
    // spawn particles
    for (let i = 0; i < 8; i++) {
      g.particles.push({
        x: 80, y: g.y + 10,
        vx: -Math.random() * 3 - 1,
        vy: (Math.random() - 0.5) * 3,
        r: Math.random() * 4 + 2,
        life: 1,
        color: ['#f97316', '#fb923c', '#fde68a', '#fbbf24'][Math.floor(Math.random() * 4)],
      })
    }
  }, [])

  const drawBg = useCallback((ctx: CanvasRenderingContext2D, bgOffset: number) => {
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, '#0c0a1e')
    grad.addColorStop(0.5, '#1e1040')
    grad.addColorStop(1, '#2d1b69')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    const stars = [[50,80],[120,40],[200,100],[300,60],[80,200],[250,150],[340,220],[30,300],[180,280],[320,180]]
    stars.forEach(([sx, sy]) => {
      const tx = ((sx - bgOffset * 0.2) % W + W) % W
      ctx.beginPath()
      ctx.arc(tx, sy, 1.5, 0, Math.PI * 2)
      ctx.fill()
    })

    // Mountains
    ctx.fillStyle = 'rgba(99,60,180,0.3)'
    ctx.beginPath()
    ctx.moveTo(0, H)
    for (let x = 0; x <= W; x += 40) {
      const mx = ((x - bgOffset * 0.4) % (W + 80) + W + 80) % (W + 80) - 80
      ctx.lineTo(mx, H - 100 - Math.sin(x * 0.05) * 80)
    }
    ctx.lineTo(W, H)
    ctx.fill()
  }, [])

  const drawDragon = useCallback((ctx: CanvasRenderingContext2D, y: number, vy: number, wingAngle: number) => {
    const x = 80
    const tilt = Math.min(Math.max(vy * 3, -35), 35)

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((tilt * Math.PI) / 180)

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(2, 24, 18, 6, 0, 0, Math.PI * 2)
    ctx.fill()

    // Tail
    ctx.strokeStyle = '#f97316'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-14, 0)
    ctx.bezierCurveTo(-30, 8, -28, -12, -40, -4)
    ctx.stroke()

    // Body
    const bodyGrad = ctx.createRadialGradient(-2, -4, 4, -2, -4, 20)
    bodyGrad.addColorStop(0, '#fb923c')
    bodyGrad.addColorStop(1, '#c2410c')
    ctx.fillStyle = bodyGrad
    ctx.beginPath()
    ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI * 2)
    ctx.fill()

    // Wings
    const wa = wingAngle
    ctx.fillStyle = 'rgba(253,186,116,0.85)'
    ctx.beginPath()
    ctx.moveTo(-4, -8)
    ctx.bezierCurveTo(-4, -8 - wa * 18, 20, -8 - wa * 22, 24, -14 - wa * 10)
    ctx.bezierCurveTo(16, -8 - wa * 5, -4, -8 - wa * 10, -4, -8)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-4, -8)
    ctx.bezierCurveTo(-4, -8 + (1-wa) * 12, 20, -8 + (1-wa) * 14, 24, -2 + (1-wa) * 8)
    ctx.bezierCurveTo(16, -4 + (1-wa) * 4, -4, -6 + (1-wa) * 6, -4, -8)
    ctx.fill()

    // Head
    const headGrad = ctx.createRadialGradient(16, -6, 2, 16, -6, 12)
    headGrad.addColorStop(0, '#fed7aa')
    headGrad.addColorStop(1, '#ea580c')
    ctx.fillStyle = headGrad
    ctx.beginPath()
    ctx.ellipse(16, -6, 13, 10, 0.2, 0, Math.PI * 2)
    ctx.fill()

    // Eye
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(22, -9, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1e1040'
    ctx.beginPath()
    ctx.arc(23, -9, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(24, -10, 1, 0, Math.PI * 2)
    ctx.fill()

    // Nose fire
    ctx.shadowBlur = 8
    ctx.shadowColor = '#f97316'
    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.moveTo(28, -6)
    ctx.lineTo(38 + Math.sin(Date.now() * 0.02) * 3, -4)
    ctx.lineTo(28, -2)
    ctx.fill()
    ctx.shadowBlur = 0

    ctx.restore()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const g = gs.current

    drawBg(ctx, g.bgOffset)

    // Pipes
    g.pipes.forEach(p => {
      const pipeGrad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0)
      pipeGrad.addColorStop(0, '#166534')
      pipeGrad.addColorStop(0.4, '#16a34a')
      pipeGrad.addColorStop(1, '#15803d')
      ctx.fillStyle = pipeGrad
      // top pipe
      ctx.beginPath()
      ctx.roundRect(p.x, 0, PIPE_W, p.topH, [0, 0, 8, 8])
      ctx.fill()
      // cap
      ctx.fillStyle = '#4ade80'
      ctx.beginPath()
      ctx.roundRect(p.x - 3, p.topH - 16, PIPE_W + 6, 16, [4, 4, 0, 0])
      ctx.fill()
      // bottom pipe
      const botY = p.topH + PIPE_GAP
      ctx.fillStyle = pipeGrad
      ctx.beginPath()
      ctx.roundRect(p.x, botY, PIPE_W, H - botY, [8, 8, 0, 0])
      ctx.fill()
      ctx.fillStyle = '#4ade80'
      ctx.beginPath()
      ctx.roundRect(p.x - 3, botY, PIPE_W + 6, 16, [0, 0, 4, 4])
      ctx.fill()
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

    drawDragon(ctx, g.y, g.vy, (Math.sin(g.frame * 0.15) + 1) / 2)

    // Score HUD
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.roundRect(W / 2 - 40, 14, 80, 36, 18)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 22px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(g.score), W / 2, 39)
    ctx.textAlign = 'left'
  }, [drawBg, drawDragon])

  const gameLoop = useCallback(() => {
    const g = gs.current
    if (!g.running) { draw(); return }

    g.frame++
    g.bgOffset += 1

    // Physics
    g.vy += GRAVITY
    g.y += g.vy
    g.wingAngle = (Math.sin(g.frame * 0.15) + 1) / 2

    // Spawn pipes
    if (g.frame % PIPE_INTERVAL === 0) {
      const topH = 80 + Math.random() * (H - PIPE_GAP - 160)
      g.pipes.push({ x: W, topH, scored: false })
    }

    // Move pipes
    g.pipes = g.pipes.filter(p => p.x + PIPE_W > -10)
    g.pipes.forEach(p => {
      p.x -= PIPE_SPEED
      if (!p.scored && p.x + PIPE_W < 80) {
        p.scored = true
        g.score++
        setScore(g.score)
      }
    })

    // Particles
    g.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.06
    })
    g.particles = g.particles.filter(p => p.life > 0)

    // Collision
    const hx = 80, hy = g.y, hr = 12
    const hit = g.y < 10 || g.y > H - 10 ||
      g.pipes.some(p => {
        if (hx + hr < p.x || hx - hr > p.x + PIPE_W) return false
        return hy - hr < p.topH || hy + hr > p.topH + PIPE_GAP
      })

    if (hit) {
      g.running = false
      setPhase('dead')
      posthog.capture('game_over', { game: 'rong-bay', score: g.score })
    }

    draw()
    rafRef.current = requestAnimationFrame(gameLoop)
  }, [draw])

  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const g = gs.current
    g.y = H / 2; g.vy = 0; g.score = 0; g.pipes = []
    g.frame = 0; g.running = true; g.particles = []; g.bgOffset = 0
    setScore(0)
    setPhase('playing')
    posthog.capture('game_started', { game: 'rong-bay' })
    rafRef.current = requestAnimationFrame(gameLoop)
  }, [gameLoop])

  useEffect(() => {
    draw()
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (phase === 'idle' || phase === 'dead') startGame()
        else flap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(rafRef.current)
    }
  }, [draw, startGame, flap, phase])

  const handleTap = () => {
    if (phase === 'idle' || phase === 'dead') startGame()
    else flap()
  }

  return (
    <div className="min-h-dvh bg-[#0c0a1e] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-400 text-sm font-medium">
          <ChevronLeft size={18} /> Game
        </Link>
        <h1 className="text-white font-bold text-base">🐉 Rồng Bay</h1>
        <div className="text-orange-400 font-bold text-base min-w-[3rem] text-right">{score}</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative" onClick={handleTap} style={{ touchAction: 'none' }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="rounded-2xl border border-gray-800"
            style={{ maxWidth: '100%', maxHeight: '70vh', cursor: 'pointer' }}
          />
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm pointer-events-none">
              <div className="text-6xl mb-3">🐉</div>
              <p className="text-white text-2xl font-black mb-1">Rồng Bay</p>
              <p className="text-gray-300 text-sm mb-8 text-center px-8">Chạm / nhấn Cách để bay</p>
              <div className="bg-orange-500 text-white font-bold px-8 py-3 rounded-2xl text-base">Chạm để bắt đầu</div>
            </div>
          )}
          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm pointer-events-none">
              <div className="text-4xl mb-2">💫</div>
              <p className="text-white text-xl font-bold mb-1">Rồng đã ngã!</p>
              <p className="text-orange-400 text-3xl font-black mb-2">{score}</p>
              <p className="text-gray-400 text-sm mb-6">điểm</p>
              <div className="bg-orange-500 text-white font-bold px-8 py-3 rounded-2xl text-base">Chạm để bay lại</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
