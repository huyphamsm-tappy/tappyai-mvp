'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const W = 360, H = 560

interface Vec2 { x: number; y: number }

interface LevelDef {
  targets: { x: number; y: number; w: number; h: number; hp: number }[]
  boxes: { x: number; y: number; w: number; h: number }[]
  shots: number
}

const LEVELS: LevelDef[] = [
  {
    shots: 4,
    targets: [{ x: 280, y: 380, w: 28, h: 28, hp: 1 }, { x: 310, y: 380, w: 28, h: 28, hp: 1 }],
    boxes: [{ x: 260, y: 408, w: 80, h: 20 }],
  },
  {
    shots: 4,
    targets: [{ x: 275, y: 330, w: 28, h: 28, hp: 1 }, { x: 305, y: 330, w: 28, h: 28, hp: 2 }],
    boxes: [{ x: 250, y: 360, w: 40, h: 20 }, { x: 295, y: 360, w: 40, h: 20 }, { x: 250, y: 410, w: 90, h: 20 }],
  },
  {
    shots: 5,
    targets: [{ x: 270, y: 280, w: 30, h: 30, hp: 2 }, { x: 305, y: 280, w: 30, h: 30, hp: 1 }, { x: 340, y: 350, w: 28, h: 28, hp: 1 }],
    boxes: [
      { x: 245, y: 360, w: 50, h: 20 }, { x: 300, y: 360, w: 50, h: 20 },
      { x: 270, y: 310, w: 100, h: 16 },
      { x: 245, y: 410, w: 110, h: 20 },
    ],
  },
  {
    shots: 6,
    targets: [
      { x: 260, y: 250, w: 28, h: 28, hp: 2 }, { x: 295, y: 250, w: 28, h: 28, hp: 2 },
      { x: 330, y: 310, w: 28, h: 28, hp: 1 },
    ],
    boxes: [
      { x: 240, y: 280, w: 40, h: 20 }, { x: 285, y: 280, w: 40, h: 20 },
      { x: 240, y: 340, w: 40, h: 20 }, { x: 285, y: 340, w: 40, h: 20 }, { x: 310, y: 340, w: 40, h: 20 },
      { x: 240, y: 390, w: 120, h: 20 },
    ],
  },
  {
    shots: 6,
    targets: [
      { x: 255, y: 200, w: 30, h: 30, hp: 3 }, { x: 295, y: 200, w: 30, h: 30, hp: 2 },
      { x: 335, y: 270, w: 28, h: 28, hp: 1 }, { x: 255, y: 300, w: 28, h: 28, hp: 1 },
    ],
    boxes: [
      { x: 240, y: 230, w: 45, h: 18 }, { x: 290, y: 230, w: 45, h: 18 },
      { x: 240, y: 300, w: 45, h: 18 }, { x: 310, y: 300, w: 45, h: 18 },
      { x: 240, y: 350, w: 130, h: 18 },
      { x: 240, y: 410, w: 130, h: 18 },
    ],
  },
]

const GRAVITY = 0.4
const SLING_X = 70, SLING_Y = 400
const MAX_PULL = 80
const GROUND_Y = H - 50

type Phase = 'idle' | 'playing' | 'dead' | 'won'

interface Projectile {
  x: number; y: number; vx: number; vy: number; r: number; active: boolean
  trail: Vec2[]
}
interface Target { x: number; y: number; w: number; h: number; hp: number; maxHp: number; dead: boolean; shakeTimer: number }
interface Box { x: number; y: number; w: number; h: number; vx: number; vy: number; rot: number; vrot: number; on_ground: boolean }

