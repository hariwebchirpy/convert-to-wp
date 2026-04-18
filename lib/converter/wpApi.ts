import {
  WpConnection,
  WpUserProfile,
  ThemeConfig,
  ConversionResult,
  PushResult,
  TemplateResult,
  ChildThemeDeployResult,
  WpTheme,
  UploadedFile,
} from "@/types/converter";

function basicAuth(username: string, appPassword: string): string {
  return "Basic " + btoa(`${username}:${appPassword}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toCssScopeKey(themeSlug: string, pageIdentifier?: string): string {
  const raw = pageIdentifier?.trim() || "default";
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${themeSlug}-${slug || "page"}`;
}

function upsertScopedCustomCss(
  existingCss: string,
  scopeKey: string,
  cssContent: string
): string {
  const marker = `/* === convert-to-wp:${scopeKey} === */`;
  const endMarker = `/* === end: convert-to-wp:${scopeKey} === */`;
  const markerPattern = new RegExp(
    `${escapeRegExp(marker)}[\\s\\S]*?${escapeRegExp(endMarker)}`,
    "g"
  );
  const cleaned = existingCss.replace(markerPattern, "").trim();

  if (!cleaned) {
    return `${marker}\n${cssContent}\n${endMarker}`;
  }

  return `${cleaned}\n\n${marker}\n${cssContent}\n${endMarker}`;
}

function joinWarnings(warnings: string[]): string | undefined {
  const unique = Array.from(
    new Set(warnings.map((warning) => warning.trim()).filter(Boolean))
  );
  return unique.length > 0 ? unique.join(" ") : undefined;
}

async function trySetPreferredPageTemplate(
  base: string,
  pageId: number,
  headers: Record<string, string>
): Promise<boolean> {
  // elementor_header_footer is preferred over elementor_canvas because it calls wp_head()
  // which outputs Customizer CSS and other head content. elementor_canvas skips wp_head()
  // entirely, so Customizer CSS never loads on canvas pages.
  const templateCandidates = ["elementor_header_footer", "elementor_canvas"];

  for (const template of templateCandidates) {
    try {
      const res = await fetch(`${base}/wp-json/wp/v2/pages/${pageId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ template }),
      });
      if (res.ok) return true;
    } catch {
      // Best-effort only.
    }
  }

  return false;
}

export async function testWpConnection(
  connection: WpConnection
): Promise<{ success: boolean; profile?: WpUserProfile; error?: string }> {
  try {
    const base = connection.siteUrl.replace(/\/$/, "");
    const auth = basicAuth(connection.username, connection.appPassword);

    const userRes = await fetch(`${base}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: auth },
    });

    if (!userRes.ok) {
      return { success: false, error: `HTTP ${userRes.status}` };
    }

    const userJson = (await userRes.json()) as {
      id: number;
      name: string;
      email: string;
      avatar_urls: Record<string, string>;
    };

    const siteRes = await fetch(`${base}/wp-json/wp/v2`, {
      headers: { Authorization: auth },
    });

    let siteName = base;
    if (siteRes.ok) {
      const siteJson = (await siteRes.json()) as { name?: string };
      if (siteJson.name) siteName = siteJson.name;
    }

    const profile: WpUserProfile = {
      id: userJson.id,
      name: userJson.name,
      email: userJson.email,
      avatarUrl:
        userJson.avatar_urls?.["96"] ??
        userJson.avatar_urls?.["48"] ??
        "",
      siteUrl: connection.siteUrl,
      siteName,
    };

    return { success: true, profile };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function fetchWpThemes(
  connection: WpConnection
): Promise<{ success: boolean; themes?: WpTheme[]; error?: string }> {
  try {
    const base = connection.siteUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/wp-json/wp/v2/themes?per_page=100`, {
      headers: {
        Authorization: basicAuth(connection.username, connection.appPassword),
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message =
        (body as { message?: string }).message ?? `HTTP ${res.status}`;
      return { success: false, error: message };
    }

    const raw = (await res.json()) as Array<{
      stylesheet: string;
      name: { rendered: string };
      status: string;
      screenshot?: string;
    }>;

    const themes: WpTheme[] = raw.map((theme) => ({
      stylesheet: theme.stylesheet,
      name: theme.name?.rendered ?? theme.stylesheet,
      status: theme.status === "active" ? "active" : "inactive",
      screenshot: theme.screenshot ?? undefined,
    }));

    return { success: true, themes };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}


async function uploadImageToWp(
  base: string,
  auth: string,
  file: { name: string; content: string }
): Promise<string | null> {
  try {
    const [meta, b64] = file.content.split(",");
    const mime = meta.match(/:(.*?);/)?.[1] ?? "image/png";

    if (mime === "image/svg+xml") return null;

    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mime });
    const formData = new FormData();
    formData.append("file", blob, file.name);

    const res = await fetch(`${base}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: { Authorization: auth },
      body: formData,
    });

    if (!res.ok) {
      console.warn(`[wpApi] Upload failed for ${file.name}: HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { source_url?: string };
    return data.source_url ?? null;
  } catch (err) {
    console.warn(`[wpApi] Upload error for ${file.name}:`, err);
    return null;
  }
}

function replaceImageRef(
  text: string,
  filename: string,
  replacement: string
): string {
  // Replace all path variants using plain split/join (no regex boundary issues).
  // Order: longest prefix first so ../images/ beats images/.
  const variants = [
    `__WP_IMG__${filename}`,
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

export async function pushToWordPress(
  connection: WpConnection,
  themeConfig: ThemeConfig,
  result: ConversionResult,
  onProgress?: (msg: string) => void,
  pageIdentifier?: string,
  preUploadedImageUrls?: Record<string, string>
): Promise<PushResult> {
  // Log immediately — outside try/catch so it always prints even if something throws
  console.log(`[wpApi:START] pushToWordPress called`);
  console.log(`[wpApi:START] siteUrl="${connection.siteUrl}" theme="${themeConfig.themeName}"`);
  console.log(`[wpApi:START] rawHtml=${Math.round(result.rawHtml.length / 1024)}KB pageCss=${Math.round(result.pageCss.length / 1024)}KB elementorJson=${Math.round(result.elementorJson.length / 1024)}KB assetFiles=${result.assetFiles.length}`);

  try {
    const base = connection.siteUrl.replace(/\/$/, "");
    const auth = basicAuth(connection.username, connection.appPassword);
    const headers = {
      Authorization: auth,
      "Content-Type": "application/json",
    };
    const warnings: string[] = [];

    console.group(`[wpApi] pushToWordPress → ${base}`);
    console.log(`[wpApi] Theme: "${themeConfig.themeName}" slug="${themeConfig.themeSlug}"`);
    console.log(`[wpApi] pageIdentifier: "${pageIdentifier ?? "(none)"}"`);
    console.log(`[wpApi] rawHtml size: ${Math.round(result.rawHtml.length / 1024)}KB`);
    console.log(`[wpApi] pageCss size: ${Math.round(result.pageCss.length / 1024)}KB`);
    console.log(`[wpApi] elementorJson size: ${Math.round(result.elementorJson.length / 1024)}KB`);
    console.log(`[wpApi] assetFiles: ${result.assetFiles.length} (${result.assetFiles.map((f) => f.name).join(", ")})`);

    const imageFiles = result.assetFiles.filter((file) => file.type === "image");
    // imageUrlMap: only contains SUCCESSFULLY uploaded images (real WP media URLs).
    // We never embed base64 data URLs — they bloat the payload past PHP's post_max_size.
    const imageUrlMap = new Map<string, string>();

    let uploadedCount = 0;
    if (preUploadedImageUrls && Object.keys(preUploadedImageUrls).length > 0) {
      // Reuse URLs from a previous upload — skip re-uploading
      for (const [name, url] of Object.entries(preUploadedImageUrls)) {
        imageUrlMap.set(name, url);
        uploadedCount++;
      }
      console.log(`[wpApi] Reusing ${uploadedCount} pre-uploaded image URL(s)`);
      onProgress?.(`Reusing ${uploadedCount} already-uploaded image(s)...`);
    } else {
      console.log(`[wpApi] Images to upload: ${imageFiles.length}`);
      onProgress?.(
        `Uploading ${imageFiles.length} image${imageFiles.length !== 1 ? "s" : ""}...`
      );

      for (const image of imageFiles) {
        onProgress?.(
          `Uploading ${image.name} (${uploadedCount + 1}/${imageFiles.length})...`
        );
        const wpUrl = await uploadImageToWp(base, auth, image);
        if (wpUrl) {
          imageUrlMap.set(image.name, wpUrl);
          uploadedCount++;
          console.log(`[wpApi] ✓ Uploaded ${image.name} → ${wpUrl}`);
        } else {
          console.warn(`[wpApi] ✗ Failed to upload ${image.name}`);
        }
        // Failed uploads: leave __WP_IMG__ placeholder — stripped to bare filename below.
      }
    }

    // Replace placeholders with real WP URLs where available.
    // Any remaining __WP_IMG__ markers are stripped to the bare filename.
    let cleanHtml = result.rawHtml;
    for (const [name, url] of imageUrlMap) {
      cleanHtml = replaceImageRef(cleanHtml, name, url);
    }
    cleanHtml = cleanHtml.replace(/__WP_IMG__([^\s"']+)/g, "$1");

    // Same for CSS — only replace with real WP URLs.
    // Failed images stay as bare filename references (will 404, acceptable).
    let cssContent = result.pageCss;
    for (const [name, url] of imageUrlMap) {
      cssContent = replaceImageRef(cssContent, name, url);
    }
    // Strip any remaining __WP_IMG__ markers in CSS too
    cssContent = cssContent.replace(/__WP_IMG__([^\s"')]+)/g, "$1");

    const cssSizeKb = Math.round(cssContent.length / 1024);
    console.log(`[wpApi] pageCss after image replacement: ${cssSizeKb}KB`);
    onProgress?.(`CSS size: ${cssSizeKb}KB — Creating WordPress page...`);

    // Hard cap: if CSS exceeds 400KB it will push the Elementor JSON over PHP post_max_size.
    // Truncate with a warning comment so the page still loads.
    const CSS_MAX_BYTES = 400 * 1024;
    if (cssContent.length > CSS_MAX_BYTES) {
      console.warn(`[wpApi] CSS too large (${cssSizeKb}KB) — truncating to 400KB`);
      warnings.push(
        `CSS was ${cssSizeKb}KB — truncated to 400KB to stay within WordPress limits. Download the ZIP and install as a theme for full CSS.`
      );
      cssContent = cssContent.slice(0, CSS_MAX_BYTES);
    }

    const cleanHtmlSizeKb = Math.round(cleanHtml.length / 1024);
    console.log(`[wpApi] cleanHtml size: ${cleanHtmlSizeKb}KB`);
    console.log(`[wpApi] Creating WP page with title="${themeConfig.themeName}"...`);
    onProgress?.("Creating WordPress page...");

    // Embed CSS in page content. Admins have unfiltered_html so <style> is preserved.
    // This is the fallback — Elementor will override the content field with _elementor_data,
    // but the style block survives in the DB and is output by wp_head via wp_add_inline_style.
    const pageContent = cssContent
      ? `<style id="convert-to-wp-css">${cssContent}</style>\n${cleanHtml}`
      : cleanHtml;

    const createRes = await fetch(`${base}/wp-json/wp/v2/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: themeConfig.themeName,
        status: "publish",
        content: pageContent,
      }),
    });

    if (!createRes.ok) {
      const body = await createRes.json().catch(() => ({}));
      const message =
        (body as { message?: string }).message ?? `HTTP ${createRes.status}`;
      console.error(`[wpApi] ✗ Create page failed: ${createRes.status} — ${message}`);
      console.groupEnd();
      return { success: false, error: message };
    }

    const created = (await createRes.json()) as { id: number; link: string };
    const pageId = created.id;
    const pageUrl = created.link;
    console.log(`[wpApi] ✓ Page created: id=${pageId} url=${pageUrl}`);

    const templateApplied = await trySetPreferredPageTemplate(base, pageId, headers);
    console.log(`[wpApi] Template applied: ${templateApplied}`);
    if (!templateApplied) {
      warnings.push(
        "A full-width Elementor page template could not be applied automatically, so your active theme may still wrap the page content."
      );
    }

    onProgress?.("Setting Elementor layout...");

    // elementorJson is a full template envelope { version, title, type, content, page_settings }.
    // _elementor_data needs only the content array.
    let patchedElementorJson: string;
    try {
      const envelope = JSON.parse(result.elementorJson) as { content?: unknown };
      patchedElementorJson = JSON.stringify(envelope.content ?? JSON.parse(result.elementorJson));
    } catch {
      patchedElementorJson = result.elementorJson;
    }
    console.log(`[wpApi] Elementor JSON before patching: ${Math.round(patchedElementorJson.length / 1024)}KB`);
    for (const [name, url] of imageUrlMap) {
      const phpTag = `<?php echo get_template_directory_uri(); ?>/assets/images/${name}`;
      patchedElementorJson = patchedElementorJson.split(phpTag).join(url);
      patchedElementorJson = replaceImageRef(patchedElementorJson, name, url);
    }
    console.log(`[wpApi] Elementor JSON after image patching: ${Math.round(patchedElementorJson.length / 1024)}KB`);

    // Inject CSS as an HTML widget in the first Elementor section.
    // Elementor HTML widgets are stored in _elementor_data (not post_content),
    // so they bypass wp_kses entirely — <style> tags are preserved as-is.
    if (cssContent) {
      try {
        const elSections = JSON.parse(patchedElementorJson) as Array<{
          elType: string;
          elements: Array<{
            elType: string;
            elements: Array<Record<string, unknown>>;
          }>;
          settings?: Record<string, unknown>;
        }>;

        const cssWidget = {
          id: Math.random().toString(36).slice(2, 9),
          elType: "widget",
          widgetType: "html",
          settings: { html: `<style>${cssContent}</style>` },
          elements: [],
        };

        if (elSections.length > 0) {
          const firstSection = elSections[0];
          if (firstSection.elements?.length > 0) {
            const firstColumn = firstSection.elements[0];
            firstColumn.elements = [cssWidget, ...(firstColumn.elements ?? [])];
          }
        }

        patchedElementorJson = JSON.stringify(elSections);
        console.log(`[wpApi] ✓ CSS widget injected into Elementor JSON. Size now: ${Math.round(patchedElementorJson.length / 1024)}KB`);
      } catch (e) {
        console.error(`[wpApi] ✗ CSS widget injection failed:`, e);
      }
    }

    // Build meta payload AFTER CSS has been injected into patchedElementorJson.
    // _elementor_page_settings.custom_css: Elementor's native page-level CSS field.
    // Elementor outputs this in its own <style> tag in the frontend — bypasses wp_kses,
    // works with elementor_canvas template (which skips wp_head Customizer CSS).
    const finalPayloadSize = Math.round(JSON.stringify({ meta: {
      _elementor_edit_mode: "builder",
      _elementor_template_type: "wp-page",
      _elementor_version: "3.0.0",
      _elementor_data: patchedElementorJson,
    }}).length / 1024);
    console.log(`[wpApi] Meta POST payload size: ${finalPayloadSize}KB`);
    const metaPayload: Record<string, string> = {
      _elementor_edit_mode: "builder",
      _elementor_template_type: "wp-page",
      _elementor_version: "3.0.0",
      _elementor_data: patchedElementorJson,
    };

    const metaRes = await fetch(`${base}/wp-json/wp/v2/pages/${pageId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ meta: metaPayload }),
    });
    console.log(`[wpApi] Meta POST response: ${metaRes.status} ${metaRes.statusText}`);
    if (!metaRes.ok) {
      const metaBody = await metaRes.json().catch(() => ({}));
      console.error(`[wpApi] ✗ Meta POST failed:`, metaBody);
    } else {
      console.log(`[wpApi] ✓ Elementor meta saved`);
    }

    // Push _elementor_page_settings separately as a top-level page field (object, not string).
    // This is Elementor's native "Page CSS" field — rendered by Elementor in its own <style> tag,
    // bypasses wp_kses and works with elementor_canvas template.
    if (cssContent) {
      try {
        const pageSettingsRes = await fetch(`${base}/wp-json/wp/v2/pages/${pageId}`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            meta: { _elementor_page_settings: { custom_css: cssContent } },
          }),
        });
        console.log(`[wpApi] Page settings POST: ${pageSettingsRes.status} ${pageSettingsRes.statusText}`);
        if (!pageSettingsRes.ok) {
          const psBody = await pageSettingsRes.json().catch(() => ({}));
          console.warn(`[wpApi] Page settings failed:`, psBody);
        } else {
          console.log(`[wpApi] ✓ Elementor page CSS saved via _elementor_page_settings`);
        }
      } catch (e) {
        console.warn(`[wpApi] Page settings error:`, e);
      }
    }

    const editUrl = `${base}/wp-admin/post.php?post=${pageId}&action=elementor`;

    if (cssContent) {
      onProgress?.("Applying CSS...");

      // Encode CSS as a base64 data URI and inject as <link href="data:text/css;base64,...">
      // Data URIs bypass server file restrictions, LiteSpeed file-not-found issues,
      // and WordPress mime-type blocking entirely. Browsers apply data URI stylesheets normally.
      try {
        const b64 = btoa(unescape(encodeURIComponent(cssContent)));
        const dataUri = `data:text/css;base64,${b64}`;
        const elSections = JSON.parse(patchedElementorJson) as Array<{
          elType: string;
          elements: Array<{ elType: string; elements: Array<Record<string, unknown>> }>;
        }>;
        if (elSections.length > 0 && elSections[0].elements?.length > 0) {
          const firstCol = elSections[0].elements[0];
          const widgets = firstCol.elements as Array<{ widgetType?: string; settings?: { html?: string } }>;
          const cssWidget = widgets.find((w) => w.widgetType === "html" && w.settings?.html?.includes("<style>"));
          if (cssWidget?.settings) {
            cssWidget.settings.html = `<link rel="stylesheet" href="${dataUri}">`;
            patchedElementorJson = JSON.stringify(elSections);
            console.log(`[wpApi] ✓ CSS widget updated to data URI <link> (${Math.round(dataUri.length / 1024)}KB)`);
            await fetch(`${base}/wp-json/wp/v2/pages/${pageId}`, {
              method: "POST",
              headers,
              body: JSON.stringify({ meta: { _elementor_data: patchedElementorJson } }),
            });
          }
        }
      } catch (e) {
        console.warn(`[wpApi] CSS data URI injection error:`, e);
      }

      // Clear Elementor cache
      try {
        await fetch(`${base}/wp-json/elementor/v1/cache`, { method: "DELETE", headers });
        console.log(`[wpApi] ✓ Elementor cache cleared`);
      } catch (e) { /* non-fatal */ }

      // Customizer Additional CSS — fallback
      try {
        console.log(`[wpApi] Fetching WP settings for Customizer CSS...`);
        const settingsRes = await fetch(`${base}/wp-json/wp/v2/settings`, {
          headers: { Authorization: auth },
        });
        console.log(`[wpApi] Settings GET: ${settingsRes.status}`);

        if (settingsRes.ok) {
          const settings = (await settingsRes.json()) as { custom_css?: string };
          const scopeKey = toCssScopeKey(themeConfig.themeSlug, pageIdentifier);
          const newCss = upsertScopedCustomCss(settings.custom_css ?? "", scopeKey, cssContent);
          console.log(`[wpApi] New Customizer CSS size: ${Math.round(newCss.length / 1024)}KB`);
          const saveRes = await fetch(`${base}/wp-json/wp/v2/settings`, {
            method: "POST",
            headers,
            body: JSON.stringify({ custom_css: newCss }),
          });
          console.log(`[wpApi] Customizer CSS save: ${saveRes.status}`);
          if (saveRes.ok) console.log(`[wpApi] ✓ Customizer CSS saved`);
        }
      } catch (e) {
        console.warn(`[wpApi] Customizer CSS error:`, e);
      }
    }

    if (!metaRes.ok) {
      warnings.push(
        "The page was created, but Elementor meta could not be preloaded. Open the page in Elementor and import or rebuild the layout if needed."
      );

      console.groupEnd();
      return {
        success: true,
        pageId,
        pageUrl,
        editUrl,
        warning: joinWarnings(warnings),
      };
    }

    const failedUploads = imageFiles.length - uploadedCount;
    if (failedUploads > 0) {
      warnings.push(
        `${failedUploads} image(s) could not be uploaded to the Media Library and are embedded as data URLs. You can re-upload them manually later.`
      );
    }

    // ── Auto-save as Elementor template ──────────────────────────────────────
    onProgress?.("Saving Elementor template...");
    let templateId: number | undefined;
    try {
      const templateTitle = themeConfig.themeName + (pageIdentifier ? ` — ${pageIdentifier}` : "");
      const templateRes = await fetch("/api/wp-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${base}/wp-json/wp/v2/elementor_library`,
          method: "POST",
          headers,
          body: JSON.stringify({
            title: templateTitle,
            status: "publish",
            meta: {
              _elementor_edit_mode: "builder",
              _elementor_template_type: "page",
              _elementor_version: "3.0.0",
              _elementor_data: patchedElementorJson,
            },
          }),
        }),
      });
      if (templateRes.ok) {
        const tData = await templateRes.json() as { id?: number };
        templateId = tData.id;
        console.log(`[wpApi] ✓ Elementor template saved: id=${templateId}`);
      } else {
        console.warn(`[wpApi] Template save failed: ${templateRes.status}`);
        warnings.push("Elementor template could not be saved to the library automatically.");
      }
    } catch (e) {
      console.warn(`[wpApi] Template save error:`, e);
    }

    const templateLibraryUrl = `${base}/wp-admin/edit.php?post_type=elementor_library&tabs_group=library&elementor_library_type=page`;

    console.log(`[wpApi] ✓ Push complete. pageId=${pageId} pageUrl=${pageUrl} editUrl=${editUrl}`);
    console.log(`[wpApi] Images: ${uploadedCount}/${imageFiles.length} uploaded`);
    if (warnings.length > 0) console.warn(`[wpApi] Warnings:`, warnings);
    console.groupEnd();

    return {
      success: true,
      pageId,
      pageUrl,
      editUrl,
      templateId,
      templateLibraryUrl,
      warning: joinWarnings(warnings),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[wpApi] ✗ Fatal error:`, err);
    console.groupEnd();
    return { success: false, error: message };
  }
}

// ── Child theme deploy ────────────────────────────────────────────────────────

// Safe base64 encoder for any text (including non-Latin-1 / minified CSS/JS).
// btoa() throws on chars > 0xFF — encode as UTF-8 bytes first.
function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const SKIP_JS_NAMES = new Set([
  "jquery.min.js", "jquery.js", "jquery-3.js",
  "bootstrap.popper.min.js", "popper.min.js", "popper.js",
]);

// JS files that must load before init.js (plugin libraries)
const PLUGIN_JS_NAMES = new Set([
  "owl.carousel.js", "owl.carousel.min.js",
  "aos.js", "aos.min.js",
  "bootstrap.bundle.min.js", "bootstrap.bundle.js",
]);

// CSS ordering: bootstrap → plugin CSS → custom/style.css → theme style.css
const CSS_ORDER: Record<string, number> = {
  "bootstrap.min.css": 0,
  "bootstrap.css": 0,
  "owl.carousel.css": 1,
  "owl.carousel.min.css": 1,
  "owl.theme.default.min.css": 2,
  "owl.theme.default.css": 2,
  "aos.css": 3,
  "aos.min.css": 3,
};

function toHandle(themeSlug: string, filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[._]+/g, "-").toLowerCase();
  return `${themeSlug}-${base}`;
}

function generateFunctionsPhp(
  themeSlug: string,
  cssFiles: UploadedFile[],
  jsFiles: UploadedFile[],
): string {
  const phpSlug = themeSlug.replace(/-/g, "_");
  const uri = "get_stylesheet_directory_uri()";

  // Sort CSS: known framework files first, then alphabetical for the rest
  const sortedCss = [...cssFiles].sort((a, b) => {
    const oa = CSS_ORDER[a.name.toLowerCase()] ?? 10;
    const ob = CSS_ORDER[b.name.toLowerCase()] ?? 10;
    return oa !== ob ? oa - ob : a.name.localeCompare(b.name);
  });

  // Separate plugin JS (owl, aos, bootstrap.bundle) from other JS
  const pluginJs = jsFiles.filter(
    (f) => !SKIP_JS_NAMES.has(f.name.toLowerCase()) && PLUGIN_JS_NAMES.has(f.name.toLowerCase())
  );
  const otherJs = jsFiles.filter(
    (f) => !SKIP_JS_NAMES.has(f.name.toLowerCase()) && !PLUGIN_JS_NAMES.has(f.name.toLowerCase())
      && f.name !== "init.js" && f.name !== "editor-init.js"
  );

  // Build CSS enqueue lines:
  // - Plugin/framework CSS: each independent (no chained deps)
  // - astra-child-style (root style.css): depends on astra-theme-css
  // - custom-css (css/style.css): last, depends on astra-child-style
  const cssLines: string[] = [];
  for (const f of sortedCss) {
    const handle = toHandle(themeSlug, f.name);
    cssLines.push(`    wp_enqueue_style( '${handle}', ${uri} . '/css/${f.name}', array(), null );`);
  }
  cssLines.push(`    wp_enqueue_style( 'astra-child-style', get_stylesheet_uri(), array( 'astra-theme-css' ), null );`);
  cssLines.push(`    wp_enqueue_style( 'custom-css', ${uri} . '/css/style.css', array( 'astra-child-style' ), null );`);

  // Build JS enqueue lines — order: jquery → plugin JS → other JS → init.js
  const jsLines: string[] = [];
  const pluginJsHandles: string[] = [];
  for (const f of pluginJs) {
    const handle = toHandle(themeSlug, f.name);
    pluginJsHandles.push(`'${handle}'`);
    jsLines.push(`    wp_enqueue_script( '${handle}', ${uri} . '/js/${f.name}', array( 'jquery' ), null, true );`);
  }
  for (const f of otherJs) {
    const handle = toHandle(themeSlug, f.name);
    const deps = pluginJsHandles.length ? `'jquery', ${pluginJsHandles.join(", ")}` : `'jquery'`;
    jsLines.push(`    wp_enqueue_script( '${handle}', ${uri} . '/js/${f.name}', array( ${deps} ), null, true );`);
  }
  const initDeps = ["'jquery'", ...pluginJsHandles].join(", ");
  jsLines.push(`    wp_enqueue_script( 'theme-init', ${uri} . '/js/init.js', array( ${initDeps} ), null, true );`);

  // add_editor_style takes paths relative to the theme root — no URI prefix needed
  const editorCssPaths = [
    ...sortedCss.map((f) => `css/${f.name}`),
    "css/style.css",
    "style.css",
  ];
  const editorCssArray = editorCssPaths.map((p) => `        '${p}',`).join("\n");

  // Editor JS: owl (if present) + editor-init
  const owlFile = pluginJs.find((f) => f.name.toLowerCase().includes("owl.carousel"));
  const owlEditorEnqueue = owlFile
    ? `    wp_enqueue_script( 'owl-carousel-editor', ${uri} . '/js/${owlFile.name}', array( 'jquery' ), null, true );\n`
    : "";
  const editorInitDeps = owlFile
    ? `'jquery', 'owl-carousel-editor', 'wp-data'`
    : `'jquery', 'wp-data'`;

  return `<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

// ── Editor style support ──────────────────────────────────────────────────────
add_action( 'after_setup_theme', function () {
    add_theme_support( 'editor-styles' );
    add_editor_style( array(
${editorCssArray}
    ) );
} );

// ── Frontend assets ───────────────────────────────────────────────────────────
function ${phpSlug}_enqueue_assets() {
${cssLines.join("\n")}

    wp_enqueue_script( 'jquery' );
${jsLines.join("\n")}
}
add_action( 'wp_enqueue_scripts', '${phpSlug}_enqueue_assets', 15 );

// ── Gutenberg editor assets ───────────────────────────────────────────────────
add_action( 'enqueue_block_editor_assets', function () {
    wp_enqueue_script( 'jquery' );
${owlEditorEnqueue}    wp_enqueue_script(
        'editor-init',
        get_stylesheet_directory_uri() . '/js/editor-init.js',
        array( ${editorInitDeps} ),
        null,
        true
    );
} );
`;
}

function generateInitJs(jsFiles: UploadedFile[]): string {
  const hasOwl = jsFiles.some((f) => f.name.toLowerCase().includes("owl.carousel"));
  const hasAos  = jsFiles.some((f) => f.name.toLowerCase() === "aos.js" || f.name.toLowerCase() === "aos.min.js");

  const owlBlock = hasOwl ? `
	function initOwlCarousels() {
		$('.owl-carousel').each(function () {
			if ($(this).hasClass('owl-loaded')) { return; }
			$(this).owlCarousel({
				loop: true,
				margin: 10,
				nav: true,
				responsive: { 0: { items: 1 }, 600: { items: 2 }, 992: { items: 3 } },
			});
		});
	}` : "";

  const aosBlock = hasAos ? `
	function initAOS() {
		if (typeof AOS === 'undefined') { return; }
		AOS.init({ duration: 800, once: true });
	}` : "";

  const readyCalls = [
    hasOwl ? "initOwlCarousels();" : null,
    hasAos ? "initAOS();" : null,
  ].filter(Boolean).join("\n\t\t");

  return `(function ($) {
\t'use strict';
${owlBlock}${aosBlock}

\t$(document).ready(function () {
\t\t${readyCalls || "// add initializations here"}
\t});
})(jQuery);
`;
}

function generateEditorInitJs(jsFiles: UploadedFile[]): string {
  const hasOwl = jsFiles.some((f) => f.name.toLowerCase().includes("owl.carousel"));

  const owlInit = hasOwl ? `
	function initOwlCarousels() {
		$('.owl-carousel').each(function () {
			if ($(this).hasClass('owl-loaded')) { return; }
			$(this).owlCarousel({
				loop: true,
				margin: 10,
				nav: true,
				responsive: { 0: { items: 1 }, 600: { items: 2 }, 992: { items: 3 } },
			});
		});
	}

	$(document).ready(function () {
		initOwlCarousels();
	});

	if (typeof wp !== 'undefined' && wp.data) {
		var prevBlockCount = 0;
		wp.data.subscribe(function () {
			var editor = wp.data.select('core/block-editor');
			if (!editor) { return; }
			var count = editor.getBlockCount();
			if (count !== prevBlockCount) {
				prevBlockCount = count;
				setTimeout(initOwlCarousels, 100);
			}
		});
	}` : `
	// Add editor initializations here`;

  return `(function ($) {
\t'use strict';
${owlInit}
})(jQuery);
`;
}

