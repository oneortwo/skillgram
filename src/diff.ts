import { normalize } from './parse.js';
import type { Change, DiffModel, Edge, Model, Step } from './types.js';

const q = (s: string) => `“${s}”`;

function stepChanges(a: Step, b: Step): string[] {
  const out: string[] = [];
  const v = (x: string | null) => (x ? q(x) : 'none');
  if (a.type !== b.type) out.push(`type ${a.type} → ${b.type}`);
  const oa = a.outcomes.join(', '), ob = b.outcomes.join(', ');
  if (normalize(oa) !== normalize(ob)) out.push(`outcomes ${v(oa)} → ${v(ob)}`);
  if ((a.skill ?? '') !== (b.skill ?? '')) out.push(`skill ${v(a.skill)} → ${v(b.skill)}`);
  if ((a.until ?? '') !== (b.until ?? '')) out.push(`until ${v(a.until)} → ${v(b.until)}`);
  if ((a.join ?? 'any') !== (b.join ?? 'any')) out.push(`join ${a.join ?? 'any'} → ${b.join ?? 'any'}`);
  if (a.text !== b.text) out.push('instructions changed');
  return out;
}

/**
 * Compares two parsed versions of a skill (SPEC 10) and returns one merged
 * graph with every step and edge marked as added, removed, changed or renamed.
 */
export function diff(before: Model, after: Model): DiffModel {
  const key = (s: Step) => normalize(s.name);
  const beforeBy = new Map(before.steps.map(s => [key(s), s]));
  const afterBy = new Map(after.steps.map(s => [key(s), s]));
  const removed = before.steps.filter(s => !afterBy.has(key(s)));
  const added = after.steps.filter(s => !beforeBy.has(key(s)));

  // A removed step and an added step with the same instructions is a rename.
  const renamedFrom = new Map<Step, Step>();
  const renamed = new Set<Step>();
  for (const r of removed) {
    const m = added.find(x => !renamedFrom.has(x) && x.text && x.text === r.text);
    if (m) { renamedFrom.set(m, r); renamed.add(r); }
  }

  const steps: Step[] = [];
  const changes: Change[] = [];
  const merged = new Map<string, Step>();
  after.steps.forEach((s, i) => {
    const n: Step = { ...s, id: 'd' + i };
    const old = beforeBy.get(key(s)) ?? renamedFrom.get(s);
    if (!old) {
      n.diff = 'added';
      changes.push({ kind: 'added', stepId: n.id, message: `Added step ${q(s.name)}${s.type !== 'action' ? ` (${s.type})` : ''}.` });
    } else {
      const notes = stepChanges(old, s);
      if (renamedFrom.has(s)) {
        n.diff = 'renamed';
        n.diffNotes = [`renamed from ${q(old.name)}`, ...notes];
        changes.push({ kind: 'renamed', stepId: n.id, message: `Renamed ${q(old.name)} to ${q(s.name)}${notes.length ? '. Also: ' + notes.join('; ') : ''}.` });
      } else if (notes.length) {
        n.diff = 'changed';
        n.diffNotes = notes;
        changes.push({ kind: 'changed', stepId: n.id, message: `Changed ${q(s.name)}: ${notes.join('; ')}.` });
      }
      merged.set('b:' + key(old), n);
    }
    merged.set('a:' + key(s), n);
    steps.push(n);
  });
  removed.filter(s => !renamed.has(s)).forEach((s, i) => {
    const n: Step = { ...s, id: 'r' + i, diff: 'removed', start: false, invalid: false };
    merged.set('b:' + key(s), n);
    steps.push(n);
    changes.push({ kind: 'removed', stepId: n.id, message: `Removed step ${q(s.name)}.` });
  });

  const edgeKey = (f: Step, t: Step, o: string | null) => `${f.id}>${t.id}|${normalize(o ?? '')}`;
  const edges: Edge[] = [];
  const afterKeys = new Set<string>(), beforeKeys = new Set<string>();
  for (const e of after.edges) {
    const f = merged.get('a:' + key(e.from)), t = merged.get('a:' + key(e.to));
    if (!f || !t) continue;
    afterKeys.add(edgeKey(f, t, e.outcome));
    edges.push({ from: f, to: t, outcome: e.outcome, invalid: e.invalid });
  }
  for (const e of before.edges) {
    const f = merged.get('b:' + key(e.from)), t = merged.get('b:' + key(e.to));
    if (!f || !t) continue;
    const k = edgeKey(f, t, e.outcome);
    beforeKeys.add(k);
    if (!afterKeys.has(k)) edges.push({ from: f, to: t, outcome: e.outcome, invalid: false, diff: 'removed' });
  }
  const dep = (e: Edge) => q(e.from.name + (e.outcome ? ` (${e.outcome})` : ''));
  for (const e of edges) {
    if (!e.diff && !beforeKeys.has(edgeKey(e.from, e.to, e.outcome))) e.diff = 'added';
    if (e.diff === 'added' && e.to.diff !== 'added') changes.push({ kind: 'added', stepId: e.to.id, message: `${q(e.to.name)} now waits for ${dep(e)}.` });
    if (e.diff === 'removed' && e.to.diff !== 'removed') changes.push({ kind: 'removed', stepId: e.to.id, message: `${q(e.to.name)} no longer waits for ${dep(e)}.` });
  }
  return { steps, edges, changes };
}
