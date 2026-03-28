# Properties crawler

Application is intended to crawl realestate ads from different websites and apply identical filters to all of them collecting fitting ads and send an email 

## Stack

* Database: PostgreSQL (`pg` in Node; schema in `sql/schema.sql`)
* Framework: NodeJS
* Backend: Node HTTP API (Express, Docker-friendly)

## Development

**Full stack in Docker** (Postgres + properties API + crawler + optional frontend) from the repo root:

```bash
docker compose up -d --build
```

- API: `http://localhost:3000/properties/` (health: `http://localhost:3000/health`)
- Postgres on host port `5432`
- DB web UI (Adminer, Postgres-compatible): `http://localhost:8080` — system **PostgreSQL**, server **postgres**, user **postgres**, password **postgres**, database **properties**

Postgres only (e.g. run crawler/backend on the host):

```bash
docker compose up -d postgres
# or: cd backend && npm run start:db
```

Apply DDL if you prefer not to rely on the crawler’s `CREATE TABLE IF NOT EXISTS` on startup:

```bash
psql "$DATABASE_URL" -f sql/schema.sql
```

## Environment

```
MIN_ROOMS=1
MAX_ROOMS=10
MIN_AREA=10
MAX_AREA=1000
MIN_FLOOR=0
MAX_FLOOR=40
MIN_PRICE=1000
MAX_PRICE=10000000
NO_ATTIC=true
NO_BASEMENT=true
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/properties
# DATABASE_SSL=true   # when your host requires TLS
```

## Sources for properties

* https://www.nekretnine.rs/
* https://www.4zida.rs/
* https://www.halooglasi.com/nekretnine
* https://www.kupujemprodajem.com/nekretnine
