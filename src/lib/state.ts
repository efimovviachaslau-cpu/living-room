// Состояние вида в URL-хэше: ссылкой можно поделиться ровно этим ракурсом и цветами.
// #view=3d&v=A&cam=entry&pal=light&mode=color&walls=ece8e1
import type { Colors, Mode } from '../components/prims';

export type View = '3d' | '2d';
export type AppState = { view: View; v: string; cam: string; pal: string; mode: Mode; custom: Partial<Colors>; shadows: boolean };

export const COLOR_KEYS: (keyof Colors)[] = ['walls', 'floor', 'ceiling', 'furniture', 'textile', 'wood'];
const MODES: Mode[] = ['color', 'clay', 'lines', 'depth'];

export function readHash(layout: any): AppState {
  const q = new URLSearchParams(location.hash.slice(1));
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const v = layout.variants.some((x: any) => x.id === q.get('v')) ? q.get('v')! : layout.variants[0].id;
  const pal = layout.palettes.some((x: any) => x.id === q.get('pal')) ? q.get('pal')! : layout.palettes[0].id;
  const custom: Partial<Colors> = {};
  for (const k of COLOR_KEYS) {
    const c = q.get(k);
    if (c && /^[0-9a-f]{6}$/i.test(c)) custom[k] = '#' + c.toLowerCase();
  }
  return {
    view: q.get('view') === '2d' ? '2d' : '3d',
    v,
    cam: q.get('cam') ?? 'overview',
    pal,
    mode: MODES.includes(q.get('mode') as Mode) ? (q.get('mode') as Mode) : 'color',
    custom,
    shadows: q.has('sh') ? q.get('sh') === '1' : !coarse,
  };
}

export function writeHash(s: AppState) {
  const q = new URLSearchParams();
  q.set('view', s.view);
  q.set('v', s.v);
  q.set('cam', s.cam);
  q.set('pal', s.pal);
  if (s.mode !== 'color') q.set('mode', s.mode);
  for (const k of COLOR_KEYS) if (s.custom[k]) q.set(k, s.custom[k]!.slice(1));
  q.set('sh', s.shadows ? '1' : '0');
  history.replaceState(null, '', '#' + q.toString());
}
