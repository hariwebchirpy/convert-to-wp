import { buildHtmlWidget } from "./widgets/htmlWidget";
import { buildHeadingWidget, isHeading } from "./widgets/headingWidget";
import { buildTextWidget, isTextElement } from "./widgets/textWidget";
import { buildImageWidget, isImage } from "./widgets/imageWidget";
import { buildButtonWidget, isButton } from "./widgets/buttonWidget";
import { buildVideoWidget, isVideo } from "./widgets/videoWidget";
import { buildDividerWidget, isDivider } from "./widgets/dividerWidget";
import { buildIconBoxWidget, isIconBox } from "./widgets/iconBoxWidget";
import { detectColumns } from "./widgets/columnDetector";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

// Bootstrap/layout wrapper class patterns — these are transparent containers,
// we recurse straight through them instead of treating them as content.
const WRAPPER_CLASS_PATTERNS = [
  /\bcontainer(-fluid)?\b/,
  /\brow\b/,
  /\bcol(-[a-z]{2})?(-\d+)?\b/,
  /\bwrap(per)?\b/,
  /\binner\b/,
  /\bbox\b/,
];

function isTransparentWrapper(el: Element): boolean {
  const cls = el.className ?? "";
  return WRAPPER_CLASS_PATTERNS.some((re) => re.test(cls));
}

// Tags we never want to emit as widgets
const SKIP_TAGS = new Set(["script", "style", "link", "meta", "noscript", "br", "hr"]);

// ── Atomic block detection ────────────────────────────────────────────────────
// Elements that should be emitted as a single HTML widget rather than recursed into.
// Carousels, sliders, absolute-positioned decorative layouts, marquees etc.

const ATOMIC_CLASS_PATTERNS = [
  /\bowl-carousel\b/,       // Owl Carousel
  /\bslick-slider\b/,       // Slick Slider
  /\bswiper\b/,             // Swiper
  /\bcarousel\b/,           // Bootstrap Carousel / generic
  /\bslider\b/,             // generic slider
  /\bmarquee\b/,            // marquee / ticker
  /\bantigravity\b/,        // wave / antigravity list
  /\btraveler-section\b/,   // radial pill layout in Tripsil
  /\bpill-wrapper\b/,       // individual pills (position:absolute)
];

const ATOMIC_ID_PATTERNS = [
  /^owl-/,                  // id="owl-features", id="owl-plan" etc.
];

function isAtomicBlock(el: Element): boolean {
  const cls = (el as HTMLElement).className ?? "";
  const id  = el.id ?? "";
  return (
    ATOMIC_CLASS_PATTERNS.some((re) => re.test(cls)) ||
    ATOMIC_ID_PATTERNS.some((re) => re.test(id))
  );
}

