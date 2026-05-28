# Changelog

## Unreleased

- Switched the web dev server to `next dev --turbo` to avoid the Webpack dev-cache path that was repeatedly leaving `.next` in a broken state.
- Added `npm run clean:next`, a safer cache reset helper that refuses to move `apps/web/.next` while `next dev` appears to be running.
- Added `npm run doctor:dev` to report duplicate Next/Nest processes and active frontend/API port listeners.
- Documented multi-agent guardrails in `AGENTS.md`, especially around not deleting `apps/web/.next` during active dev or build processes.
