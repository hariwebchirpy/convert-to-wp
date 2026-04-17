/**
 * Parses inline style strings and class names into Elementor-compatible
 * settings objects. Used by all native widget builders.
 */

export interface ParsedTypography {
  font_size?: { unit: string; size: number };
  font_weight?: string;
  font_style?: string;
  text_decoration?: string;
  line_height?: { unit: string; size: number };
  letter_spacing?: { unit: string; size: number };
  color?: string;
}

export interface ParsedSpacing {
  margin?: ElementorDimension;
  padding?: ElementorDimension;
}

export interface ElementorDimension {
  top: string;
  right: string;
  bottom: string;
  left: string;
  unit: string;
  isLinked: boolean;
}

export type Alignment = "left" | "center" | "right" | "justify";

/** Parse a CSS inline style string into a key→value map */
export function parseStyle(style: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (prop && val) map[prop] = val;
  }
  return map;
}

/** Convert a CSS pixel value like "16px" or "1.5em" → number (px assumed) */
function parsePx(val: string): number | null {
  const m = val.match(/^([\d.]+)(px|em|rem|pt|%)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2] ?? "px";
  if (unit === "em" || unit === "rem") return Math.round(n * 16);
  return Math.round(n);
}

/** Extract typography-relevant Elementor settings from inline style + classes */
export function extractTypography(element: Element): ParsedTypography {
  const style = parseStyle(element.getAttribute("style") ?? "");
  const cls = element.getAttribute("class") ?? "";
  const result: ParsedTypography = {};

  if (style["color"]) result.color = style["color"];
  if (style["font-size"]) {
    const size = parsePx(style["font-size"]);
    if (size) result.font_size = { unit: "px", size };
  }
  if (style["font-weight"]) result.font_weight = style["font-weight"];
  if (style["font-style"]) result.font_style = style["font-style"];
  if (style["text-decoration"]) result.text_decoration = style["text-decoration"];
  if (style["line-height"]) {
    const lh = parsePx(style["line-height"]);
    if (lh) result.line_height = { unit: "px", size: lh };
  }
  if (style["letter-spacing"]) {
    const ls = parsePx(style["letter-spacing"]);
    if (ls !== null) result.letter_spacing = { unit: "px", size: ls };
  }

  // Bootstrap text-* colour utilities → approximate colours
  const BOOTSTRAP_COLORS: Record<string, string> = {
    "text-primary": "#0d6efd",
    "text-secondary": "#6c757d",
    "text-success": "#198754",
    "text-danger": "#dc3545",
    "text-warning": "#ffc107",
    "text-info": "#0dcaf0",
    "text-dark": "#212529",
    "text-white": "#ffffff",
    "text-muted": "#6c757d",
    "text-light": "#f8f9fa",
  };
  for (const [utility, color] of Object.entries(BOOTSTRAP_COLORS)) {
    if (cls.includes(utility) && !result.color) {
      result.color = color;
      break;
    }
  }

  return result;
}

/** Resolve text alignment from inline style + Bootstrap/Tailwind classes */
export function extractAlignment(element: Element): Alignment {
  const style = parseStyle(element.getAttribute("style") ?? "");
  const cls = element.getAttribute("class") ?? "";

  if (style["text-align"]) {
    const a = style["text-align"];
    if (a === "center") return "center";
    if (a === "right") return "right";
    if (a === "justify") return "justify";
    return "left";
  }

  if (cls.includes("text-center") || cls.includes("text-md-center") || cls.includes("text-lg-center"))
    return "center";
  if (cls.includes("text-right") || cls.includes("text-end"))
    return "right";
  if (cls.includes("text-justify"))
    return "justify";

  return "left";
}

/** Extract background colour from inline style */
export function extractBgColor(element: Element): string | undefined {
  const style = parseStyle(element.getAttribute("style") ?? "");
  return style["background-color"] ?? style["background"] ?? undefined;
}

/** Extract border-radius as a pixel number */
export function extractBorderRadius(element: Element): number | undefined {
  const style = parseStyle(element.getAttribute("style") ?? "");
  const raw = style["border-radius"];
  if (!raw) return undefined;
  return parsePx(raw) ?? undefined;
}

/** Parse a shorthand margin/padding value into an Elementor dimension object */
function parseDimension(value: string, unit = "px"): ElementorDimension {
  const parts = value.trim().split(/\s+/).map((v) => {
    const n = parsePx(v);
    return n !== null ? String(n) : "0";
  });
  const [top = "0", right = top, bottom = top, left = right] = parts;
  return { top, right, bottom, left, unit, isLinked: top === right && right === bottom && bottom === left };
}

/** Extract Elementor margin/padding from inline styles */
export function extractSpacing(element: Element): ParsedSpacing {
  const style = parseStyle(element.getAttribute("style") ?? "");
  const result: ParsedSpacing = {};

  if (style["margin"]) result.margin = parseDimension(style["margin"]);
  if (style["padding"]) result.padding = parseDimension(style["padding"]);

  return result;
}

/** Build Elementor __globals__ / typography settings sub-object */
export function buildTypographySettings(typo: ParsedTypography): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  if (typo.color) settings["color"] = typo.color;
  if (typo.font_size) settings["typography_font_size"] = typo.font_size;
  if (typo.font_weight) settings["typography_font_weight"] = typo.font_weight;
  if (typo.font_style) settings["typography_font_style"] = typo.font_style;
  if (typo.text_decoration) settings["typography_text_decoration"] = typo.text_decoration;
  if (typo.line_height) settings["typography_line_height"] = typo.line_height;
  if (typo.letter_spacing) settings["typography_letter_spacing"] = typo.letter_spacing;
  if (Object.keys(settings).length) settings["typography"] = "custom";
  return settings;
}
