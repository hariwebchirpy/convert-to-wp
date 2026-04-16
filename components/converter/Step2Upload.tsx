"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { UploadCloud, X, FileCode, FileText, Image, FileJson, FolderOpen, Loader2, AlertCircle } from "lucide-react";
import { UploadedFile, ThemeConfig, PageEntry } from "@/types/converter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  uploadedFiles: UploadedFile[];
  themeConfig: ThemeConfig;
  onAddFiles: (files: UploadedFile[]) => void;
  onRemoveFile: (id: string) => void;
  onUpdateThemeConfig: (data: Partial<ThemeConfig>) => void;
  onPagesReady: (pages: PageEntry[], thenGoToStep3?: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}

type FileCategory = "html" | "css" | "js" | "image";

const CATEGORY_CONFIG: Record<
  FileCategory,
  {
    label: string;
    accept: string;
    extensions: string[];
    icon: React.ReactNode;
    color: string;
    badgeClass: string;
    instruction: string;
    tip: string;
  }
> = {
  html: {
    label: "HTML File",
    accept: ".html",
    extensions: [".html"],
    icon: <FileCode className="w-6 h-6" />,
    color: "text-blue-500",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    instruction: "Drop your .html file(s) here",
    tip: "Must be a complete HTML page with <html>, <head>, and <body> tags. External CSS/JS should be linked via <link> and <script src> — not inlined. Upload multiple .html files to convert them as separate pages.",
  },
  css: {
    label: "CSS Files",
    accept: ".css",
    extensions: [".css"],
    icon: <FileText className="w-6 h-6" />,
    color: "text-green-500",
    badgeClass: "bg-green-100 text-green-700 border-green-200",
    instruction: "Drop your .css files here",
    tip: "All stylesheets used by the page. Image paths inside CSS should use relative paths matching the filenames you upload (e.g. url('../images/bg.jpg')).",
  },
  js: {
    label: "JS Files",
    accept: ".js",
    extensions: [".js"],
    icon: <FileJson className="w-6 h-6" />,
    color: "text-amber-500",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    instruction: "Drop your .js files here",
    tip: "All JavaScript files linked in your HTML. Libraries like jQuery, Bootstrap etc. are included automatically by WordPress — you may skip them.",
  },
  image: {
    label: "Images",
    accept: ".png,.jpg,.jpeg,.gif,.svg,.webp",
    extensions: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"],
    icon: <Image className="w-6 h-6" />,
    color: "text-pink-500",
    badgeClass: "bg-pink-100 text-pink-700 border-pink-200",
    instruction: "Drop your images here",
    tip: "All images referenced in your HTML or CSS. Filename must match exactly what your HTML src= attributes reference (e.g. if HTML says src='images/hero.png', upload hero.png).",
  },
};

function getFileType(name: string): UploadedFile["type"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "html") return "html";
  if (ext === "css")  return "css";
  if (ext === "js")   return "js";
  return "image";
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / 1024).toFixed(1) + " KB";
}

function readFile(file: File, type: UploadedFile["type"]): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    if (type === "image") {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
}

async function processFiles(
  files: File[],
  existingNames: Set<string>
): Promise<UploadedFile[]> {
  const newFiles = files.filter((f) => !existingNames.has(f.name));
  return Promise.all(
    newFiles.map(async (file) => {
      const type = getFileType(file.name);
      const content = await readFile(file, type);
      return {
        id: crypto.randomUUID(),
        name: file.name,
        type,
        content,
        size: file.size,
        file,
      };
    })
  );
}

function buildPages(htmlFiles: UploadedFile[]): PageEntry[] {
  return htmlFiles.map((f) => ({
    id: crypto.randomUUID(),
    htmlFileName: f.name,
    conversionStatus: "idle",
    conversionResult: null,
    error: null,
  }));
}

// ── Single category drop zone ─────────────────────────────────────────────────

