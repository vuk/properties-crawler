import { AbstractAdapter, PropertyType, ServiceType } from "./abstract-adapter";
import { resolveSerbianMunicipality, SerbianMunicipality } from "./serbian-municipality";

/**
 * Realitica (realitica.com): legacy HTML templates.
 *
 * Listing hubs: /nekretnine/{region}/, /prodaja/{type}/{place}/, /najam/{type}/{place}/ (and similar).
 * Ad detail URLs: /{hr|en|de}/listing/{numericId}
 */
function pathSegments(url: string, baseUrl: string): string[] {
    try {
        const u = url.startsWith("http") ? new URL(url) : new URL(url, baseUrl);
        return u.pathname.split("/").filter(Boolean);
    } catch {
        return [];
    }
}

function detailHtmlBlock(entry: any): string {
    const html = entry.$("#detailWS").html() || "";
    const cut = html.split('<div id="aboutAuthor">')[0];
    return cut || html;
}

function valueAfterStrongLabel(html: string, label: string): string | null {
    const needle = `<strong>${label}</strong>`;
    const idx = html.indexOf(needle);
    if (idx === -1) return null;
    const after = html.slice(idx + needle.length);
    const m = after.match(
        /^\s*:\s*([\s\S]*?)(?=<br\s*\/?>\s*<strong>|<div\s+id="aboutAuthor"|<!--\s*margin)/i
    );
    if (!m) return null;
    return m[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&euro;/gi, "€")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function firstLabeledValue(html: string, labels: string[]): string | null {
    for (const L of labels) {
        const v = valueAfterStrongLabel(html, L);
        if (v) return v;
    }
    return null;
}

function parseEuroPrice(text: string): number {
    if (!text) return 0;
    const t = text
        .replace(/€/g, "")
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(/[^\d]/g, "");
    return parseInt(t, 10) || 0;
}

function parseM2(text: string | null): number {
    if (!text) return 0;
    const m = text.match(/(\d+)\s*m/i);
    return m ? parseInt(m[1], 10) : 0;
}

function extractOpis(html: string, opisLabels: string[]): string {
    for (const L of opisLabels) {
        const needle = `<strong>${L}</strong>`;
        const idx = html.indexOf(needle);
        if (idx === -1) continue;
        const after = html.slice(idx + needle.length);
        const m = after.match(
            /^\s*:\s*([\s\S]*?)(?=<div\s+id="aboutAuthor"|<!--\s*margin)/i
        );
        if (m) {
            return m[1]
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
        }
    }
    return "";
}

const VRSTA = ["Vrsta", "Type", "Typ"];
const CIJENA = ["Cijena", "Price", "Preis"];
const SOBE = ["Spavaćih Soba", "Bedrooms", "Schlafzimmer"];
const STAMBENA = ["Stambena Površina", "Living Area", "Wohnfläche"];
const ZEMLJISTE = ["Zemljište", "Land Area", "Landfläche"];
const LOKACIJA = ["Lokacija", "Location", "Ort"];
const PODRUCJE = ["Područje", "District", "Bezirk"];
const OPIS = ["Opis", "Description", "Beschreibung"];

export class RealiticaAdapter extends AbstractAdapter {
    baseUrl = "https://www.realitica.com/";
    seedUrl = [
        "https://www.realitica.com/nekretnine/Srbija/",
        "https://www.realitica.com/prodaja/stanova/Beograd/",
    ];

    isType(url: string): RealiticaAdapter {
        if (/realitica\.com/i.test(url)) {
            return this;
        }
        return null;
    }

    private labelsHtml(entry: any): string {
        return detailHtmlBlock(entry);
    }

    validateListing(url: string): boolean {
        if (!url || !/realitica\.com/i.test(url)) return false;
        const segs = pathSegments(url, this.baseUrl);
        if (segs.length !== 3) return false;
        if (!/^(hr|en|de)$/i.test(segs[0])) return false;
        if (segs[1].toLowerCase() !== "listing") return false;
        return /^\d+$/.test(segs[2]);
    }

    validateLink(url: string): boolean {
        if (!url || url.includes("member_login") || url.includes("action=member")) {
            return false;
        }
        if (this.validateListing(url)) return true;
        try {
            const u = url.startsWith("http") ? new URL(url) : new URL(url, this.baseUrl);
            if (!/realitica\.com$/i.test(u.hostname.replace(/^www\./, ""))) {
                return false;
            }
            const p = u.pathname;
            if (
                p.startsWith("/nekretnine/") ||
                p.startsWith("/prodaja/") ||
                p.startsWith("/najam/")
            ) {
                return true;
            }
        } catch {
            return false;
        }
        return false;
    }

    getTitle(entry: any): string {
        const $ = entry.$;
        const og = $('meta[property="og:title"]').attr("content");
        if (og) return og.trim();
        const h2 = $("#detailWS h2").first().text().trim();
        if (h2) return h2;
        return $("title").first().text().trim();
    }

    getDescription(entry: any): string {
        const html = entry.$("#detailWS").html() || "";
        const opis = extractOpis(html, OPIS);
        if (opis) return opis;
        const og = entry.$('meta[property="og:description"]').attr("content");
        return (og || "").trim();
    }

    getImage(entry: any): string {
        const $ = entry.$;
        const og = $('meta[property="og:image"]').attr("content");
        if (og) return og.trim();
        const href = $("#rea_blueimp a.fancybox").first().attr("href");
        return (href || "").trim();
    }

    getPrice(entry: any): number {
        const html = this.labelsHtml(entry);
        return parseEuroPrice(firstLabeledValue(html, CIJENA) || "");
    }

    getArea(entry: any): number {
        const html = this.labelsHtml(entry);
        const living = parseM2(firstLabeledValue(html, STAMBENA));
        if (living > 0) return living;
        const land = parseM2(firstLabeledValue(html, ZEMLJISTE));
        if (land > 0) return land;
        const m = this.getDescription(entry).match(/(\d+)\s*m\s*2/i) || this.getDescription(entry).match(/(\d+)\s*m2/i);
        return m ? parseInt(m[1], 10) : 0;
    }

    getUnitPrice(entry: any): number {
        const a = this.getArea(entry);
        const p = this.getPrice(entry);
        if (!a) return 0;
        return p / a;
    }

    getRooms(entry: any): number {
        const html = this.labelsHtml(entry);
        const raw = firstLabeledValue(html, SOBE);
        const n = raw ? parseInt(raw.replace(/\D/g, ""), 10) : NaN;
        return Number.isFinite(n) && n > 0 ? n : 1;
    }

    getFloor(entry: any): number {
        const desc = `${this.getTitle(entry)} ${this.getDescription(entry)}`.toLowerCase();
        if (/prizemlj|suteren|ground\s*floor|erdgeschoss/i.test(desc)) return 0;
        const m = desc.match(/(\d+)\.\s*sprat/) || desc.match(/(\d+)(?:st|nd|rd|th)\s*floor/i);
        return m ? parseInt(m[1], 10) : 0;
    }

    getFloors(entry: any): number {
        const desc = `${this.getTitle(entry)} ${this.getDescription(entry)}`;
        const m = desc.match(/(\d+)\s*\/\s*(\d+)\s*sprat/i);
        if (m) return parseInt(m[2], 10);
        return 99;
    }

    getServiceType(entry: any): ServiceType {
        const html = this.labelsHtml(entry);
        const vrsta = (firstLabeledValue(html, VRSTA) || "").toLowerCase();
        if (/iznajmlj|najam|for\s+rent|zu\s+vermieten|mieten/.test(vrsta)) {
            return ServiceType.RENT;
        }
        if (/prodaj|for\s+sale|verkauf|kauf/.test(vrsta)) {
            return ServiceType.SALE;
        }
        const path = pathSegments(this.getUrl(entry), this.baseUrl).join("/").toLowerCase();
        if (path.includes("najam/")) return ServiceType.RENT;
        return ServiceType.SALE;
    }

    getType(entry: any): PropertyType {
        const html = this.labelsHtml(entry);
        const vrsta = (firstLabeledValue(html, VRSTA) || "").toLowerCase();
        if (vrsta.includes("stan") || vrsta.includes("apartment") || vrsta.includes("wohnung")) {
            return PropertyType.APARTMENT;
        }
        if (
            vrsta.includes("kuć") ||
            vrsta.includes("kuc") ||
            vrsta.includes("house") ||
            vrsta.includes("haus") ||
            vrsta.includes("zemlj")
        ) {
            return PropertyType.HOUSE;
        }
        return PropertyType.APARTMENT;
    }

    getRawLocationText(entry: any): string {
        const html = this.labelsHtml(entry);
        const loc = firstLabeledValue(html, LOKACIJA);
        const area = firstLabeledValue(html, PODRUCJE);
        const parts = [loc, area].filter(Boolean).join(", ");
        if (parts) return parts;
        return super.getRawLocationText(entry);
    }

    getLocation(entry: any): SerbianMunicipality {
        const blob = this.getRawLocationText(entry);
        const hit = resolveSerbianMunicipality(blob);
        if (hit !== SerbianMunicipality.UNKNOWN) return hit;
        return super.getLocation(entry);
    }
}
