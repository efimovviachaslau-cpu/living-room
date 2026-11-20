// Схема layout.json (zod). Проверяется перед сборкой (tools/check.mjs) и в dev-режиме.
import { z } from 'zod';

const cm = z.number().finite();
const pt2 = z.tuple([cm, cm]);
const pt3 = z.tuple([cm, cm, cm]);
const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'цвет вида #rrggbb');

const opening = z.object({
  id: z.string(), type: z.enum(['window', 'door']), name: z.string(),
  wall: z.number().int().positive(), offset: cm, width: cm.positive(), height: cm.positive(),
  sill: cm.optional(), sillDepth: cm.optional(), sashes: z.number().int().optional(), leaf: cm.optional(),
  swing: z.object({ into: z.enum(['room', 'out']), hinge: z.enum(['start', 'end']) }).optional(),
  src: z.string().optional(),
});

const fixture = z.object({
  id: z.string(), type: z.string(), name: z.string(),
  wall: z.number().int().positive().optional(), offset: cm.optional(),
  w: cm.optional(), d: cm.optional(), h: cm.optional(), z: cm.optional(),
  x: cm.optional(), y: cm.optional(), src: z.string().optional(),
});

const spec = z.object({
  name: z.string(),
  kind: z.enum(['sofa', 'armchair', 'table', 'chair', 'cabinet', 'tv', 'rug', 'lamp']),
  w: cm.positive(), d: cm.positive(), h: cm.positive(), z: cm.optional(),
  floor: z.boolean().optional(), walkable: z.boolean().optional(), round: z.boolean().optional(),
});

const camera = z.object({
  id: z.string(), name: z.string(), type: z.enum(['eye', 'top']).optional(),
  pos: pt3.optional(), target: pt3.optional(), fov: z.number().optional(),
});

const item = z.object({
  id: z.string(), ref: z.string(), x: cm, y: cm, rot: z.number().optional(), group: z.string().optional(),
});

export const layoutSchema = z.object({
  meta: z.object({ version: z.number(), status: z.string(), units: z.literal('cm'), updated: z.string() }),
  room: z.object({
    name: z.string(), area: z.number(), height: z.object({ value: cm.positive() }),
    outline: z.array(pt2).min(3),
    walls: z.array(z.object({ id: z.number().int(), name: z.string(), thickness: cm.positive() })),
    openings: z.array(opening), fixtures: z.array(fixture),
  }),
  catalog: z.record(z.string(), spec),
  variants: z.array(z.object({
    id: z.string(), name: z.string(), idea: z.string(),
    items: z.array(item), cameras: z.array(camera).optional(),
  })).min(1),
  palettes: z.array(z.object({
    id: z.string(), name: z.string(),
    walls: color, floor: color, ceiling: color, furniture: color, textile: color, wood: color,
  })).min(1),
  cameras: z.array(camera),
  rules: z.object({
    passMain: cm, passMin: cm, passSecondary: cm, sofaTable: pt2, behindChair: pt2, doorApproach: cm,
  }),
});

// Проверки, которые схема не выражает: ссылки на каталог, стены, уникальные id.
export function validateLayout(layout) {
  const errors = [];
  const r = layoutSchema.safeParse(layout);
  if (!r.success) for (const i of r.error.issues) errors.push(`${i.path.join('.')}: ${i.message}`);
  if (errors.length) return errors;
  const nWalls = layout.room.outline.length;
  for (const o of [...layout.room.openings, ...layout.room.fixtures]) {
    if (o.wall && o.wall > nWalls) errors.push(`${o.id}: нет стены ${o.wall}`);
  }
  for (const v of layout.variants) {
    const seen = new Set();
    for (const it of v.items) {
      if (!layout.catalog[it.ref]) errors.push(`вариант ${v.id}, ${it.id}: нет «${it.ref}» в каталоге`);
      if (seen.has(it.id)) errors.push(`вариант ${v.id}: повтор id «${it.id}»`);
      seen.add(it.id);
    }
  }
  return errors;
}
