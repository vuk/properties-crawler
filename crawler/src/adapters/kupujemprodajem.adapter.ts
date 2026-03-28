import { AbstractAdapter, PropertyType, ServiceType } from "./abstract-adapter";
import { resolveSerbianMunicipality, SerbianMunicipality } from "./serbian-municipality";

/** Minimal shape from KP Next.js `__NEXT_DATA__` → `initialReduxState.ad.byId`. */
type KpAdAttribute = {
  code?: string;
  values?: string[];
};

type KpAdSection = {
  attributes?: KpAdAttribute[];
};

type KpAd = {
  id?: number;
  name?: string;
  formattedName?: string;
  description?: string;
  priceNumber?: number;
  categoryId?: number;
  groupName?: string;
  adUrl?: string;
  photos?: { original?: string; thumbnail?: string }[];
  adAttributes?: KpAdSection[];
};

function parseNextData(html: string): unknown | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as unknown;
  } catch {
    return null;
  }
}

function listingIdFromUrl(href: string): string | null {
  const m = href.match(/\/oglas\/(\d+)(?:\?|#|$)/);
  return m ? m[1] : null;
}

function adFromBody(html: string, pageUrl: string): KpAd | null {
  const raw = parseNextData(html);
  const byId = (raw as { props?: { initialReduxState?: { ad?: { byId?: Record<string, KpAd> } } } })
    ?.props?.initialReduxState?.ad?.byId;
  if (!byId || typeof byId !== "object") return null;
  const id = listingIdFromUrl(pageUrl);
  if (id && byId[id]) return byId[id];
  const first = Object.values(byId)[0];
  return first ?? null;
}

function attrFirst(ad: KpAd, code: string): string {
  for (const section of ad.adAttributes ?? []) {
    for (const a of section.attributes ?? []) {
      if (a.code === code) return (a.values ?? [])[0] ?? "";
    }
  }
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Location line under `.product-details-desc`: spans with `data-code` (grad, lokacija, …). */
type KpLocationSpan = { code: string; text: string };

function parseProductDetailsDescSpans(html: string): KpLocationSpan[] {
  const divMatch = html.match(
    /<div\b[^>]*\bclass="[^"]*\bproduct-details-desc\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (!divMatch) return [];
  const inner = divMatch[1];
  const out: KpLocationSpan[] = [];
  const re = /<span[^>]*\bdata-code="([^"]+)"[^>]*>([\s\S]*?)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const text = stripHtml(m[2]).trim();
    if (text) out.push({ code: m[1], text });
  }
  return out;
}

/** "66 m²", "65,71 m²" → square metres */
function parseSquareMetres(label: string): number {
  const m = label.replace(/\s/g, " ").match(/([\d.,]+)\s*m/i);
  if (!m) return 0;
  return parseFloat(m[1].replace(/\./g, "").replace(",", ".")) || 0;
}

/** "44 ar" → store as m² (1 ar = 100 m²) for consistent MIN/MAX_AREA filters */
function parseArToSquareMetres(label: string): number {
  const m = label.match(/([\d.,]+)\s*ar/i);
  if (!m) return 0;
  const ar = parseFloat(m[1].replace(/\./g, "").replace(",", ".")) || 0;
  return ar * 100;
}

