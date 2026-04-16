import Link from "next/link";
import { Plug, Upload, Wand2, Rocket, BookOpen, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const HOW_IT_WORKS = [
  {
    num: "01",
    icon: Plug,
    title: "Connect WordPress",
    desc: "Enter your site URL and application password to link your WordPress account.",
  },
  {
    num: "02",
    icon: Upload,
    title: "Upload Your Files",
    desc: "Drop in your HTML, CSS, JS and image files all at once.",
  },
  {
    num: "03",
    icon: Wand2,
    title: "Auto Convert",
    desc: "The engine parses your HTML and generates a complete WordPress theme with Elementor JSON.",
  },
  {
    num: "04",
    icon: Rocket,
    title: "Deploy",
    desc: "Download the ZIP or push a page directly to your WordPress site.",
  },
];

const FILE_DESCRIPTIONS = [
  { file: "style.css", desc: "Theme identity + your CSS" },
  { file: "index.php", desc: "Main page template" },
  { file: "header.php", desc: "Your header/nav HTML" },
  { file: "footer.php", desc: "Your footer HTML" },
  { file: "functions.php", desc: "Asset enqueue hooks" },
  { file: "elementor-template", desc: "Drag and drop layout JSON" },
];

const LIMITATIONS = [
  {
    title: "Elementor required",
    desc: "The generated page template requires Elementor plugin to be installed on your WordPress site.",
  },
  {
    title: "HTML widgets first",
    desc: "Sections are imported as HTML widgets. You can swap them for native Elementor widgets after import.",
  },
  {
    title: "No server needed",
    desc: "All conversion happens in your browser. Your files never leave your machine.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center text-center px-4 py-28 overflow-hidden hero-dots">
        <div className="relative z-10 max-w-3xl space-y-6">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
            Convert HTML to<br className="hidden sm:block" /> WordPress Theme
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Upload your HTML, CSS, JS and images — get a fully structured
            WordPress theme with Elementor-editable sections in seconds.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/converter">Start Converting →</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="px-4 py-20 bg-muted/30">
        <div className="max-w-5xl mx-auto space-y-12">
          <h2 className="text-3xl font-bold text-center">How it works</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map(({ num, icon: Icon, title, desc }) => (
              <div key={num} className="flex flex-col gap-3">
                <span className="text-4xl font-bold text-muted-foreground/30 leading-none">
                  {num}
                </span>
                <Icon className="w-6 h-6 text-primary" />
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What gets generated ── */}
      <section className="px-4 py-20">
        <div className="max-w-5xl mx-auto space-y-10">
          <h2 className="text-3xl font-bold text-center">
            What gets generated
          </h2>
          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* File tree */}
            <pre className="text-sm font-mono text-zinc-300 bg-zinc-900 rounded-xl px-6 py-5 leading-7 overflow-x-auto">
{`your-theme/
├── style.css
├── index.php
├── header.php
├── footer.php
├── functions.php
├── elementor-template.json
└── assets/
    ├── css/
    ├── js/
    └── images/`}
            </pre>

            {/* Descriptions */}
            <ul className="space-y-3">
              {FILE_DESCRIPTIONS.map(({ file, desc }) => (
                <li key={file} className="flex items-baseline gap-3">
                  <span className="font-mono text-sm text-primary shrink-0 min-w-[12rem]">
                    {file}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    → {desc}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Limitations ── */}
      <section className="px-4 py-20 bg-muted/30">
        <div className="max-w-5xl mx-auto space-y-10">
          <h2 className="text-3xl font-bold text-center">
            Good to know before you start
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {LIMITATIONS.map(({ title, desc }) => (
              <Card key={title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{desc}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Guides ── */}
      <section className="px-4 py-20">
        <div className="max-w-5xl mx-auto space-y-10">
          <h2 className="text-3xl font-bold text-center">Learn more</h2>
          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center gap-3 space-y-0">
                <div className="p-2 rounded-md bg-primary/10">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <CardTitle className="text-base">How to Publish</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CardDescription>
                  Two ways to get your theme live — ZIP upload or direct WordPress push.
                </CardDescription>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/guides/publish">Read guide →</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center gap-3 space-y-0">
                <div className="p-2 rounded-md bg-primary/10">
                  <GraduationCap className="w-5 h-5 text-primary" />
                </div>
                <CardTitle className="text-base">How to Use</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CardDescription>
                  File preparation tips, Elementor editing workflow, and common fixes.
                </CardDescription>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/guides/use">Read guide →</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mt-auto border-t py-8 text-center text-sm text-muted-foreground">
        Built with Next.js 16 + Elementor REST API
      </footer>
    </div>
  );
}
