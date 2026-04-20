import { ElementorWidget, randomId } from "@/types/converter";
import { extractAlignment } from "./styleParser";

interface ElementorIcon {
  value: string;
  library: string;
}

function extractIcon(element: Element): ElementorIcon {
  const selectors = ["i", "span[class*='fa-']", "span[class*='bi-']", "[class*='icon']", "svg"];

  for (const sel of selectors) {
    const found = element.querySelector(sel);
    if (!found) continue;
    const cls = found.getAttribute("class") ?? "";

    if (cls.includes("fa-")) {
      const faMatch = cls.match(/(?:fas|far|fal|fab|fa)\s+fa-[\w-]+/);
      const value = faMatch
        ? faMatch[0]
        : `fas ${cls.split(" ").find((c) => c.startsWith("fa-")) ?? "fa-circle"}`;
      return { value, library: "fa-solid" };
    }
    if (cls.includes("bi-")) {
      const biClass = cls.split(" ").find((c) => c.startsWith("bi-")) ?? "bi-circle";
      return { value: `bi ${biClass}`, library: "bootstrap-icons" };
    }
    if (found.tagName.toLowerCase() === "svg") {
      return { value: "fas fa-circle", library: "fa-solid" };
    }
  }

  return { value: "fas fa-star", library: "fa-solid" };
}

export function buildIconBoxWidget(element: Element, resolvedStyles: Record<string, string> = {}): ElementorWidget {
  const children = Array.from(element.children);

  const headingEl = children.find((c) =>
    ["h1", "h2", "h3", "h4", "h5", "h6"].includes(c.tagName.toLowerCase())
  );
  const paragraphEl = children.find((c) => c.tagName.toLowerCase() === "p");
  const align = extractAlignment(element, resolvedStyles);

  const title = headingEl?.textContent?.trim() ?? "Title";
  const description = paragraphEl?.innerHTML?.trim() ?? "";
  const icon = extractIcon(element);
  const titleTag = (headingEl?.tagName.toLowerCase() ?? "h4") as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

  return {
    id: randomId(),
    elType: "widget",
    widgetType: "icon-box",
    settings: {
      title_text: title,
      description_text: description,
      icon,
      title_size: titleTag,
      position: "top",
      align,
    },
    elements: [],
  };
}

export function isIconBox(element: Element): boolean {
  const children = Array.from(element.children);

  // Only consider small, self-contained card elements — not section containers.
  // A real icon-box card has a tight set of direct children (icon + title + text).
  // Large containers (sections, feature grids, nav, header, etc.) must not match.
  if (children.length > 6) return false;

  // Must NOT be a block-level section/article element with many descendants
  const tag = element.tagName.toLowerCase();
  if (["section", "article", "main", "header", "footer", "nav"].includes(tag)) return false;

  // Heading must be a DIRECT child (not buried deep in descendants)
  const hasHeading = children.some((c) =>
    ["h1", "h2", "h3", "h4", "h5", "h6"].includes(c.tagName.toLowerCase())
  );
  if (!hasHeading) return false;

  // Paragraph must be a direct child too
  const hasParagraph = children.some((c) => c.tagName.toLowerCase() === "p");

  // Icon: a direct child that looks like an icon element
  const hasIcon = children.some((c) => {
    const cls = c.getAttribute("class") ?? "";
    return (
      cls.includes("fa-") ||
      cls.includes("bi-") ||
      c.tagName.toLowerCase() === "i" ||
      c.tagName.toLowerCase() === "svg"
    );
  });

  // Must have an icon to qualify — heading+paragraph alone is too generic and
  // matches section containers, feature cards with only text, etc.
  // Without an icon, use a text-editor widget instead (handled by isTextElement fallback).
  if (!hasIcon) return false;

  return true;
}
