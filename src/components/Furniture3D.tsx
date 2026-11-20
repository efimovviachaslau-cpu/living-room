// Мебель: low-poly модели из габаритов каталога (w × d × h).
// Локальные координаты — план относительно центра предмета, фасад к −y (как rot = 0).
import * as THREE from 'three';
import * as G from '../lib/geometry.js';
import { PBox, PCyl, toThree, registerCeiling } from './prims';

export type RegisterWallItem = (wallId: number, g: THREE.Group | null) => void;

type Spec = { name: string; kind: string; w: number; d: number; h: number; z?: number };

function Sofa({ s, seats }: { s: Spec; seats: number }) {
  const { w, d, h } = s;
  const arm = 15, back = 20, leg = 8, seatTop = 44;
  const inner = w - 2 * arm, cw = inner / seats;
  const fy = -d / 2, by = d / 2;
  return (
    <>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
        <PBox key={i} x={sx * (w / 2 - 6)} y={sy * (d / 2 - 6)} z={0} w={4} d={4} h={leg} role="dark" cast={false} />
      ))}
      {/* основание */}
      <PBox x={0} y={0} z={leg} w={w} d={d} h={seatTop - 12 - leg} role="textile" />
      {/* спинка */}
      <PBox x={0} y={by - back / 2} z={leg} w={w} d={back} h={h - leg} role="textile" />
      {/* подлокотники */}
      <PBox x={-(w / 2 - arm / 2)} y={0} z={leg} w={arm} d={d} h={62 - leg} role="textile" />
      <PBox x={w / 2 - arm / 2} y={0} z={leg} w={arm} d={d} h={62 - leg} role="textile" />
      {/* подушки сиденья и спинки */}
      {Array.from({ length: seats }, (_, k) => {
        const cx = -inner / 2 + cw * (k + 0.5);
        return (
          <group key={k}>
            <PBox x={cx} y={(fy + by - back) / 2} z={seatTop - 12} w={cw - 1} d={d - back - 2} h={12} role="textile" />
            <PBox x={cx} y={by - back - 6} z={seatTop} w={cw - 2} d={12} h={h - seatTop - 4} role="textile" />
          </group>
        );
      })}
    </>
  );
}

function Table({ s }: { s: Spec }) {
  const { w, d, h } = s;
  const top = 3, leg = h > 60 ? 5 : 4, inset = 5;
  return (
    <>
      <PBox x={0} y={0} z={h - top} w={w} d={d} h={top} role="wood" />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
        <PBox key={i} x={sx * (w / 2 - inset - leg / 2)} y={sy * (d / 2 - inset - leg / 2)} z={0} w={leg} d={leg} h={h - top} role="wood" />
      ))}
      {h <= 50 && <PBox x={0} y={0} z={12} w={w - 2 * inset} d={d - 2 * inset} h={2} role="wood" />}
    </>
  );
}

function Chair({ s }: { s: Spec }) {
  const { w, d, h } = s;
  const seat = 45, leg = 3;
  return (
    <>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
        <PBox key={i} x={sx * (w / 2 - 3)} y={sy * (d / 2 - 3)} z={0} w={leg} d={leg} h={seat - 3} role="wood" />
      ))}
      <PBox x={0} y={0} z={seat - 3} w={w} d={d} h={3} role="wood" />
      <PBox x={0} y={d / 2 - 2} z={seat} w={w} d={3} h={h - seat} role="wood" />
    </>
  );
}

