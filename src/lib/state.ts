// Состояние вида в URL-хэше: ссылкой можно поделиться ровно этим ракурсом и цветами.
// #room=zal&view=3d&v=A&cam=entry&pal=light&mode=color&walls=ece8e1
import type { Colors, Mode } from '../components/prims';
import { roomView } from './rooms.js';

export type View = '3d' | '2d';
export type AppState = { room: string; vmap: Record<string, string>; view: View; v: string; cam: string; pal: string; mode: Mode; custom: Partial<Colors>; shadows: boolean };

export const COLOR_KEYS: (keyof Colors)[] = ['walls', 'floor', 'ceiling', 'furniture', 'textile', 'wood'];
const MODES: Mode[] = ['color', 'clay', 'lines', 'depth'];

export function readHash(layout: any): AppState {
  const q = new URLSearchParams(location.hash.slice(1));
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  // room=all — вся квартира; vs=zal:A,komnata:B — какой вариант выбран в каждой комнате.
  const room = q.get('room') === 'all' || layout.rooms.some((r: any) => r.id === q.get('room')) ? q.get('room')! : layout.rooms[0].id;
  const vmap: Record<string, string> = Object.fromEntries((q.get('vs') ?? '').split(',').filter((x) => x.includes(':')).map((x) => x.split(':') as [string, string]));
  const L = roomView(layout, room);
  const v = L.variants.some((x: any) => x.id === q.get('v')) ? q.get('v')! : L.variants[0].id;
  const pal = layout.palettes.some((x: any) => x.id === q.get('pal')) ? q.get('pal')! : layout.palettes[0].id;
  const custom: Partial<Colors> = {};
  for (const k of COLOR_KEYS) {
    const c = q.get(k);
    if (c && /^[0-9a-f]{6}$/i.test(c)) custom[k] = '#' + c.toLowerCase();
  }
  return {
    room,
    vmap,
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
  q.set('room', s.room);
  const vs = Object.entries(s.vmap).map(([k, v]) => `${k}:${v}`).join(',');
  if (vs) q.set('vs', vs);
  q.set('view', s.view);
  q.set('v', s.v);
  q.set('cam', s.cam);
  q.set('pal', s.pal);
  if (s.mode !== 'color') q.set('mode', s.mode);
  for (const k of COLOR_KEYS) if (s.custom[k]) q.set(k, s.custom[k]!.slice(1));
  q.set('sh', s.shadows ? '1' : '0');
  history.replaceState(null, '', '#' + q.toString());
}
