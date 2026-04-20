import { ElementorWidget, UploadedFile, randomId } from "@/types/converter";
import { parseStyle } from "./styleParser";

function extractFilename(src: string): string {
  return src.split("?")[0].split("/").pop() ?? "";
}

export function buildImageWidget(
  element: Element,
  uploadedFiles: UploadedFile[],
  resolvedStyles: Record<string, string> = {}
): ElementorWidget {
  const src = element.getAttribute("src") ?? "";
  const alt = element.getAttribute("alt") ?? "";
  const inline = parseStyle(element.getAttribute("style") ?? "");
  const style = { ...resolvedStyles, ...inline };

  const filename = extractFilename(src);
  const matched = uploadedFiles.find((f) => f.name === filename);

  // Use __WP_IMG__ marker — wpApi resolves it to the real WP media URL after upload.
  // For ZIP/PHP output buildTheme replaces it with get_template_directory_uri() paths.
  const imageUrl = matched ? `__WP_IMG__${filename}` : src;

  const linkEl = element.parentElement?.tagName === "A" ? element.parentElement : null;
  const linkUrl = linkEl?.getAttribute("href") ?? "";

  // Width from style attribute or HTML attribute
  const widthAttr = element.getAttribute("width");
  const widthStyle = style["width"];
  let widthPx: number | undefined;
  if (widthStyle) {
    const m = widthStyle.match(/^([\d.]+)px$/);
    if (m) widthPx = Math.round(parseFloat(m[1]));
  } else if (widthAttr) {
    const n = parseInt(widthAttr, 10);
    if (!isNaN(n)) widthPx = n;
  }

  // Alignment from parent or own classes
  const cls = element.getAttribute("class") ?? "";
  const parentCls = element.parentElement?.getAttribute("class") ?? "";
  // Elementor image widget align: "left" | "center" | "right" | "" (empty = none)
  let align = "";
  const combined = `${cls} ${parentCls}`;
  if (combined.includes("mx-auto") || combined.includes("d-block") || combined.includes("text-center")) {
    align = "center";
  } else if (combined.includes("float-end") || combined.includes("float-right") || combined.includes("ms-auto")) {
    align = "right";
  } else if (combined.includes("float-start") || combined.includes("float-left")) {
    align = "left";
  }

  return {
    id: randomId(),
    elType: "widget",
    widgetType: "image",
    settings: {
      image: { url: imageUrl, alt, id: "" },
      image_size: "full",
      ...(widthPx !== undefined ? { width: { unit: "px", size: widthPx } } : {}),
      align,
      link_to: linkUrl ? "custom" : "none",
      link: { url: linkUrl, is_external: !linkUrl.startsWith("#"), nofollow: false },
    },
    elements: [],
  };
}

export function isImage(element: Element): boolean {
  return element.tagName.toLowerCase() === "img";
}
