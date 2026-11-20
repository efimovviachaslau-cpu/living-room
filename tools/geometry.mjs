// Геометрия плана из layout.json. Чистый JS без зависимостей:
// им пользуется tools/sketch.mjs, потом будет пользоваться и просмотрщик.
// Координаты плана: см, Y от окна вглубь комнаты (вверх на плане), поворот по часовой.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const len = (a) => Math.hypot(a[0], a[1]);
export const norm = (a) => mul(a, 1 / len(a));

// Поворот по часовой на плане с осью Y вверх.
export function rotCW([x, y], deg) {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  return [x * c + y * s, -x * s + y * c];
}

// Стена i (с 1): отрезок контура, направление и нормаль внутрь комнаты (контур по часовой).
export function wall(room, id) {
  const pts = room.outline;
  const a = pts[id - 1], b = pts[id % pts.length];
  const dir = norm(sub(b, a));
  return { id, a, b, dir, inward: rotCW(dir, 90), length: len(sub(b, a)) };
}

export const walls = (room) => room.outline.map((_, i) => wall(room, i + 1));

// Прямоугольник вдоль стены: от offset на длину w, вглубь комнаты на d.
export function wallRect(room, wallId, offset, w, d) {
  const W = wall(room, wallId);
  const p0 = add(W.a, mul(W.dir, offset));
  const p1 = add(p0, mul(W.dir, w));
  return [p0, p1, add(p1, mul(W.inward, d)), add(p0, mul(W.inward, d))];
}

export function opening(room, o) {
  const W = wall(room, o.wall);
  const p0 = add(W.a, mul(W.dir, o.offset));
  const p1 = add(p0, mul(W.dir, o.width));
  return { ...o, W, p0, p1, mid: mul(add(p0, p1), 0.5) };
}

// Сектор открывания двери внутрь комнаты (многоугольник) или null.
export function doorSwing(room, o, steps = 16) {
  if (!o.swing || o.swing.into !== 'room') return null;
  const op = opening(room, o);
  const hinge = o.swing.hinge === 'end' ? op.p1 : op.p0;
  const closedDir = o.swing.hinge === 'end' ? mul(op.W.dir, -1) : op.W.dir;
  const leaf = o.leaf ?? o.width;
  const pts = [hinge];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    const v = add(mul(closedDir, Math.cos(t)), mul(op.W.inward, Math.sin(t)));
    pts.push(add(hinge, mul(v, leaf)));
  }
  return { hinge, leaf, closedDir, openDir: op.W.inward, poly: pts };
}

// Габарит предмета: центр (x, y), w по фасаду, d в глубину, поворот rot.
export function footprint(item, spec) {
  const hw = spec.w / 2, hd = spec.d / 2;
  const local = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  return local.map((p) => add([item.x, item.y], rotCW(p, item.rot || 0)));
}

// Куда смотрит фасад (единичный вектор).
export const facing = (rot) => rotCW([0, -1], rot || 0);

// --- расстояния ---

function segPoint(p, a, b) {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
  const q = add(a, mul(ab, t));
  return { d: len(sub(p, q)), q };
}

function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const edges = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);

// Кратчайшее расстояние между многоугольниками и пара ближайших точек (0 — пересекаются).
export function polyDistance(A, B) {
  for (const [a, b] of edges(A)) for (const [c, d] of edges(B)) if (segsCross(a, b, c, d)) return { d: 0 };
  if (pointInPoly(A[0], B) || pointInPoly(B[0], A)) return { d: 0 };
  let best = { d: Infinity };
  for (const p of A) for (const [c, d] of edges(B)) {
    const r = segPoint(p, c, d);
    if (r.d < best.d) best = { d: r.d, p, q: r.q };
  }
  for (const p of B) for (const [a, b] of edges(A)) {
    const r = segPoint(p, a, b);
    if (r.d < best.d) best = { d: r.d, p: r.q, q: p };
  }
  return best;
}

export function polySegDistance(A, a, b) {
  return polyDistance(A, [a, b]);
}

export function pointPolyDistance(p, poly) {
  if (pointInPoly(p, poly)) return 0;
  let d = Infinity;
  for (const [a, b] of edges(poly)) d = Math.min(d, segPoint(p, a, b).d);
  return d;
}

export function pointSegDistance(p, a, b) {
  return segPoint(p, a, b).d;
}

// --- сборка сцены для проверок ---

