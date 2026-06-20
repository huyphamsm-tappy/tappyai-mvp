'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const W = 360, H = 580
const GY = H - 70
const GRAVITY = 0.55
const JUMP_V = -13
const MOVE_SPD = 3.5
const WORLD_W = 3400
const BULLET_SPD = 9

interface Plat { x: number; y: number; w: number; h: number }
interface Enemy { id: number; x: number; y: number; w: number; h: number; type: 'walker' | 'shooter' | 'armored'; hp: number; maxHp: number; vx: number; shootTimer: number; dead: boolean; deathTimer: number; alert: number }
interface Bullet { x: number; y: number; vx: number; friendly: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number }

let eid = 0

const PLATS: Plat[] = [
  { x: 0, y: GY, w: WORLD_W, h: 70 },        // main ground
  { x: 300, y: GY - 80, w: 110, h: 16 },
  { x: 560, y: GY - 60, w: 100, h: 16 },
  { x: 800, y: GY - 90, w: 120, h: 16 },
  { x: 1100, y: GY - 70, w: 90, h: 16 },
  { x: 1350, y: GY - 100, w: 110, h: 16 },
  { x: 1700, y: GY - 80, w: 100, h: 16 },
  { x: 2000, y: GY - 90, w: 120, h: 16 },
  { x: 2350, y: GY - 70, w: 100, h: 16 },
  { x: 2700, y: GY - 100, w: 110, h: 16 },
  { x: 3000, y: GY - 80, w: 120, h: 16 },
]

const INIT_ENEMIES = (): Enemy[] => [
  // walkers
  ...([250, 500, 750, 1200, 1600, 2100, 2500, 2900] as number[]).map(x => ({ id: eid++, x, y: GY - 36, w: 28, h: 36, type: 'walker' as const, hp: 1, maxHp: 1, vx: -1.2, shootTimer: 0, dead: false, deathTimer: 0, alert: 0 })),
  // shooters
  ...([450, 900, 1400, 1900, 2400, 2800, 3100] as number[]).map(x => ({ id: eid++, x, y: GY - 36, w: 28, h: 36, type: 'shooter' as const, hp: 2, maxHp: 2, vx: 0, shootTimer: 80, dead: false, deathTimer: 0, alert: 0 })),
  // armored
  ...([700, 1300, 2200, 3000] as number[]).map(x => ({ id: eid++, x, y: GY - 36, w: 32, h: 36, type: 'armored' as const, hp: 3, maxHp: 3, vx: -0.7, shootTimer: 0, dead: false, deathTimer: 0, alert: 0 })),
  // elevated shooters on platforms
  { id: eid++, x: 320, y: GY - 80 - 36, w: 28, h: 36, type: 'shooter', hp: 2, maxHp: 2, vx: 0, shootTimer: 60, dead: false, deathTimer: 0, alert: 0 },
  { id: eid++, x: 820, y: GY - 90 - 36, w: 28, h: 36, type: 'shooter', hp: 2, maxHp: 2, vx: 0, shootTimer: 80, dead: false, deathTimer: 0, alert: 0 },
  { id: eid++, x: 1720, y: GY - 80 - 36, w: 28, h: 36, type: 'shooter', hp: 2, maxHp: 2, vx: 0, shootTimer: 70, dead: false, deathTimer: 0, alert: 0 },
  { id: eid++, x: 2720, y: GY - 100 - 36, w: 28, h: 36, type: 'armored', hp: 3, maxHp: 3, vx: 0, shootTimer: 0, dead: false, deathTimer: 0, alert: 0 },
]

export default function ChienBinhHuyenThoaiPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead' | 'won'>('idle')
  const keys = useRef<Record<string, boolean>>({})

  const gs = useRef({
    px: 60, py: GY - 40, vx: 0, vy: 0, onGround: false, facing: 1,
    camX: 0, score: 0, running: false, frame: 0,
    enemies: [] as Enemy[], bullets: [] as Bullet[], particles: [] as Particle[],
    shootCooldown: 0, invincible: 0, hp: 3,
  })

  const spawnHit = useCallback((x: number, y: number, big = false) => {
    const g = gs.current; const n = big ? 14 : 7
    const colors = big ? ['#f97316', '#fbbf24', '#ef4444'] : ['#fbbf24', '#fff', '#ef4444']
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      g.particles.push({ x, y, vx: Math.cos(a) * (big ? 5 : 3), vy: Math.sin(a) * (big ? 5 : 3) - 1, life: 1, color: colors[i % colors.length], r: 3 + Math.random() * 4 })
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!; const g = gs.current; const cam = g.camX

    // BG gradient (industrial)
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#0f172a'); sky.addColorStop(0.6, '#1e293b'); sky.addColorStop(1, '#334155')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)

    // Background mountains (parallax)
    ctx.fillStyle = 'rgba(51,65,85,0.7)'
    for (let i = 0; i < 8; i++) {
      const mx = (i * 180 - cam * 0.12 + WORLD_W) % (WORLD_W) - 100
      const msx = mx % (W + 200) - 100
      ctx.beginPath(); ctx.moveTo(msx, GY); ctx.lineTo(msx + 80, GY - 100 - i * 10); ctx.lineTo(msx + 160, GY); ctx.fill()
    }

    // Platforms / ground
    PLATS.forEach(p => {
      const sx = p.x - cam
      if (sx + p.w < 0 || sx > W) return
      if (p.y === GY) {
        const gr = ctx.createLinearGradient(sx, p.y, sx, p.y + p.h)
        gr.addColorStop(0, '#475569'); gr.addColorStop(0.1, '#334155'); gr.addColorStop(1, '#1e293b')
        ctx.fillStyle = gr; ctx.fillRect(sx, p.y, p.w, p.h)
        ctx.fillStyle = '#64748b'; ctx.fillRect(sx, p.y, p.w, 4)
        // Ground details
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.globalAlpha = 0.4
        for (let x = sx; x < sx + p.w; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, p.y + 10); ctx.lineTo(x + 20, p.y + 10); ctx.stroke()
        }
        ctx.globalAlpha = 1
      } else {
        const gr = ctx.createLinearGradient(sx, p.y, sx, p.y + p.h)
        gr.addColorStop(0, '#f59e0b'); gr.addColorStop(1, '#b45309')
        ctx.fillStyle = gr; ctx.shadowBlur = 5; ctx.shadowColor = '#fbbf24'
        ctx.beginPath(); ctx.roundRect(sx, p.y, p.w, p.h, [4, 4, 0, 0]); ctx.fill()
        ctx.shadowBlur = 0
      }
    })

    // End base
    const baseX = 3300 - cam
    if (baseX > -80 && baseX < W + 80) {
      ctx.fillStyle = '#1d4ed8'; ctx.shadowBlur = 15; ctx.shadowColor = '#3b82f6'
      ctx.beginPath(); ctx.roundRect(baseX, GY - 90, 70, 90, [8, 8, 0, 0]); ctx.fill()
      ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.roundRect(baseX + 10, GY - 60, 20, 30, [4, 4, 0, 0]); ctx.fill()
      ctx.fillStyle = '#60a5fa'; ctx.shadowBlur = 8; ctx.shadowColor = '#93c5fd'
      ctx.beginPath(); ctx.roundRect(baseX + 40, GY - 80, 20, 24, 3); ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'
      ctx.fillText('BASE', baseX + 35, GY - 95)
      ctx.textAlign = 'left'
      // Flag
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(baseX + 65, GY - 90); ctx.lineTo(baseX + 65, GY - 120); ctx.stroke()
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(baseX + 65, GY - 120); ctx.lineTo(baseX + 90, GY - 110); ctx.lineTo(baseX + 65, GY - 100); ctx.fill()
    }

    // Bullets
    g.bullets.forEach(b => {
      const bsx = b.x - cam
      if (b.friendly) {
        ctx.fillStyle = '#fbbf24'; ctx.shadowBlur = 6; ctx.shadowColor = '#f59e0b'
        ctx.beginPath(); ctx.ellipse(bsx, b.y, 4, 7, b.vx > 0 ? -0.3 : 0.3, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
      } else {
        ctx.fillStyle = '#ef4444'; ctx.shadowBlur = 5; ctx.shadowColor = '#dc2626'
        ctx.beginPath(); ctx.arc(bsx, b.y, 4, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
      }
    })

    // Enemies
    g.enemies.forEach(e => {
      const sx = e.x - cam
      if (sx + e.w < -20 || sx > W + 20) return
      if (e.dead) {
        ctx.globalAlpha = e.deathTimer / 25
        ctx.fillStyle = '#ef4444'; ctx.font = '18px system-ui'; ctx.textAlign = 'center'
        ctx.fillText('💥', sx + e.w / 2, e.y + e.h / 2)
        ctx.globalAlpha = 1; ctx.textAlign = 'left'; return
      }
      const ey = e.y
      const color0 = e.type === 'walker' ? '#ef4444' : e.type === 'shooter' ? '#8b5cf6' : '#f59e0b'
      const color1 = e.type === 'walker' ? '#b91c1c' : e.type === 'shooter' ? '#6d28d9' : '#b45309'
      const gr = ctx.createLinearGradient(sx, ey, sx + e.w, ey + e.h)
      gr.addColorStop(0, color0); gr.addColorStop(1, color1)
      ctx.fillStyle = gr; ctx.shadowBlur = 8; ctx.shadowColor = color0
      ctx.beginPath(); ctx.roundRect(sx, ey, e.w, e.h - 10, [5, 5, 3, 3]); ctx.fill()
      ctx.shadowBlur = 0
      // Head
      ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(sx + e.w / 2, ey - 8, 11, 0, Math.PI * 2); ctx.fill()
      // Helmet
      ctx.fillStyle = color0; ctx.beginPath(); ctx.roundRect(sx + e.w / 2 - 11, ey - 16, 22, 8, 3); ctx.fill()
      // Eye (looking at player)
      const eyeDir = e.vx !== 0 ? Math.sign(e.vx) : (g.px < e.x ? -1 : 1)
      ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(sx + e.w / 2 + eyeDir * 4, ey - 8, 3, 0, Math.PI * 2); ctx.fill()
      // Legs
      const lt = e.type !== 'shooter' ? Math.sin(g.frame * 0.18) * 6 : 0
      ctx.fillStyle = color1
      ctx.beginPath(); ctx.roundRect(sx + 4, ey + e.h - 12 + lt, 8, 12, 3); ctx.fill()
      ctx.beginPath(); ctx.roundRect(sx + e.w - 12, ey + e.h - 12 - lt, 8, 12, 3); ctx.fill()
      // Weapon arm for shooter/armored
      if (e.type !== 'walker') {
        ctx.fillStyle = '#64748b'
        ctx.beginPath(); ctx.roundRect(eyeDir > 0 ? sx + e.w - 4 : sx - 12, ey + e.h * 0.3, 16, 8, 3); ctx.fill()
      }
      // HP pips
      for (let i = 0; i < e.maxHp; i++) {
        ctx.fillStyle = i < e.hp ? color0 : '#374151'
        ctx.beginPath(); ctx.arc(sx + 4 + i * 10, ey - 22, 3.5, 0, Math.PI * 2); ctx.fill()
      }
      // Alert
      if (e.alert > 0) {
        ctx.globalAlpha = Math.min(1, e.alert / 15)
        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'
        ctx.fillText('!', sx + e.w / 2, ey - 26)
        ctx.globalAlpha = 1; ctx.textAlign = 'left'
      }
    })

    // Particles
    g.particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x - cam, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill() })
    ctx.globalAlpha = 1

    // Player
    const px = g.px - cam; const py = g.py; const f = g.facing
    const flash = g.invincible > 0 && Math.floor(g.frame / 4) % 2 === 0
    if (!flash) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(px, GY + 4, 14, 5, 0, 0, Math.PI * 2); ctx.fill()
      const bg = ctx.createLinearGradient(px - 13, py - 36, px + 13, py)
      bg.addColorStop(0, '#22d3ee'); bg.addColorStop(1, '#0e7490')
      ctx.fillStyle = bg; ctx.shadowBlur = 10; ctx.shadowColor = '#06b6d4'
      ctx.beginPath(); ctx.roundRect(px - 12, py - 26, 24, 22, [4, 4, 6, 6]); ctx.fill()
      ctx.shadowBlur = 0
      // Head
      ctx.fillStyle = '#fcd34d'; ctx.beginPath(); ctx.arc(px, py - 33, 13, 0, Math.PI * 2); ctx.fill()
      // Helmet
      ctx.fillStyle = '#0e7490'; ctx.beginPath(); ctx.roundRect(px - 13, py - 43, 26, 10, [5, 5, 2, 2]); ctx.fill()
      ctx.fillStyle = 'rgba(125,211,252,0.6)'; ctx.beginPath(); ctx.ellipse(px + f * 3, py - 35, 7, 5, f * 0.1, 0, Math.PI * 2); ctx.fill()
      // Arms
      ctx.fillStyle = '#0891b2'
      ctx.beginPath(); ctx.roundRect(px - 18, py - 24, 8, 12, 3); ctx.fill()
      ctx.beginPath(); ctx.roundRect(px + 10, py - 24, 8, 12, 3); ctx.fill()
      // Gun
      ctx.fillStyle = '#64748b'
      ctx.beginPath(); ctx.roundRect(f > 0 ? px + 16 : px - 30, py - 26, 14, 7, 3); ctx.fill()
      ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.roundRect(f > 0 ? px + 26 : px - 30, py - 25, 8, 5, 2); ctx.fill()
      // Legs
      const lt = g.onGround ? Math.sin(g.frame * 0.22) * 7 : 0
      ctx.fillStyle = '#155e75'
      ctx.beginPath(); ctx.roundRect(px - 9, py - 6 + lt, 8, 14, 3); ctx.fill()
      ctx.beginPath(); ctx.roundRect(px + 1, py - 6 - lt, 8, 14, 3); ctx.fill()
    }

    // HUD
    for (let i = 0; i < g.hp; i++) { ctx.font = '16px system-ui'; ctx.fillText('❤️', 8 + i * 22, 26) }
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.roundRect(W - 110, 8, 102, 26, 8); ctx.fill()
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'right'
    ctx.fillText(`★ ${g.score}`, W - 10, 26)
    ctx.textAlign = 'left'
  }, [])

  const loop = useCallback(() => {
    const g = gs.current
    if (!g.running) { draw(); return }
    g.frame++
    const k = keys.current

    g.vx = 0
    if (k['ArrowLeft'] || k['a'] || k['A']) { g.vx = -MOVE_SPD; g.facing = -1 }
    if (k['ArrowRight'] || k['d'] || k['D']) { g.vx = MOVE_SPD; g.facing = 1 }

    if ((k[' '] || k['ArrowUp'] || k['w'] || k['W']) && g.onGround) {
      g.vy = JUMP_V; g.onGround = false
      for (let i = 0; i < 5; i++) g.particles.push({ x: g.px, y: g.py, vx: (Math.random() - .5) * 4, vy: 1 + Math.random() * 2, life: 1, color: '#22d3ee', r: 3 })
    }

    if ((k['z'] || k['Z'] || k['x'] || k['X'] || k['ArrowDown']) && g.shootCooldown <= 0) {
      g.bullets.push({ x: g.px + g.facing * 16, y: g.py - 22, vx: g.facing * BULLET_SPD, friendly: true })
      g.shootCooldown = 16
    }

    if (g.shootCooldown > 0) g.shootCooldown--

    g.vy += GRAVITY; g.px += g.vx; g.py += g.vy
    g.px = Math.max(14, Math.min(WORLD_W - 14, g.px))
    g.onGround = false

    for (const p of PLATS) {
      if (g.px + 11 > p.x && g.px - 11 < p.x + p.w) {
        if (g.vy >= 0 && g.py <= p.y + Math.abs(g.vy) + 2 && g.py > p.y - 10) {
          g.py = p.y; g.vy = 0; g.onGround = true; break
        }
      }
    }

    if (g.py > H + 80) { g.running = false; setPhase('dead'); posthog.capture('game_over', { game: 'chien-binh-huyen-thoai', score: g.score }); draw(); return }
    g.camX = Math.max(0, Math.min(WORLD_W - W, g.px - W / 3))

    // Bullets
    g.bullets.forEach(b => { b.x += b.vx })
    g.bullets = g.bullets.filter(b => b.x > -20 && b.x < WORLD_W + 20 && b.y < H + 20)

    // Enemies
    for (let ei = g.enemies.length - 1; ei >= 0; ei--) {
      const e = g.enemies[ei]
      if (e.dead) { e.deathTimer--; if (e.deathTimer <= 0) g.enemies.splice(ei, 1); continue }
      const inRange = Math.abs(g.px - e.x) < 340

      if (e.type === 'walker') {
        if (inRange) { e.alert = Math.min(30, e.alert + 1); e.vx = g.px < e.x ? -1.4 : 1.4 }
        else { e.alert = 0; e.vx = -1.4 }
        e.x += e.vx
      } else if (e.type === 'shooter') {
        e.alert = inRange ? Math.min(30, e.alert + 2) : Math.max(0, e.alert - 1)
        if (inRange) {
          e.shootTimer--
          if (e.shootTimer <= 0) {
            const dir = g.px > e.x ? 1 : -1
            g.bullets.push({ x: e.x + e.w / 2, y: e.y + e.h * 0.3, vx: dir * 4.5, friendly: false })
            e.shootTimer = 90
          }
        }
      } else {
        if (inRange) { e.alert = Math.min(30, e.alert + 1); e.vx = g.px < e.x ? -0.8 : 0.8 }
        else { e.alert = 0; e.vx = -0.8 }
        e.x += e.vx
      }

      // Clamp to ground
      e.y = GY - e.h

      // Bullet vs enemy
      for (let bi = g.bullets.length - 1; bi >= 0; bi--) {
        const b = g.bullets[bi]
        if (!b.friendly) continue
        if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
          e.hp--; spawnHit(b.x, b.y)
          g.bullets.splice(bi, 1)
          if (e.hp <= 0) {
            e.dead = true; e.deathTimer = 25
            g.score += e.type === 'armored' ? 150 : e.type === 'shooter' ? 120 : 80
            setScore(g.score); spawnHit(e.x + e.w / 2, e.y + e.h / 2, true)
          }
          break
        }
      }

      // Enemy bullet vs player
      if (g.invincible <= 0) {
        for (let bi = g.bullets.length - 1; bi >= 0; bi--) {
          const b = g.bullets[bi]
          if (b.friendly) continue
          if (b.x > g.px - 11 && b.x < g.px + 11 && b.y > g.py - 36 && b.y < g.py) {
            g.hp--; g.invincible = 80; spawnHit(b.x, b.y); g.bullets.splice(bi, 1)
            if (g.hp <= 0) { g.running = false; setPhase('dead'); posthog.capture('game_over', { game: 'chien-binh-huyen-thoai', score: g.score }); draw(); return }
            break
          }
        }

        // Walker touch
        if (!e.dead && e.type !== 'shooter') {
          if (g.px + 10 > e.x && g.px - 10 < e.x + e.w && g.py > e.y && g.py < e.y + e.h + 4) {
            g.hp--; g.invincible = 80; spawnHit(g.px, g.py - 18)
            if (g.hp <= 0) { g.running = false; setPhase('dead'); posthog.capture('game_over', { game: 'chien-binh-huyen-thoai', score: g.score }); draw(); return }
          }
        }
      }
    }
    if (g.invincible > 0) g.invincible--

    g.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.04 })
    g.particles = g.particles.filter(p => p.life > 0)

    if (g.px > 3300) { g.running = false; setPhase('won'); posthog.capture('game_won', { game: 'chien-binh-huyen-thoai', score: g.score }); draw(); return }

    draw()
    rafRef.current = requestAnimationFrame(loop)
  }, [draw, spawnHit])

  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const g = gs.current
    eid = 0
    Object.assign(g, { px: 60, py: GY - 40, vx: 0, vy: 0, onGround: true, facing: 1, camX: 0, score: 0, running: true, frame: 0, shootCooldown: 0, invincible: 0, hp: 3, bullets: [], particles: [] })
    g.enemies = INIT_ENEMIES()
    setScore(0); setPhase('playing')
    posthog.capture('game_started', { game: 'chien-binh-huyen-thoai' })
    rafRef.current = requestAnimationFrame(loop)
  }, [loop])

  useEffect(() => {
    draw()
    const onKey = (e: KeyboardEvent) => { keys.current[e.key] = true; if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault() }
    const onKeyUp = (e: KeyboardEvent) => { keys.current[e.key] = false }
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); cancelAnimationFrame(rafRef.current) }
  }, [draw])

  const btnClass = 'rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white font-bold select-none transition-colors'

  return (
    <div className="min-h-dvh bg-[#0f172a] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-400 text-sm font-medium"><ChevronLeft size={18} /> Game</Link>
        <h1 className="text-white font-bold text-base">🔫 Chiến Binh Huyền Thoại</h1>
        <div className="text-yellow-400 font-bold text-base min-w-[3rem] text-right">{score}</div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <div className="relative">
          <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border border-gray-800" style={{ maxWidth: '100%', maxHeight: '65vh', touchAction: 'none' }} />
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/65 backdrop-blur-sm">
              <div className="text-5xl mb-3">🔫</div>
              <p className="text-white text-xl font-bold mb-1">Chiến Binh Huyền Thoại</p>
              <p className="text-gray-400 text-xs mb-1 text-center px-6">Chạy, nhảy, bắn hạ quái — tiến về căn cứ!</p>
              <p className="text-cyan-400 text-xs mb-5">Z/X để bắn • ↑/Space để nhảy</p>
              <button onClick={startGame} className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Xung phong!</button>
            </div>
          )}
          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">💀</div>
              <p className="text-white text-xl font-bold mb-1">Hy sinh rồi!</p>
              <p className="text-yellow-400 text-2xl font-black mb-6">★ {score}</p>
              <button onClick={startGame} className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Thử lại</button>
            </div>
          )}
          {phase === 'won' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">🏆</div>
              <p className="text-white text-xl font-bold mb-1">Đã chiếm căn cứ!</p>
              <p className="text-yellow-400 text-2xl font-black mb-6">★ {score}</p>
              <button onClick={startGame} className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Chơi lại</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className={`${btnClass} w-14 h-12 text-xl`} onPointerDown={() => { keys.current['ArrowLeft'] = true }} onPointerUp={() => { keys.current['ArrowLeft'] = false }} onPointerLeave={() => { keys.current['ArrowLeft'] = false }}>◀</button>
          <button className={`${btnClass} w-14 h-12 text-xl`} onPointerDown={() => { keys.current['ArrowRight'] = true }} onPointerUp={() => { keys.current['ArrowRight'] = false }} onPointerLeave={() => { keys.current['ArrowRight'] = false }}>▶</button>
          <button className={`${btnClass} w-16 h-12 text-sm`} onPointerDown={() => { keys.current[' '] = true }} onPointerUp={() => { keys.current[' '] = false }} onPointerLeave={() => { keys.current[' '] = false }}>▲ Nhảy</button>
          <button className={`${btnClass} w-16 h-12 text-sm bg-yellow-700 active:bg-yellow-600`}
            onPointerDown={() => { keys.current['z'] = true }} onPointerUp={() => { keys.current['z'] = false }} onPointerLeave={() => { keys.current['z'] = false }}>🔫 Bắn</button>
        </div>
      </div>
    </div>
  )
}
