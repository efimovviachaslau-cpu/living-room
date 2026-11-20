// 2D-набросок плана из layout.json → SVG (+ PNG через Quick Look на macOS).
// Запуск: node tools/sketch.mjs            — комната и все варианты
//         node tools/sketch.mjs A          — один вариант
// Вывод:  renders/sketch/<id>.svg|png и сводка проверок в консоль.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPlan } from '../src/lib/plan-svg.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const layout = JSON.parse(readFileSync(join(ROOT, 'src/data/layout.json'), 'utf8'));
const OUT = join(ROOT, 'renders/sketch');
mkdirSync(OUT, { recursive: true });

const only = process.argv[2];
const ids = [];
if (!only || only === 'room') ids.push(['room', null]);
for (const v of layout.variants) if (!only || only === v.id) ids.push([v.id, v.id]);

for (const [name, variantId] of ids) {
  const { svg, checks, title } = renderPlan(layout, variantId, { withPanel: true, square: true });
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
