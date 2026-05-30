# Changelog

## Unreleased

- Smoothed manual reader scrolling by avoiding scroll-time React rerenders and stabilizing missing content images.
- Added pasted image support in the manual editor by uploading clipboard images into the asset library before insertion.
- Raised the API request body limit for rich manual page saves, configurable with `API_BODY_LIMIT`.
- Placed public manual Last updated and Reading time cards on the same row.
- Stabilized manual video embeds by loading trusted YouTube/Vimeo iframes eagerly with explicit media permissions.
- Removed the duplicate manual title and description from public reader cards.
- Cleared default login credentials, improved login placeholders, and simplified authentication error messages.
- Added asset library “Used in” visibility with linked manual/page usage details.
- Reframed Admin as a control center with grouped identity, access, integration, email, audit, space, content, and health cards.
- Split Admin management into separate submenu pages for users, groups, permissions, API keys, email, and audit.
- Added a Wiki.js-inspired Admin System Info page with application, runtime, database, and host details.
- Added an Admin Comments center for reviewing comments, reviewer notes, and change requests across manuals.
- Added an Admin Authentication page for configuring Local, LDAP, Keycloak, and SAML 2.0 strategies.
- Added Admin Analytics provider settings for Google Analytics and Google Tag Manager with frontend script injection.
- Added an editor governance workflow visualizer and inline comment pinning for selected manual text.
- Improved the manual authoring experience with clearer slash commands, an in-context visual editor surface, and drag-and-drop page reordering/nesting.
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
