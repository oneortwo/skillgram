// Copies the built package, examples, spec and fixtures into site/ for the playground.
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const site = new URL('site/', root);
for (const d of ['lib', 'examples', 'fixtures']) rmSync(new URL(d, site), { recursive: true, force: true });
cpSync(new URL('dist/', root), new URL('lib/', site), { recursive: true });
cpSync(new URL('examples/', root), new URL('examples/', site), { recursive: true });
cpSync(new URL('SPEC.md', root), new URL('SPEC.md', site));
mkdirSync(new URL('fixtures/', site));
const fixtures = readdirSync(new URL('test/fixtures/', root)).filter(f => f.endsWith('.md')).sort();
for (const f of fixtures) cpSync(new URL(`test/fixtures/${f}`, root), new URL(`fixtures/${f}`, site));
writeFileSync(new URL('fixtures/index.json', site), JSON.stringify(fixtures, null, 2) + '\n');
console.log(`site: ${fixtures.length} fixtures`);
