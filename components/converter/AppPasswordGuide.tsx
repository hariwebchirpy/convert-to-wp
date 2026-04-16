"use client";

import { useState } from "react";
import { ExternalLink, Copy, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

interface Props {
  open: boolean;
  onClose: () => void;
  siteUrl?: string;
}

// ── Snippet with copy button ──────────────────────────────────────────────────

function CodeSnippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-zinc-900 px-3 py-2">
      <code className="font-mono text-xs text-zinc-100 break-all">{code}</code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy to clipboard"
        className="shrink-0 text-zinc-400 hover:text-zinc-100 transition-colors"
      >
        {copied ? (
          <CheckCircle className="h-3.5 w-3.5 text-green-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

// ── Coloured note box ─────────────────────────────────────────────────────────

type NoteVariant = "amber" | "red" | "green";

const noteStyles: Record<NoteVariant, string> = {
  amber: "border-amber-400 bg-amber-50 text-amber-900",
  red: "border-red-400 bg-red-50 text-red-900",
  green: "border-green-500 bg-green-50 text-green-900",
};

function Note({ variant, children }: { variant: NoteVariant; children: React.ReactNode }) {
  return (
    <div className={`mt-2 rounded border-l-4 px-3.5 py-2.5 text-xs leading-relaxed ${noteStyles[variant]}`}>
      {children}
    </div>
  );
}

// ── Timeline step ─────────────────────────────────────────────────────────────

interface StepData {
  title: string;
  description: string;
  code?: string;
  note?: { variant: NoteVariant; text: string };
}

const STEPS: StepData[] = [
  {
    title: "Log in to WordPress Admin",
    description: "Go to your WordPress dashboard by visiting:",
    code: "https://yoursite.com/wp-admin",
  },
  {
    title: "Go to your Profile",
    description:
      "In the left sidebar click Users then click Your Profile. Or click your username at the top right corner of the admin bar.",
  },
  {
    title: "Scroll to Application Passwords",
    description:
      "Scroll all the way to the bottom of the Profile page. You will see a section titled Application Passwords.",
    note: {
      variant: "amber",
      text: "This section only appears if your site is served over HTTPS. If you don't see it, check that your site URL starts with https://",
    },
  },
  {
    title: "Enter a name for the password",
    description:
      'In the text field labeled New Application Password Name, type a recognisable label like:',
    code: "WP Theme Converter",
  },
  {
    title: "Click Add New Application Password",
    description:
      "Click the button next to the name field. WordPress will generate a password for you.",
  },
  {
    title: "Copy the generated password",
    description: "A box will appear showing your new password in this format:",
    code: "xxxx xxxx xxxx xxxx xxxx xxxx",
    note: {
      variant: "red",
      text: "Copy it immediately. WordPress will never show this password again. If you lose it you must generate a new one.",
    },
  },
  {
    title: "Paste it into the converter",
    description:
      "Come back here and paste the password into the Application Password field exactly as shown — spaces included. WordPress accepts it with or without spaces.",
  },
  {
    title: "Click Test Connection",
    description:
      "Hit the Test Connection button. If everything is correct you will see a green Connected badge with your WordPress username.",
    note: {
      variant: "green",
      text: "You only need to do this once. The converter remembers your connection after the first successful login.",
    },
  },
];

function TimelineStep({
  step,
  index,
  isLast,
}: {
  step: StepData;
  index: number;
  isLast: boolean;
}) {
  return (
    <div className="flex gap-4">
      {/* Left column: circle + connector */}
      <div className="flex w-8 shrink-0 flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold select-none">
          {index + 1}
        </div>
        {!isLast && <div className="mt-1 w-0.5 flex-1 bg-border" />}
      </div>

      {/* Right column: content */}
      <div className={`flex-1 ${isLast ? "pb-0" : "pb-6"}`}>
        <p className="text-sm font-medium leading-snug">{step.title}</p>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          {step.description}
        </p>
        {step.code && <CodeSnippet code={step.code} />}
        {step.note && <Note variant={step.note.variant}>{step.note.text}</Note>}
      </div>
    </div>
  );
}

// ── Troubleshooting accordion items ───────────────────────────────────────────

const FAQ = [
  {
    q: "I don't see the Application Passwords section",
    a: "Your site must be served over HTTPS. Also check that your WordPress version is 5.6 or higher. Some security plugins like Wordfence also disable this feature — check your plugin settings.",
  },
  {
    q: "I get a Connection failed error",
    a: "Double-check your site URL has no trailing slash. Make sure you are using your WordPress username not your email address. Verify the application password was copied correctly including any spaces.",
  },
  {
    q: "My site URL is correct but it still fails",
    a: "Some hosts block REST API access. Test by visiting {yoursite.com}/wp-json/wp/v2 in your browser. If you see a JSON response the API is working. If you see an error contact your hosting provider.",
  },
  {
    q: "Can I delete the application password later?",
    a: "Yes. Go to Users → Your Profile → Application Passwords and click Revoke next to the password name. This immediately disconnects any app using that password.",
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function AppPasswordGuide({ open, onClose, siteUrl }: Props) {
  function handleOpenAdmin() {
    let base = siteUrl?.trim().replace(/\/+$/, "");
    if (!base) {
      const entered = window.prompt("Enter your WordPress site URL:");
      if (!entered) return;
      base = entered.trim().replace(/\/+$/, "");
    }
    window.open(`${base}/wp-admin/profile.php`, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-base">
            How to get your Application Password
          </DialogTitle>
          <DialogDescription>
            Follow these steps in your WordPress admin panel. Takes less than 2 minutes.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-0">
          {/* Timeline */}
          <div>
            {STEPS.map((step, i) => (
              <TimelineStep
                key={i}
                step={step}
                index={i}
                isLast={i === STEPS.length - 1}
              />
            ))}
          </div>

          {/* Troubleshooting */}
          <div className="mt-6 border-t pt-4">
            <p className="text-sm font-semibold mb-1">Troubleshooting</p>
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
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t shrink-0 sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleOpenAdmin}>
            <ExternalLink className="h-4 w-4" />
            Open WordPress Admin →
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
