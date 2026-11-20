// 2D-чертёж плана из layout.json в SVG-строку + проверки эргономики.
// Общий код: им пользуются tools/sketch.mjs (PNG-наброски) и просмотрщик (вкладка 2D).

import * as G from './geometry.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * @param {any} layout  содержимое layout.json
 * @param {string|null} variantId  id варианта или null — пустая комната
 * @param {{ withPanel?: boolean, square?: boolean }} [opts]
 *   withPanel — справа колонка с проверками и подпись внизу (для PNG);
 *   square — квадратный холст (Quick Look режет PNG до квадрата).
 * @returns {{ svg: string, checks: [string, string][], title: string }}
 */
export function renderPlan(layout, variantId, opts = {}) {
  const { withPanel = true, square = false } = opts;
  const room = layout.room;
  const R = layout.rules;
  const S = 1.5; // px на см
  const PAD = withPanel ? { l: 110, r: 400, t: 110, b: 150 } : { l: 100, r: 100, t: 80, b: 100 };
  const xs = room.outline.map((p) => p[0]), ys = room.outline.map((p) => p[1]);
  const RX = Math.max(...xs), RY = Math.max(...ys);
  const W0 = PAD.l + RX * S + PAD.r, H0 = PAD.t + RY * S + PAD.b;
  const W = square ? Math.max(W0, H0) : W0, H = square ? Math.max(W0, H0) : H0;
  const px = ([x, y]) => [PAD.l + x * S, PAD.t + (RY - y) * S];
  const ptsAttr = (poly) => poly.map((p) => px(p).map((v) => v.toFixed(1)).join(',')).join(' ');

const C = {
  wall: '#3d3a36', ink: '#2b2b2b', mute: '#8a857d', dim: '#6d6a65', paper: '#fbfaf7',
  ok: '#2e8b57', warn: '#d48a00', bad: '#d23c2a', swing: '#9aa7b8',
  fill: { sofa: '#cdd8cc', armchair: '#cdd8cc', table: '#e8d9c2', chair: '#e8d9c2', cabinet: '#ddd6cb', tv: '#2b2b2b', rug: '#efe7f3', lamp: '#f3e3a6' },
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

function drawRoom() {
  const out = [];
  const t = Object.fromEntries(room.walls.map((w) => [w.id, w.thickness]));
  // Стены: прямоугольник наружу от каждого ребра, с заходом на толщину соседних.
  const n = room.outline.length;
  for (let i = 1; i <= n; i++) {
    const w = G.wall(room, i);
    const prev = t[((i - 2 + n) % n) + 1], next = t[(i % n) + 1];
    const a = G.add(w.a, G.mul(w.dir, -prev)), b = G.add(w.b, G.mul(w.dir, next));
    const o = G.mul(w.inward, -t[i]);
    out.push(`<polygon points="${ptsAttr([a, b, G.add(b, o), G.add(a, o)])}" fill="${C.wall}"/>`);
  }
  out.push(`<polygon points="${ptsAttr(room.outline)}" fill="${C.paper}"/>`);
  // Проёмы
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
        // Дверь открывается из комнаты: показываем только полотно снаружи пунктиром.
        const hinge = o.swing?.hinge === 'end' ? op.p1 : op.p0;
        const e = G.add(G.add(hinge, G.mul(op.W.inward, -t[o.wall])), G.mul(op.W.inward, -(o.leaf ?? o.width) * 0.5));
        const [hx, hy] = px(G.add(hinge, G.mul(op.W.inward, -t[o.wall]))), [ex, ey] = px(e);
        out.push(`<line x1="${hx}" y1="${hy}" x2="${ex}" y2="${ey}" stroke="${C.mute}" stroke-width="1.5" stroke-dasharray="3 2"/>`);
      }
      const lab = G.add(op.mid, G.mul(op.W.inward, 6));
      const [lx, ly] = px(lab);
      const anchor = op.W.inward[0] > 0.5 ? 'start' : op.W.inward[0] < -0.5 ? 'end' : 'middle';
      out.push(`<text x="${lx}" y="${ly + 4}" font-size="10.5" font-style="italic" fill="${C.dim}" text-anchor="${anchor}">${esc(o.name)}</text>`);
    }
  }
  // Оборудование
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
  // Размерные цепочки по стенам (снаружи)
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
    out.push(dimLine(la, lb, `${wl?.name ?? 'С' + i}  ·  ${w.length}`, side * (off + (fixed.length > 2 ? 22 : 0)) * dimSign(w), C.ink));
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
  const order = (it) => (it.spec.kind === 'rug' ? 0 : it.spec.kind === 'tv' ? 3 : 1);
  for (const it of [...v.items].sort((a, b) => order(a) - order(b))) {
    const k = it.spec.kind;
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
    if (k === 'tv') continue;
    const [cx, cy] = px([it.x, it.y]);
    const vertical = Math.abs(Math.sin((it.rot || 0) * Math.PI / 180)) > 0.7;
    const span = (vertical ? it.spec.d : it.spec.w) * S;
    if (k === 'chair') continue;
    const size = span < 70 ? 9 : 10.5;
    const labY = k === 'rug' ? Math.min(...it.poly.map((p) => px(p)[1])) + 14 : cy;
    out.push(`<text x="${cx}" y="${labY - 2}" font-size="${size}" font-weight="600" fill="${C.ink}" text-anchor="middle">${esc(it.spec.name)}</text>`);
    out.push(`<text x="${cx}" y="${labY + 11}" font-size="${size - 1}" fill="${C.dim}" text-anchor="middle">${it.spec.w}×${it.spec.d}</text>`);
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
    const tucked = a.group === b.group && [a.spec.kind, b.spec.kind].sort().join('-') === 'chair-table';
    if (!tucked && G.polyDistance(a.poly, b.poly).d === 0) res.push(['bad', `Пересечение: ${a.spec.name} и ${b.spec.name.toLowerCase()}`]);
  }
  for (const it of floor) {
    for (const f of fx) if (G.polyDistance(it.poly, f.poly).d < (f.type === 'radiator' ? 10 : 0.1)) res.push(['bad', `${it.spec.name} вплотную к объекту «${f.name}»`]);
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
    if (a.group === b.group && a.group === 'dining') continue;
    if (r.d >= 25 && r.d <= 130) ann.push(gapLine(r.p, r.q, r.d, r.d >= R.passMain ? C.ok : r.d >= R.passSecondary ? C.warn : C.bad));
  }
  // Зазоры до стен (только где реально ходят: 25–130 см)
  const chairGaps = [];
  for (const it of floor) for (const w of G.walls(room)) {
    const r = G.polySegDistance(it.poly, w.a, w.b);
    const isChair = it.spec.kind === 'chair';
    if (isChair && G.dot(w.inward, G.facing(it.rot)) < 0.7) continue; // для стула важна только стена за спиной
    if (r.d >= 25 && r.d <= 130) {
      const ok = isChair ? R.behindChair[1] : R.passMain, warn = isChair ? R.behindChair[0] : R.passSecondary;
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
    const lvl = w >= R.passMain ? 'ok' : w >= R.passMin ? 'warn' : 'bad';
    const cap = w >= Math.min(entry.width, d.width) - 3 ? ' (не уже двери)' : '';
    res.push([lvl, `Проход от входа к двери «${d.name.replace('В спальню', 'спальня')}»: ${w} см${cap}`]);
  }
  const win = room.openings.find((o) => o.type === 'window');
  if (win) {
    const g2 = G.passGrid(layout, [...floor.map((it) => it.poly), ...fx.filter((f) => f.type !== 'radiator').map((f) => f.poly)]);
    const w = G.bottleneck(g2, g2.doors[entry.id], G.windowTargets(room, win));
    res.push([w >= R.passSecondary ? 'ok' : 'warn', `Подход к окну (открыть створку): ${w} см (норма ≥ ${R.passSecondary})`]);
  }
  // ТВ
  const tv = v.items.find((it) => it.spec.kind === 'tv'), sofa = v.items.find((it) => it.spec.kind === 'sofa');
  if (tv && sofa) {
    const f = G.facing(sofa.rot);
    const eye = G.add([sofa.x, sofa.y], G.mul(f, -sofa.spec.d / 2 + 40));
    const to = G.sub([tv.x, tv.y], eye);
    const dist = G.len(to);
    const diag = parseInt(tv.spec.name.match(/\d+/)[0], 10) * 2.54;
    const ang = Math.acos(G.dot(G.norm(to), f)) * 180 / Math.PI;
    const k = dist / diag;
    res.push([k >= 1 && k <= 1.7 ? 'ok' : 'warn', `ТВ ${tv.spec.name.split(' ')[1]}: ${Math.round(dist)} см от глаз = ${k.toFixed(1)} диагонали (4K: 1–1.5, терпимо до 1.7)`]);
    res.push([ang <= 30 ? 'ok' : 'warn', `ТВ в стороне от оси дивана на ${Math.round(ang)}° (≤ 30°)`]);
    const [ex, ey] = px(eye), [tx, ty] = px([tv.x, tv.y]);
    ann.push(`<line x1="${ex}" y1="${ey}" x2="${tx}" y2="${ty}" stroke="#7a6fb0" stroke-width="1" stroke-dasharray="1 4"/><circle cx="${ex}" cy="${ey}" r="3" fill="#7a6fb0"/>`);
  }
  return { res, ann: ann.join('\n') };
}

