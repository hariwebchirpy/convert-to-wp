import { buildHtmlWidget } from "./widgets/htmlWidget";
import { buildHeadingWidget, isHeading } from "./widgets/headingWidget";
import { buildTextWidget, isTextElement } from "./widgets/textWidget";
import { buildImageWidget, isImage } from "./widgets/imageWidget";
import { buildButtonWidget, isButton } from "./widgets/buttonWidget";
import { buildVideoWidget, isVideo } from "./widgets/videoWidget";
import { buildDividerWidget, isDivider } from "./widgets/dividerWidget";
import { buildIconBoxWidget, isIconBox } from "./widgets/iconBoxWidget";
import { buildSpacerWidget, isSpacer } from "./widgets/spacerWidget";
import { detectColumns } from "./widgets/columnDetector";
import { parseStyle, extractBgColor } from "./widgets/styleParser";
import { SelectorMap } from "./cssParser";
import { resolveStyles, resolveBackgroundProps } from "./styleResolver";

import {
  ElementorWidget,
  ElementorColumn,
  ElementorSection,
  ElementorInnerSection,
  ElementorNode,
  WidgetMapItem,
  WidgetMapNode,
  UploadedFile,
  ParsedSection,
  ConversionMode,
  randomId,
} from "@/types/converter";

// ── Public types ──────────────────────────────────────────────────────────────

export interface WalkerResult {
  sections: ElementorNode[];
  widgetMap: WidgetMapItem[];
}

// ── Transparent wrapper patterns ──────────────────────────────────────────────

const WRAPPER_CLASS_PATTERNS = [
  /\bcontainer(-fluid)?\b/,
  /\brow\b/,
  /\bcol(-[a-z]{2})?(-\d+)?\b/,
  /\bwrap(per)?\b/,
  /\binner\b/,
];

function isTransparentWrapper(el: Element): boolean {
  const cls = el.className ?? "";
  return WRAPPER_CLASS_PATTERNS.some((re) => re.test(cls));
}

// Tags we never want to emit as widgets
const SKIP_TAGS = new Set(["script", "style", "link", "meta", "noscript", "br", "hr"]);

// Elements with fixed or sticky positioning are UI chrome (sticky bars, floating
// buttons, overlays) — they should never become Elementor content widgets.
function isFixedOrSticky(el: Element): boolean {
  const inline = el.getAttribute("style") ?? "";
  if (/position\s*:\s*(fixed|sticky)/i.test(inline)) return true;
  const cls = (el as HTMLElement).className ?? "";
  // Common class names for fixed bars / floating elements
  return /\b(sticky[-_]?(?:bar|atc|cta|header|footer|nav)|wa[-_]?float|whatsapp[-_]?float|fixed[-_]?(bar|btn|cta)|float[-_]?(btn|cta|wa))\b/i.test(cls);
}

// ── Atomic block detection ────────────────────────────────────────────────────
// Elements that MUST be preserved as a single HTML widget because they rely on
// JavaScript initialization (carousels, sliders) or absolute-positioned layouts.

const ATOMIC_CLASS_PATTERNS = [
  /\bowl-carousel\b/,
  /\bslick-slider\b/,
  /\bswiper\b/,
  /\bcarousel\b/,
  /\bslider\b/,
  /\bmarquee\b/,
  /\bantigravity\b/,
  /\btraveler-section\b/,
  /\bpill-wrapper\b/,
  /\bticker[-_]?(wrap|inner|bar|strip)\b/,
  /\bscroll[-_]?(ticker|marquee|banner)\b/,
];

const ATOMIC_ID_PATTERNS = [/^owl-/];

function isAtomicBlock(el: Element): boolean {
  const cls = (el as HTMLElement).className ?? "";
  const id = el.id ?? "";
  return (
    ATOMIC_CLASS_PATTERNS.some((re) => re.test(cls)) ||
    ATOMIC_ID_PATTERNS.some((re) => re.test(id))
  );
}

