import express, { type Request } from 'express';

import { ensureUsersTable, getMe, postLogin, postRegister } from './auth';
import {
    addFavoriteHandler,
    ensurePropertyFavoritesTable,
    getFavoriteIdsHandler,
    listFavoritesHandler,
    removeFavoriteHandler,
} from './favorites';
import {
    getPropertiesResponse,
    type GetPropertiesQueryInput,
} from './functions/get-properties';

function requestToGetPropertiesInput(req: Request): GetPropertiesQueryInput {
    const qp: Record<string, string | undefined> = {};
    const multi: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(req.query)) {
        if (val === undefined) continue;
        if (Array.isArray(val)) {
            const strs = val.map((v) => String(v));
            multi[key] = strs;
            qp[key] = strs[0];
        } else {
            qp[key] = String(val);
        }
    }
    return {
        queryStringParameters: qp,
        multiValueQueryStringParameters:
            Object.keys(multi).length > 0 ? multi : undefined,
    };
}

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '32kb' }));

app.post(['/auth/register', '/auth/register/'], (req, res, next) => {
    void postRegister(req, res).catch(next);
});
app.post(['/auth/login', '/auth/login/'], (req, res, next) => {
    void postLogin(req, res).catch(next);
});
app.get(['/auth/me', '/auth/me/'], (req, res, next) => {
    void getMe(req, res).catch(next);
});

app.get(['/favorites/ids', '/favorites/ids/'], (req, res, next) => {
    void getFavoriteIdsHandler(req, res).catch(next);
});
app.get(['/favorites', '/favorites/'], (req, res, next) => {
    void listFavoritesHandler(req, res).catch(next);
});
app.post(['/favorites/:propertyId', '/favorites/:propertyId/'], (req, res, next) => {
    void addFavoriteHandler(req, res).catch(next);
});
app.delete(['/favorites/:propertyId', '/favorites/:propertyId/'], (req, res, next) => {
    void removeFavoriteHandler(req, res).catch(next);
});

app.get(['/properties', '/properties/'], async (req, res) => {
    try {
        const result = await getPropertiesResponse(requestToGetPropertiesInput(req));
        res.status(result.statusCode)
            .set('Content-Type', 'application/json')
            .send(result.body);
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: err instanceof Error ? err.message : 'Internal error',
        });
    }
});

app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
});

app.use(
    (
        err: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
    ) => {
        console.error(err);
        res.status(500).json({
            message: err instanceof Error ? err.message : 'Internal error',
        });
    },
);

async function start(): Promise<void> {
    await ensureUsersTable();
    await ensurePropertyFavoritesTable();
    app.listen(port, '0.0.0.0', () => {
        console.log(`properties API listening on 0.0.0.0:${port}`);
    });
}

start().catch((err) => {
    console.error(err);
    process.exit(1);
});
