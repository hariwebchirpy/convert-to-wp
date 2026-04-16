import { ElementorWidget, UploadedFile, randomId } from "@/types/converter";

export function buildImageWidget(
  element: Element,
  uploadedFiles: UploadedFile[]
): ElementorWidget {
  const src = element.getAttribute("src") ?? "";
  const alt = element.getAttribute("alt") ?? "";

  const filename = src.split("/").pop() ?? "";
  const matched = uploadedFiles.find((f) => f.name === filename);

  const rewrittenUrl = matched
    ? `<?php echo get_template_directory_uri(); ?>/assets/images/${filename}`
    : src;

  const linkUrl =
    element.parentElement?.tagName === "A"
      ? (element.parentElement.getAttribute("href") ?? "")
      : "";

  return {
    id: randomId(),
    elType: "widget",
    widgetType: "image",
    settings: {
      image: { url: rewrittenUrl, alt },
      image_size: "full",
      link_to: linkUrl ? "custom" : "none",
      link: { url: linkUrl, is_external: false },
    },
    elements: [],
  };
}

export function isImage(element: Element): boolean {
  return element.tagName.toLowerCase() === "img";
}
