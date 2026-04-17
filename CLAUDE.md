# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev          # start dev server with Turbopack
bun build        # production build
bun lint         # ESLint
bun format       # Prettier (writes in-place)
bun typecheck    # tsc --noEmit (no test suite exists)
```

Add shadcn components: `npx shadcn@latest add <component>`

## Architecture

This is a **Next.js 16 + React 19** app that converts static HTML/CSS/JS sites into WordPress themes with Elementor support. All conversion logic runs **client-side only** — there is no backend API. The app is a single-page 4-step wizard at `/converter`.

### Conversion pipeline

The wizard state lives entirely in `app/converter/page.tsx` as `ConverterState`. Each step is a self-contained component under `components/converter/`:

1. **Step1Connect** — test WP REST API credentials (`lib/converter/wpApi.ts → testWpConnection`)
2. **Step2Upload** — accept HTML/CSS/JS/image files; derive `PageEntry[]` for multi-page support
3. **Step3Convert** — run the conversion pipeline (client-side, triggered by user):
   - `parseHtml.ts` → splits the HTML into `header`, `footer`, `main`, and `sections[]`
   - `buildTheme.ts` → generates `header.php`, `footer.php`, `index.php`, `functions.php`, `style.css`, `pageCss`, `rawHtml`, and calls `elementorJson.ts`
   - `elementorJson.ts` → calls `domWalker.ts` which maps DOM nodes to Elementor widget JSON
4. **Step4Deploy** — download ZIP (via `buildZip.ts` + JSZip) or push directly to WP via REST API (`wpApi.ts`)

### Asset path rewriting

Asset filenames are rewritten in three different contexts:
- **PHP theme files**: paths become `<?php echo get_template_directory_uri(); ?>/assets/{type}/filename`
- **rawHtml** (REST push): image paths become `__WP_IMG__filename` markers, later resolved to WP media URLs after upload
- **pageCss**: same `__WP_IMG__` marker strategy, resolved after upload

Large framework CSS (`bootstrap.min.css`, `font-awesome.min.css`) is excluded from `pageCss` (to keep payload under PHP's `post_max_size`) and replaced with CDN `<link>` tags prepended to `rawHtml`.

### Elementor JSON generation (`domWalker.ts`)

`walkSections()` iterates parsed sections and maps DOM elements to Elementor widget types. Priority order in `mapElement()`:

1. Atomic blocks (carousels, sliders, marquees) → single `html` widget, never recursed
2. Elements with custom styling hooks + known widget type → `html` widget (preserves CSS hooks)
3. Specific widget detectors: `heading`, `image`, `video`, `divider`, `button`, `text-editor`, `icon-box`
4. Transparent wrappers (Bootstrap `container/row/col`) → drilled through, then column detection
5. Multi-column layouts detected by `columnDetector.ts` → Elementor `innerSection` with columns
6. Recursive fallback → `html` widget

### CSS delivery to WordPress

CSS is pushed through multiple channels simultaneously to maximise compatibility across different WP/server setups:
- `_elementor_data`: CSS embedded as an HTML widget in the first Elementor section
- `_elementor_page_settings.custom_css`: Elementor's native page CSS field
- WordPress Customizer Additional CSS via `/wp-json/wp/v2/settings` (scoped with markers)
- Data URI `<link>` tag (bypasses LiteSpeed file restrictions)

### Multi-page support

When multiple HTML files are uploaded, `ConverterState.pages: PageEntry[]` tracks conversion status per page. The active page drives Step3/Step4 UI. "Push All" in Step4 iterates `pages[]` sequentially.

### Persistence

`lib/converter/storage.ts` persists WP connection credentials and user profile to `localStorage` only. No server-side storage.

## Key types (`types/converter.ts`)

- `ConverterState` — root wizard state held in `app/converter/page.tsx`
- `ParsedHtml` — output of `parseHtml`: header/footer/main HTML + `sections[]`
- `ConversionResult` — output of `buildTheme`: all PHP files + `elementorJson` + `rawHtml` + `pageCss`
- `PageEntry` — per-page record in multi-page mode, holds its own `ConversionResult`
- `ElementorSection / ElementorColumn / ElementorWidget` — Elementor JSON node shapes

## Style conventions

- Tailwind CSS v4 + shadcn/ui components from `components/ui/`
- `cn()` helper from `lib/utils.ts` for conditional class merging
- All converter logic files use `console.group` / `console.log` extensively for browser DevTools debugging — this is intentional
