import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three'
import { GLOW_OPACITY, applyBlend } from '../fx/blending'
import { createTowerGhost, type TowerGhost } from '../fx/Towers'
import { TOWER_ORDER, TOWERS, type TowerType } from '../game/config'
import { game } from '../game/Game'
import { glassPanel, text } from './canvasPanel'
import { Panel } from './Panel'

const _up = new Vector3(0, 1, 0)
const _z = new Vector3(0, 0, 1)
const _q = new Quaternion()
const _v = new Vector3()
const _cam = new Vector3()
const VALID = new Color('#5ff6ff')
const INVALID = new Color('#ff3d5c')
const _col = new Color()

const glowMat = (opacity: number) => applyBlend(new MeshBasicMaterial({ color: VALID, opacity, side: DoubleSide, toneMapped: false, depthTest: true }), GLOW_OPACITY)

function drawLabel(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const P = game.placement
  const core = game.phase === 'placeCore'
  const def = TOWERS[game.selected]
  const ok = P.ok
  const color = ok ? (core ? '#5ff6ff' : def.color) : '#ff4d6a'
  glassPanel(ctx, w, h, color, h * 0.4)
  if (ok) {
    text(ctx, core ? 'KERN HIER PLATZIEREN' : `${def.name.toUpperCase()}  ◆ ${def.cost}`, w / 2, h * 0.42, h * 0.36, '#ffffff', 800, 'center')
    text(ctx, core ? 'Trigger / Pinch / Klick' : P.snapped ? 'auf Möbel-Oberkante' : P.surfaceH > 0.3 ? 'erhöht: mehr Reichweite' : 'Trigger / Pinch / Klick', w / 2, h * 0.76, h * 0.22, color, 600, 'center')
  } else {
    text(ctx, P.reason || 'Nicht möglich', w / 2, h * 0.52, h * 0.3, '#ffb3c0', 800, 'center')
  }
}

