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
        description:
            row.description == null ? '' : String(row.description),
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
        lastCrawled:
            row.last_crawled instanceof Date
                ? row.last_crawled.toISOString()
                : row.last_crawled != null
                  ? String(row.last_crawled)
                  : null,
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

const MAX_LOCATION_IDS = 200;

/**
 * Parse municipality `location` IDs from query string.
 * Accepts comma-separated `locationIds=18,85` and/or repeated keys when the
 * API provides multiValueQueryStringParameters.
 */
function parseLocationIds(
    qp: Record<string, string | undefined>,
    multiValue?: Record<string, string[] | undefined> | null,
): { ok: true; ids: number[] } | { ok: false; message: string } {
    const tokens: string[] = [];
    const single = qp.locationIds?.trim();
    if (single) {
        for (const part of single.split(',')) tokens.push(part);
    }
    const multi = multiValue?.locationIds;
    if (multi?.length) {
        for (const chunk of multi) {
            for (const part of chunk.split(',')) tokens.push(part);
        }
    }
    const seen = new Set<number>();
    for (const raw of tokens) {
        const t = raw.trim();
        if (!t) continue;
        const n = Number(t);
        if (!Number.isInteger(n) || n < 0 || n > 32767) {
            return {
                ok: false,
                message:
                    'locationIds must be comma-separated non-negative integers (municipality codes)',
            };
        }
        seen.add(n);
    }
    const ids = [...seen].sort((a, b) => a - b);
    if (ids.length > MAX_LOCATION_IDS) {
        return {
            ok: false,
            message: `locationIds: at most ${MAX_LOCATION_IDS} distinct values`,
        };
    }
    return { ok: true, ids };
}

/** Whitelist only — never interpolate arbitrary client input as SQL identifiers. */
function parseSortClause(
    qp: Record<string, string | undefined>,
):
    | { ok: true; orderClause: string }
    | { ok: false; message: string } {
    const rawBy = qp.sortBy?.trim() ?? '';
    const rawDir = (qp.sortDir?.trim().toLowerCase() || 'asc') as string;

    if (!rawBy) {
        return { ok: true, orderClause: 'id ASC' };
    }

    const byNorm = rawBy.toLowerCase();
    const columnByAlias: Record<string, string> = {
        id: 'id',
        lastcrawled: 'last_crawled',
        date: 'last_crawled',
        price: 'price',
        unitprice: 'unit_price',
    };
    const col = columnByAlias[byNorm];
    if (!col) {
        return {
            ok: false,
            message:
                'sortBy must be id, lastCrawled, date, price, or unitPrice (omit for default id order)',
        };
    }

    if (rawDir !== 'asc' && rawDir !== 'desc') {
        return { ok: false, message: 'sortDir must be asc or desc' };
    }

    const dir = rawDir === 'desc' ? 'DESC' : 'ASC';
    return { ok: true, orderClause: `${col} ${dir}, id ASC` };
}

export interface GetPropertiesQueryInput {
    queryStringParameters?: Record<string, string | undefined> | null;
    multiValueQueryStringParameters?: Record<string, string[]> | null;
}

export type GetPropertiesHttpResult = {
    statusCode: number;
    body: string;
};

export async function getPropertiesResponse(
    event: GetPropertiesQueryInput,
): Promise<GetPropertiesHttpResult> {
    const qp = event.queryStringParameters ?? {};
    const mqp = event.multiValueQueryStringParameters;

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

    const locationParse = parseLocationIds(qp as Record<string, string | undefined>, mqp);
    if (locationParse.ok === false) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: locationParse.message }),
        };
    }
    const locationIds = locationParse.ids;

    const sortParse = parseSortClause(qp as Record<string, string | undefined>);
    if (sortParse.ok === false) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: sortParse.message }),
        };
    }
    const orderClause = sortParse.orderClause;

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

    if (locationIds.length > 0) {
        conditions.push(`location = ANY($${i}::smallint[])`);
        params.push(locationIds);
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
            `SELECT * FROM properties WHERE ${whereClause} ORDER BY ${orderClause} LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
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
}
