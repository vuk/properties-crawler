import { AbstractAdapter, PropertyType, ServiceType } from "./abstract-adapter";
import { resolveSerbianMunicipality, SerbianMunicipality } from "./serbian-municipality";

/**
 * Oglasi.rs — real-estate hub: https://www.oglasi.rs/nekretnine
 * Single ads use /oglas/{dd-id}/{slug}/ (same path pattern for all categories).
 * We only persist listings whose breadcrumb includes /nekretnine (see validateListing + res).
 */

function hostMatchesOglasi(hostname: string): boolean {
  return hostname.replace(/^www\./i, "") === "oglasi.rs";
}

/** `/oglas/03-3714525/some-slug` — numeric id segment `dd-nnn...`. */
function isOglasiDetailPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return /^\/oglas\/\d{2}-\d+\/[^/]+$/.test(p);
}

/**
 * Category is encoded in breadcrumbs, not in /oglas/ URL. Scope to ol.breadcrumb so the
 * global nav link to Nekretnine is ignored.
 */
function isNekretnineBreadcrumb($: any): boolean {
  let ok = false;
  $("ol.breadcrumb a[href]").each((_i: number, el: any) => {
    const h = ($(el).attr("href") || "").trim();
    if (h === "/nekretnine" || /\/nekretnine\/?$/.test(h)) {
      ok = true;
      return false;
    }
  });
  return ok;
}

