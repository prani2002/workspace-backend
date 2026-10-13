// Fast scope/structure guard (no deps, ~50 ms). Used by `npm run guard`, hooks and CI.
// Fails when: a route has a scope tag that is not in .fde/scope-ids.json, a route is mounted without defineRoute.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const json = process.argv.includes('--json');
const ids = existsSync(path.join(root, '.fde/scope-ids.json')) ? JSON.parse(readFileSync(path.join(root, '.fde/scope-ids.json'), 'utf8')) : { ids: [] };
const allowed = new Set([...(ids.ids ?? []), 'base', 'sample']);

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && files.push(p);
  }
})(path.join(root, 'src'));

const errors = [];
let sample = 0;
let routes = 0;
for (const file of files) {
  const rel = path.relative(root, file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/defineRoute\(\{[\s\S]*?scope:\s*'([^']+)'/g)) {
    routes += 1;
    if (m[1] === 'sample') sample += 1;
    if (!allowed.has(m[1])) errors.push(`${rel}: route scope '${m[1]}' is not in SCOPE.md (known: ${[...allowed].join(', ')})`);
  }
  const defs = (src.match(/defineRoute\(\{/g) ?? []).length;
  const tagged = (src.match(/defineRoute\(\{[\s\S]*?scope:\s*'/g) ?? []).length;
  if (defs !== tagged) errors.push(`${rel}: ${defs - tagged} route(s) without a scope tag`);
  if (!rel.endsWith('http/route.ts') && /\b(app|router)\.(get|post|put|patch|delete|all)\(/.test(src)) {
    errors.push(`${rel}: mount routes with defineRoute() in src/modules/*/routes.ts, not app.get()/router.get()`);
  }
}
if (json) console.log(JSON.stringify({ errors, sample, routes }));
else if (errors.length) { console.error(`SCOPE GUARD (backend):\n- ${errors.join('\n- ')}`); }
process.exit(errors.length ? 2 : 0);
