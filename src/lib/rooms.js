// layout.json хранит несколько комнат. Код плана, проверок и 3D работает с одной комнатой
// в «старой» форме { meta, room, catalog, variants, cameras, palettes, rules } — её и собираем.

/** @param {any} layout @param {string} [roomId] */
export function roomView(layout, roomId) {
  const r = layout.rooms.find((x) => x.id === roomId) ?? layout.rooms[0];
  const { variants, cameras, ...room } = r;
  return { meta: layout.meta, room, catalog: layout.catalog, palettes: layout.palettes, rules: layout.rules, variants, cameras: cameras ?? [] };
}
