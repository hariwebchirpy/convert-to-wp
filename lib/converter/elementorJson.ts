import { ParsedSection, UploadedFile, WidgetMapItem } from "@/types/converter";
import { walkSections } from "./domWalker";

export interface ElementorBuildResult {
  json: string;
  widgetMap: WidgetMapItem[];
}

export function buildElementorJson(
  sections: ParsedSection[],
  uploadedFiles: UploadedFile[]
): ElementorBuildResult {
  const { sections: nodes, widgetMap } = walkSections(sections, uploadedFiles);
  return {
    json: JSON.stringify(nodes, null, 2),
    widgetMap,
  };
}
