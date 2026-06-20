'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import posthog from 'posthog-js'

const W = 360, H = 580
const PLAYER_W = 32, PLAYER_H = 26
const BULLET_SPD = 10
const ENEMY_BULLET_SPD = 4

interface Bullet { x: number; y: number; friendly: boolean }
interface Enemy { x: number; y: number; w: number; h: number; hp: number; maxHp: number; vx: number; vy: number; isBoss: boolean; shootTimer: number; bobOffset: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number }
interface Star { x: number; y: number; r: number; speed: number }

const mkStars = (): Star[] => Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5 + 0.5, speed: 0.3 + Math.random() * 0.5 }))

const WAVE_DEFS = [
  [{ cols: 3, rows: 2, xStart: 60, yStart: 60, gap: 60 }],
  [{ cols: 4, rows: 2, xStart: 40, yStart: 60, gap: 60 }],
  [{ cols: 5, rows: 2, xStart: 20, yStart: 60, gap: 60 }],
  [{ cols: 5, rows: 3, xStart: 20, yStart: 50, gap: 55 }],
]

function mkWave(waveIdx: number): Enemy[] {
  if (waveIdx >= WAVE_DEFS.length) {
    // Boss
    return [{ x: W / 2 - 45, y: 60, w: 90, h: 60, hp: 30, maxHp: 30, vx: 1.5, vy: 0, isBoss: true, shootTimer: 60, bobOffset: 0 }]
  }
  const enemies: Enemy[] = []
  WAVE_DEFS[waveIdx].forEach(({ cols, rows, xStart, yStart, gap }) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        enemies.push({ x: xStart + c * gap, y: yStart + r * 50, w: 28, h: 22, hp: 1 + (waveIdx > 2 ? 1 : 0), maxHp: 1 + (waveIdx > 2 ? 1 : 0), vx: 1 + waveIdx * 0.2, vy: 0, isBoss: false, shootTimer: Math.floor(Math.random() * 180) + 60, bobOffset: Math.random() * Math.PI * 2 })
      }
    }
  })
  return enemies
}

