import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Raycaster, Vector2, Vector3 } from 'three'
import { TOWER_ORDER } from '../game/config'
import { game } from '../game/Game'

const _ndc = new Vector2()
const _rc = new Raycaster()
const _origin = new Vector3()
const _dir = new Vector3()

/** Mouse + keyboard controls for the browser preview. */
export function DesktopInput() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const pointer = useRef({ x: 0, y: 0, inside: false })
  const down = useRef<{ x: number; y: number; t: number; button: number } | null>(null)
  const firing = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    const toNdc = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      pointer.current.x = ((e.clientX - r.left) / r.width) * 2 - 1
      pointer.current.y = -((e.clientY - r.top) / r.height) * 2 + 1
      pointer.current.inside = true
    }
    const onMove = (e: PointerEvent) => toNdc(e)
    const onLeave = () => {
      pointer.current.inside = false
    }
    const onDown = (e: PointerEvent) => {
      toNdc(e)
      down.current = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button }
    }
    const onUp = (e: PointerEvent) => {
      const d = down.current
      down.current = null
      if (!d) return
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y)
      if (moved > 6 || performance.now() - d.t > 450) return
      toNdc(e)
      _ndc.set(pointer.current.x, pointer.current.y)
      _rc.setFromCamera(_ndc, camera)
      game.updateAim(_rc.ray.origin, _rc.ray.direction, null)
      if (d.button === 0) game.primaryAction()
      else if (d.button === 2) game.secondaryAction()
    }
    const onContext = (e: MouseEvent) => e.preventDefault()
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && e.code !== 'KeyF') return
      const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code)
      if (idx >= 0) game.selectTower(TOWER_ORDER[idx])
      else if (e.code === 'Space') {
        e.preventDefault()
        if (game.phase === 'build') game.startWave()
        else if (game.phase === 'gameover' || game.phase === 'victory') game.restart()
      } else if (e.code === 'KeyE' && game.phase === 'victory') game.continueEndless()
      else if (e.code === 'KeyF') firing.current = true
      else if (e.code === 'KeyQ') game.orbitalStrike(game.aim.hit ? game.aim.point : null)
      else if (e.code === 'Escape') game.selectTowerInstance(null)
      else {
        const t = game.selectedTower ?? game.aim.tower
        if (!t) return
        if (e.code === 'KeyU') game.upgradeTower(t)
        else if (e.code === 'KeyX') game.sellTower(t)
        else if (e.code === 'KeyT') game.cycleTargeting(t)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyF') firing.current = false
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('contextmenu', onContext)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('contextmenu', onContext)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [gl, camera])

  useFrame(() => {
    if (!pointer.current.inside) {
      game.clearAim()
      return
    }
    _ndc.set(pointer.current.x, pointer.current.y)
    _rc.setFromCamera(_ndc, camera)
    game.updateAim(_rc.ray.origin, _rc.ray.direction, null)
    if (firing.current && game.aim.hit) {
      // the blaster fires from just below the camera towards the cursor
      camera.getWorldPosition(_origin)
      _origin.y -= 0.25
      _dir.subVectors(game.aim.point, _origin).normalize()
      game.fireBlaster(_origin, _dir, _origin.distanceTo(game.aim.point) + 0.05)
    }
  })

  return null
}
