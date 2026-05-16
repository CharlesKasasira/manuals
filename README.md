# Manuals

Manuals is a professional manuals governance platform for creating, reviewing, publishing, searching, and reading organizational project manuals.

```
Backend
cp .env.example .env
docker compose up -d mysql
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api


Frontend
npm run dev
```

## Stack

- `apps/api`: NestJS REST API, Prisma, MySQL, JWT auth, RBAC.
- `apps/web`: Next.js App Router, Tailwind, React Query, lucide icons.
- `packages/shared`: shared roles, statuses, visibility values, and API types.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Install dependencies with `npm ci` from the committed lockfile.
3. Start MySQL with `docker compose up -d mysql` or point `DATABASE_URL` at an existing MySQL 8 database.
4. For local schema authoring, create a migration with `npm run db:migrate:dev`.
5. Apply existing migrations with `npm run db:migrate`, then run `npm run db:seed`.
6. Run API with `npm run dev:api`.
7. Run web with `npm run dev`.

In CI/CD pipelines, use `npm run db:migrate`. It maps to non-interactive `prisma migrate deploy`.

The seeded admin defaults to `admin@manualflow.local` / `Manuals123!`.

## Implemented MVP Surface

- Auth: login, logout, current user, admin user creation.
- Manuals: create, update, list, read, delete, submit review, approve, request changes, publish, archive.
- Pages: nested page creation, update, delete, reorder.
- Assets: upload, list, download, usages, delete.
- Public reader: published public manuals only.
- Search: permission-aware MySQL-backed manual and asset search abstraction.
- Governance: review queue, audit logs, manual analytics, notification outbox records.
