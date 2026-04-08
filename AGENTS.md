# Agent instructions — properties-crawler

This repository mixes **older patterns** (site-specific Cheerio scraping, `crawler` v1) with **modernized tooling** (TypeScript 5.9, **PostgreSQL** via `pg`, **Node.js 20**). Expect fragile selectors and small inconsistencies between packages. **Prefer small, targeted changes** when fixing or extending.

## What this project does

- **Goal** (from product intent): crawl real-estate listings from multiple Serbian sites, apply **shared filters** (rooms, area, floor, price, attic/basement rules), persist matches, and notify (e.g. email — see `Readme.md`; not all of that may be implemented in code).
- **Implemented today**: a **Node crawler** (`crawler/`) walks links with the `[crawler](https://www.npmjs.com/package/crawler)` package and Cheerio-loaded pages; **site-specific adapters** map HTML to a common `Property` shape and write to **PostgreSQL**. A **standalone Express API** (`backend/`) serves `GET /properties/`, **`GET /properties/:propertyId`** (single row as `{ item }`, UUID id), **auth** (`POST /auth/register`, `POST /auth/login`, `GET /auth/me` with `Authorization: Bearer`), **favorites** (authenticated `GET /favorites/ids`, `GET /favorites`, `POST /favorites/:propertyId`, `DELETE /favorites/:propertyId`), and `GET /health` from the same database. The **frontend** (`frontend/`) lists properties, **single listing** (`/properties/:propertyId`), **login / registration** (`/login`, `/register`), and **profile / saved ads** (`/profile`) backed by those routes (Vite dev proxies `/api` → backend).

## Repository layout


| Path                                       | Role                                                                                                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crawler/`                                 | Standalone crawler app: `src/index.ts` entry, `**esbuild`** bundle to `dist/index.js` (`esbuild.config.mjs`), run via `npm start` or `start:offline` (**tsx** runs source directly).                                                                |
| `crawler/src/adapters/`                    | One class per source site, extending `AbstractAdapter`. Registration list: `adapter.enum.ts`.                                                                                                                                                       |
| `crawler/src/utils/db.ts`                  | `**pg` `Pool`** singleton; `putProperty` (`getItemByURL(propertyUrl)` then `UPDATE` by `property_url` or `INSERT`; keeps existing `id` on update; sets `last_crawled` on every write), `getItemByURL`, `getItemById` (`id` + `property_type`, default `property_type` 0). On `connect()`, runs `CREATE TABLE IF NOT EXISTS` for local bootstrap. |
| `sql/schema.sql`                           | Canonical DDL for `properties`, `users`, and `property_favorites` (optional if you rely on crawler/backend auto-create).                                                                                                                             |
| `docker-compose.yml`                       | **postgres** (16-alpine), **adminer** (web UI on **8080**, Postgres — not phpMyAdmin), **backend** (Express on **3000**), optional **frontend**, **crawler**. DB user/password `postgres`, database `properties`.                                    |
| `crawler/Dockerfile`, `backend/Dockerfile` | Production-style images; compose uses internal hostname `**postgres`** for `DATABASE_URL`.                                                                                                                                                          |
| `backend/`                                 | Express app: entry `src/server.ts`, shared `src/pool.ts`, **esbuild** bundle to `dist/server.js` (`esbuild.config.mjs`). Properties in `src/functions/get-properties.ts` (`getPropertiesResponse`, `getPropertyByIdResponse`); auth in `src/auth.ts`; favorites in `src/favorites.ts`. |


**Readme** lists target sites (nekretnine.rs, 4zida.rs, halooglasi, kupujemprodajem). **Actual adapters** in tree include Halooglasi, Nekretnine, Kvadrat, Cetrizida (4zida), Kupujemprodajem, Novostioglasi (`https://oglasi.novosti.rs/nekretnine/`), Indomio (`https://www.indomio.rs/`), Estitor (`https://estitor.com/` — crawler limits to Serbia locale paths `/rs`, `/rs-en`), and Realitica — naming does not always match Readme URLs. **Only adapters exported from `adapter.enum.ts` run** (currently: Cetrizida, Kvadrat, Nekretnine, Halooglasi, Kupujemprodajem, Novostioglasi, Indomio, Estitor; Realitica is present in tree but commented out in the enum).

