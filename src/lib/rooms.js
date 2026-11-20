// layout.json хранит несколько комнат. Код плана, проверок и 3D работает с одной комнатой
// в «старой» форме { meta, room, catalog, variants, cameras, palettes, rules } — её и собираем.

/** @param {any} layout @param {string} [roomId] */
export function roomView(layout, roomId) {
  const r = layout.rooms.find((x) => x.id === roomId) ?? layout.rooms[0];
  const { variants, cameras, ...room } = r;
  return { meta: layout.meta, room, catalog: layout.catalog, palettes: layout.palettes, rules: layout.rules, variants, cameras: cameras ?? [] };
}

// Электрика комнаты: общая (у дверей) + своя у варианта (у мебели).
export function electricOf(L, variantId) {
  const v = L.variants.find((x) => x.id === variantId);
  return [...(L.room.electric ?? []), ...(v?.electric ?? [])];
}

// Все комнаты с выбранными вариантами — для общего плана и общего 3D.
export function flatView(layout, vmap = {}) {
  return layout.rooms.map((r) => {
    const L = roomView(layout, r.id);
    const variantId = L.variants.some((v) => v.id === vmap[r.id]) ? vmap[r.id] : L.variants[0].id;
    return { L, variantId, origin: r.origin };
  });
}

// Условная «комната» с габаритами всей квартиры: для камер, света и глубины в общем 3D.
export function flatPseudo(layout) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of layout.rooms) for (const [x, y] of r.outline) {
    minX = Math.min(minX, x + r.origin[0]); maxX = Math.max(maxX, x + r.origin[0]);
    minY = Math.min(minY, y + r.origin[1]); maxY = Math.max(maxY, y + r.origin[1]);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, span = Math.max(maxX - minX, maxY - minY);
  const area = layout.rooms.filter((r) => r.id !== 'balkon').reduce((s, r) => s + r.area, 0);
  return {
    meta: layout.meta, catalog: layout.catalog, palettes: layout.palettes, rules: layout.rules,
    room: {
      id: 'all', name: 'Вся квартира', area: Math.round(area * 10) / 10, height: { value: 250 },
      outline: [[minX, minY], [minX, maxY], [maxX, maxY], [maxX, minY]], walls: [], openings: [], fixtures: [],
    },
    variants: [{ id: 'A', name: 'Вся квартира', idea: '', items: [] }],
    cameras: [
      { id: 'overview', name: 'Обзор', pos: [cx + span * 0.55, minY - span * 0.75, span * 0.95], target: [cx, cy, 0], fov: 45 },
      { id: 'iso', name: 'С другой стороны', pos: [cx - span * 0.55, maxY + span * 0.7, span * 0.95], target: [cx, cy, 0], fov: 45 },
      { id: 'top', name: 'Сверху', type: 'top' },
    ],
  };
}
