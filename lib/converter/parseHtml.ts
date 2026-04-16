import { ParsedHtml, ParsedSection } from "@/types/converter";

const BLOCK_TAGS = new Set(["section", "div", "article", "aside"]);

export function parseHtml(htmlContent: string): ParsedHtml {
  const doc = new DOMParser().parseFromString(htmlContent, "text/html");

  // ── title ──
  const title = doc.querySelector("title")?.textContent ?? "";

  // ── head content ──
  const headContent = doc.head.innerHTML;

  // ── linked assets ──
  const linkedCssFiles = Array.from(
    doc.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet'][href]")
  ).map((el) => el.getAttribute("href") ?? "");

  const linkedJsFiles = Array.from(
    doc.querySelectorAll<HTMLScriptElement>("script[src]")
  ).map((el) => el.getAttribute("src") ?? "");

  // ── header ──
  const headerEl =
    doc.querySelector("header") ?? doc.querySelector("nav") ?? null;
  const headerHtml = headerEl?.outerHTML ?? "";

  // ── footer ──
  const footerEl = doc.querySelector("footer");
  const footerHtml = footerEl?.outerHTML ?? "";

  // ── main / body clone ──
  const mainEl = doc.querySelector("main");
  let mainHtml: string;
  let sectionRoot: Element;

  if (mainEl) {
    mainHtml = mainEl.innerHTML;
    sectionRoot = mainEl;
  } else {
    const bodyClone = doc.body.cloneNode(true) as HTMLElement;
    bodyClone.querySelector("header")?.remove();
    bodyClone.querySelector("nav")?.remove();
    bodyClone.querySelector("footer")?.remove();
    mainHtml = bodyClone.innerHTML;
    sectionRoot = bodyClone;
  }

  // ── sections ──
  let sectionCounter = 0;
  const sections: ParsedSection[] = [];

  for (const child of Array.from(sectionRoot.children)) {
    const tag = child.tagName.toLowerCase();
    if (!BLOCK_TAGS.has(tag)) continue;
    const hasIdOrClass =
      child.id.trim() !== "" || child.className.trim() !== "";
    if (!hasIdOrClass) continue;

    sectionCounter++;
    const id =
      child.id.trim() !== "" ? child.id.trim() : `section-${sectionCounter}`;

    sections.push({ id, html: child.outerHTML, tag });
  }

  return {
    headContent,
    headerHtml,
    footerHtml,
    mainHtml,
    sections,
    title,
    linkedCssFiles,
    linkedJsFiles,
  };
}
