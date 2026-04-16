import { WpConnection, WpUserProfile } from "@/types/converter";

export function saveConnection(connection: WpConnection): void {
  localStorage.setItem("wp_connection", JSON.stringify(connection));
}

export function loadConnection(): WpConnection | null {
  try {
    const raw = localStorage.getItem("wp_connection");
    if (!raw) return null;
    return JSON.parse(raw) as WpConnection;
  } catch {
    return null;
  }
}

export function clearConnection(): void {
  localStorage.removeItem("wp_connection");
  localStorage.removeItem("wp_user_profile");
}

export function saveUserProfile(profile: WpUserProfile): void {
  localStorage.setItem("wp_user_profile", JSON.stringify(profile));
}

export function loadUserProfile(): WpUserProfile | null {
  try {
    const raw = localStorage.getItem("wp_user_profile");
    if (!raw) return null;
    return JSON.parse(raw) as WpUserProfile;
  } catch {
    return null;
  }
}
