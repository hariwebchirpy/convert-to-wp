import { ParsedSection, UploadedFile, WidgetMapItem } from "@/types/converter";
import { walkSections } from "./domWalker";

export interface ElementorBuildResult {
  json: string;
  widgetMap: WidgetMapItem[];
}

/**
 * Builds a valid Elementor template JSON that can be imported via:
 *   Elementor → Templates → Import Template (.json)
 *
 * The envelope format Elementor expects:
 * {
 *   "version": "0.4",
 *   "title": "<template name>",
 *   "type": "page",
 *   "content": [ ...section nodes... ],
 *   "page_settings": {}
 * }
 *
 * The "content" array is also the value stored in the _elementor_data post meta
 * when pushed directly via the WP REST API.
 */
export function buildElementorJson(
  sections: ParsedSection[],
  uploadedFiles: UploadedFile[],
  title = "Converted Page"
): ElementorBuildResult {
  const { sections: nodes, widgetMap } = walkSections(sections, uploadedFiles);

  const template = {
    version: "0.4",
    title,
    type: "page",
    content: nodes,
    page_settings: {},
  };

  return {
    json: JSON.stringify(template, null, 2),
    widgetMap,
  };
}

/**
 * Returns just the content array as a JSON string — used when writing
 * _elementor_data post meta directly via the WP REST API.
 */
export function buildElementorDataMeta(
  sections: ParsedSection[],
  uploadedFiles: UploadedFile[]
): string {
  const { sections: nodes } = walkSections(sections, uploadedFiles);
  return JSON.stringify(nodes);
}
