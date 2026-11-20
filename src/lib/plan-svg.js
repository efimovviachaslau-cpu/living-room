// 2D-чертёж плана из layout.json в SVG-строку + проверки эргономики.
// Общий код: им пользуются tools/sketch.mjs (PNG-наброски) и просмотрщик (вкладка 2D).

import * as G from './geometry.js';
import { electricOf, flatView } from './rooms.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Перенос строки по словам, n — примерная длина строки в символах.
function wrapText(s, n) {
  const w = [];
  let line = '';
  for (const word of s.split(' ')) {
    if ((line + ' ' + word).trim().length > n) { w.push(line); line = word; } else line = (line + ' ' + word).trim();
  }
  if (line) w.push(line);
  return w;
}

/**
 * @param {any} layout  содержимое layout.json
 * @param {string|null} variantId  id варианта или null — пустая комната
 * @param {{ withPanel?: boolean, square?: boolean }} [opts]
 *   withPanel — справа колонка с проверками и подпись внизу (для PNG);
 *   square — квадратный холст (Quick Look режет PNG до квадрата).
 * @returns {{ svg: string, checks: [string, string][], title: string, electric: any[] }}
 */
export function renderPlan(layout, variantId, opts = {}) {
  // frame + origin — режим частей для общего плана: комната рисуется в координатах квартиры.
  const { square = false, frame = null, origin = [0, 0], parts = false } = opts;
  const withPanel = parts ? false : opts.withPanel ?? true;
  const room = layout.room;
  const R = layout.rules;
  const S = frame?.S ?? 1.5; // px на см
  const PAD = withPanel ? { l: 110, r: 400, t: 110, b: 150 } : { l: 100, r: 100, t: 80, b: 100 };
  const xs = room.outline.map((p) => p[0]), ys = room.outline.map((p) => p[1]);
  const RX = Math.max(...xs), RY = Math.max(...ys);
  const W0 = PAD.l + RX * S + PAD.r, H0 = PAD.t + RY * S + PAD.b;
  const W = square ? Math.max(W0, H0) : W0, H = square ? Math.max(W0, H0) : H0;
  const px = frame
    ? ([x, y]) => [frame.l + (x + origin[0] - frame.minX) * S, frame.t + (frame.maxY - (y + origin[1])) * S]
    : ([x, y]) => [PAD.l + x * S, PAD.t + (RY - y) * S];
  const ptsAttr = (poly) => poly.map((p) => px(p).map((v) => v.toFixed(1)).join(',')).join(' ');

const C = {
  wall: '#3d3a36', ink: '#2b2b2b', mute: '#8a857d', dim: '#6d6a65', paper: '#fbfaf7',
  ok: '#2e8b57', warn: '#d48a00', bad: '#d23c2a', swing: '#9aa7b8',
  fill: { sofa: '#cdd8cc', armchair: '#cdd8cc', table: '#e8d9c2', chair: '#e8d9c2', cabinet: '#ddd6cb', tv: '#2b2b2b', rug: '#efe7f3', lamp: '#f3e3a6', bed: '#dde4ec', art: '#c08a5b', wardrobe: '#d8cfc2', pendant: 'none', kitchen: '#e4ded4', bath: '#eef4f8', bathroom: '#f7f9fa', mirror: '#cfd9de' },
};

function dimLine(a, b, label, off, color = C.dim) {
  // Размерная линия вдоль отрезка a-b, сдвинутая на off px по нормали (в экранных координатах).
  const [x1, y1] = px(a), [x2, y2] = px(b);
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 1) return '';
  const nx = -dy / L * off, ny = dx / L * off;
  const ax = x1 + nx, ay = y1 + ny, bx = x2 + nx, by = y2 + ny;
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const ang = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
  const rot = ang > 90 || ang < -90 ? ang + 180 : ang;
  const t = 4;
  const tick = (x, y) => `<line x1="${x - t}" y1="${y + t}" x2="${x + t}" y2="${y - t}" stroke="${color}" stroke-width="1.2"/>`;
  return `<g><line x1="${x1}" y1="${y1}" x2="${ax}" y2="${ay}" stroke="${color}" stroke-width="0.5" stroke-dasharray="2 2"/>
<line x1="${x2}" y1="${y2}" x2="${bx}" y2="${by}" stroke="${color}" stroke-width="0.5" stroke-dasharray="2 2"/>
<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${color}" stroke-width="0.8"/>${tick(ax, ay)}${tick(bx, by)}
<text x="${mx}" y="${my}" dy="-4" font-size="11" fill="${color}" text-anchor="middle" transform="rotate(${rot} ${mx} ${my})">${esc(label)}</text></g>`;
}

