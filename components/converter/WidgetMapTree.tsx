"use client";

import {
  Heading1,
  AlignLeft,
  ImageIcon,
  MousePointerClick,
  Play,
  Minus,
  LayoutGrid,
  Columns2,
  Code2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { WidgetMapItem, WidgetMapNode } from "@/types/converter";

// ── Type config ───────────────────────────────────────────────────────────────

interface TypeStyle {
  icon: React.ElementType;
  bg: string;
  color: string;
}

const TYPE_STYLES: Record<string, TypeStyle> = {
  Heading:      { icon: Heading1,           bg: "#E6F1FB", color: "#0C447C" },
  "Text Editor":{ icon: AlignLeft,          bg: "#F1EFE8", color: "#444441" },
  Image:        { icon: ImageIcon,          bg: "#FBEAF0", color: "#72243E" },
  Button:       { icon: MousePointerClick,  bg: "#EAF3DE", color: "#27500A" },
  Video:        { icon: Play,               bg: "#FAEEDA", color: "#633806" },
  Divider:      { icon: Minus,              bg: "#F1EFE8", color: "#444441" },
  "Icon Box":   { icon: LayoutGrid,         bg: "#EEEDFE", color: "#3C3489" },
  Columns:      { icon: Columns2,           bg: "#E1F5EE", color: "#085041" },
  HTML:         { icon: Code2,              bg: "#FCEBEB", color: "#791F1F" },
};

const FALLBACK_STYLE: TypeStyle = {
  icon: Code2,
  bg: "#FCEBEB",
  color: "#791F1F",
};

// ── Count helpers ─────────────────────────────────────────────────────────────

function flattenNodes(nodes: WidgetMapNode[]): WidgetMapNode[] {
  const result: WidgetMapNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.type === "Columns" && node.children) {
      result.push(...flattenNodes(node.children));
    }
  }
  return result;
}

function countWidgets(widgetMap: WidgetMapItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const section of widgetMap) {
    for (const node of flattenNodes(section.widgets)) {
      counts[node.type] = (counts[node.type] ?? 0) + 1;
    }
  }
  return counts;
}

// ── Single tree row ───────────────────────────────────────────────────────────

