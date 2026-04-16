"use client";

import Link from "next/link";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  error: Error;
  reset: () => void;
}

export default function ConverterError({ error, reset }: Props) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center space-y-2">
          <XCircle className="w-10 h-10 text-destructive" />
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
            {error.message || "An unexpected error occurred."}
          </pre>
          <div className="flex gap-3">
            <Button className="flex-1" onClick={reset}>
              Try Again
            </Button>
            <Button variant="outline" className="flex-1" asChild>
              <Link href="/">← Go Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
