"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, XCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Severity = "error" | "warning";

interface LineIssue {
  line: number;       // 1-based
  severity: Severity;
  title: string;
  explanation: string;
}

// ── Analyser — annotates every line of the JSON ───────────────────────────────

function analyseJson(json: string): LineIssue[] {
  const lines = json.split("\n");
  const issues: LineIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const lineNum = i + 1;

    // widgetType: "html"  →  HTML fallback widget
    if (/"widgetType"\s*:\s*"html"/.test(trimmed)) {
      issues.push({
        line: lineNum,
        severity: "warning",
        title: "HTML fallback widget",
        explanation:
          "This element couldn't be mapped to a native Elementor widget (Heading, Image, Text, etc.). " +
          "It will work in WordPress but you'll see raw HTML in the Elementor editor instead of a proper widget. " +
          "Open in Elementor and replace with the matching widget type.",
      });
      continue;
    }

    // "html": ""  →  empty HTML widget
    if (/"html"\s*:\s*""/.test(trimmed)) {
      issues.push({
        line: lineNum,
        severity: "error",
        title: "Empty HTML widget",
        explanation:
          'This widget has no content — the html field is an empty string (""). ' +
          "It was likely a purely decorative element (spacer, empty div) with no text or src. " +
          "You can delete this widget in Elementor.",
      });
      continue;
    }

    // PHP template tag inside JSON value
    if (/<?php/.test(trimmed)) {
      issues.push({
        line: lineNum,
        severity: "error",
        title: "PHP tag inside JSON",
        explanation:
          "A <?php ... ?> tag is embedded in this JSON string value. " +
          "Raw PHP is not valid inside JSON and will cause a parse error when WordPress reads it. " +
          "This happens when an image URL or asset path was rewritten with get_template_directory_uri(). " +
          "The push API handles this automatically, but if you import the JSON manually you'll need to " +
          "replace the PHP tag with the actual URL of your asset.",
      });
      continue;
    }

    // url: "" — empty URL (image with no src, button with no href, etc.)
    if (/"url"\s*:\s*""/.test(trimmed)) {
      issues.push({
        line: lineNum,
        severity: "warning",
        title: "Empty URL",
        explanation:
          'This widget has an empty url field (""). The original HTML element had no href or src attribute. ' +
          "In Elementor you'll need to set the link or image source manually.",
      });
      continue;
    }

    // image url that didn't get rewritten (still a relative path like "images/foo.png")
    if (/"url"\s*:\s*"(?!http|<\?php)[^"]+\.(png|jpg|jpeg|gif|svg|webp)"/.test(trimmed)) {
      issues.push({
        line: lineNum,
        severity: "warning",
        title: "Relative image path",
        explanation:
          "This image URL is a relative path from the original HTML (e.g. images/photo.png). " +
          "It was not matched to any uploaded image file, so it hasn't been rewritten to a WordPress asset URL. " +
          "The image may appear broken in Elementor. Upload the missing image file and re-convert, or fix the URL manually in Elementor.",
      });
      continue;
    }

    // title: "" — empty heading
    if (/"title"\s*:\s*""/.test(trimmed)) {
      issues.push({
        line: lineNum,
        severity: "warning",
        title: "Empty heading",
        explanation:
          "This heading widget has no text. The original element may have contained only an image or icon. " +
          "Check this heading in Elementor and either add text or delete the widget.",
      });
      continue;
    }

    // editor: "" — empty text editor
    if (/"editor"\s*:\s*""/.test(trimmed)) {
      issues.push({
        line: lineNum,
        severity: "warning",
        title: "Empty text block",
        explanation:
          "This text editor widget has no content. The original element may have been empty or contained only non-text content. " +
          "Check this widget in Elementor.",
      });
      continue;
    }
  }

  return issues;
}

// ── Line-numbered JSON panel ──────────────────────────────────────────────────

