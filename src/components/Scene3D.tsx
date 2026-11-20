// 3D-вид: Canvas, свет, камера с OrbitControls, «кукольный дом» (стены между камерой и комнатой
// прячутся) и снимки PNG фиксированного размера для нейросети.
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Room3D, type WallRef } from './Room3D';
import { Furniture3D } from './Furniture3D';
import { SceneCtx, depthMaterial, toThree, type Colors, type Mode } from './prims';
import { resolvePreset } from '../lib/cameras';
import type { CamPreset } from '../lib/presets';

export type CaptureApi = { capture: (preset: CamPreset | null, w: number, h: number) => Promise<Blob> };

type Walls = Map<number, WallRef>;

// Светильники под потолком прячем, когда камера выше потолка: сверху они закрывают мебель.
const ceilingItems = new Set<THREE.Group>();
let roomHeight = 250;
const registerCeiling = (g: THREE.Group | null) => { if (g) ceilingItems.add(g); };

function updateWalls(walls: Walls, pos: THREE.Vector3) {
  for (const g of ceilingItems) {
    if (!g.parent) { ceilingItems.delete(g); continue; }
    g.visible = pos.y * 100 < roomHeight;
  }
  const px = pos.x * 100, py = -pos.z * 100;
  for (const w of walls.values()) {
    const s = (px - w.a[0]) * w.inward[0] + (py - w.a[1]) * w.inward[1];
    w.group.visible = s > -5;
  }
}

// Дальность для карты глубины — до самого дальнего угла комнаты.
function updateDepthRange(layout: any, pos: THREE.Vector3) {
  let far = 1;
  for (const [x, y] of layout.room.outline) for (const z of [0, layout.room.height.value]) {
    far = Math.max(far, pos.distanceTo(new THREE.Vector3(...toThree(x, y, z))));
  }
  depthMaterial.uniforms.near.value = 0.3;
  depthMaterial.uniforms.far.value = far + 0.2;
}

function Rig({ layout, preset, walls }: { layout: any; preset: CamPreset; walls: Walls }) {
  const { camera, gl, invalidate, size } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  // Ракурс сбрасывается, только если сменился сам пресет (у «С дивана» он свой в каждом варианте).
  const presetKey = `${preset.id}|${preset.pos}|${preset.target}`;
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = false;
    c.screenSpacePanning = true;
    c.minDistance = 0.2;
    c.maxDistance = 16;
    c.rotateSpeed = 0.6;
    const onChange = () => invalidate();
    c.addEventListener('change', onChange);
    controls.current = c;
    return () => { c.removeEventListener('change', onChange); c.dispose(); };
  }, [camera, gl, invalidate]);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const r = resolvePreset(preset, layout, size.width / Math.max(1, size.height));
    cam.position.copy(r.pos);
    controls.current?.target.copy(r.target);
    controls.current?.update();
    cam.lookAt(r.target);
    invalidate();
    // size не в зависимостях: поворот телефона не должен сбрасывать ракурс, который покрутили руками.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey, layout, camera, invalidate]);
  // Угол обзора из пресета — вертикальный (как в снимках 3:2). На узком портретном экране
  // держим его по горизонтали, иначе комната в кадре превращается в замочную скважину.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height), f = preset.fov ?? 60;
    cam.fov = aspect < 1 ? Math.min(100, (2 * Math.atan(Math.tan((f * Math.PI) / 360) / aspect) * 180) / Math.PI) : f;
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, preset.fov, presetKey, invalidate]);
  useFrame(() => {
    updateWalls(walls, camera.position);
    updateDepthRange(layout, camera.position);
  });
  return null;
}

