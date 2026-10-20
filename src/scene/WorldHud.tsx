import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, Vector3 } from 'three'
import { ENEMIES, GAME, TOWERS, type WavePreview } from '../game/config'
import { game } from '../game/Game'
import { useUI } from '../game/uiStore'
import { bar, glassPanel, hpColor, previewRow, roundRect, text } from './canvasPanel'
import { Panel } from './Panel'

const _target = new Vector3()
const _cam = new Vector3()
const _fwd = new Vector3()

export function previewEntries(pv: WavePreview) {
  return pv.entries.map((e) => ({ color: ENEMIES[e.type].color, count: e.count, boss: ENEMIES[e.type].boss }))
}

export function waveLabel() {
  const g = game
  const w = g.nextWave
  if (g.endless || w > GAME.totalWaves) return `WELLE ${w} · ENDLOS`
  return `WELLE ${w}/${GAME.totalWaves}`
}

function drawStatus(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = game
  const victory = g.phase === 'victory'
  const over = g.phase === 'gameover'
  glassPanel(ctx, w, h, over ? '#ff4d6a' : victory ? '#ffe36a' : '#5ff6ff')
  if (over || victory) {
    text(ctx, over ? 'KERN ZERSTÖRT' : 'SIEG', w / 2, h * 0.22, 92, over ? '#ff4d6a' : '#ffe36a', 900, 'center', 30)
    text(ctx, over ? `Welle ${g.wave}${g.endless ? ' (Endlos)' : ` von ${GAME.totalWaves}`} erreicht` : `Alle ${GAME.totalWaves} Wellen abgewehrt`, w / 2, h * 0.42, 44, '#e6f0ff', 600, 'center')
    text(ctx, `${g.kills} Kreaturen besiegt · ${g.towers.length} Türme`, w / 2, h * 0.57, 36, '#9fb3d9', 500, 'center')
    const rec = g.score >= g.highScore && g.score > 0
    text(ctx, `Punkte ${g.score.toLocaleString('de-DE')}${rec ? '  ★ REKORD' : `  ·  Rekord ${g.highScore.toLocaleString('de-DE')}`}`, w / 2, h * 0.74, 38, rec ? '#ffe36a' : '#c8d4f0', 800, 'center')
    if (victory) text(ctx, 'Endlos-Modus: unbegrenzte Wellen, steigende Stärke', w / 2, h * 0.88, 30, '#b48ad6', 600, 'center')
    return
  }
  const pad = 48
  text(ctx, 'RIFT DEFENSE', pad, 58, 34, '#7fe8ff', 800, 'left', 10)
  text(ctx, g.phase === 'wave' ? waveLabel() : `${waveLabel()} BEREIT`, w - pad, 58, 34, g.endless ? '#ff9af0' : '#ffffff', 800, 'right')
  // core hp
  const hp = g.coreHp / GAME.coreHp
  text(ctx, 'KERN', pad, 128, 30, '#9fb3d9', 700)
  bar(ctx, pad + 100, 112, w - pad * 2 - 230, 32, hp, hpColor(hp))
  text(ctx, `${Math.ceil(g.coreHp)}`, w - pad, 128, 38, hpColor(hp), 800, 'right')
  // credits / enemies / ult
  text(ctx, `◆ ${g.credits}`, pad, 200, 46, '#ffe36a', 800, 'left', 12)
  text(ctx, g.phase === 'wave' ? `${g.aliveCount} Gegner` : `${g.towers.length} Türme`, w / 2 + 10, 200, 34, '#d6def5', 600, 'center')
  const ult = g.ult
  text(ctx, ult >= 1 ? 'ORBITAL BEREIT' : `ORBITAL ${Math.floor(ult * 100)}%`, w - pad, 200, 30, ult >= 1 ? '#ff7af0' : '#b48ad6', 800, 'right', ult >= 1 ? 14 : 0)
  bar(ctx, w - pad - 260, 228, 260, 10, ult, '#ff5af0')
  // wave preview
  const pv = g.preview
  roundRect(ctx, pad, 262, w - pad * 2, 76, 18)
  ctx.fillStyle = pv.tag === 'BOSS' ? 'rgba(255,60,90,0.14)' : pv.tag === 'MINI-BOSS' ? 'rgba(255,60,210,0.12)' : 'rgba(255,255,255,0.05)'
  ctx.fill()
  const tagColor = pv.tag === 'BOSS' ? '#ff4d6a' : pv.tag === 'MINI-BOSS' ? '#ff6ae0' : '#9fb3d9'
  text(ctx, g.phase === 'wave' ? 'JETZT' : 'NÄCHSTE', pad + 20, 284, 22, '#9fb3d9', 800)
  text(ctx, pv.tag ? `${pv.tag} · ${pv.name}` : pv.name, pad + 20, 316, 26, tagColor, 800)
  previewRow(ctx, previewEntries(pv), w * 0.46, 300, 34, w - pad - 12)
  // selected tower type + hover
  const def = TOWERS[g.selected]
  roundRect(ctx, pad, 352, w - pad * 2, 56, 18)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fill()
  ctx.fillStyle = def.color
  ctx.beginPath()
  ctx.arc(pad + 34, 380, 12, 0, Math.PI * 2)
  ctx.fill()
  const info = g.hoverInfo || (g.introActive ? 'Risse öffnen sich …' : `${def.name}-Turm · ◆ ${def.cost}`)
  text(ctx, info, pad + 62, 380, 30, '#e6f0ff', 600)
}

