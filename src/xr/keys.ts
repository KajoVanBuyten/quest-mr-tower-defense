const ids = new WeakMap<object, number>()
let counter = 0

/** Stable React key for objects handed out by the XR runtime (planes, meshes). */
export function keyOf(o: object) {
  let id = ids.get(o)
  if (id === undefined) {
    id = ++counter
    ids.set(o, id)
  }
  return id
}
