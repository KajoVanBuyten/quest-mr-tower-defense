import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, Matrix4, Quaternion, Vector3 } from 'three'
import { GAME, TOWER_ORDER, TOWERS, type TowerType } from '../game/config'
import { game } from '../game/Game'
import { bar, glassPanel, hpColor, previewRow, roundRect, text } from '../scene/canvasPanel'
import { previewEntries } from '../scene/WorldHud'
import { Panel } from '../scene/Panel'

const _pw = new Vector3()
const _cam = new Vector3()
const _pq = new Quaternion()
const _q = new Quaternion()
const _m = new Matrix4()
const UP = new Vector3(0, 1, 0)

function drawHeader(ctx: CanvasRenderingContext2D, w: number, h: number) {
  glassPanel(ctx, w, h, '#5ff6ff', 22)
  const hp = game.coreHp / GAME.coreHp
  text(ctx, `◆ ${game.credits}`, 26, 40, 40, '#ffe36a', 800, 'left', 10)
  const wv = game.nextWave
  text(ctx, game.endless || wv > GAME.totalWaves ? `W ${wv} ∞` : `W ${wv}/${GAME.totalWaves}`, w - 26, 40, 32, game.endless ? '#ff9af0' : '#ffffff', 800, 'right')
  bar(ctx, 26, 76, w * 0.5, 14, hp, hpColor(hp))
  text(ctx, `${Math.ceil(game.coreHp)}`, 26 + w * 0.5 + 12, 83, 24, hpColor(hp), 800)
  bar(ctx, w * 0.68, 76, w * 0.32 - 26, 14, game.ult, '#ff5af0')
  if (!game.corePlaced) return
  const pv = game.preview
  const tagColor = pv.tag === 'BOSS' ? '#ff4d6a' : pv.tag === 'MINI-BOSS' ? '#ff6ae0' : '#9fb3d9'
  text(ctx, pv.tag === 'BOSS' ? 'BOSS' : pv.tag === 'MINI-BOSS' ? 'MINI' : game.phase === 'wave' ? 'JETZT' : 'NÄCHST', 26, 134, 20, tagColor, 900)
  previewRow(ctx, previewEntries(pv), 100, 134, 26, w - 16)
}

function drawTower(type: TowerType) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number, hover: boolean) => {
    const def = TOWERS[type]
    const sel = game.selected === type
    const afford = game.credits >= def.cost
    roundRect(ctx, 5, 5, w - 10, h - 10, 18)
    ctx.fillStyle = sel ? 'rgba(40, 30, 60, 0.95)' : hover ? 'rgba(30, 36, 60, 0.95)' : 'rgba(10, 12, 26, 0.9)'
    ctx.fill()
    ctx.lineWidth = sel ? 5 : 2
    ctx.strokeStyle = sel ? def.color : 'rgba(150,170,220,0.35)'
    if (sel) {
      ctx.shadowColor = def.color
      ctx.shadowBlur = 16
    }
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.fillStyle = def.color
    ctx.beginPath()
    ctx.arc(30, h / 2, 11, 0, Math.PI * 2)
    ctx.fill()
    text(ctx, def.name, 52, h * 0.36, 30, afford ? '#ffffff' : '#7d86a0', 800)
    text(ctx, `◆ ${def.cost}`, 52, h * 0.7, 26, afford ? '#ffe36a' : '#8a6f4a', 700)
  }
}

function drawAction(ctx: CanvasRenderingContext2D, w: number, h: number, hover: boolean) {
  const end = game.phase === 'gameover' || game.phase === 'victory'
  const wave = game.phase === 'wave' || (game.phase === 'build' && game.introActive)
  const color = end ? '#ffe36a' : wave ? '#56607a' : '#4ff7c8'
  roundRect(ctx, 5, 5, w - 10, h - 10, (h - 10) / 2)
  ctx.fillStyle = hover && !wave ? color : 'rgba(10, 16, 26, 0.92)'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  ctx.stroke()
  const label = game.phase === 'victory' ? 'ENDLOS ∞' : end ? 'NEU STARTEN' : game.phase === 'wave' ? 'WELLE LÄUFT' : wave ? 'RISSE …' : 'WELLE STARTEN'
  text(ctx, label, w / 2, h / 2 + 1, 28, hover && !wave ? '#04121a' : color, 900, 'center')
}

function drawUlt(ctx: CanvasRenderingContext2D, w: number, h: number, hover: boolean) {
  const ready = game.ult >= 1
  const color = ready ? '#ff5af0' : '#5a3d66'
  roundRect(ctx, 5, 5, w - 10, h - 10, (h - 10) / 2)
  ctx.fillStyle = hover && ready ? color : 'rgba(16, 8, 22, 0.92)'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  if (ready) {
    ctx.shadowColor = color
    ctx.shadowBlur = 14
  }
  ctx.stroke()
  ctx.shadowBlur = 0
  text(ctx, ready ? 'ORBITAL' : `${Math.floor(game.ult * 100)}%`, w / 2, h / 2 + 1, 28, hover && ready ? '#1a0420' : ready ? '#ffc8fa' : '#9a7aa8', 900, 'center')
}

/**
 * Tower selection menu that hangs above the left controller / left wrist and always turns to face the player.
 */
export function WristMenu({ lift = 0.09 }: { lift?: number }) {
  const group = useRef<Group>(null)

  useFrame((state) => {
    const g = group.current
    const parent = g?.parent
    if (!g || !parent) return
    const show = game.phase !== 'menu' && game.phase !== 'scan'
    g.visible = show
    if (!show) return
    parent.updateWorldMatrix(true, false)
    parent.getWorldPosition(_pw)
    state.camera.getWorldPosition(_cam)
    _pw.y += lift
    // face the camera
    _m.lookAt(_cam, _pw, UP)
    _q.setFromRotationMatrix(_m)
    parent.getWorldQuaternion(_pq).invert()
    g.quaternion.copy(_pq.multiply(_q))
    g.position.copy(parent.worldToLocal(_pw))
  })

  const towerSig = () => `${game.selected}|${game.credits}`
  return (
    <group ref={group}>
      <Panel
        width={0.17}
        height={0.064}
        resolution={2600}
        position={[0, 0.057, 0]}
        signature={() => `${game.credits}|${Math.ceil(game.coreHp)}|${game.wave}|${game.phase}|${Math.floor(game.ult * 40)}|${game.endless}|${game.corePlaced}`}
        draw={drawHeader}
      />
      {TOWER_ORDER.map((type, i) => (
        <Panel
          key={type}
          width={0.082}
          height={0.042}
          resolution={2600}
          position={[(i % 2 === 0 ? -1 : 1) * 0.0435, -0.002 - Math.floor(i / 2) * 0.046, 0]}
          signature={towerSig}
          draw={drawTower(type)}
          onPress={() => game.selectTower(type)}
        />
      ))}
      <Panel
        width={0.1}
        height={0.032}
        resolution={2600}
        position={[-0.035, -0.088, 0]}
        signature={() => `${game.phase}|${game.introActive}`}
        draw={drawAction}
        onPress={() => {
          if (game.phase === 'build') game.startWave()
          else if (game.phase === 'victory') game.continueEndless()
          else if (game.phase === 'gameover') game.restart()
        }}
      />
      <Panel
        width={0.066}
        height={0.032}
        resolution={2600}
        position={[0.052, -0.088, 0]}
        signature={() => `${Math.floor(game.ult * 100)}`}
        draw={drawUlt}
        onPress={() => game.armOrbital()}
      />
    </group>
  )
}