function gapLine(p, q, d, color) {
  const [x1, y1] = px(p), [x2, y2] = px(q);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.4" marker-start="url(#a-${color.slice(1)})" marker-end="url(#a-${color.slice(1)})"/>
<rect x="${mx - 15}" y="${my - 8}" width="30" height="15" rx="3" fill="${C.paper}" stroke="${color}" stroke-width="0.8"/>
<text x="${mx}" y="${my + 4}" font-size="10.5" font-weight="600" fill="${color}" text-anchor="middle">${Math.round(d)}</text></g>`;
}

const t = Object.fromEntries(room.walls.map((w) => [w.id, w.thickness]));
const n = room.outline.length;

function drawRoom() {
  return [drawWalls(false), drawFloor(), drawOpenings(true), drawFixtures(), drawDims()].join('\n');
}

function drawFloor() {
  return `<polygon points="${ptsAttr(room.outline)}" fill="${C.paper}"/>`;
}

// Стены: прямоугольник наружу от каждого ребра, с заходом на толщину соседних.
// skipShared — в общем плане общую стену рисует сосед.
function drawWalls(skipShared) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    if (skipShared && room.walls.find((x) => x.id === i)?.shared) continue;
    const w = G.wall(room, i);
    const prev = t[((i - 2 + n) % n) + 1], next = t[(i % n) + 1];
    const a = G.add(w.a, G.mul(w.dir, -prev)), b = G.add(w.b, G.mul(w.dir, next));
    const o = G.mul(w.inward, -t[i]);
    out.push(`<polygon points="${ptsAttr([a, b, G.add(b, o), G.add(a, o)])}" fill="${C.wall}"/>`);
  }
  return out.join('\n');
}

function drawOpenings(labels) {
  const out = [];
  for (const o of room.openings) {
    const op = G.opening(room, o);
    const out1 = G.mul(op.W.inward, -t[o.wall]);
    out.push(`<polygon points="${ptsAttr([op.p0, op.p1, G.add(op.p1, out1), G.add(op.p0, out1)])}" fill="${C.paper}"/>`);
    if (o.type === 'window') {
      for (const k of [0.3, 0.5, 0.7]) {
        const s = G.mul(op.W.inward, -t[o.wall] * k);
        out.push(`<line x1="${px(G.add(op.p0, s))[0]}" y1="${px(G.add(op.p0, s))[1]}" x2="${px(G.add(op.p1, s))[0]}" y2="${px(G.add(op.p1, s))[1]}" stroke="#6b8fb3" stroke-width="${k === 0.5 ? 2 : 1}"/>`);
      }
      const sill = G.mul(op.W.inward, o.sillDepth ?? 0);
      out.push(`<polygon points="${ptsAttr([op.p0, op.p1, G.add(op.p1, sill), G.add(op.p0, sill)])}" fill="none" stroke="#6b8fb3" stroke-width="0.8" stroke-dasharray="3 2"/>`);
    }
    if (o.type === 'door') {
      const sw = G.doorSwing(room, o);
      if (sw) {
        const end = G.add(sw.hinge, G.mul(sw.openDir, sw.leaf)), start = G.add(sw.hinge, G.mul(sw.closedDir, sw.leaf));
        const [sx, sy] = px(start), [ex, ey] = px(end), [hx, hy] = px(sw.hinge);
        const r = sw.leaf * S;
        const cross = (sx - hx) * (ey - hy) - (sy - hy) * (ex - hx);
        out.push(`<path d="M${sx},${sy} A${r},${r} 0 0 ${cross > 0 ? 1 : 0} ${ex},${ey}" fill="none" stroke="${C.swing}" stroke-width="1" stroke-dasharray="4 3"/>`);
        out.push(`<line x1="${hx}" y1="${hy}" x2="${ex}" y2="${ey}" stroke="${C.ink}" stroke-width="2"/>`);
      } else {
        if (o.leaf === 0) { /* проём без двери */ } else {
        // Дверь открывается из комнаты: показываем только полотно снаружи пунктиром.
        const hinge = o.swing?.hinge === 'end' ? op.p1 : op.p0;
        const e = G.add(G.add(hinge, G.mul(op.W.inward, -t[o.wall])), G.mul(op.W.inward, -(o.leaf ?? o.width) * 0.5));
        const [hx, hy] = px(G.add(hinge, G.mul(op.W.inward, -t[o.wall]))), [ex, ey] = px(e);
        out.push(`<line x1="${hx}" y1="${hy}" x2="${ex}" y2="${ey}" stroke="${C.mute}" stroke-width="1.5" stroke-dasharray="3 2"/>`);
        }
      }
      if (!labels) continue;
      const lab = G.add(op.mid, G.mul(op.W.inward, 6));
      const [lx, ly] = px(lab);
      const anchor = op.W.inward[0] > 0.5 ? 'start' : op.W.inward[0] < -0.5 ? 'end' : 'middle';
      out.push(`<text x="${lx}" y="${ly + 4}" font-size="10.5" font-style="italic" fill="${C.dim}" text-anchor="${anchor}">${esc(o.name)}</text>`);
    }
  }
  return out.join('\n');
}

function drawFixtures() {
  const out = [];
  for (const f of G.fixtures(layout)) {
    out.push(`<polygon points="${ptsAttr(f.poly)}" fill="${f.type === 'radiator' ? '#e9b8a8' : '#999'}" stroke="${C.ink}" stroke-width="0.8"/>`);
    if (f.type === 'radiator') {
      const [cx, cy] = px(G.mul(G.add(f.poly[0], f.poly[2]), 0.5));
      out.push(`<text x="${cx}" y="${cy - 14}" font-size="10" fill="${C.dim}" text-anchor="middle">батарея</text>`);
    }
  }
  for (const f of room.fixtures.filter((f) => f.type === 'ceilingLight')) {
    const [cx, cy] = px([f.x, f.y]);
    out.push(`<circle cx="${cx}" cy="${cy}" r="6" fill="none" stroke="${C.mute}"/><line x1="${cx - 6}" y1="${cy - 6}" x2="${cx + 6}" y2="${cy + 6}" stroke="${C.mute}"/><line x1="${cx - 6}" y1="${cy + 6}" x2="${cx + 6}" y2="${cy - 6}" stroke="${C.mute}"/>`);
  }
  return out.join('\n');
}

// Электрика: значки на внутренней грани стены и номера; список — в легенде.
const EL = { socket: ['Розетка', '#d27b00'], switch: ['Выключатель', '#2f6db5'], data: ['ТВ / интернет', '#7a5ab8'], panel: ['Щиток', '#5c5c5c'] };
function drawElectric(list, numbers = true) {
  const out = [];
  list.forEach((e, i) => {
    const W = G.wall(room, e.wall);
    const p = G.add(W.a, G.mul(W.dir, e.offset));
    const [x, y] = px(G.add(p, G.mul(W.inward, 4)));
    const col = EL[e.type][1];
    if (e.type === 'socket') out.push(`<circle cx="${x}" cy="${y}" r="4.5" fill="#fff" stroke="${col}" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="1.4" fill="${col}"/>`);
    else if (e.type === 'switch') out.push(`<circle cx="${x}" cy="${y}" r="4" fill="${col}"/><line x1="${x}" y1="${y}" x2="${x + 6}" y2="${y - 6}" stroke="${col}" stroke-width="1.4"/>`);
    else if (e.type === 'data') out.push(`<path d="M${x},${y - 5} L${x + 5},${y + 4} L${x - 5},${y + 4} Z" fill="#fff" stroke="${col}" stroke-width="1.5"/>`);
    else {
      const a = G.add(p, G.mul(W.dir, -15)), b = G.add(p, G.mul(W.dir, 15));
      out.push(`<polygon points="${ptsAttr([a, b, G.add(b, G.mul(W.inward, 8)), G.add(a, G.mul(W.inward, 8))])}" fill="#fff" stroke="${col}" stroke-width="1.5"/>`);
    }
    if (numbers) {
      const [nx, ny] = px(G.add(p, G.mul(W.inward, 15)));
      out.push(`<text x="${nx}" y="${ny + 3.5}" font-size="9.5" font-weight="700" fill="${col}" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="2.5">${i + 1}</text>`);
    }
  });
  return out.join('\n');
}

function drawDims() {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const w = G.wall(room, i);
    const cuts = [0, w.length];
    for (const o of room.openings.filter((o) => o.wall === i)) cuts.push(o.offset, o.offset + o.width);
    const fixed = [...new Set(cuts)].sort((a, b) => a - b);
    const off = (t[i] * S + 18);
    const side = -1; // наружу
    for (let k = 0; fixed.length > 2 && k + 1 < fixed.length; k++) {
      const a = G.add(w.a, G.mul(w.dir, fixed[k])), b = G.add(w.a, G.mul(w.dir, fixed[k + 1]));
      out.push(dimLine(a, b, `${Math.round(fixed[k + 1] - fixed[k])}`, side * off * (dimSign(w))));
    }
    const la = w.a, lb = w.b;
    const wl = room.walls.find((x) => x.id === i);
    out.push(dimLine(la, lb, `${wl?.name ?? 'С' + i}  ·  ${Math.round(w.length)}`, side * (off + (fixed.length > 2 ? 22 : 0)) * dimSign(w), C.ink));
  }
  return out.join('\n');
}

// Знак сдвига размерной линии: dimLine сдвигает влево от направления на экране.
function dimSign(w) {
  const [ax, ay] = px(w.a), [bx, by] = px(w.b);
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
  const left = [-dy / L, dx / L];
  const inScreen = [w.inward[0], -w.inward[1]];
  return left[0] * inScreen[0] + left[1] * inScreen[1] > 0 ? 1 : -1;
}

function drawItems(v) {
  const out = [];
  const above = (it) => (it.spec.kind === 'kitchen' || it.spec.kind === 'bathroom') && it.spec.floor === false;
  const order = (it) => (above(it) ? 5 : ({ rug: 0, tv: 3, art: 3, mirror: 3, pendant: 4 })[it.spec.kind] ?? 1);
  for (const it of [...v.items].sort((a, b) => order(a) - order(b))) {
    const k = it.spec.kind;
    if (above(it)) {
      // Верхние шкафы и вытяжка висят над нижними — только пунктирный контур.
      out.push(`<polygon points="${ptsAttr(it.poly)}" fill="none" stroke="#6d7f93" stroke-width="1" stroke-dasharray="5 3"/>`);
      continue;
    }
    if (k === 'pendant') {
      // Подвес над полом — пунктирный круг с крестом, как точка света.
      const [cx, cy] = px([it.x, it.y]), r = (it.spec.w / 2) * S;
      out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#b08a2e" stroke-width="1.2" stroke-dasharray="3 2"/>`);
      out.push(`<path d="M${cx - r * 0.6},${cy - r * 0.6}L${cx + r * 0.6},${cy + r * 0.6}M${cx - r * 0.6},${cy + r * 0.6}L${cx + r * 0.6},${cy - r * 0.6}" stroke="#b08a2e" stroke-width="1"/>`);
      continue;
    }
    if (it.spec.round) {
      const [cx, cy] = px([it.x, it.y]);
      out.push(`<circle cx="${cx}" cy="${cy}" r="${(it.spec.w / 2) * S}" fill="${C.fill[k]}" stroke="${C.ink}" stroke-width="1"/>`);
      out.push(`<text x="${cx}" y="${cy - it.spec.w / 2 * S - 4}" font-size="10" fill="${C.ink}" text-anchor="middle">${esc(it.spec.name)}</text>`);
      continue;
    }
    const dash = k === 'rug' ? ' stroke-dasharray="6 4"' : '';
    out.push(`<polygon points="${ptsAttr(it.poly)}" fill="${C.fill[k] ?? '#ddd'}" stroke="${k === 'rug' ? '#a58fb5' : C.ink}" stroke-width="${k === 'tv' ? 0 : 1.1}"${dash}/>`);
    if (k === 'sofa' || k === 'armchair') {
      // Спинка и подлокотники: спинка — 20 см у тыльной стороны.
      const f = G.facing(it.rot), back = G.mul(f, -1);
      const c = [it.x, it.y], hw = it.spec.w / 2, hd = it.spec.d / 2;
      const side = G.rotCW([1, 0], it.rot || 0);
      const p = (u, w) => G.add(c, G.add(G.mul(side, u), G.mul(back, w)));
      out.push(`<polygon points="${ptsAttr([p(-hw, hd), p(hw, hd), p(hw, hd - 20), p(-hw, hd - 20)])}" fill="#b5c4b3" stroke="${C.ink}" stroke-width="0.6"/>`);
      for (const s of [-1, 1]) out.push(`<polygon points="${ptsAttr([p(s * hw, hd - 20), p(s * (hw - 15), hd - 20), p(s * (hw - 15), -hd), p(s * hw, -hd)])}" fill="#b5c4b3" stroke="${C.ink}" stroke-width="0.6"/>`);
    }
    if (k === 'bed') {
      // Изголовье 8 см у тыльной стороны, две подушки, край одеяла.
      const f = G.facing(it.rot), back = G.mul(f, -1);
      const c = [it.x, it.y], hw = it.spec.w / 2, hd = it.spec.d / 2;
      const side = G.rotCW([1, 0], it.rot || 0);
      const p = (u, w) => G.add(c, G.add(G.mul(side, u), G.mul(back, w)));
      out.push(`<polygon points="${ptsAttr([p(-hw, hd), p(hw, hd), p(hw, hd - 8), p(-hw, hd - 8)])}" fill="#b9c3cf" stroke="${C.ink}" stroke-width="0.6"/>`);
      for (const s of [-1, 1]) {
        const u0 = s * 6, u1 = s * Math.min(hw - 10, 68);
        out.push(`<polygon points="${ptsAttr([p(u0, hd - 12), p(u1, hd - 12), p(u1, hd - 50), p(u0, hd - 50)])}" fill="#ffffff" stroke="${C.ink}" stroke-width="0.6"/>`);
      }
      out.push(`<polyline points="${ptsAttr([p(-hw, hd - 62), p(hw, hd - 62)])}" fill="none" stroke="${C.ink}" stroke-width="0.6" stroke-dasharray="4 3"/>`);
    }
    if (k === 'bath' || k === 'bathroom') {
      // Значки сантехники: чаша ванны, бачок и чаша унитаза, люк стиральной машины.
      const f = G.facing(it.rot), side = G.rotCW([1, 0], it.rot || 0), c = [it.x, it.y], hw = it.spec.w / 2, hd = it.spec.d / 2;
      const p = (u, w) => G.add(c, G.add(G.mul(side, u), G.mul(f, w)));
      if (k === 'bath') out.push(`<polygon points="${ptsAttr([p(-hw + 7, -hd + 7), p(hw - 7, -hd + 7), p(hw - 7, hd - 7), p(-hw + 7, hd - 7)])}" fill="#ffffff" stroke="${C.ink}" stroke-width="0.7" stroke-linejoin="round"/>`);
      if (it.spec.part === 'toilet') {
        out.push(`<polygon points="${ptsAttr([p(-hw, -hd), p(hw, -hd), p(hw, -hd + 18), p(-hw, -hd + 18)])}" fill="#e9edf0" stroke="${C.ink}" stroke-width="0.7"/>`);
        const [bx, by] = px(p(0, -hd + 18 + (it.spec.d - 18) / 2));
        out.push(`<ellipse cx="${bx}" cy="${by}" rx="${(hw - 3) * S}" ry="${((it.spec.d - 18) / 2 - 2) * S}" fill="#ffffff" stroke="${C.ink}" stroke-width="0.7" transform="rotate(${-(it.rot || 0) + 90} ${bx} ${by})"/>`);
      }
      if (it.spec.part === 'sinkwasher') {
        const [wx, wy] = px(c);
        out.push(`<circle cx="${wx}" cy="${wy}" r="${17 * S}" fill="none" stroke="${C.mute}" stroke-width="0.7" stroke-dasharray="3 2"/>`);
      }
    }
    if (k === 'wardrobe') out.push(`<polyline points="${ptsAttr([it.poly[0], it.poly[2]])}" fill="none" stroke="${C.ink}" stroke-width="0.6"/>`);
    if (k === 'tv' || k === 'art' || k === 'mirror') {
      // Висит на стене: подпись чуть в комнату от полоски.
      const lp = G.add([it.x, it.y], G.mul(G.facing(it.rot), it.spec.d / 2 + 9));
      const [lx, ly] = px(lp);
      const label = k === 'art' ? `${it.spec.name} ${it.spec.w}×${it.spec.h}` : it.spec.name;
      out.push(`<text x="${lx}" y="${ly + 4}" font-size="10" font-style="italic" fill="${C.dim}" text-anchor="middle">${esc(label)}</text>`);
      continue;
    }
    const [cx, cy] = px([it.x, it.y]);
    const vertical = Math.abs(Math.sin((it.rot || 0) * Math.PI / 180)) > 0.7;
    const span = (vertical ? it.spec.d : it.spec.w) * S;
    if (k === 'chair') continue;
    const size = span < 70 || k === 'kitchen' ? 9 : 10.5;
    const labY = k === 'rug' ? Math.min(...it.poly.map((p) => px(p)[1])) + 14 : cy;
    // Узкий предмет вдоль стены — подпись поворачиваем вдоль него.
    const turn = (vertical ? it.spec.d : it.spec.w) * S < 60 && (vertical ? it.spec.w : it.spec.d) * S >= 60 ? ` transform="rotate(-90 ${cx} ${labY})"` : '';
    out.push(`<g${turn}><text x="${cx}" y="${labY - 2}" font-size="${size}" font-weight="600" fill="${C.ink}" text-anchor="middle">${esc(it.spec.name)}</text>`);
    if (k !== 'kitchen' || it.spec.w >= 45) out.push(`<text x="${cx}" y="${labY + 11}" font-size="${size - 1}" fill="${C.dim}" text-anchor="middle">${it.spec.w}×${it.spec.d}</text>`);
    out.push('</g>');
  }
  return out.join('\n');
}

