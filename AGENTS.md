# Agent instructions — properties-crawler

This repository mixes **older patterns** (site-specific Cheerio scraping, `crawler` v1) with **modernized tooling** (TypeScript 5.9, **PostgreSQL** via `pg`, Serverless Framework 3, Lambda **Node.js 20**). Expect fragile selectors and small inconsistencies between packages. **Prefer small, targeted changes** when fixing or extending.

## What this project does

- **Goal** (from product intent): crawl real-estate listings from multiple Serbian sites, apply **shared filters** (rooms, area, floor, price, attic/basement rules), persist matches, and notify (e.g. email — see `Readme.md`; not all of that may be implemented in code).
- **Implemented today**: a **Node crawler** (`crawler/`) walks links with the `[crawler](https://www.npmjs.com/package/crawler)` package and Cheerio-loaded pages; **site-specific adapters** map HTML to a common `Property` shape and write to **PostgreSQL**. A **Serverless backend** (`backend/`) exposes at least one HTTP handler that reads from the same database.

## Repository layout


| Path                                       | Role                                                                                                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crawler/`                                 | Standalone crawler app: `src/index.ts` entry, `**esbuild`** bundle to `dist/index.js` (`esbuild.config.mjs`), run via `npm start` or `start:offline` (**tsx** runs source directly).                                                                |
| `crawler/src/adapters/`                    | One class per source site, extending `AbstractAdapter`. Registration list: `adapter.enum.ts`.                                                                                                                                                       |
| `crawler/src/utils/db.ts`                  | `**pg` `Pool`** singleton; `putProperty` (skips insert if `property_url` already exists), `getItemByURL`, `getItemById` (`id` + `property_type`, default `property_type` 0). On `connect()`, runs `CREATE TABLE IF NOT EXISTS` for local bootstrap. |
| `sql/schema.sql`                           | Canonical DDL for the `properties` table (optional if you rely on crawler auto-create).                                                                                                                                                             |
| `docker-compose.yml`                       | **postgres** (16-alpine), **adminer** (web UI on **8080**, Postgres — not phpMyAdmin), **backend** (Serverless Offline **3000**), **crawler**. DB user/password `postgres`, database `properties`.                                                  |
| `crawler/Dockerfile`, `backend/Dockerfile` | Production-style images; compose uses internal hostname `**postgres`** for `DATABASE_URL`.                                                                                                                                                          |
| `backend/`                                 | Serverless Framework service (`serverless.yml`), **esbuild** via `serverless-esbuild`; `src/functions/` for Lambdas.                                                                                                                                |
| `backend/resources/resource.yml`           | Placeholder (`Resources: {}`); no AWS-managed database in this stack.                                                                                                                                                                               |


**Readme** lists target sites (nekretnine.rs, 4zida.rs, halooglasi, kupujemprodajem). **Actual adapters** in tree include Halooglasi, Nekretnine, Kvadrat, Cetrizida (4zida), Kupujemprodajem, Novostioglasi (`https://oglasi.novosti.rs/nekretnine/`), and Realitica — naming does not always match Readme URLs. **Only adapters exported from `adapter.enum.ts` run** (currently: Cetrizida, Kvadrat, Nekretnine, Halooglasi, Kupujemprodajem, Novostioglasi).

## Crawler architecture (mental model)

1. **Startup**: `index.ts` instantiates every adapter from `adapter.enum.ts`, connects `Database`, creates a `Crawler` with `maxConnections: 1`.
2. **Seeding**: `initiateCrawl` queues each adapter’s `baseUrl` and `seedUrl` entries.
3. **Every response**: `queueLinks` follows `<a href>` and `validateLink` on each adapter to decide what to queue (with URL normalization against `baseUrl`).
4. **Listing pages**: If `getAdapter(url)` matches and `validateListing(url)` is true, `adapter.parseData(res)` builds a `Property`, Joi-validates, then `store` → `putProperty`.

`**AbstractAdapter`** (`abstract-adapter.ts`) defines:

