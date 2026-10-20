import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Shape, ShapeGeometry, Vector3 } from 'three'
import { GLOW_OPACITY, applyBlend } from '../fx/blending'
import { game } from '../game/Game'

const MAX = 6
const _w = new Vector3()
const _l = new Vector3()
const _inv = new Matrix4()

function arrowGeometry() {
  const s = new Shape()
  s.moveTo(0.028, 0)
  s.lineTo(-0.012, 0.022)
  s.lineTo(-0.004, 0)
  s.lineTo(-0.012, -0.022)
  s.closePath()
  return new ShapeGeometry(s)
}

/**
 * Edge-of-view arrows that point at rifts outside the field of view. They show while a
 * rift tears open, until the player has looked at it once, and at the start of each wave.
 */
export function RiftIndicators() {
  const group = useRef<Group>(null)
  const arrows = useMemo(() => {
    const geo = arrowGeometry()
    return Array.from({ length: MAX }, () => {
      const mat = applyBlend(new MeshBasicMaterial({ color: '#ff5ad8', opacity: 0.95, depthTest: false, toneMapped: false }), GLOW_OPACITY)
      const m = new Mesh(geo, mat)
      m.renderOrder = 60
      m.visible = false
      return m
    })
  }, [])

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const cam = state.camera
    cam.updateMatrixWorld()
    g.matrixAutoUpdate = false
    g.matrix.copy(cam.matrixWorld)
    g.matrixWorldNeedsUpdate = true
    _inv.copy(cam.matrixWorld).invert()
    const persp = cam as PerspectiveCamera
    const xr = game.mode === 'xr'
    // generous view cone: Quest 3 sees roughly ±50° horizontally
    const tanV = xr ? Math.tan((34 * Math.PI) / 180) : Math.tan(((persp.fov ?? 48) * 0.5 * Math.PI) / 180) * 0.9
    const tanH = xr ? Math.tan((40 * Math.PI) / 180) : tanV * (persp.aspect ?? 1.6)
    const t = state.clock.elapsedTime
    const active = game.phase === 'build' || game.phase === 'wave'
    for (let i = 0; i < MAX; i++) {
      const arrow = arrows[i]
      const r = game.rifts[i]
      arrow.visible = false
      if (!r || !active || !r.opened) continue
      game.toWorld(r.center, _w)
      _l.copy(_w).applyMatrix4(_inv)
      const inView = _l.z < -0.05 && Math.abs(_l.x / -_l.z) < tanH && Math.abs(_l.y / -_l.z) < tanV
      if (inView) {
        r.seen = true
        r.attention = Math.min(r.attention, 0.6)
        continue
      }
      if (r.seen && r.attention <= 0) continue
      let x = _l.x
      let y = _l.y
      if (_l.z > 0 && Math.abs(x) < 0.05) x = 0.1
      const len = Math.hypot(x, y) || 1
      x /= len
      y /= len
      const d = 0.6
      const rad = xr ? 0.2 : d * tanV * 0.82
      // arrows sit on an ellipse near the edge of the view
      arrow.position.set(x * rad * (xr ? 1.15 : Math.min(1.8, tanH / tanV)), y * rad, -d)
      arrow.rotation.set(0, 0, Math.atan2(y, x))
      const pulse = 1 + 0.18 * Math.sin(t * 8 + i)
      arrow.scale.setScalar(pulse * (xr ? 1 : 0.9))
      ;(arrow.material as MeshBasicMaterial).opacity = 0.75 + 0.25 * Math.sin(t * 8 + i)
      arrow.visible = true
    }
  })

  return (
    <group ref={group}>
      {arrows.map((a, i) => (
        <primitive key={i} object={a} />
      ))}
    </group>
  )
}
