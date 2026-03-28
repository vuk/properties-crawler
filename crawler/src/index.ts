import dotenv from "dotenv";
import { AbstractAdapter } from "./adapters/abstract-adapter";
import p from 'picocolors';
import Crawler from 'crawler';
import { Database } from "./utils/db";
import adapterList from './adapters/adapter.enum';

dotenv.config();

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

async function validateLinks(url: string, adapters: AbstractAdapter[], crawler: any): Promise<boolean> {
    if (isNonCrawlableHref(url)) return false;
    for (let i = 0; i < adapters.length; i++) {
        if (adapters[i].validateLink(url)) {
            if (url.indexOf(adapters[i].baseUrl) === -1) {
                url = (adapters[i].baseUrl + url).replace('//', '/').replace('https:/', 'https://');
            }
            console.log(p.green('[INFO] ') + 'Queue URL ' + url);
            crawler.queue(url);
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

function initiateCrawl(crawler: any, adapters: AbstractAdapter[]): void {
    for (let i = 0; i < adapters.length; i++) {
        console.log(p.green('[INFO] ') + 'Queue ' + adapters[i].baseUrl);
        console.log(p.green('[INFO] ') + 'Queue ' + adapters[i].seedUrl);
        crawler.queue(adapters[i].baseUrl);
        crawler.queue(adapters[i].seedUrl);
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
    let crawler = new Crawler({
        maxConnections: 1,
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
                }
            }
            done();
        }
    });

    initiateCrawl(crawler, adapters);
}

start().then(() => {
    console.log('Crawler started');
}).catch(error => {
    console.log(error);
});
