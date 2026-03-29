import type { Request, Response } from 'express';

import { verifyAuthHeader } from './auth';
import { propertyRowToItem } from './functions/get-properties';
import { getPool } from './pool';

/** Matches crawler-generated property UUIDs (version nibble may vary). */
const PROPERTY_ID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ensurePropertyFavoritesTable(): Promise<void> {
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS property_favorites (
            user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            property_id TEXT NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, property_id)
        );
    `);
}

function isValidPropertyId(raw: string): boolean {
    return raw.length > 0 && raw.length <= 64 && PROPERTY_ID_RE.test(raw);
}

function requireUserId(req: Request, res: Response): string | null {
    const payload = verifyAuthHeader(req.headers.authorization);
    if (!payload) {
        res.status(401).json({ message: 'Unauthorized' });
        return null;
    }
    return payload.sub;
}

export async function getFavoriteIdsHandler(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const r = await getPool().query<{ property_id: string }>(
        `SELECT property_id FROM property_favorites WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
    );
    res.status(200).json({ ids: r.rows.map((row) => row.property_id) });
}

export async function listFavoritesHandler(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const r = await getPool().query(
        `SELECT p.* FROM properties p
         INNER JOIN property_favorites f ON f.property_id = p.id
         WHERE f.user_id = $1
         ORDER BY f.created_at DESC`,
        [userId],
    );
    const items = r.rows.map((row) => propertyRowToItem(row as Record<string, unknown>));
    res.status(200).json({ items });
}

export async function addFavoriteHandler(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const propertyId = req.params.propertyId;
    if (typeof propertyId !== 'string' || !isValidPropertyId(propertyId)) {
        res.status(400).json({ message: 'Invalid property id' });
        return;
    }

    const exists = await getPool().query(`SELECT 1 FROM properties WHERE id = $1`, [
        propertyId,
    ]);
    if (exists.rowCount === 0) {
        res.status(404).json({ message: 'Property not found' });
        return;
    }

    try {
        await getPool().query(
            `INSERT INTO property_favorites (user_id, property_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [userId, propertyId],
        );
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Could not save favorite' });
    }
}

export async function removeFavoriteHandler(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const propertyId = req.params.propertyId;
    if (typeof propertyId !== 'string' || !isValidPropertyId(propertyId)) {
        res.status(400).json({ message: 'Invalid property id' });
        return;
    }

    try {
        await getPool().query(
            `DELETE FROM property_favorites WHERE user_id = $1 AND property_id = $2`,
            [userId, propertyId],
        );
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Could not remove favorite' });
    }
}