function analyze(v) {
  const res = [];
  const ann = [];
  const floor = v.items.filter((it) => it.spec.floor !== false && !it.spec.walkable);
  const fx = G.fixtures(layout);
  const swings = room.openings.map((o) => [o, G.doorSwing(room, o)]).filter(([, s]) => s);
  // Пересечения
  for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) {
    const a = floor[i], b = floor[j];
    // Стул задвинут под свой стол, модули гарнитура стоят вплотную — это не пересечения.
    const tucked = a.group === b.group && ([a.spec.kind, b.spec.kind].sort().join('-') === 'chair-table' || a.spec.kind === 'kitchen' && b.spec.kind === 'kitchen');
    if (!tucked && G.polyDistance(a.poly, b.poly).d === 0) res.push(['bad', `Пересечение: ${a.spec.name} и ${b.spec.name.toLowerCase()}`]);
  }
  const zRange = (o) => { const z0 = o.z ?? o.spec?.z ?? 0; return [z0, z0 + (o.h ?? o.spec?.h ?? 0)]; };
  const zOverlap = (a, b) => { const [a0, a1] = zRange(a), [b0, b1] = zRange(b); return a0 < b1 && b0 < a1; };
  // Вентканал не закрывать: шкаф до потолка перед решёткой — нужна решётка или вырез в шкафу.
  for (const f of fx.filter((f) => f.type === 'vent')) {
    const hit = v.items.find((it) => zOverlap({ ...it, spec: it.spec, z: it.z }, f) && G.polyDistance(it.poly, f.poly).d < 1);
    if (hit) res.push(['warn', `${hit.spec.name} закрывает вентканал — в шкафу нужна решётка или вырез`]);
  }
  // Фасады кухни открываются: зона перед дверцей (ширина дверцы, у ПММ 60, у духовки 50) не должна упираться в батарею.
  for (const it of floor.filter((i) => i.spec.kind === 'kitchen' && ['base', 'sink', 'stove', 'dishwasher'].includes(i.spec.part))) {
    const depth = it.spec.part === 'dishwasher' ? 60 : it.spec.part === 'stove' ? 50 : Math.min(it.spec.w, 45);
    const f = G.facing(it.rot), side = G.rotCW([1, 0], it.rot || 0), hw = it.spec.w / 2, hd = it.spec.d / 2;
    const c = G.add([it.x, it.y], G.mul(f, hd + 1));
    const zone = [G.add(c, G.mul(side, -hw)), G.add(c, G.mul(side, hw)), G.add(G.add(c, G.mul(side, hw)), G.mul(f, depth)), G.add(G.add(c, G.mul(side, -hw)), G.mul(f, depth))];
    for (const r of fx.filter((x) => x.type === 'radiator')) {
      if (G.polyDistance(zone, r.poly).d === 0) res.push(['bad', `Фасад «${it.spec.name}» упирается в батарею — не открыть`]);
    }
  }
  for (const it of floor) {
    for (const f of fx) if (f.type !== 'vent' && zOverlap(it, f) && G.polyDistance(it.poly, f.poly).d < (f.type === 'radiator' ? 10 : 0.1)) res.push(['bad', `${it.spec.name} вплотную к объекту «${f.name}»`]);
    for (const [o, s] of swings) if (G.polyDistance(it.poly, s.poly).d === 0) res.push(['bad', `${it.spec.name} в зоне открывания двери «${o.name}»`]);
    for (const p of it.poly) if (!G.pointInPoly(p, room.outline) && G.pointPolyDistance(p, room.outline) > 0.5) { res.push(['bad', `${it.spec.name} выходит за стену`]); break; }
  }
  // Зазоры между предметами
  for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) {
    const a = floor[i], b = floor[j];
    const r = G.polyDistance(a.poly, b.poly);
    const pair = [a.spec.kind, b.spec.kind].sort().join('-');
    if (pair === 'sofa-table' && a.group === b.group) {
      const [lo, hi] = R.sofaTable;
      ann.push(gapLine(r.p, r.q, r.d, r.d >= lo && r.d <= hi ? C.ok : C.warn));
      res.push([r.d >= lo && r.d <= hi ? 'ok' : 'warn', `Диван ↔ журнальный стол: ${Math.round(r.d)} см (норма ${lo}–${hi})`]);
      continue;
    }
  }
  // Остальные зазоры: от каждого предмета — только до ближайшего предмета другой группы,
  // иначе от стула тянутся линии к каждой тумбе гарнитура. Внутри группы зазор задуман.
  const gaps = new Map();
  for (const a of floor) {
    let best = null;
    for (const b of floor) {
      if (b === a || (a.group && a.group === b.group)) continue;
      if (a.spec.kind === 'chair' || b.spec.kind === 'chair') continue; // стул двигают — до него не меряем
      const r = G.polyDistance(a.poly, b.poly);
      if (!best || r.d < best.r.d) best = { b, r };
    }
    if (best) gaps.set([a.id, best.b.id].sort().join('|'), best.r);
  }
  for (const r of gaps.values()) if (r.d >= 25 && r.d <= 130) ann.push(gapLine(r.p, r.q, r.d, r.d >= R.passMain ? C.ok : r.d >= R.passSecondary ? C.warn : C.bad));
  // Зазоры до стен (только где реально ходят: 25–130 см)
  const chairGaps = [];
  for (const it of floor) for (const w of G.walls(room)) {
    const r = G.polySegDistance(it.poly, w.a, w.b);
    const isChair = it.spec.kind === 'chair', isBed = it.spec.kind === 'bed';
    if (isChair && G.dot(w.inward, G.facing(it.rot)) < 0.7) continue; // для стула важна только стена за спиной
    if (it.group === 'bed' && !isBed) continue; // тумбочки у кровати — не проход
    // Размер до стены не рисуем, если между предметом и стеной стоит другой предмет.
    const blocked = r.p && floor.some((o) => o !== it && G.pointInPoly(G.mul(G.add(r.p, r.q), 0.5), o.poly));
    // Ближайшая точка — угол стены, а не перпендикуляр: это размер «наискосок», он только путает.
    if (r.q && (G.len(G.sub(r.q, w.a)) < 0.5 || G.len(G.sub(r.q, w.b)) < 0.5)) continue;
    if (!blocked && r.d >= 25 && r.d <= 130) {
      const foot = isBed && G.dot(w.inward, G.facing(it.rot)) < -0.7;
      const [warn, ok] = isChair ? R.behindChair : foot ? R.bedFoot : isBed ? R.bedSide : [R.passSecondary, R.passMain];
      ann.push(gapLine(r.p, r.q, r.d, r.d >= ok ? C.ok : r.d >= warn ? C.warn : C.bad));
      if (isChair) chairGaps.push(r.d);
    }
  }
  if (chairGaps.length) {
    const m = Math.min(...chairGaps), M = Math.max(...chairGaps);
    res.push([m >= R.behindChair[1] ? 'ok' : m >= R.behindChair[0] ? 'warn' : 'bad', `За стульями до стены: ${Math.round(m)}${M - m >= 1 ? '–' + Math.round(M) : ''} см (норма ${R.behindChair[1]}, минимум ${R.behindChair[0]})`]);
  }
  // Проходы: от входа к остальным дверям и к окну (батарея низкая — к окну не мешает)
  const obstacles = [...floor.map((it) => it.poly), ...fx.map((f) => f.poly)];
  const grid = G.passGrid(layout, obstacles);
  const doors = room.openings.filter((o) => o.type === 'door');
  const entry = doors[0];
  for (const d of doors.slice(1)) {
    const w = G.bottleneck(grid, grid.doors[entry.id], [grid.doors[d.id]]);
    // К балкону/лоджии ходят редко — для такой двери хватает нормы второстепенного прохода.
    const [ok, min] = d.pass === 'secondary' ? [R.passSecondary, R.passSecondary - 10] : [R.passMain, R.passMin];
    const cap = w >= Math.min(entry.width, d.width) - 3 ? ' (не уже двери)' : '';
    const lvl = w >= ok || cap ? 'ok' : w >= min ? 'warn' : 'bad';
    res.push([lvl, `Проход от входа к двери «${d.name.replace('В спальню', 'спальня')}»: ${w} см${cap}${d.pass === 'secondary' ? ` (норма ≥ ${ok})` : ''}`]);
  }
  const win = room.openings.find((o) => o.type === 'window');
  if (win) {
    const g2 = G.passGrid(layout, [...floor.map((it) => it.poly), ...fx.filter((f) => f.type !== 'radiator').map((f) => f.poly)]);
    const w = G.bottleneck(g2, g2.doors[entry.id], G.windowTargets(room, win));
    res.push([w >= R.passSecondary ? 'ok' : 'warn', `Подход к окну (открыть створку): ${w} см (норма ≥ ${R.passSecondary})`]);
  }
  // Кровать: подойти с каждой длинной стороны и место в ногах
  for (const bed of v.items.filter((it) => it.spec.kind === 'bed')) {
    const f = G.facing(bed.rot), side = G.rotCW([1, 0], bed.rot || 0);
    const c = [bed.x, bed.y], hw = bed.spec.w / 2, hd = bed.spec.d / 2;
    for (const s of [-1, 1]) {
      // Подпись стороны — по стене, к которой она обращена («со стороны лоджии»).
      const dir = G.mul(side, s);
      const wl = G.walls(room).find((w) => G.dot(w.inward, dir) < -0.7);
      const wd = wl && room.walls.find((x) => x.id === wl.id);
      const adj = { 'запад': 'западной', 'восток': 'восточной', 'север': 'северной', 'юг': 'южной' }[wd?.side];
      const label = adj ? `с ${adj} стороны${wd.to ? ` (${wd.to})` : ''}` : (s < 0 ? 'слева' : 'справа');
      const targets = [];
      // Цель — любая точка полосы вдоль борта (от 15 до 90 см от кровати), кроме зоны тумбочек у изголовья.
      for (let t = -hd + 70; t <= hd - 15; t += 5) for (let o = 15; o <= 90; o += 5) targets.push(G.add(G.add(c, G.mul(side, s * (hw + o))), G.mul(f, t)));
      // Кровать придвинута боком к стене — это решение, а не узкий проход.
      const wallGap = wl ? G.polySegDistance(bed.poly, wl.a, wl.b).d : Infinity;
      if (wallGap < 10) { res.push(['info', `Кровать придвинута к стене ${label.replace(/^с /, 'с ')}: подход только с другой стороны`]); continue; }
      const w = G.bottleneck(grid, grid.doors[entry.id], targets);
      const [lo, ok] = R.bedSide;
      res.push([w >= ok ? 'ok' : w >= lo ? 'warn' : 'bad', `Подход к кровати ${label}: ${w} см (норма ${ok}, минимум ${lo})`]);
    }
    for (const w of G.walls(room)) {
      if (G.dot(w.inward, f) > -0.7) continue; // только стена напротив изножья
      const r = G.polySegDistance(bed.poly, w.a, w.b);
      const [lo, ok] = R.bedFoot;
      res.push([r.d >= ok ? 'ok' : r.d >= lo ? 'warn' : 'bad', `В ногах кровати до стены: ${Math.round(r.d)} см (норма ${ok}, минимум ${lo})`]);
    }
  }
  // Место перед предметом с нормой spec.front (ванна, раковина, унитаз) и от оси унитаза до соседей (spec.axis).
  const rect = (a, b, dir, depth) => [a, b, G.add(b, G.mul(dir, depth)), G.add(a, G.mul(dir, depth))];
  const clearAlong = (it, seg, zone) => {
    let d = Infinity;
    for (const o of floor) if (o !== it && G.polyDistance(zone, o.poly).d === 0) d = Math.min(d, G.polyDistance(seg, o.poly).d);
    for (const w of G.walls(room)) if (G.polySegDistance(zone, w.a, w.b).d === 0) d = Math.min(d, G.polySegDistance(seg, w.a, w.b).d);
    return d;
  };
  for (const it of floor.filter((i) => i.spec.front)) {
    const f = G.facing(it.rot), side = G.rotCW([1, 0], it.rot || 0), c = [it.x, it.y];
    const hw = it.spec.w / 2 - 1, hd = it.spec.d / 2;
    // Подходить достаточно с участка шириной 60 (у ванны — не со всей длины): берём лучший участок.
    const win = Math.min(2 * hw, 60);
    let d = 0;
    for (let u = -hw; u + win <= hw + 0.01; u += 5) {
      const e0 = G.add(G.add(c, G.mul(f, hd)), G.mul(side, u)), e1 = G.add(e0, G.mul(side, win));
      d = Math.max(d, clearAlong(it, [e0, e1], rect(e0, e1, f, 300)));
    }
    const n = it.spec.front;
    res.push([d >= n ? 'ok' : d >= n - 10 ? 'warn' : 'bad', `Перед «${it.spec.name}»: ${Math.round(d)} см (норма ${n})`]);
  }
  for (const it of floor.filter((i) => i.spec.axis)) {
    const f = G.facing(it.rot), side = G.rotCW([1, 0], it.rot || 0), c = [it.x, it.y], hd = it.spec.d / 2;
    const a0 = G.add(c, G.mul(f, -hd + 1)), a1 = G.add(c, G.mul(f, hd));
    const d = Math.min(...[-1, 1].map((s) => clearAlong(it, [a0, a1], rect(a0, a1, G.mul(side, s), 80))));
    const n = it.spec.axis;
    res.push([d >= n ? 'ok' : d >= n - 5 ? 'warn' : 'bad', `От оси «${it.spec.name}» до стены или предмета сбоку: ${Math.round(d)} см (норма ≥ ${n})`]);
  }
  // ТВ
  const tv = v.items.find((it) => it.spec.kind === 'tv');
  const sofa = v.items.find((it) => it.spec.kind === 'sofa') ?? v.items.find((it) => it.spec.kind === 'bed');
  if (tv && sofa) {
    const f = G.facing(sofa.rot);
    // Глаза: на диване ~40 см от переднего края, в кровати — сидя у изголовья, ~60 см от него.
    const eyeOff = sofa.spec.kind === 'bed' ? -sofa.spec.d / 2 + 60 : -sofa.spec.d / 2 + 40;
    const eye = G.add([sofa.x, sofa.y], G.mul(f, eyeOff));
    const to = G.sub([tv.x, tv.y], eye);
    const dist = G.len(to);
    const diag = parseInt(tv.spec.name.match(/\d+/)[0], 10) * 2.54;
    const ang = Math.acos(G.dot(G.norm(to), f)) * 180 / Math.PI;
    const k = dist / diag;
    res.push([k >= 1 && k <= 1.7 ? 'ok' : 'warn', `ТВ ${tv.spec.name.split(' ')[1]}: ${Math.round(dist)} см от глаз = ${k.toFixed(1)} диагонали (4K: 1–1.5, терпимо до 1.7)`]);
    res.push([ang <= 30 ? 'ok' : 'warn', `ТВ в стороне от оси ${sofa.spec.kind === 'bed' ? 'кровати' : 'дивана'} на ${Math.round(ang)}° (≤ 30°)`]);
    const [ex, ey] = px(eye), [tx, ty] = px([tv.x, tv.y]);
    ann.push(`<line x1="${ex}" y1="${ey}" x2="${tx}" y2="${ty}" stroke="#7a6fb0" stroke-width="1" stroke-dasharray="1 4"/><circle cx="${ex}" cy="${ey}" r="3" fill="#7a6fb0"/>`);
  }
  return { res, ann: ann.join('\n') };
}

