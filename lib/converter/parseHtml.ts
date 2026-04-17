import { ParsedHtml, ParsedSection } from "@/types/converter";

const BLOCK_TAGS = new Set(["section", "div", "article", "aside"]);

// ── Unwrap single-child wrapper divs ─────────────────────────────────────────
// Many pages wrap everything in one <div class="wrapper"> or similar.
// If the body (minus header/footer/nav) has only ONE block child and that
// child itself contains multiple block children, step into it.
function unwrapSingleWrapper(root: Element): Element {
  const blockChildren = Array.from(root.children).filter((el) =>
    BLOCK_TAGS.has(el.tagName.toLowerCase())
  );
  if (blockChildren.length === 1) {
    const only = blockChildren[0];
    const innerBlocks = Array.from(only.children).filter((el) =>
      BLOCK_TAGS.has(el.tagName.toLowerCase())
    );
    if (innerBlocks.length > 1) {
      return only; // step into the wrapper
    }
  }
  return root;
}

export function parseHtml(htmlContent: string): ParsedHtml {
  console.group("[parseHtml] Starting HTML parse");
  console.log(`[parseHtml] Input size: ${Math.round(htmlContent.length / 1024)}KB`);

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

  // Unwrap single wrapper divs (e.g. <div class="bg-tripsillay">…all sections…</div>)
  sectionRoot = unwrapSingleWrapper(sectionRoot);

  // ── sections ──
  // Strategy 1: look for direct block children with id/class
  // Strategy 2: if none found (or only 1), look for <section> tags anywhere in subtree
  let sectionCounter = 0;
  const sections: ParsedSection[] = [];

  // First pass — direct children
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

  // If we only found 0 or 1 direct section, dig deeper for <section> elements
  if (sections.length <= 1) {
    sections.length = 0;
    sectionCounter = 0;

    // Collect all <section> elements in the tree (but not nested sections inside sections)
    const allSections = Array.from(sectionRoot.querySelectorAll("section"));
    // Filter out sections that are nested inside another section
    const topLevelSections = allSections.filter(
      (s) => !s.parentElement?.closest("section")
    );

    if (topLevelSections.length > 0) {
      for (const el of topLevelSections) {
        sectionCounter++;
        const id =
          el.id.trim() !== ""
            ? el.id.trim()
            : el.className.trim().split(" ")[0] || `section-${sectionCounter}`;
        sections.push({ id, html: el.outerHTML, tag: "section" });
      }
    } else {
      // Last resort: all direct block children regardless of id/class
      for (const child of Array.from(sectionRoot.children)) {
        const tag = child.tagName.toLowerCase();
        if (!BLOCK_TAGS.has(tag)) continue;
        sectionCounter++;
        const id =
          child.id.trim() !== ""
            ? child.id.trim()
            : child.className.trim().split(" ")[0] || `section-${sectionCounter}`;
        sections.push({ id, html: child.outerHTML, tag });
      }
    }
  }

  console.log(`[parseHtml] Title: "${title}"`);
  console.log(`[parseHtml] Header HTML: ${Math.round(headerHtml.length / 1024)}KB`);
  console.log(`[parseHtml] Footer HTML: ${Math.round(footerHtml.length / 1024)}KB`);
  console.log(`[parseHtml] Main HTML: ${Math.round(mainHtml.length / 1024)}KB`);
  console.log(`[parseHtml] Sections found: ${sections.length}`);
  sections.forEach((s, i) =>
    console.log(`  [section ${i + 1}] id="${s.id}" tag=<${s.tag}> size=${Math.round(s.html.length / 1024)}KB`)
  );
  console.log(`[parseHtml] Linked CSS files: ${linkedCssFiles.length}`, linkedCssFiles);
  console.log(`[parseHtml] Linked JS files: ${linkedJsFiles.length}`, linkedJsFiles);
  console.groupEnd();

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
