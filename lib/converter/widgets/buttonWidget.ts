import { ElementorWidget, randomId } from "@/types/converter";
import {
  parseStyle,
  extractBorderRadius,
  extractBgColor,
  extractAlignment,
} from "./styleParser";

function resolveButtonType(cls: string): string {
  if (cls.includes("btn-primary") || cls.includes("btn-dark")) return "info";
  if (cls.includes("btn-outline")) return "outline";
  if (cls.includes("btn-success")) return "success";
  if (cls.includes("btn-danger") || cls.includes("btn-warning")) return "warning";
  return "default";
}

function resolveButtonSize(cls: string): string {
  if (cls.includes("btn-lg") || cls.includes("btn-large")) return "lg";
  if (cls.includes("btn-sm") || cls.includes("btn-small")) return "sm";
  return "md";
}

export function buildButtonWidget(element: Element): ElementorWidget {
  const text = element.textContent?.trim() || "Click here";
  const href = element.getAttribute("href") ?? "#";
  const cls = element.getAttribute("class") ?? "";
  const style = parseStyle(element.getAttribute("style") ?? "");

  const isExternal = href.startsWith("http");
  const opensNewTab = element.getAttribute("target") === "_blank";

  const btnType = resolveButtonType(cls);
  const btnSize = resolveButtonSize(cls);
  const align = extractAlignment(element.parentElement ?? element);
  const borderRadius = extractBorderRadius(element);
  const bgColor = extractBgColor(element);
  const textColor = style["color"];

  return {
    id: randomId(),
    elType: "widget",
    widgetType: "button",
    settings: {
      text,
      link: {
        url: href,
        is_external: isExternal || opensNewTab,
        nofollow: false,
      },
      button_type: btnType,
      size: btnSize,
      align,
      ...(bgColor ? { background_color: bgColor } : {}),
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
