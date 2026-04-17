import JSZip from "jszip";
import { ThemeConfig, ConversionResult } from "@/types/converter";

export async function buildAndDownloadZip(
  themeConfig: ThemeConfig,
  result: ConversionResult
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(themeConfig.themeSlug)!;

  // elementorJson is already a full Elementor template envelope:
  // { version, title, type, content: [...sections...], page_settings }
  // This is the format Elementor expects for Elementor → Templates → Import Template.
  folder.file("elementor-template.json", result.elementorJson);

  // Legacy page CSS files — useful for the ZIP theme install workflow
  folder.file("elementor-page.css", result.pageCss);

  folder.file("style.css", result.styleCss);
  folder.file("index.php", result.indexPhp);
  folder.file("header.php", result.headerPhp);
  folder.file("footer.php", result.footerPhp);
  folder.file("functions.php", result.functionsPhp);

  // Instructions file for the ZIP workflow
  folder.file(
    "HOW-TO-IMPORT.txt",
    [
      "=== How to import the Elementor template ===",
      "",
      "Option A — Import as Elementor Page Template (recommended):",
      "  1. Go to Elementor → Templates → Saved Templates",
      '  2. Click "Import Templates"',
      "  3. Select elementor-template.json from this ZIP",
      "  4. Create a new page, open it in Elementor",
      '  5. Click the folder icon → My Templates → Insert',
      "",
      "Option B — Install as WordPress Theme:",
      "  1. Go to Appearance → Themes → Add New → Upload Theme",
      "  2. Select this entire ZIP file and click Install Now",
      "  3. Activate the theme",
      "",
      "=== About the generated Elementor JSON ===",
      "",
      "All elements use native Elementor widgets (heading, text-editor, image,",
      "button, icon-box, video, divider, spacer). Only JavaScript-dependent",
      "components (carousels, sliders, marquees) are preserved as HTML widgets.",
    ].join("\n")
  );

  for (const file of result.assetFiles) {
    if (file.type === "css") {
      folder.file(`assets/css/${file.name}`, file.content);
    } else if (file.type === "js") {
      folder.file(`assets/js/${file.name}`, file.content);
    } else if (file.type === "image") {
      const base64Data = file.content.split(",")[1] ?? "";
      folder.file(`assets/images/${file.name}`, base64Data, { base64: true });
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${themeConfig.themeSlug}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}
