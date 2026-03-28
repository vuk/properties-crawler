import { AbstractAdapter, PropertyType, ServiceType } from "./abstract-adapter";
import { resolveSerbianMunicipality, SerbianMunicipality } from "./serbian-municipality";

/**
 * Novosti Oglasi — real estate lives under /nekretnine/.
 * Hub: https://oglasi.novosti.rs/nekretnine/
 * Single ad: /nekretnine/{group}/{subtype}/{slug}/ (4 path segments), e.g.
 * https://oglasi.novosti.rs/nekretnine/stambeni-prostor/stan/stan-1197/
 */

function hostMatchesNovosti(hostname: string): boolean {
  return hostname.replace(/^www\./i, "") === "oglasi.novosti.rs";
}

function parsePriceEur(raw: string): number {
  if (!raw) return 0;
  const t = raw.replace(/\s/g, "").toLowerCase();
  if (t.includes("dogovor")) return 0;
  const digits = t.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

/** First .big-info under .maininfo (Površina) — "48 m2" */
function parseAreaM2(text: string): number {
  const m = text.replace(/\s/g, " ").match(/([\d.,]+)\s*m\s*2/i);
  if (m) {
    const n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  const fallback = text.match(/([\d.,]+)/);
  if (fallback) {
    const n = parseFloat(fallback[1].replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  return 0;
}

/** "1.0 soban", "5+ soban" */
function parseRooms(text: string): number {
  const t = text.toLowerCase().replace(/\s/g, " ");
  const plus = t.match(/(\d+)\s*\+\s*sob/);
  if (plus) return parseInt(plus[1], 10) || 0;
  const m = t.match(/([\d.]+)\s*sob/);
  return m ? parseFloat(m[1]) || 0 : 0;
}

function parseSpratCell(text: string): { floor: number; floors: number } {
  const parts = text.split("/").map((s) => s.trim());
  const first = (parts[0] || "").toLowerCase();
  let floor = 0;
  if (/^pr|^prizemlje|^p$/.test(first)) floor = 0;
  else {
    const d = first.match(/\d+/);
    floor = d ? parseInt(d[0], 10) : 0;
  }
  let floors = 0;
  if (parts.length > 1) {
    const d2 = parts[parts.length - 1].match(/\d+/);
    floors = d2 ? parseInt(d2[0], 10) : 0;
  }
  return { floor, floors };
}

function singleInfoValue($: any, root: any, labelNeedle: string): string {
  let out = "";
  const needle = labelNeedle.toLowerCase();
  root.find(".single-info").each((_i: number, el: any) => {
    const lab = $(el).find(".single-infoLabled").text().trim().toLowerCase();
    if (lab.includes(needle)) {
      out = $(el).find(".single-infoInfo").text().replace(/\s+/g, " ").trim();
      return false;
    }
  });
  return out;
}

function galleryImageSrc($: any, entry: any): string {
  const $img = entry.$(".galllery ul li").first().find("img").first();
  const lazy = ($img.attr("data-lazy-src") || "").trim();
  if (lazy && lazy.startsWith("http")) return lazy;
  const src = ($img.attr("src") || "").trim();
  if (src && src.startsWith("http") && !src.includes("data:image")) return src;
  const noscript = $img.closest("li").find("noscript img").first().attr("src");
  return (noscript || "").trim();
}

/** Last URL path segment as a readable fallback title (e.g. stan-355 → Stan 355). */
function titleFromListingUrl(href: string): string {
  try {
    const u = new URL(href);
    const parts = u.pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 1] || "";
    if (!slug || slug === "nekretnine") return "";
    const words = slug.split("-").filter(Boolean);
    if (words.length === 0) return "";
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  } catch {
    return "";
  }
}

function detectServiceType(text: string): ServiceType {
  const t = text.toLowerCase();
  if (
    /\bizdavanje\b/.test(t) ||
    /\bizdajem\b/.test(t) ||
    /\bizdaje\s+se\b/.test(t) ||
    /\brentiranje\b/.test(t) ||
    /\biznajmljiv/.test(t) ||
    /\bnajam\b/.test(t) ||
    /\bzakup\b/.test(t) ||
    /\bpod\s+zakup\b/.test(t)
  ) {
    return ServiceType.RENT;
  }
  if (/\bzamen[aeiu]\b/.test(t) || /\brazmen[aeiu]\b/.test(t)) {
    return ServiceType.EXCHANGE;
  }
  return ServiceType.SALE;
}

export class NovostioglasiAdapter extends AbstractAdapter {
  baseUrl = "https://oglasi.novosti.rs";
  seedUrl: string[] = [
    "https://oglasi.novosti.rs/nekretnine/",
    "https://oglasi.novosti.rs/nekretnine/stanovi/?_sft_tip-nekretnine=stan",
    "https://oglasi.novosti.rs/nekretnine/kuce/?_sft_tip-nekretnine=kuca",
  ];

  getUnitPrice(entry: any): number {
    const area = this.getArea(entry);
    if (!area) return 0;
    return this.getPrice(entry) / area;
  }

  getArea(entry: any): number {
    const $m = entry.$(".maininfo .inline-flex .x-3").first().find(".big-info").first();
    return parseAreaM2($m.text());
  }

  getRooms(entry: any): number {
    const $r = entry.$(".maininfo .inline-flex .x-3").eq(1).find(".big-info").first();
    return parseRooms($r.text());
  }

  getFloor(entry: any): number {
    const sprat = singleInfoValue(entry.$, entry.$(".oglas-single"), "sprat");
    return parseSpratCell(sprat).floor;
  }

  getFloors(entry: any): number {
    const sprat = singleInfoValue(entry.$, entry.$(".oglas-single"), "sprat");
    const { floors } = parseSpratCell(sprat);
    return floors;
  }

  getPrice(entry: any): number {
    return parsePriceEur(entry.$("h2.cena").first().text());
  }

  getImage(entry: any): string {
    return galleryImageSrc(entry.$, entry);
  }

  getTitle(entry: any): string {
    const $ = entry.$;
    const href = String(entry.request?.uri?.href ?? "");
    const stripSite = (s: string) =>
      s
        .replace(/\s+/g, " ")
        .replace(/\s*[-–|]\s*Novosti Oglasi\s*$/i, "")
        .trim();
    const pick = (raw: string): string => {
      const t = stripSite(raw);
      if (!t || /page not found/i.test(t)) return "";
      return t;
    };
    const fromDom =
      pick($(".oglas-single h1").first().text()) ||
      pick($(".oglas-single .entry-title").first().text()) ||
      pick($("h1.entry-title").first().text()) ||
      pick($("article h1").first().text()) ||
      pick($('meta[property="og:title"]').attr("content") || "") ||
      pick($("title").first().text());
    const fromUrl = titleFromListingUrl(href);
    return fromDom || fromUrl || "Novosti oglas";
  }

  getDescription(entry: any): string {
    return entry.$(".opis-oglasa").text().replace(/\s+/g, " ").trim();
  }

  getServiceType(entry: any): ServiceType {
    const blob =
      this.getTitle(entry) +
      " " +
      this.getDescription(entry) +
      " " +
      entry.$(".oglas-single").text();
    return detectServiceType(blob);
  }

  getType(entry: any): PropertyType {
    const tip = entry
      .$(".maininfo .inline-flex .x-3")
      .eq(2)
      .find(".big-info")
      .first()
      .text()
      .toLowerCase();
    if (tip.includes("kuć") || tip.includes("kuca")) return PropertyType.HOUSE;
    return PropertyType.APARTMENT;
  }

  validateLink(url: string): boolean {
    try {
      const u = new URL(url, this.baseUrl);
      if (!hostMatchesNovosti(u.hostname)) return false;
      const p = u.pathname.replace(/\/+$/, "") || "/";
      if (p === "/nekretnine") return true;
      return p.startsWith("/nekretnine/");
    } catch {
      return false;
    }
  }

  /**
   * Single property pages use exactly four segments: /nekretnine/a/b/slug/
   * (excludes /nekretnine/, /nekretnine/stanovi/, pagination, etc.)
   */
  validateListing(url: string): boolean {
    try {
      const u = new URL(url, this.baseUrl);
      if (!hostMatchesNovosti(u.hostname)) return false;
      const segments = u.pathname.split("/").filter(Boolean);
      if (segments.length !== 4) return false;
      if (segments[0] !== "nekretnine") return false;
      if (segments[1] === "page" || segments[3] === "page") return false;
      return true;
    } catch {
      return false;
    }
  }

  getRawLocationText(entry: any): string {
    const root = entry.$(".oglas-single");
    const loc =
      singleInfoValue(entry.$, root, "lokacija") ||
      singleInfoValue(entry.$, root, "grad") ||
      singleInfoValue(entry.$, root, "mesto") ||
      "";
    return loc.trim() || super.getRawLocationText(entry);
  }

  getLocation(entry: any): SerbianMunicipality {
    const root = entry.$(".oglas-single");
    const loc =
      singleInfoValue(entry.$, root, "lokacija") ||
      singleInfoValue(entry.$, root, "grad") ||
      singleInfoValue(entry.$, root, "mesto") ||
      "";
    const hit = resolveSerbianMunicipality(loc);
    if (hit !== SerbianMunicipality.UNKNOWN) return hit;
    return super.getLocation(entry);
  }
}
