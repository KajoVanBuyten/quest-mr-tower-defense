import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import { NOISE_GLSL } from './glsl'

const PORTAL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

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
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float ang = atan(p.y, p.x);
    vec2 ca = vec2(cos(ang), sin(ang));
    float t = uTime;

    // ragged, breathing tear outline
    float edgeN = rd_fbm(vec3(ca * 1.6, t * 0.35));
    float radius = uOpen * (0.62 + 0.3 * edgeN) * (1.0 + uPulse * 0.08);

    // swirl domain warp – reads as space being dragged into the rift
    float swirl = ang + 2.2 / (r + 0.18) - t * 1.4;
    vec2 q = vec2(cos(swirl), sin(swirl)) * r * 2.4;
    float n = rd_fbm(vec3(q, t * 0.45));
    float n2 = rd_fbm(vec3(q * 2.3 + n, t * 0.8 + 4.0));

    float rel = r / max(radius, 1e-3);
    float inside = 1.0 - smoothstep(0.92, 1.0, rel);

    vec3 energy = mix(uColA, uColB, smoothstep(0.25, 0.75, n2));
    energy *= 0.6 + 1.6 * pow(n, 2.0);
    float voidMask = smoothstep(0.65, 0.0, rel);
    vec3 interior = mix(energy * (0.7 + rel * 1.4), vec3(0.012, 0.0, 0.03) + energy * 0.08 * n2, voidMask * 0.92);

    float rim = exp(-abs(rel - 1.0) * 14.0) * (0.8 + 1.4 * edgeN);

    // crackling filaments just outside the tear
    float fil = rd_fbm(vec3(ang * 5.0, r * 7.0 - t * 2.6, t * 1.7));
    float crack = pow(1.0 - abs(fil * 2.0 - 1.0), 22.0);
    crack *= smoothstep(1.55, 1.0, rel) * step(0.97, rel) * uOpen;

    vec3 col = interior * inside + uColEdge * rim * 2.2 + vec3(0.85, 0.9, 1.0) * crack * 3.0;
    float alpha = clamp(inside * (0.85 + 0.15 * voidMask) + rim * 0.9 + crack, 0.0, 1.0);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`

const HALO_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform float uPulse;
  uniform vec3 uColB;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float g = exp(-r * 3.2) - exp(-3.2);
    g *= uOpen * (0.75 + 0.25 * sin(uTime * 2.3) + uPulse * 0.6);
    gl_FragColor = vec4(uColB * max(g, 0.0) * 0.9, 1.0);
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
  const portal = new Mesh(
    new PlaneGeometry(width, height, 1, 1),
    new ShaderMaterial({
      uniforms,
      vertexShader: PORTAL_VERT,
      fragmentShader: PORTAL_FRAG,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: NormalBlending,
      toneMapped: false,
    }),
  )
  portal.renderOrder = 5
  portal.position.z = 0.03
  const halo = new Mesh(
    new PlaneGeometry(width * 2.4, height * 1.9),
    new ShaderMaterial({
      uniforms,
      vertexShader: PORTAL_VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    }),
  )
  halo.position.z = 0.02
  halo.renderOrder = 4
  group.add(halo, portal)

  // light spill on the floor below the rift
  const floorGlow = new Mesh(
    new CircleGeometry(1, 32),
    new ShaderMaterial({
      uniforms,
      vertexShader: PORTAL_VERT,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpen;
        uniform float uPulse;
        uniform vec3 uColA;
        uniform vec3 uColB;
        varying vec2 vUv;
        void main() {
          float r = length((vUv - 0.5) * 2.0);
          float g = pow(max(0.0, 1.0 - r), 2.2) * uOpen * (0.55 + 0.15 * sin(uTime * 3.1) + uPulse * 0.5);
          gl_FragColor = vec4(mix(uColB, uColA, r) * g * 0.7, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    }),
  )
  floorGlow.rotation.x = -Math.PI / 2
  floorGlow.scale.set(width * 1.1, width * 0.8, 1)
  floorGlow.renderOrder = 3
  return { group, floorGlow, uniforms }
}
