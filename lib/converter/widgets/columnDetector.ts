import { SelectorMap } from "../cssParser";

export interface ColumnLayout {
  isMultiColumn: boolean;
  columns: Element[];
  columnCount: number;
}

// Bootstrap col class: col, col-md-6, col-lg-4, col-6, etc.
const BOOTSTRAP_COL_RE = /\bcol(-[a-z]{2})?(-\d+)?\b/;

// Classes that signal a horizontal row/flex/grid container
const ROW_CLASS_KEYWORDS = [
  "row", "d-flex", "flex-row", "flex-wrap",
  "grid", "columns", "cards", "items", "features",
  "services", "team", "gallery", "portfolio",
];

// Classes that explicitly signal vertical stacking — NOT columns
const VERTICAL_CLASS_KEYWORDS = ["flex-column", "flex-col", "stack", "vertical"];

// CSS property helpers
function parseInlineStyle(style: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim().toLowerCase();
    if (prop && val) map[prop] = val;
  }
  return map;
}

function getEffectiveStyle(
  element: Element,
  selectorMap: SelectorMap
): Record<string, string> {
  const inline = parseInlineStyle(element.getAttribute("style") ?? "");
  if (selectorMap.size === 0) return inline;

  const resolved: Record<string, string> = {};
  const tag = element.tagName.toLowerCase();
  const classes = (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

  // Tag selector
  const tagProps = selectorMap.get(tag);
  if (tagProps) Object.assign(resolved, tagProps);

  // Class selectors (in order, last wins)
  for (const cls of classes) {
    const clsProps = selectorMap.get(`.${cls}`);
    if (clsProps) Object.assign(resolved, clsProps);
  }

  // Multi-class combinations
  if (classes.length > 1) {
    for (const [sel, props] of selectorMap) {
      if (!sel.startsWith(".")) continue;
      const parts = sel.match(/\.[\w-]+/g);
      if (!parts || parts.length < 2) continue;
      if (parts.map((p) => p.slice(1)).every((c) => classes.includes(c))) {
        Object.assign(resolved, props);
      }
    }
  }

  // Inline always wins
  return { ...resolved, ...inline };
}

/**
 * Parse grid-template-columns to get column count.
 * Handles: repeat(3, 1fr), 1fr 1fr 1fr, 200px auto 1fr, etc.
 */
function parseGridColumnCount(gridTemplateColumns: string): number {
  const val = gridTemplateColumns.trim();

  // repeat(N, ...) or repeat(auto-fill/auto-fit, minmax(...))
  const repeatMatch = val.match(/^repeat\(\s*(\d+)\s*,/);
  if (repeatMatch) return parseInt(repeatMatch[1], 10);

  // auto-fill / auto-fit — treat as unknown, fall back to child count
  if (/repeat\(\s*auto-(fill|fit)/.test(val)) return 0;

  // Count space-separated track definitions (not inside parens)
  // e.g. "1fr 1fr 1fr" → 3, "200px auto 1fr" → 3
  let depth = 0;
  let count = 0;
  let inToken = false;
  for (let i = 0; i < val.length; i++) {
    const ch = val[i];
    if (ch === "(") { depth++; continue; }
    if (ch === ")") { depth--; continue; }
    if (depth > 0) continue;
    const isSpace = ch === " " || ch === "\t";
    if (!isSpace && !inToken) { count++; inToken = true; }
    if (isSpace) inToken = false;
  }
  return count;
}

/**
 * Detect whether an element is a horizontal multi-column layout.
 *
 * Sources checked (in priority order):
 *   1. CSS class keywords (Bootstrap row, d-flex, grid, etc.)
 *   2. Inline style display/flex-direction/grid-template-columns
 *   3. Resolved stylesheet styles (via SelectorMap)
 *   4. Children with Bootstrap col-* classes
 *   5. Children with flex/grid child signals (flex-fill, flex-grow, etc.)
 */
export function detectColumns(
  element: Element,
  selectorMap: SelectorMap = new Map()
): ColumnLayout {
  const cls = element.getAttribute("class") ?? "";
  const classes = cls.split(/\s+/).filter(Boolean);
  const children = Array.from(element.children);

  if (children.length < 2) {
    return { isMultiColumn: false, columns: [], columnCount: 0 };
  }

  // ── 1. Reject vertical-stacking containers immediately ────────────────────
  if (VERTICAL_CLASS_KEYWORDS.some((kw) => classes.includes(kw))) {
    return { isMultiColumn: false, columns: [], columnCount: 0 };
  }

  // ── 2. Resolve effective display + flex/grid properties ──────────────────
  const style = getEffectiveStyle(element, selectorMap);
  const display = style["display"] ?? "";
  const flexDir = style["flex-direction"] ?? style["flex-flow"] ?? "";
  const gridTemplate = style["grid-template-columns"] ?? style["grid-template"] ?? "";

  // flex-direction: column means vertical stacking — bail out
  if (display === "flex" && (flexDir.startsWith("column") || flexDir === "column-reverse")) {
    return { isMultiColumn: false, columns: [], columnCount: 0 };
  }

  // Exclude absolutely-positioned children — they're overlays/badges, not layout columns
  const positionedChildren = children.filter((c) => {
    const cs = getEffectiveStyle(c, selectorMap);
    const inlinePos = parseInlineStyle(c.getAttribute("style") ?? "")["position"] ?? "";
    const resolvedPos = cs["position"] ?? "";
    return resolvedPos === "absolute" || resolvedPos === "fixed" || inlinePos === "absolute" || inlinePos === "fixed";
  });
  // If more than half the children are absolutely positioned, this is a stacking
  // context (e.g. hero-pod-circle with floating badges), not a column layout
  if (positionedChildren.length > 0 && positionedChildren.length >= children.length / 2) {
    return { isMultiColumn: false, columns: [], columnCount: 0 };
  }

  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid" || display === "inline-grid";

  // ── 3. Bootstrap row / known row class keywords ───────────────────────────
  const isRowClass = ROW_CLASS_KEYWORDS.some((kw) => classes.includes(kw));

  // ── 4. Bootstrap col-* children ──────────────────────────────────────────
  const bootstrapColChildren = children.filter((c) =>
    BOOTSTRAP_COL_RE.test(c.getAttribute("class") ?? "")
  );
  const hasBootstrapCols = bootstrapColChildren.length >= 2;

  // ── 5. Flex child signals ─────────────────────────────────────────────────
  const FLEX_CHILD_CLASSES = ["flex-fill", "flex-grow-1", "flex-1", "col", "cell", "item", "card", "box"];
  const flexChildCount = children.filter((c) => {
    const cc = c.getAttribute("class") ?? "";
    const cs = getEffectiveStyle(c, selectorMap);
    // flex: <number> (e.g. "1", "1.1", "2") — any numeric flex-grow value
    const flexVal = cs["flex"] ?? "";
    const flexGrow = cs["flex-grow"] ?? "";
    const hasNumericFlex = /^[\d.]+(\s|$)/.test(flexVal) || /^[\d.]+$/.test(flexGrow);
    return (
      FLEX_CHILD_CLASSES.some((kw) => cc.includes(kw)) ||
      hasNumericFlex
    );
  }).length;
  const hasFlexChildren = flexChildCount >= 2;

  // ── Decide if this is a row container ────────────────────────────────────
  const isRowContainer = isFlex || isGrid || isRowClass || hasBootstrapCols;

  if (!isRowContainer) {
    return { isMultiColumn: false, columns: [], columnCount: 0 };
  }

  // ── Identify the column elements ──────────────────────────────────────────
  let effectiveCols: Element[];

  if (hasBootstrapCols) {
    effectiveCols = bootstrapColChildren;
  } else if (hasFlexChildren) {
    effectiveCols = children.filter((c) => {
      const cc = c.getAttribute("class") ?? "";
      const cs = getEffectiveStyle(c, selectorMap);
      const flexVal = cs["flex"] ?? "";
      const flexGrow = cs["flex-grow"] ?? "";
      const hasNumericFlex = /^[\d.]+(\s|$)/.test(flexVal) || /^[\d.]+$/.test(flexGrow);
      return (
        FLEX_CHILD_CLASSES.some((kw) => cc.includes(kw)) ||
        hasNumericFlex
      );
    });
  } else {
    // For grid / flex containers where children have no special class,
    // treat all direct children as columns
    effectiveCols = children;
  }

  // For CSS grid, try to use grid-template-columns to get the authoritative count
  if (isGrid && gridTemplate) {
    const gridCount = parseGridColumnCount(gridTemplate);
    if (gridCount >= 2 && gridCount <= 6) {
      // When the grid has more children than one row (e.g. a 2-col grid with 6 cards),
      // we still return ALL children so the caller can lay them out in repeated rows.
      // Only clamp to the first row if there are too many children (> 6) to map 1:1.
      const candidates = effectiveCols.length > 6 ? effectiveCols.slice(0, gridCount) : effectiveCols;
      if (candidates.length >= 2) {
        return { isMultiColumn: true, columns: candidates, columnCount: gridCount };
      }
    }
  }

  // Cap at 6 — more than that is usually a carousel/list, not a layout grid
  if (effectiveCols.length < 2 || effectiveCols.length > 6) {
    return { isMultiColumn: false, columns: [], columnCount: 0 };
  }

  return {
    isMultiColumn: true,
    columns: effectiveCols,
    columnCount: effectiveCols.length,
  };
}
