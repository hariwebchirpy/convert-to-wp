import { ElementorWidget, randomId } from "@/types/converter";

export function buildHtmlWidget(html: string): ElementorWidget {
  return {
    id: randomId(),
    elType: "widget",
    widgetType: "html",
    settings: { html },
    elements: [],
  };
}