function sidePanel(title, lines, sub, electric = []) {
  const x = PAD.l + RX * S + 90, y0 = PAD.t - 10;
  const out = [];
  let y = y0;
  for (const l of wrapText(title, 30)) { out.push(`<text x="${x}" y="${y}" font-size="20" font-weight="700" fill="${C.ink}">${esc(l)}</text>`); y += 24; }
  const wrap = wrapText;
  if (sub) for (const l of wrap(sub, 46)) { out.push(`<text x="${x}" y="${y}" font-size="12" fill="${C.dim}">${esc(l)}</text>`); y += 16; }
  y += 10;
  const icon = { ok: ['✓', C.ok], warn: ['!', C.warn], bad: ['✗', C.bad], info: ['·', C.mute] };
  for (const [lvl, text] of lines) {
    const [ic, col] = icon[lvl];
    const ws = wrap(text, 44);
    out.push(`<text x="${x}" y="${y}" font-size="13" font-weight="700" fill="${col}">${ic}</text>`);
    for (const l of ws) { out.push(`<text x="${x + 16}" y="${y}" font-size="12" fill="${C.ink}">${esc(l)}</text>`); y += 15; }
    y += 5;
  }
  if (electric.length) {
    y += 12;
    out.push(`<text x="${x}" y="${y}" font-size="14" font-weight="700" fill="${C.ink}">Электрика</text>`);
    y += 18;
    for (const e of electric) {
      const col = EL[e.type][1];
      out.push(`<text x="${x}" y="${y}" font-size="11.5" font-weight="700" fill="${col}">${e.num}</text>`);
      const head = `${e.kindName}${e.type !== 'panel' && e.count > 1 ? ` ×${e.count}` : ''}, ${e.z} см — ${e.label}`;
      for (const l of wrap(head, 46)) { out.push(`<text x="${x + 18}" y="${y}" font-size="11.5" fill="${C.ink}">${esc(l)}</text>`); y += 14; }
      y += 3;
    }
  }
  return out.join('\n');
}

