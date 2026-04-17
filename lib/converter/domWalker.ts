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
  const DECORATIVE_CLASS = /\bemoji\b|\bpill-wrapper\b|\bcenter-card\b|\bposition-absolute\b/;
  const children = Array.from(el.children);
  if (children.length < 2) return false;
  const decorativeCount = children.filter((c) => {
    const cls = (c as HTMLElement).className ?? "";
    const style = c.getAttribute("style") ?? "";
    return (
      DECORATIVE_CLASS.test(cls) ||
      style.includes("position: absolute") ||
      style.includes("position:absolute")
    );
  }).length;
  return decorativeCount / children.length > 0.4;
}

// ── Public entry point ────────────────────────────────────────────────────────

export function walkSections(
  sections: ParsedSection[],
  uploadedFiles: UploadedFile[]
): WalkerResult {
  const resultSections: ElementorNode[] = [];
  const widgetMap: WidgetMapItem[] = [];

  for (const section of sections) {
    // Option 1: preserve original Bootstrap HTML as-is inside a single html widget.
    // This avoids Elementor remapping Bootstrap grid classes to its own grid system.
    const htmlWidget = buildHtmlWidget(section.html);
    const sectionSettings: Record<string, unknown> = {
      layout: "full_width",
      gap: "default",
      custom_id: section.id,
    };

    const elSection = buildElementorSection(section.id, [htmlWidget], sectionSettings);
    const mapItem: WidgetMapItem = {
      sectionId: section.id,
      sectionLabel: section.id,
      widgets: [{ type: "HTML", label: section.id, tag: "div", isComplex: true }],
    };

    resultSections.push(elSection);
    widgetMap.push(mapItem);
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
    const widget = mapElement(child, uploadedFiles, depth);
    if (widget) widgets.push(widget);
  }
  return widgets;
}

// ── mapElement ────────────────────────────────────────────────────────────────

function mapElement(
  element: Element,
  uploadedFiles: UploadedFile[],
  depth: number
): ElementorWidget | null {
  const tag = element.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return null;

  // Skip truly empty elements (no text, no children, no src)
  const hasText = (element.textContent?.trim().length ?? 0) > 0;
  const hasChildren = element.children.length > 0;
  const hasSrc = element.hasAttribute("src");
  if (!hasText && !hasChildren && !hasSrc) return null;

  // ── Must-preserve as HTML (JS-dependent or absolute-positioned decorative) ──
  if (isAtomicBlock(element) || isDecorativeSection(element)) {
    return buildHtmlWidget((element as HTMLElement).outerHTML);
  }

  // ── Spacer (empty height div) ─────────────────────────────────────────────
  if (isSpacer(element)) {
    const style = parseStyle(element.getAttribute("style") ?? "");
    const h = style["height"] ?? "50px";
    const m = h.match(/^([\d.]+)/);
    return buildSpacerWidget(m ? Math.round(parseFloat(m[1])) : 50);
  }

  // ── Native widget priority detection ──────────────────────────────────────
  // These always win, even if the element has custom classes or inline styles.
  // Style extraction is now handled INSIDE each widget builder.

  if (isHeading(element)) return buildHeadingWidget(element);
  if (isImage(element))   return buildImageWidget(element, uploadedFiles);
  if (isVideo(element))   return buildVideoWidget(element);
  if (isDivider(element)) return buildDividerWidget(element);
  if (isIconBox(element)) return buildIconBoxWidget(element);
  if (isButton(element))  return buildButtonWidget(element);
  if (isTextElement(element)) return buildTextWidget(element);

  // ── Transparent wrapper — drill through ──────────────────────────────────
  if (isTransparentWrapper(element)) {
    const drilled = drillToContent(element);
    const layout = detectColumns(drilled);
    if (layout.isMultiColumn) {
      return buildInnerSection(layout.columns, uploadedFiles) as unknown as ElementorWidget;
    }
    const childWidgets = walkChildren(drilled, uploadedFiles, depth);
    if (childWidgets.length === 0) return null;
    if (childWidgets.length === 1) return childWidgets[0];
    if (depth === 0) return null;
    // Wrap multi-widget wrapper content in an HTML widget only as last resort
    return buildHtmlWidget((element as HTMLElement).outerHTML);
  }

  // ── Column layout detection ───────────────────────────────────────────────
  const layout = detectColumns(element);
  if (layout.isMultiColumn) {
    return buildInnerSection(layout.columns, uploadedFiles) as unknown as ElementorWidget;
  }

  // ── Recursive walk — try to extract native widgets from children ──────────
  const childWidgets = walkChildren(element, uploadedFiles, depth + 1);

  if (childWidgets.length === 0) {
    const text = element.textContent?.trim() ?? "";
    if (text.length > 0) return buildHtmlWidget((element as HTMLElement).outerHTML);
    return null;
  }

  if (childWidgets.length === 1) return childWidgets[0];

  // Multiple widgets found inside — emit them individually (caller handles flattening).
  // At depth 0 the caller loop takes care of it; deeper we need a container.
  if (depth === 0) return null; // signals walkChildren to loop over children directly
  return buildHtmlWidget((element as HTMLElement).outerHTML);
}

// ── buildInnerSection ─────────────────────────────────────────────────────────

function buildInnerSection(
  columnEls: Element[],
  uploadedFiles: UploadedFile[]
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
    let widgets = walkChildren(effectiveCol, uploadedFiles, 1);

    // If children returned nothing useful, try the column element itself as a widget
    if (widgets.length === 0) {
      const w = mapElement(col, uploadedFiles, 1);
      if (w) widgets = [w];
    }

    if (widgets.length === 0) {
      const text = col.textContent?.trim() ?? "";
      if (text.length > 0) {
        widgets = [buildHtmlWidget((col as HTMLElement).outerHTML)];
      }
    }

    // Extract column background if any
    const colBg = extractBgColor(col);
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
