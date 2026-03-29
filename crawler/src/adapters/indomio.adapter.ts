import { AbstractAdapter, PropertyType, ServiceType } from "./abstract-adapter";
import { resolveSerbianMunicipality, SerbianMunicipality } from "./serbian-municipality";

/**
 * Indomio.rs (anti-bot / JS challenge on many datacenter IPs; parsers target real listing HTML).
 *
 * **Discovery** (`validateLink`): any path on this host is followed (except static assets and bare `/`, `/en`, `/sr`
 * roots that would re-queue forever from global nav).
 * **Listings** (`validateListing`): only numeric ad detail URLs are parsed and stored as `Property` rows.
 */
const ID_DIGITS_MIN = 5;

function pathSegments(url: string, baseUrl: string): string[] {
    try {
        const u = url.startsWith("http") ? new URL(url) : new URL(url, baseUrl);
        return u.pathname.split("/").filter(Boolean);
    } catch {
        return [];
    }
}

/** Resolve hub/detail hrefs; listing grids use root-relative paths like `/12345678` (no hostname in the raw string). */
function indomioResolvedPathname(raw: string, baseUrl: string): string | null {
    const t = raw.trim();
    if (!t) return null;
    try {
        const href =
            /^https?:\/\//i.test(t)
                ? t
                : t.startsWith("//")
                  ? `https:${t}`
                  : new URL(t, baseUrl).href;
        const u = new URL(href);
        const host = u.hostname.replace(/^www\./i, "").toLowerCase();
        if (host !== "indomio.rs") return null;
        return u.pathname;
    } catch {
        return null;
    }
}

function metaContent($: any, name: string): string {
    return ($( `meta[name="${name}"]` ).attr("content") || "").trim();
}

function ogContent($: any, property: string): string {
    return ($( `meta[property="${property}"]` ).attr("content") || "").trim();
}

function pageHtml(entry: any): string {
    if (typeof entry.body === "string" && entry.body.length > 0) return entry.body;
    try {
        return entry.$ ? entry.$.root().html() || "" : "";
    } catch {
        return "";
    }
}

/** Collect string values from nested JSON-LD objects (best-effort). */
function collectLdStrings(node: unknown, out: string[], depth = 0): void {
    if (depth > 12) return;
    if (node == null) return;
    if (typeof node === "string") {
        if (node.length > 2 && node.length < 4000) out.push(node);
        return;
    }
    if (typeof node === "number") {
        out.push(String(node));
        return;
    }
    if (Array.isArray(node)) {
        for (const x of node) collectLdStrings(x, out, depth + 1);
        return;
    }
    if (typeof node === "object") {
        const o = node as Record<string, unknown>;
        for (const k of Object.keys(o)) {
            collectLdStrings(o[k], out, depth + 1);
        }
    }
}

function parseJsonLdBlob(html: string): string {
    const out: string[] = [];
    const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const raw = (m[1] || "").trim();
        if (!raw) continue;
        try {
            const data = JSON.parse(raw) as unknown;
            const strings: string[] = [];
            collectLdStrings(data, strings);
            out.push(strings.join(" "));
        } catch {
            // ignore
        }
    }
    return out.join(" ").replace(/\s+/g, " ").trim();
}

function parseEuroPrice(text: string): number {
    if (!text) return 0;
    const normalized = text.replace(/\s+/g, " ");
    const euro = normalized.match(/([\d.]+)\s*€|€\s*([\d.]+)/i);
    if (euro) {
        const raw = (euro[1] || euro[2] || "").replace(/\./g, "");
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n > 0) return n;
    }
    const eurWord = normalized.match(/([\d.]+)\s*(?:EUR|eur)\b/i);
    if (eurWord) {
        const n = parseInt(eurWord[1].replace(/\./g, ""), 10);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
}

