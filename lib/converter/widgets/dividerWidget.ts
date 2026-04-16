import { ElementorWidget, randomId } from "@/types/converter";

export function buildDividerWidget(_element: Element): ElementorWidget {
  return {
    id: randomId(),
    elType: "widget",
    widgetType: "divider",
    settings: {
      style: "solid",
      weight: { unit: "px", size: 1 },
      color: "#d5d5d5",
      gap: { unit: "px", size: 15 },
    },
    elements: [],
  };
}

export function isDivider(element: Element): boolean {
  return element.tagName.toLowerCase() === "hr";
}
