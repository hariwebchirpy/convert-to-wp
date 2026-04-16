import { ElementorWidget, randomId } from "@/types/converter";

interface ElementorIcon {
  value: string;
  library: string;
}

function extractIcon(element: Element): ElementorIcon {
  const iconSelectors = ["i", "span", "[class*='fa-']", "[class*='bi-']", "[class*='icon']"];

  for (const sel of iconSelectors) {
    const found = element.querySelector(sel);
    if (!found) continue;
    const cls = found.getAttribute("class") ?? "";
    if (cls.includes("fa-")) {
      // Grab the full fa class string (e.g. "fas fa-star")
      const faMatch = cls.match(/(?:fas|far|fal|fab|fa)\s+fa-[\w-]+/);
      const value = faMatch ? faMatch[0] : `fas ${cls.split(" ").find((c) => c.startsWith("fa-")) ?? "fa-circle"}`;
      return { value, library: "fa-solid" };
    }
    if (cls.includes("bi-")) {
      const biClass = cls.split(" ").find((c) => c.startsWith("bi-")) ?? "bi-circle";
      return { value: `bi ${biClass}`, library: "bootstrap-icons" };
    }
  }

  // SVG child counts as an icon too — fall back to generic
  if (element.querySelector("svg")) {
    return { value: "fas fa-circle", library: "fa-solid" };
  }

  return { value: "fas fa-star", library: "fa-solid" };
}

export function buildIconBoxWidget(element: Element): ElementorWidget {
  const children = Array.from(element.children);

  const headingEl = children.find((c) =>
    ["h1", "h2", "h3", "h4"].includes(c.tagName.toLowerCase())
  );
  const paragraphEl = children.find((c) => c.tagName.toLowerCase() === "p");

  const title = headingEl?.textContent?.trim() ?? "Title";
  const description = paragraphEl?.textContent?.trim() ?? "";
  const icon = extractIcon(element);

  return {
    id: randomId(),
    elType: "widget",
    widgetType: "icon-box",
    settings: {
      title_text: title,
      description_text: description,
      icon,
      title_size: "h4",
      position: "top",
    },
    elements: [],
  };
}

export function isIconBox(element: Element): boolean {
  const children = Array.from(element.children);

  const hasHeading = children.some((c) =>
    ["h1", "h2", "h3", "h4"].includes(c.tagName.toLowerCase())
  );
  const hasParagraph = children.some((c) => c.tagName.toLowerCase() === "p");
  const hasIcon = children.some((c) => {
    const cls = c.getAttribute("class") ?? "";
    return (
      cls.includes("fa-") ||
      cls.includes("icon") ||
      cls.includes("bi-") ||
      c.tagName.toLowerCase() === "i" ||
      c.tagName.toLowerCase() === "svg"
    );
  });

  return hasHeading && (hasParagraph || hasIcon);
}