function parseAreaM2(text: string): number {
    if (!text) return 0;
    const t = text.replace(/\u00a0/g, " ");
    const patterns = [
        /(\d+(?:[.,]\d+)?)\s*m\s*[²2]/i,
        /(\d+(?:[.,]\d+)?)\s*m2\b/i,
        /(\d+(?:[.,]\d+)?)\s*sq\.?\s*m/i,
    ];
    for (const re of patterns) {
        const m = t.match(re);
        if (m) {
            const n = parseFloat(m[1].replace(",", "."));
            if (Number.isFinite(n) && n > 0) return Math.round(n);
        }
    }
    return 0;
}

function parseRoomsFromText(text: string): number {
    if (!text) return 1;
    const lower = text.toLowerCase();
    if (/garsonjera|garsoniera|studio\b/i.test(lower)) return 1;
    const m =
        lower.match(/(\d+(?:[.,]\d+)?)\s*(?:sob|bedroom|bedrooms|br\b)/i) ||
        lower.match(/(\d+)\s*-?\s*(?:iposoban|soban|sobni)/i);
    if (m) {
        const n = parseFloat(m[1].replace(",", "."));
        if (Number.isFinite(n) && n > 0) return Math.min(n, 20);
    }
    return 1;
}

function parseFloorLine(text: string): { floor: number; floors: number } {
    const lower = text.toLowerCase();
    if (/prizemlj|ground\s*floor|suteren|basement/i.test(lower)) {
        return { floor: 0, floors: 99 };
    }
    const slash = lower.match(/(\d+|pr|prizemlj)\s*\/\s*(\d+)/i);
    if (slash) {
        const fRaw = slash[1];
        const fl = /^\d+$/.test(fRaw) ? parseInt(fRaw, 10) : 0;
        const tot = parseInt(slash[2], 10);
        return { floor: fl, floors: tot > 0 ? tot : 99 };
    }
    const m = lower.match(/(\d+)\.\s*sprat|(\d+)(?:st|nd|rd|th)\s*floor/i);
    if (m) return { floor: parseInt(m[1] || m[2], 10), floors: 99 };
    return { floor: 0, floors: 99 };
}

function titleTailLocation(title: string): string {
    const parts = title.split(/\s*-\s*/);
    if (parts.length >= 2) {
        return parts.slice(1).join(" - ").trim();
    }
    return "";
}

export class IndomioAdapter extends AbstractAdapter {
    baseUrl = "https://www.indomio.rs/";
    seedUrl: string[] = [
        "https://www.indomio.rs/na-prodaju/stambeni-objekti/beograd-okrug",
        "https://www.indomio.rs/za-izdavanje/stambeni-objekti/beograd-okrug",
        "https://www.indomio.rs/za-izdavanje/stambeni-objekti/juzna-backa",
        "https://www.indomio.rs/na-prodaju/stambeni-objekti/juzna-backa",
    ];

    isType(url: string): IndomioAdapter {
        if (/indomio\.rs/i.test(url)) {
            return this;
        }
        return null;
    }

    private mergedText(entry: any): string {
        const $ = entry.$;
        const html = pageHtml(entry);
        const ld = parseJsonLdBlob(html);
        const title = $("title").first().text().trim();
        const metaDesc = metaContent($, "description");
        const ogDesc = ogContent($, "og:description");
        return [title, metaDesc, ogDesc, ld].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    }

    getTitle(entry: any): string {
        const $ = entry.$;
        const og = ogContent($, "og:title");
        if (og) return og;
        return $("title").first().text().trim();
    }

    getDescription(entry: any): string {
        const $ = entry.$;
        const og = ogContent($, "og:description");
        if (og) return og;
        const d = metaContent($, "description");
        if (d) return d;
        const html = pageHtml(entry);
        const ld = parseJsonLdBlob(html);
        return ld.slice(0, 8000);
    }

    getImage(entry: any): string {
        const $ = entry.$;
        return ogContent($, "og:image") || "";
    }