function statusSignature() {
  const g = game
  return [g.phase, g.wave, Math.ceil(g.coreHp), g.credits, g.aliveCount, Math.floor(g.ult * 50), g.selected, g.hoverInfo, g.towers.length, g.kills, g.endless, g.introActive, g.score].join('|')
}

function pill(label: string, color: string, enabled = true) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number, hover: boolean) => {
    const c = enabled ? color : '#56607a'
    roundRect(ctx, 6, 6, w - 12, h - 12, (h - 12) / 2)
    const grd = ctx.createLinearGradient(0, 0, w, 0)
    grd.addColorStop(0, hover && enabled ? c : 'rgba(20,40,40,0.95)')
    grd.addColorStop(1, hover && enabled ? '#ffffff' : 'rgba(10,22,30,0.95)')
    ctx.fillStyle = grd
    ctx.fill()
    ctx.lineWidth = 4
    ctx.strokeStyle = c
    ctx.shadowColor = c
    ctx.shadowBlur = enabled ? 18 : 0
    ctx.stroke()
    ctx.shadowBlur = 0
    text(ctx, label, w / 2, h / 2 + 2, 40, hover && enabled ? '#04121a' : c, 900, 'center')
  }
}

function drawAction(ctx: CanvasRenderingContext2D, w: number, h: number, hover: boolean) {
  const g = game
  if (g.phase === 'gameover') return pill('▶  NEU STARTEN', '#ffe36a')(ctx, w, h, hover)
  if (g.phase === 'victory') return pill('∞  ENDLOS WEITER', '#ff7af0')(ctx, w, h, hover)
  const intro = g.introActive
  return pill(intro ? 'RISSE ÖFFNEN SICH …' : `▶  WELLE ${g.wave + 1} STARTEN`, '#4ff7c8', !intro)(ctx, w, h, hover)
}

