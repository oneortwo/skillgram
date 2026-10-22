# skillgram

The Skillgram spec and its reference implementation: parser, validator, layout, diff and a playground site.

- This repository is public. Use generic examples only. Never add company names, internal tools, real skills from private repos, or credentials.
- `SPEC.md` is the source of truth. A behavior change starts there, then fixtures, then code.
- Every validator rule has a fixture in `test/fixtures/`. The expected problems in the fixture's `.json` file are the contract.
- Keep the core (`parse`, `validate`, `diff`, `toMermaid`) free of runtime dependencies. Layout may depend on dagre.
- Run `npm run check` before publishing changes.
- Write docs in short, plain sentences.
- Update CHANGELOG for user-facing changes.
