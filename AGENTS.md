# Agent instructions — properties-crawler

This repository mixes **older patterns** (site-specific Cheerio scraping, `crawler` v1) with **modernized tooling** (TypeScript 5.9, **AWS SDK for JavaScript v3** via `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`, Serverless Framework 3, Lambda **Node.js 20**). Expect fragile selectors and small inconsistencies between packages. **Prefer small, targeted changes** when fixing or extending.

## What this project does

- **Goal** (from product intent): crawl real-estate listings from multiple Serbian sites, apply **shared filters** (rooms, area, floor, price, attic/basement rules), persist matches, and notify (e.g. email — see `Readme.md`; not all of that may be implemented in code).
- **Implemented today**: a **Node crawler** (`crawler/`) walks links with the [`crawler`](https://www.npmjs.com/package/crawler) package and Cheerio-loaded pages; **site-specific adapters** map HTML to a common `Property` shape and write to **DynamoDB**. A **Serverless backend** (`backend/`) exposes at least one HTTP handler that queries DynamoDB.

## Repository layout

| Path | Role |
|------|------|
| `crawler/` | Standalone crawler app: `src/index.ts` entry, **`esbuild`** bundle to `dist/index.js` (`esbuild.config.mjs`), run via `npm start` or `start:offline` (**tsx** runs source directly). |
| `crawler/src/adapters/` | One class per source site, extending `AbstractAdapter`. Registration list: `adapter.enum.ts`. |
| `crawler/src/utils/db.ts` | DynamoDB **`DynamoDBDocumentClient`** singleton; `putProperty`, `getItemByURL` (GSI `urlGSI`), `getItemById` (composite key: `id` + `propertyType`, default `propertyType` 0). |
| `backend/` | Serverless Framework service (`serverless.yml`), **esbuild** via `serverless-esbuild`, DynamoDB local plugins; `src/functions/` for Lambdas. |
| `backend/resources/resource.yml` | DynamoDB table definition and GSIs. |

**Readme** lists target sites (nekretnine.rs, 4zida.rs, halooglasi, kupujemprodajem). **Actual adapters** in tree include Halooglasi, Nekretnine, Kvadrat, Cetrizida (4zida), Novostioglasi, Realitica — naming does not always match Readme URLs. **Only adapters exported from `adapter.enum.ts` run**; others are currently commented out (as of this writing, **Halooglasi** is the active one).

## Crawler architecture (mental model)

1. **Startup**: `index.ts` instantiates every adapter from `adapter.enum.ts`, connects `Database`, creates a `Crawler` with `maxConnections: 1`.
2. **Seeding**: `initiateCrawl` queues each adapter’s `baseUrl` and `seedUrl` entries.
3. **Every response**: `queueLinks` follows `<a href>` and `validateLink` on each adapter to decide what to queue (with URL normalization against `baseUrl`).
4. **Listing pages**: If `getAdapter(url)` matches and `validateListing(url)` is true, `adapter.parseData(res)` builds a `Property`, Joi-validates, then `store` → `putProperty`.

**`AbstractAdapter`** (`abstract-adapter.ts`) defines:

- `baseUrl`, `seedUrl[]`
- Parsers: `getRooms`, `getArea`, `getFloor`, `getFloors`, `getPrice`, `getImage`, `getTitle`, `getDescription`, `getServiceType`, `getType` (defaults: `getUrl` from request URI, `getUnitPrice` = price/area)
- `validateLink` / `validateListing` — **different concerns**: discovery vs detail page
- `shouldReturn` — env-driven filters (`MIN_*`, `MAX_*`, `NO_ATTIC`, `NO_BASEMENT`); **note**: `isType` returns `this` or `null` but is typed as `AbstractAdapter` in the base class.

**`Property`** uses numeric enums `PropertyType` and `ServiceType` (TypeScript numeric enums → stored as numbers in DynamoDB).

## DynamoDB and environment

- **Table** (CloudFormation): `${stage}-properties-table` (e.g. `dev-properties-table`).
- **Key schema**: partition `id` (string), sort key `propertyType` (number). GSIs: `itemTypeGSI` on `propertyType`, `urlGSI` on `propertyUrl`.
- **Crawler env**: uses `PROPERTY_TABLE` (see `Readme.md` and `db.ts`).
- **Serverless env**: defines `PROPERTIES_TABLE` in `serverless.yml` — **name differs from crawler**; align these when touching deployment or local runs.
- **Local DynamoDB**:
  - Crawler: `IS_OFFLINE=true` → client points at `http://localhost:8000` (`db.ts`).
  - Backend Serverless: `serverless-dynamodb-local` default port in config is **8080** (`DYNAMODB_LOCAL_PORT`).
  - **Ports and env names are easy to get wrong** when testing crawler + backend together.

**Backend handler**: `get-properties.ts` uses **`process.env.PROPERTIES_TABLE`** (set in `serverless.yml`).

## Dependencies and versions (high level)

- **Crawler**: `joi` (not `@hapi/joi`), `picocolors`, **crawler ^1.5** (v2 is ESM-only — not used here). Build is **`npm run build` → esbuild** (single `dist/index.js` + sourcemap). Use **`npm run typecheck`** (`tsc --noEmit`) for type-only checks.
- **Backend**: **Serverless 3** + **serverless-offline ^13.9** (v14 requires Serverless 4). **`serverless-pseudo-parameters`** was removed (unused). Bundling uses **`serverless-esbuild`** (`custom.esbuild` in `serverless.yml`).
- **AWS**: **SDK v3** everywhere; Lambda bundles the SDK via **esbuild**.
- **No automated tests** in `package.json` scripts (placeholders only).
- Site HTML/CSS selectors in adapters **will break** when sites redesign.

## Commands (reference)

- **Crawler**: `cd crawler && npm install && npm run build && npm start` — or `npm run start:offline` for **tsx** with `IS_OFFLINE=true`. Optional: `npm run typecheck` before build.
- **Backend**: `cd backend && npm install`; `npm run start:db` runs DynamoDB local via Serverless; full offline HTTP flow uses Serverless + esbuild.

## Conventions when changing code

- **New or re-enabled source**: add/extend an adapter class, implement all abstract methods, register in `adapter.enum.ts`, and use selectors validated against the live listing HTML.
- **Keep adapter boundaries**: shared behavior belongs in `AbstractAdapter` or shared utilities; avoid copying large parsing blocks between adapters unless necessary.
- **Do not widen scope**: the user prefers minimal diffs unless the task is explicitly a modernization pass.

## Files worth reading first for any task

1. `crawler/src/index.ts` — crawl loop and adapter dispatch  
2. `crawler/src/adapters/abstract-adapter.ts` — domain model and validation  
3. `crawler/src/adapters/adapter.enum.ts` — which sites are active  
4. `crawler/src/utils/db.ts` — persistence and GSI usage  
5. `backend/serverless.yml` + `backend/resources/resource.yml` — infra and table shape  

When this file drifts from the code (new adapters, env renames, SDK migration), **update `AGENTS.md` in the same change** so future sessions stay accurate.
