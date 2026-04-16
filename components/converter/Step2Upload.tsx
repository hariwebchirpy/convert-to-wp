"use client";

import { useRef, useState, useCallback } from "react";
import { UploadCloud, X } from "lucide-react";
import { UploadedFile, ThemeConfig } from "@/types/converter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface Props {
  uploadedFiles: UploadedFile[];
  themeConfig: ThemeConfig;
  onAddFiles: (files: UploadedFile[]) => void;
  onRemoveFile: (id: string) => void;
  onUpdateThemeConfig: (data: Partial<ThemeConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

const ACCEPT = ".html,.css,.js,.png,.jpg,.jpeg,.gif,.svg,.webp";

const TYPE_ORDER: Record<UploadedFile["type"], number> = {
  html: 0,
  css: 1,
  js: 2,
  image: 3,
};

function getFileType(name: string): UploadedFile["type"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "html") return "html";
  if (ext === "css") return "css";
  if (ext === "js") return "js";
  return "image";
}

function formatSize(bytes: number): string {
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

const TYPE_BADGE: Record<UploadedFile["type"], string> = {
  html: "bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200",
  css: "bg-green-100 text-green-700 hover:bg-green-100 border-green-200",
  js: "bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200",
  image: "bg-pink-100 text-pink-700 hover:bg-pink-100 border-pink-200",
};

export default function Step2Upload({
  uploadedFiles,
  themeConfig,
  onAddFiles,
  onRemoveFile,
  onUpdateThemeConfig,
  onNext,
  onBack,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const existingNames = new Set(uploadedFiles.map((f) => f.name));

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const processed = await processFiles(Array.from(files), existingNames);
      if (processed.length > 0) onAddFiles(processed);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onAddFiles, uploadedFiles]
  );

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
    e.target.value = "";
  }

  const htmlCount = uploadedFiles.filter((f) => f.type === "html").length;
  const cssCount = uploadedFiles.filter((f) => f.type === "css").length;
  const jsCount = uploadedFiles.filter((f) => f.type === "js").length;
  const imageCount = uploadedFiles.filter((f) => f.type === "image").length;
  const hasHtml = htmlCount > 0;

  // Sort: html → css → js → images
  const sortedFiles = [...uploadedFiles].sort(
    (a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 pb-8">
      {/* ── Card 1: Drop zone ── */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Your Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={handleInputChange}
          />

          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 cursor-pointer transition-colors select-none",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/30 hover:border-muted-foreground/50 hover:bg-muted/30"
            )}
          >
            <UploadCloud
              className={cn(
                "w-10 h-10 transition-colors",
                isDragging ? "text-primary" : "text-muted-foreground"
              )}
            />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Drop your files here</p>
              <p className="text-xs text-muted-foreground">
                Supports .html .css .js .png .jpg .jpeg .gif .svg .webp
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              Browse Files
            </Button>
          </div>

          {/* Warnings */}
          {uploadedFiles.length > 0 && !hasHtml && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-800 [&>svg]:text-amber-600">
              <AlertDescription>
                No HTML file yet. At least one .html file is required.
              </AlertDescription>
            </Alert>
          )}
          {htmlCount > 1 && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-800 [&>svg]:text-amber-600">
              <AlertDescription>
                Multiple HTML files detected. They will be combined in order.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ── Card 2: File list ── */}
      {uploadedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uploaded Files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {sortedFiles.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  <Badge
                    className={cn(
                      "shrink-0 uppercase text-[10px] font-bold border",
                      TYPE_BADGE[file.type]
                    )}
                  >
                    {file.type}
                  </Badge>
                  <span className="flex-1 truncate font-mono text-sm">
                    {file.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatSize(file.size)}
                  </span>
                  <button
                    onClick={() => onRemoveFile(file.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>

            <p className="text-xs text-muted-foreground pt-1">
              {uploadedFiles.length} files · {htmlCount} HTML · {cssCount} CSS
              · {jsCount} JS · {imageCount}{" "}
              {imageCount === 1 ? "image" : "images"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Bottom navigation ── */}
      <div className="space-y-2">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            ← Back
          </Button>
          <Button className="flex-1" disabled={!hasHtml} onClick={onNext}>
            Next: Convert →
          </Button>
        </div>
        {!hasHtml && (
          <p className="text-xs text-muted-foreground text-center">
            At least one HTML file is required to continue
          </p>
        )}
      </div>
    </div>
  );
}