function svg(title, body, side) {
  const markers = [C.ok, C.warn, C.bad].map((c) => `<marker id="a-${c.slice(1)}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="${c}"/></marker>`).join('');
  const foot = `${room.name}: набросок по площади ${room.area} м², плану БТИ и фото. Размеры ориентировочные до замеров. ${layout.meta.updated}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${withPanel ? `width="${W}" height="${H}"` : 'width="100%"'} viewBox="0 0 ${W} ${H}" font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif">
<defs>${markers}</defs>
<rect width="${W}" height="${H}" fill="#ffffff"/>
${body}
${side}
${withPanel ? `<text x="${PAD.l - 60}" y="${H - 18}" font-size="11" fill="${C.mute}">${esc(foot)}</text>` : ''}
</svg>`;
}


  const elist = variantId ? electricOf(layout, variantId) : layout.room.electric ?? [];
  // num — номер на плане, count — сколько гнёзд/клавиш.
  const electric = elist.map((e, i) => ({ ...e, num: i + 1, count: e.n, kindName: EL[e.type][0], wallName: room.walls.find((w) => w.id === e.wall)?.name }));
  if (parts) {
    const v = variantId ? G.resolveVariant(layout, variantId) : null;
    const xs2 = room.outline.map((p) => p[0]), ys2 = room.outline.map((p) => p[1]);
    const [lx, ly] = px([(Math.min(...xs2) + Math.max(...xs2)) / 2, (Math.min(...ys2) + Math.max(...ys2)) / 2]);
    return {
      floor: drawFloor(), walls: drawWalls(true), openings: drawOpenings(false), fixtures: drawFixtures(),
      items: v ? drawItems(v) : '', electric: drawElectric(elist, false),
      label: `<text x="${lx}" y="${ly}" font-size="15" font-weight="700" fill="${C.ink}" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="4" opacity="0.92">${esc(room.name)}<tspan x="${lx}" dy="17" font-size="12" font-weight="400" fill="${C.dim}">${room.area} м²${v && layout.variants.length > 1 ? ` · вариант ${v.id}` : ''}</tspan></text>`,
    };
  }
  let body = drawRoom(), side = '', checks = [], title;
  if (variantId) {
    const v = G.resolveVariant(layout, variantId);
    const { res, ann } = analyze(v);
    title = `${room.name}, вариант ${v.id} — ${v.name}`;
    body += '\n' + drawItems(v) + '\n' + ann + '\n' + drawElectric(elist);
    checks = res;
    if (withPanel) side = sidePanel(title, res, v.idea, electric);
  } else {
    title = `${room.name} — геометрия`;
    checks = [
      ['info', `${RX} × ${RY} см = ${(RX * RY / 1e4).toFixed(2)} м², потолок ${room.height.value}`],
      ...room.openings.map((o) => ['info', `${o.name}: ${o.width} см${o.type === 'window' ? `, подоконник ${o.sill}, высота ${o.height}` : ''}`]),
    ];
    if (layout.meta.status === 'estimate') checks.push(['warn', 'Все размеры — оценка. Точные цифры дадут замеры.']);
    if (withPanel) side = sidePanel(title, checks, 'Начало координат — ' + (room.originNote ?? 'угол (0, 0) контура.'));
  }
  return { svg: svg(title, body, side), checks, title, electric };
}

