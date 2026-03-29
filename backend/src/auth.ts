import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getPool } from './pool';

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRES = '7d';
const MIN_PASSWORD_LEN = 8;
const MAX_EMAIL_LEN = 254;
const MAX_PASSWORD_LEN = 128;

const EMAIL_RE =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function ensureUsersTable(): Promise<void> {
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
}

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (secret && secret.length >= 16) {
        return secret;
    }
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set to a string of at least 16 characters in production');
    }
    return 'dev-only-change-me-not-for-production';
}

type JwtPayload = { sub: string; email: string };

function signToken(userId: string, email: string): string {
    return jwt.sign({ sub: userId, email } satisfies JwtPayload, getJwtSecret(), {
        expiresIn: JWT_EXPIRES,
    });
}

export function verifyAuthHeader(authHeader: string | undefined): JwtPayload | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload & JwtPayload;
        if (typeof decoded.sub !== 'string' || typeof decoded.email !== 'string') {
            return null;
        }
        return { sub: decoded.sub, email: decoded.email };
    } catch {
        return null;
    }
}

function normalizeEmail(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const t = raw.trim().toLowerCase();
    if (t.length === 0 || t.length > MAX_EMAIL_LEN) return null;
    if (!EMAIL_RE.test(t)) return null;
    return t;
}

function normalizePassword(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    if (raw.length < MIN_PASSWORD_LEN || raw.length > MAX_PASSWORD_LEN) return null;
    return raw;
}

export async function postRegister(req: Request, res: Response): Promise<void> {
    const email = normalizeEmail(req.body?.email);
    const password = normalizePassword(req.body?.password);
    if (!email) {
        res.status(400).json({ message: 'Valid email is required' });
        return;
    }
    if (!password) {
        res.status(400).json({
            message: `Password must be between ${MIN_PASSWORD_LEN} and ${MAX_PASSWORD_LEN} characters`,
        });
        return;
    }

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
        await getPool().query(
            `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)`,
            [id, email, passwordHash],
        );
    } catch (err: unknown) {
        const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
        if (code === '23505') {
            res.status(409).json({ message: 'An account with this email already exists' });
            return;
        }
        console.error(err);
        res.status(500).json({ message: 'Registration failed' });
        return;
    }

    const token = signToken(id, email);
    res.status(201).json({
        token,
        user: { id, email },
    });
}

export async function postLogin(req: Request, res: Response): Promise<void> {
    const email = normalizeEmail(req.body?.email);
    const password =
        typeof req.body?.password === 'string' ? req.body.password : null;
    if (!email || password == null || password.length === 0) {
        res.status(400).json({ message: 'Email and password are required' });
        return;
    }

    const result = await getPool().query<{ id: string; password_hash: string }>(
        `SELECT id, password_hash FROM users WHERE email = $1`,
        [email],
    );

    const row = result.rows[0];
    if (!row) {
        res.status(401).json({ message: 'Invalid email or password' });
        return;
    }

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
        res.status(401).json({ message: 'Invalid email or password' });
        return;
    }

    const token = signToken(row.id, email);
    res.status(200).json({
        token,
        user: { id: row.id, email },
    });
}

export async function getMe(req: Request, res: Response): Promise<void> {
    const payload = verifyAuthHeader(req.headers.authorization);
    if (!payload) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const result = await getPool().query<{ id: string; email: string }>(
        `SELECT id, email FROM users WHERE id = $1`,
        [payload.sub],
    );
    const row = result.rows[0];
    if (!row) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    res.status(200).json({ user: { id: row.id, email: row.email } });
}
