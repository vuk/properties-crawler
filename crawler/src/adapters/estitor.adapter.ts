import { AbstractAdapter, PropertyType, ServiceType } from "./abstract-adapter";
import { resolveSerbianMunicipality, SerbianMunicipality } from "./serbian-municipality";

/**
 * Estitor.com — **Serbia only** (`/rs/`). Montenegro (`/me`, `/me-en`) is ignored.
 * English locale `/rs-en/` is not crawled: same listings as `/rs/`, which would duplicate rows keyed by URL.
 *
 * **Discovery** (`validateLink`): Serbian locale paths on `estitor.com`, except obvious static assets.
 * **Listings** (`validateListing`): those paths whose last segment is `id-{digits}`.
 */
const LISTING_ID_SEGMENT = /^id-\d+$/i;

/** Serbian locale only (`/rs/…`). Excludes `/rs-en/` so English mirrors are not stored as separate ads. */
function isSerbiaEstitorPath(pathname: string): boolean {
    const p = pathname.toLowerCase();
    if (p === "/rs-en" || p.startsWith("/rs-en/")) return false;
    return p === "/rs" || p.startsWith("/rs/");
}

function pageHtml(entry: any): string {
    if (typeof entry.body === "string" && entry.body.length > 0) return entry.body;
    try {
        return entry.$ ? entry.$.root().html() || "" : "";
    } catch {
        return "";
    }
}

function estitorResolvedPathname(raw: string, baseUrl: string): string | null {
    const t = raw.trim();
    if (!t) return null;
    try {
        const href = /^https?:\/\//i.test(t)
            ? t
            : t.startsWith("//")
              ? `https:${t}`
              : new URL(t, baseUrl).href;
        const u = new URL(href);
        const host = u.hostname.replace(/^www\./i, "").toLowerCase();
        if (host !== "estitor.com") return null;
        return u.pathname;
    } catch {
        return null;
    }
}

function metaContent($: any, name: string): string {
    return ($(`meta[name="${name}"]`).attr("content") || "").trim();
}

function ogContent($: any, property: string): string {
    return ($(`meta[property="${property}"]`).attr("content") || "").trim();
}

function extractJsonLdNodes(html: string): unknown[] {
    const out: unknown[] = [];
    const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const raw = (m[1] || "").trim();
        if (!raw) continue;
        try {
            const data = JSON.parse(raw) as Record<string, unknown>;
            const g = data["@graph"];
            if (Array.isArray(g)) {
                out.push(...g);
            } else {
                out.push(data);
            }
        } catch {
            // ignore
        }
    }
    return out;
}

function isRecord(x: unknown): x is Record<string, unknown> {
    return x != null && typeof x === "object" && !Array.isArray(x);
}

function realEstateListingNode(nodes: unknown[]): Record<string, unknown> | null {
    for (const n of nodes) {
        if (!isRecord(n)) continue;
        const t = n["@type"];
        if (t === "RealEstateListing") return n;
        if (Array.isArray(t) && t.includes("RealEstateListing")) return n;
    }
    return null;
}

function amenityNumber(features: unknown, nameMatch: RegExp): number | null {
    if (!Array.isArray(features)) return null;
    for (const f of features) {
        if (!isRecord(f)) continue;
        const n = String(f.name ?? "");
        if (!nameMatch.test(n)) continue;
        const v = f.value;
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string") {
            const d = parseInt(v.replace(/\D/g, ""), 10);
            if (Number.isFinite(d)) return d;
        }
    }
    return null;
}

function itemOfferedRecord(listing: Record<string, unknown>): Record<string, unknown> | null {
    const io = listing.itemOffered;
    if (isRecord(io)) return io;
    return null;
}

function floorSizeM2(io: Record<string, unknown>): number {
    const fs = io.floorSize;
    if (isRecord(fs)) {
        const v = fs.value;
        if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v);
        if (typeof v === "string") {
            const n = parseFloat(v.replace(",", "."));
            if (Number.isFinite(n) && n > 0) return Math.round(n);
        }
    }
    return 0;
}

