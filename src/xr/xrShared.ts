import { Matrix4, Object3D } from 'three'
import type { XRHitSample } from '../game/Game'

/** Mutable state shared between the XR input components (never triggers React renders). */
export const xrShared = {
  rightHit: { valid: false, matrix: new Matrix4(), time: 0 } as XRHitSample,
  /** muzzle of the controller blaster or the index finger tip of a tracked hand */
  muzzle: null as Object3D | null,
  /** which input source the hit test belongs to */
  hitSource: null as XRInputSource | null,
}
