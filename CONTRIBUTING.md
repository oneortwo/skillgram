# Contributing

Open an issue or a pull request. Keep changes small.

- `SPEC.md` is the source of truth. A behavior change starts there, then the fixtures, then the code.
- Every validator rule has a fixture in `test/fixtures/`. The `.json` next to it holds the expected codes, severities and lines. After a deliberate change, run `npm run fixtures:snapshot` and review the diff before committing.
- Run `npm run check` before submitting.
- Run `npm run site` and open `site/index.html` through a local server to try the playground.
- Use generic examples. Don't add skills from private repositories.