function schemaPropertyType(io: Record<string, unknown>, title: string, description: string): PropertyType {
    const t = io["@type"];
    const parts = (Array.isArray(t) ? t : [t]).map((x) => String(x ?? "").toLowerCase());
    const typeJoined = parts.join(" ");
    const blob = `${typeJoined} ${title} ${description}`.toLowerCase();

    if (typeJoined.includes("apartment")) return PropertyType.APARTMENT;
    if (
        typeJoined.includes("house") ||
        typeJoined.includes("singlefamily") ||
        typeJoined.includes("villa")
    ) {
        return PropertyType.HOUSE;
    }
    if (typeJoined.includes("land") || typeJoined.includes("plot")) return PropertyType.HOUSE;

    if (/\bkuć|\bkuc|\bhouse\b|\bzemlji|\bplac|\bplot\b|\bland\b|\bvila\b/i.test(blob)) {
        return PropertyType.HOUSE;
    }
    return PropertyType.APARTMENT;
}

function parseEuroPriceFromText(text: string): number {
    if (!text) return 0;
    const normalized = text.replace(/\s+/g, " ");
    const euro = normalized.match(/([\d.]+)\s*€|€\s*([\d.]+)/i);
    if (euro) {
        const raw = (euro[1] || euro[2] || "").replace(/\./g, "");
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n > 0) return n;
    }
    const eurComma = normalized.match(/([\d.]+),\d{2}\s*(?:EUR|eur)\b/i);
    if (eurComma) {
        const n = parseInt(eurComma[1].replace(/\./g, ""), 10);
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
        lower.match(/(\d+(?:[.,]\d+)?)\s*(?:sob|soba|bedroom)/i) ||
        lower.match(/(\d+)\s*-?\s*(?:iposoban|soban|sobni|trosoban|dvosoban|četvorosoban|cetvorosoban)/i);
    if (m) {
        const n = parseFloat(m[1].replace(",", "."));
        if (Number.isFinite(n) && n > 0) return Math.min(n, 20);
    }
    return 1;
}

function parseFloorLine(text: string): { floor: number; floors: number } {
    const lower = text.toLowerCase();
    if (/prizemlj|ground\s*floor|suteren/i.test(lower)) {
        return { floor: 0, floors: 99 };
    }
    const slash = lower.match(/(\d+)\s*\/\s*(\d+)/);
    if (slash) {
        const fl = parseInt(slash[1], 10);
        const tot = parseInt(slash[2], 10);
        return { floor: fl, floors: tot > 0 ? tot : 99 };
    }
    const m = lower.match(/(\d+)\.\s*sprat|sprat[:\s]+(\d+)/i);
    if (m) return { floor: parseInt(m[1] || m[2], 10), floors: 99 };
    return { floor: 0, floors: 99 };
}

function serviceTypeFromPath(pathname: string): ServiceType | null {
    const p = pathname.toLowerCase();
    if (
        /namena-izdavanje|purpose-rent|\/rent\//i.test(p) ||
        /\/for-rent\//i.test(p) ||
        /izdavanje/i.test(p)
    ) {
        return ServiceType.RENT;
    }
    if (/namena-prodaja|purpose-sale|\/sale\//i.test(p) || /prodaja/i.test(p)) {
        return ServiceType.SALE;
    }
    return null;
}

function addressBlob(io: Record<string, unknown>): string {
    const addr = io.address;
    if (!isRecord(addr)) return "";
    const locality = String(addr.addressLocality ?? "").trim();
    const region = String(addr.addressRegion ?? "").trim();
    const country = String(addr.addressCountry ?? "").trim();
    return [locality, region, country].filter(Boolean).join(", ");
}

type EstitorPayload = {
    price: number;
    area: number;
    rooms: number;
    floor: number;
    floors: number;
    title: string;
    description: string;
    image: string;
    addressText: string;
    schemaIo: Record<string, unknown> | null;
};

