import { ElementorWidget, randomId } from "@/types/converter";
import {
  extractTypography,
  extractAlignment,
  buildTypographySettings,
} from "./styleParser";

export function buildTextWidget(element: Element, resolvedStyles: Record<string, string> = {}): ElementorWidget {
  const typo = extractTypography(element, resolvedStyles);
  const align = extractAlignment(element, resolvedStyles);

  // Use innerHTML so inline formatting (strong, em, a, span) is preserved
  const editor = element.innerHTML.trim();

  return {
    id: randomId(),
    elType: "widget",
    widgetType: "text-editor",
    settings: {
      editor,
      align,
      text_color: typo.color ?? "",
      ...buildTypographySettings(typo),
    },
    elements: [],
  };
}

export function isTextElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  return (
    ["p", "ul", "ol", "blockquote", "pre"].includes(tag) &&
    (element.textContent?.trim().length ?? 0) > 0
  );
}