export function resolveVariant(layout, variantId) {
  const v = layout.variants.find((x) => x.id === variantId);
  if (!v) throw new Error(`Нет варианта ${variantId}`);
  const items = v.items.map((it) => {
    const spec = layout.catalog[it.ref];
    if (!spec) throw new Error(`Нет в каталоге: ${it.ref}`);
    return { ...it, spec, poly: footprint(it, spec) };
  });
  return { ...v, items };
}

export function fixtures(layout) {
  const room = layout.room;
  return room.fixtures.filter((f) => f.wall).map((f) => ({ ...f, poly: wallRect(room, f.wall, f.offset, f.w, f.d) }));
}

// --- проходы ---
// Сетка свободного места: комната + «коридоры» дверных проёмов наружу.
// clear[k] — расстояние от центра клетки до ближайшего препятствия (стены с вырезанными
// проёмами, откосы, мебель). Проход шириной W возможен там, где clear ≥ W/2.
export function passGrid(layout, obstacles, step = 2.5) {
  const room = layout.room;
  const th = Object.fromEntries(room.walls.map((w) => [w.id, w.thickness]));
  const xs = room.outline.map((p) => p[0]), ys = room.outline.map((p) => p[1]);
  const M = 80, x0 = Math.min(...xs) - M - step / 2, y0 = Math.min(...ys) - M - step / 2; // центры клеток на кратных step
  const nx = Math.ceil((Math.max(...xs) + M - x0) / step), ny = Math.ceil((Math.max(...ys) + M - y0) / step);
  const segs = [], corridors = [], doors = {};
  for (const W of walls(room)) {
    const cuts = room.openings.filter((o) => o.wall === W.id && o.type === 'door').sort((a, b) => a.offset - b.offset);
    let t = 0;
    for (const o of cuts) {
      if (o.offset > t) segs.push([add(W.a, mul(W.dir, t)), add(W.a, mul(W.dir, o.offset))]);
      t = o.offset + o.width;
      const op = opening(room, o), out = mul(W.inward, -(th[W.id] + 40));
      segs.push([op.p0, add(op.p0, out)], [op.p1, add(op.p1, out)]);
      corridors.push([op.p0, op.p1, add(op.p1, out), add(op.p0, out)]);
      doors[o.id] = add(op.mid, mul(W.inward, -(th[W.id] + 30)));
    }
    if (t < W.length) segs.push([add(W.a, mul(W.dir, t)), W.b]);
  }
  const clear = new Float32Array(nx * ny);
  const center = (i, j) => [x0 + (i + 0.5) * step, y0 + (j + 0.5) * step];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = center(i, j);
    if (!pointInPoly(p, room.outline) && !corridors.some((c) => pointInPoly(p, c))) continue;
    let d = Infinity;
    for (const [a, b] of segs) d = Math.min(d, pointSegDistance(p, a, b));
    for (const o of obstacles) d = Math.min(d, pointPolyDistance(p, o));
    clear[j * nx + i] = d;
  }
  const cell = (p) => [Math.floor((p[0] - x0) / step), Math.floor((p[1] - y0) / step)];
  return { nx, ny, step, clear, cell, center, doors };
}

// Самый узкий проход от точки A до любой из точек targets: ширина в см.
export function bottleneck(grid, A, targets) {
  const { nx, ny, clear, cell } = grid;
  const [ai, aj] = cell(A);
  const goal = new Set(targets.map((p) => { const [i, j] = cell(p); return j * nx + i; }));
  const reach = (r) => {
    if (clear[aj * nx + ai] < r) return false;
    const seen = new Uint8Array(nx * ny), q = [[ai, aj]];
    seen[aj * nx + ai] = 1;
    while (q.length) {
      const [i, j] = q.pop();
      if (goal.has(j * nx + i)) return true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const k = jj * nx + ii;
        if (!seen[k] && clear[k] >= r) { seen[k] = 1; q.push([ii, jj]); }
      }
    }
    return false;
  };
  let lo = 0, hi = 150;
  for (let it = 0; it < 12; it++) { const m = (lo + hi) / 2; reach(m) ? (lo = m) : (hi = m); }
  return Math.floor(lo * 2);
}

// Точки «у окна»: полоса вдоль проёма на глубине depth от стены.
export function windowTargets(room, o, depth = 35, step = 5) {
  const op = opening(room, o), pts = [];
  for (let t = 0; t <= o.width; t += step) pts.push(add(add(op.p0, mul(op.W.dir, t)), mul(op.W.inward, depth)));
  return pts;
}
