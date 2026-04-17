import { ParsedHtml, ThemeConfig, UploadedFile, ConversionResult } from "@/types/converter";
import { buildElementorJson } from "./elementorJson";

// Maps file type to the assets subfolder name
const ASSET_FOLDER: Record<UploadedFile["type"], string> = {
  css: "css",
  js: "js",
  image: "images",
  html: "",
};

// Replace all path variants of a filename using plain split/join (no regex).
// Longest prefix first so ../images/ is replaced before images/.
function replaceAllPathVariants(
  text: string,
  filename: string,
  replacement: string,
  extraPrefixes: string[] = []
): string {
  const variants = [
    ...extraPrefixes.map((p) => `${p}/${filename}`),
    `../assets/images/${filename}`,
    `./assets/images/${filename}`,
    `assets/images/${filename}`,
    `../assets/img/${filename}`,
    `./assets/img/${filename}`,
    `assets/img/${filename}`,
    `../images/${filename}`,
    `./images/${filename}`,
    `images/${filename}`,
    `../img/${filename}`,
    `./img/${filename}`,
    `img/${filename}`,
  ];
  let result = text;
  for (const variant of variants) {
    result = result.split(variant).join(replacement);
  }
  return result;
}

// replaceAssetPaths — for PHP theme files (header.php, footer.php, index.php)
function replaceAssetPaths(html: string, files: UploadedFile[]): string {
  let result = html;
  for (const file of files) {
    if (file.type === "html") continue;
    const folder = ASSET_FOLDER[file.type];
    const replacement = `<?php echo get_template_directory_uri(); ?>/assets/${folder}/${file.name}`;
    const extraPrefixes =
      file.type === "css"
        ? ["css", "assets/css", "../css"]
        : file.type === "js"
          ? ["js", "assets/js", "../js"]
          : [];
    result = replaceAllPathVariants(result, file.name, replacement, extraPrefixes);
  }
  return result;
}

// replaceAssetPathsPlain — for rawHtml pushed via REST API (no PHP tags).
// Marks images as __WP_IMG__filename so wpApi can swap in real WP media URLs.
function replaceAssetPathsPlain(html: string, files: UploadedFile[]): string {
  let result = html;
  for (const file of files) {
    if (file.type !== "image") continue;
    result = replaceAllPathVariants(result, file.name, `__WP_IMG__${file.name}`);
  }
  return result;
}

// replaceCssAssetPathsForPageCss — rewrite image paths in CSS to ./assets/images/
// so that when the CSS is injected into WP, wpApi can then swap to real WP media URLs.
function replaceCssAssetPathsForPageCss(css: string, files: UploadedFile[]): string {
  let result = css;
  for (const file of files) {
    if (file.type !== "image") continue;
    result = replaceAllPathVariants(result, file.name, `__WP_IMG__${file.name}`);
  }
  return result;
}