// Общий план квартиры: все комнаты с выбранными вариантами в одних координатах.
export function renderOverview(layout, vmap = {}, opts = {}) {
  const flat = flatView(layout, vmap);
  const S = opts.S ?? 1, pad = opts.pad ?? 50;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { L, origin } of flat) for (const [x, y] of L.room.outline) {
    minX = Math.min(minX, x + origin[0]); maxX = Math.max(maxX, x + origin[0]);
    minY = Math.min(minY, y + origin[1]); maxY = Math.max(maxY, y + origin[1]);
  }
  minX -= 40; maxX += 40; minY -= 40; maxY += 40; // толщина наружных стен
  const frame = { minX, maxY, S, l: pad, t: pad + (opts.title ? 40 : 0) };
  let W = (maxX - minX) * S + 2 * pad, H = (maxY - minY) * S + 2 * pad + (opts.title ? 40 : 0) + (opts.legend ? 40 : 0);
  if (opts.square) W = H = Math.max(W, H); // Quick Look режет PNG до квадрата
  const parts = flat.map(({ L, variantId, origin }) => renderPlan(L, variantId, { parts: true, frame, origin }));
  const layer = (k) => parts.map((p) => p[k]).join('\n');
  const area = layout.rooms.filter((r) => r.id !== 'balkon').reduce((s, r) => s + r.area, 0);
  const legend = opts.legend ? `<g font-size="12" fill="#2b2b2b">
<circle cx="${pad + 6}" cy="${H - pad / 2 - 20}" r="4.5" fill="#fff" stroke="#d27b00" stroke-width="1.6"/><text x="${pad + 16}" y="${H - pad / 2 - 16}">розетка</text>
<circle cx="${pad + 96}" cy="${H - pad / 2 - 20}" r="4" fill="#2f6db5"/><text x="${pad + 106}" y="${H - pad / 2 - 16}">выключатель</text>
<path d="M${pad + 206},${H - pad / 2 - 25} l5,9 l-10,0 Z" fill="#fff" stroke="#7a5ab8" stroke-width="1.5"/><text x="${pad + 216}" y="${H - pad / 2 - 16}">ТВ / интернет</text>
<rect x="${pad + 316}" y="${H - pad / 2 - 24}" width="16" height="7" fill="#fff" stroke="#5c5c5c" stroke-width="1.5"/><text x="${pad + 338}" y="${H - pad / 2 - 16}">щиток</text></g>` : '';
  const title = opts.title ? `<text x="${pad}" y="${pad + 4}" font-size="22" font-weight="700" fill="#2b2b2b">Квартира · ${Math.round(area * 10) / 10} м² + балкон</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${opts.fixed ? `width="${W}" height="${H}"` : 'width="100%"'} viewBox="0 0 ${W} ${H}" font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif">
<rect width="${W}" height="${H}" fill="#ffffff"/>
${title}
${layer('floor')}
${layer('walls')}
${layer('openings')}
${layer('fixtures')}
${layer('items')}
${opts.electric === false ? '' : layer('electric')}
${layer('label')}
${legend}
</svg>`;
  return { svg, width: W, height: H, flat };
}
