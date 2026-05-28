# Changelog

## Unreleased

- Added reader support for Mermaid diagram blocks, directive callouts, details panels, and richer tab/code groups.
- Added slash-command inserts for rich manual blocks, including warnings, code, images, tables, and code tab switchers.
- Hid admin-only navigation items from users without admin access.
- Hid authenticated-only reader metadata and operational actions from public manual pages.
- Switched the web dev server to `next dev --turbo` to avoid the Webpack dev-cache path that was repeatedly leaving `.next` in a broken state.
- Added `npm run clean:next`, a safer cache reset helper that refuses to move `apps/web/.next` while `next dev` appears to be running.
- Added `npm run doctor:dev` to report duplicate Next/Nest processes and active frontend/API port listeners.
- Documented multi-agent guardrails in `AGENTS.md`, especially around not deleting `apps/web/.next` during active dev or build processes.
