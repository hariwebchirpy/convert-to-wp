import { WpConnection, WpUserProfile, ThemeConfig, ConversionResult, PushResult, WpTheme } from "@/types/converter";

function basicAuth(username: string, appPassword: string): string {
  return "Basic " + btoa(`${username}:${appPassword}`);
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

    const userJson = await userRes.json() as {
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
      const siteJson = await siteRes.json() as { name?: string };
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
      headers: { Authorization: basicAuth(connection.username, connection.appPassword) },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = (body as { message?: string }).message ?? `HTTP ${res.status}`;
      return { success: false, error: message };
    }

    const raw = await res.json() as Array<{
      stylesheet: string;
      name: { rendered: string };
      status: string;
      screenshot?: string;
    }>;

    const themes: WpTheme[] = raw.map((t) => ({
      stylesheet: t.stylesheet,
      name: t.name?.rendered ?? t.stylesheet,
      status: t.status === "active" ? "active" : "inactive",
      screenshot: t.screenshot ?? undefined,
    }));

    return { success: true, themes };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ── Upload a single image to WP Media Library ─────────────────────────────────
// Returns the WP media source URL on success, or null on failure.
// SVGs are blocked by WordPress by default — we skip them and embed as data URLs instead.
async function uploadImageToWp(
  base: string,
  auth: string,
  file: { name: string; content: string }  // content is a data URL
): Promise<string | null> {
  try {
    const [meta, b64] = file.content.split(",");
    const mime = meta.match(/:(.*?);/)?.[1] ?? "image/png";

    // WP blocks SVG uploads by default — caller will embed as data URL
    if (mime === "image/svg+xml") return null;

    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });

    const formData = new FormData();
    formData.append("file", blob, file.name);

    const res = await fetch(`${base}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: { Authorization: auth },
      body: formData,
    });

    if (!res.ok) {
      // Log for debugging but don't throw — caller handles null
      console.warn(`[wpApi] Upload failed for ${file.name}: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json() as { source_url?: string };
    return data.source_url ?? null;
  } catch (err) {
    console.warn(`[wpApi] Upload error for ${file.name}:`, err);
    return null;
  }
}

// ── Replace all image references in a string ──────────────────────────────────
// Replaces every occurrence of the bare filename (with or without path prefix)
// with the supplied replacement string.
function replaceImageRef(text: string, filename: string, replacement: string): string {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match: optional path prefix (../images/, images/, img/, etc.) + filename
  // Also matches __WP_IMG__filename placeholders
  const pattern = new RegExp(
    `__WP_IMG__${escaped}|(?:(?:\\.{0,2}/)?(?:images|img|assets/images|assets/img)/)?${escaped}`,
    "g"
  );
  return text.replace(pattern, replacement);
}