export default function SlingshotPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [levelNum, setLevelNum] = useState(0)
  const [shotsLeft, setShotsLeft] = useState(0)
  const [targetsLeft, setTargetsLeft] = useState(0)

  const gs = useRef({
    phase: 'idle' as Phase,
    level: 0,
    proj: null as Projectile | null,
    targets: [] as Target[],
    boxes: [] as Box[],
    drag: null as Vec2 | null,
    dragStart: { x: SLING_X, y: SLING_Y } as Vec2,
    shotsLeft: 0,
    launched: false,
    settleTimer: 0,
    frame: 0,
  })

  const loadLevel = useCallback((lvlIdx: number) => {
    const def = LEVELS[lvlIdx]
    const g = gs.current
    g.level = lvlIdx
    g.proj = null
    g.drag = null
    g.launched = false
    g.settleTimer = 0
    g.shotsLeft = def.shots
    g.targets = def.targets.map(t => ({ ...t, maxHp: t.hp, dead: false, shakeTimer: 0 }))
    g.boxes = def.boxes.map(b => ({ ...b, vx: 0, vy: 0, rot: 0, vrot: 0, on_ground: false }))
    setShotsLeft(def.shots)
    setTargetsLeft(def.targets.length)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const g = gs.current

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#0ea5e9'); sky.addColorStop(1, '#7dd3fc')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)

    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    const clouds = [[40, 80, 60, 20], [140, 60, 80, 22], [260, 90, 70, 18]] as const
    for (const [cx, cy, cw, ch] of clouds) {
      ctx.beginPath(); ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.ellipse(cx - 20, cy + 5, cw * 0.6, ch * 0.8, 0, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.ellipse(cx + 20, cy + 5, cw * 0.6, ch * 0.8, 0, 0, Math.PI * 2); ctx.fill()
    }

    // Ground
    const gr = ctx.createLinearGradient(0, GROUND_Y, 0, H)
    gr.addColorStop(0, '#16a34a'); gr.addColorStop(0.3, '#15803d'); gr.addColorStop(1, '#14532d')
    ctx.fillStyle = gr; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)

    // Slingshot
    ctx.strokeStyle = '#92400e'; ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(SLING_X - 12, SLING_Y + 20); ctx.lineTo(SLING_X - 8, SLING_Y - 18); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(SLING_X + 12, SLING_Y + 20); ctx.lineTo(SLING_X + 8, SLING_Y - 18); ctx.stroke()
    // fork
    ctx.beginPath(); ctx.moveTo(SLING_X - 8, SLING_Y - 18); ctx.lineTo(SLING_X, SLING_Y - 30); ctx.lineTo(SLING_X + 8, SLING_Y - 18); ctx.stroke()

    // Boxes
    for (const b of g.boxes) {
      ctx.save()
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2)
      ctx.rotate(b.rot)
      ctx.fillStyle = '#92400e'
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.5
      ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h)
      // wood grain
      ctx.strokeStyle = '#a16207'; ctx.lineWidth = 0.5
      for (let i = -b.w / 2 + 6; i < b.w / 2; i += 8) {
        ctx.beginPath(); ctx.moveTo(i, -b.h / 2 + 2); ctx.lineTo(i, b.h / 2 - 2); ctx.stroke()
      }
      ctx.restore()
    }

    // Targets
    for (const t of g.targets) {
      if (t.dead) continue
      const sx = t.shakeTimer > 0 ? (Math.random() - 0.5) * 4 : 0
      ctx.save(); ctx.translate(t.x + t.w / 2 + sx, t.y + t.h / 2)
      // glow
      ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 8
      ctx.fillStyle = '#dc2626'
      ctx.fillRect(-t.w / 2, -t.h / 2, t.w, t.h)
      ctx.shadowBlur = 0
      ctx.strokeStyle = '#991b1b'; ctx.lineWidth = 2
      ctx.strokeRect(-t.w / 2, -t.h / 2, t.w, t.h)
      ctx.fillStyle = '#fff'; ctx.font = `${t.w * 0.7}px sans-serif`; ctx.textAlign = 'center'
      ctx.fillText('😈', 0, t.h * 0.35)
      // HP pips
      for (let i = 0; i < t.maxHp; i++) {
        ctx.fillStyle = i < t.hp ? '#fbbf24' : '#1e293b'
        ctx.beginPath(); ctx.arc(-t.w / 2 + 6 + i * 10, -t.h / 2 - 5, 3, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }

    // Projectile trail
    if (g.proj) {
      for (let i = 0; i < g.proj.trail.length; i++) {
        const alpha = i / g.proj.trail.length * 0.5
        ctx.fillStyle = `rgba(251,191,36,${alpha})`
        const tr = g.proj.r * (i / g.proj.trail.length)
        ctx.beginPath(); ctx.arc(g.proj.trail[i].x, g.proj.trail[i].y, tr, 0, Math.PI * 2); ctx.fill()
      }
      // Ball
      const grad = ctx.createRadialGradient(g.proj.x - 4, g.proj.y - 4, 2, g.proj.x, g.proj.y, g.proj.r)
      grad.addColorStop(0, '#fef3c7'); grad.addColorStop(1, '#f59e0b')
      ctx.fillStyle = grad
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 12
      ctx.beginPath(); ctx.arc(g.proj.x, g.proj.y, g.proj.r, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#fef9c3'; ctx.font = `${g.proj.r * 1.6}px sans-serif`; ctx.textAlign = 'center'
      ctx.fillText('✨', g.proj.x, g.proj.y + g.proj.r * 0.5)
    }

    // Drag state: show ball on sling + rubber band
    if (!g.proj && g.drag) {
      const dx = Math.max(-MAX_PULL, Math.min(MAX_PULL, g.drag.x - SLING_X))
      const dy = Math.max(-MAX_PULL, Math.min(MAX_PULL, g.drag.y - SLING_Y))
      const bx = SLING_X + dx, by = SLING_Y + dy
      // rubber bands
      ctx.strokeStyle = '#a16207'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(SLING_X - 8, SLING_Y - 18); ctx.lineTo(bx, by); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(SLING_X + 8, SLING_Y - 18); ctx.lineTo(bx, by); ctx.stroke()
      // power indicator
      const pull = Math.hypot(dx, dy) / MAX_PULL
      ctx.fillStyle = pull > 0.7 ? '#ef4444' : pull > 0.4 ? '#f59e0b' : '#22c55e'
      ctx.fillRect(10, 20, 80 * pull, 6)
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.strokeRect(10, 20, 80, 6)
      // ball
      ctx.fillStyle = '#f59e0b'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 8
      ctx.beginPath(); ctx.arc(bx, by, 12, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#fef9c3'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('✨', bx, by + 6)
    } else if (!g.proj && !g.drag && g.shotsLeft > 0) {
      // Ball waiting on sling
      ctx.fillStyle = '#f59e0b'
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 6
      ctx.beginPath(); ctx.arc(SLING_X, SLING_Y - 18, 12, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#fef9c3'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('✨', SLING_X, SLING_Y - 12)
    }

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, W, 36)
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`🎯 ${g.shotsLeft} đạn`, 12, 24)
    ctx.fillStyle = '#ef4444'
    ctx.fillText(`😈 ${g.targets.filter(t => !t.dead).length} mục tiêu`, 110, 24)
    ctx.fillStyle = '#fff'
    ctx.fillText(`Màn ${g.level + 1}/${LEVELS.length}`, 240, 24)
  }, [])

  const tick = useCallback(() => {
    const g = gs.current
    if (g.phase !== 'playing') { draw(); return }
    g.frame++

    // Update projectile
    if (g.proj && g.proj.active) {
      const p = g.proj
      p.vy += GRAVITY
      p.x += p.vx; p.y += p.vy
      p.trail.push({ x: p.x, y: p.y })
      if (p.trail.length > 20) p.trail.shift()

      // Ground collision
      if (p.y + p.r > GROUND_Y) { p.y = GROUND_Y - p.r; p.vy *= -0.3; p.vx *= 0.85; if (Math.abs(p.vy) < 1) { p.active = false; g.settleTimer = 30 } }
      if (p.x - p.r > W) { p.active = false; g.settleTimer = 30 }
      if (p.y - p.r > H) { p.active = false; g.settleTimer = 30 }

      // Box collisions
      for (const b of g.boxes) {
        if (p.x + p.r > b.x && p.x - p.r < b.x + b.w && p.y + p.r > b.y && p.y - p.r < b.y + b.h) {
          const push = Math.hypot(p.vx, p.vy) * 0.15
          b.vx += p.vx * push; b.vy += p.vy * push; b.vrot += (Math.random() - 0.5) * 0.15
          p.vx *= -0.3; p.vy *= -0.3
        }
      }

      // Target collisions
      for (const t of g.targets) {
        if (t.dead) continue
        if (p.x + p.r > t.x && p.x - p.r < t.x + t.w && p.y + p.r > t.y && p.y - p.r < t.y + t.h) {
          t.hp -= 1; t.shakeTimer = 8
          if (t.hp <= 0) { t.dead = true }
          p.vx *= -0.2; p.vy *= -0.3
        }
      }
      for (const t of g.targets) { if (t.shakeTimer > 0) t.shakeTimer-- }
    }

    // Physics for boxes (simple gravity + ground)
    for (const b of g.boxes) {
      if (!b.on_ground) {
        b.vy += GRAVITY * 0.5
        b.x += b.vx; b.y += b.vy; b.rot += b.vrot
        b.vx *= 0.98; b.vrot *= 0.95
        if (b.y + b.h >= GROUND_Y) { b.y = GROUND_Y - b.h; b.vy *= -0.2; b.vx *= 0.85; if (Math.abs(b.vy) < 0.5) { b.on_ground = true; b.vy = 0 } }
      }
    }

    // Settle timer (after shot lands)
    if (g.settleTimer > 0) {
      g.settleTimer--
      if (g.settleTimer === 0) {
        g.proj = null
        g.launched = false
        const alive = g.targets.filter(t => !t.dead).length
        setTargetsLeft(alive)
        if (alive === 0) {
          g.level++
          if (g.level >= LEVELS.length) { g.phase = 'won'; setPhase('won'); posthog.capture('game_won', { game: 'ban-cung-than-thanh' }); return }
          setTimeout(() => { loadLevel(g.level); setLevelNum(g.level) }, 800)
        } else if (g.shotsLeft <= 0) {
          g.phase = 'dead'; setPhase('dead'); posthog.capture('game_over', { game: 'ban-cung-than-thanh', level: g.level })
        }
      }
    }

    setShotsLeft(g.shotsLeft)
    draw()
    rafRef.current = requestAnimationFrame(tick)
  }, [draw, loadLevel])

  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    gs.current.phase = 'playing'
    setPhase('playing')
    setLevelNum(0)
    loadLevel(0)
    posthog.capture('game_started', { game: 'ban-cung-than-thanh' })
    rafRef.current = requestAnimationFrame(tick)
  }, [tick, loadLevel])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gs.current
    if (g.phase !== 'playing' || g.proj || g.launched || g.settleTimer > 0 || g.shotsLeft <= 0) return
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const scaleX = W / rect.width, scaleY = H / rect.height
    const cx = (e.clientX - rect.left) * scaleX, cy = (e.clientY - rect.top) * scaleY
    if (Math.hypot(cx - SLING_X, cy - SLING_Y) < 50) {
      g.drag = { x: cx, y: cy };
      (e.target as HTMLElement).setPointerCapture(e.pointerId)
    }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gs.current
    if (!g.drag) return
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const scaleX = W / rect.width, scaleY = H / rect.height
    g.drag = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gs.current
    if (!g.drag) return
    const dx = Math.max(-MAX_PULL, Math.min(MAX_PULL, g.drag.x - SLING_X))
    const dy = Math.max(-MAX_PULL, Math.min(MAX_PULL, g.drag.y - SLING_Y))
    const bx = SLING_X + dx, by = SLING_Y + dy
    const power = 0.22
    g.proj = { x: bx, y: by, vx: -dx * power, vy: -dy * power, r: 12, active: true, trail: [] }
    g.drag = null
    g.launched = true
    g.shotsLeft--
    setShotsLeft(g.shotsLeft)
  }, [])

  useEffect(() => {
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return (
    <div className="min-h-dvh bg-gray-950 flex flex-col items-center">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/game" className="text-gray-400 hover:text-white"><ChevronLeft size={22} /></Link>
          <h1 className="text-white font-bold text-lg flex-1">🏹 Bắn Cung Thần Thánh</h1>
        </div>

        <div className="relative px-2">
          <canvas
            ref={canvasRef} width={W} height={H}
            className="w-full rounded-2xl border border-gray-800 touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />

          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-2xl">
              <div className="text-6xl mb-3">🏹</div>
              <h2 className="text-white text-2xl font-black mb-2">Bắn Cung Thần Thánh</h2>
              <p className="text-gray-300 text-sm text-center px-8 mb-6">Kéo cung và thả để bắn hạ các mục tiêu 😈 — 5 màn thử thách!</p>
              <button onClick={startGame} className="bg-amber-500 hover:bg-amber-400 text-white font-bold px-8 py-3 rounded-2xl text-lg">Bắt Đầu</button>
            </div>
          )}

          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 rounded-2xl">
              <div className="text-5xl mb-3">💔</div>
              <h2 className="text-red-400 text-2xl font-black mb-1">Hết Đạn!</h2>
              <p className="text-gray-400 text-sm mb-2">Màn {levelNum + 1} — còn {targetsLeft} mục tiêu</p>
              <button onClick={startGame} className="mt-3 bg-red-500 hover:bg-red-400 text-white font-bold px-8 py-3 rounded-2xl text-lg">Thử Lại</button>
            </div>
          )}

          {phase === 'won' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 rounded-2xl">
              <div className="text-5xl mb-3">🏆</div>
              <h2 className="text-yellow-400 text-2xl font-black mb-1">Xuất Sắc!</h2>
              <p className="text-gray-300 text-sm mb-2">Hoàn thành tất cả 5 màn!</p>
              <button onClick={startGame} className="mt-3 bg-yellow-500 hover:bg-yellow-400 text-white font-bold px-8 py-3 rounded-2xl text-lg">Chơi Lại</button>
            </div>
          )}
        </div>

        <p className="text-gray-500 text-xs text-center mt-3 pb-4">Kéo từ cung ✨ để nhắm · Thả để bắn</p>
      </div>
    </div>
  )
}
