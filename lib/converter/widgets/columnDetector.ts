export interface ColumnLayout {
  isMultiColumn: boolean;
  columns: Element[];
  columnCount: number;
}

export function detectColumns(element: Element): ColumnLayout {
  const cls = element.getAttribute("class") ?? "";
  const inlineStyle = element.getAttribute("style") ?? "";
  const children = Array.from(element.children);

  const ROW_KEYWORDS = ["row", "grid", "flex", "columns", "d-flex", "container"];
  const isRowContainer =
    ROW_KEYWORDS.some((kw) => cls.includes(kw)) ||
    inlineStyle.includes("display: flex") ||
    inlineStyle.includes("display:flex") ||
    inlineStyle.includes("display: grid") ||
    inlineStyle.includes("display:grid");

  if (isRowContainer && children.length >= 2) {
    const COL_KEYWORDS = ["col", "column", "cell", "item", "card"];
    const columnChildren = children.filter((child) => {
      const childCls = child.getAttribute("class") ?? "";
      return (
        COL_KEYWORDS.some((kw) => childCls.includes(kw)) ||
        children.length <= 6
      );
    });

    if (columnChildren.length >= 2) {
      return {
        isMultiColumn: true,
        columns: columnChildren,
        columnCount: columnChildren.length,
      };
    }
  }

  return { isMultiColumn: false, columns: [], columnCount: 0 };
}
