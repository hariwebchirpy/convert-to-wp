"use client";

import { useState, useEffect, useRef } from "react";
import {
  Download,
  FolderArchive,
  UploadCloud,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  ConversionResult,
  WpConnection,
  ThemeConfig,
  PushResult,
  PageEntry,
} from "@/types/converter";
import { buildAndDownloadZip } from "@/lib/converter/buildZip";
import { pushToWordPress } from "@/lib/converter/wpApi";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ActionStatus = "idle" | "loading" | "done" | "error";

interface PagePushState {
  status: ActionStatus;
  result: PushResult | null;
  error: string | null;
  progress: string | null;
}

interface Props {
  conversionResult: ConversionResult;  // active page's result (kept for ZIP download)
  wpConnection: WpConnection;
  themeConfig: ThemeConfig;
  pages: PageEntry[];
  activePageId: string | null;
  onSetActivePage: (id: string) => void;
  onBack: () => void;
}

// ── Confetti dots ──────────────────────────────────────────────────
const CONFETTI_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
  "#f97316", "#6366f1", "#14b8a6", "#e11d48",
];

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {CONFETTI_COLORS.map((color, i) => (
        <span
          key={i}
          className="confetti-dot"
          style={{
            left: `${8 + (i / CONFETTI_COLORS.length) * 84}%`,
            backgroundColor: color,
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
    </div>
  );
}

export default function Step4Deploy({
  conversionResult,
  wpConnection,
  themeConfig,
  pages,
  activePageId,
  onSetActivePage,
  onBack,
}: Props) {
  const [downloadStatus, setDownloadStatus] = useState<ActionStatus>("idle");
  const [showDownloadConfetti, setShowDownloadConfetti] = useState(false);
  const [showPushConfetti, setShowPushConfetti] = useState(false);

  // Per-page push state: pageId → PagePushState
  const [pagePushStates, setPagePushStates] = useState<Map<string, PagePushState>>(new Map());

  // "Push all" control
  const [pushingAll, setPushingAll] = useState(false);
  const pushAllAbort = useRef(false);

  // Helper: get push state for a page (defaults to idle)
  function getPagePush(pageId: string): PagePushState {
    return pagePushStates.get(pageId) ?? { status: "idle", result: null, error: null, progress: null };
  }

  // Helper: update push state for one page
  function updatePagePush(pageId: string, patch: Partial<PagePushState>) {
    setPagePushStates((prev) => {
      const next = new Map(prev);
      const current = next.get(pageId) ?? { status: "idle", result: null, error: null, progress: null };
      next.set(pageId, { ...current, ...patch });
      return next;
    });
  }

  // The active page and its conversion result
  const activePage = pages.find((p) => p.id === activePageId) ?? null;

  // The active page's conversionResult — prefer from pages[], fall back to prop
  const activeConversionResult: ConversionResult | null =
    activePage?.conversionResult ?? conversionResult;

  const activePush = activePageId ? getPagePush(activePageId) : null;

  // Stats for ZIP download (use active page)
  const displayResult = activeConversionResult ?? conversionResult;
  const cssCount = displayResult.assetFiles.filter((f) => f.type === "css").length;
  const jsCount = displayResult.assetFiles.filter((f) => f.type === "js").length;
  const imageCount = displayResult.assetFiles.filter((f) => f.type === "image").length;

  const assetBytes = displayResult.assetFiles.reduce((sum, f) => sum + f.size, 0);
  const phpBytes =
    (displayResult.styleCss.length +
      displayResult.indexPhp.length +
      displayResult.headerPhp.length +
      displayResult.footerPhp.length +
      displayResult.functionsPhp.length) * 2;
  const totalKb = ((assetBytes + phpBytes) / 1024).toFixed(1);
  const totalFiles = displayResult.assetFiles.length + 6;

  // How many pages are fully pushed
  const pushedCount = pages.filter((p) => getPagePush(p.id).status === "done").length;
  const allPushed = pages.length > 0 && pushedCount === pages.length;

  // Hide confetti
  useEffect(() => {
    if (showDownloadConfetti) {
      const t = setTimeout(() => setShowDownloadConfetti(false), 1200);
      return () => clearTimeout(t);
    }
  }, [showDownloadConfetti]);

  useEffect(() => {
    if (showPushConfetti) {
      const t = setTimeout(() => setShowPushConfetti(false), 1200);
      return () => clearTimeout(t);
    }
  }, [showPushConfetti]);

  async function handleDownload() {
    setDownloadStatus("loading");
    try {
      await buildAndDownloadZip(themeConfig, displayResult);
      setDownloadStatus("done");
      setShowDownloadConfetti(true);
    } catch {
      setDownloadStatus("error");
    }
  }

  // Push a single page by its PageEntry
  async function pushPage(page: PageEntry): Promise<boolean> {
    const result = page.conversionResult;
    if (!result) return false;

    updatePagePush(page.id, { status: "loading", result: null, error: null, progress: null });

    const pushResult = await pushToWordPress(
      wpConnection,
      themeConfig,
      result,
      (msg) => updatePagePush(page.id, { progress: msg })
    );

    if (pushResult.success) {
      updatePagePush(page.id, { status: "done", result: pushResult, progress: null });
      return true;
    } else {
      updatePagePush(page.id, { status: "error", error: pushResult.error ?? "Unknown error", progress: null });
      return false;
    }
  }

  async function handlePushActive() {
    if (!activePage) return;
    const success = await pushPage(activePage);
    if (success) setShowPushConfetti(true);
  }

  async function handlePushAll() {
    setPushingAll(true);
    pushAllAbort.current = false;

    for (const page of pages) {
      if (pushAllAbort.current) break;
      // Skip already-done pages
      if (getPagePush(page.id).status === "done") continue;
      // Skip unconverted pages
      if (!page.conversionResult) continue;

      onSetActivePage(page.id);
      // Small delay so the UI updates before async work
      await new Promise((r) => setTimeout(r, 200));

      await pushPage(page);

      if (pushAllAbort.current) break;
    }

    setPushingAll(false);
    setShowPushConfetti(true);
  }

  function handleCancelPushAll() {
    pushAllAbort.current = true;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 pb-8">
      {/* ── Heading ── */}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Your theme is ready to deploy</h2>
        <p className="text-sm text-muted-foreground">
          Choose how you want to install it in WordPress
        </p>
      </div>

      {/* ── Page tabs (multi-page) ── */}
      {pages.length > 1 && (
        <Card>
          <CardContent className="pt-4 pb-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">
                Pages ({pushedCount}/{pages.length} pushed):
              </p>
              {!allPushed && (
                pushingAll ? (
                  <Button size="sm" variant="outline" onClick={handleCancelPushAll} className="h-7 text-xs">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Cancel
                  </Button>
                ) : (
                  <Button size="sm" onClick={handlePushAll} className="h-7 text-xs">
                    <UploadCloud className="w-3 h-3 mr-1" />
                    Push All Pages
                  </Button>
                )
              )}
              {allPushed && (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> All pages pushed!
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {pages.map((page) => {
                const ps = getPagePush(page.id);
                return (
                  <button
                    key={page.id}
                    onClick={() => onSetActivePage(page.id)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-mono transition-colors ${
                      page.id === activePageId
                        ? "border-primary bg-primary/5 text-primary font-semibold"
                        : "border-muted hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {ps.status === "done" ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    ) : ps.status === "loading" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    ) : ps.status === "error" ? (
                      <XCircle className="w-3.5 h-3.5 text-red-500" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 inline-block" />
                    )}
                    {page.htmlFileName}
                  </button>
                );
              })}
            </div>

            {activePage && (
              <p className="text-xs text-muted-foreground">
                Viewing: <span className="font-mono font-medium text-foreground">{activePage.htmlFileName}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Card 1: Download ZIP ── */}
      <Card className="relative overflow-hidden">
        {showDownloadConfetti && <Confetti />}
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <FolderArchive className="w-6 h-6 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <CardTitle className="text-base">Download Theme ZIP</CardTitle>
                <CardDescription className="mt-1">
                  Download the complete WordPress theme package. Install via
                  WordPress Admin → Appearance → Themes → Upload Theme.
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              disabled={downloadStatus === "loading"}
              onClick={handleDownload}
            >
              {downloadStatus === "loading" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Zipping…
                </>
              ) : downloadStatus === "done" ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                  Downloaded!
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Download ZIP
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {downloadStatus === "error" && (
            <p className="text-sm text-red-600">
              Download failed. Please try again.
            </p>
          )}
          <pre className="text-xs font-mono text-muted-foreground bg-muted rounded-md px-4 py-3 leading-6">
{`${themeConfig.themeSlug}/
├── style.css
├── index.php
├── header.php
├── footer.php
├── functions.php
├── elementor-template.json
└── assets/
    ├── css/     (${cssCount} ${cssCount === 1 ? "file" : "files"})
    ├── js/      (${jsCount} ${jsCount === 1 ? "file" : "files"})
    └── images/  (${imageCount} ${imageCount === 1 ? "file" : "files"})`}
          </pre>
          <p className="text-xs text-muted-foreground">
            Total size: ~{totalKb} KB across {totalFiles} files
          </p>
        </CardContent>
      </Card>

      {/* ── Card 2: Push to WordPress (active page) ── */}
      <Card className="relative overflow-hidden">
        {showPushConfetti && <Confetti />}
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <UploadCloud className="w-6 h-6 text-muted-foreground mt-0.5 shrink-0" />
              <div className="space-y-1">
                <CardTitle className="text-base">Push to WordPress</CardTitle>
                <CardDescription>
                  {pages.length > 1
                    ? `Push "${activePage?.htmlFileName ?? "active page"}" as a draft page in WordPress with the Elementor layout pre-loaded.`
                    : "Create a new draft page in your WordPress site with the Elementor layout pre-loaded and ready to edit."
                  }
                </CardDescription>
                <Badge
                  variant="outline"
                  className="text-xs text-muted-foreground font-normal"
                >
                  Connected: {wpConnection.siteUrl}
                </Badge>
              </div>
            </div>
            <Button
              className="shrink-0"
              disabled={
                !activeConversionResult ||
                activePush?.status === "loading" ||
                activePush?.status === "done" ||
                pushingAll
              }
              onClick={handlePushActive}
            >
              {activePush?.status === "loading" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Pushing…
                </>
              ) : activePush?.status === "done" ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Pushed!
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 mr-2" />
                  Push to WordPress
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        {activePush?.status === "loading" && activePush.progress && (
          <CardContent className="pt-0 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              {activePush.progress}
            </div>
          </CardContent>
        )}

        {activePush?.status === "done" && activePush.result && (
          <CardContent className="space-y-3">
            <div className="rounded-md border border-green-200 bg-green-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium text-green-800">
                  Page created successfully!
                </p>
              </div>
              {activePush.result.pageUrl && (
                <a
                  href={activePush.result.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline break-all"
                >
                  {activePush.result.pageUrl}
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              )}
              {activePush.result.editUrl && (
                <Button size="sm" asChild>
                  <a
                    href={activePush.result.editUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-3 h-3 mr-2" />
                    Edit in Elementor
                  </a>
                </Button>
              )}
            </div>
            {activePush.result.warning && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {activePush.result.warning}
              </div>
            )}

            {/* Collapsed Elementor JSON */}
            {activeConversionResult && (
              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground list-none flex items-center gap-1 select-none">
                  <span className="group-open:rotate-90 transition-transform inline-block">
                    ▶
                  </span>{" "}
                  View Elementor JSON
                </summary>
                <div className="mt-2 overflow-y-auto max-h-60 rounded-md border bg-zinc-900">
                  <pre className="p-3 text-xs font-mono text-zinc-200 whitespace-pre-wrap break-all">
                    {activeConversionResult.elementorJson}
                  </pre>
                </div>
              </details>
            )}
          </CardContent>
        )}

        {activePush?.status === "error" && activePush.error && (
          <CardContent className="space-y-3">
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{activePush.error}</AlertDescription>
            </Alert>
            <Button variant="outline" onClick={handlePushActive}>
              Try Again
            </Button>
          </CardContent>
        )}
      </Card>

      {/* ── Card 3: Next steps ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground">
            Next steps after installing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-muted-foreground list-none">
            {[
              "Upload the ZIP via Appearance → Themes → Upload Theme",
              "Activate the theme",
              "Open the page in Elementor editor",
              "Replace HTML widgets with native Elementor widgets",
              "Publish when ready",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* ── Bottom ── */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="ml-auto"
        >
          ← Start Over
        </Button>
      </div>
    </div>
  );
}
