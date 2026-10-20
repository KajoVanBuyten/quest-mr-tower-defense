import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three'
import { TOWERS } from '../game/config'
import { game } from '../game/Game'

const _up = new Vector3(0, 1, 0)
const _q = new Quaternion()
const _v = new Vector3()
const VALID = new Color('#5ff6ff')
const INVALID = new Color('#ff3d5c')

/** Reticle, ghost tower and range indicator at the current aim point. */
export function PlacementPreview() {
  const root = useRef<Group>(null)
  const parts = useMemo(() => {
    const ringMat = new MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
    const rangeMat = new MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
    const ghostMat = new LineBasicMaterial({ color: VALID, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
    const reticle = new Mesh(new RingGeometry(0.035, 0.045, 32), ringMat)
    const dot = new Mesh(new RingGeometry(0, 0.008, 12), ringMat)
    const range = new Mesh(new RingGeometry(0.985, 1, 96), rangeMat)
    const rangeFill = new Mesh(
      new RingGeometry(0, 0.985, 64),
      new MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.05, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    )
    const ghostTower = new LineSegments(new EdgesGeometry(new CylinderGeometry(0.06, 0.09, 0.3, 6)), ghostMat)
    ghostTower.position.y = 0.15
    const ghostCore = new LineSegments(new EdgesGeometry(new OctahedronGeometry(0.075)), ghostMat)
    ghostCore.scale.set(1, 1.9, 1)
    ghostCore.position.y = 0.2
    const hoverRange = new Mesh(new RingGeometry(0.985, 1, 96), rangeMat.clone())
    hoverRange.rotation.x = -Math.PI / 2
    for (const m of [reticle, dot, range, rangeFill]) m.renderOrder = 25
    hoverRange.renderOrder = 25
    return { reticle, dot, range, rangeFill, ghostTower, ghostCore, hoverRange, ringMat, rangeMat, ghostMat }
  }, [])

  useFrame((state) => {
    const g = root.current
    if (!g) return
    const a = game.aim
    const phase = game.phase
    const placing = phase === 'placeCore' || phase === 'build' || phase === 'wave'
    const show = a.active && a.hit && placing && !a.ui && !a.tower
    const surface = g.children[0] as Group
    surface.visible = show
    if (show) {
      surface.position.copy(a.point).addScaledVector(a.normal, 0.004)
      _q.setFromUnitVectors(_up, a.normal.lengthSq() > 0 ? a.normal : _up)
      surface.quaternion.copy(_q)
      let valid = false
      if (phase === 'placeCore') {
        valid = game.canPlaceCore()
        parts.ghostCore.visible = true
        parts.ghostTower.visible = false
        parts.range.visible = parts.rangeFill.visible = false
      } else {
        const check = game.checkPlacement(game.selected, a.point, a.normal)
        valid = check.ok
        parts.ghostCore.visible = false
        parts.ghostTower.visible = a.horizontal
        const r = game.towerRangeAt(game.selected, 1, a.surfaceH)
        parts.range.visible = parts.rangeFill.visible = a.horizontal
        parts.range.scale.setScalar(r)
        parts.rangeFill.scale.setScalar(r)
      }
      const col = valid ? (phase === 'placeCore' ? VALID : new Color(TOWERS[game.selected].color)) : INVALID
      parts.ringMat.color.copy(col)
      parts.rangeMat.color.copy(col)
      parts.ghostMat.color.copy(col)
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.08
      parts.reticle.scale.setScalar(pulse)
    }
    const hr = parts.hoverRange
    if (a.tower && placing) {
      const t = a.tower
      hr.visible = true
      game.toWorld(_v.copy(t.pos), hr.position)
      hr.position.y += 0.01
      hr.scale.setScalar(game.towerRangeAt(t.type, t.level, t.surfaceH))
      ;(hr.material as MeshBasicMaterial).color.set(TOWERS[t.type].color)
    } else hr.visible = false
  })

  return (
    <group ref={root}>
      <group>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <primitive object={parts.reticle} />
          <primitive object={parts.dot} />
          <primitive object={parts.range} />
          <primitive object={parts.rangeFill} />
        </group>
        <primitive object={parts.ghostTower} />
        <primitive object={parts.ghostCore} />
      </group>
      <primitive object={parts.hoverRange} />
    </group>
  )
}