// ── Helper plugin ZIP builder ─────────────────────────────────────────────────
// Builds a minimal ZIP in memory containing a single PHP file that registers
// a REST endpoint for writing files into the active child theme directory.
// Uses the ZIP local-file-header + central-directory format (no compression).

function buildHelperPluginZip(): Uint8Array {
  const phpCode = `<?php
/**
 * Plugin Name: CTW File Helper
 * Description: Temporary helper for convert-to-wp child theme deploy. Safe to delete.
 * Version: 1.0
 */
add_action('rest_api_init', function() {
  register_rest_route('ctw/v1', '/upload', array(
    'methods'             => 'POST',
    'permission_callback' => function() { return current_user_can('edit_theme_options'); },
    'callback'            => function(WP_REST_Request $req) {
      $rel = sanitize_text_field($req->get_param('path'));
      $b64 = $req->get_param('content');
      if (!$rel || !$b64) return new WP_Error('bad_request', 'Missing params', array('status' => 400));
      $base = get_stylesheet_directory();
      $abs  = realpath($base) . DIRECTORY_SEPARATOR . ltrim(str_replace('/', DIRECTORY_SEPARATOR, $rel), DIRECTORY_SEPARATOR);
      if (strpos($abs, realpath($base)) !== 0) return new WP_Error('forbidden', 'Path traversal', array('status' => 403));
      wp_mkdir_p(dirname($abs));
      $ok = file_put_contents($abs, base64_decode($b64)) !== false;
      return array('ok' => $ok, 'path' => $abs);
    },
  ));
  register_rest_route('ctw/v1', '/read-theme-file', array(
    'methods'             => 'GET',
    'permission_callback' => function() { return current_user_can('edit_theme_options'); },
    'callback'            => function(WP_REST_Request $req) {
      $rel  = sanitize_text_field($req->get_param('path') ?? 'functions.php');
      $base = get_stylesheet_directory();
      $abs  = realpath($base) . DIRECTORY_SEPARATOR . ltrim($rel, '/\\\\');
      if (!file_exists($abs)) return new WP_Error('not_found', 'File not found', array('status' => 404));
      return array('content' => base64_encode(file_get_contents($abs)));
    },
  ));
});
`;

  const filename = "ctw-file-helper/ctw-file-helper.php";
  const enc = new TextEncoder();
  const fileData = enc.encode(phpCode);
  const fileNameBytes = enc.encode(filename);

  // CRC-32 table
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  const crc = crc32(fileData);
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) >>> 0;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) >>> 0;

  function u16(v: number) { return [(v & 0xff), (v >> 8) & 0xff]; }
  function u32(v: number) { return [(v & 0xff), (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]; }

  // Local file header
  const lfh = [
    0x50, 0x4b, 0x03, 0x04,   // signature
    ...u16(20),                // version needed
    ...u16(0),                 // flags
    ...u16(0),                 // compression (stored)
    ...u16(dosTime), ...u16(dosDate),
    ...u32(crc),
    ...u32(fileData.length),   // compressed size
    ...u32(fileData.length),   // uncompressed size
    ...u16(fileNameBytes.length),
    ...u16(0),                 // extra field length
    ...Array.from(fileNameBytes),
  ];

  const localOffset = 0;

  // Central directory header
  const cdh = [
    0x50, 0x4b, 0x01, 0x02,   // signature
    ...u16(20), ...u16(20),    // version made by / needed
    ...u16(0),                 // flags
    ...u16(0),                 // compression
    ...u16(dosTime), ...u16(dosDate),
    ...u32(crc),
    ...u32(fileData.length),
    ...u32(fileData.length),
    ...u16(fileNameBytes.length),
    ...u16(0),                 // extra
    ...u16(0),                 // comment
    ...u16(0),                 // disk start
    ...u16(0),                 // internal attr
    ...u32(0),                 // external attr
    ...u32(localOffset),
    ...Array.from(fileNameBytes),
  ];

  const cdhOffset = lfh.length + fileData.length;

  // End of central directory
  const eocd = [
    0x50, 0x4b, 0x05, 0x06,   // signature
    ...u16(0), ...u16(0),      // disk numbers
    ...u16(1), ...u16(1),      // entry counts
    ...u32(cdh.length),
    ...u32(cdhOffset),
    ...u16(0),                 // comment length
  ];

  const total = lfh.length + fileData.length + cdh.length + eocd.length;
  const zip = new Uint8Array(total);
  let pos = 0;
  const write = (arr: number[] | Uint8Array) => { zip.set(arr, pos); pos += arr.length; };
  write(lfh);
  write(fileData);
  write(cdh);
  write(eocd);
  return zip;
}

