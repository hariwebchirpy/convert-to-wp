import { ParsedHtml, ThemeConfig, UploadedFile, ConversionResult } from "@/types/converter";
import { buildElementorJson } from "./elementorJson";

// Maps file type to the assets subfolder name
const ASSET_FOLDER: Record<UploadedFile["type"], string> = {
  css: "css",
  js: "js",
  image: "images",
  html: "",
};

// replaceAssetPaths — for PHP theme files (header.php, footer.php, index.php)
function replaceAssetPaths(html: string, files: UploadedFile[]): string {
  let result = html;
  for (const file of files) {
    if (file.type === "html") continue;
    const folder = ASSET_FOLDER[file.type];
    const escaped = file.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "g");
    const replacement = `<?php echo get_template_directory_uri(); ?>/assets/${folder}/${file.name}`;
    result = result.replace(pattern, replacement);
  }
  return result;
}

// replaceAssetPathsPlain — for rawHtml pushed via REST API (no PHP tags allowed).
// Leaves image src as the original filename — wpApi will replace these with
// real WP Media Library URLs after uploading images.
function replaceAssetPathsPlain(html: string, files: UploadedFile[]): string {
  let result = html;
  for (const file of files) {
    if (file.type !== "image") continue;
    // Rewrite any path variant (images/foo.png, ./images/foo.png, ../images/foo.png)
    // to just the bare filename so wpApi can match and replace it.
    const escaped = file.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:(?:\\.{0,2}/)?(?:images|img|assets/images)/)?${escaped}`, "g");
    result = result.replace(pattern, `__WP_IMG__${file.name}`);
  }
  return result;
}

export function buildTheme(
  parsed: ParsedHtml,
  themeConfig: ThemeConfig,
  uploadedFiles: UploadedFile[]
): ConversionResult {
  const { themeName, themeSlug, author, description, version } = themeConfig;

  // PHP function names cannot contain hyphens — convert to underscores
  const phpSafeSlug = themeSlug.replace(/-/g, "_");

  const cssFiles = uploadedFiles.filter((f) => f.type === "css");
  const jsFiles = uploadedFiles.filter((f) => f.type === "js");

  // ── style.css — WordPress theme header only ──
  // Individual CSS files live in assets/css/ and are enqueued via functions.php.
  // The root style.css must only contain the theme header comment.
  const styleCss = `/*
Theme Name: ${themeName}
Theme URI:
Author: ${author}
Description: ${description}
Version: ${version}
*/`;

  // ── functions.php ──
  // Skip jQuery — WordPress includes it automatically. Registering it again causes conflicts.
  const SKIP_JS = new Set(["jquery.min.js", "jquery.js", "jquery-3.js"]);

  // Sanitize handle: strip extension, replace dots/underscores with hyphens
  function toHandle(filename: string): string {
    return filename.replace(/\.[^.]+$/, "").replace(/[._]+/g, "-").toLowerCase();
  }

  const cssEnqueues = cssFiles
    .map((f) => {
      const handle = toHandle(f.name);
      return `  wp_enqueue_style(\n    '${phpSafeSlug}-${handle}',\n    get_template_directory_uri() . '/assets/css/${f.name}',\n    array(),\n    '${version}'\n  );`;
    })
    .join("\n\n");

  const jsEnqueues = jsFiles
    .filter((f) => !SKIP_JS.has(f.name.toLowerCase()))
    .map((f) => {
      const handle = toHandle(f.name);
      return `  wp_enqueue_script(\n    '${phpSafeSlug}-${handle}',\n    get_template_directory_uri() . '/assets/js/${f.name}',\n    array('jquery'),\n    '${version}',\n    true\n  );`;
    })
    .join("\n\n");

  const functionsPhp = `<?php
function ${phpSafeSlug}_enqueue_assets() {
${cssEnqueues}${cssEnqueues && jsEnqueues ? "\n\n" : ""}${jsEnqueues}
}
add_action('wp_enqueue_scripts', '${phpSafeSlug}_enqueue_assets');
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
    rawHtml: replaceAssetPathsPlain(parsed.mainHtml, uploadedFiles),
    widgetMap,
    assetFiles: uploadedFiles.filter((f) => f.type !== "html"),
  };
}
