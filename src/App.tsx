import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import layoutJson from './data/layout.json';
import { renderPlan, renderOverview } from './lib/plan-svg.js';
import { roomView, flatView, flatPseudo, electricOf } from './lib/rooms.js';
import { presetsFor } from './lib/presets';
import { readHash, writeHash, COLOR_KEYS, type AppState } from './lib/state';
import { zip, download } from './lib/zip';
import type { CaptureApi } from './components/Scene3D';
import type { Colors, Mode } from './components/prims';

// three.js грузится отдельным куском: план и интерфейс появляются сразу.
const Scene3D = lazy(() => import('./components/Scene3D').then((m) => ({ default: m.Scene3D })));

const layout: any = layoutJson;
if (import.meta.env.DEV) {
  import('./lib/schema.js').then(({ validateLayout }) => {
    const e = validateLayout(layout);
    if (e.length) console.error('layout.json:\n' + e.join('\n'));
  });
}

const COLOR_LABEL: Record<keyof Colors, string> = {
  walls: 'Стены', floor: 'Пол', ceiling: 'Потолок', furniture: 'Корпусная мебель', textile: 'Диван, кресло', wood: 'Столы, стулья',
};
const MODES: Mode[] = ['color', 'clay', 'lines', 'depth'];
const MODE_LABEL: Record<Mode, string> = { color: 'Цвет', clay: 'Глина', lines: 'Линии', depth: 'Глубина' };
const SHOT = { w: 1536, h: 1024 };
const ICON: Record<string, string> = { ok: '✓', warn: '!', bad: '✗', info: '·' };

const settle = async () => {
  await new Promise((r) => setTimeout(r, 80));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}
          ref={(el) => { if (el && v === value) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }}>{text}</button>
      ))}
    </div>
  );
}

