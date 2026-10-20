import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, Vector3 } from 'three'
import { GAME, TOWERS } from '../game/config'
import { game } from '../game/Game'
import { useUI } from '../game/uiStore'
import { bar, glassPanel, hpColor, roundRect, text } from './canvasPanel'
import { Panel } from './Panel'

const _target = new Vector3()
const _cam = new Vector3()
const _fwd = new Vector3()

function drawStatus(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = game
  const victory = g.phase === 'victory'
  const over = g.phase === 'gameover'
  glassPanel(ctx, w, h, over ? '#ff4d6a' : victory ? '#ffe36a' : '#5ff6ff')
  if (over || victory) {
    text(ctx, over ? 'KERN ZERSTÖRT' : 'SIEG', w / 2, h * 0.3, 92, over ? '#ff4d6a' : '#ffe36a', 900, 'center', 30)
    text(ctx, over ? `Welle ${g.wave} von ${GAME.totalWaves} erreicht` : 'Alle Risse wurden versiegelt', w / 2, h * 0.53, 44, '#e6f0ff', 600, 'center')
    text(ctx, `${g.kills} Kreaturen besiegt · ${g.towers.length} Türme`, w / 2, h * 0.7, 36, '#9fb3d9', 500, 'center')
    return
  }
  const pad = 48
  text(ctx, 'RIFT DEFENSE', pad, 58, 34, '#7fe8ff', 800, 'left', 10)
  text(ctx, g.phase === 'wave' ? `WELLE ${g.wave}/${GAME.totalWaves}` : `WELLE ${g.wave + 1}/${GAME.totalWaves} BEREIT`, w - pad, 58, 34, '#ffffff', 800, 'right')
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
  // selected tower + hover
  const def = TOWERS[g.selected]
  roundRect(ctx, pad, 262, w - pad * 2, 64, 18)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fill()
  ctx.fillStyle = def.color
  ctx.beginPath()
  ctx.arc(pad + 34, 294, 12, 0, Math.PI * 2)
  ctx.fill()
  const info = g.hoverInfo || `${def.name}-Turm · ${def.cost} Credits`
  text(ctx, info, pad + 62, 294, 32, '#e6f0ff', 600)
}

function statusSignature() {
  const g = game
  return [g.phase, g.wave, Math.ceil(g.coreHp), g.credits, g.aliveCount, Math.floor(g.ult * 50), g.selected, g.hoverInfo, g.towers.length, g.kills].join('|')
}

function drawAction(ctx: CanvasRenderingContext2D, w: number, h: number, hover: boolean) {
  const g = game
  const restart = g.phase === 'gameover' || g.phase === 'victory'
  const label = restart ? 'NEU STARTEN' : `WELLE ${g.wave + 1} STARTEN`
  const color = restart ? '#ffe36a' : '#4ff7c8'
  roundRect(ctx, 6, 6, w - 12, h - 12, (h - 12) / 2)
  const grd = ctx.createLinearGradient(0, 0, w, 0)
  grd.addColorStop(0, hover ? color : 'rgba(20,40,40,0.95)')
  grd.addColorStop(1, hover ? '#ffffff' : 'rgba(10,22,30,0.95)')
  ctx.fillStyle = grd
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 18
  ctx.stroke()
  ctx.shadowBlur = 0
  text(ctx, `▶  ${label}`, w / 2, h / 2 + 2, 44, hover ? '#04121a' : color, 900, 'center')
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
    const src = g.room.source === 'xr' ? `Raum: ${g.room.walls.length} Wände, ${g.room.obstacles.length} Möbel erkannt` : 'Keine Raumdaten – virtuelle Risse'
    text(ctx, src, w / 2, 250, 28, '#9fb3d9', 500, 'center')
  }
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
      _target.y += game.phase === 'gameover' || game.phase === 'victory' ? 0.55 : 0.72
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
        <Panel width={0.44} height={0.15} resolution={2400} signature={statusSignature} draw={drawStatus} />
        <Panel
          width={0.3}
          height={0.055}
          position={[0, -0.11, 0.005]}
          resolution={2000}
          signature={() => `${game.phase}|${game.wave}`}
          draw={drawAction}
          visible={() => game.phase === 'build' || game.phase === 'gameover' || game.phase === 'victory'}
          onPress={() => {
            if (game.phase === 'build') game.startWave()
            else if (game.phase === 'gameover' || game.phase === 'victory') game.restart()
          }}
        />
      </group>
      <group ref={hint} visible={false}>
        <Panel width={0.5} height={0.15} resolution={1800} signature={() => `${game.phase}|${game.room.source}|${game.room.walls.length}|${game.room.obstacles.length}`} draw={drawHint} />
      </group>
    </>
  )
}
