import { useFrame, useThree } from '@react-three/fiber'
import { requestXRAnchor, useXR, useXRStore } from '@react-three/xr'
import { useEffect, useRef } from 'react'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { game } from '../game/Game'
import { xrShared } from './xrShared'

const _origin = new Vector3()
const _dir = new Vector3()
const _q = new Quaternion()
const _muzzle = new Vector3()
const _m = new Matrix4()
const _m0inv = new Matrix4()
const _p = new Vector3()

interface ButtonMemory {
  [key: string]: boolean
}

function edge(mem: ButtonMemory, key: string, pressed: boolean) {
  const was = mem[key] ?? false
  mem[key] = pressed
  return pressed && !was
}

/**
 * Reads XR input sources every frame: aiming ray, hit test, trigger/pinch events,
 * controller buttons, middle-finger pinch for the hand blaster, plus the core anchor.
 */
export function XRInput() {
  const gl = useThree((s) => s.gl)
  const session = useXR((s) => s.session)
  const store = useXRStore()
  const buttons = useRef<ButtonMemory>({})
  const pointerSource = useRef<XRInputSource | null>(null)
  const anchor = useRef<{ anchor: XRAnchor; base: Matrix4 | null; pending: boolean } | null>(null)
  const anchorRequested = useRef(false)

  useEffect(() => {
    if (!session) return
    const onSelect = (e: XRInputSourceEvent) => {
      const src = e.inputSource
      if (src === pointerSource.current) {
        game.primaryAction()
      } else if (src.handedness === 'left') {
        // left trigger / pinch: orbital strike at the right-hand aim point
        if (game.phase === 'build' || game.phase === 'wave') game.orbitalStrike(game.aim.hit && !game.aim.ui ? game.aim.point : null)
      }
    }
    session.addEventListener('select', onSelect)
    // short vibration on the controller that performed the action (hands simply have no actuator)
    game.onHaptic = (intensity, ms) => {
      const pad = pointerSource.current?.gamepad as (Gamepad & { hapticActuators?: Array<{ pulse?: (v: number, d: number) => Promise<boolean> }> }) | undefined
      const act = pad?.hapticActuators?.[0] ?? (pad?.vibrationActuator as unknown as { pulse?: (v: number, d: number) => Promise<boolean> } | null | undefined)
      try {
        act?.pulse?.(Math.min(1, intensity), ms)?.catch?.(() => undefined)
      } catch {
        /* not supported */
      }
    }
    return () => {
      session.removeEventListener('select', onSelect)
      game.onHaptic = null
    }
  }, [session])

  useFrame((_, __, frame: XRFrame | undefined) => {
    const s = gl.xr.getSession()
    const ref = gl.xr.getReferenceSpace()
    if (!s || !frame || !ref) return
    let right: XRInputSource | null = null
    let left: XRInputSource | null = null
    for (const src of s.inputSources) {
      if (src.targetRayMode !== 'tracked-pointer') continue
      if (src.handedness === 'right') right = src
      else if (src.handedness === 'left') left = src
    }
    const ptr = right ?? left
    pointerSource.current = ptr
    let rayOk = false
    if (ptr) {
      const pose = frame.getPose(ptr.targetRaySpace, ref)
      if (pose) {
        const t = pose.transform
        _origin.set(t.position.x, t.position.y, t.position.z)
        _q.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w)
        _dir.set(0, 0, -1).applyQuaternion(_q)
        const hit = xrShared.rightHit
        const fresh = hit.valid && xrShared.hitSource === ptr && performance.now() - hit.time < 250
        game.updateAim(_origin, _dir, fresh ? hit : null)
        rayOk = true
      }
    }
    if (!rayOk) game.clearAim()

    const mem = buttons.current
    const fireFrom = () => {
      if (!rayOk) return
      const muzzle = xrShared.muzzle
      if (muzzle) muzzle.getWorldPosition(_muzzle)
      else _muzzle.copy(_origin)
      const target = game.aim.hit ? game.aim.point : _p.copy(_origin).addScaledVector(_dir, 8)
      const d = _p.subVectors(target, _muzzle)
      const dist = d.length()
      game.fireBlaster(_muzzle, d.normalize(), dist + 0.05)
    }

    // controllers
    const rg = right && !right.hand ? right.gamepad : undefined
    if (rg) {
      const b = rg.buttons
      if (b[1]?.pressed) fireFrom()
      if (edge(mem, 'rA', !!b[4]?.pressed)) {
        // A upgrades the selected tower, otherwise it calls the orbital strike
        if (game.selectedTower) game.upgradeTower(game.selectedTower)
        else game.orbitalStrike(game.aim.hit ? game.aim.point : null)
      }
      if (edge(mem, 'rB', !!b[5]?.pressed)) game.secondaryAction()
      const x = rg.axes[2] ?? 0
      if (edge(mem, 'rStickR', x > 0.7)) game.cycleTower(1)
      if (edge(mem, 'rStickL', x < -0.7)) game.cycleTower(-1)
    }
    const lg = left && !left.hand ? left.gamepad : undefined
    if (lg) {
      const b = lg.buttons
      if (edge(mem, 'lX', !!b[4]?.pressed)) {
        if (game.phase === 'build') game.startWave()
        else if (game.phase === 'victory') game.continueEndless()
        else if (game.phase === 'gameover') game.restart()
      }
      if (edge(mem, 'lY', !!b[5]?.pressed)) game.cycleTower(1)
      if (b[1]?.pressed && !right) fireFrom()
    }

    // hand blaster: thumb + middle finger pinch on the right hand
    if (right?.hand) {
      const thumb = right.hand.get('thumb-tip')
      const middle = right.hand.get('middle-finger-tip')
      if (thumb && middle && frame.getJointPose) {
        const a = frame.getJointPose(thumb, ref)
        const c = frame.getJointPose(middle, ref)
        if (a && c) {
          const dx = a.transform.position.x - c.transform.position.x
          const dy = a.transform.position.y - c.transform.position.y
          const dz = a.transform.position.z - c.transform.position.z
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          const pinching = mem.midPinch ? d < 0.035 : d < 0.018
          mem.midPinch = pinching
          if (pinching) fireFrom()
        }
      }
    }

    // keep the game world locked to a spatial anchor at the core
    if (game.corePlaced && !anchorRequested.current) {
      anchorRequested.current = true
      const corePos = game.toWorld(game.corePos)
      requestXRAnchor(store, { relativeTo: 'world', worldPosition: corePos, worldQuaternion: new Quaternion() })
        .then((a) => {
          if (a && game.corePlaced) anchor.current = { anchor: a, base: null, pending: false }
        })
        .catch(() => undefined)
    }
    if (!game.corePlaced) {
      anchorRequested.current = false
      if (anchor.current) {
        try {
          anchor.current.anchor.delete?.()
        } catch {
          /* already gone */
        }
        anchor.current = null
      }
    }
    const an = anchor.current
    if (an && game.corePlaced) {
      const pose = frame.getPose(an.anchor.anchorSpace, ref)
      if (pose) {
        _m.fromArray(pose.transform.matrix)
        if (!an.base) {
          an.base = _m.clone()
        } else {
          _m0inv.copy(an.base).invert()
          const root = game.root
          root.matrixAutoUpdate = false
          root.matrix.multiplyMatrices(_m, _m0inv)
          root.matrix.decompose(root.position, root.quaternion, root.scale)
          root.matrixWorldNeedsUpdate = true
        }
      }
    }
  })

  return null
}
