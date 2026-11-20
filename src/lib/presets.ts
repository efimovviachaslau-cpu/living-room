// Пресеты камер: общие из layout.cameras + свои у варианта (переопределяют по id).
// Без three.js, чтобы не тянуть его в основной кусок сборки.

export type CamPreset = { id: string; name: string; type?: 'eye' | 'top'; pos?: number[]; target?: number[]; fov?: number };

const ORDER = ['overview', 'entry', 'window', 'sofa', 'top'];

export function presetsFor(layout: any, variantId: string): CamPreset[] {
  const map = new Map<string, CamPreset>();
  for (const c of layout.cameras) map.set(c.id, c);
  const v = layout.variants.find((x: any) => x.id === variantId);
  for (const c of v?.cameras ?? []) map.set(c.id, c);
  return [...map.values()].sort((a, b) => (ORDER.indexOf(a.id) + 99) % 99 - (ORDER.indexOf(b.id) + 99) % 99);
}
