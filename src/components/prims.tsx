// Примитивы сцены: материалы по «ролям» и коробки/цилиндры в координатах плана.
// План: см, X — вдоль окна, Y — вглубь комнаты, Z — высота.
// three.js: метры, X = x, Y = z (высота), Z = −y.
import { createContext, useContext, useMemo } from 'react';
import * as THREE from 'three';

export type Mode = 'color' | 'clay' | 'lines' | 'depth';
export type Colors = { walls: string; floor: string; ceiling: string; furniture: string; textile: string; wood: string };
export type Role =
  | keyof Colors
  | 'trim' | 'door' | 'frame' | 'glass' | 'radiator' | 'metal' | 'dark' | 'screen' | 'rug' | 'shade' | 'mirror';

// Подвесы под потолком: прячутся, когда камера выше потолка (сверху они закрывают мебель).
export const ceilingItems = new Set<THREE.Group>();
export const registerCeiling = (g: THREE.Group | null) => { if (g) ceilingItems.add(g); };

export const toThree = (x: number, y: number, z = 0): [number, number, number] => [x / 100, z / 100, -y / 100];

type Ctx = { mode: Mode; colors: Colors; shadows: boolean };
export const SceneCtx = createContext<Ctx>({
  mode: 'color',
  colors: { walls: '#ece8e1', floor: '#c49a6c', ceiling: '#f6f5f2', furniture: '#f2efe9', textile: '#8a9a8b', wood: '#b48a5a' },
  shadows: false,
});
export const useScene = () => useContext(SceneCtx);

const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

function roleColor(role: Role, c: Colors): string {
  switch (role) {
    case 'trim': return mix(c.walls, '#ffffff', 0.6);
    case 'door': return mix(c.furniture, '#ffffff', 0.3);
    case 'frame': return '#f4f4f2';
    case 'glass': return '#cfe3f0';
    case 'radiator': return '#f1f1ef';
    case 'metal': return '#9a9a98';
    case 'dark': return '#2a2a2c';
    case 'screen': return '#0f1012';
    case 'rug': return mix(c.textile, '#ffffff', 0.55);
    case 'shade': return '#f3eee4';
    case 'mirror': return '#c9d3d8';
    default: return c[role];
  }
}

// Глубина для ControlNet: белое — близко, чёрное — далеко, линейно по расстоянию до камеры.
export const depthMaterial = new THREE.ShaderMaterial({
  uniforms: { near: { value: 0.3 }, far: { value: 8 } },
  vertexShader: `varying float vDist;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float near; uniform float far; varying float vDist;
    void main() { float d = 1.0 - clamp((vDist - near) / (far - near), 0.0, 1.0); gl_FragColor = vec4(vec3(d), 1.0); }`,
  side: THREE.DoubleSide,
});
const lineFace = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide });
export const edgeMaterial = new THREE.LineBasicMaterial({ color: '#111111', toneMapped: false });
const CLAY = '#cfcfcd';

const cache = new Map<string, THREE.Material>();
export function materialFor(role: Role, mode: Mode, colors: Colors, side: THREE.Side = THREE.FrontSide): THREE.Material {
  if (mode === 'depth') return depthMaterial;
  if (mode === 'lines') return lineFace;
  const color = mode === 'clay' ? (role === 'glass' ? '#ffffff' : CLAY) : roleColor(role, colors);
  const key = `${mode}:${role}:${color}:${side}`;
  let m = cache.get(key);
  if (!m) {
    if (role === 'glass') m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false });
    else if (role === 'screen') m = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.2, side });
    else if (role === 'mirror') m = new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.15, side });
    else if (role === 'metal') m = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6, side });
    else if (role === 'ceiling') m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side, emissive: color, emissiveIntensity: 0.45 });
    else m = new THREE.MeshStandardMaterial({ color, roughness: role === 'frame' || role === 'radiator' ? 0.5 : 0.85, side });
    cache.set(key, m);
  }
  return m;
}

export function useMaterial(role: Role, side?: THREE.Side) {
  const { mode, colors } = useScene();
  return materialFor(role, mode, colors, side);
}

// Стекло видно только в цветном режиме: в остальных окно «открыто» и не мешает глубине/линиям.
const visibleIn = (role: Role, mode: Mode) => role !== 'glass' || mode === 'color';

type BoxProps = {
  x: number; y: number; z: number; // центр по плану и низ, см
  w: number; d: number; h: number; // по X, по Y плана, высота, см
  role: Role;
  rotY?: number; // поворот в радианах (three.js)
  cast?: boolean;
};

const boxGeoms = new Map<string, THREE.BoxGeometry>();
const edgeGeoms = new Map<THREE.BufferGeometry, THREE.EdgesGeometry>();
function boxGeom(w: number, h: number, d: number) {
  const key = `${w.toFixed(4)}|${h.toFixed(4)}|${d.toFixed(4)}`;
  let g = boxGeoms.get(key);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); boxGeoms.set(key, g); }
  return g;
}
export function edgesOf(g: THREE.BufferGeometry) {
  let e = edgeGeoms.get(g);
  if (!e) { e = new THREE.EdgesGeometry(g, 25); edgeGeoms.set(g, e); }
  return e;
}

export function PBox({ x, y, z, w, d, h, role, rotY = 0, cast = true }: BoxProps) {
  const { mode, shadows } = useScene();
  const mat = useMaterial(role);
  const geom = boxGeom(w / 100, h / 100, d / 100);
  const pos = toThree(x, y, z + h / 2);
  if (!visibleIn(role, mode)) return null;
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <mesh geometry={geom} material={mat} castShadow={shadows && cast && role !== 'glass'} receiveShadow={shadows && role !== 'glass'} />
      {mode === 'lines' && <lineSegments geometry={edgesOf(geom)} material={edgeMaterial} />}
    </group>
  );
}

const cylGeoms = new Map<string, THREE.CylinderGeometry>();
export function PCyl({ x, y, z, r, r2, h, role, seg = 20 }: { x: number; y: number; z: number; r: number; r2?: number; h: number; role: Role; seg?: number }) {
  const { mode, shadows } = useScene();
  const mat = useMaterial(role);
  const geom = useMemo(() => {
    const key = `${r}|${r2 ?? r}|${h}|${seg}`;
    let g = cylGeoms.get(key);
    if (!g) { g = new THREE.CylinderGeometry((r2 ?? r) / 100, r / 100, h / 100, seg); cylGeoms.set(key, g); }
    return g;
  }, [r, r2, h, seg]);
  return (
    <group position={toThree(x, y, z + h / 2)}>
      <mesh geometry={geom} material={mat} castShadow={shadows} receiveShadow={shadows} />
      {mode === 'lines' && <lineSegments geometry={edgesOf(geom)} material={edgeMaterial} />}
    </group>
  );
}
