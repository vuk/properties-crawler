import { AbstractAdapter, PropertyType, ServiceType } from "./abstract-adapter";
import { resolveSerbianMunicipality, SerbianMunicipality } from "./serbian-municipality";

/** Merged shape: top-level classified + flattened OtherFields from Halo oglasi HTML. */
type HaloClassified = {
  Title?: string;
  TextHtml?: string;
  ImageURLs?: string[];
  CategoryIds?: number[];
  kvadratura_d?: number;
  broj_soba_s?: string;
  sprat_s?: string;
  sprat_od_s?: string;
  cena_d?: number;
  tip_nekretnine_s?: string;
  /** Location strings live in OtherFields on the wire; merged into this shape by parseClassifiedFromBody. */
  grad_s?: string;
  lokacija_s?: string;
  mikrolokacija_s?: string;
};

const CLASSIFIED_MARKER = "QuidditaEnvironment.CurrentClassified=";

/** Extract a top-level JSON object from HTML, respecting strings (handles `{`/`}` inside values). */
function extractJsonObject(html: string, startBraceIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startBraceIndex; i < html.length; i++) {
    const c = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(startBraceIndex, i + 1);
    }
  }
  return null;
}

function parseClassifiedFromBody(html: string): HaloClassified | null {
  const idx = html.indexOf(CLASSIFIED_MARKER);
  if (idx === -1) return null;
  let i = idx + CLASSIFIED_MARKER.length;
  while (i < html.length && /\s/.test(html[i])) i++;
  if (html[i] !== "{") return null;
  const jsonStr = extractJsonObject(html, i);
  if (!jsonStr) return null;
  try {
    const raw = JSON.parse(jsonStr) as HaloClassified & { OtherFields?: Record<string, unknown> };
    const other = raw.OtherFields ?? {};
    return { ...raw, ...other };
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sprat like "1", "PR/2", "I/4" → integer floor (PR / Roman I…VI). */
function parseFloorLabel(s: string | undefined): number {
  if (!s) return 0;
  const part = s.split("/")[0].trim().toUpperCase();
  if (/^PR/.test(part) || part === "P" || part === "PRIZEMLJE") return 0;
  const roman: Record<string, number> = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
  };
  if (roman[part] !== undefined) return roman[part];
  const m = part.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function parseFloorsLabel(s: string | undefined): number {
  if (!s) return 0;
  const t = s.trim();
  const parts = t.split("/");
  if (parts.length > 1) {
    const m = parts[parts.length - 1].match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  const m = t.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

/** Halo detail page: `.product-details-desc` spans with `data-code` (grad / lokacija / mikrolokacija). */
type HaloProductDetailsLocation = {
  grad?: string;
  lokacija?: string;
  mikrolokacija?: string;
};

function stripOpstinaPrefix(s: string): string {
  return s.replace(/^\s*opština\s+/i, "").replace(/^\s*opstina\s+/i, "").trim();
}

/** Default span text before Halo's inline scripts replace it with grad_s / lokacija_s / mikrolokacija_s. */
const HALO_LOCATION_PLACEHOLDER_LABELS = new Set(["mesto", "deo mesta", "lokacija"]);

function parseProductDetailsDesc($: any): HaloProductDetailsLocation | null {
  if (!$ || typeof $ !== "function") return null;
  const root = $(".product-details-desc").first();
  if (!root.length) return null;
  const out: HaloProductDetailsLocation = {};
  root.find("span[data-code]").each((_i: number, el: any) => {
    const code = $(el).attr("data-code");
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    if (HALO_LOCATION_PLACEHOLDER_LABELS.has(text.toLowerCase())) return;
    if (code === "grad") out.grad = text;
    else if (code === "lokacija") out.lokacija = text;
    else if (code === "mikrolokacija") out.mikrolokacija = text;
  });
  return out.grad || out.lokacija || out.mikrolokacija ? out : null;
}

export class HalooglasiAdapter extends AbstractAdapter {
  baseUrl = "https://www.halooglasi.com";
  /** Category listing entry points; detail URLs end with `/…/{numericId}`. */
  seedUrl: string[] = [
    "https://www.halooglasi.com/nekretnine/prodaja-stanova/beograd",
    "https://www.halooglasi.com/nekretnine/izdavanje-stanova/beograd",
  ];

  private classified(entry: any): HaloClassified | null {
    if (entry._haloClassifiedParsed !== undefined) {
      return entry._haloClassifiedParsed;
    }
    const body = typeof entry.body === "string" ? entry.body : "";
    entry._haloClassifiedParsed = parseClassifiedFromBody(body);
    return entry._haloClassifiedParsed;
  }

  /** Cached structured location from HTML (preferred over URL slugs for LAU mapping). */
  private productDetailsLocation(entry: any): HaloProductDetailsLocation | null {
    if (entry._haloProductDetailsLoc !== undefined) {
      return entry._haloProductDetailsLoc;
    }
    const $ = entry.$;
    entry._haloProductDetailsLoc = $ ? parseProductDetailsDesc($) : null;
    return entry._haloProductDetailsLoc;
  }

  /** Real location strings from embedded JSON (not DOM placeholders). */
  private locationFromClassified(c: HaloClassified | null): HaloProductDetailsLocation | null {
    if (!c) return null;
    const grad = typeof c.grad_s === "string" ? c.grad_s.replace(/\s+/g, " ").trim() : "";
    const lokacija = typeof c.lokacija_s === "string" ? c.lokacija_s.replace(/\s+/g, " ").trim() : "";
    const mikrolokacija =
      typeof c.mikrolokacija_s === "string" ? c.mikrolokacija_s.replace(/\s+/g, " ").trim() : "";
    if (!grad && !lokacija && !mikrolokacija) return null;
    return { grad: grad || undefined, lokacija: lokacija || undefined, mikrolokacija: mikrolokacija || undefined };
  }

  private resolvedLocation(entry: any): HaloProductDetailsLocation | null {
    return this.locationFromClassified(this.classified(entry)) ?? this.productDetailsLocation(entry);
  }

  getArea(entry: any): number {
    const c = this.classified(entry);
    const v = c?.kvadratura_d;
    return typeof v === "number" && !Number.isNaN(v) ? v : 0;
  }

  getDescription(entry: any): string {
    const c = this.classified(entry);
    return stripHtml(c?.TextHtml ?? "");
  }

  getFloor(entry: any): number {
    const c = this.classified(entry);
    return parseFloorLabel(c?.sprat_s);
  }

  getFloors(entry: any): number {
    const c = this.classified(entry);
    return parseFloorsLabel(c?.sprat_od_s);
  }

  getImage(entry: any): string {
    const c = this.classified(entry);
    const rel = c?.ImageURLs?.[0];
    if (!rel) return "";
    if (rel.startsWith("http")) return rel;
    return `https://img.halooglasi.com${rel.startsWith("/") ? "" : "/"}${rel}`;
  }

  getPrice(entry: any): number {
    const c = this.classified(entry);
    const v = c?.cena_d;
    return typeof v === "number" && !Number.isNaN(v) ? v : 0;
  }

  getRooms(entry: any): number {
    const c = this.classified(entry);
    return parseFloat(String(c?.broj_soba_s ?? "0")) || 0;
  }

  getTitle(entry: any): string {
    return (this.classified(entry)?.Title ?? "").trim();
  }

  /**
   * Queue the nekretnine hub, category branches (`prodaja-*` / `izdavanje-*`), and detail URLs.
   * Skips unrelated paths under `/nekretnine/` (e.g. novogradnja projekti, inostranstvo hubs).
   */
  validateLink(url: string): boolean {
    if (this.validateListing(url)) return true;
    try {
      const u = new URL(url, this.baseUrl);
      const host = u.hostname.replace(/^www\./i, "");
      if (host !== "halooglasi.com") return false;
      const p = u.pathname.replace(/\/+$/, "") || "/";
      if (p === "/nekretnine") return true;
      const segments = p.split("/").filter(Boolean);
      if (segments[0] !== "nekretnine" || segments.length < 2) return false;
      return /^(prodaja|izdavanje)-/i.test(segments[1]);
    } catch {
      return false;
    }
  }

  /**
   * Only treat canonical ad detail URLs as listings: path ends with a long numeric id.
   * Example: /nekretnine/prodaja-stanova/slug/5425646956298
   */
  validateListing(url: string): boolean {
    try {
      const u = new URL(url, this.baseUrl);
      if (!u.pathname.startsWith("/nekretnine/")) return false;
      const segments = u.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      return last !== undefined && /^\d{10,}$/.test(last);
    } catch {
      return false;
    }
  }

  getServiceType(entry: any): ServiceType {
    try {
      const u = new URL(this.getUrl(entry));
      if (u.pathname.includes("/izdavanje-")) return ServiceType.RENT;
      if (u.pathname.includes("/prodaja-")) return ServiceType.SALE;
    } catch {
      /* fall through */
    }
    return ServiceType.SALE;
  }

  getType(entry: any): PropertyType {
    const t = (this.classified(entry)?.tip_nekretnine_s ?? "").toLowerCase();
    if (t.includes("kuć") || t.includes("kuca")) return PropertyType.HOUSE;
    return PropertyType.APARTMENT;
  }

  getRawLocationText(entry: any): string {
    const d = this.resolvedLocation(entry);
    if (d) {
      const parts = [d.grad, d.lokacija, d.mikrolokacija].filter(Boolean);
      if (parts.length > 0) return parts.join(" - ");
    }
    try {
      const u = new URL(this.getUrl(entry));
      const parts = u.pathname.split("/").filter(Boolean);
      const hints: string[] = [];
      for (let i = 2; i < parts.length; i++) {
        const seg = parts[i];
        if (/^(prodaja|izdavanje)-/.test(seg)) continue;
        if (/^\d{10,}$/.test(seg)) continue;
        hints.push(seg.replace(/-/g, " "));
      }
      if (hints.length > 0) return hints.join(", ");
    } catch {
      /* ignore */
    }
    return super.getRawLocationText(entry);
  }

  getLocation(entry: any): SerbianMunicipality {
    const d = this.resolvedLocation(entry);
    if (d) {
      const joined = [d.lokacija, d.grad, d.mikrolokacija].filter(Boolean).join(" ");
      let r = resolveSerbianMunicipality(joined);
      if (r !== SerbianMunicipality.UNKNOWN) return r;
      if (d.lokacija) {
        const stripped = stripOpstinaPrefix(d.lokacija);
        if (stripped !== d.lokacija) {
          r = resolveSerbianMunicipality([stripped, d.grad, d.mikrolokacija].filter(Boolean).join(" "));
          if (r !== SerbianMunicipality.UNKNOWN) return r;
        }
      }
    }
    try {
      const u = new URL(this.getUrl(entry));
      const parts = u.pathname.split("/").filter(Boolean);
      for (let i = 2; i < parts.length; i++) {
        const seg = parts[i];
        if (/^(prodaja|izdavanje)-/.test(seg)) continue;
        if (/^\d{10,}$/.test(seg)) continue;
        const r = resolveSerbianMunicipality(seg.replace(/-/g, " "));
        if (r !== SerbianMunicipality.UNKNOWN) return r;
      }
    } catch {
      /* ignore */
    }
    return super.getLocation(entry);
  }
}
