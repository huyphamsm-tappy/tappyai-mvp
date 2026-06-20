'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const W = 360, H = 580
const GY = H - 60          // ground y (screen)
const GRAVITY = 0.55
const JUMP_V = -13
const MOVE_SPD = 3
const WORLD_W = 2800

interface Plat { x: number; y: number; w: number; h: number }
interface Enemy { x: number; y: number; w: number; h: number; vx: number; x1: number; x2: number; hp: number; dead: boolean; deathTimer: number }
interface Coin { x: number; y: number; collected: boolean; bob: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number }

const PLATFORMS: Plat[] = [
  { x: 0, y: GY, w: 300, h: 60 },
  { x: 380, y: GY - 60, w: 120, h: 20 },
  { x: 560, y: GY - 30, w: 160, h: 20 },
  { x: 780, y: GY, w: 200, h: 60 },
  { x: 1040, y: GY - 80, w: 100, h: 20 },
  { x: 1190, y: GY - 50, w: 140, h: 20 },
  { x: 1380, y: GY, w: 180, h: 60 },
  { x: 1620, y: GY - 100, w: 80, h: 20 },
  { x: 1760, y: GY - 60, w: 120, h: 20 },
  { x: 1940, y: GY, w: 220, h: 60 },
  { x: 2220, y: GY - 80, w: 100, h: 20 },
  { x: 2380, y: GY - 40, w: 160, h: 20 },
  { x: 2600, y: GY, w: 220, h: 60 },
]

const INIT_ENEMIES = (): Enemy[] => [
  { x: 420, y: GY - 60 - 30, w: 28, h: 28, vx: 1, x1: 390, x2: 480, hp: 1, dead: false, deathTimer: 0 },
  { x: 820, y: GY - 30, w: 28, h: 28, vx: -1, x1: 790, x2: 960, hp: 1, dead: false, deathTimer: 0 },
  { x: 1430, y: GY - 30, w: 28, h: 28, vx: 1.2, x1: 1400, x2: 1540, hp: 1, dead: false, deathTimer: 0 },
  { x: 1980, y: GY - 30, w: 28, h: 28, vx: -1, x1: 1960, x2: 2130, hp: 2, dead: false, deathTimer: 0 },
  { x: 2640, y: GY - 30, w: 28, h: 28, vx: 1.5, x1: 2610, x2: 2780, hp: 2, dead: false, deathTimer: 0 },
]

const INIT_COINS = (): Coin[] => [
  450, 500, 590, 620, 840, 880, 1060, 1200, 1250, 1400, 1450, 1640, 1800, 1960, 2000, 2240, 2400, 2450, 2650, 2700
].map((x, i) => {
  const plat = PLATFORMS.find(p => x >= p.x && x <= p.x + p.w)
  const y = plat ? plat.y - 30 : GY - 80
  return { x, y, collected: false, bob: i * 0.4 }
})

export default function HanhTrinhAnhHungPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead' | 'won'>('idle')
  const keys = useRef<Record<string, boolean>>({})

  const gs = useRef({
    px: 60, py: GY - 32, vx: 0, vy: 0, onGround: false, facing: 1,
    camX: 0, score: 0, running: false, frame: 0,
    enemies: [] as Enemy[], coins: [] as Coin[], particles: [] as Particle[],
  })

  const draw = useCallback((won = false) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const g = gs.current
    const cam = g.camX

    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#1e1b4b'); sky.addColorStop(0.6, '#312e81'); sky.addColorStop(1, '#4c1d95')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)

    // Stars background (parallax)
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    for (let i = 0; i < 30; i++) {
      const sx = ((i * 97 + (WORLD_W - cam) * 0.05) % W + W) % W
      const sy = (i * 61) % (H * 0.65)
      ctx.beginPath(); ctx.arc(sx, sy, 1, 0, Math.PI * 2); ctx.fill()
    }

    // Platforms
    PLATFORMS.forEach(p => {
      const sx = p.x - cam
      if (sx + p.w < 0 || sx > W) return
      const gr = ctx.createLinearGradient(sx, p.y, sx, p.y + p.h)
      gr.addColorStop(0, '#7c3aed'); gr.addColorStop(1, '#4c1d95')
      ctx.fillStyle = gr; ctx.shadowBlur = 6; ctx.shadowColor = '#a78bfa'
      ctx.fillRect(sx, p.y, p.w, p.h)
      ctx.shadowBlur = 0
      ctx.fillStyle = '#a78bfa'; ctx.fillRect(sx, p.y, p.w, 3)
    })

    // End flag
    const flagX = 2720 - cam
    if (flagX > -20 && flagX < W + 20) {
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(flagX, GY); ctx.lineTo(flagX, GY - 80); ctx.stroke()
      ctx.fillStyle = '#ef4444'
      ctx.beginPath(); ctx.moveTo(flagX, GY - 80); ctx.lineTo(flagX + 28, GY - 68); ctx.lineTo(flagX, GY - 56); ctx.fill()
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'
      ctx.fillText('GOAL', flagX + 14, GY - 65)
      ctx.textAlign = 'left'
    }

    // Coins
    g.coins.forEach(c => {
      if (c.collected) return
      const sx = c.x - cam
      if (sx < -20 || sx > W + 20) return
      const bob = Math.sin(g.frame * 0.07 + c.bob) * 4
      ctx.shadowBlur = 10; ctx.shadowColor = '#fbbf24'
      ctx.fillStyle = '#fbbf24'
      ctx.beginPath(); ctx.arc(sx, c.y + bob, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(sx - 2, c.y + bob - 2, 3, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
    })

    // Enemies
    g.enemies.forEach(e => {
      const sx = e.x - cam
      if (sx < -40 || sx > W + 40) return
      if (e.dead) {
        ctx.globalAlpha = e.deathTimer / 30
        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 20px system-ui'; ctx.textAlign = 'center'
        ctx.fillText('✕', sx + e.w / 2, e.y + e.h / 2)
        ctx.globalAlpha = 1; ctx.textAlign = 'left'; return
      }
      const gr = ctx.createRadialGradient(sx + e.w / 2, e.y + e.h / 2, 2, sx + e.w / 2, e.y + e.h / 2, 16)
      gr.addColorStop(0, '#f87171'); gr.addColorStop(1, '#b91c1c')
      ctx.fillStyle = gr; ctx.shadowBlur = 8; ctx.shadowColor = '#ef4444'
      ctx.beginPath(); ctx.ellipse(sx + e.w / 2, e.y + e.h / 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#fff'; ctx.beginPath()
      ctx.arc(sx + e.w / 2 + (e.vx > 0 ? 5 : -5), e.y + e.h / 2 - 4, 4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#1e293b'; ctx.beginPath()
      ctx.arc(sx + e.w / 2 + (e.vx > 0 ? 6 : -4), e.y + e.h / 2 - 4, 2, 0, Math.PI * 2); ctx.fill()
      // HP pips
      if (e.hp > 1) {
        for (let i = 0; i < e.hp; i++) { ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(sx + e.w / 2 - 4 + i * 8, e.y - 8, 3, 0, Math.PI * 2); ctx.fill() }
      }
    })

    // Particles
    g.particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x - cam, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill() })
    ctx.globalAlpha = 1

    // Player
    const px = g.px - cam, py = g.py
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(px, GY + 3, 14, 5, 0, 0, Math.PI * 2); ctx.fill()

    const bodyGr = ctx.createLinearGradient(px - 13, py - 30, px + 13, py)
    bodyGr.addColorStop(0, '#34d399'); bodyGr.addColorStop(1, '#059669')
    ctx.fillStyle = bodyGr; ctx.shadowBlur = 10; ctx.shadowColor = '#10b981'
    ctx.beginPath(); ctx.roundRect(px - 11, py - 26, 22, 20, [4, 4, 5, 5]); ctx.fill()
    ctx.shadowBlur = 0

    // Head
    ctx.fillStyle = '#fcd34d'; ctx.beginPath(); ctx.arc(px, py - 33, 13, 0, Math.PI * 2); ctx.fill()
    // Bandana
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.roundRect(px - 13, py - 38, 26, 6, 2); ctx.fill()
    // Eye
    const ex = g.facing > 0 ? px + 5 : px - 5
    ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(ex, py - 34, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + (g.facing > 0 ? 1 : -1), py - 35, 1, 0, Math.PI * 2); ctx.fill()

    // Legs
    const lt = g.onGround ? Math.sin(g.frame * 0.2) * 7 : 0
    ctx.fillStyle = '#1e40af'
    ctx.beginPath(); ctx.roundRect(px - 9, py - 8 + lt, 8, 14, 4); ctx.fill()
    ctx.beginPath(); ctx.roundRect(px + 1, py - 8 - lt, 8, 14, 4); ctx.fill()

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.roundRect(8, 8, 130, 30, 10); ctx.fill()
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'left'
    ctx.fillText(`🪙 ${g.score}`, 16, 28)

    if (won) {
      ctx.fillStyle = '#fbbf24'; ctx.shadowBlur = 20; ctx.shadowColor = '#fbbf24'
      ctx.font = 'bold 28px system-ui'; ctx.textAlign = 'center'
      ctx.fillText('🎉 CHIẾN THẮNG!', W / 2, H / 2)
      ctx.shadowBlur = 0; ctx.textAlign = 'left'
    }
  }, [])

  const loop = useCallback(() => {
    const g = gs.current
    if (!g.running) { draw(); return }
    g.frame++
    const k = keys.current

    // Horizontal movement
    g.vx = 0
    if (k['ArrowLeft'] || k['a'] || k['A']) { g.vx = -MOVE_SPD; g.facing = -1 }
    if (k['ArrowRight'] || k['d'] || k['D']) { g.vx = MOVE_SPD; g.facing = 1 }

    // Jump
    if ((k['ArrowUp'] || k[' '] || k['w'] || k['W']) && g.onGround) {
      g.vy = JUMP_V; g.onGround = false
      for (let i = 0; i < 6; i++) g.particles.push({ x: g.px, y: g.py, vx: (Math.random() - .5) * 4, vy: Math.random() * 2 + 1, life: 1, color: '#a78bfa', r: 3 })
    }

    g.vy += GRAVITY; g.px += g.vx; g.py += g.vy
    g.px = Math.max(14, Math.min(WORLD_W - 14, g.px))
    g.onGround = false

    // Platform collision
    for (const p of PLATFORMS) {
      if (g.px + 10 > p.x && g.px - 10 < p.x + p.w) {
        if (g.vy >= 0 && g.py <= p.y + Math.abs(g.vy) + 2 && g.py > p.y - 10) {
          g.py = p.y; g.vy = 0; g.onGround = true
        }
      }
    }
    // Fall off world
    if (g.py > H + 60) {
      g.running = false; setPhase('dead')
      posthog.capture('game_over', { game: 'hanh-trinh-anh-hung', score: g.score })
      draw(); return
    }

    // Camera
    g.camX = Math.max(0, Math.min(WORLD_W - W, g.px - W / 3))

    // Enemies
    g.enemies.forEach(e => {
      if (e.dead) { e.deathTimer = Math.max(0, e.deathTimer - 1); return }
      e.x += e.vx
      if (e.x < e.x1 || e.x + e.w > e.x2) e.vx *= -1

      // Enemy vs player
      if (!e.dead && g.px + 10 > e.x && g.px - 10 < e.x + e.w && g.py > e.y && g.py < e.y + e.h + 12) {
        // Stomp from above
        if (g.vy > 0 && g.py - e.h < e.y + 4) {
          e.hp--
          if (e.hp <= 0) {
            e.dead = true; e.deathTimer = 30
            for (let i = 0; i < 8; i++) g.particles.push({ x: e.x + e.w / 2, y: e.y, vx: (Math.random() - .5) * 5, vy: -Math.random() * 4 - 2, life: 1, color: '#f87171', r: 5 + Math.random() * 4 })
          }
          g.vy = JUMP_V * 0.7; g.score += 50; setScore(g.score)
        } else if (g.py < e.y + e.h - 4) {
          g.running = false; setPhase('dead')
          posthog.capture('game_over', { game: 'hanh-trinh-anh-hung', score: g.score })
          draw(); return
        }
      }
    })

    // Coins
    g.coins.forEach(c => {
      if (c.collected) return
      if (g.px + 10 > c.x - 8 && g.px - 10 < c.x + 8 && g.py - 32 < c.y + 8 && g.py > c.y - 8) {
        c.collected = true; g.score += 10; setScore(g.score)
        for (let i = 0; i < 6; i++) g.particles.push({ x: c.x, y: c.y, vx: (Math.random() - .5) * 5, vy: -Math.random() * 3 - 1, life: 1, color: '#fbbf24', r: 4 })
      }
    })

    // Particles
    g.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.04 })
    g.particles = g.particles.filter(p => p.life > 0)

    // Goal check
    if (g.px > 2720) {
      g.running = false; setPhase('won')
      posthog.capture('game_won', { game: 'hanh-trinh-anh-hung', score: g.score })
      draw(true); return
    }

    draw()
    rafRef.current = requestAnimationFrame(loop)
  }, [draw])

  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const g = gs.current
    Object.assign(g, { px: 60, py: GY - 32, vx: 0, vy: 0, onGround: true, facing: 1, camX: 0, score: 0, running: true, frame: 0, particles: [] })
    g.enemies = INIT_ENEMIES(); g.coins = INIT_COINS()
    setScore(0); setPhase('playing')
    posthog.capture('game_started', { game: 'hanh-trinh-anh-hung' })
    rafRef.current = requestAnimationFrame(loop)
  }, [loop])

  useEffect(() => {
    draw()
    const onKey = (e: KeyboardEvent) => { keys.current[e.key] = true; if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault() }
    const onKeyUp = (e: KeyboardEvent) => { keys.current[e.key] = false }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); cancelAnimationFrame(rafRef.current) }
  }, [draw])

  const btnClass = 'w-16 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-xl font-bold select-none transition-colors'

  return (
    <div className="min-h-dvh bg-[#1e1b4b] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-400 text-sm font-medium"><ChevronLeft size={18} /> Game</Link>
        <h1 className="text-white font-bold text-base">⚔️ Hành Trình Anh Hùng</h1>
        <div className="text-yellow-400 font-bold text-base min-w-[3rem] text-right">{score}</div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <div className="relative">
          <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border border-gray-800" style={{ maxWidth: '100%', maxHeight: '68vh', touchAction: 'none' }} />
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
              <div className="text-5xl mb-3">⚔️</div>
              <p className="text-white text-xl font-bold mb-1">Hành Trình Anh Hùng</p>
              <p className="text-gray-400 text-sm mb-6 text-center px-6">Nhảy qua hố, dẫm đầu quái, nhặt xu — tới đích thắng!</p>
              <button onClick={startGame} className="bg-violet-500 hover:bg-violet-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Bắt đầu</button>
            </div>
          )}
          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">💀</div>
              <p className="text-white text-xl font-bold mb-1">Chết rồi!</p>
              <p className="text-yellow-400 text-2xl font-black mb-6">🪙 {score} điểm</p>
              <button onClick={startGame} className="bg-violet-500 hover:bg-violet-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Thử lại</button>
            </div>
          )}
          {phase === 'won' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">🏆</div>
              <p className="text-white text-xl font-bold mb-1">Chiến thắng!</p>
              <p className="text-yellow-400 text-2xl font-black mb-6">🪙 {score} điểm</p>
              <button onClick={startGame} className="bg-violet-500 hover:bg-violet-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Chơi lại</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button className={btnClass} onPointerDown={() => { keys.current['ArrowLeft'] = true }} onPointerUp={() => { keys.current['ArrowLeft'] = false }} onPointerLeave={() => { keys.current['ArrowLeft'] = false }}>◀</button>
          <button className="w-20 h-14 rounded-2xl bg-violet-700 active:bg-violet-600 flex items-center justify-center text-white text-xl font-bold select-none transition-colors"
            onPointerDown={() => { keys.current[' '] = true }} onPointerUp={() => { keys.current[' '] = false }} onPointerLeave={() => { keys.current[' '] = false }}>▲ Nhảy</button>
          <button className={btnClass} onPointerDown={() => { keys.current['ArrowRight'] = true }} onPointerUp={() => { keys.current['ArrowRight'] = false }} onPointerLeave={() => { keys.current['ArrowRight'] = false }}>▶</button>
        </div>
      </div>
    </div>
  )
}
