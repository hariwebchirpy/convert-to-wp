import { ElementorWidget, randomId } from "@/types/converter";

export function buildSpacerWidget(heightPx = 50): ElementorWidget {
  return {
    id: randomId(),
    elType: "widget",
    widgetType: "spacer",
    settings: {
      space: { unit: "px", size: heightPx },
    },
    elements: [],
  };
}

/** True for visually empty block elements that are used purely for spacing */
export function isSpacer(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (!["div", "section", "span"].includes(tag)) return false;

  const hasText = (element.textContent?.trim().length ?? 0) > 0;
  if (hasText) return false;

  const hasImages = element.querySelectorAll("img").length > 0;
  if (hasImages) return false;

  const hasRealChildren = Array.from(element.children).some(
    (c) => !["br", "script", "style", "link"].includes(c.tagName.toLowerCase())
  );
  if (hasRealChildren) return false;

  // Only treat as spacer if it has an explicit height in style
  const style = element.getAttribute("style") ?? "";
  return style.includes("height");
}
