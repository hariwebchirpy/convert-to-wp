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
} from "lucide-react";
import {
  ConversionResult,
  WpConnection,
  ThemeConfig,
  PushResult,
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

interface Props {
  conversionResult: ConversionResult;
  wpConnection: WpConnection;
  themeConfig: ThemeConfig;
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
  onBack,
}: Props) {
  const [downloadStatus, setDownloadStatus] = useState<ActionStatus>("idle");
  const [pushStatus, setPushStatus] = useState<ActionStatus>("idle");
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [showDownloadConfetti, setShowDownloadConfetti] = useState(false);
  const [showPushConfetti, setShowPushConfetti] = useState(false);

  const cssCount = conversionResult.assetFiles.filter((f) => f.type === "css").length;
  const jsCount = conversionResult.assetFiles.filter((f) => f.type === "js").length;
  const imageCount = conversionResult.assetFiles.filter((f) => f.type === "image").length;

  // Total size estimate: asset file sizes + rough PHP estimate
  const assetBytes = conversionResult.assetFiles.reduce((sum, f) => sum + f.size, 0);
  const phpBytes =
    (conversionResult.styleCss.length +
      conversionResult.indexPhp.length +
      conversionResult.headerPhp.length +
      conversionResult.footerPhp.length +
      conversionResult.functionsPhp.length) *
    2; // rough bytes from string length
  const totalKb = ((assetBytes + phpBytes) / 1024).toFixed(1);
  const totalFiles = conversionResult.assetFiles.length + 6; // 6 PHP/CSS files

  // Hide confetti after animation
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
      await buildAndDownloadZip(themeConfig, conversionResult);
      setDownloadStatus("done");
      setShowDownloadConfetti(true);
    } catch {
      setDownloadStatus("error");
    }
  }

  async function handlePush() {
    setPushStatus("loading");
    setPushResult(null);
    setPushError(null);
    const result = await pushToWordPress(wpConnection, themeConfig, conversionResult);
    if (result.success) {
      setPushStatus("done");
      setPushResult(result);
      setShowPushConfetti(true);
    } else {
      setPushStatus("error");
      setPushError(result.error ?? "An unknown error occurred.");
    }
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

      {/* ── Card 2: Push to WordPress ── */}
      <Card className="relative overflow-hidden">
        {showPushConfetti && <Confetti />}
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <UploadCloud className="w-6 h-6 text-muted-foreground mt-0.5 shrink-0" />
              <div className="space-y-1">
                <CardTitle className="text-base">Push to WordPress</CardTitle>
                <CardDescription>
                  Create a new draft page in your WordPress site with the
                  Elementor layout pre-loaded and ready to edit.
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
              disabled={pushStatus === "loading" || pushStatus === "done"}
              onClick={handlePush}
            >
              {pushStatus === "loading" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Pushing…
                </>
              ) : pushStatus === "done" ? (
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

        {pushStatus === "done" && pushResult && (
          <CardContent className="space-y-3">
            <div className="rounded-md border border-green-200 bg-green-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium text-green-800">
                  Page created successfully!
                </p>
              </div>
              {pushResult.pageUrl && (
                <a
                  href={pushResult.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline break-all"
                >
                  {pushResult.pageUrl}
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              )}
              {pushResult.editUrl && (
                <Button size="sm" asChild>
                  <a
                    href={pushResult.editUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-3 h-3 mr-2" />
                    Edit in Elementor
                  </a>
                </Button>
              )}
            </div>

            {/* Collapsed Elementor JSON */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground list-none flex items-center gap-1 select-none">
                <span className="group-open:rotate-90 transition-transform inline-block">
                  ▶
                </span>{" "}
                View Elementor JSON
              </summary>
              <div className="mt-2 overflow-y-auto max-h-60 rounded-md border bg-zinc-900">
                <pre className="p-3 text-xs font-mono text-zinc-200 whitespace-pre-wrap break-all">
                  {conversionResult.elementorJson}
                </pre>
              </div>
            </details>
          </CardContent>
        )}

        {pushStatus === "error" && pushError && (
          <CardContent className="space-y-3">
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{pushError}</AlertDescription>
            </Alert>
            <Button variant="outline" onClick={handlePush}>
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
