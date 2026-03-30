import { AbstractAdapter, PropertyType, ServiceType } from "./abstract-adapter";
import { resolveSerbianMunicipality, SerbianMunicipality } from "./serbian-municipality";

/** Canonical origin; listing URLs look like `/sr/listing/{id}/{slug}.html`. */
const KVADRAT_HOST = /kvadratnekretnine\.com/i;
/** Detail pages only (numeric id segment), e.g. …/sr/listing/6774/izdavanje-kuca-….html */
const LISTING_DETAIL_PATH = /\/sr\/listing\/\d+\/[^/?#]+\.html/i;

export class KvadratAdapter extends AbstractAdapter {
    baseUrl = "https://www.kvadratnekretnine.com/";
    seedUrl: string[] = [
        "https://www.kvadratnekretnine.com/sr/nekretnine/prodaja/",
        "https://www.kvadratnekretnine.com/sr/nekretnine/izdavanje/",
    ];

    private isKvadratUrl(url: string): boolean {
        const t = url.trim();
        if (t === "") return false;
        if (/^https?:\/\//i.test(t)) return KVADRAT_HOST.test(t);
        return t.startsWith("/sr/");
    }

    isType(url: string): KvadratAdapter {
        return this.isKvadratUrl(url) ? this : null;
    }

    private rowLabel($: any, row: any): string {
        return $(row).children("td").first().text().trim().toLowerCase();
    }

    private rowValue($: any, row: any): string {
        return $(row).children("td").last().text().trim();
    }

    /** Return `false` from `fn` to stop scanning (Cheerio `.each` break). */
    private forEachPodaciRow(
        entry: any,
        fn: (label: string, value: string) => boolean | void
    ): void {
        entry.$(".property-d-table .col-md-6 table tbody tr").each((_i: number, row: any) => {
            const stop = fn(this.rowLabel(entry.$, row), this.rowValue(entry.$, row)) === false;
            if (stop) return false;
        });
    }

    getArea(entry: any): number {
        let area = 0;
        this.forEachPodaciRow(entry, (label, value) => {
            if (label === "kvadratura") area = parseFloat(value);
        });
        return area;
    }

    getDescription(entry: any): string {
        const text = entry.$("#description").text().trim();
        return text.replace(/^Opis\s*\r?\n\s*/u, "").trim();
    }

    getFloor(entry: any): number {
        let floor: string | null = null;
        this.forEachPodaciRow(entry, (label, value) => {
            if (label === "sprat") floor = value;
        });
        if (floor == null) return 0;
        const t = floor.toString().trim().toLowerCase();
        if (t === "pr" || t === "prizemlje" || isNaN(parseInt(floor, 10))) return 0;
        return parseInt(floor, 10);
    }

    getFloors(entry: any): number {
        let floors: string | null = null;
        this.forEachPodaciRow(entry, (label, value) => {
            if (label === "broj spratova") floors = value;
        });
        const n = floors != null ? parseInt(floors, 10) : NaN;
        return Number.isFinite(n) ? n : 0;
    }

    getImage(entry: any): string {
        const $first = entry.$("#property-d-1 .item").first();
        const fromData = $first.attr("data-src");
        if (fromData) return fromData;
        const fromImg = $first.find("img").attr("src");
        return fromImg ?? "";
    }

    getPrice(entry: any): number {
        let price: number | null = null;
        this.forEachPodaciRow(entry, (label, value) => {
            if (label === "ukupna cena") {
                const normalized = value.replace(/\./g, "").replace(/\s/g, "");
                price = parseFloat(normalized);
            }
        });
        return price ?? 0;
    }

    getRooms(entry: any): number {
        let rooms: number | null = null;
        this.forEachPodaciRow(entry, (label, value) => {
            if (label === "broj soba") rooms = parseFloat(value);
        });
        return rooms ?? 0;
    }

    getTitle(entry: any): string {
        return entry.$("h1").first().text().trim();
    }

    validateLink(url: string): boolean {
        if (!this.isKvadratUrl(url)) return false;
        const p = url.split("?")[0];
        return (
            p.includes("/sr/listing/") ||
            p.includes("/sr/nekretnine/prodaja/") ||
            p.includes("/sr/nekretnine/izdavanje/") ||
            url.includes("/sr/search")
        );
    }

    validateListing(url: string): boolean {
        if (!this.isKvadratUrl(url)) return false;
        return LISTING_DETAIL_PATH.test(url);
    }

    getServiceType(entry: any): ServiceType {
        let serviceType: ServiceType | null = null;
        this.forEachPodaciRow(entry, (label, value) => {
            if (label === "usluga") {
                const v = value.toLowerCase();
                serviceType = v === "prodaja" ? ServiceType.SALE : ServiceType.RENT;
            }
        });
        return serviceType ?? ServiceType.SALE;
    }

    getType(entry: any): PropertyType {
        let propertyType: PropertyType | null = null;
        this.forEachPodaciRow(entry, (label, value) => {
            if (label === "tip") {
                const v = value.toLowerCase();
                propertyType = v === "stan" || v === "garsonjera" ? PropertyType.APARTMENT : PropertyType.HOUSE;
            }
        });
        return propertyType ?? PropertyType.APARTMENT;
    }

    /** Line under the H1, e.g. "Beograd, Savski Venac" — primary raw_location + LAU hint. */
    private getPropertyDetailsLocationLine(entry: any): string {
        return entry.$("section.property-details p.bottom20").first().text().trim();
    }

    private getTableLocationLine(entry: any): string {
        let loc = "";
        this.forEachPodaciRow(entry, (label, value) => {
            if (label === "grad" || label === "lokacija" || label === "mesto" || label === "naselje") {
                loc = value;
                return false;
            }
        });
        return loc.trim();
    }

    private getFallbackLocationContext(entry: any): string {
        return `${this.getTitle(entry)} ${this.getDescription(entry)} ${this.getUrl(entry)}`
            .replace(/\s+/g, " ")
            .trim();
    }

    getRawLocationText(entry: any): string {
        const fromDetails = this.getPropertyDetailsLocationLine(entry);
        if (fromDetails) return fromDetails;
        const fromTable = this.getTableLocationLine(entry);
        return fromTable || super.getRawLocationText(entry);
    }

    getLocation(entry: any): SerbianMunicipality {
        const fromDetails = this.getPropertyDetailsLocationLine(entry);
        if (fromDetails) {
            const hit = resolveSerbianMunicipality(fromDetails);
            if (hit !== SerbianMunicipality.UNKNOWN) return hit;
        }
        const fromTable = this.getTableLocationLine(entry);
        if (fromTable) {
            const hit = resolveSerbianMunicipality(fromTable);
            if (hit !== SerbianMunicipality.UNKNOWN) return hit;
        }
        return resolveSerbianMunicipality(this.getFallbackLocationContext(entry));
    }
}
