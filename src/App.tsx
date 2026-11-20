import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import layoutJson from './data/layout.json';
import { renderPlan } from './lib/plan-svg.js';
import { roomView } from './lib/rooms.js';
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

  const L = useMemo(() => roomView(layout, st.room), [st.room]);
  const variant = L.variants.find((x: any) => x.id === st.v) ?? L.variants[0];
  const presets = useMemo(() => presetsFor(L, variant.id), [L, variant.id]);
  const preset = presets.find((p) => p.id === st.cam) ?? presets[0];
  const palette = layout.palettes.find((p: any) => p.id === st.pal);
  const colors: Colors = useMemo(() => {
    const c = {} as Colors;
    for (const k of COLOR_KEYS) c[k] = st.custom[k] ?? palette[k];
    return c;
  }, [palette, st.custom]);
  const plan = useMemo(() => renderPlan(L, variant.id, { withPanel: false }), [L, variant.id]);
  const switchRoom = (room: string) => {
    if (room === st.room) return;
    set({ room, v: roomView(layout, room).variants[0].id, cam: 'overview' });
  };
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
          <Seg label="Комната" value={st.room} options={layout.rooms.map((r: any) => [r.id, r.name])} onChange={switchRoom} />
          <span>{L.room.area} м²</span>
        </div>
        <Seg label="Вид" value={st.view} options={[['3d', '3D'], ['2d', 'План']]} onChange={(view) => set({ view })} />
        <Seg label="Вариант" value={st.v} options={L.variants.map((v: any) => [v.id, v.id])} onChange={(v) => set({ v })} />
        <button className="sheet-toggle" aria-expanded={sheet} onClick={() => setSheet((x) => !x)}>{sheet ? 'Скрыть' : 'Настройки'}</button>
      </header>

      {layout.meta.status === 'estimate' && <div className="note">Размеры примерные — до замеров</div>}

      <main className="stage">
        {st.view === '3d' ? (
          <>
            <Suspense fallback={<div className="loading">Загрузка 3D…</div>}>
              <Scene3D layout={L} variantId={variant.id} preset={preset} mode={st.mode} colors={colors} shadows={st.shadows} apiRef={apiRef} onReady={() => setReady3d(true)} />
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
          <b>Вариант {variant.id}.</b> {variant.name}
        </div>
      </main>

      <aside className={'panel' + (sheet ? ' open' : '')}>
        <section>
          <h2>Вариант {variant.id} — {variant.name}</h2>
          <p className="muted">{variant.idea}</p>
        </section>

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

        <section>
          <h2>Проверки</h2>
          <ul className="checks">
            {plan.checks.map(([lvl, text], i) => (
              <li key={i} className={lvl}><b>{ICON[lvl]}</b><span>{text}</span></li>
            ))}
          </ul>
        </section>

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
