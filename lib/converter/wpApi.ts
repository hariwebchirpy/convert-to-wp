import { WpConnection, WpUserProfile, ThemeConfig, ConversionResult, PushResult } from "@/types/converter";

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

export async function pushToWordPress(
  connection: WpConnection,
  themeConfig: ThemeConfig,
  result: ConversionResult
): Promise<PushResult> {
  try {
    const base = connection.siteUrl.replace(/\/$/, "");

    const res = await fetch(`${base}/wp-json/wp/v2/pages`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(connection.username, connection.appPassword),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: themeConfig.themeName,
        status: "draft",
        content: result.indexPhp,
        meta: {
          _elementor_edit_mode: "builder",
          _elementor_template_type: "wp-page",
          _elementor_data: result.elementorJson,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = (body as { message?: string }).message ?? `HTTP ${res.status}`;
      return { success: false, error: message };
    }

    const data = await res.json() as { id: number; link: string };
    const pageId = data.id;
    const pageUrl = data.link;
    const editUrl = `${base}/wp-admin/post.php?post=${pageId}&action=elementor`;

    return { success: true, pageId, pageUrl, editUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}