/** Placement ghost (upright tower hologram), range circle on the surface, aim reticle and tower highlight rings. */
export function PlacementPreview() {
  const ghostRoot = useRef<Group>(null)
  const label = useRef<Group>(null)
  const parts = useMemo(() => {
    const ringMat = glowMat(0.9)
    const rangeMat = glowMat(0.5)
    const fillMat = glowMat(0.07)
    const reticle = new Mesh(new RingGeometry(0.03, 0.04, 32), ringMat)
    const dot = new Mesh(new RingGeometry(0, 0.007, 12), ringMat)
    const range = new Mesh(new RingGeometry(0.975, 1, 96), rangeMat)
    const rangeFill = new Mesh(new RingGeometry(0, 0.975, 64), fillMat)
    range.rotation.x = rangeFill.rotation.x = -Math.PI / 2
    const ghosts = {} as Record<TowerType, TowerGhost>
    for (const t of TOWER_ORDER) {
      ghosts[t] = createTowerGhost(t)
      ghosts[t].root.visible = false
    }
    const coreMat = applyBlend(new LineBasicMaterial({ color: VALID, opacity: 0.9, toneMapped: false }), GLOW_OPACITY)
    const ghostCore = new LineSegments(new EdgesGeometry(new OctahedronGeometry(0.075)), coreMat)
    ghostCore.scale.set(1, 1.9, 1)
    ghostCore.position.y = 0.2
    const coreGroup = new Group()
    coreGroup.add(ghostCore)
    // vertical guide from the aim point up to the furniture top the tower snaps to
    const snapGeo = new BufferGeometry()
    snapGeo.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3))
    const snapLine = new Line(snapGeo, coreMat)
    // highlight rings for hovered / selected towers
    const hoverRing = new Mesh(new RingGeometry(0.11, 0.125, 48), glowMat(0.7))
    const selRing = new Mesh(new RingGeometry(0.115, 0.14, 48), glowMat(0.95))
    const selRange = new Mesh(new RingGeometry(0.98, 1, 96), glowMat(0.45))
    const selFill = new Mesh(new RingGeometry(0, 0.98, 64), glowMat(0.05))
    for (const m of [hoverRing, selRing, selRange, selFill]) m.rotation.x = -Math.PI / 2
    for (const m of [reticle, dot, range, rangeFill, hoverRing, selRing, selRange, selFill, snapLine]) m.renderOrder = 25
    return { reticle, dot, range, rangeFill, ghosts, ghostCore, coreGroup, coreMat, ringMat, rangeMat, fillMat, snapLine, hoverRing, selRing, selRange, selFill }
  }, [])

  useFrame((state) => {
    const g = ghostRoot.current
    const lbl = label.current
    if (!g || !lbl) return
    const a = game.aim
    const P = game.placement
    const phase = game.phase
    const time = state.clock.elapsedTime
    const showReticle = a.active && a.hit && !a.ui && !a.tower && (phase === 'placeCore' || phase === 'build' || phase === 'wave')
    parts.reticle.visible = parts.dot.visible = showReticle
    if (showReticle) {
      parts.reticle.position.copy(a.point).addScaledVector(a.normal, 0.004)
      parts.dot.position.copy(parts.reticle.position)
      _q.setFromUnitVectors(_z, a.normal.lengthSq() > 0 ? a.normal : _up)
      parts.reticle.quaternion.copy(_q)
      parts.dot.quaternion.copy(_q)
      parts.reticle.scale.setScalar(1 + Math.sin(time * 6) * 0.08)
    }

    const show = P.has && !game.orbitalArmed
    g.visible = show
    lbl.visible = show
    for (const t of TOWER_ORDER) parts.ghosts[t].root.visible = false
    parts.coreGroup.visible = false
    parts.snapLine.visible = false
    if (show) {
      const coreMode = phase === 'placeCore'
      g.position.copy(P.point)
      const col = P.ok ? (coreMode ? VALID : _col.set(TOWERS[game.selected].color)) : INVALID
      const pulse = 0.75 + 0.25 * Math.sin(time * 5)
      parts.ringMat.color.copy(col)
      parts.rangeMat.color.copy(col)
      parts.fillMat.color.copy(col)
      parts.coreMat.color.copy(col)
      if (coreMode) {
        parts.coreGroup.visible = true
        parts.range.visible = parts.rangeFill.visible = false
      } else {
        const ghost = parts.ghosts[game.selected]
        ghost.root.visible = true
        ghost.fill.color.copy(col)
        ghost.lines.color.copy(col)
        ghost.fill.opacity = 0.16 + 0.1 * pulse
        ghost.root.rotation.y = time * 0.4
        const r = game.towerRangeAt(game.selected, 1, P.surfaceH)
        parts.range.visible = parts.rangeFill.visible = true
        parts.range.scale.setScalar(r)
        parts.rangeFill.scale.setScalar(r)
      }
      if (P.snapped && a.point.y < P.point.y - 0.03) {
        parts.snapLine.visible = true
        parts.snapLine.position.copy(a.point).sub(P.point)
        parts.snapLine.scale.set(1, P.point.y - a.point.y, 1)
      }
      // label floats above the ghost and faces the viewer
      state.camera.getWorldPosition(_cam)
      const dist = _cam.distanceTo(P.point)
      const s = Math.min(2.2, Math.max(0.7, dist * 0.6))
      lbl.position.copy(P.point)
      lbl.position.y += 0.42 * Math.min(1.4, s)
      lbl.scale.setScalar(s)
      lbl.rotation.set(0, Math.atan2(_cam.x - lbl.position.x, _cam.z - lbl.position.z), 0)
    }

    // tower highlight
    const hov = a.tower && (phase === 'build' || phase === 'wave') ? a.tower : null
    const sel = game.selectedTower
    parts.hoverRing.visible = !!hov && hov !== sel
    if (hov && hov !== sel) {
      game.toWorld(_v.copy(hov.pos), parts.hoverRing.position)
      parts.hoverRing.position.y += 0.006
      ;(parts.hoverRing.material as MeshBasicMaterial).color.set(TOWERS[hov.type].color)
    }
    const showSel = !!sel || (!!hov && hov !== sel)
    parts.selRing.visible = !!sel
    parts.selRange.visible = parts.selFill.visible = showSel
    const rangeT = sel ?? hov
    if (rangeT) {
      game.toWorld(_v.copy(rangeT.pos), parts.selRange.position)
      parts.selRange.position.y += 0.008
      parts.selFill.position.copy(parts.selRange.position)
      const r = rangeT.stats.range
      parts.selRange.scale.setScalar(r)
      parts.selFill.scale.setScalar(r)
      const c = TOWERS[rangeT.type].color
      ;(parts.selRange.material as MeshBasicMaterial).color.set(c)
      ;(parts.selFill.material as MeshBasicMaterial).color.set(c)
    }
    if (sel) {
      game.toWorld(_v.copy(sel.pos), parts.selRing.position)
      parts.selRing.position.y += 0.01
      parts.selRing.rotation.z = time * 1.5
      parts.selRing.scale.setScalar((1 + 0.06 * Math.sin(time * 5)) * sel.levelScale)
      ;(parts.selRing.material as MeshBasicMaterial).color.set(TOWERS[sel.type].color)
    }
  })

  return (
    <>
      <primitive object={parts.reticle} />
      <primitive object={parts.dot} />
      <group ref={ghostRoot} visible={false}>
        <primitive object={parts.range} />
        <primitive object={parts.rangeFill} />
        {TOWER_ORDER.map((t) => (
          <primitive key={t} object={parts.ghosts[t].root} />
        ))}
        <primitive object={parts.coreGroup} />
        <primitive object={parts.snapLine} />
      </group>
      <group ref={label} visible={false}>
        <Panel
          width={0.2}
          height={0.05}
          resolution={2400}
          overlay
          signature={() => `${game.placement.ok}|${game.placement.reason}|${game.selected}|${game.phase}|${game.placement.snapped}|${game.placement.surfaceH > 0.3}`}
          draw={drawLabel}
        />
      </group>
      <primitive object={parts.hoverRing} />
      <primitive object={parts.selRing} />
      <primitive object={parts.selRange} />
      <primitive object={parts.selFill} />
    </>
  )
}
