import express, { type Request } from 'express';

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

app.listen(port, '0.0.0.0', () => {
    console.log(`properties API listening on 0.0.0.0:${port}`);
});
