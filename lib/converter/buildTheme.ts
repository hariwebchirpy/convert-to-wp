import { ParsedHtml, ThemeConfig, UploadedFile, ConversionResult } from "@/types/converter";
import { buildElementorJson } from "./elementorJson";

// Maps file type to the assets subfolder name
const ASSET_FOLDER: Record<UploadedFile["type"], string> = {
  css: "css",
  js: "js",
  image: "images",
  html: "",
};

function replaceAssetPaths(html: string, files: UploadedFile[]): string {
  let result = html;
  for (const file of files) {
    if (file.type === "html") continue;
    const folder = ASSET_FOLDER[file.type];
    // Escape special regex characters in the filename
    const escaped = file.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "g");
    const replacement = `<?php echo get_template_directory_uri(); ?>/assets/${folder}/${file.name}`;
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function buildTheme(
  parsed: ParsedHtml,
  themeConfig: ThemeConfig,
  uploadedFiles: UploadedFile[]
): ConversionResult {
  const { themeName, themeSlug, author, description, version } = themeConfig;

  const cssFiles = uploadedFiles.filter((f) => f.type === "css");
  const jsFiles = uploadedFiles.filter((f) => f.type === "js");

  // ── style.css ──
  const cssContents = cssFiles.map((f) => f.content).join("\n\n");
  const styleCss = `/*
Theme Name: ${themeName}
Theme URI:
Author: ${author}
Description: ${description}
Version: ${version}
*/

${cssContents}`.trimEnd();

  // ── functions.php ──
  const cssEnqueues = cssFiles
    .map((f) => {
      const handle = f.name.replace(/\.[^.]+$/, "");
      return `  wp_enqueue_style(\n    '${themeSlug}-${handle}',\n    get_template_directory_uri() . '/assets/css/${f.name}',\n    array(),\n    '${version}'\n  );`;
    })
    .join("\n\n");

  const jsEnqueues = jsFiles
    .map((f) => {
      const handle = f.name.replace(/\.[^.]+$/, "");
      return `  wp_enqueue_script(\n    '${themeSlug}-${handle}',\n    get_template_directory_uri() . '/assets/js/${f.name}',\n    array('jquery'),\n    '${version}',\n    true\n  );`;
    })
    .join("\n\n");

  const functionsPhp = `<?php
function ${themeSlug}_enqueue_assets() {
${cssEnqueues}${cssEnqueues && jsEnqueues ? "\n\n" : ""}${jsEnqueues}
}
add_action('wp_enqueue_scripts', '${themeSlug}_enqueue_assets');
`;

  // ── header.php ──
  const headerHtmlReplaced = replaceAssetPaths(parsed.headerHtml, uploadedFiles);
  const headerPhp = `<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
  <meta charset="<?php bloginfo('charset'); ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
${headerHtmlReplaced}`;

  // ── footer.php ──
  const footerHtmlReplaced = replaceAssetPaths(parsed.footerHtml, uploadedFiles);
  const footerPhp = `${footerHtmlReplaced}
<?php wp_footer(); ?>
</body>
</html>`;

  // ── index.php ──
  const mainHtmlReplaced = replaceAssetPaths(parsed.mainHtml, uploadedFiles);
  const indexPhp = `<?php get_header(); ?>
<main>
  ${mainHtmlReplaced}
</main>
<?php get_footer(); ?>`;

  const { json: elementorJson, widgetMap } = buildElementorJson(
    parsed.sections,
    uploadedFiles
  );

  return {
    headerPhp,
    footerPhp,
    indexPhp,
    functionsPhp,
    styleCss,
    elementorJson,
    widgetMap,
    assetFiles: uploadedFiles.filter((f) => f.type !== "html"),
  };
}
