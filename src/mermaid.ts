import { isGate } from './parse.js';
import type { DiffModel, Model } from './types.js';

export interface MermaidOptions {
  /** `TB` (default) or `LR`. */
  direction?: 'TB' | 'LR';
}

/**
 * Renders a model or a diff as a Mermaid flowchart. Diffs get colored
 * classes for added, changed and removed steps and edges.
 */
export function toMermaid(model: Model | DiffModel, options: MermaidOptions = {}): string {
  const q = (t: string) => '"' + t.replace(/"/g, '#quot;') + '"';
  const out = [`flowchart ${options.direction ?? 'TB'}`];
  for (const s of model.steps) {
    const l = q(s.name || 'Unnamed');
    const shape = isGate(s) ? `{{${l}}}` : s.type === 'human' ? `([${l}])` : s.type === 'skill' ? `[[${l}]]` : `[${l}]`;
    out.push(`  ${s.id}${shape}`);
  }
  const links: Record<'added' | 'removed', number[]> = { added: [], removed: [] };
  model.edges.forEach((e, i) => {
    const arrow = e.diff === 'removed' ? '-.->' : '-->';
    out.push(`  ${e.from.id} ${arrow}${e.outcome ? `|${q(e.outcome)}|` : ''} ${e.to.id}`);
    if (e.diff) links[e.diff].push(i);
  });
  const classes: Record<'added' | 'changed' | 'removed', string[]> = { added: [], changed: [], removed: [] };
  for (const s of model.steps) if (s.diff) classes[s.diff === 'renamed' ? 'changed' : s.diff].push(s.id);
  if (Object.values(classes).some(c => c.length) || links.added.length || links.removed.length) {
    out.push('  classDef added stroke:#1c7246,stroke-width:3px');
    out.push('  classDef changed stroke:#946000,stroke-width:3px');
    out.push('  classDef removed stroke:#be3128,stroke-dasharray:5 3,opacity:0.55');
    for (const [c, ids] of Object.entries(classes)) if (ids.length) out.push(`  class ${ids.join(',')} ${c}`);
    if (links.added.length) out.push(`  linkStyle ${links.added.join(',')} stroke:#1c7246,stroke-width:2px`);
    if (links.removed.length) out.push(`  linkStyle ${links.removed.join(',')} stroke:#be3128`);
  }
  return out.join('\n');
}
