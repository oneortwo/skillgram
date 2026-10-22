import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from '../dist/index.js';

// Every Markdown example in the spec that has a steps section must be valid.
const spec = readFileSync(new URL('../SPEC.md', import.meta.url), 'utf8');
const blocks = [...spec.matchAll(/```markdown\n([\s\S]*?)\n```/g)].map(m => m[1]).filter(b => /^## Steps$/m.test(b));

test('the spec has examples', () => assert.ok(blocks.length > 0));
blocks.forEach((b, i) => test(`spec example ${i + 1} is valid`, () => assert.deepEqual(validate(b), [])));
