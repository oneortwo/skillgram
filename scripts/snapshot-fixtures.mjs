// Writes the current parser output next to each fixture. Review before committing.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parse } from '../dist/index.js';
const dir = new URL('../test/fixtures/', import.meta.url);
for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
  const m = parse(readFileSync(new URL(f, dir), 'utf8'));
  const out = {
    steps: m.steps.map(s => ({ name: s.name, type: s.type, start: s.start, end: s.end })),
    edges: m.edges.map(e => [e.from.name, e.to.name, e.outcome]),
    problems: m.problems.map(p => ({ code: p.code, severity: p.severity, line: p.line })),
  };
  writeFileSync(new URL(f.replace(/\.md$/, '.json'), dir), JSON.stringify(out, null, 2) + '\n');
}
