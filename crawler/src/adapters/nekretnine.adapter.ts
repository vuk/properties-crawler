import { AbstractAdapter, PropertyType, ServiceType } from "./abstract-adapter";
import { resolveSerbianMunicipality, SerbianMunicipality } from "./serbian-municipality";

/** Ad detail: https://www.nekretnine.rs/stambeni-objekti/stanovi/{slug}/{offerId}/ */
const DETAIL_PATH = /^\/stambeni-objekti\/stanovi\/[^/]+\/[A-Za-z0-9_-]+\/?$/;

function parseIntLoose(raw: string | undefined | null): number {
  if (raw == null) return 0;
  const digits = raw.replace(/\s/g, "").replace(/\./g, "").match(/\d+(?:[.,]\d+)?/);
  if (!digits) return 0;
  return parseInt(digits[0].replace(",", ".").split(".")[0], 10) || 0;
}

function parseFloatLoose(raw: string | undefined | null): number {
  if (raw == null) return 0;
  const m = raw.replace(/\s/g, "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

/** Collapse whitespace and NBSP so stored text matches visible copy and trims reliably. */
function normalizeListingText(raw: string): string {
  return raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

/** "4 / 8", "PR / 4", "Prizemlje" → floor, floors */
function parseSpratLine(text: string): { floor: number; floors: number } {
  const t = text.trim().toLowerCase();
  const parts = t.split("/").map((s) => s.trim());
  const first = parts[0] || "";
  let floor = 0;
  if (/^pr|prizemlje|^p$/.test(first)) floor = 0;
  else {
    const m = first.match(/\d+/);
    floor = m ? parseInt(m[0], 10) : 0;
  }
  let floors = 0;
  if (parts.length > 1) {
    const m2 = parts[parts.length - 1].match(/\d+/);
    floors = m2 ? parseInt(m2[0], 10) : 0;
  }
  return { floor, floors };
}

export class NekretnineAdapter extends AbstractAdapter {
  baseUrl = "https://www.nekretnine.rs/";
  /**
   * Paginated search results (United Classifieds pattern).
   * @see https://www.nekretnine.rs/stambeni-objekti/stanovi/izdavanje-prodaja/prodaja/lista/po-stranici/10/
   */
  seedUrl: string[] = [
    "https://www.nekretnine.rs/stambeni-objekti/stanovi/izdavanje-prodaja/prodaja/lista/po-stranici/20/",
    "https://www.nekretnine.rs/stambeni-objekti/stanovi/izdavanje-prodaja/izdavanje/lista/po-stranici/20/",
  ];

  /** Sticky sidebar line, e.g. "Beograd, Lion" — primary source for raw_location and LAU mapping. */
  private stickyBoxLocationText(entry: any): string {
    return normalizeListingText(entry.$(".stickyBox__Location").first().text());
  }

  private labelValue(entry: any, label: string): string {
    const needle = label.toLowerCase();
    let found = "";
    entry.$(".property__main-details li span").each((_i: number, el: any) => {
      const $span = entry.$(el);
      const inner = $span.find("span").first().text().trim().toLowerCase();
      if (inner.startsWith(needle)) {
        const full = $span.text().replace(/\s+/g, " ").trim();
        const after = full.slice(full.toLowerCase().indexOf(needle) + needle.length).replace(/^:\s*/i, "").trim();
        found = after;
        return false;
      }
    });
    return found;
  }

  getArea(entry: any): number {
    const fromSticky = entry.$(".stickyBox__size").first().text();
    const n = parseFloatLoose(fromSticky);
    if (n > 0) return Math.round(n);
    const kv = this.labelValue(entry, "kvadratura");
    return parseIntLoose(kv) || 0;
  }

  getDescription(entry: any): string {
    const $ = entry.$;
    const selectors = [
      ".property__description .cms-content-inner",
      "#opis .cms-content-inner",
      "section#opis .cms-content-inner",
      ".tabSectionContent#opis .cms-content-inner",
    ];
    for (const sel of selectors) {
      const t = normalizeListingText($(sel).first().text());
      if (t.length > 0) return t;
    }
    const loose = normalizeListingText($(".cms-content-inner").first().text());
    if (loose.length > 0) return loose;
    const $block = $(".property__description").first().clone();
    $block.find("h2, .show-more, [data-show-more-btn], span.show-more").remove();
    return normalizeListingText($block.text());
  }

  getFloor(entry: any): number {
    const sprat = this.labelValue(entry, "sprat");
    if (sprat) return parseSpratLine(sprat).floor;
    return this.parseDlHorizontal(entry, "sprat").floor;
  }

  getFloors(entry: any): number {
    const sprat = this.labelValue(entry, "sprat");
    if (sprat) {
      const { floors } = parseSpratLine(sprat);
      if (floors > 0) return floors;
    }
    return this.parseDlHorizontal(entry, "ukupan broj spratova").floors;
  }

  /** Legacy dl layout fallback (older templates). */
  private parseDlHorizontal(entry: any, dtContains: string): { floor: number; floors: number } {
    const key = dtContains.toLowerCase();
    let text = "";
    entry.$(".row.pb-3 .col-sm-6, .base-inf .row .col-sm-6").each((_i: number, row: any) => {
      const $row = entry.$(row);
      const dt = $row.find("dt").text().trim().toLowerCase();
      if (dt.includes(key)) {
        text = $row.find("dd").text().trim();
        return false;
      }
    });
    if (!text) return { floor: 0, floors: 0 };
    if (dtContains.includes("sprat") && !dtContains.includes("ukupan")) {
      return parseSpratLine(text);
    }
    const n = parseIntLoose(text);
    return { floor: 0, floors: n };
  }

  getImage(entry: any): string {
    const $img = entry.$(".gallery-container .swiper-slide").first().find("img").first();
    const src = $img.attr("src") || $img.attr("data-src") || "";
    return src.trim();
  }

  getPrice(entry: any): number {
    const fromInput = entry.$("#credit-calculator input#price").attr("value");
    const n = parseIntLoose(fromInput || undefined);
    if (n > 0) return n;
    const sticky = entry.$(".stickyBox__price").first().clone().children().remove().end().text();
    return parseIntLoose(sticky);
  }

  getRooms(entry: any): number {
    const sobe = this.labelValue(entry, "sobe");
    if (sobe) return parseFloatLoose(sobe) || 0;
    let rooms: number | null = null;
    entry.$(".row.pb-3 .col-sm-6").each((_i: number, row: any) => {
      const $row = entry.$(row);
      const dt = $row.children(".dl-horozontal, .dl-horizontal").children("dt").text().toLowerCase();
      if (dt.includes("broj soba") || dt.includes("soba")) {
        const raw = $row.children(".dl-horozontal, .dl-horizontal").children("dd").text();
        rooms = parseFloatLoose(raw);
        return false;
      }
    });
    return rooms ?? 0;
  }

  getTitle(entry: any): string {
    return entry.$("h1.detail-title, h1.deatil-title").first().text().trim();
  }

  validateLink(url: string): boolean {
    try {
      const u = new URL(url, this.baseUrl);
      if (!u.hostname.replace(/^www\./i, "").endsWith("nekretnine.rs")) return false;
      if (u.search && u.search.includes("order=")) return false;
      const p = u.pathname;
      if (!p.startsWith("/stambeni-objekti/")) return false;
      if (this.validateListing(url)) return true;
      /** United Classifieds: only search-result (grid) URLs use `/lista/`; detail ads do not. */
      if (p.includes("/lista/")) return true;
      return false;
    } catch {
      return false;
    }
  }

  validateListing(url: string): boolean {
    try {
      const u = new URL(url, this.baseUrl);
      const p = u.pathname.replace(/\/+$/, "") + "/";
      return DETAIL_PATH.test(p) && !p.includes("galerija");
    } catch {
      return false;
    }
  }

  getServiceType(entry: any): ServiceType {
    const sub = entry.$("h2.detail-seo-subtitle").text().toLowerCase();
    if (sub.includes("izdavanje")) return ServiceType.RENT;
    if (sub.includes("prodaja")) return ServiceType.SALE;
    const fromDl = this.findBaseInfDd(entry, "transakcija");
    if (fromDl) {
      const t = fromDl.toLowerCase();
      if (t.includes("izdavanje")) return ServiceType.RENT;
      if (t.includes("prodaja")) return ServiceType.SALE;
    }
    try {
      const path = new URL(this.getUrl(entry)).pathname;
      if (path.includes("/izdavanje/")) return ServiceType.RENT;
      if (path.includes("/prodaja/")) return ServiceType.SALE;
    } catch {
      /* ignore */
    }
    return ServiceType.SALE;
  }

  private findBaseInfDd(entry: any, dtContains: string): string {
    const key = dtContains.toLowerCase();
    let out = "";
    entry.$(".base-inf .row .col-sm-6").each((_i: number, row: any) => {
      const $row = entry.$(row);
      const dt = $row.find("dt").text().trim().toLowerCase();
      if (dt.includes(key)) {
        out = $row.find("dd").text().trim();
        return false;
      }
    });
    return out;
  }

  getType(entry: any): PropertyType {
    const sub = entry.$("h2.detail-seo-subtitle").text().toLowerCase();
    if (sub.includes("kuć") || sub.includes("kuca")) return PropertyType.HOUSE;
    const purpose = this.parseDlHorizontalPurpose(entry);
    if (purpose) {
      const p = purpose.toLowerCase();
      if (p.includes("kuć") || p.includes("kuca")) return PropertyType.HOUSE;
      if (p.includes("stan")) return PropertyType.APARTMENT;
    }
    return PropertyType.APARTMENT;
  }

  private parseDlHorizontalPurpose(entry: any): string {
    let out = "";
    entry.$(".row.pb-3 .col-sm-6").each((_i: number, row: any) => {
      const $row = entry.$(row);
      const dt = $row.children(".dl-horozontal, .dl-horizontal").children("dt").text().toLowerCase();
      if (dt.includes("svrha")) {
        out = $row.children(".dl-horozontal, .dl-horizontal").children("dd").text().trim();
        return false;
      }
    });
    return out;
  }

  getRawLocationText(entry: any): string {
    const sticky = this.stickyBoxLocationText(entry);
    if (sticky) return sticky;
    const blob = [
      this.labelValue(entry, "lokacija"),
      this.labelValue(entry, "grad"),
      this.labelValue(entry, "mesto"),
      this.labelValue(entry, "naselje"),
      this.findBaseInfDd(entry, "lokacija"),
      this.findBaseInfDd(entry, "grad"),
      this.findBaseInfDd(entry, "mesto"),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    return blob || super.getRawLocationText(entry);
  }

  getLocation(entry: any): SerbianMunicipality {
    const sticky = this.stickyBoxLocationText(entry);
    if (sticky) {
      const fromSticky = resolveSerbianMunicipality(sticky);
      if (fromSticky !== SerbianMunicipality.UNKNOWN) return fromSticky;
    }
    const blob = [
      sticky,
      this.labelValue(entry, "lokacija"),
      this.labelValue(entry, "grad"),
      this.labelValue(entry, "mesto"),
      this.labelValue(entry, "naselje"),
      this.findBaseInfDd(entry, "lokacija"),
      this.findBaseInfDd(entry, "grad"),
      this.findBaseInfDd(entry, "mesto"),
    ]
      .filter(Boolean)
      .join(" ");
    const hit = resolveSerbianMunicipality(blob);
    if (hit !== SerbianMunicipality.UNKNOWN) return hit;
    return super.getLocation(entry);
  }
}
