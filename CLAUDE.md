# CLAUDE.md — Mockup Studio

Extends the global `CLAUDE.md`. This is the mockup module of the Etsy Automation project, split out because it is published on GitHub Pages — **this repo is public**. Project context, session notes and decisions live in the private `EtsyAutomation` project and `memory/projects/EtsyAutomation.md`; never write session notes, shop data, designs or listing copy here.

## Rules

- The Design Fidelity Rules in `js/rules.js` are non-negotiable. The design is never passed to an image generator, never cropped, and only warped, lit and textured.
- Static site only: no backend, no network calls with user files, no build step.
- Real test images go in `tests/local/` (git-ignored). Run `tests/selftest.html` after any change to `js/`.

## Deploy

Push to `main` on `nspitz/MockupStudio`; GitHub Pages serves the repo root.
