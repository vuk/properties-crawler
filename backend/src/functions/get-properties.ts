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
        rawLocation:
            row.raw_location != null && String(row.raw_location).trim() !== ''
                ? String(row.raw_location)
                : null,
        ...(row.old_price != null ? { oldPrice: row.old_price } : {}),
    };
}

/** Parses a finite number from a query value, or undefined if missing/invalid. */
function parseQueryNumber(value: string | undefined): number | undefined {
    if (value == null || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function validateMinMax(
    min: number | undefined,
    max: number | undefined,
    label: string,
): string | null {
    if (min !== undefined && max !== undefined && min > max) {
        return `${label}: min must be less than or equal to max`;
    }
    return null;
}

interface HttpEvent {
    queryStringParameters?: Record<string, string> | null;
}

export const handler = async (event: HttpEvent) => {
    const qp = event.queryStringParameters ?? {};

    const minRooms = parseQueryNumber(qp.minRooms);
    const maxRooms = parseQueryNumber(qp.maxRooms);
    const minArea = parseQueryNumber(qp.minArea);
    const maxArea = parseQueryNumber(qp.maxArea);
    const minPrice = parseQueryNumber(qp.minPrice);
    const maxPrice = parseQueryNumber(qp.maxPrice);
    const minUnitPrice = parseQueryNumber(qp.minUnitPrice);
    const maxUnitPrice = parseQueryNumber(qp.maxUnitPrice);

    const rangeErrors = [
        validateMinMax(minRooms, maxRooms, 'rooms'),
        validateMinMax(minArea, maxArea, 'area'),
        validateMinMax(minPrice, maxPrice, 'price'),
        validateMinMax(minUnitPrice, maxUnitPrice, 'unitPrice'),
    ].filter(Boolean) as string[];

    if (rangeErrors.length > 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: rangeErrors.join('; ') }),
        };
    }

    const conditions: string[] = ['property_type = $1'];
    const params: unknown[] = [0];
    let i = 2;

    if (minRooms !== undefined) {
        conditions.push(`rooms >= $${i}`);
        params.push(minRooms);
        i++;
    }
    if (maxRooms !== undefined) {
        conditions.push(`rooms <= $${i}`);
        params.push(maxRooms);
        i++;
    }
    if (minArea !== undefined) {
        conditions.push(`area >= $${i}`);
        params.push(minArea);
        i++;
    }
    if (maxArea !== undefined) {
        conditions.push(`area <= $${i}`);
        params.push(maxArea);
        i++;
    }
    if (minPrice !== undefined) {
        conditions.push(`price >= $${i}`);
        params.push(minPrice);
        i++;
    }
    if (maxPrice !== undefined) {
        conditions.push(`price <= $${i}`);
        params.push(maxPrice);
        i++;
    }
    if (minUnitPrice !== undefined) {
        conditions.push(`unit_price >= $${i}`);
        params.push(minUnitPrice);
        i++;
    }
    if (maxUnitPrice !== undefined) {
        conditions.push(`unit_price <= $${i}`);
        params.push(maxUnitPrice);
        i++;
    }

    const sql = `SELECT * FROM properties WHERE ${conditions.join(' AND ')} ORDER BY id ASC`;

    try {
        const result = await getPool().query(sql, params);
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