// ── Helper plugin download (manual install by user) ──────────────────────────

export function downloadHelperPluginZip(): void {
  const zip = buildHelperPluginZip();
  const blob = new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ctw-file-helper.zip";
  a.click();
  URL.revokeObjectURL(url);
}

// Check whether the helper plugin REST endpoint is reachable (i.e. plugin is active).
export async function checkHelperPlugin(
  connection: WpConnection
): Promise<boolean> {
  try {
    const base = connection.siteUrl.replace(/\/$/, "");
    const auth = basicAuth(connection.username, connection.appPassword);
    const res = await fetch("/api/wp-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${base}/wp-json/ctw/v1/read-theme-file?path=functions.php`,
        method: "GET",
        headers: { Authorization: auth },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Check if a file exists in the theme directory via the helper plugin.
async function themeFileExists(
  base: string,
  auth: string,
  subpath: string
): Promise<boolean> {
  try {
    const res = await fetch("/api/wp-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${base}/wp-json/ctw/v1/read-theme-file?path=${encodeURIComponent(subpath)}`,
        method: "GET",
        headers: { Authorization: auth },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Upload a single file to the child theme via the helper plugin endpoint.
async function uploadToTheme(
  base: string,
  auth: string,
  subpath: string,
  base64Content: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("/api/wp-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${base}/wp-json/ctw/v1/upload`,
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ path: subpath, content: base64Content }),
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    return { success: false, error: `HTTP ${res.status}: ${msg.slice(0, 200)}` };
  }
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!(data as { ok?: boolean }).ok) {
    return { success: false, error: `Server rejected write for ${subpath}` };
  }
  return { success: true };
}

// Read a file from the child theme via the helper plugin endpoint.
async function readThemeFile(
  base: string,
  auth: string,
  relPath: string
): Promise<string | null> {
  const res = await fetch("/api/wp-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${base}/wp-json/ctw/v1/read-theme-file?path=${encodeURIComponent(relPath)}`,
      method: "GET",
      headers: { Authorization: auth },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  const b64 = (data as { content?: string }).content;
  if (!b64) return null;
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return atob(b64);
  }
}

export async function deployChildTheme(
  connection: WpConnection,
  themeSlug: string,
  cssFiles: UploadedFile[],
  jsFiles: UploadedFile[],
  imageFiles: UploadedFile[],
  customStyleCss?: string,
  onProgress?: (msg: string) => void
): Promise<ChildThemeDeployResult> {
  const uploaded: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  try {
    const base = connection.siteUrl.replace(/\/$/, "");
    const auth = basicAuth(connection.username, connection.appPassword);

    // ── Step 1: Upload CSS files ──
    for (const file of cssFiles) {
      const subpath = `css/${file.name}`;
      const exists = await themeFileExists(base, auth, subpath);
      if (exists) {
        skipped.push(file.name);
        onProgress?.(`Skipping ${file.name} (already exists)`);
        continue;
      }
      onProgress?.(`Uploading CSS: ${file.name}...`);
      const result = await uploadToTheme(base, auth, subpath, textToBase64(file.content));
      if (result.success) uploaded.push(file.name);
      else warnings.push(`CSS ${file.name}: ${result.error}`);
    }

    // ── Step 2: Upload JS files ──
    for (const file of jsFiles) {
      if (SKIP_JS_NAMES.has(file.name.toLowerCase())) {
        skipped.push(file.name);
        onProgress?.(`Skipping ${file.name} (jQuery is built into WordPress)`);
        continue;
      }
      const subpath = `js/${file.name}`;
      const exists = await themeFileExists(base, auth, subpath);
      if (exists) {
        skipped.push(file.name);
        onProgress?.(`Skipping ${file.name} (already exists)`);
        continue;
      }
      onProgress?.(`Uploading JS: ${file.name}...`);
      const result = await uploadToTheme(base, auth, subpath, textToBase64(file.content));
      if (result.success) uploaded.push(file.name);
      else warnings.push(`JS ${file.name}: ${result.error}`);
    }

    // ── Step 3: Upload images to WP media library ──
    const imageUrlMap: Record<string, string> = {};
    if (imageFiles.length > 0) {
      onProgress?.(`Uploading ${imageFiles.length} image(s)...`);
      for (const img of imageFiles) {
        onProgress?.(`Uploading image: ${img.name}...`);
        const wpUrl = await uploadImageToWp(base, auth, img);
        if (wpUrl) { uploaded.push(img.name); imageUrlMap[img.name] = wpUrl; }
        else warnings.push(`Image ${img.name}: upload failed`);
      }
    }

    // ── Step 4: Write custom CSS to css/style.css (loaded last by functions.php) ──
    if (customStyleCss) {
      onProgress?.("Uploading css/style.css...");
      const styleResult = await uploadToTheme(base, auth, "css/style.css", textToBase64(customStyleCss));
      if (styleResult.success) uploaded.push("css/style.css");
      else warnings.push(`css/style.css: ${styleResult.error}`);
    }

    // ── Step 5: Write init.js ──
    onProgress?.("Writing js/init.js...");
    const initJs = generateInitJs(jsFiles);
    const initJsResult = await uploadToTheme(base, auth, "js/init.js", textToBase64(initJs));
    if (initJsResult.success) uploaded.push("init.js");
    else warnings.push(`init.js: ${initJsResult.error}`);

    // ── Step 6: Write editor-init.js ──
    onProgress?.("Writing js/editor-init.js...");
    const editorInitJs = generateEditorInitJs(jsFiles);
    const editorInitResult = await uploadToTheme(base, auth, "js/editor-init.js", textToBase64(editorInitJs));
    if (editorInitResult.success) uploaded.push("editor-init.js");
    else warnings.push(`editor-init.js: ${editorInitResult.error}`);

    // ── Step 7: Write final functions.php ──
    onProgress?.("Updating functions.php...");
    const newFunctionsPhp = generateFunctionsPhp(themeSlug, cssFiles, jsFiles);

    const funcResult = await uploadToTheme(base, auth, "functions.php", textToBase64(newFunctionsPhp));
    if (funcResult.success) uploaded.push("functions.php");
    else warnings.push(`functions.php: ${funcResult.error}`);

    return {
      success: true,
      uploaded,
      skipped,
      imageUrlMap,
      warning: warnings.length > 0 ? warnings.join(" | ") : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, uploaded, skipped, error: message };
  }
}

export async function pushAsElementorTemplate(
  connection: WpConnection,
  themeConfig: ThemeConfig,
  result: ConversionResult,
  onProgress?: (msg: string) => void,
  pageIdentifier?: string,
  preUploadedImageUrls?: Record<string, string>
): Promise<TemplateResult> {
  try {
    const base = connection.siteUrl.replace(/\/$/, "");
    const auth = basicAuth(connection.username, connection.appPassword);
    const headers = { Authorization: auth, "Content-Type": "application/json" };
    const warnings: string[] = [];

    const imageFiles = result.assetFiles.filter((f) => f.type === "image");
    const imageUrlMap = new Map<string, string>();

    let uploadedCount = 0;
    if (preUploadedImageUrls && Object.keys(preUploadedImageUrls).length > 0) {
      for (const [name, url] of Object.entries(preUploadedImageUrls)) {
        imageUrlMap.set(name, url);
        uploadedCount++;
      }
      onProgress?.(`Reusing ${uploadedCount} already-uploaded image(s)...`);
    } else {
      onProgress?.(`Uploading ${imageFiles.length} image(s)...`);
      for (const image of imageFiles) {
        onProgress?.(`Uploading ${image.name} (${uploadedCount + 1}/${imageFiles.length})...`);
        const wpUrl = await uploadImageToWp(base, auth, image);
        if (wpUrl) { imageUrlMap.set(image.name, wpUrl); uploadedCount++; }
      }
    }

    let cssContent = result.pageCss;
    for (const [name, url] of imageUrlMap) {
      cssContent = replaceImageRef(cssContent, name, url);
    }
    cssContent = cssContent.replace(/__WP_IMG__([^\s"')]+)/g, "$1");

    // Extract content array from template envelope
    let patchedJson: string;
    try {
      const envelope = JSON.parse(result.elementorJson) as { content?: unknown };
      patchedJson = JSON.stringify(envelope.content ?? JSON.parse(result.elementorJson));
    } catch {
      patchedJson = result.elementorJson;
    }
    for (const [name, url] of imageUrlMap) {
      patchedJson = replaceImageRef(patchedJson, name, url);
    }
    patchedJson = patchedJson.replace(/__WP_IMG__([^\s"']+)/g, "$1");

    // Inject CSS as an HTML widget at the top of the first section
    if (cssContent) {
      try {
        const sections = JSON.parse(patchedJson) as Array<{
          elType: string;
          elements: Array<{ elType: string; elements: Array<Record<string, unknown>> }>;
        }>;
        const cssWidget = {
          id: Math.random().toString(36).slice(2, 9),
          elType: "widget",
          widgetType: "html",
          settings: { html: `<style>${cssContent}</style>` },
          elements: [],
        };
        if (sections.length > 0 && sections[0].elements?.length > 0) {
          sections[0].elements[0].elements = [cssWidget, ...(sections[0].elements[0].elements ?? [])];
        }
        patchedJson = JSON.stringify(sections);
      } catch (e) {
        console.warn("[wpApi] CSS widget injection failed:", e);
      }
    }

    const title = themeConfig.themeName + (pageIdentifier ? ` — ${pageIdentifier}` : "");
    onProgress?.("Creating Elementor template...");

    // Route through /api/wp-proxy — Hostinger rejects OPTIONS preflight for
    // /wp-json/wp/v2/elementor_library so we can't call it directly from the browser.
    const templateRes = await fetch("/api/wp-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${base}/wp-json/wp/v2/elementor_library`,
        method: "POST",
        headers,
        body: JSON.stringify({
          title,
          status: "publish",
          meta: {
            _elementor_edit_mode: "builder",
            _elementor_template_type: "page",
            _elementor_version: "3.0.0",
            _elementor_data: patchedJson,
          },
        }),
      }),
    });

    if (!templateRes.ok) {
      const body = await templateRes.json().catch(() => ({}));
      const message = (body as { message?: string }).message ?? `HTTP ${templateRes.status}`;
      return { success: false, error: message };
    }

    const created = (await templateRes.json()) as { id?: number };
    const templateId = created.id;

    if (imageFiles.length - uploadedCount > 0) {
      warnings.push(`${imageFiles.length - uploadedCount} image(s) could not be uploaded and may not display.`);
    }

    const editUrl = templateId
      ? `${base}/wp-admin/edit.php?post_type=elementor_library&tabs_group=library&elementor_library_type=page`
      : undefined;

    return {
      success: true,
      templateId,
      editUrl,
      warning: joinWarnings(warnings),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}
