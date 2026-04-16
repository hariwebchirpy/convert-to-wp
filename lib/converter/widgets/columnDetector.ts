export interface ColumnLayout {
  isMultiColumn: boolean;
  columns: Element[];
  columnCount: number;
}

// Bootstrap col class: col, col-md-6, col-lg-4, col-6, etc.
const BOOTSTRAP_COL_RE = /\bcol(-[a-z]{2})?(-\d+)?\b/;

export function detectColumns(element: Element): ColumnLayout {
  const cls = element.getAttribute("class") ?? "";
  const inlineStyle = element.getAttribute("style") ?? "";
  const children = Array.from(element.children);

  // Row containers: Bootstrap .row, flex/grid containers
  const ROW_KEYWORDS = ["row", "grid", "columns", "d-flex", "flex-row"];
  const isRowContainer =
    ROW_KEYWORDS.some((kw) => cls.split(/\s+/).includes(kw)) ||
    inlineStyle.includes("display: flex") ||
    inlineStyle.includes("display:flex") ||
    inlineStyle.includes("display: grid") ||
    inlineStyle.includes("display:grid");

  if (!isRowContainer || children.length < 2) {
    return { isMultiColumn: false, columns: [], columnCount: 0 };
  }

  // Identify column children
  const COL_KEYWORDS = ["column", "cell", "item", "card"];
  const columnChildren = children.filter((child) => {
    const childCls = child.getAttribute("class") ?? "";
    return (
      BOOTSTRAP_COL_RE.test(childCls) ||
      COL_KEYWORDS.some((kw) => childCls.includes(kw))
    );
  });

  // If no explicitly-marked columns, treat all children as columns
  // (for flex containers where children are implicit columns)
  const effectiveCols = columnChildren.length >= 2 ? columnChildren : children;

  // Cap at 6 columns — more than that is usually a list/carousel, not a layout
  if (effectiveCols.length >= 2 && effectiveCols.length <= 6) {
    return {
      isMultiColumn: true,
      columns: effectiveCols,
      columnCount: effectiveCols.length,
    };
  }

  return { isMultiColumn: false, columns: [], columnCount: 0 };
}