export function buildTheme(
  parsed: ParsedHtml,
  themeConfig: ThemeConfig,
  uploadedFiles: UploadedFile[]
): ConversionResult {
  console.group("[buildTheme] Starting theme build");
  console.log(`[buildTheme] Theme: "${themeConfig.themeName}" slug="${themeConfig.themeSlug}"`);
  console.log(`[buildTheme] Uploaded files: ${uploadedFiles.length}`);
  uploadedFiles.forEach((f) =>
    console.log(`  [file] ${f.type.padEnd(6)} ${f.name} — ${Math.round(f.content.length / 1024)}KB`)
  );

  const { themeName, themeSlug, author, description, version } = themeConfig;

  // PHP function names cannot contain hyphens — convert to underscores
  const phpSafeSlug = themeSlug.replace(/-/g, "_");

  const cssFiles = uploadedFiles.filter((f) => f.type === "css");
  const jsFiles = uploadedFiles.filter((f) => f.type === "js");

  // Large framework CSS files that ship their own CDN and are already included
  // by most WP themes — exclude from pageCss to keep REST API payload small.
  // These are still enqueued via functions.php for the ZIP theme.
  const SKIP_PAGE_CSS = new Set([
    "bootstrap.min.css", "bootstrap.css",
    "font-awesome.min.css", "font-awesome-min.css", "all.min.css",
  ]);

  // Bootstrap detection markers — strip Bootstrap from any CSS content before pushing.
  // Some sites concatenate Bootstrap + custom CSS into one file.
  // The child theme already loads Bootstrap via CDN, so we must not duplicate it.
  const BOOTSTRAP_MARKERS = [
    "Bootstrap v5",
    "Bootstrap v4",
    "bootstrap.min.css.map",
    ":root{--bs-blue:",
    ":root{--bs-",
  ];

  function stripBootstrapFromCss(css: string): string {
    const lower = css.toLowerCase();
    // Check if this CSS contains Bootstrap
    const hasBootstrap = BOOTSTRAP_MARKERS.some((m) => css.includes(m));
    if (!hasBootstrap) return css;

    // Strategy: find the Bootstrap block comment and strip from there to end,
    // or find the :root{--bs- declaration and strip that chunk.
    // Try comment marker first (handles "/* --- Bootstrap CSS --- */" pattern)
    const commentPatterns = [
      /\/\*[\s\S]*?bootstrap[\s\S]*?\*\/\s*[\s\S]*$/i,
    ];

    // Find the earliest Bootstrap start position
    const positions: number[] = [];
    for (const marker of ["/* --- Bootstrap", "/*!\n * Bootstrap", "/*! Bootstrap", ":root{--bs-blue:"]) {
      const idx = css.indexOf(marker);
      if (idx !== -1) positions.push(idx);
    }

    if (positions.length > 0) {
      const cutAt = Math.min(...positions);
      const stripped = css.slice(0, cutAt).trim();
      console.log(`[buildTheme] Stripped Bootstrap from CSS at position ${cutAt} (${Math.round(stripped.length / 1024)}KB remaining)`);
      return stripped;
    }

    return css;
  }

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

  const FRAMEWORK_CDN: Record<string, string> = {
    "bootstrap.min.css": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
    "bootstrap.css":     "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
    "font-awesome.min.css": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css",
    "font-awesome-min.css": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css",
    "all.min.css":          "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css",
  };

  // Framework files get CDN enqueue in functions.php; custom files get local asset enqueue.
  const cssEnqueues = cssFiles
    .map((f) => {
      const handle = toHandle(f.name);
      const cdnUrl = FRAMEWORK_CDN[f.name.toLowerCase()];
      if (cdnUrl) {
        return `  wp_enqueue_style(\n    '${phpSafeSlug}-${handle}',\n    '${cdnUrl}',\n    array(),\n    null\n  );`;
      }
      return `  wp_enqueue_style(\n    '${phpSafeSlug}-${handle}',\n    get_template_directory_uri() . '/assets/css/${f.name}',\n    array(),\n    '${version}'\n  );`;
    })
    .join("\n\n");

  // pageCss: only custom CSS files for REST push. Frameworks excluded — CDN <link> added to rawHtml instead.
  // Also strip any Bootstrap block that was concatenated inside a custom CSS file.
  const pageCss = cssFiles
    .filter((f) => !SKIP_PAGE_CSS.has(f.name.toLowerCase()))
    .map((f) => replaceCssAssetPathsForPageCss(stripBootstrapFromCss(f.content), uploadedFiles))
    .join("\n\n");

  // CDN <link> tags for framework CSS — prepended to rawHtml for the REST push path.
  const skippedFrameworks = cssFiles.filter((f) => SKIP_PAGE_CSS.has(f.name.toLowerCase()));
  const frameworkInlineHead = skippedFrameworks
    .map((f) => {
      const cdnUrl = FRAMEWORK_CDN[f.name.toLowerCase()];
      return cdnUrl ? `<link rel="stylesheet" href="${cdnUrl}">` : "";
    })
    .filter(Boolean)
    .join("\n");

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
    uploadedFiles,
    parsed.title || themeConfig.themeName
  );

  const rawHtmlFinal = (frameworkInlineHead ? frameworkInlineHead + "\n" : "") + replaceAssetPathsPlain(parsed.mainHtml, uploadedFiles);

  console.log(`[buildTheme] CSS files total: ${cssFiles.length} (${cssFiles.map((f) => f.name).join(", ") || "none"})`);
  console.log(`[buildTheme] CSS files inlined (framework): ${skippedFrameworks.length} (${skippedFrameworks.map((f) => f.name).join(", ") || "none"})`);
  console.log(`[buildTheme] pageCss size: ${Math.round(pageCss.length / 1024)}KB`);
  console.log(`[buildTheme] rawHtml size: ${Math.round(rawHtmlFinal.length / 1024)}KB`);
  console.log(`[buildTheme] elementorJson size: ${Math.round(elementorJson.length / 1024)}KB`);
  console.log(`[buildTheme] elementorJson sections: ${JSON.parse(elementorJson).length}`);
  console.log(`[buildTheme] widgetMap sections: ${widgetMap.length}`);
  widgetMap.forEach((section) =>
    console.log(`  [section] ${section.sectionId} — ${section.widgets.length} widget(s)`)
  );
  console.log(`[buildTheme] assetFiles to upload: ${uploadedFiles.filter((f) => f.type !== "html").length}`);
  if (frameworkInlineHead) {
    console.log(`[buildTheme] Framework CDN links prepended to rawHtml:\n${frameworkInlineHead}`);
  }
  console.groupEnd();

  return {
    headerPhp,
    footerPhp,
    indexPhp,
    functionsPhp,
    styleCss,
    pageCss,
    elementorJson,
    rawHtml: rawHtmlFinal,
    widgetMap,
    assetFiles: uploadedFiles.filter((f) => f.type !== "html"),
  };
}
