import { Pool } from 'pg';

let pool: Pool | undefined;

function getPool(): Pool {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL is not configured');
        }
        pool = new Pool({
            connectionString,
            max: 2,
            ssl:
                process.env.DATABASE_SSL === 'true'
                    ? { rejectUnauthorized: false }
                    : undefined,
        });
    }
    return pool;
}

function rowToItem(row: Record<string, unknown>) {
    return {
        id: row.id,
        propertyUrl: row.property_url,
        title: row.title,
        propertyType: row.property_type,
        serviceType: row.service_type,
        description: row.description,
        area: row.area,
        floor: row.floor,
        floors: row.floors,
        rooms: row.rooms,
        price: row.price,
        unitPrice: row.unit_price,
        image: row.image,
        location: row.location,
        ...(row.old_price != null ? { oldPrice: row.old_price } : {}),
    };
}

export const handler = async () => {
    try {
        const result = await getPool().query(
            `SELECT * FROM properties WHERE property_type = $1 ORDER BY id ASC`,
            [0],
        );
        const items = result.rows.map((r) => rowToItem(r as Record<string, unknown>));
        return {
            statusCode: 200,
            body: JSON.stringify({
                items,
                lastEvaluatedKey: null,
            }),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: err instanceof Error ? err.message : 'Database error',
            }),
        };
    }
};
