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

    const widgets = walkChildren(root, uploadedFiles, 0);
    const elSection = buildElementorSection(section.id, widgets);
    const mapItem = buildWidgetMapItem(section, widgets);

    resultSections.push(elSection);
    widgetMap.push(mapItem);
  }

  return { sections: resultSections, widgetMap };
}

// ── walkChildren ──────────────────────────────────────────────────────────────

const MAX_DEPTH = 4;

function walkChildren(
  element: Element,
  uploadedFiles: UploadedFile[],
  depth: number
): ElementorWidget[] {
  if (depth > MAX_DEPTH) {
    return [buildHtmlWidget((element as HTMLElement).outerHTML)];
  }

  const children = Array.from(element.children);

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

const SKIP_TAGS = new Set(["script", "style", "link", "meta", "noscript", "br"]);

function mapElement(
  element: Element,
  uploadedFiles: UploadedFile[],
  depth: number
): ElementorWidget | null {
  const tag = element.tagName.toLowerCase();

  // Skip structural/invisible tags
  if (SKIP_TAGS.has(tag)) return null;

  // Skip truly empty elements (no text, no children, no src)
  const hasText = (element.textContent?.trim().length ?? 0) > 0;
  const hasChildren = element.children.length > 0;
  const hasSrc = element.hasAttribute("src");
  if (!hasText && !hasChildren && !hasSrc) return null;

  // ── Priority detection ────────────────────────────────────────────────────

  if (isHeading(element))      return buildHeadingWidget(element);
  if (isImage(element))        return buildImageWidget(element, uploadedFiles);
  if (isVideo(element))        return buildVideoWidget(element);
  if (isDivider(element))      return buildDividerWidget(element);
  if (isButton(element))       return buildButtonWidget(element);
  if (isTextElement(element))  return buildTextWidget(element);
  if (isIconBox(element))      return buildIconBoxWidget(element);

  // ── Column detection ──────────────────────────────────────────────────────

  const layout = detectColumns(element);
  if (layout.isMultiColumn) {
    return buildInnerSection(layout.columns, uploadedFiles) as unknown as ElementorWidget;
  }

  // ── Recursive fallback ────────────────────────────────────────────────────

  const childWidgets = walkChildren(element, uploadedFiles, depth + 1);

  if (childWidgets.length === 0) {
    return buildHtmlWidget((element as HTMLElement).outerHTML);
  }

  if (childWidgets.length === 1) {
    return childWidgets[0];
  }

  // depth 0: return them all individually via a container html widget
  // depth > 0: wrap in a single html widget to avoid deep nesting
  if (depth === 0) {
    // Return only the first — caller (walkChildren loop) will pick them all up
    // individually; we can't return an array here, so wrap in html
    return buildHtmlWidget((element as HTMLElement).outerHTML);
  }

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
    let widgets = walkChildren(col, uploadedFiles, 1);
    if (widgets.length === 0) {
      widgets = [buildHtmlWidget((col as HTMLElement).outerHTML)];
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
  // Inner section (columns)
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
      const videoLabel =
        String(s.youtube_url ?? s.vimeo_url ?? (s.external_url as { url?: string })?.url ?? "Video");
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
    default:
      return {
        type: "HTML",
        label: truncate(stripHtml(String(s.html ?? "")), 40),
        tag: "div",
        isComplex: true,
      };
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
