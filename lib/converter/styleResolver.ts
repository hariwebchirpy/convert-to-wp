/**
 * styleResolver.ts
 *
 * Resolves the effective CSS properties for a DOM element by layering:
 *   1. Tag selector rules          (lowest priority)
 *   2. Inherited tag rules         (parent tag, for font/color inheritance)
 *   3. Descendant/child selectors  (e.g. ".hero h2", ".card > p")
 *   4. Class selector rules        (one class at a time, in DOM order)
 *   5. Multi-class selector rules  (e.g. ".card.featured")
 *   6. Inline styles               (highest priority)
 *
 * CSS custom properties (--var) are resolved if defined on :root or body.
 */

import { SelectorMap, StyleProps } from "./cssParser";

const INHERITABLE = new Set([
  "color", "font-family", "font-size", "font-weight", "font-style",
  "font-variant", "line-height", "letter-spacing", "text-align",
  "text-transform", "text-decoration", "word-spacing", "white-space",
  "visibility", "cursor", "list-style", "list-style-type",
]);

function parseInline(style: string): StyleProps {
  const map: StyleProps = {};
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (prop && val) map[prop] = val;
  }
  return map;
}

function mergeInto(target: StyleProps, source: StyleProps): void {
  for (const [k, v] of Object.entries(source)) {
    if (v) target[k] = v;
  }
}

function getClasses(el: Element): string[] {
  return (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Look up a single selector in the map.
 * Returns a copy of the props or empty object.
 */
function lookup(map: SelectorMap, selector: string): StyleProps {
  return map.has(selector) ? { ...map.get(selector)! } : {};
}

/**
 * Resolve CSS custom properties (var(--x)) against :root / body definitions.
 */
function buildVarMap(map: SelectorMap): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const sel of [":root", "body", "html"]) {
    const props = map.get(sel);
    if (!props) continue;
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith("--")) vars[k] = v;
    }
  }
  return vars;
}

function resolveVars(value: string, varMap: Record<string, string>): string {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name, fallback) => {
    return varMap[name] ?? fallback?.trim() ?? "";
  });
}

/**
 * Resolve effective styles for a DOM element against the parsed SelectorMap.
 *
 * Priority (lowest → highest):
 *   tag → class selectors → multi-class → descendant selectors → inline
 */
export function resolveStyles(element: Element, map: SelectorMap): StyleProps {
  if (map.size === 0) return {};

  const result: StyleProps = {};
  const varMap = buildVarMap(map);
  const tag = element.tagName.toLowerCase();
  const classes = getClasses(element);
  const inlineStyle = parseInline(element.getAttribute("style") ?? "");

  // 1. Tag selector
  mergeInto(result, lookup(map, tag));

  // 2. Inherited properties from parent tag (font/color cascade)
  const parent = element.parentElement;
  if (parent) {
    const parentTag = parent.tagName.toLowerCase();
    const parentTagProps = map.get(parentTag) ?? {};
    for (const [k, v] of Object.entries(parentTagProps)) {
      if (INHERITABLE.has(k) && !result[k]) result[k] = v;
    }
    // Parent class rules for inheritable props
    for (const cls of getClasses(parent)) {
      const clsProps = map.get(`.${cls}`) ?? {};
      for (const [k, v] of Object.entries(clsProps)) {
        if (INHERITABLE.has(k) && !result[k]) result[k] = v;
      }
    }
  }

  // 3. Individual class selectors (in DOM order — last wins)
  for (const cls of classes) {
    mergeInto(result, lookup(map, `.${cls}`));
  }

  // 4. Multi-class combinations (e.g. ".btn.btn-primary")
  if (classes.length > 1) {
    for (const [sel, props] of map) {
      if (!sel.startsWith(".")) continue;
      const parts = sel.match(/\.[\w-]+/g);
      if (!parts || parts.length < 2) continue;
      const required = parts.map((p) => p.slice(1));
      if (required.every((c) => classes.includes(c))) {
        mergeInto(result, props);
      }
    }
  }

  // 5. Descendant / child selectors that end with this element's tag or classes
  //    e.g. ".hero h2" matches if element is h2 and ancestor has class "hero"
  for (const [sel, props] of map) {
    if (!sel.includes(" ") && !sel.includes(">")) continue;
    if (matchesDescendantSelector(element, sel)) {
      mergeInto(result, props);
    }
  }

  // 6. Inline styles always win
  mergeInto(result, inlineStyle);

  // Resolve CSS custom properties in all values
  for (const [k, v] of Object.entries(result)) {
    if (v.includes("var(")) result[k] = resolveVars(v, varMap);
  }

  return result;
}

/**
 * Very lightweight descendant selector matcher.
 * Handles: ".parent h2", ".parent .child", "div > p"
 * Does NOT handle: nth-child, attribute selectors, pseudo-classes.
 */
function matchesDescendantSelector(element: Element, selector: string): boolean {
  try {
    // Use browser querySelector on a fragment if available
    if (typeof document !== "undefined") {
      const root = element.ownerDocument ?? document;
      // Scope to the element's ancestors — check if any ancestor context matches
      return element.matches?.(selector) ?? false;
    }
  } catch {
    // Ignore invalid selectors
  }
  return false;
}

/**
 * Get only the typography-relevant resolved properties for an element.
 * Filters to just the properties extractTypography cares about.
 */
export function resolveTypographyProps(element: Element, map: SelectorMap): StyleProps {
  const all = resolveStyles(element, map);
  const TYPO_PROPS = new Set([
    "color", "font-size", "font-family", "font-weight", "font-style",
    "text-decoration", "line-height", "letter-spacing", "text-align",
    "text-transform",
  ]);
  const result: StyleProps = {};
  for (const [k, v] of Object.entries(all)) {
    if (TYPO_PROPS.has(k)) result[k] = v;
  }
  return result;
}

/**
 * Get only the spacing-relevant resolved properties.
 */
export function resolveSpacingProps(element: Element, map: SelectorMap): StyleProps {
  const all = resolveStyles(element, map);
  const SPACING_PROPS = new Set([
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  ]);
  const result: StyleProps = {};
  for (const [k, v] of Object.entries(all)) {
    if (SPACING_PROPS.has(k)) result[k] = v;
  }
  return result;
}

/**
 * Get background-related resolved properties.
 */
export function resolveBackgroundProps(element: Element, map: SelectorMap): StyleProps {
  const all = resolveStyles(element, map);
  const BG_PROPS = new Set([
    "background", "background-color", "background-image",
    "background-size", "background-position", "background-repeat",
  ]);
  const result: StyleProps = {};
  for (const [k, v] of Object.entries(all)) {
    if (BG_PROPS.has(k)) result[k] = v;
  }
  return result;
}
