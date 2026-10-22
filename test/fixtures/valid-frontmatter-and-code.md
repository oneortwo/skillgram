---
name: example
description: Headings in frontmatter and code blocks are ignored.
metadata:
  skillgram: "0.1"
---

# Example

Intro text.

```markdown
## Steps
### Not a step
```

## Steps

Text before the first step is fine.

### First
Do the first thing.

```bash
### not a heading
After: Nothing
```

#### Details
Deeper headings belong to the step.

### Second
after: first
TYPE: action

Lower-case keys and names still match.

## Notes

### Not a step either
This section is ordinary documentation.
