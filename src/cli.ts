#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parse } from './parse.js';
import { diff } from './diff.js';
import { toMermaid } from './mermaid.js';
import { render } from './render.js';

const USAGE = `Usage:
  skillgram lint <file>...                 Check files. Exits 1 on errors.
  skillgram mermaid <file> [--lr]          Print the graph as Mermaid.
  skillgram svg <file> [--lr]              Print the graph as SVG.
  skillgram diff <before> <after> [--mermaid] [--lr]
                                           List changes, or print a Mermaid diff.

Options:
  --json   Print lint results or diff changes as JSON.
  --lr     Draw left to right instead of top to bottom.`;

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const files = args.filter(a => !a.startsWith('--'));
const command = files.shift();
const direction = flags.has('--lr') ? 'LR' : 'TB';

function read(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    process.stderr.write(`skillgram: can't read ${path}: ${(e as Error).message}\n`);
    process.exit(2);
  }
}

function fail(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(2);
}

switch (command) {
  case 'lint': {
    if (!files.length) fail('skillgram lint: give at least one file.');
    let errors = 0;
    const results = files.map(file => {
      const problems = parse(read(file)).problems.map(({ stepId, ...p }) => p);
      errors += problems.filter(p => p.severity === 'error').length;
      return { file, problems };
    });
    if (flags.has('--json')) {
      process.stdout.write(JSON.stringify(results, null, 2) + '\n');
    } else {
      for (const r of results) {
        for (const p of r.problems) process.stdout.write(`${r.file}:${p.line}: ${p.severity} ${p.code} ${p.message}\n`);
      }
      const total = results.reduce((a, r) => a + r.problems.length, 0);
      process.stderr.write(`${files.length} file${files.length === 1 ? '' : 's'}, ${errors} error${errors === 1 ? '' : 's'}, ${total - errors} warning${total - errors === 1 ? '' : 's'}\n`);
    }
    process.exit(errors ? 1 : 0);
  }
  case 'mermaid': {
    if (files.length !== 1) fail('skillgram mermaid: give one file.');
    process.stdout.write(toMermaid(parse(read(files[0])), { direction }) + '\n');
    break;
  }
  case 'svg': {
    if (files.length !== 1) fail('skillgram svg: give one file.');
    const out = render(parse(read(files[0])), { direction, embedStyles: true });
    if (!out) { process.stderr.write('skillgram svg: the file has no steps.\n'); process.exit(1); }
    process.stdout.write(out.svg + '\n');
    break;
  }
  case 'diff': {
    if (files.length !== 2) fail('skillgram diff: give two files, before and after.');
    const d = diff(parse(read(files[0])), parse(read(files[1])));
    if (flags.has('--mermaid')) process.stdout.write(toMermaid(d, { direction }) + '\n');
    else if (flags.has('--json')) process.stdout.write(JSON.stringify(d.changes, null, 2) + '\n');
    else process.stdout.write(d.changes.length ? d.changes.map(c => `${c.kind.padEnd(8)} ${c.message}`).join('\n') + '\n' : 'No changes.\n');
    break;
  }
  case undefined:
  case 'help':
    process.stdout.write(USAGE + '\n');
    break;
  default:
    fail(`skillgram: unknown command ${command}.`);
}
