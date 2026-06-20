'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const W = 360, H = 580
const LANE_W = 80
const LANES = [80, 160, 240, 320]       // 4 lane centers
const ROAD_LEFT = 40, ROAD_RIGHT = 360  // road bounds
const PLAYER_W = 36, PLAYER_H = 56

interface Car { x: number; y: number; w: number; h: number; color: string; accent: string; speed: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number }
interface RoadLine { y: number }

const CAR_COLORS: [string, string][] = [
  ['#ef4444', '#fca5a5'], ['#3b82f6', '#93c5fd'], ['#f59e0b', '#fde68a'],
  ['#8b5cf6', '#c4b5fd'], ['#ec4899', '#f9a8d4'], ['#14b8a6', '#5eead4'],
]

function mkTrafficCar(speed: number): Car {
  const lane = LANES[Math.floor(Math.random() * LANES.length)]
  const [color, accent] = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]
  return { x: lane - 18, y: -70, w: 36, h: 56, color, accent, speed: speed * (0.7 + Math.random() * 0.6) }
}

function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, accent: string, flip = false) {
  const sy = flip ? -1 : 1
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(1, flip ? -1 : 1)
  const cx = 0, cy = 0
  const hw = w / 2, hh = h / 2

  // Body shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(cx + 3, cy + hh + 3, hw, 6, 0, 0, Math.PI * 2); ctx.fill()

  // Main body
  const gr = ctx.createLinearGradient(-hw, -hh, hw, hh)
  gr.addColorStop(0, color); gr.addColorStop(1, shadeColor(color, -30))
  ctx.fillStyle = gr; ctx.shadowBlur = 8; ctx.shadowColor = color
  ctx.beginPath(); ctx.roundRect(-hw, -hh + 8, w, h - 16, [4, 4, 8, 8]); ctx.fill()
  ctx.shadowBlur = 0

  // Cab / roof
  const roofGr = ctx.createLinearGradient(-hw * 0.6, -hh, hw * 0.6, -hh + h * 0.4)
  roofGr.addColorStop(0, shadeColor(color, 20)); roofGr.addColorStop(1, color)
  ctx.fillStyle = roofGr
  ctx.beginPath(); ctx.roundRect(-hw * 0.6, -hh, w * 0.6 + hw * 0.6, h * 0.42, [6, 6, 4, 4]); ctx.fill()

  // Windshield
  ctx.fillStyle = 'rgba(186,230,253,0.75)'
  ctx.beginPath(); ctx.roundRect(-hw * 0.5, -hh + 2, w * 0.5 + hw * 0.5 - 2, h * 0.22, [4, 4, 2, 2]); ctx.fill()
  // Rear window
  ctx.fillStyle = 'rgba(186,230,253,0.55)'
  ctx.beginPath(); ctx.roundRect(-hw * 0.45, -hh + h * 0.25, w * 0.45 + hw * 0.45 - 2, h * 0.14, 2); ctx.fill()

  // Stripe
  ctx.fillStyle = accent; ctx.globalAlpha = 0.5
  ctx.fillRect(-hw, -8, w, 6)
  ctx.globalAlpha = 1

  // Wheels
  const wc = '#1e293b'; const wh = 10, ww = 8
  ctx.fillStyle = wc
  ctx.beginPath(); ctx.ellipse(-hw + ww / 2, -hh + wh, ww / 2, wh / 2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(hw - ww / 2, -hh + wh, ww / 2, wh / 2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(-hw + ww / 2, hh - wh, ww / 2, wh / 2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(hw - ww / 2, hh - wh, ww / 2, wh / 2, 0, 0, Math.PI * 2); ctx.fill()
  // Wheel rims
  ctx.fillStyle = '#94a3b8'
  ;[[-hw + ww / 2, -hh + wh], [hw - ww / 2, -hh + wh], [-hw + ww / 2, hh - wh], [hw - ww / 2, hh - wh]].forEach(([wx, wy]) => {
    ctx.beginPath(); ctx.arc(wx, wy, 3, 0, Math.PI * 2); ctx.fill()
  })

  // Headlights / taillights
  ctx.fillStyle = flip ? '#ef4444' : '#fbbf24'
  ctx.shadowBlur = flip ? 8 : 12; ctx.shadowColor = flip ? '#ef4444' : '#fbbf24'
  ctx.beginPath(); ctx.ellipse(-hw + 6, -hh + 3, 5, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(hw - 6, -hh + 3, 5, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.shadowBlur = 0

  ctx.restore()
  void sy // silence unused
}

function shadeColor(hex: string, pct: number): string {
  const num = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + pct))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + pct))
  const b = Math.min(255, Math.max(0, (num & 0xff) + pct))
  return `rgb(${r},${g},${b})`
}

export default function DuaXeVoTanPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead'>('idle')
  const keys = useRef<Record<string, boolean>>({})

  const gs = useRef({
    px: LANES[1] - PLAYER_W / 2, py: H - 100,
    targetX: LANES[1] - PLAYER_W / 2,
    speed: 5, dist: 0, score: 0, running: false, frame: 0,
    cars: [] as Car[], particles: [] as Particle[],
    roadLines: Array.from({ length: 10 }, (_, i) => ({ y: i * 60 })) as RoadLine[],
    nextCar: 90, laneMove: 0,
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!; const g = gs.current

    // Background (countryside)
    ctx.fillStyle = '#166534'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#15803d'; ctx.fillRect(0, 0, ROAD_LEFT, H)
    ctx.fillStyle = '#15803d'; ctx.fillRect(ROAD_RIGHT, 0, W - ROAD_RIGHT, H)

    // Grass details
    ctx.fillStyle = '#14532d'; ctx.globalAlpha = 0.5
    for (let i = 0; i < 12; i++) {
      const gx = (i * 47 + g.dist * 0.3) % (ROAD_LEFT - 8)
      const gy = (i * 83 + g.dist * 0.5) % H
      ctx.fillRect(gx, gy, 14, 4)
      const gx2 = ROAD_RIGHT + (i * 61 + g.dist * 0.3) % (W - ROAD_RIGHT - 8)
      ctx.fillRect(gx2, (i * 71 + g.dist * 0.4) % H, 12, 4)
    }
    ctx.globalAlpha = 1

    // Road
    const roadGr = ctx.createLinearGradient(ROAD_LEFT, 0, ROAD_RIGHT, 0)
    roadGr.addColorStop(0, '#374151'); roadGr.addColorStop(0.5, '#4b5563'); roadGr.addColorStop(1, '#374151')
    ctx.fillStyle = roadGr; ctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, H)

    // Road edges (white)
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(ROAD_LEFT, 0, 4, H)
    ctx.fillRect(ROAD_RIGHT - 4, 0, 4, H)

    // Lane dashes
    const dashOff = g.dist % 60
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3; ctx.setLineDash([30, 28])
    ctx.lineDashOffset = -dashOff
    LANES.slice(1, -1).forEach(lx => {
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H); ctx.stroke()
    })
    ctx.setLineDash([])

    // Traffic cars
    g.cars.forEach(c => drawCar(ctx, c.x, c.y, c.w, c.h, c.color, c.accent, true))

    // Particles
    g.particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill() })
    ctx.globalAlpha = 1

    // Player car
    drawCar(ctx, g.px, g.py, PLAYER_W, PLAYER_H, '#22d3ee', '#a5f3fc', false)

    // Speed lines when fast
    if (g.speed > 8) {
      ctx.strokeStyle = `rgba(255,255,255,${(g.speed - 8) * 0.04})`
      ctx.lineWidth = 1
      for (let i = 0; i < 8; i++) {
        const lx = ROAD_LEFT + 10 + (i * 43) % (ROAD_RIGHT - ROAD_LEFT - 20)
        ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H); ctx.stroke()
      }
    }

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.roundRect(8, 8, 120, 30, 10); ctx.fill()
    ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'left'
    ctx.fillText(`🚗 ${g.score} m`, 16, 28)
    const spd = Math.min(10, Math.floor((g.speed - 5) / 7 * 10))
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.roundRect(W - 90, 8, 82, 30, 10); ctx.fill()
    ctx.fillStyle = spd > 7 ? '#ef4444' : '#fbbf24'; ctx.textAlign = 'right'
    ctx.fillText(`⚡ ${spd}/10`, W - 10, 28)
    ctx.textAlign = 'left'
  }, [])

  const loop = useCallback(() => {
    const g = gs.current
    if (!g.running) { draw(); return }
    g.frame++; g.dist += Math.floor(g.speed * 0.8)
    g.speed = Math.min(12, 5 + g.dist / 1500)
    g.score = Math.floor(g.dist / 10)
    setScore(g.score)

    // Move player
    const k = keys.current
    if (k['ArrowLeft']) g.targetX = Math.max(ROAD_LEFT + 4, g.targetX - 4)
    if (k['ArrowRight']) g.targetX = Math.min(ROAD_RIGHT - PLAYER_W - 4, g.targetX + 4)
    g.px += (g.targetX - g.px) * 0.25

    // Move traffic
    g.cars.forEach(c => { c.y += c.speed + g.speed })
    g.cars = g.cars.filter(c => c.y < H + 80)
    g.nextCar--
    if (g.nextCar <= 0) {
      g.cars.push(mkTrafficCar(g.speed))
      g.nextCar = Math.max(35, 90 - Math.floor(g.dist / 500))
    }

    // Collision
    for (const c of g.cars) {
      const pad = 5
      if (g.px + PLAYER_W - pad > c.x + pad && g.px + pad < c.x + c.w - pad &&
          g.py + PLAYER_H - pad > c.y + pad && g.py + pad < c.y + c.h - pad) {
        g.running = false
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2
          g.particles.push({ x: g.px + PLAYER_W / 2, y: g.py + PLAYER_H / 2, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, life: 1, color: ['#f97316', '#fbbf24', '#ef4444', '#fff'][i % 4], r: 5 + Math.random() * 5 })
        }
        setPhase('dead'); posthog.capture('game_over', { game: 'dua-xe-vo-tan', score: g.score }); draw(); return
      }
    }

    g.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= 0.93; p.vy *= 0.93; p.life -= 0.03 })
    g.particles = g.particles.filter(p => p.life > 0)

    draw()
    rafRef.current = requestAnimationFrame(loop)
  }, [draw])

  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const g = gs.current
    Object.assign(g, { px: LANES[1] - PLAYER_W / 2, targetX: LANES[1] - PLAYER_W / 2, py: H - 100, speed: 5, dist: 0, score: 0, running: true, frame: 0, nextCar: 80, cars: [], particles: [] })
    setScore(0); setPhase('playing')
    posthog.capture('game_started', { game: 'dua-xe-vo-tan' })
    rafRef.current = requestAnimationFrame(loop)
  }, [loop])

  useEffect(() => {
    draw()
    const onKey = (e: KeyboardEvent) => { keys.current[e.key] = true; if (['ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault() }
    const onKeyUp = (e: KeyboardEvent) => { keys.current[e.key] = false }
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); cancelAnimationFrame(rafRef.current) }
  }, [draw])

  return (
    <div className="min-h-dvh bg-[#064e3b] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-400 text-sm font-medium"><ChevronLeft size={18} /> Game</Link>
        <h1 className="text-white font-bold text-base">🚗 Đua Xe Vô Tận</h1>
        <div className="text-cyan-400 font-bold text-base min-w-[4rem] text-right">{score} m</div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <div className="relative">
          <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border border-gray-800" style={{ maxWidth: '100%', maxHeight: '72vh', touchAction: 'none' }} />
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/65 backdrop-blur-sm">
              <div className="text-5xl mb-3">🚗</div>
              <p className="text-white text-xl font-bold mb-1">Đua Xe Vô Tận</p>
              <p className="text-gray-400 text-sm mb-6 text-center px-6">Né xe ngược chiều trên đường cao tốc — tốc độ tăng dần!</p>
              <button onClick={startGame} className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Nổ máy!</button>
            </div>
          )}
          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">💥</div>
              <p className="text-white text-xl font-bold mb-1">Tai nạn rồi!</p>
              <p className="text-cyan-400 text-3xl font-black mb-6">{score} m</p>
              <button onClick={startGame} className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Xuất phát lại</button>
            </div>
          )}
        </div>
        <div className="flex gap-8">
          <button className="w-24 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-2xl font-bold select-none transition-colors"
            onPointerDown={() => { keys.current['ArrowLeft'] = true }} onPointerUp={() => { keys.current['ArrowLeft'] = false }} onPointerLeave={() => { keys.current['ArrowLeft'] = false }}>◀</button>
          <button className="w-24 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-2xl font-bold select-none transition-colors"
            onPointerDown={() => { keys.current['ArrowRight'] = true }} onPointerUp={() => { keys.current['ArrowRight'] = false }} onPointerLeave={() => { keys.current['ArrowRight'] = false }}>▶</button>
        </div>
      </div>
    </div>
  )
}