function Cabinet({ s }: { s: Spec }) {
  const { w, d, h } = s;
  if (h >= 120) {
    // Открытый стеллаж: боковины, полки через ~38 см, задняя стенка.
    const t = 2, n = Math.max(2, Math.round(h / 38));
    return (
      <>
        <PBox x={-(w / 2 - t / 2)} y={0} z={0} w={t} d={d} h={h} role="furniture" />
        <PBox x={w / 2 - t / 2} y={0} z={0} w={t} d={d} h={h} role="furniture" />
        <PBox x={0} y={d / 2 - 0.5} z={0} w={w} d={1} h={h} role="furniture" />
        {Array.from({ length: n + 1 }, (_, k) => (
          <PBox key={k} x={0} y={0} z={k === n ? h - t : k === 0 ? 5 : 5 + ((h - 5) * k) / n - t / 2} w={w - 2 * t} d={d - 1} h={t} role="furniture" />
        ))}
        <PBox x={0} y={-d / 2 + 1} z={0} w={w - 2 * t} d={2} h={5} role="furniture" />
      </>
    );
  }
  // Тумба на ножках, фасад из двух-трёх дверец.
  const legH = 10, n = w >= 150 ? 3 : w >= 80 ? 2 : 1;
  return (
    <>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
        <PBox key={i} x={sx * (w / 2 - 5)} y={sy * (d / 2 - 5)} z={0} w={3} d={3} h={legH} role="wood" cast={false} />
      ))}
      <PBox x={0} y={0} z={legH} w={w} d={d} h={h - legH} role="furniture" />
      {Array.from({ length: n }, (_, k) => (
        <PBox key={k} x={-w / 2 + (w / n) * (k + 0.5)} y={-d / 2 - 0.5} z={legH + 2} w={w / n - 1} d={1} h={h - legH - 4} role="furniture" />
      ))}
    </>
  );
}

// Кровать: габарит каталога — с рамой и изголовьем; матрас 160×200 (или w−10 × d−15).
function Bed({ s }: { s: Spec }) {
  const { w, d, h } = s;
  const head = 8, mw = Math.min(160, w - 10), md = Math.min(200, d - head - 7);
  const backY = d / 2 - head;
  const mY = backY - 2 - md / 2;
  const frameTop = 32, mTop = frameTop + 22;
  return (
    <>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
        <PBox key={i} x={sx * (w / 2 - 6)} y={sy * (d / 2 - 8)} z={0} w={5} d={5} h={10} role="wood" cast={false} />
      ))}
      <PBox x={0} y={-head / 2} z={10} w={w} d={d - head} h={frameTop - 10} role="textile" />
      <PBox x={0} y={backY + head / 2} z={0} w={w} d={head} h={h} role="textile" />
      <PBox x={0} y={mY} z={frameTop} w={mw} d={md} h={mTop - frameTop} role="shade" />
      {/* одеяло на две трети от изножья */}
      <PBox x={0} y={mY - md / 2 + 70} z={mTop} w={mw + 6} d={140} h={4} role="textile" />
      {[-1, 1].map((sx) => (
        <PBox key={sx} x={sx * (mw / 4 + 2)} y={backY - 28} z={mTop} w={mw / 2 - 12} d={42} h={12} role="shade" />
      ))}
    </>
  );
}

function Tv({ s }: { s: Spec }) {
  const { w, d, h } = s;
  return (
    <>
      <PBox x={0} y={0} z={0} w={w} d={d} h={h} role="dark" />
      <PBox x={0} y={-d / 2 - 0.2} z={1} w={w - 2} d={0.4} h={h - 2} role="screen" cast={false} />
    </>
  );
}

// Подвесной светильник: провод от потолка до абажура. z — низ абажура.
function Pendant({ s, z, ceiling }: { s: Spec; z: number; ceiling: number }) {
  const r = s.w / 2, cord = Math.max(1, ceiling - z - s.h);
  return (
    <group ref={registerCeiling}>
      <PCyl x={0} y={0} z={s.h} r={0.4} h={cord} role="dark" seg={6} />
      <PCyl x={0} y={0} z={0} r={r} r2={r * 0.35} h={s.h} role="shade" />
    </group>
  );
}

// Картина на стене: рама, холст и пара цветовых пятен (для рендера важно, что это картина, а не дверь).
function Art({ s }: { s: Spec }) {
  const { w, d, h } = s, f = 3;
  return (
    <>
      <PBox x={0} y={0} z={0} w={w} d={d} h={h} role="wood" />
      <PBox x={0} y={-d / 2 - 0.3} z={f} w={w - 2 * f} d={0.6} h={h - 2 * f} role="shade" cast={false} />
      <PBox x={-w * 0.15} y={-d / 2 - 0.8} z={h * 0.2} w={w * 0.4} d={0.4} h={h * 0.45} role="textile" cast={false} />
      <PBox x={w * 0.2} y={-d / 2 - 0.8} z={h * 0.45} w={w * 0.25} d={0.4} h={h * 0.3} role="wood" cast={false} />
    </>
  );
}

