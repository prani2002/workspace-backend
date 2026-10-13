import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { allRoutes } from '../src/routes';

const root = path.resolve(__dirname, '..');
const spec = parse(readFileSync(path.join(root, 'openapi.yaml'), 'utf8')) as { paths: Record<string, Record<string, { operationId?: string; 'x-scope'?: string; responses?: Record<string, unknown> }>> };
const scopeIds = JSON.parse(readFileSync(path.join(root, '.fde/scope-ids.json'), 'utf8')).ids as string[];
const allowedScopes = new Set([...scopeIds, 'base', 'sample']);
const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

describe('API contract (openapi.yaml <-> routes)', () => {
  it.each(allRoutes.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r] as const))('%s is documented with the same scope', (_label, route) => {
    const op = spec.paths[toOpenApiPath(route.path)]?.[route.method];
    expect(op, 'missing in openapi.yaml').toBeTruthy();
    expect(op?.operationId, 'operationId').toBeTruthy();
    expect(op?.['x-scope'], 'x-scope must equal the route scope').toBe(route.scope);
    expect(Object.keys(op?.responses ?? {}).length).toBeGreaterThan(0);
    expect(allowedScopes.has(route.scope), `scope ${route.scope} not in SCOPE.md`).toBe(true);
  });

  it('has no operations without a route', () => {
    const routed = new Set(allRoutes.map((r) => `${r.method} ${toOpenApiPath(r.path)}`));
    const documented = Object.entries(spec.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m} ${p}`));
    expect(documented.filter((d) => !routed.has(d))).toEqual([]);
  });

  it('has unique operationIds', () => {
    const ids = Object.values(spec.paths).flatMap((ops) => Object.values(ops).map((o) => o.operationId));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
