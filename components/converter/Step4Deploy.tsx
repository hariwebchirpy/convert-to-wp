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
  TemplateResult,
  ChildThemeDeployResult,
  PageEntry,
  WpTheme,
} from "@/types/converter";
import { buildAndDownloadZip } from "@/lib/converter/buildZip";
import { pushToWordPress, fetchWpThemes, pushAsElementorTemplate, deployChildTheme, downloadHelperPluginZip, checkHelperPlugin } from "@/lib/converter/wpApi";
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

  // Template deploy state
  const [themes, setThemes] = useState<WpTheme[]>([]);
  const [themesStatus, setThemesStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [templateStatus, setTemplateStatus] = useState<ActionStatus>("idle");
  const [templateResult, setTemplateResult] = useState<TemplateResult | null>(null);
  const [templateProgress, setTemplateProgress] = useState<string | null>(null);

  // Child theme deploy state
  const [childThemeStatus, setChildThemeStatus] = useState<ActionStatus>("idle");
  const [childThemeResult, setChildThemeResult] = useState<ChildThemeDeployResult | null>(null);
  const [childThemeProgress, setChildThemeProgress] = useState<string | null>(null);
  const [helperPluginActive, setHelperPluginActive] = useState<boolean | null>(null);
  const [checkingHelper, setCheckingHelper] = useState(false);
  const [customStyleCss, setCustomStyleCss] = useState<string | null>(null);
  const [customStyleDragging, setCustomStyleDragging] = useState(false);
  const customStyleInputRef = useRef<HTMLInputElement>(null);

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
      displayResult.pageCss.length +
      displayResult.indexPhp.length +
      displayResult.headerPhp.length +
      displayResult.footerPhp.length +
      displayResult.functionsPhp.length) * 2;
  const totalKb = ((assetBytes + phpBytes) / 1024).toFixed(1);
  const totalFiles = displayResult.assetFiles.length + 8;

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
      (msg) => updatePagePush(page.id, { progress: msg }),
      page.htmlFileName
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

  async function handleListThemes() {
    setThemesStatus("loading");
    setThemes([]);
    setSelectedTheme(null);
    const res = await fetchWpThemes(wpConnection);
    if (res.success && res.themes) {
      setThemes(res.themes);
      setThemesStatus("done");
      // Auto-select active theme
      const active = res.themes.find((t) => t.status === "active");
      if (active) setSelectedTheme(active.stylesheet);
    } else {
      setThemesStatus("error");
    }
  }

  async function handleDeployTemplate() {
    if (!activeConversionResult) return;
    setTemplateStatus("loading");
    setTemplateResult(null);
    setTemplateProgress(null);
    const res = await pushAsElementorTemplate(
      wpConnection,
      themeConfig,
      activeConversionResult,
      (msg) => setTemplateProgress(msg),
      activePage?.htmlFileName
    );
    setTemplateStatus(res.success ? "done" : "error");
    setTemplateResult(res);
    setTemplateProgress(null);
    if (res.success) setShowPushConfetti(true);
  }

  async function handleCheckHelper() {
    setCheckingHelper(true);
    const active = await checkHelperPlugin(wpConnection);
    setHelperPluginActive(active);
    setCheckingHelper(false);
  }

  function readCustomStyleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setCustomStyleCss(e.target?.result as string ?? null);
    reader.readAsText(file);
  }

  function handleCustomStyleDrop(e: React.DragEvent) {
    e.preventDefault();
    setCustomStyleDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readCustomStyleFile(file);
  }

  function handleCustomStylePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readCustomStyleFile(file);
  }

  async function handleDeployChildTheme() {
    if (!selectedTheme || !activeConversionResult) return;
    setChildThemeStatus("loading");
    setChildThemeResult(null);
    setChildThemeProgress(null);

    const cssFiles = activeConversionResult.assetFiles.filter((f) => f.type === "css");
    const jsFiles  = activeConversionResult.assetFiles.filter((f) => f.type === "js");
    const imgFiles = activeConversionResult.assetFiles.filter((f) => f.type === "image");

    const res = await deployChildTheme(
      wpConnection,
      selectedTheme,
      cssFiles,
      jsFiles,
      imgFiles,
      customStyleCss ?? undefined,
      (msg) => setChildThemeProgress(msg)
    );

    setChildThemeStatus(res.success ? "done" : "error");
    setChildThemeResult(res);
    setChildThemeProgress(null);
    if (res.success) setShowPushConfetti(true);
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
                  Download the complete package. Import{" "}
                  <code className="text-xs bg-muted px-1 rounded">elementor-template.json</code>{" "}
                  via Elementor → Templates → Import Template, or install the
                  ZIP as a theme via Appearance → Themes.
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
├── elementor-template.json  ← import via Elementor → Templates
├── HOW-TO-IMPORT.txt
├── style.css
├── index.php
├── header.php
├── footer.php
├── functions.php
├── elementor-page.css
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
                    ? `Push "${activePage?.htmlFileName ?? "active page"}" as a draft page in WordPress with the Elementor layout pre-loaded and CSS saved through both Elementor meta and WordPress Additional CSS.`
                    : "Create a new draft page in your WordPress site with the Elementor layout pre-loaded and CSS saved through both Elementor meta and WordPress Additional CSS."
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
              <div className="flex flex-wrap gap-2">
                {activePush.result.editUrl && (
                  <Button size="sm" asChild>
                    <a href={activePush.result.editUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3 h-3 mr-2" />
                      Edit in Elementor
                    </a>
                  </Button>
                )}
                {activePush.result.templateLibraryUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={activePush.result.templateLibraryUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3 h-3 mr-2" />
                      {activePush.result.templateId ? "View Template in Library" : "Elementor Library"}
                    </a>
                  </Button>
                )}
              </div>
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

      {/* ── Card 2b: Deploy as Elementor Template ── */}
      <Card className="relative overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <UploadCloud className="w-6 h-6 text-muted-foreground mt-0.5 shrink-0" />
              <div className="space-y-1">
                <CardTitle className="text-base">Deploy as Elementor Template</CardTitle>
                <CardDescription>
                  Save the layout to your WordPress Elementor template library instead of a page. No LiteSpeed CSS stripping — CSS is embedded in the template.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: List theme directories */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Step 1 — Select a theme directory</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleListThemes}
                disabled={themesStatus === "loading"}
              >
                {themesStatus === "loading" ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Loading...</>
                ) : (
                  "List Theme Directories"
                )}
              </Button>
              {themesStatus === "error" && (
                <span className="text-xs text-red-500">Failed to fetch themes</span>
              )}
            </div>

            {themes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {themes.map((theme) => (
                  <button
                    key={theme.stylesheet}
                    onClick={() => setSelectedTheme(theme.stylesheet)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-mono transition-colors ${
                      selectedTheme === theme.stylesheet
                        ? "border-primary bg-primary/5 text-primary font-semibold"
                        : "border-muted hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {theme.stylesheet}
                    {theme.status === "active" && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-green-600 border-green-300">active</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: Deploy */}
          {themes.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                Step 2 — Upload template
                {selectedTheme && <span className="text-foreground"> to <span className="font-mono">{selectedTheme}</span></span>}
              </p>
              <Button
                onClick={handleDeployTemplate}
                disabled={
                  !selectedTheme ||
                  !activeConversionResult ||
                  templateStatus === "loading" ||
                  templateStatus === "done"
                }
              >
                {templateStatus === "loading" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deploying...</>
                ) : templateStatus === "done" ? (
                  <><CheckCircle className="w-4 h-4 mr-2" />Deployed!</>
                ) : (
                  <><UploadCloud className="w-4 h-4 mr-2" />Deploy as Template</>
                )}
              </Button>

              {templateStatus === "loading" && templateProgress && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  {templateProgress}
                </div>
              )}

              {templateStatus === "done" && templateResult && (
                <div className="rounded-md border border-green-200 bg-green-50 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <p className="text-sm font-medium text-green-800">Template saved to Elementor library!</p>
                  </div>
                  {templateResult.editUrl && (
                    <Button size="sm" asChild>
                      <a href={templateResult.editUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3 h-3 mr-2" />
                        View in Elementor Library
                      </a>
                    </Button>
                  )}
                  {templateResult.warning && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      {templateResult.warning}
                    </p>
                  )}
                </div>
              )}

              {templateStatus === "error" && templateResult?.error && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{templateResult.error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Card 3: Deploy to Child Theme ── */}
      <Card className="relative overflow-hidden">
        <CardHeader>
          <div className="flex items-start gap-3">
            <UploadCloud className="w-6 h-6 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-1">
              <CardTitle className="text-base">Deploy to Child Theme</CardTitle>
              <CardDescription>
                Upload CSS/JS files directly into your child theme folder and auto-update{" "}
                <code className="text-xs bg-muted px-1 rounded">functions.php</code>.
                Requires a one-time helper plugin install.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* ── Step 1: Helper plugin ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 1 — Install helper plugin (one time)</p>
            <p className="text-xs text-muted-foreground">
              Download this small plugin and install it in WordPress (Plugins → Add New → Upload). It adds a secure REST endpoint so this tool can write files to your theme folder. Delete it when done.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => downloadHelperPluginZip()}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download ctw-file-helper.zip
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckHelper}
                disabled={checkingHelper}
              >
                {checkingHelper ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Checking...</>
                ) : (
                  "Check if installed"
                )}
              </Button>
              {helperPluginActive === true && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <CheckCircle className="w-3.5 h-3.5" /> Plugin active
                </span>
              )}
              {helperPluginActive === false && (
                <span className="flex items-center gap-1 text-xs text-red-500">
                  <XCircle className="w-3.5 h-3.5" /> Not detected — install &amp; activate it first
                </span>
              )}
            </div>
          </div>

          {/* ── Step 2: Theme picker ── */}
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 2 — Select child theme</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleListThemes}
                disabled={themesStatus === "loading"}
              >
                {themesStatus === "loading" ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Loading...</>
                ) : (
                  "List Themes"
                )}
              </Button>
              {themesStatus === "error" && (
                <span className="text-xs text-red-500">Failed to fetch themes</span>
              )}
            </div>
            {themes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {themes.map((theme) => (
                  <button
                    key={theme.stylesheet}
                    onClick={() => setSelectedTheme(theme.stylesheet)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-mono transition-colors ${
                      selectedTheme === theme.stylesheet
                        ? "border-primary bg-primary/5 text-primary font-semibold"
                        : "border-muted hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {theme.stylesheet}
                    {theme.status === "active" && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-green-600 border-green-300">active</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Step 2b: Custom style.css ── */}
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 2b — Custom style.css <span className="normal-case font-normal text-muted-foreground">(optional)</span></p>
            <p className="text-xs text-muted-foreground">Drop your custom <code className="bg-muted px-1 rounded">style.css</code> here to overwrite the theme root <code className="bg-muted px-1 rounded">style.css</code> on deploy.</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setCustomStyleDragging(true); }}
              onDragLeave={() => setCustomStyleDragging(false)}
              onDrop={handleCustomStyleDrop}
              onClick={() => customStyleInputRef.current?.click()}
              className={`cursor-pointer rounded-md border-2 border-dashed px-4 py-5 text-center transition-colors ${
                customStyleDragging
                  ? "border-primary bg-primary/5"
                  : customStyleCss
                  ? "border-green-400 bg-green-50"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
            >
              <input
                ref={customStyleInputRef}
                type="file"
                accept=".css,text/css"
                className="hidden"
                onChange={handleCustomStylePick}
              />
              {customStyleCss ? (
                <div className="flex items-center justify-center gap-2 text-xs text-green-700">
                  <CheckCircle className="w-4 h-4" />
                  <span>style.css loaded ({(customStyleCss.length / 1024).toFixed(1)} KB)</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setCustomStyleCss(null); }}
                    className="ml-2 text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Drop <span className="font-mono">style.css</span> here or click to browse
                </p>
              )}
            </div>
          </div>

          {/* ── Step 3: Deploy ── */}
          {themes.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Step 3 — Deploy
                {selectedTheme && <span className="text-foreground normal-case font-normal"> to <span className="font-mono">{selectedTheme}</span></span>}
              </p>
              <Button
                onClick={handleDeployChildTheme}
                disabled={
                  !selectedTheme ||
                  !activeConversionResult ||
                  helperPluginActive !== true ||
                  childThemeStatus === "loading" ||
                  childThemeStatus === "done"
                }
              >
                {childThemeStatus === "loading" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deploying...</>
                ) : childThemeStatus === "done" ? (
                  <><CheckCircle className="w-4 h-4 mr-2" />Deployed!</>
                ) : (
                  <><UploadCloud className="w-4 h-4 mr-2" />Deploy to Child Theme</>
                )}
              </Button>
              {helperPluginActive !== true && childThemeStatus === "idle" && (
                <p className="text-xs text-muted-foreground">Install &amp; verify the helper plugin first.</p>
              )}

              {childThemeStatus === "loading" && childThemeProgress && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  {childThemeProgress}
                </div>
              )}

              {childThemeStatus === "done" && childThemeResult && (
                <div className="rounded-md border border-green-200 bg-green-50 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <p className="text-sm font-medium text-green-800">Child theme updated!</p>
                  </div>
                  {childThemeResult.uploaded.length > 0 && (
                    <p className="text-xs text-green-700">
                      Uploaded: {childThemeResult.uploaded.join(", ")}
                    </p>
                  )}
                  {childThemeResult.skipped.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Skipped (already exist): {childThemeResult.skipped.join(", ")}
                    </p>
                  )}
                  {childThemeResult.warning && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      {childThemeResult.warning}
                    </p>
                  )}
                </div>
              )}

              {childThemeStatus === "error" && childThemeResult?.error && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{childThemeResult.error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Card 4: Next steps ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground">
            Next steps after installing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-muted-foreground list-none">
            {[
              "Go to Elementor → Templates → Saved Templates → Import Templates",
              "Select elementor-template.json from the downloaded ZIP",
              "Create a new page, open it in Elementor, click the folder icon → My Templates → Insert",
              "All headings, text, images, and buttons are already native Elementor widgets — edit freely",
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

