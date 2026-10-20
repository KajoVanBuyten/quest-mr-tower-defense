import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, Vector3 } from 'three'
import { MAX_TOWER_LEVEL, TARGET_LABEL, TOWERS, towerStats, type TowerStats } from '../game/config'
import { game, type Tower } from '../game/Game'
import { useUI } from '../game/uiStore'
import { glassPanel, roundRect, text } from './canvasPanel'
import { Panel } from './Panel'

const _p = new Vector3()
const _cam = new Vector3()
const _next = {} as TowerStats

function fmt(n: number, digits = 0) {
  return n.toFixed(digits).replace('.', ',')
}

function statRows(t: Tower): Array<[string, string, string]> {
  const cur = t.stats
  const max = t.level >= MAX_TOWER_LEVEL
  const nx = max ? null : towerStats(t.type, t.level + 1, t.surfaceH, _next)
  const rows: Array<[string, string, string]> = []
  if (t.type === 'laser') rows.push(['Schaden/s', fmt(cur.damage), nx ? fmt(nx.damage) : ''])
  else rows.push(['Schaden', fmt(cur.damage), nx ? fmt(nx.damage) : ''])
  rows.push(['Reichweite', `${fmt(cur.range, 2)} m`, nx ? `${fmt(nx.range, 2)} m` : ''])
  if (t.type === 'tesla') rows.push(['Kette', `${cur.chain} Ziele`, nx ? `${nx.chain}` : ''])
  else if (t.type === 'frost') rows.push(['Verlangsamung', `${Math.round(cur.slow * 100)} %`, nx ? `${Math.round(nx.slow * 100)} %` : ''])
  else if (t.type === 'mortar') rows.push(['Explosion', `${fmt(cur.splash, 2)} m`, nx ? `${fmt(nx.splash, 2)} m` : ''])
  else rows.push(['DPS', fmt(cur.dps), nx ? fmt(nx.dps) : ''])
  if (t.type !== 'laser') rows.push(['Nachladen', `${fmt(cur.interval, 2)} s`, nx ? `${fmt(nx.interval, 2)} s` : ''])
  return rows
}

function drawInfo(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const t = game.selectedTower
  if (!t) return
  const def = TOWERS[t.type]
  glassPanel(ctx, w, h, def.color, 30)
  const pad = 34
  ctx.fillStyle = def.color
  ctx.beginPath()
  ctx.arc(pad + 14, 52, 14, 0, Math.PI * 2)
  ctx.fill()
  text(ctx, def.name.toUpperCase(), pad + 40, 52, 44, '#ffffff', 900, 'left', 10)
  // level pips
  for (let i = 0; i < MAX_TOWER_LEVEL; i++) {
    const x = w - pad - (MAX_TOWER_LEVEL - 1 - i) * 34 - 12
    roundRect(ctx, x - 12, 40, 24, 24, 6)
    const on = i < t.level
    ctx.fillStyle = on ? (t.level >= MAX_TOWER_LEVEL ? '#ffd76a' : def.color) : 'rgba(255,255,255,0.08)'
    if (on) {
      ctx.shadowColor = ctx.fillStyle
      ctx.shadowBlur = 10
    }
    ctx.fill()
    ctx.shadowBlur = 0
  }
  text(ctx, t.level >= MAX_TOWER_LEVEL ? 'MAX' : `Stufe ${t.level}`, w - pad - MAX_TOWER_LEVEL * 34 - 6, 52, 28, '#9fb3d9', 700, 'right')
  const rows = statRows(t)
  let y = 112
  for (const [label, cur, nx] of rows) {
    text(ctx, label, pad, y, 30, '#9fb3d9', 600)
    text(ctx, cur, w * 0.62, y, 32, '#ffffff', 800, 'right')
    if (nx) text(ctx, `→ ${nx}`, w - pad, y, 30, '#6dffb0', 800, 'right')
    y += 44
  }
  text(ctx, `Ziel: ${TARGET_LABEL[t.targeting]}`, pad, h - 34, 28, '#c8d4f0', 600)
  text(ctx, t.surfaceH > 0.3 ? `Erhöht +${Math.round(Math.min(t.surfaceH, 1.2) * 35)}% Reichweite` : `Investiert ◆${t.invested}`, w - pad, h - 34, 26, '#9fb3d9', 600, 'right')
}

function button(label: string, sub: string, color: string, enabled: boolean, flash: boolean) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number, hover: boolean) => {
    const c = flash ? '#ff4d6a' : enabled ? color : '#56607a'
    roundRect(ctx, 5, 5, w - 10, h - 10, 22)
    ctx.fillStyle = hover && enabled ? c : 'rgba(10, 14, 28, 0.94)'
    ctx.fill()
    ctx.lineWidth = 4
    ctx.strokeStyle = c
    if (enabled) {
      ctx.shadowColor = c
      ctx.shadowBlur = 12
    }
    ctx.stroke()
    ctx.shadowBlur = 0
    const ink = hover && enabled ? '#05101a' : c
    text(ctx, label, w / 2, sub ? h * 0.38 : h / 2 + 2, 34, ink, 900, 'center')
    if (sub) text(ctx, sub, w / 2, h * 0.72, 26, hover && enabled ? '#05101a' : flash ? '#ffb3c0' : '#d6def5', 700, 'center')
  }
}