function parsePriceEur($: any): number {
  const content = ($('span[itemprop="price"]').attr("content") || "").trim();
  if (content) {
    const n = parseFloat(content.replace(/\s/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  const blob =
    $('h3[itemprop="offers"]').text() ||
    $("h1")
      .first()
      .parent()
      .find("h4")
      .first()
      .text() ||
    "";
  const t = blob.replace(/\s/g, "").toLowerCase();
  if (t.includes("dogovor")) return 0;
  const digits = t.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function parseAreaM2(text: string): number {
  const m = text.replace(/\s/g, " ").match(/([\d.,]+)\s*m\s*2/i);
  if (m) {
    const n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  return 0;
}

function parseRoomsOglasi(text: string): number {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  if (/garson|garsonjera|studio/.test(t)) return 1;
  const plus = t.match(/(\d+)\s*\+\s*sob/);
  if (plus) return parseInt(plus[1], 10) || 0;
  const dec = t.match(/(\d+(?:[.,]\d+)?)\s*sob/);
  if (dec) return parseFloat(dec[1].replace(",", ".")) || 0;
  if (/peto\s*sob|petosoban/.test(t)) return 5;
  if (/četvoro\s*sob|četvorosoban|četiri\s*sob/.test(t)) return 4;
  if (/trosoban|troiposoban|tro\s*sob/.test(t)) return 3;
  if (/dvosoban|dvoiposoban|dvo\s*sob/.test(t)) return 2;
  if (/jednosoban|jednoiposoban|jedno\s*sob/.test(t)) return 1;
  return 0;
}

function parseFloorOglasi(text: string): number {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return 0;
  if (/prizemlje|^pr\.|[^a-z]pr\s| prizem/.test(t)) return 0;
  if (/suteren|podrum/.test(t)) return 0;
  const m = t.match(/^(\d+)\s*\./);
  if (m) return parseInt(m[1], 10);
  const d = t.match(/\d+/);
  return d ? parseInt(d[0], 10) : 0;
}

function tableValueByLabel($: any, root: any, labelNeedle: string): string {
  let out = "";
  const needle = labelNeedle.toLowerCase();
  root.find("table tr").each((_i: number, tr: any) => {
    const cells = $(tr).find("td");
    if (cells.length < 2) return;
    const lab = $(cells[0]).text().replace(/\s+/g, " ").trim().toLowerCase();
    if (lab.includes(needle)) {
      out = $(cells[1]).text().replace(/\s+/g, " ").trim();
      return false;
    }
  });
  return out;
}

function breadcrumbHrefs($: any): string {
  const parts: string[] = [];
  $("ol.breadcrumb a[href]").each((_i: number, el: any) => {
    parts.push(($(el).attr("href") || "").trim());
  });
  return parts.join(" ");
}

function detectServiceTypeFromContext(blob: string): ServiceType {
  const t = blob.toLowerCase();
  if (
    /\/izdavanje[-/]/.test(t) ||
    /\bizdavanje\b/.test(t) ||
    /\bizdajem\b/.test(t) ||
    /\bizdaje\s+se\b/.test(t) ||
    /\bnajam\b/.test(t) ||
    /\bzakup\b/.test(t)
  ) {
    return ServiceType.RENT;
  }
  if (/\bzamen[aeiu]\b/.test(t) || /\brazmen[aeiu]\b/.test(t)) {
    return ServiceType.EXCHANGE;
  }
  return ServiceType.SALE;
}

export class OglasiAdapter extends AbstractAdapter {
  baseUrl = "https://www.oglasi.rs/";
  seedUrl: string[] = [
    "https://www.oglasi.rs/nekretnine",
    "https://www.oglasi.rs/nekretnine/prodaja-stanova",
    "https://www.oglasi.rs/nekretnine/izdavanje-stanova",
    "https://www.oglasi.rs/nekretnine/prodaja-kuca",
    "https://www.oglasi.rs/nekretnine/izdavanje-kuca",
  ];

  getUnitPrice(entry: any): number {
    const area = this.getArea(entry);
    if (!area) return 0;
    return this.getPrice(entry) / area;
  }

  getRooms(entry: any): number {
    const $ = entry.$;
    const raw = tableValueByLabel($, $("article").first(), "sobnost");
    return parseRoomsOglasi(raw);
  }

  getArea(entry: any): number {
    const $ = entry.$;
    const raw = tableValueByLabel($, entry.$("article").first(), "kvadratura");
    return parseAreaM2(raw);
  }

  getFloor(entry: any): number {
    const $ = entry.$;
    const raw = tableValueByLabel($, entry.$("article").first(), "nivo u zgradi");
    return parseFloorOglasi(raw);
  }

  getFloors(entry: any): number {
    return 0;
  }

  getPrice(entry: any): number {
    return parsePriceEur(entry.$);
  }

  getImage(entry: any): string {
    let url = "";
    entry.$("article img[src*='media.oglasi.rs']").each((i: number, el: any) => {
      const src = (entry.$(el).attr("src") || "").trim();
      if (src.startsWith("http") && !src.includes("data:image")) {
        url = src;
        return false;
      }
    });
    return url;
  }

  getTitle(entry: any): string {
    const t = entry.$("h1.fpogl-title").first().text().replace(/\s+/g, " ").trim();
    return t || "Oglasi.rs";
  }

  getDescription(entry: any): string {
    return entry.$('div[itemprop="description"]').text().replace(/\s+/g, " ").trim();
  }

  getServiceType(entry: any): ServiceType {
    const blob =
      breadcrumbHrefs(entry.$) +
      " " +
      this.getTitle(entry) +
      " " +
      this.getDescription(entry);
    return detectServiceTypeFromContext(blob);
  }

  getType(entry: any): PropertyType {
    const bc = breadcrumbHrefs(entry.$).toLowerCase();
    if (bc.includes("prodaja-kuca") || bc.includes("izdavanje-kuca")) {
      return PropertyType.HOUSE;
    }
    if (bc.includes("prodaja-stanova") || bc.includes("izdavanje-stanova")) {
      return PropertyType.APARTMENT;
    }
    const blob = `${this.getTitle(entry)} ${this.getDescription(entry)}`.toLowerCase();
    if (/\b(kuća|kuću|kuce|kucu)\b/.test(blob)) return PropertyType.HOUSE;
    return PropertyType.APARTMENT;
  }

  validateLink(url: string): boolean {
    try {
      const u = new URL(url, this.baseUrl);
      if (!hostMatchesOglasi(u.hostname)) return false;
      const p = u.pathname.replace(/\/+$/, "") || "/";
      if (p === "/nekretnine" || p.startsWith("/nekretnine/")) return true;
      return isOglasiDetailPath(p);
    } catch {
      return false;
    }
  }

  /**
   * Detail URLs are shared across categories; require Cheerio `res` and breadcrumb with /nekretnine.
   */
  validateListing(url: string, res?: any): boolean {
    try {
      const u = new URL(url, this.baseUrl);
      if (!hostMatchesOglasi(u.hostname)) return false;
      const p = u.pathname.replace(/\/+$/, "") || "/";
      if (!isOglasiDetailPath(p)) return false;
      if (!res || typeof res.$ !== "function") return false;
      return isNekretnineBreadcrumb(res.$);
    } catch {
      return false;
    }
  }

  getRawLocationText(entry: any): string {
    const $ = entry.$;
    const loc = tableValueByLabel($, entry.$("article").first(), "lokacija");
    if (loc) return loc;
    return super.getRawLocationText(entry);
  }

  getLocation(entry: any): SerbianMunicipality {
    const loc = tableValueByLabel(entry.$, entry.$("article").first(), "lokacija");
    if (loc) {
      const hit = resolveSerbianMunicipality(loc);
      if (hit !== SerbianMunicipality.UNKNOWN) return hit;
    }
    return super.getLocation(entry);
  }
}
