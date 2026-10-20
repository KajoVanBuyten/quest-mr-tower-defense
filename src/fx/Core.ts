import {
  Color,
  CylinderGeometry,
  FrontSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  TetrahedronGeometry,
  TorusGeometry,
  Vector3,
  Vector4,
} from 'three'
import { GLOW } from './blending'
import { NOISE_GLSL } from './glsl'

const MAX_RIPPLES = 4
const _v = new Vector3()

/** The core crystal the player defends, with an energy shield that ripples on impact. */
export class CoreVisual {
  readonly group = new Group()
  private crystal: Mesh
  private crystalMat: MeshStandardMaterial
  private shards: Mesh[] = []
  private shield: Mesh
  private shieldMat: ShaderMaterial
  private ring: Mesh
  private ripples: Vector4[] = []
  private rippleCursor = 0
  private time = 0
  private spawnT = 0
  private healthy = new Color('#3ff6ff')
  private hurt = new Color('#ff3355')
  readonly shieldRadius = 0.3

  constructor() {
    const baseMat = new MeshStandardMaterial({ color: '#141826', metalness: 0.85, roughness: 0.32 })
    const base = new Mesh(new CylinderGeometry(0.13, 0.16, 0.05, 6), baseMat)
    base.position.y = 0.025
    base.castShadow = true
    base.receiveShadow = true
    const trimMat = new MeshStandardMaterial({ color: '#0b2030', emissive: '#29e7ff', emissiveIntensity: 2.2 })
    const trim = new Mesh(new TorusGeometry(0.135, 0.006, 6, 6), trimMat)
    trim.rotation.x = Math.PI / 2
    trim.position.y = 0.05
    this.crystalMat = new MeshStandardMaterial({
      color: '#a8fbff',
      emissive: '#22d8ff',
      emissiveIntensity: 1.6,
      metalness: 0.1,
      roughness: 0.08,
      transparent: true,
      opacity: 0.92,
      flatShading: true,
    })
    this.crystal = new Mesh(new OctahedronGeometry(0.075, 0), this.crystalMat)
    this.crystal.scale.set(1, 1.9, 1)
    this.crystal.position.y = 0.2
    this.crystal.castShadow = true
    const inner = new Mesh(
      new IcosahedronGeometry(0.035, 1),
      new MeshStandardMaterial({ color: '#ffffff', emissive: '#bff8ff', emissiveIntensity: 4, toneMapped: false }),
    )
    this.crystal.add(inner)
    for (let i = 0; i < 3; i++) {
      const s = new Mesh(new TetrahedronGeometry(0.022), this.crystalMat)
      s.castShadow = true
      this.shards.push(s)
      this.group.add(s)
    }
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push(new Vector4(0, 1, 0, -10))
    this.shieldMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHp: { value: 1 },
        uRipples: { value: this.ripples },
        uColor: { value: new Color('#36e8ff') },
        uSpawn: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocal;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vLocal = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uHp;
        uniform float uSpawn;
        uniform vec4 uRipples[${MAX_RIPPLES}];
        uniform vec3 uColor;
        varying vec3 vLocal;
        varying vec3 vN;
        varying vec3 vV;
        ${NOISE_GLSL}
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
          // hexagonal-ish cell pattern from quantized noise
          vec3 p = vLocal * 9.0;
          float cells = rd_noise(floor(p * 1.5) + floor(uTime * 0.5));
          float grid = smoothstep(0.42, 0.5, abs(fract(p.x * 1.5 + p.y * 0.866) - 0.5))
                     + smoothstep(0.42, 0.5, abs(fract(p.z * 1.5 - p.y * 0.866) - 0.5));
          float ripple = 0.0;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 r = uRipples[i];
            float age = uTime - r.w;
            if (age < 0.0 || age > 1.6) continue;
            float d = acos(clamp(dot(vLocal, normalize(r.xyz)), -1.0, 1.0));
            float front = age * 2.6;
            ripple += exp(-pow((d - front) * 7.0, 2.0)) * (1.0 - age / 1.6) * 2.2;
            ripple += exp(-d * 6.0) * max(0.0, 0.4 - age) * 5.0;
          }
          float hp = uHp;
          vec3 col = mix(vec3(1.0, 0.2, 0.3), uColor, hp);
          float a = fres * (0.35 + 0.35 * hp) + grid * 0.06 * (0.5 + cells) + ripple;
          a *= uSpawn;
          gl_FragColor = vec4(col * a, 0.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      ...GLOW,
      side: FrontSide,
      toneMapped: false,
    })
    this.shield = new Mesh(new SphereGeometry(this.shieldRadius, 40, 24), this.shieldMat)
    this.shield.position.y = 0.17
    this.shield.renderOrder = 8
    this.ring = new Mesh(
      new RingGeometry(0.2, 0.235, 48),
      new ShaderMaterial({
        uniforms: { uTime: this.shieldMat.uniforms.uTime, uHp: this.shieldMat.uniforms.uHp },
        vertexShader: /* glsl */ `
          varying vec2 vP;
          void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uHp;
          varying vec2 vP;
          void main() {
            float a = atan(vP.y, vP.x) / 6.2831853 + 0.5;
            float filled = step(a, uHp);
            vec3 c = mix(vec3(1.0, 0.25, 0.3), vec3(0.2, 0.95, 1.0), uHp);
            float seg = step(0.15, fract(a * 40.0));
            gl_FragColor = vec4(c * (filled * 1.2 + 0.08) * seg, 0.0);
          }
        `,
        transparent: true,
        depthWrite: false,
        ...GLOW,
        toneMapped: false,
      }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.006
    this.group.add(base, trim, this.crystal, this.shield, this.ring)
    this.group.visible = false
  }

  show() {
    this.group.visible = true
    this.spawnT = 0
  }

  hide() {
    this.group.visible = false
  }

  /** dirWorld: direction from core centre towards the impact */
  hit(fromLocal: Vector3) {
    _v.copy(fromLocal).sub(this.group.position)
    _v.y -= this.shield.position.y
    if (_v.lengthSq() < 1e-6) _v.set(0, 1, 0)
    _v.normalize()
    const r = this.ripples[this.rippleCursor]
    r.set(_v.x, _v.y, _v.z, this.time)
    this.rippleCursor = (this.rippleCursor + 1) % MAX_RIPPLES
  }

  update(dt: number, hpFrac: number) {
    this.time += dt
    this.spawnT = Math.min(1, this.spawnT + dt * 0.8)
    const u = this.shieldMat.uniforms
    u.uTime.value = this.time
    u.uHp.value += (hpFrac - u.uHp.value) * Math.min(1, dt * 4)
    u.uSpawn.value = this.spawnT
    const s = 0.3 + 0.7 * this.spawnT
    this.crystal.position.y = 0.2 + Math.sin(this.time * 1.4) * 0.012
    this.crystal.rotation.y += dt * 0.6
    this.crystal.scale.set(s, 1.9 * s, s)
    this.crystalMat.emissive.copy(this.hurt).lerp(this.healthy, hpFrac)
    this.crystalMat.emissiveIntensity = 1.3 + Math.sin(this.time * 3) * 0.3 + (1 - hpFrac) * Math.max(0, Math.sin(this.time * 9)) * 1.2
    this.shards.forEach((m, i) => {
      const a = this.time * 0.9 + (i * Math.PI * 2) / 3
      m.position.set(Math.cos(a) * 0.12, 0.2 + Math.sin(this.time * 2 + i) * 0.03, Math.sin(a) * 0.12)
      m.rotation.set(this.time * 1.3 + i, this.time * 0.7, 0)
    })
  }
}
