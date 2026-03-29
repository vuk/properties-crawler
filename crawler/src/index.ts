import dotenv from "dotenv";
import { AbstractAdapter } from "./adapters/abstract-adapter";
import p from 'picocolors';
import Crawler from 'crawler';
import { Database } from "./utils/db";
import adapterList from './adapters/adapter.enum';

dotenv.config();

function crawlerMaxConnections(): number {
    const n = parseInt(process.env.CRAWLER_MAX_CONNECTIONS ?? "", 10);
    if (Number.isFinite(n) && n >= 1 && n <= 50) return n;
    return 10;
}

/** Optional minimum interval (ms) between starting requests; 0 = as fast as maxConnections allows. */
function crawlerRateLimitMs(): number {
    const n = parseInt(process.env.CRAWLER_RATE_LIMIT_MS ?? "", 10);
    if (Number.isFinite(n) && n >= 0) return n;
    return 0;
}

/** node-crawler Bottleneck limiter name for 4zida.rs (see queueCrawlUrl). */
const ZIDA_CRAWLER_LIMITER = "4zida.rs";
/** Max request starts per minute to 4zida (429 mitigation). Bottleneck uses min gap between starts. */
const ZIDA_REQUESTS_PER_MINUTE = 10;
const ZIDA_RATE_LIMIT_MS = Math.ceil(60_000 / ZIDA_REQUESTS_PER_MINUTE);

/** node-crawler Bottleneck limiter for kupujemprodajem.com (same cadence as 4zida). */
const KP_CRAWLER_LIMITER = "kupujemprodajem.com";
const KP_REQUESTS_PER_MINUTE = 10;
const KP_RATE_LIMIT_MS = Math.ceil(60_000 / KP_REQUESTS_PER_MINUTE);

function is4zidaHostUrl(uri: string): boolean {
    const t = uri.trim();
    return t.length > 0 && t.includes("4zida.rs");
}

function isKupujemprodajemHostUrl(uri: string): boolean {
    const t = uri.trim();
    return t.length > 0 && t.includes("kupujemprodajem.com");
}

/** Queue a URL, routing throttled hosts through dedicated rate-limited limiters. */
function queueCrawlUrl(crawler: InstanceType<typeof Crawler>, uri: string): void {
    const trimmed = uri.trim();
    if (is4zidaHostUrl(uri)) {
        crawler.queue({ uri: trimmed, limiter: ZIDA_CRAWLER_LIMITER });
    } else if (isKupujemprodajemHostUrl(uri)) {
        crawler.queue({ uri: trimmed, limiter: KP_CRAWLER_LIMITER });
    } else {
        crawler.queue(uri);
    }
}

let adapters: AbstractAdapter[] = [];
adapterList.map(adapter => adapters.push(new adapter()));

/** Skip hrefs that cannot be property pages (saves adapter checks and queue noise). */
function isNonCrawlableHref(raw: string | undefined): boolean {
    if (raw == null) return true;
    const t = raw.trim();
    if (t === "" || t === "#" || t.startsWith("#")) return true;
    if (/^(javascript|mailto|tel|data):/i.test(t)) return true;
    return false;
}