export async function pushToWordPress(
  connection: WpConnection,
  themeConfig: ThemeConfig,
  result: ConversionResult,
  onProgress?: (msg: string) => void
): Promise<PushResult> {
  try {
    const base = connection.siteUrl.replace(/\/$/, "");
    const auth = basicAuth(connection.username, connection.appPassword);
    const headers = { Authorization: auth, "Content-Type": "application/json" };

    // ── Step 1: Upload images to WP Media Library ──────────────────────────
    const imageFiles = result.assetFiles.filter((f) => f.type === "image");
    const imageUrlMap = new Map<string, string>(); // filename → final URL or data URL

    onProgress?.(`Uploading ${imageFiles.length} image${imageFiles.length !== 1 ? "s" : ""}…`);

    let uploadedCount = 0;
    for (const img of imageFiles) {
      onProgress?.(`Uploading ${img.name} (${uploadedCount + 1}/${imageFiles.length})…`);
      const wpUrl = await uploadImageToWp(base, auth, img);
      if (wpUrl) {
        imageUrlMap.set(img.name, wpUrl);
        uploadedCount++;
      } else {
        // Fall back to the original data URL so the image still renders in the page
        imageUrlMap.set(img.name, img.content);
      }
    }

    // ── Step 2: Build clean HTML — replace all image references ───────────
    let cleanHtml = result.rawHtml;
    for (const [name, url] of imageUrlMap) {
      cleanHtml = replaceImageRef(cleanHtml, name, url);
    }
    // Strip any leftover __WP_IMG__ markers (shouldn't happen but safety net)
    cleanHtml = cleanHtml.replace(/__WP_IMG__([^\s"']+)/g, "$1");

    // ── Step 3: Build CSS with image URLs fixed ────────────────────────────
    // The CSS files use paths like ../images/foo.png (relative from css/ folder).
    // We rewrite those to the real WP media URL or data URL.
    let cssContent = result.assetFiles
      .filter((f) => f.type === "css")
      .map((f) => f.content)
      .join("\n");

    for (const [name, url] of imageUrlMap) {
      cssContent = replaceImageRef(cssContent, name, url);
    }

    onProgress?.("Creating WordPress page…");

    // ── Step 4: Create the draft page ─────────────────────────────────────
    // WordPress strips <style> from post content (wp_kses_post).
    // We inject CSS via the WP Customizer "Additional CSS" field instead,
    // which is stored unfiltered and applied site-wide.
    // We also write it into the page's _elementor_page_assets meta so
    // Elementor can reference it per-page.
    const createRes = await fetch(`${base}/wp-json/wp/v2/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: themeConfig.themeName,
        status: "draft",
        content: cleanHtml,
      }),
    });

    if (!createRes.ok) {
      const body = await createRes.json().catch(() => ({}));
      const message = (body as { message?: string }).message ?? `HTTP ${createRes.status}`;
      return { success: false, error: message };
    }

    const created = await createRes.json() as { id: number; link: string };
    const pageId = created.id;
    const pageUrl = created.link;

    // ── Step 5: Patch image URLs in elementorJson ─────────────────────────
    onProgress?.("Setting Elementor layout…");

    let patchedElementorJson = result.elementorJson;
    for (const [name, url] of imageUrlMap) {
      const phpTag = `<?php echo get_template_directory_uri(); ?>/assets/images/${name}`;
      patchedElementorJson = patchedElementorJson.split(phpTag).join(url);
      patchedElementorJson = replaceImageRef(patchedElementorJson, name, url);
    }

    // ── Step 6: Set Elementor meta + page-scoped CSS ──────────────────────
    // _elementor_page_css  — Elementor's per-page compiled CSS (unsanitized raw meta)
    // _elementor_css       — alias used by some Elementor versions
    // Both are written as raw post meta so wp_kses never touches them.
    const metaPayload: Record<string, string> = {
      _elementor_edit_mode: "builder",
      _elementor_template_type: "wp-page",
      _elementor_version: "3.0.0",
      _elementor_data: patchedElementorJson,
    };
    if (cssContent) {
      // Elementor reads _elementor_page_css and outputs it inside <style> in the page head
      metaPayload["_elementor_page_css"] = cssContent;
      // Also write to _elementor_css which older versions check
      metaPayload["_elementor_css"] = JSON.stringify({ status: "inline", css: cssContent });
    }

    const metaRes = await fetch(`${base}/wp-json/wp/v2/pages/${pageId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ meta: metaPayload }),
    });

    const editUrl = `${base}/wp-admin/post.php?post=${pageId}&action=elementor`;

    // ── Step 7: Push CSS to WP Customizer Additional CSS (site-wide) ──────
    // This is a guaranteed-unsanitized field exposed by the WP REST API.
    // It survives wp_kses and is output in <head> on every page.
    if (cssContent) {
      onProgress?.("Applying CSS…");
      try {
        // GET current custom_css first so we can append (not overwrite other pages' CSS)
        const settingsRes = await fetch(`${base}/wp-json/wp/v2/settings`, {
          headers: { Authorization: auth },
        });
        let existingCss = "";
        if (settingsRes.ok) {
          const settings = await settingsRes.json() as { custom_css?: string };
          existingCss = settings.custom_css ?? "";
        }

        // Wrap in a comment block so it can be identified/replaced later
        const marker = `/* === convert-to-wp: ${themeConfig.themeSlug} === */`;
        // Remove previous push for same theme (idempotent)
        const markerPattern = new RegExp(
          `/\\* === convert-to-wp: ${themeConfig.themeSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ===[^]*?/\\* === end: ${themeConfig.themeSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} === \\*/`,
          "g"
        );
        const cleaned = existingCss.replace(markerPattern, "").trim();
        const endMarker = `/* === end: ${themeConfig.themeSlug} === */`;
        const newCss = cleaned
          ? `${cleaned}\n\n${marker}\n${cssContent}\n${endMarker}`
          : `${marker}\n${cssContent}\n${endMarker}`;

        await fetch(`${base}/wp-json/wp/v2/settings`, {
          method: "POST",
          headers,
          body: JSON.stringify({ custom_css: newCss }),
        });
      } catch {
        // Non-fatal — page still created
      }
    }

    if (!metaRes.ok) {
      return {
        success: true,
        pageId,
        pageUrl,
        editUrl,
        warning: "Page created. Elementor layout could not be pre-loaded — open the page in Elementor to edit.",
      };
    }

    const failedUploads = imageFiles.length - uploadedCount;
    const warning = failedUploads > 0
      ? `${failedUploads} image(s) could not be uploaded to the Media Library and are embedded as data URLs. You can re-upload them manually later.`
      : undefined;

    return { success: true, pageId, pageUrl, editUrl, warning };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}