function isDecorativeSection(el: Element): boolean {
  const DECORATIVE_CLASS = /\bemoji\b|\bpill-wrapper\b|\bcenter-card\b/;
  const children = Array.from(el.children);
  // Need at least 3 children to safely infer a purely decorative layout
  if (children.length < 3) return false;
  const decorativeCount = children.filter((c) => {
    const cls = (c as HTMLElement).className ?? "";
    const style = c.getAttribute("style") ?? "";
    return (
      DECORATIVE_CLASS.test(cls) ||
      style.includes("position: absolute") ||
      style.includes("position:absolute")
    );
  }).length;
  // Require >60% decorative children (was 40% — too aggressive on sections with 2 ring divs)
  return decorativeCount / children.length > 0.6;
}

// ── Section-level settings extraction ────────────────────────────────────────

function extractSectionSettings(el: Element, resolvedStyles: Record<string, string> = {}): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  const inline = parseStyle(el.getAttribute("style") ?? "");
  const style = { ...resolvedStyles, ...inline };

  // Background colour
  const bgColor = extractBgColor(el);
  if (bgColor) {
    settings["background_background"] = "classic";
    settings["background_color"] = bgColor;
  }

  // Background image: background-image: url("...")
  const bgImage = style["background-image"];
  if (bgImage) {
    const urlMatch = bgImage.match(/url\(['"]?([^'")\s]+)['"]?\)/);
    if (urlMatch) {
      settings["background_background"] = "classic";
      settings["background_image"] = { url: `__WP_IMG__${urlMatch[1].split("/").pop()}`, id: "" };
      const bgSize = style["background-size"];
      const bgPos = style["background-position"];
      if (bgSize) settings["background_size"] = bgSize === "cover" ? "cover" : bgSize === "contain" ? "contain" : "auto";
      if (bgPos) settings["background_position"] = bgPos;
    }
  }

  // Padding
  const padding = style["padding"];
  const paddingTop = style["padding-top"];
  const paddingBottom = style["padding-bottom"];
  if (padding || paddingTop || paddingBottom) {
    const parsePx = (v: string) => { const m = v?.match(/^([\d.]+)/); return m ? String(Math.round(parseFloat(m[1]))) : "0"; };
    if (padding) {
      const parts = padding.trim().split(/\s+/);
      const [t = "0", r = t, b = t, l = r] = parts.map(parsePx);
      settings["padding"] = { top: t, right: r, bottom: b, left: l, unit: "px", isLinked: t === r && r === b && b === l };
    } else {
      settings["padding"] = {
        top: paddingTop ? parsePx(paddingTop) : "0",
        right: "0",
        bottom: paddingBottom ? parsePx(paddingBottom) : "0",
        left: "0",
        unit: "px",
        isLinked: false,
      };
    }
  }

  return settings;
}

// ── Public entry point ────────────────────────────────────────────────────────

export function walkSections(
  sections: ParsedSection[],
  uploadedFiles: UploadedFile[],
  mode: ConversionMode = "php-theme",
  selectorMap: SelectorMap = new Map()
): WalkerResult {
  if (mode === "php-theme") {
    return walkSectionsAsHtml(sections);
  }
  return walkSectionsAsWidgets(sections, uploadedFiles, selectorMap);
}

function walkSectionsAsHtml(sections: ParsedSection[]): WalkerResult {
  const resultSections: ElementorNode[] = [];
  const widgetMap: WidgetMapItem[] = [];

  for (const section of sections) {
    const htmlWidget = buildHtmlWidget(section.html);
    const elSection = buildElementorSection(section.id, [htmlWidget], {
      layout: "full_width",
      gap: "default",
      custom_id: section.id,
    });
    resultSections.push(elSection);
    widgetMap.push({
      sectionId: section.id,
      sectionLabel: section.id,
      widgets: [{ type: "HTML", label: section.id, tag: "div", isComplex: true }],
    });
  }

  return { sections: resultSections, widgetMap };
}

