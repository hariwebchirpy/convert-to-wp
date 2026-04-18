"use client";

import { useState, useEffect } from "react";
import {
  Download,
  FolderArchive,
  UploadCloud,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  ConversionResult,
  WpConnection,
  ThemeConfig,
  ChildThemeDeployResult,
  TemplateResult,
  PageEntry,
  WpTheme,
} from "@/types/converter";
import { buildAndDownloadZip } from "@/lib/converter/buildZip";
import {
  fetchWpThemes,
  deployChildTheme,
  downloadHelperPluginZip,
  checkHelperPlugin,
  pushAsElementorTemplate,
  pushToWordPress,
} from "@/lib/converter/wpApi";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ActionStatus = "idle" | "loading" | "done" | "error";

// Track which asset files have already been uploaded to the child theme
interface UploadedAssets {
  cssFiles: string[];   // filenames
  jsFiles: string[];
  imageFiles: string[];
  styleUploaded: boolean;
}

interface Props {
  conversionResult: ConversionResult;
  wpConnection: WpConnection;
  themeConfig: ThemeConfig;
  pages: PageEntry[];
  activePageId: string | null;
  onSetActivePage: (id: string) => void;
  onBack: () => void;
  customStyleCss: string | null;
  selectedTheme: string | null;
  onSelectedTheme: (slug: string | null) => void;
}