// Шкаф-купе: створки ~80 см на двух направляющих (через одну чуть впереди), без ручек,
// с вертикальными профилями; при mirror — средняя створка зеркальная.
function SlidingWardrobe({ s }: { s: Spec & { mirror?: boolean } }) {
  const { w, d, h } = s, plinth = 8, n = Math.max(2, Math.round(w / 80)), dw = w / n;
  return (
    <>
      <PBox x={0} y={2} z={0} w={w} d={d - 4} h={plinth} role="dark" cast={false} />
      <PBox x={0} y={2} z={plinth} w={w} d={d - 6} h={h - plinth} role="furniture" />
      {Array.from({ length: n }, (_, k) => {
        const cx = -w / 2 + dw * (k + 0.5), front = k % 2 === 0;
        const y = -d / 2 + (front ? 0 : 2.5);
        const mirror = s.mirror && k === Math.floor(n / 2);
        return (
          <group key={k}>
            <PBox x={cx} y={y} z={plinth} w={dw + (front ? 2 : 0)} d={2} h={h - plinth - 4} role="furniture" />
            {mirror && <PBox x={cx} y={y - 1.2} z={plinth + 6} w={dw - 10} d={0.4} h={h - plinth - 16} role="mirror" cast={false} />}
            {[-1, 1].map((sx) => <PBox key={sx} x={cx + sx * (dw / 2 - 1)} y={y - 1.2} z={plinth} w={2} d={0.6} h={h - plinth - 4} role="metal" cast={false} />)}
          </group>
        );
      })}
    </>
  );
}

// Зеркало на стене: тонкая рама и зеркальное полотно.
function Mirror({ s }: { s: Spec }) {
  return (
    <>
      <PBox x={0} y={0} z={0} w={s.w} d={s.d} h={s.h} role="wood" />
      <PBox x={0} y={-s.d / 2 - 0.3} z={2} w={s.w - 4} d={0.6} h={s.h - 4} role="mirror" cast={false} />
    </>
  );
}

// Шкаф: цоколь, корпус, одна-две дверцы с ручками.
function Wardrobe({ s }: { s: Spec & { sliding?: boolean } }) {
  if (s.sliding) return <SlidingWardrobe s={s} />;
  const { w, d, h } = s, plinth = 8, n = w >= 80 ? 2 : 1, dw = w / n;
  return (
    <>
      <PBox x={0} y={1} z={0} w={w - 4} d={d - 4} h={plinth} role="dark" cast={false} />
      <PBox x={0} y={0} z={plinth} w={w} d={d - 2} h={h - plinth} role="furniture" />
      {Array.from({ length: n }, (_, k) => {
        const cx = -w / 2 + dw * (k + 0.5);
        const hx = n === 1 ? w / 2 - 6 : k === 0 ? dw / 2 - 4 : -dw / 2 + 4;
        return (
          <group key={k}>
            <PBox x={cx} y={-d / 2} z={plinth + 1} w={dw - 0.6} d={2} h={h - plinth - 2} role="furniture" />
            <PBox x={cx + hx} y={-d / 2 - 1.5} z={100} w={1.5} d={1.5} h={25} role="metal" cast={false} />
          </group>
        );
      })}
    </>
  );
}

// Кухонные модули. Нижние: цоколь 10, корпус, столешница 4 с выносом 2 см; фасады ~45 см.
// Верхние с toCeiling тянутся до потолка: высота = потолок − низ шкафа.
type KSpec = Spec & { part?: string; toCeiling?: boolean };

