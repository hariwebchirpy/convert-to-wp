import { ElementorWidget, randomId } from "@/types/converter";

export function buildHeadingWidget(element: Element): ElementorWidget {
  const text = element.textContent?.trim() ?? "";
  const tag = element.tagName.toLowerCase();
  const cls = element.getAttribute("class") ?? "";

  let align: "left" | "center" | "right" = "left";
  if (cls.includes("center") || cls.includes("text-center")) {
    align = "center";
  } else if (cls.includes("right") || cls.includes("text-right")) {
    align = "right";
  }

  return {
    id: randomId(),
    elType: "widget",
    widgetType: "heading",
    settings: {
      title: text,
      header_size: tag,
      align,
      title_color: "",
    },
    elements: [],
  };
}

export function isHeading(element: Element): boolean {
  return ["h1", "h2", "h3", "h4", "h5", "h6"].includes(
    element.tagName.toLowerCase()
  );
}
