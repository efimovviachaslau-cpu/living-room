// Комната: пол, потолок, стены с проёмами, окно, двери, плинтус, батарея.
// Всё строится из layout.room, ни одного размера в коде (кроме мелких деталей вроде профиля рамы).
import { useMemo } from 'react';
import * as THREE from 'three';
import * as G from '../lib/geometry.js';
import { PBox, PCyl, useMaterial, useScene, type Role } from './prims';

type Vec = [number, number];
type Wall = { id: number; a: Vec; b: Vec; dir: Vec; inward: Vec; length: number };
export type WallRef = { group: THREE.Group; a: Vec; inward: Vec };

// Коробка в координатах стены: u — вдоль стены от её начала, v — от внутренней грани в комнату (+) / в стену (−).
function WallBox({ W, u0, u1, v0, v1, z0, z1, role, cast }: { W: Wall; u0: number; u1: number; v0: number; v1: number; z0: number; z1: number; role: Role; cast?: boolean }) {
  if (u1 - u0 <= 0.01 || z1 - z0 <= 0.01 || v1 - v0 <= 0.01) return null;
  const c = G.add(G.add(W.a, G.mul(W.dir, (u0 + u1) / 2)), G.mul(W.inward, (v0 + v1) / 2));
  const rotY = Math.atan2(W.dir[1], W.dir[0]);
  return <PBox x={c[0]} y={c[1]} z={z0} w={u1 - u0} d={v1 - v0} h={z1 - z0} role={role} rotY={rotY} cast={cast} />;
}

function Window({ W, t, o }: { W: Wall; t: number; o: any }) {
  const top = o.sill + o.height, f = 6, depth = 7;
  const vc = -t * 0.45; // рама ближе к улице
  const v0 = vc - depth / 2, v1 = vc + depth / 2;
  const u0 = o.offset, u1 = o.offset + o.width;
  const n = o.sashes ?? 2;
  const parts = [
    { u0, u1: u0 + f, z0: o.sill, z1: top },
    { u0: u1 - f, u1, z0: o.sill, z1: top },
    { u0, u1, z0: top - f, z1: top },
    { u0, u1, z0: o.sill, z1: o.sill + f },
    ...Array.from({ length: n - 1 }, (_, k) => {
      const um = u0 + ((k + 1) * o.width) / n;
      return { u0: um - 3.5, u1: um + 3.5, z0: o.sill, z1: top };
    }),
  ];
  return (
    <>
      {parts.map((p, i) => <WallBox key={i} W={W} {...p} v0={v0} v1={v1} role="frame" />)}
      <WallBox W={W} u0={u0 + f} u1={u1 - f} v0={vc - 0.3} v1={vc + 0.3} z0={o.sill + f} z1={top - f} role="glass" cast={false} />
      {/* подоконник */}
      {/* вынос в комнату: sillOverhang или до sillDepth от рамы (не меньше 5 см) */}
      <WallBox W={W} u0={u0 - (o.sillOverhang === 0 ? 0 : 5)} u1={u1 + (o.sillOverhang === 0 ? 0 : 5)} v0={v0} v1={o.sillOverhang ?? Math.max(5, (o.sillDepth ?? 25) + vc)} z0={o.sill - 4} z1={o.sill} role="frame" />
    </>
  );
}

function Door({ W, t, o }: { W: Wall; t: number; o: any }) {
  const u0 = o.offset, u1 = o.offset + o.width, h = o.height, c = 7;
  const handleU = o.swing?.hinge === 'end' ? u0 + 10 : u1 - 10;
  return (
    <>
      {/* коробка */}
      <WallBox W={W} u0={u0} u1={u0 + 3} v0={-t} v1={0} z0={0} z1={h} role="door" />
      <WallBox W={W} u0={u1 - 3} u1={u1} v0={-t} v1={0} z0={0} z1={h} role="door" />
      <WallBox W={W} u0={u0} u1={u1} v0={-t} v1={0} z0={h - 3} z1={h} role="door" />
      {/* полотно (закрыто); leaf: 0 — проём без двери */}
      {o.leaf !== 0 && <WallBox W={W} u0={u0 + 3} u1={u1 - 3} v0={-t / 2 - 2} v1={-t / 2 + 2} z0={1} z1={h - 3} role="door" />}
      {/* наличники со стороны зала */}
      <WallBox W={W} u0={u0 - c} u1={u0} v0={0} v1={1.5} z0={0} z1={h + c} role="trim" />
      <WallBox W={W} u0={u1} u1={u1 + c} v0={0} v1={1.5} z0={0} z1={h + c} role="trim" />
      <WallBox W={W} u0={u0} u1={u1} v0={0} v1={1.5} z0={h} z1={h + c} role="trim" />
      {/* ручка */}
      {o.leaf !== 0 && <WallBox W={W} u0={handleU - 6} u1={handleU + 6} v0={-t / 2 + 2} v1={-t / 2 + 5} z0={98} z1={101} role="metal" cast={false} />}
    </>
  );
}