function Fronts({ w, d, z, h, maxW = 50, handle = 'top' }: { w: number; d: number; z: number; h: number; maxW?: number; handle?: 'top' | 'bottom' | 'side' }) {
  const n = Math.max(1, Math.round(w / maxW)), fw = w / n;
  return (
    <>
      {Array.from({ length: n }, (_, k) => {
        const cx = -w / 2 + fw * (k + 0.5);
        const hz = handle === 'bottom' ? z + 3 : z + h - 6;
        return (
          <group key={k}>
            <PBox x={cx} y={-d / 2 - 1} z={z + 0.3} w={fw - 0.6} d={2} h={h - 0.6} role="furniture" />
            {handle === 'side'
              ? <PBox x={cx + (k % 2 ? -1 : 1) * (fw / 2 - 4)} y={-d / 2 - 2.8} z={z + h / 2 - 12} w={1.5} d={1.5} h={24} role="metal" cast={false} />
              : <PBox x={cx} y={-d / 2 - 2.8} z={hz} w={Math.min(30, fw * 0.5)} d={1.5} h={1.5} role="metal" cast={false} />}
          </group>
        );
      })}
    </>
  );
}

function Kitchen({ s, z, ceiling }: { s: KSpec; z: number; ceiling: number }) {
  const { w, d } = s;
  if (s.part === 'upper') {
    const h = s.toCeiling ? Math.max(10, ceiling - z) : s.h;
    return (
      <>
        <PBox x={0} y={1} z={0} w={w} d={d - 2} h={h} role="furniture" />
        <Fronts w={w} d={d - 2} z={0} h={h} maxW={45} handle="bottom" />
      </>
    );
  }
  if (s.part === 'hood') return <PBox x={0} y={0} z={0} w={w} d={d} h={s.h} role="metal" />;
  if (s.part === 'fridge') {
    const h = s.h, fz = 70; // морозилка снизу
    return (
      <>
        <PBox x={0} y={1} z={0} w={w} d={d - 2} h={h} role="radiator" />
        <PBox x={0} y={-d / 2 + 0.5} z={1} w={w - 1} d={1.5} h={fz - 1.5} role="radiator" />
        <PBox x={0} y={-d / 2 + 0.5} z={fz} w={w - 1} d={1.5} h={h - fz - 1} role="radiator" />
        <PBox x={w / 2 - 5} y={-d / 2 - 1.5} z={fz - 30} w={1.5} d={2} h={22} role="metal" cast={false} />
        <PBox x={w / 2 - 5} y={-d / 2 - 1.5} z={fz + 8} w={1.5} d={2} h={35} role="metal" cast={false} />
      </>
    );
  }
  const plinth = 10, top = 4, body = s.h - plinth - top;
  return (
    <>
      <PBox x={0} y={3} z={0} w={w} d={d - 6} h={plinth} role="dark" cast={false} />
      <PBox x={0} y={1} z={plinth} w={w} d={d - 2} h={body} role="furniture" />
      <PBox x={0} y={-1} z={s.h - top} w={w} d={d + 2} h={top} role="wood" />
      {s.part === 'stove' ? (
        <>
          {/* панель управления, дверца духовки со стеклом, варочная поверхность и конфорки */}
          <PBox x={0} y={-d / 2 - 1} z={s.h - top - 12} w={w - 1} d={2} h={11} role="dark" />
          <PBox x={0} y={-d / 2 - 1} z={plinth + 1} w={w - 1} d={2} h={body - 14} role="dark" />
          <PBox x={0} y={-d / 2 - 2.2} z={plinth + 12} w={w - 14} d={0.4} h={body - 34} role="screen" cast={false} />
          <PBox x={0} y={0} z={s.h} w={w - 4} d={d - 12} h={0.6} role="screen" cast={false} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
            <PCyl key={i} x={sx * (w / 4 - 1)} y={sy * (d / 4 - 3)} z={s.h + 0.6} r={i % 3 === 0 ? 9 : 7} h={0.4} role="dark" seg={24} />
          ))}
        </>
      ) : s.part === 'dishwasher' ? (
        <Fronts w={w} d={d - 2} z={plinth} h={body} maxW={60} />
      ) : (
        <Fronts w={w} d={d - 2} z={plinth} h={body} maxW={45} handle={s.part === 'sink' ? 'top' : 'top'} />
      )}
      {s.part === 'sink' && (
        <>
          <PBox x={0} y={-2} z={s.h} w={w - 16} d={d - 22} h={0.5} role="metal" cast={false} />
          <PCyl x={0} y={d / 2 - 8} z={s.h} r={1.8} h={26} role="metal" seg={12} />
          <PBox x={0} y={d / 2 - 15} z={s.h + 23} w={2.5} d={16} h={2.5} role="metal" cast={false} />
        </>
      )}
    </>
  );
}