function DropZone({
  category,
  files,
  onAdd,
  onRemove,
}: {
  category: FileCategory;
  files: UploadedFile[];
  onAdd: (files: UploadedFile[]) => void;
  onRemove: (id: string) => void;
}) {
  const cfg = CATEGORY_CONFIG[category];
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const existingNames = new Set(files.map((f) => f.name));

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const filtered = Array.from(fileList).filter((f) => {
        const ext = "." + (f.name.split(".").pop()?.toLowerCase() ?? "");
        return cfg.extensions.includes(ext);
      });
      const processed = await processFiles(filtered, existingNames);
      if (processed.length > 0) onAdd(processed);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onAdd, files]
  );

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={cfg.accept}
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
      />

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 cursor-pointer transition-colors select-none",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/45 hover:bg-muted/20"
        )}
      >
        <span className={cfg.color}>{cfg.icon}</span>
        <p className="text-xs font-medium text-center">{cfg.instruction}</p>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
        >
          Browse
        </Button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{cfg.tip}</p>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
              <Badge className={cn("shrink-0 uppercase text-[10px] font-bold border", cfg.badgeClass)}>
                {file.type}
              </Badge>
              <span className="flex-1 truncate font-mono text-xs">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatSize(file.size)}
              </span>
              <button
                onClick={() => onRemove(file.id)}
                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                aria-label={`Remove ${file.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Step2Upload({
  uploadedFiles,
  onAddFiles,
  onRemoveFile,
  onPagesReady,
  onNext,
  onBack,
}: Props) {
  const htmlFiles  = uploadedFiles.filter((f) => f.type === "html");
  const cssFiles   = uploadedFiles.filter((f) => f.type === "css");
  const jsFiles    = uploadedFiles.filter((f) => f.type === "js");
  const imageFiles = uploadedFiles.filter((f) => f.type === "image");
  const hasHtml    = htmlFiles.length > 0;

  // Local import state
  const [localPath, setLocalPath] = useState("C:\\Users\\HARI_JOHNSON\\Downloads\\_static");
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [importCount, setImportCount] = useState<{ html: number; css: number; js: number; image: number } | null>(null);

  // Rebuild pages whenever HTML files change
  useEffect(() => {
    if (htmlFiles.length > 0) {
      onPagesReady(buildPages(htmlFiles));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlFiles.length]);

  async function handleLocalImport() {
    setImportStatus("loading");
    setImportError(null);
    setImportCount(null);

    try {
      const res = await fetch("/api/local-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dirPath: localPath }),
      });

      const data = await res.json() as {
        files?: Array<{ name: string; type: "html" | "css" | "js" | "image"; content: string; size: number }>;
        error?: string;
      };

      if (!res.ok || data.error) {
        setImportStatus("error");
        setImportError(data.error ?? `HTTP ${res.status}`);
        return;
      }

      const existingNames = new Set(uploadedFiles.map((f) => f.name));
      const newFiles: UploadedFile[] = (data.files ?? [])
        .filter((f) => !existingNames.has(f.name))
        .map((f) => ({
          id: crypto.randomUUID(),
          name: f.name,
          type: f.type,
          content: f.content,
          size: f.size,
          file: new File([f.content], f.name),
        }));

      if (newFiles.length > 0) onAddFiles(newFiles);

      const counts = { html: 0, css: 0, js: 0, image: 0 };
      for (const f of newFiles) counts[f.type]++;
      setImportCount(counts);
      setImportStatus("done");
    } catch (err) {
      setImportStatus("error");
      setImportError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  function handleNext() {
    // Pass thenGoToStep3=true so pages + step advance in one state update,
    // guaranteeing activePageId is set before Step3 renders.
    onPagesReady(buildPages(htmlFiles), true);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 pb-8">

      {/* ── Local Import Card ── */}
      <Card className="border-dashed border-2 border-blue-200 bg-blue-50/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="w-4 h-4 text-blue-500" />
            Import from Local Folder
          </CardTitle>
          <CardDescription>
            Point to your static site folder — all HTML, CSS, JS and images are loaded automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="C:\path\to\your\site"
              className="font-mono text-sm"
            />
            <Button
              onClick={handleLocalImport}
              disabled={importStatus === "loading" || !localPath.trim()}
              className="shrink-0"
            >
              {importStatus === "loading" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading…</>
              ) : (
                <><FolderOpen className="w-4 h-4 mr-2" />Import</>
              )}
            </Button>
          </div>

          {importStatus === "done" && importCount && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
              Imported — {importCount.html} HTML · {importCount.css} CSS · {importCount.js} JS · {importCount.image} images
            </div>
          )}

          {importStatus === "error" && importError && (
            <div className="flex items-start gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {importError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Divider ── */}
      <div className="relative flex items-center">
        <div className="flex-1 border-t" />
        <span className="mx-3 text-xs text-muted-foreground bg-background px-1">or upload manually</span>
        <div className="flex-1 border-t" />
      </div>

      {/* ── HTML ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCode className="w-4 h-4 text-blue-500" />
            HTML Files
            {hasHtml && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">
                {htmlFiles.length} uploaded
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Your main page file(s). Each .html file becomes a separate WordPress page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DropZone category="html" files={htmlFiles} onAdd={onAddFiles} onRemove={onRemoveFile} />
        </CardContent>
      </Card>

      {/* ── Pages detected ── */}
      {htmlFiles.length > 0 && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Pages detected — each will be converted separately:</p>
          <ul className="space-y-1">
            {htmlFiles.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-sm">
                <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="font-mono">{f.name}</span>
                <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── CSS ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4 text-green-500" />
            CSS Files
            {cssFiles.length > 0 && (
              <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">
                {cssFiles.length} uploaded
              </Badge>
            )}
          </CardTitle>
          <CardDescription>All stylesheets your HTML page links to.</CardDescription>
        </CardHeader>
        <CardContent>
          <DropZone category="css" files={cssFiles} onAdd={onAddFiles} onRemove={onRemoveFile} />
        </CardContent>
      </Card>

      {/* ── JS ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileJson className="w-4 h-4 text-amber-500" />
            JavaScript Files
            {jsFiles.length > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                {jsFiles.length} uploaded
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Custom JS files. Skip jQuery & Bootstrap — WordPress loads those automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DropZone category="js" files={jsFiles} onAdd={onAddFiles} onRemove={onRemoveFile} />
        </CardContent>
      </Card>

      {/* ── Images ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Image className="w-4 h-4 text-pink-500" />
            Images
            {imageFiles.length > 0 && (
              <Badge className="bg-pink-100 text-pink-700 border-pink-200 text-[10px]">
                {imageFiles.length} uploaded
              </Badge>
            )}
          </CardTitle>
          <CardDescription>All images referenced in your HTML or CSS.</CardDescription>
        </CardHeader>
        <CardContent>
          <DropZone category="image" files={imageFiles} onAdd={onAddFiles} onRemove={onRemoveFile} />
        </CardContent>
      </Card>

      {/* ── No HTML warning ── */}
      {uploadedFiles.length > 0 && !hasHtml && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <AlertDescription>
            No HTML file yet — at least one .html file is required to continue.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Summary ── */}
      {uploadedFiles.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {uploadedFiles.length} files total · {htmlFiles.length} HTML · {cssFiles.length} CSS · {jsFiles.length} JS · {imageFiles.length} images
        </p>
      )}

      {/* ── Navigation ── */}
      <div className="space-y-2">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>← Back</Button>
          <Button className="flex-1" disabled={!hasHtml} onClick={handleNext}>
            Next: Convert {htmlFiles.length > 1 ? `${htmlFiles.length} Pages` : ""} →
          </Button>
        </div>
        {!hasHtml && (
          <p className="text-xs text-muted-foreground text-center">
            Upload at least one HTML file to continue
          </p>
        )}
      </div>
    </div>
  );
}
