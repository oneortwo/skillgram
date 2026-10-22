import { normalize, parse } from './parse.js';
import type { Join, Step, StepType } from './types.js';

/** One entry in a step's `After:` line. */
export interface Dependency {
  name: string;
  outcome: string | null;
}

/** Everything needed to write one step. */
export interface StepInput {
  name: string;
  type: StepType;
  after: Dependency[];
  outcomes: string[];
  skill: string | null;
  until: string | null;
  join: Join | null;
  /** Raw Markdown instructions. */
  instructions: string;
}

const split = (source: string) => source.split(/\r?\n/);
const joiner = (source: string) => (source.includes('\r\n') ? '\r\n' : '\n');
const find = (steps: Step[], name: string) => steps.find(s => normalize(s.name) === normalize(name));

function parseAfter(value: string): Dependency[] {
  return value.split(',').map(x => x.trim()).filter(Boolean).map(item => {
    const m = item.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    return m ? { name: m[1].trim(), outcome: m[2].trim() } : { name: item, outcome: null };
  });
}

const formatAfter = (deps: Dependency[]) => deps.map(d => (d.outcome ? `${d.name} (${d.outcome})` : d.name)).join(', ');

/** Writes one step as Markdown lines, leaving out defaults. */
export function formatStep(input: StepInput): string[] {
  const out = [`### ${input.name.trim()}`];
  if (input.after.length) out.push(`After: ${formatAfter(input.after)}`);
  if (input.type !== 'action') out.push(`Type: ${input.type}`);
  if (input.outcomes.length) out.push(`Outcomes: ${input.outcomes.join(', ')}`);
  if (input.skill) out.push(`Skill: ${input.skill}`);
  if (input.until) out.push(`Until: ${input.until}`);
  if (input.join === 'all') out.push('Join: all');
  const body = input.instructions.trim();
  if (body) out.push('', ...split(body));
  return out;
}

/** Index just after the step's last non-blank line. */
function contentEnd(lines: string[], s: Step): number {
  let e = s.range.end;
  while (e > s.line && lines[e - 1].trim() === '') e--;
  return e;
}

/** Reads a step back into a `StepInput`, or null if there is no such step. */
export function readStep(source: string, name: string): StepInput | null {
  const s = find(parse(source).steps, name);
  if (!s) return null;
  const lines = split(source);
  return {
    name: s.name,
    type: s.type,
    after: s.directives.After ? parseAfter(s.directives.After) : [],
    outcomes: [...s.outcomes],
    skill: s.skill,
    until: s.until,
    join: s.join,
    instructions: lines.slice(s.bodyLine - 1, contentEnd(lines, s)).join('\n').trim(),
  };
}

/**
 * Adds a step. It goes after the step named in `options.after`, or at the end
 * of the steps section. Creates the section if the file has none.
 */
export function addStep(source: string, input: StepInput, options: { after?: string } = {}): string {
  const model = parse(source);
  const lines = split(source);
  const block = formatStep(input);
  if (model.sectionLine === null) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length) lines.push('');
    lines.push('## Steps', '', ...block, '');
    return lines.join(joiner(source));
  }
  const anchor = (options.after && find(model.steps, options.after)) || model.steps[model.steps.length - 1];
  let at: number;
  if (anchor) {
    at = contentEnd(lines, anchor);
  } else {
    // No steps yet: go after the section's last non-blank line.
    let end = model.sectionLine;
    while (end < lines.length && !/^#{1,2}(\s|$)/.test(lines[end])) end++;
    at = end;
    while (at > model.sectionLine && lines[at - 1].trim() === '') at--;
  }
  const insert = ['', ...block];
  if (at < lines.length && lines[at].trim() !== '') insert.push('');
  lines.splice(at, 0, ...insert);
  if (at + insert.length >= lines.length) lines.push('');
  return lines.join(joiner(source));
}

function rewriteAfter(source: string, change: (deps: Dependency[]) => Dependency[]): string {
  const model = parse(source);
  const lines = split(source);
  const steps = model.steps.filter(s => s.directives.After !== undefined).sort((a, b) => b.line - a.line);
  for (const s of steps) {
    const before = parseAfter(s.directives.After);
    const after = change(before);
    if (formatAfter(before) === formatAfter(after)) continue;
    const i = s.directiveLines.After - 1;
    if (after.length) lines[i] = `After: ${formatAfter(after)}`;
    else lines.splice(i, 1);
  }
  return lines.join(joiner(source));
}

/** Replaces a step. A rename also updates every `After:` that refers to it. */
export function updateStep(source: string, name: string, input: StepInput): string {
  const s = find(parse(source).steps, name);
  if (!s) return source;
  const lines = split(source);
  lines.splice(s.line - 1, contentEnd(lines, s) - (s.line - 1), ...formatStep(input));
  const out = lines.join(joiner(source));
  if (normalize(input.name) === normalize(s.name)) return out;
  return rewriteAfter(out, deps => deps.map(d => (normalize(d.name) === normalize(s.name) ? { ...d, name: input.name.trim() } : d)));
}

/** Removes a step and every reference to it. */
export function removeStep(source: string, name: string): string {
  const s = find(parse(source).steps, name);
  if (!s) return source;
  const lines = split(source);
  let end = contentEnd(lines, s);
  while (end < lines.length && lines[end].trim() === '') end++;
  lines.splice(s.line - 1, end - (s.line - 1));
  return rewriteAfter(lines.join(joiner(source)), deps => deps.filter(d => normalize(d.name) !== normalize(s.name)));
}
