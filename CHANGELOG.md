# Changelog

## Unreleased

- Added hoverable Copy Code controls and clearer language badges for reader code blocks.
- Loaded Inter for body copy and Outfit for headings through Next font optimization.
- Added smoother micro-interactions and scale/shadow hover treatments for manual cards and shared interactive surfaces.
- Added environment-configured OIDC SSO sign-in for Google Workspace, Microsoft Entra ID, Okta, and Keycloak.
- Added a global Cmd/Ctrl+K quick search overlay with keyboard navigation, recent searches, and snippet-derived answers.
- Added a real server-side manual PDF export route and replaced the reader PDF button's print-dialog shortcut.
- Improved print styles with cover pages, page breaks, widows/orphans, hidden chrome, and page counters.
- Added reader support for Mermaid diagram blocks, directive callouts, details panels, and richer tab/code groups.
- Added slash-command inserts for rich manual blocks, including warnings, code, images, tables, and code tab switchers.
- Hid admin-only navigation items from users without admin access.
- Hid authenticated-only reader metadata and operational actions from public manual pages.
- Switched the web dev server to `next dev --turbo` to avoid the Webpack dev-cache path that was repeatedly leaving `.next` in a broken state.
- Added `npm run clean:next`, a safer cache reset helper that refuses to move `apps/web/.next` while `next dev` appears to be running.
- Added `npm run doctor:dev` to report duplicate Next/Nest processes and active frontend/API port listeners.
- Documented multi-agent guardrails in `AGENTS.md`, especially around not deleting `apps/web/.next` during active dev or build processes.
