/**
 * cssParser.ts
 *
 * Parses raw CSS text into a SelectorMap:
 *   selector → property → value
 *
 * Handles:
 *   - Type selectors:        h1, p, a
 *   - Class selectors:       .section-title, .btn-primary
 *   - Multi-class:           .card.featured
 *   - Descendant/child:      .hero h2, .card > p   (stored, matched by resolver)
 *   - Comma groups:          h1, h2, h3 { ... }
 *   - CSS custom properties: --color-primary (stored, resolved on lookup)
 *   - @media blocks:         parsed but rules stored without breakpoint (desktop-first)
 *
 * Does NOT handle: pseudo-elements, :hover/:focus, @keyframes, calc().
 */

export type StyleProps = Record<string, string>;
export type SelectorMap = Map<string, StyleProps>;

const SKIP_AT_RULES = /^@(keyframes|font-face|charset|import|namespace)/i;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function parseDeclarations(block: string): StyleProps {
  const props: StyleProps = {};
  for (const decl of block.split(";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const val = decl.slice(colon + 1).trim();
    if (prop && val) props[prop] = val;
  }
  return props;
}

function mergeInto(target: StyleProps, source: StyleProps): void {
  for (const [k, v] of Object.entries(source)) {
    target[k] = v;
  }
}

export function parseCss(css: string): SelectorMap {
  const map: SelectorMap = new Map();
  const cleaned = stripComments(css);

  // Tokenise into top-level blocks. We walk char-by-char tracking brace depth
  // so nested @media rules are handled correctly.
  const blocks: Array<{ selector: string; body: string }> = [];
  let depth = 0;
  let start = 0;
  let selectorStart = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (inString) {
      if (ch === stringChar && cleaned[i - 1] !== "\\") inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }

    if (ch === "{") {
      if (depth === 0) {
        const selector = cleaned.slice(selectorStart, i).trim();
        start = i + 1;
        blocks.push({ selector, body: "" });
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const last = blocks[blocks.length - 1];
        if (last) last.body = cleaned.slice(start, i);
        selectorStart = i + 1;
      }
    }
  }

  for (const { selector, body } of blocks) {
    // Skip @keyframes, @font-face etc.
    if (SKIP_AT_RULES.test(selector)) continue;

    // @media block — recurse into body, apply rules collected inside
    if (/^@media/i.test(selector)) {
      const inner = parseCss(body);
      for (const [sel, props] of inner) {
        const existing = map.get(sel);
        if (existing) mergeInto(existing, props);
        else map.set(sel, { ...props });
      }
      continue;
    }

    const props = parseDeclarations(body);
    if (Object.keys(props).length === 0) continue;

    // Comma-separated selector groups: "h1, h2, .title" → each gets the rules
    const parts = selector.split(",").map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const existing = map.get(part);
      if (existing) mergeInto(existing, props);
      else map.set(part, { ...props });
    }
  }

  return map;
}

/**
 * Merge multiple CSS strings into one SelectorMap.
 * Later files win on property conflicts (mimics stylesheet cascade order).
 */
export function buildSelectorMap(cssTexts: string[]): SelectorMap {
  const merged: SelectorMap = new Map();
  for (const text of cssTexts) {
    const map = parseCss(text);
    for (const [sel, props] of map) {
      const existing = merged.get(sel);
      if (existing) mergeInto(existing, props);
      else merged.set(sel, { ...props });
    }
  }
  return merged;
}
