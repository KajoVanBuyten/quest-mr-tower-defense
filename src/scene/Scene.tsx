import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useXR } from '@react-three/xr'
import { useEffect } from 'react'
import { game } from '../game/Game'
import { useUI } from '../game/uiStore'
import { XRInput } from '../xr/XRInput'
import { XRRoom } from '../xr/XRRoom'
import { DesktopInput } from './DesktopInput'
import { Lighting } from './Lighting'
import { PlacementPreview } from './PlacementPreview'
import { VirtualRoom } from './VirtualRoom'
import { WorldHud } from './WorldHud'

function GameLoop() {
  useFrame((state, dt) => {
    game.update(dt, state.camera)
  })
  return null
}

/** Slow camera drift behind the landing page. */
function MenuCamera() {
  const phase = useUI((s) => s.phase)
  const camera = useThree((s) => s.camera)
  useFrame((state) => {
    if (phase !== 'menu') return
    const t = state.clock.elapsedTime * 0.08
    camera.position.set(Math.sin(t) * 4.4, 2.6, Math.cos(t) * 4.4)
    camera.lookAt(0, 0.6, 0)
  })
  useEffect(() => {
    if (phase === 'placeCore') {
      camera.position.set(0, 3.3, 4.6)
      camera.lookAt(0, 0.3, 0)
    }
  }, [phase, camera])
  return null
}

function DesktopEffects() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.75} luminanceSmoothing={0.2} radius={0.7} />
      <Vignette offset={0.25} darkness={0.65} />
    </EffectComposer>
  )
}

export function Scene() {
  const session = useXR((s) => s.session)
  const mode = useXR((s) => s.mode)
  const phase = useUI((s) => s.phase)
  const inXR = session != null
  const isAR = inXR && mode === 'immersive-ar'

  return (
    <>
      {!isAR && <color attach="background" args={['#05060d']} />}
      {!isAR && <fog attach="fog" args={['#05060d', 8, 18]} />}
      <Lighting xr={isAR} />
      {!isAR && <VirtualRoom />}
      {isAR && <XRRoom />}
      <primitive object={game.root} />
      <GameLoop />
      <WorldHud />
      <PlacementPreview />
      {inXR ? (
        <XRInput />
      ) : (
        <>
          <MenuCamera />
          {phase !== 'menu' && (
            <OrbitControls makeDefault target={[0, 0.3, 0]} maxPolarAngle={Math.PI * 0.47} minDistance={1.2} maxDistance={8.5} enableDamping dampingFactor={0.08} />
          )}
          {phase !== 'menu' && <DesktopInput />}
          <DesktopEffects />
        </>
      )}
    </>
  )
}