function infoSig() {
  const t = game.selectedTower
  return t ? `${t.id}|${t.level}|${t.targeting}|${t.invested}` : ''
}

/** World-space info card above the selected tower with Upgrade / Sell / Targeting buttons. */
export function TowerCard() {
  const id = useUI((s) => s.selectedTowerId)
  const group = useRef<Group>(null)

  useFrame((state, dt) => {
    const g = group.current
    const t = game.selectedTower
    if (!g || !t) return
    state.camera.getWorldPosition(_cam)
    game.toWorld(_p.copy(t.pos), _p)
    const dist = _cam.distanceTo(_p)
    // constant apparent size: readable in the headset and from the desktop orbit camera
    const s = game.mode === 'xr' ? Math.min(1.9, Math.max(0.75, dist * 0.55)) : Math.min(3.4, Math.max(0.9, dist * 0.8))
    _p.y += t.model.height + 0.2 * s
    // lean slightly towards the viewer so the card never sits inside the tower
    const dx = _cam.x - _p.x
    const dz = _cam.z - _p.z
    const len = Math.hypot(dx, dz) || 1
    _p.x += (dx / len) * 0.08
    _p.z += (dz / len) * 0.08
    if (g.userData.id !== t.id) {
      g.position.copy(_p)
      g.userData.id = t.id
    }
    g.position.lerp(_p, Math.min(1, dt * 10))
    g.scale.setScalar(s)
    g.rotation.set(0, Math.atan2(_cam.x - g.position.x, _cam.z - g.position.z), 0)
  })

  if (!id) return null
  const flash = () => game.time - game.deniedAt < 0.5
  const upSig = () => {
    const t = game.selectedTower
    return t ? `${t.level}|${game.credits >= game.upgradeCost(t)}|${flash()}` : ''
  }
  return (
    <group ref={group}>
      <Panel width={0.3} height={0.19} resolution={2000} overlay signature={infoSig} draw={drawInfo} />
      <Panel
        width={0.12}
        height={0.05}
        resolution={2000}
        overlay
        position={[-0.087, -0.128, 0]}
        signature={upSig}
        draw={(ctx, w, h, hover) => {
          const t = game.selectedTower
          if (!t) return
          const max = t.level >= MAX_TOWER_LEVEL
          const cost = game.upgradeCost(t)
          const afford = game.credits >= cost
          button(max ? 'MAXIMAL' : 'UPGRADE', max ? '' : `◆ ${cost}${afford ? '' : ' – zu wenig'}`, '#4ff7c8', !max && afford, flash() && !max && !afford)(ctx, w, h, hover)
        }}
        onPress={() => game.selectedTower && game.upgradeTower(game.selectedTower)}
      />
      <Panel
        width={0.085}
        height={0.05}
        resolution={2000}
        overlay
        position={[0.022, -0.128, 0]}
        signature={() => `${game.selectedTower?.invested ?? 0}`}
        draw={(ctx, w, h, hover) => {
          const t = game.selectedTower
          if (!t) return
          button('VERKAUF', `+◆ ${game.sellValue(t)}`, '#ffd24f', true, false)(ctx, w, h, hover)
        }}
        onPress={() => game.selectedTower && game.sellTower(game.selectedTower)}
      />
      <Panel
        width={0.075}
        height={0.05}
        resolution={2000}
        overlay
        position={[0.106, -0.128, 0]}
        signature={() => `${game.selectedTower?.targeting ?? ''}`}
        draw={(ctx, w, h, hover) => {
          const t = game.selectedTower
          if (!t) return
          button('ZIEL', TARGET_LABEL[t.targeting], '#b98cff', true, false)(ctx, w, h, hover)
        }}
        onPress={() => game.selectedTower && game.cycleTargeting(game.selectedTower)}
      />
      <Panel
        width={0.036}
        height={0.036}
        resolution={2000}
        overlay
        position={[0.163, 0.098, 0.001]}
        signature={() => 'x'}
        draw={(ctx, w, h, hover) => {
          ctx.beginPath()
          ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2)
          ctx.fillStyle = hover ? '#ff4d6a' : 'rgba(10, 14, 28, 0.94)'
          ctx.fill()
          ctx.lineWidth = 3
          ctx.strokeStyle = '#ff4d6a'
          ctx.stroke()
          text(ctx, '✕', w / 2, h / 2 + 2, 40, hover ? '#ffffff' : '#ff8da0', 900, 'center')
        }}
        onPress={() => game.selectTowerInstance(null)}
      />
    </group>
  )
}