function sidePanel(title, lines, sub) {
  const x = PAD.l + RX * S + 90, y0 = PAD.t - 10;
  const out = [`<text x="${x}" y="${y0}" font-size="20" font-weight="700" fill="${C.ink}">${esc(title)}</text>`];
  let y = y0 + 24;
  const wrap = (s, n) => { const w = []; let line = ''; for (const word of s.split(' ')) { if ((line + ' ' + word).trim().length > n) { w.push(line); line = word; } else line = (line + ' ' + word).trim(); } if (line) w.push(line); return w; };
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
  return out.join('\n');
}

function svg(title, body, side) {
  const markers = [C.ok, C.warn, C.bad].map((c) => `<marker id="a-${c.slice(1)}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="${c}"/></marker>`).join('');
  const foot = `Набросок по площади 17.2 м², плану БТИ и фото. Размеры ориентировочные до замеров. ${layout.meta.updated}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${withPanel ? `width="${W}" height="${H}"` : 'width="100%"'} viewBox="0 0 ${W} ${H}" font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif">
<defs>${markers}</defs>
<rect width="${W}" height="${H}" fill="#ffffff"/>
${body}
${side}
${withPanel ? `<text x="${PAD.l - 60}" y="${H - 18}" font-size="11" fill="${C.mute}">${esc(foot)}</text>` : ''}
</svg>`;
}


  let body = drawRoom(), side = '', checks = [], title;
  if (variantId) {
    const v = G.resolveVariant(layout, variantId);
    const { res, ann } = analyze(v);
    title = `Вариант ${v.id} — ${v.name}`;
    body += '\n' + drawItems(v) + '\n' + ann;
    checks = res;
    if (withPanel) side = sidePanel(title, res, v.idea);
  } else {
    title = 'Зал — геометрия';
    checks = [
      ['info', `${RX} × ${RY} см = ${(RX * RY / 1e4).toFixed(2)} м², потолок ${room.height.value}`],
      ...room.openings.map((o) => ['info', `${o.name}: ${o.width} см${o.type === 'window' ? `, подоконник ${o.sill}, высота ${o.height}` : ''}`]),
    ];
    if (layout.meta.status === 'estimate') checks.push(['warn', 'Все размеры — оценка. Точные цифры дадут замеры.']);
    if (withPanel) side = sidePanel(title, checks, 'Начало координат — угол у окна и двери в спальню 9.2. Стены по часовой: С1 запад, С2 север, С3 восток, С4 окно.');
  }
  return { svg: svg(title, body, side), checks, title };
}
