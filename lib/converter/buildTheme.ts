import { ParsedHtml, ThemeConfig, UploadedFile, ConversionResult, ConversionMode } from "@/types/converter";
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
  uploadedFiles: UploadedFile[],
  mode: ConversionMode = "php-theme"
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

  // Synthetic files for inline <style> and <script> content extracted from the HTML
  const allFiles: UploadedFile[] = [...uploadedFiles];

  if (parsed.inlineCss.trim().length > 0) {
    const existing = allFiles.find((f) => f.name === "html_style.css");
    if (!existing) {
      allFiles.push({
        id: "inline-css",
        name: "html_style.css",
        type: "css",
        content: parsed.inlineCss,
        size: parsed.inlineCss.length,
        file: new File([parsed.inlineCss], "html_style.css", { type: "text/css" }),
      });
      console.log(`[buildTheme] Created html_style.css from inline <style> tags (${Math.round(parsed.inlineCss.length / 1024)}KB)`);
    }
  }

  if (parsed.inlineJs.trim().length > 0) {
    const existing = allFiles.find((f) => f.name === "html_script.js");
    if (!existing) {
      allFiles.push({
        id: "inline-js",
        name: "html_script.js",
        type: "js",
        content: parsed.inlineJs,
        size: parsed.inlineJs.length,
        file: new File([parsed.inlineJs], "html_script.js", { type: "text/javascript" }),
      });
      console.log(`[buildTheme] Created html_script.js from inline <script> tags (${Math.round(parsed.inlineJs.length / 1024)}KB)`);
    }
  }

  const cssFiles = allFiles.filter((f) => f.type === "css");
  const jsFiles = allFiles.filter((f) => f.type === "js");

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

  // ── style.css — theme header + custom CSS only ──
  // Framework/plugin CSS files are enqueued by file path in functions.php — exclude them.
  const ENQUEUED_BY_FUNCTIONS = new Set([
    "bootstrap.min.css", "bootstrap.css",
    "font-awesome.min.css", "font-awesome-min.css", "all.min.css",
    "owl.carousel.css", "owl.carousel.min.css",
    "owl.theme.default.min.css", "owl.theme.default.css",
    "aos.css", "aos.min.css",
  ]);

  const customCssContent = cssFiles
    .filter((f) => !ENQUEUED_BY_FUNCTIONS.has(f.name.toLowerCase()))
    .map((f) => f.content)
    .join("\n\n");

  const styleCss = `/*
Theme Name: ${themeName}
Theme URI:
Author: ${author}
Description: ${description}
Version: ${version}
*/
${customCssContent ? "\n" + customCssContent : ""}`.trimEnd();

  // ── functions.php ──
  // Skip jQuery — WordPress includes it automatically.
  const SKIP_JS = new Set(["jquery.min.js", "jquery.js", "jquery-3.js"]);
  // Skip preconnect/dns-prefetch — not stylesheet links
  const SKIP_CSS_REL = new Set(["preconnect", "dns-prefetch", "preload"]);

  function toHandle(filename: string): string {
    return filename.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  }

  function usesJQuery(content: string): boolean {
    return /\$\s*\(|\bjQuery\s*\(/.test(content);
  }

  // ── External CSS <link> tags from the HTML <head> ──────────────────────────
  // These are CDN/font URLs (Google Fonts, Bootstrap CDN, etc.) that were in
  // the original HTML <head>. They must be enqueued in functions.php — otherwise
  // fonts and CDN stylesheets are completely missing from the WP theme.
  const externalCssEnqueues = parsed.linkedCssFiles
    .filter((href) => href.startsWith("http") || href.startsWith("//"))
    .map((href, i) => {
      const handle = `${phpSafeSlug}-ext-css-${i}`;
      return `  wp_enqueue_style(\n    '${handle}',\n    '${href}',\n    array(),\n    null\n  );`;
    })
    .join("\n\n");

  // ── External JS <script src> tags from the HTML <head/body> ───────────────
  // CDN scripts (e.g. Bootstrap bundle, AOS from CDN) must be enqueued too.
  const SKIP_EXT_JS = new Set(["jquery", "jquery.min", "jquery-3"]);
  const externalJsEnqueues = parsed.linkedJsFiles
    .filter((src) => src.startsWith("http") || src.startsWith("//"))
    .filter((src) => {
      const base = src.split("/").pop()?.replace(/\.[^.]+$/, "").toLowerCase() ?? "";
      return !SKIP_EXT_JS.has(base);
    })
    .map((src, i) => {
      const handle = `${phpSafeSlug}-ext-js-${i}`;
      return `  wp_enqueue_script(\n    '${handle}',\n    '${src}',\n    array(),\n    null,\n    true\n  );`;
    })
    .join("\n\n");

  const FRAMEWORK_CDN: Record<string, string> = {
    "bootstrap.min.css": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
    "bootstrap.css":     "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
    "font-awesome.min.css": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
    "font-awesome-min.css": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
    "all.min.css":          "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
  };

  // Local uploaded CSS files — framework filenames get CDN URL, others get local path
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

  // pageCss: custom CSS for REST push. Frameworks excluded — CDN <link> added to rawHtml.
  const pageCss = cssFiles
    .filter((f) => !SKIP_PAGE_CSS.has(f.name.toLowerCase()))
    .map((f) => replaceCssAssetPathsForPageCss(stripBootstrapFromCss(f.content), uploadedFiles))
    .join("\n\n");

  // CDN <link> + external font tags for the REST push path (prepended to rawHtml)
  const skippedFrameworks = cssFiles.filter((f) => SKIP_PAGE_CSS.has(f.name.toLowerCase()));
  const frameworkLinks = skippedFrameworks
    .map((f) => {
      const cdnUrl = FRAMEWORK_CDN[f.name.toLowerCase()];
      return cdnUrl ? `<link rel="stylesheet" href="${cdnUrl}">` : "";
    })
    .filter(Boolean);
  // Also include external CSS links from the HTML head (Google Fonts etc.) for REST push
  const externalCssLinks = parsed.linkedCssFiles
    .filter((href) => href.startsWith("http") || href.startsWith("//"))
    .map((href) => `<link rel="stylesheet" href="${href}">`);
  const frameworkInlineHead = [...frameworkLinks, ...externalCssLinks].join("\n");

  // Local uploaded JS files
  const jsEnqueues = jsFiles
    .filter((f) => !SKIP_JS.has(f.name.toLowerCase()))
    .map((f) => {
      const handle = toHandle(f.name);
      const deps = usesJQuery(f.content) ? "array('jquery')" : "array()";
      return `  wp_enqueue_script(\n    '${phpSafeSlug}-${handle}',\n    get_template_directory_uri() . '/assets/js/${f.name}',\n    ${deps},\n    '${version}',\n    true\n  );`;
    })
    .join("\n\n");

  // Combine all enqueue lines — external first (fonts/CDN load before local files)
  const allCssEnqueues = [externalCssEnqueues, cssEnqueues].filter(Boolean).join("\n\n");
  const allJsEnqueues  = [externalJsEnqueues,  jsEnqueues ].filter(Boolean).join("\n\n");

  const functionsPhp = `<?php
function ${phpSafeSlug}_enqueue_assets() {
${allCssEnqueues}${allCssEnqueues && allJsEnqueues ? "\n\n" : ""}${allJsEnqueues}
}
add_action('wp_enqueue_scripts', '${phpSafeSlug}_enqueue_assets');
`;

  // ── header.php ──
  const headerHtmlReplaced = replaceAssetPaths(parsed.headerHtml, allFiles);
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
  const footerHtmlReplaced = replaceAssetPaths(parsed.footerHtml, allFiles);
  const footerPhp = `${footerHtmlReplaced}
<?php wp_footer(); ?>
</body>
</html>`;

  // ── index.php ──
  const mainHtmlReplaced = replaceAssetPaths(parsed.mainHtml, allFiles);
  const indexPhp = `<?php get_header(); ?>
<main>
  ${mainHtmlReplaced}
</main>
<?php get_footer(); ?>`;

  // Collect CSS text for the style resolver (elementor-widgets mode only)
  const cssTexts = allFiles
    .filter((f) => f.type === "css")
    .map((f) => f.content);

  const { json: elementorJson, widgetMap } = buildElementorJson(
    parsed.sections,
    allFiles,
    parsed.title || themeConfig.themeName,
    mode,
    cssTexts
  );

  // For the REST push path, inline JS must be injected directly into rawHtml —
  // functions.php enqueues html_script.js for the ZIP theme, but the REST-pushed
  // page has no theme assets, so all animations/interactions would be dead without this.
  const inlineScriptTag = parsed.inlineJs.trim()
    ? `\n<script>${parsed.inlineJs}</script>`
    : "";

  const rawHtmlFinal =
    (frameworkInlineHead ? frameworkInlineHead + "\n" : "") +
    replaceAssetPathsPlain(parsed.mainHtml, allFiles) +
    inlineScriptTag;

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
  console.log(`[buildTheme] assetFiles to upload: ${allFiles.filter((f) => f.type !== "html").length}`);
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
    assetFiles: allFiles.filter((f) => f.type !== "html"),
  };
}