- `baseUrl`, `seedUrl[]`
- Parsers: `getRooms`, `getArea`, `getFloor`, `getFloors`, `getPrice`, `getImage`, `getTitle`, `getDescription`, `getServiceType`, `getType` (defaults: `getUrl` from request URI, `getUnitPrice` = price/area)
- `validateLink` / `validateListing` — **different concerns**: discovery vs detail page
- `shouldReturn` — env-driven filters (`MIN_*`, `MAX_*`, `NO_ATTIC`, `NO_BASEMENT`); **note**: `isType` returns `this` or `null` but is typed as `AbstractAdapter` in the base class.

`**Property`** uses numeric enums `PropertyType` and `ServiceType` (TypeScript numeric enums → stored as `SMALLINT` in Postgres).

## PostgreSQL and environment

- **Connection**: `**DATABASE_URL`** (e.g. `postgresql://postgres:postgres@localhost:5432/properties`) for both crawler and backend.
- **SSL**: set `**DATABASE_SSL=true`** when the server requires TLS (typical for managed cloud Postgres).
- **Table** `properties`: `id` (PK, text UUID), unique `property_url`, numeric fields for enums and measures; index on `property_type` for listing queries.
- **Crawler**: must set `DATABASE_URL` before `Database.connect()`.
- **Backend Lambda**: set `DATABASE_URL` in the function environment (deploy with `DATABASE_URL` in your shell or CI secrets). If the DB is in a VPC, configure Lambda VPC + security groups accordingly; this repo does not provision RDS.
- **Docker**: repo root `docker compose up -d --build` runs DB + backend + crawler; `cd backend && npm run start:db` starts **only** Postgres; `npm run start:compose` starts all three from `backend/`.

**Backend handler**: `get-properties.ts` uses `**process.env.DATABASE_URL`** and returns `{ items, lastEvaluatedKey: null }` (shape kept for compatibility with former DynamoDB pagination clients).

## Dependencies and versions (high level)

- **Crawler**: `joi` (not `@hapi/joi`), `picocolors`, **crawler ^1.5** (v2 is ESM-only — not used here), `**pg`**. Build is `**npm run build` → esbuild** (single `dist/index.js` + sourcemap). Use `**npm run typecheck`** (`tsc --noEmit`) for type-only checks.
- **Backend**: **Serverless 3** + **serverless-offline ^13.9** (v14 requires Serverless 4). Bundling uses `**serverless-esbuild`** (`custom.esbuild` in `serverless.yml`).
- **No automated tests** in `package.json` scripts (placeholders only).
- Site HTML/CSS selectors in adapters **will break** when sites redesign.

## Commands (reference)

- **Crawler**: `cd crawler && npm install && npm run build && npm start` — or `npm run start:offline` for **tsx**. Optional: `npm run typecheck` before build.
- **Backend**: `cd backend && npm install`; `npm run start:db` starts only Postgres; `npm run start:compose` or repo-root `docker compose up -d --build` runs the full stack; or run `serverless offline` on the host for HTTP.

## Conventions when changing code

- **New or re-enabled source**: add/extend an adapter class, implement all abstract methods, register in `adapter.enum.ts`, and use selectors validated against the live listing HTML.
- **Keep adapter boundaries**: shared behavior belongs in `AbstractAdapter` or shared utilities; avoid copying large parsing blocks between adapters unless necessary.
- **Do not widen scope**: the user prefers minimal diffs unless the task is explicitly a modernization pass.

## Files worth reading first for any task

1. `crawler/src/index.ts` — crawl loop and adapter dispatch
2. `crawler/src/adapters/abstract-adapter.ts` — domain model and validation
3. `crawler/src/adapters/adapter.enum.ts` — which sites are active
4. `crawler/src/utils/db.ts` — persistence
5. `sql/schema.sql` + `backend/serverless.yml` — DB shape and Lambda config

When this file drifts from the code (new adapters, env renames, SDK migration), **update `AGENTS.md` in the same change** so future sessions stay accurate.