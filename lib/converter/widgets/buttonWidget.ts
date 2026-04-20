import { ElementorWidget, randomId } from "@/types/converter";
import {
  parseStyle,
  extractBorderRadius,
  extractBgColor,
  extractAlignment,
  extractSpacing,
} from "./styleParser";

// Elementor button widget valid type values (maps to button_type control)
function resolveButtonType(cls: string): string {
  if (cls.includes("btn-outline")) return "outline";
  if (cls.includes("btn-success")) return "success";
  if (cls.includes("btn-danger") || cls.includes("btn-warning")) return "warning";
  if (cls.includes("btn-info")) return "info";
  // "default" is NOT a valid Elementor button_type — use empty string
  return "";
}

function resolveButtonSize(cls: string): string {
  if (cls.includes("btn-lg") || cls.includes("btn-large")) return "lg";
  if (cls.includes("btn-sm") || cls.includes("btn-small")) return "sm";
  return "md";
}

export function buildButtonWidget(element: Element, resolvedStyles: Record<string, string> = {}): ElementorWidget {
  const text = element.textContent?.trim() || "Click here";
  // <button> has no href; <a> does. Elementor button widget renders as <a> always.
  const href = element.getAttribute("href") ?? "";
  const cls = element.getAttribute("class") ?? "";
  const inline = parseStyle(element.getAttribute("style") ?? "");

  const isExternal = href.startsWith("http");
  const opensNewTab = element.getAttribute("target") === "_blank";

  const btnType = resolveButtonType(cls);
  const btnSize = resolveButtonSize(cls);
  const align = extractAlignment(element.parentElement ?? element, resolvedStyles);
  const borderRadius = extractBorderRadius(element, resolvedStyles);
  // Elementor button widget uses "button_background_color" not "background_color"
  const bgColor = extractBgColor(element, resolvedStyles);
  const style = { ...resolvedStyles, ...inline };
  const textColor = style["color"];
  const spacing = extractSpacing(element, resolvedStyles);

  return {
    id: randomId(),
    elType: "widget",
    widgetType: "button",
    settings: {
      text,
      link: {
        url: href || "#",
        is_external: isExternal || opensNewTab,
        nofollow: false,
      },
      // Empty string = Elementor's "Default" style (not the string "default")
      button_type: btnType,
      size: btnSize,
      align,
      // Correct Elementor button color keys
      ...(bgColor ? { button_background_color: bgColor } : {}),
      ...(textColor ? { button_text_color: textColor } : {}),
      ...(borderRadius !== undefined
        ? {
            border_radius: {
              top: String(borderRadius),
              right: String(borderRadius),
              bottom: String(borderRadius),
              left: String(borderRadius),
              unit: "px",
              isLinked: true,
            },
          }
        : {}),
      ...(spacing.padding ? { padding: spacing.padding } : {}),
    },
    elements: [],
  };
}

export function isButton(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === "button") return true;
  if (tag === "a") {
    const cls = element.getAttribute("class") ?? "";
    return ["btn", "button", "cta", "action"].some((kw) => cls.includes(kw));
  }
  return false;
}