function WidgetRow({
  node,
  depth,
  isLast,
}: {
  node: WidgetMapNode;
  depth: number;
  isLast: boolean;
}) {
  const style = TYPE_STYLES[node.type] ?? FALLBACK_STYLE;
  const Icon = style.icon;
  const connector = isLast ? "└─" : "├─";
  const label =
    node.label.length > 50 ? node.label.slice(0, 50) + "…" : node.label;

  // Group children by columnIndex for Columns nodes
  const columnGroups: WidgetMapNode[][] = [];
  if (node.type === "Columns" && node.children) {
    for (const child of node.children) {
      const ci = child.columnIndex ?? 0;
      if (!columnGroups[ci]) columnGroups[ci] = [];
      columnGroups[ci].push(child);
    }
  }

  return (
    <div>
      {/* Row */}
      <div
        className="flex items-center gap-1.5 py-0.5 group"
        style={{ paddingLeft: depth * 20 }}
      >
        {/* Tree connector */}
        <span className="font-mono text-xs text-muted-foreground/50 select-none w-4 shrink-0">
          {depth > 0 ? connector : ""}
        </span>

        {/* Type badge with icon */}
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none shrink-0"
          style={{ background: style.bg, color: style.color }}
        >
          <Icon size={12} />
          {node.type}
        </span>

        {/* Label */}
        <span
          className={`text-xs truncate max-w-[260px] ${
            node.isComplex
              ? "italic text-muted-foreground"
              : "text-foreground"
          }`}
        >
          {label || <span className="text-muted-foreground/40">(empty)</span>}
        </span>

        {/* Warning icon for complex/HTML widgets */}
        {node.isComplex && (
          <span className="relative group/tip shrink-0 flex items-center gap-1">
            <AlertTriangle size={13} className="text-amber-500" />
            <span className="text-[10px] font-medium text-amber-600 hidden sm:inline">Not natively editable</span>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/tip:block w-64 rounded bg-zinc-900 px-2.5 py-1.5 text-[11px] text-zinc-100 shadow-lg z-50 leading-relaxed">
              Preserved as a raw HTML widget. Renders correctly on the frontend but cannot be drag-and-drop edited in Elementor — JS-dependent components (carousels, tabs, modals) or complex layouts fall into this category.
            </span>
          </span>
        )}
      </div>

      {/* Column children */}
      {node.type === "Columns" && columnGroups.length > 0 && (
        <div style={{ paddingLeft: (depth + 1) * 20 }}>
          {columnGroups.map((colNodes, ci) => (
            <div key={ci} className="mt-0.5">
              <span
                className="font-mono text-[10px] text-muted-foreground/50 select-none"
                style={{ paddingLeft: 16 }}
              >
                Col {ci + 1}
              </span>
              {colNodes.map((child, j) => (
                <WidgetRow
                  key={j}
                  node={child}
                  depth={depth + 2}
                  isLast={j === colNodes.length - 1}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

const SUMMARY_ORDER: { key: string; label: string }[] = [
  { key: "Heading",      label: "Headings" },
  { key: "Text Editor",  label: "Text blocks" },
  { key: "Image",        label: "Images" },
  { key: "Button",       label: "Buttons" },
  { key: "Video",        label: "Videos" },
  { key: "Icon Box",     label: "Icon boxes" },
  { key: "Columns",      label: "Column layouts" },
  { key: "HTML",         label: "HTML fallbacks" },
];

function SummaryBar({ widgetMap }: { widgetMap: WidgetMapItem[] }) {
  const counts = countWidgets(widgetMap);
  const htmlCount = counts["HTML"] ?? 0;

  return (
    <div className="mt-5 pt-4 border-t space-y-3">
      <p className="text-xs text-muted-foreground font-medium">Mapping summary</p>

      {/* Stat pills */}
      <div className="flex flex-wrap gap-1.5">
        {SUMMARY_ORDER.map(({ key, label }) => {
          const n = counts[key] ?? 0;
          if (n === 0) return null;
          const style = TYPE_STYLES[key] ?? FALLBACK_STYLE;
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ background: style.bg, color: style.color }}
            >
              {n} {label}
            </span>
          );
        })}
      </div>

      {/* Alert */}
      {htmlCount > 0 ? (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
          <span>
            <strong>{htmlCount} element{htmlCount !== 1 ? "s" : ""}</strong> could not be mapped to native Elementor widgets — JS-dependent components (carousels, sliders, tabs) and complex layouts are preserved as HTML widgets. They render correctly on the frontend but require manual editing in Elementor.
          </span>
        </div>
      ) : (
        <div className="flex gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2.5 text-xs text-green-800 leading-relaxed">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-green-600" />
          <span>
            All elements mapped to native Elementor widgets — fully drag-and-drop editable.
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WidgetMapTree({
  widgetMap,
}: {
  widgetMap: WidgetMapItem[];
}) {
  if (widgetMap.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-6">
        No sections detected
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {/* Per-section blocks */}
      {widgetMap.map((section, si) => (
        <div key={section.sectionId}>
          {/* Section header */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shrink-0" />
              <span className="font-mono text-xs font-medium">
                #{section.sectionLabel}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {section.widgets.length} widget{section.widgets.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Widget tree */}
          <div className="pb-2">
            {section.widgets.map((node, i) => (
              <WidgetRow
                key={i}
                node={node}
                depth={0}
                isLast={i === section.widgets.length - 1}
              />
            ))}
          </div>

          {/* Separator between sections */}
          {si < widgetMap.length - 1 && (
            <div className="border-t my-1" />
          )}
        </div>
      ))}

      <SummaryBar widgetMap={widgetMap} />
    </div>
  );
}