export class EstitorAdapter extends AbstractAdapter {
    baseUrl = "https://estitor.com/";
    seedUrl: string[] = [
        "https://estitor.com/rs",
        "https://estitor.com/rs/nekretnine/namena-prodaja/",
        "https://estitor.com/rs/nekretnine/namena-izdavanje/",
        "https://estitor.com/rs/nekretnine/namena-prodaja/tip-stan/grad-beograd/",
        "https://estitor.com/rs/nekretnine/namena-izdavanje/tip-stan/grad-beograd/",
        "https://estitor.com/rs/nekretnine/namena-prodaja/tip-kuca/grad-beograd/",
        "https://estitor.com/rs/nekretnine/namena-izdavanje/tip-kuca/grad-beograd/",
        "https://estitor.com/rs/nekretnine/namena-prodaja/tip-plac/grad-beograd/",
        "https://estitor.com/rs/nekretnine/namena-prodaja/tip-poslovni-prostor/grad-beograd/",
        "https://estitor.com/rs/nekretnine/namena-prodaja/tip-stan/grad-novi-sad/",
        "https://estitor.com/rs/nekretnine/namena-prodaja/tip-stan/grad-nis/",
        "https://estitor.com/rs/nekretnine/namena-prodaja/tip-stan/grad-subotica/",
    ];

    isType(url: string): EstitorAdapter | null {
        try {
            const href = url.startsWith("http") ? url : new URL(url, this.baseUrl).href;
            const host = new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
            if (host === "estitor.com") return this;
        } catch {
            // ignore
        }
        return null;
    }

    private parsePayload(entry: any): EstitorPayload {
        const $ = entry.$;
        const html = pageHtml(entry);
        const nodes = extractJsonLdNodes(html);
        const listing = realEstateListingNode(nodes);
        const io = listing ? itemOfferedRecord(listing) : null;

        let price = 0;
        let area = 0;
        let rooms = 1;
        let floor = 0;
        let floors = 99;
        let title = "";
        let description = "";
        let image = "";
        let addressText = "";

        if (listing) {
            title = String(listing.name ?? "").trim();
            description = String(listing.description ?? "").trim();
        }
        if (io) {
            area = floorSizeM2(io);
            const nr = io.numberOfRooms;
            if (typeof nr === "number" && Number.isFinite(nr) && nr > 0) {
                rooms = Math.min(nr, 20);
            }
            addressText = addressBlob(io);
            const imgs = io.image;
            if (typeof imgs === "string" && imgs) image = imgs;
            else if (Array.isArray(imgs) && typeof imgs[0] === "string") image = imgs[0];

            const sprat = amenityNumber(io.amenityFeature, /^sprat$/i);
            if (sprat != null && sprat >= 0) floor = sprat;

            const ukupno = amenityNumber(io.amenityFeature, /spratova|ukupno|total/i);
            if (ukupno != null && ukupno > 0) floors = ukupno;
        }

        if (listing && isRecord(listing.offers)) {
            const pr = listing.offers.price;
            if (typeof pr === "number" && Number.isFinite(pr) && pr > 0) price = Math.round(pr);
        }

        if ($) {
            if (!title) title = ogContent($, "og:title") || $("title").first().text().trim();
            if (!description) {
                description =
                    ogContent($, "og:description") ||
                    metaContent($, "description") ||
                    description;
            }
            if (!image) image = ogContent($, "og:image") || "";
        }

        const blob = [title, description, html.slice(0, 50_000)].join(" ").replace(/\s+/g, " ");
        if (price <= 0) price = parseEuroPriceFromText(blob);
        if (area <= 0) area = parseAreaM2(blob);
        if (rooms <= 1 && (!io || typeof io.numberOfRooms !== "number")) {
            rooms = parseRoomsFromText(blob);
        }
        if (floor === 0 && floors === 99) {
            const fl = parseFloorLine(blob);
            floor = fl.floor;
            floors = fl.floors;
        }

        return {
            price,
            area,
            rooms,
            floor,
            floors,
            title,
            description,
            image,
            addressText,
            schemaIo: io,
        };
    }

