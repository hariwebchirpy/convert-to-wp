import JSZip from "jszip";
import { ThemeConfig, ConversionResult } from "@/types/converter";

export async function buildAndDownloadZip(
  themeConfig: ThemeConfig,
  result: ConversionResult
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(themeConfig.themeSlug)!;

  // ── Theme root files ──
  folder.file("style.css", result.styleCss);
  folder.file("index.php", result.indexPhp);
  folder.file("header.php", result.headerPhp);
  folder.file("footer.php", result.footerPhp);
  folder.file("functions.php", result.functionsPhp);
  folder.file("elementor-template.json", result.elementorJson);

  // ── Asset files ──
  for (const file of result.assetFiles) {
    if (file.type === "css") {
      folder.file(`assets/css/${file.name}`, file.content);
    } else if (file.type === "js") {
      folder.file(`assets/js/${file.name}`, file.content);
    } else if (file.type === "image") {
      // content is a data URL: "data:image/png;base64,<data>"
      const base64Data = file.content.split(",")[1] ?? "";
      folder.file(`assets/images/${file.name}`, base64Data, { base64: true });
    }
  }

  // ── Generate and trigger download ──
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${themeConfig.themeSlug}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