function drawHint(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = game
  glassPanel(ctx, w, h, '#b46bff')
  const scanning = g.phase === 'scan'
  text(ctx, scanning ? 'RAUM WIRD ERFASST' : 'KERN PLATZIEREN', w / 2, 70, 54, '#e3c8ff', 900, 'center', 18)
  if (scanning) {
    text(ctx, 'Sieh dich kurz im Raum um …', w / 2, 150, 36, '#d6def5', 500, 'center')
  } else {
    text(ctx, 'Ziele mit rechts auf Boden oder Tisch', w / 2, 140, 34, '#d6def5', 500, 'center')
    text(ctx, 'Trigger / Pinch zum Platzieren', w / 2, 190, 34, '#7fe8ff', 700, 'center')
    const src = g.room.source === 'xr' ? `Raum: ${g.room.walls.length} Wände, ${g.room.obstacles.length} Möbel erkannt` : 'Keine Raumdaten – schwebende Risse'
    text(ctx, src, w / 2, 250, 28, '#9fb3d9', 500, 'center')
  }
  if (g.highScore > 0) text(ctx, `Rekord: ${g.highScore.toLocaleString('de-DE')} Punkte · Welle ${g.highWave}`, w / 2, 310, 26, '#ffe36a', 700, 'center')
}

/** HUD that floats above the core and turns towards the player. */
export function WorldHud() {
  const group = useRef<Group>(null)
  const hint = useRef<Group>(null)
  const xr = useUI((s) => s.xr)

  useFrame((state, dt) => {
    const g = group.current
    const h = hint.current
    if (!g || !h) return
    const cam = state.camera
    cam.getWorldPosition(_cam)
    const showMain = game.corePlaced && game.phase !== 'menu'
    g.visible = showMain
    if (showMain) {
      game.toWorld(_target.copy(game.corePos), _target)
      _target.y += game.phase === 'gameover' || game.phase === 'victory' ? 0.55 : 0.74
      if (g.userData.init !== true) {
        g.position.copy(_target)
        g.userData.init = true
      }
      g.position.lerp(_target, Math.min(1, dt * 4))
      g.rotation.set(0, Math.atan2(_cam.x - g.position.x, _cam.z - g.position.z), 0)
    } else {
      g.userData.init = false
    }
    const showHint = xr && (game.phase === 'scan' || game.phase === 'placeCore')
    h.visible = showHint
    if (showHint) {
      cam.getWorldDirection(_fwd)
      _fwd.y = 0
      if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1)
      _fwd.normalize()
      _target.copy(_cam).addScaledVector(_fwd, 1.1)
      _target.y = _cam.y - 0.12
      if (h.userData.init !== true) {
        h.position.copy(_target)
        h.userData.init = true
      }
      h.position.lerp(_target, Math.min(1, dt * 2))
      h.rotation.set(0, Math.atan2(_cam.x - h.position.x, _cam.z - h.position.z), 0)
    } else {
      h.userData.init = false
    }
  })

  return (
    <>
      <group ref={group} visible={false}>
        <Panel width={0.44} height={0.18} resolution={2400} signature={statusSignature} draw={drawStatus} />
        <Panel
          width={0.3}
          height={0.055}
          position={[0, -0.125, 0.005]}
          resolution={2000}
          signature={() => `${game.phase}|${game.wave}|${game.introActive}`}
          draw={drawAction}
          visible={() => game.phase === 'build' || game.phase === 'gameover' || game.phase === 'victory'}
          onPress={() => {
            if (game.phase === 'build') game.startWave()
            else if (game.phase === 'victory') game.continueEndless()
            else if (game.phase === 'gameover') game.restart()
          }}
        />
        <Panel
          width={0.2}
          height={0.045}
          position={[0, -0.18, 0.005]}
          resolution={2000}
          signature={() => game.phase}
          draw={pill('NEU STARTEN', '#ffe36a')}
          visible={() => game.phase === 'victory'}
          onPress={() => game.phase === 'victory' && game.restart()}
        />
      </group>
      <group ref={hint} visible={false}>
        <Panel
          width={0.5}
          height={0.19}
          resolution={1800}
          overlay
          signature={() => `${game.phase}|${game.room.source}|${game.room.walls.length}|${game.room.obstacles.length}|${game.highScore}`}
          draw={drawHint}
        />
      </group>
    </>
  )
}
