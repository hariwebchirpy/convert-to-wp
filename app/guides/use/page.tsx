"use client";

import Link from "next/link";
import { FileCode, Palette, Code2, Image, Layers, PenLine, Smartphone, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

// ── Shared primitives ─────────────────────────────────────────────────────────

function CodeSnippet({ code }: { code: string }) {
  return (
    <div className="mt-2 rounded-md bg-zinc-900 px-3 py-2">
      <code className="font-mono text-xs text-zinc-100 whitespace-pre-wrap break-all">{code}</code>
    </div>
  );
}

type NoteVariant = "amber" | "red" | "green";
const noteStyles: Record<NoteVariant, string> = {
  amber: "border-amber-400 bg-amber-50 text-amber-900",
  red:   "border-red-400   bg-red-50   text-red-900",
  green: "border-green-500 bg-green-50 text-green-900",
};
function Note({ variant, children }: { variant: NoteVariant; children: React.ReactNode }) {
  return (
    <div className={`mt-2 rounded border-l-4 px-3.5 py-2.5 text-xs leading-relaxed ${noteStyles[variant]}`}>
      {children}
    </div>
  );
}

// ── Section heading ────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-bold mb-6">{children}</h2>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

const FILE_CARDS = [
  {
    icon: FileCode,
    title: "HTML file",
    description:
      "Use a single complete HTML file with a proper DOCTYPE, head, and body. The converter works best when your HTML has clear semantic structure using header, main, section, and footer tags.",
    notes: [
      { variant: "green" as NoteVariant, text: "Good: <header> <main> <section> <footer>" },
      { variant: "red" as NoteVariant, text: 'Avoid: everything in a single <div class="wrapper">' },
    ],
  },
  {
    icon: Palette,
    title: "CSS files",
    description:
      "Upload all your .css files separately. Do not inline styles in the HTML if you can avoid it. The converter enqueues each CSS file using WordPress wp_enqueue_style.",
    notes: [
      {
        variant: "amber" as NoteVariant,
        text: "If your CSS references fonts from Google Fonts, keep those @import lines at the top of your first CSS file.",
      },
    ],
  },
  {
    icon: Code2,
    title: "JavaScript files",
    description:
      "Upload your .js files separately. The converter enqueues them using wp_enqueue_script with jQuery as a dependency and loads them in the footer.",
    notes: [
      {
        variant: "amber" as NoteVariant,
        text: "If your JS uses jQuery make sure you are using the $ alias inside a document ready wrapper to avoid conflicts with WordPress's noConflict mode.",
      },
    ],
    code: `jQuery(document).ready(function($) {\n  // your code here\n});`,
  },
  {
    icon: Image,
    title: "Images",
    description:
      "Upload all images your HTML references. The converter rewrites image src paths to point to the WordPress theme directory automatically. Supported: .png .jpg .jpeg .gif .svg .webp",
    notes: [
      {
        variant: "red" as NoteVariant,
        text: "Make sure image filenames in your HTML exactly match the uploaded file names including case sensitivity.",
      },
    ],
  },
];

const HTML_TIPS = [
  {
    do:    "Use <section id=\"hero\"> for each block",
    avoid: "Nesting everything 5 divs deep",
    why:   "Each top-level section becomes one Elementor widget",
  },
  {
    do:    "Give sections meaningful class or id names",
    avoid: 'Generic class names like "box1", "wrap2"',
    why:   "The converter uses these as Elementor widget labels",
  },
  {
    do:    "Keep header and footer in semantic tags",
    avoid: "Putting nav inside main content",
    why:   "Converter splits header.php footer.php correctly",
  },
  {
    do:    "Use relative paths for assets e.g. ./images/logo.png",
    avoid: "Absolute paths or CDN URLs for local images",
    why:   "Converter can only rewrite paths it recognises",
  },
];

const ELEMENTOR_STEPS = [
  {
    icon: Layers,
    title: "Find your sections",
    description:
      "Your HTML sections appear as HTML widgets in the Elementor panel. Click any section on the canvas to select and edit it.",
  },
  {
    icon: PenLine,
    title: "Replace HTML widgets gradually",
    description:
      "You don't have to replace everything at once. Start with your hero heading and CTA button. Replace the HTML widget with Elementor Heading and Button widgets for easier editing.",
  },
  {
    icon: PenLine,
    title: "Editing text content",
    description:
      "To edit text inside an HTML widget double-click the widget and edit the raw HTML directly in the Content panel on the left.",
  },
  {
    icon: Smartphone,
    title: "Responsive check",
    description:
      "Use Elementor's responsive mode (bottom of the panel) to check mobile and tablet views. Your original CSS breakpoints still apply inside HTML widgets.",
  },
  {
    icon: Save,
    title: "Saving as a template",
    description:
      "Right-click any section → Save as Template to reuse it across other pages on your site.",
  },
];

const FAQ = [
  {
    q: "My styles are not loading after theme activation",
    a: "Check that your CSS filenames exactly match what you uploaded. Go to Appearance → Theme File Editor and open functions.php to verify the enqueued file names. Also check browser dev tools console for 404 errors on CSS files.",
  },
  {
    q: "Images are broken after installing the theme",
    a: "The converter rewrites paths it recognises. If an image is not showing, open header.php or index.php in the Theme File Editor and check that the path uses get_template_directory_uri() correctly. Also verify the image was uploaded as part of the conversion.",
  },
  {
    q: "The Elementor editor shows an empty page",
    a: "The push method creates a page with Elementor meta data. If the editor is empty it usually means the _elementor_data meta was not saved correctly. Try the ZIP method and import the elementor-template.json manually instead.",
  },
  {
    q: "My JavaScript is not working inside WordPress",
    a: "WordPress loads jQuery in noConflict mode. Wrap all your jQuery code as shown in the Preparing Your Files section above. Also check that your JS file was included in the upload.",
  },
  {
    q: "Forms on my page are not working",
    a: "HTML form submissions require a server-side handler. The converter does not convert form logic. Use a WordPress plugin like Contact Form 7 or WPForms to rebuild your forms natively in WordPress.",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UseGuidePage() {
  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Home
          </Link>
          <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold">
            Usage Guide
          </span>
          <Link href="/guides/publish" className="ml-auto text-sm text-muted-foreground hover:text-foreground transition-colors">
            Publishing Guide →
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 py-16 text-center border-b bg-background">
          <div className="max-w-2xl mx-auto space-y-4">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              How to use the converter
            </h1>
            <p className="text-muted-foreground">
              Everything you need to know to get the best results from your HTML files.
            </p>
          </div>
        </section>

        <div className="max-w-4xl mx-auto px-4 py-12 space-y-16">

          {/* Section 1: Preparing your files */}
          <section>
            <SectionHeading>1. Preparing your files</SectionHeading>
            <div className="grid sm:grid-cols-2 gap-5">
              {FILE_CARDS.map(({ icon: Icon, title, description, notes, code }) => (
                <Card key={title} className="flex flex-col">
                  <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
                    <div className="p-1.5 rounded-md bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-semibold">{title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-0 leading-relaxed">
                    <p>{description}</p>
                    {code && <CodeSnippet code={code} />}
                    {notes.map((n, i) => (
                      <Note key={i} variant={n.variant}>{n.text}</Note>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Section 2: HTML structure tips */}
          <section>
            <SectionHeading>2. Getting the best Elementor output</SectionHeading>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              The quality of Elementor sections generated depends on how well structured your HTML is. Here are the patterns that work best.
            </p>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-green-700">Do</TableHead>
                      <TableHead className="text-red-700">Avoid</TableHead>
                      <TableHead>Why it matters</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {HTML_TIPS.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-green-700 font-medium text-sm">{row.do}</TableCell>
                        <TableCell className="text-red-700 text-sm">{row.avoid}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{row.why}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          {/* Section 3: After importing to Elementor */}
          <section>
            <SectionHeading>3. After importing to Elementor</SectionHeading>
            <div className="space-y-5">
              {ELEMENTOR_STEPS.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex gap-4">
                  <div className="mt-0.5 p-2 h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 4: Common issues */}
          <section>
            <SectionHeading>4. Common issues and fixes</SectionHeading>
            <Card>
              <CardContent className="pt-2 pb-0 px-4">
                <Accordion type="single" collapsible className="w-full">
                  {FAQ.map((item, i) => (
                    <AccordionItem key={i} value={`faq-${i}`}>
                      <AccordionTrigger className="text-sm font-normal text-left">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </section>

          {/* CTA */}
          <section>
            <Card className="text-center">
              <CardContent className="pt-8 pb-8 space-y-4">
                <p className="font-semibold text-lg">Ready to publish your converted theme?</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Button asChild>
                    <Link href="/guides/publish">Publishing Guide →</Link>
                  </Button>
                  <Link href="/converter" className="text-sm text-blue-600 underline underline-offset-2 hover:text-blue-700">
                    Open Converter →
                  </Link>
                </div>
              </CardContent>
            </Card>
          </section>

        </div>
      </main>
    </div>
  );
}
