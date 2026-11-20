// Проверка layout.json перед сборкой: схема + сводка эргономики по вариантам.
// Ошибки схемы валят сборку; замечания эргономики только печатаются.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLayout } from '../src/lib/schema.js';
import { renderPlan } from '../src/lib/plan-svg.js';
import { roomView } from '../src/lib/rooms.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const layout = JSON.parse(readFileSync(join(ROOT, 'src/data/layout.json'), 'utf8'));
const errors = validateLayout(layout);
if (errors.length) {
  console.error('layout.json: ошибки\n' + errors.map((e) => '  ✗ ' + e).join('\n'));
  process.exit(1);
}
for (const r of layout.rooms) {
  const L = roomView(layout, r.id);
  for (const v of L.variants) {
    const { checks } = renderPlan(L, v.id, { withPanel: false });
    const bad = checks.filter(([l]) => l === 'bad').length, warn = checks.filter(([l]) => l === 'warn').length;
    console.log(`layout.json ✓  ${r.name}, вариант ${v.id}: ${bad ? bad + ' ✗, ' : ''}${warn} замечаний`);
  }
}
