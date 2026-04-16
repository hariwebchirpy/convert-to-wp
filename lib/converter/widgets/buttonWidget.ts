import { ElementorWidget, randomId } from "@/types/converter";

export function buildButtonWidget(element: Element): ElementorWidget {
  const text = element.textContent?.trim() || "Click here";
  const href = element.getAttribute("href") ?? "#";
  const cls = element.getAttribute("class") ?? "";

  const isExternal =
    href.startsWith("http") && !href.includes(
      typeof window !== "undefined" ? window.location.hostname : ""
    );
  const target = element.getAttribute("target") === "_blank";

  let buttonType: "info" | "default" | "outline" = "default";
  if (cls.includes("primary") || cls.includes("btn-primary")) {
    buttonType = "info";
  } else if (cls.includes("outline")) {
    buttonType = "outline";
  }

  return {
    id: randomId(),
    elType: "widget",
    widgetType: "button",
    settings: {
      text,
      link: {
        url: href,
        is_external: isExternal || target,
        nofollow: false,
      },
      button_type: buttonType,
      align: "left",
      size: "md",
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
