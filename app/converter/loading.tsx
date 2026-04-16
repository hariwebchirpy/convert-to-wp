import { Loader2 } from "lucide-react";

export default function ConverterLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
      <Loader2 className="w-8 h-8 animate-spin" />
      <p className="text-sm">Loading converter...</p>
    </div>
  );
}
