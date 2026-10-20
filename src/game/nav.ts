import type { Bounds, RoomModel } from './room'
import { pointInPolygon } from './room'

const FREE = 0
const STATIC = 1
const TOWER = 2
const SQRT2 = Math.SQRT2
const NEIGHBORS: Array<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
]

/** Min-heap keyed by float priority, storing cell indices. */
class Heap {
  private idx: Int32Array
  private pri: Float32Array
  size = 0
  constructor(capacity: number) {
    this.idx = new Int32Array(capacity)
    this.pri = new Float32Array(capacity)
  }
  reset(capacity: number) {
    if (this.idx.length < capacity) {
      this.idx = new Int32Array(capacity)
      this.pri = new Float32Array(capacity)
    }
    this.size = 0
  }
  push(i: number, p: number) {
    if (this.size >= this.idx.length) return
    let n = this.size++
    while (n > 0) {
      const parent = (n - 1) >> 1
      if (this.pri[parent] <= p) break
      this.idx[n] = this.idx[parent]
      this.pri[n] = this.pri[parent]
      n = parent
    }
    this.idx[n] = i
    this.pri[n] = p
  }
  pop(): number {
    const top = this.idx[0]
    const lastI = this.idx[--this.size]
    const lastP = this.pri[this.size]
    let n = 0
    for (;;) {
      let c = n * 2 + 1
      if (c >= this.size) break
      if (c + 1 < this.size && this.pri[c + 1] < this.pri[c]) c++
      if (this.pri[c] >= lastP) break
      this.idx[n] = this.idx[c]
      this.pri[n] = this.pri[c]
      n = c
    }
    this.idx[n] = lastI
    this.pri[n] = lastP
    return top
  }
}

/**
 * Floor navigation grid with a Dijkstra flow field towards the core.
 * Every walking creature simply descends the distance field.
 */
export class NavGrid {
  cell = 0.15
  minX = -3
  minZ = -3
  cols = 1
  rows = 1
  blocked = new Uint8Array(1)
  dist = new Float32Array(1)
  private heap = new Heap(16)
  private goalX = 0
  private goalZ = 0
  private goalRadius = 0.3

  configure(bounds: Bounds, cell: number) {
    this.cell = cell
    this.minX = bounds.minX
    this.minZ = bounds.minZ
    this.cols = Math.max(2, Math.ceil((bounds.maxX - bounds.minX) / cell))
    this.rows = Math.max(2, Math.ceil((bounds.maxZ - bounds.minZ) / cell))
    const n = this.cols * this.rows
    this.blocked = new Uint8Array(n)
    this.dist = new Float32Array(n).fill(Infinity)
    this.heap.reset(n * 8)
  }

