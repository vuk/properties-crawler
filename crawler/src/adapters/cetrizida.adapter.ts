import { AbstractAdapter, PropertyType, ServiceType } from "./abstract-adapter";
import { resolveSerbianMunicipality, SerbianMunicipality } from "./serbian-municipality";

/**
 * 4zida.rs (Next.js): listing grids and SEO meta are server-rendered; the in-page
 * detail UI is mostly client-side. Parsers use <title>, meta description, og:image,
 * and the URL (transaction + structure slug + 24-char id).
 *
 * Listing index URLs: /{prodaja|izdavanje}-{stanova|kuca}[/{lokacija}][?strana=n&…]
 * Ad detail URLs: /{transaction}-{type}/{mesto}/{struktura}/{id}
 */
const LISTING_PREFIX = /^(prodaja|izdavanje)-(stanova|kuca)$/i;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

function pathSegments(url: string, baseUrl: string): string[] {
    try {
        const u = url.startsWith("http") ? new URL(url) : new URL(url, baseUrl);
        return u.pathname.split("/").filter(Boolean);
    } catch {
        return [];
    }
}

function isAbsoluteUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

function is4zidaAbsoluteUrl(url: string): boolean {
    try {
        return new URL(url).hostname.toLowerCase().includes("4zida.rs");
    } catch {
        return false;
    }
}

function metaContent($: any, name: string): string {
    return ($( `meta[name="${name}"]` ).attr("content") || "").trim();
}

function ogContent($: any, property: string): string {
    return ($( `meta[property="${property}"]` ).attr("content") || "").trim();
}

function parseEuroPrice(text: string): number {
    const m = text.match(/([\d.]+)\s*€/);
    if (!m) return NaN;
    return parseInt(m[1].replace(/\./g, ""), 10);
}

function parseAreaFromText(text: string): number {
    const m =
        text.match(/(\d+)\s*m\s*[²2]/i) ||
        text.match(/(\d+)\s*m²/i);
    return m ? parseInt(m[1], 10) : 0;
}

function parseFloorFromDescription(desc: string): number {
    const lower = desc.toLowerCase();
    if (/visokom\s+prizemlj|prizemlj|suterenu/.test(lower)) {
        return 0;
    }
    const m = lower.match(/na\s+(\d+)\.\s*sprat/);
    return m ? parseInt(m[1], 10) : 0;
}

function parseTotalFloorsFromDescription(desc: string): number {
    const m = desc.match(/(\d+)\s*\/\s*(\d+)\s*sprat/i);
    if (m) return parseInt(m[2], 10);
    return 99;
}

function roomsFromStanStructureSlug(slug: string): number {
    const s = slug.toLowerCase();
    const rules: [string, number][] = [
        ["garsonjera", 1],
        ["cetvoroiposoban", 4],
        ["cetvorosoban", 4],
        ["petoiposoban", 5],
        ["petosoban", 5],
        ["sestosoban", 6],
        ["šestosoban", 6],
        ["dvoiposoban", 2],
        ["dvosoban", 2],
        ["troiposoban", 3],
        ["trosoban", 3],
        ["jednoiposoban", 1],
        ["jednosoban", 1],
    ];
    for (const [key, n] of rules) {
        if (s.includes(key)) return n;
    }
    const head = s.split("-")[0];
    const digits = head.match(/^(\d+)/);
    return digits ? parseInt(digits[1], 10) : 1;
}

function roomsFromHouseDescription(title: string, desc: string): number {
    const blob = `${title} ${desc}`.toLowerCase();
    const m = blob.match(/(\d+)\s*sob/);
    return m ? parseInt(m[1], 10) : 1;
}

export class CetrizidaAdapter extends AbstractAdapter {
    baseUrl: string = "https://www.4zida.rs/";
    seedUrl: string[] = [
        "https://www.4zida.rs/prodaja-stanova",
        "https://www.4zida.rs/izdavanje-stanova/beograd",
    ];

    isType(url: string): CetrizidaAdapter {
        if (url.indexOf("4zida.rs") !== -1) {
            return this;
        }
        return null;
    }