    getPrice(entry: any): number {
        const $ = entry.$;
        const blob = this.mergedText(entry);
        const ogPrice = ogContent($, "og:price:amount") || metaContent($, "product:price:amount");
        if (ogPrice) {
            const n = parseInt(ogPrice.replace(/\D/g, ""), 10);
            if (Number.isFinite(n) && n > 0) return n;
        }
        return parseEuroPrice(blob);
    }

    getArea(entry: any): number {
        const blob = this.mergedText(entry);
        const fromBlob = parseAreaM2(blob);
        if (fromBlob > 0) return fromBlob;
        return parseAreaM2(this.getDescription(entry));
    }

    getUnitPrice(entry: any): number {
        const area = this.getArea(entry);
        const price = this.getPrice(entry);
        if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(price)) {
            return 0;
        }
        const u = price / area;
        if (!Number.isFinite(u)) return 0;
        return Math.min(u, Number.MAX_SAFE_INTEGER);
    }

    getRooms(entry: any): number {
        const blob = this.mergedText(entry);
        return parseRoomsFromText(blob);
    }

    getFloor(entry: any): number {
        return parseFloorLine(this.mergedText(entry)).floor;
    }

    getFloors(entry: any): number {
        return parseFloorLine(this.mergedText(entry)).floors;
    }

    getServiceType(entry: any): ServiceType {
        const href = this.getUrl(entry).toLowerCase();
        if (/\/za-izdavanje\/|\/to-rent\/|\/property-to-rent|izdavanje|na\s+izdavanje|for\s+rent|to\s+rent/i.test(href)) {
            return ServiceType.RENT;
        }
        const title = this.getTitle(entry).toLowerCase();
        const desc = this.getDescription(entry).toLowerCase();
        if (/izdavanje|iznajmlj|for\s+rent|to\s+rent|rent\b/i.test(`${title} ${desc}`)) {
            return ServiceType.RENT;
        }
        return ServiceType.SALE;
    }

    getType(entry: any): PropertyType {
        const blob = `${this.getTitle(entry)} ${this.getDescription(entry)}`.toLowerCase();
        if (
            /\bkuć|\bkuc|\bhouse\b|\bdetached\b|\bzemlji|\bparcel\b|\bplot\b|\bland\b|\bvikend/i.test(
                blob
            )
        ) {
            return PropertyType.HOUSE;
        }
        return PropertyType.APARTMENT;
    }

    getRawLocationText(entry: any): string {
        const tail = titleTailLocation(this.getTitle(entry));
        if (tail) return tail;
        return super.getRawLocationText(entry);
    }

    getLocation(entry: any): SerbianMunicipality {
        const tail = titleTailLocation(this.getTitle(entry));
        if (tail) {
            const hit = resolveSerbianMunicipality(tail);
            if (hit !== SerbianMunicipality.UNKNOWN) return hit;
        }
        return super.getLocation(entry);
    }

    validateListing(url: string): boolean {
        const pathname = indomioResolvedPathname(url, this.baseUrl);
        if (!pathname) return false;
        const segs = pathname.split("/").filter(Boolean);
        if (segs.length === 1 && new RegExp(`^\\d{${ID_DIGITS_MIN},}$`).test(segs[0])) {
            return true;
        }
        if (
            segs.length === 2 &&
            /^(en|sr)$/i.test(segs[0]) &&
            new RegExp(`^\\d{${ID_DIGITS_MIN},}$`).test(segs[1])
        ) {
            return true;
        }
        return false;
    }

    validateLink(url: string): boolean {
        const pathname = indomioResolvedPathname(url, this.baseUrl);
        if (!pathname) return false;
        if (/\.(pdf|jpe?g|png|gif|webp|svg|ico|css|js|mjs|map|woff2?|ttf|eot|zip)$/i.test(pathname)) {
            return false;
        }
        const segs = pathname.split("/").filter(Boolean);
        // Nav repeats these on every page; baseUrl / seeds already enter the site.
        if (segs.length === 0) return false;
        if (segs.length === 1 && /^(en|sr)$/i.test(segs[0])) return false;
        return true;
    }
}
