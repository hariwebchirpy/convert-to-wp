import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { html, css, task } = (await req.json()) as {
      html?: string;
      css?: string;
      task: "suggest_widgets" | "fix_html" | "improve_css";
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
