-- PostgreSQL schema for crawled listings (used by crawler + backend API).
CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    property_url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    property_type SMALLINT NOT NULL,
    service_type SMALLINT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    area DOUBLE PRECISION NOT NULL,
    floor INTEGER NOT NULL,
    floors INTEGER NOT NULL,
    rooms DOUBLE PRECISION NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    unit_price DOUBLE PRECISION NOT NULL,
    image TEXT NOT NULL DEFAULT '',
    old_price DOUBLE PRECISION NULL,
    location SMALLINT NOT NULL DEFAULT 0,
    raw_location TEXT NULL,
    last_crawled TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS properties_property_type_idx ON properties (property_type);