function JsonPanel({
  lines,
  issuesByLine,
  activeIssueLineNum,
  onLineClick,
  lineRefs,
}: {
  lines: string[];
  issuesByLine: Map<number, LineIssue>;
  activeIssueLineNum: number | null;
  onLineClick: (lineNum: number) => void;
  lineRefs: React.RefObject<Map<number, HTMLTableRowElement>>;
}) {
  return (
    <div className="overflow-y-auto h-full bg-zinc-900 text-zinc-100 text-xs font-mono rounded-l-md border border-zinc-700">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            const lineNum = i + 1;
            const issue = issuesByLine.get(lineNum);
            const isActive = activeIssueLineNum === lineNum;

            let rowBg = "";
            if (isActive)            rowBg = "bg-blue-900/60";
            else if (issue?.severity === "error")   rowBg = "bg-red-950/60";
            else if (issue?.severity === "warning")  rowBg = "bg-amber-950/40";

            return (
              <tr
                key={i}
                ref={(el) => {
                  if (el) lineRefs.current?.set(lineNum, el);
                }}
                className={cn("leading-6 group", rowBg, issue && "cursor-pointer hover:brightness-125")}
                onClick={() => issue && onLineClick(lineNum)}
              >
                {/* Line number */}
                <td className="select-none text-right text-zinc-600 pr-3 pl-3 w-10 text-[11px] align-top">
                  {lineNum}
                </td>

                {/* Severity gutter icon */}
                <td className="w-5 align-top pr-1">
                  {issue?.severity === "error" && (
                    <XCircle size={11} className="text-red-400 mt-1.5" />
                  )}
                  {issue?.severity === "warning" && (
                    <AlertTriangle size={11} className="text-amber-400 mt-1.5" />
                  )}
                </td>

                {/* Code */}
                <td
                  className={cn(
                    "pr-4 whitespace-pre-wrap break-all align-top",
                    issue?.severity === "error"   && "text-red-300",
                    issue?.severity === "warning"  && "text-amber-200",
                    isActive && "font-semibold"
                  )}
                >
                  {line || " "}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Issues panel ──────────────────────────────────────────────────────────────

function IssuesPanel({
  issues,
  activeLineNum,
  onIssueClick,
}: {
  issues: LineIssue[];
  activeLineNum: number | null;
  onIssueClick: (lineNum: number) => void;
}) {
  const errors   = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (issues.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-4">
        <CheckCircle2 size={28} className="text-green-500" />
        <p className="text-sm font-medium text-green-700">No issues found</p>
        <p className="text-xs text-muted-foreground">
          The Elementor JSON looks clean and ready to import.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Summary header */}
      <div className="sticky top-0 bg-background border-b px-3 py-2.5 flex items-center gap-3 z-10">
        {errors.length > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-red-600">
            <XCircle size={13} />
            {errors.length} error{errors.length !== 1 ? "s" : ""}
          </span>
        )}
        {warnings.length > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
            <AlertTriangle size={13} />
            {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Issue list */}
      <div className="divide-y">
        {issues.map((issue, idx) => {
          const isActive = activeLineNum === issue.line;
          return (
            <button
              key={idx}
              onClick={() => onIssueClick(issue.line)}
              className={cn(
                "w-full text-left px-3 py-3 space-y-1 transition-colors hover:bg-muted/50",
                isActive && "bg-blue-50 hover:bg-blue-50"
              )}
            >
              <div className="flex items-center gap-2">
                {issue.severity === "error" ? (
                  <XCircle size={13} className="text-red-500 shrink-0" />
                ) : (
                  <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                )}
                <span className="text-xs font-semibold text-foreground flex-1">
                  {issue.title}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0 flex items-center gap-0.5">
                  <ChevronRight size={10} />
                  line {issue.line}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pl-5">
                {issue.explanation}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function JsonInspector({ json }: { json: string }) {
  const lines = useMemo(() => json.split("\n"), [json]);
  const issues = useMemo(() => analyseJson(json), [json]);
  const issuesByLine = useMemo(
    () => new Map(issues.map((iss) => [iss.line, iss])),
    [issues]
  );

  const [activeLineNum, setActiveLineNum] = useState<number | null>(null);
  const lineRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const jsonPanelRef = useRef<HTMLDivElement>(null);

  function scrollToLine(lineNum: number) {
    setActiveLineNum(lineNum);
    const row = lineRefs.current.get(lineNum);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <div className="flex gap-0 rounded-md overflow-hidden border border-zinc-700" style={{ height: 480 }}>
      {/* Left — JSON with inline highlights (60%) */}
      <div ref={jsonPanelRef} className="w-[60%] flex flex-col">
        <JsonPanel
          lines={lines}
          issuesByLine={issuesByLine}
          activeIssueLineNum={activeLineNum}
          onLineClick={scrollToLine}
          lineRefs={lineRefs}
        />
      </div>

      {/* Divider */}
      <div className="w-px bg-zinc-700 shrink-0" />

      {/* Right — Issues panel (40%) */}
      <div className="w-[40%] bg-background flex flex-col">
        <IssuesPanel
          issues={issues}
          activeLineNum={activeLineNum}
          onIssueClick={scrollToLine}
        />
      </div>
    </div>
  );
}
