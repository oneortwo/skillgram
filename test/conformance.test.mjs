import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '../dist/index.js';

// Each fixture's .json file is the contract from SPEC.md section 9:
// codes, severities and lines must match. Order within a line doesn't matter.
const dir = new URL('./fixtures/', import.meta.url);
const key = p => `${p.line}:${p.code}:${p.severity}`;

for (const file of readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
  test(file, () => {
    const model = parse(readFileSync(new URL(file, dir), 'utf8'));
    const expected = JSON.parse(readFileSync(new URL(file.replace(/\.md$/, '.json'), dir), 'utf8'));
    assert.deepEqual(model.problems.map(key).sort(), expected.problems.map(key).sort());
    assert.deepEqual(model.steps.map(s => ({ name: s.name, type: s.type, start: s.start, end: s.end })), expected.steps);
    assert.deepEqual(model.edges.map(e => [e.from.name, e.to.name, e.outcome]), expected.edges);
    const code = file.match(/^([A-Z]\d)-/)?.[1];
    if (code) assert.ok(model.problems.some(p => p.code === code), `${file} should report ${code}`);
    else assert.equal(model.problems.length, 0, `${file} should be clean`);
  });
}
