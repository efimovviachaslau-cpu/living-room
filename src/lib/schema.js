// Схема layout.json (zod). Проверяется перед сборкой (tools/check.mjs) и в dev-режиме.
import { z } from 'zod';

const cm = z.number().finite();
const pt2 = z.tuple([cm, cm]);
const pt3 = z.tuple([cm, cm, cm]);
const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'цвет вида #rrggbb');

const opening = z.object({
  id: z.string(), type: z.enum(['window', 'door']), name: z.string(),
  wall: z.number().int().positive(), offset: cm, width: cm.positive(), height: cm.positive(),
  sill: cm.optional(), sillDepth: cm.optional(), sillOverhang: cm.optional(), sashes: z.number().int().optional(), leaf: cm.optional(),
  swing: z.object({ into: z.enum(['room', 'out']), hinge: z.enum(['start', 'end']) }).optional(),
  link: z.string().regex(/^[\w-]+:[\w-]+$/, 'комната:проём').optional(),
  src: z.string().optional(),
});

const fixture = z.object({
  id: z.string(), type: z.string(), name: z.string(),
  wall: z.number().int().positive().optional(), offset: cm.optional(),
  w: cm.optional(), d: cm.optional(), h: cm.optional(), z: cm.optional(),
  x: cm.optional(), y: cm.optional(), drop: cm.optional(), src: z.string().optional(),
});

const spec = z.object({
  name: z.string(),
  kind: z.enum(['sofa', 'armchair', 'table', 'chair', 'cabinet', 'tv', 'rug', 'lamp', 'bed', 'pendant', 'art', 'wardrobe', 'mirror', 'kitchen', 'bath', 'bathroom']),
  part: z.enum(['base', 'sink', 'stove', 'dishwasher', 'fridge', 'upper', 'hood', 'toilet', 'sinkwasher', 'towel']).optional(),
  front: cm.optional(), axis: cm.optional(), toCeiling: z.boolean().optional(),
  w: cm.positive(), d: cm.positive(), h: cm.positive(), z: cm.optional(),
  floor: z.boolean().optional(), walkable: z.boolean().optional(), round: z.boolean().optional(), sliding: z.boolean().optional(), mirror: z.boolean().optional(),
});

const camera = z.object({
  id: z.string(), name: z.string(), type: z.enum(['eye', 'top']).optional(),
  pos: pt3.optional(), target: pt3.optional(), fov: z.number().optional(),
});

const item = z.object({
  id: z.string(), ref: z.string(), x: cm, y: cm, z: cm.optional(), rot: z.number().optional(), group: z.string().optional(),
});

const room = z.object({
  id: z.string(), name: z.string(), area: z.number(), height: z.object({ value: cm.positive() }),
  origin: pt2, originNote: z.string().optional(),
  outline: z.array(pt2).min(3),
  walls: z.array(z.object({ id: z.number().int(), name: z.string(), thickness: cm.positive() })),
  openings: z.array(opening), fixtures: z.array(fixture),
  variants: z.array(z.object({
    id: z.string(), name: z.string(), idea: z.string(),
    items: z.array(item), cameras: z.array(camera).optional(),
  })).min(1),
  cameras: z.array(camera),
});

export const layoutSchema = z.object({
  meta: z.object({ version: z.number(), status: z.string(), units: z.literal('cm'), updated: z.string() }),
  rooms: z.array(room).min(1),
  catalog: z.record(z.string(), spec),
  palettes: z.array(z.object({
    id: z.string(), name: z.string(),
    walls: color, floor: color, ceiling: color, furniture: color, textile: color, wood: color,
  })).min(1),
  rules: z.object({
    passMain: cm, passMin: cm, passSecondary: cm, sofaTable: pt2, behindChair: pt2, doorApproach: cm,
    bedSide: pt2, bedFoot: pt2,
  }),
});

// Проверки, которые схема не выражает: ссылки на каталог, стены, уникальные id.
export function validateLayout(layout) {
  const errors = [];
  const r = layoutSchema.safeParse(layout);
  if (!r.success) for (const i of r.error.issues) errors.push(`${i.path.join('.')}: ${i.message}`);
  if (errors.length) return errors;
  const rooms = new Map(layout.rooms.map((r) => [r.id, r]));
  // Середина проёма в координатах зала: у связанных дверей (одна дверь, две комнаты) должна совпасть.
  const absMid = (r, o) => {
    const n = r.outline.length, a = r.outline[o.wall - 1], b = r.outline[o.wall % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = o.offset + o.width / 2;
    return [r.origin[0] + a[0] + ((b[0] - a[0]) * t) / L, r.origin[1] + a[1] + ((b[1] - a[1]) * t) / L];
  };
  for (const r of layout.rooms) {
    const nWalls = r.outline.length;
    for (const o of [...r.openings, ...r.fixtures]) {
      if (o.wall && o.wall > nWalls) errors.push(`${r.id}/${o.id}: нет стены ${o.wall}`);
    }
    for (const o of r.openings.filter((o) => o.link)) {
      const [rid, oid] = o.link.split(':');
      const o2 = rooms.get(rid)?.openings.find((x) => x.id === oid);
      if (!o2) { errors.push(`${r.id}/${o.id}: связь ${o.link} не найдена`); continue; }
      if (o2.width !== o.width || o2.height !== o.height) errors.push(`${r.id}/${o.id} и ${o.link}: разные размеры проёма`);
      const [m1, m2] = [absMid(r, o), absMid(rooms.get(rid), o2)];
      if (Math.hypot(m1[0] - m2[0], m1[1] - m2[1]) > 30) errors.push(`${r.id}/${o.id} и ${o.link}: проёмы не напротив друг друга`);
    }
    for (const v of r.variants) {
      const seen = new Set();
      for (const it of v.items) {
        if (!layout.catalog[it.ref]) errors.push(`${r.id}, вариант ${v.id}, ${it.id}: нет «${it.ref}» в каталоге`);
        if (seen.has(it.id)) errors.push(`${r.id}, вариант ${v.id}: повтор id «${it.id}»`);
        seen.add(it.id);
      }
    }
  }
  return errors;
}
