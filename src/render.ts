import dagre from '@dagrejs/dagre';
import { isGate } from './parse.js';
import type { DiffModel, Model, Step } from './types.js';

export type Measure = (text: string, font: string) => number;

export interface RenderOptions {
  /** `TB` (default) or `LR`. */
  direction?: 'TB' | 'LR';
  /** Show each step's instructions inside its node. */
  descriptions?: boolean;
  /** Prefix for marker ids, so several SVGs can share a page. */
  idPrefix?: string;
  /** Text width function. Browsers should pass a canvas-based one. */
  measure?: Measure;
  /** Add `tabindex` and `role="button"` to nodes. */
  interactive?: boolean;
  /** Embed a `<style>` block so the SVG works on its own. */
  embedStyles?: boolean;
}

export interface Rendered {
  svg: string;
  width: number;
  height: number;
}

export const FONTS = {
  tag: '500 10px ui-monospace, monospace',
  label: '600 13.5px system-ui, sans-serif',
  sub: '400 11px ui-monospace, monospace',
  until: 'italic 400 12px system-ui, sans-serif',
  body: '400 12px system-ui, sans-serif',
  edge: '500 11px ui-monospace, monospace',
};
const SIZE: Record<string, number> = { 'n-tag': 10, 'n-label': 13.5, 'n-sub': 11, 'n-until': 12, 'n-body': 12 };

/** Rough text width for environments without a canvas. */
export const approximateMeasure: Measure = (text, font) => {
  const px = Number(font.match(/([\d.]+)px/)?.[1] ?? 12);
  const mono = font.includes('monospace');
  return text.length * px * (mono ? 0.62 : 0.56);
};

/** Styles for the classes the renderer emits. Colors read CSS variables with light fallbacks. */
export const STYLES = `
.node .shape{fill:var(--sg-node,#fff);stroke:var(--sg-line,#8f9bad);stroke-width:1.25}
.t-gate .shape{fill:var(--sg-gate-bg,#fdf1dc);stroke:var(--sg-gate,#c0821a)}
.t-human .shape,.t-human-gate .shape{fill:var(--sg-human-bg,#e0f2ee);stroke:var(--sg-human,#26806e)}
.t-skill .shape{fill:var(--sg-skill-bg,#e4e9fb);stroke:var(--sg-skill,#2443c4)}
.t-skill .bar{stroke:var(--sg-skill,#2443c4);stroke-width:1.25}
.node.start .shape{stroke-width:2.4}
.node.invalid .shape{stroke:var(--sg-err,#be3128);stroke-width:2;stroke-dasharray:5 3}
.n-tag{font:${FONTS.tag};fill:var(--sg-muted,#566173);letter-spacing:.08em}
.n-label{font:${FONTS.label};fill:var(--sg-fg,#151c27)}
.n-sub{font:${FONTS.sub};fill:var(--sg-skill,#2443c4)}
.n-until{font:${FONTS.until};fill:var(--sg-muted,#566173)}
.n-body{font:${FONTS.body};fill:var(--sg-muted,#566173)}
.edge{fill:none;stroke:var(--sg-line,#8f9bad);stroke-width:1.5}
.edge.invalid{stroke:var(--sg-err,#be3128);stroke-dasharray:5 3}
.arrow{fill:var(--sg-line,#8f9bad)}.arrow.bad{fill:var(--sg-err,#be3128)}.arrow.ok{fill:var(--sg-ok,#1c7246)}
.elabel rect{fill:var(--sg-bg,#fff);stroke:var(--sg-gate,#c0821a);stroke-width:1}
.elabel text{font:${FONTS.edge};fill:var(--sg-fg,#151c27)}
.elabel.invalid rect{stroke:var(--sg-err,#be3128)}
.node.d-added .shape{stroke:var(--sg-ok,#1c7246);stroke-width:2.6;stroke-dasharray:none}
.node.d-changed .shape,.node.d-renamed .shape{stroke:var(--sg-warn,#946000);stroke-width:2.6;stroke-dasharray:none}
.node.d-removed{opacity:.55}
.node.d-removed .shape{stroke:var(--sg-err,#be3128);stroke-width:2;stroke-dasharray:5 3}
.node.d-removed .n-label{text-decoration:line-through}
.node.d-added .n-tag{fill:var(--sg-ok,#1c7246)}
.node.d-changed .n-tag,.node.d-renamed .n-tag{fill:var(--sg-warn,#946000)}
.node.d-removed .n-tag{fill:var(--sg-err,#be3128)}
.edge.d-added{stroke:var(--sg-ok,#1c7246);stroke-width:2.2;stroke-dasharray:none}
.edge.d-removed{stroke:var(--sg-err,#be3128);stroke-dasharray:5 3;opacity:.6}
.elabel.d-added rect{stroke:var(--sg-ok,#1c7246)}
.elabel.d-removed{opacity:.6}
`;

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const typeClass = (t: string) => 't-' + t.replace(' ', '-');

