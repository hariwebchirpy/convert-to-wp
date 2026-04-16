"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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

// ── Shared primitives ─────────────────────────────────────────────────────────

function CodeSnippet({ code }: { code: string }) {
  return (
    <div className="mt-2 rounded-md bg-zinc-900 px-3 py-2">
      <code className="font-mono text-xs text-zinc-100 break-all">{code}</code>
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

interface StepData {
  title: string;
  description: string;
  code?: string;
  note?: { variant: NoteVariant; text: string };
  subList?: string[];
  descriptionAfter?: string;
}

function TimelineStep({ step, index, isLast }: { step: StepData; index: number; isLast: boolean }) {
  return (
    <div className="flex gap-4">
      <div className="flex w-8 shrink-0 flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold select-none">
          {index + 1}
        </div>
        {!isLast && <div className="mt-1 w-0.5 flex-1 bg-border" />}
      </div>
      <div className={`flex-1 ${isLast ? "pb-0" : "pb-6"}`}>
        <p className="text-sm font-medium leading-snug">{step.title}</p>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{step.description}</p>
        {step.code && <CodeSnippet code={step.code} />}
        {step.subList && (
          <ul className="mt-2 ml-3 space-y-1">
            {step.subList.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="text-primary mt-0.5">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
        {step.descriptionAfter && (
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.descriptionAfter}</p>
        )}
        {step.note && <Note variant={step.note.variant}>{step.note.text}</Note>}
      </div>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

const ZIP_STEPS: StepData[] = [
  {
    title: "Download the ZIP from the converter",
    description:
      "In Step 4 of the converter click the Download ZIP button. A file named {your-theme-slug}.zip will be saved to your downloads folder.",
  },
  {
    title: "Go to WordPress Admin → Appearance → Themes",
    description: "Log in to your WordPress dashboard and navigate to:",
    code: "yoursite.com/wp-admin/themes.php",
  },
  {
    title: "Click Add New Theme",
    description:
      "At the top of the Themes page click the Add New Theme button. You will be taken to the theme browser.",
  },
  {
    title: "Click Upload Theme",
    description:
      "At the top left of the theme browser click Upload Theme. A file picker will appear.",
  },
  {
    title: "Choose your ZIP file",
    description:
      "Click Choose File and select the .zip file you downloaded. Then click Install Now.",
  },
  {
    title: "Activate the theme",
    description:
      "After installation click Activate. Your site will now use your converted theme.",
    note: {
      variant: "amber",
      text: "If you see a broken layout after activation, make sure Elementor plugin is installed and active.",
    },
  },
  {
    title: "Import the Elementor template",
    description: "The ZIP also includes elementor-template.json. To import it:",
    subList: [
      "Go to Elementor → My Templates → Import Templates",
      "Select elementor-template.json from your downloads",
      "Click Import Now",
      "Open any page in Elementor editor",
      "Click the folder icon → My Templates",
      "Insert the imported template",
    ],
  },
  {
    title: "Your layout is ready to edit",
    description:
      "Each section of your original HTML is now an editable Elementor block. Click any section to start customising.",
    note: {
      variant: "green",
      text: "Tip: Start by replacing the HTML widgets with native Elementor widgets like Heading, Image, and Button for better editing experience.",
    },
  },
];

const PUSH_STEPS: StepData[] = [
  {
    title: "Connect WordPress in Step 1 of the converter",
    description:
      "Make sure you have entered your site URL, username, and application password and clicked Test Connection successfully.",
  },
  {
    title: "Complete the conversion in Step 3",
    description:
      "Upload your files and run the conversion. Wait for all steps to show green checkmarks.",
  },
  {
    title: "Click Push to WordPress in Step 4",
    description:
      "In the Deploy step click the Push to WordPress button. The converter will create a new draft page on your site.",
  },
  {
    title: "Open the page in Elementor",
    description: "After a successful push you will see two links:",
    subList: [
      "View Draft Page — preview how it looks on the frontend",
      "Edit in Elementor — opens the Elementor editor directly",
    ],
  },
  {
    title: "Edit and publish in Elementor",
    description:
      "Make your changes in the Elementor editor. When you are happy with the result click Publish in the bottom left of the Elementor panel.",
  },
  {
    title: "Set as front page (optional)",
    description: "To make this page your homepage go to:",
    code: "Settings → Reading → Your homepage displays → A static page",
    descriptionAfter: "Select your newly published page from the dropdown.",
  },
];

const COMPARISON = [
  { feature: "Speed",                zip: "Slower",       push: "Faster" },
  { feature: "Control over files",   zip: "Full control", push: "Automatic" },
  { feature: "Requires connection",  zip: "No",           push: "Yes" },
  { feature: "Installs as theme",    zip: "Yes",          push: "No (page only)" },
  { feature: "Good for production",  zip: "Yes",          push: "For preview" },
  { feature: "Elementor required",   zip: "Yes",          push: "Yes" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PublishGuidePage() {
  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Home
          </Link>
          <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold">
            Publishing Guide
          </span>
          <Link href="/guides/use" className="ml-auto text-sm text-muted-foreground hover:text-foreground transition-colors">
            How to Use →
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 py-16 text-center border-b bg-background">
          <div className="max-w-2xl mx-auto space-y-4">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Publishing your theme to WordPress
            </h1>
            <p className="text-muted-foreground">
              Two ways to get your converted theme live. Choose the method that suits you.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 px-3 py-1">
                Method 1: ZIP Upload
              </Badge>
              <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 px-3 py-1">
                Method 2: Direct Push
              </Badge>
            </div>
          </div>
        </section>

        <div className="max-w-3xl mx-auto px-4 py-12 space-y-16">
          {/* Method 1 */}
          <section>
            <div className="border-l-4 border-blue-500 pl-4 mb-8">
              <h2 className="text-xl font-bold">Method 1 — Upload the ZIP file</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Best if you want full control over the theme files before activating.
              </p>
            </div>
            <div>
              {ZIP_STEPS.map((step, i) => (
                <TimelineStep key={i} step={step} index={i} isLast={i === ZIP_STEPS.length - 1} />
              ))}
            </div>
          </section>

          {/* Method 2 */}
          <section>
            <div className="border-l-4 border-green-500 pl-4 mb-8">
              <h2 className="text-xl font-bold">Method 2 — Push directly to WordPress</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Best for quickly previewing your layout in Elementor without downloading anything.
              </p>
            </div>
            <div>
              {PUSH_STEPS.map((step, i) => (
                <TimelineStep key={i} step={step} index={i} isLast={i === PUSH_STEPS.length - 1} />
              ))}
            </div>
          </section>

          {/* Comparison table */}
          <section>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Which method should I use?</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Feature</TableHead>
                      <TableHead>ZIP Upload</TableHead>
                      <TableHead>Direct Push</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {COMPARISON.map((row) => (
                      <TableRow key={row.feature}>
                        <TableCell className="font-medium text-muted-foreground">{row.feature}</TableCell>
                        <TableCell>{row.zip}</TableCell>
                        <TableCell>{row.push}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="px-4 py-3 text-xs text-muted-foreground border-t">
                  For production sites we recommend the ZIP method. Use Direct Push for quick previewing and iteration.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* CTA */}
          <section>
            <Card className="text-center">
              <CardContent className="pt-8 pb-8 space-y-4">
                <p className="font-semibold text-lg">Ready to convert your first HTML file?</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Button asChild>
                    <Link href="/converter">Open Converter →</Link>
                  </Button>
                  <Link href="/guides/use" className="text-sm text-blue-600 underline underline-offset-2 hover:text-blue-700">
                    Read the usage guide →
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
