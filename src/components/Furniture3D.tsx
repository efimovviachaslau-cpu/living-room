// Мебель: low-poly модели из габаритов каталога (w × d × h).
// Локальные координаты — план относительно центра предмета, фасад к −y (как rot = 0).
import { PBox, PCyl, toThree } from './prims';

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
  const legH = 10, n = w >= 150 ? 3 : 2;
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

function Tv({ s }: { s: Spec }) {
  const { w, d, h } = s;
  return (
    <>
      <PBox x={0} y={0} z={0} w={w} d={d} h={h} role="dark" />
      <PBox x={0} y={-d / 2 - 0.2} z={1} w={w - 2} d={0.4} h={h - 2} role="screen" cast={false} />
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

export function Item({ it, spec }: { it: { x: number; y: number; rot?: number }; spec: Spec }) {
  const pos = toThree(it.x, it.y, spec.z ?? 0);
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
    case 'rug': body = <PBox x={0} y={0} z={0} w={spec.w} d={spec.d} h={1} role="rug" cast={false} />; break;
  }
  return <group position={pos} rotation={[0, rot, 0]}>{body}</group>;
}

export function Furniture3D({ layout, variantId }: { layout: any; variantId: string }) {
  const v = layout.variants.find((x: any) => x.id === variantId);
  if (!v) return null;
  return <>{v.items.map((it: any) => <Item key={it.id} it={it} spec={layout.catalog[it.ref]} />)}</>;
}
