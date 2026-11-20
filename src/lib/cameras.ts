// Пресет камеры → позиция и цель в координатах three.js.
import * as THREE from 'three';
import type { CamPreset } from './presets';

const P = (x: number, y: number, z: number) => new THREE.Vector3(x / 100, z / 100, -y / 100);

// Позиция, цель и угол обзора камеры в координатах three.js.
export function resolvePreset(p: CamPreset, layout: any, aspect: number) {
  const fov = p.fov ?? 60;
  if (p.type === 'top') {
    const xs = layout.room.outline.map((q: number[]) => q[0]), ys = layout.room.outline.map((q: number[]) => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const t = Math.tan((fov * Math.PI) / 360);
    // Вписываем по верху стен (они ближе к камере, чем пол) с запасом на толщину стен.
    const halfX = (Math.max(...xs) - Math.min(...xs)) / 2 + 55, halfY = (Math.max(...ys) - Math.min(...ys)) / 2 + 55;
    const dist = layout.room.height.value + Math.max(halfY / t, halfX / (t * aspect));
    // Смещение на 1 см к окну: камера не строго вертикальна, «верх» экрана — от окна, как на плане.
    return { pos: P(cx, cy - 1, dist), target: P(cx, cy, 0), fov };
  }
  const [x, y, z] = p.pos!, [tx, ty, tz] = p.target!;
  return { pos: P(x, y, z), target: P(tx, ty, tz), fov };
}
