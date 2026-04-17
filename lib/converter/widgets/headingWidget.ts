import { ElementorWidget, randomId } from "@/types/converter";
import {
  extractTypography,
  extractAlignment,
  buildTypographySettings,
} from "./styleParser";

export function buildHeadingWidget(element: Element): ElementorWidget {
  const text = element.innerHTML.trim();
  const tag = element.tagName.toLowerCase() as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  const typo = extractTypography(element);
  const align = extractAlignment(element);

  return {
    id: randomId(),
    elType: "widget",
    widgetType: "heading",
    settings: {
      title: text,
      header_size: tag,
      align,
      title_color: typo.color ?? "",
      ...buildTypographySettings(typo),
    },
    elements: [],
  };
}

export function isHeading(element: Element): boolean {
  return ["h1", "h2", "h3", "h4", "h5", "h6"].includes(
    element.tagName.toLowerCase()
  );
}
