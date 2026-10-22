# Skillgram 0.1

Status: draft. October 2026.

Skillgram is a set of rules for writing a [Agent Skills](https://agentskills.io) `SKILL.md` file so that its steps form a directed acyclic graph. A Skillgram file is still a valid `SKILL.md`. People and agents read it as prose. Tools read the same text to validate it, draw it and compare versions.

The key words "must", "must not", "should" and "may" are used as in RFC 2119.

## 1. Opting in

A skill opts in by adding this to its frontmatter:

```yaml
metadata:
  skillgram: "0.1"
```

Tools that check many skills should only check skills that opt in. A tool that is given a single file, such as a playground, may check it without the marker.

## 2. Example

A complete Skillgram file. The frontmatter is ordinary Agent Skills frontmatter plus the opt-in marker from section 1.

```markdown
---
name: expense-report
description: Check a submitted expense report and send it for payment.
metadata:
  skillgram: "0.1"
---

# Expense report

Checks an expense report against its receipts and pays it out.

## Steps

### Collect receipts
Until: every line on the report has a receipt

Match each line on the report to a receipt. Ask the submitter for any that are missing.

### Check totals
After: Collect receipts
Type: gate
Outcomes: ok, off

Compare the report total with the sum of the receipts.

### Ask the submitter
After: Check totals (off)
Type: human

Send the difference to the submitter and wait for a corrected report.

### Pay it out
After: Check totals (ok)
Type: skill
Skill: schedule-payment

Pay the total with the next payroll run.
```

## 3. Reading the file

1. If the first line is `---`, everything up to and including the next `---` line is frontmatter. It is not part of the body.
2. Lines inside fenced code blocks (opened by three or more backticks or tildes) are never headings or directives.
3. A heading is a line of one to six `#` characters followed by a space or the end of the line. Its text is the rest of the line, trimmed, with any closing `#` characters removed.

## 4. The steps section

1. The steps section starts at the first level-2 heading whose text is `Steps`, compared without regard to case.
2. It ends at the next heading of level 1 or 2, or at the end of the file.
3. Each level-3 heading inside the steps section starts one step. The step ends at the next heading of level 1, 2 or 3, or at the end of the steps section.
4. Text between the `## Steps` heading and the first step is allowed and is not part of any step.
5. Everything outside the steps section is ordinary documentation. Headings of level 4 or deeper inside a step belong to that step's instructions.

## 5. Step names

1. A step's name is its heading text.
2. Two names are the same if they are equal after trimming, collapsing runs of whitespace to one space and converting to lower case. This is called the normalized name.
3. Names must be unique by normalized name.
4. Names must not contain `,`, `(` or `)`, because `After:` uses those characters.

## 6. Directives

A step's directive block is the run of directive lines directly under its heading. Blank lines between the heading and the first directive are allowed. The block ends at the first line that is not a directive line.

A directive line has the form `Key: value`. The key is compared without regard to case. The known keys are:

| Directive | Value | Default |
|---|---|---|
| `After` | Comma-separated references to other steps. | None. The step is the start step. |
| `Type` | `action`, `gate`, `human`, `human gate` or `skill`. | `action` |
| `Outcomes` | Two or more comma-separated outcome names. | None |
| `Skill` | The name of another skill. | None |
| `Until` | Plain text: a condition that ends the step. | None |
| `Join` | `any` or `all`. | `any` |

A line that looks like a directive but has an unknown key ends the directive block and is read as instructions. Validators warn about it when the key is a single capitalized word, such as `Note:`.

The lines after the directive block, up to the end of the step, are the step's instructions.

### 6.1 After

Each comma-separated item is either a step name or a step name followed by an outcome in brackets:

```text
After: Upload, Check totals (ok)
```

Each item is a dependency. It creates an edge from the named step to this step. Names are matched by normalized name. Outcomes are matched without regard to case.

### 6.2 Type

| Type | Meaning |
|---|---|
| `action` | The agent does the work. |
| `gate` | The agent makes a decision with a fixed set of outcomes. |
| `human` | The agent waits for a person: an approval, a pickup or an answer. |
| `human gate` | A person makes a decision with a fixed set of outcomes. The agent asks and waits. |
| `skill` | The agent runs another skill, named by `Skill:`. |

`gate` and `human gate` are both called gates in this document.

### 6.3 Outcomes

Only gates have outcomes. A gate must list at least two, and they must be unique without regard to case. A step that depends on a gate must name one of its outcomes.

### 6.4 Skill

Only skill steps have `Skill:`. The value must be a valid Agent Skills name: lowercase letters, digits and single hyphens, not starting or ending with a hyphen. Whether that skill exists is a repository-level check and is out of scope for a single-file validator.

### 6.5 Until

`Until:` says the step repeats its own instructions until the condition holds. It is how retries and polling are written. Steps never point back to earlier steps.

### 6.6 Join

`Join:` controls how a step with several dependencies decides whether to run. See section 8.

## 7. The graph

1. Each step is a node.
2. Each dependency is an edge from the named step to the dependent step, labelled with the outcome if there is one.
3. The graph must be acyclic.
4. Exactly one step has no `After:`. It is the start step.
5. Steps that no other step depends on are end steps.

## 8. How a flow runs

This section is guidance for agents and tools that track progress. It does not change what a valid file is.

1. The start step runs first.
2. A step's dependencies are done when each one has either finished or been skipped.
3. An edge with an outcome is taken only if its gate chose that outcome. An edge whose gate chose another outcome counts as skipped.
4. With `Join: any`, the default, a step runs if at least one of its dependencies ran and its edge was taken. If every dependency was skipped, the step is skipped too. This is how branches join again.
5. With `Join: all`, a step runs only if every dependency ran and every edge was taken. Otherwise it is skipped.
6. A step with `Until:` repeats until its condition holds. Steps that depend on it wait until it is done.

## 9. Validation

A validator reports problems. Each problem has a code, a severity, a line number (1-based) and a message. Errors mean the file does not follow Skillgram. Warnings point at things that are allowed but probably wrong. Messages are not part of the contract. Codes, severities and lines are.

| Code | Severity | Rule | Line reported |
|---|---|---|---|
| S1 | error | The file has a `## Steps` section. | 1 |
| S2 | error | There is only one `## Steps` section. | each extra section heading |
| S3 | error | The steps section contains at least one step. | the section heading |
| N1 | error | Step names are unique. | the later heading |
| N2 | error | Every step heading has a name. | the heading |
| N3 | error | Step names contain no commas or brackets. | the heading |
| D1 | error | `Type:` is a known type. | the `Type:` line |
| D2 | error | A directive appears at most once per step. | the repeated line |
| D3 | error | Every directive has a value, and `After:` has no empty items. | the directive line |
| D4 | warning | A line that looks like a directive uses a known key. | that line |
| E1 | error | Every name in `After:` is a step in this file. | the `After:` line |
| E2 | error | A step does not depend on itself. | the `After:` line |
| E3 | error | A dependency on a gate names an outcome. | the `After:` line |
| E4 | error | Only dependencies on gates name an outcome. | the `After:` line |
| E5 | error | The outcome named is one of the gate's outcomes. | the `After:` line |
| E6 | warning | A step lists each dependency once. | the `After:` line |
| G1 | error | A gate has at least two outcomes. | the `Outcomes:` line, else the `Type:` line |
| G2 | error | Only gates have `Outcomes:`. | the `Outcomes:` line |
| G3 | warning | Every outcome of a gate has a step that depends on it. | the `Outcomes:` line |
| G4 | error | A gate's outcomes are unique. | the `Outcomes:` line |
| K1 | error | A skill step has `Skill:`. | the `Type:` line |
| K2 | error | Only skill steps have `Skill:`. | the `Skill:` line |
| K3 | error | `Skill:` is a valid skill name. | the `Skill:` line |
| J1 | error | `Join:` is `any` or `all`. | the `Join:` line |
| J2 | warning | `Join:` is only used on steps with two or more dependencies. | the `Join:` line |
| J3 | error | A `Join: all` step does not depend on two outcomes of the same gate. | the `Join:` line |
| F1 | error | Exactly one step has no `After:`. | the section heading if none; each extra start step's heading |
| F2 | error | The graph has no cycles. | the heading of the cycle's first step in file order, once per cycle |
| B1 | warning | Every step has instructions. | the heading |

Further notes:

- When a dependency fails E1 or E2, no edge is created for it.
- When a dependency fails E3, E4 or E5, the edge is still created and marked invalid, so tools can draw it.
- When several problems share a line, their order is not part of the contract.

## 10. Comparing versions

Tools that compare two versions of a skill should:

1. Match steps by normalized name.
2. Treat a removed step and an added step with identical instructions as a rename.
3. Report, per matched step, changes to type, outcomes, skill, until, join and instructions.
4. Match edges by their two steps and outcome.

## 11. Versioning

The version in `metadata.skillgram` names the spec version a skill follows. Minor versions may add directives, types and warnings. They must not turn a valid file into an invalid one. Anything else needs a new major version.

## 12. Open questions

- **Stable step ids.** Progress tracking stores step names, so renaming a step loses its history. An optional `Id:` directive would fix that. It is not in 0.1.
- **Mixed joins.** A step can't say "wait for A, and for either B or C". `Join:` applies to all of a step's dependencies. Today the workaround is an extra step that joins B and C first.
