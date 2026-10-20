import { CircleGeometry, Color, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial, type Material } from 'three'
import { GLOW, PREMULTIPLIED, applyBlend } from './blending'
import { NOISE_GLSL } from './glsl'

const PORTAL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/*
 * Premultiplied output: rgb = void colour * coverage + emitted light, a = coverage.
 * Only the dark interior of the tear covers the real wall; the rim, filaments and
 * energy are pure light and never darken passthrough.
 */
const PORTAL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform float uPulse;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColEdge;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    // the quad is a little larger than the tear so filaments have room
    vec2 p = (vUv - 0.5) * 2.0 * 1.25;
    float r = length(p);
    float ang = atan(p.y, p.x);
    vec2 ca = vec2(cos(ang), sin(ang));
    float t = uTime;

    float edgeN = rd_fbm(vec3(ca * 1.6, t * 0.35));
    float radius = uOpen * (0.62 + 0.3 * edgeN) * (1.0 + uPulse * 0.08);

    float swirl = ang + 2.2 / (r + 0.18) - t * 1.4;
    vec2 q = vec2(cos(swirl), sin(swirl)) * r * 2.4;
    float n = rd_fbm(vec3(q, t * 0.45));
    float n2 = rd_fbm(vec3(q * 2.3 + n, t * 0.8 + 4.0));

    float rel = r / max(radius, 1e-3);
    float inside = 1.0 - smoothstep(0.9, 1.0, rel);

    vec3 energy = mix(uColA, uColB, smoothstep(0.25, 0.75, n2));
    energy *= 0.6 + 1.6 * pow(n, 2.0);
    float voidMask = smoothstep(0.7, 0.0, rel);

    // coverage: deep void in the middle, fading to translucent energy near the rim
    float cover = inside * (0.55 + 0.4 * voidMask);
    vec3 voidCol = vec3(0.02, 0.0, 0.05) + energy * 0.06 * n2;

    float rim = exp(-abs(rel - 1.0) * 14.0) * (0.8 + 1.4 * edgeN);
    float fil = rd_fbm(vec3(ang * 5.0, r * 7.0 - t * 2.6, t * 1.7));
    float crack = pow(1.0 - abs(fil * 2.0 - 1.0), 22.0);
    crack *= smoothstep(1.55, 1.0, rel) * step(0.97, rel) * uOpen;

    vec3 light = energy * inside * (1.0 - voidMask * 0.85) * (0.7 + rel * 1.2)
               + uColEdge * rim * 2.0
               + vec3(0.85, 0.9, 1.0) * crack * 2.6;
    // keep everything inside the quad so no edge of the plane is ever visible
    float frame = smoothstep(1.25, 1.1, max(abs(p.x), abs(p.y)));
    cover *= frame;
    light *= frame;
    if (cover < 0.003 && dot(light, vec3(1.0)) < 0.004) discard;
    gl_FragColor = vec4(voidCol * cover + light, cover);
  }
`

/** Soft additive light around the tear. Fades to exactly zero before the quad edge. */
const HALO_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform float uPulse;
  uniform vec3 uColB;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float g = smoothstep(1.0, 0.0, r);
    g = g * g * g;
    g *= uOpen * (0.6 + 0.2 * sin(uTime * 2.3) + uPulse * 0.6);
    if (g < 0.002) discard;
    gl_FragColor = vec4(uColB * g * 0.55, 0.0);
  }
`

const FLOOR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform float uPulse;
  uniform vec3 uColA;
  uniform vec3 uColB;
  varying vec2 vUv;
  void main() {
    float r = length((vUv - 0.5) * 2.0);
    float g = pow(max(0.0, 1.0 - r), 2.4) * uOpen * (0.4 + 0.12 * sin(uTime * 3.1) + uPulse * 0.4);
    if (g < 0.002) discard;
    gl_FragColor = vec4(mix(uColB, uColA, r) * g * 0.5, 0.0);
  }
`

export interface RiftVisual {
  group: Group
  floorGlow: Mesh
  uniforms: {
    uTime: { value: number }
    uOpen: { value: number }
    uPulse: { value: number }
    uColA: { value: Color }
    uColB: { value: Color }
    uColEdge: { value: Color }
  }
}

/** Pull the wall-mounted effect towards the viewer in depth so the wall it hangs on never cuts it. */
function wallSafe<T extends Material>(m: T): T {
  m.polygonOffset = true
  m.polygonOffsetFactor = -2
  m.polygonOffsetUnits = -8
  return m
}

export function createRiftVisual(width: number, height: number): RiftVisual {
  const uniforms = {
    uTime: { value: Math.random() * 100 },
    uOpen: { value: 0 },
    uPulse: { value: 0 },
    uColA: { value: new Color('#5b16ff') },
    uColB: { value: new Color('#ff2fd0') },
    uColEdge: { value: new Color('#7fe8ff') },
  }
  const group = new Group()
  const portalMat = applyBlend(
    wallSafe(new ShaderMaterial({ uniforms, vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG, side: DoubleSide, toneMapped: false })),
    PREMULTIPLIED,
  )
  const portal = new Mesh(new PlaneGeometry(width * 1.25, height * 1.25), portalMat)
  portal.renderOrder = 5
  portal.position.z = 0.012
  const haloMat = applyBlend(wallSafe(new ShaderMaterial({ uniforms, vertexShader: PORTAL_VERT, fragmentShader: HALO_FRAG, toneMapped: false })), GLOW)
  const halo = new Mesh(new PlaneGeometry(width * 1.7, height * 1.45), haloMat)
  halo.renderOrder = 4
  group.add(halo, portal)

  // light spill on the floor below the rift
  const floorMat = applyBlend(wallSafe(new ShaderMaterial({ uniforms, vertexShader: PORTAL_VERT, fragmentShader: FLOOR_FRAG, toneMapped: false })), GLOW)
  const floorGlow = new Mesh(new CircleGeometry(1, 32), floorMat)
  floorGlow.rotation.x = -Math.PI / 2
  floorGlow.scale.set(width * 0.9, width * 0.6, 1)
  floorGlow.renderOrder = 3
  return { group, floorGlow, uniforms }
}

export function disposeRiftVisual(v: RiftVisual) {
  v.group.traverse((o) => {
    const m = o as Mesh
    if (m.isMesh) {
      m.geometry.dispose()
      ;(m.material as Material).dispose()
    }
  })
  v.floorGlow.geometry.dispose()
  ;(v.floorGlow.material as Material).dispose()
}