function Exporter({ layout, walls, apiRef }: { layout: any; walls: Walls; apiRef: MutableRefObject<CaptureApi | null> }) {
  const { gl, scene, camera, invalidate } = useThree();
  useEffect(() => {
    apiRef.current = {
      async capture(preset, w, h) {
        const cam = new THREE.PerspectiveCamera(60, w / h, 0.05, 100);
        if (preset) {
          const r = resolvePreset(preset, layout, w / h);
          cam.fov = r.fov;
          cam.position.copy(r.pos);
          cam.lookAt(r.target);
        } else {
          cam.fov = (camera as THREE.PerspectiveCamera).fov;
          cam.position.copy(camera.position);
          cam.quaternion.copy(camera.quaternion);
        }
        cam.updateProjectionMatrix();
        updateWalls(walls, cam.position);
        updateDepthRange(layout, cam.position);
        const prevRatio = gl.getPixelRatio();
        const prevSize = gl.getSize(new THREE.Vector2());
        gl.setPixelRatio(1);
        gl.setSize(w, h, false);
        gl.render(scene, cam);
        const url = gl.domElement.toDataURL('image/png');
        gl.setPixelRatio(prevRatio);
        gl.setSize(prevSize.x, prevSize.y, false);
        updateWalls(walls, camera.position);
        updateDepthRange(layout, camera.position);
        invalidate();
        return (await fetch(url)).blob();
      },
    };
    return () => { apiRef.current = null; };
  }, [gl, scene, camera, invalidate, layout, walls, apiRef]);
  return null;
}

const BG: Record<Mode, string> = { color: '#e9edf0', clay: '#ececea', lines: '#ffffff', depth: '#000000' };

function Lights({ layout, colors, shadows }: { layout: any; colors: Colors; shadows: boolean }) {
  const room = layout.room;
  const xs = room.outline.map((p: number[]) => p[0]), ys = room.outline.map((p: number[]) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  // Снизу комнату подсвечивает пол, но разбавленный белым: иначе потолок и стены «ржавеют».
  const ground = '#' + new THREE.Color(colors.floor).lerp(new THREE.Color('#ffffff'), 0.65).getHexString();
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(...toThree(cx, cy, 0));
    return o;
  }, [cx, cy]);
  // Солнце со стороны окна: от внутренней грани наружу и вверх, под ~30°.
  const win = room.openings.find((o: any) => o.type === 'window');
  let sun: [number, number, number] = toThree(cx, cy - 600, 350);
  if (win) {
    const pts = room.outline, n = pts.length;
    const a = pts[win.wall - 1], b = pts[win.wall % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const inward = [dir[1], -dir[0]];
    const mx = a[0] + dir[0] * (win.offset + win.width / 2), my = a[1] + dir[1] * (win.offset + win.width / 2);
    sun = toThree(mx - inward[0] * 600, my - inward[1] * 600, 360);
  }
  return (
    <>
      <primitive object={target} />
      <hemisphereLight args={['#f5f8fb', ground, 1.5]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        position={sun}
        target={target}
        intensity={2.6}
        color="#fff6e8"
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
      />
    </>
  );
}

export function Scene3D(props: {
  layout: any; variantId: string; preset: CamPreset; mode: Mode; colors: Colors; shadows: boolean;
  apiRef: MutableRefObject<CaptureApi | null>;
}) {
  const { layout, variantId, preset, mode, colors, shadows, apiRef } = props;
  const walls = useRef<Walls>(new Map()).current;
  roomHeight = layout.room.height.value;
  const register = (id: number, ref: WallRef | null) => { if (ref) walls.set(id, ref); else walls.delete(id); };
  const ctx = useMemo(() => ({ mode, colors, shadows }), [mode, colors, shadows]);
  return (
    <Canvas
      key={shadows ? 'sh' : 'nosh'}
      frameloop="demand"
      dpr={[1, 2]}
      shadows={shadows ? 'soft' : false}
      camera={{ fov: 60, near: 0.05, far: 100, position: [0, 1.5, 0] }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.NeutralToneMapping; gl.toneMappingExposure = 1; }}
    >
      <color attach="background" args={[BG[mode]]} />
      <SceneCtx.Provider value={ctx}>
        <Lights layout={layout} colors={colors} shadows={shadows} />
        <Room3D layout={layout} register={register} registerCeiling={registerCeiling} />
        <Furniture3D layout={layout} variantId={variantId} />
      </SceneCtx.Provider>
      <Rig layout={layout} preset={preset} walls={walls} />
      <Exporter layout={layout} walls={walls} apiRef={apiRef} />
    </Canvas>
  );
}