  buildFromRoom(room: RoomModel, cell: number, inflate = 0.08) {
    const b = room.bounds
    this.configure({ minX: b.minX - cell, maxX: b.maxX + cell, minZ: b.minZ - cell, maxZ: b.maxZ + cell }, cell)
    const poly = room.floorPolygon && room.floorPolygon.length >= 3 ? room.floorPolygon : undefined
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const x = this.minX + (cx + 0.5) * cell
        const z = this.minZ + (cz + 0.5) * cell
        let blocked = x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ
        if (!blocked && poly && !pointInPolygon(x, z, poly)) blocked = true
        if (!blocked) {
          for (const o of room.obstacles) {
            if (o.top - room.floorY < 0.12) continue
            if (x > o.minX - inflate && x < o.maxX + inflate && z > o.minZ - inflate && z < o.maxZ + inflate) {
              blocked = true
              break
            }
          }
        }
        this.blocked[cz * this.cols + cx] = blocked ? STATIC : FREE
      }
    }
    if (room.blockedPoints) {
      const pts = room.blockedPoints
      const marks = new Uint8Array(this.blocked.length)
      for (let i = 0; i < pts.length; i += 2) {
        const c = this.cellIndex(pts[i], pts[i + 1])
        if (c >= 0) marks[c] = 1
      }
      let count = 0
      for (let i = 0; i < marks.length; i++) count += marks[i]
      // a room mesh that would block most of the floor is more likely noise than furniture
      if (count < marks.length * 0.45) {
        for (let i = 0; i < marks.length; i++) if (marks[i] && this.blocked[i] === FREE) this.blocked[i] = STATIC
      }
    }
  }

  cellIndex(x: number, z: number) {
    const cx = Math.floor((x - this.minX) / this.cell)
    const cz = Math.floor((z - this.minZ) / this.cell)
    if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return -1
    return cz * this.cols + cx
  }

  cellCenter(i: number, out: { x: number; z: number }) {
    const cx = i % this.cols
    const cz = (i - cx) / this.cols
    out.x = this.minX + (cx + 0.5) * this.cell
    out.z = this.minZ + (cz + 0.5) * this.cell
    return out
  }

  isFree(x: number, z: number) {
    const i = this.cellIndex(x, z)
    return i >= 0 && this.blocked[i] === FREE
  }

  isStaticBlocked(x: number, z: number) {
    const i = this.cellIndex(x, z)
    return i < 0 || this.blocked[i] === STATIC
  }

  /** Marks tower cells. Returns the list of cells that were changed. */
  markTower(x: number, z: number, r: number): number[] {
    const changed: number[] = []
    const c = this.cell
    for (let dz = -r; dz <= r + 1e-6; dz += c) {
      for (let dx = -r; dx <= r + 1e-6; dx += c) {
        if (dx * dx + dz * dz > r * r + c * c * 0.25) continue
        const i = this.cellIndex(x + dx, z + dz)
        if (i >= 0 && this.blocked[i] === FREE) {
          this.blocked[i] = TOWER
          changed.push(i)
        }
      }
    }
    return changed
  }

  unmark(cells: number[]) {
    for (const i of cells) if (this.blocked[i] === TOWER) this.blocked[i] = FREE
  }

  nearestFree(x: number, z: number, out: { x: number; z: number }) {
    const start = this.cellIndex(x, z)
    if (start >= 0 && this.blocked[start] === FREE) return this.cellCenter(start, out)
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < this.blocked.length; i++) {
      if (this.blocked[i] !== FREE) continue
      const cx = i % this.cols
      const cz = (i - cx) / this.cols
      const px = this.minX + (cx + 0.5) * this.cell
      const pz = this.minZ + (cz + 0.5) * this.cell
      const d = (px - x) ** 2 + (pz - z) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best < 0) {
      out.x = x
      out.z = z
      return out
    }
    return this.cellCenter(best, out)
  }

  /** Dijkstra from every free cell within goalRadius of the goal. */
  computeFlow(goalX: number, goalZ: number, goalRadius: number) {
    this.goalX = goalX
    this.goalZ = goalZ
    this.goalRadius = goalRadius
    const { cols, rows, blocked, dist, heap } = this
    dist.fill(Infinity)
    heap.reset(cols * rows * 8)
    const tmp = { x: 0, z: 0 }
    let seeded = 0
    for (let r = goalRadius; seeded === 0 && r < goalRadius + 1.5; r += this.cell) {
      for (let i = 0; i < blocked.length; i++) {
        if (blocked[i] !== FREE) continue
        this.cellCenter(i, tmp)
        const d = Math.hypot(tmp.x - goalX, tmp.z - goalZ)
        if (d <= r) {
          dist[i] = 0
          heap.push(i, 0)
          seeded++
        }
      }
    }
    while (heap.size > 0) {
      const i = heap.pop()
      const d = dist[i]
      const cx = i % cols
      const cz = (i - cx) / cols
      for (const [ox, oz, cost] of NEIGHBORS) {
        const nx = cx + ox
        const nz = cz + oz
        if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue
        const ni = nz * cols + nx
        if (blocked[ni] !== FREE) continue
        // no corner cutting
        if (ox !== 0 && oz !== 0) {
          if (blocked[cz * cols + nx] !== FREE || blocked[nz * cols + cx] !== FREE) continue
        }
        const nd = d + cost
        if (nd < dist[ni]) {
          dist[ni] = nd
          heap.push(ni, nd)
        }
      }
    }
  }

  distAt(x: number, z: number) {
    const i = this.cellIndex(x, z)
    return i < 0 ? Infinity : this.dist[i]
  }

  /**
   * Writes a steering target for a walker at (x,z). Returns false when the walker
   * should head straight for the goal (reached the goal area or no path exists).
   */
  steer(x: number, z: number, out: { x: number; z: number }): boolean {
    let i = this.cellIndex(x, z)
    if (i < 0) return false
    if (this.dist[i] === 0) return false
    const { cols, rows, dist } = this
    // two steps of descent for smoother corners
    let steps = 0
    let moved = false
    while (steps < 2) {
      const cx = i % cols
      const cz = (i - cx) / cols
      let best = -1
      let bestD = dist[i]
      for (const [ox, oz] of NEIGHBORS) {
        const nx = cx + ox
        const nz = cz + oz
        if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue
        const ni = nz * cols + nx
        if (dist[ni] < bestD) {
          bestD = dist[ni]
          best = ni
        }
      }
      if (best < 0) break
      i = best
      moved = true
      steps++
      if (dist[i] === 0) break
    }
    if (!moved) return false
    this.cellCenter(i, out)
    return true
  }

  goal() {
    return { x: this.goalX, z: this.goalZ, r: this.goalRadius }
  }
}
