# Agent Instructions

This repository is often edited by multiple coding agents at the same time. Keep changes small, coordinate through this file and `CHANGELOG.md`, and avoid actions that invalidate another agent's running dev server.

## Next.js Dev Server

- Use `npm run dev` for the web app. It runs `next dev --turbo` from the `@manualflow/web` workspace.
- Do not run multiple `next dev`, `next build`, or cache-clean commands against `apps/web` at the same time. One web dev server per working tree.
- Do not run `rm -rf apps/web/.next` while the dev server or a production build is running. This causes missing `routes-manifest.json`, `app-paths-manifest.json`, `page.js`, `_document.js`, and `vendor-chunks/*.js` errors.
- To reset the generated Next cache, stop the dev server first, then run `npm run clean:next`.
- If process inspection is unavailable and you are certain nothing is running, use `npm run clean:next -- --force`. Prefer the non-force command.

## Dependency Changes

- Avoid root-level transitive dependency pins as a quick audit fix unless `npm run build --workspace @manualflow/web` still passes afterward.
- Keep dependency range changes intentional and explain them in `CHANGELOG.md`.
- If changing Next, React, React DOM, ESLint config, Tailwind, or TypeScript versions, run the web build before handing off.

## Working Practices

- Check `git status --short` before editing so you do not overwrite another agent's work.
- Treat uncommitted changes as user or teammate work unless you know you made them.
- Prefer `rg` for searching.
- Prefer `apply_patch` for manual edits.
- Add a short `CHANGELOG.md` entry for user-visible behavior, dev workflow changes, dependency changes, or fixes that affect other agents.