// Ванна: полая — четыре борта и дно, фронтальный экран; смеситель у стены.
function Bath({ s }: { s: Spec }) {
  const { w, d, h } = s, t = 7;
  return (
    <>
      <PBox x={0} y={-d / 2 + t / 2} z={0} w={w} d={t} h={h} role="radiator" />
      <PBox x={0} y={d / 2 - t / 2} z={0} w={w} d={t} h={h} role="radiator" />
      <PBox x={-w / 2 + t / 2} y={0} z={0} w={t} d={d - 2 * t} h={h} role="radiator" />
      <PBox x={w / 2 - t / 2} y={0} z={0} w={t} d={d - 2 * t} h={h} role="radiator" />
      <PBox x={0} y={0} z={0} w={w - 2 * t} d={d - 2 * t} h={18} role="radiator" />
      <PBox x={-w / 2 + 25} y={d / 2 + 1} z={h + 12} w={14} d={6} h={4} role="metal" cast={false} />
      <PBox x={-w / 2 + 25} y={d / 2 - 6} z={h + 8} w={3} d={10} h={3} role="metal" cast={false} />
    </>
  );
}

function Toilet({ s }: { s: Spec }) {
  const { w, d } = s, tank = 18;
  const bowlY = -d / 2 + (d - tank) / 2 - tank / 2; // центр чаши — впереди бачка
  return (
    <>
      <PBox x={0} y={bowlY + 6} z={0} w={w * 0.55} d={(d - tank) * 0.6} h={30} role="radiator" />
      <PCyl x={0} y={bowlY} z={30} r={w / 2 - 1} r2={w / 2} h={12} role="radiator" seg={24} />
      <PCyl x={0} y={bowlY} z={42} r={w / 2} h={2} role="shade" seg={24} />
      <PBox x={0} y={d / 2 - tank / 2} z={38} w={w} d={tank} h={s.h - 38} role="radiator" />
      <PBox x={0} y={d / 2 - tank / 2} z={s.h} w={8} d={4} h={1} role="metal" cast={false} />
    </>
  );
}

// Плоская раковина над стиральной машиной 60 × 50 × 85, смеситель у стены.
function SinkWasher({ s }: { s: Spec }) {
  const { w, d, h } = s, wh = 85;
  return (
    <>
      <PBox x={0} y={4} z={0} w={w} d={d - 8} h={wh} role="radiator" />
      <PCyl x={0} y={-d / 2 + 3.5} z={wh / 2 - 8} r={16} h={1.5} role="dark" seg={32} rotX />
      <PCyl x={0} y={-d / 2 + 3.2} z={wh / 2 - 8} r={12} h={1} role="screen" seg={32} rotX />
      <PBox x={-w / 2 + 12} y={-d / 2 + 4.5} z={wh - 10} w={18} d={1} h={6} role="dark" cast={false} />
      <PBox x={0} y={0} z={wh + 1} w={w} d={d} h={h - wh - 1} role="radiator" />
      <PBox x={0} y={-3} z={h - 0.5} w={w - 14} d={d - 22} h={0.6} role="shade" cast={false} />
      <PCyl x={0} y={d / 2 - 6} z={h} r={1.6} h={18} role="metal" seg={12} />
      <PBox x={0} y={d / 2 - 12} z={h + 15} w={2.5} d={12} h={2.5} role="metal" cast={false} />
    </>
  );
}

// Полотенцесушитель-лесенка: две стойки и перекладины.
function TowelRail({ s }: { s: Spec }) {
  const { w, h } = s, n = 6;
  return (
    <>
      {[-1, 1].map((sx) => <PCyl key={sx} x={sx * (w / 2 - 1.5)} y={0} z={0} r={1.5} h={h} role="metal" seg={10} />)}
      {Array.from({ length: n }, (_, k) => (
        <PBox key={k} x={0} y={0} z={6 + (k * (h - 12)) / (n - 1)} w={w - 3} d={2} h={2} role="metal" cast={false} />
      ))}
    </>
  );
}