// ── Confetti ──────────────────────────────────────────────────────────────────
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
  customStyleCss,
  selectedTheme,
  onSelectedTheme,
}: Props) {
  // ZIP download
  const [downloadStatus, setDownloadStatus] = useState<ActionStatus>("idle");
  const [showConfetti, setShowConfetti] = useState(false);

  // Helper plugin
  const [helperPluginActive, setHelperPluginActive] = useState<boolean | null>(null);
  const [checkingHelper, setCheckingHelper] = useState(false);

  // Theme list
  const [themes, setThemes] = useState<WpTheme[]>([]);
  const [themesStatus, setThemesStatus] = useState<ActionStatus>("idle");

  // Step 3: Upload assets
  const [assetsStatus, setAssetsStatus] = useState<ActionStatus>("idle");
  const [assetsProgress, setAssetsProgress] = useState<string | null>(null);
  const [assetsResult, setAssetsResult] = useState<ChildThemeDeployResult | null>(null);
  // Track already-uploaded assets so we don't re-upload on step 4/5
  const [uploadedAssets, setUploadedAssets] = useState<UploadedAssets>({
    cssFiles: [],
    jsFiles: [],
    imageFiles: [],
    styleUploaded: false,
  });
  // filename → WP media URL, populated after step 3, reused in steps 4 & 5
  const [imageUrlMap, setImageUrlMap] = useState<Record<string, string>>({});

  // Step 4: Publish template
  const [templateStatus, setTemplateStatus] = useState<ActionStatus>("idle");
  const [templateProgress, setTemplateProgress] = useState<string | null>(null);
  const [templateResult, setTemplateResult] = useState<TemplateResult | null>(null);

  // Step 5: Publish page (per active page)
  const [pageStatus, setPageStatus] = useState<ActionStatus>("idle");
  const [pageProgress, setPageProgress] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [pageEditUrl, setPageEditUrl] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (showConfetti) {
      const t = setTimeout(() => setShowConfetti(false), 1200);
      return () => clearTimeout(t);
    }
  }, [showConfetti]);

  const activePage = pages.find((p) => p.id === activePageId) ?? null;
  const activeConversionResult: ConversionResult =
    activePage?.conversionResult ?? conversionResult;

  // Stats
  const cssCount = activeConversionResult.assetFiles.filter((f) => f.type === "css").length;
  const jsCount  = activeConversionResult.assetFiles.filter((f) => f.type === "js").length;
  const imageCount = activeConversionResult.assetFiles.filter((f) => f.type === "image").length;
  const assetBytes = activeConversionResult.assetFiles.reduce((s, f) => s + f.size, 0);
  const phpBytes = (
    activeConversionResult.styleCss.length +
    activeConversionResult.pageCss.length +
    activeConversionResult.indexPhp.length +
    activeConversionResult.headerPhp.length +
    activeConversionResult.footerPhp.length +
    activeConversionResult.functionsPhp.length
  ) * 2;
  const totalKb = ((assetBytes + phpBytes) / 1024).toFixed(1);
  const totalFiles = activeConversionResult.assetFiles.length + 8;

  async function handleDownload() {
    setDownloadStatus("loading");
    try {
      await buildAndDownloadZip(themeConfig, activeConversionResult);
      setDownloadStatus("done");
      setShowConfetti(true);
    } catch {
      setDownloadStatus("error");
    }
  }

  async function handleCheckHelper() {
    setCheckingHelper(true);
    const active = await checkHelperPlugin(wpConnection);
    setHelperPluginActive(active);
    setCheckingHelper(false);
  }

  async function handleListThemes() {
    setThemesStatus("loading");
    setThemes([]);
    onSelectedTheme(null);
    const res = await fetchWpThemes(wpConnection);
    if (res.success && res.themes) {
      setThemes(res.themes);
      setThemesStatus("done");
      const active = res.themes.find((t) => t.status === "active");
      if (active) onSelectedTheme(active.stylesheet);
    } else {
      setThemesStatus("error");
    }
  }

  // Step 3: Upload CSS/JS/images to child theme (skips already-uploaded files)
  async function handleUploadAssets() {
    if (!selectedTheme) return;
    setAssetsStatus("loading");
    setAssetsResult(null);
    setAssetsProgress(null);

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
      (msg) => setAssetsProgress(msg)
    );

    setAssetsStatus(res.success ? "done" : "error");
    setAssetsResult(res);
    setAssetsProgress(null);

    if (res.success) {
      setUploadedAssets({
        cssFiles: cssFiles.map((f) => f.name),
        jsFiles:  jsFiles.map((f) => f.name),
        imageFiles: imgFiles.map((f) => f.name),
        styleUploaded: !!customStyleCss,
      });
      setImageUrlMap(res.imageUrlMap ?? {});
      // steps 4 & 5 trigger automatically via useEffect below
    }
  }

  async function handleReUploadAssets() {
    setUploadedAssets({ cssFiles: [], jsFiles: [], imageFiles: [], styleUploaded: false });
    setImageUrlMap({});
    setAssetsStatus("idle");
    setAssetsResult(null);
    setTemplateStatus("idle");
    setTemplateResult(null);
    setPageStatus("idle");
    setPageUrl(null);
    setPageEditUrl(null);
    setPageError(null);
  }

  // Auto-run step 4 when step 3 succeeds
  useEffect(() => {
    if (assetsStatus !== "done" || templateStatus !== "idle") return;
    (async () => {
      setTemplateStatus("loading");
      setTemplateResult(null);
      setTemplateProgress(null);
      const res = await pushAsElementorTemplate(
        wpConnection,
        themeConfig,
        activeConversionResult,
        (msg) => setTemplateProgress(msg),
        activePage?.htmlFileName,
        imageUrlMap
      );
      setTemplateStatus(res.success ? "done" : "error");
      setTemplateResult(res);
      setTemplateProgress(null);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsStatus]);

  // Auto-run step 5 when step 4 succeeds
  useEffect(() => {
    if (templateStatus !== "done" || pageStatus !== "idle") return;
    (async () => {
      setPageStatus("loading");
      setPageUrl(null);
      setPageEditUrl(null);
      setPageError(null);
      const res = await pushToWordPress(
        wpConnection,
        themeConfig,
        activeConversionResult,
        (msg) => setPageProgress(msg),
        activePage?.htmlFileName,
        imageUrlMap
      );
      setPageProgress(null);
      if (res.success) {
        setPageStatus("done");
        setPageUrl(res.pageUrl ?? null);
        setPageEditUrl(res.editUrl ?? null);
        setShowConfetti(true);
      } else {
        setPageStatus("error");
        setPageError(res.error ?? "Unknown error");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateStatus]);


  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 pb-8">
      {/* ── Heading ── */}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Deploy to Child Theme</h2>
        <p className="text-sm text-muted-foreground">
          Follow the steps below to push your converted site directly into WordPress
        </p>
      </div>

      {/* ── Multi-page tabs ── */}
      {pages.length > 1 && (
        <Card>
          <CardContent className="pt-4 pb-3 space-y-3">
            <p className="text-xs text-muted-foreground font-medium">
              Pages ({pages.length} total):
            </p>
            <div className="flex flex-wrap gap-2">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => onSetActivePage(page.id)}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-mono transition-colors ${
                    page.id === activePageId
                      ? "border-primary bg-primary/5 text-primary font-semibold"
                      : "border-muted hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {page.htmlFileName}
                </button>
              ))}
            </div>
            {activePage && (
              <p className="text-xs text-muted-foreground">
                Active: <span className="font-mono font-medium text-foreground">{activePage.htmlFileName}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Download ZIP (always available) ── */}
      <Card className="relative overflow-hidden">
        {showConfetti && <Confetti />}
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <FolderArchive className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <CardTitle className="text-sm font-medium">Download Theme ZIP</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Full theme package with PHP files, assets, and Elementor JSON
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={downloadStatus === "loading"}
              onClick={handleDownload}
            >
              {downloadStatus === "loading" ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Zipping…</>
              ) : downloadStatus === "done" ? (
                <><CheckCircle className="w-3.5 h-3.5 mr-1.5 text-green-500" />Downloaded!</>
              ) : (
                <><Download className="w-3.5 h-3.5 mr-1.5" />Download ZIP</>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="text-xs font-mono text-muted-foreground bg-muted rounded-md px-4 py-3 leading-6">
{`${themeConfig.themeSlug}/
├── elementor-template.json
├── style.css
├── index.php / header.php / footer.php / functions.php
└── assets/
    ├── css/     (${cssCount} ${cssCount === 1 ? "file" : "files"})
    ├── js/      (${jsCount} ${jsCount === 1 ? "file" : "files"})
    └── images/  (${imageCount} ${imageCount === 1 ? "file" : "files"})`}
          </pre>
          <p className="text-xs text-muted-foreground mt-2">
            ~{totalKb} KB across {totalFiles} files
          </p>
        </CardContent>
      </Card>

      {/* ══ Deploy steps ══════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Deploy to WordPress
        </h3>

        {/* ── Step 1: Install helper plugin ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <StepBadge n={1} done={helperPluginActive === true} />
              <CardTitle className="text-sm">Install helper plugin (one time)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Download this small plugin and install it in WordPress (Plugins → Add New → Upload Plugin).
              It adds a secure REST endpoint so this tool can write files to your theme folder. Delete it when done.
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
          </CardContent>
        </Card>

        {/* ── Step 2: Select child theme ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <StepBadge n={2} done={!!selectedTheme} />
              <CardTitle className="text-sm">Select child theme</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
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
              <div className="flex flex-wrap gap-2">
                {themes.map((theme) => (
                  <button
                    key={theme.stylesheet}
                    onClick={() => onSelectedTheme(theme.stylesheet)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-mono transition-colors ${
                      selectedTheme === theme.stylesheet
                        ? "border-primary bg-primary/5 text-primary font-semibold"
                        : "border-muted hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {theme.stylesheet}
                    {theme.status === "active" && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-green-600 border-green-300">
                        active
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}

            {selectedTheme && (
              <p className="text-xs text-green-700 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Selected: <span className="font-mono font-semibold ml-1">{selectedTheme}</span>
              </p>
            )}
            {customStyleCss && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                Custom style.css ready ({(customStyleCss.length / 1024).toFixed(1)} KB)
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Step 3: Upload files ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StepBadge n={3} done={assetsStatus === "done"} />
                <CardTitle className="text-sm">Upload files to child theme</CardTitle>
              </div>
              {assetsStatus === "done" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={handleReUploadAssets}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Re-upload
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Uploads CSS, JS, and images to your child theme. Already-uploaded files are skipped automatically.
            </p>

            {assetsStatus !== "done" && (
              <Button
                onClick={handleUploadAssets}
                disabled={
                  !selectedTheme ||
                  helperPluginActive !== true ||
                  assetsStatus === "loading"
                }
              >
                {assetsStatus === "loading" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</>
                ) : (
                  <><UploadCloud className="w-4 h-4 mr-2" />Upload Files</>
                )}
              </Button>
            )}

            {helperPluginActive !== true && assetsStatus === "idle" && (
              <p className="text-xs text-muted-foreground">Complete steps 1 &amp; 2 first.</p>
            )}

            {assetsStatus === "loading" && assetsProgress && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                {assetsProgress}
              </div>
            )}

            {assetsStatus === "done" && assetsResult && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-medium text-green-800">Files uploaded to child theme!</p>
                </div>
                {assetsResult.uploaded.length > 0 && (
                  <p className="text-xs text-green-700">
                    Uploaded: {assetsResult.uploaded.join(", ")}
                  </p>
                )}
                {assetsResult.skipped.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Skipped (already exist): {assetsResult.skipped.join(", ")}
                  </p>
                )}
                {assetsResult.warning && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    {assetsResult.warning}
                  </p>
                )}
              </div>
            )}

            {assetsStatus === "error" && assetsResult?.error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{assetsResult.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* ── Step 4: Publish Elementor template ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <StepBadge n={4} done={templateStatus === "done"} />
              <CardTitle className="text-sm">Publish Elementor template</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Saves the layout to your Elementor template library. Starts automatically after step 3.
            </p>

            {templateStatus === "idle" && (
              <p className="text-xs text-muted-foreground">Waiting for step 3 to complete…</p>
            )}

            {templateStatus === "loading" && templateProgress && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                {templateProgress}
              </div>
            )}

            {templateStatus === "done" && templateResult && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-medium text-green-800">Template saved to Elementor library!</p>
                </div>
                {templateResult.editUrl && (
                  <Button size="sm" variant="outline" asChild>
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
          </CardContent>
        </Card>

        {/* ── Step 5: Publish page ── */}
        <Card className="relative overflow-hidden">
          {showConfetti && pageStatus === "done" && <Confetti />}
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <StepBadge n={5} done={pageStatus === "done"} />
              <CardTitle className="text-sm">Publish page</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Creates a WordPress page with Elementor layout pre-loaded. Starts automatically after step 4.
            </p>

            {pageStatus === "idle" && (
              <p className="text-xs text-muted-foreground">Waiting for step 4 to complete…</p>
            )}

            {pageStatus === "loading" && pageProgress && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                {pageProgress}
              </div>
            )}

            {pageStatus === "done" && pageUrl && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-medium text-green-800">Page published!</p>
                </div>
                <a
                  href={pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline break-all"
                >
                  {pageUrl}
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
                {pageEditUrl && (
                  <Button size="sm" asChild>
                    <a href={pageEditUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3 h-3 mr-2" />
                      Edit in Elementor
                    </a>
                  </Button>
                )}
              </div>
            )}

            {pageStatus === "error" && pageError && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{pageError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom navigation ── */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="ml-auto"
        >
          Start Over
        </Button>
      </div>
    </div>
  );
}

// ── Step badge helper ─────────────────────────────────────────────────────────
function StepBadge({ n, done }: { n: number; done: boolean }) {
  return done ? (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
      <CheckCircle className="w-3.5 h-3.5" />
    </span>
  ) : (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
      {n}
    </span>
  );
}
