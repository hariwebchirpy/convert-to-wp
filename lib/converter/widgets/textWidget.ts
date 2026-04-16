import { ElementorWidget, randomId } from "@/types/converter";

export function buildTextWidget(element: Element): ElementorWidget {
  return {
    id: randomId(),
    elType: "widget",
    widgetType: "text-editor",
    settings: {
      editor: element.outerHTML,
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
