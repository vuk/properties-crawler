import {KvadratAdapter} from "./adapters/kvadrat.adapter";
import {AbstractAdapter} from "./adapters/abstract-adapter";
const chalk = require('chalk');
const Crawler = require("crawler");
const seenreq = require('seenreq')
    , seen = new seenreq();

let adapters: AbstractAdapter[] = [];
adapters.push(new KvadratAdapter());

async function validateLinks(url: string, adapters: AbstractAdapter[], crawler: any): Promise<boolean> {
    if (!url) return false;
    for(let i = 0; i < adapters.length; i++) {
        if (adapters[i].validateLink(url) && !await duplicatedRequest(url)) {
            //console.log(chalk.green('[INFO] ') + 'Queue URL ' + url);
            crawler.queue(url);
            return true;
        }
    }
    return false;
}

async function queueLinks($: any, crawler: any): Promise<void> {
    let uniqueLinks: string[] = [];
    $('a').each( async (index: number, element: any) => {
        let link = $(element).attr('href');
        if (uniqueLinks.indexOf(link) === -1) {
            uniqueLinks.push(link);
            await validateLinks(link, adapters, crawler);
        }
    });
}

function initiateCrawl(crawler: any, adapters: AbstractAdapter[]): void {
    for(let i = 0; i < adapters.length; i++) {
        console.log(chalk.green('[INFO] ') + 'Queue ' + adapters[i].baseUrl);
        console.log(chalk.green('[INFO] ') + 'Queue ' + adapters[i].seedUrl);
        crawler.queue(adapters[i].baseUrl);
        crawler.queue(adapters[i].seedUrl);
    }
}

function getType(url: string): boolean {
    if (!url) return false;
    for(let i = 0; i < adapters.length; i++) {
        if (adapters[i].isType(url)) {
            return true;
        }
    }
    return false;
}

async function duplicatedRequest(url: string): Promise<boolean> {
    return await seen.exists(url);
}

seen.initialize()
    .then(() => {
        var crawler = new Crawler({
            rateLimit: 1000,
            maxConnections: 1000,
            callback : async (error: Error, res: any, done: Function) => {
                if(error){
                    console.log(chalk.red(error));
                } else{
                    var $ = res.$;
                    console.log(chalk.green('[INFO] ') + 'Got result for: ' + res.request.uri.href);
                    // $ is Cheerio by default
                    await queueLinks($, crawler);

                    if (adapters[0].shouldReturn(res.$)) {
                        await adapters[0].store(res.$);
                    }
                }
                done();
            }
        });

        initiateCrawl(crawler, adapters);
    });