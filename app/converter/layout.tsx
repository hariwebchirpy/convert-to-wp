import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import ProfileBar from "@/components/converter/ProfileBar";

export default function ConverterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/30">
      {/* ── Top navbar ── */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center">
          {/* Left */}
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Home
          </Link>

          {/* Center */}
          <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold">
            WP Theme Converter
          </span>

          {/* Right */}
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/guides/publish"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
            >
              Publishing Guide
            </Link>
            <Link
              href="/guides/use"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
            >
              Usage Guide
            </Link>
            <Badge variant="outline" className="text-xs font-mono">
              POC v1.0
            </Badge>
          </div>
        </div>
      </header>

      {/* ── Profile bar (self-managed, reads localStorage) ── */}
      <ProfileBar />

      {/* ── Page content ── */}
      <main className="pt-6 pb-16">{children}</main>
    </div>
  );
}