function resolveAdapterSeedUrl(raw: string, baseUrl: string): string {
    const t = raw.trim();
    if (t === "") return t;
    if (/^https?:\/\//i.test(t)) return t;
    try {
        return new URL(t, baseUrl).href;
    } catch {
        return t;
    }
}

async function validateLinks(url: string, adapters: AbstractAdapter[], crawler: any): Promise<boolean> {
    if (isNonCrawlableHref(url)) return false;
    for (let i = 0; i < adapters.length; i++) {
        if (adapters[i].validateLink(url)) {
            let next = url.trim();
            if (next.indexOf(adapters[i].baseUrl) === -1 && !/^https?:\/\//i.test(next)) {
                next = resolveAdapterSeedUrl(next, adapters[i].baseUrl);
            }
            console.log(p.green('[INFO] ') + 'Queue URL ' + next);
            queueCrawlUrl(crawler, next);
            return true;
        }
    }
    if (process.env.CRAWLER_VERBOSE_LINKS === 'true') {
        console.log(p.dim('[SKIP] ') + url);
    }
    return false;
}

async function queueLinks($: any, crawler: any, adapters: AbstractAdapter[]): Promise<void> {
    const seen = new Set<string>();
    $('a').each(async (index: number, element: any) => {
        let link = $(element).attr('href');
        if (link != null && !seen.has(link)) {
            seen.add(link);
            await validateLinks(link, adapters, crawler);
        }
    });
}

function initiateCrawl(crawler: InstanceType<typeof Crawler>, adapters: AbstractAdapter[]): void {
    for (let i = 0; i < adapters.length; i++) {
        console.log(p.green('[INFO] ') + 'Queue ' + adapters[i].baseUrl);
        console.log(p.green('[INFO] ') + 'Queue ' + adapters[i].seedUrl);
        queueCrawlUrl(crawler, adapters[i].baseUrl);
        for (const seed of adapters[i].seedUrl) {
            queueCrawlUrl(crawler, seed);
        }
    }
}

function getAdapter(url: string): AbstractAdapter {
    if (!url) return null;
    for (let i = 0; i < adapters.length; i++) {
        const adapter = adapters[i].isType(url);
        if (adapter) {
            return adapter;
        }
    }
    return null;
}

async function start() {
    await Database.getInstance().connect();
    const maxConnections = crawlerMaxConnections();
    const rateLimit = crawlerRateLimitMs();
    console.log(
        p.cyan("[INFO] ") +
            `Crawler concurrency: maxConnections=${maxConnections}, rateLimit=${rateLimit}ms` +
            (rateLimit > 0 ? " (rateLimit>0 caps in-flight requests to 1 in node-crawler)" : "")
    );
    let crawler = new Crawler({
        maxConnections,
        rateLimit,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
        callback: async (error: Error, res: any, done: Function) => {
            if (error) {
                console.log(p.red(String(error)));
            } else {
                await queueLinks(res.$, crawler, adapters);
                const adapter = getAdapter(res.request.uri.href);
                const status = res.statusCode;
                if (
                    adapter &&
                    adapter.validateListing(res.request.uri.href) &&
                    (status === undefined || status < 400)
                ) {
                    try {
                        let property = await adapter.parseData(res);
                        await adapter.store(property);
                    } catch (e) {
                        console.log(p.red('[ERROR] ' + typeof adapter) + ' Property is invalid', e);
                    }
                } else if (adapter) {
                    const href = res.request.uri.href;
                    if (status !== undefined && status >= 400) {
                        console.log(
                            p.red('[LISTING ERROR] ') + `HTTP ${status} ${href}`
                        );
                    } else if (!adapter.validateListing(href)) {
                        console.log(
                            p.red('[LISTING ERROR] ') + `validateListing rejected ${href}`
                        );
                    }
                }
            }
            done();
        }
    });

    crawler.setLimiterProperty(ZIDA_CRAWLER_LIMITER, "rateLimit", ZIDA_RATE_LIMIT_MS);
    crawler.setLimiterProperty(KP_CRAWLER_LIMITER, "rateLimit", KP_RATE_LIMIT_MS);
    console.log(
        p.cyan("[INFO] ") +
            `Throttled hosts: 4zida.rs (${ZIDA_CRAWLER_LIMITER}) & kupujemprodajem.com (${KP_CRAWLER_LIMITER}) ~${ZIDA_REQUESTS_PER_MINUTE}/min (${ZIDA_RATE_LIMIT_MS}ms between starts each)`
    );

    initiateCrawl(crawler, adapters);
}

start().then(() => {
    console.log('Crawler started');
}).catch(error => {
    console.log(error);
});
