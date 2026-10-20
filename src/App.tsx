import { Canvas } from '@react-three/fiber'
import { XR } from '@react-three/xr'
import { useEffect } from 'react'
import { ACESFilmicToneMapping } from 'three'
import { game } from './game/Game'
import { useUI } from './game/uiStore'
import { Scene } from './scene/Scene'
import { DesktopHud } from './ui/DesktopHud'
import { Landing } from './ui/Landing'
import { xrStore } from './xr/store'

export default function App() {
  useEffect(() => {
    const xr = navigator.xr
    if (!xr) {
      useUI.setState({ arSupported: false, vrSupported: false })
      return
    }
    xr.isSessionSupported('immersive-ar')
      .then((ok) => useUI.setState({ arSupported: ok }))
      .catch(() => useUI.setState({ arSupported: false }))
    xr.isSessionSupported('immersive-vr')
      .then((ok) => useUI.setState({ vrSupported: ok }))
      .catch(() => useUI.setState({ vrSupported: false }))
  }, [])

  useEffect(() => {
    let active: XRSession | undefined
    return xrStore.subscribe((state) => {
      if (state.session && state.session !== active) {
        active = state.session
        game.startXR(state.mode === 'immersive-ar')
      } else if (!state.session && active) {
        active = undefined
        game.exitXR()
      }
    })
  }, [])

  return (
    <>
      <Canvas
        shadows="percentage"
        dpr={[1, 1.75]}
        camera={{ position: [4, 2.6, 4], fov: 48, near: 0.02, far: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping }}
      >
        <XR store={xrStore}>
          <Scene />
        </XR>
      </Canvas>
      <DesktopHud />
      <Landing />
    </>
  )
}
