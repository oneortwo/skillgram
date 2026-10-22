import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, diff, toMermaid } from '../dist/index.js';

const before = `## Steps

### Read
Read the invoice.

### Check
After: Read
Type: gate
Outcomes: ok, off

Compare totals.

### Pay
After: Check (ok)

Pay it.

### Reject
After: Check (off)

Send it back.

### Archive
After: Read

File the PDF.
`;

const after = `## Steps

### Read
Read the invoice.

### Check
After: Read
Type: human gate
Outcomes: ok, off

Compare totals.

### Pay the supplier
After: Check (ok)

Pay it.

### Reject
After: Check (off)

Send it back.

### Notify
After: Pay the supplier

Tell the requester it was paid.
`;

test('reports added, removed, changed and renamed steps', () => {
  const d = diff(parse(before), parse(after));
  const by = Object.fromEntries(d.steps.map(s => [s.name, s.diff ?? 'same']));
  assert.deepEqual(by, { Read: 'same', Check: 'changed', 'Pay the supplier': 'renamed', Reject: 'same', Notify: 'added', Archive: 'removed' });
  assert.deepEqual(d.steps.find(s => s.name === 'Check').diffNotes, ['type gate → human gate']);
});

test('reports added and removed edges', () => {
  const d = diff(parse(before), parse(after));
  const edges = d.edges.filter(e => e.diff).map(e => `${e.diff} ${e.from.name}>${e.to.name}`).sort();
  assert.deepEqual(edges, ['added Pay the supplier>Notify', 'removed Read>Archive']);
});

test('the same file twice has no changes', () => {
  assert.equal(diff(parse(before), parse(before)).changes.length, 0);
});

test('Mermaid output marks the diff', () => {
  const m = toMermaid(diff(parse(before), parse(after)));
  assert.match(m, /^flowchart TB/);
  assert.match(m, /class \S+ added/);
  assert.match(m, /class \S+ removed/);
  assert.match(m, /-\.->/);
});
