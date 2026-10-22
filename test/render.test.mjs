import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse, validate } from '../dist/index.js';
import { render } from '../dist/render.js';

const examples = new URL('../examples/', import.meta.url);

for (const file of readdirSync(examples).filter(f => f.endsWith('.md'))) {
  test(`example ${file} is valid and renders`, () => {
    const src = readFileSync(new URL(file, examples), 'utf8');
    assert.deepEqual(validate(src), []);
    const out = render(parse(src), { embedStyles: true });
    assert.ok(out && out.width > 0 && out.height > 0);
    assert.equal((out.svg.match(/class="node /g) ?? []).length, parse(src).steps.length);
  });
}

test('render returns null for a file without steps', () => {
  assert.equal(render(parse('# Nothing')), null);
});
