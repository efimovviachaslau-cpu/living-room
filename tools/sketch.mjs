// 2D-набросок плана из layout.json → SVG (+ PNG через Quick Look на macOS).
// Запуск: node tools/sketch.mjs              — все комнаты и варианты
//         node tools/sketch.mjs spalnya      — одна комната
//         node tools/sketch.mjs spalnya A    — один вариант
// Вывод:  renders/sketch/<комната>_<вариант|room>.svg|png и сводка проверок в консоль.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPlan } from '../src/lib/plan-svg.js';
import { roomView } from '../src/lib/rooms.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const layout = JSON.parse(readFileSync(join(ROOT, 'src/data/layout.json'), 'utf8'));
const OUT = join(ROOT, 'renders/sketch');
mkdirSync(OUT, { recursive: true });

const [onlyRoom, onlyVariant] = process.argv.slice(2);
const jobs = [];
for (const r of layout.rooms) {
  if (onlyRoom && onlyRoom !== r.id) continue;
  const L = roomView(layout, r.id);
  if (!onlyVariant || onlyVariant === 'room') jobs.push([L, `${r.id}_room`, null]);
  for (const v of L.variants) if (!onlyVariant || onlyVariant === v.id) jobs.push([L, `${r.id}_${v.id}`, v.id]);
}

for (const [L, name, variantId] of jobs) {
  const { svg, checks, title } = renderPlan(L, variantId, { withPanel: true, square: true });
  const file = join(OUT, `${name}.svg`);
  writeFileSync(file, svg);
  const size = svg.match(/width="(\d+(?:\.\d+)?)"/)[1];
  let png = false;
  try { execFileSync('qlmanage', ['-t', '-s', String(Math.round(size)), '-o', OUT, file], { stdio: 'ignore' }); png = true; } catch {}
  if (variantId) {
    console.log(`\n${title}`);
    for (const [lvl, t] of checks) console.log(`  ${{ ok: '✓', warn: '!', bad: '✗', info: '·' }[lvl]} ${t}`);
  }
  console.log(`  → ${file}${png ? ' + png' : ''}`);
}