    private payload(entry: any): EstitorPayload {
        const key = "__estitorPayload";
        if (!entry[key]) entry[key] = this.parsePayload(entry);
        return entry[key] as EstitorPayload;
    }

    getTitle(entry: any): string {
        const p = this.payload(entry);
        return p.title || "Estitor";
    }

    getDescription(entry: any): string {
        return this.payload(entry).description;
    }

    getImage(entry: any): string {
        return this.payload(entry).image;
    }

    getPrice(entry: any): number {
        return this.payload(entry).price;
    }

    getArea(entry: any): number {
        return this.payload(entry).area;
    }

    getUnitPrice(entry: any): number {
        const area = this.getArea(entry);
        const price = this.getPrice(entry);
        if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(price)) return 0;
        const u = price / area;
        return Number.isFinite(u) ? Math.min(u, Number.MAX_SAFE_INTEGER) : 0;
    }

    getRooms(entry: any): number {
        return this.payload(entry).rooms;
    }

    getFloor(entry: any): number {
        return this.payload(entry).floor;
    }

    getFloors(entry: any): number {
        return this.payload(entry).floors;
    }

    getServiceType(entry: any): ServiceType {
        try {
            const pathname = new URL(this.getUrl(entry)).pathname;
            const fromPath = serviceTypeFromPath(pathname);
            if (fromPath != null) return fromPath;
        } catch {
            // ignore
        }
        const t = `${this.getTitle(entry)} ${this.getDescription(entry)}`.toLowerCase();
        if (/izdavanje|iznajmlj|rent\b|najam\b/i.test(t)) return ServiceType.RENT;
        return ServiceType.SALE;
    }

    getType(entry: any): PropertyType {
        const p = this.payload(entry);
        if (p.schemaIo) {
            return schemaPropertyType(p.schemaIo, p.title, p.description);
        }
        const blob = `${p.title} ${p.description}`.toLowerCase();
        if (/\bkuć|\bkuc|\bhouse\b|\bzemlji|\bplac|\bplot\b|\bland\b|\bvila\b/i.test(blob)) {
            return PropertyType.HOUSE;
        }
        return PropertyType.APARTMENT;
    }

    getRawLocationText(entry: any): string {
        const p = this.payload(entry);
        if (p.addressText) return p.addressText;
        const sub = p.title.includes("|") ? p.title.split("|")[0].trim() : p.title;
        if (/,/.test(sub)) {
            const parts = sub.split(",").map((s) => s.trim()).filter(Boolean);
            if (parts.length >= 2) return parts.slice(-2).join(", ");
        }
        return super.getRawLocationText(entry);
    }

    getLocation(entry: any): SerbianMunicipality {
        const p = this.payload(entry);
        if (p.addressText) {
            const hit = resolveSerbianMunicipality(p.addressText);
            if (hit !== SerbianMunicipality.UNKNOWN) return hit;
        }
        return super.getLocation(entry);
    }

    validateListing(url: string, _res?: any): boolean {
        const pathname = estitorResolvedPathname(url, this.baseUrl);
        if (!pathname || !isSerbiaEstitorPath(pathname)) return false;
        const segs = pathname.split("/").filter(Boolean);
        if (segs.length === 0) return false;
        return LISTING_ID_SEGMENT.test(segs[segs.length - 1]);
    }

    validateLink(url: string): boolean {
        const pathname = estitorResolvedPathname(url, this.baseUrl);
        if (!pathname || !isSerbiaEstitorPath(pathname)) return false;
        if (
            /\.(pdf|jpe?g|png|gif|webp|svg|ico|css|js|mjs|map|woff2?|ttf|eot|zip|xml)$/i.test(
                pathname
            )
        ) {
            return false;
        }
        if (/^\/cdn-cgi\//i.test(pathname)) return false;
        return true;
    }
}