function Lamp({ s }: { s: Spec }) {
  const r = s.w / 2;
  return (
    <>
      <PCyl x={0} y={0} z={0} r={r * 0.75} h={3} role="dark" />
      <PCyl x={0} y={0} z={3} r={1.2} h={s.h - 33} role="dark" seg={8} />
      <PCyl x={0} y={0} z={s.h - 32} r={r} r2={r * 0.8} h={32} role="shade" />
    </>
  );
}

export function Item({ it, spec, ceiling, wallId, registerWallItem }: {
  it: { x: number; y: number; z?: number; rot?: number }; spec: Spec; ceiling: number;
  wallId?: number; registerWallItem?: RegisterWallItem;
}) {
  const z = it.z ?? spec.z ?? 0;
  const pos = toThree(it.x, it.y, z);
  const rot = (-(it.rot ?? 0) * Math.PI) / 180;
  let body = null;
  switch (spec.kind) {
    case 'sofa': body = <Sofa s={spec} seats={spec.w >= 190 ? 3 : 2} />; break;
    case 'armchair': body = <Sofa s={spec} seats={1} />; break;
    case 'table': body = <Table s={spec} />; break;
    case 'chair': body = <Chair s={spec} />; break;
    case 'cabinet': body = <Cabinet s={spec} />; break;
    case 'tv': body = <Tv s={spec} />; break;
    case 'lamp': body = <Lamp s={spec} />; break;
    case 'bed': body = <Bed s={spec} />; break;
    case 'pendant': body = <Pendant s={spec} z={z} ceiling={ceiling} />; break;
    case 'art': body = <Art s={spec} />; break;
    case 'wardrobe': body = <Wardrobe s={spec} />; break;
    case 'mirror': body = <Mirror s={spec} />; break;
    case 'kitchen': body = <Kitchen s={spec} z={z} ceiling={ceiling} />; break;
    case 'bath': body = <Bath s={spec} />; break;
    case 'bathroom': body = (spec as any).part === 'toilet' ? <Toilet s={spec} /> : (spec as any).part === 'sinkwasher' ? <SinkWasher s={spec} /> : <TowelRail s={spec} />; break;
    case 'rug': body = <PBox x={0} y={0} z={0} w={spec.w} d={spec.d} h={1} role="rug" cast={false} />; break;
  }
  // Висящее на стене прячется вместе со стеной в режиме «кукольного дома».
  const ref = wallId && registerWallItem ? (g: THREE.Group | null) => registerWallItem(wallId, g) : undefined;
  return <group ref={ref} position={pos} rotation={[0, rot, 0]}>{body}</group>;
}

const ON_WALL = new Set(['tv', 'art', 'mirror', 'bathroom']);

export function Furniture3D({ layout, variantId, registerWallItem, hideAbove }: { layout: any; variantId: string; registerWallItem?: RegisterWallItem; hideAbove?: number }) {
  const v = layout.variants.find((x: any) => x.id === variantId);
  if (!v) return null;
  const ceiling = layout.room.height.value;
  const walls = G.walls(layout.room);
  return (
    <>
      {v.items.map((it: any) => {
        const spec = layout.catalog[it.ref];
        // В общем виде прячем то, что висит выше среза стен: верхние шкафы, подвесы, ТВ и картины на стене.
        const z0 = it.z ?? spec.z ?? 0;
        if (hideAbove !== undefined && (z0 >= hideAbove || (spec.floor === false && z0 + spec.h > hideAbove))) return null;
        const onWall = ON_WALL.has(spec.kind) && (spec.kind !== 'bathroom' || spec.floor === false);
        const w = onWall ? walls.find((W: any) => G.pointSegDistance([it.x, it.y], W.a, W.b) < spec.d / 2 + 10) : undefined;
        return <Item key={it.id} it={it} spec={spec} ceiling={ceiling} wallId={w?.id} registerWallItem={registerWallItem} />;
      })}
    </>
  );
}