export default function BanThienHaPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [score, setScore] = useState(0)
  const [wave, setWave] = useState(1)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'dead' | 'won'>('idle')
  const keys = useRef<Record<string, boolean>>({})

  const gs = useRef({
    px: W / 2 - PLAYER_W / 2, running: false,
    score: 0, wave: 0, frame: 0,
    bullets: [] as Bullet[], enemies: [] as Enemy[],
    particles: [] as Particle[], stars: mkStars(),
    shootTimer: 0, invincible: 0,
    playerHp: 3,
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const g = gs.current

    ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, W, H)

    // Stars
    g.stars.forEach(s => {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.sin(g.frame * 0.03 + s.r) * 0.2})`
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill()
    })

    // Bullets
    g.bullets.forEach(b => {
      if (b.friendly) {
        const gr = ctx.createLinearGradient(b.x, b.y - 12, b.x, b.y + 2)
        gr.addColorStop(0, 'transparent'); gr.addColorStop(1, '#34d399')
        ctx.fillStyle = gr; ctx.fillRect(b.x - 2, b.y - 12, 4, 12)
        ctx.fillStyle = '#a7f3d0'; ctx.fillRect(b.x - 1.5, b.y - 4, 3, 4)
      } else {
        ctx.fillStyle = '#ef4444'
        ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fca5a5'; ctx.beginPath(); ctx.arc(b.x, b.y, 2, 0, Math.PI * 2); ctx.fill()
      }
    })

    // Enemies
    g.enemies.forEach(e => {
      if (e.isBoss) {
        const gr = ctx.createLinearGradient(e.x, e.y, e.x + e.w, e.y + e.h)
        gr.addColorStop(0, '#7c3aed'); gr.addColorStop(1, '#dc2626')
        ctx.fillStyle = gr; ctx.shadowBlur = 20; ctx.shadowColor = '#a855f7'
        ctx.beginPath(); ctx.roundRect(e.x, e.y, e.w, e.h, 12); ctx.fill()
        // Boss cockpit
        ctx.fillStyle = '#f87171'; ctx.beginPath(); ctx.ellipse(e.x + e.w / 2, e.y + e.h / 2, 22, 16, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fca5a5'; ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + e.h / 2, 9, 0, Math.PI * 2); ctx.fill()
        // Boss cannons
        ctx.fillStyle = '#6d28d9'
        ctx.fillRect(e.x - 8, e.y + e.h - 12, 12, 18)
        ctx.fillRect(e.x + e.w - 4, e.y + e.h - 12, 12, 18)
        ctx.shadowBlur = 0
        // HP bar
        const bw = e.w; const bh = 8
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x, e.y - 14, bw, bh)
        ctx.fillStyle = '#ef4444'; ctx.fillRect(e.x, e.y - 14, bw * (e.hp / e.maxHp), bh)
        ctx.fillStyle = '#f87171'; ctx.fillRect(e.x, e.y - 14, bw * (e.hp / e.maxHp) * 0.3, bh)
      } else {
        const bob = Math.sin(g.frame * 0.04 + e.bobOffset) * 4
        const gr = ctx.createLinearGradient(e.x, e.y + bob, e.x + e.w, e.y + e.h + bob)
        gr.addColorStop(0, '#f472b6'); gr.addColorStop(1, '#be185d')
        ctx.fillStyle = gr; ctx.shadowBlur = 8; ctx.shadowColor = '#ec4899'
        ctx.beginPath(); ctx.roundRect(e.x, e.y + bob, e.w, e.h, 6); ctx.fill()
        ctx.shadowBlur = 0
        // Engine glow
        ctx.fillStyle = '#fde68a'; ctx.shadowBlur = 6; ctx.shadowColor = '#fbbf24'
        ctx.beginPath(); ctx.ellipse(e.x + e.w / 2, e.y + e.h + bob + 5, 5, 7, 0, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
        if (e.hp > 1) {
          ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.roundRect(e.x, e.y + bob - 6, e.w * (e.hp / e.maxHp), 4, 2); ctx.fill()
        }
      }
    })

    // Particles
    g.particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill() })
    ctx.globalAlpha = 1

    // Player ship
    const py = H - 60
    const flash = g.invincible > 0 && Math.floor(g.frame / 4) % 2 === 0
    if (!flash) {
      const pgr = ctx.createLinearGradient(g.px, py, g.px + PLAYER_W, py + PLAYER_H)
      pgr.addColorStop(0, '#34d399'); pgr.addColorStop(1, '#059669')
      ctx.fillStyle = pgr; ctx.shadowBlur = 12; ctx.shadowColor = '#10b981'
      // Ship body
      ctx.beginPath()
      ctx.moveTo(g.px + PLAYER_W / 2, py)
      ctx.lineTo(g.px, py + PLAYER_H)
      ctx.lineTo(g.px + PLAYER_W / 4, py + PLAYER_H - 6)
      ctx.lineTo(g.px + PLAYER_W / 2, py + PLAYER_H - 2)
      ctx.lineTo(g.px + PLAYER_W * 3 / 4, py + PLAYER_H - 6)
      ctx.lineTo(g.px + PLAYER_W, py + PLAYER_H)
      ctx.closePath(); ctx.fill()
      // Cockpit
      ctx.fillStyle = '#a7f3d0'; ctx.beginPath(); ctx.ellipse(g.px + PLAYER_W / 2, py + PLAYER_H / 2, 7, 9, 0, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
      // Exhaust
      ctx.fillStyle = '#fbbf24'; ctx.shadowBlur = 8; ctx.shadowColor = '#f59e0b'
      ctx.beginPath(); ctx.ellipse(g.px + PLAYER_W / 2, py + PLAYER_H + 4 + Math.random() * 4, 5, 8, 0, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
    }

    // HP hearts
    for (let i = 0; i < g.playerHp; i++) {
      ctx.font = '16px system-ui'; ctx.fillText('❤️', 8 + i * 22, 24)
    }
    // Score
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.roundRect(W - 110, 8, 100, 26, 8); ctx.fill()
    ctx.fillStyle = '#34d399'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'right'
    ctx.fillText(`★ ${g.score}`, W - 12, 26)
    // Wave
    ctx.fillStyle = '#a78bfa'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'
    ctx.fillText(`Wave ${g.wave + 1}/${WAVE_DEFS.length + 1}`, W / 2, 24)
    ctx.textAlign = 'left'
  }, [])

  const spawnExplosion = useCallback((x: number, y: number, big = false) => {
    const g = gs.current
    const n = big ? 20 : 10
    const colors = big ? ['#f97316', '#fbbf24', '#ef4444', '#fff'] : ['#f472b6', '#fbbf24', '#fff']
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const spd = big ? 3 + Math.random() * 5 : 2 + Math.random() * 3
      g.particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 1, color: colors[i % colors.length], r: (big ? 6 : 4) + Math.random() * 4 })
    }
  }, [])

  const loop = useCallback(() => {
    const g = gs.current
    if (!g.running) { draw(); return }
    g.frame++

    // Move stars
    g.stars.forEach(s => { s.y += s.speed; if (s.y > H) { s.y = 0; s.x = Math.random() * W } })

    // Player movement
    if (keys.current['ArrowLeft'] && g.px > 0) g.px -= 4
    if (keys.current['ArrowRight'] && g.px < W - PLAYER_W) g.px += 4

    // Auto-shoot
    g.shootTimer--
    if (g.shootTimer <= 0) {
      g.bullets.push({ x: g.px + PLAYER_W / 2, y: H - 60, friendly: true })
      g.shootTimer = 12
    }

    // Move bullets
    g.bullets.forEach(b => { b.y += b.friendly ? -BULLET_SPD : ENEMY_BULLET_SPD })
    g.bullets = g.bullets.filter(b => b.y > -20 && b.y < H + 20)

    // Enemy movement & shooting
    let hitWall = false
    g.enemies.forEach(e => {
      if (!e.isBoss) {
        e.x += e.vx
        if (e.x < 0 || e.x + e.w > W) hitWall = true
        e.shootTimer--
        if (e.shootTimer <= 0) {
          g.bullets.push({ x: e.x + e.w / 2, y: e.y + e.h, friendly: false })
          e.shootTimer = 120 + Math.floor(Math.random() * 120)
        }
      } else {
        e.x += e.vx
        if (e.x < 0 || e.x + e.w > W) { e.vx *= -1 }
        e.shootTimer--
        if (e.shootTimer <= 0) {
          g.bullets.push({ x: e.x + 6, y: e.y + e.h, friendly: false })
          g.bullets.push({ x: e.x + e.w / 2, y: e.y + e.h, friendly: false })
          g.bullets.push({ x: e.x + e.w - 6, y: e.y + e.h, friendly: false })
          e.shootTimer = 40
        }
      }
    })
    if (hitWall) {
      g.enemies.forEach(e => { if (!e.isBoss) { e.vx *= -1; e.y += 10 } })
    }

    // Bullet-enemy collisions
    g.bullets = g.bullets.filter(b => {
      if (!b.friendly) return true
      for (let i = 0; i < g.enemies.length; i++) {
        const e = g.enemies[i]
        if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
          e.hp--; spawnExplosion(b.x, b.y, false)
          if (e.hp <= 0) {
            spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, e.isBoss)
            g.score += e.isBoss ? 500 : 100; setScore(g.score)
            g.enemies.splice(i, 1)
          }
          return false
        }
      }
      return true
    })

    // Bullet-player collisions
    if (g.invincible <= 0) {
      const py = H - 60
      g.bullets = g.bullets.filter(b => {
        if (b.friendly) return true
        if (b.x > g.px && b.x < g.px + PLAYER_W && b.y > py && b.y < py + PLAYER_H) {
          spawnExplosion(b.x, b.y); g.playerHp--; g.invincible = 80
          if (g.playerHp <= 0) {
            g.running = false; spawnExplosion(g.px + PLAYER_W / 2, py + PLAYER_H / 2, true)
            setPhase('dead'); posthog.capture('game_over', { game: 'ban-thien-ha', score: g.score }); draw(); return false
          }
          return false
        }
        return true
      })
    } else g.invincible--

    // Particles
    g.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life -= 0.03 })
    g.particles = g.particles.filter(p => p.life > 0)

    // Wave clear
    if (g.enemies.length === 0 && g.running) {
      g.wave++
      if (g.wave > WAVE_DEFS.length) {
        g.running = false; setPhase('won'); setWave(g.wave)
        posthog.capture('game_won', { game: 'ban-thien-ha', score: g.score }); draw(); return
      }
      g.enemies = mkWave(g.wave); setWave(g.wave + 1)
    }

    draw()
    rafRef.current = requestAnimationFrame(loop)
  }, [draw, spawnExplosion])

  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const g = gs.current
    Object.assign(g, { px: W / 2 - PLAYER_W / 2, running: true, score: 0, wave: 0, frame: 0, shootTimer: 12, invincible: 0, playerHp: 3, bullets: [], particles: [], stars: mkStars() })
    g.enemies = mkWave(0)
    setScore(0); setWave(1); setPhase('playing')
    posthog.capture('game_started', { game: 'ban-thien-ha' })
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
    <div className="min-h-dvh bg-[#020617] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/game" className="flex items-center gap-1 text-primary-400 text-sm font-medium"><ChevronLeft size={18} /> Game</Link>
        <h1 className="text-white font-bold text-base">🚀 Bắn Thiên Hà</h1>
        <div className="text-green-400 font-bold text-base min-w-[4rem] text-right">{score}</div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <div className="relative">
          <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border border-gray-800" style={{ maxWidth: '100%', maxHeight: '72vh', touchAction: 'none' }} />
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-5xl mb-3">🚀</div>
              <p className="text-white text-xl font-bold mb-1">Bắn Thiên Hà</p>
              <p className="text-gray-400 text-sm mb-2 text-center px-6">Di chuyển trái/phải, tự động bắn — tiêu diệt 5 đợt địch!</p>
              <p className="text-purple-400 text-xs mb-6 text-center">❤️ 3 mạng • Wave 5 là trùm cuối</p>
              <button onClick={startGame} className="bg-green-500 hover:bg-green-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Bắt đầu</button>
            </div>
          )}
          {phase === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">💀</div>
              <p className="text-white text-xl font-bold mb-1">Phi thuyền bị phá hủy!</p>
              <p className="text-green-400 text-2xl font-black mb-1">★ {score}</p>
              <p className="text-gray-400 text-sm mb-6">Wave {wave}</p>
              <button onClick={startGame} className="bg-green-500 hover:bg-green-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Chơi lại</button>
            </div>
          )}
          {phase === 'won' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
              <div className="text-4xl mb-2">🏆</div>
              <p className="text-white text-xl font-bold mb-1">Thiên hà đã bình yên!</p>
              <p className="text-green-400 text-2xl font-black mb-6">★ {score}</p>
              <button onClick={startGame} className="bg-green-500 hover:bg-green-400 text-white font-bold px-8 py-3 rounded-2xl transition-colors">Chơi lại</button>
            </div>
          )}
        </div>
        <div className="flex gap-8">
          <button className="w-20 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-2xl font-bold select-none transition-colors"
            onPointerDown={() => { keys.current['ArrowLeft'] = true }} onPointerUp={() => { keys.current['ArrowLeft'] = false }} onPointerLeave={() => { keys.current['ArrowLeft'] = false }}>◀</button>
          <button className="w-20 h-14 rounded-2xl bg-gray-800 active:bg-gray-700 flex items-center justify-center text-white text-2xl font-bold select-none transition-colors"
            onPointerDown={() => { keys.current['ArrowRight'] = true }} onPointerUp={() => { keys.current['ArrowRight'] = false }} onPointerLeave={() => { keys.current['ArrowRight'] = false }}>▶</button>
        </div>
      </div>
    </div>
  )
}