## Crawler architecture (mental model)

1. **Startup**: `index.ts` instantiates every adapter from `adapter.enum.ts`, connects `Database`, creates a `Crawler` with configurable concurrency (`CRAWLER_MAX_CONNECTIONS`, default **10**; optional `CRAWLER_RATE_LIMIT_MS` — note: in node-crawler, `rateLimit > 0` forces a single in-flight request). Every queued URL is routed through a **per-hostname** Bottleneck limiter at **~15 request starts/minute** per host (4s minimum between *starting* fetches on that host) to reduce **429** responses; unparseable URIs use limiter key `default`.
2. **Seeding**: `initiateCrawl` queues each adapter’s `baseUrl` and `seedUrl` entries via `queueCrawlUrl` (hostname-derived limiter + `setLimiterProperty` on first use for that key).
3. **Every response**: `queueLinks` follows `<a href>` and `validateLink` on each adapter to decide what to queue (with URL normalization against `baseUrl`).
4. **Listing pages**: If `getAdapter(url)` matches and `validateListing(url)` is true, `adapter.parseData(res)` builds a `Property`, Joi-validates, then `store` → `putProperty`.

`**AbstractAdapter`** (`abstract-adapter.ts`) defines:

- `baseUrl`, `seedUrl[]`
- Parsers: `getRooms`, `getArea`, `getFloor`, `getFloors`, `getPrice`, `getImage`, `getTitle`, `getDescription`, `getServiceType`, `getType` (defaults: `getUrl` from request URI, `getUnitPrice` = price/area)
- `validateLink` / `validateListing` — **different concerns**: discovery vs detail page
- `shouldReturn` — env-driven filters (`MIN_*`, `MAX_*`, `NO_ATTIC`, `NO_BASEMENT`); **note**: `isType` returns `this` or `null` but is typed as `AbstractAdapter` in the base class.

`**Property`** uses numeric enums `PropertyType` and `ServiceType` (TypeScript numeric enums → stored as `SMALLINT` in Postgres), plus `location` as `SerbianMunicipality` (integer LAU code; `crawler/src/adapters/serbian-municipality.ts`). `rawLocation` holds scraped free text from `getRawLocationText` (`raw_location` in Postgres) whenever non-empty, including when `location` resolved successfully.

## PostgreSQL and environment

- **Connection**: `**DATABASE_URL`** (e.g. `postgresql://postgres:postgres@localhost:5432/properties`) for both crawler and backend.
- **SSL**: set `**DATABASE_SSL=true`** when the server requires TLS (typical for managed cloud Postgres).
- **Table** `properties`: `id` (PK, text UUID), unique `property_url`, numeric fields for enums and measures, `rooms` as `DOUBLE PRECISION` (fractional counts from some sites), `location` (`SMALLINT`, Serbian municipality/city enum), optional `raw_location` (`TEXT`) for the original scraped location text when present, `last_crawled` (`TIMESTAMPTZ`, server time when the crawler last upserted the row); index on `property_type` for listing queries. On connect, the crawler adds missing columns (`location`, `raw_location`, `last_crawled`) and migrates legacy integer `rooms` to float when needed.
- **Crawler**: must set `DATABASE_URL` before `Database.connect()`.
- **Backend container / host**: set `DATABASE_URL` (and optional `PORT`, default **3000**; `DATABASE_SSL=true` when required). Set **`JWT_SECRET`** to a random string of at least **16** characters in production (`NODE_ENV=production`); compose defaults `JWT_SECRET` via env. The backend creates the **`users`** table on startup (`id`, unique `email`, `password_hash`, `created_at`) and the **`property_favorites`** join table (`user_id`, `property_id`, `created_at`, PK on `(user_id, property_id)`). Passwords are hashed with **bcryptjs**; responses use **JWT** (HS256, 7d expiry).
- **Docker**: repo root `docker compose up -d --build` runs DB + backend + crawler; `cd backend && npm run start:db` starts **only** Postgres; `npm run start:compose` starts all three from `backend/`.

