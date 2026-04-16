import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);
const TEXT_EXTS  = new Set([".html", ".css", ".js"]);

function getMime(ext: string): string {
  switch (ext) {
    case ".png":  return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif":  return "image/gif";
    case ".svg":  return "image/svg+xml";
    case ".webp": return "image/webp";
    default:      return "application/octet-stream";
  }
}

function getType(ext: string): "html" | "css" | "js" | "image" {
  if (ext === ".html") return "html";
  if (ext === ".css")  return "css";
  if (ext === ".js")   return "js";
  return "image";
}

function scanDir(
  dir: string,
  baseDir: string,
  results: Array<{ name: string; type: "html" | "css" | "js" | "image"; content: string; size: number }>
) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      scanDir(path.join(dir, entry.name), baseDir, results);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXTS.has(ext) && !IMAGE_EXTS.has(ext)) continue;

    const fullPath = path.join(dir, entry.name);
    const stat = fs.statSync(fullPath);

    if (IMAGE_EXTS.has(ext)) {
      const buf = fs.readFileSync(fullPath);
      const b64 = buf.toString("base64");
      const mime = getMime(ext);
      results.push({
        name: entry.name,
        type: "image",
        content: `data:${mime};base64,${b64}`,
        size: stat.size,
      });
    } else {
      const text = fs.readFileSync(fullPath, "utf-8");
      results.push({
        name: entry.name,
        type: getType(ext),
        content: text,
        size: stat.size,
      });
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { dirPath } = await req.json() as { dirPath: string };

    if (!dirPath || typeof dirPath !== "string") {
      return NextResponse.json({ error: "dirPath is required" }, { status: 400 });
    }

    // Normalize path separators
    const normalized = dirPath.trim().replace(/\\/g, "/");

    if (!fs.existsSync(normalized)) {
      return NextResponse.json({ error: `Directory not found: ${normalized}` }, { status: 404 });
    }

    const stat = fs.statSync(normalized);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
    }

    const files: Array<{ name: string; type: "html" | "css" | "js" | "image"; content: string; size: number }> = [];
    scanDir(normalized, normalized, files);

    return NextResponse.json({ files });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
