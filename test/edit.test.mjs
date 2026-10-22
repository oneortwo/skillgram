import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, validate as validateAll, addStep, updateStep, removeStep, readStep } from '../dist/index.js';

const base = `# Example

## Steps

### Collect
Gather the files.

### Check
After: Collect
Type: gate
Outcomes: ok, off

Compare the totals.

### Pay
After: Check (ok)

Pay it.

## Notes

Not part of the graph.
`;

// Base has an unused gate outcome on purpose, so only errors count here.
const validate = src => validateAll(src).filter(p => p.severity === 'error');

const step = (over = {}) => ({ name: 'New', type: 'action', after: [], outcomes: [], skill: null, until: null, join: null, instructions: 'Do it.', ...over });

test('readStep returns what formatStep would write', () => {
  assert.deepEqual(readStep(base, 'check'), step({ name: 'Check', type: 'gate', after: [{ name: 'Collect', outcome: null }], outcomes: ['ok', 'off'], instructions: 'Compare the totals.' }));
  assert.equal(readStep(base, 'missing'), null);
});

test('addStep after a gate outcome keeps the file valid', () => {
  const out = addStep(base, step({ name: 'Ask', type: 'human', after: [{ name: 'Check', outcome: 'off' }], instructions: 'Ask the sender.' }), { after: 'Check' });
  assert.deepEqual(validate(out), []);
  const m = parse(out);
  assert.deepEqual(m.steps.map(s => s.name), ['Collect', 'Check', 'Ask', 'Pay']);
  assert.ok(out.includes('## Notes\n\nNot part of the graph.'));
});

test('addStep creates the steps section when missing', () => {
  const out = addStep('# Empty\n\nIntro.\n', step({ name: 'First' }));
  assert.deepEqual(validate(out), []);
  assert.match(out, /## Steps\n\n### First\n\nDo it\.\n$/);
});

test('addStep into an empty steps section', () => {
  const out = addStep('## Steps\n\nNothing yet.\n\n## Notes\n\nText.\n', step({ name: 'First' }));
  assert.deepEqual(validate(out), []);
  assert.ok(out.indexOf('### First') < out.indexOf('## Notes'));
});

test('updateStep renames and updates references', () => {
  const out = updateStep(base, 'Check', { ...readStep(base, 'Check'), name: 'Check totals' });
  assert.deepEqual(validate(out), []);
  assert.match(out, /After: Check totals \(ok\)/);
});

test('updateStep changes type and instructions', () => {
  const out = updateStep(base, 'Pay', { ...readStep(base, 'Pay'), type: 'skill', skill: 'schedule-payment', instructions: 'Pay on the due date.' });
  assert.deepEqual(validate(out), []);
  const s = parse(out).steps.find(x => x.name === 'Pay');
  assert.equal(s.type, 'skill');
  assert.equal(s.text, 'Pay on the due date.');
});

test('removeStep removes the step and references to it', () => {
  const out = removeStep(base, 'Pay');
  assert.ok(!out.includes('### Pay'));
  const out2 = removeStep(base, 'Collect');
  assert.ok(!/After: Collect/.test(out2));
  assert.equal(parse(out2).steps.find(s => s.name === 'Check').start, true);
});