    private listingPathSegments(url: string): string[] {
        return pathSegments(url, this.baseUrl);
    }

    getArea(entry: any): number {
        const $ = entry.$;
        const desc = metaContent($, "description");
        const title = $("title").first().text().trim();
        return parseAreaFromText(desc) || parseAreaFromText(title);
    }

    getDescription(entry: any): string {
        const $ = entry.$;
        return metaContent($, "description");
    }

    getFloor(entry: any): number {
        return parseFloorFromDescription(this.getDescription(entry));
    }

    getFloors(entry: any): number {
        return parseTotalFloorsFromDescription(this.getDescription(entry));
    }

    getImage(entry: any): string {
        const $ = entry.$;
        return ogContent($, "og:image") || "";
    }

    getPrice(entry: any): number {
        const $ = entry.$;
        const title = $("title").first().text().trim();
        const desc = metaContent($, "description");
        return parseEuroPrice(title) || parseEuroPrice(desc);
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
        const href = this.getUrl(entry);
        const segs = this.listingPathSegments(href);
        if (segs.length < 4) return 1;
        const kind = segs[0].toLowerCase();
        const structureSlug = segs[2];
        if (kind.endsWith("-kuca")) {
            const title = entry.$("title").first().text().trim();
            return roomsFromHouseDescription(title, this.getDescription(entry));
        }
        return roomsFromStanStructureSlug(structureSlug);
    }

    getTitle(entry: any): string {
        const $ = entry.$;
        const t = ogContent($, "og:title");
        if (t) return t;
        return $("title").first().text().trim();
    }

    validateLink(url: string): boolean {
        if (!url || url.includes("/blog/") || url.includes("/agencije/")) {
            return false;
        }
        const segs = pathSegments(url, this.baseUrl);
        if (segs.length >= 1 && segs.length <= 2 && LISTING_PREFIX.test(segs[0])) {
            return true;
        }
        // Ad detail URLs must be queued when linked from listing grids (4 path segments).
        if (this.validateListing(url)) {
            return true;
        }
        return false;
    }

    validateListing(url: string): boolean {
        if (!url) {
            return false;
        }
        // Accept relative links discovered on 4zida pages (e.g. /prodaja-stanova/...).
        if (isAbsoluteUrl(url) && !is4zidaAbsoluteUrl(url)) {
            return false;
        }
        const segs = pathSegments(url, this.baseUrl);
        if (segs.length !== 4) {
            return false;
        }
        if (!LISTING_PREFIX.test(segs[0])) {
            return false;
        }
        return OBJECT_ID.test(segs[3]);
    }

    getServiceType(entry: any): ServiceType {
        const segs = this.listingPathSegments(this.getUrl(entry));
        const root = (segs[0] || "").toLowerCase();
        return root.startsWith("prodaja") ? ServiceType.SALE : ServiceType.RENT;
    }

    getType(entry: any): PropertyType {
        const segs = this.listingPathSegments(this.getUrl(entry));
        const root = (segs[0] || "").toLowerCase();
        return root.includes("-kuca") ? PropertyType.HOUSE : PropertyType.APARTMENT;
    }

    getRawLocationText(entry: any): string {
        const segs = this.listingPathSegments(this.getUrl(entry));
        if (segs.length >= 2) {
            const s = segs[1].replace(/-/g, " ").trim();
            if (s) return s;
        }
        return super.getRawLocationText(entry);
    }

    getLocation(entry: any): SerbianMunicipality {
        const segs = this.listingPathSegments(this.getUrl(entry));
        const slugHint =
            segs.length >= 2 ? segs[1].replace(/-/g, " ").trim() : "";
        if (slugHint) {
            const fromSlug = resolveSerbianMunicipality(slugHint);
            if (fromSlug !== SerbianMunicipality.UNKNOWN) return fromSlug;
        }
        const merged = `${slugHint} ${this.getTitle(entry)} ${this.getDescription(entry)}`
            .replace(/\s+/g, " ")
            .trim();
        return resolveSerbianMunicipality(merged);
    }
}
