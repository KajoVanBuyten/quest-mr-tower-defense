import { Vector3 } from 'three'

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface WallInfo {
  center: Vector3
  /** horizontal normal pointing into the room */
  normal: Vector3
  width: number
  height: number
  bottom: number
  /** wall outline in wall coordinates: u along `right` from `center`, v = world height */
  poly?: Array<[number, number]>
  label?: string
}

export interface Obstacle extends Bounds {
  top: number
  label: string
}

export interface RoomModel {
  source: 'virtual' | 'xr' | 'fallback'
  floorY: number
  bounds: Bounds
  /** optional floor outline (x,z pairs) – cells outside are blocked */
  floorPolygon?: Array<[number, number]>
  walls: WallInfo[]
  obstacles: Obstacle[]
  /** extra blocked sample points (x,z) e.g. rasterized room mesh vertices */
  blockedPoints?: Float32Array
  signature: string
}

/** Horizontal unit vector along the wall (normal x up). */
export function wallRight(w: WallInfo, out = new Vector3()) {
  return out.set(w.normal.z, 0, -w.normal.x).normalize()
}

export const VIRTUAL_ROOM = {
  width: 7,
  depth: 6,
  height: 2.7,
  table: { x: 1.45, z: -0.85, w: 1.3, d: 0.8, top: 0.74 },
  sofa: { x: -1.95, z: 0.55, w: 0.9, d: 2.0, seat: 0.45, back: 0.82 },
  shelf: { x: -0.7, z: -2.75, w: 1.6, d: 0.45, top: 0.86 },
  plinth: { x: 2.55, z: 1.6, w: 0.5, d: 0.5, top: 0.55 },
}

export function createVirtualRoomModel(): RoomModel {
  const R = VIRTUAL_ROOM
  const hw = R.width / 2
  const hd = R.depth / 2
  const box = (x: number, z: number, w: number, d: number, top: number, label: string): Obstacle => ({
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    top,
    label,
  })
  return {
    source: 'virtual',
    floorY: 0,
    bounds: { minX: -hw, maxX: hw, minZ: -hd, maxZ: hd },
    walls: [
      { center: new Vector3(0.6, 1.3, -hd), normal: new Vector3(0, 0, 1), width: R.width, height: R.height, bottom: 0 },
      { center: new Vector3(-hw, 1.3, -0.9), normal: new Vector3(1, 0, 0), width: R.depth, height: R.height, bottom: 0 },
      { center: new Vector3(hw, 1.3, -0.3), normal: new Vector3(-1, 0, 0), width: R.depth, height: R.height, bottom: 0 },
    ],
    obstacles: [
      box(R.table.x, R.table.z, R.table.w, R.table.d, R.table.top, 'table'),
      box(R.sofa.x, R.sofa.z, R.sofa.w, R.sofa.d, R.sofa.back, 'couch'),
      box(R.shelf.x, R.shelf.z, R.shelf.w, R.shelf.d, R.shelf.top, 'storage'),
      box(R.plinth.x, R.plinth.z, R.plinth.w, R.plinth.d, R.plinth.top, 'other'),
    ],
    signature: 'virtual',
  }
}

/** Used in XR when the device does not report any planes. */
export function createFallbackRoomModel(center: Vector3, floorY: number): RoomModel {
  const size = 3.2
  return {
    source: 'fallback',
    floorY,
    bounds: { minX: center.x - size, maxX: center.x + size, minZ: center.z - size, maxZ: center.z + size },
    walls: [],
    obstacles: [],
    signature: 'fallback',
  }
}

export function pointInPolygon(x: number, z: number, poly: Array<[number, number]>) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi) inside = !inside
  }
  return inside
}
