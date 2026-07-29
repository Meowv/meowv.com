# Repository Guidelines

## Project Structure & Module Organization

This Vinext/React worksheet generator exports as a static site. Route pages live in `app/` (for example, `app/hanzi/page.tsx` and `app/pen-control/page.tsx`). Shared UI belongs in `app/components/`; worksheet construction, canvas rendering, fonts, and types belong in `app/lib/`. Keep content data in `app/config/`. Global styling is in `app/globals.css`.

Static assets live in `public/`: fonts in `public/fonts/` and brand assets in `public/brand/`. `public/hanzi-data/` is generated from `hanzi-writer-data`; do not edit or commit it. The generator is `scripts/sync-hanzi-data.mjs`. Build output in `dist/` is also untracked.

## Build, Test, and Development Commands

- `npm run prepare:data` — regenerate stroke-order JSON files.
- `npm run dev` — prepare data, then run the local Vinext development server.
- `npm run build` — prepare data and create static output in `dist/`.
- `npm run start` — preview the most recent production build.

Use Node.js 22.13 or newer and install dependencies with `npm install`. There is no dedicated test, lint, or formatting command.

## Coding Style & Naming Conventions

Use TypeScript with strict compiler settings and React function components. Follow the existing style: two-space indentation, semicolons, double-quoted imports, and `@/` path aliases where they improve clarity. Use PascalCase for components (`WorksheetApp.tsx`), camelCase for functions and variables (`createWorksheet`), and lowercase route folders (`app/pen-control/`). Keep reusable behavior in `app/lib/` or `app/components/` instead of duplicating it across routes.

## Testing Guidelines

Before submitting a focused change, run the most relevant command: use `npm run build` when static output may be affected, or `npx tsc --noEmit` for TypeScript-only changes. Manually check the affected route in `npm run dev`, including generated worksheet pagination and print/export behavior when touching rendering. Add tests only alongside a selected test framework; none exists today.

## Commit & Pull Request Guidelines

The available history uses generic messages such as `1` and `init`, so it provides no reliable convention. Use clear Conventional Commit-style subjects going forward, such as `feat: add number worksheet preset` or `fix: preserve blank pen rows`. Keep commits focused. Pull requests should state the user-visible change, affected routes, validation performed, and include before/after screenshots for UI or layout work. Link the related issue when one exists.

## Configuration & Generated Data

Do not commit `.env*`, generated stroke data, or build output. Preserve the static-export configuration in `next.config.ts`; changes to routes, asset paths, or metadata should be verified in the built output as well as locally.
