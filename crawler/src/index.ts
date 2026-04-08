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

/** Max HTTP request *starts* per minute per hostname (429 mitigation). Bottleneck min gap between starts. */
const HOST_REQUESTS_PER_MINUTE = 15;
const HOST_RATE_LIMIT_MS = Math.ceil(60_000 / HOST_REQUESTS_PER_MINUTE);

/** Bottleneck limiter id: URL hostname, or `default` if the URI cannot be parsed. */
function limiterKeyFromUri(uri: string): string {
    const t = uri.trim();
    if (!t) return "default";
    try {
        const u = new URL(t);
        return u.hostname ? u.hostname.toLowerCase() : "default";
    } catch {
        return "default";
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

async function validateLinks(
    url: string,
    adapters: AbstractAdapter[],
    queueCrawlUrl: (uri: string) => void
): Promise<boolean> {
    if (isNonCrawlableHref(url)) return false;
    for (let i = 0; i < adapters.length; i++) {
        if (adapters[i].validateLink(url)) {
            let next = url.trim();
            if (next.indexOf(adapters[i].baseUrl) === -1 && !/^https?:\/\//i.test(next)) {
                next = resolveAdapterSeedUrl(next, adapters[i].baseUrl);
            }
            console.log(p.green('[INFO] ') + 'Queue URL ' + next);
            queueCrawlUrl(next);
            return true;
        }
    }
    if (process.env.CRAWLER_VERBOSE_LINKS === 'true') {
        console.log(p.dim('[SKIP] ') + url);
    }
    return false;
}

async function queueLinks(
    $: any,
    adapters: AbstractAdapter[],
    queueCrawlUrl: (uri: string) => void
): Promise<void> {
    const seen = new Set<string>();
    $('a').each(async (index: number, element: any) => {
        let link = $(element).attr('href');
        if (link != null && !seen.has(link)) {
            seen.add(link);
            await validateLinks(link, adapters, queueCrawlUrl);
        }
    });
}

function initiateCrawl(adapters: AbstractAdapter[], queueCrawlUrl: (uri: string) => void): void {
    for (let i = 0; i < adapters.length; i++) {
        console.log(p.green('[INFO] ') + 'Queue ' + adapters[i].baseUrl);
        console.log(p.green('[INFO] ') + 'Queue ' + adapters[i].seedUrl);
        queueCrawlUrl(adapters[i].baseUrl);
        for (const seed of adapters[i].seedUrl) {
            queueCrawlUrl(seed);
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
            // indomio.rs (and similar CDNs) respond with HTTP 405 unless typical browser Accept headers are present.
            Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,sr-RS;q=0.8,sr;q=0.7",
        },
        callback: async (error: Error, res: any, done: Function) => {
            if (error) {
                console.log(p.red(String(error)));
            } else {
                await queueLinks(res.$, adapters, queueCrawlUrl);
                const adapter = getAdapter(res.request.uri.href);
                const status = res.statusCode;
                if (
                    adapter &&
                    adapter.validateListing(res.request.uri.href, res) &&
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
                    } else if (!adapter.validateListing(href, res)) {
                        console.log(
                            p.red('[LISTING ERROR] ') + `validateListing rejected ${href}`
                        );
                    }
                }
            }
            done();
        }
    });

    const configuredHostLimiters = new Set<string>();
    function queueCrawlUrl(uri: string): void {
        const trimmed = uri.trim();
        const key = limiterKeyFromUri(trimmed);
        if (!configuredHostLimiters.has(key)) {
            configuredHostLimiters.add(key);
            crawler.setLimiterProperty(key, "rateLimit", HOST_RATE_LIMIT_MS);
        }
        crawler.queue({ uri: trimmed, limiter: key });
    }

    console.log(
        p.cyan("[INFO] ") +
            `Per-host rate limit: ~${HOST_REQUESTS_PER_MINUTE}/min per hostname (${HOST_RATE_LIMIT_MS}ms min between request starts; Bottleneck limiter key = host)`
    );

    initiateCrawl(adapters, queueCrawlUrl);
}

start().then(() => {
    console.log('Crawler started');
}).catch(error => {
    console.log(error);
});