**Properties API** (`get-properties.ts`): **`getPropertiesResponse`** uses `**process.env.DATABASE_URL**` and returns paginated `{ items, page, pageSize, total, totalPages, lastEvaluatedKey: null }` with query filters such as `serviceType=sale|rent|all`, `propertyType=apartment|house|all`, and optional `locationIds` (comma-separated Serbian municipality integer codes, matches `properties.location`). Each item includes `lastCrawled` (ISO 8601 string from `last_crawled`). Optional **`sortBy`** (`id`, `lastCrawled`, `date`, `price`, `unitPrice`; omit for `id`) and **`sortDir`** (`asc` or `desc`; default `asc` when `sortBy` is set) control listing order (SQL uses a fixed column whitelist + `id` as tie-breaker). The frontend sends `sortBy` / `sortDir` for date, price, and unit-price sorts. **`getPropertyByIdResponse`** returns **`{ item }`** for a crawler UUID `id`, or **404** / **400** for unknown or invalid ids.

**Favorites API** (`favorites.ts`): requires `Authorization: Bearer <JWT>`. `GET /favorites/ids` returns `{ ids: string[] }` (property UUIDs, newest first). `GET /favorites` returns `{ items }` using the same property JSON shape as the listing API. `POST /favorites/:propertyId` returns **204** (insert or no-op if already favorited). `DELETE /favorites/:propertyId` returns **204**. Listing handlers use `propertyRowToItem` from `get-properties.ts` for a consistent field names.

## Dependencies and versions (high level)

- **Crawler**: `joi` (not `@hapi/joi`), `picocolors`, **crawler ^1.5** (v2 is ESM-only — not used here), `**pg`**. Build is `**npm run build` → esbuild** (single `dist/index.js` + sourcemap). Use `**npm run typecheck`** (`tsc --noEmit`) for type-only checks.
- **Backend**: **Express 4**, **pg**, **bcryptjs**, **jsonwebtoken**, **esbuild** (`npm run build` → `dist/server.js`); local dev: `npm run dev` (**tsx** watch).
- **No automated tests** in `package.json` scripts (placeholders only).
- Site HTML/CSS selectors in adapters **will break** when sites redesign.

## Commands (reference)

- **Crawler**: `cd crawler && npm install && npm run build && npm start` — or `npm run start:offline` for **tsx**. Optional: `npm run typecheck` before build.
- **Backend**: `cd backend && npm install && npm run build && npm start` (needs `DATABASE_URL`); `npm run start:db` starts only Postgres; `npm run start:compose` or repo-root `docker compose up -d --build` runs the full stack.

## Conventions when changing code

- **New or re-enabled source**: add/extend an adapter class, implement all abstract methods, register in `adapter.enum.ts`, and use selectors validated against the live listing HTML.
- **Keep adapter boundaries**: shared behavior belongs in `AbstractAdapter` or shared utilities; avoid copying large parsing blocks between adapters unless necessary.
- **Do not widen scope**: the user prefers minimal diffs unless the task is explicitly a modernization pass.

## Files worth reading first for any task

1. `crawler/src/index.ts` — crawl loop and adapter dispatch
2. `crawler/src/adapters/abstract-adapter.ts` — domain model and validation
3. `crawler/src/adapters/adapter.enum.ts` — which sites are active
4. `crawler/src/utils/db.ts` — persistence
5. `sql/schema.sql` + `backend/src/server.ts` — DB shape and HTTP routes

When this file drifts from the code (new adapters, env renames, SDK migration), **update `AGENTS.md` in the same change** so future sessions stay accurate.