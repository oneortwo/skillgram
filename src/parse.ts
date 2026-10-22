import type { Edge, Model, Problem, Severity, Step, StepType } from './types.js';

export const DIRECTIVES = ['After', 'Type', 'Outcomes', 'Skill', 'Until', 'Join'] as const;
export const STEP_TYPES: StepType[] = ['action', 'gate', 'human', 'human gate', 'skill'];
const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Normalizes a step name or outcome for comparison (SPEC 5.2). */
export const normalize = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** True for `gate` and `human gate` steps. */
export const isGate = (s: Pick<Step, 'type'>): boolean => s.type === 'gate' || s.type === 'human gate';

const q = (s: string) => `“${s}”`;

function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

interface Heading { level: number; text: string; line: number }

/** Parses and validates a Skillgram file. Never throws. */
export function parse(source: string): Model {
  const lines = source.split(/\r?\n/);
  const problems: Problem[] = [];
  const model: Model = { steps: [], edges: [], problems, sectionLine: null };
  const add = (severity: Severity, code: string, line: number, message: string, step?: Step) =>
    problems.push({ code, severity, line, message, stepId: step ? step.id : null });

  // Frontmatter (SPEC 3.1).
  let start = 0;
  if ((lines[0] ?? '').trim() === '---') {
    let j = 1;
    while (j < lines.length && lines[j].trim() !== '---') j++;
    start = Math.min(j + 1, lines.length);
  }

  // Headings outside fenced code (SPEC 3.2, 3.3).
  const heads: Heading[] = [];
  let fence: string | null = null;
  for (let j = start; j < lines.length; j++) {
    const f = lines[j].match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const h = lines[j].match(/^(#{1,6})(?:\s+(.*?))?\s*$/);
    if (h) heads.push({ level: h[1].length, text: (h[2] ?? '').replace(/\s+#+$/, '').trim(), line: j });
  }

  // Steps section (SPEC 4).
  const sections = heads.filter(h => h.level === 2 && normalize(h.text) === 'steps');
  if (!sections.length) {
    add('error', 'S1', 1, `There is no ${q('## Steps')} section. Add one and write each step under it as a ${q('###')} heading.`);
    return model;
  }
  for (const s of sections.slice(1)) add('error', 'S2', s.line + 1, `This is a second ${q('## Steps')} section. Keep all steps in the first one.`);
  const section = sections[0];
  model.sectionLine = section.line + 1;
  const later = heads.filter(h => h.line > section.line);
  const sectionEndHead = later.find(h => h.level <= 2);
  const sectionEnd = sectionEndHead ? sectionEndHead.line : lines.length;
  const stepHeads = later.filter(h => h.level === 3 && h.line < sectionEnd);
  if (!stepHeads.length) {
    add('error', 'S3', section.line + 1, `${q('## Steps')} has no steps. Add a ${q('###')} heading for each step.`);
    return model;
  }

  const S = model.steps;
  const bodyLines = new Map<Step, number>();
  stepHeads.forEach((h, k) => {
    const next = later.find(x => x.line > h.line && x.level <= 3);
    const end = Math.min(next ? next.line : lines.length, sectionEnd);
    const s: Step = {
      id: 'n' + k, name: h.text, line: h.line + 1, range: { start: h.line + 1, end }, bodyLine: 0, type: 'action', outcomes: [], skill: null, until: null,
      join: null, text: '', directives: {}, directiveLines: {}, invalid: false, start: false, end: false,
    };
    // Directive block (SPEC 6).
    let j = h.line + 1;
    while (j < end && lines[j].trim() === '') j++;
    for (; j < end; j++) {
      const m = lines[j].match(/^\s*([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/);
      if (!m) break;
      const key = DIRECTIVES.find(d => d.toLowerCase() === m[1].toLowerCase());
      if (!key) {
        if (/^[A-Z][a-z]+$/.test(m[1])) {
          add('warning', 'D4', j + 1, `${q(m[1] + ':')} is not a directive, so this line is read as instructions. The directives are ${DIRECTIVES.join(', ')}.`, s);
        }
        break;
      }
      if (key in s.directives) {
        add('error', 'D2', j + 1, `${q(key + ':')} appears twice in ${q(s.name)}. Merge them into one line.`, s);
        s.invalid = true;
      } else {
        s.directives[key] = m[2].trim();
        s.directiveLines[key] = j + 1;
      }
    }
    // Instructions.
    s.bodyLine = j + 1;
    const text: string[] = [];
    let count = 0;
    for (; j < end; j++) {
      const t = lines[j].trim();
      if (!t) continue;
      count++;
      if (/^(`{3,}|~{3,})/.test(t)) continue;
      text.push(t.replace(/^([-*+]|\d+\.)\s+/, '').replace(/`|\*\*|__/g, ''));
    }
    s.text = text.join(' ');
    bodyLines.set(s, count);
    S.push(s);
  });

  const P = (severity: Severity, code: string, s: Step, key: string | null, message: string) => {
    add(severity, code, (key && s.directiveLines[key]) || s.line, message, s);
    if (severity === 'error') s.invalid = true;
  };

  // Per-step checks.
  for (const s of S) {
    if (!s.name) P('error', 'N2', s, null, 'This step heading has no name.');
    else if (/[,()]/.test(s.name)) P('error', 'N3', s, null, `${q(s.name)} contains a comma or bracket, so ${q('After:')} can’t refer to it. Rename the step.`);
    for (const key of Object.keys(s.directives)) {
      if (!s.directives[key]) P('error', 'D3', s, key, `${q(key + ':')} has no value.`);
    }

    const type = s.directives.Type;
    if (type) {
      const t = normalize(type) as StepType;
      if (STEP_TYPES.includes(t)) s.type = t;
      else P('error', 'D1', s, 'Type', `${q(type)} is not a step type. Use action, gate, human, human gate or skill.`);
    }

    const outcomes = s.directives.Outcomes;
    if (outcomes) {
      if (!isGate(s)) P('error', 'G2', s, 'Outcomes', `Only gates have outcomes. Add ${q('Type: gate')} or ${q('Type: human gate')} to ${q(s.name)}, or remove this line.`);
      const seen = new Set<string>();
      for (const o of outcomes.split(',').map(x => x.trim()).filter(Boolean)) {
        if (seen.has(normalize(o))) P('error', 'G4', s, 'Outcomes', `The outcome ${q(o)} is listed twice.`);
        else { seen.add(normalize(o)); s.outcomes.push(o); }
      }
    }
    if (isGate(s) && s.outcomes.length < 2) {
      P('error', 'G1', s, s.directiveLines.Outcomes ? 'Outcomes' : 'Type', s.outcomes.length
        ? `A gate needs at least two outcomes. ${q(s.name)} has one.`
        : `Gate ${q(s.name)} has no outcomes. Add a line like ${q('Outcomes: ok, failed')}.`);
    }

    const skill = s.directives.Skill;
    if (skill) {
      s.skill = skill;
      if (s.type !== 'skill') P('error', 'K2', s, 'Skill', `Only skill steps name a skill. Add ${q('Type: skill')} to ${q(s.name)} or remove this line.`);
      else if (!SKILL_NAME.test(skill)) P('error', 'K3', s, 'Skill', `${q(skill)} is not a valid skill name. Use lowercase letters, digits and single hyphens, like ${q('send-invoice')}.`);
    }
    if (s.type === 'skill' && !s.skill) P('error', 'K1', s, 'Type', `Skill step ${q(s.name)} doesn’t say which skill to run. Add a line like ${q('Skill: send-invoice')}.`);

    if (s.directives.Until) s.until = s.directives.Until;
    const join = s.directives.Join;
    if (join) {
      const j = join.toLowerCase();
      if (j === 'all' || j === 'any') s.join = j;
      else P('error', 'J1', s, 'Join', `${q(join)} is not a join. Use all or any.`);
    }
    if (!bodyLines.get(s)) P('warning', 'B1', s, null, `${q(s.name || 'This step')} has no instructions. Add a line or two saying what to do.`);
  }

  // Names (SPEC 5).
  const byName = new Map<string, Step>();
  for (const s of S) {
    if (!s.name) continue;
    const first = byName.get(normalize(s.name));
    if (first) P('error', 'N1', s, null, `There is already a step called ${q(first.name)} on line ${first.line}. Step names must be unique.`);
    else byName.set(normalize(s.name), s);
  }

  // Edges (SPEC 6.1).
  for (const s of S) {
    if (!s.directives.After) continue;
    const seen = new Set<string>();
    for (const part of s.directives.After.split(',')) {
      const item = part.trim();
      if (!item) { P('error', 'D3', s, 'After', `${q('After:')} has an empty name between commas.`); continue; }
      const m = item.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
      const name = m ? m[1].trim() : item;
      const outcome = m ? m[2].trim() : null;
      const t = byName.get(normalize(name));
      if (!t) {
        let best: Step | null = null, bestDistance = Infinity;
        for (const [key, v] of byName) {
          const d = levenshtein(normalize(name), key);
          if (d < bestDistance) { bestDistance = d; best = v; }
        }
        const hint = best && bestDistance <= Math.max(2, Math.floor(normalize(name).length / 3)) ? ` Did you mean ${q(best.name)}?` : '';
        P('error', 'E1', s, 'After', `There is no step called ${q(name)}.${hint}`);
        continue;
      }
      if (t === s) { P('error', 'E2', s, 'After', `${q(s.name)} waits on itself. Use ${q('Until:')} to repeat a step.`); continue; }
      let invalid = false;
      let label = outcome;
      if (isGate(t)) {
        if (!outcome) {
          P('error', 'E3', s, 'After', `${q(t.name)} is a gate, so say which outcome leads here, like ${q(`${t.name} (${t.outcomes[0] ?? 'ok'})`)}.`);
          invalid = true;
        } else if (t.outcomes.length) {
          const hit = t.outcomes.find(o => normalize(o) === normalize(outcome));
          if (hit) label = hit;
          else {
            P('error', 'E5', s, 'After', `${q(t.name)} has no outcome ${q(outcome)}. Its outcomes are ${t.outcomes.join(', ')}.`);
            invalid = true;
          }
        }
      } else if (outcome) {
        P('error', 'E4', s, 'After', `${q(t.name)} is not a gate, so it has no outcomes. Remove ${q(`(${outcome})`)} or make it a gate.`);
        invalid = true;
      }
      const key = t.id + '|' + normalize(outcome ?? '');
      if (seen.has(key)) { P('warning', 'E6', s, 'After', `${q(item)} is listed twice.`); continue; }
      seen.add(key);
      model.edges.push({ from: t, to: s, outcome: label, invalid });
    }
  }

  // Unused outcomes.
  for (const s of S) {
    if (!isGate(s)) continue;
    for (const o of s.outcomes) {
      if (!model.edges.some(e => e.from === s && e.outcome !== null && normalize(e.outcome) === normalize(o))) {
        P('warning', 'G3', s, 'Outcomes', `No step follows the ${q(o)} outcome of ${q(s.name)}.`);
      }
    }
  }

  // Joins (SPEC 6.6).
  for (const s of S) {
    if (!s.join) continue;
    const incoming = model.edges.filter(e => e.to === s);
    if (incoming.length < 2) P('warning', 'J2', s, 'Join', `${q(s.name)} waits for fewer than two steps, so ${q('Join:')} does nothing.`);
    if (s.join !== 'all') continue;
    const byGate = new Map<Step, Set<string>>();
    for (const e of incoming) {
      if (e.outcome === null) continue;
      const set = byGate.get(e.from) ?? new Set<string>();
      set.add(normalize(e.outcome));
      byGate.set(e.from, set);
    }
    for (const [g, set] of byGate) {
      if (set.size > 1) P('error', 'J3', s, 'Join', `${q(s.name)} waits for all of several outcomes of ${q(g.name)}, but only one can happen, so it would never run.`);
    }
  }

  // Start step (SPEC 7.4).
  const starts = S.filter(s => !('After' in s.directives));
  if (!starts.length) {
    add('error', 'F1', model.sectionLine, `Every step has ${q('After:')}, so the flow has no start. Remove ${q('After:')} from the first step.`);
  } else {
    starts[0].start = true;
    for (const s of starts.slice(1)) {
      P('error', 'F1', s, null, `${q(s.name)} has no ${q('After:')}, but ${q(starts[0].name)} already starts the flow. Add ${q('After:')} to say what it waits for.`);
    }
  }

  // Cycles (SPEC 7.3).
  const outgoing = new Map<Step, Edge[]>(S.map(s => [s, []]));
  for (const e of model.edges) outgoing.get(e.from)!.push(e);
  const color = new Map<Step, number>();
  const stack: Step[] = [];
  const found = new Set<string>();
  const visit = (s: Step) => {
    color.set(s, 1);
    stack.push(s);
    for (const e of outgoing.get(s)!) {
      const t = e.to;
      if (color.get(t) === 1) {
        const cycle = stack.slice(stack.indexOf(t));
        const key = cycle.map(x => x.id).sort().join();
        if (found.has(key)) continue;
        found.add(key);
        cycle.forEach((a, i) => {
          const b = cycle[(i + 1) % cycle.length];
          a.invalid = true;
          for (const ed of model.edges) if (ed.from === a && ed.to === b) ed.invalid = true;
        });
        const first = cycle.reduce((a, b) => (a.line < b.line ? a : b));
        const path = cycle.concat(cycle[0]).map(x => x.name).join(' → ');
        add('error', 'F2', first.line, `These steps wait on each other in a loop: ${path}. Put the retry inside one step with ${q('Until:')}.`, first);
      } else if (!color.has(t)) visit(t);
    }
    stack.pop();
    color.set(s, 2);
  };
  for (const s of S) if (!color.has(s)) visit(s);

  for (const s of S) s.end = !model.edges.some(e => e.from === s);
  problems.sort((a, b) => a.line - b.line || (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return model;
}

/** Returns only the problems of a Skillgram file. */
export function validate(source: string): Problem[] {
  return parse(source).problems;
}
