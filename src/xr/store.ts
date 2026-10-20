import { createXRStore } from '@react-three/xr'
import { RiftController, RiftHand } from './XRControllers'

// Controller layouts are served locally so no profile or model is fetched from a CDN at runtime.
const localProfiles = new URL('./xr-profiles/', window.location.href).href

export const xrStore = createXRStore({
  emulate: false,
  offerSession: false,
  enterGrantedSession: false,
  // Quest 3: 90 Hz if available, otherwise the closest lower rate
  frameRate: (rates) => {
    const list = Array.from(rates)
    if (list.length === 0) return false
    const below = list.filter((r) => r <= 90)
    return below.length ? Math.max(...below) : Math.min(...list)
  },
  foveation: 0.8,
  // every feature is optional – the game degrades gracefully when one is missing
  hitTest: true,
  planeDetection: true,
  meshDetection: true,
  anchors: true,
  handTracking: true,
  depthSensing: true,
  layers: true,
  domOverlay: false,
  baseAssetPath: localProfiles,
  defaultControllerProfileId: 'generic-trigger-squeeze-thumbstick',
  controller: RiftController,
  hand: RiftHand,
  gaze: false,
  screenInput: false,
})