interface Row { t: string; cls: string; font: string; h: number }
interface Box { width: number; height: number; rows: Row[] }

function clip(t: string, font: string, max: number, measure: Measure): string {
  if (measure(t, font) <= max) return t;
  while (t.length > 1 && measure(t + '…', font) > max) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function wrap(text: string, font: string, max: number, maxLines: number, measure: Measure): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const t = cur ? cur + ' ' + w : w;
    if (!cur || measure(t, font) <= max) cur = t;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    kept[maxLines - 1] = clip(out.slice(maxLines - 1).join(' '), font, max, measure);
    return kept;
  }
  return out.map(l => clip(l, font, max, measure));
}

function nodeBox(s: Step, o: RenderOptions, measure: Measure): Box {
  const max = o.descriptions ? 230 : 200;
  const rows: Row[] = [];
  const tags: string[] = [];
  if (s.diff) tags.push(s.diff);
  if (s.start) tags.push('start');
  if (s.type !== 'action') tags.push(s.type);
  if (s.join === 'all') tags.push('join all');
  if (s.end) tags.push('end');
  if (tags.length) rows.push({ t: tags.join(' · ').toUpperCase(), cls: 'n-tag', font: FONTS.tag, h: 14 });
  for (const t of wrap(s.name || '(no name)', FONTS.label, max, 3, measure)) rows.push({ t, cls: 'n-label', font: FONTS.label, h: 18 });
  if (s.skill) rows.push({ t: clip(s.skill, FONTS.sub, max, measure), cls: 'n-sub', font: FONTS.sub, h: 16 });
  if (s.until) for (const t of wrap('↻ until ' + s.until, FONTS.until, max, 2, measure)) rows.push({ t, cls: 'n-until', font: FONTS.until, h: 16 });
  if (o.descriptions && s.text) {
    rows.push({ t: '', cls: 'n-gap', font: FONTS.body, h: 6 });
    for (const t of wrap(s.text, FONTS.body, max, 6, measure)) rows.push({ t, cls: 'n-body', font: FONTS.body, h: 16 });
  }
  const inner = Math.max(...rows.map(r => measure(r.t, r.font) * (r.cls === 'n-tag' ? 1.12 : 1.04)));
  const padX = isGate(s) ? 28 : 16;
  return {
    width: Math.max(120, Math.ceil(inner + padX * 2)),
    height: Math.ceil(rows.reduce((a, r) => a + r.h, 0) + 20 + (tags.length ? 2 : 0)),
    rows,
  };
}

