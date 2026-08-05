# Contributing

Thoughtline treats the approved prototype, domain language, and ADRs as implementation constraints.

1. Read [CONTEXT.md](CONTEXT.md), [docs/adr](docs/adr), and the current approved prototype before changing behavior or UI.
2. Do not overwrite a numbered prototype. A future visual change creates the next version in `prototypes/extention/` or `prototypes/web/` and updates `prototypes/README.md` according to ADR 0038.
3. Keep provider and source integrations behind application ports. Validate every external or persisted boundary with Zod.
4. Preserve passive LinkedIn extraction: no clicking, scrolling, expansion, extra LinkedIn requests, or publishing.
5. Reuse local UI primitives and Tailwind tokens. Do not add feature-level vanilla CSS.
6. Add tests proportional to the change. Visual changes require intentional Playwright snapshot updates and manual review.

Before opening a change:

```bash
pnpm install
pnpm check
pnpm test:e2e
```

Run `pnpm format` when formatting changes are needed. Never update snapshots merely to silence a mismatch; first confirm the new rendering still follows the approved visual contract and passes accessibility checks.
