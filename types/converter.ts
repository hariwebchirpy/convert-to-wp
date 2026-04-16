export type ConverterStep = 1 | 2 | 3 | 4;

export interface ParsedSection {
  id: string;
  html: string;
  tag: string;
}

export interface ParsedHtml {
  headContent: string;
  headerHtml: string;
  footerHtml: string;
  mainHtml: string;
  sections: ParsedSection[];
  title: string;
  linkedCssFiles: string[];
  linkedJsFiles: string[];
}

export type ConversionStatus = "idle" | "converting" | "done" | "error";

export interface WpConnection {
  siteUrl: string;
  username: string;
  appPassword: string;
  isConnected: boolean;
}

export interface UploadedFile {
  id: string;
  name: string;
  type: "html" | "css" | "js" | "image";
  content: string;
  size: number;
  file: File;
}

export interface ThemeConfig {
  themeName: string;
  themeSlug: string;
  author: string;
  description: string;
  version: string;
}

export interface ConversionResult {
  headerPhp: string;
  footerPhp: string;
  indexPhp: string;
  functionsPhp: string;
  styleCss: string;
  elementorJson: string;
  assetFiles: UploadedFile[];
  widgetMap: WidgetMapItem[];
}

export interface PushResult {
  success: boolean;
  pageId?: number;
  pageUrl?: string;
  editUrl?: string;
  error?: string;
}

export interface ProgressStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
}

export interface WpUserProfile {
  id: number;
  name: string;
  email: string;
  avatarUrl: string;
  siteUrl: string;
  siteName: string;
}

// ── Elementor node types ──────────────────────────────────────────────────────

export interface ElementorWidget {
  id: string;
  elType: "widget";
  widgetType: string;
  settings: Record<string, unknown>;
  elements: [];
}

export interface ElementorColumn {
  id: string;
  elType: "column";
  settings: { _column_size: number };
  elements: ElementorWidget[];
}

export interface ElementorSection {
  id: string;
  elType: "section";
  settings: Record<string, unknown>;
  elements: ElementorColumn[];
}

export interface ElementorInnerSection {
  id: string;
  elType: "section";
  isInner: true;
  settings: Record<string, unknown>;
  elements: ElementorColumn[];
}

export type ElementorNode =
  | ElementorSection
  | ElementorWidget
  | ElementorInnerSection;

// ── Widget map types ──────────────────────────────────────────────────────────

export interface WidgetMapNode {
  type: string;
  label: string;
  tag: string;
  isComplex: boolean;
  children?: WidgetMapNode[];
  columnIndex?: number;
}

export interface WidgetMapItem {
  sectionId: string;
  sectionLabel: string;
  widgets: WidgetMapNode[];
}

// ── Helper ────────────────────────────────────────────────────────────────────

export function randomId(): string {
  return Math.random().toString(16).slice(2, 10);
}

export interface ConverterState {
  currentStep: ConverterStep;
  wpConnection: WpConnection;
  userProfile: WpUserProfile | null;
  uploadedFiles: UploadedFile[];
  themeConfig: ThemeConfig;
  conversionStatus: ConversionStatus;
  conversionResult: ConversionResult | null;
  error: string | null;
}
