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

function parsePage(value: string | undefined): number {
    const n = parseInt(value ?? '', 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function parsePageSize(value: string | undefined): number {
    const n = parseInt(value ?? '', 10);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
    return Math.min(n, MAX_PAGE_SIZE);
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

/** apartment=0, house=1; omit or `all` = both */
function parsePropertyTypeFilter(
    value: string | undefined,
): 'all' | 0 | 1 | 'invalid' {
    if (value == null || value === '') return 'all';
    const v = value.trim().toLowerCase();
    if (v === 'all') return 'all';
    if (v === 'apartment' || v === 'apartments' || v === '0') return 0;
    if (v === 'house' || v === 'houses' || v === '1') return 1;
    return 'invalid';
}

/** sale=0, rent=1; omit or `all` = any service type */
function parseServiceTypeFilter(
    value: string | undefined,
): 'all' | 0 | 1 | 'invalid' {
    if (value == null || value === '') return 'all';
    const v = value.trim().toLowerCase();
    if (v === 'all') return 'all';
    if (
        v === 'sale' ||
        v === 'selling' ||
        v === 'prodaja' ||
        v === '0'
    ) {
        return 0;
    }
    if (
        v === 'rent' ||
        v === 'renting' ||
        v === 'izdavanje' ||
        v === '1'
    ) {
        return 1;
    }
    return 'invalid';
}

interface HttpEvent {
    queryStringParameters?: Record<string, string> | null;
}

export const handler = async (event: HttpEvent) => {
    const qp = event.queryStringParameters ?? {};

    const page = parsePage(qp.page);
    const pageSize = parsePageSize(qp.pageSize);

    const minRooms = parseQueryNumber(qp.minRooms);
    const maxRooms = parseQueryNumber(qp.maxRooms);
    const minArea = parseQueryNumber(qp.minArea);
    const maxArea = parseQueryNumber(qp.maxArea);
    const minPrice = parseQueryNumber(qp.minPrice);
    const maxPrice = parseQueryNumber(qp.maxPrice);
    const minUnitPrice = parseQueryNumber(qp.minUnitPrice);
    const maxUnitPrice = parseQueryNumber(qp.maxUnitPrice);

    const propertyTypeFilter = parsePropertyTypeFilter(qp.propertyType);
    if (propertyTypeFilter === 'invalid') {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message:
                    'propertyType must be apartment, house, or all (omit for all)',
            }),
        };
    }

    const serviceTypeFilter = parseServiceTypeFilter(qp.serviceType);
    if (serviceTypeFilter === 'invalid') {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message:
                    'serviceType must be sale, rent, or all (omit for all)',
            }),
        };
    }

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

    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (propertyTypeFilter === 'all') {
        conditions.push('(property_type = 0 OR property_type = 1)');
    } else {
        conditions.push(`property_type = $${i}`);
        params.push(propertyTypeFilter);
        i++;
    }

    if (serviceTypeFilter !== 'all') {
        conditions.push(`service_type = $${i}`);
        params.push(serviceTypeFilter);
        i++;
    }

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

    const whereClause = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;
    const limitPlaceholder = `$${i}`;
    const offsetPlaceholder = `$${i + 1}`;

    try {
        const countResult = await getPool().query(
            `SELECT COUNT(*)::bigint AS total FROM properties WHERE ${whereClause}`,
            params,
        );
        const total = Number(countResult.rows[0]?.total ?? 0);
        const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

        const dataParams = [...params, pageSize, offset];
        const dataResult = await getPool().query(
            `SELECT * FROM properties WHERE ${whereClause} ORDER BY id ASC LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
            dataParams,
        );

        const items = dataResult.rows.map((r) => rowToItem(r as Record<string, unknown>));
        return {
            statusCode: 200,
            body: JSON.stringify({
                items,
                page,
                pageSize,
                total,
                totalPages,
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
