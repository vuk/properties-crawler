import { Pool } from 'pg';
import { Property, PropertyType, ServiceType } from '../adapters/abstract-adapter';
import { SerbianMunicipality } from '../adapters/serbian-municipality';

const CREATE_TABLE_SQL = `
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
    location SMALLINT NOT NULL DEFAULT 0
)`;

const CREATE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS properties_property_type_idx ON properties (property_type)`;

const ADD_LOCATION_COLUMN_SQL = `
ALTER TABLE properties ADD COLUMN IF NOT EXISTS location SMALLINT NOT NULL DEFAULT 0`;

/** Migrate legacy INTEGER `rooms` to float (e.g. Halo oglasi "3.5"). */
const ALTER_ROOMS_TO_FLOAT_SQL = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties'
      AND column_name = 'rooms' AND data_type = 'integer'
  ) THEN
    ALTER TABLE properties
      ALTER COLUMN rooms TYPE DOUBLE PRECISION
      USING rooms::double precision;
  END IF;
END $$`;

/** Postgres INTEGER columns for floor counts. */
function asDbInt(n: number): number {
    const r = Math.round(Number(n));
    return Number.isFinite(r) ? r : 0;
}

function asDbFloat(n: number): number {
    const x = Number(n);
    return Number.isFinite(x) ? x : 0;
}

function rowToProperty(row: Record<string, unknown>): Property {
    return {
        id: String(row.id),
        propertyUrl: String(row.property_url),
        title: String(row.title ?? ''),
        propertyType: Number(row.property_type) as PropertyType,
        serviceType: Number(row.service_type) as ServiceType,
        description: String(row.description ?? ''),
        area: Number(row.area),
        floor: Number(row.floor),
        floors: Number(row.floors),
        rooms: Number(row.rooms),
        price: Number(row.price),
        unitPrice: Number(row.unit_price),
        image: String(row.image ?? ''),
        location:
            row.location != null && row.location !== ''
                ? (Number(row.location) as SerbianMunicipality)
                : SerbianMunicipality.UNKNOWN,
        ...(row.old_price != null && row.old_price !== ''
            ? { oldPrice: Number(row.old_price) }
            : {}),
    };
}

export class Database {
    private static instance: Database;
    private pool: Pool | undefined;

    private constructor() {}

    public static getInstance(): Database {
        if (!this.instance) {
            this.instance = new Database();
        }
        return this.instance;
    }

    public async connect(): Promise<void> {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL is not set');
        }
        this.pool = new Pool({
            connectionString,
            max: 5,
            ssl:
                process.env.DATABASE_SSL === 'true'
                    ? { rejectUnauthorized: false }
                    : undefined,
        });
        await this.pool.query(CREATE_TABLE_SQL);
        await this.pool.query(CREATE_INDEX_SQL);
        await this.pool.query(ADD_LOCATION_COLUMN_SQL);
        await this.pool.query(ALTER_ROOMS_TO_FLOAT_SQL);
    }

    private get client(): Pool {
        if (!this.pool) {
            throw new Error('Database not connected; call connect() first');
        }
        return this.pool;
    }

    async putProperty(property: Property): Promise<void> {
        const existing = await this.getItemByURL(property.propertyUrl);
        if (existing) {
            return;
        }
        await this.client.query(
            `INSERT INTO properties (
                id, property_url, title, property_type, service_type, description,
                area, floor, floors, rooms, price, unit_price, image, old_price, location
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [
                property.id,
                property.propertyUrl,
                property.title,
                property.propertyType,
                property.serviceType,
                property.description,
                property.area,
                asDbInt(property.floor),
                asDbInt(property.floors),
                asDbFloat(property.rooms),
                property.price,
                property.unitPrice,
                property.image,
                property.oldPrice ?? null,
                property.location,
            ],
        );
    }

    async getItemById(id: string, propertyType = 0): Promise<Property | null> {
        const res = await this.client.query(
            `SELECT * FROM properties WHERE id = $1 AND property_type = $2 LIMIT 1`,
            [id, propertyType],
        );
        if (res.rows.length === 0) {
            return null;
        }
        return rowToProperty(res.rows[0] as Record<string, unknown>);
    }

    async getItemByURL(url: string): Promise<Property | null> {
        const res = await this.client.query(
            `SELECT * FROM properties WHERE property_url = $1 LIMIT 1`,
            [url],
        );
        if (res.rows.length === 0) {
            return null;
        }
        return rowToProperty(res.rows[0] as Record<string, unknown>);
    }
}