/** Lays out a model or a diff with dagre and renders it as an SVG string. */
export function render(model: Model | DiffModel, options: RenderOptions = {}): Rendered | null {
  if (!model.steps.length) return null;
  const measure = options.measure ?? approximateMeasure;
  const k = options.idPrefix ?? 'sg';
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: options.direction ?? 'TB', nodesep: 30, ranksep: 50, edgesep: 16, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  const boxes = new Map<string, Box>();
  for (const s of model.steps) {
    const box = nodeBox(s, options, measure);
    boxes.set(s.id, box);
    g.setNode(s.id, { width: box.width, height: box.height });
  }
  model.edges.forEach((e, i) => {
    const label = e.outcome ? { width: Math.ceil(measure(e.outcome, FONTS.edge)) + 16, height: 18, labelpos: 'c' } : { width: 0, height: 0 };
    g.setEdge(e.from.id, e.to.id, label, 'e' + i);
  });
  dagre.layout(g);
  const graph = g.graph() as { width?: number; height?: number };
  const W = Math.ceil(graph.width ?? 0), H = Math.ceil(graph.height ?? 0);
  const n1 = (x: number) => x.toFixed(1);

  let edges = '', labels = '', nodes = '';
  model.edges.forEach((e, i) => {
    const ed = g.edge({ v: e.from.id, w: e.to.id, name: 'e' + i }) as unknown as { points: { x: number; y: number }[]; x: number; y: number };
    const p = ed.points;
    let d = `M${n1(p[0].x)},${n1(p[0].y)}`;
    if (p.length === 2) d += ` L${n1(p[1].x)},${n1(p[1].y)}`;
    for (let n = 1; n < p.length - 1; n++) {
      const last = n === p.length - 2;
      const ex = last ? p[n + 1].x : (p[n].x + p[n + 1].x) / 2;
      const ey = last ? p[n + 1].y : (p[n].y + p[n + 1].y) / 2;
      d += ` Q${n1(p[n].x)},${n1(p[n].y)} ${n1(ex)},${n1(ey)}`;
    }
    const marker = e.diff === 'added' ? 'ok' : e.invalid || e.diff === 'removed' ? 'bad' : 'a';
    const cls = `${e.invalid ? ' invalid' : ''}${e.diff ? ' d-' + e.diff : ''}`;
    edges += `<path class="edge${cls}" d="${d}" marker-end="url(#${k}-${marker})"/>`;
    if (e.outcome) {
      const lw = Math.ceil(measure(e.outcome, FONTS.edge)) + 14;
      labels += `<g class="elabel${cls}" transform="translate(${n1(ed.x)},${n1(ed.y)})"><rect x="${-lw / 2}" y="-9" width="${lw}" height="18" rx="9"/><text y="3.8" text-anchor="middle">${esc(e.outcome)}</text></g>`;
    }
  });

  for (const s of model.steps) {
    const n = g.node(s.id) as unknown as { x: number; y: number };
    const box = boxes.get(s.id)!;
    const w = box.width, h = box.height;
    let shape: string;
    if (isGate(s)) shape = `<polygon class="shape" points="13,0 ${w - 13},0 ${w},${h / 2} ${w - 13},${h} 13,${h} 0,${h / 2}"/>`;
    else if (s.type === 'human') shape = `<rect class="shape" width="${w}" height="${h}" rx="${Math.min(h / 2, 20)}"/>`;
    else if (s.type === 'skill') shape = `<rect class="shape" width="${w}" height="${h}" rx="3"/><line class="bar" x1="7" y1="0" x2="7" y2="${h}"/><line class="bar" x1="${w - 7}" y1="0" x2="${w - 7}" y2="${h}"/>`;
    else shape = `<rect class="shape" width="${w}" height="${h}" rx="7"/>`;
    let y = 10, text = '';
    for (const r of box.rows) {
      if (r.cls === 'n-gap') { y += r.h; continue; }
      text += `<text class="${r.cls}" x="${w / 2}" y="${n1(y + r.h / 2 + SIZE[r.cls] * 0.36)}" text-anchor="middle">${esc(r.t)}</text>`;
      y += r.h + (r.cls === 'n-tag' ? 2 : 0);
    }
    const tip = (s.name || 'Unnamed step') + (s.until ? '. Until ' + s.until : '') + (s.diffNotes ? '. Changed: ' + s.diffNotes.join('; ') : '');
    const cls = `node ${typeClass(s.type)}${s.diff ? ' d-' + s.diff : ''}${s.invalid ? ' invalid' : ''}${s.start ? ' start' : ''}${s.end ? ' end' : ''}`;
    const a11y = options.interactive ? ` tabindex="0" role="button" aria-label="${esc(tip)}"` : '';
    nodes += `<g class="${cls}" data-id="${s.id}" data-line="${s.line}" transform="translate(${n1(n.x - w / 2)},${n1(n.y - h / 2)})"${a11y}><title>${esc(tip)}</title>${shape}${text}</g>`;
  }

  const marker = (id: string, cls: string) => `<marker id="${k}-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" class="arrow${cls}"/></marker>`;
  const style = options.embedStyles ? `<style>${STYLES}</style>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${style}<defs>${marker('a', '')}${marker('bad', ' bad')}${marker('ok', ' ok')}</defs>${edges}${labels}${nodes}</svg>`;
  return { svg, width: W, height: H };
}
