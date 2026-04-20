import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { html, css, task, sectionIndex, totalSections } = (await req.json()) as {
      html?: string;
      css?: string;
      task: "suggest_widgets" | "fix_html" | "improve_css" | "convert_to_elementor";
      sectionIndex?: number;
      totalSections?: number;
    };

    if (!task) {
      return NextResponse.json({ error: "task is required" }, { status: 400 });
    }

    const systemPrompt = `You are an expert WordPress/Elementor developer helping convert static HTML sites to WordPress themes.
You understand Elementor's widget system: headings, text editors, images, buttons, dividers, HTML widgets, icon boxes, video widgets, and inner sections for multi-column layouts.
Be concise and practical. Return structured JSON when asked.`;

    let userMessage = "";

    if (task === "suggest_widgets") {
      userMessage = `Analyze this HTML section and suggest which Elementor widgets best represent each element. Return JSON array with objects: { selector: string, elementorWidget: string, reason: string }

HTML:
\`\`\`html
${html ?? ""}
\`\`\``;
    } else if (task === "fix_html") {
      userMessage = `Fix any HTML issues that would cause problems when converting to a WordPress/Elementor theme. Return the corrected HTML only, no explanation.

HTML:
\`\`\`html
${html ?? ""}
\`\`\``;
    } else if (task === "improve_css") {
      userMessage = `Review this CSS for a WordPress theme. Flag any styles that conflict with WordPress defaults or Elementor, and suggest replacements. Return JSON array: { original: string, replacement: string, reason: string }

CSS:
\`\`\`css
${css ?? ""}
\`\`\``;
    } else if (task === "convert_to_elementor") {
      userMessage = `Convert this HTML section (section ${(sectionIndex ?? 0) + 1} of ${totalSections ?? 1}) into a valid Elementor section JSON node.

CRITICAL: You MUST extract and apply CSS styles from the provided CSS context into every widget's settings. This is the most important requirement — widgets must look like the original design.

## JSON structure rules
- Return ONLY a raw JSON object — no markdown, no code fences, no explanation.
- Root: { "id": "<8-char hex>", "elType": "section", "settings": { ...section styles... }, "elements": [ ...columns... ] }
- Column: { "id": "<8-char hex>", "elType": "column", "settings": { "_column_size": <number 10-100>, "custom_css": "<scoped css>" }, "elements": [ ...widgets... ] }
- Widget: { "id": "<8-char hex>", "elType": "widget", "widgetType": "<type>", "settings": { ...ALL styles applied... }, "elements": [] }

## Widget types and their REQUIRED style settings
- "heading": title, header_size ("h1"–"h6"), align ("left"/"center"/"right"), title_color (hex/rgb), typography_typography ("custom"), typography_font_size ({"unit":"px","size":N}), typography_font_weight, typography_font_family, _padding ({"top":"","right":"","bottom":"","left":"","unit":"px","isLinked":false}), _margin
- "text-editor": editor (HTML string), text_color, typography_typography ("custom"), typography_font_size, _padding, _margin
- "image": image ({"url":"<src>"}), align, width ({"unit":"%","size":100}), _padding, _margin, css_filters_css_filter ("custom"), border_radius ({"top":"","right":"","bottom":"","left":"","unit":"px","isLinked":false})
- "button": text, link ({"url":"<href>"}), align, button_text_color, button_background_color, border_radius, typography_font_size, _padding, size ("xs"/"sm"/"md"/"lg"/"xl")
- "divider": color ({"color":"<hex>"}), weight ({"unit":"px","size":N}), _margin, _padding
- "html": html (raw HTML string), _padding, _margin
- "icon-box": title_text, description_text, title_color, description_color, icon ({"value":"<fa class>","library":"fa-solid"}), icon_color, _padding, _margin
- "spacer": space ({"unit":"px","size":N})

## Section-level style settings (apply to root section object's "settings")
- background_color (hex) — from background-color or background CSS
- background_image ({"url":"<url>"}) — from background-image CSS
- padding ({"top":"","right":"","bottom":"","left":"","unit":"px","isLinked":false})
- margin (same shape)
- custom_css — any remaining CSS rules for this section that don't map to a setting, scoped to the section selector

## CSS extraction rules
1. Look up every class and element tag in the HTML against the CSS context provided.
2. Map CSS properties to Elementor settings fields:
   - color → title_color / text_color / button_text_color
   - background-color → background_color (section) or button_background_color (button)
   - font-size → typography_font_size {"unit":"px","size":N}
   - font-weight → typography_font_weight
   - font-family → typography_font_family
   - padding → _padding dimension object
   - margin → _margin dimension object
   - text-align → align
   - border-radius → border_radius dimension object
3. For any CSS that cannot be mapped to a specific Elementor setting, add it as raw CSS in the widget's "custom_css" setting using the selector syntax: "selector { property: value; }"
4. Inline styles on the element take priority over class-based CSS.

## Multi-column layouts
For side-by-side elements, use innerSection: { "id": "...", "elType": "section", "isInner": true, "settings": {}, "elements": [ ...columns with _column_size proportional to visual width... ] }

## Other rules
- Preserve all text content exactly. Do not strip or summarise.
- Use semantic widget types wherever possible. Only use "html" for complex JS-dependent elements.
- Generate random unique 8-character hex IDs for every node.

CSS context:
\`\`\`css
${css ?? ""}
\`\`\`

HTML to convert:
\`\`\`html
${html ?? ""}
\`\`\``;
    } else {
      return NextResponse.json({ error: "Unknown task" }, { status: 400 });
    }

    const stream = client.messages.stream({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ text: event.delta.text })}\n\n`,
                ),
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Stream error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`),
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
