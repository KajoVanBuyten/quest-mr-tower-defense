import { Environment, Lightformer } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { DirectionalLight } from 'three'
import { game } from '../game/Game'

/**
 * Procedural studio environment (rendered once into a small cube map, nothing is downloaded)
 * plus a single shadow-casting key light that follows the play area.
 */
export function Lighting({ xr }: { xr: boolean }) {
  const key = useRef<DirectionalLight>(null)

  useEffect(() => {
    const l = key.current
    if (!l) return
    l.shadow.mapSize.set(xr ? 1024 : 2048, xr ? 1024 : 2048)
    l.shadow.camera.left = -4
    l.shadow.camera.right = 4
    l.shadow.camera.top = 4
    l.shadow.camera.bottom = -4
    l.shadow.camera.near = 0.5
    l.shadow.camera.far = 14
    l.shadow.bias = -0.0004
    l.shadow.normalBias = 0.02
    l.shadow.camera.updateProjectionMatrix()
    l.shadow.map?.dispose()
    l.shadow.map = null
  }, [xr])

  useFrame(() => {
    const l = key.current
    if (!l) return
    const c = game.corePlaced ? game.toWorld(game.corePos) : null
    const cx = c ? c.x : 0
    const cz = c ? c.z : 0
    const fy = game.room.floorY
    // near-vertical light so shadows land right under creatures on the real floor
    l.position.set(cx + 1.2, fy + 6, cz + 1.6)
    l.target.position.set(cx, fy, cz)
    l.target.updateMatrixWorld()
  })

  return (
    <>
      <Environment resolution={64} frames={1} background={false}>
        <Lightformer form="rect" intensity={2.2} color="#9fb8ff" position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#ff5ad8" position={[-6, 1.5, 0]} rotation={[0, Math.PI / 2, 0]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#36d8ff" position={[6, 1.5, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 2, 1]} />
        <Lightformer form="ring" intensity={1.2} color="#ffffff" position={[0, 2, -6]} scale={3} />
        <Lightformer form="rect" intensity={0.4} color="#202840" position={[0, -3, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[10, 10, 1]} />
      </Environment>
      <hemisphereLight args={['#b8c8ff', '#1a1020', xr ? 0.9 : 0.6]} />
      <directionalLight ref={key} castShadow intensity={xr ? 1.6 : 1.4} color="#f2f4ff" />
      {!xr && <pointLight position={[0, 1.6, -2.2]} intensity={2.5} distance={5} decay={2} color="#b46bff" />}
    </>
  )
}