/** "3.0  Trosoban", "4.0  Četiri", "5+ petosobna" in titles */
function parseRoomsLabel(label: string): number {
  const m = label.trim().match(/^(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function parseApartmentFloor(label: string): number {
  const t = label.trim().toUpperCase();
  if (/^PR\b|PRIZEM|PR\.|SUTEREN/.test(t)) return 0;
  const m = t.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

/** "5 spratova" */
function parseTotalFloorsLabel(label: string): number {
  const m = label.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Houses: "Prizemna", "Na sprat", … */
function parseHouseFloorAndFloors(buildingLevel: string): { floor: number; floors: number } {
  const t = buildingLevel.toLowerCase();
  if (/prizem|pr\.\s*nivo|pr\./.test(t)) return { floor: 0, floors: 1 };
  const m = t.match(/(\d+)\s*sprat/i) || t.match(/\b(\d+)\b/);
  const n = m ? parseInt(m[1], 10) : 0;
  if (n > 0) return { floor: 0, floors: n };
  return { floor: 0, floors: 1 };
}

export class KupujemprodajemAdapter extends AbstractAdapter {
  baseUrl = "https://www.kupujemprodajem.com";

  /**
   * Hub + category entry points under `/nekretnine` that SSR real-estate links.
   * Detail URLs: `/nekretnine-prodaja|nekretnine-izdavanje/.../oglas/{numericId}`.
   */
  seedUrl: string[] = [
    "https://www.kupujemprodajem.com/nekretnine",
    "https://www.kupujemprodajem.com/nekretnine/kategorija/2822",
    "https://www.kupujemprodajem.com/nekretnine/kategorija/2823",
    "https://www.kupujemprodajem.com/nekretnine/kategorija/2850",
  ];

  isType(url: string): KupujemprodajemAdapter | null {
    try {
      const u = new URL(url);
      if (u.hostname.replace(/^www\./i, "") !== "kupujemprodajem.com") return null;
      return this;
    } catch {
      return null;
    }
  }

  private ad(entry: any): KpAd | null {
    if (entry._kpAdParsed !== undefined) return entry._kpAdParsed;
    const body = typeof entry.body === "string" ? entry.body : "";
    const href = entry.request?.uri?.href ?? "";
    entry._kpAdParsed = adFromBody(body, href);
    return entry._kpAdParsed;
  }

  private productDetailsDescSpans(entry: any): KpLocationSpan[] {
    if (entry._kpProductDetailsDescSpans !== undefined) return entry._kpProductDetailsDescSpans;
    const body = typeof entry.body === "string" ? entry.body : "";
    entry._kpProductDetailsDescSpans = parseProductDetailsDescSpans(body);
    return entry._kpProductDetailsDescSpans;
  }

  getArea(entry: any): number {
    const ad = this.ad(entry);
    if (!ad) return 0;
    const m2 = attrFirst(ad, "realEstateArea");
    if (m2) return parseSquareMetres(m2);
    const land = attrFirst(ad, "realEstateLandArea");
    if (land) return parseArToSquareMetres(land);
    return 0;
  }

  getDescription(entry: any): string {
    return stripHtml(this.ad(entry)?.description ?? "");
  }

  getFloor(entry: any): number {
    const ad = this.ad(entry);
    if (!ad) return 0;
    const apt = attrFirst(ad, "realEstateFloor");
    if (apt) return parseApartmentFloor(apt);
    const houseLevel = attrFirst(ad, "realEstateBuildingLevel");
    if (houseLevel) return parseHouseFloorAndFloors(houseLevel).floor;
    return 0;
  }

  getFloors(entry: any): number {
    const ad = this.ad(entry);
    if (!ad) return 0;
    const apt = attrFirst(ad, "realEstateNumberOfFloors");
    if (apt) return parseTotalFloorsLabel(apt);
    const houseLevel = attrFirst(ad, "realEstateBuildingLevel");
    if (houseLevel) return parseHouseFloorAndFloors(houseLevel).floors;
    return 0;
  }

  getImage(entry: any): string {
    const ad = this.ad(entry);
    const p = ad?.photos?.[0];
    return p?.original ?? p?.thumbnail ?? "";
  }

  getPrice(entry: any): number {
    const n = this.ad(entry)?.priceNumber;
    return typeof n === "number" && !Number.isNaN(n) ? n : 0;
  }

  getRooms(entry: any): number {
    const ad = this.ad(entry);
    if (!ad) return 0;
    const r =
      attrFirst(ad, "realEstateApartmentNumberOfRooms") ||
      attrFirst(ad, "realEstateHouseNumberOfRooms");
    if (r) return parseRoomsLabel(r);
    return 0;
  }

  getTitle(entry: any): string {
    return (this.ad(entry)?.formattedName ?? this.ad(entry)?.name ?? "").trim();
  }

  /**
   * Follow real-estate hub, category URLs, group listings, and `/oglas/` detail pages.
   */
  validateLink(url: string): boolean {
    try {
      const u = new URL(url, this.baseUrl);
      if (u.hostname.replace(/^www\./i, "") !== "kupujemprodajem.com") return false;
      const p = u.pathname;
      if (p === "/nekretnine" || p.startsWith("/nekretnine/")) return true;
      if (p.startsWith("/nekretnine-prodaja/")) return true;
      if (p.startsWith("/nekretnine-izdavanje/")) return true;
      return false;
    } catch {
      return false;
    }
  }

  /** Canonical classified: `…/nekretnine-{prodaja|izdavanje}/…/oglas/{id}`. */
  validateListing(url: string): boolean {
    try {
      const u = new URL(url, this.baseUrl);
      if (u.hostname.replace(/^www\./i, "") !== "kupujemprodajem.com") return false;
      const p = u.pathname;
      if (!p.includes("/oglas/")) return false;
      if (!/^\/nekretnine-(prodaja|izdavanje)\//.test(p)) return false;
      const last = p.split("/").filter(Boolean).pop();
      return last !== undefined && /^\d+$/.test(last);
    } catch {
      return false;
    }
  }

  getServiceType(entry: any): ServiceType {
    const ad = this.ad(entry);
    if (ad?.categoryId === 2850) return ServiceType.RENT;
    try {
      const p = new URL(this.getUrl(entry)).pathname;
      if (p.startsWith("/nekretnine-izdavanje/")) return ServiceType.RENT;
    } catch {
      /* ignore */
    }
    return ServiceType.SALE;
  }

  getType(entry: any): PropertyType {
    const g = (this.ad(entry)?.groupName ?? "").toLowerCase();
    if (g.includes("stan")) return PropertyType.APARTMENT;
    if (g.includes("kuć") || g.includes("kuca") || g.includes("vikend") || g.includes("seoska"))
      return PropertyType.HOUSE;
    return PropertyType.HOUSE;
  }

  getRawLocationText(entry: any): string {
    const descParts = this.productDetailsDescSpans(entry).map((s) => s.text);
    const fromDesc = descParts.join(" - ").trim();
    if (fromDesc) return fromDesc;

    const ad = this.ad(entry);
    const parts: string[] = [];
    if (ad) {
      for (const code of [
        "grad",
        "mesto",
        "lokacija",
        "opstina",
        "city",
        "realEstateCity",
        "realEstatePlace",
      ]) {
        const v = attrFirst(ad, code);
        if (v) parts.push(v);
      }
    }
    const blob = parts.join(" ").trim();
    return blob || super.getRawLocationText(entry);
  }

  getLocation(entry: any): SerbianMunicipality {
    const spans = this.productDetailsDescSpans(entry);
    const byCode = new Map(spans.map((s) => [s.code, s.text] as const));
    /** Prefer municipality (`lokacija`) over city (`grad`) for Belgrade city municipalities. */
    const descCodes = ["lokacija", "opstina", "grad", "mesto", "mikrolokacija", "ulica"];
    for (const code of descCodes) {
      const v = byCode.get(code);
      if (v) {
        const r = resolveSerbianMunicipality(v);
        if (r !== SerbianMunicipality.UNKNOWN) return r;
      }
    }
    for (const s of spans) {
      const r = resolveSerbianMunicipality(s.text);
      if (r !== SerbianMunicipality.UNKNOWN) return r;
    }

    const ad = this.ad(entry);
    if (ad) {
      for (const code of [
        "grad",
        "mesto",
        "lokacija",
        "opstina",
        "city",
        "realEstateCity",
        "realEstatePlace",
      ]) {
        const v = attrFirst(ad, code);
        if (v) {
          const r = resolveSerbianMunicipality(v);
          if (r !== SerbianMunicipality.UNKNOWN) return r;
        }
      }
    }
    return super.getLocation(entry);
  }
}