export default function App() {
  const [st, setSt] = useState<AppState>(() => readHash(layout));
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [ready3d, setReady3d] = useState(false);
  const apiRef = useRef<CaptureApi | null>(null);
  if (import.meta.env.DEV) (window as any).__capture = apiRef; // для отладки снимков из консоли
  const set = (patch: Partial<AppState>) => setSt((s) => ({ ...s, ...patch }));

  useEffect(() => writeHash(st), [st]);
  useEffect(() => {
    // Ссылка вставлена в ту же вкладку или правка хэша руками — подхватить состояние.
    const onHash = () => setSt(readHash(layout));
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const isAll = st.room === 'all';
  const L = useMemo(() => (isAll ? flatPseudo(layout) : roomView(layout, st.room)), [isAll, st.room]);
  const variant = L.variants.find((x: any) => x.id === st.v) ?? L.variants[0];
  const flat = useMemo(
    () => (isAll ? flatView(layout, st.vmap).map((r: any) => ({ ...r, electric: electricOf(r.L, r.variantId) })) : undefined),
    [isAll, st.vmap],
  );
  const electric = useMemo(() => (isAll ? [] : electricOf(L, variant.id)), [isAll, L, variant.id]);
  // Сводка проверок по всем комнатам для общего вида
  const summary = useMemo(() => (isAll ? flat!.map((r: any) => {
    const c = renderPlan(r.L, r.variantId, { withPanel: false }).checks;
    return { room: r.L.room, variants: r.L.variants, v: r.variantId, bad: c.filter((x) => x[0] === 'bad').length, warn: c.filter((x) => x[0] === 'warn').length };
  }) : []), [isAll, flat]);
  const presets = useMemo(() => presetsFor(L, variant.id), [L, variant.id]);
  const preset = presets.find((p) => p.id === st.cam) ?? presets[0];
  const palette = layout.palettes.find((p: any) => p.id === st.pal);
  const colors: Colors = useMemo(() => {
    const c = {} as Colors;
    for (const k of COLOR_KEYS) c[k] = st.custom[k] ?? palette[k];
    return c;
  }, [palette, st.custom]);
  const plan = useMemo(
    () => (isAll ? { ...renderOverview(layout, st.vmap, { legend: true }), checks: [] as [string, string][], electric: [] as any[] } : renderPlan(L, variant.id, { withPanel: false })),
    [isAll, L, variant.id, st.vmap],
  );
  const switchRoom = (room: string) => {
    if (room === st.room) return;
    const vs = room === 'all' ? ['A'] : roomView(layout, room).variants.map((v: any) => v.id);
    set({ room, v: vs.includes(st.vmap[room]) ? st.vmap[room] : vs[0], cam: 'overview' });
  };
  const pickVariant = (room: string, v: string) => setSt((s) => ({ ...s, vmap: { ...s.vmap, [room]: v }, ...(s.room === room ? { v } : {}) }));
  const hasCustom = Object.keys(st.custom).length > 0;
  const palTag = st.pal + (hasCustom ? '-custom' : '');
  const base = `${st.room}_${variant.id}_${palTag}`;

  async function shotCurrent() {
    const api = apiRef.current;
    if (!api) return;
    const blob = await api.capture(null, SHOT.w, SHOT.h);
    download(blob, `${base}_${st.cam}-free_${st.mode}.png`);
  }

  async function shotAll() {
    if (!apiRef.current) return;
    const prev = st.mode, files: { name: string; data: Uint8Array }[] = [];
    const total = MODES.length * presets.length;
    for (const m of MODES) {
      set({ mode: m });
      await settle();
      for (const p of presets) {
        setBusy(`${files.length + 1} / ${total}`);
        const blob = await apiRef.current!.capture(p, SHOT.w, SHOT.h);
        files.push({ name: `${base}_${p.id}_${m}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
    }
    set({ mode: prev });
    download(zip(files), `renders_${base}.zip`);
    setBusy(null);
  }

  return (
    <div className="app">
      <header className="bar">
        <div className="brand">
          <Seg label="Комната" value={st.room} options={[['all', 'Квартира'], ...layout.rooms.map((r: any) => [r.id, r.name] as [string, string])]} onChange={switchRoom} />
          <span>{L.room.area} м²</span>
        </div>
        <Seg label="Вид" value={st.view} options={[['3d', '3D'], ['2d', 'План']]} onChange={(view) => set({ view })} />
        {!isAll && L.variants.length > 1 && <Seg label="Вариант" value={variant.id} options={L.variants.map((v: any) => [v.id, v.id])} onChange={(v) => pickVariant(st.room, v)} />}
        <button className="sheet-toggle" aria-expanded={sheet} onClick={() => setSheet((x) => !x)}>{sheet ? 'Скрыть' : 'Настройки'}</button>
      </header>

      {layout.meta.status === 'estimate' && <div className="note">Размеры примерные — до замеров</div>}

      <main className="stage">
        {st.view === '3d' ? (
          <>
            <Suspense fallback={<div className="loading">Загрузка 3D…</div>}>
              <Scene3D layout={L} variantId={variant.id} preset={preset} mode={st.mode} colors={colors} shadows={st.shadows} apiRef={apiRef} onReady={() => setReady3d(true)} electric={electric} flat={flat} />
            </Suspense>
            {!ready3d && <div className="loading">Загрузка 3D…</div>}
            <div className="cams" role="radiogroup" aria-label="Камера">
              {presets.map((p) => (
                <button key={p.id} role="radio" aria-checked={p.id === preset.id} className={p.id === preset.id ? 'on' : ''}
                  onClick={() => set({ cam: p.id })}>{p.name}</button>
              ))}
            </div>
          </>
        ) : (
          <div className="plan" dangerouslySetInnerHTML={{ __html: plan.svg }} />
        )}
        <div className="caption">
          {isAll ? <><b>Вся квартира.</b> {st.view === '3d' ? `Стены срезаны на высоте 120 см` : 'Общий план'}</> : <><b>Вариант {variant.id}.</b> {variant.name}</>}
        </div>
      </main>

      <aside className={'panel' + (sheet ? ' open' : '')}>
        {isAll ? (
          <section>
            <h2>Вся квартира — {L.room.area} м² + балкон</h2>
            <p className="muted">Все комнаты в одном кадре. Варианты расстановки — по комнатам:</p>
            <ul className="rooms">
              {summary.map((r: any) => (
                <li key={r.room.id}>
                  <button className="link" onClick={() => switchRoom(r.room.id)}>{r.room.name}</button>
                  <span className="muted small">{r.bad ? `✗ ${r.bad} ` : ''}{r.warn ? `! ${r.warn}` : ''}{!r.bad && !r.warn ? '✓' : ''}</span>
                  {r.variants.length > 1 && <Seg label={`Вариант: ${r.room.name}`} value={r.v} options={r.variants.map((v: any) => [v.id, v.id])} onChange={(v) => pickVariant(r.room.id, v)} />}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section>
            <h2>Вариант {variant.id} — {variant.name}</h2>
            <p className="muted">{variant.idea}</p>
          </section>
        )}

        {st.view === '3d' && <section>
          <h2>Цвета</h2>
          <div className="palettes">
            {layout.palettes.map((p: any) => (
              <button key={p.id} className={'pal' + (p.id === st.pal && !hasCustom ? ' on' : '')} onClick={() => set({ pal: p.id, custom: {} })}>
                <span className="sw">{COLOR_KEYS.map((k) => <i key={k} style={{ background: p[k] }} />)}</span>
                {p.name}
              </button>
            ))}
          </div>
          <div className="colors">
            {COLOR_KEYS.map((k) => (
              <label key={k}>
                <input type="color" value={colors[k]} onChange={(e) => set({ custom: { ...st.custom, [k]: e.target.value } })} />
                <span>{COLOR_LABEL[k]}</span>
                <code>{colors[k]}</code>
              </label>
            ))}
          </div>
          {hasCustom && <button className="link" onClick={() => set({ custom: {} })}>Сбросить к палитре «{palette.name}»</button>}
        </section>}

        {!isAll && electric.length > 0 && (
          <section>
            <h2>Электрика</h2>
            <ol className="electric">
              {plan.electric.map((e: any) => (
                <li key={e.id} className={e.type}>
                  <b>{e.num}</b>
                  <span><i>{e.kindName}{e.type !== 'panel' && e.count > 1 ? ` ×${e.count}` : ''}, {e.z} см.</i> {e.label}</span>
                </li>
              ))}
            </ol>
            <p className="muted small">Номера — как на плане. Высота — центр розетки от чистого пола. Выключатели — со стороны ручки двери.</p>
          </section>
        )}

        {!isAll && <section>
          <h2>Проверки</h2>
          <ul className="checks">
            {plan.checks.map(([lvl, text], i) => (
              <li key={i} className={lvl}><b>{ICON[lvl]}</b><span>{text}</span></li>
            ))}
          </ul>
        </section>}

        {st.view === '3d' && (
          <section>
            <h2>Снимки для нейросети</h2>
            <Seg label="Режим" value={st.mode} options={MODES.map((m) => [m, MODE_LABEL[m]])} onChange={(mode) => set({ mode })} />
            <p className="muted small">
              {SHOT.w}×{SHOT.h}. Глина — серый материал, Линии и Глубина — для ControlNet. Имя файла: комната_вариант_палитра_камера_режим.
            </p>
            <div className="row">
              <button onClick={shotCurrent} disabled={!!busy}>PNG этого вида</button>
              <button onClick={shotAll} disabled={!!busy}>{busy ? `Снимаю ${busy}` : `Все ракурсы × 4 (zip)`}</button>
            </div>
            <label className="check">
              <input type="checkbox" checked={st.shadows} onChange={(e) => set({ shadows: e.target.checked })} />
              Тени от окна (на телефоне по умолчанию выключены)
            </label>
          </section>
        )}
      </aside>
    </div>
  );
}
