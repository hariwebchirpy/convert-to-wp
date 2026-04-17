# Converter Skill

This skill provides deep context for the HTML-to-WordPress converter project.

## Project Purpose

Converts static HTML/CSS/JS sites into WordPress themes with Elementor support.
All conversion logic runs **client-side** — no backend processing except the Claude AI route and the local-import route.

## 4-Step Wizard Flow

```
Step 1 (Connect)  →  Step 2 (Upload)  →  Step 3 (Convert)  →  Step 4 (Deploy)
  WP credentials      HTML/CSS/JS/img     Run pipeline          ZIP or REST push
  wpApi.ts            files               client-side           buildZip.ts / wpApi.ts
```

State lives entirely in `app/converter/page.tsx` as `ConverterState`.
Each step is a self-contained component in `components/converter/`.

## Conversion Pipeline (Step 3)

```
UploadedFile[]
  └─ parseHtml.ts        → ParsedHtml  (header, footer, main, sections[])
  └─ buildTheme.ts       → ConversionResult
       ├─ PHP files      (header.php, footer.php, index.php, functions.php, style.css)
       ├─ pageCss        (custom CSS for REST push — large frameworks excluded, replaced with CDN links)
       ├─ rawHtml        (body HTML with __WP_IMG__ markers)
       └─ elementorJson.ts → buildElementorJson()
              └─ domWalker.ts → walkSections() → ElementorSection[]
```

## domWalker.ts — Widget Mapping Priority

`mapElement()` checks in this order:

1. **Atomic blocks** (carousels, sliders, marquees, decorative absolute layouts) → single `html` widget, never recurse
2. **Custom styling hook + known type** (has id/class + is heading/image/button/icon-box) → `html` widget to preserve CSS hooks
3. **Specific detectors** (in order): `isHeading`, `isImage`, `isVideo`, `isDivider`, `isButton`, `isTextElement`, `isIconBox`
4. **Transparent wrappers** (Bootstrap `container/row/col/wrap/inner/box`) → drill through, then column detect
5. **Multi-column** (`detectColumns` in `columnDetector.ts`) → Elementor `innerSection` with columns
6. **Recursive fallback** → `html` widget

Widget files: `lib/converter/widgets/` — one file per widget type plus `columnDetector.ts`.

## Asset Path Rewriting

Three contexts, three strategies:

| Context | Strategy |
|---|---|
| PHP theme files (header.php etc.) | `<?php echo get_template_directory_uri(); ?>/assets/{type}/filename` |
| `rawHtml` (REST API push) | `__WP_IMG__filename` marker → resolved to WP media URL after upload |
| `pageCss` | `__WP_IMG__filename` marker → resolved after upload |

`buildTheme.ts → replaceAllPathVariants()` handles all path prefix variants (`../images/`, `./img/`, `assets/images/` etc.) using plain split/join (no regex).

## CSS Delivery to WordPress (4 channels)

`pushToWordPress` in `wpApi.ts` pushes CSS through all channels simultaneously:

1. `_elementor_data` — CSS as an HTML widget in the first Elementor section
2. `_elementor_page_settings.custom_css` — Elementor native page CSS field
3. WordPress Customizer Additional CSS via `/wp-json/wp/v2/settings` (scoped with `/* === convert-to-wp:scope === */` markers via `upsertScopedCustomCss`)
4. Data URI `<link rel="stylesheet" href="data:text/css;base64,...">` — bypasses LiteSpeed CSS stripping

CSS hard cap: 400KB. If exceeded, CSS is truncated with a warning.

## Framework CSS Handling

Bootstrap and Font Awesome are excluded from `pageCss` (too large for PHP `post_max_size`):
- Skipped: `bootstrap.min.css`, `font-awesome.min.css`, `all.min.css`
- Replaced with CDN `<link>` tags prepended to `rawHtml`
- Still enqueued via `functions.php` for the ZIP theme

## Multi-Page Support

- `ConverterState.pages: PageEntry[]` — one entry per uploaded HTML file
- Each `PageEntry` has its own `conversionStatus` and `conversionResult`
- Step 3 shows active page; Step 4 has per-page push state + "Push All" button
- `activePageFiles` in `app/converter/page.tsx` filters `uploadedFiles` to active HTML + all CSS/JS/images

## Key Types (`types/converter.ts`)

```ts
ConverterState       // root wizard state
ParsedHtml           // output of parseHtml: header/footer/main + sections[]
ConversionResult     // output of buildTheme: PHP files + elementorJson + rawHtml + pageCss + widgetMap
PageEntry            // per-page record: htmlFileName, conversionStatus, conversionResult
ElementorSection     // elType: "section", elements: ElementorColumn[]
ElementorColumn      // elType: "column", settings: { _column_size: number }, elements: ElementorWidget[]
ElementorWidget      // elType: "widget", widgetType: string, settings: Record<string, unknown>
WidgetMapItem        // human-readable summary of a section's widgets (shown in Step 3 UI)
```

`randomId()` in `types/converter.ts` generates 8-char hex IDs for Elementor nodes.

## Claude AI Route (`app/api/claude/route.ts`)

`POST /api/claude` — SSE streaming endpoint powered by `claude-opus-4-7` with adaptive thinking.

Three tasks:
- `suggest_widgets` — takes `html`, returns JSON mapping elements → Elementor widget + reason
- `fix_html` — takes `html`, returns corrected HTML safe for WP/Elementor
- `improve_css` — takes `css`, returns JSON of WP/Elementor CSS conflicts + replacements

Requires `ANTHROPIC_API_KEY` in `.env.local`.

## Storage

`lib/converter/storage.ts` — localStorage only:
- `wp_connection` — WP site URL, username, app password
- `wp_user_profile` — user name, email, avatar, site name

Logout dispatches `window.dispatchEvent(new Event("wp_logout"))` — caught in `app/converter/page.tsx`.

## WP REST API Calls (`wpApi.ts`)

- `testWpConnection` — `GET /wp-json/wp/v2/users/me` + `GET /wp-json/wp/v2`
- `fetchWpThemes` — `GET /wp-json/wp/v2/themes?per_page=100`
- `pushToWordPress` — uploads images → creates page → sets Elementor meta → pushes CSS (4 channels)
- `pushAsElementorTemplate` — `POST /elementor/v1/templates` (type: "page")
- Auth: HTTP Basic via `btoa(username:appPassword)` — WordPress Application Passwords

Template preference: `elementor_header_footer` > `elementor_canvas` (header_footer calls `wp_head()` so Customizer CSS loads).

## Common Patterns

**Adding a new Elementor widget detector:**
1. Create `lib/converter/widgets/myWidget.ts` with `isMyWidget(el)` and `buildMyWidget(el)`
2. Import and add to `mapElement()` in `domWalker.ts` before the recursive fallback
3. Add a case to `widgetToMapNode()` in `domWalker.ts` for the widget map display

**Adding a new deploy method to Step 4:**
1. Add state and handler in `components/converter/Step4Deploy.tsx`
2. Add the API call in `lib/converter/wpApi.ts`
3. Add the corresponding result type to `types/converter.ts`

**Extending the converter state:**
- Add field to `ConverterState` in `types/converter.ts`
- Update `initialState` in `app/converter/page.tsx`
- Handlers in `app/converter/page.tsx` pass props down to step components
