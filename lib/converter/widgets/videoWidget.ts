import { ElementorWidget, randomId } from "@/types/converter";
import { buildHtmlWidget } from "./htmlWidget";

export function buildVideoWidget(element: Element): ElementorWidget {
  const tag = element.tagName.toUpperCase();

  if (tag === "VIDEO") {
    const src =
      element.querySelector("source")?.getAttribute("src") ??
      element.getAttribute("src") ??
      "";
    return {
      id: randomId(),
      elType: "widget",
      widgetType: "video",
      settings: {
        video_type: "hosted",
        insert_url: true,
        external_url: { url: src },
      },
      elements: [],
    };
  }

  if (tag === "IFRAME") {
    const src = element.getAttribute("src") ?? "";

    if (src.includes("youtube.com") || src.includes("youtu.be")) {
      return {
        id: randomId(),
        elType: "widget",
        widgetType: "video",
        settings: {
          video_type: "youtube",
          youtube_url: src,
        },
        elements: [],
      };
    }

    if (src.includes("vimeo.com")) {
      return {
        id: randomId(),
        elType: "widget",
        widgetType: "video",
        settings: {
          video_type: "vimeo",
          vimeo_url: src,
        },
        elements: [],
      };
    }
  }

  return buildHtmlWidget((element as HTMLElement).outerHTML);
}

export function isVideo(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === "video") return true;
  if (tag === "iframe") {
    const src = element.getAttribute("src") ?? "";
    return (
      src.includes("youtube") ||
      src.includes("youtu.be") ||
      src.includes("vimeo")
    );
  }
  return false;
}
