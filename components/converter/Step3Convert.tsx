"use client";

import { useState, useEffect, useRef } from "react";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Circle,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import {
  UploadedFile,
  ThemeConfig,
  ConversionStatus,
  ConversionResult,
  ConversionMode,
  ProgressStep,
  PageEntry,
  ElementorSection,
} from "@/types/converter";
import { parseHtml } from "@/lib/converter/parseHtml";
import { buildTheme } from "@/lib/converter/buildTheme";
import { parseCss } from "@/lib/converter/cssParser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import WidgetMapTree from "@/components/converter/WidgetMapTree";
import JsonInspector from "@/components/converter/JsonInspector";

interface Props {
  uploadedFiles: UploadedFile[];
  themeConfig: ThemeConfig;
  conversionMode: ConversionMode;
  onConversionModeChange: (mode: ConversionMode) => void;
  conversionStatus: ConversionStatus;
  conversionResult: ConversionResult | null;
  error: string | null;
  pages: PageEntry[];
  activePageId: string | null;
  onSetActivePage: (id: string) => void;
  onConvert: (result: ConversionResult) => void;
  onStatusChange: (status: ConversionStatus, error?: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const INITIAL_STEPS: ProgressStep[] = [
  { label: "Reading HTML files", status: "pending" },
  { label: "Parsing HTML structure", status: "pending" },
  { label: "Mapping elements to Elementor widgets", status: "pending" },
  { label: "Generating WordPress theme files", status: "pending" },
  { label: "Building Elementor JSON", status: "pending" },
  { label: "Conversion complete", status: "pending" },
];

const AI_INITIAL_STEPS: ProgressStep[] = [
  { label: "Reading HTML files", status: "pending" },
  { label: "Parsing HTML structure", status: "pending" },
  { label: "Generating WordPress theme files", status: "pending" },
  { label: "Sending sections to Claude AI", status: "pending" },
  { label: "Building AI-powered Elementor JSON", status: "pending" },
  { label: "Conversion complete", status: "pending" },
];

const FILE_TABS: {
  key: keyof Omit<ConversionResult, "assetFiles" | "widgetMap" | "elementorJson" | "rawHtml">;
  label: string;
}[] = [
  { key: "styleCss",      label: "style.css" },
  { key: "functionsPhp",  label: "functions.php" },
  { key: "headerPhp",     label: "header.php" },
  { key: "footerPhp",     label: "footer.php" },
  { key: "indexPhp",      label: "index.php" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: ProgressStep["status"] }) {
  if (status === "done")
    return <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />;
  if (status === "running")
    return <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />;
  if (status === "error")
    return <XCircle className="w-5 h-5 text-red-500 shrink-0" />;
  return <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />;
}

function CodeBlock({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const lines = content.split("\n");

  return (
    <div className="relative rounded-md overflow-hidden border border-zinc-700">
      <button
        onClick={handleCopy}
        className={cn(
          "absolute top-2 right-2 z-10 flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
          copied
            ? "bg-green-700 text-green-100"
            : "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
        )}
      >
        {copied ? (
          <>
            <Check className="w-3 h-3" /> Copied!
          </>
        ) : (
          <>
            <Copy className="w-3 h-3" /> Copy
          </>
        )}
      </button>
      <div className="overflow-y-auto max-h-100 bg-zinc-900 text-zinc-100 text-sm font-mono">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="leading-6">
                <td className="select-none text-right text-zinc-500 pr-4 pl-3 w-10 text-xs align-top">
                  {i + 1}
                </td>
                <td className="pr-4 whitespace-pre-wrap break-all align-top">
                  {line || " "}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function lineCount(s: string) {
  return s.split("\n").length;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Step3Convert({
  uploadedFiles,
  themeConfig,
  conversionMode,
  onConversionModeChange,
  conversionStatus,
  conversionResult,
  error,
  pages,
  activePageId,
  onSetActivePage,
  onConvert,
  onStatusChange,
  onNext,
  onBack,
}: Props) {
  const [progressSteps, setProgressSteps] =
    useState<ProgressStep[]>(INITIAL_STEPS);
  const [activeTab, setActiveTab] = useState("widget-map");

  // Reset progress steps when switching to a different page
  const prevPageId = useRef(activePageId);
  useEffect(() => {
    if (activePageId !== prevPageId.current) {
      prevPageId.current = activePageId;
      setProgressSteps(INITIAL_STEPS);
      setActiveTab("widget-map");
    }
  }, [activePageId]);

  function setStep(
    index: number,
    status: ProgressStep["status"],
    label?: string
  ) {
    setProgressSteps((prev) =>
      prev.map((s, i) =>
        i === index ? { label: label ?? s.label, status } : s
      )
    );
  }

  async function runConversion() {
    setProgressSteps(INITIAL_STEPS);
    setActiveTab("widget-map");
    onStatusChange("converting");

    try {
      setStep(0, "running");
      await sleep(300);
      const htmlFiles = uploadedFiles.filter((f) => f.type === "html");
      const combinedHtml = htmlFiles.map((f) => f.content).join("\n");
      setStep(0, "done");

      setStep(1, "running");
      await sleep(300);
      const parsed = parseHtml(combinedHtml);
      setStep(1, "done");

      setStep(2, "running");
      await sleep(300);
      const result = buildTheme(parsed, themeConfig, uploadedFiles, conversionMode);
      const totalWidgets = result.widgetMap.reduce(
        (acc, s) => acc + s.widgets.length,
        0
      );
      setStep(
        2,
        "done",
        `Mapping elements to Elementor widgets — ${parsed.sections.length} sections · ${totalWidgets} widgets mapped`
      );

      setStep(3, "running");
      await sleep(300);
      setStep(3, "done");

      setStep(4, "running");
      await sleep(300);
      setStep(4, "done");

      setStep(5, "running");
      await sleep(300);
      setStep(5, "done");

      onConvert(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setProgressSteps((prev) => {
        const firstRunning = prev.findIndex(
          (s) => s.status === "running" || s.status === "pending"
        );
        return prev.map((s, i) =>
          i === firstRunning
            ? { ...s, status: "error", label: `${s.label} — ${msg}` }
            : s
        );
      });
      onStatusChange("error", msg);
    }
  }

  // Extract all CSS rules relevant to a section's HTML and inject as custom_css
  function injectScopedCss(section: ElementorSection, sectionHtml: string, cssText: string): ElementorSection {
    if (!cssText.trim()) return section;

    const selectorMap = parseCss(cssText);

    // Collect all classes and tag names from the section HTML
    const classMatches = sectionHtml.match(/class="([^"]+)"/g) ?? [];
    const tagMatches = sectionHtml.match(/<([a-z][a-z0-9]*)/gi) ?? [];

    const usedClasses = new Set<string>();
    for (const m of classMatches) {
      const val = m.slice(7, -1); // strip class="..."
      for (const cls of val.split(/\s+/)) {
        if (cls) usedClasses.add(`.${cls}`);
      }
    }
    const usedTags = new Set<string>();
    for (const m of tagMatches) {
      usedTags.add(m.slice(1).toLowerCase());
    }

    // Build scoped CSS string for all matching rules
    const lines: string[] = [];
    for (const [selector, props] of selectorMap) {
      // Match plain class selectors, tag selectors, and descendant combos
      const rootSel = selector.split(/[\s>+~]/)[0];
      const matches =
        usedClasses.has(rootSel) ||
        usedTags.has(rootSel) ||
        [...usedClasses].some((c) => selector.includes(c));
      if (!matches) continue;

      const declarations = Object.entries(props)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join("\n");
      if (declarations) lines.push(`${selector} {\n${declarations}\n}`);
    }

    if (lines.length === 0) return section;

    const scopedCss = lines.join("\n");
    const existing = (section.settings?.custom_css as string) ?? "";
    return {
      ...section,
      settings: {
        ...section.settings,
        custom_css: existing ? `${existing}\n${scopedCss}` : scopedCss,
      },
    };
  }

  async function callClaudeSection(
    sectionHtml: string,
    cssContext: string,
    sectionIndex: number,
    totalSections: number
  ): Promise<ElementorSection | null> {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "convert_to_elementor",
        html: sectionHtml,
        css: cssContext,
        sectionIndex,
        totalSections,
      }),
    });

    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") break;
        try {
          const parsed = JSON.parse(payload) as { text?: string; error?: string };
          if (parsed.text) accumulated += parsed.text;
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    // Extract JSON from the accumulated response (strip any markdown fences)
    const jsonMatch = accumulated.match(/```(?:json)?\s*([\s\S]*?)```/) ??
      accumulated.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : accumulated.trim();

    try {
      return JSON.parse(jsonStr) as ElementorSection;
    } catch {
      return null;
    }
  }

  async function runAiConversion() {
    setProgressSteps(AI_INITIAL_STEPS);
    setActiveTab("widget-map");
    onStatusChange("converting");

    try {
      // Step 0: read files
      setProgressSteps((p) => p.map((s, i) => i === 0 ? { ...s, status: "running" } : s));
      await sleep(200);
      const htmlFiles = uploadedFiles.filter((f) => f.type === "html");
      const combinedHtml = htmlFiles.map((f) => f.content).join("\n");
      const cssFiles = uploadedFiles.filter((f) => f.type === "css");
      const fullCss = cssFiles.map((f) => f.content).join("\n");
      const cssContext = fullCss.slice(0, 20000); // cap context sent to API
      setProgressSteps((p) => p.map((s, i) => i === 0 ? { ...s, status: "done" } : s));

      // Step 1: parse HTML
      setProgressSteps((p) => p.map((s, i) => i === 1 ? { ...s, status: "running" } : s));
      await sleep(200);
      const parsed = parseHtml(combinedHtml);
      setProgressSteps((p) => p.map((s, i) => i === 1 ? { ...s, status: "done" } : s));

      // Step 2: build base theme (PHP files, CSS, rawHtml)
      setProgressSteps((p) => p.map((s, i) => i === 2 ? { ...s, status: "running" } : s));
      await sleep(200);
      const baseResult = buildTheme(parsed, themeConfig, uploadedFiles, conversionMode);
      setProgressSteps((p) => p.map((s, i) => i === 2 ? { ...s, status: "done" } : s));

      // Step 3: call Claude AI for each section
      const totalSections = parsed.sections.length;
      setProgressSteps((p) =>
        p.map((s, i) =>
          i === 3
            ? { ...s, status: "running", label: `Sending sections to Claude AI — 0 / ${totalSections} done` }
            : s
        )
      );

      const aiSections: ElementorSection[] = [];
      for (let idx = 0; idx < totalSections; idx++) {
        const section = parsed.sections[idx];
        const aiNode = await callClaudeSection(
          section.html,
          cssContext,
          idx,
          totalSections
        );
        // Fall back to base result section if AI fails
        if (aiNode) {
          aiNode.id = `ai${idx}${Math.random().toString(16).slice(2, 8)}`;
          // Inject scoped CSS for any styles Claude may have missed
          const withCss = injectScopedCss(aiNode, section.html, fullCss);
          aiSections.push(withCss);
        } else {
          // parse the base elementorJson and grab the matching section
          try {
            const baseTemplate = JSON.parse(baseResult.elementorJson) as {
              content: ElementorSection[];
            };
            const fallback = baseTemplate.content[idx];
            if (fallback) aiSections.push(fallback);
          } catch {
            // ignore
          }
        }
        setProgressSteps((p) =>
          p.map((s, i) =>
            i === 3
              ? { ...s, label: `Sending sections to Claude AI — ${idx + 1} / ${totalSections} done` }
              : s
          )
        );
      }

      setProgressSteps((p) => p.map((s, i) => i === 3 ? { ...s, status: "done" } : s));

      // Step 4: rebuild elementorJson with AI sections
      setProgressSteps((p) => p.map((s, i) => i === 4 ? { ...s, status: "running" } : s));
      await sleep(200);

      const baseTemplate = JSON.parse(baseResult.elementorJson) as {
        version: string;
        title: string;
        type: string;
        content: ElementorSection[];
        page_settings: Record<string, unknown>;
      };
      const aiTemplate = { ...baseTemplate, content: aiSections };
      const aiElementorJson = JSON.stringify(aiTemplate, null, 2);

      // Build widget map from AI sections for display
      const aiWidgetMap = aiSections.map((sec, idx) => ({
        sectionId: sec.id ?? `ai-${idx}`,
        sectionLabel: `AI Section ${idx + 1}`,
        widgets: sec.elements?.flatMap((col) =>
          (col.elements ?? []).map((w) => ({
            type: w.widgetType ?? "html",
            label: String(
              (w.settings?.title as string) ??
              (w.settings?.text as string) ??
              (w.settings?.html as string)?.slice(0, 40) ??
              w.widgetType ??
              "widget"
            ),
            tag: "div",
            isComplex: w.widgetType === "html",
          }))
        ) ?? [],
      }));

      const aiResult: ConversionResult = {
        ...baseResult,
        elementorJson: aiElementorJson,
        widgetMap: aiWidgetMap,
      };

      setProgressSteps((p) => p.map((s, i) => i === 4 ? { ...s, status: "done" } : s));

      // Step 5: done
      setProgressSteps((p) => p.map((s, i) => i === 5 ? { ...s, status: "done" } : s));
      onConvert(aiResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setProgressSteps((prev) => {
        const firstRunning = prev.findIndex(
          (s) => s.status === "running" || s.status === "pending"
        );
        return prev.map((s, i) =>
          i === firstRunning
            ? { ...s, status: "error", label: `${s.label} — ${msg}` }
            : s
        );
      });
      onStatusChange("error", msg);
    }
  }

  const htmlCount   = uploadedFiles.filter((f) => f.type === "html").length;
  const cssCount    = uploadedFiles.filter((f) => f.type === "css").length;
  const jsCount     = uploadedFiles.filter((f) => f.type === "js").length;
  const imageCount  = uploadedFiles.filter((f) => f.type === "image").length;

  // Widget stats for stats bar
  const totalWidgetCount = conversionResult
    ? conversionResult.widgetMap.reduce((acc, s) => acc + s.widgets.length, 0)
    : 0;
  const sectionCount = conversionResult?.widgetMap.length ?? 0;

  // Status icon for page tabs
  function pageTabIcon(page: PageEntry) {
    if (page.conversionStatus === "done")      return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
    if (page.conversionStatus === "converting") return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
    if (page.conversionStatus === "error")     return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    return <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />;
  }

  const allDone = pages.length > 0 && pages.every((p) => p.conversionStatus === "done");

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 pb-8">

      {/* ── Page tabs (multi-page) ── */}
      {pages.length > 1 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Pages — convert each one:</p>
            <div className="flex flex-wrap gap-2">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => onSetActivePage(page.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-mono transition-colors",
                    page.id === activePageId
                      ? "border-primary bg-primary/5 text-primary font-semibold"
                      : "border-muted hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {pageTabIcon(page)}
                  {page.htmlFileName}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Idle: summary + mode picker + start button ── */}
      {conversionStatus === "idle" && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to Convert</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-4 space-y-1 text-sm">
              <p className="font-medium">
                {uploadedFiles.length} file
                {uploadedFiles.length !== 1 ? "s" : ""} queued
              </p>
              <p className="text-muted-foreground">
                {htmlCount} HTML · {cssCount} CSS · {jsCount} JS · {imageCount}{" "}
                {imageCount === 1 ? "image" : "images"}
              </p>
              <p className="text-muted-foreground pt-1">
                Theme:{" "}
                <span className="font-mono text-foreground">
                  {themeConfig.themeName}
                </span>{" "}
                <span className="text-muted-foreground">
                  ({themeConfig.themeSlug})
                </span>
              </p>
            </div>

            {/* ── Conversion mode picker ── */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Conversion Mode</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onConversionModeChange("php-theme")}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                    conversionMode === "php-theme"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-muted hover:border-muted-foreground/40"
                  )}
                >
                  <span className="text-sm font-semibold">PHP Theme</span>
                  <span className="text-xs text-muted-foreground leading-snug">
                    Exact visual fidelity. HTML preserved as-is inside Elementor HTML widgets.
                  </span>
                </button>
                <button
                  onClick={() => onConversionModeChange("elementor-widgets")}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                    conversionMode === "elementor-widgets"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-muted hover:border-muted-foreground/40"
                  )}
                >
                  <span className="text-sm font-semibold">Elementor Widgets</span>
                  <span className="text-xs text-muted-foreground leading-snug">
                    Native drag-and-drop editing. Headings, images, buttons and columns become live widgets.
                  </span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={runConversion}>
                Start Conversion
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={runAiConversion}
              >
                <Sparkles className="w-4 h-4 text-purple-500" />
                Convert with AI
                <span className="ml-auto text-xs text-muted-foreground font-normal">
                  Claude-powered · more accurate
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Progress steps ── */}
      {conversionStatus !== "idle" && (
        <Card>
          <CardHeader>
            <CardTitle>
              {conversionStatus === "converting"
                ? "Converting…"
                : conversionStatus === "done"
                ? "Conversion Complete"
                : "Conversion Failed"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {progressSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <StepIcon status={step.status} />
                <span
                  className={cn(
                    "text-sm pt-0.5",
                    step.status === "done" && "text-foreground",
                    step.status === "running" && "text-blue-600 font-medium",
                    step.status === "error" && "text-red-600",
                    step.status === "pending" && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Error alert + retry ── */}
      {conversionStatus === "error" && error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {conversionStatus === "error" && (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={runConversion}>
            Try Again
          </Button>
          <Button variant="outline" className="flex-1 gap-2" onClick={runAiConversion}>
            <Sparkles className="w-4 h-4 text-purple-500" />
            Try with AI
          </Button>
        </div>
      )}

      {/* ── File preview tabs (including Widget Map) ── */}
      {conversionStatus === "done" && conversionResult && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
                {/* Widget Map tab — first */}
                <TabsTrigger value="widget-map" className="text-xs">
                  Widget Map
                </TabsTrigger>
                {FILE_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.label}
                    className="font-mono text-xs"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="elementor.json" className="font-mono text-xs">
                  elementor.json
                </TabsTrigger>
              </TabsList>

              {/* Widget Map content */}
              <TabsContent value="widget-map">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground">
                    Elementor widget mapping
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {sectionCount} section{sectionCount !== 1 ? "s" : ""} detected
                  </span>
                </div>
                <WidgetMapTree widgetMap={conversionResult.widgetMap} />
              </TabsContent>

              {/* Code file tabs */}
              {FILE_TABS.map((tab) => (
                <TabsContent key={tab.key} value={tab.label}>
                  <CodeBlock content={conversionResult[tab.key]} />
                </TabsContent>
              ))}

              {/* elementor.json tab — split pane with inline issue annotations */}
              <TabsContent value="elementor.json">
                <JsonInspector json={conversionResult.elementorJson} />
              </TabsContent>
            </Tabs>

            {/* Stats bar */}
            <div className="space-y-1 pt-1 border-t">
              {/* Line counts */}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {FILE_TABS.map((tab) => (
                  <span key={tab.key} className="text-xs text-muted-foreground">
                    <span className="font-mono">{tab.label}</span>{" "}
                    {lineCount(conversionResult[tab.key])} lines
                  </span>
                ))}
              </div>
              {/* Widget counts */}
              {totalWidgetCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Widgets:{" "}
                  <span className="font-medium text-foreground">
                    {totalWidgetCount} mapped
                  </span>{" "}
                  across {sectionCount} section{sectionCount !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Bottom nav ── */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={conversionStatus === "converting"}
        >
          ← Back
        </Button>
        <Button
          className="flex-1"
          disabled={pages.length > 1 ? !allDone : conversionStatus !== "done"}
          onClick={onNext}
        >
          {pages.length > 1
            ? allDone
              ? "Next: Deploy All Pages →"
              : `Convert all pages to continue (${pages.filter((p) => p.conversionStatus === "done").length}/${pages.length} done)`
            : "Next: Deploy →"}
        </Button>
      </div>
    </div>
  );
}
