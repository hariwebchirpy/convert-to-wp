"use client";

import { useState, useEffect, useRef } from "react";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Circle,
  Copy,
  Check,
} from "lucide-react";
import {
  UploadedFile,
  ThemeConfig,
  ConversionStatus,
  ConversionResult,
  ProgressStep,
  PageEntry,
} from "@/types/converter";
import { parseHtml } from "@/lib/converter/parseHtml";
import { buildTheme } from "@/lib/converter/buildTheme";
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
      const result = buildTheme(parsed, themeConfig, uploadedFiles);
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

      {/* ── Idle: summary + start button ── */}
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
            <Button className="w-full" onClick={runConversion}>
              Start Conversion
            </Button>
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
        <Button className="w-full" onClick={runConversion}>
          Try Again
        </Button>
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
