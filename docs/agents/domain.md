# Domain Docs

Engineering skills should consume this repository’s domain documentation as follows.

## Before exploring, read these

- `CONTEXT.md` at the repository root, if present.
- `docs/adr/`, reading ADRs that touch the area being explored.

If these files do not exist, proceed silently. Do not suggest creating them upfront; create them lazily when domain terms or decisions are actually resolved.

## File structure

This is a single-context repository:

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── 0002-example-decision.md
└── src/
```

## Use the glossary’s vocabulary

When output names a domain concept, use the term defined in `CONTEXT.md`. If a needed concept is not defined there, treat that as a signal for domain modeling rather than silently inventing a synonym.

## Flag ADR conflicts

If output contradicts an existing ADR, surface that explicitly rather than silently overriding it.
