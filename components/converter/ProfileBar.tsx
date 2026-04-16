"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { WpUserProfile } from "@/types/converter";
import { loadUserProfile, clearConnection } from "@/lib/converter/storage";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export default function ProfileBar() {
  const [profile, setProfile] = useState<WpUserProfile | null>(null);

  useEffect(() => {
    setProfile(loadUserProfile());

    function onLogout() {
      clearConnection();
      setProfile(null);
    }

    window.addEventListener("wp_logout", onLogout);
    return () => window.removeEventListener("wp_logout", onLogout);
  }, []);

  if (!profile) return null;

  const initials = profile.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const siteInitial = profile.siteName.charAt(0).toUpperCase();

  return (
    <div className="sticky top-14 z-30 w-full border-b bg-white px-6 py-3 flex items-center justify-between">
      {/* Left: site info */}
      <div className="flex items-center gap-3">
        {/* Pulse green dot */}
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>

        {/* Site circle */}
        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold select-none">
          {siteInitial}
        </div>

        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium">{profile.siteName}</span>
          <span className="text-xs text-muted-foreground">{profile.siteUrl}</span>
        </div>
      </div>

      {/* Right: user + logout */}
      <div className="flex items-center gap-3">
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={profile.name}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground select-none">
            {initials}
          </div>
        )}

        <span className="text-sm font-medium hidden sm:block">{profile.name}</span>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5">
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect WordPress?</AlertDialogTitle>
              <AlertDialogDescription>
                You will need to reconnect and re-enter your application password.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => {
                  window.dispatchEvent(new Event("wp_logout"));
                }}
              >
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