function walkSectionsAsWidgets(
  sections: ParsedSection[],
  uploadedFiles: UploadedFile[],
  selectorMap: SelectorMap
): WalkerResult {
  const resultSections: ElementorNode[] = [];
  const widgetMap: WidgetMapItem[] = [];

  for (const section of sections) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${section.html}</div>`, "text/html");
    const root = doc.body.firstElementChild!;

    // Skip fixed/sticky sections entirely (sticky ATC bars, floating WA buttons, etc.)
    if (isFixedOrSticky(root.firstElementChild ?? root)) continue;

    // Resolve section-level background from stylesheet
    const bgResolved = resolveBackgroundProps(root, selectorMap);
    const sectionSettings = extractSectionSettings(root, bgResolved);
    sectionSettings["layout"] = "full_width";
    sectionSettings["gap"] = "default";
    sectionSettings["custom_id"] = section.id;

    // Drill through the root to find actual content
    const content = drillToContent(root);
    const layout = detectColumns(content, selectorMap);

    let widgets: ElementorWidget[];
    if (layout.isMultiColumn) {
      // When a CSS grid has more children than one row (e.g. 6 feat-cards in a 2-col grid),
      // split into multiple innerSection rows of `columnCount` columns each.
      const colCount = layout.columnCount || layout.columns.length;
      if (colCount >= 2 && layout.columns.length > colCount) {
        const rows: ElementorWidget[] = [];
        for (let i = 0; i < layout.columns.length; i += colCount) {
          const rowCols = layout.columns.slice(i, i + colCount);
          if (rowCols.length > 0) {
            rows.push(buildInnerSection(rowCols, uploadedFiles, selectorMap) as unknown as ElementorWidget);
          }
        }
        widgets = rows;
      } else {
        widgets = [buildInnerSection(layout.columns, uploadedFiles, selectorMap) as unknown as ElementorWidget];
      }
    } else {
      widgets = walkChildren(content, uploadedFiles, selectorMap, 0);
      if (widgets.length === 0) {
        widgets = [buildHtmlWidget(section.html)];
      }
    }

    const elSection = buildElementorSection(section.id, widgets, sectionSettings);
    resultSections.push(elSection);
    widgetMap.push(buildWidgetMapItem(section, widgets));
  }

  return { sections: resultSections, widgetMap };
}

// Drill past transparent wrapper layers to reach real content
function drillToContent(el: Element): Element {
  let current = el;
  for (let i = 0; i < 4; i++) {
    const children = Array.from(current.children).filter(
      (c) => !SKIP_TAGS.has(c.tagName.toLowerCase())
    );
    if (children.length === 1 && isTransparentWrapper(children[0])) {
      current = children[0];
      continue;
    }
    if (children.length > 0 && children.every((c) => isTransparentWrapper(c))) {
      break;
    }
    break;
  }
  return current;
}

// ── walkChildren ──────────────────────────────────────────────────────────────

const MAX_DEPTH = 8;

function walkChildren(
  element: Element,
  uploadedFiles: UploadedFile[],
  selectorMap: SelectorMap,
  depth: number
): ElementorWidget[] {
  if (depth > MAX_DEPTH) {
    const text = element.textContent?.trim() ?? "";
    if (text) return [buildHtmlWidget((element as HTMLElement).outerHTML)];
    return [];
  }

  const children = Array.from(element.children).filter(
    (c) => !SKIP_TAGS.has(c.tagName.toLowerCase())
  );

  if (children.length === 0) {
    const text = element.textContent?.trim() ?? "";
    if (text) return [buildHtmlWidget((element as HTMLElement).outerHTML)];
    return [];
  }

  const widgets: ElementorWidget[] = [];
  for (const child of children) {
    const widget = mapElement(child, uploadedFiles, selectorMap, depth);
    if (widget) widgets.push(widget);
  }
  return widgets;
}

// ── mapElement ────────────────────────────────────────────────────────────────

function mapElement(
  element: Element,
  uploadedFiles: UploadedFile[],
  selectorMap: SelectorMap,
  depth: number
): ElementorWidget | null {
  const tag = element.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return null;

  // Skip truly empty elements (no text, no children, no src)
  const hasText = (element.textContent?.trim().length ?? 0) > 0;
  const hasChildren = element.children.length > 0;
  const hasSrc = element.hasAttribute("src");
  if (!hasText && !hasChildren && !hasSrc) return null;

  // ── Fixed/sticky UI chrome — never a content widget ─────────────────────
  if (isFixedOrSticky(element)) return null;

  // ── Must-preserve as HTML (JS-dependent or absolute-positioned decorative) ──
  if (isAtomicBlock(element) || isDecorativeSection(element)) {
    return buildHtmlWidget((element as HTMLElement).outerHTML);
  }

  // ── Spacer (empty height div) ─────────────────────────────────────────────
  if (isSpacer(element)) {
    const resolved = resolveStyles(element, selectorMap);
    const style = { ...resolved, ...parseStyle(element.getAttribute("style") ?? "") };
    const h = style["height"] ?? "50px";
    const m = h.match(/^([\d.]+)/);
    return buildSpacerWidget(m ? Math.round(parseFloat(m[1])) : 50);
  }

  // Resolve CSS styles from stylesheet for this element
  const resolvedStyles = resolveStyles(element, selectorMap);

  // ── Native widget priority detection ──────────────────────────────────────
  if (isHeading(element)) return buildHeadingWidget(element, resolvedStyles);
  if (isImage(element))   return buildImageWidget(element, uploadedFiles, resolvedStyles);
  if (isVideo(element))   return buildVideoWidget(element);
  if (isDivider(element)) return buildDividerWidget(element);
  if (isIconBox(element)) return buildIconBoxWidget(element, resolvedStyles);
  if (isButton(element))  return buildButtonWidget(element, resolvedStyles);
  if (isTextElement(element)) return buildTextWidget(element, resolvedStyles);

  // ── Transparent wrapper — drill through ──────────────────────────────────
  if (isTransparentWrapper(element)) {
    const drilled = drillToContent(element);
    const layout = detectColumns(drilled, selectorMap);
    if (layout.isMultiColumn) {
      return buildMultiColumnWidget(layout, drilled, uploadedFiles, selectorMap);
    }
    const childWidgets = walkChildren(drilled, uploadedFiles, selectorMap, depth);
    if (childWidgets.length === 0) return null;
    if (childWidgets.length === 1) return childWidgets[0];
    if (depth === 0) return null;
    return buildHtmlWidget((element as HTMLElement).outerHTML);
  }

  // ── Column layout detection ───────────────────────────────────────────────
  const layout = detectColumns(element, selectorMap);
  if (layout.isMultiColumn) {
    return buildMultiColumnWidget(layout, element, uploadedFiles, selectorMap);
  }

  // ── Recursive walk ────────────────────────────────────────────────────────
  const childWidgets = walkChildren(element, uploadedFiles, selectorMap, depth + 1);

  if (childWidgets.length === 0) {
    const text = element.textContent?.trim() ?? "";
    if (text.length > 0) return buildHtmlWidget((element as HTMLElement).outerHTML);
    return null;
  }

  if (childWidgets.length === 1) return childWidgets[0];

  // If all child widgets are HTML fallbacks (no native widgets were resolved),
  // collapse the whole element into a single HTML widget — this keeps small
  // compound elements like proof-item (num+label), stat-card, etc. intact.
  const allHtml = childWidgets.every((w) => w.widgetType === "html");
  if (allHtml) return buildHtmlWidget((element as HTMLElement).outerHTML);

  if (depth === 0) return null;
  return buildHtmlWidget((element as HTMLElement).outerHTML);
}

// ── buildMultiColumnWidget ────────────────────────────────────────────────────
// When a grid has more children than one row, wrap each row in its own innerSection
// and return a single html widget containing all rows. For a single row, returns
// the innerSection directly.

function buildMultiColumnWidget(
  layout: import("./widgets/columnDetector").ColumnLayout,
  _element: Element,
  uploadedFiles: UploadedFile[],
  selectorMap: SelectorMap
): ElementorWidget {
  const colCount = layout.columnCount || layout.columns.length;
  if (colCount >= 2 && layout.columns.length > colCount) {
    // Multi-row grid — build an innerSection per row and wrap in an html widget
    // that Elementor can render as stacked rows.
    const rows: ElementorInnerSection[] = [];
    for (let i = 0; i < layout.columns.length; i += colCount) {
      const rowCols = layout.columns.slice(i, i + colCount);
      if (rowCols.length > 0) {
        rows.push(buildInnerSection(rowCols, uploadedFiles, selectorMap));
      }
    }
    // If we got only one row after chunking, just return it directly
    if (rows.length === 1) return rows[0] as unknown as ElementorWidget;
    // Wrap multiple rows as a single html widget preserving original markup
    // (Elementor doesn't support nested section-in-column directly without Pro container)
    return buildHtmlWidget((_element as HTMLElement).outerHTML);
  }
  return buildInnerSection(layout.columns, uploadedFiles, selectorMap) as unknown as ElementorWidget;
}

// ── buildInnerSection ─────────────────────────────────────────────────────────

function buildInnerSection(
  columnEls: Element[],
  uploadedFiles: UploadedFile[],
  selectorMap: SelectorMap
): ElementorInnerSection {
  const count = columnEls.length;
  const baseSize = Math.floor(100 / count);
  const remainder = 100 - baseSize * count;

  const columns: ElementorColumn[] = columnEls.map((col, i) => {
    const size = i === count - 1 ? baseSize + remainder : baseSize;

    if (isAtomicBlock(col)) {
      return {
        id: randomId(),
        elType: "column",
        settings: { _column_size: size },
        elements: [buildHtmlWidget((col as HTMLElement).outerHTML)],
      };
    }

    const effectiveCol = drillToContent(col);

    // Try mapping the column element itself first — catches leaf widgets like
    // <button>, <img>, <h2>, <a> that have no element children for walkChildren
    // to iterate over. Without this, walkChildren sees no children and immediately
    // falls back to buildHtmlWidget, bypassing all native widget detectors.
    const directWidget = mapElement(effectiveCol, uploadedFiles, selectorMap, 1);
    let widgets: ElementorWidget[] = directWidget ? [directWidget] : [];

    // If the direct element isn't a leaf widget, walk its children instead
    if (widgets.length === 0 || (directWidget && directWidget.widgetType === "html")) {
      const childWidgets = walkChildren(effectiveCol, uploadedFiles, selectorMap, 1);
      if (childWidgets.length > 0) widgets = childWidgets;
    }

    if (widgets.length === 0) {
      const text = col.textContent?.trim() ?? "";
      if (text.length > 0) {
        widgets = [buildHtmlWidget((col as HTMLElement).outerHTML)];
      }
    }

    // Extract column background from inline + resolved stylesheet
    const resolvedCol = resolveBackgroundProps(col, selectorMap);
    const colBg = extractBgColor(col, resolvedCol);
    const colSettings: Record<string, unknown> = { _column_size: size };
    if (colBg) {
      colSettings["background_background"] = "classic";
      colSettings["background_color"] = colBg;
    }

    return {
      id: randomId(),
      elType: "column",
      settings: colSettings as { _column_size: number },
      elements: widgets,
    };
  });

  return {
    id: randomId(),
    elType: "section",
    isInner: true,
    settings: {
      layout: "full_width",
      gap: "default",
      is_inner: true,
    },
    elements: columns,
  };
}

// ── buildElementorSection ─────────────────────────────────────────────────────

function buildElementorSection(
  sectionId: string,
  widgets: ElementorWidget[],
  extraSettings: Record<string, unknown> = {}
): ElementorSection {
  return {
    id: randomId(),
    elType: "section",
    settings: {
      layout: "full_width",
      gap: "default",
      custom_id: sectionId,
      ...extraSettings,
    },
    elements: [
      {
        id: randomId(),
        elType: "column",
        settings: { _column_size: 100 },
        elements: widgets,
      },
    ],
  };
}

// ── buildWidgetMapItem ────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + "…" : str;
}

function widgetToMapNode(
  widget: ElementorWidget | ElementorInnerSection
): WidgetMapNode {
  if ("isInner" in widget && widget.isInner) {
    const inner = widget as ElementorInnerSection;
    const children: WidgetMapNode[] = inner.elements.flatMap((col, ci) =>
      col.elements.map((w) => ({ ...widgetToMapNode(w as ElementorWidget), columnIndex: ci }))
    );
    return {
      type: "Columns",
      label: `${inner.elements.length} columns`,
      tag: "div",
      isComplex: false,
      children,
    };
  }

  const w = widget as ElementorWidget;
  const s = w.settings;

  switch (w.widgetType) {
    case "heading":
      return {
        type: "Heading",
        label: truncate(stripHtml(String(s.title ?? "")), 40),
        tag: String(s.header_size ?? "h2"),
        isComplex: false,
      };
    case "text-editor":
      return {
        type: "Text Editor",
        label: truncate(stripHtml(String(s.editor ?? "")), 40),
        tag: "p",
        isComplex: false,
      };
    case "image": {
      const imgUrl = (s.image as { url?: string })?.url ?? "";
      return {
        type: "Image",
        label: imgUrl.split("/").pop() ?? "image",
        tag: "img",
        isComplex: false,
      };
    }
    case "button":
      return {
        type: "Button",
        label: truncate(String(s.text ?? ""), 40),
        tag: "a",
        isComplex: false,
      };
    case "video": {
      const videoLabel = String(
        s.youtube_url ?? s.vimeo_url ?? (s.external_url as { url?: string })?.url ?? "Video"
      );
      return {
        type: "Video",
        label: truncate(videoLabel, 40),
        tag: "video",
        isComplex: false,
      };
    }
    case "divider":
      return { type: "Divider", label: "---", tag: "hr", isComplex: false };
    case "spacer":
      return { type: "Spacer", label: `${(s.space as { size?: number })?.size ?? 50}px`, tag: "div", isComplex: false };
    case "icon-box":
      return {
        type: "Icon Box",
        label: truncate(String(s.title_text ?? ""), 40),
        tag: "div",
        isComplex: false,
      };
    case "html":
    default: {
      const htmlStr = String(s.html ?? "");
      let htmlLabel = truncate(stripHtml(htmlStr), 40);
      if (/owl-carousel|slick-slider|swiper/i.test(htmlStr)) htmlLabel = "Carousel (JS — preserved as HTML)";
      else if (/marquee|antigravity/i.test(htmlStr)) htmlLabel = "Marquee (JS — preserved as HTML)";
      else if (/traveler-section|pill-wrapper/i.test(htmlStr)) htmlLabel = "Decorative layout (preserved as HTML)";
      return {
        type: "HTML",
        label: htmlLabel,
        tag: "div",
        isComplex: true,
      };
    }
  }
}

function buildWidgetMapItem(
  section: ParsedSection,
  widgets: ElementorWidget[]
): WidgetMapItem {
  return {
    sectionId: section.id,
    sectionLabel: section.id,
    widgets: widgets.map((w) => widgetToMapNode(w as ElementorWidget | ElementorInnerSection)),
  };
}
