"use client";

import { useState } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { WpConnection, WpUserProfile, ThemeConfig } from "@/types/converter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { testWpConnection } from "@/lib/converter/wpApi";
import AppPasswordGuide from "@/components/converter/AppPasswordGuide";

interface Props {
  wpConnection: WpConnection;
  themeConfig: ThemeConfig;
  onUpdateWpConnection: (data: Partial<WpConnection>) => void;
  onUpdateThemeConfig: (data: Partial<ThemeConfig>) => void;
  onConnectionSuccess: (connection: WpConnection, profile: WpUserProfile) => void;
  onNext: () => void;
}

type TestStatus = "idle" | "loading" | "success" | "error";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export default function Step1Connect({
  wpConnection,
  themeConfig,
  onUpdateWpConnection,
  onUpdateThemeConfig,
  onConnectionSuccess,
  onNext,
}: Props) {
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [connectedProfile, setConnectedProfile] = useState<WpUserProfile | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const canProceed =
    wpConnection.siteUrl.trim() !== "" &&
    wpConnection.username.trim() !== "" &&
    wpConnection.appPassword.trim() !== "" &&
    themeConfig.themeName.trim() !== "";

  const showRestPreview =
    wpConnection.siteUrl.trim() !== "" &&
    isValidUrl(wpConnection.siteUrl.trim());

  function handleSiteUrlChange(value: string) {
    onUpdateWpConnection({ siteUrl: value.replace(/\/+$/, "") });
  }

  async function handleTestConnection() {
    setTestStatus("loading");
    setConnectedProfile(null);

    const result = await testWpConnection(wpConnection);

    if (result.success && result.profile) {
      setTestStatus("success");
      setConnectedProfile(result.profile);
      onUpdateWpConnection({ isConnected: true });
      onConnectionSuccess(wpConnection, result.profile);
    } else {
      setTestStatus("error");
      onUpdateWpConnection({ isConnected: false });
    }
  }

  function handleThemeNameChange(name: string) {
    onUpdateThemeConfig({
      themeName: name,
      themeSlug: toSlug(name),
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 pb-8">
      {/* ── Card 1: WordPress Connection ── */}
      <Card>
        <CardHeader>
          <CardTitle>WordPress Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Site URL */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Site URL</label>
            <Input
              placeholder="https://yoursite.com"
              value={wpConnection.siteUrl}
              onChange={(e) => handleSiteUrlChange(e.target.value)}
            />
            {showRestPreview && (
              <p className="text-xs text-muted-foreground">
                REST API endpoint:{" "}
                <span className="font-mono">
                  {wpConnection.siteUrl}/wp-json/wp/v2
                </span>
              </p>
            )}
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Username</label>
            <Input
              placeholder="admin"
              value={wpConnection.username}
              onChange={(e) =>
                onUpdateWpConnection({ username: e.target.value })
              }
            />
          </div>

          {/* Application Password */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Application Password</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                value={wpConnection.appPassword}
                className="pr-10"
                onChange={(e) =>
                  onUpdateWpConnection({ appPassword: e.target.value })
                }
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Generate this in WordPress → Users → Profile → Application Passwords
              {" · "}
              <button
                type="button"
                className="text-blue-600 underline underline-offset-2 hover:text-blue-700 transition-colors"
                onClick={() => setShowGuide(true)}
              >
                Step by step guide →
              </button>
            </p>
            <AppPasswordGuide
              open={showGuide}
              onClose={() => setShowGuide(false)}
              siteUrl={wpConnection.siteUrl}
            />
          </div>

          {/* Test connection row */}
          <div className="flex items-center gap-3 pt-1">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={
                testStatus === "loading" ||
                !wpConnection.siteUrl ||
                !wpConnection.username ||
                !wpConnection.appPassword
              }
            >
              {testStatus === "loading" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing…
                </>
              ) : (
                "Test Connection"
              )}
            </Button>

            {testStatus === "success" && connectedProfile && (
              <div className="flex items-center gap-2">
                {connectedProfile.avatarUrl ? (
                  <img
                    src={connectedProfile.avatarUrl}
                    alt={connectedProfile.name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs font-semibold">
                    {connectedProfile.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
                  Connected as {connectedProfile.name}
                </Badge>
              </div>
            )}
            {testStatus === "error" && (
              <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
                Connection failed
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Separator ── */}
      <div className="relative flex items-center">
        <Separator className="flex-1" />
        <span className="mx-3 text-xs text-muted-foreground bg-muted/30 px-1">
          then
        </span>
        <Separator className="flex-1" />
      </div>

      {/* ── Card 2: Theme Details ── */}
      <Card>
        <CardHeader>
          <CardTitle>Theme Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Theme Name</label>
            <Input
              placeholder="My Theme"
              value={themeConfig.themeName}
              onChange={(e) => handleThemeNameChange(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Theme Slug</label>
            <Input
              placeholder="my-theme"
              value={themeConfig.themeSlug}
              onChange={(e) =>
                onUpdateThemeConfig({ themeSlug: e.target.value })
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Author</label>
            <Input
              placeholder="Your Name"
              value={themeConfig.author}
              onChange={(e) => onUpdateThemeConfig({ author: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              placeholder="A short description of the theme"
              rows={3}
              value={themeConfig.description}
              onChange={(e) =>
                onUpdateThemeConfig({ description: e.target.value })
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Version</label>
            <Input
              placeholder="1.0.0"
              value={themeConfig.version}
              onChange={(e) => onUpdateThemeConfig({ version: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Next button ── */}
      <Button className="w-full" disabled={!canProceed} onClick={onNext}>
        Next: Upload Files →
      </Button>
    </div>
  );
}
