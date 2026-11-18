# Issue tracker: Local Markdown

Issues and specs for this repository live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The feature spec is `.scratch/<feature-slug>/spec.md` (for the PokeShop MVP, the canonical spec is `docs/SPEC.md`).
- Implementation tickets are separate files under `.scratch/<feature-slug>/issues/`, numbered from `01` in dependency order as `01-<slug>.md`, `02-<slug>.md`, and so on; never combine multiple tickets into one file.
- Each ticket has a `Blocked by` line listing prerequisite ticket numbers/titles, or `None (can start immediately)`.
- When an engineering skill requires the `ready-for-agent` state, record it as `Status: ready-for-agent` in the local Markdown file.
- Comments and follow-up decisions append under `## Comments`.

## When a skill says "publish to the issue tracker"

Create the spec or ticket files under the relevant `.scratch/<feature-slug>/` directory.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or ticket number directly.

## Wayfinding operations

- **Map:** `.scratch/<effort>/map.md`.
- **Child ticket:** `.scratch/<effort>/issues/NN-<slug>.md`, with `Type: research|prototype|grilling|task` and `Status: claimed|resolved`.
- **Blocking:** `Blocked by: NN, NN`; a child is unblocked when all listed tickets are resolved.
- **Frontier:** scan `.scratch/<effort>/issues/` for open, unblocked, unclaimed files; first by number wins.
- **Claim:** set `Status: claimed` and save before beginning work.
- **Resolve:** append the result under `## Answer`, set `Status: resolved`, and append a brief context pointer to the map's Decisions-so-far.