function WallGroup({ room, W, register }: { room: any; W: Wall; register: (id: number, ref: WallRef | null) => void }) {
  const H = room.height.value;
  const n = room.outline.length;
  const th = (id: number) => room.walls.find((w: any) => w.id === id)?.thickness ?? 12;
  // Угол закрываем продлением стены на толщину следующей, но только выпуклый:
  // во вогнутом углу (Г-образная прихожая) продление вылезло бы внутрь комнаты.
  const Wn = G.wall(room, (W.id % n) + 1) as Wall;
  const convex = W.dir[0] * Wn.dir[1] - W.dir[1] * Wn.dir[0] < 0;
  const t = th(W.id), tNext = convex ? th((W.id % n) + 1) : 0;
  const ops = room.openings.filter((o: any) => o.wall === W.id).sort((a: any, b: any) => a.offset - b.offset);

  // Куски стены: сплошные между проёмами, над проёмами и под окнами.
  const pieces: { u0: number; u1: number; z0: number; z1: number }[] = [];
  let cur = 0;
  for (const o of ops) {
    pieces.push({ u0: cur, u1: o.offset, z0: 0, z1: H });
    const top = o.type === 'window' ? o.sill + o.height : o.height;
    pieces.push({ u0: o.offset, u1: o.offset + o.width, z0: top, z1: H });
    if (o.type === 'window') pieces.push({ u0: o.offset, u1: o.offset + o.width, z0: 0, z1: o.sill - 4 });
    cur = o.offset + o.width;
  }
  pieces.push({ u0: cur, u1: W.length + tNext, z0: 0, z1: H });

  // Плинтус по внутренней грани, кроме дверных проёмов.
  const base: [number, number][] = [];
  let bc = 0;
  for (const o of ops.filter((o: any) => o.type === 'door')) { base.push([bc, o.offset - 7]); bc = o.offset + o.width + 7; }
  base.push([bc, W.length]);

  return (
    <group ref={(g) => register(W.id, g ? { group: g, a: W.a, inward: W.inward } : null)}>
      {pieces.map((p, i) => <WallBox key={i} W={W} {...p} v0={-t} v1={0} role="walls" />)}
      {base.map(([u0, u1], i) => <WallBox key={'b' + i} W={W} u0={Math.max(0, u0)} u1={u1} v0={0} v1={1.5} z0={0} z1={7} role="trim" cast={false} />)}
      {ops.map((o: any) => (o.type === 'window' ? <Window key={o.id} W={W} t={t} o={o} /> : <Door key={o.id} W={W} t={t} o={o} />))}
    </group>
  );
}

function Slab({ outline, z, role, down }: { outline: Vec[]; z: number; role: Role; down?: boolean }) {
  const { shadows, mode } = useScene();
  const mat = useMaterial(role, down ? THREE.BackSide : THREE.FrontSide);
  const geom = useMemo(() => {
    const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x / 100, y / 100)));
    return new THREE.ShapeGeometry(s);
  }, [outline]);
  // ShapeGeometry лежит в XY; поворот −90° вокруг X даёт (x, y) → (x, 0, −y), как и весь план.
  return (
    <mesh geometry={geom} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, z / 100, 0]} receiveShadow={shadows} visible={!(down && mode === 'lines')} />
  );
}

function Radiator({ room, f }: { room: any; f: any }) {
  const W = G.wall(room, f.wall) as Wall;
  const n = Math.max(1, Math.round(f.w / 8)), sw = f.w / n;
  return (
    <>
      {Array.from({ length: n }, (_, k) => (
        <WallBox key={k} W={W} u0={f.offset + k * sw + 0.5} u1={f.offset + (k + 1) * sw - 0.5} v0={1} v1={f.d} z0={f.z} z1={f.z + f.h} role="radiator" />
      ))}
    </>
  );
}

export function Room3D({ layout, register, registerCeiling }: { layout: any; register: (id: number, ref: WallRef | null) => void; registerCeiling: (g: THREE.Group | null) => void }) {
  const room = layout.room;
  const H = room.height.value;
  const walls = G.walls(room) as Wall[];
  return (
    <>
      <Slab outline={room.outline} z={0} role="floor" />
      <Slab outline={room.outline} z={H} role="ceiling" down />
      {walls.map((W) => <WallGroup key={W.id} room={room} W={W} register={register} />)}
      {room.fixtures.map((f: any) => {
        if (f.type === 'radiator') return <Radiator key={f.id} room={room} f={f} />;
        if (f.type === 'pipe') {
          const W = G.wall(room, f.wall) as Wall;
          const c = G.add(G.add(W.a, G.mul(W.dir, f.offset + f.w / 2)), G.mul(W.inward, f.d));
          return <PCyl key={f.id} x={c[0]} y={c[1]} z={0} r={f.w / 2} h={H} role="radiator" seg={10} />;
        }
        if (f.type === 'ceilingLight') return (
          <group key={f.id} ref={registerCeiling}>
            <PCyl x={f.x} y={f.y} z={H - (f.drop ?? 55)} r={0.4} h={f.drop ?? 55} role="dark" seg={6} />
            <PCyl x={f.x} y={f.y} z={H - (f.drop ?? 55) - 20} r={18} r2={6} h={20} role="shade" />
          </group>
        );
        return null;
      })}
    </>
  );
}