// A section whose children are mostly position:absolute (decorative layout).
// If > 50% of block children have position:absolute in their inline style or
// a class that implies it (emoji, pill-wrapper, center-card), treat the whole
// thing as atomic.
function isDecorativeSection(el: Element): boolean {
  const DECORATIVE_CLASS = /\bemoji\b|\bpill-wrapper\b|\bcenter-card\b|\bposition-absolute\b/;
  const children = Array.from(el.children);
  if (children.length < 2) return false;
  const decorativeCount = children.filter((c) => {
    const cls = (c as HTMLElement).className ?? "";
    const style = c.getAttribute("style") ?? "";
    return DECORATIVE_CLASS.test(cls) || style.includes("position: absolute") || style.includes("position:absolute");
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
    const doc = new DOMParser().parseFromString(section.html, "text/html");
    const root = doc.body.firstElementChild ?? doc.body;

    // Skip layout wrappers at the root level of each section
    const effectiveRoot = drillToContent(root);
    const widgets = walkChildren(effectiveRoot, uploadedFiles, 0);
    const elSection = buildElementorSection(section.id, widgets);
    const mapItem = buildWidgetMapItem(section, widgets);

    resultSections.push(elSection);
    widgetMap.push(mapItem);
  }

  return { sections: resultSections, widgetMap };
}

// Drill past transparent wrapper layers (container > row) to reach real content
function drillToContent(el: Element): Element {
  let current = el;
  // Max 4 layers of drilling
  for (let i = 0; i < 4; i++) {
    const children = Array.from(current.children).filter(
      (c) => !SKIP_TAGS.has(c.tagName.toLowerCase())
    );
    // If only one child and it's a transparent wrapper, step into it
    if (children.length === 1 && isTransparentWrapper(children[0])) {
      current = children[0];
      continue;
    }
    // If all children are column/row wrappers, step into the first meaningful layer
    if (children.length > 0 && children.every((c) => isTransparentWrapper(c))) {
      // This is a "row" — treat children as columns, stop drilling
      break;
    }
    break;
  }
  return current;
}

// ── walkChildren ──────────────────────────────────────────────────────────────

// Increased from 4 to 8 to handle Bootstrap's deep nesting
const MAX_DEPTH = 8;

function walkChildren(
  element: Element,
  uploadedFiles: UploadedFile[],
  depth: number
): ElementorWidget[] {
  if (depth > MAX_DEPTH) {
    return [buildHtmlWidget((element as HTMLElement).outerHTML)];
  }

  const children = Array.from(element.children).filter(
    (c) => !SKIP_TAGS.has(c.tagName.toLowerCase())
  );

  if (children.length === 0) {
    const text = element.textContent?.trim() ?? "";
    if (text) {
      return [buildHtmlWidget((element as HTMLElement).outerHTML)];
    }
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

  // Skip truly empty elements
  const hasText = (element.textContent?.trim().length ?? 0) > 0;
  const hasChildren = element.children.length > 0;
  const hasSrc = element.hasAttribute("src");
  if (!hasText && !hasChildren && !hasSrc) return null;

  // ── Atomic blocks — emit as single HTML widget, never recurse ────────────
  // Carousels, sliders, marquees, radial/absolute-positioned decorative layouts.

  if (isAtomicBlock(element) || isDecorativeSection(element)) {
    return buildHtmlWidget((element as HTMLElement).outerHTML);
  }

  // ── Priority widget detection ─────────────────────────────────────────────

  if (isHeading(element))     return buildHeadingWidget(element);
  if (isImage(element))       return buildImageWidget(element, uploadedFiles);
  if (isVideo(element))       return buildVideoWidget(element);
  if (isDivider(element))     return buildDividerWidget(element);
  if (isButton(element))      return buildButtonWidget(element);
  if (isTextElement(element)) return buildTextWidget(element);
  if (isIconBox(element))     return buildIconBoxWidget(element);

  // ── Transparent wrapper — drill through without consuming a depth level ──

  if (isTransparentWrapper(element)) {
    const drilled = drillToContent(element);
    // After drilling, check for column layout
    const layout = detectColumns(drilled);
    if (layout.isMultiColumn) {
      return buildInnerSection(layout.columns, uploadedFiles) as unknown as ElementorWidget;
    }
    // Otherwise recurse at same depth (wrapper doesn't count)
    const childWidgets = walkChildren(drilled, uploadedFiles, depth);
    if (childWidgets.length === 0) return null;
    if (childWidgets.length === 1) return childWidgets[0];
    // Multiple widgets from a wrapper — wrap in HTML at deeper depths, flatten at 0
    if (depth === 0) return null; // caller loop handles them via walkChildren directly
    return buildHtmlWidget((element as HTMLElement).outerHTML);
  }

  // ── Column detection ──────────────────────────────────────────────────────

  const layout = detectColumns(element);
  if (layout.isMultiColumn) {
    return buildInnerSection(layout.columns, uploadedFiles) as unknown as ElementorWidget;
  }

  // ── Recursive fallback ────────────────────────────────────────────────────

  const childWidgets = walkChildren(element, uploadedFiles, depth + 1);

  if (childWidgets.length === 0) {
    // Only emit HTML widget if there's visible text content
    const text = element.textContent?.trim() ?? "";
    if (text.length > 0) return buildHtmlWidget((element as HTMLElement).outerHTML);
    return null;
  }

  if (childWidgets.length === 1) return childWidgets[0];

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
    // Drill into column wrapper before walking its children
    // but if the column itself is atomic (e.g. carousel inside a col), preserve it whole
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
    if (widgets.length === 0) {
      // Only emit HTML fallback if there's actual content
      const text = col.textContent?.trim() ?? "";
      if (text.length > 0) {
        widgets = [buildHtmlWidget((col as HTMLElement).outerHTML)];
      }
    }
    return {
      id: randomId(),
      elType: "column",
      settings: { _column_size: size },
      elements: widgets,
    };
  });

  return {
    id: randomId(),
    elType: "section",
    isInner: true,
    settings: {
      layout: "boxed",
      gap: "default",
      is_inner: true,
    },
    elements: columns,
  };
}

// ── buildElementorSection ─────────────────────────────────────────────────────

function buildElementorSection(
  sectionId: string,
  widgets: ElementorWidget[]
): ElementorSection {
  return {
    id: randomId(),
    elType: "section",
    settings: {
      layout: "boxed",
      gap: "default",
      custom_id: sectionId,
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
        label: truncate(String(s.title ?? ""), 40),
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
      // Give a meaningful label for known atomic blocks
      let htmlLabel = truncate(stripHtml(htmlStr), 40);
      if (/owl-carousel|slick-slider|swiper/i.test(htmlStr)) htmlLabel = "🎠 Carousel (preserved as HTML)";
      else if (/marquee|antigravity/i.test(htmlStr))          htmlLabel = "📜 Marquee (preserved as HTML)";
      else if (/traveler-section|pill-wrapper/i.test(htmlStr)) htmlLabel = "🎯 Decorative layout (preserved as HTML)";
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
